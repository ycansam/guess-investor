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
  factor_scores?: Record<string, number>;  // Scores de cada factor
  factor_weights?: Record<string, number>; // Pesos usados
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
   * Cuenta predicciones verificadas disponibles para training.
   * Python lee directamente del backend via API, no necesitamos enviar.
   */
  async syncPredictions(): Promise<{
    success: boolean;
    synced: number;
    error?: string;
  }> {
    try {
      // Solo contamos las predicciones verificadas - Python las leerá del backend
      const count = await prisma.prediction.count({
        where: {
          verified: true,
          actualPrice: { not: null },
          accuracyScore: { not: null },
        },
      });

      logger.info(`[PythonBridge] ${count} verified predictions available for training`);
      return { success: true, synced: count };
    } catch (error: any) {
      logger.error('[PythonBridge] Error counting predictions:', error.message);
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
   * Útil para llamar después de verificar predicciones.
   * Python escribe los pesos directamente al archivo learned_weights.json
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
      
      // Python escribe los pesos directamente al archivo JSON (code/config/learned_weights.json)
      // No necesitamos importarlos a la DB - el archivo JSON es la única fuente de verdad
      if (trainResult.success) {
        logger.info('[PythonBridge] Training successful, weights updated in learned_weights.json');
      }
      
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
   * Resetea todo el sistema ML de Python (predicciones y pesos)
   */
  async resetAll(): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(`${PYTHON_SERVER_URL}/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      
      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` };
      }
      
      const result = await response.json() as { success: boolean; message?: string };
      logger.info('[PythonBridge] Reset completo en Python');
      return { success: result.success };
    } catch (error: any) {
      logger.error('[PythonBridge] Error reseteando Python:', error.message);
      return { success: false, error: error.message };
    }
  },
};
