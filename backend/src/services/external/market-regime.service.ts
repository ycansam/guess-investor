/**
 * Market Regime Detection Service
 * Detecta el régimen actual del mercado para ajustar pesos de factores.
 * 
 * Regímenes soportados:
 * - bull_quiet: Mercado alcista tranquilo
 * - bull_euphoria: Mercado alcista eufórico
 * - bear_panic: Mercado bajista en pánico
 * - bear_orderly: Mercado bajista ordenado
 * - sideways_choppy: Mercado lateral/choppy
 * - recovery: Recuperación
 */

import { logger } from '../../middleware/logger.js';

// Tipos de régimen
export type MarketRegime = 
  | 'bull_quiet'
  | 'bull_euphoria'
  | 'bear_panic'
  | 'bear_orderly'
  | 'sideways_choppy'
  | 'recovery';

// Factores
const FACTORS = [
  'trend', 'technical', 'sentiment', 'news', 'macro',
  'competitors', 'forex', 'institutional',
  'financials', 'expectations'
] as const;

type Factor = typeof FACTORS[number];
type WeightsMap = Record<Factor, number>;
type Timeframe = 'intraday' | 'swing' | 'long';

export interface RegimeIndicators {
  vix: number;
  vixChange20d: number;
  sp500Change20d: number;
  sp500Change5d: number;
  advanceDeclineRatio: number;
  newHighsLows: number;
  marketBreadth: number;
  putCallRatio: number;
  volatilityPercentile: number;
}

export interface RegimeDetection {
  regime: MarketRegime;
  confidence: number;
  indicators: Partial<RegimeIndicators>;
  reasoning: string[];
  timestamp: string;
}

// Pesos por régimen
const DEFAULT_REGIME_WEIGHTS: Record<MarketRegime, Record<Timeframe, WeightsMap>> = {
  bull_quiet: {
    intraday: {
      trend: 0.21, technical: 0.23, sentiment: 0.13, news: 0.16,
      macro: 0.06, competitors: 0.06, forex: 0.05, institutional: 0.06,
      financials: 0.03, expectations: 0.01
    },
    swing: {
      trend: 0.16, technical: 0.19, sentiment: 0.11, news: 0.13,
      macro: 0.10, competitors: 0.08, forex: 0.06, institutional: 0.08,
      financials: 0.05, expectations: 0.04
    },
    long: {
      trend: 0.08, technical: 0.11, sentiment: 0.06, news: 0.09,
      macro: 0.15, competitors: 0.10, forex: 0.08, institutional: 0.13,
      financials: 0.11, expectations: 0.09
    },
  },
  bull_euphoria: {
    intraday: {
      trend: 0.29, technical: 0.26, sentiment: 0.21, news: 0.12,
      macro: 0.02, competitors: 0.03, forex: 0.02, institutional: 0.04,
      financials: 0.00, expectations: 0.01
    },
    swing: {
      trend: 0.26, technical: 0.23, sentiment: 0.19, news: 0.15,
      macro: 0.03, competitors: 0.04, forex: 0.03, institutional: 0.05,
      financials: 0.01, expectations: 0.01
    },
    long: {
      trend: 0.21, technical: 0.19, sentiment: 0.16, news: 0.13,
      macro: 0.05, competitors: 0.06, forex: 0.04, institutional: 0.08,
      financials: 0.04, expectations: 0.04
    },
  },
  bear_panic: {
    intraday: {
      trend: 0.16, technical: 0.21, sentiment: 0.13, news: 0.19,
      macro: 0.08, competitors: 0.03, forex: 0.04, institutional: 0.12,
      financials: 0.02, expectations: 0.02
    },
    swing: {
      trend: 0.13, technical: 0.17, sentiment: 0.11, news: 0.16,
      macro: 0.12, competitors: 0.04, forex: 0.05, institutional: 0.15,
      financials: 0.04, expectations: 0.03
    },
    long: {
      trend: 0.09, technical: 0.11, sentiment: 0.07, news: 0.11,
      macro: 0.17, competitors: 0.06, forex: 0.06, institutional: 0.18,
      financials: 0.09, expectations: 0.06
    },
  },
  bear_orderly: {
    intraday: {
      trend: 0.19, technical: 0.25, sentiment: 0.11, news: 0.15,
      macro: 0.08, competitors: 0.05, forex: 0.05, institutional: 0.08,
      financials: 0.03, expectations: 0.01
    },
    swing: {
      trend: 0.15, technical: 0.21, sentiment: 0.09, news: 0.13,
      macro: 0.12, competitors: 0.06, forex: 0.06, institutional: 0.10,
      financials: 0.05, expectations: 0.03
    },
    long: {
      trend: 0.11, technical: 0.13, sentiment: 0.06, news: 0.09,
      macro: 0.17, competitors: 0.08, forex: 0.08, institutional: 0.14,
      financials: 0.09, expectations: 0.05
    },
  },
  sideways_choppy: {
    intraday: {
      trend: 0.11, technical: 0.30, sentiment: 0.13, news: 0.13,
      macro: 0.06, competitors: 0.08, forex: 0.06, institutional: 0.08,
      financials: 0.03, expectations: 0.02
    },
    swing: {
      trend: 0.09, technical: 0.27, sentiment: 0.11, news: 0.11,
      macro: 0.10, competitors: 0.10, forex: 0.07, institutional: 0.08,
      financials: 0.04, expectations: 0.03
    },
    long: {
      trend: 0.07, technical: 0.16, sentiment: 0.07, news: 0.09,
      macro: 0.15, competitors: 0.12, forex: 0.08, institutional: 0.12,
      financials: 0.09, expectations: 0.05
    },
  },
  recovery: {
    intraday: {
      trend: 0.23, technical: 0.21, sentiment: 0.15, news: 0.13,
      macro: 0.06, competitors: 0.05, forex: 0.04, institutional: 0.10,
      financials: 0.02, expectations: 0.01
    },
    swing: {
      trend: 0.19, technical: 0.19, sentiment: 0.13, news: 0.11,
      macro: 0.10, competitors: 0.06, forex: 0.05, institutional: 0.12,
      financials: 0.03, expectations: 0.02
    },
    long: {
      trend: 0.13, technical: 0.13, sentiment: 0.09, news: 0.09,
      macro: 0.15, competitors: 0.08, forex: 0.06, institutional: 0.14,
      financials: 0.09, expectations: 0.04
    },
  },
};

