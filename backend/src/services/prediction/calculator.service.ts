/**
 * Prediction Calculator Service
 * Calcula predicciones de forma DETERMINÍSTICA basándose en datos reales
 * Migrado completamente del frontend
 * 
 * SELECCIÓN DINÁMICA DE MODELOS:
 * El sistema usa diferentes modelos según los datos disponibles:
 * - Si hay datos fundamentales → activa modelo fundamental
 * - Si hay datos de sentiment/news → activa modelo sentiment_driven
 * - Si solo hay datos técnicos → usa modelos momentum/mean_reversion
 */

import { logger } from '../../middleware/logger.js';
import { predictionRepository, PredictionType } from '../../repositories/prediction.repository.js';
import { weightsRepository } from '../../repositories/weights.repository.js';
import { broadMarketContextService } from '../external/broad-market-context.service.js';
import { CalendarEffectsAnalysis, calendarEffectsService } from '../external/calendar-effects.service.js';
import { CompetitorAnalysis, competitorsService } from '../external/competitors.service.js';
import { AssetEvents, eventsService } from '../external/events.service.js';
import { ExpectationsData, expectationsService } from '../external/expectations.service.js';
import { FinancialsData, financialsService } from '../external/financials.service.js';
import { ForexImpact, forexService } from '../external/forex.service.js';
import { InstitutionalData, institutionalService } from '../external/institutional.service.js';
import { MacroIndicators, macroService } from '../external/macro.service.js';
import { marketPsychologyService, MarketPsychologyAnalysis } from '../external/market-psychology.service.js';
import { newsService, NewsSummary } from '../external/news.service.js';
import { PreciousMetalsAnalysis, preciousMetalsUSDService } from '../external/precious-metals-usd.service.js';
import { SeasonalityAnalysis, seasonalityService } from '../external/seasonality.service.js';
import { SentimentData, sentimentService } from '../external/sentiment.service.js';
import { TechnicalAnalysis, technicalService } from '../external/technical.service.js';
import { trendsService } from '../external/trends.service.js';
import { yahooService } from '../external/yahoo.service.js';
import { classifierLearningService } from '../ml/classifier-learning.service.js';
import {
  factorCorrelationService,
  probabilisticModelService,
  reinforcementLearningService,
} from '../ml/index.js';
import { assetAdjustmentService } from './asset-adjustment.service.js';
import { DataAvailability, ensembleService } from './ensemble.service.js';
import { trackRecordService } from './track-record.service.js';

// ============================================================================
// TIPOS
// ============================================================================

export interface CalculatedPrediction {
  asset: string;
  symbol: string;
  assetType: 'stock' | 'crypto' | 'forex' | 'commodity' | 'index' | 'other';
  currentPrice: number;
  currency: string;
  predictionType?: PredictionType; // 'close' o 'open_next_day'
  
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
    assetAdjustmentApplied?: boolean;
    trackRecordAdjustment?: number;
    correlationAdjustment?: number;
    streakAdjustment?: { days: number; direction: string; adjustment: number };
    // Información de selección dinámica de modelos
    activeModels?: string[];
    modelSelectionReason?: string;
    dataAvailability?: DataAvailability;
  };
  
  // Modelo probabilístico
  probabilistic?: {
    mean: number;
    stdDev: number;
    confidenceIntervals: {
      ci50: { lower: number; upper: number };
      ci80: { lower: number; upper: number };
      ci95: { lower: number; upper: number };
    };
    probabilities: {
      up: number;
      down: number;
      neutral: number;
    };
    skewness: number;
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
  
  // Eventos importantes (earnings, dividendos, splits)
  events?: {
    hasData: boolean;
    warnings: string[];
    eventRiskScore: number;
    nextEarnings?: {
      date: Date;
      daysUntil: number;
      isEstimate: boolean;
      epsEstimate?: number;
    };
    dividend?: {
      yield?: number;
      exDate?: Date;
      daysUntilEx?: number;
      amount?: number;
    };
    nextSplit?: {
      date: Date;
      ratio: string;
      daysUntil: number;
    };
  };
  
  timeframe: string;
  calculatedAt: Date;
  
  // Contexto de mercado global
  marketContext?: {
    condition: string;
    severity: string;
    predictionBias: number;
    confidenceMultiplier: number;
    signals: string[];
    reasoning: string;
    recommendation: string;
    applied: boolean;
  };
  
  // Análisis de correlación USD para metales preciosos
  preciousMetalsAnalysis?: {
    metalType: 'gold' | 'silver' | 'platinum' | 'palladium' | 'other' | null;
    usdTrend: 'strengthening' | 'weakening' | 'stable';
    usdSeverity: 'extreme' | 'strong' | 'moderate' | 'mild';
    dxyChange5d: number;
    impactScore: number;
    predictionBias: number;
    signals: string[];
    reasoning: string;
  };
  
  // Efectos de calendario (fin de mes, viernes, etc.)
  calendarEffects?: {
    dayOfWeek: string;
    dayOfMonth: number;
    month: string;
    riskLevel: 'extreme' | 'high' | 'moderate' | 'low' | 'none';
    riskScore: number;
    isEndOfMonth: boolean;
    isFriday: boolean;
    isEndOfJanuary: boolean;
    dangerousCombination: boolean;
    signals: string[];
    reasoning: string;
  };
  
  // Psicología del mercado
  marketPsychology?: {
    state: string;
    stateIntensity: number;
    emoji: string;
    title: string;
    description: string;
    advice: string;
    fearGreedIndex: number | null;
    vix: number | null;
    biasesDetected: string[];
    contrarianSignal: boolean;
    signals: string[];
  };
  
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
    relevantFactors: ['trend', 'technical', 'sentiment', 'news', 'macro', 'competitors', 'forex', 'institutional', 'seasonality', 'financials', 'expectations'],
    minFactorsForHighConfidence: 5,
    description: 'Acciones de gran capitalización',
  },
  small_cap_stock: {
    relevantFactors: ['trend', 'technical', 'news', 'competitors', 'seasonality', 'financials'],
    minFactorsForHighConfidence: 3,
    description: 'Acciones pequeñas/medianas',
  },
  crypto_major: {
    relevantFactors: ['trend', 'technical', 'sentiment', 'news', 'macro'],
    minFactorsForHighConfidence: 3,
    description: 'Criptomonedas principales (BTC, ETH)',
  },
  crypto_alt: {
    relevantFactors: ['trend', 'technical', 'sentiment'],
    minFactorsForHighConfidence: 2,
    description: 'Altcoins',
  },
  etf_index: {
    relevantFactors: ['trend', 'technical', 'macro', 'seasonality', 'forex'],
    minFactorsForHighConfidence: 3,
    description: 'ETFs e índices',
  },
  commodity: {
    relevantFactors: ['trend', 'technical', 'macro', 'seasonality', 'forex'],
    minFactorsForHighConfidence: 3,
    description: 'Materias primas',
  },
  reit: {
    relevantFactors: ['trend', 'technical', 'macro', 'financials', 'seasonality'],
    minFactorsForHighConfidence: 3,
    description: 'REITs',
  },
  forex: {
    relevantFactors: ['trend', 'technical', 'macro', 'news'],
    minFactorsForHighConfidence: 3,
    description: 'Pares de divisas',
  },
  adr: {
    relevantFactors: ['trend', 'technical', 'news', 'forex', 'macro', 'competitors', 'financials'],
    minFactorsForHighConfidence: 4,
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
  // Crypto majors
  'BTC-USD': 'crypto_major', 'ETH-USD': 'crypto_major', 'BNB-USD': 'crypto_major',
  // Crypto alts
  'SOL-USD': 'crypto_alt', 'ADA-USD': 'crypto_alt', 'DOGE-USD': 'crypto_alt', 'XRP-USD': 'crypto_alt',
  'AVAX-USD': 'crypto_alt', 'DOT-USD': 'crypto_alt', 'MATIC-USD': 'crypto_alt', 'LINK-USD': 'crypto_alt',
  'SHIB-USD': 'crypto_alt', 'LTC-USD': 'crypto_alt', 'UNI-USD': 'crypto_alt',
  // ETFs e índices
  'SPY': 'etf_index', 'QQQ': 'etf_index', 'VOO': 'etf_index', 'IWM': 'etf_index', 'DIA': 'etf_index',
  'VTI': 'etf_index', 'EEM': 'etf_index', 'EFA': 'etf_index', 'VEA': 'etf_index', 'VWO': 'etf_index',
  '^GSPC': 'etf_index', '^DJI': 'etf_index', '^IXIC': 'etf_index', '^RUT': 'etf_index',
  // Commodities - Futures
  'GC=F': 'commodity', 'CL=F': 'commodity', 'SI=F': 'commodity', 'NG=F': 'commodity',
  'HG=F': 'commodity', 'PL=F': 'commodity', 'PA=F': 'commodity',
  // Commodities - ETFs de materias primas
  'GLD': 'commodity', 'SLV': 'commodity', 'USO': 'commodity', 'UNG': 'commodity',
  'IAU': 'commodity', 'PPLT': 'commodity', 'PALL': 'commodity',
  // Commodities - ETCs físicos (London Stock Exchange)
  'EGLN.L': 'commodity', 'IGLN.L': 'commodity', 'SGLN.L': 'commodity', // iShares Physical Gold
  'SSLN.L': 'commodity', 'ISLN.L': 'commodity', // iShares Physical Silver
  'PHAU.L': 'commodity', 'PHAG.L': 'commodity', 'PHPT.L': 'commodity', 'PHPM.L': 'commodity', // WisdomTree Physical Metals
  'SGBS.L': 'commodity', // Gold Bullion Securities
  // Commodities - ETCs físicos (Borsa Italiana - Milano)
  'NGAS.MI': 'commodity', 'PHAG.MI': 'commodity', 'PHAU.MI': 'commodity', // WisdomTree Physical Metals Italia
  'CRUD.MI': 'commodity', 'OILB.MI': 'commodity', // Petroleo Italia
  // Mineras de oro/plata (se comportan como commodity pero son acciones)
  'NEM': 'commodity', 'GOLD': 'commodity', 'AEM': 'commodity', 'FNV': 'commodity',
  'WPM': 'commodity', 'KGC': 'commodity', 'AGI': 'commodity', 'AG': 'commodity',
  // Large cap tech
  'AAPL': 'large_cap_stock', 'MSFT': 'large_cap_stock', 'GOOGL': 'large_cap_stock', 'GOOG': 'large_cap_stock',
  'AMZN': 'large_cap_stock', 'META': 'large_cap_stock', 'NVDA': 'large_cap_stock',
  'TSLA': 'large_cap_stock', 'NFLX': 'large_cap_stock', 'CRM': 'large_cap_stock', 'ADBE': 'large_cap_stock',
  // Large cap finance
  'JPM': 'large_cap_stock', 'BAC': 'large_cap_stock', 'WFC': 'large_cap_stock', 'GS': 'large_cap_stock',
  'MS': 'large_cap_stock', 'C': 'large_cap_stock', 'V': 'large_cap_stock', 'MA': 'large_cap_stock',
  // Large cap otras
  'JNJ': 'large_cap_stock', 'PG': 'large_cap_stock', 'KO': 'large_cap_stock', 'PEP': 'large_cap_stock',
  'WMT': 'large_cap_stock', 'HD': 'large_cap_stock', 'DIS': 'large_cap_stock', 'VZ': 'large_cap_stock',
  // Europa
  'ITX.MC': 'large_cap_stock', 'SAN.MC': 'large_cap_stock', 'BBVA.MC': 'large_cap_stock',
  'IBE.MC': 'large_cap_stock', 'TEF.MC': 'large_cap_stock', 'REP.MC': 'large_cap_stock',
  // ADRs
  'BABA': 'adr', 'TSM': 'adr', 'NIO': 'adr', 'PDD': 'adr', 'JD': 'adr',
  'ASML': 'adr', 'TM': 'adr', 'SNY': 'adr',
  // REITs
  'O': 'reit', 'AMT': 'reit', 'PLD': 'reit', 'EQIX': 'reit', 'SPG': 'reit',
  'VNQ': 'reit', 'SCHH': 'reit',
  // Forex
  'EURUSD=X': 'forex', 'GBPUSD=X': 'forex', 'USDJPY=X': 'forex', 'USDCHF=X': 'forex',
};

