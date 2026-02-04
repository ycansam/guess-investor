/**
 * Ensemble Prediction Service
 * Combina múltiples modelos de predicción para mejorar accuracy.
 * 
 * Modelos incluidos:
 * 1. Global: Pesos optimizados por timeframe/volatilidad
 * 2. Symbol: Pesos específicos del símbolo (historial)
 * 3. Regime: Pesos según régimen de mercado
 * 4. Momentum: Modelo que prioriza tendencia y técnico
 * 5. MeanReversion: Modelo contrarian para reversiones
 * 6. Fundamental: Modelo que prioriza financials, expectations, macro
 * 7. Sentiment: Modelo que prioriza sentiment y news
 * 
 * SELECCIÓN DINÁMICA: El ensemble activa/desactiva modelos según los datos disponibles.
 * CLASIFICACIÓN DE ACTIVOS: Usa el servicio Python ML para clasificar activos por volatilidad.
 */

import { logger } from '../../middleware/logger.js';
import { trainingRepository } from '../../repositories/training.repository.js';
import { pythonMlService, type AssetProfile } from '../ml/python-ml.service.js';

// Factores de análisis (debe coincidir con los del sistema - 10 factores, competitors eliminado)
const FACTORS = [
  'trend', 'technical', 'sentiment', 'news', 'macro',
  'forex', 'institutional', 'seasonality',
  'financials', 'expectations'
] as const;

type Factor = typeof FACTORS[number];
type WeightsMap = Record<Factor, number>;
type Timeframe = 'intraday' | 'swing' | 'long';

/**
 * Tipos de modelo en el ensemble
 */
export type ModelType = 'global' | 'symbol' | 'regime' | 'momentum' | 'mean_reversion' | 'fundamental' | 'sentiment_driven';

/**
 * Información sobre disponibilidad de datos
 */
export interface DataAvailability {
  trend: boolean;
  technical: boolean;
  sentiment: boolean;
  news: boolean;
  macro: boolean;
  forex: boolean;
  institutional: boolean;
  seasonality: boolean;
  financials: boolean;
  expectations: boolean;
}

/**
 * Predicción de un modelo individual
 */
export interface ModelPrediction {
  modelType: ModelType;
  weights: WeightsMap;
  predictedChange: number;  // % predicho
  confidence: number;       // 0-100
  contribution: number;     // Peso de este modelo en el ensemble (0-1)
  isActive: boolean;        // Si el modelo está activo para esta predicción
  reason?: string;          // Por qué está activo/inactivo
}

/**
 * Predicción del ensemble
 */
export interface EnsemblePrediction {
  finalPredictedChange: number;
  finalConfidence: number;
  modelPredictions: ModelPrediction[];
  ensembleWeights: Record<ModelType, number>;
  dominantModel: ModelType;
  agreementLevel: 'high' | 'medium' | 'low';
  dataAvailability: DataAvailability;
  activeModels: ModelType[];
  modelSelectionReason: string;
}

/**
 * Performance histórico de cada modelo
 */
export interface ModelPerformance {
  modelType: ModelType;
  totalPredictions: number;
  avgAccuracyScore: number;
  directionAccuracy: number;
  recentPerformance: number;
  weight: number;
}

/**
 * Régimen de mercado
 */
export type MarketRegime = 'trending_up' | 'trending_down' | 'high_volatility' | 'low_volatility' | 'ranging';

/**
 * Pesos fijos para modelo Momentum (prioriza tendencia)
 */
const MOMENTUM_WEIGHTS: WeightsMap = {
  trend: 0.32, technical: 0.30, sentiment: 0.15, news: 0.10,
  macro: 0.02, forex: 0.02, institutional: 0.04,
  seasonality: 0.02, financials: 0.02, expectations: 0.01
};

/**
 * Pesos fijos para modelo Mean Reversion (contrarian)
 */
const MEAN_REVERSION_WEIGHTS: WeightsMap = {
  trend: 0.05, technical: 0.35, sentiment: 0.10, news: 0.05,
  macro: 0.12, forex: 0.05, institutional: 0.12,
  seasonality: 0.05, financials: 0.06, expectations: 0.05
};

/**
 * Pesos fijos para modelo Fundamental (prioriza análisis fundamental)
 */
const FUNDAMENTAL_WEIGHTS: WeightsMap = {
  trend: 0.05, technical: 0.05, sentiment: 0.05, news: 0.10,
  macro: 0.20, forex: 0.08, institutional: 0.12,
  seasonality: 0.05, financials: 0.18, expectations: 0.12
};

