import { extractDirectSymbols, normalizeText } from '../utils/text-utils';
import { CalculatedPrediction, predictionCalculatorService } from './prediction-calculator';
import { sentimentService } from './sentiment-service';
import { symbolLookupService } from './symbol-lookup-service';
import { yahooFinanceService } from './yahoo-finance-service';

interface MarketDataResult {
  enrichedMessage: string;
  foundSymbols: string[];
  hasMarketData: boolean;
  calculatedPrediction?: CalculatedPrediction;
  foundAssets: FoundAsset[];
}

interface FoundAsset {
  symbol: string;
  type: 'stock' | 'crypto';
}

/**
 * Servicio para enriquecer mensajes con datos de mercado y sentimiento
 */
class MarketDataEnricherService {
  /**
   * Enriquece un mensaje del usuario con datos de mercado en tiempo real y sentimiento
   */
  async enrichMessage(userMessage: string): Promise<MarketDataResult> {
    console.log('[MarketDataEnricher] Procesando mensaje:', userMessage);
    
    const normalizedMessage = normalizeText(userMessage);
    const foundAssets: FoundAsset[] = [];
    let marketData = '';
    
    const isFinancialRequest = symbolLookupService.isFinancialRequest(userMessage);
    console.log('[MarketDataEnricher] ¿Es petición financiera?', isFinancialRequest);

    // 1. Buscar empresas conocidas
    const companyData = await this.searchKnownCompanies(normalizedMessage, foundAssets);
    marketData += companyData;

    // 2. Buscar criptomonedas conocidas
    const cryptoData = await this.searchKnownCryptos(normalizedMessage, foundAssets);
    marketData += cryptoData;

    // 3. Buscar símbolos directos en mayúsculas
    const directData = await this.searchDirectSymbols(userMessage, foundAssets);
    marketData += directData;

    // 4. Calcular predicción DETERMINÍSTICA para el primer activo
    let calculatedPrediction: CalculatedPrediction | undefined;
    if (foundAssets.length > 0) {
      const primaryAsset = foundAssets[0];
      const prediction = await predictionCalculatorService.calculatePrediction(
        primaryAsset.symbol,
        primaryAsset.type,
        1 // 1 día por defecto
      );
      if (prediction) {
        calculatedPrediction = prediction;
      }
    }

    console.log(`[MarketDataEnricher] Activos encontrados: ${foundAssets.map(a => a.symbol).join(', ')}`);
    console.log(`[MarketDataEnricher] ¿Hay predicción calculada? ${!!calculatedPrediction}`);

    return this.buildResult(userMessage, foundAssets, marketData, calculatedPrediction);
  }

  private async searchKnownCompanies(
    normalizedMessage: string, 
    foundAssets: FoundAsset[]
  ): Promise<string> {
    let marketData = '';
    const companySymbols = symbolLookupService.getCompanySymbols();
    const foundSymbols = new Set(foundAssets.map(a => a.symbol));

    for (const [companyName, symbol] of Object.entries(companySymbols)) {
      const normalizedCompany = normalizeText(companyName);
      
      if (normalizedMessage.includes(normalizedCompany) && !foundSymbols.has(symbol)) {
        console.log(`[MarketDataEnricher] Encontrada empresa: ${companyName} -> ${symbol}`);
        foundAssets.push({ symbol, type: 'stock' });
        foundSymbols.add(symbol);
        
        try {
          const data = await yahooFinanceService.getMarketDataForAI(symbol, 'stock');
          marketData += '\n' + data;
        } catch (e: any) {
          console.log(`[MarketDataEnricher] Error obteniendo datos para ${symbol}:`, e.message);
        }
      }
    }

    return marketData;
  }

  private async searchKnownCryptos(
    normalizedMessage: string, 
    foundAssets: FoundAsset[]
  ): Promise<string> {
    let marketData = '';
    const cryptoSymbols = symbolLookupService.getCryptoSymbols();
    const foundSymbols = new Set(foundAssets.map(a => a.symbol));

    for (const [cryptoName, symbol] of Object.entries(cryptoSymbols)) {
      const normalizedCrypto = normalizeText(cryptoName);
      
      if (normalizedMessage.includes(normalizedCrypto) && !foundSymbols.has(symbol)) {
        console.log(`[MarketDataEnricher] Encontrada crypto: ${cryptoName} -> ${symbol}`);
        foundAssets.push({ symbol, type: 'crypto' });
        foundSymbols.add(symbol);
        
        try {
          const data = await yahooFinanceService.getMarketDataForAI(symbol, 'crypto');
          marketData += '\n' + data;
        } catch (e: any) {
          console.log(`[MarketDataEnricher] Error obteniendo datos crypto para ${symbol}:`, e.message);
        }
      }
    }

    return marketData;
  }

