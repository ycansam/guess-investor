/**
 * Adaptive Weights Service
 * 
 * Ajusta los pesos de los factores en TIEMPO REAL basándose en:
 * 1. Performance reciente (últimas N predicciones)
 * 2. Condiciones actuales del mercado
 * 3. Feedback loop inmediato (sin esperar reentrenamiento batch)
 * 
 * Diferencia vs weight-optimizer-service:
 * - weight-optimizer: Entrena periódicamente con todos los datos (batch)
 * - adaptive-weights: Ajusta on-the-fly basado en performance reciente (online)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================================================
// TYPES
// ============================================================================

export type FactorName = 
  | 'trend' | 'technical' | 'sentiment' | 'news' | 'macro'
  | 'competitors' | 'forex' | 'institutional' | 'seasonality'
  | 'financials' | 'expectations';

export type Timeframe = 'intraday' | 'swing' | 'long';

interface RecentPrediction {
  id: string;
  timestamp: number;
  symbol: string;
  timeframe: Timeframe;
  factorScores: Record<FactorName, number>;
  predictedChange: number;
  actualChange?: number;
  accuracyScore?: number;
  directionCorrect?: boolean;
}

interface AdaptiveAdjustment {
  factor: FactorName;
  adjustment: number;     // Multiplicador (ej: 1.1 = +10%, 0.9 = -10%)
  reason: string;
  confidence: number;     // 0-1, qué tan seguro estamos del ajuste
}

interface AdaptiveState {
  recentPredictions: RecentPrediction[];
  currentAdjustments: Record<FactorName, AdaptiveAdjustment>;
  lastUpdate: number;
  performanceWindow: {
    directionAccuracy: number;
    avgAccuracyScore: number;
    sampleCount: number;
  };
}

interface AdaptiveWeightsResult {
  adjustedWeights: Record<FactorName, number>;
  adjustments: AdaptiveAdjustment[];
  performanceTrend: 'improving' | 'stable' | 'declining';
  adaptationStrength: number; // 0-1, cuánto nos desviamos de base weights
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = 'adaptive-weights-state';
const RECENT_WINDOW_SIZE = 10;           // Últimas N predicciones a considerar
const MIN_SAMPLES_FOR_ADAPTATION = 3;    // Mínimo para empezar a adaptar
const MAX_ADJUSTMENT = 0.3;              // Máximo ±30% de ajuste
const DECAY_RATE = 0.95;                 // Decaimiento de ajustes por época
const LEARNING_RATE = 0.1;               // Velocidad de adaptación

const ALL_FACTORS: FactorName[] = [
  'trend', 'technical', 'sentiment', 'news', 'macro',
  'competitors', 'forex', 'institutional', 'seasonality',
  'financials', 'expectations'
];

// ============================================================================
// SERVICE
// ============================================================================

class AdaptiveWeightsService {
  private state: AdaptiveState | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.state = JSON.parse(stored);
      } else {
        this.state = this.createEmptyState();
      }
      this.initialized = true;
    } catch (error) {
      console.error('[AdaptiveWeights] Error initializing:', error);
      this.state = this.createEmptyState();
      this.initialized = true;
    }
  }

  private createEmptyState(): AdaptiveState {
    const emptyAdjustments: Record<FactorName, AdaptiveAdjustment> = {} as any;
    ALL_FACTORS.forEach(factor => {
      emptyAdjustments[factor] = {
        factor,
        adjustment: 1.0,
        reason: 'No data yet',
        confidence: 0
      };
    });

    return {
      recentPredictions: [],
      currentAdjustments: emptyAdjustments,
      lastUpdate: Date.now(),
      performanceWindow: {
        directionAccuracy: 0.5,
        avgAccuracyScore: 50,
        sampleCount: 0
      }
    };
  }

  private async saveState(): Promise<void> {
    if (!this.state) return;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (error) {
      console.error('[AdaptiveWeights] Error saving state:', error);
    }
  }

  /**
   * Registra una nueva predicción para el sistema adaptativo
   */
  async recordPrediction(prediction: Omit<RecentPrediction, 'id' | 'timestamp'>): Promise<void> {
    await this.initialize();
    if (!this.state) return;

    const newPrediction: RecentPrediction = {
      ...prediction,
      id: `pred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now()
    };

    this.state.recentPredictions.push(newPrediction);

    // Mantener solo las últimas N
    if (this.state.recentPredictions.length > RECENT_WINDOW_SIZE * 2) {
      this.state.recentPredictions = this.state.recentPredictions.slice(-RECENT_WINDOW_SIZE);
    }

    await this.saveState();
  }

  /**
   * Actualiza una predicción con su resultado real
   */
  async updatePredictionResult(
    predictionId: string,
    actualChange: number,
    accuracyScore: number,
    directionCorrect: boolean
  ): Promise<void> {
    await this.initialize();
    if (!this.state) return;

    const prediction = this.state.recentPredictions.find(p => p.id === predictionId);
    if (prediction) {
      prediction.actualChange = actualChange;
      prediction.accuracyScore = accuracyScore;
      prediction.directionCorrect = directionCorrect;
    }

    // Recalcular ajustes adaptativos
    await this.recalculateAdjustments();
    await this.saveState();
  }

  /**
   * Recalcula los ajustes basándose en performance reciente
   */
  private async recalculateAdjustments(): Promise<void> {
    if (!this.state) return;

    // Filtrar solo predicciones verificadas
    const verified = this.state.recentPredictions
      .filter(p => p.actualChange !== undefined && p.accuracyScore !== undefined)
      .slice(-RECENT_WINDOW_SIZE);

    if (verified.length < MIN_SAMPLES_FOR_ADAPTATION) {
      return; // No hay suficientes datos
    }

    // Calcular métricas de performance
    const directionAccuracy = verified.filter(p => p.directionCorrect).length / verified.length;
    const avgAccuracyScore = verified.reduce((sum, p) => sum + (p.accuracyScore || 0), 0) / verified.length;

    this.state.performanceWindow = {
      directionAccuracy,
      avgAccuracyScore,
      sampleCount: verified.length
    };

    // Para cada factor, calcular su contribución al éxito/fracaso
    for (const factor of ALL_FACTORS) {
      const adjustment = this.calculateFactorAdjustment(factor, verified);
      this.state.currentAdjustments[factor] = adjustment;
    }

    this.state.lastUpdate = Date.now();
  }

  /**
   * Calcula el ajuste para un factor específico
   */
  private calculateFactorAdjustment(
    factor: FactorName,
    predictions: RecentPrediction[]
  ): AdaptiveAdjustment {
    // Separar predicciones donde el factor fue alto (>60) vs bajo (<40)
    const highFactorPreds = predictions.filter(p => (p.factorScores[factor] || 50) > 60);
    const lowFactorPreds = predictions.filter(p => (p.factorScores[factor] || 50) < 40);

    let adjustment = 1.0;
    let reason = 'Neutral';
    let confidence = 0;

    if (highFactorPreds.length >= 2 && lowFactorPreds.length >= 2) {
      // Calcular accuracy cuando el factor es alto vs bajo
      const highAccuracy = highFactorPreds.reduce((sum, p) => sum + (p.accuracyScore || 0), 0) / highFactorPreds.length;
      const lowAccuracy = lowFactorPreds.reduce((sum, p) => sum + (p.accuracyScore || 0), 0) / lowFactorPreds.length;

      const diff = (highAccuracy - lowAccuracy) / 100;
      
      if (Math.abs(diff) > 0.05) {
        // El factor tiene impacto significativo
        adjustment = 1 + (diff * LEARNING_RATE);
        adjustment = Math.max(1 - MAX_ADJUSTMENT, Math.min(1 + MAX_ADJUSTMENT, adjustment));
        
        if (diff > 0.1) {
          reason = `Factor muy predictivo (+${(diff * 100).toFixed(0)}% accuracy)`;
          confidence = Math.min(0.9, diff * 2);
        } else if (diff > 0) {
          reason = `Factor levemente predictivo (+${(diff * 100).toFixed(0)}%)`;
          confidence = Math.min(0.6, diff * 2);
        } else if (diff < -0.1) {
          reason = `Factor inversamente correlacionado (${(diff * 100).toFixed(0)}%)`;
          confidence = Math.min(0.9, Math.abs(diff) * 2);
        } else {
          reason = `Factor levemente negativo (${(diff * 100).toFixed(0)}%)`;
          confidence = Math.min(0.6, Math.abs(diff) * 2);
        }
      }
    }

    // Aplicar decay al ajuste existente
    const existingAdjustment = this.state?.currentAdjustments[factor]?.adjustment || 1.0;
    const decayedExisting = 1 + (existingAdjustment - 1) * DECAY_RATE;
    
    // Blend entre existente (decayed) y nuevo
    const blendedAdjustment = decayedExisting * 0.7 + adjustment * 0.3;

    return {
      factor,
      adjustment: blendedAdjustment,
      reason,
      confidence
    };
  }

  /**
   * Obtiene pesos adaptados en tiempo real
   */
  async getAdaptiveWeights(
    baseWeights: Record<FactorName, number>,
    context?: {
      symbol?: string;
      timeframe?: Timeframe;
      marketVolatility?: 'low' | 'medium' | 'high';
    }
  ): Promise<AdaptiveWeightsResult> {
    await this.initialize();

    const adjustedWeights: Record<FactorName, number> = { ...baseWeights };
    const adjustments: AdaptiveAdjustment[] = [];
    let totalAdjustmentMagnitude = 0;

    if (this.state && this.state.performanceWindow.sampleCount >= MIN_SAMPLES_FOR_ADAPTATION) {
      // Aplicar ajustes
      for (const factor of ALL_FACTORS) {
        const adj = this.state.currentAdjustments[factor];
        if (adj && adj.confidence > 0.2) {
          adjustedWeights[factor] = (baseWeights[factor] || 0) * adj.adjustment;
          adjustments.push(adj);
          totalAdjustmentMagnitude += Math.abs(adj.adjustment - 1);
        }
      }

      // Normalizar para que sumen 1
      const total = Object.values(adjustedWeights).reduce((sum, w) => sum + w, 0);
      if (total > 0) {
        for (const factor of ALL_FACTORS) {
          adjustedWeights[factor] = adjustedWeights[factor] / total;
        }
      }
    }

    // Determinar trend de performance
    let performanceTrend: 'improving' | 'stable' | 'declining' = 'stable';
    if (this.state && this.state.performanceWindow.sampleCount >= 5) {
      const recentHalf = this.state.recentPredictions
        .filter(p => p.accuracyScore !== undefined)
        .slice(-5);
      const olderHalf = this.state.recentPredictions
        .filter(p => p.accuracyScore !== undefined)
        .slice(-10, -5);

      if (recentHalf.length >= 3 && olderHalf.length >= 3) {
        const recentAvg = recentHalf.reduce((s, p) => s + (p.accuracyScore || 0), 0) / recentHalf.length;
        const olderAvg = olderHalf.reduce((s, p) => s + (p.accuracyScore || 0), 0) / olderHalf.length;
        
        if (recentAvg > olderAvg + 5) performanceTrend = 'improving';
        else if (recentAvg < olderAvg - 5) performanceTrend = 'declining';
      }
    }

    return {
      adjustedWeights,
      adjustments: adjustments.filter(a => a.confidence > 0.3),
      performanceTrend,
      adaptationStrength: Math.min(1, totalAdjustmentMagnitude / ALL_FACTORS.length)
    };
  }

  /**
   * Obtiene métricas del sistema adaptativo
   */
  async getAdaptiveMetrics(): Promise<{
    recentPredictionsCount: number;
    verifiedCount: number;
    performanceWindow: AdaptiveState['performanceWindow'];
    topAdjustments: AdaptiveAdjustment[];
    lastUpdate: number;
  }> {
    await this.initialize();

    if (!this.state) {
      return {
        recentPredictionsCount: 0,
        verifiedCount: 0,
        performanceWindow: { directionAccuracy: 0, avgAccuracyScore: 0, sampleCount: 0 },
        topAdjustments: [],
        lastUpdate: 0
      };
    }

    const verifiedCount = this.state.recentPredictions.filter(p => p.accuracyScore !== undefined).length;
    
    // Top adjustments (más significativos)
    const topAdjustments = Object.values(this.state.currentAdjustments)
      .filter(a => a.confidence > 0.3)
      .sort((a, b) => Math.abs(b.adjustment - 1) - Math.abs(a.adjustment - 1))
      .slice(0, 5);

    return {
      recentPredictionsCount: this.state.recentPredictions.length,
      verifiedCount,
      performanceWindow: this.state.performanceWindow,
      topAdjustments,
      lastUpdate: this.state.lastUpdate
    };
  }

  /**
   * Fuerza recálculo de ajustes
   */
  async forceRecalculate(): Promise<void> {
    await this.initialize();
    await this.recalculateAdjustments();
    await this.saveState();
  }

  /**
   * Reset del sistema adaptativo
   */
  async reset(): Promise<void> {
    this.state = this.createEmptyState();
    await this.saveState();
  }
}

// Singleton export
export const adaptiveWeightsService = new AdaptiveWeightsService();
