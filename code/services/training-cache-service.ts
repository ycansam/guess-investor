/**
 * Servicio de cache para predicciones de entrenamiento de IA
 * Usa el backend para persistencia - cache local solo para rendimiento
 */

import { apiClient, type CalculatedPrediction } from './api-client';

export type TrainingTimeframe = 'intraday' | 'swing' | 'longterm';

export interface TrainingPrediction {
  id?: number;
  symbol: string;
  name: string;
  icon: string;
  timeframe: TrainingTimeframe;
  direction: 'up' | 'down' | 'neutral';
  confidence: number;
  predictedChange: number;
  currentPrice: number;
  targetPrice: number;
  currency?: string; // Moneda del activo (EUR, USD, GBP, etc.)
  reasoning: string;
  analysisData?: CalculatedPrediction;
  createdAt: Date;
  expiresAt: Date;
}

// Duraciones de predicción según timeframe 
// Las predicciones deben mantenerse activas hasta que se pueda verificar el resultado
const CACHE_DURATIONS: Record<TrainingTimeframe, number> = {
  intraday: 24 * 60 * 60 * 1000,    // 24 horas (hasta cierre del día)
  swing: 7 * 24 * 60 * 60 * 1000,   // 7 días
  longterm: 30 * 24 * 60 * 60 * 1000, // 30 días
};

// Descripción de timeframes
export const TIMEFRAME_INFO: Record<TrainingTimeframe, { label: string; description: string; duration: string }> = {
  intraday: { 
    label: 'Intradía', 
    description: 'Movimiento en las próximas 1-4 horas',
    duration: '1d'
  },
  swing: { 
    label: 'Swing', 
    description: 'Movimiento en 2-7 días',
    duration: '7d'
  },
  longterm: { 
    label: 'Largo Plazo', 
    description: 'Movimiento en 2-4 semanas',
    duration: '30d'
  },
};

class TrainingCacheService {
  // Cache local para rendimiento
  private cache = new Map<string, TrainingPrediction>();
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  /**
   * Inicializa el cache cargando desde el backend
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.loadFromBackend();
    await this.initPromise;
    this.initialized = true;
  }

  /**
   * Carga predicciones desde el backend
   */
  private async loadFromBackend(): Promise<void> {
    try {
      const data = await apiClient.getTrainingCache();
      
      if (!data || data.length === 0) {
        console.log('[TrainingCache] No cached data in backend');
        return;
      }

      const now = new Date();
      let loaded = 0;

      for (const item of data) {
        const prediction = this.parseBackendData(item);
        
        // Solo cargar si no ha expirado
        if (prediction.expiresAt > now) {
          const key = this.getKey(prediction.symbol, prediction.timeframe);
          this.cache.set(key, prediction);
          loaded++;
        }
      }

      console.log(`[TrainingCache] Loaded ${loaded} predictions from backend`);
    } catch (error) {
      console.error('[TrainingCache] Error loading from backend:', error);
    }
  }

