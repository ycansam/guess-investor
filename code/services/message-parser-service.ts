import { GoogleGenerativeAI } from '@google/generative-ai';
import { appConfig } from '../config/app-config';
import { symbolLookupService } from './symbol-lookup-service';

/**
 * Resultado del parsing del mensaje del usuario
 */
export interface ParsedMessage {
  /** Nombre del activo (ej: "Amazon", "Bitcoin") */
  assetName: string;
  /** Símbolo del activo (ej: "AMZN", "BTC-USD") */
  symbol: string;
  /** Tipo de activo */
  assetType: 'stock' | 'crypto';
  /** Fecha objetivo de la predicción (si se menciona) */
  targetDate: Date | null;
  /** Días hasta la fecha objetivo */
  timeframeDays: number;
  /** Si el mensaje es una petición de predicción financiera */
  isFinancialRequest: boolean;
  /** Mensaje original */
  originalMessage: string;
}

/**
 * Respuesta del LLM para el parsing
 */
interface LLMParseResponse {
  asset_name: string;
  symbol: string;
  asset_type: 'stock' | 'crypto';
  target_date: string | null; // ISO format o null
  is_financial_request: boolean;
}

/**
 * Servicio para extraer información de activos y fechas del mensaje del usuario
 * usando el LLM en lugar de regex
 */
class MessageParserService {
  private client: GoogleGenerativeAI | null = null;
  private cache = new Map<string, ParsedMessage>();

  private getClient(): GoogleGenerativeAI {
    if (!this.client) {
      this.client = new GoogleGenerativeAI(appConfig.geminiApiKey);
    }
    return this.client;
  }

  /**
   * Parsea el mensaje del usuario para extraer activo, símbolo y fecha
   */
  async parseMessage(userMessage: string): Promise<ParsedMessage | null> {
    // Verificar caché para evitar llamadas duplicadas
    const cacheKey = userMessage.toLowerCase().trim();
    if (this.cache.has(cacheKey)) {
      console.log('[MessageParser] Usando resultado en caché');
      return this.cache.get(cacheKey)!;
    }

    try {
      console.log('[MessageParser] Parseando mensaje con LLM:', userMessage);
      
      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth() + 1;
      const currentDay = today.getDate();

      const prompt = `Eres un extractor de información financiera. Analiza el siguiente mensaje del usuario y extrae la información relevante.

MENSAJE DEL USUARIO: "${userMessage}"

FECHA ACTUAL: ${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}

INSTRUCCIONES:
1. Identifica si el usuario está preguntando sobre un activo financiero (acción, criptomoneda, ETF, etc.)
2. Extrae el NOMBRE del activo (ej: "Amazon", "Apple", "Bitcoin", "Inditex", "Tesla")
3. Determina el SÍMBOLO correcto del activo:
   - Acciones americanas: AAPL, MSFT, AMZN, GOOGL, TSLA, META, NVDA, etc.
   - Acciones españolas: ITX.MC (Inditex), SAN.MC (Santander), TEF.MC (Telefónica), BBVA.MC, IBE.MC
   - Acciones europeas: SAP.DE, MC.PA (LVMH), AIR.PA (Airbus), ASML.AS
   - Criptomonedas: BTC-USD, ETH-USD, SOL-USD, XRP-USD, DOGE-USD
4. Si el usuario menciona una fecha para la predicción, extráela en formato ISO (YYYY-MM-DD)
   - "5 de enero" o "enero 5" → usar el próximo 5 de enero (${currentYear}-01-05 o ${currentYear + 1}-01-05 si ya pasó)
   - "mañana" → sumar 1 día a hoy
   - "la próxima semana" → sumar 7 días
   - "fin de mes" → último día del mes actual
   - Si no hay fecha específica, devolver null
5. Determina si es una petición financiera (predicción, precio, análisis, inversión, etc.)

RESPONDE SOLO CON JSON (sin markdown, sin \`\`\`):
{
  "asset_name": "nombre del activo o vacío si no hay",
  "symbol": "símbolo del activo o vacío si no hay",
  "asset_type": "stock" o "crypto",
  "target_date": "YYYY-MM-DD" o null,
  "is_financial_request": true o false
}

EJEMPLOS:
- "prediccion amazon para el 5 de enero" → {"asset_name": "Amazon", "symbol": "AMZN", "asset_type": "stock", "target_date": "${currentYear + 1}-01-05", "is_financial_request": true}
- "como va bitcoin" → {"asset_name": "Bitcoin", "symbol": "BTC-USD", "asset_type": "crypto", "target_date": null, "is_financial_request": true}
- "inditex para mañana" → {"asset_name": "Inditex", "symbol": "ITX.MC", "asset_type": "stock", "target_date": "${this.formatDateISO(this.addDays(today, 1))}", "is_financial_request": true}
- "hola que tal" → {"asset_name": "", "symbol": "", "asset_type": "stock", "target_date": null, "is_financial_request": false}`;

      const client = this.getClient();
      const model = client.getGenerativeModel({ 
        model: 'gemini-2.0-flash',
        generationConfig: {
          maxOutputTokens: 256,
          temperature: 0.1, // Baja temperatura para respuestas consistentes
        },
      });

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text().trim();

      console.log('[MessageParser] Respuesta del LLM:', text);

      // Parsear la respuesta JSON
      const parsed = this.parseJSONResponse(text);
      
      if (!parsed || !parsed.is_financial_request) {
        console.log('[MessageParser] No es una petición financiera o no se pudo parsear');
        return null;
      }

      if (!parsed.asset_name || !parsed.symbol) {
        console.log('[MessageParser] No se encontró activo en el mensaje');
        return null;
      }

      // Validar el símbolo contra nuestra base de datos local (fallback)
      const validatedSymbol = this.validateSymbol(parsed.asset_name, parsed.symbol, parsed.asset_type);

      // Calcular timeframe
      const targetDate = parsed.target_date ? new Date(parsed.target_date) : null;
      const timeframeDays = this.calculateTimeframeDays(targetDate);

      const result2: ParsedMessage = {
        assetName: parsed.asset_name,
        symbol: validatedSymbol,
        assetType: parsed.asset_type,
        targetDate,
        timeframeDays,
        isFinancialRequest: true,
        originalMessage: userMessage,
      };

      // Guardar en caché
      this.cache.set(cacheKey, result2);
      
      console.log('[MessageParser] Resultado:', result2);
      return result2;

    } catch (error) {
      console.error('[MessageParser] Error parseando mensaje:', error);
      // Fallback: intentar con el sistema actual
      return this.fallbackParse(userMessage);
    }
  }