// Cache
let currentRegime: RegimeDetection | null = null;
let lastDetectionTime = 0;
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 horas

export const marketRegimeService = {
  /**
   * Detecta el régimen actual del mercado
   */
  detectRegime(indicators: Partial<RegimeIndicators>): RegimeDetection {
    const reasoning: string[] = [];
    let regime: MarketRegime = 'sideways_choppy';
    let confidence = 50;

    const vix = indicators.vix ?? 20;
    const sp500Change20d = indicators.sp500Change20d ?? 0;
    const sp500Change5d = indicators.sp500Change5d ?? 0;
    const putCallRatio = indicators.putCallRatio ?? 1;

    // Detectar régimen basado en indicadores
    if (vix >= 30) {
      // Alto VIX = miedo
      if (sp500Change5d < -5) {
        regime = 'bear_panic';
        confidence = 80;
        reasoning.push('VIX >30 con caída fuerte reciente indica pánico');
      } else {
        regime = 'bear_orderly';
        confidence = 65;
        reasoning.push('VIX elevado pero sin pánico extremo');
      }
    } else if (vix < 12) {
      // VIX muy bajo = complacencia
      if (sp500Change20d > 5) {
        regime = 'bull_euphoria';
        confidence = 75;
        reasoning.push('VIX bajo con rally fuerte indica euforia');
      } else {
        regime = 'bull_quiet';
        confidence = 70;
        reasoning.push('VIX bajo indica mercado alcista tranquilo');
      }
    } else if (sp500Change20d > 8) {
      regime = 'bull_euphoria';
      confidence = 70;
      reasoning.push('Rally fuerte (+8% en 20 días)');
    } else if (sp500Change20d > 3) {
      regime = 'bull_quiet';
      confidence = 65;
      reasoning.push('Tendencia alcista moderada');
    } else if (sp500Change20d < -8) {
      regime = 'bear_panic';
      confidence = 70;
      reasoning.push('Caída fuerte (-8% en 20 días)');
    } else if (sp500Change20d < -3) {
      regime = 'bear_orderly';
      confidence = 65;
      reasoning.push('Tendencia bajista moderada');
    } else if (sp500Change5d > 3 && sp500Change20d < 0) {
      regime = 'recovery';
      confidence = 60;
      reasoning.push('Rebote desde niveles bajos');
    } else {
      regime = 'sideways_choppy';
      confidence = 55;
      reasoning.push('Sin tendencia clara, mercado lateral');
    }

    // Ajustar confianza con put/call ratio
    if (putCallRatio > 1.2) {
      reasoning.push('Put/Call ratio alto confirma miedo');
      if (regime.includes('bear')) confidence += 5;
    } else if (putCallRatio < 0.7) {
      reasoning.push('Put/Call ratio bajo confirma complacencia');
      if (regime.includes('bull')) confidence += 5;
    }

    const detection: RegimeDetection = {
      regime,
      confidence: Math.min(95, confidence),
      indicators,
      reasoning,
      timestamp: new Date().toISOString(),
    };

    currentRegime = detection;
    lastDetectionTime = Date.now();

    logger.info(`[MarketRegime] Detected: ${regime} (confidence: ${confidence}%)`);

    return detection;
  },

  /**
   * Obtiene pesos para un régimen y timeframe específicos
   */
  getRegimeWeights(regime: MarketRegime, timeframe: Timeframe): WeightsMap {
    return DEFAULT_REGIME_WEIGHTS[regime][timeframe];
  },

  /**
   * Obtiene el régimen actual (cached)
   */
  getCurrentRegime(): RegimeDetection | null {
    if (currentRegime && Date.now() - lastDetectionTime < CACHE_TTL) {
      return currentRegime;
    }
    return null;
  },

  /**
   * Detecta régimen automáticamente usando datos de mercado
   */
  async detectRegimeAuto(): Promise<RegimeDetection> {
    try {
      // Obtener VIX
      const vixUrl = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=5d';
      const spyUrl = 'https://query1.finance.yahoo.com/v8/finance/chart/SPY?interval=1d&range=1mo';
      
      const [vixRes, spyRes] = await Promise.all([
        fetch(vixUrl, { 
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(10000)
        }),
        fetch(spyUrl, { 
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(10000)
        }),
      ]);

      let vix = 20;
      let sp500Change20d = 0;
      let sp500Change5d = 0;

      if (vixRes.ok) {
        const vixData: any = await vixRes.json();
        const closes = vixData.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
        vix = closes.filter((c: any) => c !== null).pop() || 20;
      }

      if (spyRes.ok) {
        const spyData: any = await spyRes.json();
        const closes = spyData.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
        const validCloses = closes.filter((c: any) => c !== null);
        
        if (validCloses.length >= 20) {
          const current = validCloses[validCloses.length - 1];
          const price20dAgo = validCloses[validCloses.length - 20];
          const price5dAgo = validCloses[validCloses.length - 5];
          
          sp500Change20d = ((current - price20dAgo) / price20dAgo) * 100;
          sp500Change5d = ((current - price5dAgo) / price5dAgo) * 100;
        }
      }

      return this.detectRegime({ vix, sp500Change20d, sp500Change5d });
      
    } catch (error) {
      logger.error('[MarketRegime] Error auto-detecting:', error);
      return this.detectRegime({});
    }
  },

  /**
   * Genera resumen del régimen
   */
  formatForAnalysis(detection: RegimeDetection): string {
    const regimeLabels: Record<MarketRegime, string> = {
      bull_quiet: '📈 Alcista Tranquilo',
      bull_euphoria: '🚀 Alcista Eufórico',
      bear_panic: '📉 Bajista en Pánico',
      bear_orderly: '🔻 Bajista Ordenado',
      sideways_choppy: '↔️ Lateral/Choppy',
      recovery: '🔄 Recuperación',
    };

    return `Régimen: ${regimeLabels[detection.regime]} (${detection.confidence}% confianza) | ` +
           `${detection.reasoning.join(', ')}`;
  },

  /**
   * Calcula impacto del régimen en predicción
   */
  calculatePredictionImpact(regime: MarketRegime): { 
    magnitudeMultiplier: number;
    confidenceAdjustment: number;
  } {
    switch (regime) {
      case 'bull_euphoria':
        return { magnitudeMultiplier: 1.2, confidenceAdjustment: -5 }; // Más volátil
      case 'bear_panic':
        return { magnitudeMultiplier: 1.5, confidenceAdjustment: -15 }; // Muy volátil
      case 'bear_orderly':
        return { magnitudeMultiplier: 1.1, confidenceAdjustment: -5 };
      case 'bull_quiet':
        return { magnitudeMultiplier: 0.9, confidenceAdjustment: 5 }; // Más predecible
      case 'recovery':
        return { magnitudeMultiplier: 1.15, confidenceAdjustment: -10 };
      case 'sideways_choppy':
      default:
        return { magnitudeMultiplier: 0.8, confidenceAdjustment: -10 }; // Difícil de predecir
    }
  },
};