  /**
   * Parsea datos del backend a TrainingPrediction
   */
  private parseBackendData(data: any): TrainingPrediction {
    return {
      id: data.id,
      symbol: data.symbol,
      name: data.name || data.symbol,
      icon: data.icon || '📈',
      timeframe: data.timeframe as TrainingTimeframe,
      direction: data.direction as 'up' | 'down' | 'neutral',
      confidence: data.confidence,
      predictedChange: data.predictedChange,
      currentPrice: data.currentPrice,
      targetPrice: data.targetPrice,
      currency: data.currency || data.analysisData?.currency, // IMPORTANTE: Obtener currency
      reasoning: data.reasoning || '',
      analysisData: data.analysisData,
      createdAt: new Date(data.createdAt),
      expiresAt: new Date(data.expiresAt),
    };
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
  async get(symbol: string, timeframe: TrainingTimeframe): Promise<TrainingPrediction | null> {
    // Primero verificar cache local
    const key = this.getKey(symbol, timeframe);
    const cached = this.cache.get(key);

    if (cached) {
      // Verificar si ha expirado
      if (new Date() > cached.expiresAt) {
        this.cache.delete(key);
        // Eliminar del backend también
        apiClient.deleteTrainingCache(symbol, timeframe).catch(console.error);
        return null;
      }
      return cached;
    }

    // Si no está en cache local, buscar en backend
    try {
      const data = await apiClient.getTrainingCacheItem(symbol, timeframe);
      if (data) {
        const prediction = this.parseBackendData(data);
        this.cache.set(key, prediction);
        return prediction;
      }
    } catch (error) {
      console.error('[TrainingCache] Error getting from backend:', error);
    }

    return null;
  }

  /**
   * Guarda una predicción en cache (backend + local)
   * @param customExpiresAt - Fecha de expiración personalizada (opcional). Si no se proporciona, usa duración estándar del timeframe.
   */
  async set(
    symbol: string, 
    timeframe: TrainingTimeframe, 
    prediction: Omit<TrainingPrediction, 'expiresAt'>,
    customExpiresAt?: Date
  ): Promise<TrainingPrediction> {
    const key = this.getKey(symbol, timeframe);
    
    // Usar expiración personalizada si se proporciona, sino usar duración estándar
    const expiresAt = customExpiresAt || new Date(Date.now() + CACHE_DURATIONS[timeframe]);
    
    const fullPrediction: TrainingPrediction = {
      ...prediction,
      expiresAt,
    };

    // Guardar en backend
    try {
      const saved = await apiClient.saveTrainingCache({
        symbol: prediction.symbol,
        timeframe,
        predictedChange: prediction.predictedChange,
        confidence: prediction.confidence,
        direction: prediction.direction,
        currentPrice: prediction.currentPrice,
        targetPrice: prediction.targetPrice,
        currency: prediction.currency, // IMPORTANTE: Guardar la moneda
        analysisData: prediction.analysisData,
        expiresAt: expiresAt.toISOString(),
      });
      
      fullPrediction.id = saved.id;
    } catch (error) {
      console.error('[TrainingCache] Error saving to backend:', error);
    }

    // Guardar en cache local
    this.cache.set(key, fullPrediction);
    
    console.log(`[TrainingCache] Stored ${symbol} ${timeframe} until ${expiresAt.toISOString()}`);
    
    return fullPrediction;
  }

  /**
   * Verifica si hay una predicción válida cacheada
   */
  has(symbol: string, timeframe: TrainingTimeframe): boolean {
    const key = this.getKey(symbol, timeframe);
    const cached = this.cache.get(key);
    
    if (!cached) return false;
    
    if (new Date() > cached.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Obtiene todas las predicciones activas
   */
  async getAllActive(): Promise<TrainingPrediction[]> {
    try {
      const data = await apiClient.getTrainingCache();
      console.log(`[TrainingCache] getAllActive: backend returned ${data?.length || 0} items`);
      const now = new Date();
      
      const parsed = data.map((item: any) => this.parseBackendData(item));
      const filtered = parsed.filter((p: TrainingPrediction) => p.expiresAt > now);
      console.log(`[TrainingCache] getAllActive: after filter ${filtered.length} active (now: ${now.toISOString()})`);
      return filtered;
    } catch (error) {
      console.error('[TrainingCache] Error getting all active:', error);
      
      // Fallback a cache local
      const now = new Date();
      const active: TrainingPrediction[] = [];
      
      this.cache.forEach((prediction) => {
        if (prediction.expiresAt > now) {
          active.push(prediction);
        }
      });
      
      return active;
    }
  }

  /**
   * Obtiene predicciones activas por timeframe
   */
  async getByTimeframe(timeframe: TrainingTimeframe): Promise<TrainingPrediction[]> {
    const all = await this.getAllActive();
    return all.filter(p => p.timeframe === timeframe);
  }

  /**
   * Elimina una predicción específica
   */
  async remove(symbol: string, timeframe: TrainingTimeframe): Promise<boolean> {
    const key = this.getKey(symbol, timeframe);
    const existed = this.cache.has(key);
    
    // Eliminar de cache local
    this.cache.delete(key);
    
    // Eliminar del backend
    try {
      await apiClient.deleteTrainingCache(symbol, timeframe);
      console.log(`[TrainingCache] Removed ${symbol} ${timeframe}`);
    } catch (error) {
      console.error('[TrainingCache] Error removing from backend:', error);
    }
    
    return existed;
  }

  /**
   * Elimina múltiples predicciones
   */
  async removeMultiple(items: Array<{ symbol: string; timeframe: TrainingTimeframe }>): Promise<number> {
    let removed = 0;
    
    // Eliminar del cache local primero
    for (const item of items) {
      const key = this.getKey(item.symbol, item.timeframe);
      if (this.cache.has(key)) {
        this.cache.delete(key);
        removed++;
      }
    }
    
    // Eliminar del backend - ESPERAR a que terminen todas las eliminaciones
    const deletePromises = items.map(item => 
      apiClient.deleteTrainingCache(item.symbol, item.timeframe).catch(err => {
        console.error(`[TrainingCache] Error deleting ${item.symbol}:`, err);
      })
    );
    await Promise.all(deletePromises);
    
    console.log(`[TrainingCache] Removed ${removed} predictions`);
    return removed;
  }

  /**
   * Limpia predicciones expiradas
   */
  async cleanup(): Promise<number> {
    // Limpiar cache local
    const now = new Date();
    this.cache.forEach((prediction, key) => {
      if (prediction.expiresAt <= now) {
        this.cache.delete(key);
      }
    });

    // Limpiar en backend
    try {
      const result = await apiClient.cleanupTrainingCache();
      console.log(`[TrainingCache] Cleaned up ${result.deleted} expired predictions`);
      return result.deleted;
    } catch (error) {
      console.error('[TrainingCache] Error cleaning up:', error);
      return 0;
    }
  }

  /**
   * Limpia todo el cache local (no afecta backend)
   */
  clearLocal(): void {
    this.cache.clear();
    this.initialized = false;
    this.initPromise = null;
    console.log('[TrainingCache] Local cache cleared');
  }

  /**
   * Limpia TODO el cache (local + backend)
   */
  async clear(): Promise<number> {
    // Limpiar cache local
    this.cache.clear();
    this.initialized = false;
    this.initPromise = null;
    
    // Limpiar en backend
    try {
      const result = await apiClient.clearAllTrainingCache();
      console.log(`[TrainingCache] Cleared ${result.deleted} predictions from backend`);
      return result.deleted;
    } catch (error) {
      console.error('[TrainingCache] Error clearing backend:', error);
      return 0;
    }
  }

  /**
   * Obtiene estadísticas del cache
   */
  async getStats(): Promise<{ 
    total: number; 
    byTimeframe: Record<TrainingTimeframe, number> 
  }> {
    try {
      const stats = await apiClient.getTrainingStats();
      return {
        total: stats.totalCached || 0,
        byTimeframe: stats.byTimeframe || {
          intraday: 0,
          swing: 0,
          longterm: 0,
        },
      };
    } catch (error) {
      console.error('[TrainingCache] Error getting stats:', error);
      
      // Fallback a cache local
      const active = Array.from(this.cache.values());
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
}

export const trainingCacheService = new TrainingCacheService();
