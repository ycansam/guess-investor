/**
 * Python Training Service
 * 
 * Conecta el backend Node.js con el servidor Python de ML (puerto 8765)
 * para sincronizar predicciones verificadas y disparar entrenamiento.
 */

import { prisma } from '../../config/database.js';
import { logger } from '../../middleware/logger.js';

const PYTHON_SERVER_URL = process.env.PYTHON_ML_URL || 'http://localhost:8765';
const SYNC_TIMEOUT_MS = 30000; // 30 segundos para sync
const TRAIN_TIMEOUT_MS = 120000; // 2 minutos para training

interface PythonPrediction {
  id: string;
  symbol: string;
  asset_type: string;
  timeframe: string;
  timeframe_days: number;
  direction: string;
  predicted_change: number;
  confidence: number;
  current_price: number;
  actual_price: number;
  actual_change: number;
  direction_correct: boolean;
  accuracy_score: number;
  created_at: string;
  verified_at: string;
  factor_weights?: Record<string, number>;
}

interface PythonWeights {
  version: number;
  updated_at: string;
  training_samples: number;
  weights: {
    intraday: Record<string, number>;
    swing: Record<string, number>;
    long: Record<string, number>;
  };
  metadata?: {
    learning_rate: number;
    momentum: number;
    final_loss: number;
  };
}

interface TrainingResult {
  success: boolean;
  samples_used: number;
  results: Record<string, {
    samples: number;
    initial_loss: number;
    final_loss: number;
    improvement: number;
  }>;
  weights_saved: string;
}

