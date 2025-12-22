/**
 * Probabilistic Model Service
 * 
 * En lugar de predecir "+3.5%", genera una DISTRIBUCIÓN de probabilidades:
 * 
 * Ejemplo de output:
 * {
 *   scenarios: [
 *     { range: [-10, -5], probability: 0.05, label: "Caída fuerte" },
 *     { range: [-5, -2], probability: 0.10, label: "Caída moderada" },
 *     { range: [-2, 0], probability: 0.15, label: "Caída leve" },
 *     { range: [0, 2], probability: 0.25, label: "Subida leve" },
 *     { range: [2, 5], probability: 0.30, label: "Subida moderada" },
 *     { range: [5, 10], probability: 0.12, label: "Subida fuerte" },
 *     { range: [10, 20], probability: 0.03, label: "Rally" }
 *   ],
 *   expectedValue: 2.1,
 *   standardDeviation: 4.2,
 *   confidenceInterval95: [-6.1, 10.3]
 * }
 * 
 * Beneficios:
 * - Más honesto sobre la incertidumbre
 * - Permite al usuario ver la distribución completa
 * - Mejor para gestión de riesgo
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================================================
// TYPES
// ============================================================================

export type Timeframe = 'intraday' | 'swing' | 'long';
export type VolatilityCategory = 'low' | 'medium' | 'high';

export interface ProbabilityScenario {
  range: [number, number];  // [min%, max%]
  probability: number;      // 0-1
  label: string;
  color?: string;           // Para visualización
}

export interface ProbabilisticPrediction {
  // Distribución de escenarios
  scenarios: ProbabilityScenario[];
  
  // Estadísticas
  expectedValue: number;              // Media ponderada
  median: number;                     // Percentil 50
  mode: number;                       // Escenario más probable
  standardDeviation: number;          // Dispersión
  
  // Intervalos de confianza
  confidenceInterval50: [number, number];  // 50% de probabilidad
  confidenceInterval80: [number, number];  // 80% de probabilidad
  confidenceInterval95: [number, number];  // 95% de probabilidad
  
  // Probabilidades clave
  probabilityPositive: number;        // P(cambio > 0)
  probabilityNegative: number;        // P(cambio < 0)
  probabilityExtreme: number;         // P(|cambio| > 10%)
  
  // Skewness: ¿la distribución está sesgada?
  skew: 'bullish' | 'neutral' | 'bearish';
  skewStrength: number;               // 0-1
  
  // Meta
  modelConfidence: 'high' | 'medium' | 'low';
  basedOnSamples: number;
}

interface HistoricalOutcome {
  predictedChange: number;
  actualChange: number;
  timeframe: Timeframe;
  volatilityCategory: VolatilityCategory;
  confidence: number;
}

interface ProbabilisticModelState {
  historicalOutcomes: HistoricalOutcome[];
  errorDistributionByTimeframe: Record<Timeframe, number[]>;
  errorDistributionByVolatility: Record<VolatilityCategory, number[]>;
  lastCalibration: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = 'probabilistic-model-state';
const MIN_SAMPLES_FOR_CALIBRATION = 15;

// Rangos predefinidos para los escenarios
const SCENARIO_RANGES: Array<{ range: [number, number]; label: string; color: string }> = [
  { range: [-100, -10], label: 'Crash', color: '#8B0000' },
  { range: [-10, -5], label: 'Caída fuerte', color: '#DC143C' },
  { range: [-5, -2], label: 'Caída moderada', color: '#FF6347' },
  { range: [-2, 0], label: 'Caída leve', color: '#FFA07A' },
  { range: [0, 2], label: 'Subida leve', color: '#90EE90' },
  { range: [2, 5], label: 'Subida moderada', color: '#32CD32' },
  { range: [5, 10], label: 'Subida fuerte', color: '#228B22' },
  { range: [10, 100], label: 'Rally', color: '#006400' }
];

// ============================================================================
// SERVICE
// ============================================================================

class ProbabilisticModelService {
  private state: ProbabilisticModelState | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.state = JSON.parse(stored);
      } else {
        this.state = this.createEmptyState();
      }
      this.initialized = true;
    } catch (error) {
      console.error('[ProbabilisticModel] Error initializing:', error);
      this.state = this.createEmptyState();
      this.initialized = true;
    }
  }

  private createEmptyState(): ProbabilisticModelState {
    return {
      historicalOutcomes: [],
      errorDistributionByTimeframe: {
        intraday: [],
        swing: [],
        long: []
      },
      errorDistributionByVolatility: {
        low: [],
        medium: [],
        high: []
      },
      lastCalibration: 0
    };
  }

  private async saveState(): Promise<void> {
    if (!this.state) return;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (error) {
      console.error('[ProbabilisticModel] Error saving state:', error);
    }
  }

  /**
   * Registra un outcome histórico para calibrar el modelo
   */
  async recordOutcome(outcome: HistoricalOutcome): Promise<void> {
    await this.initialize();
    if (!this.state) return;

    this.state.historicalOutcomes.push(outcome);

    // Calcular error (predicted - actual)
    const error = outcome.predictedChange - outcome.actualChange;
    
    this.state.errorDistributionByTimeframe[outcome.timeframe].push(error);
    this.state.errorDistributionByVolatility[outcome.volatilityCategory].push(error);

    // Limitar tamaño
    const MAX_ERRORS = 500;
    for (const tf of ['intraday', 'swing', 'long'] as Timeframe[]) {
      if (this.state.errorDistributionByTimeframe[tf].length > MAX_ERRORS) {
        this.state.errorDistributionByTimeframe[tf] = 
          this.state.errorDistributionByTimeframe[tf].slice(-MAX_ERRORS);
      }
    }

    if (this.state.historicalOutcomes.length > 1000) {
      this.state.historicalOutcomes = this.state.historicalOutcomes.slice(-1000);
    }

    await this.saveState();
  }

  /**
   * Genera una predicción probabilística
   */
  async generateProbabilisticPrediction(
    pointPrediction: number,           // La predicción puntual existente (ej: +3.5%)
    confidence: number,                // Confianza 0-100
    timeframe: Timeframe,
    volatilityCategory: VolatilityCategory,
    context?: {
      symbol?: string;
      marketRegime?: string;
      uncertaintyScore?: number;
    }
  ): Promise<ProbabilisticPrediction> {
    await this.initialize();

    // Obtener distribución de errores históricos
    const errors = this.getRelevantErrors(timeframe, volatilityCategory);
    
    // Calcular estadísticas de error
    const { mean: errorMean, std: errorStd } = this.calculateStats(errors);
    
    // Ajustar std basándose en confianza y uncertainty
    let adjustedStd = errorStd;
    if (confidence < 50) adjustedStd *= 1.5;
    else if (confidence > 80) adjustedStd *= 0.8;
    
    if (context?.uncertaintyScore && context.uncertaintyScore > 50) {
      adjustedStd *= 1 + (context.uncertaintyScore - 50) / 100;
    }

    // Ajustar por volatilidad
    if (volatilityCategory === 'high') adjustedStd *= 1.3;
    else if (volatilityCategory === 'low') adjustedStd *= 0.7;

    // Usar mínimo razonable
    adjustedStd = Math.max(adjustedStd, this.getMinimumStd(timeframe));

    // Generar distribución de escenarios
    const scenarios = this.generateScenarios(pointPrediction, adjustedStd, errorMean);

    // Calcular estadísticas
    const expectedValue = pointPrediction - errorMean; // Corregir por bias histórico
    const standardDeviation = adjustedStd;

    // Intervalos de confianza (asumiendo distribución aproximadamente normal)
    const confidenceInterval50: [number, number] = [
      expectedValue - 0.675 * adjustedStd,
      expectedValue + 0.675 * adjustedStd
    ];
    const confidenceInterval80: [number, number] = [
      expectedValue - 1.28 * adjustedStd,
      expectedValue + 1.28 * adjustedStd
    ];
    const confidenceInterval95: [number, number] = [
      expectedValue - 1.96 * adjustedStd,
      expectedValue + 1.96 * adjustedStd
    ];

    // Probabilidades clave
    const probabilityPositive = this.calculateCumulativeProbability(0, scenarios, 'above');
    const probabilityNegative = 1 - probabilityPositive;
    const probabilityExtreme = 
      this.calculateCumulativeProbability(-10, scenarios, 'below') +
      this.calculateCumulativeProbability(10, scenarios, 'above');

    // Calcular skew
    const { skew, skewStrength } = this.calculateSkew(scenarios, expectedValue);

    // Encontrar median y mode
    const median = this.findPercentile(scenarios, 0.5);
    const modeScenario = scenarios.reduce((a, b) => a.probability > b.probability ? a : b);
    const mode = (modeScenario.range[0] + modeScenario.range[1]) / 2;

    // Confianza del modelo
    const sampleCount = errors.length;
    let modelConfidence: 'high' | 'medium' | 'low' = 'low';
    if (sampleCount >= 50) modelConfidence = 'high';
    else if (sampleCount >= 20) modelConfidence = 'medium';

    return {
      scenarios,
      expectedValue: Math.round(expectedValue * 100) / 100,
      median: Math.round(median * 100) / 100,
      mode: Math.round(mode * 100) / 100,
      standardDeviation: Math.round(standardDeviation * 100) / 100,
      confidenceInterval50: [
        Math.round(confidenceInterval50[0] * 100) / 100,
        Math.round(confidenceInterval50[1] * 100) / 100
      ],
      confidenceInterval80: [
        Math.round(confidenceInterval80[0] * 100) / 100,
        Math.round(confidenceInterval80[1] * 100) / 100
      ],
      confidenceInterval95: [
        Math.round(confidenceInterval95[0] * 100) / 100,
        Math.round(confidenceInterval95[1] * 100) / 100
      ],
      probabilityPositive: Math.round(probabilityPositive * 100) / 100,
      probabilityNegative: Math.round(probabilityNegative * 100) / 100,
      probabilityExtreme: Math.round(probabilityExtreme * 100) / 100,
      skew,
      skewStrength: Math.round(skewStrength * 100) / 100,
      modelConfidence,
      basedOnSamples: sampleCount
    };
  }

  /**
   * Obtiene errores relevantes (combinando timeframe y volatility)
   */
  private getRelevantErrors(timeframe: Timeframe, volatility: VolatilityCategory): number[] {
    if (!this.state) return [];

    const tfErrors = this.state.errorDistributionByTimeframe[timeframe] || [];
    const volErrors = this.state.errorDistributionByVolatility[volatility] || [];

    // Combinar con más peso al timeframe
    const combined = [...tfErrors, ...tfErrors, ...volErrors];
    
    // Si no hay suficientes datos, usar defaults
    if (combined.length < MIN_SAMPLES_FOR_CALIBRATION) {
      return this.getDefaultErrors(timeframe, volatility);
    }

    return combined;
  }

  /**
   * Errores por defecto cuando no hay datos históricos
   */
  private getDefaultErrors(timeframe: Timeframe, volatility: VolatilityCategory): number[] {
    // Simular distribución basada en características típicas
    const baseStd = timeframe === 'intraday' ? 1.5 :
                    timeframe === 'swing' ? 3.0 : 5.0;
    
    const volMultiplier = volatility === 'low' ? 0.6 :
                          volatility === 'medium' ? 1.0 : 1.5;

    const std = baseStd * volMultiplier;
    
    // Generar errores sintéticos con distribución normal
    const errors: number[] = [];
    for (let i = 0; i < 50; i++) {
      errors.push(this.randomNormal(0, std));
    }
    return errors;
  }

  /**
   * Genera número aleatorio con distribución normal (Box-Muller)
   */
  private randomNormal(mean: number, std: number): number {
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * std;
  }

  /**
   * Calcula media y desviación estándar
   */
  private calculateStats(values: number[]): { mean: number; std: number } {
    if (values.length === 0) return { mean: 0, std: 3 };

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    const std = Math.sqrt(variance);

    return { mean, std: std || 3 };
  }

  /**
   * Desviación estándar mínima por timeframe
   */
  private getMinimumStd(timeframe: Timeframe): number {
    switch (timeframe) {
      case 'intraday': return 0.8;
      case 'swing': return 1.5;
      case 'long': return 2.5;
    }
  }

  /**
   * Genera escenarios con probabilidades
   */
  private generateScenarios(
    center: number,
    std: number,
    bias: number
  ): ProbabilityScenario[] {
    const adjustedCenter = center - bias;

    return SCENARIO_RANGES.map(({ range, label, color }) => {
      const probability = this.normalCDF(range[1], adjustedCenter, std) - 
                          this.normalCDF(range[0], adjustedCenter, std);
      
      return {
        range,
        probability: Math.max(0, Math.min(1, probability)),
        label,
        color
      };
    }).filter(s => s.probability > 0.001); // Filtrar escenarios insignificantes
  }

  /**
   * CDF de distribución normal
   */
  private normalCDF(x: number, mean: number, std: number): number {
    const z = (x - mean) / std;
    return 0.5 * (1 + this.erf(z / Math.sqrt(2)));
  }

  /**
   * Error function approximation
   */
  private erf(x: number): number {
    const sign = x >= 0 ? 1 : -1;
    x = Math.abs(x);
    
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    
    return sign * y;
  }

  /**
   * Calcula probabilidad acumulada
   */
  private calculateCumulativeProbability(
    threshold: number,
    scenarios: ProbabilityScenario[],
    direction: 'above' | 'below'
  ): number {
    return scenarios.reduce((sum, s) => {
      if (direction === 'above' && s.range[0] >= threshold) {
        return sum + s.probability;
      } else if (direction === 'below' && s.range[1] <= threshold) {
        return sum + s.probability;
      }
      // Caso parcial
      if (direction === 'above' && s.range[0] < threshold && s.range[1] > threshold) {
        const fraction = (s.range[1] - threshold) / (s.range[1] - s.range[0]);
        return sum + s.probability * fraction;
      }
      if (direction === 'below' && s.range[0] < threshold && s.range[1] > threshold) {
        const fraction = (threshold - s.range[0]) / (s.range[1] - s.range[0]);
        return sum + s.probability * fraction;
      }
      return sum;
    }, 0);
  }

  /**
   * Encuentra el percentil X de la distribución
   */
  private findPercentile(scenarios: ProbabilityScenario[], percentile: number): number {
    let cumulative = 0;
    for (const s of scenarios) {
      cumulative += s.probability;
      if (cumulative >= percentile) {
        // Interpolar dentro del rango
        const excess = cumulative - percentile;
        const fractionInRange = 1 - (excess / s.probability);
        return s.range[0] + fractionInRange * (s.range[1] - s.range[0]);
      }
    }
    return scenarios[scenarios.length - 1]?.range[1] || 0;
  }

  /**
   * Calcula skew de la distribución
   */
  private calculateSkew(
    scenarios: ProbabilityScenario[],
    mean: number
  ): { skew: 'bullish' | 'neutral' | 'bearish'; skewStrength: number } {
    // Probabilidad de upside vs downside extremo
    const upsideProb = scenarios
      .filter(s => s.range[0] > mean)
      .reduce((sum, s) => sum + s.probability, 0);
    
    const downsideProb = scenarios
      .filter(s => s.range[1] < mean)
      .reduce((sum, s) => sum + s.probability, 0);

    const diff = upsideProb - downsideProb;
    
    if (Math.abs(diff) < 0.1) {
      return { skew: 'neutral', skewStrength: 0 };
    }

    return {
      skew: diff > 0 ? 'bullish' : 'bearish',
      skewStrength: Math.min(1, Math.abs(diff) * 2)
    };
  }

  /**
   * Obtiene estadísticas del modelo
   */
  async getModelStats(): Promise<{
    totalSamples: number;
    samplesByTimeframe: Record<Timeframe, number>;
    samplesByVolatility: Record<VolatilityCategory, number>;
    overallBias: number;
    calibrationQuality: 'good' | 'moderate' | 'poor' | 'uncalibrated';
  }> {
    await this.initialize();

    if (!this.state) {
      return {
        totalSamples: 0,
        samplesByTimeframe: { intraday: 0, swing: 0, long: 0 },
        samplesByVolatility: { low: 0, medium: 0, high: 0 },
        overallBias: 0,
        calibrationQuality: 'uncalibrated'
      };
    }

    const allErrors = [
      ...this.state.errorDistributionByTimeframe.intraday,
      ...this.state.errorDistributionByTimeframe.swing,
      ...this.state.errorDistributionByTimeframe.long
    ];

    const { mean: overallBias } = this.calculateStats(allErrors);

    let calibrationQuality: 'good' | 'moderate' | 'poor' | 'uncalibrated' = 'uncalibrated';
    if (allErrors.length >= 100) calibrationQuality = 'good';
    else if (allErrors.length >= 50) calibrationQuality = 'moderate';
    else if (allErrors.length >= 15) calibrationQuality = 'poor';

    return {
      totalSamples: this.state.historicalOutcomes.length,
      samplesByTimeframe: {
        intraday: this.state.errorDistributionByTimeframe.intraday.length,
        swing: this.state.errorDistributionByTimeframe.swing.length,
        long: this.state.errorDistributionByTimeframe.long.length
      },
      samplesByVolatility: {
        low: this.state.errorDistributionByVolatility.low.length,
        medium: this.state.errorDistributionByVolatility.medium.length,
        high: this.state.errorDistributionByVolatility.high.length
      },
      overallBias: Math.round(overallBias * 100) / 100,
      calibrationQuality
    };
  }

  /**
   * Reset del modelo
   */
  async reset(): Promise<void> {
    this.state = this.createEmptyState();
    await this.saveState();
  }
}

// Singleton export
export const probabilisticModelService = new ProbabilisticModelService();