// Pesos por defecto según timeframe (11 factores)
const DEFAULT_WEIGHTS = {
  intraday: {
    trend: 0.20, technical: 0.25, sentiment: 0.15, news: 0.16,
    macro: 0.04, competitors: 0.04, forex: 0.04, institutional: 0.05,
    seasonality: 0.04, financials: 0.02, expectations: 0.01
  },
  swing: {
    trend: 0.12, technical: 0.18, sentiment: 0.10, news: 0.15,
    macro: 0.08, competitors: 0.07, forex: 0.06, institutional: 0.10,
    seasonality: 0.04, financials: 0.05, expectations: 0.05
  },
  long: {
    trend: 0.05, technical: 0.10, sentiment: 0.04, news: 0.07,
    macro: 0.12, competitors: 0.10, forex: 0.08, institutional: 0.12,
    seasonality: 0.08, financials: 0.12, expectations: 0.12
  },
};

// --- MULTIPLICADORES DE PESO POR GRUPO DE ACTIVO ---
// Diferentes tipos de activos requieren diferentes combinaciones de factores
const ASSET_GROUP_WEIGHT_MULTIPLIERS: Record<AssetGroup, Record<string, number>> = {
  large_cap_stock: {
    // Acciones grandes: balance de todos los factores, énfasis en institucional y financials
    trend: 1.0, technical: 1.0, sentiment: 0.9, news: 1.0,
    macro: 1.1, competitors: 1.2, forex: 0.8, institutional: 1.4,
    seasonality: 1.0, financials: 1.3, expectations: 1.2
  },
  small_cap_stock: {
    // Small caps: más técnico/momentum, menos institucional (poco volumen)
    trend: 1.3, technical: 1.4, sentiment: 1.2, news: 1.3,
    macro: 0.7, competitors: 1.0, forex: 0.5, institutional: 0.5,
    seasonality: 0.9, financials: 1.1, expectations: 0.8
  },
  crypto_major: {
    // Bitcoin/Ethereum: técnico + sentiment + macro (correlación con risk-on/off)
    trend: 1.3, technical: 1.4, sentiment: 1.5, news: 1.2,
    macro: 1.2, competitors: 0.3, forex: 0.8, institutional: 1.0,
    seasonality: 0.5, financials: 0.1, expectations: 0.3
  },
  crypto_alt: {
    // Altcoins: muy técnico + sentiment, casi nada de fundamentales
    trend: 1.5, technical: 1.6, sentiment: 1.8, news: 1.0,
    macro: 0.5, competitors: 0.2, forex: 0.3, institutional: 0.3,
    seasonality: 0.4, financials: 0.1, expectations: 0.2
  },
  etf_index: {
    // ETFs/Índices: macro domina, poco técnico individual
    trend: 0.8, technical: 0.7, sentiment: 0.9, news: 0.8,
    macro: 1.5, competitors: 0.4, forex: 1.2, institutional: 1.3,
    seasonality: 1.3, financials: 0.3, expectations: 0.5
  },
  commodity: {
    // Materias primas: macro + forex + seasonality dominan
    trend: 1.0, technical: 1.1, sentiment: 0.7, news: 0.9,
    macro: 1.6, competitors: 0.2, forex: 1.5, institutional: 0.8,
    seasonality: 1.4, financials: 0.1, expectations: 0.3
  },
  reit: {
    // REITs: macro (tasas de interés) + financials
    trend: 0.9, technical: 0.8, sentiment: 0.6, news: 0.8,
    macro: 1.6, competitors: 0.9, forex: 0.5, institutional: 1.2,
    seasonality: 1.0, financials: 1.5, expectations: 1.1
  },
  forex: {
    // Forex: macro absoluto + técnico
    trend: 1.2, technical: 1.4, sentiment: 0.5, news: 1.0,
    macro: 1.8, competitors: 0.1, forex: 0.5, institutional: 0.8,
    seasonality: 0.8, financials: 0.1, expectations: 0.3
  },
  adr: {
    // ADRs: mezcla de factores + forex importante
    trend: 1.0, technical: 1.0, sentiment: 0.9, news: 1.1,
    macro: 1.1, competitors: 1.0, forex: 1.4, institutional: 1.0,
    seasonality: 0.9, financials: 1.2, expectations: 1.0
  },
  default: {
    // Sin ajuste
    trend: 1.0, technical: 1.0, sentiment: 1.0, news: 1.0,
    macro: 1.0, competitors: 1.0, forex: 1.0, institutional: 1.0,
    seasonality: 1.0, financials: 1.0, expectations: 1.0
  }
};

