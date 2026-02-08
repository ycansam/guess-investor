import { Request, Response, Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
import { classifierLearningService } from '../services/ml/classifier-learning.service.js';
import {
    factorCorrelationService,
    featureEngineeringService,
    metaLearningService,
    probabilisticModelService,
    reinforcementLearningService,
    temporalCrossValidationService,
} from '../services/ml/index.js';

const router = Router();

// GET /api/ml/status - Estado de todos los modelos ML
router.get('/status', asyncHandler(async (_req: Request, res: Response) => {
  const [rl, probStats, classifierDiagnostics] = await Promise.all([
    reinforcementLearningService.getStats(),
    probabilisticModelService.getCalibrationStats(),
    Promise.resolve(classifierLearningService.getDiagnostics()),
  ]);

  res.json({
    success: true,
    data: {
      reinforcementLearning: {
        ...rl,
        status: rl.totalEpisodes > 0 ? 'trained' : 'untrained',
      },
      probabilisticModel: {
        ...probStats,
        status: probStats.sampleCount > 0 ? 'calibrating' : 'uncalibrated',
      },
      classifierLearning: {
        isInitialized: classifierDiagnostics.isInitialized,
        version: classifierDiagnostics.version,
        totalGroups: classifierDiagnostics.totalGroups,
        totalSamples: classifierDiagnostics.totalSamples,
        status: classifierDiagnostics.totalSamples > 0 ? 'learning' : 'static',
      },
      factorCorrelation: { status: 'active' },
      metaLearning: { status: 'active' },
      featureEngineering: { status: 'active' },
      temporalCrossValidation: { status: 'active' },
    },
  });
}));

// GET /api/ml/rl/stats - Estadísticas de Reinforcement Learning
router.get('/rl/stats', asyncHandler(async (_req: Request, res: Response) => {
  const stats = await reinforcementLearningService.getStats();
  res.json({ success: true, data: stats });
}));

// POST /api/ml/rl/policy - Obtener recomendación de política
router.post('/rl/policy', asyncHandler(async (req: Request, res: Response) => {
  const { state } = req.body;
  
  if (!state) {
    res.status(400).json({ success: false, error: 'State is required' });
    return;
  }

  const recommendation = await reinforcementLearningService.getPolicy(state);
  res.json({ success: true, data: recommendation });
}));

// POST /api/ml/tcv/run - Ejecutar validación walk-forward
router.post('/tcv/run', asyncHandler(async (_req: Request, res: Response) => {
  const result = await temporalCrossValidationService.runWalkForwardValidation();
  res.json({ success: true, data: result });
}));

// POST /api/ml/tcv/out-of-sample - Test out-of-sample
router.post('/tcv/out-of-sample', asyncHandler(async (req: Request, res: Response) => {
  const { trainRatio = 0.8 } = req.body;
  const result = await temporalCrossValidationService.runOutOfSampleTest(trainRatio);
  res.json({ success: true, data: result });
}));

// POST /api/ml/tcv/detect-overfitting - Detectar overfitting
router.post('/tcv/detect-overfitting', asyncHandler(async (_req: Request, res: Response) => {
  const result = await temporalCrossValidationService.detectOverfitting();
  res.json({ success: true, data: result });
}));

// GET /api/ml/probabilistic/stats - Estadísticas de calibración
router.get('/probabilistic/stats', asyncHandler(async (_req: Request, res: Response) => {
  const stats = await probabilisticModelService.getCalibrationStats();
  res.json({ success: true, data: stats });
}));

// POST /api/ml/probabilistic/predict - Generar predicción probabilística
router.post('/probabilistic/predict', asyncHandler(async (req: Request, res: Response) => {
  const { symbol, pointEstimate, confidence, volatility } = req.body;
  
  if (!symbol || pointEstimate === undefined || confidence === undefined) {
    res.status(400).json({ 
      success: false, 
      error: 'symbol, pointEstimate and confidence are required' 
    });
    return;
  }

  const prediction = await probabilisticModelService.generateProbabilisticPrediction(
    symbol,
    pointEstimate,
    confidence,
    volatility
  );
  
  res.json({ success: true, data: prediction });
}));

// POST /api/ml/correlation/analyze - Analizar correlaciones de factores
router.post('/correlation/analyze', asyncHandler(async (req: Request, res: Response) => {
  const { factorScores, originalConfidence = 50 } = req.body;
  
  if (!factorScores) {
    res.status(400).json({ success: false, error: 'factorScores is required' });
    return;
  }

  const analysis = factorCorrelationService.calculateConfidenceAdjustment(
    factorScores,
    originalConfidence
  );
  
  res.json({ success: true, data: analysis });
}));

// GET /api/ml/meta/stats - Estadísticas de meta-learning
router.get('/meta/stats', asyncHandler(async (_req: Request, res: Response) => {
  const stats = await metaLearningService.getStats();
  res.json({ success: true, data: stats });
}));

// POST /api/ml/features/generate - Generar features
router.post('/features/generate', asyncHandler(async (req: Request, res: Response) => {
  const { baseFeatures, historicalData } = req.body;
  
  if (!baseFeatures) {
    res.status(400).json({ success: false, error: 'baseFeatures is required' });
    return;
  }

  const features = featureEngineeringService.generateDerivedFeatures(baseFeatures, historicalData);
  res.json({ success: true, data: features });
}));

// GET /api/ml/weights/status - Estado completo de pesos aprendidos y clasificación de activos
router.get('/weights/status', asyncHandler(async (_req: Request, res: Response) => {
  const fs = await import('fs');
  const path = await import('path');
  
  // Pesos base - 14 factores (8 tradicionales + 6 intradía)
  // seasonality, competitors, expectations ELIMINADOS
  const BASE_WEIGHTS = {
    // Factores tradicionales
    technical: 0.20,
    sentiment: 0.15,
    news: 0.10,
    trend: 0.05,
    macro: 0.03,
    forex: 0.02,
    institutional: 0.00,
    financials: 0.00,
    // Factores intradía (nuevos v1.6.0)
    intradayTrend: 0.15,
    optionsFlow: 0.10,
    volumeProfile: 0.05,
    divergences: 0.05,
    volatilityIV: 0.05,
    marketBreadth: 0.05,
  };

  // Multiplicadores por grupo de activo (actualizados v1.6.0)
  const ASSET_GROUP_MULTIPLIERS = {
    large_cap_stock: { financials: 1.5, institutional: 1.4, optionsFlow: 1.3, news: 1.2 },
    small_cap_stock: { technical: 1.4, intradayTrend: 1.4, trend: 1.3, divergences: 1.3 },
    crypto_major: { sentiment: 1.5, intradayTrend: 1.5, technical: 1.4, volumeProfile: 1.3 },
    crypto_alt: { sentiment: 1.8, intradayTrend: 1.8, technical: 1.6, divergences: 1.6 },
    etf_index: { macro: 1.5, marketBreadth: 1.5, institutional: 1.3, optionsFlow: 1.2 },
    commodity: { macro: 1.8, forex: 1.6, volatilityIV: 1.4, volumeProfile: 1.3 },
    reit: { financials: 1.8, macro: 1.6, marketBreadth: 1.1 },
    forex: { macro: 1.8, intradayTrend: 1.6, technical: 1.4, volumeProfile: 1.4 },
    adr: { forex: 1.6, financials: 1.4 },
    default: {},
  };

  // Leer pesos aprendidos
  let learnedWeights = null;
  let learnedWeightsError = null;
  let lastUpdated = null;
  let trainingSamples = 0;
  
  try {
    const weightsPath = path.resolve(process.cwd(), '../code/config/learned_weights.json');
    const content = fs.readFileSync(weightsPath, 'utf-8');
    const parsed = JSON.parse(content);
    learnedWeights = parsed.weights;
    lastUpdated = parsed.updated_at;
    trainingSamples = parsed.training_samples || 0;
  } catch (err: unknown) {
    learnedWeightsError = err instanceof Error ? err.message : 'Unknown error';
  }

  // Calcular diferencias con pesos base
  const calculateDiff = (learned: Record<string, number> | null) => {
    if (!learned) return null;
    const diff: Record<string, { base: number; learned: number; change: string; changePercent: number }> = {};
    for (const [key, baseVal] of Object.entries(BASE_WEIGHTS)) {
      const learnedVal = learned[key] ?? baseVal;
      // Cambio relativo en porcentaje
      const changePercent = baseVal > 0 ? ((learnedVal - baseVal) / baseVal) * 100 : 0;
      diff[key] = {
        base: baseVal,
        learned: learnedVal,
        change: changePercent >= 0 ? `+${changePercent.toFixed(1)}%` : `${changePercent.toFixed(1)}%`,
        changePercent,
      };
    }
    return diff;
  };

  // Obtener multiplicadores aprendidos (o estáticos si no hay)
  const learnedMultipliers = classifierLearningService.getAllMultipliers();
  const classifierStats = classifierLearningService.getStats();

  res.json({
    success: true,
    data: {
      summary: {
        lastUpdated,
        trainingSamples,
        hasLearnedWeights: !!learnedWeights,
        error: learnedWeightsError,
      },
      baseWeights: BASE_WEIGHTS,
      learnedWeights,
      comparison: {
        intraday: calculateDiff(learnedWeights?.intraday),
        swing: calculateDiff(learnedWeights?.swing),
        long: calculateDiff(learnedWeights?.long),
      },
      assetGroupMultipliers: learnedMultipliers, // Ahora usa los aprendidos
      assetGroupStats: classifierStats,
      availableAssetGroups: Object.keys(learnedMultipliers),
    },
  });
}));

// GET /api/ml/weights/compare/:symbol - Comparar pesos para un símbolo específico
router.get('/weights/compare/:symbol', asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;
  
  // Importar dinámicamente el servicio de cálculo para obtener grupo
  const { predictionCalculatorService } = await import('../services/prediction/calculator.service.js');
  
  // Obtener predicción solo para ver los pesos
  try {
    const prediction = await predictionCalculatorService.calculatePrediction(symbol, 'stock', 1);
    
    if (!prediction) {
      res.status(404).json({ success: false, error: 'Could not calculate prediction' });
      return;
    }
    
    res.json({
      success: true,
      data: {
        symbol,
        assetGroup: prediction.factorBreakdown.assetGroup,
        assetGroupDescription: prediction.factorBreakdown.assetGroupDescription,
        weightsApplied: prediction.factorBreakdown.weightsUsed,
        usingLearnedWeights: prediction.factorBreakdown.usingLearnedWeights,
        factorScores: prediction.factorBreakdown.availableFactors.map((f: { name: string; score: number }) => ({
          name: f.name,
          score: f.score,
          weight: prediction.factorBreakdown.weightsUsed[f.name],
          contribution: f.score * (prediction.factorBreakdown.weightsUsed[f.name] || 0),
        })),
      },
    });
  } catch (err: unknown) {
    res.status(500).json({ 
      success: false, 
      error: err instanceof Error ? err.message : 'Error getting weights for symbol' 
    });
  }
}));

