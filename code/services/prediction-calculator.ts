/**
 * Servicio para calcular predicciones de forma DETERMINÍSTICA
 * basándose en datos reales de mercado y sentimiento.
 * 
 * NO usa IA para los números, solo datos matemáticos reales.
 * Los pesos de factores pueden ser optimizados por el sistema ML de Python.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { accuracyPredictorService, ExpectedAccuracy } from './accuracy-predictor-service';
import { companyFinancialsService, FinancialSummary } from './company-financials-service';
import { CompetitorAnalysis, competitorsService } from './competitors-service';
import { CorporateEvents, corporateEventsService } from './corporate-events-service';
import { currencyService } from './currency-service';
import { ExpectationsData, expectationsService } from './expectations-service';
import { forexAnalysisService, ForexImpact } from './forex-analysis-service';
import { InstitutionalActivity, institutionalInvestorsService } from './institutional-investors-service';
import { macroEconomicService, MacroIndicators } from './macro-economic-service';
import { newsService, NewsSummary } from './news-service';
import { optionsService } from './options-service';
import { SeasonalityAnalysis, seasonalityService } from './seasonality-service';
import { sentimentService } from './sentiment-service';
import { TechnicalAnalysis, technicalIndicatorsService } from './technical-indicators-service';
import { uncertaintyAnalysisService } from './uncertainty-analysis-service';
import { vixService } from './vix-service';
import { HistoricalData, yahooFinanceService } from './yahoo-finance-service';

// Clave para pesos aprendidos en AsyncStorage
const LEARNED_WEIGHTS_KEY = 'learned-weights';

// Interfaz para pesos aprendidos
interface LearnedWeights {
  version: string;
  updated_at: string | null;
  training_samples: number;
  weights: {
    intraday: Record<string, number>;
    swing: Record<string, number>;
    long: Record<string, number>;
  } | null;
}

export interface CalculatedPrediction {
  asset: string;
  symbol: string; // Símbolo exacto (ej: "AMZN", "ITX.MC", "BTC-USD")
  assetType: 'stock' | 'crypto' | 'forex' | 'commodity' | 'index' | 'other';
  currentPrice: number;
  currency: string;
  
  // Predicción calculada
  predictedPriceMin: number;
  predictedPriceMax: number;
  predictedChange: number;
  direction: 'up' | 'down' | 'neutral';
  confidence: number;
  
  // Meta-learning: Uncertainty analysis
  uncertaintyScore?: number; // 0-100, donde 100 = máxima incertidumbre
  shouldPredict?: boolean; // false si la incertidumbre es muy alta
  uncertaintyWarning?: string; // Mensaje de advertencia si hay alta incertidumbre
  uncertaintyReasons?: string[]; // Razones principales de la incertidumbre
  
  // NUEVO: Desglose de factores usados
  factorBreakdown: {
    assetGroup: string; // Grupo del activo (large_cap, crypto_major, etc.)
    assetGroupDescription: string; // Descripción legible
    relevantFactors: string[]; // Factores que aplican a este tipo de activo
    availableFactors: { name: string; score: number; hasData: boolean }[]; // Todos los factores con su score
    weightsUsed: Record<string, number>; // Pesos usados para cada factor (para ML)
    usingLearnedWeights: boolean; // Si se usaron pesos aprendidos por ML
    confidenceExplanation: string; // Por qué la confianza es X%
    signalSummary: 'coherent_bullish' | 'coherent_bearish' | 'mixed' | 'neutral' | 'insufficient';
  };
  
  // Datos base usados para el cálculo
  sentiment: {
    score: number; // 0-100, donde 50 es neutral
    source: string;
    hasData: boolean; // NUEVO: indica si es dato real
    // Nuevos indicadores de sentimiento institucional
    vix?: {
      value: number;
      sentiment: 'extreme_fear' | 'fear' | 'neutral' | 'complacency' | 'extreme_complacency';
      score: number;
    };
    putCallRatio?: {
      ratio: number;
      sentiment: 'extreme_fear' | 'bearish' | 'neutral' | 'bullish' | 'extreme_greed';
      score: number;
    };
    overallScore?: number; // Score combinado -100 a +100
  };
  historical: {
    change30d: number;
    change90d: number;
    volatility: number;
    hasData: boolean; // NUEVO
  };
  
  // Datos financieros (solo para acciones)
  financials?: FinancialSummary;
  
  // Noticias recientes
  news?: {
    sentiment: 'positive' | 'negative' | 'neutral';
    score: number;
    count: number;
    summary: string;
  };
  
  // Indicadores macroeconómicos
  macro?: {
    region: string;
    outlook: 'favorable' | 'neutral' | 'unfavorable';
    score: number;
    summary: string;
  };
  
  // Análisis de competidores
  competitors?: {
    sector: string;
    sectorTrend: 'bullish' | 'bearish' | 'neutral';
    outperforming: boolean;
    score: number;
    summary: string;
    competitorNames: string[];
  };
  
  // Análisis de tipos de cambio
  forex?: {
    baseCurrency: string;
    trend: 'eur_strong' | 'eur_weak' | 'stable';
    score: number;
    summary: string;
    mainPairs: string[]; // EUR/USD, EUR/GBP, etc.
  };
  
  // Movimientos de inversores institucionales
  institutional?: {
    ownershipPercent?: number; // % en manos de instituciones
    numberOfInstitutions?: number;
    ownershipTrend?: 'increasing' | 'decreasing' | 'stable';
    insiderNetShares?: number;
    insiderNetValue?: number;
    insiderTrend?: 'buying' | 'selling' | 'neutral';
    topHolders: string[]; // Nombres de principales fondos
    score: number;
    summary: string;
  };
  
  // Estacionalidad del mercado (festivos y eventos por país)
  seasonality?: {
    sector: string;
    region: string;
    events: string[]; // Nombres de eventos activos
    score: number;
    summary: string;
  };
  
  // Análisis técnico (indicadores)
  technicalAnalysis?: {
    trend: 'strong_bullish' | 'bullish' | 'neutral' | 'bearish' | 'strong_bearish';
    score: number; // -100 a +100
    rsi14?: number;
    rsiSignal: 'oversold' | 'overbought' | 'neutral';
    macdTrend: 'bullish' | 'bearish' | 'neutral';
    priceVsSMA200: 'above' | 'below';
    priceVsSMA50: 'above' | 'below';
    goldenCross: boolean;
    deathCross: boolean;
    bollingerPosition: 'above' | 'below' | 'inside';
    volumeSignal: 'high' | 'low' | 'normal';
    signals: string[]; // Descripciones de señales activas
    summary: string;
  };
  
  // Eventos corporativos (earnings, dividendos, upgrades/downgrades)
  corporateEvents?: {
    nextEarningsDate?: Date;
    daysUntilEarnings?: number;
    earningsImpact: number;
    hasDividendUpcoming: boolean;
    analystActionsCount: number;
    analystActionsImpact: number;
    overallImpact: number;
    summary: string;
  };
  
  // Expectativas del mercado (earnings surprise, revisiones, próx. earnings)
  expectations?: {
    lastEpsSurprise: number | null;
    avgEpsSurprise: number | null;
    lastRevenueSurprise: number | null;
    avgRevenueSurprise: number | null;
    beatRate: number; // % de veces que superó estimaciones
    revisionTrend: 'up' | 'down' | 'stable' | 'unknown';
    nextEarningsDays: number | null;
    earningsRisk: 'high' | 'medium' | 'low';
    score: number;
    dataQuality: 'high' | 'medium' | 'low';
    summary: string;
  };
  
  timeframe: string;
  calculatedAt: Date;
  
  // NUEVO: Predicción de accuracy basada en historial
  expectedAccuracy?: {
    score: number; // 0-100, accuracy esperado basado en historial
    quality: 'excellent' | 'good' | 'poor' | 'failed';
    directionProbability: number; // 0-100, probabilidad de acertar dirección
    confidence: 'high' | 'medium' | 'low'; // Confianza en esta estimación
    basedOnSamples: number; // En cuántas predicciones similares se basa
    explanation: string;
    suggestedTimeframe?: string; // Si hay un timeframe mejor
  };
  
  // AUDITORÍA: Para verificar que los datos son reales
  audit: {
    dataSources: {
      name: string;
      url: string;
      fetchedAt: Date;
      rawValue?: string; // Valor crudo obtenido
    }[];
    calculationSteps: {
      step: string;
      formula: string;
      result: number;
    }[];
    combinedScoreBreakdown: string; // Fórmula completa del score
    expectedChangeBreakdown: string; // Cómo se calculó el % de cambio
  };
}

interface SentimentData {
  bullishPercent: number;
  source: string;
  hasData: boolean; // NUEVO: indica si hay datos reales de sentimiento
}

// ============================================================================
// GRUPOS DE ACTIVOS Y FACTORES RELEVANTES
// Cada tipo de activo tiene factores que aplican y factores que NO aplican
// ============================================================================

type AssetGroup = 
  | 'large_cap_stock'      // Acciones grandes (AAPL, MSFT, etc.)
  | 'small_cap_stock'      // Acciones pequeñas/medianas
  | 'crypto_major'         // Bitcoin, Ethereum
  | 'crypto_alt'           // Altcoins
  | 'etf_index'            // ETFs e índices
  | 'commodity'            // Materias primas
  | 'reit'                 // REITs inmobiliarios
  | 'forex'                // Pares de divisas
  | 'adr'                  // ADRs (acciones extranjeras en USA)
  | 'default';             // Fallback

interface AssetGroupConfig {
  relevantFactors: string[];  // Factores que SÍ aplican
  minFactorsForHighConfidence: number; // Mínimo para >70% confianza
  description: string;
}

const ASSET_GROUP_CONFIGS: Record<AssetGroup, AssetGroupConfig> = {
  large_cap_stock: {
    relevantFactors: ['trend', 'sentiment', 'news', 'macro', 'competitors', 'forex', 'institutional', 'seasonality', 'financials', 'expectations'],
    minFactorsForHighConfidence: 5,
    description: 'Acciones de gran capitalización',
  },
  small_cap_stock: {
    relevantFactors: ['trend', 'news', 'competitors', 'seasonality', 'financials'],
    minFactorsForHighConfidence: 3,
    description: 'Acciones pequeñas/medianas (menos cobertura de analistas)',
  },
  crypto_major: {
    relevantFactors: ['trend', 'sentiment', 'news', 'macro'],
    minFactorsForHighConfidence: 2,
    description: 'Criptomonedas principales (BTC, ETH)',
  },
  crypto_alt: {
    relevantFactors: ['trend', 'sentiment', 'news'],
    minFactorsForHighConfidence: 2,
    description: 'Altcoins (alta volatilidad, menos datos)',
  },
  etf_index: {
    relevantFactors: ['trend', 'macro', 'seasonality', 'forex'],
    minFactorsForHighConfidence: 2,
    description: 'ETFs e índices bursátiles',
  },
  commodity: {
    relevantFactors: ['trend', 'macro', 'seasonality', 'forex'],
    minFactorsForHighConfidence: 2,
    description: 'Materias primas (oro, petróleo, etc.)',
  },
  reit: {
    relevantFactors: ['trend', 'macro', 'financials', 'seasonality'],
    minFactorsForHighConfidence: 2,
    description: 'REITs inmobiliarios',
  },
  forex: {
    relevantFactors: ['trend', 'macro', 'news'],
    minFactorsForHighConfidence: 2,
    description: 'Pares de divisas',
  },
  adr: {
    relevantFactors: ['trend', 'news', 'forex', 'macro', 'competitors', 'financials'],
    minFactorsForHighConfidence: 3,
    description: 'ADRs (acciones extranjeras)',
  },
  default: {
    relevantFactors: ['trend', 'sentiment', 'news', 'macro'],
    minFactorsForHighConfidence: 2,
    description: 'Activo genérico',
  },
};

// Mapeo de símbolos conocidos a grupos
const SYMBOL_TO_GROUP: Record<string, AssetGroup> = {
  // Crypto Major
  'BTC-USD': 'crypto_major',
  'ETH-USD': 'crypto_major',
  'BNB-USD': 'crypto_major',
  
  // Crypto Alt
  'SOL-USD': 'crypto_alt',
  'ADA-USD': 'crypto_alt',
  'DOGE-USD': 'crypto_alt',
  'XRP-USD': 'crypto_alt',
  'SHIB-USD': 'crypto_alt',
  'AVAX-USD': 'crypto_alt',
  'DOT-USD': 'crypto_alt',
  'MATIC-USD': 'crypto_alt',
  'LINK-USD': 'crypto_alt',
  'UNI-USD': 'crypto_alt',
  
  // ETFs/Índices
  'SPY': 'etf_index',
  'QQQ': 'etf_index',
  'IWM': 'etf_index',
  'DIA': 'etf_index',
  'VOO': 'etf_index',
  'VTI': 'etf_index',
  '^GSPC': 'etf_index',
  '^DJI': 'etf_index',
  '^IXIC': 'etf_index',
  '^IBEX': 'etf_index',
  
  // Commodities
  'GC=F': 'commodity',
  'SI=F': 'commodity',
  'CL=F': 'commodity',
  'NG=F': 'commodity',
  'GLD': 'commodity',
  'SLV': 'commodity',
  'USO': 'commodity',
  
  // REITs
  'O': 'reit',
  'VNQ': 'reit',
  'SPG': 'reit',
  'AMT': 'reit',
  'PLD': 'reit',
  
  // Large Cap conocidas
  'AAPL': 'large_cap_stock',
  'MSFT': 'large_cap_stock',
  'GOOGL': 'large_cap_stock',
  'GOOG': 'large_cap_stock',
  'AMZN': 'large_cap_stock',
  'META': 'large_cap_stock',
  'NVDA': 'large_cap_stock',
  'TSLA': 'large_cap_stock',
  'BRK-B': 'large_cap_stock',
  'JPM': 'large_cap_stock',
  'V': 'large_cap_stock',
  'MA': 'large_cap_stock',
  'JNJ': 'large_cap_stock',
  'WMT': 'large_cap_stock',
  'PG': 'large_cap_stock',
  'UNH': 'large_cap_stock',
  'HD': 'large_cap_stock',
  'DIS': 'large_cap_stock',
  'NFLX': 'large_cap_stock',
  'ADBE': 'large_cap_stock',
  'CRM': 'large_cap_stock',
  'PYPL': 'large_cap_stock',
  'INTC': 'large_cap_stock',
  'AMD': 'large_cap_stock',
  'CSCO': 'large_cap_stock',
  'PEP': 'large_cap_stock',
  'KO': 'large_cap_stock',
  'MCD': 'large_cap_stock',
  'NKE': 'large_cap_stock',
  'BA': 'large_cap_stock',
  'IBM': 'large_cap_stock',
  'GS': 'large_cap_stock',
  'MS': 'large_cap_stock',
  'C': 'large_cap_stock',
  'BAC': 'large_cap_stock',
  'WFC': 'large_cap_stock',
  
  // ADRs
  'BABA': 'adr',
  'TSM': 'adr',
  'NIO': 'adr',
  'JD': 'adr',
  'BIDU': 'adr',
  'PDD': 'adr',
  
  // Grandes europeas
  'ITX.MC': 'large_cap_stock',
  'SAN.MC': 'large_cap_stock',
  'TEF.MC': 'large_cap_stock',
  'IBE.MC': 'large_cap_stock',
  'BBVA.MC': 'large_cap_stock',
  'REP.MC': 'large_cap_stock',
  'MC.PA': 'large_cap_stock',
  'OR.PA': 'large_cap_stock',
  'SAP.DE': 'large_cap_stock',
  'SIE.DE': 'large_cap_stock',
  'VOW3.DE': 'large_cap_stock',
  'BMW.DE': 'large_cap_stock',
  'SHELL.L': 'large_cap_stock',
  'HSBA.L': 'large_cap_stock',
  'BP.L': 'large_cap_stock',
  'AZN.L': 'large_cap_stock',
  'NESN.SW': 'large_cap_stock',
  'NOVN.SW': 'large_cap_stock',
  'ROG.SW': 'large_cap_stock',
};

/**
 * Detecta el grupo de un activo
 */
