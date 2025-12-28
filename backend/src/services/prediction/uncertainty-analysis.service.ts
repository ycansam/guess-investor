/**
 * Uncertainty Analysis Service
 * 
 * Detecta condiciones que históricamente causan predicciones fallidas
 * y calcula un "uncertaintyScore" para cada predicción.
 * 
 * El sistema aprende cuándo NO debe predecir.
 * 
 * Migrado de: code/services/uncertainty-analysis-service.ts
 */

import { prisma } from '../../config/database.js';
import { logger } from '../../middleware/logger.js';

const UNCERTAINTY_THRESHOLD = 70; // Score de 0-100, >70 = "no predecir"

/**
 * Factores que pueden causar alta incertidumbre
 */
export interface UncertaintyFactors {
  // Eventos corporativos inminentes
  earningsInDays?: number;
  hasUpcomingEarnings: boolean;
  
  // Volatilidad anormal
  currentVolatility?: number;
  avgVolatility?: number;
  isVolatilityExtreme: boolean;
  
  // Insuficiencia de datos
  missingCriticalData: string[];
  dataCompleteness: number; // 0-100
  
  // Señales contradictorias
  signalCoherence: number; // 0-100
  conflictingFactors: number;
  
  // Condiciones de mercado extremas
  marketRegime?: 'panic' | 'euphoria' | 'normal';
  vixLevel?: 'extreme_fear' | 'fear' | 'neutral' | 'complacency' | 'extreme_complacency';
  
  // Historial de fallos en condiciones similares
  historicalFailRate?: number;
  similarConditionSamples?: number;
}

/**
 * Resultado del análisis de incertidumbre
 */
export interface UncertaintyAnalysis {
  uncertaintyScore: number; // 0-100
  shouldPredict: boolean;
  confidence: 'high' | 'medium' | 'low' | 'very_low';
  primaryReasons: string[];
  factors: UncertaintyFactors;
  recommendation: string;
}

/**
 * Patrón de incertidumbre aprendido
 */
interface UncertaintyPattern {
  condition: string;
  failRate: number;
  samples: number;
  avgAccuracyScore: number;
  earningsProximity?: 'imminent' | 'near' | 'distant';
  volatilityLevel?: 'extreme' | 'high' | 'normal' | 'low';
  dataQuality?: 'insufficient' | 'partial' | 'complete';
  signalType?: 'coherent' | 'mixed' | 'conflicting';
}

// Patrones en memoria
let patterns: UncertaintyPattern[] = [];
let initialized = false;

