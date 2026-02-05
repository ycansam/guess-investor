import { Request, Response } from 'express';
import { prisma } from '../config/database.js';
import { asyncHandler, BadRequestError } from '../middleware/error-handler.js';
import { predictionRepository } from '../repositories/prediction.repository.js';
import { trainingRepository } from '../repositories/training.repository.js';
import { pythonTrainingService } from '../services/external/python-training.service.js';
import { classifierLearningService } from '../services/ml/classifier-learning.service.js';
import { factorWeightLearningService } from '../services/ml/factor-weight-learning.service.js';
import { probabilisticModelService } from '../services/ml/probabilistic-model.service.js';
import { reinforcementLearningService } from '../services/ml/reinforcement-learning.service.js';
import { predictionCalculatorService } from '../services/prediction/calculator.service.js';
import { confidenceCalibrationService } from '../services/prediction/confidence-calibration.service.js';
import { ensembleService } from '../services/prediction/ensemble.service.js';

// ============================================================================
// CONTROLADOR DE TRAINING
// ============================================================================

export const trainingController = {
  /**
   * GET /api/training/stats
   * Obtener estadísticas de training
   */
  getStats: asyncHandler(async (_req: Request, res: Response) => {
    const stats = await trainingRepository.getStats();
    
    res.json({
      success: true,
      data: stats,
    });
  }),

  /**
   * GET /api/training/cache
   * Obtener todo el cache activo
   */
  getCache: asyncHandler(async (_req: Request, res: Response) => {
    const cache = await trainingRepository.getAllActiveCache();
    
    res.json({
      success: true,
      data: cache.map(c => ({
        ...c,
        analysisData: c.analysisData ? JSON.parse(c.analysisData) : null,
      })),
    });
  }),

  /**
   * POST /api/training/cache
   * Guardar una predicción en cache
   */
  saveCache: asyncHandler(async (req: Request, res: Response) => {
    const data = req.body;
    
    if (!data.symbol || !data.timeframe) {
      throw BadRequestError('Symbol and timeframe are required');
    }
    
    const saved = await trainingRepository.saveToCache({
      symbol: data.symbol,
      timeframe: data.timeframe,
      predictedChange: data.predictedChange,
      confidence: data.confidence,
      direction: data.direction,
      currentPrice: data.currentPrice,
      targetPrice: data.targetPrice,
      currency: data.currency, // IMPORTANTE: Guardar la moneda
      analysisData: data.analysisData,
      expiresAt: new Date(data.expiresAt),
    });
    
    res.json({
      success: true,
      data: {
        ...saved,
        analysisData: saved.analysisData ? JSON.parse(saved.analysisData) : null,
      },
    });
  }),

  /**
   * GET /api/training/cache/:symbol/:timeframe
   * Obtener una predicción específica del cache
   */
  getCacheItem: asyncHandler(async (req: Request, res: Response) => {
    const { symbol, timeframe } = req.params;
    
    const cached = await trainingRepository.getFromCache(symbol, timeframe);
    
    res.json({
      success: true,
      data: cached ? {
        ...cached,
        analysisData: cached.analysisData ? JSON.parse(cached.analysisData) : null,
      } : null,
    });
  }),

  /**
   * DELETE /api/training/cache/:symbol/:timeframe
   * Eliminar una predicción del cache
   */
  deleteCache: asyncHandler(async (req: Request, res: Response) => {
    const { symbol, timeframe } = req.params;
    
    const deleted = await trainingRepository.deleteFromCache(symbol, timeframe);
    
    res.json({
      success: true,
      data: { deleted },
    });
  }),

  /**
   * GET /api/training/symbol/:symbol
   * Obtener cache por símbolo
   */
  getBySymbol: asyncHandler(async (req: Request, res: Response) => {
    const { symbol } = req.params;
    
    if (!symbol) {
      throw BadRequestError('Symbol is required');
    }
    
    const cache = await trainingRepository.getCacheBySymbol(symbol);
    
    res.json({
      success: true,
      data: cache.map(c => ({
        ...c,
        analysisData: c.analysisData ? JSON.parse(c.analysisData) : null,
      })),
    });
  }),

  /**
   * POST /api/training/import
   * Importar datos de training desde el frontend
   */
  import: asyncHandler(async (req: Request, res: Response) => {
    const { predictions, chatPredictions, source } = req.body;
    
    console.log(`[Training] Importing data from ${source || 'unknown'}`);
    
    let totalImported = 0;
    const allErrors: string[] = [];
    
    // Importar predicciones de training cache
    if (predictions && Array.isArray(predictions)) {
      console.log(`[Training] Importing ${predictions.length} training predictions`);
      
      const trainingData = predictions.map((p: any) => ({
        symbol: p.symbol,
        timeframe: p.timeframe,
        predictedChange: p.predictedChange,
        confidence: p.confidence,
        direction: p.direction,
        currentPrice: p.currentPrice,
        targetPrice: p.targetPrice,
        analysisData: p.analysisData,
        expiresAt: new Date(p.expiresAt),
      }));
      
      const result = await trainingRepository.importBatch(trainingData);
      totalImported += result.imported;
      allErrors.push(...result.errors);
    }
    
    // Importar predicciones del chat (las convertimos a formato de tracking)
    if (chatPredictions && Array.isArray(chatPredictions)) {
      console.log(`[Training] Importing ${chatPredictions.length} chat predictions`);
      // Por ahora solo logueamos, estas van a la tabla Prediction
      // TODO: Convertir y guardar en Prediction
    }
    
    console.log(`[Training] Imported ${totalImported} predictions, ${allErrors.length} errors`);
    
    res.json({
      success: true,
      data: {
        imported: totalImported,
        errors: allErrors,
      },
    });
  }),

  /**
   * GET /api/training/weights
   * Obtener pesos aprendidos
   */
  getWeights: asyncHandler(async (_req: Request, res: Response) => {
    const weights = await trainingRepository.getLearnedWeights();
    
    res.json({
      success: true,
      data: weights,
    });
  }),

  /**
   * POST /api/training/weights
   * Guardar nuevos pesos aprendidos
   */
  saveWeights: asyncHandler(async (req: Request, res: Response) => {
    const weights = req.body;
    
    const saved = await trainingRepository.saveLearnedWeights(weights);
    
    res.json({
      success: true,
      data: saved,
    });
  }),

  /**
   * DELETE /api/training/weights
   * Resetear pesos aprendidos (volver a defaults)
   */
  resetWeights: asyncHandler(async (_req: Request, res: Response) => {
    // Guardar pesos por defecto con el formato correcto
    const defaultWeights = {
      trend: 0.11,
      technical: 0.16,
      sentiment: 0.13,
      news: 0.11,
      macro: 0.11,
      competitors: 0.09,
      forex: 0.06,
      institutional: 0.09,
      financials: 0.11,
      expectations: 0.03,
      sampleCount: 0,
      accuracy: 0,
    };
    
    const saved = await trainingRepository.saveLearnedWeights(defaultWeights);
    
    res.json({
      success: true,
      reset: true,
      data: saved,
    });
  }),

  /**
   * POST /api/training/retrain-ensemble
   * Re-entrenar pesos del ensemble con los nuevos accuracyScores
   */
  retrainEnsemble: asyncHandler(async (_req: Request, res: Response) => {
    await ensembleService.updateEnsembleWeights();
    
    // Obtener los nuevos pesos
    const weights = await trainingRepository.getLearnedWeights();
    
    res.json({
      success: true,
      message: 'Ensemble weights retrained successfully',
      data: weights,
    });
  }),

  /**
   * GET /api/training/adjustments
   * Obtener todos los ajustes de activos
   */
  getAdjustments: asyncHandler(async (_req: Request, res: Response) => {
    const adjustments = await trainingRepository.getAllAssetAdjustments();
    
    res.json({
      success: true,
      data: adjustments,
    });
  }),

  /**
   * GET /api/training/adjustments/:symbol
   * Obtener ajuste de un activo
   */
  getAdjustmentBySymbol: asyncHandler(async (req: Request, res: Response) => {
    const { symbol } = req.params;
    
    const adjustment = await trainingRepository.getAssetAdjustment(symbol);
    
    res.json({
      success: true,
      data: adjustment,
    });
  }),

  /**
   * POST /api/training/adjustments
   * Guardar ajuste de activo
   */
  saveAdjustment: asyncHandler(async (req: Request, res: Response) => {
    const data = req.body;
    
    if (!data.symbol) {
      throw BadRequestError('Symbol is required');
    }
    
    const saved = await trainingRepository.saveAssetAdjustment(data);
    
    res.json({
      success: true,
      data: saved,
    });
  }),

  /**
   * GET /api/training/calibration
   * Obtener calibración de confianza
   */
  getCalibration: asyncHandler(async (_req: Request, res: Response) => {
    const calibration = await trainingRepository.getCalibration();
    
    res.json({
      success: true,
      data: calibration ? {
        ...calibration,
        calibrationBins: calibration.calibrationBins 
          ? JSON.parse(calibration.calibrationBins) 
          : null,
      } : null,
    });
  }),

  /**
   * POST /api/training/calibration
   * Guardar nueva calibración
   */
  saveCalibration: asyncHandler(async (req: Request, res: Response) => {
    const data = req.body;
    
    const saved = await trainingRepository.saveCalibration(data);
    
    res.json({
      success: true,
      data: {
        ...saved,
        calibrationBins: saved.calibrationBins 
          ? JSON.parse(saved.calibrationBins) 
          : null,
      },
    });
  }),

  /**
   * POST /api/training/cleanup
   * Limpiar cache expirado
   */
  cleanup: asyncHandler(async (_req: Request, res: Response) => {
    const deleted = await trainingRepository.cleanupExpiredCache();
    
    res.json({
      success: true,
      data: { deleted },
    });
  }),

  /**
   * DELETE /api/training/cache
   * Borrar TODO el cache
   */
  clearAll: asyncHandler(async (_req: Request, res: Response) => {
    const deleted = await trainingRepository.clearAllCache();
    
    res.json({
      success: true,
      data: { deleted },
    });
  }),

  /**
   * GET /api/training/export
   * Exportar todos los datos de training (para backup)
   */
  export: asyncHandler(async (_req: Request, res: Response) => {
    const [
      cache,
      weights,
      adjustments,
      calibration,
    ] = await Promise.all([
      trainingRepository.getAllActiveCache(),
      trainingRepository.getLearnedWeights(),
      trainingRepository.getAllAssetAdjustments(),
      trainingRepository.getCalibration(),
    ]);
    
    res.json({
      success: true,
      data: {
        cache: cache.map(c => ({
          ...c,
          analysisData: c.analysisData ? JSON.parse(c.analysisData) : null,
        })),
        weights,
        adjustments,
        calibration: calibration ? {
          ...calibration,
          calibrationBins: calibration.calibrationBins 
            ? JSON.parse(calibration.calibrationBins) 
            : null,
        } : null,
        exportedAt: new Date().toISOString(),
      },
    });
  }),

  // ==========================================================================
  // PYTHON ML INTEGRATION
  // ==========================================================================

  /**
   * GET /api/training/python/status
   * Verificar estado del servidor Python
   */
  pythonStatus: asyncHandler(async (_req: Request, res: Response) => {
    const status = await pythonTrainingService.getStatus();
    
    res.json({
      success: true,
      data: status,
    });
  }),

  /**
   * POST /api/training/python/sync
   * Sincronizar predicciones verificadas a Python
   */
  pythonSync: asyncHandler(async (_req: Request, res: Response) => {
    const result = await pythonTrainingService.syncPredictions();
    
    res.json({
      success: result.success,
      data: {
        synced: result.synced,
        error: result.error,
      },
    });
  }),

  /**
   * POST /api/training/python/train
   * Disparar entrenamiento en Python
   */
  pythonTrain: asyncHandler(async (_req: Request, res: Response) => {
    const result = await pythonTrainingService.triggerTraining();
    
    res.json({
      success: result.success,
      data: result.result,
      error: result.error,
    });
  }),

  /**
   * POST /api/training/python/sync-and-train
   * Sincronizar Y entrenar en un solo paso
   */
  pythonSyncAndTrain: asyncHandler(async (_req: Request, res: Response) => {
    const result = await pythonTrainingService.syncAndTrain();
    
    res.json({
      success: result.trained || result.synced > 0,
      data: result,
    });
  }),

  /**
   * POST /api/training/python/import-weights
   * Importar pesos entrenados desde Python al backend
   * NOTA: Los pesos ahora se leen directamente del archivo JSON, no se importan
   */
  pythonImportWeights: asyncHandler(async (_req: Request, res: Response) => {
    // Los pesos ahora se leen directamente de learned_weights.json
    // Este endpoint ya no necesita importar porque Python escribe directamente al archivo
    res.json({
      success: true,
      data: {
        imported: false,
        message: 'Weights are now read directly from learned_weights.json file',
      },
    });
  }),

  /**
   * GET /api/training/python/weights
   * Obtener pesos directamente desde Python (sin importar)
   */
  pythonGetWeights: asyncHandler(async (_req: Request, res: Response) => {
    const result = await pythonTrainingService.getTrainedWeights();
    
    res.json({
      success: result.success,
      data: result.weights,
      error: result.error,
    });
  }),

  /**
   * POST /api/training/import-active
   * Importar predicciones activas (no verificadas, no expiradas) de Prediction a TrainingCache
   * Útil para restaurar el cache cuando se pierden datos
   */
  importActiveToCache: asyncHandler(async (req: Request, res: Response) => {
    const { timeframeDays } = req.query;
    
    // Mapeo de labels a keys (la tabla Prediction usa labels)
    const labelToKey: Record<string, string> = {
      'Intradía': 'intraday',
      'Swing': 'swing',
      'Largo Plazo': 'longterm',
      // También soportar keys directamente
      'intraday': 'intraday',
      'swing': 'swing',
      'longterm': 'longterm',
    };
    
    // Mapeo inverso para filtrar por timeframeDays
    const daysToKey: Record<number, string> = {
      1: 'intraday',
      7: 'swing',
      30: 'longterm',
    };
    
    // Obtener predicciones activas
    const now = new Date();
    const where: any = {
      verified: false,
      expiresAt: { gt: now },
    };
    
    // Si se especifica timeframeDays, filtrar
    if (timeframeDays) {
      where.timeframeDays = parseInt(timeframeDays as string);
    }
    
    const activePredictions = await prisma.prediction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    
    let imported = 0;
    let skipped = 0;
    const importedItems: string[] = [];
    const errors: string[] = [];
    
    for (const pred of activePredictions) {
      try {
        // Convertir el label del timeframe al key
        const timeframeKey = labelToKey[pred.timeframe] || daysToKey[pred.timeframeDays] || 'intraday';
        
        // Verificar si ya existe en cache
        const existing = await trainingRepository.getFromCache(pred.symbol, timeframeKey);
        if (existing) {
          skipped++;
          continue;
        }
        
        // Parsear analysisData si existe
        let analysisData = null;
        if (pred.factorBreakdown) {
          try {
            analysisData = JSON.parse(pred.factorBreakdown);
          } catch {}
        }
        
        // Guardar en cache
        await trainingRepository.saveToCache({
          symbol: pred.symbol,
          timeframe: timeframeKey,
          predictedChange: pred.predictedChange,
          confidence: pred.confidence,
          direction: pred.direction,
          currentPrice: pred.currentPrice,
          targetPrice: pred.targetPrice,
          analysisData,
          expiresAt: pred.expiresAt,
        });
        
        imported++;
        importedItems.push(`${pred.symbol} (${timeframeKey})`);
      } catch (error: any) {
        errors.push(`${pred.symbol}: ${error.message}`);
      }
    }
    
    res.json({
      success: true,
      data: {
        found: activePredictions.length,
        imported,
        skipped,
        errors: errors.length,
        importedItems: importedItems.slice(0, 20), // Mostrar solo primeros 20
        errorDetails: errors.slice(0, 10),
      },
    });
  }),

  /**
   * POST /api/training/sync-cache
   * Sincronizar training cache con predicciones verificadas
   * Elimina del cache las predicciones que ya han sido verificadas
   */
  syncCacheWithVerified: asyncHandler(async (_req: Request, res: Response) => {
    // Obtener todo el cache activo
    const cache = await trainingRepository.getAllActiveCache();
    
    // Mapear timeframe string a días
    const timeframeToDays: Record<string, number> = {
      intraday: 1,
      swing: 7,
      longterm: 30,
    };
    
    let removed = 0;
    const removedItems: string[] = [];
    
    for (const item of cache) {
      const timeframeDays = timeframeToDays[item.timeframe] || 1;
      
      // Buscar predicción verificada para este símbolo y timeframe
      const { predictions } = await predictionRepository.findAll({
        symbol: item.symbol,
        verified: true,
        limit: 10,
      });
      
      // Verificar si alguna de las verificadas coincide aproximadamente en fecha
      const hasVerified = predictions.some((p: { timeframeDays: number; createdAt: Date | string }) => {
        if (p.timeframeDays !== timeframeDays) return false;
        // Verificar que la predicción fue creada cerca de la del cache
        const cacheCreated = new Date(item.createdAt).getTime();
        const predCreated = new Date(p.createdAt).getTime();
        const diffHours = Math.abs(cacheCreated - predCreated) / (1000 * 60 * 60);
        return diffHours < 24; // Dentro de 24 horas
      });
      
      if (hasVerified) {
        await trainingRepository.deleteFromCache(item.symbol, item.timeframe);
        removed++;
        removedItems.push(`${item.symbol} (${item.timeframe})`);
      }
    }
    
    res.json({
      success: true,
      data: {
        scanned: cache.length,
        removed,
        removedItems,
        remaining: cache.length - removed,
      },
    });
  }),

  /**
   * DELETE /api/training/reset-all
   * Resetear TODO el sistema ML: predicciones, pesos, cache y Python
   */
  resetAll: asyncHandler(async (_req: Request, res: Response) => {
    const results = {
      predictions: 0,
      cache: 0,
      mlModels: 0,
      weights: false,
      pythonReset: false,
    };

    // 1. Borrar todas las predicciones
    const deletedPreds = await predictionRepository.clear();
    results.predictions = deletedPreds;

    // 2. Borrar todo el cache de training
    const cacheResult = await prisma.trainingCache.deleteMany({});
    results.cache = cacheResult.count;

    // 3. Borrar estados de modelos ML (RL, probabilístico, correlación, meta-learning)
    const mlModelsResult = await prisma.mLModelState.deleteMany({});
    results.mlModels = mlModelsResult.count;

    // 3.1. Resetear estado EN MEMORIA de los servicios ML
    // (importante: la DB está vacía pero los servicios mantienen estado en memoria)
    await reinforcementLearningService.reset();
    await probabilisticModelService.reset();
    await classifierLearningService.reset();
    await confidenceCalibrationService.reset();

    // 4. Resetear pesos aprendidos a valores por defecto (no uniformes)
    // Estos son los pesos por defecto para swing (balance entre corto y largo plazo)
    const defaultWeights = {
      trend: 0.13,
      technical: 0.19,
      sentiment: 0.11,
      news: 0.16,
      macro: 0.09,
      competitors: 0.08,
      forex: 0.06,
      institutional: 0.11,
      financials: 0.06,
      expectations: 0.01,
      sampleCount: 0,
      accuracy: 0,
    };
    await trainingRepository.saveLearnedWeights(defaultWeights);
    results.weights = true;

    // 5. Resetear Python (predicciones verificadas y pesos)
    try {
      const pythonResult = await pythonTrainingService.resetAll();
      results.pythonReset = pythonResult.success;
    } catch (error) {
      console.warn('[Training] Python reset failed:', error);
      results.pythonReset = false;
    }

    res.json({
      success: true,
      message: 'Sistema ML reseteado completamente',
      data: results,
    });
  }),

  /**
   * POST /api/training/force-relearn
   * Forzar re-aprendizaje de pesos y clasificadores desde predicciones verificadas
   */
  forceRelearn: asyncHandler(async (_req: Request, res: Response) => {
    const results = {
      weightsLearned: 0,
      classifiersLearned: 0,
      totalVerified: 0,
      alreadyTrained: 0,
      withFactorData: 0,
      withoutFactorData: 0,
      newlyProcessed: 0,
      errors: [] as string[],
      details: [] as string[],
    };

    // Contar predicciones verificadas totales
    const totalVerified = await prisma.prediction.count({
      where: { verified: true },
    });
    results.totalVerified = totalVerified;

    // Contar ya entrenadas
    const alreadyTrained = await prisma.prediction.count({
      where: { verified: true, usedForTraining: true },
    });
    results.alreadyTrained = alreadyTrained;

    // Obtener SOLO predicciones verificadas NO entrenadas con factorBreakdown
    const untrainedPredictions = await prisma.prediction.findMany({
      where: {
        verified: true,
        usedForTraining: false, // Solo las que NO han sido usadas
        factorBreakdown: { not: null },
      },
      orderBy: { verifiedAt: 'asc' },
    });

    // Contar las que no tienen factorBreakdown (sin datos)
    const withoutFactorData = await prisma.prediction.count({
      where: {
        verified: true,
        usedForTraining: false,
        factorBreakdown: null,
      },
    });
    results.withoutFactorData = withoutFactorData;
    results.withFactorData = untrainedPredictions.length;

    console.log(`[ForceRelearn] Total: ${totalVerified}, Ya entrenadas: ${alreadyTrained}, Pendientes con datos: ${untrainedPredictions.length}`);
    
    if (alreadyTrained > 0) {
      results.details.push(`✅ ${alreadyTrained} predicciones ya fueron usadas para entrenar`);
    }
    if (withoutFactorData > 0) {
      results.details.push(`⚠️ ${withoutFactorData} predicciones sin datos de factores (no procesables)`);
    }
    results.details.push(`🆕 ${untrainedPredictions.length} predicciones nuevas para procesar`);

    // Procesar cada predicción NO entrenada
    const processedIds: string[] = [];
    
    for (const prediction of untrainedPredictions) {
      try {
        const factorBreakdown = prediction.factorBreakdown 
          ? JSON.parse(prediction.factorBreakdown) 
          : null;

        if (!factorBreakdown?.availableFactors) {
          continue;
        }

        // Extraer scores y weights
        const factorScores: Record<string, number> = {};
        const factorWeights: Record<string, number> = {};

        for (const f of factorBreakdown.availableFactors) {
          factorScores[f.name] = f.score;
        }

        if (factorBreakdown.weightsUsed) {
          Object.assign(factorWeights, factorBreakdown.weightsUsed);
        }

        // Aprender pesos de factores
        const weightResult = await factorWeightLearningService.learnFromVerification({
          timeframeDays: prediction.timeframeDays,
          directionCorrect: prediction.directionCorrect || false,
          accuracyScore: prediction.accuracyScore || 0,
          factorScores,
          factorWeights,
          predictedChange: prediction.predictedChange,
          actualChange: prediction.actualChange || 0,
        });

        if (weightResult.adjusted) {
          results.weightsLearned++;
        }

        // Aprender clasificadores por grupo de activo
        if (factorBreakdown.assetGroup) {
          await classifierLearningService.learnFromVerifiedPrediction({
            assetGroup: factorBreakdown.assetGroup,
            directionCorrect: prediction.directionCorrect || false,
            accuracyScore: prediction.accuracyScore || 0,
            factorScores,
            factorWeights,
            predictedChange: prediction.predictedChange,
            actualChange: prediction.actualChange || 0,
          });
          results.classifiersLearned++;
        }

        // Marcar como procesada
        processedIds.push(prediction.id);
        results.newlyProcessed++;
      } catch (err: any) {
        results.errors.push(`${prediction.symbol}: ${err.message}`);
      }
    }

    // Marcar todas las predicciones procesadas como usadas para training
    if (processedIds.length > 0) {
      await prisma.prediction.updateMany({
        where: { id: { in: processedIds } },
        data: { 
          usedForTraining: true,
          trainedAt: new Date(),
        },
      });
      console.log(`[ForceRelearn] Marcadas ${processedIds.length} predicciones como entrenadas`);
    }

    // También intentar entrenar con Python
    let pythonResult = { success: false, message: 'No intentado' };
    try {
      const syncResult = await pythonTrainingService.syncAndTrain();
      pythonResult = {
        success: syncResult.trained,
        message: syncResult.trained 
          ? 'Entrenamiento Python exitoso' 
          : 'Python no disponible o sin cambios',
      };
      results.details.push(`🐍 Python: ${pythonResult.message}`);
    } catch (err: any) {
      pythonResult = { success: false, message: err.message };
      results.details.push(`🐍 Python error: ${err.message}`);
    }

    const status = factorWeightLearningService.getStatus();
    results.details.push(`📁 Muestras en archivo de pesos: ${status.trainingSamples}`);

    // Construir mensaje según los resultados
    let message = '';
    if (untrainedPredictions.length === 0) {
      if (alreadyTrained > 0) {
        message = `ℹ️ Todas las predicciones (${alreadyTrained}) ya fueron procesadas. No hay nuevos datos para entrenar.`;
      } else if (withoutFactorData > 0) {
        message = `⚠️ Hay ${withoutFactorData} predicciones verificadas pero sin datos de factores (creadas antes del fix). Las nuevas predicciones sí tendrán datos.`;
      } else {
        message = 'No hay predicciones verificadas para procesar.';
      }
      if (pythonResult.success) {
        message += ' Python sí pudo entrenar.';
      }
    } else {
      message = `✅ Procesadas ${results.newlyProcessed} predicciones nuevas: ${results.weightsLearned} ajustes de pesos, ${results.classifiersLearned} clasificadores.`;
    }

    res.json({
      success: true,
      message,
      data: {
        ...results,
        pythonResult,
        finalStatus: status,
      },
    });
  }),

  /**
   * POST /api/training/backfill-factor-breakdown
   * Genera factorBreakdown básico para predicciones verificadas que no lo tienen
   * Esto permite que el classifier learning funcione con predicciones antiguas
   */
  backfillFactorBreakdown: asyncHandler(async (_req: Request, res: Response) => {
    // Obtener predicciones verificadas sin factorBreakdown
    const predictions = await prisma.prediction.findMany({
      where: {
        verified: true,
        factorBreakdown: null,
      },
      select: {
        id: true,
        symbol: true,
        asset: true,
        assetType: true,
      },
    });

    if (predictions.length === 0) {
      res.json({
        success: true,
        message: 'No hay predicciones para actualizar. Todas ya tienen factorBreakdown.',
        data: { updated: 0 },
      });
      return;
    }

    let updated = 0;
    const errors: string[] = [];

    for (const pred of predictions) {
      try {
        // Detectar el grupo del activo
        const type = pred.assetType === 'crypto' ? 'crypto' : 'stock';
        const assetGroup = predictionCalculatorService.detectAssetGroup(
          pred.symbol,
          type as 'stock' | 'crypto',
          pred.asset || ''
        );

        // Crear un factorBreakdown básico
        const factorBreakdown = {
          assetGroup,
          assetGroupDescription: `Grupo detectado: ${assetGroup}`,
          relevantFactors: ['trend', 'technical', 'sentiment', 'news'], // Factores básicos
          availableFactors: [], // No tenemos los scores originales
          weightsUsed: {}, // No tenemos los pesos originales
          usingLearnedWeights: false,
          confidenceExplanation: 'Datos reconstruidos - predicción histórica',
          signalSummary: 'insufficient' as const,
        };

        // Actualizar la predicción
        await prisma.prediction.update({
          where: { id: pred.id },
          data: {
            factorBreakdown: JSON.stringify(factorBreakdown),
          },
        });

        updated++;
      } catch (err: any) {
        errors.push(`${pred.symbol}: ${err.message}`);
      }
    }

    res.json({
      success: true,
      message: `Actualizadas ${updated}/${predictions.length} predicciones con factorBreakdown básico.`,
      data: {
        total: predictions.length,
        updated,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  }),
};
