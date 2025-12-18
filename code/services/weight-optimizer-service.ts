/**
 * Servicio de Optimización de Pesos ML
 * Implementa descenso de gradiente con momentum para optimizar
 * los pesos de los factores de predicción.
 * 
 * Este servicio corre directamente en la app, sin necesidad de Python.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { TrackedPrediction } from './prediction-tracking-service';

// Claves de almacenamiento
const LEARNED_WEIGHTS_KEY = 'learned-weights';
const TRAINING_HISTORY_KEY = 'ml-training-history';

// Configuración
const FACTORS = [
  'trend', 'technical', 'sentiment', 'news', 'macro',
  'competitors', 'forex', 'institutional', 'seasonality',
  'financials', 'expectations'
] as const;

type Factor = typeof FACTORS[number];
type Timeframe = 'intraday' | 'swing' | 'long';
type WeightsMap = Record<Factor, number>;
type AllWeights = Record<Timeframe, WeightsMap>;

// Pesos por defecto
const DEFAULT_WEIGHTS: AllWeights = {
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

// Hiperparámetros
const LEARNING_RATE = 0.01;
const MOMENTUM = 0.9;
const EPOCHS = 100;
const EARLY_STOPPING_PATIENCE = 10;
const MIN_SAMPLES = 10;
const WEIGHT_MIN = 0.01;
const WEIGHT_MAX = 0.40;

// Pesos de función de pérdida
const LOSS_ALPHA = 0.5;  // Dirección
const LOSS_BETA = 0.35;  // Magnitud
const LOSS_GAMMA = 0.15; // Rango

interface TrainingPrediction {
  timeframe: Timeframe;
  factorScores: Record<string, number>;
  predictedChange: number;
  actualChange: number;
  directionCorrect: boolean;
  withinRange: boolean;
}

interface TrainingResult {
  timestamp: string;
  samples: number;
  initialLoss: number;
  finalLoss: number;
  improvement: number;
  epochsRun: number;
  weights: AllWeights;
}

/**
 * Convierte días a timeframe
 */
function getTimeframe(days: number): Timeframe {
  if (days <= 1) return 'intraday';
  if (days <= 7) return 'swing';
  return 'long';
}

/**
 * Calcula la media de un array
 */
function mean(values: number[]): number {
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/**
 * Normaliza pesos para que sumen 1
 */
function normalizeWeights(weights: WeightsMap): WeightsMap {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  if (total === 0) return weights;
  
  const normalized: Partial<WeightsMap> = {};
  for (const factor of FACTORS) {
    normalized[factor] = weights[factor] / total;
  }
  return normalized as WeightsMap;
}

/**
 * Aplica límites y normaliza
 */
function clipAndNormalize(weights: WeightsMap): WeightsMap {
  const clipped: Partial<WeightsMap> = {};
  for (const factor of FACTORS) {
    clipped[factor] = Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, weights[factor]));
  }
  return normalizeWeights(clipped as WeightsMap);
}

/**
 * Calcula pérdida para una predicción
 */
function computeLoss(pred: TrainingPrediction): number {
  const dirLoss = pred.directionCorrect ? 0 : 1;
  const expectedMag = Math.max(Math.abs(pred.predictedChange), 1);
  const magLoss = Math.pow((pred.actualChange - pred.predictedChange) / expectedMag, 2);
  const rangeLoss = pred.withinRange ? 0 : 1;
  
  return LOSS_ALPHA * dirLoss + LOSS_BETA * magLoss + LOSS_GAMMA * rangeLoss;
}

/**
 * Calcula pérdida promedio para un batch
 */
function computeBatchLoss(predictions: TrainingPrediction[]): number {
  if (predictions.length === 0) return 0;
  return mean(predictions.map(computeLoss));
}

class WeightOptimizerService {
  private weights: AllWeights;
  private velocity: AllWeights;
  private isTraining = false;
  
  constructor() {
    // Inicializar con pesos por defecto
    this.weights = JSON.parse(JSON.stringify(DEFAULT_WEIGHTS));
    this.velocity = this.initVelocity();
  }
  
