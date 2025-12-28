/**
 * Feature Engineering Service
 * 
 * Genera features derivados automáticamente a partir de los scores de factores.
 * Detecta patrones como divergencias, momentum exhaustion, confirmaciones, etc.
 * 
 * - RSI Divergence patterns
 * - Momentum exhaustion signals
 * - Multi-factor confirmations
 * - Temporal momentum
 */

import { logger } from '../../middleware/logger.js';

// ============================================================================
// TYPES
// ============================================================================

export type FactorName = 
  | 'trend' | 'technical' | 'sentiment' | 'news' | 'macro'
  | 'competitors' | 'forex' | 'institutional' | 'seasonality'
  | 'financials' | 'expectations';

interface FactorScore {
  name: FactorName;
  score: number;
  weight: number;
  category?: 'bullish' | 'bearish' | 'neutral';
}

export interface DerivedFeatures {
  // Divergencias
  divergenceScore: number;
  divergenceType: 'bullish' | 'bearish' | 'none';
  divergingFactors: string[];

  // Momentum
  momentumExhaustion: number;
  momentumDirection: 'accelerating' | 'decelerating' | 'stable';
  extremeReading: boolean;

  // Confirmaciones
  multiFactorConfirmation: number;
  confirmedDirection: 'bullish' | 'bearish' | 'mixed';
  confirmingFactors: string[];
  conflictingFactors: string[];

  // Coherencia
  signalCoherence: number;
  categoryAlignment: number;

  // Volatilidad implícita
  impliedVolatility: 'low' | 'medium' | 'high';
  
  // Meta-features
  featureQuality: number;
  dataCompleteness: number;
  
  // Recomendaciones
  recommendations: string[];
}

interface HistoricalFactorData {
  symbol: string;
  timestamp: number;
  factors: Record<FactorName, number>;
}

// Cache temporal para momentum
const factorHistory: Map<string, HistoricalFactorData[]> = new Map();
const MAX_HISTORY = 10;

// ============================================================================
// CONSTANTS
// ============================================================================

const FACTOR_GROUPS = {
  price: ['trend', 'technical'] as FactorName[],
  fundamental: ['financials', 'expectations'] as FactorName[],
  sentiment: ['sentiment', 'news'] as FactorName[],
  flow: ['institutional', 'forex'] as FactorName[],
  external: ['macro', 'competitors', 'seasonality'] as FactorName[],
};

const DIVERGENCE_THRESHOLD = 30; // Diferencia mínima para divergencia
const EXHAUSTION_THRESHOLD = 85; // Score extremo
const CONFIRMATION_THRESHOLD = 3; // Mínimo factores para confirmación

// ============================================================================
// SERVICE
// ============================================================================

