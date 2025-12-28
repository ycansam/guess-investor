/**
 * Temporal Cross-Validation Service
 * Implementa walk-forward validation para evitar overfitting.
 * 
 * Walk-Forward Validation:
 * - Entrena solo con datos del pasado
 * - Valida con datos "del futuro" (que no se usaron para entrenar)
 * - Nunca hay data leakage del futuro al pasado
 */

import { prisma } from '../../config/database.js';
import { logger } from '../../middleware/logger.js';

// ============================================================================
// TYPES
// ============================================================================

const FACTORS = [
  'trend', 'technical', 'sentiment', 'news', 'macro',
  'competitors', 'forex', 'institutional', 'seasonality',
  'financials', 'expectations'
] as const;

type Factor = typeof FACTORS[number];
type WeightsMap = Record<Factor, number>;

export interface ValidationWindow {
  windowIndex: number;
  trainStart: string;
  trainEnd: string;
  validStart: string;
  validEnd: string;
  trainSamples: number;
  validSamples: number;
  trainLoss: number;
  validLoss: number;
  validAccuracy: number;
  validDirectionAccuracy: number;
  overfitRatio: number;
}

export interface CrossValidationResult {
  totalWindows: number;
  avgTrainLoss: number;
  avgValidLoss: number;
  avgValidAccuracy: number;
  avgDirectionAccuracy: number;
  overfitScore: number;
  stabilityScore: number;
  windows: ValidationWindow[];
  recommendation: string;
  isReliable: boolean;
}

export interface OutOfSampleResult {
  trainPeriod: { start: string; end: string };
  testPeriod: { start: string; end: string };
  trainSamples: number;
  testSamples: number;
  trainAccuracy: number;
  testAccuracy: number;
  trainDirection: number;
  testDirection: number;
  degradation: number;
  isSignificant: boolean;
}