// POST /api/ml/train-from-verified - Entrena RL y calibra Probabilístico con predicciones verificadas
router.post('/train-from-verified', asyncHandler(async (_req: Request, res: Response) => {
  const { predictionRepository } = await import('../repositories/prediction.repository.js');
  
  // Obtener predicciones verificadas
  const verified = await predictionRepository.findVerified(500);
  
  if (verified.length === 0) {
    res.json({ success: false, error: 'No verified predictions found' });
    return;
  }
  
  let rlTrained = 0;
  let probCalibrated = 0;
  const errors: string[] = [];
  
  for (const pred of verified) {
    try {
      // Entrenar RL
      const historicalData = pred.historicalData ? JSON.parse(pred.historicalData) : null;
      const sentimentData = pred.sentimentData ? JSON.parse(pred.sentimentData) : null;
      const factorBreakdown = pred.factorBreakdown ? JSON.parse(pred.factorBreakdown) : null;
      
      const volatility = historicalData?.volatility ?? pred.volatility ?? 25;
      const vix = sentimentData?.vix?.value ?? 20;
      const signalSummary = factorBreakdown?.signalSummary ?? 'mixed';
      const avgScore = factorBreakdown?.availableFactors 
        ? factorBreakdown.availableFactors.reduce((sum: number, f: { score: number }) => sum + Math.abs(f.score), 0) / factorBreakdown.availableFactors.length
        : 30;
      
      // Determinar timeframe en días
      let timeframeDays = 1;
      if (pred.timeframe === 'swing') timeframeDays = 7;
      else if (pred.timeframe === 'longterm') timeframeDays = 30;
      
      // Discretizar estado
      const state = reinforcementLearningService.discretizeState({
        vix,
        volatility,
        timeframeDays,
        combinedScore: avgScore * (pred.direction === 'up' ? 1 : pred.direction === 'down' ? -1 : 0),
        signalCoherence: signalSummary === 'aligned' ? 'coherent_bullish' : signalSummary === 'conflicting' ? 'mixed' : 'neutral',
        hasUpcomingEvents: false,
        recentAccuracy: pred.accuracyScore ?? 50,
      });
      
      // Determinar acción basada en confianza original
      let action: 'skip' | 'predict_low' | 'predict_medium' | 'predict_high' = 'predict_medium';
      if (pred.confidence < 40) action = 'predict_low';
      else if (pred.confidence > 70) action = 'predict_high';
      
      // Registrar experiencia
      await reinforcementLearningService.recordExperience(
        state,
        action,
        pred.accuracyScore ?? null,
        pred.directionCorrect ?? null,
        null
      );
      rlTrained++;
      
      // Calibrar modelo probabilístico
      const predictedMean = pred.predictedChange ?? 0;
      const predictedStdDev = volatility / Math.sqrt(252) * Math.sqrt(timeframeDays);
      const actualChange = pred.actualChange ?? 0;
      
      await probabilisticModelService.recordCalibration(
        pred.symbol,
        predictedMean,
        predictedStdDev,
        actualChange
      );
      probCalibrated++;
      
    } catch (err) {
      errors.push(`${pred.symbol}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }
  
  // Obtener stats actualizados
  const [rlStats, probStats] = await Promise.all([
    reinforcementLearningService.getStats(),
    probabilisticModelService.getCalibrationStats(),
  ]);
  
  res.json({
    success: true,
    data: {
      totalPredictions: verified.length,
      rlTrained,
      probCalibrated,
      errors: errors.slice(0, 10),
      rlStats,
      probStats,
    },
  });
}));

// =====================================================================
// CLASSIFIER LEARNING ENDPOINTS
// =====================================================================

// GET /api/ml/classifiers/status - Estado del aprendizaje de clasificadores
router.get('/classifiers/status', asyncHandler(async (_req: Request, res: Response) => {
  const diagnostics = classifierLearningService.getDiagnostics();
  
  res.json({
    success: true,
    data: diagnostics,
  });
}));

// GET /api/ml/classifiers/multipliers - Obtener todos los multiplicadores aprendidos
router.get('/classifiers/multipliers', asyncHandler(async (_req: Request, res: Response) => {
  const multipliers = classifierLearningService.getAllMultipliers();
  const stats = classifierLearningService.getStats();
  
  res.json({
    success: true,
    data: {
      multipliers,
      stats,
    },
  });
}));

// GET /api/ml/classifiers/:group/multipliers - Multiplicadores de un clasificador específico
router.get('/classifiers/:group/multipliers', asyncHandler(async (req: Request, res: Response) => {
  const { group } = req.params;
  const multipliers = classifierLearningService.getMultipliers(group);
  const stats = classifierLearningService.getStats();
  
  res.json({
    success: true,
    data: {
      assetGroup: group,
      multipliers,
      stats: stats[group] || { sampleCount: 0, successRate: 0, avgAccuracy: 0, lastUpdated: null },
    },
  });
}));

// POST /api/ml/classifiers/train - Entrenar clasificadores con predicciones verificadas existentes
router.post('/classifiers/train', asyncHandler(async (_req: Request, res: Response) => {
  const { predictionRepository } = await import('../repositories/prediction.repository.js');
  
  // Obtener predicciones verificadas
  const verified = await predictionRepository.findVerified(500);
  
  if (verified.length === 0) {
    res.json({ success: false, error: 'No verified predictions found' });
    return;
  }
  
  const trainingData: Array<{
    assetGroup: string;
    directionCorrect: boolean;
    accuracyScore: number;
    factorScores: Record<string, number>;
    factorWeights: Record<string, number>;
    predictedChange: number;
    actualChange: number;
  }> = [];
  
  for (const pred of verified) {
    try {
      const factorBreakdown = pred.factorBreakdown ? JSON.parse(pred.factorBreakdown) : null;
      if (!factorBreakdown?.assetGroup) continue;
      
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
      
      trainingData.push({
        assetGroup: factorBreakdown.assetGroup,
        directionCorrect: pred.directionCorrect || false,
        accuracyScore: pred.accuracyScore || 0,
        factorScores,
        factorWeights,
        predictedChange: pred.predictedChange,
        actualChange: pred.actualChange || 0,
      });
    } catch (err) {
      // Skip malformed predictions
    }
  }
  
  const result = await classifierLearningService.trainFromBatch(trainingData);
  const diagnostics = classifierLearningService.getDiagnostics();
  
  res.json({
    success: true,
    data: {
      ...result,
      diagnostics,
    },
  });
}));

// POST /api/ml/classifiers/reset - Reiniciar multiplicadores a valores estáticos
router.post('/classifiers/reset', asyncHandler(async (_req: Request, res: Response) => {
  await classifierLearningService.reset();
  const diagnostics = classifierLearningService.getDiagnostics();
  
  res.json({
    success: true,
    message: 'Classifier multipliers reset to static values',
    data: diagnostics,
  });
}));

export default router;
