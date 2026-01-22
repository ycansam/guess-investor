import { Prediction } from '@prisma/client';
import { Request, Response } from 'express';
import { prisma } from '../config/database.js';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-handler.js';
import { CreatePredictionRequestSchema } from '../models/index.js';
import { predictionRepository, VerifyPredictionData } from '../repositories/prediction.repository.js';
import { trainingRepository } from '../repositories/training.repository.js';
import { pythonTrainingService } from '../services/external/python-training.service.js';
import { yahooService } from '../services/external/yahoo.service.js';
import { classifierLearningService } from '../services/ml/classifier-learning.service.js';
import { factorWeightLearningService } from '../services/ml/factor-weight-learning.service.js';
import { probabilisticModelService } from '../services/ml/probabilistic-model.service.js';
import { reinforcementLearningService } from '../services/ml/reinforcement-learning.service.js';
import { predictionCalculatorService } from '../services/prediction/calculator.service.js';
import { trackRecordService } from '../services/prediction/track-record.service.js';

// Umbral para considerar el movimiento como direccional vs neutral (en %)
// Mantener un “buffer” evita penalizar ruido intradía.
const DIRECTION_THRESHOLD_PCT = 0.5;

// Bonus por alcanzar objetivo durante el período (multiplicador de score)
const TARGET_REACHED_BONUS = 1.10; // +10% al score si alcanzó el objetivo
const TARGET_MARGIN_PCT = 0.5; // Margen mínimo para considerar que "alcanzó" el objetivo

interface PeriodExtremes {
  high: number;
  low: number;
  reachedHigh: Date;
  reachedLow: Date;
}

