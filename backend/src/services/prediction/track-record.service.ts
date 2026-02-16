/**
 * Track Record Service
 * Calcula el historial de precisión por símbolo para ajustar la confianza
 * de predicciones futuras basándose en rendimiento pasado.
 */

import { prisma } from '../../config/database.js';
import { logger } from '../../middleware/logger.js';

export interface SymbolTrackRecord {
  symbol: string;
  totalPredictions: number;
  verifiedPredictions: number;
  directionCorrect: number;
  directionAccuracy: number; // 0-100
  avgAccuracyScore: number;  // 0-100
  avgPriceError: number;
  withinRangeRate: number;   // 0-100
  qualityBreakdown: {
    excellent: number;
    good: number;
    poor: number;
    failed: number;
  };
  confidenceAdjustment: number; // -10 a +10 (antes -20 a +20)
  isReliable: boolean;
  lastUpdated: Date;
}

export interface GlobalTrackRecord {
  totalPredictions: number;
  verifiedPredictions: number;
  overallAccuracy: number;
  avgAccuracyScore: number;
  isCalibrated: boolean;
}

// Cache de track records por símbolo
const trackRecordCache = new Map<string, { data: SymbolTrackRecord; timestamp: number }>();
let globalCache: { data: GlobalTrackRecord; timestamp: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutos

// SIMPLIFICADO: Mínimo de 30 predicciones para aplicar ajuste (antes era 5)
// Razón: Con pocas muestras el ajuste es ruido, no señal
const MIN_VERIFIED_FOR_ADJUSTMENT = 30;
const MIN_VERIFIED_FOR_RELIABLE = 30;

export const trackRecordService = {
  /**
   * Obtiene el track record de un símbolo específico
   */
  async getSymbolTrackRecord(symbol: string): Promise<SymbolTrackRecord | null> {
    const symbolUpper = symbol.toUpperCase();
    
    // Check cache
    const cached = trackRecordCache.get(symbolUpper);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }

    try {
      const predictions = await prisma.prediction.findMany({
        where: { 
          symbol: symbolUpper,
          verified: true,
        },
        select: {
          direction: true,
          directionCorrect: true,
          accuracyScore: true,
          priceError: true,
          withinRange: true,
          quality: true,
          confidence: true,
        },
      });

      const totalPredictions = await prisma.prediction.count({
        where: { symbol: symbolUpper },
      });

      if (predictions.length === 0) {
        return null;
      }

      const verifiedPredictions = predictions.length;
      // Excluir laterales/neutral de las métricas de accuracy
      const directionalPredictions = predictions.filter(p => p.direction !== 'neutral');
      const directionCorrect = directionalPredictions.filter(p => p.directionCorrect).length;
      const directionAccuracy = directionalPredictions.length > 0
        ? (directionCorrect / directionalPredictions.length) * 100
        : 0;
      const avgAccuracyScore = directionalPredictions.length > 0
        ? directionalPredictions.reduce((sum, p) => sum + (p.accuracyScore || 0), 0) / directionalPredictions.length
        : 0;
      const avgPriceError = predictions.reduce((sum, p) => sum + Math.abs(p.priceError || 0), 0) / verifiedPredictions;
      const withinRangeCount = predictions.filter(p => p.withinRange).length;
      const withinRangeRate = (withinRangeCount / verifiedPredictions) * 100;

      const qualityBreakdown = {
        excellent: directionalPredictions.filter(p => p.quality === 'excellent').length,
        good: directionalPredictions.filter(p => p.quality === 'good').length,
        poor: directionalPredictions.filter(p => p.quality === 'poor').length,
        failed: directionalPredictions.filter(p => p.quality === 'failed').length,
      };

      // Calcular ajuste de confianza basado en track record
      const confidenceAdjustment = this.calculateConfidenceAdjustment(
        verifiedPredictions,
        directionAccuracy,
        avgAccuracyScore,
        withinRangeRate
      );

      const isReliable = verifiedPredictions >= MIN_VERIFIED_FOR_RELIABLE;

      const trackRecord: SymbolTrackRecord = {
        symbol: symbolUpper,
        totalPredictions,
        verifiedPredictions,
        directionCorrect,
        directionAccuracy,
        avgAccuracyScore,
        avgPriceError,
        withinRangeRate,
        qualityBreakdown,
        confidenceAdjustment,
        isReliable,
        lastUpdated: new Date(),
      };

      // Cache
      trackRecordCache.set(symbolUpper, { data: trackRecord, timestamp: Date.now() });
      
      logger.debug(`[TrackRecord] ${symbol}: ${verifiedPredictions} verified, ${directionAccuracy.toFixed(1)}% direction accuracy, adjustment: ${confidenceAdjustment > 0 ? '+' : ''}${confidenceAdjustment}`);

      return trackRecord;
    } catch (error) {
      logger.error(`[TrackRecord] Error getting track record for ${symbol}:`, error);
      return null;
    }
  },

  /**
   * Calcula el ajuste de confianza basado en el historial
   * Rango: -20 a +20
   */
  calculateConfidenceAdjustment(
    verifiedCount: number,
    directionAccuracy: number,
    avgAccuracyScore: number,
    withinRangeRate: number
  ): number {
    // No ajustar si no hay suficientes datos
    if (verifiedCount < MIN_VERIFIED_FOR_ADJUSTMENT) {
      return 0;
    }

    let adjustment = 0;

    // Factor 1: Precisión de dirección (peso: 40%)
    // 50% es aleatorio, 70% es bueno, 85%+ es excelente
    if (directionAccuracy >= 80) {
      adjustment += 8; // Muy bueno
    } else if (directionAccuracy >= 70) {
      adjustment += 5;
    } else if (directionAccuracy >= 60) {
      adjustment += 2;
    } else if (directionAccuracy >= 50) {
      adjustment += 0;
    } else if (directionAccuracy >= 40) {
      adjustment -= 5;
    } else {
      adjustment -= 10; // Peor que aleatorio
    }

    // Factor 2: Score de precisión promedio (peso: 30%)
    // 0-100 donde 60+ es bueno
    if (avgAccuracyScore >= 75) {
      adjustment += 6;
    } else if (avgAccuracyScore >= 60) {
      adjustment += 3;
    } else if (avgAccuracyScore >= 45) {
      adjustment += 0;
    } else if (avgAccuracyScore >= 30) {
      adjustment -= 3;
    } else {
      adjustment -= 6;
    }

    // Factor 3: Tasa de predicción dentro del rango (peso: 30%)
    if (withinRangeRate >= 70) {
      adjustment += 6;
    } else if (withinRangeRate >= 50) {
      adjustment += 3;
    } else if (withinRangeRate >= 30) {
      adjustment += 0;
    } else {
      adjustment -= 4;
    }

    // Escalar según cantidad de datos (más datos = más confianza en el ajuste)
    const dataConfidence = Math.min(verifiedCount / 50, 1); // Máximo efecto con 50+ predicciones (antes 20)
    adjustment = Math.round(adjustment * dataConfidence);

    // SIMPLIFICADO: Limitar rango a ±10% (antes ±20%)
    // Razón: Ajustes mayores añaden ruido sin mejorar precisión
    return Math.max(-10, Math.min(10, adjustment));
  },

  /**
   * Obtiene el track record global del sistema
   */
  async getGlobalTrackRecord(): Promise<GlobalTrackRecord> {
    // Check cache
    if (globalCache && Date.now() - globalCache.timestamp < CACHE_TTL) {
      return globalCache.data;
    }

    try {
      const [totalPredictions, verifiedPredictions] = await Promise.all([
        prisma.prediction.count(),
        prisma.prediction.count({ where: { verified: true } }),
      ]);

      const verifiedData = await prisma.prediction.findMany({
        where: { verified: true },
        select: {
          directionCorrect: true,
          accuracyScore: true,
        },
      });

      const correctCount = verifiedData.filter(p => p.directionCorrect).length;
      const overallAccuracy = verifiedData.length > 0 
        ? (correctCount / verifiedData.length) * 100 
        : 0;
      const avgAccuracyScore = verifiedData.length > 0
        ? verifiedData.reduce((sum, p) => sum + (p.accuracyScore || 0), 0) / verifiedData.length
        : 0;

      // Sistema "calibrado" si tiene suficientes predicciones verificadas
      const isCalibrated = verifiedPredictions >= 30;

      const globalRecord: GlobalTrackRecord = {
        totalPredictions,
        verifiedPredictions,
        overallAccuracy,
        avgAccuracyScore,
        isCalibrated,
      };

      globalCache = { data: globalRecord, timestamp: Date.now() };
      
      return globalRecord;
    } catch (error) {
      logger.error('[TrackRecord] Error getting global track record:', error);
      return {
        totalPredictions: 0,
        verifiedPredictions: 0,
        overallAccuracy: 0,
        avgAccuracyScore: 0,
        isCalibrated: false,
      };
    }
  },

  /**
   * Obtiene ajuste de confianza para un símbolo (método rápido)
   * Retorna el ajuste directo o 0 si no hay suficientes datos
   */
  async getConfidenceAdjustment(symbol: string): Promise<number> {
    const trackRecord = await this.getSymbolTrackRecord(symbol);
    return trackRecord?.confidenceAdjustment ?? 0;
  },

  /**
   * Obtiene ajuste de confianza por DIRECCIÓN predicha
   * Basado en estadísticas históricas globales del sistema
   * NOTA: Ajuste más suave para permitir alta confianza en bajistas con señales claras
   */
  async getDirectionAdjustment(direction: 'up' | 'down' | 'neutral'): Promise<{
    confidenceMultiplier: number;
    recommendation: string;
  }> {
    try {
      // Calcular precisión histórica por dirección
      const stats = await this.getDirectionStats();
      
      if (!stats.hasEnoughData) {
        // Sin suficientes datos, NO aplicar penalización
        // El sistema debe poder expresar confianza en cualquier dirección
        return { confidenceMultiplier: 1.0, recommendation: '' };
      }

      const directionAccuracy = stats[direction];
      
      // AJUSTES MÁS SUAVES:
      // Permite alta confianza en bajistas si las señales son claras
      // Solo penaliza significativamente si el accuracy es realmente malo
      if (directionAccuracy >= 65) {
        return { 
          confidenceMultiplier: 1.05, // +5% confianza (boost suave)
          recommendation: `✅ ${direction === 'up' ? 'Alcistas' : direction === 'down' ? 'Bajistas' : 'Neutrales'} tienen ${directionAccuracy.toFixed(0)}% de acierto histórico`
        };
      } else if (directionAccuracy >= 50) {
        return { 
          confidenceMultiplier: 1.0, // Sin ajuste - accuracy aceptable
          recommendation: '' 
        };
      } else if (directionAccuracy >= 40) {
        return { 
          confidenceMultiplier: 0.95, // Solo -5% (muy suave)
          recommendation: `⚠️ ${direction === 'up' ? 'Alcistas' : direction === 'down' ? 'Bajistas' : 'Neutrales'} tienen ${directionAccuracy.toFixed(0)}% de acierto`
        };
      } else {
        return { 
          confidenceMultiplier: 0.85, // -15% máximo (antes era hasta -30%)
          recommendation: `⚠️ ${direction === 'up' ? 'Alcistas' : direction === 'down' ? 'Bajistas' : 'Neutrales'} solo ${directionAccuracy.toFixed(0)}% de acierto histórico`
        };
      }
    } catch (error) {
      logger.error('[TrackRecord] Error getting direction adjustment:', error);
      return { confidenceMultiplier: 1.0, recommendation: '' };
    }
  },

  /**
   * Obtiene estadísticas de precisión por dirección
   */
  async getDirectionStats(): Promise<{
    up: number;
    down: number;
    neutral: number;
    hasEnoughData: boolean;
  }> {
    const cacheKey = '_direction_stats';
    const cached = trackRecordCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data as any;
    }

    try {
      const predictions = await prisma.prediction.findMany({
        where: { verified: true },
        select: {
          direction: true,
          directionCorrect: true,
        },
      });

      if (predictions.length < 30) {
        return { up: 50, down: 50, neutral: 50, hasEnoughData: false };
      }

      const byDirection = {
        up: predictions.filter(p => p.direction === 'up'),
        down: predictions.filter(p => p.direction === 'down'),
        neutral: predictions.filter(p => p.direction === 'neutral'),
      };

      const stats = {
        up: byDirection.up.length > 0 
          ? (byDirection.up.filter(p => p.directionCorrect).length / byDirection.up.length) * 100 
          : 50,
        down: byDirection.down.length > 0 
          ? (byDirection.down.filter(p => p.directionCorrect).length / byDirection.down.length) * 100 
          : 50,
        neutral: byDirection.neutral.length > 0 
          ? (byDirection.neutral.filter(p => p.directionCorrect).length / byDirection.neutral.length) * 100 
          : 50,
        hasEnoughData: true,
      };

      trackRecordCache.set(cacheKey, { data: stats as any, timestamp: Date.now() });
      
      logger.debug(`[TrackRecord] Direction stats: UP=${stats.up.toFixed(1)}%, DOWN=${stats.down.toFixed(1)}%, NEUTRAL=${stats.neutral.toFixed(1)}%`);

      return stats;
    } catch (error) {
      logger.error('[TrackRecord] Error getting direction stats:', error);
      return { up: 50, down: 50, neutral: 50, hasEnoughData: false };
    }
  },

  /**
   * Limpia la cache (útil después de verificar predicciones)
   */
  clearCache(symbol?: string): void {
    if (symbol) {
      trackRecordCache.delete(symbol.toUpperCase());
    } else {
      trackRecordCache.clear();
      globalCache = null;
    }
    logger.debug(`[TrackRecord] Cache cleared${symbol ? ` for ${symbol}` : ' (all)'}`);
  },

  /**
   * Formatea el track record para mostrar al usuario
   */
  formatTrackRecord(record: SymbolTrackRecord): string {
    const reliabilityIcon = record.isReliable ? '✓' : '⚠️';
    const adjustmentSign = record.confidenceAdjustment > 0 ? '+' : '';
    
    return `${record.symbol} Track Record ${reliabilityIcon}\n` +
           `├─ Predicciones: ${record.verifiedPredictions}/${record.totalPredictions} verificadas\n` +
           `├─ Dirección: ${record.directionAccuracy.toFixed(1)}% correcta\n` +
           `├─ Score promedio: ${record.avgAccuracyScore.toFixed(1)}/100\n` +
           `├─ Dentro del rango: ${record.withinRangeRate.toFixed(1)}%\n` +
           `└─ Ajuste de confianza: ${adjustmentSign}${record.confidenceAdjustment}%`;
  },
};