function detectAssetGroup(symbol: string, type: 'stock' | 'crypto', hasExpectations: boolean, hasInstitutional: boolean): AssetGroup {
  // 1. Buscar en el mapeo conocido
  if (SYMBOL_TO_GROUP[symbol]) {
    return SYMBOL_TO_GROUP[symbol];
  }
  
  // 2. Inferir por tipo y características
  if (type === 'crypto') {
    // Major cryptos tienen más market cap (simplificado)
    const majorCryptos = ['BTC', 'ETH', 'BNB', 'XRP', 'SOL'];
    const base = symbol.replace('-USD', '');
    return majorCryptos.includes(base) ? 'crypto_major' : 'crypto_alt';
  }
  
  // 3. Para acciones, inferir por disponibilidad de datos
  if (type === 'stock') {
    // Si tiene expectativas de analistas e institucionales, probablemente es large cap
    if (hasExpectations && hasInstitutional) {
      return 'large_cap_stock';
    }
    
    // Si es un índice o ETF (contiene ^ o termina en ciertos sufijos)
    if (symbol.startsWith('^') || symbol.endsWith('=F')) {
      return symbol.endsWith('=F') ? 'commodity' : 'etf_index';
    }
    
    // Por defecto, small cap (menos datos esperados)
    return 'small_cap_stock';
  }
  
  return 'default';
}

