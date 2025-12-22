import { GoogleGenerativeAI } from '@google/generative-ai';
import { appConfig, INVESTMENT_SYSTEM_PROMPT } from '../config/app-config';
import { ChatMessage, ParsedAIResponse } from '../types';
import { getErrorMessage } from '../utils/ai-response-utils';
import { cleanConversationHistory, formatHistoryForGemini } from '../utils/conversation-utils';
import { marketDataEnricherService } from './market-data-enricher-service';

/**
 * Servicio principal para comunicación con Google Gemini
 * Las predicciones numéricas se calculan de forma determinística,
 * la IA solo genera el formato de respuesta.
 */
class GeminiService {
  private client: GoogleGenerativeAI | null = null;

  /**
   * Obtiene o inicializa el cliente de Gemini
   */
  private getClient(): GoogleGenerativeAI {
    if (!this.client) {
      this.validateApiKey();
      this.client = new GoogleGenerativeAI(appConfig.geminiApiKey);
    }
    return this.client;
  }

  /**
   * Valida que la API key esté configurada
   */
  private validateApiKey(): void {
    if (!appConfig.geminiApiKey || appConfig.geminiApiKey === 'TU_API_KEY_AQUI') {
      throw new Error(
        'API Key de Google Gemini no configurada.\n\n' +
        '1. Ve a https://aistudio.google.com/apikey\n' +
        '2. Crea una API Key GRATIS\n' +
        '3. Añádela al archivo .env como EXPO_PUBLIC_GEMINI_API_KEY'
      );
    }
  }

  /**
   * Envía un mensaje al modelo y obtiene la respuesta
   */
  async sendMessage(
    userMessage: string,
    conversationHistory: ChatMessage[] = []
  ): Promise<ParsedAIResponse> {
    try {
      // Enriquecer el mensaje con datos de mercado y calcular predicción
      console.log('[Gemini] Enriqueciendo mensaje y calculando predicción...');
      const enrichResult = await marketDataEnricherService.enrichMessage(userMessage);
      const { enrichedMessage, hasMarketData, calculatedPrediction } = enrichResult;
      
      console.log('[Gemini] ¿Tiene datos?', hasMarketData);
      console.log('[Gemini] ¿Tiene predicción calculada?', !!calculatedPrediction);

      // Si tenemos una predicción calculada, usarla directamente
      if (calculatedPrediction) {
        console.log('[Gemini] Usando predicción calculada (determinística)');
        
        const directionEmoji = calculatedPrediction.direction === 'up' ? '📈' : 
                              calculatedPrediction.direction === 'down' ? '📉' : '➡️';
        const directionText = calculatedPrediction.direction === 'up' ? 'SUBE' : 
                             calculatedPrediction.direction === 'down' ? 'BAJA' : 'SE MANTIENE';
        const moodText = calculatedPrediction.sentiment.score > 60 ? 'Bullish' : 
                        calculatedPrediction.sentiment.score < 40 ? 'Bearish' : 'Neutro';

        // Precio objetivo único según dirección
        const targetPrice = calculatedPrediction.direction === 'up' 
          ? calculatedPrediction.predictedPriceMax 
          : calculatedPrediction.direction === 'down'
            ? calculatedPrediction.predictedPriceMin
            : calculatedPrediction.currentPrice;

        // Generar mensaje formateado con datos REALES
        let message = `📊 Mi confianza: ${calculatedPrediction.confidence}%
🌐 Sentimiento RRSS: ${calculatedPrediction.sentiment.score}% (${moodText})
💰 Precio actual: €${calculatedPrediction.currentPrice.toFixed(2)}
🎯 Precio objetivo: €${targetPrice.toFixed(2)}
${directionEmoji} Predicción: ${directionText} (${calculatedPrediction.predictedChange >= 0 ? '+' : ''}${calculatedPrediction.predictedChange.toFixed(2)}%)
⏱️ Timeframe: ${calculatedPrediction.timeframe}`;

        // Añadir info financiera si está disponible
        if (calculatedPrediction.financials) {
          const fin = calculatedPrediction.financials;
          message += `\n\n📈 Fundamentales: Score ${fin.overallScore}/100
💵 Ingresos: ${fin.revenue} (${fin.revenueGrowth >= 0 ? '+' : ''}${fin.revenueGrowth.toFixed(1)}%)
📊 Rating analistas: ${fin.analystRating}`;
          if (fin.targetPrice > 0) {
            message += ` | Objetivo: €${fin.targetPrice.toFixed(2)}`;
          }
          
          // NUEVO: Mostrar expectativas del mercado si hay datos
          if (fin.expectationsOutlook && fin.expectationsOutlook !== 'Sin datos') {
            const surpriseEmoji = fin.lastEarningsSurprise > 0 ? '✅' : fin.lastEarningsSurprise < 0 ? '❌' : '➖';
            message += `\n🎯 Expectativas: ${fin.expectationsOutlook} ${surpriseEmoji}`;
            if (fin.lastEarningsSurprise !== 0) {
              message += ` (último: ${fin.lastEarningsSurprise >= 0 ? '+' : ''}${fin.lastEarningsSurprise.toFixed(1)}%)`;
            }
          }
        }

        // Construir reasoning más completo
        let reasoning = `Análisis basado en: tendencia 30d (${calculatedPrediction.historical.change30d.toFixed(1)}%), volatilidad (${calculatedPrediction.historical.volatility.toFixed(1)}%), sentimiento ${calculatedPrediction.sentiment.source} (${calculatedPrediction.sentiment.score}%)`;
        if (calculatedPrediction.financials) {
          reasoning += `. Fundamentales: score ${calculatedPrediction.financials.overallScore}/100, rating "${calculatedPrediction.financials.analystRating}"`;
          if (calculatedPrediction.financials.expectationsOutlook && calculatedPrediction.financials.expectationsOutlook !== 'Sin datos') {
            reasoning += `, expectativas: ${calculatedPrediction.financials.expectationsOutlook}`;
          }
        }

        return {
          message,
          prediction: {
            asset: calculatedPrediction.asset,
            symbol: calculatedPrediction.symbol,
            assetType: calculatedPrediction.assetType,
            direction: calculatedPrediction.direction,
            confidence: calculatedPrediction.confidence,
            timeframe: calculatedPrediction.timeframe,
            currentPrice: calculatedPrediction.currentPrice,
            predictedPriceMin: calculatedPrediction.predictedPriceMin,
            predictedPriceMax: calculatedPrediction.predictedPriceMax,
            predictedChange: calculatedPrediction.predictedChange,
            reasoning,
            analysisData: {
              sentiment: calculatedPrediction.sentiment,
              historical: calculatedPrediction.historical,
              financials: calculatedPrediction.financials,
              news: calculatedPrediction.news,
              macro: calculatedPrediction.macro,
              competitors: calculatedPrediction.competitors,
              forex: calculatedPrediction.forex,
              institutional: calculatedPrediction.institutional,
              seasonality: calculatedPrediction.seasonality,
              factorBreakdown: calculatedPrediction.factorBreakdown,
              audit: calculatedPrediction.audit,
              // Meta-learning: Uncertainty analysis
              uncertainty: calculatedPrediction.uncertaintyScore !== undefined ? {
                score: calculatedPrediction.uncertaintyScore,
                shouldPredict: calculatedPrediction.shouldPredict ?? true,
                warning: calculatedPrediction.uncertaintyWarning,
                reasons: calculatedPrediction.uncertaintyReasons,
              } : undefined,
            },
          },
        };
      }

      // Si no hay predicción calculada, usar Gemini para responder
      const model = this.createModel();
      const cleanedHistory = cleanConversationHistory(conversationHistory);
      const formattedHistory = formatHistoryForGemini(cleanedHistory);

      const chat = model.startChat({
        history: this.buildChatHistory(formattedHistory),
      });

      console.log('[Gemini] Enviando a Gemini (sin predicción calculada)...');
      const result = await chat.sendMessage(enrichedMessage);
      const response = await result.response;
      const assistantMessage = response.text() || 'Lo siento, no pude procesar tu solicitud.';

      return {
        message: assistantMessage,
      };
    } catch (error: any) {
      console.error('Error al comunicarse con Gemini:', error);
      throw new Error(getErrorMessage(error));
    }
  }

