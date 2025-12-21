/**
 * Servicio de Predicción de Accuracy
 * 
 * Predice el accuracy esperado de una nueva predicción basándose en:
 * - Historial de predicciones verificadas
 * - Confianza, volatilidad, timeframe, tipo de activo
 * 
 * También sugiere el mejor timeframe para cada activo según precisión histórica.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { predictionTrackingService } from './prediction-tracking-service';

const ACCURACY_MODEL_KEY = 'accuracy-predictor-model';

// Características que afectan el accuracy
interface PredictionFeatures {
  confidence: number; // 0-100
  volatilityCategory: 'low' | 'medium' | 'high';
  timeframe: 'intraday' | 'swing' | 'longterm';
  assetType: 'stock' | 'crypto' | 'etf' | 'commodity' | 'forex' | 'other';
  factorsAvailable: number; // Cantidad de factores con datos
  signalCoherence: 'coherent' | 'mixed' | 'neutral'; // Si las señales coinciden
}

// Modelo aprendido: accuracy promedio por segmento
interface AccuracyModel {
  // Por confianza (buckets de 10%)
  byConfidence: Record<string, { count: number; avgAccuracy: number; avgDirection: number }>;
  
  // Por timeframe
  byTimeframe: Record<string, { count: number; avgAccuracy: number; avgDirection: number }>;
  
  // Por tipo de activo
  byAssetType: Record<string, { count: number; avgAccuracy: number; avgDirection: number }>;
  
  // Por volatilidad
  byVolatility: Record<string, { count: number; avgAccuracy: number; avgDirection: number }>;
  
  // Combinaciones clave (timeframe + volatilidad)
  byTimeframeVolatility: Record<string, { count: number; avgAccuracy: number; avgDirection: number }>;
  
  // Por símbolo específico
  bySymbol: Record<string, { 
    count: number; 
    avgAccuracy: number; 
    bestTimeframe: string;
    timeframeAccuracy: Record<string, { count: number; avgAccuracy: number }>;
  }>;
  
  // Metadata
  totalSamples: number;
  lastUpdated: string;
  globalAvgAccuracy: number;
  globalAvgDirection: number;
}

// Resultado de predicción de accuracy
export interface ExpectedAccuracy {
  expectedScore: number; // 0-100, accuracy esperado
  expectedQuality: 'excellent' | 'good' | 'poor' | 'failed';
  directionProbability: number; // 0-100, probabilidad de acertar dirección
  confidence: 'high' | 'medium' | 'low'; // Confianza en esta estimación
  basedOnSamples: number; // En cuántas predicciones similares se basa
  explanation: string;
  
  // Sugerencias
  suggestedTimeframe?: string;
  timeframeComparison?: {
    timeframe: string;
    expectedAccuracy: number;
    samples: number;
  }[];
}

class AccuracyPredictorService {
  private model: AccuracyModel | null = null;
  private loaded = false;
  
  /**
   * Carga el modelo desde AsyncStorage
   */
  async load(): Promise<void> {
    if (this.loaded) return;
    
    try {
      const stored = await AsyncStorage.getItem(ACCURACY_MODEL_KEY);
      if (stored) {
        this.model = JSON.parse(stored);
        console.log(`[AccuracyPredictor] Modelo cargado (${this.model?.totalSamples} muestras)`);
      }
    } catch (error) {
      console.error('[AccuracyPredictor] Error cargando modelo:', error);
    }
    this.loaded = true;
  }
  
  /**
   * Guarda el modelo en AsyncStorage
   */
  private async save(): Promise<void> {
    if (!this.model) return;
    
    try {
      await AsyncStorage.setItem(ACCURACY_MODEL_KEY, JSON.stringify(this.model));
      console.log('[AccuracyPredictor] Modelo guardado');
    } catch (error) {
      console.error('[AccuracyPredictor] Error guardando modelo:', error);
    }
  }
  
  /**
   * Reconstruye el modelo desde el historial de predicciones verificadas
   */
  async rebuildModel(): Promise<AccuracyModel> {
    const allPredictions = await predictionTrackingService.getAllPredictions();
    const verified = allPredictions.filter(p => 
      p.status === 'verified' && p.accuracyScore !== undefined
    );
    
    console.log(`[AccuracyPredictor] Reconstruyendo modelo con ${verified.length} predicciones...`);
    
    // Inicializar modelo vacío
    const model: AccuracyModel = {
      byConfidence: {},
      byTimeframe: {},
      byAssetType: {},
      byVolatility: {},
      byTimeframeVolatility: {},
      bySymbol: {},
      totalSamples: verified.length,
      lastUpdated: new Date().toISOString(),
      globalAvgAccuracy: 0,
      globalAvgDirection: 0,
    };
    
    if (verified.length === 0) {
      this.model = model;
      await this.save();
      return model;
    }
    
    // Agregar predicciones
    let totalAccuracy = 0;
    let totalDirection = 0;
    
    for (const pred of verified) {
      const accuracy = pred.accuracyScore || 0;
      const directionCorrect = pred.directionCorrect ? 100 : 0;
      
      totalAccuracy += accuracy;
      totalDirection += directionCorrect;
      
      // Por confianza (buckets de 10)
      const confBucket = `${Math.floor(pred.confidence / 10) * 10}-${Math.floor(pred.confidence / 10) * 10 + 9}`;
      if (!model.byConfidence[confBucket]) {
        model.byConfidence[confBucket] = { count: 0, avgAccuracy: 0, avgDirection: 0 };
      }
      this.updateBucket(model.byConfidence[confBucket], accuracy, directionCorrect);
      
      // Por timeframe
      const tf = pred.timeframe || this.getTimeframeCategory(pred.timeframeDays);
      if (!model.byTimeframe[tf]) {
        model.byTimeframe[tf] = { count: 0, avgAccuracy: 0, avgDirection: 0 };
      }
      this.updateBucket(model.byTimeframe[tf], accuracy, directionCorrect);
      
      // Por tipo de activo
      const assetType = pred.assetType || 'other';
      if (!model.byAssetType[assetType]) {
        model.byAssetType[assetType] = { count: 0, avgAccuracy: 0, avgDirection: 0 };
      }
      this.updateBucket(model.byAssetType[assetType], accuracy, directionCorrect);
      
      // Por volatilidad
      const vol = pred.volatilityCategory || 'medium';
      if (!model.byVolatility[vol]) {
        model.byVolatility[vol] = { count: 0, avgAccuracy: 0, avgDirection: 0 };
      }
      this.updateBucket(model.byVolatility[vol], accuracy, directionCorrect);
      
      // Por combinación timeframe + volatilidad
      const tfVol = `${tf}_${vol}`;
      if (!model.byTimeframeVolatility[tfVol]) {
        model.byTimeframeVolatility[tfVol] = { count: 0, avgAccuracy: 0, avgDirection: 0 };
      }
      this.updateBucket(model.byTimeframeVolatility[tfVol], accuracy, directionCorrect);
      
      // Por símbolo
      const symbol = pred.symbol;
      if (!model.bySymbol[symbol]) {
        model.bySymbol[symbol] = {
          count: 0,
          avgAccuracy: 0,
          bestTimeframe: tf,
          timeframeAccuracy: {},
        };
      }
      
      const symData = model.bySymbol[symbol];
      symData.count++;
      symData.avgAccuracy = symData.avgAccuracy + (accuracy - symData.avgAccuracy) / symData.count;
      
      // Accuracy por timeframe para este símbolo
      if (!symData.timeframeAccuracy[tf]) {
        symData.timeframeAccuracy[tf] = { count: 0, avgAccuracy: 0 };
      }
      const tfData = symData.timeframeAccuracy[tf];
      tfData.count++;
      tfData.avgAccuracy = tfData.avgAccuracy + (accuracy - tfData.avgAccuracy) / tfData.count;
    }
    
    // Calcular promedios globales
    model.globalAvgAccuracy = totalAccuracy / verified.length;
    model.globalAvgDirection = totalDirection / verified.length;
    
    // Determinar mejor timeframe por símbolo
    for (const symbol of Object.keys(model.bySymbol)) {
      const symData = model.bySymbol[symbol];
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
    
    this.model = model;
    await this.save();
    
    console.log(`[AccuracyPredictor] Modelo reconstruido: avgAccuracy=${model.globalAvgAccuracy.toFixed(1)}, avgDirection=${model.globalAvgDirection.toFixed(1)}%`);
    
    return model;
  }
  
  /**
   * Actualiza un bucket con media móvil
   */
  private updateBucket(
    bucket: { count: number; avgAccuracy: number; avgDirection: number },
    accuracy: number,
    direction: number
  ): void {
    bucket.count++;
    bucket.avgAccuracy = bucket.avgAccuracy + (accuracy - bucket.avgAccuracy) / bucket.count;
    bucket.avgDirection = bucket.avgDirection + (direction - bucket.avgDirection) / bucket.count;
  }
  
  /**
   * Convierte días a categoría de timeframe
   */
  private getTimeframeCategory(days: number): 'intraday' | 'swing' | 'longterm' {
    if (days <= 1) return 'intraday';
    if (days <= 7) return 'swing';
    return 'longterm';
  }
  
  /**
   * Predice el accuracy esperado para una nueva predicción
   */
  async predictAccuracy(features: {
    symbol: string;
    confidence: number;
    volatility?: number;
    timeframeDays: number;
    assetType: string;
    factorsAvailable?: number;
    signalSummary?: string;
  }): Promise<ExpectedAccuracy> {
    await this.load();
    
    // Si no hay modelo, reconstruirlo
    if (!this.model || this.model.totalSamples === 0) {
      await this.rebuildModel();
    }
    
    // Si sigue sin haber datos
    if (!this.model || this.model.totalSamples === 0) {
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
    
    // 1. Por símbolo específico (más peso si hay datos)
    if (this.model.bySymbol[features.symbol]) {
      const symData = this.model.bySymbol[features.symbol];
      if (symData.count >= 3) {
        estimates.push({
          accuracy: symData.avgAccuracy,
          direction: 50, // No tenemos dato de dirección por símbolo
          weight: 3,
          source: `historial de ${features.symbol}`,
        });
      }
    }
    
    // 2. Por combinación timeframe + volatilidad
    const tfVol = `${timeframe}_${volatilityCategory}`;
    if (this.model.byTimeframeVolatility[tfVol]) {
      const data = this.model.byTimeframeVolatility[tfVol];
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
    if (this.model.byConfidence[confBucket]) {
      const data = this.model.byConfidence[confBucket];
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
    if (this.model.byTimeframe[timeframe]) {
      const data = this.model.byTimeframe[timeframe];
      estimates.push({
        accuracy: data.avgAccuracy,
        direction: data.avgDirection,
        weight: 1.5,
        source: `timeframe ${timeframe}`,
      });
    }
    
    // 5. Por tipo de activo
    if (this.model.byAssetType[features.assetType]) {
      const data = this.model.byAssetType[features.assetType];
      estimates.push({
        accuracy: data.avgAccuracy,
        direction: data.avgDirection,
        weight: 1,
        source: `tipo ${features.assetType}`,
      });
    }
    
    // 6. Global como fallback
    estimates.push({
      accuracy: this.model.globalAvgAccuracy,
      direction: this.model.globalAvgDirection,
      weight: 0.5,
      source: 'promedio global',
    });
    
    // Calcular promedio ponderado
    let totalWeight = 0;
    let weightedAccuracy = 0;
    let weightedDirection = 0;
    let basedOnSamples = 0;
    const sources: string[] = [];
    
    for (const est of estimates) {
      weightedAccuracy += est.accuracy * est.weight;
      weightedDirection += est.direction * est.weight;
      totalWeight += est.weight;
      sources.push(est.source);
      
      // Contar samples de fuentes relevantes
      if (est.weight >= 2) {
        basedOnSamples += this.model.totalSamples;
      }
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
    if (this.model.totalSamples >= 50 && estimates.length >= 4) {
      estimationConfidence = 'high';
    } else if (this.model.totalSamples >= 20 && estimates.length >= 3) {
      estimationConfidence = 'medium';
    } else {
      estimationConfidence = 'low';
    }
    
    // Construir explicación
    const mainSource = estimates.sort((a, b) => b.weight - a.weight)[0];
    let explanation = `Basado en ${mainSource.source}`;
    if (this.model.totalSamples > 0) {
      explanation += ` (${this.model.totalSamples} predicciones históricas)`;
    }
    
    // Comparar timeframes para este símbolo
    const timeframeComparison: { timeframe: string; expectedAccuracy: number; samples: number }[] = [];
    let suggestedTimeframe: string | undefined;
    
    if (this.model.bySymbol[features.symbol]) {
      const symData = this.model.bySymbol[features.symbol];
      for (const [tf, data] of Object.entries(symData.timeframeAccuracy)) {
        if (data.count >= 2) {
          timeframeComparison.push({
            timeframe: tf,
            expectedAccuracy: Math.round(data.avgAccuracy),
            samples: data.count,
          });
        }
      }
      
      // Ordenar por accuracy
      timeframeComparison.sort((a, b) => b.expectedAccuracy - a.expectedAccuracy);
      
      // Sugerir mejor timeframe si es diferente al actual
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
      basedOnSamples: this.model.totalSamples,
      explanation,
      suggestedTimeframe,
      timeframeComparison: timeframeComparison.length > 0 ? timeframeComparison : undefined,
    };
  }
  
  /**
   * Categoriza la volatilidad
   */
  private getVolatilityCategory(volatility?: number): 'low' | 'medium' | 'high' {
    if (!volatility) return 'medium';
    if (volatility < 20) return 'low';
    if (volatility < 50) return 'medium';
    return 'high';
  }
  
  /**
   * Obtiene el mejor timeframe para un símbolo
   */
  async getBestTimeframe(symbol: string): Promise<{
    bestTimeframe: string;
    accuracy: number;
    samples: number;
    allTimeframes: { timeframe: string; accuracy: number; samples: number }[];
  } | null> {
    await this.load();
    
    if (!this.model || !this.model.bySymbol[symbol]) {
      return null;
    }
    
    const symData = this.model.bySymbol[symbol];
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
  }
  
  /**
   * Obtiene estadísticas del modelo
   */
  async getModelStats(): Promise<{
    totalSamples: number;
    globalAvgAccuracy: number;
    globalAvgDirection: number;
    lastUpdated: string | null;
    byTimeframe: Record<string, { count: number; avgAccuracy: number }>;
    byAssetType: Record<string, { count: number; avgAccuracy: number }>;
  }> {
    await this.load();
    
    if (!this.model) {
      return {
        totalSamples: 0,
        globalAvgAccuracy: 0,
        globalAvgDirection: 0,
        lastUpdated: null,
        byTimeframe: {},
        byAssetType: {},
      };
    }
    
    return {
      totalSamples: this.model.totalSamples,
      globalAvgAccuracy: Math.round(this.model.globalAvgAccuracy),
      globalAvgDirection: Math.round(this.model.globalAvgDirection),
      lastUpdated: this.model.lastUpdated,
      byTimeframe: Object.fromEntries(
        Object.entries(this.model.byTimeframe).map(([k, v]) => [k, { count: v.count, avgAccuracy: Math.round(v.avgAccuracy) }])
      ),
      byAssetType: Object.fromEntries(
        Object.entries(this.model.byAssetType).map(([k, v]) => [k, { count: v.count, avgAccuracy: Math.round(v.avgAccuracy) }])
      ),
    };
  }
}

export const accuracyPredictorService = new AccuracyPredictorService();
