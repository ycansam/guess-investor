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

export default router;
