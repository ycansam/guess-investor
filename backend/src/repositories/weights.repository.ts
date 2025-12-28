import { AssetAdjustment, LearnedWeights } from '@prisma/client';
import { prisma } from '../config/database.js';
import { Weights } from '../models/index.js';

// Pesos por defecto (11 factores, igual peso)
const DEFAULT_WEIGHTS: Weights = {
  trend: 0.091,
  technical: 0.091,
  sentiment: 0.091,
  news: 0.091,
  macro: 0.091,
  competitors: 0.091,
  forex: 0.091,
  institutional: 0.091,
  seasonality: 0.091,
  financials: 0.091,
  expectations: 0.091,
};

// Formato extendido para el calculator
export interface LearnedWeightsExtended {
  weights: {
    intraday: Record<string, number>;
    swing: Record<string, number>;
    long: Record<string, number>;
  } | null;
  trainingSamples: number;
  accuracy: number | null;
}

export const weightsRepository = {
  /**
   * Obtener los pesos actuales en formato extendido
   */
  async getCurrent(): Promise<LearnedWeightsExtended> {
    const latest = await prisma.learnedWeights.findFirst({
      orderBy: { version: 'desc' },
    });

    if (!latest || latest.sampleCount === 0) {
      return {
        weights: null,
        trainingSamples: 0,
        accuracy: null,
      };
    }

    // Convertir a formato con timeframes
    const baseWeights = {
      trend: latest.trend,
      technical: latest.technical,
      sentiment: latest.sentiment,
      news: latest.news,
      macro: latest.macro,
    };

    return {
      weights: {
        intraday: { ...baseWeights },
        swing: { ...baseWeights },
        long: { ...baseWeights },
      },
      trainingSamples: latest.sampleCount,
      accuracy: latest.accuracy,
    };
  },

  /**
   * Obtener pesos raw
   */
  async getRaw(): Promise<Weights> {
    const latest = await prisma.learnedWeights.findFirst({
      orderBy: { version: 'desc' },
    });

    if (!latest) {
      return DEFAULT_WEIGHTS;
    }

    return {
      trend: latest.trend,
      technical: latest.technical,
      sentiment: latest.sentiment,
      news: latest.news,
      macro: latest.macro,
      competitors: latest.competitors,
      forex: latest.forex,
      institutional: latest.institutional,
      seasonality: latest.seasonality,
      financials: latest.financials,
      expectations: latest.expectations,
    };
  },

  /**
   * Guardar nuevos pesos (crea nueva versión)
   */
  async save(weights: Weights, sampleCount: number, accuracy?: number): Promise<LearnedWeights> {
    const latest = await prisma.learnedWeights.findFirst({
      orderBy: { version: 'desc' },
    });
    
    const nextVersion = (latest?.version || 0) + 1;

    return prisma.learnedWeights.create({
      data: {
        ...weights,
        version: nextVersion,
        sampleCount,
        accuracy,
      },
    });
  },

  /**
   * Obtener historial de pesos
   */
  async getHistory(limit = 10): Promise<LearnedWeights[]> {
    return prisma.learnedWeights.findMany({
      orderBy: { version: 'desc' },
      take: limit,
    });
  },
};

// Ajustes predefinidos para activos problemáticos
const PREDEFINED_ADJUSTMENTS: Record<string, Partial<AssetAdjustment>> = {
  'TSLA': { magnitudeScale: 0.55, directionalBias: -0.005, confidenceScale: 0.85 },
  'NVDA': { magnitudeScale: 0.60, directionalBias: -0.003, confidenceScale: 0.88 },
  'AMD': { magnitudeScale: 0.65, directionalBias: -0.002, confidenceScale: 0.90 },
  'BTC-USD': { magnitudeScale: 0.70, directionalBias: 0, confidenceScale: 0.80 },
  'ETH-USD': { magnitudeScale: 0.70, directionalBias: 0, confidenceScale: 0.82 },
  'GME': { magnitudeScale: 0.50, directionalBias: 0, confidenceScale: 0.70 },
  'AMC': { magnitudeScale: 0.50, directionalBias: 0, confidenceScale: 0.70 },
  'PLTR': { magnitudeScale: 0.60, directionalBias: -0.002, confidenceScale: 0.85 },
  'COIN': { magnitudeScale: 0.60, directionalBias: -0.002, confidenceScale: 0.80 },
  'MSTR': { magnitudeScale: 0.55, directionalBias: 0, confidenceScale: 0.75 },
};

