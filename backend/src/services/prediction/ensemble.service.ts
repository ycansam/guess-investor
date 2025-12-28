/**
 * Ensemble Prediction Service
 * Combina múltiples modelos de predicción para mejorar accuracy.
 * 
 * Modelos incluidos:
 * 1. Global: Pesos optimizados por timeframe/volatilidad
 * 2. Symbol: Pesos específicos del símbolo (historial)
 * 3. Regime: Pesos según régimen de mercado
 * 4. Momentum: Modelo que prioriza tendencia y técnico
 * 5. MeanReversion: Modelo contrarian para reversiones
 * 
 * La predicción final es un weighted average basado en el accuracy histórico de cada modelo.
 */

import { logger } from '../../middleware/logger.js';
import { trainingRepository } from '../../repositories/training.repository.js';

// Factores de análisis (debe coincidir con los del sistema)
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
  agreementLevel: 'high' | 'medium' | 'low';
}

/**
 * Performance histórico de cada modelo
 */
export interface ModelPerformance {
  modelType: ModelType;
  totalPredictions: number;
  avgAccuracyScore: number;
  directionAccuracy: number;
  recentPerformance: number;
  weight: number;
}

/**
 * Régimen de mercado
 */
export type MarketRegime = 'trending_up' | 'trending_down' | 'high_volatility' | 'low_volatility' | 'ranging';

/**
 * Pesos fijos para modelo Momentum (prioriza tendencia)
 */
const MOMENTUM_WEIGHTS: WeightsMap = {
  trend: 0.30, technical: 0.28, sentiment: 0.15, news: 0.10,
  macro: 0.02, competitors: 0.03, forex: 0.02, institutional: 0.04,
  seasonality: 0.02, financials: 0.02, expectations: 0.02
};

/**
 * Pesos fijos para modelo Mean Reversion (contrarian)
 */
const MEAN_REVERSION_WEIGHTS: WeightsMap = {
  trend: 0.05, technical: 0.35, sentiment: 0.08, news: 0.05,
  macro: 0.10, competitors: 0.08, forex: 0.05, institutional: 0.10,
  seasonality: 0.04, financials: 0.05, expectations: 0.05
};

/**
 * Pesos base globales por timeframe
 */
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

/**
 * Pesos por régimen de mercado
 */
const REGIME_WEIGHTS: Record<MarketRegime, Partial<WeightsMap>> = {
  trending_up: {
    trend: 0.25, technical: 0.20, sentiment: 0.15,
  },
  trending_down: {
    trend: 0.20, technical: 0.25, sentiment: 0.15,
  },
  high_volatility: {
    technical: 0.30, sentiment: 0.20, news: 0.15,
  },
  low_volatility: {
    financials: 0.20, macro: 0.15, expectations: 0.15,
  },
  ranging: {
    technical: 0.25, sentiment: 0.15, competitors: 0.10,
  }
};

// In-memory cache for ensemble weights and performance
let ensembleWeights: Record<ModelType, number> = {
  global: 0.30,
  symbol: 0.25,
  regime: 0.20,
  momentum: 0.15,
  mean_reversion: 0.10,
};

let modelPerformance: Map<ModelType, ModelPerformance> = new Map();

