/**
 * Probabilistic Model Service
 * 
 * Genera distribuciones de probabilidad en lugar de predicciones puntuales.
 * Proporciona intervalos de confianza y probabilidades de escenarios.
 * 
 * - Normal distribution para cambios esperados
 * - Skew-normal para mercados con sesgo direccional
 * - Mixture models para escenarios bimodales
 */

import { prisma } from '../../config/database.js';
import { logger } from '../../middleware/logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ProbabilityDistribution {
  type: 'normal' | 'skew_normal' | 'mixture';
  parameters: {
    mean: number;
    stdDev: number;
    skewness?: number;
    kurtosis?: number;
    // Para mixture
    weights?: number[];
    means?: number[];
    stdDevs?: number[];
  };
  percentiles: {
    p5: number;
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
  };
}

export interface ConfidenceInterval {
  lower: number;
  upper: number;
  confidence: number; // 0.90, 0.95, etc
}

export interface ScenarioProbability {
  scenario: string;
  probability: number;
  expectedChange: number;
  description: string;
}

export interface ProbabilisticPrediction {
  symbol: string;
  pointEstimate: number;
  distribution: ProbabilityDistribution;
  intervals: ConfidenceInterval[];
  scenarios: ScenarioProbability[];
  riskMetrics: {
    valueAtRisk95: number; // VaR al 95%
    expectedShortfall: number; // CVaR
    maxDrawdown: number;
    uptailProbability: number;
    downtailProbability: number;
  };
  calibration: {
    isCalibrated: boolean;
    calibrationScore: number;
    lastCalibration: number | null;
  };
}

interface CalibrationData {
  symbol: string;
  predictedMean: number;
  predictedStdDev: number;
  actualChange: number;
  timestamp: number;
}

interface CalibrationState {
  historicalCalibrations: CalibrationData[];
  overallBias: number; // Sesgo sistemático
  volatilityMultiplier: number; // Para ajustar varianza
  calibrationScore: number; // 0-1
  lastUpdate: number;
}

// Cache
let calibrationState: CalibrationState | null = null;
let calibrationLoaded = false;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Box-Muller transform para generar normales
 */
