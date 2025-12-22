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
type VolatilityCategory = 'low' | 'medium' | 'high';
type WeightsMap = Record<Factor, number>;
type AllWeights = Record<Timeframe, WeightsMap>;
// Pesos extendidos: por timeframe Y por volatilidad
type VolatilityWeights = Record<VolatilityCategory, AllWeights>;

// Pesos por defecto (base, sin considerar volatilidad)
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

// Pesos por defecto ajustados por VOLATILIDAD
// Estos son los multiplicadores iniciales que el ML puede ajustar
const DEFAULT_VOLATILITY_WEIGHTS: VolatilityWeights = {
  // Activos de baja volatilidad (<20%): utilities, bonds, large caps estables
  // Priorizan fundamentales sobre técnico
  low: {
    intraday: {
      trend: 0.16, technical: 0.18, sentiment: 0.09, news: 0.14,
      macro: 0.05, competitors: 0.05, forex: 0.05, institutional: 0.07,
      seasonality: 0.03, financials: 0.08, expectations: 0.10
    },
    swing: {
      trend: 0.10, technical: 0.13, sentiment: 0.06, news: 0.12,
      macro: 0.10, competitors: 0.09, forex: 0.07, institutional: 0.14,
      seasonality: 0.05, financials: 0.07, expectations: 0.07
    },
    long: {
      trend: 0.04, technical: 0.06, sentiment: 0.03, news: 0.06,
      macro: 0.15, competitors: 0.12, forex: 0.09, institutional: 0.15,
      seasonality: 0.08, financials: 0.11, expectations: 0.11
    }
  },
  // Activos de volatilidad media (20-50%): mayoría de acciones
  // Pesos balanceados (similar a defaults)
  medium: {
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
  },
  // Activos de alta volatilidad (>50%): crypto, growth stocks, small caps
  // Priorizan técnico/sentiment/momentum sobre fundamentales
  high: {
    intraday: {
      trend: 0.28, technical: 0.32, sentiment: 0.18, news: 0.12,
      macro: 0.02, competitors: 0.02, forex: 0.02, institutional: 0.02,
      seasonality: 0.01, financials: 0.01, expectations: 0.00
    },
    swing: {
      trend: 0.17, technical: 0.25, sentiment: 0.14, news: 0.18,
      macro: 0.05, competitors: 0.05, forex: 0.04, institutional: 0.06,
      seasonality: 0.02, financials: 0.02, expectations: 0.02
    },
    long: {
      trend: 0.07, technical: 0.12, sentiment: 0.06, news: 0.12,
      macro: 0.08, competitors: 0.08, forex: 0.06, institutional: 0.10,
      seasonality: 0.06, financials: 0.10, expectations: 0.15
    }
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

// Time-decay: predicciones recientes pesan más que antiguas
// Half-life de 180 días = predicción de hace 6 meses tiene peso 0.5
const TIME_DECAY_HALF_LIFE_DAYS = 180;

// Pesos de función de pérdida (actualizado para usar accuracyScore)
const LOSS_ALPHA = 0.35;  // Dirección (reducido, ya que accuracyScore lo considera)
const LOSS_BETA = 0.25;   // Magnitud (reducido, accuracyScore también lo mide)
const LOSS_GAMMA = 0.10;  // Rango
const LOSS_DELTA = 0.30;  // Accuracy Score (NUEVO: penaliza predicciones poor/failed)

// Categorías de calidad de predicción
type PredictionQuality = 'excellent' | 'good' | 'poor' | 'failed';

interface TrainingPrediction {
  timeframe: Timeframe;
  volatilityCategory?: 'low' | 'medium' | 'high'; // NUEVO: para segmentar por volatilidad
  factorScores: Record<string, number>;
  predictedChange: number;
  actualChange: number;
  directionCorrect: boolean;
  withinRange: boolean;
  accuracyScore?: number; // NUEVO: 0-100, considera dirección + precisión del %
  predictionQuality?: PredictionQuality; // NUEVO: clasificación de calidad
  targetDate?: string; // NUEVO: Para time-decay (predicciones recientes pesan más)
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
 * Calcula el peso temporal de una predicción usando decaimiento exponencial
 * Predicciones más recientes tienen mayor peso en el entrenamiento
 * @param targetDate - Fecha cuando se verificó la predicción
 * @returns Peso entre 0 y 1 (1 = hoy, 0.5 = hace 180 días)
 */
function computeTimeDecayWeight(targetDate?: string): number {
  if (!targetDate) return 1; // Si no hay fecha, peso máximo (backward compatible)
  
  const now = new Date();
  const predDate = new Date(targetDate);
  const daysOld = Math.max(0, (now.getTime() - predDate.getTime()) / (1000 * 60 * 60 * 24));
  
  // Decaimiento exponencial: weight = e^(-λt) donde λ = ln(2)/half_life
  // Esto asegura que después de TIME_DECAY_HALF_LIFE_DAYS, el peso es 0.5
  const lambda = Math.LN2 / TIME_DECAY_HALF_LIFE_DAYS;
  const weight = Math.exp(-lambda * daysOld);
  
  // Mínimo 0.1 para que predicciones muy antiguas aún contribuyan algo
  return Math.max(0.1, weight);
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
 * MEJORADO: Usa accuracyScore para penalizar más las predicciones poor/failed
 */
function computeLoss(pred: TrainingPrediction): number {
  // 1. Pérdida por dirección incorrecta
  const dirLoss = pred.directionCorrect ? 0 : 1;
  
  // 2. Pérdida por magnitud (qué tan lejos estuvo el % predicho)
  const expectedMag = Math.max(Math.abs(pred.predictedChange), 1);
  const magLoss = Math.pow((pred.actualChange - pred.predictedChange) / expectedMag, 2);
  
  // 3. Pérdida por rango (¿cayó dentro del min-max?)
  const rangeLoss = pred.withinRange ? 0 : 1;
  
  // 4. NUEVO: Pérdida basada en accuracyScore (0-100)
  // Invirtimos el score: accuracyScore alto = pérdida baja
  // accuracyScore 100 = pérdida 0, accuracyScore 0 = pérdida 1
  let accuracyLoss = 0.5; // Default si no hay score
  if (pred.accuracyScore !== undefined) {
    accuracyLoss = 1 - (pred.accuracyScore / 100);
    
    // Penalización extra para predicciones muy malas
    // poor (<50) y failed (<25) reciben penalización adicional
    if (pred.predictionQuality === 'failed') {
      accuracyLoss = Math.min(1, accuracyLoss * 1.5); // +50% penalización
    } else if (pred.predictionQuality === 'poor') {
      accuracyLoss = Math.min(1, accuracyLoss * 1.25); // +25% penalización
    }
  }
  
  return LOSS_ALPHA * dirLoss + LOSS_BETA * magLoss + LOSS_GAMMA * rangeLoss + LOSS_DELTA * accuracyLoss;
}

/**
 * Calcula pérdida promedio ponderada para un batch
 * MEJORADO: Usa time-decay para dar más peso a predicciones recientes
 */
function computeBatchLoss(predictions: TrainingPrediction[]): number {
  if (predictions.length === 0) return 0;
  
  // Calcular pérdida ponderada por tiempo
  let totalWeightedLoss = 0;
  let totalWeight = 0;
  
  for (const pred of predictions) {
    const loss = computeLoss(pred);
    const timeWeight = computeTimeDecayWeight(pred.targetDate);
    
    totalWeightedLoss += loss * timeWeight;
    totalWeight += timeWeight;
  }
  
  // Retornar promedio ponderado
  return totalWeight > 0 ? totalWeightedLoss / totalWeight : 0;
}

class WeightOptimizerService {
  private weights: AllWeights;
  private volatilityWeights: VolatilityWeights; // NUEVO: pesos por volatilidad
  private velocity: AllWeights;
  private volatilityVelocity: VolatilityWeights; // NUEVO: velocity por volatilidad
  private isTraining = false;
  
  constructor() {
    // Inicializar con pesos por defecto
    this.weights = JSON.parse(JSON.stringify(DEFAULT_WEIGHTS));
    this.volatilityWeights = JSON.parse(JSON.stringify(DEFAULT_VOLATILITY_WEIGHTS));
    this.velocity = this.initVelocity();
    this.volatilityVelocity = this.initVolatilityVelocity();
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
  
  private initVolatilityVelocity(): VolatilityWeights {
    const v: Partial<VolatilityWeights> = {};
    for (const vol of ['low', 'medium', 'high'] as VolatilityCategory[]) {
      v[vol] = this.initVelocity();
    }
    return v as VolatilityWeights;
  }
  
  /**
   * Convierte TrackedPrediction a formato de entrenamiento
   * MEJORADO: Incluye accuracyScore, predictionQuality y volatilityCategory
   */
  private convertPrediction(p: TrackedPrediction): TrainingPrediction | null {
    if (p.status !== 'verified' || !p.factorScores) return null;
    
    return {
      timeframe: getTimeframe(p.timeframeDays),
      volatilityCategory: p.volatilityCategory,
      factorScores: p.factorScores,
      predictedChange: p.predictedChange,
      actualChange: p.actualChange || 0,
      directionCorrect: p.directionCorrect || false,
      withinRange: p.withinRange || false,
      accuracyScore: p.accuracyScore,
      predictionQuality: p.predictionQuality,
      targetDate: p.targetDate, // Para time-decay en entrenamiento
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
   * NUEVO: Agrupa predicciones por volatilidad
   */
  private groupByVolatility(predictions: TrainingPrediction[]): Record<VolatilityCategory, TrainingPrediction[]> {
    const groups: Record<VolatilityCategory, TrainingPrediction[]> = {
      low: [],
      medium: [],
      high: [],
    };
    
    for (const p of predictions) {
      const vol = p.volatilityCategory || 'medium'; // Default a medium si no hay dato
      groups[vol].push(p);
    }
    
    return groups;
  }
  
  /**
   * Calcula gradientes numéricos (para pesos por timeframe)
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
   * MEJORADO: También entrena pesos segmentados por volatilidad
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
    
    // Log de distribución por volatilidad
    const byVolatility = this.groupByVolatility(predictions);
    console.log(`[WeightOptimizer] Distribución por volatilidad: low=${byVolatility.low.length}, medium=${byVolatility.medium.length}, high=${byVolatility.high.length}`);
    
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
