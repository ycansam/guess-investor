/**
 * Market Regime Detection Service
 * Detecta el régimen actual del mercado para ajustar pesos de factores.
 * 
 * Regímenes soportados:
 * - bull_quiet: Mercado alcista tranquilo - Fundamentales + Técnico
 * - bull_euphoria: Mercado alcista eufórico - Momentum + Sentiment dominan
 * - bear_panic: Mercado bajista en pánico - VIX + Institucional dominan
 * - bear_orderly: Mercado bajista ordenado - Técnico + Macro
 * - sideways_choppy: Mercado lateral/choppy - Técnico (soportes/resistencias)
 * - recovery: Recuperación - Institucional + Macro
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { TrackedPrediction, predictionTrackingService } from './prediction-tracking-service';

// Storage keys
const REGIME_WEIGHTS_KEY = 'regime-weights';
const REGIME_HISTORY_KEY = 'regime-history';

// Tipos de régimen
export type MarketRegime = 
  | 'bull_quiet'
  | 'bull_euphoria'
  | 'bear_panic'
  | 'bear_orderly'
  | 'sideways_choppy'
  | 'recovery';

// Factores de análisis
const FACTORS = [
  'trend', 'technical', 'sentiment', 'news', 'macro',
  'competitors', 'forex', 'institutional', 'seasonality',
  'financials', 'expectations'
] as const;

type Factor = typeof FACTORS[number];
type WeightsMap = Record<Factor, number>;
type Timeframe = 'intraday' | 'swing' | 'long';

/**
 * Indicadores para detectar régimen
 */
export interface RegimeIndicators {
  vix: number;                    // VIX actual
  vixChange20d: number;           // Cambio % VIX últimos 20 días
  sp500Change20d: number;         // Cambio % S&P 500 últimos 20 días
  sp500Change5d: number;          // Cambio % S&P 500 últimos 5 días
  advanceDeclineRatio: number;    // Ratio avance/decline
  newHighsLows: number;           // New highs - new lows
  marketBreadth: number;          // % acciones sobre SMA 50
  putCallRatio: number;           // Put/Call ratio
  volatilityPercentile: number;   // Percentil de volatilidad (0-100)
}

/**
 * Resultado de la detección de régimen
 */
export interface RegimeDetection {
  regime: MarketRegime;
  confidence: number;             // 0-100
  indicators: Partial<RegimeIndicators>;
  reasoning: string[];
  timestamp: string;
}

/**
 * Registro histórico de régimen
 */
interface RegimeHistoryEntry {
  date: string;
  regime: MarketRegime;
  indicators: Partial<RegimeIndicators>;
}

/**
 * Pesos optimizados por régimen
 */
export interface RegimeWeights {
  regime: MarketRegime;
  weights: Record<Timeframe, WeightsMap>;
  sampleCount: number;
  avgAccuracy: number;
  lastUpdated: string;
}