// --- AJUSTE DE PESOS POR GRUPO DE ACTIVO ---
// Ahora usa multiplicadores APRENDIDOS del classifierLearningService
function adjustWeightsForAssetGroup(
  baseWeights: Record<string, number>,
  assetGroup: AssetGroup
): Record<string, number> {
  // Obtener multiplicadores aprendidos (o estáticos si no hay aprendidos)
  const learnedMultipliers = classifierLearningService.getMultipliers(assetGroup);
  const multipliers = (learnedMultipliers as unknown as Record<string, number> | null) || ASSET_GROUP_WEIGHT_MULTIPLIERS[assetGroup] || ASSET_GROUP_WEIGHT_MULTIPLIERS.default;
  
  const adjustedWeights: Record<string, number> = {};
  let totalAdjusted = 0;
  
  for (const [factor, weight] of Object.entries(baseWeights)) {
    const multiplier = multipliers[factor] || 1.0;
    adjustedWeights[factor] = weight * multiplier;
    totalAdjusted += adjustedWeights[factor];
  }
  
  // Normalizar para que sumen 1
  for (const factor of Object.keys(adjustedWeights)) {
    adjustedWeights[factor] = adjustedWeights[factor] / totalAdjusted;
  }
  
  return adjustedWeights;
}

// --- AJUSTE DE PESOS POR VOLATILIDAD DEL ACTIVO (como en original 5c77276) ---
function adjustWeightsForVolatility(
  baseWeights: Record<string, number>, 
  assetVolatility: number
): Record<string, number> {
  let volatilityMultiplier: Record<string, number>;
  
  if (assetVolatility < 20) {
    // Baja volatilidad: priorizar fundamentales
    volatilityMultiplier = {
      trend: 0.8, technical: 0.7, sentiment: 0.6, news: 0.8,
      macro: 1.3, competitors: 1.2, forex: 1.1, institutional: 1.4,
      seasonality: 1.2, financials: 1.5, expectations: 1.5
    };
    logger.debug(`[PredictionCalc] Low volatility (${assetVolatility.toFixed(1)}%): prioritizing fundamentals`);
  } else if (assetVolatility < 50) {
    // Volatilidad media: sin ajuste
    volatilityMultiplier = {
      trend: 1.0, technical: 1.0, sentiment: 1.0, news: 1.0,
      macro: 1.0, competitors: 1.0, forex: 1.0, institutional: 1.0,
      seasonality: 1.0, financials: 1.0, expectations: 1.0
    };
  } else {
    // Alta volatilidad: priorizar técnico/momentum/sentiment
    volatilityMultiplier = {
      trend: 1.4, technical: 1.5, sentiment: 1.4, news: 1.3,
      macro: 0.7, competitors: 0.8, forex: 0.9, institutional: 0.8,
      seasonality: 0.6, financials: 0.5, expectations: 0.5
    };
    logger.debug(`[PredictionCalc] High volatility (${assetVolatility.toFixed(1)}%): prioritizing technical/sentiment`);
  }
  
  // Aplicar multiplicadores y renormalizar
  const adjustedWeights: Record<string, number> = {};
  let totalAdjusted = 0;
  
  for (const [factor, weight] of Object.entries(baseWeights)) {
    const multiplier = volatilityMultiplier[factor] || 1.0;
    adjustedWeights[factor] = weight * multiplier;
    totalAdjusted += adjustedWeights[factor];
  }
  
  // Normalizar para que sumen 1
  for (const factor of Object.keys(adjustedWeights)) {
    adjustedWeights[factor] = adjustedWeights[factor] / totalAdjusted;
  }
  
  return adjustedWeights;
}

// ============================================================================
// SERVICIO PRINCIPAL
// ============================================================================