  private async searchDirectSymbols(
    userMessage: string, 
    foundAssets: FoundAsset[]
  ): Promise<string> {
    let marketData = '';
    const directSymbols = extractDirectSymbols(userMessage);
    const foundSymbols = new Set(foundAssets.map(a => a.symbol));

    for (const symbol of directSymbols) {
      if (foundSymbols.has(symbol) || symbolLookupService.isCommonUpperWord(symbol)) {
        continue;
      }

      console.log(`[MarketDataEnricher] Probando símbolo directo: ${symbol}`);
      
      try {
        const data = await yahooFinanceService.getMarketDataForAI(symbol, 'stock');
        
        if (!data.includes('No se pudieron obtener') && !data.includes('Error')) {
          console.log(`[MarketDataEnricher] Símbolo válido: ${symbol}`);
          foundAssets.push({ symbol, type: 'stock' });
          foundSymbols.add(symbol);
          marketData += '\n' + data;
        }
      } catch (e: any) {
        console.log(`[MarketDataEnricher] Símbolo ${symbol} no válido`);
      }
    }

    return marketData;
  }

  /**
   * Obtiene el sentimiento de mercado para los activos encontrados
   */
  private async getSentimentForAssets(foundAssets: FoundAsset[]): Promise<string> {
    let sentimentData = '';

    // Solo obtener sentimiento para el primer activo (para no sobrecargar)
    const primaryAsset = foundAssets[0];
    
    try {
      console.log(`[MarketDataEnricher] Obteniendo sentimiento para ${primaryAsset.symbol}`);
      const sentiment = await sentimentService.getSentimentForAsset(
        primaryAsset.symbol, 
        primaryAsset.type
      );
      sentimentData = sentimentService.formatForAI(sentiment);
    } catch (e: any) {
      console.log(`[MarketDataEnricher] Error obteniendo sentimiento:`, e.message);
    }

    return sentimentData;
  }

  private buildResult(
    userMessage: string, 
    foundAssets: FoundAsset[], 
    marketData: string,
    calculatedPrediction?: CalculatedPrediction
  ): MarketDataResult {
    const hasMarketData = marketData.length > 0;
    const foundSymbols = foundAssets.map(a => a.symbol);

    if (hasMarketData && calculatedPrediction) {
      // Crear mensaje con la predicción YA CALCULADA
      const directionEmoji = calculatedPrediction.direction === 'up' ? '📈' : 
                            calculatedPrediction.direction === 'down' ? '📉' : '➡️';
      const directionText = calculatedPrediction.direction === 'up' ? 'SUBIDA' : 
                           calculatedPrediction.direction === 'down' ? 'BAJADA' : 'LATERAL';
      
      const enrichedMessage = `PREGUNTA: ${userMessage}

PREDICCIÓN CALCULADA (datos reales, NO MODIFICAR):
- Asset: ${calculatedPrediction.asset}
- Precio actual: €${calculatedPrediction.currentPrice}
- Precio objetivo: €${calculatedPrediction.predictedPriceMin} - €${calculatedPrediction.predictedPriceMax}
- Cambio esperado: ${calculatedPrediction.predictedChange}%
- Dirección: ${directionText}
- Confianza: ${calculatedPrediction.confidence}%
- Sentimiento RRSS: ${calculatedPrediction.sentiment.score}% (${calculatedPrediction.sentiment.source})
- Tendencia 30d: ${calculatedPrediction.historical.change30d}%
- Volatilidad: ${calculatedPrediction.historical.volatility}%

RESPONDE EXACTAMENTE CON ESTE FORMATO (copia los números de arriba):
📊 Mi confianza: ${calculatedPrediction.confidence}%
🌐 Sentimiento RRSS: ${calculatedPrediction.sentiment.score}% (${calculatedPrediction.sentiment.score > 60 ? 'Bullish' : calculatedPrediction.sentiment.score < 40 ? 'Bearish' : 'Neutro'})
💰 Precio actual: €${calculatedPrediction.currentPrice}
🎯 Precio objetivo: €${calculatedPrediction.predictedPriceMin} - €${calculatedPrediction.predictedPriceMax}
${directionEmoji} Dirección: ${directionText}
⏱️ Timeframe: ${calculatedPrediction.timeframe}`;
      
      return {
        enrichedMessage,
        foundSymbols,
        hasMarketData: true,
        calculatedPrediction,
        foundAssets,
      };
    }

    return {
      enrichedMessage: userMessage,
      foundSymbols,
      hasMarketData: false,
      foundAssets,
    };
  }
}

// Exportar instancia singleton
export const marketDataEnricherService = new MarketDataEnricherService();