function computeVerificationData(
  prediction: Prediction, 
  actualPrice: number,
  periodExtremes?: PeriodExtremes | null,
  basePrice?: number // Precio base para comparar (cierre del día anterior). Si no se provee, usa prediction.currentPrice
): VerifyPredictionData {
  // Usar basePrice si se provee (cierre del día anterior), si no usar el precio de creación
  const referencePrice = basePrice ?? prediction.currentPrice;
  const actualChange = ((actualPrice - referencePrice) / referencePrice) * 100;

  const actualDirection: 'up' | 'down' | 'neutral' =
    actualChange > DIRECTION_THRESHOLD_PCT ? 'up' :
    actualChange < -DIRECTION_THRESHOLD_PCT ? 'down' : 'neutral';

  // Dirección correcta: más estricto
  // - Si predijo UP y bajó (cualquier cantidad) = error
  // - Si predijo DOWN y subió (cualquier cantidad) = error
  // - Neutral solo es correcto si el movimiento fue mínimo (dentro del threshold)
  let directionCorrect = false;
  if (prediction.direction === 'up') {
    // Predijo subida: correcto solo si realmente subió (no bajó)
    directionCorrect = actualChange >= 0;
  } else if (prediction.direction === 'down') {
    // Predijo bajada: correcto solo si realmente bajó (no subió)
    directionCorrect = actualChange <= 0;
  } else {
    // Predijo neutral: correcto si se mantuvo dentro del threshold
    directionCorrect = actualDirection === 'neutral';
  }

  const withinRange = prediction.predictedPriceMin !== null &&
    prediction.predictedPriceMax !== null &&
    actualPrice >= prediction.predictedPriceMin &&
    actualPrice <= prediction.predictedPriceMax;

  const predictedChange = prediction.predictedChange ?? 0;
  const priceError = Math.abs(actualChange - predictedChange);

  // Verificar si el objetivo fue alcanzado durante el período
  let targetReached = false;
  let targetReachedAt: Date | undefined;
  let periodHigh: number | undefined;
  let periodLow: number | undefined;
  
  if (periodExtremes) {
    periodHigh = periodExtremes.high;
    periodLow = periodExtremes.low;
    
    // Usar el targetPrice real (no la media del rango)
    const targetPrice = prediction.targetPrice;
    const marginAmount = targetPrice * (TARGET_MARGIN_PCT / 100);
    
    if (prediction.direction === 'up') {
      // Si predijo subida, verificar si el high del período superó el objetivo por el margen mínimo
      if (periodExtremes.high >= targetPrice + marginAmount) {
        targetReached = true;
        targetReachedAt = periodExtremes.reachedHigh;
      }
    } else if (prediction.direction === 'down') {
      // Si predijo bajada, verificar si el low del período bajó del objetivo por el margen mínimo
      if (periodExtremes.low <= targetPrice - marginAmount) {
        targetReached = true;
        targetReachedAt = periodExtremes.reachedLow;
      }
    } else {
      // Para neutral, verificar si se mantuvo cerca del precio actual (dentro del 1%)
      const neutralMargin = prediction.currentPrice * 0.01;
      if (periodExtremes.high <= prediction.currentPrice + neutralMargin && 
          periodExtremes.low >= prediction.currentPrice - neutralMargin) {
        targetReached = true;
      }
    }
  }

  let accuracyScore = 0;
  if (directionCorrect) {
    const predictedMag = Math.abs(predictedChange);
    const actualMag = Math.abs(actualChange);

    if (predictedMag < 0.1 && actualMag < 0.5) {
      accuracyScore = 100;
    } else if (predictedMag > 0.1) {
      const magError = Math.abs(actualMag - predictedMag) / Math.max(predictedMag, 1);
      const magAccuracy = Math.max(0, 1 - magError);
      accuracyScore = 50 + (magAccuracy * 50);
    } else {
      accuracyScore = 60;
    }
  } else {
    const actualMag = Math.abs(actualChange);
    if (actualMag < 0.5) {
      accuracyScore = 40;
    } else if (actualMag < 1) {
      accuracyScore = 20;
    } else {
      accuracyScore = Math.max(0, 15 - actualMag);
    }
  }

  // Aplicar bonus si alcanzó el objetivo durante el período
  if (targetReached && directionCorrect) {
    accuracyScore = Math.min(100, accuracyScore * TARGET_REACHED_BONUS);
    console.log(`[Verify] 🎯 Target reached bonus applied! New score: ${accuracyScore.toFixed(1)}`);
  }

  accuracyScore = Math.round(Math.max(0, Math.min(100, accuracyScore)));
  const changeAccuracy = directionCorrect ? Math.min(100, (1 - priceError / 10) * 100) : 0;

  // Calidad basada en dirección + score
  // 'failed' = dirección incorrecta (sin importar score)
  // 'very_poor' = dirección correcta pero score < 25
  let quality: 'excellent' | 'good' | 'poor' | 'very_poor' | 'failed';
  if (!directionCorrect) {
    quality = 'failed';
  } else if (accuracyScore >= 75) {
    quality = 'excellent';
  } else if (accuracyScore >= 50) {
    quality = 'good';
  } else if (accuracyScore >= 25) {
    quality = 'poor';
  } else {
    quality = 'very_poor';
  }

  return {
    actualPrice,
    actualChange,
    actualDirection,
    directionCorrect,
    withinRange,
    priceError,
    changeAccuracy: Math.round(changeAccuracy),
    accuracyScore,
    quality,
    targetReached,
    targetReachedAt,
    periodHigh,
    periodLow,
  };
}

/**
 * Entrena los modelos ML (RL y Probabilístico) con una predicción verificada
 */