  private initVelocity(): AllWeights {
    const v: Partial<AllWeights> = {};
    for (const tf of ['intraday', 'swing', 'long'] as Timeframe[]) {
      v[tf] = {} as WeightsMap;
      for (const f of FACTORS) {
        v[tf]![f] = 0;
      }
    }
    return v as AllWeights;
  }
  
  /**
   * Convierte TrackedPrediction a formato de entrenamiento
   */
  private convertPrediction(p: TrackedPrediction): TrainingPrediction | null {
    if (p.status !== 'verified' || !p.factorScores) return null;
    
    return {
      timeframe: getTimeframe(p.timeframeDays),
      factorScores: p.factorScores,
      predictedChange: p.predictedChange,
      actualChange: p.actualChange || 0,
      directionCorrect: p.directionCorrect || false,
      withinRange: p.withinRange || false,
    };
  }
  
  /**
   * Agrupa predicciones por timeframe
   */
  private groupByTimeframe(predictions: TrainingPrediction[]): Record<Timeframe, TrainingPrediction[]> {
    const groups: Record<Timeframe, TrainingPrediction[]> = {
      intraday: [],
      swing: [],
      long: [],
    };
    
    for (const p of predictions) {
      groups[p.timeframe].push(p);
    }
    
    return groups;
  }
  
  /**
   * Calcula gradientes numéricos
   */
  private computeGradients(predictions: TrainingPrediction[], epsilon = 0.001): AllWeights {
    const gradients = this.initVelocity();
    const byTimeframe = this.groupByTimeframe(predictions);
    
    for (const tf of ['intraday', 'swing', 'long'] as Timeframe[]) {
      const preds = byTimeframe[tf];
      if (preds.length === 0) continue;
      
      for (const factor of FACTORS) {
        const original = this.weights[tf][factor];
        
        // Loss con peso aumentado
        this.weights[tf][factor] = original + epsilon;
        const lossPlus = computeBatchLoss(preds);
        
        // Loss con peso disminuido
        this.weights[tf][factor] = original - epsilon;
        const lossMinus = computeBatchLoss(preds);
        
        // Restaurar
        this.weights[tf][factor] = original;
        
        // Gradiente
        gradients[tf][factor] = (lossPlus - lossMinus) / (2 * epsilon);
      }
    }
    
    return gradients;
  }
  
  /**
   * Ejecuta un paso de entrenamiento
   */
  private trainStep(predictions: TrainingPrediction[]): number {
    const gradients = this.computeGradients(predictions);
    
    for (const tf of ['intraday', 'swing', 'long'] as Timeframe[]) {
      for (const factor of FACTORS) {
        // Actualizar velocidad (momentum)
        this.velocity[tf][factor] = 
          MOMENTUM * this.velocity[tf][factor] - 
          LEARNING_RATE * gradients[tf][factor];
        
        // Actualizar peso
        this.weights[tf][factor] += this.velocity[tf][factor];
      }
      
      // Normalizar y aplicar límites
      this.weights[tf] = clipAndNormalize(this.weights[tf]);
    }
    
    return computeBatchLoss(predictions);
  }
  