export const pythonTrainingService = {
  /**
   * Verifica si el servidor Python está corriendo
   */
  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${PYTHON_SERVER_URL}/status`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      
      return response.ok;
    } catch (error) {
      return false;
    }
  },

  /**
   * Obtiene el estado del servidor Python
   */
  async getStatus(): Promise<{
    running: boolean;
    timestamp?: string;
    predictions_count?: number;
    weights_file?: string;
  }> {
    try {
      const response = await fetch(`${PYTHON_SERVER_URL}/status`);
      if (!response.ok) {
        return { running: false };
      }
      const data = await response.json() as Record<string, unknown>;
      return { running: true, ...data } as {
        running: boolean;
        timestamp?: string;
        predictions_count?: number;
        weights_file?: string;
      };
    } catch (error) {
      return { running: false };
    }
  },

  /**
   * Sincroniza predicciones verificadas al servidor Python
   */
  async syncPredictions(): Promise<{
    success: boolean;
    synced: number;
    error?: string;
  }> {
    try {
      // Obtener predicciones verificadas del backend
      const verified = await prisma.prediction.findMany({
        where: {
          verified: true,
          actualPrice: { not: null },
          accuracyScore: { not: null },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (verified.length === 0) {
        return { success: true, synced: 0 };
      }

      // Convertir al formato que espera Python
      const predictions: PythonPrediction[] = verified.map(p => ({
        id: p.id,
        symbol: p.symbol,
        asset_type: p.assetType || 'stock',
        timeframe: p.timeframe || '1 día',
        timeframe_days: p.timeframeDays,
        direction: p.direction,
        predicted_change: p.predictedChange,
        confidence: p.confidence,
        current_price: p.currentPrice,
        actual_price: p.actualPrice!,
        actual_change: p.actualChange || 0,
        direction_correct: p.directionCorrect || false,
        accuracy_score: p.accuracyScore || 0,
        created_at: p.createdAt.toISOString(),
        verified_at: p.verifiedAt?.toISOString() || new Date().toISOString(),
        factor_weights: typeof p.factorWeights === 'object' && p.factorWeights !== null 
          ? p.factorWeights as Record<string, number> 
          : undefined,
      }));

      // Enviar a Python
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

      const response = await fetch(`${PYTHON_SERVER_URL}/predictions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ predictions }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const error = await response.text();
        return { success: false, synced: 0, error };
      }

      const result = await response.json() as { predictions_received: number };
      logger.info(`[PythonBridge] Synced ${result.predictions_received} predictions to Python`);

      return { success: true, synced: result.predictions_received };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return { success: false, synced: 0, error: 'Sync timeout' };
      }
      logger.error('[PythonBridge] Sync error:', error.message);
      return { success: false, synced: 0, error: error.message };
    }
  },

  /**
   * Dispara el entrenamiento en Python
   */
  async triggerTraining(): Promise<{
    success: boolean;
    result?: TrainingResult;
    error?: string;
  }> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TRAIN_TIMEOUT_MS);

      const response = await fetch(`${PYTHON_SERVER_URL}/train`, {
        method: 'POST',
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error };
      }

      const result = await response.json() as TrainingResult;
      logger.info(`[PythonBridge] Training complete: ${result.samples_used} samples`);

      return { success: true, result };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return { success: false, error: 'Training timeout (>2min)' };
      }
      logger.error('[PythonBridge] Training error:', error.message);
      return { success: false, error: error.message };
    }
  },

  /**
   * Obtiene los pesos entrenados desde Python
   */
  async getTrainedWeights(): Promise<{
    success: boolean;
    weights?: PythonWeights;
    error?: string;
  }> {
    try {
      const response = await fetch(`${PYTHON_SERVER_URL}/weights`);
      
      if (!response.ok) {
        if (response.status === 404) {
          return { success: false, error: 'No trained weights available' };
        }
        return { success: false, error: await response.text() };
      }

      const weights = await response.json() as PythonWeights;
      return { success: true, weights };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Sincroniza predicciones Y dispara entrenamiento
   * Útil para llamar después de verificar predicciones
   */
  async syncAndTrain(): Promise<{
    available: boolean;
    synced: number;
    trained: boolean;
    trainingResult?: TrainingResult;
    error?: string;
  }> {
    // Verificar disponibilidad
    const available = await this.isAvailable();
    if (!available) {
      logger.warn('[PythonBridge] Python server not available, skipping sync');
      return { available: false, synced: 0, trained: false };
    }

    // Sincronizar predicciones
    const syncResult = await this.syncPredictions();
    if (!syncResult.success) {
      return {
        available: true,
        synced: 0,
        trained: false,
        error: syncResult.error,
      };
    }

    // Si hay suficientes predicciones, entrenar
    if (syncResult.synced >= 5) {
      const trainResult = await this.triggerTraining();
      return {
        available: true,
        synced: syncResult.synced,
        trained: trainResult.success,
        trainingResult: trainResult.result,
        error: trainResult.error,
      };
    }

    return {
      available: true,
      synced: syncResult.synced,
      trained: false,
    };
  },

  /**
   * Importa pesos desde Python y los guarda en el backend
   */
  async importWeightsFromPython(): Promise<{
    success: boolean;
    imported?: boolean;
    error?: string;
  }> {
    const weightsResult = await this.getTrainedWeights();
    
    if (!weightsResult.success || !weightsResult.weights) {
      return { success: false, error: weightsResult.error };
    }

    const pythonWeights = weightsResult.weights;
    
    // Usar los pesos de 'swing' como default (balance entre corto y largo)
    const swingWeights = pythonWeights.weights.swing;
    
    try {
      // Guardar en el backend
      await prisma.learnedWeights.create({
        data: {
          trend: swingWeights.trend || 0.091,
          technical: swingWeights.technical || 0.091,
          sentiment: swingWeights.sentiment || 0.091,
          news: swingWeights.news || 0.091,
          macro: swingWeights.macro || 0.091,
          competitors: swingWeights.competitors || 0.091,
          forex: swingWeights.forex || 0.091,
          institutional: swingWeights.institutional || 0.091,
          seasonality: swingWeights.seasonality || 0.091,
          financials: swingWeights.financials || 0.091,
          expectations: swingWeights.expectations || 0.091,
          sampleCount: pythonWeights.training_samples,
          accuracy: pythonWeights.metadata?.final_loss 
            ? Math.round((1 - pythonWeights.metadata.final_loss) * 100) 
            : undefined,
          version: pythonWeights.version,
        },
      });

      logger.info(`[PythonBridge] Imported weights v${pythonWeights.version} from Python`);
      return { success: true, imported: true };
    } catch (error: any) {
      logger.error('[PythonBridge] Error importing weights:', error.message);
      return { success: false, error: error.message };
    }
  },
};