interface PredictionSample {
  id: string;
  targetDate: Date;
  factorScores: Record<string, number>;
  timeframe: string;
  predictedChange: number;
  actualChange: number;
  accuracyScore: number;
  directionCorrect: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MIN_TRAIN_SAMPLES = 15;
const VALIDATION_WINDOW = 10;
const STEP_SIZE = 5;
const DEFAULT_WEIGHTS: WeightsMap = {
  trend: 0.12, technical: 0.15, sentiment: 0.10, news: 0.10,
  macro: 0.08, competitors: 0.08, forex: 0.05, institutional: 0.10,
  seasonality: 0.05, financials: 0.09, expectations: 0.08,
};

// ============================================================================
// SERVICE
// ============================================================================

export const temporalCrossValidationService = {
  /**
   * Ejecuta walk-forward cross-validation
   */
  async runWalkForwardValidation(): Promise<CrossValidationResult> {
    const predictions = await this.loadVerifiedPredictions();
    
    if (predictions.length < MIN_TRAIN_SAMPLES + VALIDATION_WINDOW) {
      return {
        totalWindows: 0,
        avgTrainLoss: 0,
        avgValidLoss: 0,
        avgValidAccuracy: 0,
        avgDirectionAccuracy: 0,
        overfitScore: 0,
        stabilityScore: 0,
        windows: [],
        recommendation: `Necesitas al menos ${MIN_TRAIN_SAMPLES + VALIDATION_WINDOW} predicciones verificadas`,
        isReliable: false,
      };
    }

    // Ordenar por fecha
    const sorted = [...predictions].sort(
      (a, b) => a.targetDate.getTime() - b.targetDate.getTime()
    );

    const windows: ValidationWindow[] = [];
    let windowIndex = 0;

    // Walk-forward
    for (let trainEnd = MIN_TRAIN_SAMPLES; trainEnd <= sorted.length - VALIDATION_WINDOW; trainEnd += STEP_SIZE) {
      const trainSet = sorted.slice(0, trainEnd);
      const validSet = sorted.slice(trainEnd, trainEnd + VALIDATION_WINDOW);

      if (validSet.length < 3) continue;

      // Entrenar con trainSet
      const trainWeights = this.trainWeights(trainSet);
      const trainLoss = this.computeLoss(trainSet, trainWeights);

      // Validar con validSet
      const validLoss = this.computeLoss(validSet, trainWeights);
      const validMetrics = this.computeMetrics(validSet);

      const window: ValidationWindow = {
        windowIndex,
        trainStart: trainSet[0].targetDate.toISOString(),
        trainEnd: trainSet[trainSet.length - 1].targetDate.toISOString(),
        validStart: validSet[0].targetDate.toISOString(),
        validEnd: validSet[validSet.length - 1].targetDate.toISOString(),
        trainSamples: trainSet.length,
        validSamples: validSet.length,
        trainLoss,
        validLoss,
        validAccuracy: validMetrics.avgAccuracy,
        validDirectionAccuracy: validMetrics.directionAccuracy,
        overfitRatio: trainLoss > 0 ? validLoss / trainLoss : 1,
      };

      windows.push(window);
      windowIndex++;
    }

    if (windows.length === 0) {
      return {
        totalWindows: 0,
        avgTrainLoss: 0,
        avgValidLoss: 0,
        avgValidAccuracy: 0,
        avgDirectionAccuracy: 0,
        overfitScore: 0,
        stabilityScore: 0,
        windows: [],
        recommendation: 'No hay suficientes datos para walk-forward validation',
        isReliable: false,
      };
    }

    // Calcular promedios
    const avgTrainLoss = windows.reduce((s, w) => s + w.trainLoss, 0) / windows.length;
    const avgValidLoss = windows.reduce((s, w) => s + w.validLoss, 0) / windows.length;
    const avgValidAccuracy = windows.reduce((s, w) => s + w.validAccuracy, 0) / windows.length;
    const avgDirectionAccuracy = windows.reduce((s, w) => s + w.validDirectionAccuracy, 0) / windows.length;
    const avgOverfitRatio = windows.reduce((s, w) => s + w.overfitRatio, 0) / windows.length;

    // Calcular overfitScore (0-100)
    let overfitScore = 0;
    if (avgOverfitRatio > 1.5) overfitScore = Math.min(100, (avgOverfitRatio - 1) * 50);
    
    // Calcular estabilidad (varianza de accuracy entre ventanas)
    const accuracies = windows.map(w => w.validAccuracy);
    const mean = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
    const variance = accuracies.reduce((s, a) => s + Math.pow(a - mean, 2), 0) / accuracies.length;
    const stdDev = Math.sqrt(variance);
    const stabilityScore = Math.max(0, 100 - stdDev * 2);

    // Generar recomendación
    let recommendation = '';
    if (overfitScore > 50) {
      recommendation = '⚠️ Alto overfitting detectado. El modelo funciona mejor en entrenamiento que en validación.';
    } else if (overfitScore > 25) {
      recommendation = '⚡ Overfitting moderado. Considera usar más regularización.';
    } else if (avgValidAccuracy < 50) {
      recommendation = '📉 Accuracy de validación baja. El modelo necesita más datos o ajustes.';
    } else if (stabilityScore < 50) {
      recommendation = '📊 Performance inestable entre ventanas. Más datos ayudarían.';
    } else {
      recommendation = '✅ El modelo generaliza bien. Performance estable.';
    }

    const isReliable = overfitScore < 40 && avgValidAccuracy > 50 && stabilityScore > 40;

    logger.info(`[TCV] Walk-forward: ${windows.length} windows, overfit=${overfitScore.toFixed(1)}, validAcc=${avgValidAccuracy.toFixed(1)}%`);

    return {
      totalWindows: windows.length,
      avgTrainLoss,
      avgValidLoss,
      avgValidAccuracy,
      avgDirectionAccuracy,
      overfitScore,
      stabilityScore,
      windows,
      recommendation,
      isReliable,
    };
  },

  /**
   * Test out-of-sample con split temporal
   */
  async runOutOfSampleTest(trainRatio: number = 0.7): Promise<OutOfSampleResult> {
    const predictions = await this.loadVerifiedPredictions();
    
    const sorted = [...predictions].sort(
      (a, b) => a.targetDate.getTime() - b.targetDate.getTime()
    );

    const splitIndex = Math.floor(sorted.length * trainRatio);
    const trainSet = sorted.slice(0, splitIndex);
    const testSet = sorted.slice(splitIndex);

    if (trainSet.length < 10 || testSet.length < 5) {
      return {
        trainPeriod: { start: '', end: '' },
        testPeriod: { start: '', end: '' },
        trainSamples: trainSet.length,
        testSamples: testSet.length,
        trainAccuracy: 0,
        testAccuracy: 0,
        trainDirection: 0,
        testDirection: 0,
        degradation: 0,
        isSignificant: false,
      };
    }

    const trainWeights = this.trainWeights(trainSet);
    const trainMetrics = this.computeMetrics(trainSet);
    const testMetrics = this.computeMetrics(testSet);

    const degradation = trainMetrics.avgAccuracy - testMetrics.avgAccuracy;

    logger.info(`[TCV] OOS Test: train=${trainMetrics.avgAccuracy.toFixed(1)}%, test=${testMetrics.avgAccuracy.toFixed(1)}%, degradation=${degradation.toFixed(1)}%`);

    return {
      trainPeriod: {
        start: trainSet[0].targetDate.toISOString(),
        end: trainSet[trainSet.length - 1].targetDate.toISOString(),
      },
      testPeriod: {
        start: testSet[0].targetDate.toISOString(),
        end: testSet[testSet.length - 1].targetDate.toISOString(),
      },
      trainSamples: trainSet.length,
      testSamples: testSet.length,
      trainAccuracy: trainMetrics.avgAccuracy,
      testAccuracy: testMetrics.avgAccuracy,
      trainDirection: trainMetrics.directionAccuracy,
      testDirection: testMetrics.directionAccuracy,
      degradation,
      isSignificant: degradation > 15,
    };
  },

  /**
   * Carga predicciones verificadas
   */
  async loadVerifiedPredictions(): Promise<PredictionSample[]> {
    const predictions = await prisma.prediction.findMany({
      where: { verified: true },
      select: {
        id: true,
        expiresAt: true,
        factorBreakdown: true,
        timeframe: true,
        predictedChange: true,
        actualChange: true,
        accuracyScore: true,
        directionCorrect: true,
      },
      orderBy: { expiresAt: 'asc' },
    });

    return predictions
      .filter(p => p.accuracyScore !== null)
      .map(p => {
        let factorScores: Record<string, number> = {};
        if (p.factorBreakdown) {
          const breakdown = typeof p.factorBreakdown === 'string'
            ? JSON.parse(p.factorBreakdown)
            : p.factorBreakdown;
          const factors = breakdown.availableFactors || [];
          for (const f of factors) {
            if (f.name && typeof f.score === 'number') {
              factorScores[f.name] = f.score;
            }
          }
        }

        return {
          id: p.id,
          targetDate: p.expiresAt || new Date(),
          factorScores,
          timeframe: p.timeframe,
          predictedChange: p.predictedChange,
          actualChange: p.actualChange || 0,
          accuracyScore: p.accuracyScore || 0,
          directionCorrect: p.directionCorrect || false,
        };
      });
  },

  /**
   * Entrena pesos simples con gradiente
   */
  trainWeights(samples: PredictionSample[]): WeightsMap {
    const weights = { ...DEFAULT_WEIGHTS };
    const learningRate = 0.01;
    const epochs = 50;

    for (let epoch = 0; epoch < epochs; epoch++) {
      for (const sample of samples) {
        // Calcular predicción con pesos actuales
        let predicted = 0;
        let totalWeight = 0;
        
        for (const factor of FACTORS) {
          const score = sample.factorScores[factor];
          if (score !== undefined) {
            predicted += score * weights[factor];
            totalWeight += weights[factor];
          }
        }
        
        if (totalWeight > 0) {
          predicted = (predicted / totalWeight) / 100 * 5; // Escalar a % esperado
        }

        // Error
        const error = sample.actualChange - predicted;

        // Actualizar pesos (gradiente simple)
        for (const factor of FACTORS) {
          const score = sample.factorScores[factor];
          if (score !== undefined) {
            const gradient = error * (score / 100);
            weights[factor] += learningRate * gradient;
            weights[factor] = Math.max(0.01, Math.min(0.5, weights[factor]));
          }
        }
      }

      // Normalizar pesos
      const sum = Object.values(weights).reduce((a, b) => a + b, 0);
      for (const factor of FACTORS) {
        weights[factor] /= sum;
      }
    }

    return weights;
  },

  /**
   * Calcula loss (MSE)
   */
  computeLoss(samples: PredictionSample[], weights: WeightsMap): number {
    if (samples.length === 0) return 0;

    let totalError = 0;
    for (const sample of samples) {
      let predicted = 0;
      let totalWeight = 0;
      
      for (const factor of FACTORS) {
        const score = sample.factorScores[factor];
        if (score !== undefined) {
          predicted += score * weights[factor];
          totalWeight += weights[factor];
        }
      }
      
      if (totalWeight > 0) {
        predicted = (predicted / totalWeight) / 100 * 5;
      }

      const error = sample.actualChange - predicted;
      totalError += error * error;
    }

    return totalError / samples.length;
  },

  /**
   * Calcula métricas de accuracy
   */
  computeMetrics(samples: PredictionSample[]): {
    avgAccuracy: number;
    directionAccuracy: number;
  } {
    if (samples.length === 0) return { avgAccuracy: 0, directionAccuracy: 0 };

    const avgAccuracy = samples.reduce((s, p) => s + p.accuracyScore, 0) / samples.length;
    const correctDirection = samples.filter(p => p.directionCorrect).length;
    const directionAccuracy = (correctDirection / samples.length) * 100;

    return { avgAccuracy, directionAccuracy };
  },

  /**
   * Detecta si hay overfitting basado en degradación
   */
  async detectOverfitting(): Promise<{
    hasOverfitting: boolean;
    severity: 'none' | 'mild' | 'moderate' | 'severe';
    recommendation: string;
  }> {
    const cvResult = await this.runWalkForwardValidation();
    
    if (!cvResult.isReliable) {
      return {
        hasOverfitting: false,
        severity: 'none',
        recommendation: 'Insuficientes datos para detectar overfitting',
      };
    }

    let severity: 'none' | 'mild' | 'moderate' | 'severe' = 'none';
    if (cvResult.overfitScore > 70) severity = 'severe';
    else if (cvResult.overfitScore > 40) severity = 'moderate';
    else if (cvResult.overfitScore > 20) severity = 'mild';

    return {
      hasOverfitting: severity !== 'none',
      severity,
      recommendation: cvResult.recommendation,
    };
  },
};
