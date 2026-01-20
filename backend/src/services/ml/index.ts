/**
 * Machine Learning Services Index
 * 
 * Exporta todos los servicios de ML avanzados:
 * - Reinforcement Learning: Q-Learning para saber CUÁNDO predecir
 * - Factor Correlation: Detecta sinergias/conflictos entre factores
 * - Temporal Cross-Validation: Walk-forward validation y detección de overfitting
 * - Meta-Learning: MAML-inspired few-shot learning para nuevos símbolos
 * - Probabilistic Model: Distribuciones de probabilidad e intervalos de confianza
 * - Feature Engineering: Features derivados automáticos
 */

export {
    reinforcementLearningService, type PolicyRecommendation, type RLAction, type RLState
} from './reinforcement-learning.service.js';

export {
    factorCorrelationService, type ConfidenceAdjustment, type SignalProfile
} from './factor-correlation.service.js';

export {
    temporalCrossValidationService,
    type CrossValidationResult,
    type OutOfSampleResult
} from './temporal-cross-validation.service.js';

export {
    metaLearningService,
    type FewShotAdaptation,
    type SymbolRecommendation
} from './meta-learning.service.js';

export {
    probabilisticModelService, type ConfidenceInterval, type ProbabilisticPrediction, type ProbabilityDistribution, type ScenarioProbability
} from './probabilistic-model.service.js';

export {
    featureEngineeringService,
    type DerivedFeatures
} from './feature-engineering.service.js';

export {
    pythonMlService,
    type AssetProfile
} from './python-ml.service.js';

export {
    factorWeightLearningService
} from './factor-weight-learning.service.js';

/**
 * Inicializa todos los servicios ML que requieren carga de estado
 */
export async function initializeMLServices(): Promise<void> {
  const { reinforcementLearningService } = await import('./reinforcement-learning.service.js');
  const { factorCorrelationService } = await import('./factor-correlation.service.js');
  const { metaLearningService } = await import('./meta-learning.service.js');
  const { probabilisticModelService } = await import('./probabilistic-model.service.js');

  await Promise.all([
    reinforcementLearningService.initialize(),
    factorCorrelationService.initialize(),
    metaLearningService.initialize(),
    probabilisticModelService.initialize(),
  ]);
}

/**
 * Estadísticas agregadas de todos los servicios ML
 */
export async function getMLServicesStats(): Promise<{
  reinforcementLearning: {
    stateCount: number;
    totalExperiences: number;
    avgQValue: number;
  };
  factorCorrelation: {
    pairCount: number;
    synergiesDetected: number;
    conflictsDetected: number;
  };
  metaLearning: {
    symbolCount: number;
    metaEpochs: number;
    totalTasks: number;
  };
  probabilisticModel: {
    sampleCount: number;
    calibrationScore: number;
    isCalibrated: boolean;
  };
}> {
  const { reinforcementLearningService } = await import('./reinforcement-learning.service.js');
  const { factorCorrelationService } = await import('./factor-correlation.service.js');
  const { metaLearningService } = await import('./meta-learning.service.js');
  const { probabilisticModelService } = await import('./probabilistic-model.service.js');

  const [rlStats, fcStats, mlStats, pmStats] = await Promise.all([
    reinforcementLearningService.getStats(),
    factorCorrelationService.getStats(),
    metaLearningService.getStats(),
    probabilisticModelService.getCalibrationStats(),
  ]);

  return {
    reinforcementLearning: {
      stateCount: rlStats.qTableSize,
      totalExperiences: rlStats.totalEpisodes,
      avgQValue: rlStats.avgReward,
    },
    factorCorrelation: {
      pairCount: fcStats.sampleSize,
      synergiesDetected: fcStats.synergiesCount,
      conflictsDetected: fcStats.redundanciesCount,
    },
    metaLearning: {
      symbolCount: mlStats.symbolCount,
      metaEpochs: mlStats.metaEpochs,
      totalTasks: mlStats.totalTasks,
    },
    probabilisticModel: {
      sampleCount: pmStats.sampleCount,
      calibrationScore: pmStats.calibrationScore,
      isCalibrated: pmStats.isCalibrated,
    },
  };
}