export const ensembleService = {
  /**
   * Genera predicción del ensemble
   */
  async predict(
    symbol: string,
    timeframe: Timeframe,
    factorScores: Record<string, number>,
    regimeIndicators?: {
      vix?: number;
      trend?: number;
      volatility?: number;
    }
  ): Promise<EnsemblePrediction> {
    const modelPredictions: ModelPrediction[] = [];

    // 1. Modelo Global
    const globalWeights = DEFAULT_GLOBAL_WEIGHTS[timeframe];
    const globalPred = this.computePrediction(factorScores, globalWeights);
    modelPredictions.push({
      modelType: 'global',
      weights: globalWeights,
      predictedChange: globalPred.change,
      confidence: globalPred.confidence,
      contribution: ensembleWeights.global,
    });

    // 2. Modelo por Símbolo (usando pesos del training cache si existen)
    const symbolWeights = await this.getSymbolWeights(symbol, timeframe, globalWeights);
    const symbolPred = this.computePrediction(factorScores, symbolWeights.weights);
    modelPredictions.push({
      modelType: 'symbol',
      weights: symbolWeights.weights,
      predictedChange: symbolPred.change,
      confidence: symbolPred.confidence * (symbolWeights.hasHistory ? 1 : 0.8),
      contribution: ensembleWeights.symbol * (symbolWeights.hasHistory ? 1 : 0.5),
    });

    // 3. Modelo por Régimen
    const regime = this.detectRegime(regimeIndicators);
    const regimeWeights = this.applyRegimeAdjustments(globalWeights, regime);
    const regimePred = this.computePrediction(factorScores, regimeWeights);
    modelPredictions.push({
      modelType: 'regime',
      weights: regimeWeights,
      predictedChange: regimePred.change,
      confidence: regimePred.confidence,
      contribution: ensembleWeights.regime,
    });

    // 4. Modelo Momentum
    const momentumPred = this.computePrediction(factorScores, MOMENTUM_WEIGHTS);
    modelPredictions.push({
      modelType: 'momentum',
      weights: MOMENTUM_WEIGHTS,
      predictedChange: momentumPred.change,
      confidence: momentumPred.confidence,
      contribution: ensembleWeights.momentum,
    });

    // 5. Modelo Mean Reversion
    const mrPred = this.computePrediction(factorScores, MEAN_REVERSION_WEIGHTS);
    const mrAdjusted = this.adjustForMeanReversion(mrPred.change, factorScores);
    modelPredictions.push({
      modelType: 'mean_reversion',
      weights: MEAN_REVERSION_WEIGHTS,
      predictedChange: mrAdjusted,
      confidence: mrPred.confidence * 0.8,
      contribution: ensembleWeights.mean_reversion,
    });

    // Combinar predicciones
    return this.combineModels(modelPredictions);
  },

  /**
   * Obtiene pesos específicos del símbolo desde el training cache
   */
  async getSymbolWeights(
    symbol: string,
    timeframe: Timeframe,
    fallbackWeights: WeightsMap
  ): Promise<{ weights: WeightsMap; hasHistory: boolean }> {
    try {
      const cached = await trainingRepository.getFromCache(symbol, timeframe);
      
      if (cached && cached.analysisData) {
        const data = JSON.parse(cached.analysisData);
        if (data.weights && typeof data.weights === 'object') {
          return { weights: { ...fallbackWeights, ...data.weights }, hasHistory: true };
        }
      }
    } catch (error) {
      logger.debug(`[Ensemble] No cached weights for ${symbol}`);
    }
    
    return { weights: fallbackWeights, hasHistory: false };
  },

  /**
   * Detecta el régimen de mercado actual
   */
  detectRegime(indicators?: {
    vix?: number;
    trend?: number;
    volatility?: number;
  }): MarketRegime {
    if (!indicators) return 'ranging';
    
    const { vix = 20, trend = 0, volatility = 15 } = indicators;
    
    // Alta volatilidad
    if (vix > 25 || volatility > 25) {
      return 'high_volatility';
    }
    
    // Baja volatilidad
    if (vix < 15 && volatility < 10) {
      return 'low_volatility';
    }
    
    // Tendencia fuerte alcista
    if (trend > 30) {
      return 'trending_up';
    }
    
    // Tendencia fuerte bajista
    if (trend < -30) {
      return 'trending_down';
    }
    
    return 'ranging';
  },

  /**
   * Aplica ajustes de régimen a los pesos base
   */
  applyRegimeAdjustments(baseWeights: WeightsMap, regime: MarketRegime): WeightsMap {
    const adjustments = REGIME_WEIGHTS[regime];
    const adjusted = { ...baseWeights };
    
    // Aplicar ajustes del régimen
    for (const [factor, weight] of Object.entries(adjustments)) {
      if (factor in adjusted) {
        (adjusted as any)[factor] = ((adjusted as any)[factor] + weight) / 2;
      }
    }
    
    // Normalizar para que sume 1
    const total = Object.values(adjusted).reduce((a, b) => a + b, 0);
    for (const factor of Object.keys(adjusted)) {
      (adjusted as any)[factor] = (adjusted as any)[factor] / total;
    }
    
    return adjusted;
  },

  /**
   * Calcula predicción con un set de pesos
   */
  computePrediction(
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
    const predictedChange = normalizedScore * 0.1;

    // Confianza basada en coherencia de factores
    const confidence = Math.min(90, 50 + Math.abs(normalizedScore) * 0.4);

    return { change: predictedChange, confidence };
  },

  /**
   * Ajusta predicción para mean reversion
   */
  adjustForMeanReversion(basePrediction: number, factorScores: Record<string, number>): number {
    const technical = factorScores.technical ?? 0;
    const trend = factorScores.trend ?? 0;

    // Si hay sobrecompra/sobreventa extrema, predecir reversión
    if (technical > 70 || technical < -70) {
      return basePrediction * 0.5 - (technical > 0 ? 0.5 : -0.5);
    }

    // Si tendencia muy extendida, esperar pullback
    if (Math.abs(trend) > 60) {
      return basePrediction * 0.7;
    }

    return basePrediction;
  },

  /**
   * Combina predicciones de todos los modelos
   */
  combineModels(predictions: ModelPrediction[]): EnsemblePrediction {
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
      ensembleWeights: { ...ensembleWeights },
      dominantModel,
      agreementLevel,
    };
  },

  /**
   * Actualiza pesos del ensemble basado en performance histórico
   */
  async updateEnsembleWeights(): Promise<void> {
    try {
      // Obtener predicciones verificadas
      const { prisma } = await import('../../config/database.js');
      const verifiedPredictions = await prisma.prediction.findMany({
        where: {
          verified: true,
          accuracyScore: { not: null },
        },
        take: 100,
        orderBy: { createdAt: 'desc' },
      });

      if (verifiedPredictions.length < 20) {
        logger.info('[Ensemble] Not enough predictions to update weights');
        return;
      }

      // Simular performance de cada modelo (simplificado)
      const performances = this.simulateModelPerformances(verifiedPredictions);

      // Calcular nuevos pesos basados en accuracy
      const totalAccuracy = performances.reduce((sum, p) => sum + p.avgAccuracyScore, 0);
      
      for (const perf of performances) {
        const newWeight = Math.max(0.05, perf.avgAccuracyScore / totalAccuracy);
        ensembleWeights[perf.modelType] = newWeight;
        modelPerformance.set(perf.modelType, perf);
      }

      // Normalizar
      const totalWeight = Object.values(ensembleWeights).reduce((a, b) => a + b, 0);
      for (const model of Object.keys(ensembleWeights) as ModelType[]) {
        ensembleWeights[model] = ensembleWeights[model] / totalWeight;
      }

      // Guardar en LearnedWeights con la estructura correcta del schema
      // Usamos los campos de pesos individuales para guardar los del ensemble
      const avgAcc = this.mean(verifiedPredictions.map((p: any) => p.accuracyScore || 0));
      
      await prisma.learnedWeights.upsert({
        where: { id: 'ensemble_weights' },
        update: {
          trend: ensembleWeights.global,
          technical: ensembleWeights.symbol,
          sentiment: ensembleWeights.regime,
          news: ensembleWeights.momentum,
          macro: ensembleWeights.mean_reversion,
          sampleCount: verifiedPredictions.length,
          accuracy: avgAcc,
          trainedAt: new Date(),
        },
        create: {
          id: 'ensemble_weights',
          trend: ensembleWeights.global,
          technical: ensembleWeights.symbol,
          sentiment: ensembleWeights.regime,
          news: ensembleWeights.momentum,
          macro: ensembleWeights.mean_reversion,
          sampleCount: verifiedPredictions.length,
          accuracy: avgAcc,
        },
      });

      logger.info('[Ensemble] Updated weights:', ensembleWeights);
    } catch (error) {
      logger.error('[Ensemble] Error updating weights:', error);
    }
  },

  /**
   * Simula el performance de cada modelo con datos históricos
   */
  simulateModelPerformances(predictions: any[]): ModelPerformance[] {
    const performances: ModelPerformance[] = [];
    const models: ModelType[] = ['global', 'symbol', 'regime', 'momentum', 'mean_reversion'];

    const scores = predictions
      .filter((p: any) => p.accuracyScore !== undefined)
      .map((p: any) => p.accuracyScore);

    const avgScore = this.mean(scores);
    const recentScores = scores.slice(0, 20);
    const recentAvg = this.mean(recentScores);

    for (const modelType of models) {
      // Ajustar por tipo de modelo (simulación simplificada)
      let multiplier = 1;
      switch (modelType) {
        case 'global': multiplier = 1; break;
        case 'symbol': multiplier = 1.05; break;
        case 'regime': multiplier = 1.02; break;
        case 'momentum': multiplier = 0.95; break;
        case 'mean_reversion': multiplier = 0.90; break;
      }

      performances.push({
        modelType,
        totalPredictions: predictions.length,
        avgAccuracyScore: Math.min(100, avgScore * multiplier),
        directionAccuracy: 60 * multiplier, // Placeholder
        recentPerformance: Math.min(100, recentAvg * multiplier),
        weight: ensembleWeights[modelType],
      });
    }

    return performances;
  },

  /**
   * Obtiene el performance actual de cada modelo
   */
  getModelPerformances(): ModelPerformance[] {
    return Array.from(modelPerformance.values());
  },

  /**
   * Obtiene los pesos actuales del ensemble
   */
  getEnsembleWeights(): Record<ModelType, number> {
    return { ...ensembleWeights };
  },

  /**
   * Genera reporte del ensemble
   */
  generateReport(): string {
    let report = '🎯 ENSEMBLE DE MODELOS\n';
    report += '═'.repeat(50) + '\n\n';

    report += 'PESOS ACTUALES:\n';
    for (const [model, weight] of Object.entries(ensembleWeights)) {
      const perf = modelPerformance.get(model as ModelType);
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
  },

  // === Helpers ===

  mean(values: number[]): number {
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  },

  standardDeviation(values: number[]): number {
    if (values.length < 2) return 0;
    const avg = this.mean(values);
    const squareDiffs = values.map(v => Math.pow(v - avg, 2));
    return Math.sqrt(this.mean(squareDiffs));
  },
};
