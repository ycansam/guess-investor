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
 * 
 * FACTORES SIMPLIFICADOS (8):
 * - CORE: trend, technical, sentiment, news, institutional, financials, macro
 * - CONDICIONALES: forex (solo si exposición internacional)
 * - ELIMINADOS: competitors (ruido), expectations (redundante con news), seasonality (poco fiable)
 * 
 * AJUSTES ELIMINADOS (añadían ruido):
 * - Market Psychology: ya capturado por VIX en sentiment
 * - Geopolitical Events: imposible de cuantificar bien
 * - Streak Adjustment: falacia del jugador + doble conteo con trend
 */

import { logger } from '../../middleware/logger.js';
import { predictionRepository, PredictionType } from '../../repositories/prediction.repository.js';
import { weightsRepository } from '../../repositories/weights.repository.js';
import { broadMarketContextService } from '../external/broad-market-context.service.js';
// NUEVOS SERVICIOS PARA INTRADÍA
import { DivergenceAnalysis, divergenceService } from '../analysis/divergence.service.js';
import { IntradayTrendData, intradayTrendService } from '../analysis/intraday-trend.service.js';
import { MarketBreadthData, marketBreadthService } from '../analysis/market-breadth.service.js';
import { OptionsFlowData, optionsFlowService } from '../analysis/options-flow.service.js';
import { VolatilityData, volatilityService } from '../analysis/volatility.service.js';
import { VolumeProfileData, volumeProfileService } from '../analysis/volume-profile.service.js';
// ELIMINADOS:
// - Calendar Effects: el efecto lunes es casi mito
// - Competitors: no añade señal limpia
// - Expectations: redundante con news (analyst actions ya incluidas en news)
// - Market Psychology: ya capturado por VIX/Fear&Greed en sentiment
// - Geopolitical Events: imposible de cuantificar direccionalmente
// - Seasonality: poco fiable, patrones no se mantienen
import { AssetEvents, eventsService } from '../external/events.service.js';
import { FinancialsData, financialsService } from '../external/financials.service.js';
import { ForexImpact, forexService } from '../external/forex.service.js';
import { InstitutionalData, institutionalService } from '../external/institutional.service.js';
import { MacroIndicators, macroService } from '../external/macro.service.js';
import { newsService, NewsSummary } from '../external/news.service.js';
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
import { commodityCorrelationService } from './commodity-correlation.service.js';
import { commodityUnderlyingService, UnderlyingInfo } from './commodity-underlying.service.js';
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
  
  // RECOMENDACIÓN INTELIGENTE
  // Considera predicción + contexto psicológico + calendario + largo plazo
  recommendation?: {
    action: 'strong_buy' | 'buy' | 'hold' | 'reduce' | 'sell' | 'strong_sell' | 'wait';
    emoji: string;
    title: string;
    reasoning: string;
    timeHorizon: 'short' | 'medium' | 'long';  // Horizonte recomendado
    riskLevel: 'low' | 'medium' | 'high' | 'extreme';
    isContrarian: boolean;  // ¿Es una recomendación contrarian?
    keyFactors: string[];   // Factores principales que influyen
  };
  
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
    meanReversionAdjustment?: { recentDrop: number; todayRecovery: number; adjustment: number };
    intradayMomentumAdjustment?: { currentChange: number; projectedContinuation: number; adjustment: number; confidenceBoost: number };
    commodityCorrelationAdjustment?: { adjusted: boolean; reason: string | null };
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
  
  // RISK FILTER: Recomienda abstención cuando hay alta incertidumbre
  riskFilter?: {
    shouldAbstain: boolean;           // true = mejor no operar
    abstentionLevel: 'none' | 'caution' | 'warning' | 'critical';  // Niveles de riesgo
    abstentionScore: number;          // 0-100, >50 = considerar abstención
    reasons: string[];                // Por qué se recomienda abstención
    riskFactors: {
      vixExtreme: boolean;            // VIX > 30
      volatilityExtreme: boolean;     // Volatilidad del activo > 50%
      conflictingSignals: boolean;    // Factores dan señales opuestas
      lowDataQuality: boolean;        // Pocos factores con datos
      trendDivergence: boolean;       // Timeframes desalineados
      earningsNear: boolean;          // Earnings en próximos 3 días
      marketCrash: boolean;           // Mercado en caída fuerte
    };
  };
  
  // ELIMINADOS (añadían ruido sin valor):
  // - preciousMetalsAnalysis: integrado en forex para metales
  // - marketPsychology: ya capturado por VIX en sentiment
  // - geopoliticalEvents: imposible de cuantificar direccionalmente
  
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
    relevantFactors: ['trend', 'technical', 'sentiment', 'news', 'macro', 'forex', 'institutional', 'financials', 
                      'intradayTrend', 'optionsFlow', 'volumeProfile', 'divergences', 'volatilityIV', 'marketBreadth'],
    minFactorsForHighConfidence: 5,
    description: 'Acciones de gran capitalización',
  },
  small_cap_stock: {
    relevantFactors: ['trend', 'technical', 'news', 'financials',
                      'intradayTrend', 'volumeProfile', 'divergences', 'marketBreadth'],
    minFactorsForHighConfidence: 3,
    description: 'Acciones pequeñas/medianas',
  },
  crypto_major: {
    relevantFactors: ['trend', 'technical', 'sentiment', 'news', 'macro',
                      'intradayTrend', 'volumeProfile', 'divergences', 'marketBreadth'],
    minFactorsForHighConfidence: 3,
    description: 'Criptomonedas principales (BTC, ETH)',
  },
  crypto_alt: {
    relevantFactors: ['trend', 'technical', 'sentiment',
                      'intradayTrend', 'volumeProfile', 'divergences'],
    minFactorsForHighConfidence: 2,
    description: 'Altcoins',
  },
  etf_index: {
    relevantFactors: ['trend', 'technical', 'macro', 'forex',
                      'intradayTrend', 'optionsFlow', 'volumeProfile', 'divergences', 'volatilityIV', 'marketBreadth'],
    minFactorsForHighConfidence: 3,
    description: 'ETFs e índices',
  },
  commodity: {
    relevantFactors: ['trend', 'technical', 'macro', 'forex',
                      'intradayTrend', 'volumeProfile', 'divergences', 'volatilityIV'],
    minFactorsForHighConfidence: 3,
    description: 'Materias primas',
  },
  reit: {
    relevantFactors: ['trend', 'technical', 'macro', 'financials',
                      'intradayTrend', 'optionsFlow', 'volumeProfile', 'divergences', 'marketBreadth'],
    minFactorsForHighConfidence: 3,
    description: 'REITs',
  },
  forex: {
    relevantFactors: ['trend', 'technical', 'macro', 'news',
                      'intradayTrend', 'volumeProfile', 'divergences'],
    minFactorsForHighConfidence: 3,
    description: 'Pares de divisas',
  },
  adr: {
    relevantFactors: ['trend', 'technical', 'news', 'forex', 'macro', 'financials',
                      'intradayTrend', 'optionsFlow', 'volumeProfile', 'divergences', 'volatilityIV', 'marketBreadth'],
    minFactorsForHighConfidence: 4,
    description: 'ADRs',
  },
  default: {
    relevantFactors: ['trend', 'technical', 'sentiment', 'news',
                      'intradayTrend', 'volumeProfile', 'divergences', 'marketBreadth'],
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

// Pesos por defecto según timeframe
// INTRADÍA OPTIMIZADO: Nuevos factores de alta frecuencia
// - intradayTrend: Reemplaza trend largo (1h/4h/day)
// - optionsFlow: Flujo institucional en tiempo real
// - volumeProfile: POC, Value Area
// - divergences: RSI/MACD divergencias
// - volatilityIV: IV vs RV spread
// - marketBreadth: Salud del mercado
const DEFAULT_WEIGHTS = {
  intraday: {
    // Factores de ALTA FRECUENCIA (nuevos) - 55%
    technical: 0.20,        // RSI, MACD, Bollinger, Stochastic
    intradayTrend: 0.15,    // 1h/4h/day momentum, VWAP, Pivots
    optionsFlow: 0.10,      // Put/Call, IV, Max Pain
    volumeProfile: 0.05,    // POC, Value Area
    divergences: 0.05,      // RSI/MACD divergencias
    // Factores TRADICIONALES adaptados - 45%
    sentiment: 0.15,        // VIX, Fear&Greed
    news: 0.10,             // Noticias recientes
    volatilityIV: 0.05,     // IV vs RV spread
    marketBreadth: 0.05,    // Salud del mercado (A/D ratio)
    // Factores de BAJA relevancia intradía - 10%
    trend: 0.05,            // Trend largo (reducido)
    macro: 0.03,            // Macro (casi irrelevante intradía)
    forex: 0.02,            // FX (solo si aplica)
    institutional: 0.00,    // Con lag, no útil intradía
    financials: 0.00        // No aplica intradía
  },
  swing: {
    // Nuevos factores intradía (peso reducido en swing)
    intradayTrend: 0.05,    // Algo de relevancia
    optionsFlow: 0.03,      // Menor peso
    volumeProfile: 0.02,    // Menor peso
    divergences: 0.05,      // Relevante también en swing
    volatilityIV: 0.03,     // Algo de peso
    marketBreadth: 0.04,    // Relevante
    // Factores tradicionales
    trend: 0.14, technical: 0.20, sentiment: 0.12, news: 0.17,
    macro: 0.08, forex: 0.05, institutional: 0.08,
    financials: 0.04
  },
  long: {
    // Nuevos factores (mínimo peso en largo plazo)
    intradayTrend: 0.00,    // No aplica
    optionsFlow: 0.02,      // Algo de señal institucional
    volumeProfile: 0.01,    // Mínimo
    divergences: 0.03,      // Divergencias a largo plazo
    volatilityIV: 0.02,     // Mínimo
    marketBreadth: 0.03,    // Algo de relevancia
    // Factores tradicionales (dominan)
    trend: 0.06, technical: 0.09, sentiment: 0.04, news: 0.10,
    macro: 0.15, forex: 0.07, institutional: 0.13,
    financials: 0.25        // Mayor peso en largo plazo
  },
};

// --- MULTIPLICADORES DE PESO POR GRUPO DE ACTIVO ---
// Diferentes tipos de activos requieren diferentes combinaciones de factores
// Ahora incluye los nuevos factores intradía
const ASSET_GROUP_WEIGHT_MULTIPLIERS: Record<AssetGroup, Record<string, number>> = {
  large_cap_stock: {
    // Factores tradicionales
    trend: 1.0, technical: 1.0, sentiment: 0.9, news: 1.2,
    macro: 1.1, forex: 0.8, institutional: 1.4, financials: 1.5,
    // Nuevos factores intradía
    intradayTrend: 1.0, optionsFlow: 1.3, volumeProfile: 1.0,
    divergences: 1.0, volatilityIV: 1.0, marketBreadth: 1.0
  },
  small_cap_stock: {
    trend: 1.3, technical: 1.4, sentiment: 1.2, news: 1.5,
    macro: 0.7, forex: 0.3, institutional: 0.5, financials: 1.3,
    intradayTrend: 1.4, optionsFlow: 0.5, volumeProfile: 1.2,
    divergences: 1.3, volatilityIV: 1.2, marketBreadth: 0.8
  },
  crypto_major: {
    trend: 1.3, technical: 1.4, sentiment: 1.5, news: 1.3,
    macro: 1.2, forex: 0.0, institutional: 1.0, financials: 0.0,
    intradayTrend: 1.5, optionsFlow: 0.3, volumeProfile: 1.3,
    divergences: 1.4, volatilityIV: 0.5, marketBreadth: 0.7
  },
  crypto_alt: {
    trend: 1.5, technical: 1.6, sentiment: 1.8, news: 1.2,
    macro: 0.5, forex: 0.0, institutional: 0.3, financials: 0.0,
    intradayTrend: 1.8, optionsFlow: 0.1, volumeProfile: 1.5,
    divergences: 1.6, volatilityIV: 0.3, marketBreadth: 0.5
  },
  etf_index: {
    trend: 0.8, technical: 0.7, sentiment: 0.9, news: 1.0,
    macro: 1.5, forex: 1.0, institutional: 1.3, financials: 0.5,
    intradayTrend: 0.9, optionsFlow: 1.2, volumeProfile: 1.1,
    divergences: 0.9, volatilityIV: 1.1, marketBreadth: 1.5
  },
  commodity: {
    trend: 1.0, technical: 1.1, sentiment: 0.7, news: 1.2,
    macro: 1.8, forex: 1.6, institutional: 0.8, financials: 0.1,
    intradayTrend: 1.2, optionsFlow: 0.8, volumeProfile: 1.3,
    divergences: 1.1, volatilityIV: 1.4, marketBreadth: 0.9
  },
  reit: {
    trend: 0.9, technical: 0.8, sentiment: 0.6, news: 1.0,
    macro: 1.6, forex: 0.3, institutional: 1.2, financials: 1.8,
    intradayTrend: 0.7, optionsFlow: 0.9, volumeProfile: 0.8,
    divergences: 0.8, volatilityIV: 1.0, marketBreadth: 1.1
  },
  forex: {
    trend: 1.2, technical: 1.4, sentiment: 0.5, news: 1.2,
    macro: 1.8, forex: 0.0, institutional: 0.8, financials: 0.0,
    intradayTrend: 1.6, optionsFlow: 0.2, volumeProfile: 1.4,
    divergences: 1.3, volatilityIV: 1.3, marketBreadth: 0.6
  },
  adr: {
    trend: 1.0, technical: 1.0, sentiment: 0.9, news: 1.3,
    macro: 1.1, forex: 1.6, institutional: 1.0, financials: 1.4,
    intradayTrend: 1.0, optionsFlow: 1.0, volumeProfile: 1.0,
    divergences: 1.0, volatilityIV: 1.0, marketBreadth: 1.0
  },
  default: {
    trend: 1.0, technical: 1.0, sentiment: 1.0, news: 1.2,
    macro: 1.0, forex: 0.5, institutional: 1.0, financials: 1.2,
    intradayTrend: 1.0, optionsFlow: 1.0, volumeProfile: 1.0,
    divergences: 1.0, volatilityIV: 1.0, marketBreadth: 1.0
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
      macro: 1.3, forex: 1.1, institutional: 1.4,
      financials: 1.5, expectations: 1.5
    };
    logger.debug(`[PredictionCalc] Low volatility (${assetVolatility.toFixed(1)}%): prioritizing fundamentals`);
  } else if (assetVolatility < 50) {
    // Volatilidad media: sin ajuste
    volatilityMultiplier = {
      trend: 1.0, technical: 1.0, sentiment: 1.0, news: 1.0,
      macro: 1.0, forex: 1.0, institutional: 1.0,
      financials: 1.0, expectations: 1.0
    };
  } else {
    // Alta volatilidad: priorizar técnico/momentum/sentiment
    volatilityMultiplier = {
      trend: 1.4, technical: 1.5, sentiment: 1.4, news: 1.3,
      macro: 0.7, forex: 0.9, institutional: 0.8,
      financials: 0.5, expectations: 0.5
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

      // 2. DETECTAR SI ES ETF DE COMMODITY → USAR DATOS DEL SUBYACENTE
      // Para ETFs de oro/plata/etc., usamos los datos del commodity real
      // Esto garantiza que todos los ETFs del mismo commodity predigan la misma dirección
      const commodityUnderlying = await commodityUnderlyingService.getTechnicalForETF(symbol, quote.name);
      let underlyingInfo: UnderlyingInfo | undefined;
      
      // 3. Obtener datos históricos - del subyacente si es commodity ETF
      const historySymbol = commodityUnderlying.useUnderlying && commodityUnderlying.underlying
        ? commodityUnderlying.underlying.underlyingSymbol
        : symbol;
      const history = await yahooService.getHistory(historySymbol, '3mo', '1d');
      const historical = this.processHistoricalData(history);
      
      if (commodityUnderlying.useUnderlying && commodityUnderlying.underlying) {
        underlyingInfo = commodityUnderlying.underlying;
        logger.info(`[PredictionCalc] 🔗 COMMODITY ETF: ${symbol} → Using ${underlyingInfo.underlyingSymbol} (${underlyingInfo.commodityType}) historical & technical data`);
      }

      // IMPORTANTE: Usar el último precio de cierre del historial como base
      // previousClose de Yahoo puede ser incorrecto para futuros/commodities
      // El historial siempre tiene los cierres correctos de cada día
      let basePrice: number;
      if (history.length > 0) {
        const lastHistoricalClose = history[history.length - 1].close;
        // Para ETFs de commodities, el basePrice debe ser del ETF (para calcular precio target correcto)
        // pero los cambios % vienen del subyacente
        if (commodityUnderlying.useUnderlying) {
          basePrice = quote.previousClose || quote.price;
          logger.info(`[PredictionCalc] Commodity ETF: Using ETF's previousClose (${basePrice}) as base, but changes from ${historySymbol}`);
        } else {
          basePrice = lastHistoricalClose;
          logger.info(`[PredictionCalc] Using last historical close (${basePrice}) as base price. Quote price: ${quote.price}, previousClose: ${quote.previousClose}`);
        }
      } else {
        // Fallback si no hay historial
        basePrice = quote.previousClose || quote.price;
        logger.warn(`[PredictionCalc] No historical data, using previousClose (${basePrice}) as fallback`);
      }
      
      // 4. Obtener todos los datos en paralelo
      // Factores tradicionales (siempre se obtienen)
      const [
        technicalRaw,
        sentiment,
        news,
        macro,
        institutional,
        forex,
        financials,
        events,
      ] = await Promise.all([
        // Si es commodity ETF, usar técnicos del subyacente; si no, del ETF
        commodityUnderlying.useUnderlying && commodityUnderlying.technical
          ? Promise.resolve(commodityUnderlying.technical)
          : technicalService.analyze(symbol),
        sentimentService.getSentiment(symbol, type),
        newsService.getNews(symbol, type),
        macroService.getIndicators(symbol, type),
        institutionalService.getInstitutionalActivity(symbol, type),
        forexService.analyzeForexImpact(symbol, quote.name),
        financialsService.getFinancials(symbol, quote.price),
        eventsService.getEvents(symbol),
      ]);

      // 4b. NUEVOS FACTORES INTRADÍA (solo si timeframeDays <= 1)
      // Estos factores son de alta frecuencia y relevantes para operaciones intradía
      let intradayTrend: IntradayTrendData | null = null;
      let optionsFlow: OptionsFlowData | null = null;
      let volumeProfile: VolumeProfileData | null = null;
      let divergences: DivergenceAnalysis | null = null;
      let volatilityIV: VolatilityData | null = null;
      let marketBreadth: MarketBreadthData | null = null;

      if (timeframeDays <= 1) {
        // Obtener todos los factores intradía en paralelo
        logger.info(`[PredictionCalc] Fetching intraday-specific factors for ${symbol}`);
        const [
          intradayTrendData,
          optionsFlowData,
          volumeProfileData,
          divergenceData,
          volatilityData,
          breadthData,
        ] = await Promise.all([
          intradayTrendService.getIntradayTrend(symbol),
          type === 'stock' ? optionsFlowService.getOptionsFlow(symbol, quote.price) : Promise.resolve(null),
          volumeProfileService.getVolumeProfile(symbol, '5d'),
          divergenceService.getDivergences(symbol),
          type === 'stock' ? volatilityService.getVolatilityAnalysis(symbol) : Promise.resolve(null),
          marketBreadthService.getMarketBreadth(),
        ]);
        
        intradayTrend = intradayTrendData;
        optionsFlow = optionsFlowData;
        volumeProfile = volumeProfileData;
        divergences = divergenceData;
        volatilityIV = volatilityData;
        marketBreadth = breadthData;
        
        logger.info(`[PredictionCalc] Intraday factors loaded: trend=${intradayTrend?.hasData}, options=${optionsFlow?.hasData}, volume=${volumeProfile?.hasData}, divergences=${divergences?.hasDivergence}, volatility=${volatilityIV?.hasData}, breadth=${marketBreadth?.hasData}`);
      }

      // Asignar technical (ya viene del subyacente si es commodity ETF)
      const technical = technicalRaw;

      // 5. Calcular predicción determinística usando basePrice (previousClose)
      // Para commodity ETFs, usar el cambio intradía del subyacente para mejor coherencia
      const currentDayChange = commodityUnderlying.useUnderlying && commodityUnderlying.underlyingData
        ? commodityUnderlying.underlyingData.change1d
        : (quote.changePercent || 0);
      
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
        forex,
        institutional,
        financials,
        events,
        timeframeDays,
        quote.name || symbol, // Pasar el nombre del activo para clasificación inteligente
        currentDayChange, // Cambio % del día actual (del subyacente si es commodity)
        // NUEVOS FACTORES INTRADÍA
        intradayTrend,
        optionsFlow,
        volumeProfile,
        divergences,
        volatilityIV,
        marketBreadth
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

      // Añadir info del subyacente si es ETF de commodity
      if (underlyingInfo) {
        (prediction as any).commodityUnderlying = {
          symbol: underlyingInfo.underlyingSymbol,
          type: underlyingInfo.commodityType,
          currency: underlyingInfo.underlyingCurrency,
        };
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
   * FACTORES EXPANDIDOS PARA INTRADÍA:
   * - Tradicionales: trend, technical, sentiment, news, macro, forex, institutional, financials
   * - Nuevos intradía: intradayTrend, optionsFlow, volumeProfile, divergences, volatilityIV, marketBreadth
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
    forex: ForexImpact,
    institutional: InstitutionalData,
    financials: FinancialsData | null,
    events: AssetEvents,
    timeframeDays: number,
    assetName: string = '', // Nombre del activo para clasificación inteligente
    intradayChange: number = 0, // Cambio % intradía para detectar caídas extremas
    // NUEVOS FACTORES INTRADÍA
    intradayTrend: IntradayTrendData | null = null,
    optionsFlow: OptionsFlowData | null = null,
    volumeProfile: VolumeProfileData | null = null,
    divergences: DivergenceAnalysis | null = null,
    volatilityIV: VolatilityData | null = null,
    marketBreadth: MarketBreadthData | null = null
  ): Promise<CalculatedPrediction> {
    // FLAGS de datos disponibles - Factores tradicionales
    const hasHistoricalData = historical.hasData && (historical.change30d !== 0 || historical.change90d !== 0);
    const hasTechnicalData = technical.hasData;
    const hasSentimentData = sentiment.hasData;
    const hasNewsData = news.hasNews;
    const hasMacroData = macro.hasData;
    const hasForexData = forex.hasData;
    const hasInstitutionalData = institutional.hasData;
    const hasFinancialsData = financials?.hasData || false;
    
    // FLAGS de datos disponibles - Nuevos factores intradía
    const hasIntradayTrendData = intradayTrend?.hasData || false;
    const hasOptionsFlowData = optionsFlow?.hasData || false;
    const hasVolumeProfileData = volumeProfile?.hasData || false;
    const hasDivergencesData = divergences?.hasDivergence || false;
    const hasVolatilityIVData = volatilityIV?.hasData || false;
    const hasMarketBreadthData = marketBreadth?.hasData || false;

    // Objeto de disponibilidad de datos para el ensemble
    const dataAvailability: DataAvailability = {
      trend: hasHistoricalData,
      technical: hasTechnicalData,
      sentiment: hasSentimentData,
      news: hasNewsData,
      macro: hasMacroData,
      forex: hasForexData,
      institutional: hasInstitutionalData,
      financials: hasFinancialsData,
    };

    // Log de disponibilidad de datos
    const traditionalCount = Object.values(dataAvailability).filter(Boolean).length;
    const intradayFactorsCount = [hasIntradayTrendData, hasOptionsFlowData, hasVolumeProfileData, hasDivergencesData, hasVolatilityIVData, hasMarketBreadthData].filter(Boolean).length;
    logger.info(`[PredictionCalc] Data availability: ${traditionalCount}/8 traditional, ${intradayFactorsCount}/6 intraday factors`);

    // Scores de factores TRADICIONALES (-100 a +100)
    const trendScore = hasHistoricalData ? this.calculateTrendScore(historical.change30d, historical.change90d) : 0;
    const technicalScore = hasTechnicalData ? technical.technicalScore : 0;
    const sentimentScore = hasSentimentData ? sentiment.overallScore : 0;
    const newsScore = hasNewsData ? news.sentimentScore : 0;
    const macroScore = hasMacroData ? macro.macroScore : 0;
    const forexScore = hasForexData ? forex.forexScore : 0;
    const institutionalScore = hasInstitutionalData ? institutional.institutionalScore : 0;
    const financialsScore = hasFinancialsData ? financials!.financialsScore : 0;
    
    // Scores de NUEVOS FACTORES INTRADÍA (-100 a +100)
    const intradayTrendScore = hasIntradayTrendData ? intradayTrend!.intradayTrendScore : 0;
    const optionsFlowScore = hasOptionsFlowData ? this.calculateOptionsFlowScore(optionsFlow!) : 0;
    const volumeProfileScore = hasVolumeProfileData ? this.calculateVolumeProfileScore(volumeProfile!) : 0;
    const divergencesScore = hasDivergencesData ? this.calculateDivergencesScore(divergences!) : 0;
    const volatilityIVScore = hasVolatilityIVData ? this.calculateVolatilityScore(volatilityIV!) : 0;
    const marketBreadthScore = hasMarketBreadthData ? this.calculateMarketBreadthScore(marketBreadth!) : 0;

    logger.info(`[PredictionCalc] Traditional scores: trend=${trendScore}, technical=${technicalScore}, sentiment=${sentimentScore}, news=${newsScore}`);
    if (timeframeDays <= 1) {
      logger.info(`[PredictionCalc] Intraday scores: intradayTrend=${intradayTrendScore}, optionsFlow=${optionsFlowScore}, volumeProfile=${volumeProfileScore}, divergences=${divergencesScore}, volatilityIV=${volatilityIVScore}, breadth=${marketBreadthScore}`);
    }

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

    // Definir los 8 factores (competitors, expectations y seasonality eliminados)
    // Definir TODOS los factores (tradicionales + intradía)
    const allFactors = [
      // Factores TRADICIONALES
      { name: 'trend', score: trendScore, hasData: hasHistoricalData, weight: weights.trend || 0 },
      { name: 'technical', score: technicalScore, hasData: hasTechnicalData, weight: weights.technical || 0 },
      { name: 'sentiment', score: sentimentScore, hasData: hasSentimentData, weight: weights.sentiment || 0 },
      { name: 'news', score: newsScore, hasData: hasNewsData, weight: weights.news || 0 },
      { name: 'macro', score: macroScore, hasData: hasMacroData, weight: weights.macro || 0 },
      { name: 'forex', score: forexScore, hasData: hasForexData, weight: weights.forex || 0 },
      { name: 'institutional', score: institutionalScore, hasData: hasInstitutionalData, weight: weights.institutional || 0 },
      { name: 'financials', score: financialsScore, hasData: hasFinancialsData, weight: weights.financials || 0 },
      // NUEVOS FACTORES INTRADÍA (solo tienen peso en intradía)
      { name: 'intradayTrend', score: intradayTrendScore, hasData: hasIntradayTrendData, weight: weights.intradayTrend || 0 },
      { name: 'optionsFlow', score: optionsFlowScore, hasData: hasOptionsFlowData, weight: weights.optionsFlow || 0 },
      { name: 'volumeProfile', score: volumeProfileScore, hasData: hasVolumeProfileData, weight: weights.volumeProfile || 0 },
      { name: 'divergences', score: divergencesScore, hasData: hasDivergencesData, weight: weights.divergences || 0 },
      { name: 'volatilityIV', score: volatilityIVScore, hasData: hasVolatilityIVData, weight: weights.volatilityIV || 0 },
      { name: 'marketBreadth', score: marketBreadthScore, hasData: hasMarketBreadthData, weight: weights.marketBreadth || 0 },
    ];

    // FILTRAR factores por los relevantes para este grupo de activo
    // Esto es CRÍTICO: crypto no debe usar financials, etc.
    const groupConfig = ASSET_GROUP_CONFIGS[assetGroup];
    const factors = allFactors.filter(f => groupConfig.relevantFactors.includes(f.name));
    
    logger.info(`[PredictionCalc] Factors for ${assetGroup}: ${factors.map(f => f.name).join(', ')} (filtered from ${allFactors.length})`);

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

    // Calcular confianza (assetGroup y groupConfig ya definidos arriba)
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
    
    // --- AJUSTE POR VOLATILIDAD EXTREMA ---
    // Activos con volatilidad >40% son menos predecibles
    // PERO: solo penalizar moderadamente, no destruir la confianza
    if (assetVolatility > 60) {
      const oldConf = finalConfidence;
      finalConfidence = Math.round(finalConfidence * 0.85); // -15% (antes era -40%)
      logger.info(`[PredictionCalc] Extreme volatility penalty (${assetVolatility.toFixed(0)}%): ${oldConf}% → ${finalConfidence}%`);
    } else if (assetVolatility > 40) {
      const oldConf = finalConfidence;
      finalConfidence = Math.round(finalConfidence * 0.90); // -10% (antes era -25%)
      logger.info(`[PredictionCalc] High volatility penalty (${assetVolatility.toFixed(0)}%): ${oldConf}% → ${finalConfidence}%`);
    }
    
    // --- AJUSTE POR MOVIMIENTO INTRADÍA EXTREMO ---
    // CORREGIDO: Solo penalizar si la predicción CONTRADICE el movimiento actual
    // Si el activo cae -5% y predecimos bajista, eso CONFIRMA la predicción (no penalizar)
    // Si el activo cae -5% y predecimos alcista, eso CONTRADICE (sí penalizar)
    const predictionDirection = expectedChange > 0 ? 'up' : expectedChange < 0 ? 'down' : 'neutral';
    const intradayDirection = intradayChange > 0.5 ? 'up' : intradayChange < -0.5 ? 'down' : 'neutral';
    const movementConfirms = (predictionDirection === intradayDirection) || intradayDirection === 'neutral';
    
    if (intradayChange < -10) {
      if (movementConfirms) {
        // Crash confirma predicción bajista → AUMENTAR confianza
        const oldConf = finalConfidence;
        finalConfidence = Math.min(95, finalConfidence + 10);
        logger.info(`[PredictionCalc] CRASH confirms bearish prediction (${intradayChange.toFixed(1)}%): conf ${oldConf}% → ${finalConfidence}%`);
      } else {
        // Crash contradice predicción alcista → penalizar fuerte
        const oldConf = finalConfidence;
        finalConfidence = Math.round(finalConfidence * 0.5);
        expectedChange = expectedChange * 0.3;
        logger.info(`[PredictionCalc] CRASH contradicts prediction (${intradayChange.toFixed(1)}%): conf ${oldConf}% → ${finalConfidence}%`);
      }
    } else if (intradayChange < -5) {
      if (movementConfirms) {
        // Caída fuerte confirma predicción bajista
        const oldConf = finalConfidence;
        finalConfidence = Math.min(95, finalConfidence + 5);
        logger.info(`[PredictionCalc] Severe drop confirms bearish (${intradayChange.toFixed(1)}%): conf ${oldConf}% → ${finalConfidence}%`);
      } else {
        // Caída fuerte contradice predicción alcista
        const oldConf = finalConfidence;
        finalConfidence = Math.round(finalConfidence * 0.65);
        expectedChange = expectedChange * 0.5;
        logger.info(`[PredictionCalc] Severe drop contradicts prediction (${intradayChange.toFixed(1)}%): conf ${oldConf}% → ${finalConfidence}%`);
      }
    } else if (intradayChange < -3) {
      if (!movementConfirms) {
        // Solo penalizar si contradice
        const oldConf = finalConfidence;
        finalConfidence = Math.round(finalConfidence * 0.85);
        logger.info(`[PredictionCalc] Significant drop contradicts prediction (${intradayChange.toFixed(1)}%): conf ${oldConf}% → ${finalConfidence}%`);
      }
    }
    // También para subidas fuertes
    else if (intradayChange > 10) {
      if (movementConfirms) {
        const oldConf = finalConfidence;
        finalConfidence = Math.min(95, finalConfidence + 10);
        logger.info(`[PredictionCalc] RALLY confirms bullish prediction (${intradayChange.toFixed(1)}%): conf ${oldConf}% → ${finalConfidence}%`);
      } else {
        const oldConf = finalConfidence;
        finalConfidence = Math.round(finalConfidence * 0.5);
        expectedChange = expectedChange * 0.3;
        logger.info(`[PredictionCalc] RALLY contradicts prediction (${intradayChange.toFixed(1)}%): conf ${oldConf}% → ${finalConfidence}%`);
      }
    } else if (intradayChange > 5) {
      if (movementConfirms) {
        const oldConf = finalConfidence;
        finalConfidence = Math.min(95, finalConfidence + 5);
        logger.info(`[PredictionCalc] Strong rally confirms bullish (${intradayChange.toFixed(1)}%): conf ${oldConf}% → ${finalConfidence}%`);
      } else {
        const oldConf = finalConfidence;
        finalConfidence = Math.round(finalConfidence * 0.65);
        expectedChange = expectedChange * 0.5;
        logger.info(`[PredictionCalc] Strong rally contradicts prediction (${intradayChange.toFixed(1)}%): conf ${oldConf}% → ${finalConfidence}%`);
      }
    }
    
    // --- AJUSTE POR MEAN REVERSION DESPUÉS DE CAÍDA FUERTE (SIMPLIFICADO) ---
    // Solo aplicar si: caída >5% reciente + VIX >25 (mercado en estrés real)
    // Elimina falsos positivos de correcciones menores
    let recentDropReboundInfo: { recentDrop: number; todayRecovery: number; adjustment: number } | undefined;
    const vixLevel = sentiment?.vix?.value || 15; // VIX por defecto 15 si no hay datos
    
    try {
      const trendData = await trendsService.analyzeTrend(symbol);
      if (trendData?.stats && trendData.currentStreak) {
        const worstDayRecent = trendData.stats.worst_day_30d?.change || 0;
        const streak = trendData.currentStreak;
        
        // CONDICIÓN ESTRICTA: Solo aplicar si hay estrés real del mercado
        const severeDropRecent = streak.direction === 'down' && (streak.totalChange || 0) < -5;
        const marketStressed = vixLevel > 25;
        
        if (severeDropRecent && marketStressed && intradayChange > -1 && intradayChange < 3) {
          const dropIntensity = Math.abs(streak.totalChange || 0);
          let reboundAdjustment = 0.15; // +15% ajuste fijo por mean reversion
          
          // Si hoy ya está rebotando, confirma el movimiento
          if (intradayChange > 0.5) {
            reboundAdjustment += 0.10;
            logger.info(`[PredictionCalc] Rebound confirmed: +${intradayChange.toFixed(1)}% today after drop`);
          }
          
          // Aplicar ajuste hacia arriba
          const oldChange = expectedChange;
          if (expectedChange < 0) {
            expectedChange = expectedChange * (1 - reboundAdjustment) + (reboundAdjustment * Math.abs(expectedChange) * 0.5);
          } else {
            expectedChange = expectedChange * (1 + reboundAdjustment * 0.5);
          }
          
          recentDropReboundInfo = {
            recentDrop: streak.totalChange || worstDayRecent,
            todayRecovery: intradayChange,
            adjustment: Math.round((expectedChange - oldChange) * 100) / 100,
          };
          
          logger.info(`[PredictionCalc] Mean reversion (VIX=${vixLevel.toFixed(0)}, drop=${dropIntensity.toFixed(1)}%): change ${oldChange.toFixed(2)}% → ${expectedChange.toFixed(2)}%`);
        }
      }
    } catch (e) {
      logger.debug(`[PredictionCalc] Could not analyze mean reversion: ${(e as Error).message}`);
    }
    
    // --- AJUSTE POR MOMENTUM INTRADÍA (SIMPLIFICADO) ---
    // Solo aplicar si movimiento >3% (movimientos menores son ruido)
    // Los movimientos pequeños (<3%) no tienen persistencia estadística
    let intradayMomentumInfo: { currentChange: number; projectedContinuation: number; adjustment: number; confidenceBoost: number } | undefined;
    if (Math.abs(intradayChange) >= 3.0) { // Umbral aumentado a 3%
      let momentumMultiplier = 0;
      let confidenceBoost = 0;
      
      // Solo 3 niveles simples
      if (Math.abs(intradayChange) >= 8) {
        // Movimiento extremo: posible agotamiento
        momentumMultiplier = 0.15;
        confidenceBoost = 5;
      } else if (Math.abs(intradayChange) >= 5) {
        // Movimiento fuerte
        momentumMultiplier = 0.25;
        confidenceBoost = 8;
      } else { // 3-5%
        // Movimiento moderado-fuerte
        momentumMultiplier = 0.20;
        confidenceBoost = 6;
      }
      
      const projectedContinuation = intradayChange * momentumMultiplier;
      const oldChange = expectedChange;
      const oldConfidence = finalConfidence;
      
      // Si momentum confirma predicción
      if ((expectedChange > 0 && intradayChange > 0) || (expectedChange < 0 && intradayChange < 0)) {
        expectedChange = expectedChange + projectedContinuation * 0.5;
        finalConfidence = Math.min(90, finalConfidence + confidenceBoost);
        logger.info(`[PredictionCalc] Intraday momentum confirms: ${intradayChange > 0 ? '+' : ''}${intradayChange.toFixed(1)}%`);
      }
      // Si conflicto, dar más peso al momentum actual
      else {
        expectedChange = expectedChange * 0.5 + projectedContinuation;
        finalConfidence = Math.max(30, finalConfidence - confidenceBoost);
        logger.info(`[PredictionCalc] Intraday momentum conflicts: ${intradayChange > 0 ? '+' : ''}${intradayChange.toFixed(1)}%`);
      }
      
      intradayMomentumInfo = {
        currentChange: intradayChange,
        projectedContinuation,
        adjustment: Math.round((expectedChange - oldChange) * 100) / 100,
        confidenceBoost: finalConfidence - oldConfidence,
      };
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
    
    // --- STREAK INFO (SOLO INFORMATIVO, NO MODIFICA PREDICCIÓN) ---
    // Razón: Las rachas no tienen valor predictivo estadístico demostrable
    // Se mantiene solo para mostrar contexto al usuario
    let streakAdjustmentInfo: { days: number; direction: string; adjustment: number } | undefined;
    try {
      const trendAnalysis = await trendsService.analyzeTrend(symbol);
      if (trendAnalysis?.currentStreak) {
        const streak = trendAnalysis.currentStreak;
        if (streak.days >= 2 && streak.direction !== 'sideways') {
          streakAdjustmentInfo = {
            days: streak.days,
            direction: streak.direction,
            adjustment: 0, // No se aplica ajuste, solo info
          };
          logger.debug(`[PredictionCalc] Current streak (info only): ${streak.days}d ${streak.direction}`);
        }
      }
    } catch (e) {
      logger.debug(`[PredictionCalc] Could not get streak data: ${(e as Error).message}`);
    }
    
    // --- AJUSTE POR CONTEXTO DE MERCADO GLOBAL (NUEVO) ---
    // Detecta correcciones, crashes, burbujas y ajusta predicciones en consecuencia
    // MEJORADO: Pasa el combinedScore para que el bias se reduzca si hay señales individuales fuertes
    let marketContextInfo: CalculatedPrediction['marketContext'];
    try {
      const marketContext = await broadMarketContextService.getCurrentContext();
      
      if (marketContext.condition !== 'neutral') {
        const contextAdjustment = broadMarketContextService.applyToPredicti(
          expectedChange,
          finalConfidence,
          this.inferAssetType(symbol, type),
          combinedScore // Pasar score individual para ajustar el bias
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
    
    // NOTA: Servicios eliminados por añadir ruido sin valor predictivo demostrable:
    // - preciousMetalsUSDService → Lógica integrada en forexService
    // - marketPsychologyService → Redundante con sentiment y technical
    // - geopoliticalEventsService → Shocks impredecibles, efecto ya reflejado en precio
    
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
    
    // NOTA: Ya NO se penaliza automáticamente las predicciones bajistas.
    // El ajuste por dirección del track-record ya considera el accuracy histórico.
    // Si las señales son fuertes (signalSummary=coherent_bearish), la confianza debe ser alta.
    
    // --- PENALIZACIÓN POR MAGNITUD EXTREMA ---
    // Predicciones muy grandes (>3% intradía, >6% swing) son estadísticamente improbables
    // Reducir confianza proporcionalmente para reflejar la incertidumbre
    const magnitudeThreshold = timeframeDays <= 1 ? 3.0 : 6.0;
    const absChange = Math.abs(expectedChange);
    if (absChange > magnitudeThreshold) {
      const excessRatio = (absChange - magnitudeThreshold) / magnitudeThreshold;
      const confidencePenalty = Math.min(25, Math.round(excessRatio * 20)); // Max -25%
      const oldConfidence = finalConfidence;
      finalConfidence = Math.max(15, finalConfidence - confidencePenalty);
      logger.info(`[PredictionCalc] Extreme magnitude penalty (${absChange.toFixed(2)}% > ${magnitudeThreshold}%): confidence ${oldConfidence}% → ${finalConfidence}%`);
    }
    
    // --- LÓGICA DE CONFIANZA BAJA = NEUTRAL (MEJORADA) ---
    // Si la confianza es < 50% Y el cambio predicho es pequeño, usar neutral
    // PERO: si el cambio predicho es significativo (>1%), mantener la dirección
    // Razón: La confianza baja ya comunica incertidumbre. Cambiar dirección a neutral
    // cuando predecimos +4% causa inconsistencia y scores incorrectos al verificar.
    const LOW_CONFIDENCE_THRESHOLD = 50;
    const SIGNIFICANT_CHANGE_THRESHOLD = 1.0; // 1% es un cambio significativo
    const absExpectedChange = Math.abs(expectedChange);
    
    if (finalConfidence < LOW_CONFIDENCE_THRESHOLD && direction !== 'neutral') {
      // Solo forzar neutral si el cambio predicho es pequeño
      if (absExpectedChange < SIGNIFICANT_CHANGE_THRESHOLD) {
        logger.info(`[PredictionCalc] Low confidence (${finalConfidence}%) + small change (${expectedChange.toFixed(2)}%) - changing to 'neutral'`);
        direction = 'neutral';
      } else {
        // Mantener dirección pero advertir que la confianza es baja
        logger.info(`[PredictionCalc] Low confidence (${finalConfidence}%) but significant change (${expectedChange.toFixed(2)}%) - keeping direction '${direction}'`);
      }
    }
    
    // --- CORRELACIÓN DE COMMODITIES (NUEVO) ---
    // Si es un commodity (oro, plata, etc.), ajustar para coherencia con el futuro base
    // SSLN.L, PHAG.MI, ISLN.L deben seguir la dirección de SI=F (plata)
    let commodityCorrelationInfo: { adjusted: boolean; reason: string | null } | undefined;
    const commodityAdjustment = await commodityCorrelationService.adjustPrediction(
      symbol,
      assetName,
      direction,
      expectedChange,
      finalConfidence
    );
    if (commodityAdjustment.adjusted) {
      direction = commodityAdjustment.newDirection;
      expectedChange = commodityAdjustment.newChange;
      finalConfidence = commodityAdjustment.newConfidence;
      commodityCorrelationInfo = {
        adjusted: true,
        reason: commodityAdjustment.reason,
      };
      logger.info(`[PredictionCalc] Commodity correlation adjustment: ${commodityAdjustment.reason}`);
    }
    
    logger.info(`[PredictionCalc] Scale factor: ${scaleFactor}, Expected change: ${expectedChange.toFixed(2)}%, Direction: ${direction}`);
    
    const margin = periodVol * 0.5;

    const predictedPriceMin = currentPrice * (1 + (expectedChange - margin) / 100);
    const predictedPriceMax = currentPrice * (1 + (expectedChange + margin) / 100);

    // Timeframe string
    const timeframeStr = timeframeDays <= 1 ? '1 día' : 
                        timeframeDays <= 7 ? `${timeframeDays} días` : 
                        `${Math.round(timeframeDays / 7)} semanas`;

    // --- GENERAR RECOMENDACIÓN INTELIGENTE ---
    // Considera: predicción + tendencia largo plazo + técnico + fundamental
    const recommendation = this.generateSmartRecommendation({
      direction,
      predictedChange: expectedChange,
      confidence: finalConfidence,
      change30d: historical.change30d || 0,
      change90d: historical.change90d || 0,
      volatility: historical.volatility || 20,
      intradayChange: intradayChange || 0,
      calendarRiskScore: 0, // Calendar Effects eliminado
      calendarDangerousCombination: false,
      technicalScore: technical?.technicalScore || 0,
      fundamentalScore: financials?.financialsScore || 0, // financialsScore es el nombre real
      targetVsCurrent: financials?.targetVsCurrent || 0,
    });

    // --- RISK FILTER: Calcular si se recomienda abstención ---
    const riskFilterResult = this.calculateRiskFilter({
      vixValue: sentiment?.vix?.value || 15,
      assetVolatility: assetVolatility,
      factorScores: factorScores,
      availableFactorsCount: availableFactors.length,
      totalFactorsCount: factors.length,
      signalSummary: signalSummary,
      earningsDaysUntil: events.nextEarnings?.daysUntil,
      marketCondition: marketContextInfo?.condition || 'neutral',
      intradayChange: intradayChange,
      trendAgreement: undefined, // TODO: integrar del trends.service cuando esté listo
    });
    
    if (riskFilterResult.shouldAbstain) {
      logger.info(`[PredictionCalc] RISK FILTER: Abstención recomendada (${riskFilterResult.abstentionLevel}) - ${riskFilterResult.reasons.join(', ')}`);
    }

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
      recommendation,
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
        meanReversionAdjustment: recentDropReboundInfo,
        intradayMomentumAdjustment: intradayMomentumInfo,
        commodityCorrelationAdjustment: commodityCorrelationInfo,
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
      riskFilter: riskFilterResult,
      // ELIMINADOS: preciousMetalsAnalysis, marketPsychology, geopoliticalEvents
      // Razón: Añadían ruido sin valor predictivo demostrable
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
    // UMBRALES AJUSTADOS: ±10 para capturar señales moderadas (antes ±15)
    // Un técnico de -14 DEBE contar como bajista, no neutral
    const SIGNAL_THRESHOLD = 10;
    const positiveFactors = availableFactors.filter(f => f.score > SIGNAL_THRESHOLD);
    const negativeFactors = availableFactors.filter(f => f.score < -SIGNAL_THRESHOLD);
    const neutralFactors = availableFactors.filter(f => f.score >= -SIGNAL_THRESHOLD && f.score <= SIGNAL_THRESHOLD);
    
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

  /**
   * Genera una recomendación inteligente basada en múltiples factores
   * SIMPLIFICADO: Eliminados psychology, precious metals, calendar effects
   */
  generateSmartRecommendation(params: {
    direction: 'up' | 'down' | 'neutral';
    predictedChange: number;
    confidence: number;
    change30d: number;
    change90d: number;
    volatility: number;
    intradayChange: number;
    calendarRiskScore: number;
    calendarDangerousCombination: boolean;
    technicalScore: number;
    fundamentalScore: number;
    targetVsCurrent: number;
  }): CalculatedPrediction['recommendation'] {
    const {
      direction, predictedChange, confidence, change30d, change90d,
      volatility, intradayChange,
      technicalScore, fundamentalScore, targetVsCurrent,
    } = params;

    let action: 'strong_buy' | 'buy' | 'hold' | 'reduce' | 'sell' | 'strong_sell' | 'wait' = 'hold';
    let reasoning = '';
    let timeHorizon: 'short' | 'medium' | 'long' = 'medium';
    let riskLevel: 'low' | 'medium' | 'high' | 'extreme' = 'medium';
    let isContrarian = false;
    const keyFactors: string[] = [];

    // === CASO 1: CAÍDA FUERTE CON BUENOS FUNDAMENTALES === 
    // Oportunidad contrarian si el activo tiene buenos fundamentales
    if (intradayChange < -5 && (fundamentalScore > 20 || targetVsCurrent > 10)) {
      keyFactors.push(`Caída fuerte hoy (${intradayChange.toFixed(1)}%)`);
      
      action = 'buy';
      isContrarian = true;
      reasoning = `Caída significativa pero los fundamentales son sólidos. `;
      reasoning += `Históricamente, comprar en caídas con buenos fundamentales da buenos resultados a medio/largo plazo.`;
      timeHorizon = 'long';
      riskLevel = 'high';
      keyFactors.push('Buenos fundamentales');
      if (targetVsCurrent > 10) keyFactors.push(`Target analistas +${targetVsCurrent.toFixed(0)}%`);
    }
    
    // === CASO 2: PREDICCIÓN ALCISTA CON ALTA CONFIANZA ===
    else if (direction === 'up' && confidence >= 65 && predictedChange > 1) {
      keyFactors.push(`Predicción alcista +${predictedChange.toFixed(1)}%`);
      keyFactors.push(`Confianza ${confidence}%`);
      
      if (technicalScore > 30 && fundamentalScore > 20) {
        action = 'strong_buy';
        reasoning = `Señales técnicas y fundamentales alineadas. Alta probabilidad de subida a corto/medio plazo.`;
        timeHorizon = 'medium';
        riskLevel = 'low';
        keyFactors.push('Técnico y fundamental alineados');
      } else if (technicalScore > 20 || change30d > 0) {
        action = 'buy';
        reasoning = `Tendencia favorable con buena confianza. Considerar entrada o aumentar posición.`;
        timeHorizon = 'medium';
        riskLevel = 'medium';
      } else {
        action = 'hold';
        reasoning = `Predicción positiva pero señales mixtas. Mantener si ya tienes posición.`;
        timeHorizon = 'medium';
        riskLevel = 'medium';
      }
    }
    
    // === CASO 5: PREDICCIÓN BAJISTA CON ALTA CONFIANZA ===
    else if (direction === 'down' && confidence >= 60 && predictedChange < -1) {
      keyFactors.push(`Predicción bajista ${predictedChange.toFixed(1)}%`);
      
      if (technicalScore < -30 && fundamentalScore < -20) {
        action = 'strong_sell';
        reasoning = `Señales técnicas y fundamentales negativas. Considerar salir o reducir significativamente.`;
        timeHorizon = 'short';
        riskLevel = 'high';
        keyFactors.push('Deterioro técnico y fundamental');
      } else if (change30d < -10) {
        action = 'sell';
        reasoning = `Tendencia bajista establecida. Considerar reducir exposición.`;
        timeHorizon = 'short';
        riskLevel = 'high';
      } else {
        action = 'reduce';
        reasoning = `Perspectiva negativa a corto plazo. Considerar reducir posición o ajustar stop-loss.`;
        timeHorizon = 'short';
        riskLevel = 'medium';
      }
    }
    
    // === CASO 6: ALTA VOLATILIDAD ===
    else if (volatility > 50) {
      keyFactors.push(`Volatilidad extrema (${volatility.toFixed(0)}%)`);
      
      action = 'wait';
      reasoning = `Volatilidad muy alta (${volatility.toFixed(0)}%). En estas condiciones, las predicciones son menos fiables. `;
      reasoning += `Considera reducir tamaño de posición o esperar a que se estabilice.`;
      timeHorizon = 'short';
      riskLevel = 'extreme';
    }
    
    // === CASO 7: NEUTRAL / SIN SEÑAL CLARA ===
    else if (direction === 'neutral' || confidence < 50) {
      action = 'hold';
      reasoning = `Sin señal clara de dirección. El mercado está indeciso. Mantener posición actual y seguir plan.`;
      timeHorizon = 'medium';
      riskLevel = 'medium';
      keyFactors.push('Señal neutral');
    }
    
    // === CASO DEFAULT ===
    else {
      action = 'hold';
      reasoning = `Condiciones mixtas. Mantener estrategia actual y revisar si cambian las condiciones.`;
      timeHorizon = 'medium';
      riskLevel = 'medium';
    }

    // Determinar emoji
    const actionEmojis: Record<string, string> = {
      strong_buy: '🚀',
      buy: '💚',
      hold: '🤝',
      reduce: '⚡',
      sell: '🔴',
      strong_sell: '🚨',
      wait: '⏳',
    };

    const actionTitles: Record<string, string> = {
      strong_buy: 'Compra Fuerte',
      buy: 'Comprar',
      hold: 'Mantener',
      reduce: 'Reducir',
      sell: 'Vender',
      strong_sell: 'Venta Urgente',
      wait: 'Esperar',
    };

    return {
      action,
      emoji: actionEmojis[action],
      title: actionTitles[action],
      reasoning,
      timeHorizon,
      riskLevel,
      isContrarian,
      keyFactors,
    };
  },

  /**
   * RISK FILTER: Calcula si se recomienda abstención basándose en múltiples indicadores de riesgo
   * Devuelve un score de 0-100 donde >50 sugiere considerar abstención
   */
  calculateRiskFilter(params: {
    vixValue: number;
    assetVolatility: number;
    factorScores: Record<string, number>;
    availableFactorsCount: number;
    totalFactorsCount: number;
    signalSummary: string;
    earningsDaysUntil?: number;
    marketCondition: string;
    intradayChange: number;
    trendAgreement?: 'aligned_bullish' | 'aligned_bearish' | 'divergent' | 'neutral';
  }): NonNullable<CalculatedPrediction['riskFilter']> {
    const {
      vixValue,
      assetVolatility,
      factorScores,
      availableFactorsCount,
      totalFactorsCount,
      signalSummary,
      earningsDaysUntil,
      marketCondition,
      intradayChange,
      trendAgreement,
    } = params;

    const reasons: string[] = [];
    let abstentionScore = 0;

    // === FACTOR 1: VIX Extremo (miedo del mercado) ===
    const vixExtreme = vixValue > 30;
    if (vixExtreme) {
      abstentionScore += 25;
      reasons.push(`VIX elevado (${vixValue.toFixed(1)}) - mercado en modo pánico`);
    } else if (vixValue > 25) {
      abstentionScore += 10;
      reasons.push(`VIX moderadamente alto (${vixValue.toFixed(1)})`);
    }

    // === FACTOR 2: Volatilidad del activo extrema ===
    const volatilityExtreme = assetVolatility > 50;
    if (volatilityExtreme) {
      abstentionScore += 20;
      reasons.push(`Volatilidad del activo extrema (${assetVolatility.toFixed(0)}%)`);
    } else if (assetVolatility > 35) {
      abstentionScore += 10;
      reasons.push(`Volatilidad alta del activo (${assetVolatility.toFixed(0)}%)`);
    }

    // === FACTOR 3: Señales conflictivas entre factores ===
    const scores = Object.values(factorScores).filter(s => s !== 0);
    const positiveScores = scores.filter(s => s > 10).length;
    const negativeScores = scores.filter(s => s < -10).length;
    const conflictingSignals = positiveScores >= 2 && negativeScores >= 2;
    if (conflictingSignals) {
      abstentionScore += 20;
      reasons.push(`Señales conflictivas (${positiveScores} alcistas vs ${negativeScores} bajistas)`);
    }

    // === FACTOR 4: Poca calidad de datos ===
    const dataQualityRatio = availableFactorsCount / totalFactorsCount;
    const lowDataQuality = dataQualityRatio < 0.5;
    if (lowDataQuality) {
      abstentionScore += 15;
      reasons.push(`Pocos datos disponibles (${availableFactorsCount}/${totalFactorsCount} factores)`);
    } else if (dataQualityRatio < 0.7) {
      abstentionScore += 5;
    }

    // === FACTOR 5: Divergencia de tendencias (si está disponible) ===
    const trendDivergence = trendAgreement === 'divergent';
    if (trendDivergence) {
      abstentionScore += 15;
      reasons.push('Divergencia entre timeframes (corto/medio/largo no alineados)');
    }

    // === FACTOR 6: Earnings inminentes ===
    const earningsNear = earningsDaysUntil !== undefined && earningsDaysUntil <= 3;
    if (earningsNear) {
      abstentionScore += 25;
      reasons.push(`Earnings en ${earningsDaysUntil} día(s) - alta incertidumbre`);
    } else if (earningsDaysUntil !== undefined && earningsDaysUntil <= 7) {
      abstentionScore += 10;
      reasons.push(`Earnings próximos (${earningsDaysUntil} días)`);
    }

    // === FACTOR 7: Mercado en crash ===
    const marketCrash = marketCondition === 'crash' || marketCondition === 'severe_correction';
    if (marketCrash) {
      abstentionScore += 30;
      reasons.push(`Mercado en ${marketCondition === 'crash' ? 'crash' : 'corrección severa'}`);
    } else if (marketCondition === 'correction') {
      abstentionScore += 10;
      reasons.push('Mercado en corrección');
    }

    // === FACTOR 8: Movimiento intradía extremo ===
    if (Math.abs(intradayChange) > 8) {
      abstentionScore += 15;
      reasons.push(`Movimiento intradía extremo (${intradayChange > 0 ? '+' : ''}${intradayChange.toFixed(1)}%)`);
    } else if (Math.abs(intradayChange) > 5) {
      abstentionScore += 5;
    }

    // === FACTOR 9: Signal summary indica datos insuficientes ===
    if (signalSummary === 'insufficient') {
      abstentionScore += 20;
      reasons.push('Datos insuficientes para predicción confiable');
    } else if (signalSummary === 'mixed') {
      abstentionScore += 5;
    }

    // Limitar score a 100
    abstentionScore = Math.min(100, abstentionScore);

    // Determinar nivel de abstención
    let abstentionLevel: 'none' | 'caution' | 'warning' | 'critical';
    let shouldAbstain: boolean;

    if (abstentionScore >= 60) {
      abstentionLevel = 'critical';
      shouldAbstain = true;
    } else if (abstentionScore >= 40) {
      abstentionLevel = 'warning';
      shouldAbstain = true;
    } else if (abstentionScore >= 20) {
      abstentionLevel = 'caution';
      shouldAbstain = false;
    } else {
      abstentionLevel = 'none';
      shouldAbstain = false;
    }

    return {
      shouldAbstain,
      abstentionLevel,
      abstentionScore,
      reasons: reasons.length > 0 ? reasons : ['Sin factores de riesgo significativos'],
      riskFactors: {
        vixExtreme,
        volatilityExtreme,
        conflictingSignals,
        lowDataQuality,
        trendDivergence,
        earningsNear,
        marketCrash,
      },
    };
  },

  // ============================================================================
  // FUNCIONES HELPER PARA NUEVOS FACTORES INTRADÍA
  // ============================================================================

  /**
   * Calcula score del Options Flow (-100 a +100)
   * Put/Call < 0.7 = muy bullish, > 1.3 = muy bearish
   */
  calculateOptionsFlowScore(data: OptionsFlowData): number {
    if (!data.hasData) return 0;
    
    let score = 0;
    
    // Put/Call Ratio: <0.7 bullish (+40), >1.3 bearish (-40)
    if (data.putCallRatio < 0.5) score += 50;
    else if (data.putCallRatio < 0.7) score += 30;
    else if (data.putCallRatio < 0.85) score += 15;
    else if (data.putCallRatio > 1.3) score -= 40;
    else if (data.putCallRatio > 1.1) score -= 25;
    else if (data.putCallRatio > 1.0) score -= 10;
    
    // IV Signal: extreme IV = contrarian opportunity
    if (data.ivSignal === 'extreme') {
      // IV extrema puede indicar movimiento esperado - añadir incertidumbre
      score *= 0.8;
    } else if (data.ivSignal === 'low') {
      // IV baja = mercado confiado
      score += 10;
    }
    
    // Max Pain: si precio lejos del max pain, esperar regresión
    if (data.maxPainDistance !== null) {
      if (data.maxPainDistance > 5) score -= 10; // Precio muy arriba del max pain
      else if (data.maxPainDistance < -5) score += 10; // Precio muy abajo del max pain
    }
    
    // Unusual Activity
    if (data.unusualActivity) {
      // Actividad inusual aumenta la señal en la dirección del overall signal
      const boost = data.overallSignal === 'bullish' ? 15 : data.overallSignal === 'bearish' ? -15 : 0;
      score += boost;
    }
    
    return Math.max(-100, Math.min(100, score));
  },

  /**
   * Calcula score del Volume Profile (-100 a +100)
   * Precio en Value Area = neutral, arriba/abajo = direccional
   */
  calculateVolumeProfileScore(data: VolumeProfileData): number {
    if (!data.hasData) return 0;
    
    let score = 0;
    
    // Posición respecto al Value Area
    switch (data.priceLocation) {
      case 'above_va':
        score += 30; // Bullish: rompió arriba
        break;
      case 'below_va':
        score -= 30; // Bearish: rompió abajo
        break;
      case 'at_poc':
        score += 5; // Ligeramente bullish: en zona de equilibrio
        break;
      case 'in_va':
        score += 0; // Neutral
        break;
    }
    
    // Ajustar por señal del servicio
    if (data.signal === 'bullish') score += 15;
    else if (data.signal === 'bearish') score -= 15;
    
    // High Volume Nodes cercanos pueden actuar como soporte/resistencia
    for (const hvn of data.highVolumeNodes) {
      const distance = ((data.currentPrice - hvn.price) / data.currentPrice) * 100;
      if (hvn.type === 'support' && distance > 0 && distance < 2) {
        score += 10; // Soporte cercano por debajo
      } else if (hvn.type === 'resistance' && distance < 0 && distance > -2) {
        score -= 10; // Resistencia cercana por arriba
      }
    }
    
    return Math.max(-100, Math.min(100, score));
  },

  /**
   * Calcula score de Divergencias (-100 a +100)
   * Divergencia alcista = +score, bajista = -score
   */
  calculateDivergencesScore(data: DivergenceAnalysis): number {
    if (!data.hasDivergence || data.signals.length === 0) return 0;
    
    let totalScore = 0;
    
    for (const signal of data.signals) {
      let signalScore = 0;
      
      // Base score según tipo
      signalScore = signal.type === 'bullish' ? signal.confidence * 0.6 : -signal.confidence * 0.6;
      
      // Ajustar por fuerza de la divergencia
      switch (signal.strength) {
        case 'strong': signalScore *= 1.3; break;
        case 'moderate': signalScore *= 1.0; break;
        case 'weak': signalScore *= 0.7; break;
      }
      
      // Ponderar por indicador (RSI más confiable, luego MACD, luego Stochastic)
      switch (signal.indicator) {
        case 'RSI': signalScore *= 1.2; break;
        case 'MACD': signalScore *= 1.0; break;
        case 'Stochastic': signalScore *= 0.8; break;
      }
      
      totalScore += signalScore;
    }
    
    // Promedio si hay múltiples señales, pero dar bonus por confirmación
    if (data.signals.length > 1) {
      totalScore = (totalScore / data.signals.length) * 1.2; // 20% bonus por confirmación
    }
    
    return Math.max(-100, Math.min(100, totalScore));
  },

  /**
   * Calcula score de Volatilidad IV/RV (-100 a +100)
   * IV > RV = opciones caras (posible sobrecompra), IV < RV = opciones baratas
   */
  calculateVolatilityScore(data: VolatilityData): number {
    if (!data.hasData) return 0;
    
    let score = 0;
    
    // IV vs RV Spread: contrarian indicator
    // IV muy alta respecto a RV puede indicar techo (miedo excesivo)
    // IV muy baja respecto a RV puede indicar suelo (complacencia)
    const spread = data.ivRvSpread;
    
    if (spread > 20) {
      // IV mucho mayor que RV: mercado espera volatilidad, potencial contrarian bullish
      score += 15;
    } else if (spread > 10) {
      score += 8;
    } else if (spread < -20) {
      // RV mucho mayor que IV: mercado complaciente, potencial contrarian bearish
      score -= 15;
    } else if (spread < -10) {
      score -= 8;
    }
    
    // IV Percentile: extremos son contrarian
    if (data.ivPercentile > 90) {
      score += 20; // IV en máximos históricos = posible suelo
    } else if (data.ivPercentile > 70) {
      score += 10;
    } else if (data.ivPercentile < 10) {
      score -= 20; // IV en mínimos históricos = posible techo
    } else if (data.ivPercentile < 30) {
      score -= 10;
    }
    
    // Régimen de volatilidad
    switch (data.volatilityRegime) {
      case 'extreme': score *= 0.7; break; // Reducir confianza en extremos
      case 'high': score *= 0.85; break;
      case 'normal': break;
      case 'low': score *= 0.9; break;
    }
    
    return Math.max(-100, Math.min(100, score));
  },

  /**
   * Calcula score del Market Breadth (-100 a +100)
   * A/D ratio alto = mercado sano, bajo = divergencia peligrosa
   */
  calculateMarketBreadthScore(data: MarketBreadthData): number {
    if (!data.hasData) return 0;
    
    let score = 0;
    
    // Advance/Decline Ratio
    if (data.advanceDeclineRatio > 2.0) score += 40;
    else if (data.advanceDeclineRatio > 1.5) score += 25;
    else if (data.advanceDeclineRatio > 1.2) score += 15;
    else if (data.advanceDeclineRatio < 0.5) score -= 40;
    else if (data.advanceDeclineRatio < 0.7) score -= 25;
    else if (data.advanceDeclineRatio < 0.85) score -= 15;
    
    // % Above 200MA: salud a largo plazo
    if (data.percentAbove200MA > 70) score += 15;
    else if (data.percentAbove200MA > 50) score += 5;
    else if (data.percentAbove200MA < 30) score -= 15;
    else if (data.percentAbove200MA < 50) score -= 5;
    
    // Divergencia mercado: peligrosa si SPY sube pero pocas acciones suben
    switch (data.divergence) {
      case 'bullish_divergence':
        score += 20; // Mercado baja pero breadth mejora
        break;
      case 'bearish_divergence':
        score -= 25; // Mercado sube pero breadth empeora (peligroso)
        break;
      case 'confirmed':
        score += 10; // Movimiento confirmado por breadth
        break;
    }
    
    // Market Health
    switch (data.marketHealth) {
      case 'excellent': score += 15; break;
      case 'good': score += 8; break;
      case 'fair': break;
      case 'weak': score -= 10; break;
      case 'critical': score -= 20; break;
    }
    
    return Math.max(-100, Math.min(100, score));
  },
};

// Variable auxiliar para el asset name
let quote: any = null;