/**
 * Pesos fijos para modelo Sentiment-Driven (prioriza sentiment y news)
 */
const SENTIMENT_DRIVEN_WEIGHTS: WeightsMap = {
  trend: 0.10, technical: 0.10, sentiment: 0.32, news: 0.27,
  macro: 0.05, forex: 0.03, institutional: 0.05,
  seasonality: 0.02, financials: 0.03, expectations: 0.03
};

/**
 * Pesos base globales por timeframe
 */
const DEFAULT_GLOBAL_WEIGHTS: Record<Timeframe, WeightsMap> = {
  intraday: {
    trend: 0.22, technical: 0.27, sentiment: 0.16, news: 0.18,
    macro: 0.04, forex: 0.04, institutional: 0.05,
    seasonality: 0.02, financials: 0.01, expectations: 0.01
  },
  swing: {
    trend: 0.13, technical: 0.20, sentiment: 0.11, news: 0.15,
    macro: 0.09, forex: 0.06, institutional: 0.11,
    seasonality: 0.04, financials: 0.06, expectations: 0.05
  },
  long: {
    trend: 0.05, technical: 0.08, sentiment: 0.05, news: 0.08,
    macro: 0.15, forex: 0.10, institutional: 0.14,
    seasonality: 0.08, financials: 0.15, expectations: 0.12
  }
};

/**
 * Pesos por régimen de mercado
 */
const REGIME_WEIGHTS: Record<MarketRegime, Partial<WeightsMap>> = {
  trending_up: {
    trend: 0.25, technical: 0.20, sentiment: 0.15,
  },
  trending_down: {
    trend: 0.20, technical: 0.25, sentiment: 0.15,
  },
  high_volatility: {
    technical: 0.30, sentiment: 0.20, news: 0.15,
  },
  low_volatility: {
    financials: 0.20, macro: 0.15, expectations: 0.15,
  },
  ranging: {
    technical: 0.28, sentiment: 0.18,
  }
};

// In-memory cache for ensemble weights and performance
let ensembleWeights: Record<ModelType, number> = {
  global: 0.25,
  symbol: 0.20,
  regime: 0.15,
  momentum: 0.15,
  mean_reversion: 0.10,
  fundamental: 0.10,
  sentiment_driven: 0.05,
};

let modelPerformance: Map<ModelType, ModelPerformance> = new Map();

/**
 * Requisitos de datos para cada modelo
 */
const MODEL_DATA_REQUIREMENTS: Record<ModelType, { required: Factor[]; preferred: Factor[]; minRequired: number }> = {
  global: {
    required: ['trend', 'technical'],
    preferred: ['sentiment', 'news', 'macro'],
    minRequired: 2,
  },
  symbol: {
    required: ['trend'],
    preferred: ['technical', 'financials'],
    minRequired: 1,
  },
  regime: {
    required: ['technical'],
    preferred: ['macro', 'sentiment'],
    minRequired: 1,
  },
  momentum: {
    required: ['trend', 'technical'],
    preferred: ['sentiment'],
    minRequired: 2,
  },
  mean_reversion: {
    required: ['technical'],
    preferred: ['trend', 'sentiment'],
    minRequired: 1,
  },
  fundamental: {
    required: ['financials'],
    preferred: ['macro', 'expectations', 'institutional'],
    minRequired: 2, // financials + at least 1 preferred
  },
  sentiment_driven: {
    required: ['sentiment'],
    preferred: ['news'],
    minRequired: 1,
  },
};

