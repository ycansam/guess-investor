import { Request, Response } from 'express';
import { asyncHandler, BadRequestError } from '../middleware/error-handler.js';
import { trainingRepository } from '../repositories/training.repository.js';
import { pythonTrainingService } from '../services/external/python-training.service.js';
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
      trend: 0.10,
      technical: 0.15,
      sentiment: 0.12,
      news: 0.10,
      macro: 0.10,
      competitors: 0.08,
      forex: 0.05,
      institutional: 0.08,
      seasonality: 0.07,
      financials: 0.10,
      expectations: 0.05,
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
   */
  pythonImportWeights: asyncHandler(async (_req: Request, res: Response) => {
    const result = await pythonTrainingService.importWeightsFromPython();
    
    res.json({
      success: result.success,
      data: {
        imported: result.imported,
      },
      error: result.error,
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
};
