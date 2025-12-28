/**
 * Servicio de IA - Usa exclusivamente el backend para predicciones
 * No hay integración con APIs externas de IA (Gemini, OpenAI, etc.)
 */
import { ChatMessage, ParsedAIResponse } from '../types';
import { apiClient, CalculatedPrediction } from './api-client';
import { messageParserService } from './message-parser-service';

/**
 * Servicio de IA que usa el backend para cálculos determinísticos
 */
class AIService {
  /**
   * Envía un mensaje y obtiene una respuesta basada en el backend
   */
  async sendMessage(
    userMessage: string,
    _conversationHistory: ChatMessage[] = []
  ): Promise<ParsedAIResponse> {
    try {
      // 1. Parsear el mensaje para extraer activo y timeframe
      console.log('[AIService] Parseando mensaje...');
      const parsedMessage = await messageParserService.parseMessage(userMessage);
      
      let calculatedPrediction: CalculatedPrediction | undefined;
      
      if (parsedMessage && parsedMessage.isFinancialRequest && parsedMessage.symbol) {
        // 2. Calcular predicción usando el backend
        console.log('[AIService] Calculando predicción para', parsedMessage.symbol);
        try {
          calculatedPrediction = await apiClient.calculatePrediction(
            parsedMessage.symbol,
            parsedMessage.timeframeDays || 7
          );
        } catch (error: any) {
          console.warn('[AIService] Error calculando predicción:', error.message);
        }
      }

      // Si tenemos una predicción calculada, formatearla
      if (calculatedPrediction) {
        console.log('[AIService] Usando predicción calculada del backend');
        return this.formatPredictionResponse(calculatedPrediction);
      }

      // Si no hay predicción, responder con mensaje genérico
      return {
        message: this.getGenericResponse(userMessage, parsedMessage),
      };
    } catch (error: any) {
      console.error('[AIService] Error:', error);
      throw new Error(error.message || 'Error al procesar la solicitud');
    }
  }

