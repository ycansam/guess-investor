/**
 * Accuracy Predictor Service
 * 
 * Predice el accuracy esperado de una nueva predicción basándose en:
 * - Historial de predicciones verificadas
 * - Confianza, volatilidad, timeframe, tipo de activo
 * 
 * También sugiere el mejor timeframe para cada activo según precisión histórica.
 * 
 * Migrado de: code/services/accuracy-predictor-service.ts
 */

import { prisma } from '../../config/database.js';
import { logger } from '../../middleware/logger.js';

// Características que afectan el accuracy
interface PredictionFeatures {
  symbol: string;
  confidence: number;
  volatility?: number;
  timeframeDays: number;
  assetType: string;
  factorsAvailable?: number;
  signalSummary?: string;
}

// Modelo aprendido en memoria
interface AccuracyModel {
  byConfidence: Record<string, { count: number; avgAccuracy: number; avgDirection: number }>;
  byTimeframe: Record<string, { count: number; avgAccuracy: number; avgDirection: number }>;
  byAssetType: Record<string, { count: number; avgAccuracy: number; avgDirection: number }>;
  byVolatility: Record<string, { count: number; avgAccuracy: number; avgDirection: number }>;
  byTimeframeVolatility: Record<string, { count: number; avgAccuracy: number; avgDirection: number }>;
  bySymbol: Record<string, {
    count: number;
    avgAccuracy: number;
    bestTimeframe: string;
    timeframeAccuracy: Record<string, { count: number; avgAccuracy: number }>;
  }>;
  totalSamples: number;
  lastUpdated: Date;
  globalAvgAccuracy: number;
  globalAvgDirection: number;
}

// Resultado de predicción de accuracy
export interface ExpectedAccuracy {
  expectedScore: number;
  expectedQuality: 'excellent' | 'good' | 'poor' | 'failed';
  directionProbability: number;
  confidence: 'high' | 'medium' | 'low';
  basedOnSamples: number;
  explanation: string;
  suggestedTimeframe?: string;
  timeframeComparison?: {
    timeframe: string;
    expectedAccuracy: number;
    samples: number;
  }[];
}

// Cache del modelo en memoria
let model: AccuracyModel | null = null;
let modelLoaded = false;