class PredictionCalculatorService {
  /**
   * Calcula una predicción basada 100% en datos reales
   */
  async calculatePrediction(
    symbol: string,
    type: 'stock' | 'crypto',
    timeframeDays: number = 1
  ): Promise<CalculatedPrediction | null> {
    try {
      console.log(`[PredictionCalc] Calculando predicción para ${symbol} (${type})`);

      // 1. Obtener datos de mercado reales
      const [quote, historical] = await Promise.all([
        yahooFinanceService.getQuote(symbol, type),
        yahooFinanceService.getHistoricalData(symbol, type).catch(() => null),
      ]);

      if (!quote || !quote.price) {
        console.log(`[PredictionCalc] No se pudo obtener precio para ${symbol}`);
        return null;
      }

      // 2. Obtener sentimiento real
      const sentimentData = await this.getSentimentScore(symbol, type);

      // 3. Obtener noticias recientes
      const newsData = await newsService.getNews(symbol, type);
      if (newsData.hasNews) {
        console.log(`[PredictionCalc] Noticias obtenidas: ${newsData.newsCount} (sentimiento: ${newsData.sentimentScore})`);
      }

      // 4. Obtener indicadores macroeconómicos
      const macroData = await macroEconomicService.getIndicators(symbol, type);
      if (macroData.hasData) {
        console.log(`[PredictionCalc] Datos macro obtenidos: ${macroData.macroOutlook} (score: ${macroData.macroScore})`);
      }

      // 5. Obtener datos financieros (solo para acciones)
      let financials: FinancialSummary | null = null;
      if (type === 'stock') {
        financials = await companyFinancialsService.getFinancialSummary(symbol, quote.price);
        if (financials) {
          console.log(`[PredictionCalc] Datos financieros obtenidos: score=${financials.overallScore}`);
        }
      }

      // 6. Obtener análisis de competidores
      // Necesitamos los cambios históricos de la empresa para comparar
      const companyChange1d = historical?.change30d ? historical.change30d / 30 : 0;
      const companyChange1w = historical?.change30d ? historical.change30d / 4 : 0;
      const companyChange1m = historical?.change30d || 0;
      
      const competitorsData = await competitorsService.analyzeCompetitors(
        symbol,
        companyChange1d,
        companyChange1w,
        companyChange1m
      );
      if (competitorsData.hasData) {
        console.log(`[PredictionCalc] Competidores obtenidos: ${competitorsData.sectorTrend} (score: ${competitorsData.competitorScore})`);
      }

      // 7. Obtener análisis de tipos de cambio
      const forexData = await forexAnalysisService.analyzeForexImpact(symbol);
      if (forexData.hasData) {
        console.log(`[PredictionCalc] Forex obtenido: ${forexData.overallTrend} (score: ${forexData.forexScore})`);
      }

      // 8. Obtener datos de inversores institucionales
      const institutionalData = await institutionalInvestorsService.getInstitutionalActivity(symbol, type);
      if (institutionalData.hasData) {
        console.log(`[PredictionCalc] Institucional obtenido: score=${institutionalData.institutionalScore}`);
      }

      // 9. Obtener análisis de estacionalidad
      const seasonalityData = seasonalityService.analyzeSeasonality(symbol);
      if (seasonalityData.hasData) {
        console.log(`[PredictionCalc] Estacionalidad: ${seasonalityData.sector} (score: ${seasonalityData.seasonalScore})`);
      }

      // 10. Obtener análisis técnico (indicadores)
      const technicalData = await technicalIndicatorsService.analyzeTechnicals(symbol);
      if (technicalData.hasData) {
        console.log(`[PredictionCalc] Análisis técnico: ${technicalData.trend} (score: ${technicalData.technicalScore})`);
      }

      // 11. Obtener VIX, Put/Call ratio y Expectations mejoradas (solo para stocks)
      let vixData: { value: number; sentiment: 'extreme_fear' | 'fear' | 'neutral' | 'complacency' | 'extreme_complacency'; score: number } | undefined;
      let putCallData: { ratio: number; sentiment: 'extreme_fear' | 'bearish' | 'neutral' | 'bullish' | 'extreme_greed'; score: number } | undefined;
      let corporateEventsData: CorporateEvents | null = null;
      let expectationsData: ExpectationsData | null = null;
      
      if (type === 'stock') {
        const [vixResult, pcResult, corpEventsResult, expectationsResult] = await Promise.allSettled([
          vixService.getCurrentVIX(),
          optionsService.getMarketPutCallRatio(),
          corporateEventsService.getCorporateEvents(symbol),
          expectationsService.getExpectations(symbol),
        ]);

        if (vixResult.status === 'fulfilled' && vixResult.value) {
          vixData = {
            value: vixResult.value.value,
            sentiment: vixResult.value.sentiment,
            score: vixResult.value.sentimentScore,
          };
          console.log(`[PredictionCalc] VIX obtenido: ${vixData.value.toFixed(2)} (${vixData.sentiment})`);
        }

        if (pcResult.status === 'fulfilled' && pcResult.value) {
          putCallData = {
            ratio: pcResult.value.pcRatio,
            sentiment: pcResult.value.sentiment,
            score: pcResult.value.sentimentScore,
          };
          console.log(`[PredictionCalc] Put/Call obtenido: ${putCallData.ratio.toFixed(2)} (${putCallData.sentiment})`);
        }

        if (corpEventsResult.status === 'fulfilled' && corpEventsResult.value) {
          corporateEventsData = corpEventsResult.value;
          console.log(`[PredictionCalc] Eventos corporativos: ${corporateEventsData.summary}`);
        }

        if (expectationsResult.status === 'fulfilled' && expectationsResult.value) {
          expectationsData = expectationsResult.value;
          console.log(`[PredictionCalc] Expectations mejoradas: score=${expectationsData.expectationsScore}, quality=${expectationsData.dataQuality}`);
        }
      }

      // 12. Calcular predicción de forma determinística
      const prediction = await this.calculateFromData(
        symbol,
        type,
        quote.price,
        quote.currency || 'EUR',
        historical,
        sentimentData,
        financials,
        newsData,
        macroData,
        competitorsData,
        forexData,
        institutionalData,
        seasonalityData,
        technicalData,
        timeframeDays,
        expectationsData
      );

      // 12. Convertir precios a EUR si es necesario
      const currency = quote.currency || 'USD';
      if (currency !== 'EUR') {
        console.log(`[PredictionCalc] Convirtiendo de ${currency} a EUR`);
        const rate = await currencyService.getExchangeRateToEUR(currency);
        
        prediction.currentPrice = Math.round(prediction.currentPrice * rate * 100) / 100;
        prediction.predictedPriceMin = Math.round(prediction.predictedPriceMin * rate * 100) / 100;
        prediction.predictedPriceMax = Math.round(prediction.predictedPriceMax * rate * 100) / 100;
        prediction.currency = 'EUR';
        
        // También convertir el precio objetivo de analistas si existe
        if (prediction.financials?.targetPrice) {
          prediction.financials.targetPrice = Math.round(prediction.financials.targetPrice * rate * 100) / 100;
        }
        
        console.log(`[PredictionCalc] Precio convertido: ${prediction.currentPrice} EUR`);
      }

      console.log(`[PredictionCalc] Predicción calculada:`, {
        direction: prediction.direction,
        confidence: prediction.confidence,
        change: prediction.predictedChange.toFixed(2) + '%',
      });

      // 14. Añadir datos de VIX y Put/Call al sentiment
      if (vixData) {
        prediction.sentiment.vix = vixData;
      }
      if (putCallData) {
        prediction.sentiment.putCallRatio = putCallData;
      }
      // Calcular score general combinado si hay datos
      if (vixData || putCallData) {
        const scores: number[] = [];
        if (vixData) scores.push(vixData.score);
        if (putCallData) scores.push(putCallData.score);
        prediction.sentiment.overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      }

      // 15. Añadir datos de eventos corporativos
      if (corporateEventsData) {
        prediction.corporateEvents = {
          nextEarningsDate: corporateEventsData.nextEarningsDate?.date,
          daysUntilEarnings: corporateEventsData.nextEarningsDate?.daysUntil,
          earningsImpact: corporateEventsData.earningsImpact,
          hasDividendUpcoming: corporateEventsData.dividend?.isUpcoming || false,
          analystActionsCount: corporateEventsData.recentAnalystActions.length,
          analystActionsImpact: corporateEventsData.analystActionsImpact,
          overallImpact: corporateEventsData.overallImpact,
          summary: corporateEventsData.summary,
        };
      }

      // 16. Analizar incertidumbre (Meta-Learning: aprender cuándo NO predecir)
      try {
        const uncertaintyAnalysis = await uncertaintyAnalysisService.analyzeUncertainty({
          symbol,
          assetType: type,
          timeframeDays,
          volatility: historical?.volatility,
          avgHistoricalVolatility: historical?.volatility ? historical.volatility * 0.8 : undefined, // Aproximación
          upcomingEvents: corporateEventsData || undefined,
          factorScores: prediction.factorBreakdown?.weightsUsed,
          dataCompleteness: this.calculateDataCompleteness(prediction),
          vixLevel: vixData?.sentiment,
        });

        prediction.uncertaintyScore = uncertaintyAnalysis.uncertaintyScore;
        prediction.shouldPredict = uncertaintyAnalysis.shouldPredict;
        prediction.uncertaintyWarning = uncertaintyAnalysis.recommendation;
        prediction.uncertaintyReasons = uncertaintyAnalysis.primaryReasons;

        if (!uncertaintyAnalysis.shouldPredict) {
          console.log(`[PredictionCalc] ⚠️ ALTA INCERTIDUMBRE (${uncertaintyAnalysis.uncertaintyScore}%): ${uncertaintyAnalysis.primaryReasons[0]}`);
        } else if (uncertaintyAnalysis.uncertaintyScore >= 50) {
          console.log(`[PredictionCalc] ⚡ Incertidumbre moderada (${uncertaintyAnalysis.uncertaintyScore}%): proceder con precaución`);
        }
      } catch (error) {
        console.log('[PredictionCalc] No se pudo analizar incertidumbre');
      }

      return prediction;
    } catch (error: any) {
      console.error(`[PredictionCalc] Error:`, error.message);
      return null;
    }
  }

