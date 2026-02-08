/**
 * Servicio de IA - Usa exclusivamente el backend para predicciones
 * El símbolo viene directamente de la lista de mercado
 */
import { ParsedAIResponse } from '../types';
import { apiClient, CalculatedPrediction } from './api-client';

/**
 * Servicio de IA que usa el backend para cálculos determinísticos
 */
class AIService {
  /**
   * Analiza un activo por símbolo y retorna la predicción
   */
  async analyzeBySymbol(
    symbol: string,
    timeframeDays: number = 7
  ): Promise<ParsedAIResponse> {
    try {
      console.log('[AIService] Calculando predicción para', symbol);
      
      const calculatedPrediction = await apiClient.calculatePrediction(symbol, timeframeDays);

      if (calculatedPrediction) {
        console.log('[AIService] Predicción calculada del backend');
        // DEBUG: Log del factorBreakdown que llega del API
        console.log('[AIService] DEBUG - factorBreakdown del API:', 
          calculatedPrediction.factorBreakdown ? 
            `EXISTS (assetGroup: ${calculatedPrediction.factorBreakdown.assetGroup}, availableFactors: ${calculatedPrediction.factorBreakdown.availableFactors?.length || 0})` : 
            'NULL/UNDEFINED');
        return this.formatPredictionResponse(calculatedPrediction);
      }

      // Si no hay predicción, responder con mensaje genérico
      return {
        message: `⚠️ No se pudo obtener datos para ${symbol}. El backend puede estar desconectado o el símbolo no está disponible.`,
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
        currency: prediction.currency, // Moneda del activo
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
  /**
   * Obtiene un análisis rápido de un activo (interfaz pública)
   * @param asset - Símbolo del activo (ej: "AAPL", "BTC-USD")
   * @param _assetType - Tipo de activo (ignorado, el backend lo detecta)
   */
  async getQuickAnalysis(asset: string, _assetType: string): Promise<ParsedAIResponse> {
    return this.analyzeBySymbol(asset);
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