  /**
   * Parsea la respuesta JSON del LLM
   */
  private parseJSONResponse(text: string): LLMParseResponse | null {
    try {
      // Limpiar posible markdown
      let cleanText = text;
      if (cleanText.startsWith('```json')) {
        cleanText = cleanText.slice(7);
      } else if (cleanText.startsWith('```')) {
        cleanText = cleanText.slice(3);
      }
      if (cleanText.endsWith('```')) {
        cleanText = cleanText.slice(0, -3);
      }
      cleanText = cleanText.trim();

      return JSON.parse(cleanText) as LLMParseResponse;
    } catch (e) {
      console.error('[MessageParser] Error parseando JSON:', e);
      return null;
    }
  }

  /**
   * Valida el símbolo del LLM contra nuestra base de datos
   */
  private validateSymbol(assetName: string, llmSymbol: string, assetType: 'stock' | 'crypto'): string {
    // Primero intentar con nuestra base de datos local
    const localAsset = symbolLookupService.findAsset(assetName.toLowerCase());
    if (localAsset) {
      console.log(`[MessageParser] Símbolo validado localmente: ${localAsset.symbol}`);
      return localAsset.symbol;
    }

    // Si no está en nuestra base, confiar en el LLM
    console.log(`[MessageParser] Usando símbolo del LLM: ${llmSymbol}`);
    return llmSymbol;
  }

