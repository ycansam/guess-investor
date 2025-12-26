import { Request, Response } from 'express';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-handler.js';
import { CreatePredictionRequestSchema } from '../models/index.js';
import { predictionRepository } from '../repositories/prediction.repository.js';
import { predictionCalculatorService } from '../services/prediction/calculator.service.js';

export const predictionController = {
  /**
   * POST /api/predictions
   * Crear nueva predicción usando el calculador completo
   */
  create: asyncHandler(async (req: Request, res: Response) => {
    const parsed = CreatePredictionRequestSchema.safeParse(req.body);
    
    if (!parsed.success) {
      throw BadRequestError('Invalid request body');
    }

    const { symbol, days } = parsed.data;
    const type = symbol.includes('-USD') || symbol.includes('-EUR') ? 'crypto' : 'stock';

    // Usar el calculador de predicciones completo
    const prediction = await predictionCalculatorService.calculatePrediction(
      symbol.toUpperCase(),
      type as 'stock' | 'crypto',
      days || 1
    );

    if (!prediction) {
      throw NotFoundError(`Could not calculate prediction for ${symbol}`);
    }

    // Guardar en base de datos
    const saved = await predictionCalculatorService.savePrediction(prediction);

    res.status(201).json({
      success: true,
      data: {
        id: saved.id,
        ...prediction,
      },
    });
  }),

  /**
   * POST /api/predictions/calculate
   * Solo calcular sin guardar (para preview)
   */
  calculate: asyncHandler(async (req: Request, res: Response) => {
    const { symbol, days = 1 } = req.body;
    
    if (!symbol) {
      throw BadRequestError('Symbol is required');
    }

    const type = symbol.includes('-USD') || symbol.includes('-EUR') ? 'crypto' : 'stock';

    const prediction = await predictionCalculatorService.calculatePrediction(
      symbol.toUpperCase(),
      type as 'stock' | 'crypto',
      days
    );

    if (!prediction) {
      throw NotFoundError(`Could not calculate prediction for ${symbol}`);
    }

    res.json({
      success: true,
      data: prediction,
    });
  }),

  /**
   * GET /api/predictions/:id
   * Obtener predicción por ID
   */
  getById: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    
    const prediction = await predictionRepository.findById(id);
    
    if (!prediction) {
      throw NotFoundError(`Prediction ${id}`);
    }

    res.json({
      success: true,
      data: {
        ...prediction,
        createdAt: prediction.createdAt.toISOString(),
        expiresAt: prediction.expiresAt.toISOString(),
        verifiedAt: prediction.verifiedAt?.toISOString(),
        factorBreakdown: prediction.factorBreakdown 
          ? JSON.parse(prediction.factorBreakdown) 
          : null,
      },
    });
  }),

  /**
   * GET /api/predictions/symbol/:symbol
   * Obtener predicciones por símbolo
   */
  getBySymbol: asyncHandler(async (req: Request, res: Response) => {
    const { symbol } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;
    
    const predictions = await predictionRepository.findBySymbol(
      symbol.toUpperCase(),
      limit
    );

    res.json({
      success: true,
      data: predictions.map(p => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
        expiresAt: p.expiresAt.toISOString(),
        verifiedAt: p.verifiedAt?.toISOString(),
      })),
    });
  }),

  /**
   * GET /api/predictions/pending
   * Obtener predicciones pendientes de verificar
   */
  getPending: asyncHandler(async (_req: Request, res: Response) => {
    const predictions = await predictionRepository.findPendingVerification();

    res.json({
      success: true,
      data: predictions.map(p => ({
        id: p.id,
        symbol: p.symbol,
        direction: p.direction,
        predictedChange: p.predictedChange,
        currentPrice: p.currentPrice,
        targetPrice: p.targetPrice,
        expiresAt: p.expiresAt.toISOString(),
      })),
    });
  }),

  /**
   * POST /api/predictions/:id/verify
   * Verificar predicción
   */
  verify: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { actualPrice } = req.body;

    if (typeof actualPrice !== 'number' || actualPrice <= 0) {
      throw BadRequestError('actualPrice must be a positive number');
    }

    const prediction = await predictionRepository.findById(id);
    if (!prediction) {
      throw NotFoundError(`Prediction ${id}`);
    }

    if (prediction.verified) {
      throw BadRequestError('Prediction already verified');
    }

    // Calcular resultados
    const actualChange = ((actualPrice - prediction.currentPrice) / prediction.currentPrice) * 100;
    const directionCorrect = 
      (prediction.direction === 'up' && actualChange > 0) ||
      (prediction.direction === 'down' && actualChange < 0);

    // Accuracy score (100 si perfecta, menos según error)
    const error = Math.abs(actualChange - prediction.predictedChange);
    const accuracyScore = Math.max(0, 100 - error * 10);

    // Actualizar predicción
    const verified = await predictionRepository.verify(
      id,
      actualPrice,
      actualChange,
      directionCorrect,
      accuracyScore
    );

    // TODO: Crear assetAdjustmentRepository e implementar aprendizaje
    // await assetAdjustmentRepository.updateFromVerification(
    //   prediction.symbol,
    //   prediction.predictedChange,
    //   actualChange
    // );

    res.json({
      success: true,
      data: {
        predictionId: verified.id,
        directionCorrect,
        actualChange,
        predictedChange: prediction.predictedChange,
        accuracyScore,
      },
    });
  }),

  /**
   * GET /api/predictions/stats
   * Obtener estadísticas
   */
  getStats: asyncHandler(async (_req: Request, res: Response) => {
    const stats = await predictionRepository.getStats();

    res.json({
      success: true,
      data: {
        ...stats,
        directionAccuracy: stats.verified > 0 
          ? (stats.correctDirection / stats.verified) * 100 
          : 0,
      },
    });
  }),
};
