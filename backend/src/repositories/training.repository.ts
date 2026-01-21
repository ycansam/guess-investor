import { AssetAdjustment, ConfidenceCalibration, LearnedWeights, TrainingCache } from '@prisma/client';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { prisma } from '../config/database.js';

// Ruta al archivo JSON de pesos (única fuente de verdad)
const WEIGHTS_FILE = resolve(process.cwd(), '../code/config/learned_weights.json');

// ============================================================================
// TIPOS
// ============================================================================

export interface TrainingCacheData {
  symbol: string;
  timeframe: string;
  predictedChange: number;
  confidence: number;
  direction: string;
  currentPrice: number;
  targetPrice: number;
  currency?: string;
  analysisData?: any;
  expiresAt: Date;
}

export interface TrainingStats {
  totalCached: number;
  byTimeframe: {
    intraday: number;
    swing: number;
    longterm: number;
  };
  learnedWeights: LearnedWeights | null;
  assetAdjustments: number;
  calibrationData: ConfidenceCalibration | null;
}

// ============================================================================
// REPOSITORIO
// ============================================================================

export const trainingRepository = {
  // -------------------------------------------------------------------------
  // TRAINING CACHE
  // -------------------------------------------------------------------------

  /**
   * Guardar predicción en cache de training
   */
  async saveToCache(data: TrainingCacheData): Promise<TrainingCache> {
    return prisma.trainingCache.upsert({
      where: {
        symbol_timeframe: {
          symbol: data.symbol.toUpperCase(),
          timeframe: data.timeframe,
        },
      },
      create: {
        symbol: data.symbol.toUpperCase(),
        timeframe: data.timeframe,
        predictedChange: data.predictedChange,
        confidence: data.confidence,
        direction: data.direction,
        currentPrice: data.currentPrice,
        targetPrice: data.targetPrice,
        currency: data.currency,
        analysisData: data.analysisData ? JSON.stringify(data.analysisData) : null,
        expiresAt: data.expiresAt,
      },
      update: {
        predictedChange: data.predictedChange,
        confidence: data.confidence,
        direction: data.direction,
        currentPrice: data.currentPrice,
        targetPrice: data.targetPrice,
        currency: data.currency,
        analysisData: data.analysisData ? JSON.stringify(data.analysisData) : null,
        expiresAt: data.expiresAt,
      },
    });
  },

  /**
   * Obtener cache por símbolo y timeframe
   */
  async getFromCache(symbol: string, timeframe: string): Promise<TrainingCache | null> {
    const cached = await prisma.trainingCache.findUnique({
      where: {
        symbol_timeframe: {
          symbol: symbol.toUpperCase(),
          timeframe,
        },
      },
    });

    // Verificar expiración
    if (cached && new Date() > cached.expiresAt) {
      await prisma.trainingCache.delete({
        where: { id: cached.id },
      });
      return null;
    }

    return cached;
  },

  /**
   * Obtener todo el cache activo
   */
  async getAllActiveCache(): Promise<TrainingCache[]> {
    const now = new Date();
    return prisma.trainingCache.findMany({
      where: {
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Obtener cache por símbolo
   */
  async getCacheBySymbol(symbol: string): Promise<TrainingCache[]> {
    const now = new Date();
    return prisma.trainingCache.findMany({
      where: {
        symbol: symbol.toUpperCase(),
        expiresAt: { gt: now },
      },
    });
  },

  /**
   * Limpiar cache expirado
   */
  async cleanupExpiredCache(): Promise<number> {
    const result = await prisma.trainingCache.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });
    return result.count;
  },

  /**
   * Eliminar cache por símbolo y timeframe
   */
  async deleteFromCache(symbol: string, timeframe: string): Promise<boolean> {
    // Usar deleteMany en lugar de delete para evitar errores si no existe
    const result = await prisma.trainingCache.deleteMany({
      where: {
        symbol: symbol.toUpperCase(),
        timeframe,
      },
    });
    return result.count > 0;
  },

  /**
   * Borrar TODO el cache
   */
  async clearAllCache(): Promise<number> {
    const result = await prisma.trainingCache.deleteMany({});
    return result.count;
  },

  /**
   * Importar múltiples predicciones al cache
   */
  async importBatch(predictions: TrainingCacheData[]): Promise<{ imported: number; errors: string[] }> {
    let imported = 0;
    const errors: string[] = [];

    for (const pred of predictions) {
      try {
        await this.saveToCache(pred);
        imported++;
      } catch (error: any) {
        errors.push(`${pred.symbol}: ${error.message}`);
      }
    }

    return { imported, errors };
  },

  // -------------------------------------------------------------------------
  // LEARNED WEIGHTS
  // -------------------------------------------------------------------------

  /**
   * Obtener pesos aprendidos actuales (lee del archivo JSON)
   */
  async getLearnedWeights(): Promise<LearnedWeights | null> {
    try {
      if (!existsSync(WEIGHTS_FILE)) {
        return null;
      }
      const content = readFileSync(WEIGHTS_FILE, 'utf-8');
      const data = JSON.parse(content);
      
      // Usar swing como balance entre timeframes
      const swingWeights = data.weights?.swing || {};
      
      // Devolver formato compatible con LearnedWeights de Prisma
      return {
        id: 'file-based',
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
        version: parseInt(data.version) || 1,
        trainedAt: new Date(data.updated_at || Date.now()),
        sampleCount: data.training_samples || 0,
        accuracy: data.metadata?.final_loss 
          ? Math.round((1 - data.metadata.final_loss) * 100) 
          : null,
      } as LearnedWeights;
    } catch (error) {
      console.error('[TrainingRepository] Error reading weights file:', error);
      return null;
    }
  },

  /**
   * Guardar nuevos pesos aprendidos
   * NOTA: Esta función ya no guarda en DB. Python escribe directamente al archivo JSON.
   * Se mantiene por compatibilidad pero devuelve los pesos actuales del archivo.
   */
  async saveLearnedWeights(_weights: {
    trend: number;
    technical: number;
    sentiment: number;
    news: number;
    macro: number;
    competitors: number;
    forex: number;
    institutional: number;
    seasonality: number;
    financials: number;
    expectations: number;
    sampleCount: number;
    accuracy?: number;
  }): Promise<LearnedWeights> {
    // Los pesos se gestionan mediante Python que escribe al archivo JSON
    // Retornamos los pesos actuales del archivo
    const current = await this.getLearnedWeights();
    if (!current) {
      throw new Error('No weights file available. Train with Python first.');
    }
    return current;
  },

  // -------------------------------------------------------------------------
  // ASSET ADJUSTMENTS
  // -------------------------------------------------------------------------

  /**
   * Obtener ajuste de activo
   */
  async getAssetAdjustment(symbol: string): Promise<AssetAdjustment | null> {
    return prisma.assetAdjustment.findUnique({
      where: { symbol: symbol.toUpperCase() },
    });
  },

  /**
   * Obtener todos los ajustes
   */
  async getAllAssetAdjustments(): Promise<AssetAdjustment[]> {
    return prisma.assetAdjustment.findMany({
      orderBy: { symbol: 'asc' },
    });
  },

  /**
   * Guardar/actualizar ajuste de activo
   */
  async saveAssetAdjustment(data: {
    symbol: string;
    magnitudeScale?: number;
    directionalBias?: number;
    confidenceScale?: number;
    avgError?: number;
    avgAbsError?: number;
    avgPredictedChange?: number;
    avgActualChange?: number;
    hitRate?: number;
    sampleCount?: number;
    reason?: string;
  }): Promise<AssetAdjustment> {
    return prisma.assetAdjustment.upsert({
      where: { symbol: data.symbol.toUpperCase() },
      create: {
        symbol: data.symbol.toUpperCase(),
        magnitudeScale: data.magnitudeScale ?? 1.0,
        directionalBias: data.directionalBias ?? 0.0,
        confidenceScale: data.confidenceScale ?? 1.0,
        avgError: data.avgError ?? 0.0,
        avgAbsError: data.avgAbsError ?? 0.0,
        avgPredictedChange: data.avgPredictedChange ?? 0.0,
        avgActualChange: data.avgActualChange ?? 0.0,
        hitRate: data.hitRate ?? 0.0,
        sampleCount: data.sampleCount ?? 0,
        reason: data.reason ?? 'auto_learned',
      },
      update: {
        magnitudeScale: data.magnitudeScale,
        directionalBias: data.directionalBias,
        confidenceScale: data.confidenceScale,
        avgError: data.avgError,
        avgAbsError: data.avgAbsError,
        avgPredictedChange: data.avgPredictedChange,
        avgActualChange: data.avgActualChange,
        hitRate: data.hitRate,
        sampleCount: data.sampleCount,
        reason: data.reason,
      },
    });
  },

  // -------------------------------------------------------------------------
  // CONFIDENCE CALIBRATION
  // -------------------------------------------------------------------------

  /**
   * Obtener calibración actual
   */
  async getCalibration(): Promise<ConfidenceCalibration | null> {
    return prisma.confidenceCalibration.findFirst({
      orderBy: { trainedAt: 'desc' },
    });
  },

  /**
   * Guardar nueva calibración
   */
  async saveCalibration(data: {
    calibrationBins: any[];
    slope: number;
    intercept: number;
    sampleCount: number;
  }): Promise<ConfidenceCalibration> {
    return prisma.confidenceCalibration.create({
      data: {
        calibrationBins: JSON.stringify(data.calibrationBins),
        slope: data.slope,
        intercept: data.intercept,
        sampleCount: data.sampleCount,
      },
    });
  },

  // -------------------------------------------------------------------------
  // ESTADÍSTICAS
  // -------------------------------------------------------------------------

  /**
   * Obtener estadísticas de training
   */
  async getStats(): Promise<TrainingStats> {
    const [
      allCache,
      learnedWeights,
      assetAdjustments,
      calibration,
    ] = await Promise.all([
      this.getAllActiveCache(),
      this.getLearnedWeights(),
      prisma.assetAdjustment.count(),
      this.getCalibration(),
    ]);

    return {
      totalCached: allCache.length,
      byTimeframe: {
        intraday: allCache.filter(c => c.timeframe === 'intraday').length,
        swing: allCache.filter(c => c.timeframe === 'swing').length,
        longterm: allCache.filter(c => c.timeframe === 'longterm').length,
      },
      learnedWeights,
      assetAdjustments,
      calibrationData: calibration,
    };
  },
};