// Pesos por defecto para cada régimen (basados en lógica de mercado)
const DEFAULT_REGIME_WEIGHTS: Record<MarketRegime, Record<Timeframe, WeightsMap>> = {
  bull_quiet: {
    // Mercado alcista tranquilo: fundamentales + técnico balanceados
    intraday: {
      trend: 0.20, technical: 0.22, sentiment: 0.12, news: 0.15,
      macro: 0.06, competitors: 0.06, forex: 0.05, institutional: 0.06,
      seasonality: 0.03, financials: 0.03, expectations: 0.02
    },
    swing: {
      trend: 0.15, technical: 0.18, sentiment: 0.10, news: 0.12,
      macro: 0.10, competitors: 0.08, forex: 0.06, institutional: 0.08,
      seasonality: 0.04, financials: 0.05, expectations: 0.04
    },
    long: {
      trend: 0.08, technical: 0.10, sentiment: 0.05, news: 0.08,
      macro: 0.14, competitors: 0.10, forex: 0.08, institutional: 0.12,
      seasonality: 0.06, financials: 0.10, expectations: 0.09
    },
  },
  bull_euphoria: {
    // Mercado eufórico: momentum y sentiment dominan, fundamentales ignorados
    intraday: {
      trend: 0.28, technical: 0.25, sentiment: 0.20, news: 0.12,
      macro: 0.02, competitors: 0.03, forex: 0.02, institutional: 0.04,
      seasonality: 0.01, financials: 0.01, expectations: 0.02
    },
    swing: {
      trend: 0.25, technical: 0.22, sentiment: 0.18, news: 0.14,
      macro: 0.03, competitors: 0.04, forex: 0.03, institutional: 0.05,
      seasonality: 0.02, financials: 0.02, expectations: 0.02
    },
    long: {
      trend: 0.20, technical: 0.18, sentiment: 0.15, news: 0.12,
      macro: 0.05, competitors: 0.06, forex: 0.04, institutional: 0.08,
      seasonality: 0.03, financials: 0.04, expectations: 0.05
    },
  },
  bear_panic: {
    // Mercado en pánico: VIX, institucional y macro dominan
    intraday: {
      trend: 0.15, technical: 0.20, sentiment: 0.12, news: 0.18,
      macro: 0.08, competitors: 0.03, forex: 0.04, institutional: 0.12,
      seasonality: 0.02, financials: 0.02, expectations: 0.04
    },
    swing: {
      trend: 0.12, technical: 0.16, sentiment: 0.10, news: 0.15,
      macro: 0.12, competitors: 0.04, forex: 0.05, institutional: 0.15,
      seasonality: 0.02, financials: 0.04, expectations: 0.05
    },
    long: {
      trend: 0.08, technical: 0.10, sentiment: 0.06, news: 0.10,
      macro: 0.16, competitors: 0.06, forex: 0.06, institutional: 0.18,
      seasonality: 0.04, financials: 0.08, expectations: 0.08
    },
  },
  bear_orderly: {
    // Mercado bajista ordenado: técnico y macro balanceados
    intraday: {
      trend: 0.18, technical: 0.24, sentiment: 0.10, news: 0.14,
      macro: 0.08, competitors: 0.05, forex: 0.05, institutional: 0.08,
      seasonality: 0.02, financials: 0.03, expectations: 0.03
    },
    swing: {
      trend: 0.14, technical: 0.20, sentiment: 0.08, news: 0.12,
      macro: 0.12, competitors: 0.06, forex: 0.06, institutional: 0.10,
      seasonality: 0.03, financials: 0.05, expectations: 0.04
    },
    long: {
      trend: 0.08, technical: 0.12, sentiment: 0.05, news: 0.08,
      macro: 0.15, competitors: 0.08, forex: 0.07, institutional: 0.14,
      seasonality: 0.05, financials: 0.10, expectations: 0.08
    },
  },
  sideways_choppy: {
    // Mercado lateral: técnico domina (soportes/resistencias)
    intraday: {
      trend: 0.12, technical: 0.30, sentiment: 0.12, news: 0.14,
      macro: 0.06, competitors: 0.05, forex: 0.05, institutional: 0.06,
      seasonality: 0.03, financials: 0.03, expectations: 0.04
    },
    swing: {
      trend: 0.10, technical: 0.28, sentiment: 0.10, news: 0.12,
      macro: 0.08, competitors: 0.06, forex: 0.06, institutional: 0.08,
      seasonality: 0.04, financials: 0.04, expectations: 0.04
    },
    long: {
      trend: 0.06, technical: 0.20, sentiment: 0.06, news: 0.10,
      macro: 0.12, competitors: 0.08, forex: 0.07, institutional: 0.12,
      seasonality: 0.06, financials: 0.07, expectations: 0.06
    },
  },
  recovery: {
    // Recuperación: institucional y macro dominan
    intraday: {
      trend: 0.16, technical: 0.18, sentiment: 0.14, news: 0.15,
      macro: 0.08, competitors: 0.05, forex: 0.05, institutional: 0.10,
      seasonality: 0.03, financials: 0.03, expectations: 0.03
    },
    swing: {
      trend: 0.14, technical: 0.15, sentiment: 0.10, news: 0.12,
      macro: 0.12, competitors: 0.06, forex: 0.06, institutional: 0.14,
      seasonality: 0.03, financials: 0.04, expectations: 0.04
    },
    long: {
      trend: 0.10, technical: 0.10, sentiment: 0.06, news: 0.08,
      macro: 0.16, competitors: 0.08, forex: 0.07, institutional: 0.16,
      seasonality: 0.04, financials: 0.08, expectations: 0.07
    },
  },
};

class MarketRegimeService {
  private regimeWeights: Map<MarketRegime, RegimeWeights> = new Map();
  private regimeHistory: RegimeHistoryEntry[] = [];
  private currentRegime: RegimeDetection | null = null;
  private initialized = false;