export const uncertaintyAnalysisService = {
  /**
   * Inicializa el servicio y carga patrones aprendidos
   */
  async initialize(): Promise<void> {
    if (initialized) return;
    
    try {
      // Cargar patrones desde predicciones verificadas
      if (patterns.length === 0) {
        await this.learnFromHistory();
      }
      
      initialized = true;
      logger.info('[UncertaintyAnalysis] Service initialized');
    } catch (error) {
      logger.error('[UncertaintyAnalysis] Error initializing:', error);
      patterns = [];
      initialized = true;
    }
  },

  /**
   * Analiza la incertidumbre de una predicción ANTES de generarla
   */
  async analyzeUncertainty(params: {
    symbol: string;
    assetType: string;
    timeframeDays: number;
    volatility?: number;
    avgHistoricalVolatility?: number;
    earningsInDays?: number;
    factorScores?: Record<string, number>;
    dataCompleteness?: number;
    vixLevel?: 'extreme_fear' | 'fear' | 'neutral' | 'complacency' | 'extreme_complacency';
  }): Promise<UncertaintyAnalysis> {
    await this.initialize();

    const factors = this.extractFactors(params);
    const score = this.calculateUncertaintyScore(factors);
    const confidence = this.getConfidenceLevel(score);
    const reasons = this.getPrimaryReasons(factors, score);
    const recommendation = this.generateRecommendation(score, reasons);

    return {
      uncertaintyScore: score,
      shouldPredict: score < UNCERTAINTY_THRESHOLD,
      confidence,
      primaryReasons: reasons,
      factors,
      recommendation,
    };
  },

  /**
   * Extrae factores de incertidumbre de los parámetros
   */
  extractFactors(params: {
    symbol: string;
    assetType: string;
    timeframeDays: number;
    volatility?: number;
    avgHistoricalVolatility?: number;
    earningsInDays?: number;
    factorScores?: Record<string, number>;
    dataCompleteness?: number;
    vixLevel?: 'extreme_fear' | 'fear' | 'neutral' | 'complacency' | 'extreme_complacency';
  }): UncertaintyFactors {
    const factors: UncertaintyFactors = {
      hasUpcomingEarnings: false,
      isVolatilityExtreme: false,
      missingCriticalData: [],
      dataCompleteness: params.dataCompleteness ?? 0,
      signalCoherence: 50,
      conflictingFactors: 0,
    };

    // 1. Eventos corporativos inminentes
    if (params.earningsInDays !== undefined) {
      factors.earningsInDays = params.earningsInDays;
      factors.hasUpcomingEarnings = params.earningsInDays >= 0 && params.earningsInDays <= params.timeframeDays + 2;
    }

    // 2. Volatilidad extrema
    if (params.volatility !== undefined && params.avgHistoricalVolatility !== undefined) {
      factors.currentVolatility = params.volatility;
      factors.avgVolatility = params.avgHistoricalVolatility;
      factors.isVolatilityExtreme = params.volatility > params.avgHistoricalVolatility * 2;
    }

    // 3. Datos faltantes
    if (params.factorScores) {
      const totalFactors = Object.keys(params.factorScores).length;
      const factorsWithData = Object.entries(params.factorScores).filter(
        ([_, score]) => score !== 0 && !isNaN(score)
      ).length;
      
      factors.dataCompleteness = totalFactors > 0 ? (factorsWithData / totalFactors) * 100 : 0;
      
      Object.entries(params.factorScores).forEach(([name, score]) => {
        if (score === 0 || isNaN(score)) {
          factors.missingCriticalData.push(name);
        }
      });
    }

    // 4. Coherencia de señales
    if (params.factorScores) {
      const { coherence, conflicts } = this.analyzeSignalCoherence(params.factorScores);
      factors.signalCoherence = coherence;
      factors.conflictingFactors = conflicts;
    }

    // 5. Condiciones de mercado
    factors.vixLevel = params.vixLevel;
    if (params.vixLevel === 'extreme_fear') {
      factors.marketRegime = 'panic';
    } else if (params.vixLevel === 'complacency') {
      factors.marketRegime = 'euphoria';
    } else {
      factors.marketRegime = 'normal';
    }

    // 6. Historial de fallos en condiciones similares
    const historicalPattern = this.findSimilarPattern(factors, params.timeframeDays);
    if (historicalPattern) {
      factors.historicalFailRate = historicalPattern.failRate;
      factors.similarConditionSamples = historicalPattern.samples;
    }

    return factors;
  },

  /**
   * Analiza la coherencia de las señales de los factores
   */
  analyzeSignalCoherence(factorScores: Record<string, number>): {
    coherence: number;
    conflicts: number;
  } {
    const scores = Object.values(factorScores).filter(s => !isNaN(s) && s !== 0);
    
    if (scores.length < 2) {
      return { coherence: 50, conflicts: 0 };
    }

    const positive = scores.filter(s => s > 15).length;
    const negative = scores.filter(s => s < -15).length;
    const neutral = scores.filter(s => s >= -15 && s <= 15).length;

    const total = scores.length;
    const maxDirection = Math.max(positive, negative, neutral);
    const coherenceRatio = maxDirection / total;

    const coherence = coherenceRatio * 100;
    const conflicts = positive > negative ? negative : positive;

    return { coherence, conflicts };
  },

  /**
   * Calcula el score de incertidumbre (0-100)
   */
  calculateUncertaintyScore(factors: UncertaintyFactors): number {
    let score = 0;

    // 1. Earnings inminentes (+40 puntos si <2 días, +20 si <7 días)
    if (factors.earningsInDays !== undefined) {
      if (factors.earningsInDays < 2) {
        score += 40;
      } else if (factors.earningsInDays < 7) {
        score += 20;
      }
    }

    // 2. Volatilidad extrema (+30 puntos)
    if (factors.isVolatilityExtreme) {
      score += 30;
    }

    // 3. Datos faltantes (+25 puntos si <50% completo, +15 si <75%)
    if (factors.dataCompleteness < 50) {
      score += 25;
    } else if (factors.dataCompleteness < 75) {
      score += 15;
    }

    // 4. Señales contradictorias (+20 puntos si coherencia <40%)
    if (factors.signalCoherence < 40) {
      score += 20;
    } else if (factors.signalCoherence < 60) {
      score += 10;
    }

    // 5. Condiciones de mercado extremas (+15 puntos)
    if (factors.marketRegime === 'panic' || factors.marketRegime === 'euphoria') {
      score += 15;
    }

    // 6. Historial de fallos en condiciones similares
    if (factors.historicalFailRate !== undefined && factors.similarConditionSamples !== undefined) {
      if (factors.similarConditionSamples >= 5) {
        if (factors.historicalFailRate > 60) {
          score += 30;
        } else if (factors.historicalFailRate > 40) {
          score += 15;
        }
      }
    }

    return Math.min(score, 100);
  },

  /**
   * Obtiene el nivel de confianza basado en el score
   */
  getConfidenceLevel(score: number): 'high' | 'medium' | 'low' | 'very_low' {
    if (score >= 80) return 'very_low';
    if (score >= 60) return 'low';
    if (score >= 40) return 'medium';
    return 'high';
  },

  /**
   * Obtiene las razones principales de la incertidumbre
   */
  getPrimaryReasons(factors: UncertaintyFactors, score: number): string[] {
    const reasons: string[] = [];

    if (factors.earningsInDays !== undefined && factors.earningsInDays < 7) {
      reasons.push(`Earnings en ${factors.earningsInDays} días - alta volatilidad esperada`);
    }

    if (factors.isVolatilityExtreme) {
      reasons.push(`Volatilidad ${factors.currentVolatility?.toFixed(0)}% (2x promedio) - movimientos impredecibles`);
    }

    if (factors.dataCompleteness < 60) {
      reasons.push(`Datos incompletos (${factors.dataCompleteness.toFixed(0)}%) - factores faltantes: ${factors.missingCriticalData.slice(0, 3).join(', ')}`);
    }

    if (factors.signalCoherence < 50) {
      reasons.push(`Señales contradictorias (${factors.conflictingFactors} conflictos) - dirección incierta`);
    }

    if (factors.marketRegime === 'panic') {
      reasons.push('Mercado en pánico - movimientos irracionales');
    } else if (factors.marketRegime === 'euphoria') {
      reasons.push('Mercado en euforia - riesgo de corrección');
    }

    if (factors.historicalFailRate !== undefined && factors.historicalFailRate > 50 && factors.similarConditionSamples && factors.similarConditionSamples >= 5) {
      reasons.push(`Historial: ${factors.historicalFailRate.toFixed(0)}% fallos en condiciones similares`);
    }

    return reasons.slice(0, 3);
  },

  /**
   * Genera recomendación para el usuario
   */
  generateRecommendation(score: number, reasons: string[]): string {
    if (score >= UNCERTAINTY_THRESHOLD) {
      return `⚠️ NO RECOMENDADO predecir (Incertidumbre: ${score}%)\n\nRazones:\n${reasons.map(r => `• ${r}`).join('\n')}`;
    } else if (score >= 50) {
      return `⚡ Predicción posible pero con precaución (Incertidumbre: ${score}%)\n\nFactores de riesgo:\n${reasons.map(r => `• ${r}`).join('\n')}`;
    } else {
      return `✅ Condiciones favorables para predicción (Incertidumbre: ${score}%)`;
    }
  },

  /**
   * Busca un patrón similar en el historial aprendido
   */
  findSimilarPattern(factors: UncertaintyFactors, timeframeDays: number): UncertaintyPattern | null {
    // Clasificar earnings proximity
    let earningsProx: 'imminent' | 'near' | 'distant' | undefined;
    if (factors.earningsInDays !== undefined) {
      if (factors.earningsInDays < 2) earningsProx = 'imminent';
      else if (factors.earningsInDays < 7) earningsProx = 'near';
      else earningsProx = 'distant';
    }

    // Clasificar volatility
    let volLevel: 'extreme' | 'high' | 'normal' | 'low' | undefined;
    if (factors.isVolatilityExtreme) volLevel = 'extreme';
    else if (factors.currentVolatility !== undefined) {
      if (factors.currentVolatility > 50) volLevel = 'high';
      else if (factors.currentVolatility > 20) volLevel = 'normal';
      else volLevel = 'low';
    }

    // Clasificar data quality
    let dataQual: 'insufficient' | 'partial' | 'complete';
    if (factors.dataCompleteness < 50) dataQual = 'insufficient';
    else if (factors.dataCompleteness < 80) dataQual = 'partial';
    else dataQual = 'complete';

    // Clasificar signals
    let signalType: 'coherent' | 'mixed' | 'conflicting';
    if (factors.signalCoherence > 70) signalType = 'coherent';
    else if (factors.signalCoherence > 40) signalType = 'mixed';
    else signalType = 'conflicting';

    // Buscar patrón que coincida
    return patterns.find(p => {
      let matches = 0;
      let total = 0;

      if (p.earningsProximity && earningsProx) {
        total++;
        if (p.earningsProximity === earningsProx) matches++;
      }
      if (p.volatilityLevel && volLevel) {
        total++;
        if (p.volatilityLevel === volLevel) matches++;
      }
      if (p.dataQuality) {
        total++;
        if (p.dataQuality === dataQual) matches++;
      }
      if (p.signalType) {
        total++;
        if (p.signalType === signalType) matches++;
      }

      return total > 0 && (matches / total) >= 0.6;
    }) || null;
  },

  /**
   * Aprende patrones de incertidumbre del historial de predicciones
   */
  async learnFromHistory(): Promise<void> {
    try {
      const verified = await prisma.prediction.findMany({
        where: {
          verified: true,
          accuracyScore: { not: null },
        },
      });
      
      if (verified.length < 10) {
        return;
      }

      // Agrupar por volatilidad
      const groups = this.groupByConditions(verified);

      // Crear patrones
      patterns = groups.map(group => ({
        condition: group.description,
        failRate: (group.failed / group.total) * 100,
        samples: group.total,
        avgAccuracyScore: group.avgScore,
        volatilityLevel: group.volLevel,
      }));

      logger.info(`[UncertaintyAnalysis] Learned ${patterns.length} patterns from ${verified.length} predictions`);
    } catch (error) {
      logger.error('[UncertaintyAnalysis] Error learning from history:', error);
    }
  },

  /**
   * Agrupa predicciones por condiciones similares
   */
  groupByConditions(predictions: { 
    volatilityCategory?: string | null; 
    predictionQuality?: string | null;
    accuracyScore?: number | null;
  }[]): Array<{
    description: string;
    total: number;
    failed: number;
    avgScore: number;
    volLevel?: 'extreme' | 'high' | 'normal' | 'low';
  }> {
    const groups: Map<string, typeof predictions> = new Map();

    predictions.forEach(p => {
      const key = p.volatilityCategory || 'unknown';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    });

    return Array.from(groups.entries()).map(([key, preds]) => {
      const failed = preds.filter(p => p.predictionQuality === 'failed').length;
      const avgScore = preds.reduce((sum, p) => sum + (p.accuracyScore || 0), 0) / preds.length;

      let volLevel: 'extreme' | 'high' | 'normal' | 'low' | undefined;
      if (key === 'high') volLevel = 'high';
      else if (key === 'low') volLevel = 'low';
      else if (key === 'medium') volLevel = 'normal';

      return {
        description: `Volatility: ${key}`,
        total: preds.length,
        failed,
        avgScore,
        volLevel,
      };
    });
  },

  /**
   * Resetea todos los patrones aprendidos
   */
  async reset(): Promise<void> {
    patterns = [];
    initialized = false;
    logger.info('[UncertaintyAnalysis] Patterns reset');
  },

  /**
   * Obtiene estadísticas de patrones
   */
  getPatternStats(): {
    totalPatterns: number;
    patterns: UncertaintyPattern[];
  } {
    return {
      totalPatterns: patterns.length,
      patterns: [...patterns],
    };
  },
};
