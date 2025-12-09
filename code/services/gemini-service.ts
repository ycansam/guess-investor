import { GoogleGenerativeAI } from '@google/generative-ai';
import { appConfig, INVESTMENT_SYSTEM_PROMPT } from '../config/app-config';
import { ChatMessage, ParsedAIResponse } from '../types';
import { finnhubService } from './finnhub-service';

class GeminiService {
  private client: GoogleGenerativeAI | null = null;

  private getClient(): GoogleGenerativeAI {
    if (!this.client) {
      if (!appConfig.geminiApiKey || appConfig.geminiApiKey === 'TU_API_KEY_AQUI') {
        throw new Error(
          'API Key de Google Gemini no configurada.\n\n' +
          '1. Ve a https://aistudio.google.com/apikey\n' +
          '2. Crea una API Key GRATIS\n' +
          '3. Añádela al archivo .env como EXPO_PUBLIC_GEMINI_API_KEY'
        );
      }
      
      this.client = new GoogleGenerativeAI(appConfig.geminiApiKey);
    }
    return this.client;
  }

  // Mapa de empresas conocidas a sus símbolos
  private readonly companySymbolMap: { [key: string]: string } = {
    // Empresas españolas
    'inditex': 'ITX.MC',
    'zara': 'ITX.MC',
    'santander': 'SAN.MC',
    'banco santander': 'SAN.MC',
    'bbva': 'BBVA.MC',
    'telefonica': 'TEF.MC',
    'telefónica': 'TEF.MC',
    'iberdrola': 'IBE.MC',
    'repsol': 'REP.MC',
    'amadeus': 'AMS.MC',
    'ferrovial': 'FER.MC',
    'cellnex': 'CLNX.MC',
    'caixabank': 'CABK.MC',
    'endesa': 'ELE.MC',
    'naturgy': 'NTGY.MC',
    'mapfre': 'MAP.MC',
    'acciona': 'ANA.MC',
    'melia': 'MEL.MC',
    'meliá': 'MEL.MC',
    'grifols': 'GRF.MC',
    'aena': 'AENA.MC',
    'colonial': 'COL.MC',
    'sabadell': 'SAB.MC',
    'banco sabadell': 'SAB.MC',
    'bankinter': 'BKT.MC',
    'siemens gamesa': 'SGRE.MC',
    'fluidra': 'FDR.MC',
    'viscofan': 'VIS.MC',
    'logista': 'LOG.MC',
    'merlin': 'MRL.MC',
    'ence': 'ENC.MC',
    'acerinox': 'ACX.MC',
    'arcelormittal': 'MTS.MC',
    'sacyr': 'SCYR.MC',
    'cie automotive': 'CIE.MC',
    'pharma mar': 'PHM.MC',
    'solaria': 'SLR.MC',
    'red electrica': 'RED.MC',
    'red eléctrica': 'RED.MC',
    'enagas': 'ENG.MC',
    'enagás': 'ENG.MC',
    'indra': 'IDR.MC',
    // Empresas americanas populares
    'apple': 'AAPL',
    'google': 'GOOGL',
    'alphabet': 'GOOGL',
    'microsoft': 'MSFT',
    'amazon': 'AMZN',
    'meta': 'META',
    'facebook': 'META',
    'tesla': 'TSLA',
    'nvidia': 'NVDA',
    'amd': 'AMD',
    'netflix': 'NFLX',
    'disney': 'DIS',
    'boeing': 'BA',
    'jpmorgan': 'JPM',
    'jp morgan': 'JPM',
    'visa': 'V',
    'mastercard': 'MA',
    'coca cola': 'KO',
    'coca-cola': 'KO',
    'pepsi': 'PEP',
    'pepsico': 'PEP',
    'walmart': 'WMT',
    'home depot': 'HD',
    'intel': 'INTC',
    'ibm': 'IBM',
    'oracle': 'ORCL',
    'salesforce': 'CRM',
    'adobe': 'ADBE',
    'paypal': 'PYPL',
    'spotify': 'SPOT',
    'uber': 'UBER',
    'airbnb': 'ABNB',
    'zoom': 'ZM',
    'palantir': 'PLTR',
    'coinbase': 'COIN',
    'robinhood': 'HOOD',
    'berkshire': 'BRK.B',
    'johnson & johnson': 'JNJ',
    'procter & gamble': 'PG',
    'exxon': 'XOM',
    'chevron': 'CVX',
    // Empresas europeas
    'lvmh': 'MC.PA',
    'louis vuitton': 'MC.PA',
    'hermes': 'RMS.PA',
    'hermès': 'RMS.PA',
    'loreal': 'OR.PA',
    "l'oreal": 'OR.PA',
    'sap': 'SAP',
    'siemens': 'SIE.DE',
    'volkswagen': 'VOW3.DE',
    'bmw': 'BMW.DE',
    'mercedes': 'MBG.DE',
    'daimler': 'MBG.DE',
    'adidas': 'ADS.DE',
    'bayer': 'BAYN.DE',
    'basf': 'BAS.DE',
    'nestle': 'NESN.SW',
    'novartis': 'NOVN.SW',
    'roche': 'ROG.SW',
    'shell': 'SHEL',
    'bp': 'BP',
    'hsbc': 'HSBC',
    'unilever': 'ULVR.L',
    'astrazeneca': 'AZN',
    'glaxo': 'GSK',
    'diageo': 'DGE.L',
  };