export const assetAdjustmentRepository = {
  /**
   * Obtener ajuste para un activo
   */
  async getAdjustment(symbol: string): Promise<{
    magnitudeScale: number;
    directionalBias: number;
    confidenceScale: number;
  }> {
    // Primero buscar en DB
    const saved = await prisma.assetAdjustment.findUnique({
      where: { symbol },
    });

    if (saved) {
      return {
        magnitudeScale: saved.magnitudeScale,
        directionalBias: saved.directionalBias,
        confidenceScale: saved.confidenceScale,
      };
    }

    // Si no está en DB, buscar en predefinidos
    const predefined = PREDEFINED_ADJUSTMENTS[symbol];
    if (predefined) {
      return {
        magnitudeScale: predefined.magnitudeScale || 1.0,
        directionalBias: predefined.directionalBias || 0,
        confidenceScale: predefined.confidenceScale || 1.0,
      };
    }

    // Default: sin ajuste
    return {
      magnitudeScale: 1.0,
      directionalBias: 0,
      confidenceScale: 1.0,
    };
  },

  /**
   * Actualizar ajuste aprendido
   */
  async updateFromVerification(
    symbol: string,
    predictedChange: number,
    actualChange: number,
    directionCorrect: boolean = false
  ): Promise<void> {
    const error = predictedChange - actualChange;
    const absError = Math.abs(error);

    const existing = await prisma.assetAdjustment.findUnique({
      where: { symbol },
    });

    if (existing) {
      // EMA para suavizar
      const alpha = 0.2;
      const newAvgError = existing.avgError * (1 - alpha) + error * alpha;
      const newAvgAbsError = existing.avgAbsError * (1 - alpha) + absError * alpha;
      const newAvgPredicted = existing.avgPredictedChange * (1 - alpha) + predictedChange * alpha;
      const newAvgActual = existing.avgActualChange * (1 - alpha) + actualChange * alpha;
      const newHitRate = existing.hitRate * (1 - alpha) + (directionCorrect ? 1 : 0) * alpha;

      await prisma.assetAdjustment.update({
        where: { symbol },
        data: {
          avgError: newAvgError,
          avgAbsError: newAvgAbsError,
          avgPredictedChange: newAvgPredicted,
          avgActualChange: newAvgActual,
          hitRate: newHitRate,
          sampleCount: existing.sampleCount + 1,
          reason: 'auto_learned',
        },
      });
    } else {
      await prisma.assetAdjustment.create({
        data: {
          symbol,
          avgError: error,
          avgAbsError: absError,
          avgPredictedChange: predictedChange,
          avgActualChange: actualChange,
          hitRate: directionCorrect ? 1 : 0,
          sampleCount: 1,
          reason: 'auto_learned',
        },
      });
    }
  },

  /**
   * Establecer ajuste manual
   */
  async setManual(
    symbol: string,
    magnitudeScale: number,
    directionalBias: number,
    confidenceScale: number
  ): Promise<AssetAdjustment> {
    return prisma.assetAdjustment.upsert({
      where: { symbol },
      create: {
        symbol,
        magnitudeScale,
        directionalBias,
        confidenceScale,
        reason: 'manual',
      },
      update: {
        magnitudeScale,
        directionalBias,
        confidenceScale,
        reason: 'manual',
      },
    });
  },
};