  /**
   * Formatea una predicción calculada en una respuesta
   */
  private formatPredictionResponse(prediction: CalculatedPrediction): ParsedAIResponse {
    const directionEmoji = prediction.direction === 'up' ? '📈' : 
                          prediction.direction === 'down' ? '📉' : '➡️';
    const directionText = prediction.direction === 'up' ? 'SUBE' : 
                         prediction.direction === 'down' ? 'BAJA' : 'SE MANTIENE';
    const moodText = prediction.sentiment.score > 60 ? 'Bullish' : 
                    prediction.sentiment.score < 40 ? 'Bearish' : 'Neutro';

    // Precio objetivo único según dirección
    const targetPrice = prediction.direction === 'up' 
      ? prediction.predictedPriceMax 
      : prediction.direction === 'down'
        ? prediction.predictedPriceMin
        : prediction.currentPrice;

    // Generar mensaje formateado con datos REALES
    let message = `📊 Mi confianza: ${prediction.confidence}%
🌐 Sentimiento RRSS: ${prediction.sentiment.score}% (${moodText})
💰 Precio actual: €${prediction.currentPrice.toFixed(2)}
🎯 Precio objetivo: €${targetPrice.toFixed(2)}
${directionEmoji} Predicción: ${directionText} (${prediction.predictedChange >= 0 ? '+' : ''}${prediction.predictedChange.toFixed(2)}%)
⏱️ Timeframe: ${prediction.timeframe}`;

    // Añadir info financiera si está disponible
    if (prediction.financials) {
      const fin = prediction.financials;
      message += `\n\n📈 Fundamentales: Score ${fin.overallScore}/100
💵 Ingresos: ${fin.revenue} (${fin.revenueGrowth >= 0 ? '+' : ''}${fin.revenueGrowth.toFixed(1)}%)
📊 Rating analistas: ${fin.analystRating}`;
      if (fin.targetPrice > 0) {
        message += ` | Objetivo: €${fin.targetPrice.toFixed(2)}`;
      }
      
      if (fin.expectationsOutlook && fin.expectationsOutlook !== 'Sin datos') {
        const surpriseEmoji = fin.lastEarningsSurprise > 0 ? '✅' : fin.lastEarningsSurprise < 0 ? '❌' : '➖';
        message += `\n🎯 Expectativas: ${fin.expectationsOutlook} ${surpriseEmoji}`;
        if (fin.lastEarningsSurprise !== 0) {
          message += ` (último: ${fin.lastEarningsSurprise >= 0 ? '+' : ''}${fin.lastEarningsSurprise.toFixed(1)}%)`;
        }
      }
    }

    // Construir reasoning
    let reasoning = `Análisis basado en: tendencia 30d (${prediction.historical.change30d.toFixed(1)}%), volatilidad (${prediction.historical.volatility.toFixed(1)}%), sentimiento ${prediction.sentiment.source} (${prediction.sentiment.score}%)`;
    if (prediction.financials) {
      reasoning += `. Fundamentales: score ${prediction.financials.overallScore}/100, rating "${prediction.financials.analystRating}"`;
    }

    return {
      message,
      prediction: {
        asset: prediction.asset,
        symbol: prediction.symbol,
        assetType: prediction.assetType as any,
        direction: prediction.direction,
        confidence: prediction.confidence,
        timeframe: prediction.timeframe,
        currentPrice: prediction.currentPrice,
        predictedPriceMin: prediction.predictedPriceMin,
        predictedPriceMax: prediction.predictedPriceMax,
        predictedChange: prediction.predictedChange,
        reasoning,
        analysisData: {
          sentiment: prediction.sentiment,
          historical: prediction.historical,
          financials: prediction.financials,
          news: prediction.news,
          macro: prediction.macro,
          competitors: prediction.competitors,
          forex: prediction.forex,
          institutional: prediction.institutional,
          seasonality: prediction.seasonality,
          factorBreakdown: prediction.factorBreakdown,
          audit: prediction.audit,
          uncertainty: prediction.uncertaintyScore !== undefined ? {
            score: prediction.uncertaintyScore,
            shouldPredict: prediction.shouldPredict ?? true,
            warning: prediction.uncertaintyWarning,
            reasons: prediction.uncertaintyReasons,
          } : undefined,
        },
      },
    };
  }

  /**
   * Genera una respuesta genérica cuando no se puede calcular predicción
   */
  private getGenericResponse(userMessage: string, parsedMessage: any): string {
    if (parsedMessage?.isFinancialRequest && !parsedMessage.symbol) {
      return '🔍 No pude identificar el activo. Por favor especifica el símbolo o nombre del activo que quieres analizar.\n\nEjemplos:\n• "Analiza AAPL"\n• "¿Qué opinas de Bitcoin?"\n• "Predicción para Tesla"';
    }
    
    if (parsedMessage?.isFinancialRequest) {
      return `⚠️ No se pudo obtener datos para ${parsedMessage.symbol}. El backend puede estar desconectado o el símbolo no está disponible.\n\nVerifica que el backend esté corriendo en http://localhost:3001`;
    }
    
    return `👋 Soy tu asistente de inversiones. Puedo analizar acciones, criptomonedas, índices y más.\n\nPrueba preguntando:\n• "Analiza Apple"\n• "¿Qué opinas de BTC?"\n• "Predicción para el S&P 500"`;
  }

  /**
   * Obtiene un análisis rápido de un activo
   */
  async getQuickAnalysis(asset: string, _assetType: string): Promise<ParsedAIResponse> {
    const prompt = `Analiza ${asset}`;
    return this.sendMessage(prompt);
  }

  /**
   * Siempre está "configurado" ya que usa el backend
   */
  isConfigured(): boolean {
    return true;
  }
}

// Exportar instancia singleton
export const aiService = new AIService();