  /**
   * Crea una instancia del modelo generativo
   */
  private createModel() {
    const client = this.getClient();
    return client.getGenerativeModel({ 
      model: appConfig.model,
      generationConfig: {
        maxOutputTokens: appConfig.maxTokens,
        temperature: appConfig.temperature,
      },
    });
  }

  /**
   * Construye el historial del chat incluyendo el system prompt
   */
  private buildChatHistory(
    formattedHistory: Array<{ role: string; parts: Array<{ text: string }> }>
  ) {
    return [
      {
        role: 'user',
        parts: [{ text: `Instrucciones del sistema: ${INVESTMENT_SYSTEM_PROMPT}` }],
      },
      {
        role: 'model',
        parts: [{ text: 'Entendido. Soy tu asistente experto en inversiones. ¿En qué puedo ayudarte?' }],
      },
      ...formattedHistory,
    ];
  }

  /**
   * Obtiene un análisis rápido de un activo
   */
  async getQuickAnalysis(asset: string, assetType: string): Promise<ParsedAIResponse> {
    const prompt = `Dame un análisis rápido y una predicción para ${asset} (${assetType}). 
    Incluye:
    1. Situación actual del mercado
    2. Factores clave a considerar
    3. Tu predicción con nivel de confianza
    4. Timeframe recomendado para la inversión`;

    return this.sendMessage(prompt);
  }

  /**
   * Compara múltiples activos
   */
  async compareAssets(assets: string[]): Promise<ParsedAIResponse> {
    const prompt = `Compara los siguientes activos para inversión: ${assets.join(', ')}.
    Para cada uno indica:
    1. Pros y contras
    2. Nivel de riesgo
    3. Potencial de crecimiento
    4. Cuál recomendarías y por qué`;

    return this.sendMessage(prompt);
  }

  /**
   * Verifica si el servicio está configurado correctamente
   */
  isConfigured(): boolean {
    return appConfig.geminiApiKey !== 'TU_API_KEY_AQUI' && 
           appConfig.geminiApiKey.length > 0;
  }
}

// Exportar instancia singleton
export const geminiService = new GeminiService();

// Alias para compatibilidad
export const aiService = geminiService;