  /**
   * Inicializa el servicio
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const [weightsJson, historyJson] = await Promise.all([
        AsyncStorage.getItem(REGIME_WEIGHTS_KEY),
        AsyncStorage.getItem(REGIME_HISTORY_KEY),
      ]);

      if (weightsJson) {
        const weightsArray: RegimeWeights[] = JSON.parse(weightsJson);
        for (const rw of weightsArray) {
          this.regimeWeights.set(rw.regime, rw);
        }
      }

      if (historyJson) {
        this.regimeHistory = JSON.parse(historyJson);
      }

      this.initialized = true;
      console.log('[MarketRegime] Initialized with', this.regimeWeights.size, 'trained regimes');
    } catch (error) {
      console.error('[MarketRegime] Error loading:', error);
      this.initialized = true;
    }
  }

  /**
   * Guarda datos en storage
   */
  private async save(): Promise<void> {
    try {
      const weightsArray = Array.from(this.regimeWeights.values());
      await Promise.all([
        AsyncStorage.setItem(REGIME_WEIGHTS_KEY, JSON.stringify(weightsArray)),
        AsyncStorage.setItem(REGIME_HISTORY_KEY, JSON.stringify(this.regimeHistory.slice(-365))), // Último año
      ]);
    } catch (error) {
      console.error('[MarketRegime] Error saving:', error);
    }
  }

  /**
   * Detecta el régimen actual del mercado
   */
  detectRegime(indicators: Partial<RegimeIndicators>): RegimeDetection {
    const reasoning: string[] = [];
    let regime: MarketRegime = 'bull_quiet'; // Default
    let confidence = 50;

    const vix = indicators.vix ?? 20;
    const vixChange = indicators.vixChange20d ?? 0;
    const sp500Change20d = indicators.sp500Change20d ?? 0;
    const sp500Change5d = indicators.sp500Change5d ?? 0;
    const breadth = indicators.marketBreadth ?? 50;
    const putCall = indicators.putCallRatio ?? 1;

    // Detección basada en reglas
    if (vix > 30 && sp500Change5d < -5) {
      // VIX alto + caída fuerte = Pánico
      regime = 'bear_panic';
      confidence = Math.min(95, 60 + (vix - 30) + Math.abs(sp500Change5d));
      reasoning.push(`VIX alto (${vix.toFixed(1)}) con caída fuerte (${sp500Change5d.toFixed(1)}%)`);
    } else if (vix > 25 && sp500Change20d < -8) {
      // VIX elevado + corrección = Bear ordenado
      regime = 'bear_orderly';
      confidence = 70;
      reasoning.push(`VIX elevado (${vix.toFixed(1)}) con corrección (${sp500Change20d.toFixed(1)}%)`);
    } else if (vix < 15 && sp500Change20d > 5 && breadth > 70) {
      // VIX bajo + rally fuerte + breadth alto = Euforia
      regime = 'bull_euphoria';
      confidence = 75;
      reasoning.push(`VIX bajo (${vix.toFixed(1)}), rally fuerte, breadth alto (${breadth}%)`);
    } else if (sp500Change20d > 3 && vix < 20) {
      // Alcista tranquilo
      regime = 'bull_quiet';
      confidence = 65;
      reasoning.push(`Mercado alcista tranquilo (VIX: ${vix.toFixed(1)}, cambio: +${sp500Change20d.toFixed(1)}%)`);
    } else if (Math.abs(sp500Change20d) < 3 && vix < 22) {
      // Lateral
      regime = 'sideways_choppy';
      confidence = 60;
      reasoning.push(`Mercado lateral (cambio 20d: ${sp500Change20d.toFixed(1)}%)`);
    } else if (sp500Change5d > 3 && vixChange < -10) {
      // Rebote fuerte con VIX cayendo = Recovery
      regime = 'recovery';
      confidence = 70;
      reasoning.push(`Rebote con VIX cayendo (cambio VIX: ${vixChange.toFixed(1)}%)`);
    }

    // Ajustar confianza por put/call ratio
    if (putCall > 1.2 && regime.startsWith('bear')) {
      confidence = Math.min(95, confidence + 10);
      reasoning.push(`Put/Call ratio elevado (${putCall.toFixed(2)}) confirma sentimiento bajista`);
    } else if (putCall < 0.7 && regime.startsWith('bull')) {
      confidence = Math.min(95, confidence + 10);
      reasoning.push(`Put/Call ratio bajo (${putCall.toFixed(2)}) confirma sentimiento alcista`);
    }

    const detection: RegimeDetection = {
      regime,
      confidence,
      indicators,
      reasoning,
      timestamp: new Date().toISOString(),
    };

    this.currentRegime = detection;

    // Guardar en historial
    this.regimeHistory.push({
      date: detection.timestamp,
      regime,
      indicators,
    });

    return detection;
  }