  /**
   * Obtiene un score de sentimiento normalizado (0-100)
   */
  private async getSentimentScore(
    symbol: string,
    type: 'stock' | 'crypto'
  ): Promise<SentimentData> {
    try {
      const sentiment = await sentimentService.getSentimentForAsset(symbol, type);
      
      // Usar el nuevo overallScore si está disponible (VIX + Put/Call + otros)
      if (sentiment.overallScore !== 0) {
        // Convertir de -100/+100 a 0-100
        const bullishPercent = Math.round((sentiment.overallScore + 100) / 2);
        return {
          bullishPercent: Math.max(0, Math.min(100, bullishPercent)),
          source: 'VIX + Put/Call + Social',
          hasData: true,
        };
      }

      // Extraer % bullish de StockTwits si existe
      if (sentiment.stocktwits) {
        const match = sentiment.stocktwits.match(/Bullish:\s*(\d+)/);
        if (match) {
          return {
            bullishPercent: parseInt(match[1]),
            source: 'StockTwits',
            hasData: true,
          };
        }
      }

      // Si hay Fear & Greed (crypto), usarlo
      if (sentiment.fearGreed) {
        const match = sentiment.fearGreed.match(/Valor:\s*(\d+)/);
        if (match) {
          return {
            bullishPercent: parseInt(match[1]),
            source: 'Fear & Greed Index',
            hasData: true,
          };
        }
      }

      // Sin datos de sentimiento - NO inventar
      return {
        bullishPercent: 50, // Neutral por defecto
        source: 'Sin datos',
        hasData: false, // Indica que no hay datos reales
      };
    } catch {
      return {
        bullishPercent: 50,
        source: 'Sin datos',
        hasData: false,
      };
    }
  }

