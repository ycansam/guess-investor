import { Request, Response } from 'express';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-handler.js';
import { CreatePredictionRequestSchema } from '../models/index.js';
import { predictionRepository, VerifyPredictionData } from '../repositories/prediction.repository.js';
import { pythonTrainingService } from '../services/external/python-training.service.js';
import { yahooService } from '../services/external/yahoo.service.js';
import { predictionCalculatorService } from '../services/prediction/calculator.service.js';
import { trackRecordService } from '../services/prediction/track-record.service.js';

export const predictionController = {
  /**
   * POST /api/predictions
   * Crear nueva predicción usando el calculador completo y guardarla
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
   * POST /api/predictions/track
   * Registrar una predicción para tracking (desde el frontend)
   * Evita duplicados: si ya existe una predicción reciente para el mismo symbol+timeframeDays, la retorna
   */
  track: asyncHandler(async (req: Request, res: Response) => {
    const {
      symbol,
      asset,
      assetType,
      timeframe,
      timeframeDays,
      direction,
      predictedChange,
      confidence,
      currentPrice,
      predictedPriceMin,
      predictedPriceMax,
      volatility,
      volatilityCategory,
      factorBreakdown,
      factorWeights,
      uncertaintyScore,
      uncertaintyData,
    } = req.body;

    if (!symbol || !direction || currentPrice === undefined) {
      throw BadRequestError('symbol, direction and currentPrice are required');
    }

    const normalizedSymbol = symbol.toUpperCase();
    const days = timeframeDays || 1;

    // Verificar si ya existe una predicción reciente para evitar duplicados
    const existing = await predictionRepository.findRecentDuplicate(normalizedSymbol, days);
    if (existing) {
      console.log(`[PredictionController] Predicción duplicada detectada para ${normalizedSymbol} ${days}d, retornando existente`);
      res.status(200).json({
        success: true,
        duplicate: true,
        data: {
          id: existing.id,
          symbol: existing.symbol,
          direction: existing.direction,
          expiresAt: existing.expiresAt.toISOString(),
        },
      });
      return;
    }

    const saved = await predictionRepository.create({
      symbol: normalizedSymbol,
      asset,
      assetType: assetType || 'stock',
      timeframe: timeframe || '1 día',
      timeframeDays: days,
      direction,
      predictedChange: predictedChange || 0,
      confidence: confidence || 50,
      currentPrice,
      predictedPriceMin,
      predictedPriceMax,
      volatility,
      volatilityCategory,
      factorBreakdown,
      factorWeights,
      uncertaintyScore,
      uncertaintyData,
    });

    res.status(201).json({
      success: true,
      data: {
        id: saved.id,
        symbol: saved.symbol,
        direction: saved.direction,
        expiresAt: saved.expiresAt.toISOString(),
      },
    });
  }),

  /**
   * GET /api/predictions
   * Obtener todas las predicciones con filtros
   */
  getAll: asyncHandler(async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const verified = req.query.verified === 'true' ? true : 
                    req.query.verified === 'false' ? false : undefined;
    const symbol = req.query.symbol as string;

    const { predictions, total } = await predictionRepository.findAll({
      limit,
      offset,
      verified,
      symbol,
    });

    res.json({
      success: true,
      data: predictions.map(p => formatPrediction(p)),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + predictions.length < total,
      },
    });
  }),

  /**
   * GET /api/predictions/active
   * Obtener predicciones activas (no expiradas)
   */
  getActive: asyncHandler(async (_req: Request, res: Response) => {
    const predictions = await predictionRepository.findActive();

    res.json({
      success: true,
      data: predictions.map(p => formatPrediction(p)),
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
      data: predictions.map(p => formatPrediction(p)),
    });
  }),

  /**
   * GET /api/predictions/verified
   * Obtener predicciones verificadas
   */
  getVerified: asyncHandler(async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const predictions = await predictionRepository.findVerified(limit);

    res.json({
      success: true,
      data: predictions.map(p => formatPrediction(p)),
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
      data: predictions.map(p => formatPrediction(p)),
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
      data: formatPrediction(prediction),
    });
  }),

  /**
   * POST /api/predictions/:id/verify
   * Verificar predicción con precio actual
   */
  verify: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    let { actualPrice } = req.body;

    const prediction = await predictionRepository.findById(id);
    if (!prediction) {
      throw NotFoundError(`Prediction ${id}`);
    }

    if (prediction.verified) {
      throw BadRequestError('Prediction already verified');
    }

    // Si no se proporciona precio, obtenerlo de Yahoo
    if (actualPrice === undefined) {
      try {
        const quote = await yahooService.getQuote(prediction.symbol);
        if (!quote) {
          throw BadRequestError('Could not fetch current price. Please provide actualPrice.');
        }
        actualPrice = quote.price;
      } catch (error) {
        throw BadRequestError('Could not fetch current price. Please provide actualPrice.');
      }
    }

    if (typeof actualPrice !== 'number' || actualPrice <= 0) {
      throw BadRequestError('actualPrice must be a positive number');
    }

    // Calcular resultados
    const actualChange = ((actualPrice - prediction.currentPrice) / prediction.currentPrice) * 100;
    const actualDirection: 'up' | 'down' | 'neutral' = 
      actualChange > 0.5 ? 'up' : 
      actualChange < -0.5 ? 'down' : 'neutral';
    
    const directionCorrect = prediction.direction === actualDirection ||
      (prediction.direction !== 'neutral' && actualDirection === 'neutral');
    
    const withinRange = prediction.predictedPriceMin !== null && 
                       prediction.predictedPriceMax !== null &&
                       actualPrice >= prediction.predictedPriceMin && 
                       actualPrice <= prediction.predictedPriceMax;
    
    const priceError = Math.abs(actualChange - prediction.predictedChange);
    
    // Calcular precisión del cambio (0-100)
    let changeAccuracy = 0;
    if (Math.abs(prediction.predictedChange) > 0.1) {
      const fulfillmentRatio = Math.abs(actualChange) / Math.abs(prediction.predictedChange);
      if (directionCorrect) {
        changeAccuracy = Math.min(100, fulfillmentRatio * 100);
      } else {
        changeAccuracy = Math.max(0, (1 - fulfillmentRatio) * 50);
      }
    } else if (Math.abs(actualChange) < 0.5) {
      changeAccuracy = 100; // Predijo neutral y fue neutral
    }
    
    // Accuracy score combinado
    const directionWeight = 0.6;
    const changeWeight = 0.4;
    const accuracyScore = 
      (directionCorrect ? 100 : 0) * directionWeight + 
      changeAccuracy * changeWeight;
    
    // Clasificar calidad
    let quality: 'excellent' | 'good' | 'poor' | 'failed';
    if (accuracyScore >= 75) quality = 'excellent';
    else if (accuracyScore >= 50) quality = 'good';
    else if (accuracyScore >= 25) quality = 'poor';
    else quality = 'failed';

    const verifyData: VerifyPredictionData = {
      actualPrice,
      actualChange,
      actualDirection,
      directionCorrect,
      withinRange,
      priceError,
      changeAccuracy: Math.round(changeAccuracy),
      accuracyScore: Math.round(accuracyScore),
      quality,
    };

    const verified = await predictionRepository.verify(id, verifyData);

    // Limpiar cache del track record para este símbolo
    trackRecordService.clearCache(prediction.symbol);

    // Sincronizar con Python en background (no bloqueante)
    pythonTrainingService.syncAndTrain().catch(err => {
      console.log('[PythonSync] Background sync skipped:', err.message || 'Python server not available');
    });

    res.json({
      success: true,
      data: {
        predictionId: verified.id,
        ...verifyData,
        predictedChange: prediction.predictedChange,
      },
    });
  }),

  /**
   * POST /api/predictions/verify-pending
   * Verificar todas las predicciones pendientes automáticamente
   */
  verifyPending: asyncHandler(async (_req: Request, res: Response) => {
    const pending = await predictionRepository.findPendingVerification();
    const results: any[] = [];

    for (const prediction of pending) {
      try {
        const quote = await yahooService.getQuote(prediction.symbol);
        if (!quote) {
          results.push({ id: prediction.id, symbol: prediction.symbol, error: 'Could not fetch price' });
          continue;
        }
        const actualPrice = quote.price;
        
        // Calcular resultados (mismo código que verify)
        const actualChange = ((actualPrice - prediction.currentPrice) / prediction.currentPrice) * 100;
        const actualDirection: 'up' | 'down' | 'neutral' = 
          actualChange > 0.5 ? 'up' : 
          actualChange < -0.5 ? 'down' : 'neutral';
        
        const directionCorrect = prediction.direction === actualDirection;
        
        const withinRange = prediction.predictedPriceMin !== null && 
                           prediction.predictedPriceMax !== null &&
                           actualPrice >= prediction.predictedPriceMin && 
                           actualPrice <= prediction.predictedPriceMax;
        
        const priceError = Math.abs(actualChange - prediction.predictedChange);
        
        let changeAccuracy = 0;
        if (Math.abs(prediction.predictedChange) > 0.1) {
          const fulfillmentRatio = Math.abs(actualChange) / Math.abs(prediction.predictedChange);
          if (directionCorrect) {
            changeAccuracy = Math.min(100, fulfillmentRatio * 100);
          }
        }
        
        const accuracyScore = (directionCorrect ? 100 : 0) * 0.6 + changeAccuracy * 0.4;
        
        let quality: 'excellent' | 'good' | 'poor' | 'failed';
        if (accuracyScore >= 75) quality = 'excellent';
        else if (accuracyScore >= 50) quality = 'good';
        else if (accuracyScore >= 25) quality = 'poor';
        else quality = 'failed';

        await predictionRepository.verify(prediction.id, {
          actualPrice,
          actualChange,
          actualDirection,
          directionCorrect,
          withinRange,
          priceError,
          changeAccuracy: Math.round(changeAccuracy),
          accuracyScore: Math.round(accuracyScore),
          quality,
        });

        results.push({
          id: prediction.id,
          symbol: prediction.symbol,
          directionCorrect,
          quality,
        });
      } catch (error: any) {
        results.push({
          id: prediction.id,
          symbol: prediction.symbol,
          error: error.message,
        });
      }
    }

    // Sincronizar con Python después de verificar todas las pendientes
    const pythonSync = await pythonTrainingService.syncAndTrain();

    res.json({
      success: true,
      data: {
        processed: results.length,
        results,
        pythonSync: {
          available: pythonSync.available,
          synced: pythonSync.synced,
          trained: pythonSync.trained,
        },
      },
    });
  }),

  /**
   * GET /api/predictions/stats
   * Obtener estadísticas completas
   */
  getStats: asyncHandler(async (_req: Request, res: Response) => {
    const stats = await predictionRepository.getStats();

    res.json({
      success: true,
      data: stats,
    });
  }),

  /**
   * DELETE /api/predictions/:id
   * Eliminar una predicción
   */
  delete: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    
    const prediction = await predictionRepository.findById(id);
    if (!prediction) {
      throw NotFoundError(`Prediction ${id}`);
    }

    await predictionRepository.delete(id);

    res.json({
      success: true,
      message: 'Prediction deleted',
    });
  }),

  /**
   * DELETE /api/predictions
   * Limpiar todas las predicciones (solo en desarrollo)
   */
  clear: asyncHandler(async (_req: Request, res: Response) => {
    if (process.env.NODE_ENV === 'production') {
      throw BadRequestError('Cannot clear predictions in production');
    }

    const count = await predictionRepository.clear();

    res.json({
      success: true,
      message: `Deleted ${count} predictions`,
    });
  }),

  /**
   * POST /api/predictions/import-bulk
   * Importar predicciones en masa (migración desde AsyncStorage)
   */
  importBulk: asyncHandler(async (req: Request, res: Response) => {
    const { predictions, source } = req.body;

    if (!predictions || !Array.isArray(predictions)) {
      throw BadRequestError('predictions array is required');
    }

    console.log(`[Predictions] Importing ${predictions.length} predictions from ${source || 'unknown'}`);

    const result = await predictionRepository.importBulk(predictions);

    res.json({
      success: true,
      data: {
        imported: result.imported,
        total: predictions.length,
        errors: result.errors,
      },
    });
  }),
};

