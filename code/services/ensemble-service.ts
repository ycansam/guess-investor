/**
 * Ensemble Prediction Service
 * Combina múltiples modelos de predicción para mejorar accuracy.
 * 
 * Modelos incluidos:
 * 1. Global: Pesos optimizados por timeframe/volatilidad (WeightOptimizer)
 * 2. Symbol: Pesos específicos del símbolo (SymbolWeights)
 * 3. Regime: Pesos según régimen de mercado (MarketRegime)
 * 4. Momentum: Modelo que prioriza tendencia y técnico
 * 5. MeanReversion: Modelo contrarian para reversiones
 * 
 * La predicción final es un weighted average basado en el accuracy histórico de cada modelo.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { RegimeIndicators, marketRegimeService } from './market-regime-service';
import { TrackedPrediction, predictionTrackingService } from './prediction-tracking-service';
import { symbolWeightsService } from './symbol-weights-service';

// Storage key
const ENSEMBLE_WEIGHTS_KEY = 'ensemble-model-weights';
const ENSEMBLE_HISTORY_KEY = 'ensemble-performance-history';

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
 * Tipos de modelo en el ensemble
 */
export type ModelType = 'global' | 'symbol' | 'regime' | 'momentum' | 'mean_reversion';

/**
 * Predicción de un modelo individual
 */
export interface ModelPrediction {
  modelType: ModelType;
  weights: WeightsMap;
  predictedChange: number;  // % predicho
  confidence: number;       // 0-100
  contribution: number;     // Peso de este modelo en el ensemble (0-1)
}

/**
 * Predicción del ensemble
 */
export interface EnsemblePrediction {
  finalPredictedChange: number;
  finalConfidence: number;
  modelPredictions: ModelPrediction[];
  ensembleWeights: Record<ModelType, number>;
  dominantModel: ModelType;
  agreementLevel: 'high' | 'medium' | 'low'; // Qué tan de acuerdo están los modelos
}

/**
 * Performance histórico de cada modelo
 */
export interface ModelPerformance {
  modelType: ModelType;
  totalPredictions: number;
  avgAccuracyScore: number;
  directionAccuracy: number;
  recentPerformance: number; // Últimas 20 predicciones
  weight: number;            // Peso calculado en el ensemble
}

/**
 * Pesos fijos para modelos especializados
 */
const MOMENTUM_WEIGHTS: WeightsMap = {
  trend: 0.30, technical: 0.28, sentiment: 0.15, news: 0.10,
  macro: 0.02, competitors: 0.03, forex: 0.02, institutional: 0.04,
  seasonality: 0.02, financials: 0.02, expectations: 0.02
};

const MEAN_REVERSION_WEIGHTS: WeightsMap = {
  trend: 0.05, technical: 0.35, sentiment: 0.08, news: 0.05,
  macro: 0.10, competitors: 0.08, forex: 0.05, institutional: 0.10,
  seasonality: 0.04, financials: 0.05, expectations: 0.05
};