export const accuracyPredictorService = {
  /**
   * Reconstruye el modelo desde las predicciones verificadas
   */
  async rebuildModel(): Promise<AccuracyModel> {
    logger.info('[AccuracyPredictor] Rebuilding model from verified predictions...');
    
    const verified = await prisma.prediction.findMany({
      where: {
        verified: true,
        accuracyScore: { not: null },
      },
    });
    
    // Inicializar modelo vacío
    const newModel: AccuracyModel = {
      byConfidence: {},
      byTimeframe: {},
      byAssetType: {},
      byVolatility: {},
      byTimeframeVolatility: {},
      bySymbol: {},
      totalSamples: verified.length,
      lastUpdated: new Date(),
      globalAvgAccuracy: 0,
      globalAvgDirection: 0,
    };
    
    if (verified.length === 0) {
      model = newModel;
      return newModel;
    }
    
    let totalAccuracy = 0;
    let totalDirection = 0;
    
    for (const pred of verified) {
      const accuracy = pred.accuracyScore || 0;
      const directionCorrect = pred.directionCorrect ? 100 : 0;
      
      totalAccuracy += accuracy;
      totalDirection += directionCorrect;
      
      // Por confianza (buckets de 10)
      const confBucket = `${Math.floor(pred.confidence / 10) * 10}-${Math.floor(pred.confidence / 10) * 10 + 9}`;
      if (!newModel.byConfidence[confBucket]) {
        newModel.byConfidence[confBucket] = { count: 0, avgAccuracy: 0, avgDirection: 0 };
      }
      this.updateBucket(newModel.byConfidence[confBucket], accuracy, directionCorrect);
      
      // Por timeframe
      const tf = this.getTimeframeCategory(pred.timeframeDays);
      if (!newModel.byTimeframe[tf]) {
        newModel.byTimeframe[tf] = { count: 0, avgAccuracy: 0, avgDirection: 0 };
      }
      this.updateBucket(newModel.byTimeframe[tf], accuracy, directionCorrect);
      
      // Por tipo de activo
      const assetType = pred.assetType || 'other';
      if (!newModel.byAssetType[assetType]) {
        newModel.byAssetType[assetType] = { count: 0, avgAccuracy: 0, avgDirection: 0 };
      }
      this.updateBucket(newModel.byAssetType[assetType], accuracy, directionCorrect);
      
      // Por volatilidad
      const vol = pred.volatilityCategory || 'medium';
      if (!newModel.byVolatility[vol]) {
        newModel.byVolatility[vol] = { count: 0, avgAccuracy: 0, avgDirection: 0 };
      }
      this.updateBucket(newModel.byVolatility[vol], accuracy, directionCorrect);
      
      // Por combinación timeframe + volatilidad
      const tfVol = `${tf}_${vol}`;
      if (!newModel.byTimeframeVolatility[tfVol]) {
        newModel.byTimeframeVolatility[tfVol] = { count: 0, avgAccuracy: 0, avgDirection: 0 };
      }
      this.updateBucket(newModel.byTimeframeVolatility[tfVol], accuracy, directionCorrect);
      
      // Por símbolo
      const symbol = pred.symbol;
      if (!newModel.bySymbol[symbol]) {
        newModel.bySymbol[symbol] = {
          count: 0,
          avgAccuracy: 0,
          bestTimeframe: tf,
          timeframeAccuracy: {},
        };
      }
      
      const symData = newModel.bySymbol[symbol];
      symData.count++;
      symData.avgAccuracy = symData.avgAccuracy + (accuracy - symData.avgAccuracy) / symData.count;
      
      if (!symData.timeframeAccuracy[tf]) {
        symData.timeframeAccuracy[tf] = { count: 0, avgAccuracy: 0 };
      }
      const tfData = symData.timeframeAccuracy[tf];
      tfData.count++;
      tfData.avgAccuracy = tfData.avgAccuracy + (accuracy - tfData.avgAccuracy) / tfData.count;
    }
    
    // Calcular promedios globales
    newModel.globalAvgAccuracy = totalAccuracy / verified.length;
    newModel.globalAvgDirection = totalDirection / verified.length;
    
    // Determinar mejor timeframe por símbolo
    for (const symbol of Object.keys(newModel.bySymbol)) {
      const symData = newModel.bySymbol[symbol];
      let bestTf = '';
      let bestAccuracy = 0;
      
      for (const [tf, data] of Object.entries(symData.timeframeAccuracy)) {
        if (data.count >= 2 && data.avgAccuracy > bestAccuracy) {
          bestAccuracy = data.avgAccuracy;
          bestTf = tf;
        }
      }
      
      if (bestTf) {
        symData.bestTimeframe = bestTf;
      }
    }
    
    model = newModel;
    logger.info(`[AccuracyPredictor] Model rebuilt: avgAccuracy=${newModel.globalAvgAccuracy.toFixed(1)}, samples=${newModel.totalSamples}`);
    
    return newModel;
  },

  updateBucket(
    bucket: { count: number; avgAccuracy: number; avgDirection: number },
    accuracy: number,
    direction: number
  ): void {
    bucket.count++;
    bucket.avgAccuracy = bucket.avgAccuracy + (accuracy - bucket.avgAccuracy) / bucket.count;
    bucket.avgDirection = bucket.avgDirection + (direction - bucket.avgDirection) / bucket.count;
  },

  getTimeframeCategory(days: number): 'intraday' | 'swing' | 'longterm' {
    if (days <= 1) return 'intraday';
    if (days <= 7) return 'swing';
    return 'longterm';
  },

  getVolatilityCategory(volatility?: number): 'low' | 'medium' | 'high' {
    if (!volatility) return 'medium';
    if (volatility < 20) return 'low';
    if (volatility < 50) return 'medium';
    return 'high';
  },

  /**
   * Predice el accuracy esperado para una nueva predicción
   */
  async predictAccuracy(features: PredictionFeatures): Promise<ExpectedAccuracy> {
    // Rebuild model si no existe
    if (!model || model.totalSamples === 0) {
      await this.rebuildModel();
    }
    
    // Si sigue sin haber datos
    if (!model || model.totalSamples === 0) {
      return {
        expectedScore: 50,
        expectedQuality: 'good',
        directionProbability: 50,
        confidence: 'low',
        basedOnSamples: 0,
        explanation: 'Sin historial de predicciones para estimar precisión.',
      };
    }
    
    const timeframe = this.getTimeframeCategory(features.timeframeDays);
    const volatilityCategory = this.getVolatilityCategory(features.volatility);
    const confBucket = `${Math.floor(features.confidence / 10) * 10}-${Math.floor(features.confidence / 10) * 10 + 9}`;
    
    // Recopilar estimaciones de diferentes fuentes
    const estimates: { accuracy: number; direction: number; weight: number; source: string }[] = [];
    
    // 1. Por símbolo específico (más peso)
    if (model.bySymbol[features.symbol]) {
      const symData = model.bySymbol[features.symbol];
      if (symData.count >= 3) {
        estimates.push({
          accuracy: symData.avgAccuracy,
          direction: 50,
          weight: 3,
          source: `historial de ${features.symbol}`,
        });
      }
    }
    
    // 2. Por combinación timeframe + volatilidad
    const tfVol = `${timeframe}_${volatilityCategory}`;
    if (model.byTimeframeVolatility[tfVol]) {
      const data = model.byTimeframeVolatility[tfVol];
      if (data.count >= 2) {
        estimates.push({
          accuracy: data.avgAccuracy,
          direction: data.avgDirection,
          weight: 2.5,
          source: `${timeframe} + volatilidad ${volatilityCategory}`,
        });
      }
    }
    
    // 3. Por confianza
    if (model.byConfidence[confBucket]) {
      const data = model.byConfidence[confBucket];
      if (data.count >= 2) {
        estimates.push({
          accuracy: data.avgAccuracy,
          direction: data.avgDirection,
          weight: 2,
          source: `confianza ${confBucket}%`,
        });
      }
    }
    
    // 4. Por timeframe
    if (model.byTimeframe[timeframe]) {
      const data = model.byTimeframe[timeframe];
      estimates.push({
        accuracy: data.avgAccuracy,
        direction: data.avgDirection,
        weight: 1.5,
        source: `timeframe ${timeframe}`,
      });
    }
    
    // 5. Por tipo de activo
    if (model.byAssetType[features.assetType]) {
      const data = model.byAssetType[features.assetType];
      estimates.push({
        accuracy: data.avgAccuracy,
        direction: data.avgDirection,
        weight: 1,
        source: `tipo ${features.assetType}`,
      });
    }
    
    // 6. Global como fallback
    estimates.push({
      accuracy: model.globalAvgAccuracy,
      direction: model.globalAvgDirection,
      weight: 0.5,
      source: 'promedio global',
    });
    
    // Calcular promedio ponderado
    let totalWeight = 0;
    let weightedAccuracy = 0;
    let weightedDirection = 0;
    
    for (const est of estimates) {
      weightedAccuracy += est.accuracy * est.weight;
      weightedDirection += est.direction * est.weight;
      totalWeight += est.weight;
    }
    
    const expectedScore = Math.round(weightedAccuracy / totalWeight);
    const directionProbability = Math.round(weightedDirection / totalWeight);
    
    // Determinar calidad esperada
    let expectedQuality: 'excellent' | 'good' | 'poor' | 'failed';
    if (expectedScore >= 75) expectedQuality = 'excellent';
    else if (expectedScore >= 50) expectedQuality = 'good';
    else if (expectedScore >= 25) expectedQuality = 'poor';
    else expectedQuality = 'failed';
    
    // Determinar confianza en la estimación
    let estimationConfidence: 'high' | 'medium' | 'low';
    if (model.totalSamples >= 50 && estimates.length >= 4) {
      estimationConfidence = 'high';
    } else if (model.totalSamples >= 20 && estimates.length >= 3) {
      estimationConfidence = 'medium';
    } else {
      estimationConfidence = 'low';
    }
    
    // Construir explicación
    const mainSource = estimates.sort((a, b) => b.weight - a.weight)[0];
    let explanation = `Basado en ${mainSource.source}`;
    if (model.totalSamples > 0) {
      explanation += ` (${model.totalSamples} predicciones históricas)`;
    }
    
    // Comparar timeframes para este símbolo
    const timeframeComparison: { timeframe: string; expectedAccuracy: number; samples: number }[] = [];
    let suggestedTimeframe: string | undefined;
    
    if (model.bySymbol[features.symbol]) {
      const symData = model.bySymbol[features.symbol];
      for (const [tf, data] of Object.entries(symData.timeframeAccuracy)) {
        if (data.count >= 2) {
          timeframeComparison.push({
            timeframe: tf,
            expectedAccuracy: Math.round(data.avgAccuracy),
            samples: data.count,
          });
        }
      }
      
      timeframeComparison.sort((a, b) => b.expectedAccuracy - a.expectedAccuracy);
      
      if (symData.bestTimeframe && symData.bestTimeframe !== timeframe) {
        const bestData = symData.timeframeAccuracy[symData.bestTimeframe];
        if (bestData && bestData.avgAccuracy > expectedScore + 10) {
          suggestedTimeframe = symData.bestTimeframe;
        }
      }
    }
    
    return {
      expectedScore,
      expectedQuality,
      directionProbability,
      confidence: estimationConfidence,
      basedOnSamples: model.totalSamples,
      explanation,
      suggestedTimeframe,
      timeframeComparison: timeframeComparison.length > 0 ? timeframeComparison : undefined,
    };
  },

  /**
   * Obtiene el mejor timeframe para un símbolo
   */
  async getBestTimeframe(symbol: string): Promise<{
    bestTimeframe: string;
    accuracy: number;
    samples: number;
    allTimeframes: { timeframe: string; accuracy: number; samples: number }[];
  } | null> {
    if (!model) {
      await this.rebuildModel();
    }
    
    if (!model || !model.bySymbol[symbol]) {
      return null;
    }
    
    const symData = model.bySymbol[symbol];
    const allTimeframes: { timeframe: string; accuracy: number; samples: number }[] = [];
    
    for (const [tf, data] of Object.entries(symData.timeframeAccuracy)) {
      allTimeframes.push({
        timeframe: tf,
        accuracy: Math.round(data.avgAccuracy),
        samples: data.count,
      });
    }
    
    allTimeframes.sort((a, b) => b.accuracy - a.accuracy);
    
    if (allTimeframes.length === 0) return null;
    
    return {
      bestTimeframe: allTimeframes[0].timeframe,
      accuracy: allTimeframes[0].accuracy,
      samples: allTimeframes[0].samples,
      allTimeframes,
    };
  },

  /**
   * Obtiene estadísticas globales del modelo
   */
  getModelStats(): {
    totalSamples: number;
    globalAvgAccuracy: number;
    globalAvgDirection: number;
    lastUpdated: Date | null;
  } {
    if (!model) {
      return {
        totalSamples: 0,
        globalAvgAccuracy: 0,
        globalAvgDirection: 0,
        lastUpdated: null,
      };
    }
    
    return {
      totalSamples: model.totalSamples,
      globalAvgAccuracy: model.globalAvgAccuracy,
      globalAvgDirection: model.globalAvgDirection,
      lastUpdated: model.lastUpdated,
    };
  },
};
