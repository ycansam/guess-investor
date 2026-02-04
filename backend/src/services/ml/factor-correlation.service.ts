/**
 * Factor Correlation Service
 * Detecta y modela interacciones entre factores para mejorar predicciones.
 * 
 * - Coherence Bonus: Cuando factores importantes coinciden
 * - Conflict Penalty: Cuando factores se contradicen
 * - Factor Synergies: Pares que funcionan mejor juntos
 * - Redundancy Detection: Factores que dan la misma información
 */

import { prisma } from '../../config/database.js';
import { logger } from '../../middleware/logger.js';

// ============================================================================
// TYPES
// ============================================================================

const FACTORS = [
  'trend', 'technical', 'sentiment', 'news', 'macro',
  'forex', 'institutional', 'seasonality',
  'financials', 'expectations'
] as const;

type Factor = typeof FACTORS[number];

export interface FactorPairCorrelation {
  factor1: Factor;
  factor2: Factor;
  correlation: number;           // -1 a +1
  synergyScore: number;          // 0-100
  redundancyScore: number;       // 0-100
  interactionType: 'synergy' | 'redundant' | 'conflicting' | 'independent';
  conditionalImpact: number;
}

export interface SignalProfile {
  strongBullish: Factor[];
  mildBullish: Factor[];
  neutral: Factor[];
  mildBearish: Factor[];
  strongBearish: Factor[];
  coherenceScore: number;
  conflictScore: number;
  dominantSignal: 'bullish' | 'bearish' | 'mixed' | 'neutral';
}

export interface ConfidenceAdjustment {
  originalConfidence: number;
  adjustedConfidence: number;
  coherenceBonus: number;
  conflictPenalty: number;
  redundancyPenalty: number;
  synergyBonus: number;
  reasons: string[];
}

interface CorrelationMatrix {
  [factor1: string]: { [factor2: string]: number };
}

interface FactorInteractionModel {
  correlationMatrix: CorrelationMatrix;
  synergies: FactorPairCorrelation[];
  redundancies: FactorPairCorrelation[];
  conflicts: FactorPairCorrelation[];
  sampleSize: number;
  lastUpdated: Date;
}

// ============================================================================
// KNOWN RELATIONSHIPS
// ============================================================================

// Sinergias conocidas (pares que funcionan bien juntos)
const KNOWN_SYNERGIES: [Factor, Factor, number][] = [
  ['trend', 'technical', 0.15],        // Momentum confirmado por técnico
  ['sentiment', 'news', 0.12],         // Sentiment coherente con noticias
  ['institutional', 'financials', 0.10], // Institucionales siguen fundamentales
  ['macro', 'forex', 0.08],            // Macro afecta divisas
  ['seasonality', 'macro', 0.05],      // Estacionalidad + macro
];

// Pares redundantes (dan info similar)
const KNOWN_REDUNDANCIES: [Factor, Factor, number][] = [
  ['trend', 'sentiment', 0.10],        // Sentiment sigue tendencia
  ['news', 'expectations', 0.08],      // Noticias crean expectativas
];

// Pares que suelen contradecirse
const KNOWN_CONFLICTS: [Factor, Factor][] = [
  ['technical', 'macro'],              // Corto vs largo plazo
  ['sentiment', 'financials'],         // Emoción vs fundamentales
];

// Cache
let model: FactorInteractionModel | null = null;
let modelLoaded = false;

// ============================================================================
// SERVICE
// ============================================================================

