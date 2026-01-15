import { Request, Response, Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
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
  const [rl, probStats] = await Promise.all([
    reinforcementLearningService.getStats(),
    probabilisticModelService.getCalibrationStats(),
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
  
  // Pesos base (hardcoded)
  const BASE_WEIGHTS = {
    trend: 0.20,
    technical: 0.25,
    sentiment: 0.15,
    news: 0.16,
    macro: 0.04,
    competitors: 0.04,
    forex: 0.03,
    institutional: 0.05,
    seasonality: 0.03,
    financials: 0.03,
    expectations: 0.02,
  };

  // Multiplicadores por grupo de activo
  const ASSET_GROUP_MULTIPLIERS = {
    large_cap_stock: { sentiment: 0.85, institutional: 1.3, financials: 1.2, competitors: 1.2 },
    small_cap_stock: { sentiment: 1.2, technical: 1.15, institutional: 0.7 },
    crypto_major: { sentiment: 1.3, technical: 1.2, macro: 1.0, competitors: 0.3, financials: 0.1 },
    crypto_alt: { sentiment: 1.5, technical: 1.3, news: 1.2, macro: 0.5, competitors: 0.2, financials: 0.05 },
    etf_index: { macro: 1.5, competitors: 0.5, institutional: 1.2, financials: 0.3 },
    commodity: { macro: 1.5, forex: 2.0, seasonality: 1.5, sentiment: 0.7, competitors: 0.2, financials: 0.1 },
    reit: { macro: 1.3, institutional: 1.2, financials: 1.5, sentiment: 0.8 },
    forex: { macro: 1.8, forex: 0.5, sentiment: 0.6, competitors: 0.3, financials: 0.1 },
    adr: { forex: 1.5, macro: 1.3, sentiment: 0.9 },
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
      const changePercent = ((learnedVal - baseVal) / baseVal) * 100;
      diff[key] = {
        base: baseVal,
        learned: learnedVal,
        change: changePercent > 0 ? `+${changePercent.toFixed(1)}%` : `${changePercent.toFixed(1)}%`,
        changePercent,
      };
    }
    return diff;
  };

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
      assetGroupMultipliers: ASSET_GROUP_MULTIPLIERS,
      availableAssetGroups: Object.keys(ASSET_GROUP_MULTIPLIERS),
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
    const prediction = await predictionCalculatorService.calculatePrediction({
      symbol,
      assetType: 'stock',
      timeframeDays: 1,
    });
    
    res.json({
      success: true,
      data: {
        symbol,
        assetGroup: prediction.factorBreakdown.assetGroup,
        assetGroupDescription: prediction.factorBreakdown.assetGroupDescription,
        weightsApplied: prediction.factorBreakdown.weightsUsed,
        usingLearnedWeights: prediction.factorBreakdown.usingLearnedWeights,
        factorScores: prediction.factorBreakdown.availableFactors.map(f => ({
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

export default router;
