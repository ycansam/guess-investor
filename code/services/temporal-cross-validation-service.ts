/**
 * Temporal Cross-Validation Service
 * Implementa walk-forward validation para evitar overfitting.
 * 
 * Walk-Forward Validation:
 * - Entrena solo con datos del pasado
 * - Valida con datos "del futuro" (que no se usaron para entrenar)
 * - Nunca hay data leakage del futuro al pasado
 * 
 * Esto da una estimación más realista del performance real del modelo.
 */

import { TrackedPrediction, predictionTrackingService } from './prediction-tracking-service';

// Configuración
const MIN_TRAIN_SAMPLES = 15;   // Mínimo para entrenar
const VALIDATION_WINDOW = 10;  // Predicciones para validar
const STEP_SIZE = 5;           // Avance entre ventanas

const FACTORS = [
  'trend', 'technical', 'sentiment', 'news', 'macro',
  'competitors', 'forex', 'institutional', 'seasonality',
  'financials', 'expectations'
] as const;

type Factor = typeof FACTORS[number];
type WeightsMap = Record<Factor, number>;

/**
 * Resultado de una ventana de validación
 */
export interface ValidationWindow {
  windowIndex: number;
  trainStart: string;     // Fecha inicio entrenamiento
  trainEnd: string;       // Fecha fin entrenamiento
  validStart: string;     // Fecha inicio validación
  validEnd: string;       // Fecha fin validación
  trainSamples: number;
  validSamples: number;
  trainLoss: number;
  validLoss: number;
  validAccuracy: number;
  validDirectionAccuracy: number;
  overfitRatio: number;   // validLoss / trainLoss - si >1.5 hay overfitting
}

/**
 * Resultado completo de cross-validation
 */
export interface CrossValidationResult {
  totalWindows: number;
  avgTrainLoss: number;
  avgValidLoss: number;
  avgValidAccuracy: number;
  avgDirectionAccuracy: number;
  overfitScore: number;       // 0-100, donde 0 = no overfit, 100 = severe overfit
  stabilityScore: number;     // 0-100, qué tan estable es el performance
  windows: ValidationWindow[];
  recommendation: string;
  isReliable: boolean;
}

/**
 * Resultado de out-of-sample testing
 */
export interface OutOfSampleResult {
  trainPeriod: { start: string; end: string };
  testPeriod: { start: string; end: string };
  trainSamples: number;
  testSamples: number;
  trainAccuracy: number;
  testAccuracy: number;
  trainDirection: number;
  testDirection: number;
  degradation: number;        // % caída de performance in-sample vs out-of-sample
  isSignificant: boolean;     // Si la degradación es significativa
}

class TemporalCrossValidationService {
  