export const ensembleService = {
  /**
   * Genera predicción del ensemble con selección dinámica de modelos
   */
  async predict(
    symbol: string,
    timeframe: Timeframe,
    factorScores: Record<string, number>,
    dataAvailability: DataAvailability,
    regimeIndicators?: {
      vix?: number;
      trend?: number;
      volatility?: number;
    }
  ): Promise<EnsemblePrediction> {
    const modelPredictions: ModelPrediction[] = [];

    // 1. Determinar qué modelos activar según los datos disponibles
    const { activeModels, modelSelectionReason } = this.selectModelsBasedOnData(dataAvailability);
    
    logger.info(`[Ensemble] Active models for ${symbol}: ${activeModels.join(', ')}`);
    logger.info(`[Ensemble] Selection reason: ${modelSelectionReason}`);

    // 2. Modelo Global (siempre activo si hay al menos trend o technical)
    const globalActive = activeModels.includes('global');
    const globalWeights = DEFAULT_GLOBAL_WEIGHTS[timeframe];
    const globalPred = globalActive ? this.computePrediction(factorScores, globalWeights, dataAvailability) : null;
    modelPredictions.push({
      modelType: 'global',
      weights: globalWeights,
      predictedChange: globalPred?.change ?? 0,
      confidence: globalPred?.confidence ?? 0,
      contribution: globalActive ? ensembleWeights.global : 0,
      isActive: globalActive,
      reason: globalActive ? 'Datos básicos disponibles' : 'Faltan datos de trend y technical',
    });

    // 3. Modelo por Símbolo
    const symbolActive = activeModels.includes('symbol');
    const symbolWeights = await this.getSymbolWeights(symbol, timeframe, globalWeights);
    const symbolPred = symbolActive ? this.computePrediction(factorScores, symbolWeights.weights, dataAvailability) : null;
    modelPredictions.push({
      modelType: 'symbol',
      weights: symbolWeights.weights,
      predictedChange: symbolPred?.change ?? 0,
      confidence: (symbolPred?.confidence ?? 0) * (symbolWeights.hasHistory ? 1 : 0.8),
      contribution: symbolActive ? ensembleWeights.symbol * (symbolWeights.hasHistory ? 1 : 0.5) : 0,
      isActive: symbolActive,
      reason: symbolActive 
        ? (symbolWeights.hasHistory ? 'Historial específico del símbolo' : 'Sin historial, usando fallback')
        : 'Faltan datos de trend',
    });

    // 4. Modelo por Régimen
    const regimeActive = activeModels.includes('regime');
    const regime = this.detectRegime(regimeIndicators);
    const regimeWeights = this.applyRegimeAdjustments(globalWeights, regime);
    const regimePred = regimeActive ? this.computePrediction(factorScores, regimeWeights, dataAvailability) : null;
    modelPredictions.push({
      modelType: 'regime',
      weights: regimeWeights,
      predictedChange: regimePred?.change ?? 0,
      confidence: regimePred?.confidence ?? 0,
      contribution: regimeActive ? ensembleWeights.regime : 0,
      isActive: regimeActive,
      reason: regimeActive ? `Régimen detectado: ${regime}` : 'Faltan datos técnicos',
    });

    // 5. Modelo Momentum
    const momentumActive = activeModels.includes('momentum');
    const momentumPred = momentumActive ? this.computePrediction(factorScores, MOMENTUM_WEIGHTS, dataAvailability) : null;
    modelPredictions.push({
      modelType: 'momentum',
      weights: MOMENTUM_WEIGHTS,
      predictedChange: momentumPred?.change ?? 0,
      confidence: momentumPred?.confidence ?? 0,
      contribution: momentumActive ? ensembleWeights.momentum : 0,
      isActive: momentumActive,
      reason: momentumActive ? 'Datos de tendencia y técnico disponibles' : 'Faltan datos de trend o technical',
    });

    // 6. Modelo Mean Reversion
    const mrActive = activeModels.includes('mean_reversion');
    const mrPred = mrActive ? this.computePrediction(factorScores, MEAN_REVERSION_WEIGHTS, dataAvailability) : null;
    const mrAdjusted = mrPred ? this.adjustForMeanReversion(mrPred.change, factorScores) : 0;
    modelPredictions.push({
      modelType: 'mean_reversion',
      weights: MEAN_REVERSION_WEIGHTS,
      predictedChange: mrAdjusted,
      confidence: (mrPred?.confidence ?? 0) * 0.8,
      contribution: mrActive ? ensembleWeights.mean_reversion : 0,
      isActive: mrActive,
      reason: mrActive ? 'Datos técnicos disponibles' : 'Faltan datos técnicos',
    });

    // 7. Modelo Fundamental (NUEVO)
    const fundamentalActive = activeModels.includes('fundamental');
    const fundamentalPred = fundamentalActive ? this.computePrediction(factorScores, FUNDAMENTAL_WEIGHTS, dataAvailability) : null;
    modelPredictions.push({
      modelType: 'fundamental',
      weights: FUNDAMENTAL_WEIGHTS,
      predictedChange: fundamentalPred?.change ?? 0,
      confidence: fundamentalPred?.confidence ?? 0,
      contribution: fundamentalActive ? ensembleWeights.fundamental : 0,
      isActive: fundamentalActive,
      reason: fundamentalActive ? 'Datos fundamentales disponibles' : 'Faltan datos de financials',
    });

    // 8. Modelo Sentiment-Driven (NUEVO)
    const sentimentActive = activeModels.includes('sentiment_driven');
    const sentimentPred = sentimentActive ? this.computePrediction(factorScores, SENTIMENT_DRIVEN_WEIGHTS, dataAvailability) : null;
    modelPredictions.push({
      modelType: 'sentiment_driven',
      weights: SENTIMENT_DRIVEN_WEIGHTS,
      predictedChange: sentimentPred?.change ?? 0,
      confidence: sentimentPred?.confidence ?? 0,
      contribution: sentimentActive ? ensembleWeights.sentiment_driven : 0,
      isActive: sentimentActive,
      reason: sentimentActive ? 'Datos de sentiment disponibles' : 'Faltan datos de sentiment',
    });

    // Combinar predicciones (solo de modelos activos)
    return this.combineModels(modelPredictions, dataAvailability, activeModels, modelSelectionReason);
  },

  /**
   * Selecciona modelos basándose en los datos disponibles
   */
  selectModelsBasedOnData(availability: DataAvailability): { activeModels: ModelType[]; modelSelectionReason: string } {
    const activeModels: ModelType[] = [];
    const reasons: string[] = [];
    
    // Contar factores disponibles por categoría
    const hasTechnicalData = availability.trend || availability.technical;
    const hasFundamentalData = availability.financials || availability.macro || availability.expectations;
    const hasSentimentData = availability.sentiment || availability.news;
    const hasAlternativeData = availability.institutional || availability.forex;
    
    const totalFactors = Object.values(availability).filter(Boolean).length;
    
    // Evaluar cada modelo
    for (const [model, requirements] of Object.entries(MODEL_DATA_REQUIREMENTS)) {
      const modelType = model as ModelType;
      const requiredMet = requirements.required.filter(f => availability[f]).length;
      const preferredMet = requirements.preferred.filter(f => availability[f]).length;
      const totalMet = requiredMet + preferredMet;
      
      if (totalMet >= requirements.minRequired && requiredMet >= Math.min(1, requirements.required.length)) {
        activeModels.push(modelType);
      }
    }
    
    // Generar explicación
    if (totalFactors >= 8) {
      reasons.push('Datos completos: usando todos los modelos disponibles');
    } else if (totalFactors >= 5) {
      reasons.push('Datos parciales: modelos seleccionados según disponibilidad');
    } else if (totalFactors >= 2) {
      reasons.push('Datos limitados: usando modelos básicos');
    } else {
      reasons.push('Datos muy limitados: predicción de baja confianza');
    }
    
    if (hasFundamentalData && activeModels.includes('fundamental')) {
      reasons.push('Modelo fundamental activado');
    }
    if (hasSentimentData && activeModels.includes('sentiment_driven')) {
      reasons.push('Modelo de sentiment activado');
    }
    if (!hasTechnicalData) {
      reasons.push('Sin datos técnicos: modelos momentum/mean_reversion desactivados');
    }
    
    // Asegurar al menos un modelo activo
    if (activeModels.length === 0) {
      activeModels.push('global');
      reasons.push('Fallback a modelo global por falta de datos');
    }
    
    return {
      activeModels,
      modelSelectionReason: reasons.join('. '),
    };
  },

  /**
   * Obtiene pesos específicos del símbolo desde el training cache
   */
  async getSymbolWeights(
    symbol: string,
    timeframe: Timeframe,
    fallbackWeights: WeightsMap
  ): Promise<{ weights: WeightsMap; hasHistory: boolean }> {
    try {
      const cached = await trainingRepository.getFromCache(symbol, timeframe);
      
      if (cached && cached.analysisData) {
        const data = JSON.parse(cached.analysisData);
        if (data.weights && typeof data.weights === 'object') {
          return { weights: { ...fallbackWeights, ...data.weights }, hasHistory: true };
        }
      }
    } catch (error) {
      logger.debug(`[Ensemble] No cached weights for ${symbol}`);
    }
    
    return { weights: fallbackWeights, hasHistory: false };
  },

  /**
   * Detecta el régimen de mercado actual
   */
  detectRegime(indicators?: {
    vix?: number;
    trend?: number;
    volatility?: number;
  }): MarketRegime {
    if (!indicators) return 'ranging';
    
    const { vix = 20, trend = 0, volatility = 15 } = indicators;
    
    // Alta volatilidad
    if (vix > 25 || volatility > 25) {
      return 'high_volatility';
    }
    
    // Baja volatilidad
    if (vix < 15 && volatility < 10) {
      return 'low_volatility';
    }
    
    // Tendencia fuerte alcista
    if (trend > 30) {
      return 'trending_up';
    }
    
    // Tendencia fuerte bajista
    if (trend < -30) {
      return 'trending_down';
    }
    
    return 'ranging';
  },

  /**
   * Aplica ajustes de régimen a los pesos base
   */
  applyRegimeAdjustments(baseWeights: WeightsMap, regime: MarketRegime): WeightsMap {
    const adjustments = REGIME_WEIGHTS[regime];
    const adjusted = { ...baseWeights };
    
    // Aplicar ajustes del régimen
    for (const [factor, weight] of Object.entries(adjustments)) {
      if (factor in adjusted) {
        (adjusted as any)[factor] = ((adjusted as any)[factor] + weight) / 2;
      }
    }
    
    // Normalizar para que sume 1
    const total = Object.values(adjusted).reduce((a, b) => a + b, 0);
    for (const factor of Object.keys(adjusted)) {
      (adjusted as any)[factor] = (adjusted as any)[factor] / total;
    }
    
    return adjusted;
  },

  /**
   * Calcula predicción con un set de pesos, considerando solo datos disponibles
   */
  computePrediction(
    factorScores: Record<string, number>,
    weights: WeightsMap,
    dataAvailability: DataAvailability
  ): { change: number; confidence: number } {
    let weightedScore = 0;
    let totalWeight = 0;
    let factorCount = 0;
    let availableFactorCount = 0;

    for (const factor of FACTORS) {
      const score = factorScores[factor];
      const weight = weights[factor];
      const hasData = dataAvailability[factor];

      // Solo usar factores con datos disponibles
      if (score !== undefined && weight !== undefined && hasData) {
        weightedScore += score * weight;
        totalWeight += weight;
        factorCount++;
        availableFactorCount++;
      }
    }

    // Si no hay datos, retornar predicción neutral
    if (totalWeight === 0 || availableFactorCount === 0) {
      return { change: 0, confidence: 20 };
    }

    // Score normalizado a -100 a +100
    const normalizedScore = weightedScore / totalWeight;
    
    // Convertir a % cambio predicho (escala típica de ±10%)
    const predictedChange = normalizedScore * 0.1;

    // Confianza basada en coherencia de factores Y cantidad de datos
    const baseConfidence = 50 + Math.abs(normalizedScore) * 0.4;
    const dataFactor = Math.min(1, availableFactorCount / 5); // Penaliza si pocos datos
    const confidence = Math.min(90, baseConfidence * (0.7 + 0.3 * dataFactor));

    return { change: predictedChange, confidence };
  },

  /**
   * Ajusta predicción para mean reversion
   */
  adjustForMeanReversion(basePrediction: number, factorScores: Record<string, number>): number {
    const technical = factorScores.technical ?? 0;
    const trend = factorScores.trend ?? 0;

    // Si hay sobrecompra/sobreventa extrema, predecir reversión
    if (technical > 70 || technical < -70) {
      return basePrediction * 0.5 - (technical > 0 ? 0.5 : -0.5);
    }

    // Si tendencia muy extendida, esperar pullback
    if (Math.abs(trend) > 60) {
      return basePrediction * 0.7;
    }

    return basePrediction;
  },

  /**
   * Combina predicciones de todos los modelos activos
   */
  combineModels(
    predictions: ModelPrediction[],
    dataAvailability: DataAvailability,
    activeModels: ModelType[],
    modelSelectionReason: string
  ): EnsemblePrediction {
    // Filtrar solo modelos activos
    const activePredictions = predictions.filter(p => p.isActive && p.contribution > 0);
    
    // Si no hay predicciones activas, usar todas con contribución > 0
    const predictionsToUse = activePredictions.length > 0 
      ? activePredictions 
      : predictions.filter(p => p.contribution > 0);
    
    // Normalizar contribuciones
    const totalContribution = predictionsToUse.reduce((sum, p) => sum + p.contribution, 0);
    
    // Weighted average de predicciones
    let finalChange = 0;
    let finalConfidence = 0;
    
    if (totalContribution > 0) {
      for (const pred of predictionsToUse) {
        const normalizedContrib = pred.contribution / totalContribution;
        finalChange += pred.predictedChange * normalizedContrib;
        finalConfidence += pred.confidence * normalizedContrib;
      }
    }

    // Calcular nivel de acuerdo
    const changes = predictionsToUse.map(p => p.predictedChange);
    const stdDev = this.standardDeviation(changes);
    const avgChange = this.mean(changes);
    const coeffOfVar = avgChange !== 0 ? Math.abs(stdDev / avgChange) : 1;

    let agreementLevel: 'high' | 'medium' | 'low' = 'medium';
    if (coeffOfVar < 0.3) agreementLevel = 'high';
    else if (coeffOfVar > 0.7) agreementLevel = 'low';

    // Ajustar confianza por acuerdo y cantidad de modelos activos
    const activeModelCount = activeModels.length;
    if (agreementLevel === 'high') {
      finalConfidence = Math.min(95, finalConfidence * 1.1);
    } else if (agreementLevel === 'low') {
      finalConfidence = finalConfidence * 0.8;
    }
    
    // Penalizar si hay pocos modelos activos
    if (activeModelCount <= 2) {
      finalConfidence = finalConfidence * 0.9;
    }

    // Determinar modelo dominante (entre los activos)
    const dominantModel = predictionsToUse.length > 0
      ? predictionsToUse.reduce((max, p) => p.contribution > max.contribution ? p : max).modelType
      : 'global';

    return {
      finalPredictedChange: finalChange,
      finalConfidence,
      modelPredictions: predictions,
      ensembleWeights: { ...ensembleWeights },
      dominantModel,
      agreementLevel,
      dataAvailability,
      activeModels,
      modelSelectionReason,
    };
  },

  /**
   * Actualiza pesos del ensemble basado en performance histórico
   */
  async updateEnsembleWeights(): Promise<void> {
    try {
      // Obtener predicciones verificadas
      const { prisma } = await import('../../config/database.js');
      const verifiedPredictions = await prisma.prediction.findMany({
        where: {
          verified: true,
          accuracyScore: { not: null },
        },
        take: 100,
        orderBy: { createdAt: 'desc' },
      });

      if (verifiedPredictions.length < 20) {
        logger.info('[Ensemble] Not enough predictions to update weights');
        return;
      }

      // Simular performance de cada modelo (simplificado)
      const performances = this.simulateModelPerformances(verifiedPredictions);

      // Calcular nuevos pesos basados en accuracy
      const totalAccuracy = performances.reduce((sum, p) => sum + p.avgAccuracyScore, 0);
      
      for (const perf of performances) {
        const newWeight = Math.max(0.05, perf.avgAccuracyScore / totalAccuracy);
        ensembleWeights[perf.modelType] = newWeight;
        modelPerformance.set(perf.modelType, perf);
      }

      // Normalizar
      const totalWeight = Object.values(ensembleWeights).reduce((a, b) => a + b, 0);
      for (const model of Object.keys(ensembleWeights) as ModelType[]) {
        ensembleWeights[model] = ensembleWeights[model] / totalWeight;
      }

      // Guardar en LearnedWeights con la estructura correcta del schema
      // Usamos los campos de pesos individuales para guardar los del ensemble
      const avgAcc = this.mean(verifiedPredictions.map((p: any) => p.accuracyScore || 0));
      
      await prisma.learnedWeights.upsert({
        where: { id: 'ensemble_weights' },
        update: {
          trend: ensembleWeights.global,
          technical: ensembleWeights.symbol,
          sentiment: ensembleWeights.regime,
          news: ensembleWeights.momentum,
          macro: ensembleWeights.mean_reversion,
          sampleCount: verifiedPredictions.length,
          accuracy: avgAcc,
          trainedAt: new Date(),
        },
        create: {
          id: 'ensemble_weights',
          trend: ensembleWeights.global,
          technical: ensembleWeights.symbol,
          sentiment: ensembleWeights.regime,
          news: ensembleWeights.momentum,
          macro: ensembleWeights.mean_reversion,
          sampleCount: verifiedPredictions.length,
          accuracy: avgAcc,
        },
      });

      logger.info('[Ensemble] Updated weights:', ensembleWeights);
    } catch (error) {
      logger.error('[Ensemble] Error updating weights:', error);
    }
  },

  /**
   * Simula el performance de cada modelo con datos históricos
   */
  simulateModelPerformances(predictions: any[]): ModelPerformance[] {
    const performances: ModelPerformance[] = [];
    const models: ModelType[] = ['global', 'symbol', 'regime', 'momentum', 'mean_reversion', 'fundamental', 'sentiment_driven'];

    const scores = predictions
      .filter((p: any) => p.accuracyScore !== undefined)
      .map((p: any) => p.accuracyScore);

    const avgScore = this.mean(scores);
    const recentScores = scores.slice(0, 20);
    const recentAvg = this.mean(recentScores);

    for (const modelType of models) {
      // Ajustar por tipo de modelo (simulación simplificada)
      let multiplier = 1;
      switch (modelType) {
        case 'global': multiplier = 1; break;
        case 'symbol': multiplier = 1.05; break;
        case 'regime': multiplier = 1.02; break;
        case 'momentum': multiplier = 0.95; break;
        case 'mean_reversion': multiplier = 0.90; break;
        case 'fundamental': multiplier = 1.03; break;
        case 'sentiment_driven': multiplier = 0.92; break;
      }

      performances.push({
        modelType,
        totalPredictions: predictions.length,
        avgAccuracyScore: Math.min(100, avgScore * multiplier),
        directionAccuracy: 60 * multiplier, // Placeholder
        recentPerformance: Math.min(100, recentAvg * multiplier),
        weight: ensembleWeights[modelType],
      });
    }

    return performances;
  },

  /**
   * Obtiene el performance actual de cada modelo
   */
  getModelPerformances(): ModelPerformance[] {
    return Array.from(modelPerformance.values());
  },

  /**
   * Obtiene los pesos actuales del ensemble
   */
  getEnsembleWeights(): Record<ModelType, number> {
    return { ...ensembleWeights };
  },

  /**
   * Genera reporte del ensemble
   */
  generateReport(): string {
    let report = '🎯 ENSEMBLE DE MODELOS (SELECCIÓN DINÁMICA)\n';
    report += '═'.repeat(50) + '\n\n';

    report += 'PESOS ACTUALES:\n';
    for (const [model, weight] of Object.entries(ensembleWeights)) {
      const perf = modelPerformance.get(model as ModelType);
      const acc = perf ? ` (acc: ${perf.avgAccuracyScore.toFixed(1)}%)` : '';
      report += `  ${model}: ${(weight * 100).toFixed(1)}%${acc}\n`;
    }

    report += '\nDESCRIPCIÓN DE MODELOS:\n';
    report += '  global: Pesos optimizados por timeframe/volatilidad\n';
    report += '  symbol: Pesos específicos del símbolo (historial)\n';
    report += '  regime: Ajustado al régimen de mercado actual\n';
    report += '  momentum: Prioriza trend y análisis técnico\n';
    report += '  mean_reversion: Contrarian, busca reversiones\n';
    report += '  fundamental: Prioriza financials, macro, expectations\n';
    report += '  sentiment_driven: Prioriza sentiment y noticias\n';
    
    report += '\nSELECCIÓN DINÁMICA:\n';
    report += '  Los modelos se activan/desactivan según los datos disponibles.\n';
    report += '  Ej: Sin datos financials → modelo fundamental desactivado.\n';
    report += '  Ej: Solo sentiment/news → modelo sentiment_driven tiene mayor peso.\n';

    return report;
  },

  // === Helpers ===

  mean(values: number[]): number {
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  },

  standardDeviation(values: number[]): number {
    if (values.length < 2) return 0;
    const avg = this.mean(values);
    const squareDiffs = values.map(v => Math.pow(v - avg, 2));
    return Math.sqrt(this.mean(squareDiffs));
  },

  // ===== CLASIFICADOR DE ACTIVOS (PYTHON ML) =====

  /**
   * Obtiene el perfil de un activo desde el clasificador Python
   * Incluye: volatilidad, timeframe recomendado, modelos recomendados
   */
  async getAssetProfile(symbol: string, assetType: string = 'stock'): Promise<AssetProfile | null> {
    try {
      const profile = await pythonMlService.classifyAsset(symbol, assetType);
      if (profile) {
        logger.info(`[Ensemble] Asset profile for ${symbol}: ${profile.recommended_timeframe}, volatility: ${profile.daily_volatility}%`);
      }
      return profile;
    } catch (error) {
      logger.warn(`[Ensemble] Could not get asset profile for ${symbol}`);
      return null;
    }
  },

  /**
   * Obtiene el timeframe recomendado para un activo basado en su volatilidad
   */
  async getRecommendedTimeframe(symbol: string): Promise<Timeframe> {
    const profile = await this.getAssetProfile(symbol);
    if (profile) {
      return profile.recommended_timeframe as Timeframe;
    }
    return 'swing'; // Default
  },

  /**
   * Ajusta los pesos del ensemble basándose en el perfil del activo
   * Activos más volátiles → más peso a modelos de corto plazo
   * Activos estables → más peso a modelos fundamentales
   */
  async adjustWeightsForAsset(symbol: string, assetType: string = 'stock'): Promise<Record<ModelType, number>> {
    const profile = await this.getAssetProfile(symbol, assetType);
    
    if (!profile) {
      return { ...ensembleWeights };
    }

    // Usar los pesos recomendados por el clasificador Python
    const adjustedWeights = { ...ensembleWeights };
    
    // Si el clasificador Python retorna pesos específicos, usarlos
    if (profile.model_weights) {
      for (const [model, weight] of Object.entries(profile.model_weights)) {
        if (model in adjustedWeights) {
          adjustedWeights[model as ModelType] = weight;
        }
      }
    } else {
      // Ajustar basándose en volatilidad y timeframe recomendado
      const { daily_volatility, recommended_timeframe, trend_persistence } = profile;
      
      // Alta volatilidad → más momentum y sentiment
      if (daily_volatility > 40) {
        adjustedWeights.momentum *= 1.3;
        adjustedWeights.sentiment_driven *= 1.2;
        adjustedWeights.fundamental *= 0.7;
      }
      // Baja volatilidad → más fundamental
      else if (daily_volatility < 15) {
        adjustedWeights.fundamental *= 1.3;
        adjustedWeights.mean_reversion *= 1.2;
        adjustedWeights.momentum *= 0.8;
      }
      
      // Tendencia persistente → más momentum
      if (trend_persistence > 0.7) {
        adjustedWeights.momentum *= 1.2;
        adjustedWeights.mean_reversion *= 0.8;
      }
      // Mean reversion fuerte → más contrarian
      else if (trend_persistence < 0.3) {
        adjustedWeights.mean_reversion *= 1.3;
        adjustedWeights.momentum *= 0.7;
      }
      
      // Ajustar por timeframe recomendado
      switch (recommended_timeframe) {
        case 'intraday':
          adjustedWeights.sentiment_driven *= 1.2;
          adjustedWeights.regime *= 1.1;
          adjustedWeights.fundamental *= 0.8;
          break;
        case 'long':
          adjustedWeights.fundamental *= 1.3;
          adjustedWeights.symbol *= 1.2;
          adjustedWeights.sentiment_driven *= 0.7;
          adjustedWeights.momentum *= 0.8;
          break;
        // swing es balanceado, no ajustar
      }
    }
    
    // Normalizar pesos para que sumen 1
    const total = Object.values(adjustedWeights).reduce((a, b) => a + b, 0);
    for (const model of Object.keys(adjustedWeights) as ModelType[]) {
      adjustedWeights[model] = adjustedWeights[model] / total;
    }
    
    logger.info(`[Ensemble] Adjusted weights for ${symbol}:`, adjustedWeights);
    return adjustedWeights;
  },

  /**
   * Predicción avanzada que incluye clasificación del activo
   */
  async predictWithAssetClassification(
    symbol: string,
    assetType: string,
    factorScores: Record<string, number>,
    dataAvailability: DataAvailability,
    regimeIndicators?: {
      vix?: number;
      trend?: number;
      volatility?: number;
    },
    forceTimeframe?: Timeframe
  ): Promise<EnsemblePrediction & { assetProfile?: AssetProfile }> {
    // 1. Obtener perfil del activo
    const assetProfile = await this.getAssetProfile(symbol, assetType);
    
    // 2. Determinar timeframe (usar recomendado por Python o forzado)
    const timeframe = forceTimeframe || (assetProfile?.recommended_timeframe as Timeframe) || 'swing';
    
    // 3. Ajustar pesos del ensemble para este activo
    if (assetProfile?.model_weights) {
      // Temporalmente sobrescribir pesos del ensemble
      const originalWeights = { ...ensembleWeights };
      Object.assign(ensembleWeights, assetProfile.model_weights);
      
      // Hacer predicción
      const prediction = await this.predict(symbol, timeframe, factorScores, dataAvailability, regimeIndicators);
      
      // Restaurar pesos originales
      Object.assign(ensembleWeights, originalWeights);
      
      return {
        ...prediction,
        assetProfile,
      };
    }
    
    // Predicción normal si no hay perfil
    const prediction = await this.predict(symbol, timeframe, factorScores, dataAvailability, regimeIndicators);
    return {
      ...prediction,
      assetProfile: assetProfile || undefined,
    };
  },

  /**
   * Verifica si el servidor Python ML está disponible
   */
  async isPythonMlAvailable(): Promise<boolean> {
    return pythonMlService.isAvailable();
  },

  /**
   * Clasifica múltiples activos en batch
   */
  async classifyAssetsBatch(symbols: string[]): Promise<Record<string, AssetProfile>> {
    return pythonMlService.classifyBatch(symbols);
  },
};