  /**
   * Cálculo determinístico de la predicción
   * 
   * Fórmula:
   * - Dirección: basada en tendencia histórica + sentimiento + fundamentales + noticias + expectativas + macro + competidores + forex + institucional + estacionalidad + indicadores técnicos
   * - Confianza: basada en coherencia de señales + cantidad de datos
   * - Precio objetivo: basado en volatilidad histórica real + precio objetivo analistas
   */
  private async calculateFromData(
    symbol: string,
    type: 'stock' | 'crypto',
    currentPrice: number,
    currency: string,
    historical: HistoricalData | null,
    sentiment: SentimentData,
    financials: FinancialSummary | null,
    news: NewsSummary,
    macro: MacroIndicators,
    competitors: CompetitorAnalysis,
    forex: ForexImpact,
    institutional: InstitutionalActivity,
    seasonality: SeasonalityAnalysis,
    technical: TechnicalAnalysis,
    timeframeDays: number,
    expectationsEnhanced: ExpectationsData | null = null
  ): Promise<CalculatedPrediction> {
    // --- FLAGS DE DATOS DISPONIBLES ---
    const hasHistoricalData = historical !== null && (historical.change30d !== 0 || historical.change90d !== 0);
    const hasSentimentData = sentiment.hasData;
    const hasCompetitorsData = competitors.hasData;
    const hasForexData = forex.hasData;
    const hasInstitutionalData = institutional.hasData;
    const hasSeasonalityData = seasonality.hasData;
    const hasTechnicalData = technical.hasData;
    const hasVolatilityData = historical !== null && historical.volatility > 0;
    const hasNewsData = news.hasNews;
    const hasMacroData = macro.hasData;
    
    // Valores - usar 0 (neutral) si no hay datos reales
    const change30d = hasHistoricalData ? historical.change30d : 0;
    const change90d = hasHistoricalData ? historical.change90d : 0;
    const volatility = hasVolatilityData ? historical.volatility : 20; // Solo volatilidad usamos default

    console.log(`[PredictionCalc] Datos disponibles: historical=${hasHistoricalData}, sentiment=${hasSentimentData}, news=${hasNewsData}, macro=${hasMacroData}, competitors=${hasCompetitorsData}, forex=${hasForexData}, institutional=${hasInstitutionalData}, seasonality=${hasSeasonalityData}, technical=${hasTechnicalData}`);

    // --- CÁLCULO DE DIRECCIÓN ---
    // Score de tendencia histórica (-100 a +100) - SOLO si hay datos
    // Ahora combinamos tendencia histórica con indicadores técnicos
    let trendScore = hasHistoricalData ? this.calculateTrendScore(change30d, change90d) : 0;
    
    // Score de indicadores técnicos (-100 a +100) - SOLO si hay datos
    let technicalScore = 0;
    if (hasTechnicalData) {
      technicalScore = technical.technicalScore; // Ya está en rango -100 a +100
      console.log(`[PredictionCalc] Technical score: ${technicalScore} (${technical.trend}, RSI: ${technical.rsi14?.toFixed(1) || 'N/A'})`);
    }
    
    // Score de sentimiento (-100 a +100) - SOLO si hay datos
    const sentimentScore = hasSentimentData ? (sentiment.bullishPercent - 50) * 2 : 0;
    
    // Score de noticias (-100 a +100) - SOLO si hay noticias
    // Las noticias tienen impacto directo y rápido en el precio
    let newsScore = 0;
    if (hasNewsData) {
      newsScore = news.sentimentScore; // Ya está en rango -100 a +100
      console.log(`[PredictionCalc] News score: ${newsScore} (${news.positiveCount}+ / ${news.negativeCount}-)`);
    }
    
    // Score macroeconómico (-100 a +100) - SOLO si hay datos
    let macroScore = 0;
    if (hasMacroData) {
      macroScore = macro.macroScore; // Ya está en rango -100 a +100
      console.log(`[PredictionCalc] Macro score: ${macroScore} (${macro.macroOutlook})`);
    }
    
    // Score de competidores (-100 a +100) - SOLO si hay datos
    // Si a los competidores les va mal, puede arrastrar a la empresa
    // Si la empresa destaca vs competidores, es muy positivo
    let competitorsScore = 0;
    if (hasCompetitorsData) {
      competitorsScore = competitors.competitorScore; // Ya está en rango -100 a +100
      console.log(`[PredictionCalc] Competitors score: ${competitorsScore} (${competitors.sectorTrend}, outperforming: ${competitors.outperforming})`);
    }
    
    // Score de tipos de cambio (-100 a +100) - SOLO si hay datos
    // EUR fuerte = negativo para exportadores europeos
    // EUR débil = positivo para exportadores europeos
    let forexScore = 0;
    if (hasForexData) {
      forexScore = forex.forexScore; // Ya está en rango -100 a +100
      console.log(`[PredictionCalc] Forex score: ${forexScore} (${forex.overallTrend})`);
    }
    
    // Score de inversores institucionales (-100 a +100) - SOLO si hay datos
    // Mide si los grandes fondos y ejecutivos están comprando o vendiendo
    // Las compras de insiders son especialmente significativas
    let institutionalScore = 0;
    if (hasInstitutionalData) {
      institutionalScore = institutional.institutionalScore; // Ya está en rango -100 a +100
      console.log(`[PredictionCalc] Institutional score: ${institutionalScore} (insider: ${institutional.insiderTransactions?.trend || 'N/A'})`);
    }
    
    // Score de estacionalidad (-100 a +100) - SOLO si hay datos del sector
    // Patrones estacionales como Black Friday, temporada turística, etc.
    let seasonalityScore = 0;
    if (hasSeasonalityData) {
      seasonalityScore = seasonality.seasonalScore; // Ya está en rango -100 a +100
      console.log(`[PredictionCalc] Seasonality score: ${seasonalityScore} (${seasonality.sector}, ${seasonality.region})`);
    }
    
    // Score de fundamentales (-100 a +100), solo para acciones
    let financialsScore = 0;
    if (financials) {
      // Convertir score 0-100 a -100/+100
      financialsScore = (financials.overallScore - 50) * 2;
      console.log(`[PredictionCalc] Financials score: ${financialsScore} (overall: ${financials.overallScore})`);
    }
    
    // Score de expectativas MEJORADO (-100 a +100)
    // PRIORIDAD: Usar el nuevo servicio de expectations si está disponible
    // Las expectativas son MUY importantes para movimientos a corto plazo
    let expectationsScore = 0;
    let hasExpectationsData = false;
    
    // 1. Intentar usar el servicio mejorado de expectations
    if (expectationsEnhanced && expectationsEnhanced.hasData) {
      expectationsScore = (expectationsEnhanced.expectationsScore - 50) * 2;
      hasExpectationsData = true;
      console.log(`[PredictionCalc] Expectations MEJORADAS: score=${expectationsScore} (raw: ${expectationsEnhanced.expectationsScore}, quality: ${expectationsEnhanced.dataQuality})`);
      console.log(`[PredictionCalc] → EPS Surprise: ${expectationsEnhanced.lastEpsSurprise?.toFixed(1)}%, Rev Surprise: ${expectationsEnhanced.lastRevenueSurprise?.toFixed(1)}%, Beat Rate: ${expectationsEnhanced.beatRate.toFixed(0)}%`);
      console.log(`[PredictionCalc] → Revisiones: ${expectationsEnhanced.overallRevisionTrend}, Próx. Earnings: ${expectationsEnhanced.nextEarnings.daysUntil} días`);
    }
    // 2. Fallback: usar datos básicos de company-financials si no hay datos mejorados
    else if (financials?.hasExpectationsData === true && financials.expectationsScore !== undefined) {
      expectationsScore = (financials.expectationsScore - 50) * 2;
      hasExpectationsData = true;
      console.log(`[PredictionCalc] Expectations (básico): score=${expectationsScore} (raw: ${financials.expectationsScore})`);
    } else {
      console.log(`[PredictionCalc] Sin datos de expectations, no se aplica este factor`);
    }
    
    // Score combinado: distribuir pesos SOLO entre factores con datos reales
    let combinedScore: number;
    
    // --- PESOS DINÁMICOS SEGÚN TIMEFRAME ---
    // Los pesos pueden venir del sistema ML (aprendidos) o usar defaults
    // Intradía (1 día): Factores de corto plazo dominan (trend, technical, sentiment, news)
    // Swing (2-7 días): Balance entre técnico y fundamental
    // Largo plazo (>7 días): Factores fundamentales dominan (financials, expectations, macro)
    
    // Pesos por defecto (se usan si no hay pesos aprendidos)
    const DEFAULT_WEIGHTS = {
      intraday: {
        trend: 0.20, technical: 0.25, sentiment: 0.15, news: 0.18,
        macro: 0.04, competitors: 0.04, forex: 0.04, institutional: 0.05,
        seasonality: 0.02, financials: 0.02, expectations: 0.01
      },
      swing: {
        trend: 0.12, technical: 0.18, sentiment: 0.10, news: 0.15,
        macro: 0.08, competitors: 0.07, forex: 0.06, institutional: 0.10,
        seasonality: 0.04, financials: 0.05, expectations: 0.05
      },
      long: {
        trend: 0.05, technical: 0.08, sentiment: 0.04, news: 0.08,
        macro: 0.12, competitors: 0.10, forex: 0.08, institutional: 0.12,
        seasonality: 0.08, financials: 0.13, expectations: 0.12
      }
    };
    
    // --- AJUSTE DE PESOS POR VOLATILIDAD DEL ACTIVO ---
    // Activos muy volátiles (crypto, growth stocks): más peso a técnico/sentiment
    // Activos estables (utilities, bonds): más peso a fundamentales
    const adjustWeightsForVolatility = (
      baseWeights: Record<string, number>, 
      assetVolatility: number
    ): Record<string, number> => {
      // Categorizar volatilidad
      // <20% = baja (utilities, bonds, large caps estables)
      // 20-50% = media (mayoría de acciones)
      // >50% = alta (crypto, growth stocks, small caps)
      
      let volatilityMultiplier: Record<string, number>;
      
      if (assetVolatility < 20) {
        // Baja volatilidad: priorizar fundamentales
        volatilityMultiplier = {
          trend: 0.8, technical: 0.7, sentiment: 0.6, news: 0.8,
          macro: 1.3, competitors: 1.2, forex: 1.1, institutional: 1.4,
          seasonality: 1.2, financials: 1.5, expectations: 1.5
        };
        console.log(`[PredictionCalc] 📉 Volatilidad BAJA (${assetVolatility.toFixed(1)}%): priorizando fundamentales`);
      } else if (assetVolatility < 50) {
        // Volatilidad media: pesos balanceados (sin ajuste)
        volatilityMultiplier = {
          trend: 1.0, technical: 1.0, sentiment: 1.0, news: 1.0,
          macro: 1.0, competitors: 1.0, forex: 1.0, institutional: 1.0,
          seasonality: 1.0, financials: 1.0, expectations: 1.0
        };
        console.log(`[PredictionCalc] 📊 Volatilidad MEDIA (${assetVolatility.toFixed(1)}%): pesos balanceados`);
      } else {
        // Alta volatilidad: priorizar técnico/momentum/sentiment
        volatilityMultiplier = {
          trend: 1.4, technical: 1.5, sentiment: 1.4, news: 1.3,
          macro: 0.7, competitors: 0.8, forex: 0.9, institutional: 0.8,
          seasonality: 0.6, financials: 0.5, expectations: 0.5
        };
        console.log(`[PredictionCalc] 📈 Volatilidad ALTA (${assetVolatility.toFixed(1)}%): priorizando técnico/sentiment`);
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
    };
    
    // Intentar cargar pesos aprendidos de AsyncStorage
    let learnedWeights: LearnedWeights | null = null;
    try {
      const stored = await AsyncStorage.getItem(LEARNED_WEIGHTS_KEY);
      if (stored) {
        learnedWeights = JSON.parse(stored);
        if (learnedWeights?.weights && learnedWeights.training_samples > 0) {
          console.log(`[PredictionCalc] 🧠 Usando pesos aprendidos (${learnedWeights.training_samples} muestras)`);
        }
      }
    } catch (error) {
      console.log(`[PredictionCalc] No hay pesos aprendidos, usando defaults`);
    }
    
    const getWeightsForTimeframe = (days: number): Record<string, number> => {
      const timeframeKey = days <= 1 ? 'intraday' : days <= 7 ? 'swing' : 'long';
      
      // Usar pesos aprendidos si existen
      if (learnedWeights?.weights?.[timeframeKey]) {
        return learnedWeights.weights[timeframeKey];
      }
      
      // Fallback a pesos por defecto
      return DEFAULT_WEIGHTS[timeframeKey];
    };
    
    // 1. Obtener pesos base (aprendidos o por defecto) según timeframe
    const baseTimeframeWeights = getWeightsForTimeframe(timeframeDays);
    
    // 2. Ajustar pesos según volatilidad del activo
    const timeframeWeights = adjustWeightsForVolatility(baseTimeframeWeights, volatility);
    
    const usingLearned = learnedWeights?.weights !== null;
    console.log(`[PredictionCalc] Timeframe: ${timeframeDays} días, pesos ${usingLearned ? '🧠 aprendidos' : 'defaults'} para ${timeframeDays <= 1 ? 'intradía' : timeframeDays <= 7 ? 'swing' : 'largo plazo'} (ajustados por volatilidad)`);
    
    // NOTA: 11 factores con pesos dinámicos según timeframe Y volatilidad
    const factors: { name: string; score: number; hasData: boolean; baseWeight: number }[] = [
      { name: 'trend', score: trendScore, hasData: hasHistoricalData, baseWeight: timeframeWeights.trend },
      { name: 'technical', score: technicalScore, hasData: hasTechnicalData, baseWeight: timeframeWeights.technical },
      { name: 'sentiment', score: sentimentScore, hasData: hasSentimentData, baseWeight: timeframeWeights.sentiment },
      { name: 'news', score: newsScore, hasData: hasNewsData, baseWeight: timeframeWeights.news },
      { name: 'macro', score: macroScore, hasData: hasMacroData, baseWeight: timeframeWeights.macro },
      { name: 'competitors', score: competitorsScore, hasData: hasCompetitorsData, baseWeight: timeframeWeights.competitors },
      { name: 'forex', score: forexScore, hasData: hasForexData, baseWeight: timeframeWeights.forex },
      { name: 'institutional', score: institutionalScore, hasData: hasInstitutionalData, baseWeight: timeframeWeights.institutional },
      { name: 'seasonality', score: seasonalityScore, hasData: hasSeasonalityData, baseWeight: timeframeWeights.seasonality },
      { name: 'financials', score: financialsScore, hasData: financials !== null, baseWeight: timeframeWeights.financials },
      { name: 'expectations', score: expectationsScore, hasData: hasExpectationsData, baseWeight: timeframeWeights.expectations },
    ];
    
    const availableFactors = factors.filter(f => f.hasData);
    
    // Calcular peso total de factores disponibles (para auditoría también)
    let totalWeight = availableFactors.reduce((sum, f) => sum + f.baseWeight, 0);
    
    if (availableFactors.length === 0) {
      // Sin datos de ningún factor - no podemos predecir
      console.log(`[PredictionCalc] ⚠️ Sin datos de ningún factor, predicción neutral`);
      combinedScore = 0;
      totalWeight = 1; // Evitar división por cero
    } else {
      // Redistribuir pesos entre factores disponibles
      combinedScore = availableFactors.reduce((sum, f) => {
        const normalizedWeight = f.baseWeight / totalWeight; // Normalizar a suma = 1
        return sum + (f.score * normalizedWeight);
      }, 0);
      
      const factorDetails = availableFactors.map(f => `${f.name}=${f.score.toFixed(0)}`).join(', ');
      console.log(`[PredictionCalc] Combined score: ${combinedScore.toFixed(1)} (factores: ${factorDetails})`);
    }
    
    // Determinar dirección - ser más decisivo basándose en la suma de factores
    // Solo "se mantiene" si el score está muy cerca de 0 (±5)
    let direction: 'up' | 'down' | 'neutral';
    if (combinedScore > 5) {
      direction = 'up';
    } else if (combinedScore < -5) {
      direction = 'down';
    } else {
      direction = 'neutral'; // Solo si realmente está equilibrado
    }

    // --- CÁLCULO DE CONFIANZA BASADO EN GRUPO DE ACTIVO ---
    // Detectar el grupo del activo para saber qué factores son relevantes
    const assetGroup = detectAssetGroup(symbol, type, hasExpectationsData, hasInstitutionalData);
    const groupConfig = ASSET_GROUP_CONFIGS[assetGroup];
    
    console.log(`[PredictionCalc] Grupo de activo: ${assetGroup} (${groupConfig.description})`);
    
    // Filtrar solo los factores RELEVANTES para este tipo de activo
    const relevantFactors = factors.filter(f => groupConfig.relevantFactors.includes(f.name));
    const availableRelevantFactors = relevantFactors.filter(f => f.hasData);
    
    console.log(`[PredictionCalc] Factores relevantes: ${relevantFactors.map(f => f.name).join(', ')}`);
    console.log(`[PredictionCalc] Factores disponibles: ${availableRelevantFactors.map(f => f.name).join(', ')}`);
    
    // Calcular coherencia PONDERADA por los pesos del timeframe
    // Así, para intradía, trend/technical/sentiment pesan más en la coherencia que seasonality/financials
    let signalCoherence = 50; // Base neutral
    let signalStrength = 0; // Fuerza ponderada de las señales
    
    if (availableRelevantFactors.length >= 1) {
      // Calcular peso total de factores disponibles
      const totalAvailableWeight = availableRelevantFactors.reduce((sum, f) => sum + f.baseWeight, 0);
      
      // Suma ponderada de señales positivas y negativas
      let positiveWeightedSum = 0; // Peso total de señales positivas (score > 10)
      let negativeWeightedSum = 0; // Peso total de señales negativas (score < -10)
      let strongPositiveWeight = 0; // Peso de señales muy fuertes (score > 30)
      let strongNegativeWeight = 0; // Peso de señales muy fuertes (score < -30)
      
      for (const factor of availableRelevantFactors) {
        const normalizedWeight = factor.baseWeight / totalAvailableWeight;
        if (factor.score > 10) {
          positiveWeightedSum += normalizedWeight;
          if (factor.score > 30) strongPositiveWeight += normalizedWeight;
        } else if (factor.score < -10) {
          negativeWeightedSum += normalizedWeight;
          if (factor.score < -30) strongNegativeWeight += normalizedWeight;
        }
      }
      
      // Fuerza ponderada de las señales (0-100)
      const weightedScoreSum = availableRelevantFactors.reduce((sum, f) => {
        const normalizedWeight = f.baseWeight / totalAvailableWeight;
        return sum + (Math.abs(f.score) * normalizedWeight);
      }, 0);
      signalStrength = Math.min(100, weightedScoreSum);
      
      const totalNonNeutralWeight = positiveWeightedSum + negativeWeightedSum;
      
      if (availableRelevantFactors.length === 1) {
        // Solo 1 factor: confianza limitada, depende de la fuerza
        signalCoherence = signalStrength > 30 ? 50 : 40;
      } else if (totalNonNeutralWeight < 0.1) {
        // Casi todas las señales son neutrales (poco peso no-neutral)
        signalCoherence = 45;
      } else {
        // Calcular coherencia basada en el peso dominante
        const dominantWeight = Math.max(positiveWeightedSum, negativeWeightedSum);
        const coherenceRatio = dominantWeight / totalNonNeutralWeight;
        
        if (coherenceRatio > 0.85) {
          // Las señales con peso van casi todas en la misma dirección
          signalCoherence = 75;
          // Bonus si además son fuertes (peso significativo con score >30)
          if (strongPositiveWeight > 0.3 || strongNegativeWeight > 0.3) {
            signalCoherence = 85;
          }
        } else {
          // Señales contradictorias - coherencia proporcional al ratio
          signalCoherence = 30 + (coherenceRatio * 40); // 30-70%
        }
      }
      
      console.log(`[PredictionCalc] Coherencia ponderada: pos=${(positiveWeightedSum*100).toFixed(0)}%, neg=${(negativeWeightedSum*100).toFixed(0)}%, ratio=${totalNonNeutralWeight > 0 ? (Math.max(positiveWeightedSum, negativeWeightedSum) / totalNonNeutralWeight * 100).toFixed(0) : 0}%`);
    }
    
    // Calcular confianza final
    // NO penalizamos por factores no disponibles si no son relevantes para este activo
    let confidence: number;
    
    if (availableRelevantFactors.length === 0) {
      // Sin ningún factor relevante disponible
      confidence = 20;
    } else if (availableRelevantFactors.length === 1) {
      // Solo 1 factor: confianza baja (sin validación cruzada)
      confidence = 35 + (signalStrength * 0.1); // 35-45%
    } else if (availableRelevantFactors.length < groupConfig.minFactorsForHighConfidence) {
      // Menos del mínimo recomendado
      confidence = signalCoherence * 0.8; // Reducido
    } else {
      // Suficientes factores
      confidence = signalCoherence;
    }
    
    // Bonus por señales muy fuertes y coherentes
    if (signalStrength > 40 && signalCoherence > 70) {
      confidence += 5;
    }
    
    // Limitar entre 20 y 85 (nunca 100% seguro)
    confidence = Math.max(20, Math.min(85, confidence));
    
    console.log(`[PredictionCalc] Confianza: ${confidence.toFixed(0)}% (coherencia: ${signalCoherence.toFixed(0)}, fuerza: ${signalStrength.toFixed(0)}, factores: ${availableRelevantFactors.length}/${relevantFactors.length} relevantes)`);
    
    // --- CONSTRUIR EXPLICACIÓN DE FACTORES ---
    // Determinar el tipo de señal
    const positiveFactors = availableRelevantFactors.filter(f => f.score > 10);
    const negativeFactors = availableRelevantFactors.filter(f => f.score < -10);
    let signalSummary: 'coherent_bullish' | 'coherent_bearish' | 'mixed' | 'neutral' | 'insufficient';
    
    if (availableRelevantFactors.length === 0) {
      signalSummary = 'insufficient';
    } else if (positiveFactors.length > 0 && negativeFactors.length > 0) {
      signalSummary = 'mixed';
    } else if (positiveFactors.length === availableRelevantFactors.length) {
      signalSummary = 'coherent_bullish';
    } else if (negativeFactors.length === availableRelevantFactors.length) {
      signalSummary = 'coherent_bearish';
    } else {
      signalSummary = 'neutral';
    }
    
    // Construir explicación de confianza
    let confidenceExplanation: string;
    if (availableRelevantFactors.length === 0) {
      confidenceExplanation = 'Sin datos suficientes para hacer una predicción fiable.';
    } else if (availableRelevantFactors.length === 1) {
      confidenceExplanation = `Solo 1 factor disponible (${availableRelevantFactors[0].name}). Se necesitan más datos para validar.`;
    } else if (signalSummary === 'mixed') {
      const bullishNames = positiveFactors.map(f => f.name).join(', ');
      const bearishNames = negativeFactors.map(f => f.name).join(', ');
      confidenceExplanation = `Señales contradictorias: ${bullishNames} son positivos, pero ${bearishNames} son negativos. Alta incertidumbre.`;
    } else if (signalSummary === 'coherent_bullish') {
      confidenceExplanation = `${positiveFactors.length} factores coinciden en señal alcista: ${positiveFactors.map(f => f.name).join(', ')}.`;
    } else if (signalSummary === 'coherent_bearish') {
      confidenceExplanation = `${negativeFactors.length} factores coinciden en señal bajista: ${negativeFactors.map(f => f.name).join(', ')}.`;
    } else {
      confidenceExplanation = 'Señales mayormente neutrales, sin dirección clara.';
    }
    
    // Añadir info sobre factores faltantes si son importantes
    const missingRelevant = relevantFactors.filter(f => !f.hasData);
    if (missingRelevant.length > 0 && availableRelevantFactors.length < groupConfig.minFactorsForHighConfidence) {
      confidenceExplanation += ` Faltan datos de: ${missingRelevant.map(f => f.name).join(', ')}.`;
    }
    
    // Objeto factorBreakdown para incluir en el resultado
    const factorBreakdown = {
      assetGroup,
      assetGroupDescription: groupConfig.description,
      relevantFactors: groupConfig.relevantFactors,
      availableFactors: factors.map(f => ({ name: f.name, score: Math.round(f.score), hasData: f.hasData })),
      weightsUsed: timeframeWeights, // Pesos usados para ML
      usingLearnedWeights: learnedWeights?.weights !== null && learnedWeights?.training_samples > 0,
      confidenceExplanation,
      signalSummary,
    };

    

    // --- CÁLCULO DE PRECIO OBJETIVO ---
    // Usar volatilidad real para calcular rango
    const dailyVolatility = volatility / Math.sqrt(252); // Volatilidad diaria
    const periodVolatility = dailyVolatility * Math.sqrt(timeframeDays);
    
    // El cambio esperado se deriva DIRECTAMENTE del combinedScore
    // combinedScore está en rango -100 a +100
    // Convertir a % de cambio esperado basado en volatilidad
    // Score de 100 = movimiento de ~1.5x volatilidad, Score de 0 = sin cambio
    
    // --- FACTOR DE ESCALA DINÁMICO ---
    // Más agresivo cuando las señales son coherentes, conservador cuando hay contradicción
    // Confianza alta (>70%) = señales claras = predicción más agresiva
    // Confianza baja (<50%) = mucha incertidumbre = predicción conservadora
    let scaleFactor: number;
    if (confidence >= 75) {
      // Señales muy coherentes - ser agresivo
      scaleFactor = 2.5;
    } else if (confidence >= 65) {
      // Señales coherentes - moderadamente agresivo
      scaleFactor = 2.0;
    } else if (confidence >= 55) {
      // Señales mixtas pero con dirección - normal
      scaleFactor = 1.5;
    } else if (confidence >= 45) {
      // Señales contradictorias - conservador
      scaleFactor = 1.0;
    } else {
      // Muy poca confianza - muy conservador
      scaleFactor = 0.7;
    }
    
    const scoreNormalized = combinedScore / 100; // -1 a +1
    let expectedChange = scoreNormalized * periodVolatility * scaleFactor;
    
    console.log(`[PredictionCalc] Factor de escala: ${scaleFactor} (confianza: ${confidence.toFixed(0)}%)`);
    
    // --- AJUSTE ADICIONAL: Precio objetivo de analistas ---
    // Esto NO está incluido en combinedScore, así que lo añadimos aquí
    // PERO: para intradía, el precio objetivo de analistas es IRRELEVANTE
    // Solo aplica para swing/largo plazo
    const hasTargetData = financials !== null && financials.targetPrice > 0 && financials.currentVsTarget !== 0;
    if (hasTargetData && financials && timeframeDays > 1) {
      // Si los analistas ven potencial alcista/bajista significativo (>10%), influye
      const targetInfluence = Math.min(Math.abs(financials.currentVsTarget) / 100, 0.5);
      const targetDirection = financials.currentVsTarget > 0 ? 1 : -1;
      // Peso aumenta con el timeframe (0% para 1d, 15% para 7d, 25% para 30d)
      const timeframeWeight = Math.min(timeframeDays / 30, 1) * 0.25;
      const targetAdjustment = targetInfluence * (periodVolatility * timeframeWeight) * targetDirection;
      expectedChange += targetAdjustment;
      console.log(`[PredictionCalc] Ajuste precio objetivo analistas: ${targetAdjustment.toFixed(2)}% (${financials.currentVsTarget.toFixed(1)}% vs objetivo, peso timeframe: ${(timeframeWeight * 100).toFixed(0)}%)`);
    }
    
    // Aplicar límites según timeframe
    const maxChange = Math.min(periodVolatility * 1.5, timeframeDays === 1 ? 8 : 15);
    expectedChange = Math.max(-maxChange, Math.min(maxChange, expectedChange));
    
    console.log(`[PredictionCalc] Cambio esperado final: ${expectedChange.toFixed(2)}% (score: ${combinedScore.toFixed(1)}, volatilidad periodo: ${periodVolatility.toFixed(2)}%)`);

    // --- CÁLCULO DE PRECIO OBJETIVO ÚNICO ---
    // No dar rangos inútiles - dar UN precio objetivo basado en el análisis
    // El precio objetivo = precio actual * (1 + cambio esperado %)
    
    const predictedPrice = Math.round(currentPrice * (1 + expectedChange / 100) * 100) / 100;
    
    // Para compatibilidad con la interfaz, usamos el mismo valor para min/max
    // Esto indica que es un precio objetivo único, no un rango
    // IMPORTANTE: Ambos deben ser iguales para que calculateChangePercent funcione correctamente
    const predictedPriceMin = predictedPrice;
    const predictedPriceMax = predictedPrice;
    
    console.log(`[PredictionCalc] Precio objetivo: ${predictedPrice} (cambio: ${expectedChange.toFixed(2)}%)`);
    console.log(`[PredictionCalc] Dirección: ${direction.toUpperCase()}, Confianza: ${confidence.toFixed(0)}%`);

    // --- PREDECIR ACCURACY ESPERADO ---
    // Basado en historial de predicciones similares
    let expectedAccuracyData: ExpectedAccuracy | undefined;
    try {
      expectedAccuracyData = await accuracyPredictorService.predictAccuracy({
        symbol,
        confidence,
        volatility,
        timeframeDays,
        assetType: type,
        factorsAvailable: availableFactors.length,
        signalSummary,
      });
      
      if (expectedAccuracyData.basedOnSamples > 0) {
        console.log(`[PredictionCalc] 📊 Accuracy esperado: ${expectedAccuracyData.expectedScore}% (${expectedAccuracyData.expectedQuality}), basado en ${expectedAccuracyData.basedOnSamples} predicciones`);
        if (expectedAccuracyData.suggestedTimeframe) {
          console.log(`[PredictionCalc] 💡 Sugerencia: mejor usar timeframe "${expectedAccuracyData.suggestedTimeframe}" para ${symbol}`);
        }
      }
    } catch (error) {
      console.log('[PredictionCalc] No se pudo predecir accuracy esperado');
    }

    return {
      asset: this.getAssetName(symbol),
      symbol: symbol, // Símbolo exacto para detectar bolsa
      assetType: type,
      currentPrice: Math.round(currentPrice * 100) / 100,
      currency,
      predictedPriceMin,
      predictedPriceMax,
      predictedChange: Math.round(expectedChange * 100) / 100,
      direction,
      confidence: Math.round(confidence),
      factorBreakdown,
      sentiment: {
        score: sentiment.bullishPercent,
        source: sentiment.source,
        hasData: hasSentimentData,
      },
      historical: {
        change30d: Math.round(change30d * 100) / 100,
        change90d: Math.round(change90d * 100) / 100,
        volatility: Math.round(volatility * 100) / 100,
        hasData: hasHistoricalData,
      },
      financials: financials || undefined,
      news: hasNewsData ? {
        sentiment: news.overallSentiment,
        score: news.sentimentScore,
        count: news.newsCount,
        summary: news.summary,
      } : undefined,
      macro: hasMacroData ? {
        region: macro.region,
        outlook: macro.macroOutlook,
        score: macro.macroScore,
        summary: macro.summary,
      } : undefined,
      competitors: hasCompetitorsData ? {
        sector: competitors.sectorName,
        sectorTrend: competitors.sectorTrend,
        outperforming: competitors.outperforming,
        score: competitors.competitorScore,
        summary: competitors.summary,
        competitorNames: competitors.competitors.map(c => c.name),
      } : undefined,
      forex: hasForexData ? {
        baseCurrency: forex.baseCurrency,
        trend: forex.overallTrend,
        score: forex.forexScore,
        summary: forex.summary,
        mainPairs: forex.currencyPairs.map(p => p.pair),
      } : undefined,
      institutional: hasInstitutionalData ? {
        ownershipPercent: institutional.institutionalOwnership?.percentage,
        numberOfInstitutions: institutional.institutionalOwnership?.numberOfInstitutions,
        ownershipTrend: institutional.institutionalOwnership?.trend,
        insiderNetShares: institutional.insiderTransactions?.netShares,
        insiderNetValue: institutional.insiderTransactions?.netValue,
        insiderTrend: institutional.insiderTransactions?.trend,
        topHolders: institutional.topInstitutions.slice(0, 3).map(t => t.name),
        score: institutional.institutionalScore,
        summary: institutional.summary,
      } : undefined,
      seasonality: hasSeasonalityData ? {
        sector: seasonality.sector,
        region: seasonality.region,
        events: seasonality.seasonalEvents.slice(0, 3).map(e => e.name),
        score: seasonality.seasonalScore,
        summary: seasonality.summary,
      } : undefined,
      technicalAnalysis: hasTechnicalData ? {
        trend: technical.trend,
        score: technical.technicalScore,
        rsi14: technical.rsi14 ?? undefined,
        rsiSignal: technical.rsiSignal,
        macdTrend: technical.macdTrend,
        priceVsSMA200: technical.priceAboveSMA200 ? 'above' : 'below',
        priceVsSMA50: technical.priceAboveSMA50 ? 'above' : 'below',
        goldenCross: technical.goldenCross,
        deathCross: technical.deathCross,
        bollingerPosition: technical.bollingerPosition,
        volumeSignal: technical.volumeSignal,
        signals: technical.signals.filter(s => s.signal !== 'neutral').slice(0, 5).map(s => s.description),
        summary: technical.summary,
      } : undefined,
      // Expectations mejoradas
      expectations: hasExpectationsData && expectationsEnhanced ? {
        lastEpsSurprise: expectationsEnhanced.lastEpsSurprise,
        avgEpsSurprise: expectationsEnhanced.avgEpsSurprise,
        lastRevenueSurprise: expectationsEnhanced.lastRevenueSurprise,
        avgRevenueSurprise: expectationsEnhanced.avgRevenueSurprise,
        beatRate: expectationsEnhanced.beatRate,
        revisionTrend: expectationsEnhanced.overallRevisionTrend,
        nextEarningsDays: expectationsEnhanced.nextEarnings.daysUntil,
        earningsRisk: expectationsEnhanced.earningsRisk,
        score: expectationsEnhanced.expectationsScore,
        dataQuality: expectationsEnhanced.dataQuality,
        summary: expectationsEnhanced.summary,
      } : undefined,
      // Nota: corporateEvents se añade desde el caller si está disponible
      timeframe: timeframeDays === 1 ? '1 día' : `${timeframeDays} días`,
      calculatedAt: new Date(),
      
      // AUDITORÍA: Trazabilidad completa de datos y cálculos
      audit: {
        dataSources: [
          {
            name: 'Yahoo Finance - Cotización',
            url: `https://finance.yahoo.com/quote/${symbol}`,
            fetchedAt: new Date(),
            rawValue: `Precio: ${currentPrice} ${currency}`,
          },
          {
            name: 'Yahoo Finance - Histórico',
            url: `https://finance.yahoo.com/quote/${symbol}/history`,
            fetchedAt: new Date(),
            rawValue: `30d: ${change30d.toFixed(2)}%, 90d: ${change90d.toFixed(2)}%, Vol: ${volatility.toFixed(1)}%`,
          },
          ...(hasSentimentData ? [{
            name: 'StockTwits - Sentimiento',
            url: `https://stocktwits.com/symbol/${symbol.replace('-USD', '.X')}`,
            fetchedAt: new Date(),
            rawValue: `${sentiment.bullishPercent}% Bullish`,
          }] : []),
          ...(hasNewsData ? [{
            name: 'Google News - Noticias',
            url: `https://news.google.com/search?q=${encodeURIComponent(symbol)}`,
            fetchedAt: new Date(),
            rawValue: `${news.newsCount} noticias, sentimiento: ${news.overallSentiment}`,
          }] : []),
        ],
        calculationSteps: [
          {
            step: '1. Score de Tendencia',
            formula: `(${change30d.toFixed(2)}% × 0.7) + (${change90d.toFixed(2)}% × 0.3) × 5`,
            result: Math.round(trendScore),
          },
          ...(hasTechnicalData ? [{
            step: '2. Score Técnico',
            formula: `RSI: ${technical.rsi14?.toFixed(1) || 'N/A'}, MACD: ${technical.macdTrend}, SMA200: ${technical.priceAboveSMA200 ? 'encima' : 'debajo'}`,
            result: Math.round(technicalScore),
          }] : []),
          {
            step: '3. Score de Sentimiento',
            formula: `(${sentiment.bullishPercent}% - 50) × 2`,
            result: Math.round(sentimentScore),
          },
          ...(hasNewsData ? [{
            step: '4. Score de Noticias',
            formula: `Score base noticias: ${news.sentimentScore}`,
            result: Math.round(newsScore),
          }] : []),
          {
            step: 'Score Combinado',
            formula: availableFactors.map(f => `${f.name}(${f.score.toFixed(0)} × ${((f.baseWeight / totalWeight) * 100).toFixed(0)}%)`).join(' + '),
            result: Math.round(combinedScore),
          },
          {
            step: 'Cambio Esperado',
            formula: `Tendencia base + ajustes de factores`,
            result: Math.round(expectedChange * 100) / 100,
          },
        ],
        combinedScoreBreakdown: availableFactors
          .map(f => `${f.name}: ${f.score.toFixed(0)} × ${((f.baseWeight / totalWeight) * 100).toFixed(1)}% = ${(f.score * f.baseWeight / totalWeight).toFixed(1)}`)
          .join('\n'),
        expectedChangeBreakdown: `Precio actual (${currentPrice}) × (1 + ${expectedChange.toFixed(2)}%) = ${predictedPrice}`,
      },
      // NUEVO: Accuracy esperado basado en historial
      expectedAccuracy: expectedAccuracyData ? {
        score: expectedAccuracyData.expectedScore,
        quality: expectedAccuracyData.expectedQuality,
        directionProbability: expectedAccuracyData.directionProbability,
        confidence: expectedAccuracyData.confidence,
        basedOnSamples: expectedAccuracyData.basedOnSamples,
        explanation: expectedAccuracyData.explanation,
        suggestedTimeframe: expectedAccuracyData.suggestedTimeframe,
      } : undefined,
    };
  }

  /**
   * Calcula score de tendencia (-100 a +100)
   */
  private calculateTrendScore(change30d: number, change90d: number): number {
    // Peso: 70% cambio 30d, 30% cambio 90d
    const weightedChange = (change30d * 0.7) + (change90d * 0.3);
    
    // Normalizar a -100 a +100 (asumiendo ±20% como extremos)
    return Math.max(-100, Math.min(100, weightedChange * 5));
  }

  /**
   * Calcula coherencia entre señales (0-100)
   */
  private calculateCoherence(trendScore: number, sentimentScore: number): number {
    // Si ambos tienen el mismo signo, alta coherencia
    const sameDirection = (trendScore >= 0) === (sentimentScore >= 0);
    
    if (sameDirection) {
      // Alta coherencia: base 60 + bonus por fuerza de señales
      const strength = (Math.abs(trendScore) + Math.abs(sentimentScore)) / 2;
      return 60 + (strength * 0.25);
    } else {
      // Baja coherencia: señales contradictorias
      const conflict = Math.abs(trendScore - sentimentScore) / 2;
      return Math.max(30, 55 - conflict * 0.25);
    }
  }

  /**
   * Calcula el porcentaje de completitud de datos (0-100)
   * Usado para análisis de incertidumbre
   */
  private calculateDataCompleteness(prediction: CalculatedPrediction): number {
    let available = 0;
    let total = 0;

    // Datos críticos
    const criticalData = [
      prediction.sentiment?.hasData,
      prediction.historical?.hasData,
      prediction.technicalAnalysis !== undefined,
    ];
    criticalData.forEach(has => {
      total += 2; // Peso doble para datos críticos
      if (has) available += 2;
    });

    // Datos importantes
    const importantData = [
      prediction.news !== undefined,
      prediction.financials !== undefined,
      prediction.macro !== undefined,
    ];
    importantData.forEach(has => {
      total += 1.5;
      if (has) available += 1.5;
    });

    // Datos complementarios
    const complementaryData = [
      prediction.competitors !== undefined,
      prediction.institutional !== undefined,
      prediction.forex !== undefined,
      prediction.seasonality !== undefined,
      prediction.expectations !== undefined,
      prediction.corporateEvents !== undefined,
    ];
    complementaryData.forEach(has => {
      total += 1;
      if (has) available += 1;
    });

    return total > 0 ? (available / total) * 100 : 0;
  }

  /**
   * Obtiene nombre legible del activo
   */
  private getAssetName(symbol: string): string {
    const names: Record<string, string> = {
      'ITX.MC': 'Inditex',
      'AMZN': 'Amazon',
      'AAPL': 'Apple',
      'GOOGL': 'Google',
      'MSFT': 'Microsoft',
      'TSLA': 'Tesla',
      'BTC-EUR': 'Bitcoin',
      'ETH-EUR': 'Ethereum',
      'SAN.MC': 'Banco Santander',
      'BBVA.MC': 'BBVA',
      'TEF.MC': 'Telefónica',
      'IBE.MC': 'Iberdrola',
      'REP.MC': 'Repsol',
    };
    return names[symbol] || symbol;
  }
}

export const predictionCalculatorService = new PredictionCalculatorService();
