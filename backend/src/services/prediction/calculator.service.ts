/**
 * Prediction Calculator Service
 * Calcula predicciones de forma DETERMINÍSTICA basándose en datos reales
 * Migrado completamente del frontend
 */

import { logger } from '../../middleware/logger.js';
import { predictionRepository } from '../../repositories/prediction.repository.js';
import { weightsRepository } from '../../repositories/weights.repository.js';
import { MacroIndicators, macroService } from '../external/macro.service.js';
import { newsService, NewsSummary } from '../external/news.service.js';
import { SentimentData, sentimentService } from '../external/sentiment.service.js';
import { TechnicalAnalysis, technicalService } from '../external/technical.service.js';
import { yahooService } from '../external/yahoo.service.js';

// ============================================================================
// TIPOS
// ============================================================================

export interface CalculatedPrediction {
  asset: string;
  symbol: string;
  assetType: 'stock' | 'crypto' | 'forex' | 'commodity' | 'index' | 'other';
  currentPrice: number;
  currency: string;
  
  predictedPriceMin: number;
  predictedPriceMax: number;
  predictedChange: number;
  direction: 'up' | 'down' | 'neutral';
  confidence: number;
  
  factorBreakdown: {
    assetGroup: string;
    assetGroupDescription: string;
    relevantFactors: string[];
    availableFactors: { name: string; score: number; hasData: boolean }[];
    weightsUsed: Record<string, number>;
    usingLearnedWeights: boolean;
    confidenceExplanation: string;
    signalSummary: 'coherent_bullish' | 'coherent_bearish' | 'mixed' | 'neutral' | 'insufficient';
  };
  
  sentiment: {
    score: number;
    source: string;
    hasData: boolean;
    vix?: { value: number; sentiment: string; score: number };
    overallScore?: number;
  };
  
  historical: {
    change30d: number;
    change90d: number;
    volatility: number;
    hasData: boolean;
  };
  
  technical?: TechnicalAnalysis;
  news?: NewsSummary;
  macro?: MacroIndicators;
  
  timeframe: string;
  calculatedAt: Date;
  
  audit: {
    dataSources: { name: string; url: string; fetchedAt: Date }[];
    calculationSteps: { step: string; formula: string; result: number }[];
    combinedScoreBreakdown: string;
    expectedChangeBreakdown: string;
  };
}

// ============================================================================
// ASSET GROUPS Y CONFIGURACIÓN
// ============================================================================

type AssetGroup = 'large_cap_stock' | 'small_cap_stock' | 'crypto_major' | 'crypto_alt' | 
                  'etf_index' | 'commodity' | 'reit' | 'forex' | 'adr' | 'default';

interface AssetGroupConfig {
  relevantFactors: string[];
  minFactorsForHighConfidence: number;
  description: string;
}

const ASSET_GROUP_CONFIGS: Record<AssetGroup, AssetGroupConfig> = {
  large_cap_stock: {
    relevantFactors: ['trend', 'technical', 'sentiment', 'news', 'macro'],
    minFactorsForHighConfidence: 4,
    description: 'Acciones de gran capitalización',
  },
  small_cap_stock: {
    relevantFactors: ['trend', 'technical', 'news'],
    minFactorsForHighConfidence: 2,
    description: 'Acciones pequeñas/medianas',
  },
  crypto_major: {
    relevantFactors: ['trend', 'technical', 'sentiment', 'news'],
    minFactorsForHighConfidence: 3,
    description: 'Criptomonedas principales (BTC, ETH)',
  },
  crypto_alt: {
    relevantFactors: ['trend', 'technical', 'sentiment'],
    minFactorsForHighConfidence: 2,
    description: 'Altcoins',
  },
  etf_index: {
    relevantFactors: ['trend', 'technical', 'macro'],
    minFactorsForHighConfidence: 2,
    description: 'ETFs e índices',
  },
  commodity: {
    relevantFactors: ['trend', 'technical', 'macro'],
    minFactorsForHighConfidence: 2,
    description: 'Materias primas',
  },
  reit: {
    relevantFactors: ['trend', 'technical', 'macro'],
    minFactorsForHighConfidence: 2,
    description: 'REITs',
  },
  forex: {
    relevantFactors: ['trend', 'technical', 'macro'],
    minFactorsForHighConfidence: 2,
    description: 'Pares de divisas',
  },
  adr: {
    relevantFactors: ['trend', 'technical', 'news', 'macro'],
    minFactorsForHighConfidence: 3,
    description: 'ADRs',
  },
  default: {
    relevantFactors: ['trend', 'technical', 'sentiment', 'news'],
    minFactorsForHighConfidence: 2,
    description: 'Activo genérico',
  },
};

