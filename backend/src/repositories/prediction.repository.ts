import { Prediction } from '@prisma/client';
import { prisma } from '../config/database.js';

export interface CreatePredictionData {
  symbol: string;
  asset?: string;
  assetType: string;
  timeframe: string;
  direction: string;
  predictedChange: number;
  confidence: number;
  currentPrice: number;
  predictedPriceMin?: number;
  predictedPriceMax?: number;
  currency?: string;
  factorBreakdown?: any;
  sentiment?: any;
  historical?: any;
  technical?: any;
  news?: any;
  macro?: any;
}

export const predictionRepository = {
  /**
   * Crear una nueva predicción
   */
  async create(data: CreatePredictionData): Promise<Prediction> {
    // Calcular target price y fecha de expiración
    const targetPrice = data.predictedPriceMax || 
      data.currentPrice * (1 + data.predictedChange / 100);
    
    const expiresAt = new Date();
    const days = data.timeframe.includes('día') ? 1 : 
                 data.timeframe.includes('días') ? parseInt(data.timeframe) || 7 : 
                 data.timeframe.includes('semana') ? 7 : 1;
    expiresAt.setDate(expiresAt.getDate() + days);

    return prisma.prediction.create({
      data: {
        symbol: data.symbol,
        assetType: data.assetType,
        timeframe: data.timeframe,
        direction: data.direction,
        predictedChange: data.predictedChange,
        confidence: data.confidence,
        currentPrice: data.currentPrice,
        targetPrice,
        predictedPriceMin: data.predictedPriceMin,
        predictedPriceMax: data.predictedPriceMax,
        expiresAt,
        factorBreakdown: data.factorBreakdown ? JSON.stringify(data.factorBreakdown) : null,
        reasoning: data.sentiment ? JSON.stringify({
          sentiment: data.sentiment,
          historical: data.historical,
          technical: data.technical,
          news: data.news,
          macro: data.macro,
        }) : null,
      },
    });
  },

  /**
   * Obtener predicción por ID
   */
  async findById(id: string): Promise<Prediction | null> {
    return prisma.prediction.findUnique({ where: { id } });
  },

  /**
   * Obtener predicciones por símbolo
   */
  async findBySymbol(symbol: string, limit = 10): Promise<Prediction[]> {
    return prisma.prediction.findMany({
      where: { symbol },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  },

  /**
   * Obtener predicciones pendientes de verificar
   */
  async findPendingVerification(): Promise<Prediction[]> {
    return prisma.prediction.findMany({
      where: {
        verified: false,
        expiresAt: { lte: new Date() },
      },
      orderBy: { expiresAt: 'asc' },
    });
  },

  /**
   * Obtener predicciones verificadas para entrenamiento
   */
  async findVerified(limit = 100): Promise<Prediction[]> {
    return prisma.prediction.findMany({
      where: { verified: true },
      orderBy: { verifiedAt: 'desc' },
      take: limit,
    });
  },

  /**
   * Verificar una predicción con resultado real
   */
  async verify(
    id: string,
    actualPrice: number,
    actualChange: number,
    directionCorrect: boolean,
    accuracyScore: number
  ): Promise<Prediction> {
    return prisma.prediction.update({
      where: { id },
      data: {
        verified: true,
        verifiedAt: new Date(),
        actualPrice,
        actualChange,
        directionCorrect,
        accuracyScore,
      },
    });
  },

  /**
   * Obtener estadísticas de predicciones
   */
  async getStats(): Promise<{
    total: number;
    verified: number;
    correctDirection: number;
    avgAccuracy: number;
  }> {
    const [total, verified, stats] = await Promise.all([
      prisma.prediction.count(),
      prisma.prediction.count({ where: { verified: true } }),
      prisma.prediction.aggregate({
        where: { verified: true },
        _avg: { accuracyScore: true },
        _count: { directionCorrect: true },
      }),
    ]);

    const correctDirection = await prisma.prediction.count({
      where: { verified: true, directionCorrect: true },
    });

    return {
      total,
      verified,
      correctDirection,
      avgAccuracy: stats._avg.accuracyScore || 0,
    };
  },

  /**
   * Eliminar predicciones antiguas
   */
  async deleteOld(olderThan: Date): Promise<number> {
    const result = await prisma.prediction.deleteMany({
      where: {
        createdAt: { lt: olderThan },
        verified: true,
      },
    });
    return result.count;
  },
};
