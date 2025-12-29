/**
 * Servicio de Caché Inteligente para Datos Históricos
 * 
 * - Cachea datos históricos por 2 semanas
 * - Cuando se piden datos, verifica si hay cache
 * - Si hay cache pero faltan días recientes, solo pide los faltantes
 * - Combina cache + nuevos datos
 */

import { logger } from '../../middleware/logger.js';
import { HistoricalDataPoint } from '../../models/index.js';

// Duración de la caché: 2 semanas
const CACHE_DURATION_MS = 14 * 24 * 60 * 60 * 1000;

interface CacheEntry {
  data: HistoricalDataPoint[];
  lastTimestamp: number;  // Último timestamp de los datos
  cachedAt: number;       // Cuándo se cacheó
  interval: string;       // Intervalo de los datos (1d, 1h, etc.)
}

// Cache en memoria (en producción podría ser Redis)
const historyCache = new Map<string, CacheEntry>();

/**
 * Generar clave de caché para un símbolo e intervalo
 */
function getCacheKey(symbol: string, interval: string): string {
  return `${symbol.toUpperCase()}:${interval}`;
}

/**
 * Limpiar caché expirada
 */
function cleanExpiredCache(): void {
  const now = Date.now();
  for (const [key, entry] of historyCache.entries()) {
    if (now - entry.cachedAt > CACHE_DURATION_MS) {
      historyCache.delete(key);
      logger.debug(`[HistoryCache] Expired cache for ${key}`);
    }
  }
}

/**
 * Convertir rango a días
 */
function rangeToDays(range: string): number {
  const rangeMap: Record<string, number> = {
    '1d': 1,
    '5d': 5,
    '1mo': 30,
    '3mo': 90,
    '6mo': 180,
    '1y': 365,
  };
  return rangeMap[range] || 30;
}

/**
 * Convertir intervalo a milisegundos
 */
function intervalToMs(interval: string): number {
  const intervalMap: Record<string, number> = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
  };
  return intervalMap[interval] || 24 * 60 * 60 * 1000;
}

export const historyCacheService = {
  /**
   * Obtener datos cacheados si existen y son válidos
   */
  getCached(symbol: string, interval: string, range: string): {
    data: HistoricalDataPoint[];
    needsUpdate: boolean;
    lastTimestamp: number;
  } | null {
    cleanExpiredCache();
    
    const key = getCacheKey(symbol, interval);
    const entry = historyCache.get(key);
    
    if (!entry) {
      return null;
    }
    
    const now = Date.now();
    const daysRequested = rangeToDays(range);
    const startTimestamp = now - daysRequested * 24 * 60 * 60 * 1000;
    
    // Verificar si los datos cubren el rango solicitado
    const oldestData = entry.data[0]?.timestamp || now;
    const coversRange = oldestData <= startTimestamp;
    
    if (!coversRange) {
      // Los datos no cubren el rango, necesitamos todo de nuevo
      return null;
    }
    
    // Calcular si necesitamos actualizar (han pasado datos nuevos)
    const intervalMs = intervalToMs(interval);
    const timeSinceLastData = now - entry.lastTimestamp;
    const needsUpdate = timeSinceLastData > intervalMs * 1.5; // 1.5x el intervalo
    
    logger.debug(`[HistoryCache] Hit for ${key}, needsUpdate: ${needsUpdate}`);
    
    return {
      data: entry.data,
      needsUpdate,
      lastTimestamp: entry.lastTimestamp,
    };
  },
  
  /**
   * Guardar datos en caché
   */
  set(symbol: string, interval: string, data: HistoricalDataPoint[]): void {
    if (!data || data.length === 0) return;
    
    const key = getCacheKey(symbol, interval);
    const lastTimestamp = data[data.length - 1]?.timestamp || Date.now();
    
    historyCache.set(key, {
      data,
      lastTimestamp,
      cachedAt: Date.now(),
      interval,
    });
    
    logger.debug(`[HistoryCache] Cached ${data.length} points for ${key}`);
  },
  
  /**
   * Actualizar caché con nuevos datos (merge)
   */
  update(symbol: string, interval: string, newData: HistoricalDataPoint[]): HistoricalDataPoint[] {
    if (!newData || newData.length === 0) return [];
    
    const key = getCacheKey(symbol, interval);
    const entry = historyCache.get(key);
    
    if (!entry) {
      this.set(symbol, interval, newData);
      return newData;
    }
    
    // Combinar datos existentes con nuevos
    // Filtrar duplicados por timestamp
    const existingTimestamps = new Set(entry.data.map(d => d.timestamp));
    const uniqueNewData = newData.filter(d => !existingTimestamps.has(d.timestamp));
    
    // Combinar y ordenar
    const combined = [...entry.data, ...uniqueNewData]
      .sort((a, b) => a.timestamp - b.timestamp);
    
    // Actualizar caché
    const lastTimestamp = combined[combined.length - 1]?.timestamp || Date.now();
    historyCache.set(key, {
      data: combined,
      lastTimestamp,
      cachedAt: Date.now(),
      interval,
    });
    
    logger.debug(`[HistoryCache] Updated ${key} with ${uniqueNewData.length} new points, total: ${combined.length}`);
    
    return combined;
  },
  
  /**
   * Obtener estadísticas del caché
   */
  getStats(): { entries: number; symbols: string[] } {
    return {
      entries: historyCache.size,
      symbols: Array.from(historyCache.keys()),
    };
  },
  
  /**
   * Limpiar todo el caché
   */
  clear(): void {
    historyCache.clear();
    logger.info('[HistoryCache] Cache cleared');
  },
};