// Helper para formatear predicción para respuesta JSON
function formatPrediction(p: any) {
  return {
    id: p.id,
    symbol: p.symbol,
    asset: p.asset,
    assetType: p.assetType,
    timeframe: p.timeframe,
    timeframeDays: p.timeframeDays,
    direction: p.direction,
    predictedChange: p.predictedChange,
    confidence: p.confidence,
    currentPrice: p.currentPrice,
    targetPrice: p.targetPrice,
    predictedPriceMin: p.predictedPriceMin,
    predictedPriceMax: p.predictedPriceMax,
    currency: p.currency,
    volatility: p.volatility,
    volatilityCategory: p.volatilityCategory,
    createdAt: p.createdAt?.toISOString?.() || p.createdAt,
    expiresAt: p.expiresAt?.toISOString?.() || p.expiresAt,
    verified: p.verified,
    verifiedAt: p.verifiedAt?.toISOString?.() || p.verifiedAt,
    actualPrice: p.actualPrice,
    actualChange: p.actualChange,
    actualDirection: p.actualDirection,
    directionCorrect: p.directionCorrect,
    withinRange: p.withinRange,
    priceError: p.priceError,
    changeAccuracy: p.changeAccuracy,
    accuracyScore: p.accuracyScore,
    quality: p.quality,
    factorBreakdown: p.factorBreakdown ? JSON.parse(p.factorBreakdown) : null,
    factorWeights: p.factorWeights ? JSON.parse(p.factorWeights) : null,
    reasoning: p.reasoning,
    uncertaintyScore: p.uncertaintyScore,
    uncertaintyData: p.uncertaintyData ? JSON.parse(p.uncertaintyData) : null,
  };
}

/**
 * GET /api/predictions/track-record/:symbol
 * Obtener track record de un símbolo específico
 */
export const getTrackRecord = asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;
  
  if (!symbol) {
    throw BadRequestError('Symbol is required');
  }

  const trackRecord = await trackRecordService.getSymbolTrackRecord(symbol);
  const globalRecord = await trackRecordService.getGlobalTrackRecord();

  res.json({
    success: true,
    data: {
      symbol: trackRecord,
      global: globalRecord,
    },
  });
});
