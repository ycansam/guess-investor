import { messageParserService, ParsedMessage } from './message-parser-service';
import { CalculatedPrediction, predictionCalculatorService } from './prediction-calculator';
import { yahooFinanceService } from './yahoo-finance-service';

interface MarketDataResult {
  enrichedMessage: string;
  foundSymbols: string[];
  hasMarketData: boolean;
  calculatedPrediction?: CalculatedPrediction;
  foundAssets: FoundAsset[];
  parsedMessage?: ParsedMessage;
}

interface FoundAsset {
  symbol: string;
  type: 'stock' | 'crypto';
}

/**
 * Servicio para enriquecer mensajes con datos de mercado y sentimiento
 * Ahora usa LLM para extraer activos y fechas en lugar de regex
 */
class MarketDataEnricherService {
  /**
   * Enriquece un mensaje del usuario con datos de mercado en tiempo real y sentimiento
   * Usa el LLM para extraer el activo y la fecha del mensaje
   */
  async enrichMessage(userMessage: string): Promise<MarketDataResult> {
    console.log('[MarketDataEnricher] Procesando mensaje con LLM:', userMessage);
    
    // 1. Usar LLM para extraer activo y fecha del mensaje
    const parsedMessage = await messageParserService.parseMessage(userMessage);
    
    if (!parsedMessage) {
      console.log('[MarketDataEnricher] No es una petición financiera o no se encontró activo');
      return {
        enrichedMessage: userMessage,
        foundSymbols: [],
        hasMarketData: false,
        foundAssets: [],
      };
    }

    console.log('[MarketDataEnricher] Mensaje parseado:', parsedMessage);
    
    const foundAssets: FoundAsset[] = [{
      symbol: parsedMessage.symbol,
      type: parsedMessage.assetType,
    }];
    
    // 2. Obtener datos de mercado para el activo
    let marketData = '';
    try {
      const data = await yahooFinanceService.getMarketDataForAI(
        parsedMessage.symbol, 
        parsedMessage.assetType
      );
      marketData = data;
    } catch (e: any) {
      console.log(`[MarketDataEnricher] Error obteniendo datos para ${parsedMessage.symbol}:`, e.message);
    }

    // 3. Calcular predicción DETERMINÍSTICA con el timeframe correcto
    let calculatedPrediction: CalculatedPrediction | undefined;
    const prediction = await predictionCalculatorService.calculatePrediction(
      parsedMessage.symbol,
      parsedMessage.assetType,
      parsedMessage.timeframeDays // Usar el timeframe extraído por el LLM
    );
    if (prediction) {
      calculatedPrediction = prediction;
    }

    console.log(`[MarketDataEnricher] Activo: ${parsedMessage.symbol}, Timeframe: ${parsedMessage.timeframeDays} días`);
    console.log(`[MarketDataEnricher] ¿Hay predicción calculada? ${!!calculatedPrediction}`);

    return this.buildResult(userMessage, foundAssets, marketData, calculatedPrediction, parsedMessage);
  }

  private async searchKnownCompanies(
    _normalizedMessage: string, 
    _foundAssets: FoundAsset[]
  ): Promise<string> {
    // DEPRECATED: Ya no se usa, el LLM extrae los activos
    return '';
  }

  private async searchKnownCryptos(
    _normalizedMessage: string, 
    _foundAssets: FoundAsset[]
  ): Promise<string> {
    // DEPRECATED: Ya no se usa, el LLM extrae los activos
    return '';
  }

  private async searchDirectSymbols(
    _userMessage: string, 
    _foundAssets: FoundAsset[]
  ): Promise<string> {
    // DEPRECATED: Ya no se usa, el LLM extrae los activos
    return '';
  }

  private buildResult(
    userMessage: string, 
    foundAssets: FoundAsset[], 
    marketData: string,
    calculatedPrediction?: CalculatedPrediction,
    parsedMessage?: ParsedMessage
  ): MarketDataResult {
    const hasMarketData = marketData.length > 0;
    const foundSymbols = foundAssets.map(a => a.symbol);

    if (hasMarketData && calculatedPrediction) {
      // Crear mensaje con la predicción YA CALCULADA
      const directionEmoji = calculatedPrediction.direction === 'up' ? '📈' : 
                            calculatedPrediction.direction === 'down' ? '📉' : '➡️';
      const directionText = calculatedPrediction.direction === 'up' ? 'SUBE' : 
                           calculatedPrediction.direction === 'down' ? 'BAJA' : 'SE MANTIENE';
      
      // Precio objetivo único según dirección
      const targetPrice = calculatedPrediction.direction === 'up' 
        ? calculatedPrediction.predictedPriceMax 
        : calculatedPrediction.direction === 'down'
          ? calculatedPrediction.predictedPriceMin
          : calculatedPrediction.currentPrice;
      
      // Información de fecha si está disponible
      const dateInfo = parsedMessage?.targetDate 
        ? `\n- Fecha objetivo: ${parsedMessage.targetDate.toLocaleDateString('es-ES')}`
        : '';
      
      const enrichedMessage = `PREGUNTA: ${userMessage}

PREDICCIÓN CALCULADA (datos reales, NO MODIFICAR):
- Asset: ${calculatedPrediction.asset}
- Precio actual: €${calculatedPrediction.currentPrice}
- Precio objetivo: €${targetPrice}
- Cambio esperado: ${calculatedPrediction.predictedChange}%
- Predicción: ${directionText}
- Confianza: ${calculatedPrediction.confidence}%
- Sentimiento RRSS: ${calculatedPrediction.sentiment.score}% (${calculatedPrediction.sentiment.source})
- Tendencia 30d: ${calculatedPrediction.historical.change30d}%
- Volatilidad: ${calculatedPrediction.historical.volatility}%${dateInfo}

RESPONDE EXACTAMENTE CON ESTE FORMATO (copia los números de arriba):
📊 Mi confianza: ${calculatedPrediction.confidence}%
🌐 Sentimiento RRSS: ${calculatedPrediction.sentiment.score}% (${calculatedPrediction.sentiment.score > 60 ? 'Bullish' : calculatedPrediction.sentiment.score < 40 ? 'Bearish' : 'Neutro'})
💰 Precio actual: €${calculatedPrediction.currentPrice}
🎯 Precio objetivo: €${targetPrice}
${directionEmoji} Predicción: ${directionText} (${calculatedPrediction.predictedChange >= 0 ? '+' : ''}${calculatedPrediction.predictedChange}%)
⏱️ Timeframe: ${calculatedPrediction.timeframe}`;
      
      return {
        enrichedMessage,
        foundSymbols,
        hasMarketData: true,
        calculatedPrediction,
        foundAssets,
        parsedMessage,
      };
    }

    return {
      enrichedMessage: userMessage,
      foundSymbols,
      hasMarketData: false,
      foundAssets,
      parsedMessage,
    };
  }
}

// Exportar instancia singleton
export const marketDataEnricherService = new MarketDataEnricherService();