  // Mapa de criptomonedas
  private readonly cryptoMap: { [key: string]: string } = {
    'bitcoin': 'BTC',
    'btc': 'BTC',
    'ethereum': 'ETH',
    'eth': 'ETH',
    'solana': 'SOL',
    'sol': 'SOL',
    'cardano': 'ADA',
    'ada': 'ADA',
    'ripple': 'XRP',
    'xrp': 'XRP',
    'dogecoin': 'DOGE',
    'doge': 'DOGE',
    'polkadot': 'DOT',
    'dot': 'DOT',
    'polygon': 'MATIC',
    'matic': 'MATIC',
    'chainlink': 'LINK',
    'link': 'LINK',
    'avalanche': 'AVAX',
    'avax': 'AVAX',
    'litecoin': 'LTC',
    'ltc': 'LTC',
    'shiba': 'SHIB',
    'shiba inu': 'SHIB',
    'uniswap': 'UNI',
    'uni': 'UNI',
    'binance coin': 'BNB',
    'bnb': 'BNB',
  };

  // Detectar si el mensaje pide cualquier tipo de información financiera
  private isFinancialRequest(message: string): boolean {
    const financialPatterns = [
      // Precios y valores
      /precio/i,
      /cotizaci[oó]n/i,
      /valor/i,
      /cu[aá]nto vale/i,
      /cu[aá]nto cuesta/i,
      /cu[aá]nto est[aá]/i,
      // Datos y tiempo real
      /tiempo real/i,
      /datos/i,
      /informaci[oó]n/i,
      // Estado actual
      /c[oó]mo est[aá]/i,
      /c[oó]mo va/i,
      /c[oó]mo anda/i,
      /qu[eé] tal/i,
      // Acciones específicas
      /dame/i,
      /dime/i,
      /mu[eé]strame/i,
      /consulta/i,
      /busca/i,
      // Acciones y activos
      /acci[oó]n/i,
      /acciones/i,
      /bolsa/i,
      /mercado/i,
      /invertir/i,
      /inversi[oó]n/i,
      // Análisis
      /analiza/i,
      /an[aá]lisis/i,
      /predicci[oó]n/i,
      /pron[oó]stico/i,
      // Crypto
      /crypto/i,
      /cripto/i,
      /bitcoin/i,
      /ethereum/i,
    ];
    return financialPatterns.some(pattern => pattern.test(message));
  }

