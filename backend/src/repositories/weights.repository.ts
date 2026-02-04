import { AssetAdjustment } from '@prisma/client';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { prisma } from '../config/database.js';
import { Weights } from '../models/index.js';

// Ruta al archivo JSON de pesos (única fuente de verdad)
const WEIGHTS_FILE = resolve(process.cwd(), '../code/config/learned_weights.json');

// Interfaz del archivo JSON que escribe Python
interface LearnedWeightsJson {
  version: string;
  updated_at: string;
  training_samples: number;
  weights: {
    intraday: Record<string, number>;
    swing: Record<string, number>;
    long: Record<string, number>;
  };
  metadata?: {
    learning_rate?: number;
    momentum?: number;
    final_loss?: number;
  };
}

// Pesos por defecto (10 factores - competitors eliminado)
const DEFAULT_WEIGHTS: Weights = {
  trend: 0.10,
  technical: 0.10,
  sentiment: 0.10,
  news: 0.10,
  macro: 0.10,
  forex: 0.10,
  institutional: 0.10,
  seasonality: 0.10,
  financials: 0.10,
  expectations: 0.10,
};

// Pesos por defecto por timeframe (usados si no hay archivo)
const DEFAULT_TIMEFRAME_WEIGHTS = {
  intraday: {
    trend: 0.22, technical: 0.27, sentiment: 0.16, news: 0.18, macro: 0.04,
    forex: 0.04, institutional: 0.05, seasonality: 0.02,
    financials: 0.01, expectations: 0.01
  },
  swing: {
    trend: 0.14, technical: 0.20, sentiment: 0.11, news: 0.15, macro: 0.09,
    forex: 0.06, institutional: 0.11, seasonality: 0.04,
    financials: 0.05, expectations: 0.05
  },
  long: {
    trend: 0.06, technical: 0.09, sentiment: 0.05, news: 0.09, macro: 0.14,
    forex: 0.09, institutional: 0.14, seasonality: 0.08,
    financials: 0.14, expectations: 0.12
  }
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
  updatedAt?: string;
}

/**
 * Lee los pesos del archivo JSON
 */
function readWeightsFile(): LearnedWeightsJson | null {
  try {
    if (!existsSync(WEIGHTS_FILE)) {
      return null;
    }
    const content = readFileSync(WEIGHTS_FILE, 'utf-8');
    return JSON.parse(content) as LearnedWeightsJson;
  } catch (error) {
    console.error('[WeightsRepository] Error reading weights file:', error);
    return null;
  }
}

export const weightsRepository = {
  /**
   * Obtener los pesos actuales en formato extendido (lee del archivo JSON)
   */
  async getCurrent(): Promise<LearnedWeightsExtended> {
    const fileData = readWeightsFile();

    if (!fileData || fileData.training_samples === 0) {
      return {
        weights: DEFAULT_TIMEFRAME_WEIGHTS,
        trainingSamples: 0,
        accuracy: null,
      };
    }

    return {
      weights: fileData.weights,
      trainingSamples: fileData.training_samples,
      accuracy: fileData.metadata?.final_loss 
        ? Math.round((1 - fileData.metadata.final_loss) * 100) 
        : null,
      updatedAt: fileData.updated_at,
    };
  },

  /**
   * Obtener pesos raw (formato plano, usa swing como default)
   */
  async getRaw(): Promise<Weights> {
    const fileData = readWeightsFile();

    if (!fileData) {
      return DEFAULT_WEIGHTS;
    }

    // Usar swing como balance entre corto y largo plazo
    const swingWeights = fileData.weights.swing;

    return {
      trend: swingWeights.trend || DEFAULT_WEIGHTS.trend,
      technical: swingWeights.technical || DEFAULT_WEIGHTS.technical,
      sentiment: swingWeights.sentiment || DEFAULT_WEIGHTS.sentiment,
      news: swingWeights.news || DEFAULT_WEIGHTS.news,
      macro: swingWeights.macro || DEFAULT_WEIGHTS.macro,
      forex: swingWeights.forex || DEFAULT_WEIGHTS.forex,
      institutional: swingWeights.institutional || DEFAULT_WEIGHTS.institutional,
      seasonality: swingWeights.seasonality || DEFAULT_WEIGHTS.seasonality,
      financials: swingWeights.financials || DEFAULT_WEIGHTS.financials,
      expectations: swingWeights.expectations || DEFAULT_WEIGHTS.expectations,
    };
  },

  /**
   * Obtener info del archivo de pesos
   */
  async getInfo(): Promise<{
    exists: boolean;
    path: string;
    trainingSamples: number;
    version: string;
    updatedAt: string | null;
  }> {
    const fileData = readWeightsFile();
    return {
      exists: fileData !== null,
      path: WEIGHTS_FILE,
      trainingSamples: fileData?.training_samples || 0,
      version: fileData?.version || '0',
      updatedAt: fileData?.updated_at || null,
    };
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