  /**
   * Obtiene pesos para el régimen actual
   */
  async getRegimeWeights(
    regime: MarketRegime,
    timeframe: Timeframe
  ): Promise<WeightsMap> {
    await this.initialize();

    // Buscar pesos entrenados
    const trained = this.regimeWeights.get(regime);
    if (trained && trained.sampleCount >= 10) {
      return trained.weights[timeframe];
    }

    // Usar defaults
    return DEFAULT_REGIME_WEIGHTS[regime][timeframe];
  }

  /**
   * Obtiene el régimen actual detectado
   */
  getCurrentRegime(): RegimeDetection | null {
    return this.currentRegime;
  }

  /**
   * Reconstruye pesos por régimen desde predicciones históricas
   */
  async rebuildRegimeWeights(): Promise<{
    regimesProcessed: number;
    totalSamples: number;
  }> {
    await this.initialize();

    const allPredictions = await predictionTrackingService.getVerifiedPredictions();
    
    // Agrupar por régimen (si tienen la info)
    const byRegime = new Map<MarketRegime, TrackedPrediction[]>();
    
    for (const pred of allPredictions) {
      // Intentar determinar régimen del momento de la predicción
      const regime = this.inferRegimeFromPrediction(pred);
      if (regime) {
        if (!byRegime.has(regime)) {
          byRegime.set(regime, []);
        }
        byRegime.get(regime)!.push(pred);
      }
    }

    let totalSamples = 0;

    // Entrenar pesos para cada régimen
    for (const [regime, predictions] of byRegime.entries()) {
      if (predictions.length >= 5) {
        const weights = this.trainRegimeWeights(regime, predictions);
        this.regimeWeights.set(regime, weights);
        totalSamples += predictions.length;
      }
    }

    await this.save();

    return {
      regimesProcessed: byRegime.size,
      totalSamples,
    };
  }

  /**
   * Intenta inferir el régimen desde una predicción histórica
   */
  private inferRegimeFromPrediction(pred: TrackedPrediction): MarketRegime | null {
    // Si tiene info de uncertainty con régimen
    if (pred.uncertaintyFactors?.marketRegime) {
      switch (pred.uncertaintyFactors.marketRegime) {
        case 'panic': return 'bear_panic';
        case 'euphoria': return 'bull_euphoria';
        case 'normal': return 'bull_quiet'; // Asumimos normal = quiet
      }
    }

    // Inferir desde volatilidad y otros indicadores
    const vol = pred.volatility ?? 30;
    
    if (vol > 50) return 'bear_panic';
    if (vol > 35) return 'bear_orderly';
    if (vol < 15) return 'bull_euphoria';
    
    return 'bull_quiet'; // Default
  }