async function trainMLModelsFromVerification(
  prediction: Prediction,
  verifyData: VerifyPredictionData
): Promise<{ rlTrained: boolean; probCalibrated: boolean }> {
  let rlTrained = false;
  let probCalibrated = false;

  try {
    // Parsear datos históricos
    const historicalData = prediction.historicalData ? JSON.parse(prediction.historicalData) : null;
    const sentimentData = prediction.sentimentData ? JSON.parse(prediction.sentimentData) : null;
    const factorBreakdown = prediction.factorBreakdown ? JSON.parse(prediction.factorBreakdown) : null;

    const volatility = historicalData?.volatility ?? prediction.volatility ?? 25;
    const vix = sentimentData?.vix?.value ?? 20;
    const signalSummary = factorBreakdown?.signalSummary ?? 'mixed';
    const avgScore = factorBreakdown?.availableFactors
      ? factorBreakdown.availableFactors.reduce((sum: number, f: { score: number }) => sum + Math.abs(f.score), 0) / factorBreakdown.availableFactors.length
      : 30;

    // Determinar timeframe en días
    const timeframeDays = prediction.timeframeDays || 1;

    // ===== ENTRENAR REINFORCEMENT LEARNING =====
    try {
      // Discretizar estado
      const state = reinforcementLearningService.discretizeState({
        vix,
        volatility,
        timeframeDays,
        combinedScore: avgScore * (prediction.direction === 'up' ? 1 : prediction.direction === 'down' ? -1 : 0),
        signalCoherence: signalSummary === 'aligned' ? 'coherent_bullish' : signalSummary === 'conflicting' ? 'mixed' : 'neutral',
        hasUpcomingEvents: false,
        recentAccuracy: verifyData.accuracyScore ?? 50,
      });

      // Determinar acción basada en confianza original
      let action: 'skip' | 'predict_low' | 'predict_medium' | 'predict_high' = 'predict_medium';
      if (prediction.confidence < 40) action = 'predict_low';
      else if (prediction.confidence > 70) action = 'predict_high';

      // Registrar experiencia
      await reinforcementLearningService.recordExperience(
        state,
        action,
        verifyData.accuracyScore ?? null,
        verifyData.directionCorrect ?? null,
        null
      );
      rlTrained = true;
      console.log(`[ML] RL trained for ${prediction.symbol}: action=${action}, reward based on score=${verifyData.accuracyScore}`);
    } catch (err) {
      console.log(`[ML] RL training failed for ${prediction.symbol}:`, err);
    }

    // ===== CALIBRAR MODELO PROBABILÍSTICO =====
    try {
      const predictedMean = prediction.predictedChange ?? 0;
      const predictedStdDev = volatility / Math.sqrt(252) * Math.sqrt(timeframeDays);
      const actualChange = verifyData.actualChange ?? 0;

      await probabilisticModelService.recordCalibration(
        prediction.symbol,
        predictedMean,
        predictedStdDev,
        actualChange
      );
      probCalibrated = true;
      console.log(`[ML] Probabilistic model calibrated for ${prediction.symbol}: predicted=${predictedMean.toFixed(2)}%, actual=${actualChange.toFixed(2)}%`);
    } catch (err) {
      console.log(`[ML] Probabilistic calibration failed for ${prediction.symbol}:`, err);
    }

  } catch (err) {
    console.log(`[ML] Error training ML models for ${prediction.symbol}:`, err);
  }

  return { rlTrained, probCalibrated };
}

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
      currency,
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
      reasoning,
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
      currency: currency || 'EUR', // Moneda del activo
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
      reasoning,
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
   * Verificar predicción con precio de la fecha de expiración
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

    // Si no se proporciona precio, obtener el precio de cierre de la fecha de expiración
    let basePrice: number | undefined; // Precio base para comparar (cierre del día anterior)
    
    if (actualPrice === undefined) {
      try {
        // Usar el precio de cierre del día de expiración (o último día de mercado)
        const priceAtExpiry = await yahooService.getPriceAtDate(prediction.symbol, prediction.expiresAt);
        
        if (priceAtExpiry) {
          actualPrice = priceAtExpiry.price;
          console.log(`[Verify] Using historical price for ${prediction.symbol} at ${priceAtExpiry.actualDate.toISOString().split('T')[0]}: ${actualPrice}`);
          
          // Obtener el precio de cierre del día ANTERIOR a la expiración como base
          const dayBefore = new Date(priceAtExpiry.actualDate);
          dayBefore.setDate(dayBefore.getDate() - 1);
          const previousClose = await yahooService.getPriceAtDate(prediction.symbol, dayBefore);
          
          if (previousClose) {
            basePrice = previousClose.price;
            console.log(`[Verify] Base price (previous close ${previousClose.actualDate.toISOString().split('T')[0]}): ${basePrice}`);
          }
        } else {
          // Fallback al precio actual si no hay datos históricos
          const quote = await yahooService.getQuote(prediction.symbol);
          if (!quote) {
            throw BadRequestError('Could not fetch price for verification. Please provide actualPrice.');
          }
          actualPrice = quote.price;
          basePrice = quote.previousClose;
          console.log(`[Verify] Using current price for ${prediction.symbol} (no historical data): ${actualPrice}, previousClose: ${basePrice}`);
        }
      } catch (error) {
        throw BadRequestError('Could not fetch price for verification. Please provide actualPrice.');
      }
    }

    if (typeof actualPrice !== 'number' || actualPrice <= 0) {
      throw BadRequestError('actualPrice must be a positive number');
    }

    // Obtener extremos del período para verificar si alcanzó el objetivo
    let periodExtremes = null;
    try {
      periodExtremes = await yahooService.getPeriodExtremes(
        prediction.symbol,
        prediction.createdAt,
        prediction.expiresAt
      );
      if (periodExtremes) {
        console.log(`[Verify] Period extremes for ${prediction.symbol}: High=${periodExtremes.high}, Low=${periodExtremes.low}`);
      }
    } catch (error) {
      console.log('[Verify] Could not get period extremes, continuing without bonus check');
    }

    const verifyData = computeVerificationData(prediction, actualPrice, periodExtremes, basePrice);

    const verified = await predictionRepository.verify(id, verifyData);

    // Eliminar del training cache para que no aparezca más en la UI
    const timeframeMap: Record<number, string> = { 1: 'intraday', 7: 'swing', 30: 'longterm' };
    const timeframe = timeframeMap[prediction.timeframeDays] || 'intraday';
    try {
      await trainingRepository.deleteFromCache(prediction.symbol, timeframe);
      console.log(`[Verify] Removed ${prediction.symbol} (${timeframe}) from training cache`);
    } catch (err) {
      // No es crítico si falla
      console.log(`[Verify] Could not remove from training cache: ${err}`);
    }

    // Limpiar cache del track record para este símbolo
    trackRecordService.clearCache(prediction.symbol);

    // Aprender de la predicción verificada para ajustar clasificadores
    try {
      const factorBreakdown = prediction.factorBreakdown ? JSON.parse(prediction.factorBreakdown) : null;
      if (factorBreakdown?.assetGroup) {
        const factorScores: Record<string, number> = {};
        const factorWeights: Record<string, number> = {};
        
        if (factorBreakdown.availableFactors) {
          for (const f of factorBreakdown.availableFactors) {
            factorScores[f.name] = f.score;
          }
        }
        if (factorBreakdown.weightsUsed) {
          Object.assign(factorWeights, factorBreakdown.weightsUsed);
        }

        // Actualizar clasificadores por grupo de activo
        await classifierLearningService.learnFromVerifiedPrediction({
          assetGroup: factorBreakdown.assetGroup,
          directionCorrect: verifyData.directionCorrect,
          accuracyScore: verifyData.accuracyScore,
          factorScores,
          factorWeights,
          predictedChange: prediction.predictedChange,
          actualChange: verifyData.actualChange,
        });
        console.log(`[Verify] Classifier learning updated for ${factorBreakdown.assetGroup}`);

        // Actualizar pesos de factores (technical, trend, news, etc.)
        const weightLearningResult = await factorWeightLearningService.learnFromVerification({
          timeframeDays: prediction.timeframeDays,
          directionCorrect: verifyData.directionCorrect,
          accuracyScore: verifyData.accuracyScore,
          factorScores,
          factorWeights,
          predictedChange: prediction.predictedChange,
          actualChange: verifyData.actualChange,
        });
        if (weightLearningResult.adjusted) {
          console.log(`[Verify] Factor weights adjusted:`, weightLearningResult.changes.join(', '));
        }

        // Marcar predicción como usada para training (evitar re-entrenamiento)
        await prisma.prediction.update({
          where: { id: prediction.id },
          data: { usedForTraining: true, trainedAt: new Date() },
        });
      }
    } catch (err) {
      console.log('[Verify] Could not update classifier learning:', err);
    }

    // Entrenar modelos ML (RL y Probabilístico)
    const mlResult = await trainMLModelsFromVerification(prediction, verifyData);
    console.log(`[Verify] ML training: RL=${mlResult.rlTrained}, Prob=${mlResult.probCalibrated}`);

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
        mlTrained: mlResult,
      },
    });
  }),

  /**
   * POST /api/predictions/verify-pending
   * Verificar todas las predicciones pendientes automáticamente
   * Usa el precio de cierre de la fecha de expiración, no el precio actual
   */
  verifyPending: asyncHandler(async (_req: Request, res: Response) => {
    const pending = await predictionRepository.findPendingVerification();
    const results: any[] = [];

    for (const prediction of pending) {
      try {
        // Obtener precio de cierre del día de expiración (o último día de mercado)
        let actualPrice: number;
        let basePrice: number | undefined; // Precio de cierre del día anterior (base para comparar)
        const priceAtExpiry = await yahooService.getPriceAtDate(prediction.symbol, prediction.expiresAt);
        
        if (priceAtExpiry) {
          actualPrice = priceAtExpiry.price;
          console.log(`[VerifyPending] ${prediction.symbol}: Using price at ${priceAtExpiry.actualDate.toISOString().split('T')[0]}: ${actualPrice}`);
          
          // Obtener el precio de cierre del día ANTERIOR a la expiración como base
          const dayBefore = new Date(priceAtExpiry.actualDate);
          dayBefore.setDate(dayBefore.getDate() - 1);
          const previousClose = await yahooService.getPriceAtDate(prediction.symbol, dayBefore);
          
          if (previousClose) {
            basePrice = previousClose.price;
            console.log(`[VerifyPending] ${prediction.symbol}: Base price (previous close ${previousClose.actualDate.toISOString().split('T')[0]}): ${basePrice}`);
          } else {
            console.log(`[VerifyPending] ${prediction.symbol}: Could not get previous close, using creation price as base`);
          }
        } else {
          // Fallback al precio actual
          const quote = await yahooService.getQuote(prediction.symbol);
          if (!quote) {
            results.push({ id: prediction.id, symbol: prediction.symbol, error: 'Could not fetch price' });
            continue;
          }
          actualPrice = quote.price;
          basePrice = quote.previousClose; // Yahoo provee el cierre anterior
          console.log(`[VerifyPending] ${prediction.symbol}: Using current price (no historical): ${actualPrice}, previousClose: ${basePrice}`);
        }
        
        const verifyData = computeVerificationData(prediction, actualPrice, null, basePrice);

        await predictionRepository.verify(prediction.id, verifyData);

        // Eliminar del training cache
        const timeframeMap: Record<number, string> = { 1: 'intraday', 7: 'swing', 30: 'longterm' };
        const timeframe = timeframeMap[prediction.timeframeDays] || 'intraday';
        try {
          await trainingRepository.deleteFromCache(prediction.symbol, timeframe);
        } catch {
          // No es crítico
        }

        // Limpiar cache del track record para este símbolo
        trackRecordService.clearCache(prediction.symbol);

        // Aprender de la predicción verificada para ajustar clasificadores y pesos
        try {
          const factorBreakdown = prediction.factorBreakdown ? JSON.parse(prediction.factorBreakdown) : null;
          if (factorBreakdown?.assetGroup) {
            const factorScores: Record<string, number> = {};
            const factorWeights: Record<string, number> = {};
            
            if (factorBreakdown.availableFactors) {
              for (const f of factorBreakdown.availableFactors) {
                factorScores[f.name] = f.score;
              }
            }
            if (factorBreakdown.weightsUsed) {
              Object.assign(factorWeights, factorBreakdown.weightsUsed);
            }

            // Actualizar clasificadores por grupo de activo
            await classifierLearningService.learnFromVerifiedPrediction({
              assetGroup: factorBreakdown.assetGroup,
              directionCorrect: verifyData.directionCorrect,
              accuracyScore: verifyData.accuracyScore,
              factorScores,
              factorWeights,
              predictedChange: prediction.predictedChange,
              actualChange: verifyData.actualChange,
            });
            console.log(`[VerifyPending] Classifier learning updated for ${prediction.symbol} (${factorBreakdown.assetGroup})`);

            // Actualizar pesos de factores (technical, trend, news, etc.)
            const weightLearningResult = await factorWeightLearningService.learnFromVerification({
              timeframeDays: prediction.timeframeDays,
              directionCorrect: verifyData.directionCorrect,
              accuracyScore: verifyData.accuracyScore,
              factorScores,
              factorWeights,
              predictedChange: prediction.predictedChange,
              actualChange: verifyData.actualChange,
            });
            if (weightLearningResult.adjusted) {
              console.log(`[VerifyPending] Factor weights adjusted for ${prediction.symbol}:`, weightLearningResult.changes.join(', '));
            }

            // Marcar predicción como usada para training (evitar re-entrenamiento)
            await prisma.prediction.update({
              where: { id: prediction.id },
              data: { usedForTraining: true, trainedAt: new Date() },
            });
          }
        } catch (err) {
          console.log(`[VerifyPending] Could not update classifier learning for ${prediction.symbol}:`, err);
        }

        // Entrenar modelos ML (RL y Probabilístico)
        const mlResult = await trainMLModelsFromVerification(prediction, verifyData);

        results.push({
          id: prediction.id,
          symbol: prediction.symbol,
          directionCorrect: verifyData.directionCorrect,
          quality: verifyData.quality,
          priceDate: priceAtExpiry?.actualDate.toISOString().split('T')[0] || 'current',
          learningUpdated: true,
          mlTrained: mlResult,
        });
      } catch (error: any) {
        results.push({
          id: prediction.id,
          symbol: prediction.symbol,
          error: error.message,
        });
      }
    }

    // Contar ML entrenados
    const mlStats = {
      rlTrained: results.filter(r => r.mlTrained?.rlTrained).length,
      probCalibrated: results.filter(r => r.mlTrained?.probCalibrated).length,
    };
    console.log(`[VerifyPending] ML training complete: RL=${mlStats.rlTrained}, Prob=${mlStats.probCalibrated}`);

    // Sincronizar con Python después de verificar todas las pendientes
    const pythonSync = await pythonTrainingService.syncAndTrain();

    res.json({
      success: true,
      data: {
        processed: results.length,
        results,
        mlStats,
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

/**
 * POST /api/predictions/recalculate-scores
 * Recalcular accuracyScore y quality de todas las predicciones verificadas
 * con la nueva fórmula que prioriza la dirección
 */
export const recalculateScores = asyncHandler(async (_req: Request, res: Response) => {
  const { predictions: verified } = await predictionRepository.findAll({
    verified: true,
    limit: 10000,
  });

  let updated = 0;
  const results: Array<{ id: string; symbol: string; oldScore: number; newScore: number; oldQuality: string; newQuality: string }> = [];

  for (const prediction of verified) {
    if (!prediction.actualChange || prediction.predictedChange === null) continue;

    const actualChange = prediction.actualChange;
    const predictedChange = prediction.predictedChange;

    const actualDirection: 'up' | 'down' | 'neutral' =
      actualChange > DIRECTION_THRESHOLD_PCT ? 'up' :
      actualChange < -DIRECTION_THRESHOLD_PCT ? 'down' : 'neutral';

    // Dirección correcta: más estricto
    // - Si predijo UP y bajó (cualquier cantidad) = error
    // - Si predijo DOWN y subió (cualquier cantidad) = error
    let directionCorrect = false;
    if (prediction.direction === 'up') {
      directionCorrect = actualChange >= 0;
    } else if (prediction.direction === 'down') {
      directionCorrect = actualChange <= 0;
    } else {
      directionCorrect = actualDirection === 'neutral';
    }

    // Nueva fórmula de accuracyScore
    let newAccuracyScore = 0;
    
    if (directionCorrect) {
      const predictedMag = Math.abs(predictedChange);
      const actualMag = Math.abs(actualChange);
      
      if (predictedMag < 0.1 && actualMag < 0.5) {
        newAccuracyScore = 100;
      } else if (predictedMag > 0.1) {
        const magError = Math.abs(actualMag - predictedMag) / Math.max(predictedMag, 1);
        const magAccuracy = Math.max(0, 1 - magError);
        newAccuracyScore = 50 + (magAccuracy * 50);
      } else {
        newAccuracyScore = 60;
      }
    } else {
      const actualMag = Math.abs(actualChange);
      if (actualMag < 0.5) {
        newAccuracyScore = 40;
      } else if (actualMag < 1) {
        newAccuracyScore = 20;
      } else {
        newAccuracyScore = Math.max(0, 15 - actualMag);
      }
    }
    
    newAccuracyScore = Math.round(Math.max(0, Math.min(100, newAccuracyScore)));
    
    // Determinar nueva calidad
    // 'failed' = dirección incorrecta, 'very_poor' = dirección correcta pero score < 25
    let newQuality: 'excellent' | 'good' | 'poor' | 'very_poor' | 'failed';
    if (!directionCorrect) {
      newQuality = 'failed';
    } else if (newAccuracyScore >= 75) {
      newQuality = 'excellent';
    } else if (newAccuracyScore >= 50) {
      newQuality = 'good';
    } else if (newAccuracyScore >= 25) {
      newQuality = 'poor';
    } else {
      newQuality = 'very_poor';
    }

    const oldScore = prediction.accuracyScore || 0;
    const oldQuality = prediction.quality || 'failed';
    const oldDirectionCorrect = prediction.directionCorrect ?? true;

    // Siempre actualizar si la quality, score o directionCorrect cambió
    const qualityChanged = oldQuality !== newQuality;
    const scoreChanged = oldScore !== newAccuracyScore;
    const directionChanged = oldDirectionCorrect !== directionCorrect;
    
    if (scoreChanged || qualityChanged || directionChanged) {
      await predictionRepository.updateScores(prediction.id, {
        accuracyScore: newAccuracyScore,
        quality: newQuality,
        directionCorrect,
        actualDirection,
      });
      
      results.push({
        id: prediction.id,
        symbol: prediction.symbol,
        oldScore,
        newScore: newAccuracyScore,
        oldQuality,
        newQuality,
      });
      updated++;
    }
  }

  // Limpiar cache del track record
  trackRecordService.clearCache();

  res.json({
    success: true,
    message: `Recalculated ${updated} predictions`,
    data: {
      total: verified.length,
      updated,
      changes: results,
    },
  });
});

/**
 * POST /api/predictions/fix-intraday-expiry
 * Corregir expiresAt de predicciones intradía para que expiren al cierre de mercado
 */
export const fixIntradayExpiry = asyncHandler(async (_req: Request, res: Response) => {
  const { prisma } = await import('../config/database.js');
  
  // Buscar predicciones intradía no verificadas
  const predictions = await prisma.prediction.findMany({
    where: {
      timeframeDays: 1,
      verified: false,
    },
  });

  let updated = 0;
  for (const pred of predictions) {
    // Calcular nuevo expiresAt: cierre de mercado (17:30 España = 16:30 UTC) del día de creación
    const createdAt = new Date(pred.createdAt);
    const newExpiry = new Date(createdAt);
    newExpiry.setUTCHours(16, 30, 0, 0);
    
    // Si se creó después del cierre, usar el día siguiente
    if (createdAt > newExpiry) {
      newExpiry.setDate(newExpiry.getDate() + 1);
    }
    
    // Ajustar fines de semana
    const day = newExpiry.getDay();
    if (day === 0) newExpiry.setDate(newExpiry.getDate() + 1);
    if (day === 6) newExpiry.setDate(newExpiry.getDate() + 2);
    
    // Solo actualizar si cambió
    if (newExpiry.getTime() !== new Date(pred.expiresAt).getTime()) {
      await prisma.prediction.update({
        where: { id: pred.id },
        data: { expiresAt: newExpiry },
      });
      updated++;
    }
  }

  res.json({
    success: true,
    message: `Fixed ${updated} intraday predictions`,
    data: { total: predictions.length, updated },
  });
});

/**
 * POST /api/predictions/cleanup-duplicates
 * Eliminar predicciones duplicadas (mismo símbolo, mismo día)
 * Mantiene solo la primera predicción de cada día por símbolo
 */
export const cleanupDuplicates = asyncHandler(async (_req: Request, res: Response) => {
  // Obtener todas las predicciones no verificadas
  const unverified = await prisma.prediction.findMany({
    where: { verified: false },
    orderBy: [{ symbol: 'asc' }, { createdAt: 'asc' }],
  });

  // Agrupar por símbolo + día
  const groups = new Map<string, typeof unverified>();
  
  for (const pred of unverified) {
    const day = new Date(pred.createdAt).toISOString().split('T')[0];
    const key = `${pred.symbol}:${day}`;
    
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(pred);
  }

  // Identificar duplicados (todos excepto el primero de cada grupo)
  const toDelete: string[] = [];
  
  for (const [_key, preds] of groups) {
    if (preds.length > 1) {
      // Mantener el primero (más antiguo), eliminar el resto
      for (let i = 1; i < preds.length; i++) {
        toDelete.push(preds[i].id);
      }
    }
  }

  // Eliminar duplicados
  if (toDelete.length > 0) {
    await prisma.prediction.deleteMany({
      where: { id: { in: toDelete } },
    });
  }

  res.json({
    success: true,
    message: `Deleted ${toDelete.length} duplicate predictions`,
    data: {
      totalUnverified: unverified.length,
      duplicatesRemoved: toDelete.length,
      remaining: unverified.length - toDelete.length,
    },
  });
});