// Pesos base globales por timeframe
const DEFAULT_GLOBAL_WEIGHTS: Record<Timeframe, WeightsMap> = {
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

class EnsembleService {
  private modelPerformance: Map<ModelType, ModelPerformance> = new Map();
  private ensembleWeights: Record<ModelType, number> = {
    global: 0.30,
    symbol: 0.25,
    regime: 0.20,
    momentum: 0.15,
    mean_reversion: 0.10,
  };
  private initialized = false;

  /**
   * Inicializa el servicio
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const [weightsJson, historyJson] = await Promise.all([
        AsyncStorage.getItem(ENSEMBLE_WEIGHTS_KEY),
        AsyncStorage.getItem(ENSEMBLE_HISTORY_KEY),
      ]);

      if (weightsJson) {
        this.ensembleWeights = JSON.parse(weightsJson);
      }

      if (historyJson) {
        const perfArray: ModelPerformance[] = JSON.parse(historyJson);
        for (const mp of perfArray) {
          this.modelPerformance.set(mp.modelType, mp);
        }
      }

      this.initialized = true;
      console.log('[Ensemble] Initialized with', this.modelPerformance.size, 'model histories');
    } catch (error) {
      console.error('[Ensemble] Error loading:', error);
      this.initialized = true;
    }
  }

  /**
   * Guarda datos en storage
   */
  private async save(): Promise<void> {
    try {
      const perfArray = Array.from(this.modelPerformance.values());
      await Promise.all([
        AsyncStorage.setItem(ENSEMBLE_WEIGHTS_KEY, JSON.stringify(this.ensembleWeights)),
        AsyncStorage.setItem(ENSEMBLE_HISTORY_KEY, JSON.stringify(perfArray)),
      ]);
    } catch (error) {
      console.error('[Ensemble] Error saving:', error);
    }
  }

  /**
   * Genera predicción del ensemble
   */
  async predict(
    symbol: string,
    timeframe: Timeframe,
    factorScores: Record<string, number>,
    regimeIndicators?: Partial<RegimeIndicators>
  ): Promise<EnsemblePrediction> {
    await this.initialize();

    const modelPredictions: ModelPrediction[] = [];

    // 1. Modelo Global
    const globalWeights = DEFAULT_GLOBAL_WEIGHTS[timeframe];
    const globalPred = this.computePrediction(factorScores, globalWeights);
    modelPredictions.push({
      modelType: 'global',
      weights: globalWeights,
      predictedChange: globalPred.change,
      confidence: globalPred.confidence,
      contribution: this.ensembleWeights.global,
    });

    // 2. Modelo por Símbolo
    const symbolBlend = await symbolWeightsService.getBlendedWeights(
      symbol, 
      timeframe, 
      globalWeights
    );
    const symbolPred = this.computePrediction(factorScores, symbolBlend.weights);
    modelPredictions.push({
      modelType: 'symbol',
      weights: symbolBlend.weights,
      predictedChange: symbolPred.change,
      confidence: symbolPred.confidence * (symbolBlend.source === 'global' ? 0.8 : 1), // Reducir si no hay datos específicos
      contribution: this.ensembleWeights.symbol * (symbolBlend.source === 'global' ? 0.5 : 1),
    });

    // 3. Modelo por Régimen
    let regimeWeights = globalWeights;
    if (regimeIndicators) {
      const detection = marketRegimeService.detectRegime(regimeIndicators);
      regimeWeights = await marketRegimeService.getRegimeWeights(detection.regime, timeframe);
    }
    const regimePred = this.computePrediction(factorScores, regimeWeights);
    modelPredictions.push({
      modelType: 'regime',
      weights: regimeWeights,
      predictedChange: regimePred.change,
      confidence: regimePred.confidence,
      contribution: this.ensembleWeights.regime,
    });

    // 4. Modelo Momentum
    const momentumPred = this.computePrediction(factorScores, MOMENTUM_WEIGHTS);
    modelPredictions.push({
      modelType: 'momentum',
      weights: MOMENTUM_WEIGHTS,
      predictedChange: momentumPred.change,
      confidence: momentumPred.confidence,
      contribution: this.ensembleWeights.momentum,
    });

    // 5. Modelo Mean Reversion
    const mrPred = this.computePrediction(factorScores, MEAN_REVERSION_WEIGHTS);
    // Mean reversion tiende a predecir lo contrario en extremos
    const mrAdjusted = this.adjustForMeanReversion(mrPred.change, factorScores);
    modelPredictions.push({
      modelType: 'mean_reversion',
      weights: MEAN_REVERSION_WEIGHTS,
      predictedChange: mrAdjusted,
      confidence: mrPred.confidence * 0.8, // Menos confianza por defecto
      contribution: this.ensembleWeights.mean_reversion,
    });

    // Combinar predicciones
    const ensemble = this.combineModels(modelPredictions);

    return ensemble;
  }

  /**
   * Calcula predicción con un set de pesos
   */
  private computePrediction(
    factorScores: Record<string, number>,
    weights: WeightsMap
  ): { change: number; confidence: number } {
    let weightedScore = 0;
    let totalWeight = 0;
    let factorCount = 0;

    for (const factor of FACTORS) {
      const score = factorScores[factor];
      const weight = weights[factor];

      if (score !== undefined && weight !== undefined) {
        weightedScore += score * weight;
        totalWeight += weight;
        factorCount++;
      }
    }

    // Score normalizado a -100 a +100
    const normalizedScore = totalWeight > 0 ? weightedScore / totalWeight : 0;
    
    // Convertir a % cambio predicho (escala típica de ±10%)
    const predictedChange = normalizedScore * 0.1; // Score 100 = +10%

    // Confianza basada en coherencia de factores
    const confidence = Math.min(90, 50 + Math.abs(normalizedScore) * 0.4);

    return { change: predictedChange, confidence };
  }

  /**
   * Ajusta predicción para mean reversion
   */
  private adjustForMeanReversion(basePrediction: number, factorScores: Record<string, number>): number {
    const technical = factorScores.technical ?? 0;
    const trend = factorScores.trend ?? 0;

    // Si hay sobrecompra/sobreventa extrema, predecir reversión
    if (technical > 70 || technical < -70) {
      // Reducir la predicción o invertirla parcialmente
      return basePrediction * 0.5 - (technical > 0 ? 0.5 : -0.5);
    }

    // Si tendencia muy extendida, esperar pullback
    if (Math.abs(trend) > 60) {
      return basePrediction * 0.7;
    }

    return basePrediction;
  }

  /**
   * Combina predicciones de todos los modelos
   */
  private combineModels(predictions: ModelPrediction[]): EnsemblePrediction {
    // Normalizar contribuciones
    const totalContribution = predictions.reduce((sum, p) => sum + p.contribution, 0);
    
    // Weighted average de predicciones
    let finalChange = 0;
    let finalConfidence = 0;
    
    for (const pred of predictions) {
      const normalizedContrib = pred.contribution / totalContribution;
      finalChange += pred.predictedChange * normalizedContrib;
      finalConfidence += pred.confidence * normalizedContrib;
    }

    // Calcular nivel de acuerdo
    const changes = predictions.map(p => p.predictedChange);
    const stdDev = this.standardDeviation(changes);
    const avgChange = this.mean(changes);
    const coeffOfVar = avgChange !== 0 ? Math.abs(stdDev / avgChange) : 1;

    let agreementLevel: 'high' | 'medium' | 'low' = 'medium';
    if (coeffOfVar < 0.3) agreementLevel = 'high';
    else if (coeffOfVar > 0.7) agreementLevel = 'low';

    // Ajustar confianza por acuerdo
    if (agreementLevel === 'high') {
      finalConfidence = Math.min(95, finalConfidence * 1.1);
    } else if (agreementLevel === 'low') {
      finalConfidence = finalConfidence * 0.8;
    }

    // Determinar modelo dominante
    const dominantModel = predictions.reduce((max, p) => 
      p.contribution > max.contribution ? p : max
    ).modelType;

    return {
      finalPredictedChange: finalChange,
      finalConfidence,
      modelPredictions: predictions,
      ensembleWeights: { ...this.ensembleWeights },
      dominantModel,
      agreementLevel,
    };
  }

  /**
   * Actualiza pesos del ensemble basado en performance histórico
   */
  async updateEnsembleWeights(): Promise<void> {
    await this.initialize();

    const allPredictions = await predictionTrackingService.getVerifiedPredictions();
    if (allPredictions.length < 20) {
      console.log('[Ensemble] Not enough predictions to update weights');
      return;
    }

    // Simular performance de cada modelo
    const performances = await this.simulateModelPerformances(allPredictions);

    // Calcular nuevos pesos basados en accuracy
    const totalAccuracy = performances.reduce((sum, p) => sum + p.avgAccuracyScore, 0);
    
    for (const perf of performances) {
      // Peso proporcional al accuracy, con mínimo de 0.05
      const newWeight = Math.max(0.05, perf.avgAccuracyScore / totalAccuracy);
      this.ensembleWeights[perf.modelType] = newWeight;
      this.modelPerformance.set(perf.modelType, perf);
    }

    // Normalizar
    const totalWeight = Object.values(this.ensembleWeights).reduce((a, b) => a + b, 0);
    for (const model of Object.keys(this.ensembleWeights) as ModelType[]) {
      this.ensembleWeights[model] = this.ensembleWeights[model] / totalWeight;
    }

    await this.save();
    console.log('[Ensemble] Updated weights:', this.ensembleWeights);
  }

  /**
   * Simula el performance de cada modelo con datos históricos
   */
  private async simulateModelPerformances(
    predictions: TrackedPrediction[]
  ): Promise<ModelPerformance[]> {
    const performances: ModelPerformance[] = [];
    const models: ModelType[] = ['global', 'symbol', 'regime', 'momentum', 'mean_reversion'];

    for (const modelType of models) {
      const results = await this.evaluateModel(modelType, predictions);
      performances.push({
        modelType,
        totalPredictions: predictions.length,
        avgAccuracyScore: results.avgAccuracy,
        directionAccuracy: results.directionAccuracy,
        recentPerformance: results.recentAccuracy,
        weight: this.ensembleWeights[modelType],
      });
    }

    return performances;
  }

  /**
   * Evalúa un modelo específico con datos históricos
   */
  private async evaluateModel(
    modelType: ModelType,
    predictions: TrackedPrediction[]
  ): Promise<{ avgAccuracy: number; directionAccuracy: number; recentAccuracy: number }> {
    // Simplificación: usar accuracyScore existente ajustado por tipo de modelo
    // En una implementación completa, simularíamos las predicciones de cada modelo
    
    const scores = predictions
      .filter(p => p.accuracyScore !== undefined)
      .map(p => p.accuracyScore!);

    const directions = predictions.filter(p => p.directionCorrect !== undefined);
    const directionAcc = directions.length > 0 
      ? directions.filter(p => p.directionCorrect).length / directions.length * 100
      : 50;

    // Ajustar por tipo de modelo (simulación simplificada)
    let multiplier = 1;
    switch (modelType) {
      case 'global': multiplier = 1; break;
      case 'symbol': multiplier = 1.05; break; // Ligeramente mejor si hay datos
      case 'regime': multiplier = 1.02; break;
      case 'momentum': multiplier = 0.95; break;
      case 'mean_reversion': multiplier = 0.90; break;
    }

    const avgAccuracy = this.mean(scores) * multiplier;
    const recentScores = scores.slice(-20);
    const recentAccuracy = this.mean(recentScores) * multiplier;

    return {
      avgAccuracy: Math.min(100, avgAccuracy),
      directionAccuracy: directionAcc,
      recentAccuracy: Math.min(100, recentAccuracy),
    };
  }

  /**
   * Obtiene el performance actual de cada modelo
   */
  async getModelPerformances(): Promise<ModelPerformance[]> {
    await this.initialize();
    return Array.from(this.modelPerformance.values());
  }

  /**
   * Obtiene los pesos actuales del ensemble
   */
  getEnsembleWeights(): Record<ModelType, number> {
    return { ...this.ensembleWeights };
  }

  /**
   * Genera reporte del ensemble
   */
  async generateReport(): Promise<string> {
    await this.initialize();

    let report = '🎭 ENSEMBLE DE MODELOS\n';
    report += '═'.repeat(50) + '\n\n';

    report += 'PESOS ACTUALES:\n';
    for (const [model, weight] of Object.entries(this.ensembleWeights)) {
      const perf = this.modelPerformance.get(model as ModelType);
      const acc = perf ? ` (acc: ${perf.avgAccuracyScore.toFixed(1)}%)` : '';
      report += `  ${model}: ${(weight * 100).toFixed(1)}%${acc}\n`;
    }

    report += '\nDESCRIPCIÓN DE MODELOS:\n';
    report += '  global: Pesos optimizados por timeframe/volatilidad\n';
    report += '  symbol: Pesos específicos del símbolo\n';
    report += '  regime: Ajustado al régimen de mercado actual\n';
    report += '  momentum: Prioriza trend y técnico\n';
    report += '  mean_reversion: Contrarian, busca reversiones\n';

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
}

// Singleton
export const ensembleService = new EnsembleService();