// Mapeo de símbolos conocidos
const SYMBOL_TO_GROUP: Record<string, AssetGroup> = {
  'BTC-USD': 'crypto_major', 'ETH-USD': 'crypto_major', 'BNB-USD': 'crypto_major',
  'SOL-USD': 'crypto_alt', 'ADA-USD': 'crypto_alt', 'DOGE-USD': 'crypto_alt', 'XRP-USD': 'crypto_alt',
  'SPY': 'etf_index', 'QQQ': 'etf_index', 'VOO': 'etf_index',
  '^GSPC': 'etf_index', '^DJI': 'etf_index', '^IXIC': 'etf_index',
  'GC=F': 'commodity', 'CL=F': 'commodity', 'SI=F': 'commodity',
  'GLD': 'commodity', 'SLV': 'commodity', 'USO': 'commodity',
  'AAPL': 'large_cap_stock', 'MSFT': 'large_cap_stock', 'GOOGL': 'large_cap_stock',
  'AMZN': 'large_cap_stock', 'META': 'large_cap_stock', 'NVDA': 'large_cap_stock',
  'TSLA': 'large_cap_stock', 'JPM': 'large_cap_stock',
  'ITX.MC': 'large_cap_stock', 'SAN.MC': 'large_cap_stock', 'BBVA.MC': 'large_cap_stock',
  'BABA': 'adr', 'TSM': 'adr', 'NIO': 'adr',
};

// Pesos por defecto según timeframe
const DEFAULT_WEIGHTS = {
  intraday: { trend: 0.25, technical: 0.30, sentiment: 0.20, news: 0.15, macro: 0.10 },
  swing: { trend: 0.20, technical: 0.25, sentiment: 0.15, news: 0.20, macro: 0.20 },
  long: { trend: 0.15, technical: 0.15, sentiment: 0.10, news: 0.25, macro: 0.35 },
};

// ============================================================================
// SERVICIO PRINCIPAL
// ============================================================================