export const predictionCalculatorService = {
  /**
   * Calcula una predicción completa para un símbolo
   * DETERMINÍSTICO: usa previousClose para que la predicción sea estable durante el día
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

      // 2. Obtener datos históricos (necesarios para determinar precio base correcto)
      const history = await yahooService.getHistory(symbol, '3mo', '1d');
      const historical = this.processHistoricalData(history);

      // IMPORTANTE: Usar el último precio de cierre del historial como base
      // previousClose de Yahoo puede ser incorrecto para futuros/commodities
      // El historial siempre tiene los cierres correctos de cada día
      let basePrice: number;
      if (history.length > 0) {
        const lastHistoricalClose = history[history.length - 1].close;
        basePrice = lastHistoricalClose;
        logger.info(`[PredictionCalc] Using last historical close (${basePrice}) as base price. Quote price: ${quote.price}, previousClose: ${quote.previousClose}`);
      } else {
        // Fallback si no hay historial
        basePrice = quote.previousClose || quote.price;
        logger.warn(`[PredictionCalc] No historical data, using previousClose (${basePrice}) as fallback`);
      }

      // 3. Obtener todos los datos en paralelo
      const [
        technical,
        sentiment,
        news,
        macro,
        seasonality,
        expectations,
        institutional,
        forex,
        financials,
        events,
      ] = await Promise.all([
        technicalService.analyze(symbol),
        sentimentService.getSentiment(symbol, type),
        newsService.getNews(symbol, type),
        macroService.getIndicators(symbol, type),
        seasonalityService.analyze(symbol, quote.name), // Ahora es async
        expectationsService.getExpectations(symbol),
        institutionalService.getInstitutionalActivity(symbol, type),
        forexService.analyzeForexImpact(symbol, quote.name),
        financialsService.getFinancials(symbol, quote.price),
        eventsService.getEvents(symbol),
      ]);

      // 4. Obtener análisis de competidores (necesita datos históricos)
      const companyChange1d = historical.change30d ? historical.change30d / 30 : 0;
      const companyChange1w = historical.change30d ? historical.change30d / 4 : 0;
      const companyChange1m = historical.change30d || 0;
      const competitors = await competitorsService.analyzeCompetitors(
        symbol, companyChange1d, companyChange1w, companyChange1m
      );

      // 5. Calcular predicción determinística usando basePrice (previousClose)
      const prediction = await this.calculateFromData(
        symbol,
        type,
        basePrice, // Usar previousClose para estabilidad
        quote.currency || 'USD',
        historical,
        technical,
        sentiment,
        news,
        macro,
        seasonality,
        expectations,
        competitors,
        forex,
        institutional,
        financials,
        events,
        timeframeDays,
        quote.name || symbol, // Pasar el nombre del activo para clasificación inteligente
        quote.changePercent || 0 // Cambio % del día actual (para detectar caídas intradía)
      );

      // --- REINFORCEMENT LEARNING: Obtener recomendación de política ---
      const volatilityCategory = historical.volatility > 50 ? 'high' : historical.volatility > 20 ? 'medium' : 'low';
      const signalStrength = Math.abs(prediction.predictedChange) > 2 ? 'strong' : Math.abs(prediction.predictedChange) > 0.5 ? 'moderate' : 'weak';
      
      const rlState = {
        regime: prediction.predictedChange > 0 ? 'bull' : prediction.predictedChange < 0 ? 'bear' : 'sideways',
        volatility: volatilityCategory,
        timeframe: timeframeDays <= 1 ? 'intraday' : timeframeDays <= 7 ? 'swing' : 'long',
        signalStrength,
        signalCoherence: prediction.factorBreakdown.signalSummary.includes('coherent') ? 'aligned' : 
                         prediction.factorBreakdown.signalSummary === 'mixed' ? 'mixed' : 'conflicting',
        eventProximity: 'none',
        recentPerformance: 'average',
      } as const;
      
      const rlRecommendation = await reinforcementLearningService.getPolicy(rlState);
      
      // Ajustar confianza según recomendación del RL
      if (rlRecommendation.recommendedAction === 'skip' && rlRecommendation.confidence > 0.7) {
        prediction.confidence = Math.max(20, prediction.confidence - 15);
        logger.info(`[PredictionCalc] RL suggests skipping, reducing confidence to ${prediction.confidence}%`);
      } else if (rlRecommendation.recommendedAction === 'predict_high' && rlRecommendation.confidence > 0.6) {
        prediction.confidence = Math.min(95, prediction.confidence + 5);
        logger.info(`[PredictionCalc] RL suggests high confidence prediction (+5%)`);
      }

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
    seasonality: SeasonalityAnalysis,
    expectations: ExpectationsData | null,
    competitors: CompetitorAnalysis,
    forex: ForexImpact,
    institutional: InstitutionalData,
    financials: FinancialsData | null,
    events: AssetEvents,
    timeframeDays: number,
    assetName: string = '', // Nombre del activo para clasificación inteligente
    intradayChange: number = 0 // Cambio % intradía para detectar caídas extremas
  ): Promise<CalculatedPrediction> {
    // FLAGS de datos disponibles
    const hasHistoricalData = historical.hasData && (historical.change30d !== 0 || historical.change90d !== 0);
    const hasTechnicalData = technical.hasData;
    const hasSentimentData = sentiment.hasData;
    const hasNewsData = news.hasNews;
    const hasMacroData = macro.hasData;
    const hasSeasonalityData = seasonality.hasData;
    const hasExpectationsData = expectations?.hasData || false;
    const hasCompetitorsData = competitors.hasData;
    const hasForexData = forex.hasData;
    const hasInstitutionalData = institutional.hasData;
    const hasFinancialsData = financials?.hasData || false;

    // Objeto de disponibilidad de datos para el ensemble
    const dataAvailability: DataAvailability = {
      trend: hasHistoricalData,
      technical: hasTechnicalData,
      sentiment: hasSentimentData,
      news: hasNewsData,
      macro: hasMacroData,
      competitors: hasCompetitorsData,
      forex: hasForexData,
      institutional: hasInstitutionalData,
      seasonality: hasSeasonalityData,
      financials: hasFinancialsData,
      expectations: hasExpectationsData,
    };

    // Log de disponibilidad de datos
    const availableCount = Object.values(dataAvailability).filter(Boolean).length;
    logger.info(`[PredictionCalc] Data availability: ${availableCount}/11 factors`);

    // Scores de cada factor (-100 a +100)
    const trendScore = hasHistoricalData ? this.calculateTrendScore(historical.change30d, historical.change90d) : 0;
    const technicalScore = hasTechnicalData ? technical.technicalScore : 0;
    const sentimentScore = hasSentimentData ? sentiment.overallScore : 0;
    const newsScore = hasNewsData ? news.sentimentScore : 0;
    const macroScore = hasMacroData ? macro.macroScore : 0;
    
    // MEJORA: Ajustar estacionalidad según fiabilidad de datos
    // Si la fiabilidad es 'unreliable', no usar el factor
    // Si es 'low', reducir el peso efectivo
    const seasonalityReliability = seasonality.dataReliability || 'medium';
    const effectiveSeasonalityScore = seasonalityReliability === 'unreliable' 
      ? 0 
      : seasonalityReliability === 'low' 
        ? seasonality.seasonalScore * 0.5 
        : seasonality.seasonalScore;
    const effectiveHasSeasonality = hasSeasonalityData && seasonalityReliability !== 'unreliable';
    const seasonalityScore = effectiveHasSeasonality ? effectiveSeasonalityScore : 0;
    
    if (seasonality.structuralBreakDetected) {
      logger.info(`[PredictionCalc] Seasonality: structural break detected for ${symbol}, reliability=${seasonalityReliability}`);
    }
    
    const expectationsScore = hasExpectationsData ? expectations!.expectationsScore : 0;
    const competitorsScore = hasCompetitorsData ? competitors.competitorScore : 0;
    const forexScore = hasForexData ? forex.forexScore : 0;
    const institutionalScore = hasInstitutionalData ? institutional.institutionalScore : 0;
    const financialsScore = hasFinancialsData ? financials!.financialsScore : 0;

    logger.info(`[PredictionCalc] Scores: trend=${trendScore}, technical=${technicalScore}, sentiment=${sentimentScore}, news=${newsScore}, macro=${macroScore}, seasonality=${seasonalityScore}, expectations=${expectationsScore}, competitors=${competitorsScore}, forex=${forexScore}, institutional=${institutionalScore}, financials=${financialsScore}`);

    // Obtener pesos (aprendidos o por defecto)
    type WeightsType = { trend: number; technical: number; sentiment: number; news: number; macro: number };
    const timeframeKey = timeframeDays <= 1 ? 'intraday' : timeframeDays <= 7 ? 'swing' : 'long';
    let baseWeights = DEFAULT_WEIGHTS[timeframeKey];
    let usingLearnedWeights = false;

    try {
      const learnedWeights = await weightsRepository.getCurrent();
      if (learnedWeights?.weights?.[timeframeKey]) {
        const learned = learnedWeights.weights[timeframeKey];
        if (learned.trend !== undefined && learned.technical !== undefined) {
          baseWeights = { ...baseWeights, ...learned };
          usingLearnedWeights = true;
          logger.info(`[PredictionCalc] Using learned weights (${learnedWeights.trainingSamples} samples)`);
        }
      }
    } catch (e) {
      // Usar pesos por defecto
    }

    // Detectar grupo del activo ANTES de ajustar pesos (usa nombre para detección inteligente)
    const assetGroup = this.detectAssetGroup(symbol, type, assetName);
    logger.info(`[PredictionCalc] Asset group: ${assetGroup} (${ASSET_GROUP_CONFIGS[assetGroup].description}) - Name: "${assetName}"`);

    // Paso 1: Ajustar pesos según GRUPO del activo
    const groupAdjustedWeights = adjustWeightsForAssetGroup(baseWeights, assetGroup);
    
    // Paso 2: Ajustar pesos según VOLATILIDAD del activo
    const assetVolatility = historical.volatility || 20;
    const weights = adjustWeightsForVolatility(groupAdjustedWeights, assetVolatility);
    
    logger.debug(`[PredictionCalc] Weights: group=${assetGroup}, volatility=${assetVolatility.toFixed(1)}%`);

    // Definir los 11 factores
    // NOTA: seasonality usa effectiveHasSeasonality que considera la fiabilidad de datos
    const factors = [
      { name: 'trend', score: trendScore, hasData: hasHistoricalData, weight: weights.trend },
      { name: 'technical', score: technicalScore, hasData: hasTechnicalData, weight: weights.technical },
      { name: 'sentiment', score: sentimentScore, hasData: hasSentimentData, weight: weights.sentiment },
      { name: 'news', score: newsScore, hasData: hasNewsData, weight: weights.news },
      { name: 'macro', score: macroScore, hasData: hasMacroData, weight: weights.macro },
      { name: 'competitors', score: competitorsScore, hasData: hasCompetitorsData, weight: weights.competitors },
      { name: 'forex', score: forexScore, hasData: hasForexData, weight: weights.forex },
      { name: 'institutional', score: institutionalScore, hasData: hasInstitutionalData, weight: weights.institutional },
      { name: 'seasonality', score: seasonalityScore, hasData: effectiveHasSeasonality, weight: weights.seasonality },
      { name: 'financials', score: financialsScore, hasData: hasFinancialsData, weight: weights.financials },
      { name: 'expectations', score: expectationsScore, hasData: hasExpectationsData, weight: weights.expectations },
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

    // --- ENSEMBLE: Selección dinámica de modelos según datos disponibles ---
    const factorScoresForEnsemble: Record<string, number> = {};
    factors.forEach(f => { factorScoresForEnsemble[f.name] = f.score; });
    
    const timeframeKeyEnsemble = timeframeDays <= 1 ? 'intraday' : timeframeDays <= 7 ? 'swing' : 'long';
    const regimeIndicators = {
      vix: sentiment.vix?.value,
      trend: trendScore,
      volatility: historical.volatility,
    };
    
    const ensembleResult = await ensembleService.predict(
      symbol,
      timeframeKeyEnsemble as 'intraday' | 'swing' | 'long',
      factorScoresForEnsemble,
      dataAvailability,
      regimeIndicators
    );
    
    logger.info(`[PredictionCalc] Ensemble: ${ensembleResult.activeModels.length} active models (${ensembleResult.activeModels.join(', ')})`);
    logger.info(`[PredictionCalc] Ensemble dominant model: ${ensembleResult.dominantModel}, agreement: ${ensembleResult.agreementLevel}`);

    logger.info(`[PredictionCalc] Combined score: ${combinedScore.toFixed(1)} (${availableFactors.length}/${factors.length} factors)`);

    // Determinar dirección (umbral ±5 como en original)
    let direction: 'up' | 'down' | 'neutral' = 'neutral';
    if (combinedScore > 5) direction = 'up';
    else if (combinedScore < -5) direction = 'down';

    // Calcular confianza (assetGroup ya detectado arriba)
    const groupConfig = ASSET_GROUP_CONFIGS[assetGroup];
    const { confidence, signalSummary, confidenceExplanation } = this.calculateConfidence(
      factors, availableFactors, groupConfig
    );

    // Calcular precio objetivo
    const volatility = historical.volatility || 20;
    const dailyVol = volatility / Math.sqrt(252);
    const periodVol = dailyVol * Math.sqrt(timeframeDays);
    
    // --- SCALE FACTOR DINÁMICO (como en original 5c77276) ---
    // Más agresivo cuando señales coherentes, conservador cuando hay contradicción
    // AJUSTADO: Menos conservador para evitar predicciones en zona neutral
    let scaleFactor: number;
    if (confidence >= 75) {
      scaleFactor = 3.0; // Señales muy coherentes - agresivo
    } else if (confidence >= 65) {
      scaleFactor = 2.5; // Señales coherentes - moderado-alto
    } else if (confidence >= 55) {
      scaleFactor = 2.0; // Señales mixtas con dirección
    } else if (confidence >= 45) {
      scaleFactor = 1.5; // Señales contradictorias - moderado
    } else {
      scaleFactor = 1.2; // Muy poca confianza - conservador pero no extremo
    }
    
    const scoreNormalized = combinedScore / 100; // -1 a +1
    let expectedChange = scoreNormalized * periodVol * scaleFactor;
    
    // --- AJUSTE POR TARGET PRICE DE ANALISTAS (para swing/largo plazo) ---
    if (financials?.targetPrice && financials.targetVsCurrent && timeframeDays > 1) {
      const targetInfluence = Math.min(Math.abs(financials.targetVsCurrent) / 100, 0.5);
      const targetDirection = financials.targetVsCurrent > 0 ? 1 : -1;
      const timeframeWeight = Math.min(timeframeDays / 30, 1) * 0.25;
      const targetAdjustment = targetInfluence * (periodVol * timeframeWeight) * targetDirection;
      expectedChange += targetAdjustment;
      logger.info(`[PredictionCalc] Target price adjustment: ${targetAdjustment.toFixed(2)}%`);
    }
    
    // --- LÍMITES DE CAMBIO MÁXIMO (como en original) ---
    const maxChange = Math.min(periodVol * 1.5, timeframeDays <= 1 ? 8 : 15);
    expectedChange = Math.max(-maxChange, Math.min(maxChange, expectedChange));
    
    // --- AJUSTE POR ACTIVO (como en original 5c77276) ---
    // Corrige predicciones para activos problemáticos (TSLA, NVDA, crypto, etc.)
    let finalConfidence = confidence;
    const assetAdjustment = assetAdjustmentService.applyAdjustment(symbol, expectedChange, confidence);
    if (assetAdjustment.wasAdjusted) {
      expectedChange = assetAdjustment.adjustedChange;
      finalConfidence = assetAdjustment.adjustedConfidence;
      logger.info(`[PredictionCalc] Asset adjustment applied for ${symbol}`);
    }
    
    // --- AJUSTE POR TRACK RECORD (nuevo) ---
    // Ajusta confianza basándose en historial de predicciones verificadas
    const trackRecordAdjustment = await trackRecordService.getConfidenceAdjustment(symbol);
    if (trackRecordAdjustment !== 0) {
      finalConfidence = Math.max(20, Math.min(95, finalConfidence + trackRecordAdjustment));
      logger.info(`[PredictionCalc] Track record adjustment for ${symbol}: ${trackRecordAdjustment > 0 ? '+' : ''}${trackRecordAdjustment}% → ${finalConfidence}%`);
    }
    
    // --- AJUSTE POR DIRECCIÓN PREDICHA (basado en datos históricos) ---
    // UP=81%, DOWN=53%, NEUTRAL=44% de acierto histórico
    const directionAdjustment = await trackRecordService.getDirectionAdjustment(direction);
    if (directionAdjustment.confidenceMultiplier !== 1.0) {
      const oldConfidence = finalConfidence;
      finalConfidence = Math.round(Math.max(20, Math.min(95, finalConfidence * directionAdjustment.confidenceMultiplier)));
      logger.info(`[PredictionCalc] Direction adjustment (${direction}): ${oldConfidence}% → ${finalConfidence}%`);
    }
    
    // --- AJUSTE POR VOLATILIDAD EXTREMA (NUEVO) ---
    // Activos con volatilidad >40% son mucho menos predecibles
    // (assetVolatility ya definida arriba en línea ~719)
    if (assetVolatility > 60) {
      const oldConf = finalConfidence;
      finalConfidence = Math.round(finalConfidence * 0.6); // -40% confianza
      logger.info(`[PredictionCalc] Extreme volatility penalty (${assetVolatility.toFixed(0)}%): ${oldConf}% → ${finalConfidence}%`);
    } else if (assetVolatility > 40) {
      const oldConf = finalConfidence;
      finalConfidence = Math.round(finalConfidence * 0.75); // -25% confianza
      logger.info(`[PredictionCalc] High volatility penalty (${assetVolatility.toFixed(0)}%): ${oldConf}% → ${finalConfidence}%`);
    }
    
    // --- AJUSTE POR CAÍDA INTRADÍA EXTREMA (NUEVO) ---
    // Si el activo ha caído >5% hoy, reducir confianza drásticamente
    if (intradayChange < -10) {
      const oldConf = finalConfidence;
      finalConfidence = Math.round(finalConfidence * 0.5); // -50% confianza
      // También ajustar la predicción hacia negativo si predice subida
      if (expectedChange > 0) {
        expectedChange = expectedChange * 0.3; // Reducir predicción alcista
      }
      logger.info(`[PredictionCalc] CRASH INTRADAY (${intradayChange.toFixed(1)}%): conf ${oldConf}% → ${finalConfidence}%, change adjusted`);
    } else if (intradayChange < -5) {
      const oldConf = finalConfidence;
      finalConfidence = Math.round(finalConfidence * 0.65); // -35% confianza
      if (expectedChange > 0) {
        expectedChange = expectedChange * 0.5; // Reducir predicción alcista
      }
      logger.info(`[PredictionCalc] Severe intraday drop (${intradayChange.toFixed(1)}%): conf ${oldConf}% → ${finalConfidence}%`);
    } else if (intradayChange < -3) {
      const oldConf = finalConfidence;
      finalConfidence = Math.round(finalConfidence * 0.85); // -15% confianza
      logger.info(`[PredictionCalc] Significant intraday drop (${intradayChange.toFixed(1)}%): conf ${oldConf}% → ${finalConfidence}%`);
    }
    
    // --- AJUSTE POR CORRELACIÓN DE FACTORES (ML) ---
    // Detecta double-counting y ajusta confianza según coherencia de señales
    const factorScores: Record<string, number> = {};
    factors.forEach(f => { factorScores[f.name] = f.score; });
    const correlationAdjustment = factorCorrelationService.calculateConfidenceAdjustment(factorScores, finalConfidence);
    if (correlationAdjustment.adjustedConfidence !== finalConfidence) {
      const diff = correlationAdjustment.adjustedConfidence - finalConfidence;
      finalConfidence = correlationAdjustment.adjustedConfidence;
      logger.info(`[PredictionCalc] Factor correlation adjustment: ${diff > 0 ? '+' : ''}${diff}% (${correlationAdjustment.reasons.join(', ')})`);
    }
    
    // --- AJUSTE POR RACHA (MEAN REVERSION) ---
    // Si hay racha larga (≥5 días), aumentar probabilidad de reversión
    // Si hay pullback corto (2-3 días) contra tendencia fuerte, ajustar hacia continuación
    let streakAdjustmentInfo: { days: number; direction: string; adjustment: number } | undefined;
    try {
      const trendAnalysis = await trendsService.analyzeTrend(symbol);
      if (trendAnalysis?.currentStreak) {
        const streak = trendAnalysis.currentStreak;
        const momentum = trendAnalysis.momentum;
        
        // Mostrar racha si hay ≥2 días consecutivos
        if (streak.days >= 2 && streak.direction !== 'sideways') {
          let streakAdj = 0;
          
          // Racha larga (≥5 días) → probable reversión
          if (streak.days >= 5) {
            // Si predicción sigue la racha, reducir confianza (posible agotamiento)
            if ((streak.direction === 'up' && expectedChange > 0) ||
                (streak.direction === 'down' && expectedChange < 0)) {
              streakAdj = -0.15 * Math.min(streak.days - 4, 3); // -15% a -45% del cambio
              logger.info(`[PredictionCalc] Streak adjustment: ${streak.days}d ${streak.direction} streak, reducing ${direction} prediction by ${Math.abs(streakAdj * 100).toFixed(0)}%`);
            }
            // Si predicción va contra racha larga, aumentar confianza (reversión probable)
            else if ((streak.direction === 'up' && expectedChange < 0) ||
                     (streak.direction === 'down' && expectedChange > 0)) {
              streakAdj = 0.10 * Math.min(streak.days - 4, 2); // +10% a +20% del cambio
              logger.info(`[PredictionCalc] Streak adjustment: ${streak.days}d ${streak.direction} streak supports reversal prediction`);
            }
          }
          // Racha media (3-4 días) con momentum alineado → probable continuación
          else if (streak.days >= 3 && streak.days < 5 && momentum) {
            if ((streak.direction === 'up' && momentum.signal === 'bullish' && expectedChange > 0) ||
                (streak.direction === 'down' && momentum.signal === 'bearish' && expectedChange < 0)) {
              streakAdj = 0.08; // +8% del cambio
              logger.info(`[PredictionCalc] Streak adjustment: ${streak.days}d ${streak.direction} streak with aligned momentum, boosting prediction`);
            }
            // Pullback corto contra tendencia fuerte → ajustar hacia continuación
            else if ((streak.direction === 'down' && momentum.signal === 'bullish') ||
                     (streak.direction === 'up' && momentum.signal === 'bearish')) {
              // El pullback va contra el momentum general
              if (momentum.strength === 'strong' || momentum.strength === 'moderate') {
                const pullbackAdj = streak.direction === 'down' ? 0.05 : -0.05;
                streakAdj = pullbackAdj;
                logger.info(`[PredictionCalc] Pullback detected: ${streak.days}d ${streak.direction} against ${momentum.signal} momentum`);
              }
            }
          }
          
          // Aplicar ajuste si hay
          if (streakAdj !== 0) {
            const oldChange = expectedChange;
            expectedChange = expectedChange * (1 + streakAdj);
            streakAdjustmentInfo = {
              days: streak.days,
              direction: streak.direction,
              adjustment: Math.round((expectedChange - oldChange) / Math.abs(oldChange) * 100),
            };
          } else {
            // Mostrar racha sin ajuste (informativo)
            streakAdjustmentInfo = {
              days: streak.days,
              direction: streak.direction,
              adjustment: 0,
            };
          }
          
          logger.info(`[PredictionCalc] Current streak: ${streak.days}d ${streak.direction}, adjustment: ${streakAdjustmentInfo.adjustment}%`);
        }
      }
    } catch (e) {
      // Si falla el análisis de tendencia, continuar sin ajuste
      logger.debug(`[PredictionCalc] Could not get streak data: ${(e as Error).message}`);
    }
    
    // --- AJUSTE POR CONTEXTO DE MERCADO GLOBAL (NUEVO) ---
    // Detecta correcciones, crashes, burbujas y ajusta predicciones en consecuencia
    let marketContextInfo: CalculatedPrediction['marketContext'];
    try {
      const marketContext = await broadMarketContextService.getCurrentContext();
      
      if (marketContext.condition !== 'neutral') {
        const contextAdjustment = broadMarketContextService.applyToPredicti(
          expectedChange,
          finalConfidence,
          this.inferAssetType(symbol, type)
        );
        
        if (contextAdjustment.contextApplied) {
          const oldChange = expectedChange;
          const oldConfidence = finalConfidence;
          
          expectedChange = contextAdjustment.adjustedChange;
          finalConfidence = contextAdjustment.adjustedConfidence;
          
          logger.info(`[PredictionCalc] Market context (${marketContext.condition}): change ${oldChange.toFixed(2)}% → ${expectedChange.toFixed(2)}%, confidence ${oldConfidence}% → ${finalConfidence}%`);
          
          marketContextInfo = {
            condition: marketContext.condition,
            severity: marketContext.severity,
            predictionBias: marketContext.predictionBias,
            confidenceMultiplier: marketContext.confidenceMultiplier,
            signals: marketContext.signals,
            reasoning: marketContext.reasoning,
            recommendation: marketContext.recommendation,
            applied: true,
          };
        }
      }
      
      // Si no se aplicó ajuste, guardar info de contexto de todas formas
      if (!marketContextInfo) {
        marketContextInfo = {
          condition: marketContext.condition,
          severity: marketContext.severity,
          predictionBias: 0,
          confidenceMultiplier: 1.0,
          signals: marketContext.signals,
          reasoning: marketContext.reasoning,
          recommendation: marketContext.recommendation,
          applied: false,
        };
      }
    } catch (e) {
      logger.warn(`[PredictionCalc] Could not get market context: ${(e as Error).message}`);
      marketContextInfo = {
        condition: 'unknown',
        severity: 'mild',
        predictionBias: 0,
        confidenceMultiplier: 1.0,
        signals: ['Error obteniendo contexto de mercado'],
        reasoning: 'No disponible',
        recommendation: 'Predicción basada solo en factores individuales',
        applied: false,
      };
    }
    
    // --- CORRELACIÓN USD ↔ METALES PRECIOSOS ---
    // Si es oro, plata, platino, paladio: aplicar correlación inversa con USD
    let preciousMetalsInfo: PreciousMetalsAnalysis | undefined;
    try {
      const pmAnalysis = await preciousMetalsUSDService.analyze(symbol, quote?.name);
      
      if (pmAnalysis.isPreciousMetal && pmAnalysis.hasData) {
        const pmAdjustment = preciousMetalsUSDService.applyToPrediction(
          { change: expectedChange, confidence: finalConfidence },
          pmAnalysis
        );
        
        if (pmAdjustment.applied) {
          const oldChange = expectedChange;
          const oldConfidence = finalConfidence;
          
          expectedChange = pmAdjustment.adjustedChange;
          finalConfidence = pmAdjustment.adjustedConfidence;
          
          logger.info(`[PredictionCalc] Precious metals USD correlation (${pmAnalysis.metalType}, USD ${pmAnalysis.usdStrength.trend}): change ${oldChange.toFixed(2)}% → ${expectedChange.toFixed(2)}%, confidence ${oldConfidence}% → ${finalConfidence}%`);
        }
        
        preciousMetalsInfo = pmAnalysis;
      }
    } catch (e) {
      logger.warn(`[PredictionCalc] Could not analyze precious metals correlation: ${(e as Error).message}`);
    }
    
    // --- EFECTOS DE CALENDARIO ---
    // Fin de mes, viernes, fin de enero, etc. = mayor probabilidad de correcciones
    let calendarEffectsInfo: CalendarEffectsAnalysis | undefined;
    try {
      const isPreciousMetal = preciousMetalsInfo?.isPreciousMetal || false;
      const recentPerformance30d = historical.change30d || 0;
      
      const calendarAdjustment = calendarEffectsService.applyToPrediction(
        { change: expectedChange, confidence: finalConfidence },
        this.inferAssetType(symbol, type),
        {
          isPreciousMetal,
          recentPerformance30d,
          // TODO: detectar isSmallCap, isHighBeta
        }
      );
      
      if (calendarAdjustment.applied) {
        const oldChange = expectedChange;
        const oldConfidence = finalConfidence;
        
        expectedChange = calendarAdjustment.adjustedChange;
        finalConfidence = calendarAdjustment.adjustedConfidence;
        
        calendarEffectsInfo = calendarAdjustment.calendarInfo;
        
        logger.info(`[PredictionCalc] Calendar effects (${calendarEffectsInfo?.calendarRisk.level}): change ${oldChange.toFixed(2)}% → ${expectedChange.toFixed(2)}%, confidence ${oldConfidence}% → ${finalConfidence}%`);
      }
    } catch (e) {
      logger.warn(`[PredictionCalc] Could not analyze calendar effects: ${(e as Error).message}`);
    }
    
    // --- PSICOLOGÍA DEL MERCADO ---
    // Detecta estados emocionales: euforia, miedo, pánico, complacencia, etc.
    let marketPsychologyInfo: MarketPsychologyAnalysis | undefined;
    try {
      const psychologyAdjustment = await marketPsychologyService.applyToPrediction(
        { change: expectedChange, confidence: finalConfidence },
        this.inferAssetType(symbol, type)
      );
      
      if (psychologyAdjustment.applied && psychologyAdjustment.psychologyInfo) {
        const oldChange = expectedChange;
        const oldConfidence = finalConfidence;
        
        expectedChange = psychologyAdjustment.adjustedChange;
        finalConfidence = psychologyAdjustment.adjustedConfidence;
        
        marketPsychologyInfo = psychologyAdjustment.psychologyInfo;
        
        logger.info(`[PredictionCalc] Market psychology (${marketPsychologyInfo.currentState}, ${marketPsychologyInfo.stateIntensity}/100): change ${oldChange.toFixed(2)}% → ${expectedChange.toFixed(2)}%, confidence ${oldConfidence}% → ${finalConfidence}%`);
      }
    } catch (e) {
      logger.warn(`[PredictionCalc] Could not analyze market psychology: ${(e as Error).message}`);
    }
    
    // --- MODELO PROBABILÍSTICO ---
    // Genera distribución de probabilidad e intervalos de confianza
    const probabilisticResult = await probabilisticModelService.generateProbabilisticPrediction(
      symbol,
      expectedChange,
      finalConfidence,
      historical.volatility || 20
    );
    
    // Recalcular dirección DESPUÉS de todos los ajustes
    // UMBRAL AUMENTADO: 0.5% es más realista para evitar falsos positivos
    // Datos históricos: laterales tienen 46.6% de error, hay que ser más estricto
    const DIRECTION_THRESHOLD = 0.5;
    
    // NUEVO: Zona de incertidumbre ampliada (0.3% a 0.7%)
    // Si está en zona gris, preferir NEUTRAL para reducir errores
    if (expectedChange > DIRECTION_THRESHOLD) {
      direction = 'up';
    } else if (expectedChange < -DIRECTION_THRESHOLD) {
      direction = 'down';
    } else {
      // Zona lateral: ser más conservador
      direction = 'neutral';
      // Reducir confianza para laterales (histórico: solo 46.6% acierto)
      finalConfidence = Math.min(finalConfidence, 55);
      logger.info(`[PredictionCalc] Lateral prediction (${expectedChange.toFixed(2)}%), capping confidence at 55%`);
    }
    
    // CORRECCIÓN: Si bajista, ser más conservador (histórico: 41.8% vs 74% alcista)
    if (direction === 'down' && finalConfidence > 60) {
      finalConfidence = Math.round(finalConfidence * 0.85); // -15% para bajistas
      logger.info(`[PredictionCalc] Bearish prediction confidence adjusted: ${finalConfidence}% (historical accuracy 41.8%)`);
    }
    
    // --- LÓGICA DE CONFIANZA BAJA = NEUTRAL ---
    // Si la confianza es < 50%, no tiene sentido predecir dirección
    // Una confianza de 30% en "up" no significa 70% "down", significa "no sé"
    // Por tanto, si no estamos seguros, mejor ser honestos y decir "neutral"
    const LOW_CONFIDENCE_THRESHOLD = 50;
    if (finalConfidence < LOW_CONFIDENCE_THRESHOLD && direction !== 'neutral') {
      logger.info(`[PredictionCalc] Low confidence (${finalConfidence}%) - changing direction from '${direction}' to 'neutral'`);
      direction = 'neutral';
    }
    
    logger.info(`[PredictionCalc] Scale factor: ${scaleFactor}, Expected change: ${expectedChange.toFixed(2)}%, Direction: ${direction}`);
    
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
      confidence: finalConfidence,
      factorBreakdown: {
        assetGroup,
        assetGroupDescription: groupConfig.description,
        relevantFactors: groupConfig.relevantFactors,
        availableFactors: factors.map(f => ({ name: f.name, score: Math.round(f.score), hasData: f.hasData })),
        weightsUsed: weights,
        usingLearnedWeights,
        confidenceExplanation,
        signalSummary,
        assetAdjustmentApplied: assetAdjustment.wasAdjusted,
        trackRecordAdjustment,
        correlationAdjustment: correlationAdjustment.adjustedConfidence - correlationAdjustment.originalConfidence,
        streakAdjustment: streakAdjustmentInfo,
        // Información de selección dinámica de modelos
        activeModels: ensembleResult.activeModels,
        modelSelectionReason: ensembleResult.modelSelectionReason,
        dataAvailability,
      },
      probabilistic: {
        mean: probabilisticResult.pointEstimate,
        stdDev: probabilisticResult.distribution.parameters.stdDev,
        confidenceIntervals: {
          ci50: { lower: probabilisticResult.distribution.percentiles.p25, upper: probabilisticResult.distribution.percentiles.p75 },
          ci80: { lower: probabilisticResult.distribution.percentiles.p10, upper: probabilisticResult.distribution.percentiles.p90 },
          ci95: { lower: probabilisticResult.distribution.percentiles.p5, upper: probabilisticResult.distribution.percentiles.p95 },
        },
        probabilities: {
          up: probabilisticResult.riskMetrics.uptailProbability,
          down: probabilisticResult.riskMetrics.downtailProbability,
          neutral: 1 - probabilisticResult.riskMetrics.uptailProbability - probabilisticResult.riskMetrics.downtailProbability,
        },
        skewness: probabilisticResult.distribution.parameters.skewness || 0,
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
      events: events.hasData ? {
        hasData: true,
        warnings: events.warnings,
        eventRiskScore: events.eventRiskScore,
        nextEarnings: events.nextEarnings ? {
          date: events.nextEarnings.date,
          daysUntil: events.nextEarnings.daysUntil,
          isEstimate: events.nextEarnings.isEstimate,
          epsEstimate: events.nextEarnings.epsEstimate,
        } : undefined,
        dividend: events.dividend ? {
          yield: events.dividend.yield,
          exDate: events.dividend.exDate,
          daysUntilEx: events.dividend.daysUntilEx,
          amount: events.dividend.amount,
        } : undefined,
        nextSplit: events.nextSplit,
      } : undefined,
      timeframe: timeframeStr,
      calculatedAt: new Date(),
      marketContext: marketContextInfo,
      preciousMetalsAnalysis: preciousMetalsInfo ? {
        metalType: preciousMetalsInfo.metalType,
        usdTrend: preciousMetalsInfo.usdStrength.trend,
        usdSeverity: preciousMetalsInfo.usdStrength.severity,
        dxyChange5d: preciousMetalsInfo.usdStrength.dxyChange5d,
        impactScore: preciousMetalsInfo.usdImpact.score,
        predictionBias: preciousMetalsInfo.usdImpact.predictionBias,
        signals: preciousMetalsInfo.signals,
        reasoning: preciousMetalsInfo.reasoning,
      } : undefined,
      calendarEffects: calendarEffectsInfo ? {
        dayOfWeek: calendarEffectsInfo.dayOfWeek,
        dayOfMonth: calendarEffectsInfo.dayOfMonth,
        month: calendarEffectsInfo.month,
        riskLevel: calendarEffectsInfo.calendarRisk.level,
        riskScore: calendarEffectsInfo.calendarRisk.score,
        isEndOfMonth: calendarEffectsInfo.isEndOfMonth,
        isFriday: calendarEffectsInfo.isFriday,
        isEndOfJanuary: calendarEffectsInfo.isEndOfJanuary,
        dangerousCombination: calendarEffectsInfo.dangerousCombination || calendarEffectsInfo.extremeDanger,
        signals: calendarEffectsInfo.signals,
        reasoning: calendarEffectsInfo.reasoning,
      } : undefined,
      marketPsychology: marketPsychologyInfo ? {
        state: marketPsychologyInfo.currentState,
        stateIntensity: marketPsychologyInfo.stateIntensity,
        emoji: marketPsychologyInfo.humanReadable.emoji,
        title: marketPsychologyInfo.humanReadable.title,
        description: marketPsychologyInfo.humanReadable.description,
        advice: marketPsychologyInfo.humanReadable.advice,
        fearGreedIndex: marketPsychologyInfo.indicators.fearGreedIndex,
        vix: marketPsychologyInfo.indicators.vix,
        biasesDetected: Object.entries(marketPsychologyInfo.biasesDetected)
          .filter(([_, detected]) => detected)
          .map(([bias, _]) => bias),
        contrarianSignal: marketPsychologyInfo.predictionImpact.contrarianSignal,
        signals: marketPsychologyInfo.signals,
      } : undefined,
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
   * CORREGIDO: Reducir amplificación para evitar sesgo alcista por momentum
   * También considera mean reversion para tendencias extremas
   */
  calculateTrendScore(change30d: number, change90d: number): number {
    // Amplificación reducida: de 3x a 2x para evitar sesgo momentum
    // Aplicar mean reversion si tendencia muy extrema (>20% en 30d)
    let shortTermScore: number;
    if (Math.abs(change30d) > 20) {
      // Tendencia extrema: aplicar mean reversion parcial
      shortTermScore = Math.max(-100, Math.min(100, change30d * 1.0));
      logger.debug(`[PredictionCalc] Extreme trend detected (${change30d.toFixed(1)}%), applying mean reversion`);
    } else if (Math.abs(change30d) > 10) {
      // Tendencia fuerte: amplificación moderada
      shortTermScore = Math.max(-100, Math.min(100, change30d * 1.5));
    } else {
      // Tendencia normal: amplificación estándar (reducida de 3 a 2)
      shortTermScore = Math.max(-100, Math.min(100, change30d * 2));
    }
    const longTermScore = Math.max(-100, Math.min(100, change90d * 0.8)); // Reducido de 1 a 0.8
    return (shortTermScore * 0.6 + longTermScore * 0.4); // Más peso a largo plazo
  },

  /**
   * Detecta el grupo del activo usando símbolo, tipo y nombre
   * La detección por nombre permite clasificar automáticamente activos nuevos
   */
  detectAssetGroup(symbol: string, type: 'stock' | 'crypto', assetName: string = ''): AssetGroup {
    // 1. Primero verificar mapeo manual (símbolos conocidos)
    if (SYMBOL_TO_GROUP[symbol]) {
      return SYMBOL_TO_GROUP[symbol];
    }

    // 2. Crypto por tipo
    if (type === 'crypto') {
      const majorCryptos = ['BTC', 'ETH', 'BNB'];
      const base = symbol.replace('-USD', '').replace('-EUR', '').replace('-GBP', '');
      return majorCryptos.includes(base) ? 'crypto_major' : 'crypto_alt';
    }

    // 3. Patrones de símbolo conocidos
    if (symbol.startsWith('^')) return 'etf_index';  // Índices
    if (symbol.endsWith('=F')) return 'commodity';   // Futuros
    if (symbol.endsWith('=X')) return 'forex';       // Forex
    
    // 4. *** DETECCIÓN INTELIGENTE POR NOMBRE ***
    const nameLower = assetName.toLowerCase();
    
    // Commodities - Metales preciosos físicos y ETCs
    const commodityPatterns = [
      'physical gold', 'physical silver', 'physical platinum', 'physical palladium',
      'gold etc', 'silver etc', 'platinum etc', 'palladium etc',
      'gold bullion', 'silver bullion', 'gold trust', 'silver trust',
      'gold etf', 'silver etf', 'commodity etf',
      'crude oil', 'natural gas', 'brent', 'wti',
      'physical metals', 'precious metal',
      'wisdomtree physical', 'ishares physical',
      'xetra-gold', 'xetra gold', 'euwax gold',
    ];
    if (commodityPatterns.some(p => nameLower.includes(p))) return 'commodity';
    
    // ETFs e Índices
    const etfIndexPatterns = [
      'msci world', 'msci emerging', 'msci europe', 'msci usa', 'msci acwi',
      's&p 500', 's&p500', 'sp500', 'nasdaq', 'dow jones', 'ftse', 'dax', 'cac 40',
      'stoxx', 'euro stoxx', 'nikkei', 'hang seng',
      'vanguard', 'ishares core', 'spdr', 'invesco qqq',
      'total stock', 'total market', 'all-world', 'all world',
      'ucits etf', 'index fund', 'tracker',
    ];
    if (etfIndexPatterns.some(p => nameLower.includes(p))) return 'etf_index';
    
    // REITs
    const reitPatterns = [
      'reit', 'real estate investment', 'property trust',
      'real estate trust', 'property fund', 'property income',
    ];
    if (reitPatterns.some(p => nameLower.includes(p))) return 'reit';
    
    // Bonos
    const bondPatterns = [
      'bond', 'treasury', 'government bond', 'corporate bond',
      'fixed income', 'aggregate bond', 'high yield',
    ];
    if (bondPatterns.some(p => nameLower.includes(p))) return 'etf_index'; // Tratamos bonos como ETF por ahora
    
    // ADRs (empresas extranjeras en bolsas US)
    const adrPatterns = [
      'adr', 'american depositary', 'sponsored adr',
    ];
    if (adrPatterns.some(p => nameLower.includes(p))) return 'adr';
    
    // Detección de tamaño de empresa por palabras clave en nombre
    const smallCapPatterns = [
      'small cap', 'smallcap', 'micro cap', 'microcap', 'penny',
    ];
    if (smallCapPatterns.some(p => nameLower.includes(p))) return 'small_cap_stock';
    
    // 5. ETFs comunes por símbolo
    const etfPatterns = ['SPY', 'QQQ', 'VOO', 'VTI', 'IWM', 'EEM', 'VEA', 'VWO', 'VNQ', 'GLD', 'SLV', 'USO'];
    if (etfPatterns.some(p => symbol.toUpperCase().startsWith(p))) return 'etf_index';
    
    // 6. Mercados europeos - default a large_cap
    if (symbol.includes('.MC') || symbol.includes('.L') || symbol.includes('.PA') || symbol.includes('.DE')) {
      // Pero si detectamos algo específico en el nombre, usarlo
      if (nameLower.includes('etc') || nameLower.includes('etp')) return 'commodity';
      return 'large_cap_stock';
    }

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
    const neutralFactors = availableFactors.filter(f => f.score >= -15 && f.score <= 15);
    
    // Factores con señal clara (no neutrales)
    const signalFactors = positiveFactors.length + negativeFactors.length;
    
    let signalSummary: 'coherent_bullish' | 'coherent_bearish' | 'mixed' | 'neutral' | 'insufficient';
    let signalCoherence = 50;

    if (signalFactors === 0) {
      // Todos los factores son neutrales
      signalSummary = 'neutral';
      signalCoherence = 45;
    } else if (positiveFactors.length > 0 && negativeFactors.length > 0) {
      // Hay factores en ambas direcciones - evaluar proporción
      const bullishRatio = positiveFactors.length / signalFactors;
      const bearishRatio = negativeFactors.length / signalFactors;
      
      if (bullishRatio >= 0.7) {
        // 70%+ alcistas → coherent_bullish (aunque haya alguno bajista)
        signalSummary = 'coherent_bullish';
        signalCoherence = 65 + (bullishRatio - 0.7) * 30; // 65-74
      } else if (bearishRatio >= 0.7) {
        // 70%+ bajistas → coherent_bearish
        signalSummary = 'coherent_bearish';
        signalCoherence = 65 + (bearishRatio - 0.7) * 30;
      } else {
        // Realmente mixto (ni alcistas ni bajistas dominan claramente)
        signalSummary = 'mixed';
        signalCoherence = 40;
      }
    } else if (positiveFactors.length >= 2) {
      // Solo factores positivos (y posiblemente neutrales)
      signalSummary = 'coherent_bullish';
      signalCoherence = 75;
    } else if (negativeFactors.length >= 2) {
      // Solo factores negativos (y posiblemente neutrales)
      signalSummary = 'coherent_bearish';
      signalCoherence = 75;
    } else if (positiveFactors.length === 1) {
      signalSummary = neutralFactors.length > 0 ? 'neutral' : 'coherent_bullish';
      signalCoherence = 55;
    } else if (negativeFactors.length === 1) {
      signalSummary = neutralFactors.length > 0 ? 'neutral' : 'coherent_bearish';
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
      if (negativeFactors.length > 0) {
        confidenceExplanation = `${positiveFactors.length}/${signalFactors} factores alcistas: ${positiveFactors.map(f => f.name).join(', ')}. Minoritarios bajistas: ${negativeFactors.map(f => f.name).join(', ')}.`;
      } else {
        confidenceExplanation = `${positiveFactors.length} factores coinciden en señal alcista: ${positiveFactors.map(f => f.name).join(', ')}.`;
      }
    } else if (signalSummary === 'coherent_bearish') {
      if (positiveFactors.length > 0) {
        confidenceExplanation = `${negativeFactors.length}/${signalFactors} factores bajistas: ${negativeFactors.map(f => f.name).join(', ')}. Minoritarios alcistas: ${positiveFactors.map(f => f.name).join(', ')}.`;
      } else {
        confidenceExplanation = `${negativeFactors.length} factores coinciden en señal bajista: ${negativeFactors.map(f => f.name).join(', ')}.`;
      }
    } else if (signalSummary === 'mixed') {
      confidenceExplanation = `Señales divididas: ${positiveFactors.map(f => f.name).join(', ')} alcistas vs ${negativeFactors.map(f => f.name).join(', ')} bajistas.`;
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
   * @param prediction - La predicción calculada
   * @param predictionType - 'close' para cierre del día, 'open_next_day' para apertura del día siguiente
   */
  async savePrediction(prediction: CalculatedPrediction, predictionType?: PredictionType): Promise<{ id: string }> {
    const result = await predictionRepository.create({
      symbol: prediction.symbol,
      asset: prediction.asset,
      assetType: prediction.assetType,
      direction: prediction.direction,
      confidence: prediction.confidence,
      timeframe: prediction.timeframe,
      predictionType: predictionType || prediction.predictionType || 'close',
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

  /**
   * Guarda ambas predicciones: cierre del día y apertura del día siguiente
   * @returns IDs de ambas predicciones
   */
  async saveBothPredictions(prediction: CalculatedPrediction): Promise<{ closeId: string; openNextDayId: string }> {
    // Guardar predicción de cierre del día
    const closePrediction = await this.savePrediction(prediction, 'close');
    
    // Guardar predicción de apertura del día siguiente
    const openPrediction = await this.savePrediction(prediction, 'open_next_day');
    
    logger.info(`[PredictionCalc] Saved both predictions for ${prediction.symbol}: close=${closePrediction.id}, open_next_day=${openPrediction.id}`);
    
    return {
      closeId: closePrediction.id,
      openNextDayId: openPrediction.id,
    };
  },
};

// Variable auxiliar para el asset name
let quote: any = null;