  // Normalizar texto para comparación (quitar acentos y caracteres especiales)
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
      .replace(/[^a-z0-9\s]/g, ' ')    // Quitar caracteres especiales
      .replace(/\s+/g, ' ')            // Normalizar espacios
      .trim();
  }

  // Extraer posibles nombres de activos del mensaje
  private extractPotentialAssets(message: string): string[] {
    const normalized = this.normalizeText(message);
    const words = normalized.split(' ');
    
    // Palabras comunes que NO son activos (ampliado)
    const stopWords = new Set([
      // Verbos y acciones
      'dame', 'dime', 'puedes', 'podrias', 'quiero', 'necesito', 'hazme', 'hacerme',
      'hacer', 'haz', 'muestrame', 'muestra', 'enseñame', 'enseña',
      'busca', 'consulta', 'analiza', 'predice', 'pronostica',
      'crees', 'opinas', 'piensas', 'recomiendas', 'sugieres',
      // Tiempo
      'minutos', 'minuto', 'horas', 'hora', 'dias', 'dia', 'semanas', 'semana',
      'meses', 'mes', 'años', 'año', 'hoy', 'ahora', 'ya', 'ayer', 'manana',
      'proximos', 'proximas', 'siguiente', 'siguientes',
      // Artículos y preposiciones
      'de', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas',
      'que', 'como', 'esta', 'estan', 'cual', 'cuales', 'cuanto', 'cuanta',
      'para', 'por', 'con', 'sin', 'sobre', 'entre', 'hacia', 'desde', 'hasta',
      'y', 'o', 'pero', 'si', 'no', 'mas', 'menos', 'muy', 'poco', 'mucho',
      // Finanzas genéricas
      'precio', 'actual', 'tiempo', 'real', 'cotizacion', 'cotizaciones',
      'accion', 'acciones', 'bolsa', 'mercado', 'mercados', 'valor', 'valores',
      'invertir', 'inversion', 'inversiones', 'analisis', 'prediccion', 'predicciones',
      'datos', 'informacion', 'info', 'bien', 'mal',
      // Números escritos
      'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
      'quince', 'veinte', 'treinta',
    ]);

    return words.filter(word => 
      word.length >= 3 && 
      !stopWords.has(word) &&
      !/^\d+$/.test(word) && // No números puros
      !/^\d+[a-z]+$/.test(word) && // No combinaciones como "15min"
      /^[a-z]+$/.test(word) // Solo letras
    );
  }

  // Verificar si el mensaje menciona un activo específico (no solo pregunta general)
  private mentionsSpecificAsset(message: string): boolean {
    const messageLower = this.normalizeText(message);
    
    // Verificar si menciona alguna empresa/crypto conocida
    for (const companyName of Object.keys(this.companySymbolMap)) {
      if (messageLower.includes(this.normalizeText(companyName))) {
        return true;
      }
    }
    for (const cryptoName of Object.keys(this.cryptoMap)) {
      if (messageLower.includes(this.normalizeText(cryptoName))) {
        return true;
      }
    }
    
    // Verificar si tiene un símbolo en mayúsculas (AAPL, TSLA, etc.)
    if (/\b[A-Z]{2,5}(?:\.[A-Z]{1,2})?\b/.test(message)) {
      return true;
    }
    
    return false;
  }

  // Detectar si el mensaje menciona un activo y obtener datos reales
  private async enrichMessageWithMarketData(userMessage: string): Promise<string> {
    console.log('[GeminiService] Procesando mensaje:', userMessage);
    
    const messageLower = this.normalizeText(userMessage);
    let marketData = '';
    const foundSymbols = new Set<string>();
    const isFinancialRequest = this.isFinancialRequest(userMessage);

    console.log('[GeminiService] ¿Es petición financiera?', isFinancialRequest);
    console.log('[GeminiService] Finnhub configurado:', finnhubService.isConfigured());

    if (!finnhubService.isConfigured()) {
      console.log('[GeminiService] Finnhub NO está configurado');
      return userMessage;
    }

    // 1. Buscar en el mapa de empresas conocidas (con texto normalizado)
    for (const [companyName, symbol] of Object.entries(this.companySymbolMap)) {
      const normalizedCompany = this.normalizeText(companyName);
      if (messageLower.includes(normalizedCompany) && !foundSymbols.has(symbol)) {
        console.log(`[GeminiService] Encontrada empresa conocida: ${companyName} -> ${symbol}`);
        foundSymbols.add(symbol);
        try {
          const data = await finnhubService.getMarketDataForAI(symbol, 'stock');
          marketData += '\n' + data;
        } catch (e: any) {
          console.log(`[GeminiService] Error obteniendo datos para ${symbol}:`, e.message);
        }
      }
    }

    // 2. Buscar criptomonedas (con texto normalizado)
    for (const [cryptoName, symbol] of Object.entries(this.cryptoMap)) {
      const normalizedCrypto = this.normalizeText(cryptoName);
      if (messageLower.includes(normalizedCrypto) && !foundSymbols.has(symbol)) {
        console.log(`[GeminiService] Encontrada crypto: ${cryptoName} -> ${symbol}`);
        foundSymbols.add(symbol);
        try {
          const data = await finnhubService.getMarketDataForAI(symbol, 'crypto');
          marketData += '\n' + data;
        } catch (e: any) {
          console.log(`[GeminiService] Error obteniendo datos crypto para ${symbol}:`, e.message);
        }
      }
    }

    // 3. Buscar símbolos directos en mayúsculas (ej: AAPL, ITX.MC, TSLA)
    const symbolPattern = /\b([A-Z]{2,5}(?:\.[A-Z]{1,2})?)\b/g;
    const directSymbols = userMessage.toUpperCase().match(symbolPattern) || [];
    const commonUpperWords = new Set(['DE', 'LA', 'EL', 'EN', 'ES', 'UN', 'QUE', 'NO', 'SI', 'HOY', 'YA', 'MAS', 'MES', 'USD', 'EUR', 'DAME', 'PRECIO', 'ACTUAL', 'COMO', 'ESTA', 'TIEMPO', 'REAL']);
    
    for (const symbol of directSymbols) {
      if (!foundSymbols.has(symbol) && !commonUpperWords.has(symbol)) {
        console.log(`[GeminiService] Probando símbolo directo: ${symbol}`);
        try {
          const data = await finnhubService.getMarketDataForAI(symbol, 'stock');
          if (!data.includes('No se pudieron obtener') && !data.includes('Error')) {
            console.log(`[GeminiService] Símbolo válido encontrado: ${symbol}`);
            foundSymbols.add(symbol);
            marketData += '\n' + data;
          }
        } catch (e: any) {
          console.log(`[GeminiService] Símbolo ${symbol} no válido`);
        }
      }
    }

    // 4. Solo buscar en Finnhub si parece que menciona un activo específico que no conocemos
    // No buscar para preguntas generales como "hazme una predicción para 15 minutos"
    if (isFinancialRequest && foundSymbols.size === 0 && this.mentionsSpecificAsset(userMessage)) {
      const potentialAssets = this.extractPotentialAssets(userMessage);
      console.log('[GeminiService] Buscando activos potenciales:', potentialAssets);
      
      for (const word of potentialAssets) {
        if (word.length >= 4) { // Mínimo 4 caracteres para evitar falsos positivos
          try {
            console.log(`[GeminiService] Buscando en Finnhub: "${word}"`);
            const searchResults = await finnhubService.searchSymbol(word);
            
            if (searchResults.length > 0) {
              // Tomar el primer resultado que tenga descripción relevante
              const bestMatch = searchResults[0];
              console.log(`[GeminiService] Resultado de búsqueda:`, bestMatch);
              
              if (bestMatch.symbol && !foundSymbols.has(bestMatch.symbol)) {
                foundSymbols.add(bestMatch.symbol);
                const data = await finnhubService.getMarketDataForAI(bestMatch.symbol, 'stock');
                marketData += '\n' + data;
                console.log(`[GeminiService] Datos obtenidos para ${bestMatch.symbol}`);
                break; // Solo tomar el primer resultado válido
              }
            }
          } catch (e: any) {
            console.log(`[GeminiService] Error buscando "${word}":`, e.message);
          }
        }
      }
    }

    console.log(`[GeminiService] Símbolos encontrados: ${Array.from(foundSymbols).join(', ')}`);
    console.log(`[GeminiService] ¿Hay datos de mercado? ${marketData.length > 0}`)

    if (marketData) {
      return `${userMessage}\n\n--- DATOS DE MERCADO EN TIEMPO REAL (Finnhub API) ---${marketData}\n\nIMPORTANTE: Estos son datos REALES y actualizados. Úsalos en tu respuesta y menciona que son datos en tiempo real.`;
    }

    return userMessage;
  }

  async sendMessage(
    userMessage: string,
    conversationHistory: ChatMessage[] = []
  ): Promise<ParsedAIResponse> {
    try {
      const client = this.getClient();
      const model = client.getGenerativeModel({ 
        model: appConfig.model,
        generationConfig: {
          maxOutputTokens: appConfig.maxTokens,
          temperature: appConfig.temperature,
        },
      });

      // Enriquecer el mensaje con datos de mercado reales
      const enrichedMessage = await this.enrichMessageWithMarketData(userMessage);

      // Limpiar historial de errores de símbolos incorrectos
      const cleanedHistory = conversationHistory.slice(-10).filter(msg => {
        // Filtrar respuestas que mencionen códigos de error o símbolos incorrectos
        if (msg.role === 'assistant') {
          const hasInvalidSymbolError = /\b\d{6}\s*\([A-Z]{2,4}\)/.test(msg.content) || // Patrón como "408525 (UNA)"
                                        msg.content.includes('no se encontraron datos') ||
                                        msg.content.includes('No encontré información');
          if (hasInvalidSymbolError && msg.content.length < 200) {
            return false; // Excluir mensajes cortos con errores
          }
        }
        return true;
      });

      // Construir historial para Gemini
      const history = cleanedHistory.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));

      // Iniciar chat con historial
      const chat = model.startChat({
        history: [
          {
            role: 'user',
            parts: [{ text: `Instrucciones del sistema: ${INVESTMENT_SYSTEM_PROMPT}` }],
          },
          {
            role: 'model',
            parts: [{ text: 'Entendido. Soy tu asistente experto en inversiones. ¿En qué puedo ayudarte?' }],
          },
          ...history,
        ],
      });

      const result = await chat.sendMessage(enrichedMessage);
      const response = await result.response;
      const assistantMessage = response.text() || 'Lo siento, no pude procesar tu solicitud.';

      // Parsear la respuesta para extraer predicción si existe
      const parsed = this.parseResponse(assistantMessage);

      return parsed;
    } catch (error: any) {
      console.error('Error al comunicarse con Gemini:', error);
      
      if (error.message?.includes('API_KEY_INVALID') || error.message?.includes('API key not valid')) {
        throw new Error('API Key inválida. Por favor, verifica tu configuración en https://aistudio.google.com/apikey');
      }
      if (error.message?.includes('RATE_LIMIT') || error.message?.includes('quota')) {
        throw new Error('Límite de requests excedido. Espera unos segundos e intenta de nuevo.');
      }
      if (error.message?.includes('SAFETY')) {
        throw new Error('La respuesta fue bloqueada por filtros de seguridad. Intenta reformular tu pregunta.');
      }
      
      throw new Error(error.message || 'Error al conectar con Gemini');
    }
  }

  private parseResponse(content: string): ParsedAIResponse {
    const result: ParsedAIResponse = {
      message: content,
    };

    // Buscar bloque JSON con predicción
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    
    if (jsonMatch) {
      try {
        const predictionData = JSON.parse(jsonMatch[1]);
        
        result.prediction = {
          asset: predictionData.asset,
          assetType: predictionData.assetType || 'other',
          direction: predictionData.direction || 'neutral',
          confidence: predictionData.confidence || 50,
          timeframe: predictionData.timeframe || 'No especificado',
          predictedChange: predictionData.predictedChange,
          reasoning: content.replace(/```json[\s\S]*?```/, '').trim(),
        };

        // Limpiar el mensaje removiendo el JSON
        result.message = content.replace(/```json[\s\S]*?```/, '').trim();
      } catch (e) {
        console.log('No se pudo parsear predicción JSON:', e);
      }
    }

    return result;
  }

  // Método para obtener análisis rápido de un activo
  async getQuickAnalysis(asset: string, assetType: string): Promise<ParsedAIResponse> {
    const prompt = `Dame un análisis rápido y una predicción para ${asset} (${assetType}). 
    Incluye:
    1. Situación actual del mercado
    2. Factores clave a considerar
    3. Tu predicción con nivel de confianza
    4. Timeframe recomendado para la inversión`;

    return this.sendMessage(prompt);
  }

  // Método para comparar activos
  async compareAssets(assets: string[]): Promise<ParsedAIResponse> {
    const prompt = `Compara los siguientes activos para inversión: ${assets.join(', ')}.
    Para cada uno indica:
    1. Pros y contras
    2. Nivel de riesgo
    3. Potencial de crecimiento
    4. Cuál recomendarías y por qué`;

    return this.sendMessage(prompt);
  }

  // Verificar si la API key está configurada
  isConfigured(): boolean {
    return appConfig.geminiApiKey !== 'TU_API_KEY_AQUI' && 
           appConfig.geminiApiKey.length > 0;
  }
}

// Exportamos con el mismo nombre para compatibilidad
export const geminiService = new GeminiService();

// También exportamos como aiService para uso genérico
export const aiService = geminiService;
