/**
 * Servicio de cache para predicciones de entrenamiento de IA
 * Cachea las predicciones durante su período de validez con persistencia
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CalculatedPrediction } from './api-client';

export type TrainingTimeframe = 'intraday' | 'swing' | 'longterm';

export interface TrainingPrediction {
  symbol: string;
  name: string;
  icon: string;
  timeframe: TrainingTimeframe;
  direction: 'up' | 'down' | 'neutral';
  confidence: number;
  predictedChange: number;
  currentPrice: number;
  targetPrice: number;
  reasoning: string;
  analysisData?: CalculatedPrediction; // Datos completos del análisis
  createdAt: Date;
  expiresAt: Date;
}

// Interfaz para serialización
interface SerializedPrediction {
  symbol: string;
  name: string;
  icon: string;
  timeframe: TrainingTimeframe;
  direction: 'up' | 'down' | 'neutral';
  confidence: number;
  predictedChange: number;
  currentPrice: number;
  targetPrice: number;
  reasoning: string;
  analysisData?: any; // CalculatedPrediction serializado
  createdAt: string;
  expiresAt: string;
}

// Duraciones de cache según timeframe
const CACHE_DURATIONS: Record<TrainingTimeframe, number> = {
  intraday: 4 * 60 * 60 * 1000,    // 4 horas
  swing: 3 * 24 * 60 * 60 * 1000,  // 3 días
  longterm: 14 * 24 * 60 * 60 * 1000, // 14 días
};

// Clave de storage
const STORAGE_KEY = 'training-predictions-cache';

// Descripción de timeframes
export const TIMEFRAME_INFO: Record<TrainingTimeframe, { label: string; description: string; duration: string }> = {
  intraday: { 
    label: 'Intradía', 
    description: 'Movimiento en las próximas 1-4 horas',
    duration: '4h'
  },
  swing: { 
    label: 'Swing', 
    description: 'Movimiento en 2-7 días',
    duration: '3d'
  },
  longterm: { 
    label: 'Largo Plazo', 
    description: 'Movimiento en 2-4 semanas',
    duration: '14d'
  },
};

class TrainingCacheService {
  private cache = new Map<string, TrainingPrediction>();
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  /**
   * Inicializa el cache cargando desde storage
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.loadFromStorage();
    await this.initPromise;
    this.initialized = true;
  }

  /**
   * Carga predicciones desde AsyncStorage
   */
  private async loadFromStorage(): Promise<void> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (!data) {
        console.log('[TrainingCache] No cached data found');
        return;
      }

      const parsed: Record<string, SerializedPrediction> = JSON.parse(data);
      const now = new Date();
      let loaded = 0;
      let expired = 0;

      for (const [key, serialized] of Object.entries(parsed)) {
        const prediction: TrainingPrediction = {
          ...serialized,
          createdAt: new Date(serialized.createdAt),
          expiresAt: new Date(serialized.expiresAt),
        };

        // Solo cargar si no ha expirado
        if (prediction.expiresAt > now) {
          this.cache.set(key, prediction);
          loaded++;
        } else {
          expired++;
        }
      }

      console.log(`[TrainingCache] Loaded ${loaded} predictions, ${expired} expired`);
    } catch (error) {
      console.error('[TrainingCache] Error loading from storage:', error);
    }
  }

  /**
   * Guarda todas las predicciones en AsyncStorage
   */
  private async saveToStorage(): Promise<void> {
    try {
      const data: Record<string, SerializedPrediction> = {};
      
      this.cache.forEach((prediction, key) => {
        data[key] = {
          ...prediction,
          createdAt: prediction.createdAt.toISOString(),
          expiresAt: prediction.expiresAt.toISOString(),
        };
      });

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      console.log(`[TrainingCache] Saved ${this.cache.size} predictions to storage`);
    } catch (error) {
      console.error('[TrainingCache] Error saving to storage:', error);
    }
  }

  /**
   * Genera la clave de cache para un símbolo y timeframe
   */
  private getKey(symbol: string, timeframe: TrainingTimeframe): string {
    return `${symbol}:${timeframe}`;
  }

  /**
   * Obtiene una predicción cacheada si es válida
   */
  get(symbol: string, timeframe: TrainingTimeframe): TrainingPrediction | null {
    const key = this.getKey(symbol, timeframe);
    const cached = this.cache.get(key);

    if (!cached) return null;

    // Verificar si ha expirado
    if (new Date() > cached.expiresAt) {
      this.cache.delete(key);
      this.saveToStorage(); // Guardar cambio
      return null;
    }

    return cached;
  }

  /**
   * Guarda una predicción en cache
   */
  async set(symbol: string, timeframe: TrainingTimeframe, prediction: Omit<TrainingPrediction, 'expiresAt'>): Promise<TrainingPrediction> {
    const key = this.getKey(symbol, timeframe);
    const duration = CACHE_DURATIONS[timeframe];
    
    const fullPrediction: TrainingPrediction = {
      ...prediction,
      expiresAt: new Date(Date.now() + duration),
    };

    this.cache.set(key, fullPrediction);
    await this.saveToStorage();
    
    console.log(`[TrainingCache] Stored ${symbol} ${timeframe} until ${fullPrediction.expiresAt.toISOString()}`);
    
    return fullPrediction;
  }

  /**
   * Verifica si hay una predicción válida cacheada
   */
  has(symbol: string, timeframe: TrainingTimeframe): boolean {
    return this.get(symbol, timeframe) !== null;
  }

  /**
   * Obtiene todas las predicciones activas
   */
  getAllActive(): TrainingPrediction[] {
    const now = new Date();
    const active: TrainingPrediction[] = [];
    let needsSave = false;

    this.cache.forEach((prediction, key) => {
      if (prediction.expiresAt > now) {
        active.push(prediction);
      } else {
        this.cache.delete(key);
        needsSave = true;
      }
    });

    if (needsSave) {
      this.saveToStorage();
    }

    return active;
  }

  /**
   * Obtiene predicciones activas por timeframe
   */
  getByTimeframe(timeframe: TrainingTimeframe): TrainingPrediction[] {
    return this.getAllActive().filter(p => p.timeframe === timeframe);
  }

  /**
   * Elimina una predicción específica
   */
  async remove(symbol: string, timeframe: TrainingTimeframe): Promise<boolean> {
    const key = this.getKey(symbol, timeframe);
    const existed = this.cache.has(key);
    
    if (existed) {
      this.cache.delete(key);
      await this.saveToStorage();
      console.log(`[TrainingCache] Removed ${symbol} ${timeframe}`);
    }
    
    return existed;
  }

  /**
   * Elimina múltiples predicciones
   */
  async removeMultiple(items: Array<{ symbol: string; timeframe: TrainingTimeframe }>): Promise<number> {
    let removed = 0;
    
    for (const item of items) {
      const key = this.getKey(item.symbol, item.timeframe);
      if (this.cache.has(key)) {
        this.cache.delete(key);
        removed++;
      }
    }
    
    if (removed > 0) {
      await this.saveToStorage();
      console.log(`[TrainingCache] Removed ${removed} predictions`);
    }
    
    return removed;
  }

  /**
   * Limpia predicciones expiradas
   */
  async cleanup(): Promise<number> {
    const now = new Date();
    let removed = 0;

    this.cache.forEach((prediction, key) => {
      if (prediction.expiresAt <= now) {
        this.cache.delete(key);
        removed++;
      }
    });

    if (removed > 0) {
      await this.saveToStorage();
      console.log(`[TrainingCache] Cleaned up ${removed} expired predictions`);
    }
    
    return removed;
  }

  /**
   * Limpia todo el cache
   */
  async clear(): Promise<void> {
    this.cache.clear();
    await AsyncStorage.removeItem(STORAGE_KEY);
    console.log('[TrainingCache] Cache cleared');
  }

  /**
   * Obtiene estadísticas del cache
   */
  getStats(): { total: number; byTimeframe: Record<TrainingTimeframe, number> } {
    const active = this.getAllActive();
    return {
      total: active.length,
      byTimeframe: {
        intraday: active.filter(p => p.timeframe === 'intraday').length,
        swing: active.filter(p => p.timeframe === 'swing').length,
        longterm: active.filter(p => p.timeframe === 'longterm').length,
      },
    };
  }
}

export const trainingCacheService = new TrainingCacheService();