  /**
   * Calcula los días hasta la fecha objetivo
   */
  private calculateTimeframeDays(targetDate: Date | null): number {
    if (!targetDate) {
      return 1; // Por defecto 1 día
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    targetDate.setHours(0, 0, 0, 0);

    const diffTime = targetDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Mínimo 1 día, máximo 365
    return Math.max(1, Math.min(365, diffDays));
  }

  /**
   * Formatea una fecha a ISO (YYYY-MM-DD)
   */
  private formatDateISO(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Añade días a una fecha
   */
  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  /**
   * Fallback al sistema antiguo en caso de error
   * Ahora incluye extracción de fechas sin LLM
   */
  private fallbackParse(userMessage: string): ParsedMessage | null {
    console.log('[MessageParser] Usando fallback con extracción local de fechas');
    
    const normalizedMessage = userMessage.toLowerCase();
    
    // 1. Buscar activo en nuestra base de datos
    let foundAsset: { name: string; symbol: string; type: 'stock' | 'crypto' } | null = null;
    
    // Buscar empresas conocidas
    const companySymbols = symbolLookupService.getCompanySymbols();
    for (const [name, symbol] of Object.entries(companySymbols)) {
      if (normalizedMessage.includes(name.toLowerCase())) {
        foundAsset = { name, symbol, type: 'stock' };
        break;
      }
    }

    // Si no encontró empresa, buscar criptos
    if (!foundAsset) {
      const cryptoSymbols = symbolLookupService.getCryptoSymbols();
      for (const [name, symbol] of Object.entries(cryptoSymbols)) {
        if (normalizedMessage.includes(name.toLowerCase())) {
          foundAsset = { name, symbol, type: 'crypto' };
          break;
        }
      }
    }

    if (!foundAsset) {
      return null;
    }

    // 2. Extraer fecha del mensaje (sin LLM)
    const dateInfo = this.extractDateFromMessage(normalizedMessage);

    return {
      assetName: foundAsset.name,
      symbol: foundAsset.symbol,
      assetType: foundAsset.type,
      targetDate: dateInfo.date,
      timeframeDays: dateInfo.days,
      isFinancialRequest: true,
      originalMessage: userMessage,
    };
  }

  /**
   * Extrae una fecha del mensaje usando patrones comunes (sin LLM)
   */
  private extractDateFromMessage(message: string): { date: Date | null; days: number } {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentYear = today.getFullYear();
    
    // Mapa de meses en español
    const monthMap: Record<string, number> = {
      'enero': 0, 'febrero': 1, 'marzo': 2, 'abril': 3,
      'mayo': 4, 'junio': 5, 'julio': 6, 'agosto': 7,
      'septiembre': 8, 'octubre': 9, 'noviembre': 10, 'diciembre': 11,
      'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
      'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11,
      'january': 0, 'february': 1, 'march': 2, 'april': 3,
      'june': 5, 'july': 6, 'august': 7, 'september': 8,
      'october': 9, 'november': 10, 'december': 11,
    };

    // Patrón: "5 de enero de 2026" o "5 enero 2026" o "enero 5 2026"
    const datePatterns = [
      /(\d{1,2})\s*(?:de\s*)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s*(?:de\s*)?(\d{4})?/i,
      /(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s*(\d{1,2})(?:\s*(?:de\s*)?(\d{4}))?/i,
      /(\d{1,2})\s*(?:de\s*)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(?:uary|ruary|ch|il|e|y|ust|tember|ober|ember)?\s*(?:of\s*)?(\d{4})?/i,
    ];

    for (const pattern of datePatterns) {
      const match = message.match(pattern);
      if (match) {
        let day: number;
        let month: number;
        let year: number;

        // Determinar orden según el patrón que coincidió
        if (/^\d/.test(match[1])) {
          // Patrón: día mes año
          day = parseInt(match[1]);
          month = monthMap[match[2].toLowerCase()] ?? 0;
          year = match[3] ? parseInt(match[3]) : currentYear;
        } else {
          // Patrón: mes día año
          month = monthMap[match[1].toLowerCase()] ?? 0;
          day = parseInt(match[2]);
          year = match[3] ? parseInt(match[3]) : currentYear;
        }

        // Si la fecha ya pasó este año y no especificó año, usar el próximo año
        const targetDate = new Date(year, month, day);
        if (targetDate < today && !match[3]) {
          targetDate.setFullYear(currentYear + 1);
        }

        const diffTime = targetDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        console.log(`[MessageParser] Fecha extraída localmente: ${targetDate.toISOString().split('T')[0]} (${diffDays} días)`);
        
        return {
          date: targetDate,
          days: Math.max(1, Math.min(365, diffDays)),
        };
      }
    }

    // Patrones relativos
    if (/mañana|tomorrow/i.test(message)) {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return { date: tomorrow, days: 1 };
    }
    
    if (/pasado\s*mañana|day\s*after/i.test(message)) {
      const dayAfter = new Date(today);
      dayAfter.setDate(dayAfter.getDate() + 2);
      return { date: dayAfter, days: 2 };
    }
    
    if (/próxima?\s*semana|next\s*week/i.test(message)) {
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);
      return { date: nextWeek, days: 7 };
    }
    
    if (/fin\s*de\s*mes|end\s*of\s*month/i.test(message)) {
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      const days = Math.ceil((endOfMonth.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return { date: endOfMonth, days: Math.max(1, days) };
    }
    
    if (/próximo?\s*mes|next\s*month/i.test(message)) {
      const nextMonth = new Date(today);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      return { date: nextMonth, days: 30 };
    }

    // Patrón: "en X días/semanas/meses"
    const inDaysMatch = message.match(/en\s*(\d+)\s*(días?|semanas?|meses?|days?|weeks?|months?)/i);
    if (inDaysMatch) {
      const num = parseInt(inDaysMatch[1]);
      const unit = inDaysMatch[2].toLowerCase();
      let days = num;
      
      if (unit.startsWith('semana') || unit.startsWith('week')) {
        days = num * 7;
      } else if (unit.startsWith('mes') || unit.startsWith('month')) {
        days = num * 30;
      }
      
      const futureDate = new Date(today);
      futureDate.setDate(futureDate.getDate() + days);
      return { date: futureDate, days: Math.max(1, Math.min(365, days)) };
    }

    // No se encontró fecha, usar default
    return { date: null, days: 1 };
  }

  /**
   * Limpia el caché
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Exportar instancia singleton
export const messageParserService = new MessageParserService();
