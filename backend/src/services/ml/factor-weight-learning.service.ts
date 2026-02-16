/**
 * Factor Weight Learning Service
 * 
 * Ajusta los pesos de los factores (technical, trend, news, etc.)
 * basándose en predicciones verificadas, sin necesidad de Python.
 * 
 * Escribe directamente al archivo learned_weights.json
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { logger } from '../../middleware/logger.js';

// Ruta al archivo JSON de pesos
const WEIGHTS_FILE = resolve(process.cwd(), '../code/config/learned_weights.json');

// Constantes de aprendizaje
const LEARNING_RATE = 0.02; // Tasa de aprendizaje conservadora
const MIN_WEIGHT = 0.01;    // Peso mínimo por factor
const MAX_WEIGHT = 0.35;    // Peso máximo por factor
const MIN_SAMPLES_TO_LEARN = 5; // Mínimo de muestras para empezar a ajustar

// Factores disponibles (15 factores: 9 tradicionales + 6 intradía)
const FACTORS = [
  'trend', 'technical', 'sentiment', 'news', 'macro',
  'forex', 'institutional', 'seasonality', 'financials',
  // Factores intradía
  'intradayTrend', 'optionsFlow', 'volumeProfile',
  'divergences', 'volatilityIV', 'marketBreadth'
] as const;

type Factor = typeof FACTORS[number];
type Timeframe = 'intraday' | 'swing' | 'long';

interface WeightsData {
  version: string;
  updated_at: string;
  training_samples: number;
  weights: {
    intraday: Record<Factor, number>;
    swing: Record<Factor, number>;
    long: Record<Factor, number>;
  };
  metadata?: {
    learning_rate: number;
    momentum: number;
    final_loss?: number;
  };
  // Nuevo: tracking de rendimiento por factor
  factor_performance?: {
    [timeframe: string]: {
      [factor: string]: {
        correct_contributions: number;
        incorrect_contributions: number;
        total_samples: number;
        avg_accuracy_when_high: number;
        avg_accuracy_when_low: number;
      };
    };
  };
}

// Pesos por defecto
const DEFAULT_WEIGHTS: WeightsData = {
  version: '1.0',
  updated_at: new Date().toISOString(),
  training_samples: 0,
  weights: {
    intraday: {
      trend: 0.05, technical: 0.17, sentiment: 0.12, news: 0.08, macro: 0.03,
      forex: 0.02, institutional: 0.00, seasonality: 0.01, financials: 0.00,
      intradayTrend: 0.15, optionsFlow: 0.10, volumeProfile: 0.07,
      divergences: 0.07, volatilityIV: 0.06, marketBreadth: 0.07
    },
    swing: {
      trend: 0.12, technical: 0.17, sentiment: 0.10, news: 0.15, macro: 0.07,
      forex: 0.05, institutional: 0.07, seasonality: 0.02, financials: 0.04,
      intradayTrend: 0.05, optionsFlow: 0.03, volumeProfile: 0.02,
      divergences: 0.05, volatilityIV: 0.03, marketBreadth: 0.03
    },
    long: {
      trend: 0.06, technical: 0.08, sentiment: 0.04, news: 0.10, macro: 0.14,
      forex: 0.07, institutional: 0.13, seasonality: 0.04, financials: 0.23,
      intradayTrend: 0.00, optionsFlow: 0.02, volumeProfile: 0.01,
      divergences: 0.03, volatilityIV: 0.02, marketBreadth: 0.03
    }
  },
  metadata: {
    learning_rate: LEARNING_RATE,
    momentum: 0.8
  },
  factor_performance: {}
};

function readWeightsFile(): WeightsData {
  try {
    if (!existsSync(WEIGHTS_FILE)) {
      return { ...DEFAULT_WEIGHTS };
    }
    const content = readFileSync(WEIGHTS_FILE, 'utf-8');
    const data = JSON.parse(content) as WeightsData;
    
    // Asegurar que factor_performance existe
    if (!data.factor_performance) {
      data.factor_performance = {};
    }
    
    return data;
  } catch (error) {
    logger.error('[FactorWeightLearning] Error reading weights file:', error);
    return { ...DEFAULT_WEIGHTS };
  }
}

function saveWeightsFile(data: WeightsData): boolean {
  try {
    data.updated_at = new Date().toISOString();
    writeFileSync(WEIGHTS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    logger.info('[FactorWeightLearning] Weights saved to', WEIGHTS_FILE);
    return true;
  } catch (error) {
    logger.error('[FactorWeightLearning] Error saving weights file:', error);
    return false;
  }
}

function normalizeWeights(weights: Record<string, number>): Record<string, number> {
  const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
  if (total === 0) return weights;
  
  const normalized: Record<string, number> = {};
  for (const [factor, weight] of Object.entries(weights)) {
    normalized[factor] = Math.round((weight / total) * 1000) / 1000; // 3 decimales
  }
  return normalized;
}

function getTimeframe(timeframeDays: number): Timeframe {
  if (timeframeDays <= 1) return 'intraday';
  if (timeframeDays <= 7) return 'swing';
  return 'long';
}

export const factorWeightLearningService = {
  /**
   * Aprende de una predicción verificada y ajusta los pesos de factores
   */
  async learnFromVerification(prediction: {
    timeframeDays: number;
    directionCorrect: boolean;
    accuracyScore: number;
    factorScores: Record<string, number>;  // Score de cada factor (-100 a 100)
    factorWeights: Record<string, number>; // Peso usado de cada factor
    predictedChange: number;
    actualChange: number;
  }): Promise<{ adjusted: boolean; changes: string[] }> {
    const changes: string[] = [];
    
    const { timeframeDays, directionCorrect, accuracyScore, factorScores, factorWeights } = prediction;
    const timeframe = getTimeframe(timeframeDays);
    
    // Cargar pesos actuales
    const weightsData = readWeightsFile();
    
    // Inicializar performance tracking si no existe
    if (!weightsData.factor_performance) {
      weightsData.factor_performance = {};
    }
    if (!weightsData.factor_performance[timeframe]) {
      weightsData.factor_performance[timeframe] = {};
    }
    
    // Incrementar contador de muestras
    weightsData.training_samples = (weightsData.training_samples || 0) + 1;
    
    // Analizar contribución de cada factor
    const actualDirection = prediction.actualChange > 0 ? 1 : prediction.actualChange < 0 ? -1 : 0;
    
    for (const factor of FACTORS) {
      const score = factorScores[factor] || 0;
      const weight = factorWeights[factor] || weightsData.weights[timeframe][factor] || 0;
      
      // Inicializar tracking del factor
      if (!weightsData.factor_performance[timeframe][factor]) {
        weightsData.factor_performance[timeframe][factor] = {
          correct_contributions: 0,
          incorrect_contributions: 0,
          total_samples: 0,
          avg_accuracy_when_high: 0,
          avg_accuracy_when_low: 0,
        };
      }
      
      const perf = weightsData.factor_performance[timeframe][factor];
      
      // Si el factor tuvo un score significativo (|score| > 10)
      if (Math.abs(score) > 10) {
        const factorDirection = score > 0 ? 1 : -1;
        const factorWasRight = factorDirection === actualDirection;
        
        perf.total_samples += 1;
        
        if (factorWasRight) {
          perf.correct_contributions += 1;
        } else {
          perf.incorrect_contributions += 1;
        }
        
        // Actualizar promedio de accuracy cuando el factor fue alto/bajo
        if (Math.abs(score) > 50) {
          const n = perf.total_samples;
          perf.avg_accuracy_when_high = ((perf.avg_accuracy_when_high * (n - 1)) + accuracyScore) / n;
        } else {
          const n = perf.total_samples;
          perf.avg_accuracy_when_low = ((perf.avg_accuracy_when_low * (n - 1)) + accuracyScore) / n;
        }
      }
    }
    
    // Solo ajustar pesos si tenemos suficientes muestras
    if (weightsData.training_samples < MIN_SAMPLES_TO_LEARN) {
      saveWeightsFile(weightsData);
      return { adjusted: false, changes: [`Collecting samples: ${weightsData.training_samples}/${MIN_SAMPLES_TO_LEARN}`] };
    }
    
    // Calcular ajustes basados en performance acumulada
    const currentWeights = { ...weightsData.weights[timeframe] };
    const newWeights = { ...currentWeights };
    
    for (const factor of FACTORS) {
      const perf = weightsData.factor_performance[timeframe][factor];
      if (!perf || perf.total_samples < 3) continue;
      
      // Calcular tasa de acierto del factor
      const hitRate = perf.correct_contributions / perf.total_samples;
      
      // Ajuste basado en diferencia con 50% (neutral)
      // Si hitRate > 0.5, el factor ayuda más de lo que perjudica
      // Si hitRate < 0.5, el factor perjudica más de lo que ayuda
      const adjustment = (hitRate - 0.5) * LEARNING_RATE;
      
      const oldWeight = currentWeights[factor];
      let newWeight = oldWeight * (1 + adjustment);
      
      // Aplicar límites
      newWeight = Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, newWeight));
      newWeights[factor] = newWeight;
      
      // Registrar cambio significativo
      const changePct = ((newWeight - oldWeight) / oldWeight) * 100;
      if (Math.abs(changePct) > 1) {
        changes.push(`${factor}: ${(oldWeight * 100).toFixed(1)}% → ${(newWeight * 100).toFixed(1)}% (${changePct > 0 ? '+' : ''}${changePct.toFixed(1)}%)`);
      }
    }
    
    // Normalizar pesos para que sumen 1
    weightsData.weights[timeframe] = normalizeWeights(newWeights) as Record<Factor, number>;
    
    // Guardar
    saveWeightsFile(weightsData);
    
    if (changes.length > 0) {
      logger.info(`[FactorWeightLearning] ${timeframe} weights adjusted:`, changes.join(', '));
    }
    
    return { adjusted: changes.length > 0, changes };
  },

  /**
   * Obtiene el estado actual del aprendizaje
   */
  getStatus(): {
    trainingSamples: number;
    weightsUpdatedAt: string;
    factorPerformance: WeightsData['factor_performance'];
  } {
    const data = readWeightsFile();
    return {
      trainingSamples: data.training_samples,
      weightsUpdatedAt: data.updated_at,
      factorPerformance: data.factor_performance || {},
    };
  },

  /**
   * Obtiene los pesos actuales para un timeframe
   */
  getWeights(timeframe: Timeframe): Record<Factor, number> {
    const data = readWeightsFile();
    return data.weights[timeframe];
  },

  /**
   * Resetea el aprendizaje de pesos
   */
  reset(): boolean {
    return saveWeightsFile({ ...DEFAULT_WEIGHTS });
  },
};
