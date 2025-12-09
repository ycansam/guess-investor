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

  // Detectar si el mensaje menciona un activo y obtener datos reales
  private async enrichMessageWithMarketData(userMessage: string): Promise<string> {
    // Patrones para detectar símbolos de acciones y crypto
    const stockPatterns = [
      /\b(AAPL|GOOGL|GOOG|MSFT|AMZN|META|TSLA|NVDA|AMD|NFLX|DIS|BA|JPM|V|MA|PG|KO|PEP|WMT|HD)\b/gi,
      /acciones?\s+(?:de\s+)?(\w+)/gi,
      /stock\s+(?:de\s+)?(\w+)/gi,
    ];
    
    const cryptoPatterns = [
      /\b(BTC|ETH|SOL|ADA|XRP|DOGE|DOT|MATIC|LINK|AVAX)\b/gi,
      /\b(bitcoin|ethereum|solana|cardano|ripple|dogecoin)\b/gi,
    ];

    const cryptoMap: { [key: string]: string } = {
      'bitcoin': 'BTC',
      'ethereum': 'ETH',
      'solana': 'SOL',
      'cardano': 'ADA',
      'ripple': 'XRP',
      'dogecoin': 'DOGE',
    };

    let marketData = '';
    const foundSymbols = new Set<string>();

    // Buscar acciones
    for (const pattern of stockPatterns) {
      const matches = userMessage.matchAll(pattern);
      for (const match of matches) {
        const symbol = match[1]?.toUpperCase();
        if (symbol && symbol.length <= 5 && !foundSymbols.has(symbol)) {
          foundSymbols.add(symbol);
          try {
            if (finnhubService.isConfigured()) {
              const data = await finnhubService.getMarketDataForAI(symbol, 'stock');
              marketData += '\n' + data;
            }
          } catch (e) {
            console.log(`No se pudo obtener datos para ${symbol}`);
          }
        }
      }
    }

    // Buscar crypto
    for (const pattern of cryptoPatterns) {
      const matches = userMessage.matchAll(pattern);
      for (const match of matches) {
        let symbol = match[1]?.toUpperCase();
        // Convertir nombres a símbolos
        if (cryptoMap[match[1]?.toLowerCase()]) {
          symbol = cryptoMap[match[1].toLowerCase()];
        }
        if (symbol && !foundSymbols.has(symbol)) {
          foundSymbols.add(symbol);
          try {
            if (finnhubService.isConfigured()) {
              const data = await finnhubService.getMarketDataForAI(symbol, 'crypto');
              marketData += '\n' + data;
            }
          } catch (e) {
            console.log(`No se pudo obtener datos crypto para ${symbol}`);
          }
        }
      }
    }

    if (marketData) {
      return `${userMessage}\n\n--- DATOS DE MERCADO EN TIEMPO REAL ---${marketData}\n\nUsa estos datos reales para tu análisis.`;
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

      // Construir historial para Gemini
      const history = conversationHistory.slice(-10).map(msg => ({
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