export const featureEngineeringService = {
  /**
   * Genera todos los features derivados
   */
  generateDerivedFeatures(
    symbol: string,
    factors: FactorScore[],
    previousFactors?: FactorScore[]
  ): DerivedFeatures {
    // Convertir a mapa para fácil acceso
    const factorMap: Record<string, number> = {};
    for (const f of factors) {
      factorMap[f.name] = f.score;
    }

    // Calcular completeness
    const dataCompleteness = factors.length / 11; // 11 factores posibles

    // Calcular features
    const divergence = this.detectDivergences(factors);
    const momentum = this.analyzeMomentum(symbol, factorMap, previousFactors);
    const confirmation = this.analyzeConfirmation(factors);
    const coherence = this.calculateCoherence(factors);
    const volatility = this.estimateImpliedVolatility(factors);
    const recommendations = this.generateRecommendations(
      divergence, momentum, confirmation, coherence
    );

    // Calcular calidad de features
    const featureQuality = this.calculateFeatureQuality(
      dataCompleteness, coherence.signalCoherence, factors.length
    );

    return {
      // Divergencias
      divergenceScore: divergence.score,
      divergenceType: divergence.type,
      divergingFactors: divergence.factors,

      // Momentum
      momentumExhaustion: momentum.exhaustion,
      momentumDirection: momentum.direction,
      extremeReading: momentum.extreme,

      // Confirmaciones
      multiFactorConfirmation: confirmation.score,
      confirmedDirection: confirmation.direction,
      confirmingFactors: confirmation.confirming,
      conflictingFactors: confirmation.conflicting,

      // Coherencia
      signalCoherence: coherence.signalCoherence,
      categoryAlignment: coherence.categoryAlignment,

      // Volatilidad
      impliedVolatility: volatility,

      // Meta
      featureQuality,
      dataCompleteness,

      // Recomendaciones
      recommendations,
    };
  },

  /**
   * Detecta divergencias entre factores
   */
  detectDivergences(factors: FactorScore[]): {
    score: number;
    type: 'bullish' | 'bearish' | 'none';
    factors: string[];
  } {
    // Agrupar factores por tipo
    const priceFactors = factors.filter(f => FACTOR_GROUPS.price.includes(f.name));
    const fundamentalFactors = factors.filter(f => FACTOR_GROUPS.fundamental.includes(f.name));
    const sentimentFactors = factors.filter(f => FACTOR_GROUPS.sentiment.includes(f.name));

    // Calcular promedios por grupo
    const priceAvg = priceFactors.length > 0
      ? priceFactors.reduce((s, f) => s + f.score, 0) / priceFactors.length
      : 50;
    const fundamentalAvg = fundamentalFactors.length > 0
      ? fundamentalFactors.reduce((s, f) => s + f.score, 0) / fundamentalFactors.length
      : 50;
    const sentimentAvg = sentimentFactors.length > 0
      ? sentimentFactors.reduce((s, f) => s + f.score, 0) / sentimentFactors.length
      : 50;

    // Detectar divergencias
    const divergingPairs: string[] = [];
    let maxDivergence = 0;
    let divergenceType: 'bullish' | 'bearish' | 'none' = 'none';

    // Price vs Fundamental
    const priceFundDiff = priceAvg - fundamentalAvg;
    if (Math.abs(priceFundDiff) > DIVERGENCE_THRESHOLD) {
      divergingPairs.push('price-vs-fundamental');
      if (Math.abs(priceFundDiff) > maxDivergence) {
        maxDivergence = Math.abs(priceFundDiff);
        // Si precio bajo pero fundamentales fuertes = bullish divergence
        divergenceType = priceFundDiff < 0 ? 'bullish' : 'bearish';
      }
    }

    // Price vs Sentiment
    const priceSentDiff = priceAvg - sentimentAvg;
    if (Math.abs(priceSentDiff) > DIVERGENCE_THRESHOLD) {
      divergingPairs.push('price-vs-sentiment');
      if (Math.abs(priceSentDiff) > maxDivergence) {
        maxDivergence = Math.abs(priceSentDiff);
        divergenceType = priceSentDiff < 0 ? 'bullish' : 'bearish';
      }
    }

    // Sentiment vs Fundamental
    const sentFundDiff = sentimentAvg - fundamentalAvg;
    if (Math.abs(sentFundDiff) > DIVERGENCE_THRESHOLD) {
      divergingPairs.push('sentiment-vs-fundamental');
    }

    return {
      score: Math.min(100, maxDivergence),
      type: divergenceType,
      factors: divergingPairs,
    };
  },

  /**
   * Analiza momentum y exhaustion
   */
  analyzeMomentum(
    symbol: string,
    currentFactors: Record<string, number>,
    previousFactors?: FactorScore[]
  ): {
    exhaustion: number;
    direction: 'accelerating' | 'decelerating' | 'stable';
    extreme: boolean;
  } {
    // Detectar lecturas extremas
    const scores = Object.values(currentFactors);
    const avgScore = scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 50;
    const extreme = avgScore > EXHAUSTION_THRESHOLD || avgScore < (100 - EXHAUSTION_THRESHOLD);

    // Calcular exhaustion
    let exhaustion = 0;
    if (extreme) {
      exhaustion = Math.abs(avgScore - 50) / 50 * 100;
    }

    // Determinar dirección comparando con histórico
    let direction: 'accelerating' | 'decelerating' | 'stable' = 'stable';
    
    if (previousFactors && previousFactors.length > 0) {
      const prevMap: Record<string, number> = {};
      for (const f of previousFactors) {
        prevMap[f.name] = f.score;
      }
      const prevAvg = Object.values(prevMap).reduce((a, b) => a + b, 0) / Object.values(prevMap).length;
      
      const delta = avgScore - prevAvg;
      if (Math.abs(delta) > 5) {
        // Determinar si está acelerando o decelerando
        if ((avgScore > 50 && delta > 0) || (avgScore < 50 && delta < 0)) {
          direction = 'accelerating';
        } else {
          direction = 'decelerating';
        }
      }
    }

    // Guardar en historial
    this.updateHistory(symbol, currentFactors);

    return { exhaustion, direction, extreme };
  },

  updateHistory(symbol: string, factors: Record<string, number>): void {
    let history = factorHistory.get(symbol) || [];
    
    history.push({
      symbol,
      timestamp: Date.now(),
      factors: factors as Record<FactorName, number>,
    });

    // Mantener máximo
    if (history.length > MAX_HISTORY) {
      history = history.slice(-MAX_HISTORY);
    }

    factorHistory.set(symbol, history);
  },

  /**
   * Analiza confirmación multi-factor
   */
  analyzeConfirmation(factors: FactorScore[]): {
    score: number;
    direction: 'bullish' | 'bearish' | 'mixed';
    confirming: string[];
    conflicting: string[];
  } {
    const bullish: string[] = [];
    const bearish: string[] = [];
    const neutral: string[] = [];

    for (const factor of factors) {
      if (factor.score >= 60) {
        bullish.push(factor.name);
      } else if (factor.score <= 40) {
        bearish.push(factor.name);
      } else {
        neutral.push(factor.name);
      }
    }

    // Determinar dirección dominante
    let direction: 'bullish' | 'bearish' | 'mixed' = 'mixed';
    let confirming: string[] = [];
    let conflicting: string[] = [];

    if (bullish.length >= bearish.length * 2 && bullish.length >= CONFIRMATION_THRESHOLD) {
      direction = 'bullish';
      confirming = bullish;
      conflicting = bearish;
    } else if (bearish.length >= bullish.length * 2 && bearish.length >= CONFIRMATION_THRESHOLD) {
      direction = 'bearish';
      confirming = bearish;
      conflicting = bullish;
    } else {
      confirming = bullish.length > bearish.length ? bullish : bearish;
      conflicting = bullish.length > bearish.length ? bearish : bullish;
    }

    // Score basado en cuántos confirman
    const totalSignificant = bullish.length + bearish.length;
    const dominantCount = Math.max(bullish.length, bearish.length);
    const score = totalSignificant > 0
      ? (dominantCount / totalSignificant) * 100
      : 50;

    return {
      score,
      direction,
      confirming,
      conflicting,
    };
  },

  /**
   * Calcula coherencia de señales
   */
  calculateCoherence(factors: FactorScore[]): {
    signalCoherence: number;
    categoryAlignment: number;
  } {
    if (factors.length === 0) {
      return { signalCoherence: 0.5, categoryAlignment: 0.5 };
    }

    // Calcular varianza de scores
    const scores = factors.map(f => f.score);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length;
    const stdDev = Math.sqrt(variance);

    // Coherencia = 1 - (stdDev normalizada)
    // Si todos los scores son similares, coherencia es alta
    const maxStdDev = 50; // Máximo posible
    const signalCoherence = Math.max(0, 1 - stdDev / maxStdDev);

    // Category alignment: qué tan alineados están los grupos
    let categoryScores: number[] = [];
    for (const group of Object.values(FACTOR_GROUPS)) {
      const groupFactors = factors.filter(f => group.includes(f.name));
      if (groupFactors.length > 0) {
        const groupAvg = groupFactors.reduce((s, f) => s + f.score, 0) / groupFactors.length;
        categoryScores.push(groupAvg);
      }
    }

    const categoryMean = categoryScores.length > 0
      ? categoryScores.reduce((a, b) => a + b, 0) / categoryScores.length
      : 50;
    const categoryVariance = categoryScores.length > 0
      ? categoryScores.reduce((s, v) => s + (v - categoryMean) ** 2, 0) / categoryScores.length
      : 0;
    const categoryStdDev = Math.sqrt(categoryVariance);
    const categoryAlignment = Math.max(0, 1 - categoryStdDev / maxStdDev);

    return { signalCoherence, categoryAlignment };
  },

  /**
   * Estima volatilidad implícita
   */
  estimateImpliedVolatility(factors: FactorScore[]): 'low' | 'medium' | 'high' {
    const scores = factors.map(f => f.score);
    if (scores.length === 0) return 'medium';

    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length;
    const stdDev = Math.sqrt(variance);

    // Factores con alta dispersión implican más volatilidad
    if (stdDev > 25) return 'high';
    if (stdDev > 15) return 'medium';
    return 'low';
  },

  /**
   * Calcula calidad de features
   */
  calculateFeatureQuality(
    completeness: number,
    coherence: number,
    factorCount: number
  ): number {
    // Combinar métricas
    const completenessWeight = 0.4;
    const coherenceWeight = 0.3;
    const countWeight = 0.3;

    const countScore = Math.min(1, factorCount / 8); // 8+ factores = 100%

    return (
      completeness * completenessWeight +
      coherence * coherenceWeight +
      countScore * countWeight
    );
  },

  /**
   * Genera recomendaciones basadas en features
   */
  generateRecommendations(
    divergence: { score: number; type: string; factors: string[] },
    momentum: { exhaustion: number; direction: string; extreme: boolean },
    confirmation: { score: number; direction: string; confirming: string[] },
    coherence: { signalCoherence: number; categoryAlignment: number }
  ): string[] {
    const recommendations: string[] = [];

    // Recomendaciones por divergencia
    if (divergence.score > 40) {
      if (divergence.type === 'bullish') {
        recommendations.push('Divergencia bullish detectada: fundamentales soportan más que el precio actual.');
      } else if (divergence.type === 'bearish') {
        recommendations.push('Divergencia bearish detectada: precio elevado vs fundamentales.');
      }
    }

    // Recomendaciones por momentum
    if (momentum.extreme) {
      if (momentum.direction === 'accelerating') {
        recommendations.push('Momentum extremo acelerando: precaución por posible reversión.');
      } else if (momentum.direction === 'decelerating') {
        recommendations.push('Momentum extremo desacelerando: posible cambio de tendencia.');
      }
    }

    // Recomendaciones por confirmación
    if (confirmation.score > 70) {
      recommendations.push(`Fuerte confirmación ${confirmation.direction}: ${confirmation.confirming.length} factores alineados.`);
    } else if (confirmation.score < 40) {
      recommendations.push('Señales mixtas: esperar mayor claridad antes de actuar.');
    }

    // Recomendaciones por coherencia
    if (coherence.signalCoherence < 0.4) {
      recommendations.push('Baja coherencia entre factores: alta incertidumbre.');
    } else if (coherence.signalCoherence > 0.7) {
      recommendations.push('Alta coherencia: señales claras y consistentes.');
    }

    if (recommendations.length === 0) {
      recommendations.push('Condiciones normales de mercado.');
    }

    return recommendations;
  },

  /**
   * Obtiene historial de factores para un símbolo
   */
  getFactorHistory(symbol: string): HistoricalFactorData[] {
    return factorHistory.get(symbol) || [];
  },

  /**
   * Calcula momentum temporal
   */
  calculateTemporalMomentum(symbol: string): {
    shortTerm: number;
    mediumTerm: number;
    trend: 'improving' | 'deteriorating' | 'stable';
  } {
    const history = factorHistory.get(symbol) || [];
    
    if (history.length < 2) {
      return { shortTerm: 0, mediumTerm: 0, trend: 'stable' };
    }

    // Calcular promedios de cada snapshot
    const avgScores = history.map(h => {
      const scores = Object.values(h.factors);
      return scores.reduce((a, b) => a + b, 0) / scores.length;
    });

    // Short-term: últimos 2
    const shortTerm = avgScores.length >= 2
      ? avgScores[avgScores.length - 1] - avgScores[avgScores.length - 2]
      : 0;

    // Medium-term: primero vs último
    const mediumTerm = avgScores[avgScores.length - 1] - avgScores[0];

    // Trend
    let trend: 'improving' | 'deteriorating' | 'stable' = 'stable';
    if (mediumTerm > 5) trend = 'improving';
    else if (mediumTerm < -5) trend = 'deteriorating';

    return { shortTerm, mediumTerm, trend };
  },

  /**
   * Limpia historial antiguo
   */
  clearOldHistory(): void {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 horas
    
    for (const [symbol, history] of factorHistory.entries()) {
      const filtered = history.filter(h => h.timestamp > cutoff);
      if (filtered.length === 0) {
        factorHistory.delete(symbol);
      } else {
        factorHistory.set(symbol, filtered);
      }
    }

    logger.info(`[FeatureEngineering] Cleaned history, ${factorHistory.size} symbols remaining`);
  },
};