  /**
   * Entrena pesos para un régimen específico
   */
  private trainRegimeWeights(
    regime: MarketRegime,
    predictions: TrackedPrediction[]
  ): RegimeWeights {
    const weights: Record<Timeframe, WeightsMap> = {
      intraday: this.computeWeightsForTimeframe(predictions.filter(p => p.timeframeDays <= 1)),
      swing: this.computeWeightsForTimeframe(predictions.filter(p => p.timeframeDays > 1 && p.timeframeDays <= 7)),
      long: this.computeWeightsForTimeframe(predictions.filter(p => p.timeframeDays > 7)),
    };

    // Si algún timeframe no tiene datos, usar defaults
    for (const tf of ['intraday', 'swing', 'long'] as Timeframe[]) {
      const preds = predictions.filter(p => {
        if (tf === 'intraday') return p.timeframeDays <= 1;
        if (tf === 'swing') return p.timeframeDays > 1 && p.timeframeDays <= 7;
        return p.timeframeDays > 7;
      });
      if (preds.length < 3) {
        weights[tf] = DEFAULT_REGIME_WEIGHTS[regime][tf];
      }
    }

    const avgAccuracy = this.mean(
      predictions
        .filter(p => p.accuracyScore !== undefined)
        .map(p => p.accuracyScore!)
    );

    return {
      regime,
      weights,
      sampleCount: predictions.length,
      avgAccuracy,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Calcula pesos óptimos para un grupo de predicciones
   */
  private computeWeightsForTimeframe(predictions: TrackedPrediction[]): WeightsMap {
    if (predictions.length < 3) {
      // Pesos iguales si no hay datos
      const equal = 1 / FACTORS.length;
      const weights: WeightsMap = {} as WeightsMap;
      for (const f of FACTORS) weights[f] = equal;
      return weights;
    }

    // Calcular correlación de cada factor con accuracy
    const correlations: Record<Factor, number> = {} as Record<Factor, number>;
    
    for (const factor of FACTORS) {
      const scores: number[] = [];
      const accuracies: number[] = [];

      for (const pred of predictions) {
        if (pred.factorScores?.[factor] !== undefined && pred.accuracyScore !== undefined) {
          scores.push(pred.factorScores[factor]);
          accuracies.push(pred.accuracyScore);
        }
      }

      correlations[factor] = scores.length >= 3 
        ? Math.max(0.01, Math.abs(this.correlation(scores, accuracies)))
        : 0.05;
    }

    // Normalizar
    const total = Object.values(correlations).reduce((a, b) => a + b, 0);
    const weights: WeightsMap = {} as WeightsMap;
    
    for (const factor of FACTORS) {
      let w = correlations[factor] / total;
      w = Math.max(0.01, Math.min(0.40, w));
      weights[factor] = w;
    }

    // Renormalizar después de clipping
    const newTotal = Object.values(weights).reduce((a, b) => a + b, 0);
    for (const factor of FACTORS) {
      weights[factor] = weights[factor] / newTotal;
    }

    return weights;
  }

  /**
   * Genera descripción del régimen
   */
  getRegimeDescription(regime: MarketRegime): string {
    const descriptions: Record<MarketRegime, string> = {
      bull_quiet: '📈 Mercado alcista tranquilo - Fundamentales + técnico balanceados',
      bull_euphoria: '🚀 Mercado eufórico - Momentum y sentiment dominan',
      bear_panic: '😱 Mercado en pánico - VIX e institucional dominan',
      bear_orderly: '📉 Mercado bajista ordenado - Técnico y macro importantes',
      sideways_choppy: '↔️ Mercado lateral/choppy - Técnico (S/R) domina',
      recovery: '🔄 Recuperación - Institucional y macro lideran',
    };
    return descriptions[regime];
  }

  /**
   * Genera reporte del sistema de regímenes
   */
  async generateReport(): Promise<string> {
    await this.initialize();

    let report = '🌡️ REGÍMENES DE MERCADO\n';
    report += '═'.repeat(50) + '\n\n';

    // Régimen actual
    if (this.currentRegime) {
      report += `ACTUAL: ${this.getRegimeDescription(this.currentRegime.regime)}\n`;
      report += `Confianza: ${this.currentRegime.confidence}%\n`;
      report += `Razones:\n`;
      for (const r of this.currentRegime.reasoning) {
        report += `  - ${r}\n`;
      }
      report += '\n';
    }

    // Pesos entrenados
    report += 'PESOS ENTRENADOS POR RÉGIMEN:\n';
    for (const [regime, weights] of this.regimeWeights.entries()) {
      report += `\n${this.getRegimeDescription(regime)}\n`;
      report += `  Samples: ${weights.sampleCount} | Avg Accuracy: ${weights.avgAccuracy.toFixed(1)}%\n`;
      
      // Top 3 factores para swing
      const top = Object.entries(weights.weights.swing)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      report += `  Top swing: ${top.map(([f, w]) => `${f}:${(w * 100).toFixed(0)}%`).join(', ')}\n`;
    }

    // Historial reciente
    const recent = this.regimeHistory.slice(-10);
    if (recent.length > 0) {
      report += '\nHISTORIAL RECIENTE (últimos 10):\n';
      for (const entry of recent.reverse()) {
        const date = new Date(entry.date).toLocaleDateString();
        report += `  ${date}: ${entry.regime}\n`;
      }
    }

    return report;
  }

  // === Helpers ===

  private mean(values: number[]): number {
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  }

  private correlation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length < 2) return 0;

    const n = x.length;
    const meanX = this.mean(x);
    const meanY = this.mean(y);

    let num = 0;
    let denX = 0;
    let denY = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      num += dx * dy;
      denX += dx * dx;
      denY += dy * dy;
    }

    const den = Math.sqrt(denX * denY);
    return den > 0 ? num / den : 0;
  }
}

// Singleton
export const marketRegimeService = new MarketRegimeService();