function boxMuller(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * CDF de la distribución normal estándar
 */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Inverse CDF (quantile function) aproximada
 */
function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  // Rational approximation (Abramowitz and Stegun)
  const a = [
    -3.969683028665376e+01,
    2.209460984245205e+02,
    -2.759285104469687e+02,
    1.383577518672690e+02,
    -3.066479806614716e+01,
    2.506628277459239e+00
  ];
  const b = [
    -5.447609879822406e+01,
    1.615858368580409e+02,
    -1.556989798598866e+02,
    6.680131188771972e+01,
    -1.328068155288572e+01
  ];
  const c = [
    -7.784894002430293e-03,
    -3.223964580411365e-01,
    -2.400758277161838e+00,
    -2.549732539343734e+00,
    4.374664141464968e+00,
    2.938163982698783e+00
  ];
  const d = [
    7.784695709041462e-03,
    3.224671290700398e-01,
    2.445134137142996e+00,
    3.754408661907416e+00
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let q: number;
  let r: number;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
           ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
           (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
            ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
}

// ============================================================================
// SERVICE
// ============================================================================

export const probabilisticModelService = {
  async initialize(): Promise<void> {
    if (calibrationLoaded) return;

    try {
      const stored = await prisma.mLModelState.findFirst({
        where: { modelType: 'probabilistic_model' },
        orderBy: { createdAt: 'desc' },
      });

      if (stored?.stateJson) {
        calibrationState = JSON.parse(stored.stateJson);
        logger.info(`[ProbabilisticModel] Loaded calibration with ${calibrationState?.historicalCalibrations.length || 0} samples`);
      } else {
        calibrationState = this.createEmptyState();
      }
      calibrationLoaded = true;
    } catch (error) {
      logger.error('[ProbabilisticModel] Error initializing:', error);
      calibrationState = this.createEmptyState();
      calibrationLoaded = true;
    }
  },

  createEmptyState(): CalibrationState {
    return {
      historicalCalibrations: [],
      overallBias: 0,
      volatilityMultiplier: 1.0,
      calibrationScore: 0.5,
      lastUpdate: 0,
    };
  },

  async saveState(): Promise<void> {
    if (!calibrationState) return;

    try {
      await prisma.mLModelState.upsert({
        where: { 
          modelType_version: { 
            modelType: 'probabilistic_model', 
            version: 1 
          } 
        },
        update: {
          stateJson: JSON.stringify(calibrationState),
          updatedAt: new Date(),
        },
        create: {
          modelType: 'probabilistic_model',
          version: 1,
          stateJson: JSON.stringify(calibrationState),
        },
      });
    } catch (error) {
      logger.error('[ProbabilisticModel] Error saving:', error);
    }
  },

  /**
   * Genera predicción probabilística completa
   */
  async generateProbabilisticPrediction(
    symbol: string,
    pointEstimate: number,
    confidence: number,
    volatility: number = 0.02,
    marketConditions?: {
      regime?: 'trending' | 'mean_reverting' | 'volatile';
      skewness?: number;
      hasEvents?: boolean;
    }
  ): Promise<ProbabilisticPrediction> {
    await this.initialize();

    // Ajustar parámetros con calibración histórica
    const adjustedMean = pointEstimate - (calibrationState?.overallBias || 0);
    const adjustedStdDev = volatility * (calibrationState?.volatilityMultiplier || 1.0);

    // Determinar tipo de distribución
    const skewness = marketConditions?.skewness || 0;
    const distributionType = this.determineDistributionType(skewness, marketConditions?.regime);

    // Calcular distribución
    const distribution = this.calculateDistribution(
      adjustedMean,
      adjustedStdDev,
      skewness,
      distributionType
    );

    // Calcular intervalos de confianza
    const intervals = this.calculateConfidenceIntervals(distribution);

    // Generar escenarios
    const scenarios = this.generateScenarios(distribution, marketConditions);

    // Métricas de riesgo
    const riskMetrics = this.calculateRiskMetrics(distribution);

    return {
      symbol,
      pointEstimate: adjustedMean,
      distribution,
      intervals,
      scenarios,
      riskMetrics,
      calibration: {
        isCalibrated: (calibrationState?.historicalCalibrations.length || 0) >= 20,
        calibrationScore: calibrationState?.calibrationScore || 0.5,
        lastCalibration: calibrationState?.lastUpdate || null,
      },
    };
  },

  determineDistributionType(
    skewness: number,
    regime?: string
  ): 'normal' | 'skew_normal' | 'mixture' {
    if (regime === 'volatile' || Math.abs(skewness) > 0.5) {
      return 'mixture';
    }
    if (Math.abs(skewness) > 0.2) {
      return 'skew_normal';
    }
    return 'normal';
  },

  calculateDistribution(
    mean: number,
    stdDev: number,
    skewness: number,
    type: 'normal' | 'skew_normal' | 'mixture'
  ): ProbabilityDistribution {
    const percentiles: ProbabilityDistribution['percentiles'] = {
      p5: 0, p10: 0, p25: 0, p50: 0, p75: 0, p90: 0, p95: 0
    };

    if (type === 'normal') {
      percentiles.p5 = mean + stdDev * normalQuantile(0.05);
      percentiles.p10 = mean + stdDev * normalQuantile(0.10);
      percentiles.p25 = mean + stdDev * normalQuantile(0.25);
      percentiles.p50 = mean;
      percentiles.p75 = mean + stdDev * normalQuantile(0.75);
      percentiles.p90 = mean + stdDev * normalQuantile(0.90);
      percentiles.p95 = mean + stdDev * normalQuantile(0.95);

      return {
        type: 'normal',
        parameters: { mean, stdDev },
        percentiles,
      };
    }

    if (type === 'skew_normal') {
      // Aproximación de skew-normal
      const skewAdjust = skewness * 0.3;
      percentiles.p5 = mean + stdDev * (normalQuantile(0.05) + skewAdjust);
      percentiles.p10 = mean + stdDev * (normalQuantile(0.10) + skewAdjust * 0.8);
      percentiles.p25 = mean + stdDev * (normalQuantile(0.25) + skewAdjust * 0.5);
      percentiles.p50 = mean + skewAdjust * stdDev * 0.3;
      percentiles.p75 = mean + stdDev * (normalQuantile(0.75) - skewAdjust * 0.5);
      percentiles.p90 = mean + stdDev * (normalQuantile(0.90) - skewAdjust * 0.8);
      percentiles.p95 = mean + stdDev * (normalQuantile(0.95) - skewAdjust);

      return {
        type: 'skew_normal',
        parameters: { mean, stdDev, skewness },
        percentiles,
      };
    }

    // Mixture model (bimodal)
    const separation = stdDev * 0.5;
    const mean1 = mean - separation;
    const mean2 = mean + separation;
    const mixStdDev = stdDev * 0.7;

    percentiles.p5 = mean1 - mixStdDev * 1.645;
    percentiles.p10 = mean1 - mixStdDev * 1.28;
    percentiles.p25 = mean1;
    percentiles.p50 = mean;
    percentiles.p75 = mean2;
    percentiles.p90 = mean2 + mixStdDev * 1.28;
    percentiles.p95 = mean2 + mixStdDev * 1.645;

    return {
      type: 'mixture',
      parameters: {
        mean,
        stdDev,
        weights: [0.5, 0.5],
        means: [mean1, mean2],
        stdDevs: [mixStdDev, mixStdDev],
      },
      percentiles,
    };
  },

  calculateConfidenceIntervals(dist: ProbabilityDistribution): ConfidenceInterval[] {
    return [
      {
        confidence: 0.50,
        lower: dist.percentiles.p25,
        upper: dist.percentiles.p75,
      },
      {
        confidence: 0.80,
        lower: dist.percentiles.p10,
        upper: dist.percentiles.p90,
      },
      {
        confidence: 0.90,
        lower: dist.percentiles.p5,
        upper: dist.percentiles.p95,
      },
    ];
  },

  generateScenarios(
    dist: ProbabilityDistribution,
    conditions?: { regime?: string; hasEvents?: boolean }
  ): ScenarioProbability[] {
    const mean = dist.parameters.mean;
    const stdDev = dist.parameters.stdDev;

    const scenarios: ScenarioProbability[] = [
      {
        scenario: 'Muy negativo',
        probability: normalCDF((dist.percentiles.p5 - mean) / stdDev),
        expectedChange: dist.percentiles.p5,
        description: 'Caída significativa, peor de lo esperado',
      },
      {
        scenario: 'Negativo',
        probability: normalCDF(0) - normalCDF((dist.percentiles.p5 - mean) / stdDev),
        expectedChange: (dist.percentiles.p5 + dist.percentiles.p25) / 2,
        description: 'Descenso moderado pero manejable',
      },
      {
        scenario: 'Neutral',
        probability: normalCDF((dist.percentiles.p75 - mean) / stdDev) - normalCDF((dist.percentiles.p25 - mean) / stdDev),
        expectedChange: mean,
        description: 'Movimiento cerca del esperado',
      },
      {
        scenario: 'Positivo',
        probability: normalCDF((dist.percentiles.p95 - mean) / stdDev) - normalCDF((dist.percentiles.p75 - mean) / stdDev),
        expectedChange: (dist.percentiles.p75 + dist.percentiles.p95) / 2,
        description: 'Subida moderada favorable',
      },
      {
        scenario: 'Muy positivo',
        probability: 1 - normalCDF((dist.percentiles.p95 - mean) / stdDev),
        expectedChange: dist.percentiles.p95,
        description: 'Rally significativo, mejor de lo esperado',
      },
    ];

    // Ajustar por condiciones de mercado
    if (conditions?.hasEvents) {
      // Aumentar probabilidad de escenarios extremos
      scenarios[0].probability *= 1.3;
      scenarios[4].probability *= 1.3;
      scenarios[2].probability *= 0.7;
    }

    // Normalizar probabilidades
    const sum = scenarios.reduce((s, sc) => s + sc.probability, 0);
    for (const s of scenarios) s.probability /= sum;

    return scenarios;
  },

  calculateRiskMetrics(dist: ProbabilityDistribution): ProbabilisticPrediction['riskMetrics'] {
    const mean = dist.parameters.mean;
    const stdDev = dist.parameters.stdDev;

    // Value at Risk (5%)
    const var95 = dist.percentiles.p5;

    // Expected Shortfall (promedio de pérdidas más allá de VaR)
    // Aproximación: E[X | X < VaR] ≈ VaR - stdDev * pdf(VaR) / cdf(VaR)
    const expectedShortfall = var95 - stdDev * 0.2;

    // Max Drawdown estimado (2 std devs)
    const maxDrawdown = mean - 2 * stdDev;

    // Probabilidad de cola superior (>1 std)
    const uptailProbability = 1 - normalCDF(1);

    // Probabilidad de cola inferior (<-1 std)
    const downtailProbability = normalCDF(-1);

    return {
      valueAtRisk95: var95,
      expectedShortfall,
      maxDrawdown,
      uptailProbability,
      downtailProbability,
    };
  },

  /**
   * Registra resultado para calibración
   */
  async recordCalibration(
    symbol: string,
    predictedMean: number,
    predictedStdDev: number,
    actualChange: number
  ): Promise<void> {
    await this.initialize();
    if (!calibrationState) return;

    calibrationState.historicalCalibrations.push({
      symbol,
      predictedMean,
      predictedStdDev,
      actualChange,
      timestamp: Date.now(),
    });

    // Mantener máximo 200 calibraciones
    if (calibrationState.historicalCalibrations.length > 200) {
      calibrationState.historicalCalibrations = calibrationState.historicalCalibrations.slice(-200);
    }

    // Recalibrar cada 20 nuevos datos
    if (calibrationState.historicalCalibrations.length % 20 === 0) {
      await this.recalibrate();
    }

    await this.saveState();
  },

  /**
   * Recalibra el modelo
   */
  async recalibrate(): Promise<void> {
    if (!calibrationState || calibrationState.historicalCalibrations.length < 10) return;

    const calibrations = calibrationState.historicalCalibrations;

    // Calcular sesgo
    let sumBias = 0;
    for (const c of calibrations) {
      sumBias += c.predictedMean - c.actualChange;
    }
    calibrationState.overallBias = sumBias / calibrations.length;

    // Calcular multiplicador de volatilidad
    let sumPredictedVar = 0;
    let sumActualVar = 0;
    for (const c of calibrations) {
      const error = (c.actualChange - c.predictedMean) ** 2;
      sumActualVar += error;
      sumPredictedVar += c.predictedStdDev ** 2;
    }
    const avgPredictedVar = sumPredictedVar / calibrations.length;
    const avgActualVar = sumActualVar / calibrations.length;
    calibrationState.volatilityMultiplier = Math.sqrt(avgActualVar / avgPredictedVar);
    calibrationState.volatilityMultiplier = Math.max(0.5, Math.min(2.0, calibrationState.volatilityMultiplier));

    // Calcular calibration score (qué tan bien calibrados estamos)
    // Un modelo bien calibrado tiene el 95% de resultados dentro del intervalo del 95%
    let inInterval = 0;
    for (const c of calibrations) {
      const z = (c.actualChange - c.predictedMean) / c.predictedStdDev;
      if (Math.abs(z) <= 1.96) inInterval++;
    }
    const empiricalCoverage = inInterval / calibrations.length;
    calibrationState.calibrationScore = 1 - Math.abs(0.95 - empiricalCoverage);

    calibrationState.lastUpdate = Date.now();

    logger.info(`[ProbabilisticModel] Recalibrated: bias=${calibrationState.overallBias.toFixed(4)}, volMult=${calibrationState.volatilityMultiplier.toFixed(2)}, score=${calibrationState.calibrationScore.toFixed(2)}`);
  },

  /**
   * Obtiene estadísticas de calibración
   */
  async getCalibrationStats(): Promise<{
    sampleCount: number;
    bias: number;
    volatilityMultiplier: number;
    calibrationScore: number;
    isCalibrated: boolean;
    lastUpdate: number | null;
  }> {
    await this.initialize();

    return {
      sampleCount: calibrationState?.historicalCalibrations.length || 0,
      bias: calibrationState?.overallBias || 0,
      volatilityMultiplier: calibrationState?.volatilityMultiplier || 1,
      calibrationScore: calibrationState?.calibrationScore || 0.5,
      isCalibrated: (calibrationState?.historicalCalibrations.length || 0) >= 20,
      lastUpdate: calibrationState?.lastUpdate || null,
    };
  },

  /**
   * Resetea el modelo probabilístico a estado inicial (también en memoria)
   */
  async reset(): Promise<void> {
    calibrationState = this.createEmptyState();
    stateLoaded = true;
    logger.info('[ProbabilisticModel] Model reset to initial state');
  },
};