export const factorCorrelationService = {
  /**
   * Inicializa el modelo
   */
  async initialize(): Promise<void> {
    if (modelLoaded) return;
    
    try {
      const stored = await prisma.mLModelState.findFirst({
        where: { modelType: 'factor_correlation' },
        orderBy: { createdAt: 'desc' },
      });
      
      if (stored?.stateJson) {
        model = JSON.parse(stored.stateJson);
        logger.info(`[FactorCorr] Loaded model with ${model?.sampleSize || 0} samples`);
      } else {
        model = this.createEmptyModel();
      }
      modelLoaded = true;
    } catch (error) {
      logger.error('[FactorCorr] Error loading:', error);
      model = this.createEmptyModel();
      modelLoaded = true;
    }
  },

  createEmptyModel(): FactorInteractionModel {
    const correlationMatrix: CorrelationMatrix = {};
    for (const f1 of FACTORS) {
      correlationMatrix[f1] = {};
      for (const f2 of FACTORS) {
        correlationMatrix[f1][f2] = f1 === f2 ? 1 : 0;
      }
    }
    
    return {
      correlationMatrix,
      synergies: [],
      redundancies: [],
      conflicts: [],
      sampleSize: 0,
      lastUpdated: new Date(),
    };
  },

  async saveModel(): Promise<void> {
    if (!model) return;
    
    try {
      await prisma.mLModelState.upsert({
        where: { 
          modelType_version: { 
            modelType: 'factor_correlation', 
            version: 1 
          } 
        },
        update: {
          stateJson: JSON.stringify(model),
          updatedAt: new Date(),
        },
        create: {
          modelType: 'factor_correlation',
          version: 1,
          stateJson: JSON.stringify(model),
        },
      });
    } catch (error) {
      logger.error('[FactorCorr] Error saving:', error);
    }
  },

  /**
   * Analiza el perfil de señales actual
   */
  analyzeSignalProfile(factorScores: Record<string, number>): SignalProfile {
    const profile: SignalProfile = {
      strongBullish: [],
      mildBullish: [],
      neutral: [],
      mildBearish: [],
      strongBearish: [],
      coherenceScore: 0,
      conflictScore: 0,
      dominantSignal: 'neutral',
    };

    // Clasificar factores por intensidad
    for (const factor of FACTORS) {
      const score = factorScores[factor] ?? 0;
      
      if (score > 50) profile.strongBullish.push(factor);
      else if (score > 10) profile.mildBullish.push(factor);
      else if (score >= -10) profile.neutral.push(factor);
      else if (score >= -50) profile.mildBearish.push(factor);
      else profile.strongBearish.push(factor);
    }

    // Calcular coherencia
    const totalBullish = profile.strongBullish.length + profile.mildBullish.length;
    const totalBearish = profile.strongBearish.length + profile.mildBearish.length;
    const total = FACTORS.length;

    if (totalBullish > totalBearish * 2) {
      profile.coherenceScore = Math.min(100, (totalBullish / total) * 100 + 20);
      profile.dominantSignal = 'bullish';
    } else if (totalBearish > totalBullish * 2) {
      profile.coherenceScore = Math.min(100, (totalBearish / total) * 100 + 20);
      profile.dominantSignal = 'bearish';
    } else if (totalBullish > 0 && totalBearish > 0) {
      const minSide = Math.min(totalBullish, totalBearish);
      profile.conflictScore = (minSide / total) * 100;
      profile.dominantSignal = 'mixed';
      profile.coherenceScore = 100 - profile.conflictScore;
    } else {
      profile.coherenceScore = 50;
      profile.dominantSignal = 'neutral';
    }

    return profile;
  },

  /**
   * Calcula ajuste de confianza basado en interacciones
   */
  calculateConfidenceAdjustment(
    factorScores: Record<string, number>,
    originalConfidence: number
  ): ConfidenceAdjustment {
    const result: ConfidenceAdjustment = {
      originalConfidence,
      adjustedConfidence: originalConfidence,
      coherenceBonus: 0,
      conflictPenalty: 0,
      redundancyPenalty: 0,
      synergyBonus: 0,
      reasons: [],
    };

    const profile = this.analyzeSignalProfile(factorScores);

    // Bonus por coherencia
    if (profile.coherenceScore > 75) {
      result.coherenceBonus = Math.round((profile.coherenceScore - 75) * 0.3);
      result.reasons.push(`Coherencia alta (+${result.coherenceBonus}%)`);
    }

    // Penalización por conflicto
    if (profile.conflictScore > 30) {
      result.conflictPenalty = Math.round((profile.conflictScore - 30) * 0.4);
      result.reasons.push(`Señales conflictivas (-${result.conflictPenalty}%)`);
    }

    // Bonus por sinergias
    for (const [f1, f2, bonus] of KNOWN_SYNERGIES) {
      const score1 = factorScores[f1] ?? 0;
      const score2 = factorScores[f2] ?? 0;
      
      // Si ambos son fuertes en la misma dirección
      if (Math.sign(score1) === Math.sign(score2) && Math.abs(score1) > 30 && Math.abs(score2) > 30) {
        result.synergyBonus += Math.round(bonus * 100);
      }
    }
    
    if (result.synergyBonus > 0) {
      result.synergyBonus = Math.min(15, result.synergyBonus);
      result.reasons.push(`Sinergias detectadas (+${result.synergyBonus}%)`);
    }

    // Penalización por redundancia
    for (const [f1, f2, penalty] of KNOWN_REDUNDANCIES) {
      const score1 = factorScores[f1] ?? 0;
      const score2 = factorScores[f2] ?? 0;
      
      // Si ambos son muy similares, uno es redundante
      if (Math.abs(score1 - score2) < 15 && Math.abs(score1) > 20) {
        result.redundancyPenalty += Math.round(penalty * 50);
      }
    }
    
    if (result.redundancyPenalty > 0) {
      result.redundancyPenalty = Math.min(10, result.redundancyPenalty);
      result.reasons.push(`Factores redundantes (-${result.redundancyPenalty}%)`);
    }

    // Calcular confianza final
    result.adjustedConfidence = Math.max(20, Math.min(95,
      originalConfidence + result.coherenceBonus + result.synergyBonus 
      - result.conflictPenalty - result.redundancyPenalty
    ));

    return result;
  },

  /**
   * Detecta factores que se contradicen fuertemente
   */
  detectConflicts(factorScores: Record<string, number>): Array<{
    factor1: Factor;
    factor2: Factor;
    score1: number;
    score2: number;
    severity: 'mild' | 'moderate' | 'severe';
  }> {
    const conflicts: Array<{
      factor1: Factor;
      factor2: Factor;
      score1: number;
      score2: number;
      severity: 'mild' | 'moderate' | 'severe';
    }> = [];

    for (const [f1, f2] of KNOWN_CONFLICTS) {
      const score1 = factorScores[f1] ?? 0;
      const score2 = factorScores[f2] ?? 0;
      
      // Conflicto si tienen signos opuestos y ambos son significativos
      if (Math.sign(score1) !== Math.sign(score2) && Math.abs(score1) > 20 && Math.abs(score2) > 20) {
        const diff = Math.abs(score1 - score2);
        let severity: 'mild' | 'moderate' | 'severe' = 'mild';
        if (diff > 80) severity = 'severe';
        else if (diff > 50) severity = 'moderate';
        
        conflicts.push({ factor1: f1, factor2: f2, score1, score2, severity });
      }
    }

    return conflicts;
  },

  /**
   * Aprende correlaciones de predicciones verificadas
   */
  async learnFromPredictions(): Promise<{ updated: boolean; newSamples: number }> {
    await this.initialize();
    if (!model) return { updated: false, newSamples: 0 };

    try {
      const predictions = await prisma.prediction.findMany({
        where: { verified: true },
        select: {
          factorBreakdown: true,
          accuracyScore: true,
          directionCorrect: true,
        },
        take: 500,
        orderBy: { createdAt: 'desc' },
      });

      if (predictions.length < 10) {
        return { updated: false, newSamples: 0 };
      }

      // Extraer factor scores de cada predicción
      const samples: Array<{ scores: Record<string, number>; accuracy: number }> = [];
      
      for (const p of predictions) {
        if (!p.factorBreakdown || !p.accuracyScore) continue;
        
        const breakdown = typeof p.factorBreakdown === 'string' 
          ? JSON.parse(p.factorBreakdown) 
          : p.factorBreakdown;
          
        const availableFactors = breakdown.availableFactors || [];
        const scores: Record<string, number> = {};
        
        for (const f of availableFactors) {
          if (f.name && typeof f.score === 'number') {
            scores[f.name] = f.score;
          }
        }
        
        if (Object.keys(scores).length >= 3) {
          samples.push({ scores, accuracy: p.accuracyScore });
        }
      }

      if (samples.length < 10) {
        return { updated: false, newSamples: 0 };
      }

      // Calcular correlaciones entre factores
      for (const f1 of FACTORS) {
        for (const f2 of FACTORS) {
          if (f1 === f2) continue;
          
          const pairs = samples
            .filter(s => s.scores[f1] !== undefined && s.scores[f2] !== undefined)
            .map(s => [s.scores[f1], s.scores[f2]]);
          
          if (pairs.length >= 5) {
            const corr = this.calculateCorrelation(pairs);
            model.correlationMatrix[f1][f2] = corr;
          }
        }
      }

      model.sampleSize = samples.length;
      model.lastUpdated = new Date();
      
      await this.saveModel();
      
      logger.info(`[FactorCorr] Learned from ${samples.length} samples`);
      
      return { updated: true, newSamples: samples.length };
    } catch (error) {
      logger.error('[FactorCorr] Error learning:', error);
      return { updated: false, newSamples: 0 };
    }
  },

  /**
   * Calcula correlación de Pearson
   */
  calculateCorrelation(pairs: number[][]): number {
    const n = pairs.length;
    if (n < 2) return 0;

    const x = pairs.map(p => p[0]);
    const y = pairs.map(p => p[1]);
    
    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;
    
    let num = 0, denX = 0, denY = 0;
    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      num += dx * dy;
      denX += dx * dx;
      denY += dy * dy;
    }
    
    const den = Math.sqrt(denX * denY);
    return den === 0 ? 0 : num / den;
  },

  /**
   * Obtiene matriz de correlaciones
   */
  async getCorrelationMatrix(): Promise<CorrelationMatrix> {
    await this.initialize();
    return model?.correlationMatrix || {};
  },

  /**
   * Obtiene estadísticas del modelo
   */
  async getStats(): Promise<{
    sampleSize: number;
    synergiesCount: number;
    redundanciesCount: number;
    lastUpdated: Date | null;
  }> {
    await this.initialize();
    
    return {
      sampleSize: model?.sampleSize || 0,
      synergiesCount: model?.synergies.length || KNOWN_SYNERGIES.length,
      redundanciesCount: model?.redundancies.length || KNOWN_REDUNDANCIES.length,
      lastUpdated: model?.lastUpdated || null,
    };
  },
};
