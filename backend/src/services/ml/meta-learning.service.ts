/**
 * Meta-Learning Service (MAML-inspired)
 * 
 * "Aprender a aprender" - Permite adaptación rápida a nuevos símbolos
 * con muy pocos datos (few-shot learning).
 * 
 * - Mantiene un "meta-modelo" entrenado con TODOS los símbolos
 * - Cuando llega un nuevo símbolo con 2-5 predicciones, hace fine-tuning rápido
 * - Transfiere conocimiento de símbolos similares
 */

import { prisma } from '../../config/database.js';
import { logger } from '../../middleware/logger.js';

// ============================================================================
// TYPES
// ============================================================================

export type FactorName = 
  | 'trend' | 'technical' | 'sentiment' | 'news' | 'macro'
  | 'forex' | 'institutional' | 'seasonality'
  | 'financials' | 'expectations';

export type Timeframe = 'intraday' | 'swing' | 'long';

interface SymbolProfile {
  symbol: string;
  assetType: 'stock' | 'crypto' | 'etf' | 'forex' | 'commodity';
  sector?: string;
  volatilityProfile: 'low' | 'medium' | 'high';
  predictionCount: number;
  avgAccuracy: number;
  factorResponses: Record<FactorName, number>;
  lastUpdated: number;
}

interface MetaWeights {
  baseWeights: Record<FactorName, number>;
  adaptationGradients: {
    byAssetType: Record<string, Record<FactorName, number>>;
    bySector: Record<string, Record<FactorName, number>>;
    byVolatility: Record<string, Record<FactorName, number>>;
  };
  optimalLearningRates: {
    fewShot: number;
    lowData: number;
    normal: number;
  };
}

interface PredictionSample {
  factorScores: Record<FactorName, number>;
  timeframe: Timeframe;
  predictedChange: number;
  actualChange: number;
  accuracyScore: number;
}

interface MetaLearningState {
  metaWeights: MetaWeights;
  symbolProfiles: Record<string, SymbolProfile>;
  similarityMatrix: Record<string, Record<string, number>>;
  trainingHistory: {
    metaEpochs: number;
    totalTasks: number;
    avgMetaLoss: number;
    lastTraining: number;
  };
}

export interface FewShotAdaptation {
  adaptedWeights: Record<FactorName, number>;
  confidence: number;
  adaptationSteps: number;
  sourceSymbols: string[];
  explanation: string;
}