  /**
   * Entrena el modelo con las predicciones verificadas
   */
  async train(trackedPredictions: TrackedPrediction[]): Promise<TrainingResult | null> {
    if (this.isTraining) {
      console.log('[WeightOptimizer] Ya hay un entrenamiento en curso');
      return null;
    }
    
    // Convertir predicciones
    const predictions: TrainingPrediction[] = [];
    for (const tp of trackedPredictions) {
      const converted = this.convertPrediction(tp);
      if (converted) predictions.push(converted);
    }
    
    if (predictions.length < MIN_SAMPLES) {
      console.log(`[WeightOptimizer] Muestras insuficientes: ${predictions.length}/${MIN_SAMPLES}`);
      return null;
    }
    
    this.isTraining = true;
    console.log(`[WeightOptimizer] 🧠 Iniciando entrenamiento con ${predictions.length} predicciones...`);
    
    try {
      // Cargar pesos actuales si existen
      await this.loadWeights();
      
      const initialLoss = computeBatchLoss(predictions);
      let bestLoss = initialLoss;
      let bestWeights = JSON.parse(JSON.stringify(this.weights));
      let patienceCounter = 0;
      let epochsRun = 0;
      
      for (let epoch = 0; epoch < EPOCHS; epoch++) {
        const loss = this.trainStep(predictions);
        epochsRun = epoch + 1;
        
        if (loss < bestLoss - 0.0001) {
          bestLoss = loss;
          bestWeights = JSON.parse(JSON.stringify(this.weights));
          patienceCounter = 0;
        } else {
          patienceCounter++;
        }
        
        if (patienceCounter >= EARLY_STOPPING_PATIENCE) {
          console.log(`[WeightOptimizer] ⚡ Early stopping en epoch ${epoch + 1}`);
          break;
        }
      }
      
      // Restaurar mejores pesos
      this.weights = bestWeights;
      
      const finalLoss = computeBatchLoss(predictions);
      const improvement = initialLoss > 0 ? (initialLoss - finalLoss) / initialLoss : 0;
      
      console.log(`[WeightOptimizer] ✅ Entrenamiento completado:`);
      console.log(`   Loss: ${initialLoss.toFixed(4)} → ${finalLoss.toFixed(4)} (${(improvement * 100).toFixed(1)}% mejora)`);
      
      // Guardar pesos
      await this.saveWeights(predictions.length);
      
      // Guardar resultado en historial
      const result: TrainingResult = {
        timestamp: new Date().toISOString(),
        samples: predictions.length,
        initialLoss,
        finalLoss,
        improvement,
        epochsRun,
        weights: this.weights,
      };
      
      await this.appendToHistory(result);
      
      return result;
      
    } finally {
      this.isTraining = false;
    }
  }
  
  /**
   * Carga pesos desde AsyncStorage
   */
  async loadWeights(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(LEARNED_WEIGHTS_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.weights && data.training_samples > 0) {
          this.weights = data.weights;
          console.log(`[WeightOptimizer] Pesos cargados (${data.training_samples} muestras previas)`);
        }
      }
    } catch (error) {
      console.error('[WeightOptimizer] Error cargando pesos:', error);
    }
  }
  
  /**
   * Guarda pesos en AsyncStorage
   */
  private async saveWeights(samples: number): Promise<void> {
    try {
      const data = {
        weights: this.weights,
        training_samples: samples,
        updated_at: new Date().toISOString(),
      };
      await AsyncStorage.setItem(LEARNED_WEIGHTS_KEY, JSON.stringify(data));
      console.log('[WeightOptimizer] 💾 Pesos guardados');
    } catch (error) {
      console.error('[WeightOptimizer] Error guardando pesos:', error);
    }
  }
  
  /**
   * Añade resultado al historial
   */
  private async appendToHistory(result: TrainingResult): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(TRAINING_HISTORY_KEY);
      const history: TrainingResult[] = stored ? JSON.parse(stored) : [];
      
      history.push(result);
      
      // Mantener solo los últimos 50 entrenamientos
      if (history.length > 50) {
        history.splice(0, history.length - 50);
      }
      
      await AsyncStorage.setItem(TRAINING_HISTORY_KEY, JSON.stringify(history));
    } catch (error) {
      console.error('[WeightOptimizer] Error guardando historial:', error);
    }
  }
  
  /**
   * Obtiene el historial de entrenamientos
   */
  async getHistory(): Promise<TrainingResult[]> {
    try {
      const stored = await AsyncStorage.getItem(TRAINING_HISTORY_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('[WeightOptimizer] Error leyendo historial:', error);
      return [];
    }
  }
  
  /**
   * Obtiene los pesos actuales
   */
  getWeights(): AllWeights {
    return this.weights;
  }
}

export const weightOptimizerService = new WeightOptimizerService();