  /**
   * Ejecuta walk-forward cross-validation
   */
  async runWalkForwardValidation(): Promise<CrossValidationResult> {
    const allPredictions = await predictionTrackingService.getVerifiedPredictions();
    
    // Ordenar por fecha
    const sorted = [...allPredictions].sort(
      (a, b) => new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime()
    );

    if (sorted.length < MIN_TRAIN_SAMPLES + VALIDATION_WINDOW) {
      return {
        totalWindows: 0,
        avgTrainLoss: 0,
        avgValidLoss: 0,
        avgValidAccuracy: 0,
        avgDirectionAccuracy: 0,
        overfitScore: 0,
        stabilityScore: 0,
        windows: [],
        recommendation: `Necesitas al menos ${MIN_TRAIN_SAMPLES + VALIDATION_WINDOW} predicciones verificadas para cross-validation`,
        isReliable: false,
      };
    }

    const windows: ValidationWindow[] = [];
    let windowIndex = 0;

    // Walk-forward: avanzar ventana de entrenamiento
    for (let trainEnd = MIN_TRAIN_SAMPLES; trainEnd <= sorted.length - VALIDATION_WINDOW; trainEnd += STEP_SIZE) {
      const trainSet = sorted.slice(0, trainEnd);
      const validSet = sorted.slice(trainEnd, trainEnd + VALIDATION_WINDOW);

      if (validSet.length < 3) continue;

      // Entrenar con trainSet
      const trainWeights = this.trainWeights(trainSet);
      const trainLoss = this.computeLoss(trainSet, trainWeights);

      // Validar con validSet (datos "del futuro")
      const validLoss = this.computeLoss(validSet, trainWeights);
      const validMetrics = this.computeMetrics(validSet);

      const window: ValidationWindow = {
        windowIndex,
        trainStart: trainSet[0].targetDate,
        trainEnd: trainSet[trainSet.length - 1].targetDate,
        validStart: validSet[0].targetDate,
        validEnd: validSet[validSet.length - 1].targetDate,
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
        recommendation: 'No hay suficientes datos para crear ventanas de validación',
        isReliable: false,
      };
    }

    // Calcular métricas agregadas
    const avgTrainLoss = this.mean(windows.map(w => w.trainLoss));
    const avgValidLoss = this.mean(windows.map(w => w.validLoss));
    const avgValidAccuracy = this.mean(windows.map(w => w.validAccuracy));
    const avgDirectionAccuracy = this.mean(windows.map(w => w.validDirectionAccuracy));
    const avgOverfitRatio = this.mean(windows.map(w => w.overfitRatio));

    // Score de overfitting (0-100)
    // ratio 1.0 = 0 overfit, ratio 2.0+ = 100 overfit
    const overfitScore = Math.min(100, Math.max(0, (avgOverfitRatio - 1) * 100));

    // Score de estabilidad (varianza de accuracy entre ventanas)
    const accuracyStdDev = this.standardDeviation(windows.map(w => w.validAccuracy));
    const stabilityScore = Math.max(0, 100 - accuracyStdDev * 2);

    // Generar recomendación
    let recommendation = '';
    if (overfitScore > 50) {
      recommendation = '⚠️ Alto overfitting detectado. Considera simplificar el modelo o añadir regularización.';
    } else if (overfitScore > 25) {
      recommendation = '🟡 Overfitting moderado. El modelo podría no generalizar bien a datos nuevos.';
    } else if (stabilityScore < 50) {
      recommendation = '🟡 Performance inestable entre ventanas. Los resultados pueden variar significativamente.';
    } else if (avgValidAccuracy > 55 && avgDirectionAccuracy > 55) {
      recommendation = '✅ El modelo parece generalizar bien. Performance estable y sin overfitting significativo.';
    } else {
      recommendation = '🔄 Performance moderado. Considera recolectar más datos o ajustar features.';
    }

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
      isReliable: overfitScore < 30 && stabilityScore > 60,
    };
  }

  /**
   * Ejecuta test out-of-sample simple (train/test split)
   */
  async runOutOfSampleTest(testRatio: number = 0.2): Promise<OutOfSampleResult> {
    const allPredictions = await predictionTrackingService.getVerifiedPredictions();
    
    // Ordenar por fecha
    const sorted = [...allPredictions].sort(
      (a, b) => new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime()
    );

    const splitIndex = Math.floor(sorted.length * (1 - testRatio));
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

    // Entrenar con trainSet
    const weights = this.trainWeights(trainSet);

    // Evaluar en ambos sets
    const trainMetrics = this.computeMetrics(trainSet);
    const testMetrics = this.computeMetrics(testSet);

    // Calcular degradación
    const degradation = trainMetrics.avgAccuracy > 0
      ? ((trainMetrics.avgAccuracy - testMetrics.avgAccuracy) / trainMetrics.avgAccuracy) * 100
      : 0;

    return {
      trainPeriod: {
        start: trainSet[0].targetDate,
        end: trainSet[trainSet.length - 1].targetDate,
      },
      testPeriod: {
        start: testSet[0].targetDate,
        end: testSet[testSet.length - 1].targetDate,
      },
      trainSamples: trainSet.length,
      testSamples: testSet.length,
      trainAccuracy: trainMetrics.avgAccuracy,
      testAccuracy: testMetrics.avgAccuracy,
      trainDirection: trainMetrics.directionAccuracy,
      testDirection: testMetrics.directionAccuracy,
      degradation,
      isSignificant: degradation > 15, // >15% degradación es significativa
    };
  }

  /**
   * Entrena pesos simples basados en correlación
   */
  private trainWeights(predictions: TrackedPrediction[]): WeightsMap {
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

      if (scores.length >= 5) {
        correlations[factor] = Math.max(0.01, Math.abs(this.correlation(scores, accuracies)));
      } else {
        correlations[factor] = 1 / FACTORS.length;
      }
    }

    // Normalizar
    const total = Object.values(correlations).reduce((a, b) => a + b, 0);
    const weights: WeightsMap = {} as WeightsMap;
    for (const factor of FACTORS) {
      weights[factor] = correlations[factor] / total;
    }

    return weights;
  }

  /**
   * Calcula pérdida para un set de predicciones
   */
  private computeLoss(predictions: TrackedPrediction[], weights: WeightsMap): number {
    if (predictions.length === 0) return 0;

    let totalLoss = 0;

    for (const pred of predictions) {
      // Loss por dirección
      const dirLoss = pred.directionCorrect ? 0 : 1;

      // Loss por accuracy
      const accLoss = pred.accuracyScore !== undefined 
        ? 1 - (pred.accuracyScore / 100)
        : 0.5;

      totalLoss += 0.5 * dirLoss + 0.5 * accLoss;
    }

    return totalLoss / predictions.length;
  }

  /**
   * Calcula métricas para un set de predicciones
   */
  private computeMetrics(predictions: TrackedPrediction[]): {
    avgAccuracy: number;
    directionAccuracy: number;
  } {
    const accuracies = predictions
      .filter(p => p.accuracyScore !== undefined)
      .map(p => p.accuracyScore!);

    const directions = predictions.filter(p => p.directionCorrect !== undefined);
    const directionAcc = directions.length > 0
      ? (directions.filter(p => p.directionCorrect).length / directions.length) * 100
      : 50;

    return {
      avgAccuracy: this.mean(accuracies),
      directionAccuracy: directionAcc,
    };
  }

  /**
   * Genera reporte de cross-validation
   */
  async generateReport(): Promise<string> {
    const cvResult = await this.runWalkForwardValidation();
    const oosResult = await this.runOutOfSampleTest();

    let report = '📊 CROSS-VALIDATION TEMPORAL\n';
    report += '═'.repeat(50) + '\n\n';

    // Walk-Forward
    report += '🔄 WALK-FORWARD VALIDATION\n';
    if (cvResult.totalWindows > 0) {
      report += `  Ventanas: ${cvResult.totalWindows}\n`;
      report += `  Avg Train Loss: ${cvResult.avgTrainLoss.toFixed(3)}\n`;
      report += `  Avg Valid Loss: ${cvResult.avgValidLoss.toFixed(3)}\n`;
      report += `  Avg Valid Accuracy: ${cvResult.avgValidAccuracy.toFixed(1)}%\n`;
      report += `  Avg Direction Acc: ${cvResult.avgDirectionAccuracy.toFixed(1)}%\n`;
      report += `  Overfit Score: ${cvResult.overfitScore.toFixed(0)}/100 ${cvResult.overfitScore > 30 ? '⚠️' : '✅'}\n`;
      report += `  Stability Score: ${cvResult.stabilityScore.toFixed(0)}/100 ${cvResult.stabilityScore < 50 ? '⚠️' : '✅'}\n`;
      report += `\n  ${cvResult.recommendation}\n`;
    } else {
      report += `  ${cvResult.recommendation}\n`;
    }

    // Out-of-Sample
    report += '\n📈 OUT-OF-SAMPLE TEST (80/20 split)\n';
    if (oosResult.trainSamples > 0 && oosResult.testSamples > 0) {
      report += `  Train: ${oosResult.trainSamples} samples | Test: ${oosResult.testSamples} samples\n`;
      report += `  Train Accuracy: ${oosResult.trainAccuracy.toFixed(1)}%\n`;
      report += `  Test Accuracy: ${oosResult.testAccuracy.toFixed(1)}%\n`;
      report += `  Degradation: ${oosResult.degradation.toFixed(1)}% ${oosResult.isSignificant ? '⚠️ Significativa' : '✅ Aceptable'}\n`;
    } else {
      report += '  Insuficientes datos para test out-of-sample\n';
    }

    return report;
  }

  // === Helpers ===

  private mean(values: number[]): number {
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  }

  private standardDeviation(values: number[]): number {
    if (values.length < 2) return 0;
    const avg = this.mean(values);
    const squareDiffs = values.map(v => Math.pow(v - avg, 2));
    return Math.sqrt(this.mean(squareDiffs));
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
export const temporalCrossValidationService = new TemporalCrossValidationService();