export interface SymbolRecommendation {
  symbol: string;
  recommendedWeights: Record<FactorName, number>;
  confidence: number;
  basedOn: 'direct' | 'similar_symbols' | 'asset_type' | 'default';
  similarSymbols: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const META_LEARNING_RATE = 0.01;
const ADAPTATION_LEARNING_RATE = 0.1;
const ADAPTATION_STEPS = 3;
const MIN_SUPPORT_SIZE = 2;
const SIMILARITY_THRESHOLD = 0.5;

const ALL_FACTORS: FactorName[] = [
  'trend', 'technical', 'sentiment', 'news', 'macro',
  'forex', 'institutional', 'seasonality',
  'financials', 'expectations'
];

const DEFAULT_WEIGHTS: Record<FactorName, number> = {
  trend: 0.14, technical: 0.17, sentiment: 0.11, news: 0.09,
  macro: 0.06, forex: 0.04, institutional: 0.11,
  seasonality: 0.05, financials: 0.12, expectations: 0.11
};

// Cache
let state: MetaLearningState | null = null;
let stateLoaded = false;

// ============================================================================
// SERVICE
// ============================================================================

export const metaLearningService = {
  async initialize(): Promise<void> {
    if (stateLoaded) return;
    
    try {
      const stored = await prisma.mLModelState.findFirst({
        where: { modelType: 'meta_learning' },
        orderBy: { createdAt: 'desc' },
      });
      
      if (stored?.stateJson) {
        state = JSON.parse(stored.stateJson);
        logger.info(`[MetaLearning] Loaded state with ${Object.keys(state?.symbolProfiles || {}).length} profiles`);
      } else {
        state = this.createEmptyState();
      }
      stateLoaded = true;
    } catch (error) {
      logger.error('[MetaLearning] Error initializing:', error);
      state = this.createEmptyState();
      stateLoaded = true;
    }
  },

  createEmptyState(): MetaLearningState {
    return {
      metaWeights: {
        baseWeights: { ...DEFAULT_WEIGHTS },
        adaptationGradients: {
          byAssetType: {},
          bySector: {},
          byVolatility: {},
        },
        optimalLearningRates: {
          fewShot: 0.15,
          lowData: 0.08,
          normal: 0.03,
        },
      },
      symbolProfiles: {},
      similarityMatrix: {},
      trainingHistory: {
        metaEpochs: 0,
        totalTasks: 0,
        avgMetaLoss: 0,
        lastTraining: 0,
      },
    };
  },

  async saveState(): Promise<void> {
    if (!state) return;
    
    try {
      await prisma.mLModelState.upsert({
        where: { 
          modelType_version: { 
            modelType: 'meta_learning', 
            version: 1 
          } 
        },
        update: {
          stateJson: JSON.stringify(state),
          updatedAt: new Date(),
        },
        create: {
          modelType: 'meta_learning',
          version: 1,
          stateJson: JSON.stringify(state),
        },
      });
    } catch (error) {
      logger.error('[MetaLearning] Error saving:', error);
    }
  },

  /**
   * Adapta pesos para un nuevo símbolo con pocos datos
   */
  async adaptForSymbol(
    symbol: string,
    samples: PredictionSample[],
    assetType: string,
    volatility: 'low' | 'medium' | 'high'
  ): Promise<FewShotAdaptation> {
    await this.initialize();
    if (!state) {
      return {
        adaptedWeights: { ...DEFAULT_WEIGHTS },
        confidence: 0.3,
        adaptationSteps: 0,
        sourceSymbols: [],
        explanation: 'Meta-learning no inicializado',
      };
    }

    // Empezar con pesos base
    const weights = { ...state.metaWeights.baseWeights };
    const sourceSymbols: string[] = [];

    // Aplicar gradientes por tipo de activo
    const typeGradients = state.metaWeights.adaptationGradients.byAssetType[assetType];
    if (typeGradients) {
      for (const factor of ALL_FACTORS) {
        if (typeGradients[factor]) {
          weights[factor] += typeGradients[factor] * ADAPTATION_LEARNING_RATE;
        }
      }
    }

    // Aplicar gradientes por volatilidad
    const volGradients = state.metaWeights.adaptationGradients.byVolatility[volatility];
    if (volGradients) {
      for (const factor of ALL_FACTORS) {
        if (volGradients[factor]) {
          weights[factor] += volGradients[factor] * ADAPTATION_LEARNING_RATE * 0.5;
        }
      }
    }

    // Buscar símbolos similares
    const similarSymbols = this.findSimilarSymbols(symbol, assetType, volatility);
    sourceSymbols.push(...similarSymbols.slice(0, 3));

    // Transferir conocimiento de símbolos similares
    for (const similar of similarSymbols.slice(0, 3)) {
      const profile = state.symbolProfiles[similar];
      if (profile && profile.predictionCount >= 5) {
        for (const factor of ALL_FACTORS) {
          if (profile.factorResponses[factor]) {
            weights[factor] += profile.factorResponses[factor] * 0.05;
          }
        }
      }
    }

    // Fine-tuning con muestras locales
    let steps = 0;
    if (samples.length >= MIN_SUPPORT_SIZE) {
      for (let step = 0; step < ADAPTATION_STEPS; step++) {
        for (const sample of samples) {
          // Calcular predicción
          let predicted = 0;
          let totalWeight = 0;
          for (const factor of ALL_FACTORS) {
            const score = sample.factorScores[factor];
            if (score !== undefined) {
              predicted += score * weights[factor];
              totalWeight += weights[factor];
            }
          }
          if (totalWeight > 0) predicted = (predicted / totalWeight) / 100 * 5;

          // Error y gradiente
          const error = sample.actualChange - predicted;
          for (const factor of ALL_FACTORS) {
            const score = sample.factorScores[factor];
            if (score !== undefined) {
              const gradient = error * (score / 100);
              weights[factor] += ADAPTATION_LEARNING_RATE * gradient;
              weights[factor] = Math.max(0.01, Math.min(0.4, weights[factor]));
            }
          }
        }
        steps++;
      }
    }

    // Normalizar pesos
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    for (const factor of ALL_FACTORS) {
      weights[factor] /= sum;
    }

    // Calcular confianza
    let confidence = 0.3;
    if (samples.length >= 5) confidence = 0.5;
    if (samples.length >= 10) confidence = 0.7;
    if (similarSymbols.length > 0) confidence += 0.1;

    const explanation = this.generateExplanation(samples.length, similarSymbols, assetType);

    logger.info(`[MetaLearning] Adapted weights for ${symbol}: ${steps} steps, ${similarSymbols.length} similar symbols`);

    return {
      adaptedWeights: weights,
      confidence: Math.min(0.9, confidence),
      adaptationSteps: steps,
      sourceSymbols,
      explanation,
    };
  },

  /**
   * Busca símbolos similares
   */
  findSimilarSymbols(
    symbol: string,
    assetType: string,
    volatility: 'low' | 'medium' | 'high'
  ): string[] {
    if (!state) return [];

    const similar: Array<{ symbol: string; score: number }> = [];

    for (const [sym, profile] of Object.entries(state.symbolProfiles)) {
      if (sym === symbol) continue;
      if (profile.predictionCount < 3) continue;

      let score = 0;
      
      // Mismo tipo de activo
      if (profile.assetType === assetType) score += 0.4;
      
      // Misma volatilidad
      if (profile.volatilityProfile === volatility) score += 0.3;
      
      // Buen accuracy
      if (profile.avgAccuracy > 60) score += 0.2;
      
      // Muchas predicciones
      if (profile.predictionCount > 10) score += 0.1;

      if (score >= SIMILARITY_THRESHOLD) {
        similar.push({ symbol: sym, score });
      }
    }

    return similar
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(s => s.symbol);
  },

  generateExplanation(
    sampleCount: number,
    similarSymbols: string[],
    assetType: string
  ): string {
    const parts: string[] = [];

    if (sampleCount < MIN_SUPPORT_SIZE) {
      parts.push('Few-shot: Sin datos locales suficientes.');
    } else if (sampleCount < 5) {
      parts.push(`Few-shot: Adaptado con ${sampleCount} muestras.`);
    } else {
      parts.push(`Adaptado con ${sampleCount} muestras.`);
    }

    if (similarSymbols.length > 0) {
      parts.push(`Transferencia de: ${similarSymbols.slice(0, 2).join(', ')}.`);
    }

    parts.push(`Perfil: ${assetType}.`);

    return parts.join(' ');
  },

  /**
   * Actualiza perfil de un símbolo con nueva predicción verificada
   */
  async updateSymbolProfile(
    symbol: string,
    assetType: string,
    volatility: 'low' | 'medium' | 'high',
    sector: string | undefined,
    sample: PredictionSample
  ): Promise<void> {
    await this.initialize();
    if (!state) return;

    if (!state.symbolProfiles[symbol]) {
      state.symbolProfiles[symbol] = {
        symbol,
        assetType: assetType as any,
        sector,
        volatilityProfile: volatility,
        predictionCount: 0,
        avgAccuracy: 0,
        factorResponses: {} as Record<FactorName, number>,
        lastUpdated: Date.now(),
      };
    }

    const profile = state.symbolProfiles[symbol];
    
    // Actualizar accuracy promedio
    const oldTotal = profile.avgAccuracy * profile.predictionCount;
    profile.predictionCount++;
    profile.avgAccuracy = (oldTotal + sample.accuracyScore) / profile.predictionCount;
    
    // Actualizar respuestas de factores
    for (const factor of ALL_FACTORS) {
      const score = sample.factorScores[factor];
      if (score !== undefined) {
        const response = score * (sample.accuracyScore / 100);
        if (!profile.factorResponses[factor]) {
          profile.factorResponses[factor] = response;
        } else {
          profile.factorResponses[factor] = 
            profile.factorResponses[factor] * 0.8 + response * 0.2;
        }
      }
    }
    
    profile.lastUpdated = Date.now();

    // Guardar cada 5 actualizaciones
    if (profile.predictionCount % 5 === 0) {
      await this.saveState();
    }
  },

  /**
   * Obtiene recomendación de pesos para un símbolo
   */
  async getWeightsRecommendation(
    symbol: string,
    assetType: string,
    volatility: 'low' | 'medium' | 'high'
  ): Promise<SymbolRecommendation> {
    await this.initialize();
    
    // Verificar si tenemos perfil directo
    const profile = state?.symbolProfiles[symbol];
    if (profile && profile.predictionCount >= 10) {
      const weights = { ...DEFAULT_WEIGHTS };
      for (const factor of ALL_FACTORS) {
        if (profile.factorResponses[factor]) {
          weights[factor] *= 1 + profile.factorResponses[factor] * 0.1;
        }
      }
      const sum = Object.values(weights).reduce((a, b) => a + b, 0);
      for (const factor of ALL_FACTORS) weights[factor] /= sum;

      return {
        symbol,
        recommendedWeights: weights,
        confidence: 0.8,
        basedOn: 'direct',
        similarSymbols: [],
      };
    }

    // Buscar símbolos similares
    const similarSymbols = this.findSimilarSymbols(symbol, assetType, volatility);
    
    if (similarSymbols.length > 0 && state) {
      const weights = { ...DEFAULT_WEIGHTS };
      let count = 0;
      
      for (const similar of similarSymbols.slice(0, 3)) {
        const simProfile = state.symbolProfiles[similar];
        if (simProfile) {
          for (const factor of ALL_FACTORS) {
            if (simProfile.factorResponses[factor]) {
              weights[factor] += simProfile.factorResponses[factor] * 0.05;
            }
          }
          count++;
        }
      }
      
      if (count > 0) {
        const sum = Object.values(weights).reduce((a, b) => a + b, 0);
        for (const factor of ALL_FACTORS) weights[factor] /= sum;

        return {
          symbol,
          recommendedWeights: weights,
          confidence: 0.5 + count * 0.1,
          basedOn: 'similar_symbols',
          similarSymbols,
        };
      }
    }

    // Usar pesos por tipo de activo
    if (state?.metaWeights.adaptationGradients.byAssetType[assetType]) {
      const weights = { ...DEFAULT_WEIGHTS };
      const gradients = state.metaWeights.adaptationGradients.byAssetType[assetType];
      for (const factor of ALL_FACTORS) {
        if (gradients[factor]) weights[factor] += gradients[factor] * 0.1;
      }
      const sum = Object.values(weights).reduce((a, b) => a + b, 0);
      for (const factor of ALL_FACTORS) weights[factor] /= sum;

      return {
        symbol,
        recommendedWeights: weights,
        confidence: 0.4,
        basedOn: 'asset_type',
        similarSymbols: [],
      };
    }

    // Default
    return {
      symbol,
      recommendedWeights: { ...DEFAULT_WEIGHTS },
      confidence: 0.3,
      basedOn: 'default',
      similarSymbols: [],
    };
  },

  /**
   * Entrena el meta-modelo con todas las predicciones
   */
  async trainMetaModel(): Promise<{ success: boolean; message: string }> {
    await this.initialize();
    if (!state) return { success: false, message: 'State not initialized' };

    try {
      // Cargar todas las predicciones verificadas agrupadas por símbolo
      const predictions = await prisma.prediction.findMany({
        where: { verified: true },
        select: {
          symbol: true,
          factorBreakdown: true,
          timeframe: true,
          predictedChange: true,
          actualChange: true,
          accuracyScore: true,
        },
      });

      if (predictions.length < 20) {
        return { success: false, message: 'Necesitas al menos 20 predicciones verificadas' };
      }

      // Agrupar por símbolo
      const bySymbol: Record<string, PredictionSample[]> = {};
      for (const p of predictions) {
        if (!p.accuracyScore) continue;
        
        let factorScores: Record<FactorName, number> = {} as any;
        if (p.factorBreakdown) {
          const breakdown = typeof p.factorBreakdown === 'string'
            ? JSON.parse(p.factorBreakdown)
            : p.factorBreakdown;
          for (const f of breakdown.availableFactors || []) {
            if (f.name && typeof f.score === 'number') {
              factorScores[f.name as FactorName] = f.score;
            }
          }
        }

        if (!bySymbol[p.symbol]) bySymbol[p.symbol] = [];
        bySymbol[p.symbol].push({
          factorScores,
          timeframe: p.timeframe as Timeframe,
          predictedChange: p.predictedChange,
          actualChange: p.actualChange || 0,
          accuracyScore: p.accuracyScore,
        });
      }

      // Meta-training: actualizar gradientes de adaptación
      for (const [symbol, samples] of Object.entries(bySymbol)) {
        if (samples.length < 3) continue;

        // Calcular respuesta promedio de cada factor
        for (const factor of ALL_FACTORS) {
          let sumResponse = 0;
          let count = 0;
          for (const sample of samples) {
            if (sample.factorScores[factor] !== undefined) {
              sumResponse += sample.factorScores[factor] * (sample.accuracyScore / 100 - 0.5);
              count++;
            }
          }
          if (count > 0) {
            const avgResponse = sumResponse / count;
            // Actualizar gradiente global
            state.metaWeights.baseWeights[factor] += avgResponse * META_LEARNING_RATE;
          }
        }
      }

      // Normalizar pesos base
      const sum = Object.values(state.metaWeights.baseWeights).reduce((a, b) => a + b, 0);
      for (const factor of ALL_FACTORS) {
        state.metaWeights.baseWeights[factor] = Math.max(0.02, state.metaWeights.baseWeights[factor] / sum);
      }

      state.trainingHistory.metaEpochs++;
      state.trainingHistory.totalTasks = Object.keys(bySymbol).length;
      state.trainingHistory.lastTraining = Date.now();

      await this.saveState();

      logger.info(`[MetaLearning] Trained on ${predictions.length} samples from ${Object.keys(bySymbol).length} symbols`);

      return { 
        success: true, 
        message: `Meta-modelo entrenado con ${predictions.length} predicciones de ${Object.keys(bySymbol).length} símbolos` 
      };
    } catch (error) {
      logger.error('[MetaLearning] Error training:', error);
      return { success: false, message: 'Error during training' };
    }
  },

  /**
   * Obtiene estadísticas
   */
  async getStats(): Promise<{
    symbolCount: number;
    metaEpochs: number;
    totalTasks: number;
    lastTraining: number | null;
  }> {
    await this.initialize();
    
    return {
      symbolCount: Object.keys(state?.symbolProfiles || {}).length,
      metaEpochs: state?.trainingHistory.metaEpochs || 0,
      totalTasks: state?.trainingHistory.totalTasks || 0,
      lastTraining: state?.trainingHistory.lastTraining || null,
    };
  },
};