export const predictionCalculatorService = {
  /**
   * Calcula una predicción completa para un símbolo
   */
  async calculatePrediction(
    symbol: string,
    type: 'stock' | 'crypto',
    timeframeDays: number = 1
  ): Promise<CalculatedPrediction | null> {
    try {
      logger.info(`[PredictionCalc] Calculating prediction for ${symbol} (${type})`);

      // 1. Obtener cotización actual
      const quote = await yahooService.getQuote(symbol);
      if (!quote || !quote.price) {
        logger.warn(`[PredictionCalc] No price data for ${symbol}`);
        return null;
      }

      // 2. Obtener datos históricos
      const history = await yahooService.getHistory(symbol, '3mo', '1d');
      const historical = this.processHistoricalData(history);

      // 3. Obtener análisis técnico
      const technical = await technicalService.analyze(symbol);

      // 4. Obtener sentimiento
      const sentiment = await sentimentService.getSentiment(symbol, type);

      // 5. Obtener noticias
      const news = await newsService.getNews(symbol, type);

      // 6. Obtener datos macro
      const macro = await macroService.getIndicators(symbol, type);

      // 7. Calcular predicción determinística
      const prediction = await this.calculateFromData(
        symbol,
        type,
        quote.price,
        quote.currency || 'USD',
        historical,
        technical,
        sentiment,
        news,
        macro,
        timeframeDays
      );

      logger.info(`[PredictionCalc] Prediction: ${prediction.direction} ${prediction.predictedChange.toFixed(2)}% (confidence: ${prediction.confidence}%)`);

      return prediction;
    } catch (error: any) {
      logger.error(`[PredictionCalc] Error:`, error.message);
      return null;
    }
  },

  /**
   * Procesa datos históricos para obtener métricas
   */
  processHistoricalData(history: any[]): CalculatedPrediction['historical'] {
    if (!history || history.length < 10) {
      return { change30d: 0, change90d: 0, volatility: 20, hasData: false };
    }

    const closes = history.map(h => h.close).filter((c): c is number => c !== null);
    if (closes.length < 10) {
      return { change30d: 0, change90d: 0, volatility: 20, hasData: false };
    }

    const current = closes[closes.length - 1];
    const price30d = closes[Math.max(0, closes.length - 22)] || current;
    const price90d = closes[0] || current;

    const change30d = ((current - price30d) / price30d) * 100;
    const change90d = ((current - price90d) / price90d) * 100;

    // Calcular volatilidad (desviación estándar anualizada)
    const returns: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance) * Math.sqrt(252) * 100;

    return { change30d, change90d, volatility, hasData: true };
  },

  /**
   * Cálculo determinístico de la predicción
   */
  async calculateFromData(
    symbol: string,
    type: 'stock' | 'crypto',
    currentPrice: number,
    currency: string,
    historical: CalculatedPrediction['historical'],
    technical: TechnicalAnalysis,
    sentiment: SentimentData,
    news: NewsSummary,
    macro: MacroIndicators,
    timeframeDays: number
  ): Promise<CalculatedPrediction> {
    // FLAGS de datos disponibles
    const hasHistoricalData = historical.hasData && (historical.change30d !== 0 || historical.change90d !== 0);
    const hasTechnicalData = technical.hasData;
    const hasSentimentData = sentiment.hasData;
    const hasNewsData = news.hasNews;
    const hasMacroData = macro.hasData;

    // Scores de cada factor (-100 a +100)
    const trendScore = hasHistoricalData ? this.calculateTrendScore(historical.change30d, historical.change90d) : 0;
    const technicalScore = hasTechnicalData ? technical.technicalScore : 0;
    const sentimentScore = hasSentimentData ? sentiment.overallScore : 0;
    const newsScore = hasNewsData ? news.sentimentScore : 0;
    const macroScore = hasMacroData ? macro.macroScore : 0;

    logger.info(`[PredictionCalc] Scores: trend=${trendScore}, technical=${technicalScore}, sentiment=${sentimentScore}, news=${newsScore}, macro=${macroScore}`);

    // Obtener pesos (aprendidos o por defecto)
    type WeightsType = { trend: number; technical: number; sentiment: number; news: number; macro: number };
    const timeframeKey = timeframeDays <= 1 ? 'intraday' : timeframeDays <= 7 ? 'swing' : 'long';
    let weights: WeightsType = DEFAULT_WEIGHTS[timeframeKey];
    let usingLearnedWeights = false;

    try {
      const learnedWeights = await weightsRepository.getCurrent();
      if (learnedWeights?.weights?.[timeframeKey]) {
        const learned = learnedWeights.weights[timeframeKey] as WeightsType;
        if (learned.trend !== undefined && learned.technical !== undefined) {
          weights = learned;
          usingLearnedWeights = true;
          logger.info(`[PredictionCalc] Using learned weights (${learnedWeights.trainingSamples} samples)`);
        }
      }
    } catch (e) {
      // Usar pesos por defecto
    }

    // Definir factores
    const factors = [
      { name: 'trend', score: trendScore, hasData: hasHistoricalData, weight: weights.trend },
      { name: 'technical', score: technicalScore, hasData: hasTechnicalData, weight: weights.technical },
      { name: 'sentiment', score: sentimentScore, hasData: hasSentimentData, weight: weights.sentiment },
      { name: 'news', score: newsScore, hasData: hasNewsData, weight: weights.news },
      { name: 'macro', score: macroScore, hasData: hasMacroData, weight: weights.macro },
    ];

    const availableFactors = factors.filter(f => f.hasData);
    
    // Calcular score combinado (redistribuyendo pesos)
    let combinedScore = 0;
    if (availableFactors.length > 0) {
      const totalWeight = availableFactors.reduce((sum, f) => sum + f.weight, 0);
      combinedScore = availableFactors.reduce((sum, f) => {
        const normalizedWeight = f.weight / totalWeight;
        return sum + (f.score * normalizedWeight);
      }, 0);
    }

    logger.info(`[PredictionCalc] Combined score: ${combinedScore.toFixed(1)}`);

    // Determinar dirección
    let direction: 'up' | 'down' | 'neutral' = 'neutral';
    if (combinedScore > 10) direction = 'up';
    else if (combinedScore < -10) direction = 'down';

    // Detectar grupo de activo y calcular confianza
    const assetGroup = this.detectAssetGroup(symbol, type);
    const groupConfig = ASSET_GROUP_CONFIGS[assetGroup];
    const { confidence, signalSummary, confidenceExplanation } = this.calculateConfidence(
      factors, availableFactors, groupConfig
    );

    // Calcular precio objetivo
    const volatility = historical.volatility || 20;
    const dailyVol = volatility / Math.sqrt(252);
    const periodVol = dailyVol * Math.sqrt(timeframeDays);
    
    // Cambio esperado basado en score y volatilidad
    const expectedChange = (combinedScore / 100) * periodVol * (confidence / 100);
    const margin = periodVol * 0.5;

    const predictedPriceMin = currentPrice * (1 + (expectedChange - margin) / 100);
    const predictedPriceMax = currentPrice * (1 + (expectedChange + margin) / 100);

    // Timeframe string
    const timeframeStr = timeframeDays <= 1 ? '1 día' : 
                        timeframeDays <= 7 ? `${timeframeDays} días` : 
                        `${Math.round(timeframeDays / 7)} semanas`;

    return {
      asset: quote?.name || symbol,
      symbol,
      assetType: this.inferAssetType(symbol, type),
      currentPrice,
      currency,
      predictedPriceMin,
      predictedPriceMax,
      predictedChange: expectedChange,
      direction,
      confidence,
      factorBreakdown: {
        assetGroup,
        assetGroupDescription: groupConfig.description,
        relevantFactors: groupConfig.relevantFactors,
        availableFactors: factors.map(f => ({ name: f.name, score: Math.round(f.score), hasData: f.hasData })),
        weightsUsed: weights,
        usingLearnedWeights,
        confidenceExplanation,
        signalSummary,
      },
      sentiment: {
        score: sentimentScore,
        source: sentiment.hasData ? 'VIX/FearGreed' : 'Sin datos',
        hasData: hasSentimentData,
        vix: sentiment.vix ? { 
          value: sentiment.vix.value, 
          sentiment: sentiment.vix.sentiment, 
          score: sentiment.vix.score 
        } : undefined,
        overallScore: sentiment.overallScore,
      },
      historical,
      technical: hasTechnicalData ? technical : undefined,
      news: hasNewsData ? news : undefined,
      macro: hasMacroData ? macro : undefined,
      timeframe: timeframeStr,
      calculatedAt: new Date(),
      audit: {
        dataSources: [
          ...(hasHistoricalData ? [{ name: 'Yahoo Finance (Historical)', url: `https://finance.yahoo.com/quote/${symbol}/history`, fetchedAt: new Date() }] : []),
          ...(hasTechnicalData ? [{ name: 'Technical Analysis', url: `https://finance.yahoo.com/quote/${symbol}/chart`, fetchedAt: new Date() }] : []),
          ...(hasSentimentData ? [{ name: 'Sentiment (VIX/FearGreed)', url: 'https://edition.cnn.com/markets/fear-and-greed', fetchedAt: new Date() }] : []),
          ...(hasNewsData ? [{ name: 'Yahoo Finance (News)', url: `https://finance.yahoo.com/quote/${symbol}/news`, fetchedAt: new Date() }] : []),
          ...(hasMacroData ? [{ name: 'Macro Indicators', url: 'https://tradingeconomics.com/', fetchedAt: new Date() }] : []),
        ],
        calculationSteps: [
          { step: 'Score combinado', formula: `${availableFactors.map(f => `${f.name}(${f.score.toFixed(0)})`).join(' + ')} / ${availableFactors.length}`, result: combinedScore },
          { step: 'Volatilidad diaria', formula: `${volatility.toFixed(1)}% / √252`, result: dailyVol },
          { step: 'Volatilidad período', formula: `${dailyVol.toFixed(2)}% × √${timeframeDays}`, result: periodVol },
          { step: 'Cambio esperado', formula: `(${combinedScore.toFixed(1)}/100) × ${periodVol.toFixed(2)}% × (${confidence}/100)`, result: expectedChange },
        ],
        combinedScoreBreakdown: `Score: ${combinedScore.toFixed(1)} = ${availableFactors.map(f => `${f.name}(${f.score.toFixed(0)})`).join(' + ')}`,
        expectedChangeBreakdown: `Precio objetivo = ${currentPrice.toFixed(2)} × (1 + ${expectedChange.toFixed(2)}%) = ${(currentPrice * (1 + expectedChange / 100)).toFixed(2)} ${currency}`,
      },
    };
  },

  /**
   * Calcula score de tendencia histórica
   */
  calculateTrendScore(change30d: number, change90d: number): number {
    // Combinar tendencias de corto y largo plazo
    const shortTermScore = Math.max(-100, Math.min(100, change30d * 3));
    const longTermScore = Math.max(-100, Math.min(100, change90d));
    return (shortTermScore * 0.7 + longTermScore * 0.3);
  },

  /**
   * Detecta el grupo del activo
   */
  detectAssetGroup(symbol: string, type: 'stock' | 'crypto'): AssetGroup {
    if (SYMBOL_TO_GROUP[symbol]) {
      return SYMBOL_TO_GROUP[symbol];
    }

    if (type === 'crypto') {
      const majorCryptos = ['BTC', 'ETH', 'BNB'];
      const base = symbol.replace('-USD', '').replace('-EUR', '');
      return majorCryptos.includes(base) ? 'crypto_major' : 'crypto_alt';
    }

    if (symbol.startsWith('^')) return 'etf_index';
    if (symbol.endsWith('=F')) return 'commodity';

    return 'default';
  },

  /**
   * Calcula la confianza de la predicción
   */
  calculateConfidence(
    allFactors: any[],
    availableFactors: any[],
    groupConfig: AssetGroupConfig
  ): { confidence: number; signalSummary: 'coherent_bullish' | 'coherent_bearish' | 'mixed' | 'neutral' | 'insufficient'; confidenceExplanation: string } {
    if (availableFactors.length === 0) {
      return {
        confidence: 20,
        signalSummary: 'insufficient',
        confidenceExplanation: 'Sin datos suficientes para hacer una predicción fiable.',
      };
    }

    // Calcular coherencia de señales
    const positiveFactors = availableFactors.filter(f => f.score > 15);
    const negativeFactors = availableFactors.filter(f => f.score < -15);
    
    let signalSummary: 'coherent_bullish' | 'coherent_bearish' | 'mixed' | 'neutral' | 'insufficient';
    let signalCoherence = 50;

    if (positiveFactors.length > 0 && negativeFactors.length > 0) {
      signalSummary = 'mixed';
      signalCoherence = 40;
    } else if (positiveFactors.length === availableFactors.length && positiveFactors.length >= 2) {
      signalSummary = 'coherent_bullish';
      signalCoherence = 75;
    } else if (negativeFactors.length === availableFactors.length && negativeFactors.length >= 2) {
      signalSummary = 'coherent_bearish';
      signalCoherence = 75;
    } else if (positiveFactors.length > 0 || negativeFactors.length > 0) {
      signalSummary = availableFactors.length === 1 ? 'neutral' : 'mixed';
      signalCoherence = 55;
    } else {
      signalSummary = 'neutral';
      signalCoherence = 45;
    }

    // Ajustar por cantidad de factores
    let confidence = signalCoherence;
    if (availableFactors.length < groupConfig.minFactorsForHighConfidence) {
      confidence *= 0.85;
    }
    if (availableFactors.length >= 4) {
      confidence += 5;
    }

    confidence = Math.max(20, Math.min(85, Math.round(confidence)));

    // Generar explicación
    let confidenceExplanation = '';
    if (signalSummary === 'coherent_bullish') {
      confidenceExplanation = `${positiveFactors.length} factores coinciden en señal alcista: ${positiveFactors.map(f => f.name).join(', ')}.`;
    } else if (signalSummary === 'coherent_bearish') {
      confidenceExplanation = `${negativeFactors.length} factores coinciden en señal bajista: ${negativeFactors.map(f => f.name).join(', ')}.`;
    } else if (signalSummary === 'mixed') {
      confidenceExplanation = `Señales mixtas: ${positiveFactors.map(f => f.name).join(', ')} alcistas vs ${negativeFactors.map(f => f.name).join(', ')} bajistas.`;
    } else {
      confidenceExplanation = 'Señales mayormente neutrales.';
    }

    return { confidence, signalSummary, confidenceExplanation };
  },

  /**
   * Infiere el tipo de activo
   */
  inferAssetType(symbol: string, type: 'stock' | 'crypto'): CalculatedPrediction['assetType'] {
    if (type === 'crypto') return 'crypto';
    if (symbol.startsWith('^')) return 'index';
    if (symbol.endsWith('=F')) return 'commodity';
    if (symbol.includes('=X')) return 'forex';
    return 'stock';
  },

  /**
   * Guarda una predicción en la base de datos
   */
  async savePrediction(prediction: CalculatedPrediction): Promise<{ id: string }> {
    const result = await predictionRepository.create({
      symbol: prediction.symbol,
      asset: prediction.asset,
      assetType: prediction.assetType,
      direction: prediction.direction,
      confidence: prediction.confidence,
      timeframe: prediction.timeframe,
      predictedChange: prediction.predictedChange,
      currentPrice: prediction.currentPrice,
      predictedPriceMin: prediction.predictedPriceMin,
      predictedPriceMax: prediction.predictedPriceMax,
      currency: prediction.currency,
      factorBreakdown: prediction.factorBreakdown,
      sentiment: prediction.sentiment,
      historical: prediction.historical,
      technical: prediction.technical,
      news: prediction.news,
      macro: prediction.macro,
    });

    return { id: result.id };
  },
};

// Variable auxiliar para el asset name
let quote: any = null;
