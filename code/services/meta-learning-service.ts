/**
 * Meta-Learning Service (MAML-inspired)
 * 
 * "Aprender a aprender" - Permite adaptación rápida a nuevos símbolos
 * con muy pocos datos (few-shot learning).
 * 
 * Concepto:
 * - Mantener un "meta-modelo" entrenado con TODOS los símbolos
 * - Cuando llega un nuevo símbolo con 2-5 predicciones, hacer fine-tuning rápido
 * - Transferir conocimiento de símbolos similares
 * 
 * Inspirado en MAML (Model-Agnostic Meta-Learning):
 * - En lugar de optimizar para un símbolo específico
 * - Optimizamos para que el modelo pueda adaptarse rápidamente a cualquier símbolo
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================================================
// TYPES
// ============================================================================

export type FactorName = 
  | 'trend' | 'technical' | 'sentiment' | 'news' | 'macro'
  | 'competitors' | 'forex' | 'institutional' | 'seasonality'
  | 'financials' | 'expectations';

export type Timeframe = 'intraday' | 'swing' | 'long';

interface SymbolProfile {
  symbol: string;
  assetType: 'stock' | 'crypto' | 'etf' | 'forex' | 'commodity';
  sector?: string;
  volatilityProfile: 'low' | 'medium' | 'high';
  predictionCount: number;
  avgAccuracy: number;
  factorResponses: Record<FactorName, number>;  // Cómo responde a cada factor
  lastUpdated: number;
}

interface MetaWeights {
  // Pesos base del meta-modelo (inicialización óptima)
  baseWeights: Record<FactorName, number>;
  
  // Gradientes promedio por tipo de símbolo (para adaptación rápida)
  adaptationGradients: {
    byAssetType: Record<string, Record<FactorName, number>>;
    bySector: Record<string, Record<FactorName, number>>;
    byVolatility: Record<string, Record<FactorName, number>>;
  };
  
  // Learning rates óptimos por contexto
  optimalLearningRates: {
    fewShot: number;      // 1-5 samples
    lowData: number;      // 6-15 samples  
    normal: number;       // 16+ samples
  };
}

interface TaskBatch {
  symbol: string;
  supportSet: PredictionSample[];  // Para adaptación (inner loop)
  querySet: PredictionSample[];    // Para evaluación (outer loop)
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

interface FewShotAdaptation {
  adaptedWeights: Record<FactorName, number>;
  confidence: number;
  adaptationSteps: number;
  sourceSymbols: string[];  // Símbolos usados para transferencia
  explanation: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = 'meta-learning-state';

// Meta-learning hyperparameters
const META_LEARNING_RATE = 0.01;      // α: outer loop
const ADAPTATION_LEARNING_RATE = 0.1; // β: inner loop (fast adaptation)
const ADAPTATION_STEPS = 3;           // Pasos de adaptación para few-shot
const MIN_SUPPORT_SIZE = 2;           // Mínimo samples para adaptar
const SIMILARITY_THRESHOLD = 0.5;     // Umbral para transferencia

const ALL_FACTORS: FactorName[] = [
  'trend', 'technical', 'sentiment', 'news', 'macro',
  'competitors', 'forex', 'institutional', 'seasonality',
  'financials', 'expectations'
];

const DEFAULT_WEIGHTS: Record<FactorName, number> = {
  trend: 0.12, technical: 0.15, sentiment: 0.10, news: 0.08,
  macro: 0.05, competitors: 0.08, forex: 0.03, institutional: 0.10,
  seasonality: 0.05, financials: 0.12, expectations: 0.12
};

// ============================================================================
// SERVICE
// ============================================================================

class MetaLearningService {
  private state: MetaLearningState | null = null;
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
      console.error('[MetaLearning] Error initializing:', error);
      this.state = this.createEmptyState();
      this.initialized = true;
    }
  }

  private createEmptyState(): MetaLearningState {
    return {
      metaWeights: {
        baseWeights: { ...DEFAULT_WEIGHTS },
        adaptationGradients: {
          byAssetType: {},
          bySector: {},
          byVolatility: {}
        },
        optimalLearningRates: {
          fewShot: 0.15,
          lowData: 0.08,
          normal: 0.03
        }
      },
      symbolProfiles: {},
      similarityMatrix: {},
      trainingHistory: {
        metaEpochs: 0,
        totalTasks: 0,
        avgMetaLoss: 1.0,
        lastTraining: 0
      }
    };
  }

  private async saveState(): Promise<void> {
    if (!this.state) return;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (error) {
      console.error('[MetaLearning] Error saving state:', error);
    }
  }

  // ==========================================================================
  // FEW-SHOT ADAPTATION (Core MAML-like functionality)
  // ==========================================================================

  /**
   * Adapta el modelo a un nuevo símbolo con muy pocos datos
   * 
   * @param symbol - Símbolo a adaptar
   * @param supportSamples - 2-10 predicciones verificadas del símbolo
   * @param context - Información adicional del símbolo
   */
  async adaptToNewSymbol(
    symbol: string,
    supportSamples: PredictionSample[],
    context?: {
      assetType?: 'stock' | 'crypto' | 'etf' | 'forex' | 'commodity';
      sector?: string;
      volatility?: 'low' | 'medium' | 'high';
    }
  ): Promise<FewShotAdaptation> {
    await this.initialize();
    if (!this.state) {
      return this.fallbackAdaptation(symbol);
    }

    const sampleCount = supportSamples.length;
    
    if (sampleCount < MIN_SUPPORT_SIZE) {
      // No hay suficientes datos, usar transferencia pura
      return this.transferFromSimilar(symbol, context);
    }

    // 1. Iniciar con meta-weights base
    let adaptedWeights = { ...this.state.metaWeights.baseWeights };

    // 2. Aplicar gradientes de adaptación por contexto (si existen)
    if (context?.assetType) {
      adaptedWeights = this.applyContextGradient(
        adaptedWeights,
        this.state.metaWeights.adaptationGradients.byAssetType[context.assetType]
      );
    }
    if (context?.sector) {
      adaptedWeights = this.applyContextGradient(
        adaptedWeights,
        this.state.metaWeights.adaptationGradients.bySector[context.sector]
      );
    }
    if (context?.volatility) {
      adaptedWeights = this.applyContextGradient(
        adaptedWeights,
        this.state.metaWeights.adaptationGradients.byVolatility[context.volatility]
      );
    }

    // 3. Fine-tuning con los datos del símbolo (inner loop de MAML)
    const learningRate = sampleCount <= 5 
      ? this.state.metaWeights.optimalLearningRates.fewShot
      : sampleCount <= 15
        ? this.state.metaWeights.optimalLearningRates.lowData
        : this.state.metaWeights.optimalLearningRates.normal;

    let adaptationSteps = 0;
    for (let step = 0; step < ADAPTATION_STEPS; step++) {
      const gradients = this.computeGradients(adaptedWeights, supportSamples);
      adaptedWeights = this.applyGradientStep(adaptedWeights, gradients, learningRate);
      adaptationSteps++;
    }

    // 4. Encontrar símbolos similares usados para transferencia
    const sourceSymbols = this.findSimilarSymbols(symbol, context);

    // 5. Calcular confianza basada en cantidad de datos y calidad de transferencia
    const confidence = this.calculateAdaptationConfidence(sampleCount, sourceSymbols.length);

    // 6. Actualizar perfil del símbolo
    await this.updateSymbolProfile(symbol, supportSamples, context, adaptedWeights);

    const explanation = this.generateAdaptationExplanation(
      sampleCount, adaptationSteps, sourceSymbols, confidence
    );

    return {
      adaptedWeights: this.normalizeWeights(adaptedWeights),
      confidence,
      adaptationSteps,
      sourceSymbols,
      explanation
    };
  }

  /**
   * Transferencia de conocimiento cuando no hay datos del símbolo
   */
  private async transferFromSimilar(
    symbol: string,
    context?: {
      assetType?: string;
      sector?: string;
      volatility?: string;
    }
  ): Promise<FewShotAdaptation> {
    if (!this.state) return this.fallbackAdaptation(symbol);

    const similarSymbols = this.findSimilarSymbols(symbol, context);
    
    if (similarSymbols.length === 0) {
      // No hay símbolos similares, usar meta-weights con contexto
      let weights = { ...this.state.metaWeights.baseWeights };
      
      if (context?.assetType) {
        weights = this.applyContextGradient(
          weights,
          this.state.metaWeights.adaptationGradients.byAssetType[context.assetType]
        );
      }

      return {
        adaptedWeights: this.normalizeWeights(weights),
        confidence: 0.3,
        adaptationSteps: 0,
        sourceSymbols: [],
        explanation: 'Sin datos del símbolo. Usando pesos base con ajuste por contexto.'
      };
    }

    // Calcular pesos promedio ponderado de símbolos similares
    const weightedSum: Record<FactorName, number> = {} as any;
    ALL_FACTORS.forEach(f => weightedSum[f] = 0);
    
    let totalWeight = 0;
    for (const simSymbol of similarSymbols.slice(0, 5)) {
      const profile = this.state.symbolProfiles[simSymbol];
      if (profile && profile.factorResponses) {
        const similarity = this.state.similarityMatrix[symbol]?.[simSymbol] || 0.5;
        const weight = similarity * Math.sqrt(profile.predictionCount);
        
        ALL_FACTORS.forEach(f => {
          weightedSum[f] += (profile.factorResponses[f] || DEFAULT_WEIGHTS[f]) * weight;
        });
        totalWeight += weight;
      }
    }

    const transferredWeights: Record<FactorName, number> = {} as any;
    if (totalWeight > 0) {
      ALL_FACTORS.forEach(f => {
        transferredWeights[f] = weightedSum[f] / totalWeight;
      });
    } else {
      Object.assign(transferredWeights, this.state.metaWeights.baseWeights);
    }

    return {
      adaptedWeights: this.normalizeWeights(transferredWeights),
      confidence: 0.4 + Math.min(0.3, similarSymbols.length * 0.1),
      adaptationSteps: 0,
      sourceSymbols: similarSymbols.slice(0, 5),
      explanation: `Transferencia de ${similarSymbols.length} símbolos similares: ${similarSymbols.slice(0, 3).join(', ')}${similarSymbols.length > 3 ? '...' : ''}`
    };
  }

  // ==========================================================================
  // META-TRAINING (Outer loop - aprende a aprender)
  // ==========================================================================

  /**
   * Entrena el meta-modelo con múltiples tareas (símbolos)
   * Este es el "outer loop" de MAML
   */
  async trainMetaModel(
    allPredictions: Record<string, PredictionSample[]>,
    epochs: number = 10
  ): Promise<{
    metaLoss: number;
    improvement: number;
    tasksProcessed: number;
  }> {
    await this.initialize();
    if (!this.state) {
      return { metaLoss: 1, improvement: 0, tasksProcessed: 0 };
    }

    // Crear batches de tareas (cada símbolo es una tarea)
    const tasks: TaskBatch[] = [];
    for (const [symbol, samples] of Object.entries(allPredictions)) {
      if (samples.length >= 4) {
        // Split 50% support, 50% query
        const midpoint = Math.floor(samples.length / 2);
        tasks.push({
          symbol,
          supportSet: samples.slice(0, midpoint),
          querySet: samples.slice(midpoint)
        });
      }
    }

    if (tasks.length === 0) {
      return { metaLoss: 1, improvement: 0, tasksProcessed: 0 };
    }

    const initialMetaLoss = this.evaluateMetaLoss(tasks);
    let currentWeights = { ...this.state.metaWeights.baseWeights };

    // Meta-training loop
    for (let epoch = 0; epoch < epochs; epoch++) {
      // Shuffle tasks
      const shuffledTasks = tasks.sort(() => Math.random() - 0.5);
      
      const metaGradients: Record<FactorName, number> = {} as any;
      ALL_FACTORS.forEach(f => metaGradients[f] = 0);

      for (const task of shuffledTasks) {
        // Inner loop: adaptar a la tarea
        let taskWeights = { ...currentWeights };
        for (let step = 0; step < ADAPTATION_STEPS; step++) {
          const innerGradients = this.computeGradients(taskWeights, task.supportSet);
          taskWeights = this.applyGradientStep(taskWeights, innerGradients, ADAPTATION_LEARNING_RATE);
        }

        // Outer loop: evaluar en query set y acumular gradientes
        const outerGradients = this.computeGradients(taskWeights, task.querySet);
        ALL_FACTORS.forEach(f => {
          metaGradients[f] += outerGradients[f] / tasks.length;
        });
      }

      // Actualizar meta-weights
      currentWeights = this.applyGradientStep(currentWeights, metaGradients, META_LEARNING_RATE);
    }

    // Guardar nuevos meta-weights
    this.state.metaWeights.baseWeights = this.normalizeWeights(currentWeights);
    
    const finalMetaLoss = this.evaluateMetaLoss(tasks);
    const improvement = (initialMetaLoss - finalMetaLoss) / initialMetaLoss;

    this.state.trainingHistory = {
      metaEpochs: this.state.trainingHistory.metaEpochs + epochs,
      totalTasks: this.state.trainingHistory.totalTasks + tasks.length * epochs,
      avgMetaLoss: finalMetaLoss,
      lastTraining: Date.now()
    };

    await this.saveState();

    return {
      metaLoss: finalMetaLoss,
      improvement,
      tasksProcessed: tasks.length
    };
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  private computeGradients(
    weights: Record<FactorName, number>,
    samples: PredictionSample[]
  ): Record<FactorName, number> {
    const gradients: Record<FactorName, number> = {} as any;
    const epsilon = 0.001;

    for (const factor of ALL_FACTORS) {
      // Numerical gradient: (loss(w+ε) - loss(w-ε)) / 2ε
      const weightsPlus = { ...weights, [factor]: weights[factor] + epsilon };
      const weightsMinus = { ...weights, [factor]: weights[factor] - epsilon };
      
      const lossPlus = this.computeLoss(weightsPlus, samples);
      const lossMinus = this.computeLoss(weightsMinus, samples);
      
      gradients[factor] = (lossPlus - lossMinus) / (2 * epsilon);
    }

    return gradients;
  }

  private computeLoss(
    weights: Record<FactorName, number>,
    samples: PredictionSample[]
  ): number {
    if (samples.length === 0) return 1;

    let totalLoss = 0;
    for (const sample of samples) {
      // Weighted prediction based on factor scores
      let weightedScore = 0;
      for (const factor of ALL_FACTORS) {
        weightedScore += (sample.factorScores[factor] || 50) * (weights[factor] || 0);
      }
      
      // Normalize to prediction direction (-1 to 1)
      const predictedDirection = (weightedScore - 50) / 50;
      const actualDirection = sample.actualChange > 0 ? 1 : -1;
      
      // Loss: how wrong was the prediction
      const directionLoss = Math.abs(predictedDirection - actualDirection) / 2;
      const accuracyLoss = (100 - sample.accuracyScore) / 100;
      
      totalLoss += 0.6 * directionLoss + 0.4 * accuracyLoss;
    }

    return totalLoss / samples.length;
  }

  private applyGradientStep(
    weights: Record<FactorName, number>,
    gradients: Record<FactorName, number>,
    learningRate: number
  ): Record<FactorName, number> {
    const newWeights: Record<FactorName, number> = {} as any;
    
    for (const factor of ALL_FACTORS) {
      newWeights[factor] = weights[factor] - learningRate * gradients[factor];
      // Clip to valid range
      newWeights[factor] = Math.max(0.01, Math.min(0.40, newWeights[factor]));
    }

    return this.normalizeWeights(newWeights);
  }

  private applyContextGradient(
    weights: Record<FactorName, number>,
    gradient?: Record<FactorName, number>
  ): Record<FactorName, number> {
    if (!gradient) return weights;

    const result: Record<FactorName, number> = {} as any;
    for (const factor of ALL_FACTORS) {
      result[factor] = weights[factor] + (gradient[factor] || 0) * 0.5;
    }
    return result;
  }

  private normalizeWeights(weights: Record<FactorName, number>): Record<FactorName, number> {
    const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
    if (total === 0) return { ...DEFAULT_WEIGHTS };

    const normalized: Record<FactorName, number> = {} as any;
    for (const factor of ALL_FACTORS) {
      normalized[factor] = weights[factor] / total;
    }
    return normalized;
  }

  private evaluateMetaLoss(tasks: TaskBatch[]): number {
    if (!this.state || tasks.length === 0) return 1;

    let totalLoss = 0;
    for (const task of tasks) {
      // Simulate adaptation
      let weights = { ...this.state.metaWeights.baseWeights };
      for (let step = 0; step < ADAPTATION_STEPS; step++) {
        const gradients = this.computeGradients(weights, task.supportSet);
        weights = this.applyGradientStep(weights, gradients, ADAPTATION_LEARNING_RATE);
      }
      
      // Evaluate on query set
      totalLoss += this.computeLoss(weights, task.querySet);
    }

    return totalLoss / tasks.length;
  }

  private findSimilarSymbols(
    symbol: string,
    context?: { assetType?: string; sector?: string; volatility?: string }
  ): string[] {
    if (!this.state) return [];

    const similar: Array<{ symbol: string; score: number }> = [];

    for (const [otherSymbol, profile] of Object.entries(this.state.symbolProfiles)) {
      if (otherSymbol === symbol) continue;
      
      let similarity = 0;
      let factors = 0;

      // Similarity from matrix (if exists)
      if (this.state.similarityMatrix[symbol]?.[otherSymbol]) {
        similarity += this.state.similarityMatrix[symbol][otherSymbol] * 2;
        factors += 2;
      }

      // Context-based similarity
      if (context?.assetType && profile.assetType === context.assetType) {
        similarity += 0.4;
        factors += 1;
      }
      if (context?.sector && profile.sector === context.sector) {
        similarity += 0.3;
        factors += 1;
      }
      if (context?.volatility && profile.volatilityProfile === context.volatility) {
        similarity += 0.2;
        factors += 1;
      }

      if (factors > 0 && similarity / factors > SIMILARITY_THRESHOLD) {
        similar.push({ symbol: otherSymbol, score: similarity / factors });
      }
    }

    return similar
      .sort((a, b) => b.score - a.score)
      .map(s => s.symbol);
  }

  private calculateAdaptationConfidence(sampleCount: number, similarCount: number): number {
    // Base confidence from sample count
    let confidence = Math.min(0.6, sampleCount * 0.08);
    
    // Bonus from similar symbols
    confidence += Math.min(0.2, similarCount * 0.04);
    
    // Cap at 0.9 (never fully confident with few-shot)
    return Math.min(0.9, confidence);
  }

  private async updateSymbolProfile(
    symbol: string,
    samples: PredictionSample[],
    context?: { assetType?: string; sector?: string; volatility?: string },
    learnedWeights?: Record<FactorName, number>
  ): Promise<void> {
    if (!this.state) return;

    const avgAccuracy = samples.reduce((sum, s) => sum + s.accuracyScore, 0) / samples.length;

    this.state.symbolProfiles[symbol] = {
      symbol,
      assetType: (context?.assetType as any) || 'stock',
      sector: context?.sector,
      volatilityProfile: (context?.volatility as any) || 'medium',
      predictionCount: samples.length,
      avgAccuracy,
      factorResponses: learnedWeights || { ...DEFAULT_WEIGHTS },
      lastUpdated: Date.now()
    };

    await this.saveState();
  }

  private generateAdaptationExplanation(
    sampleCount: number,
    steps: number,
    sourceSymbols: string[],
    confidence: number
  ): string {
    const parts: string[] = [];

    if (sampleCount <= 5) {
      parts.push(`Few-shot adaptation con ${sampleCount} muestra${sampleCount > 1 ? 's' : ''}.`);
    } else {
      parts.push(`Adaptación con ${sampleCount} muestras.`);
    }

    if (sourceSymbols.length > 0) {
      parts.push(`Transferencia de ${sourceSymbols.length} símbolo${sourceSymbols.length > 1 ? 's' : ''} similar${sourceSymbols.length > 1 ? 'es' : ''}.`);
    }

    parts.push(`Confianza: ${(confidence * 100).toFixed(0)}%.`);

    return parts.join(' ');
  }

  private fallbackAdaptation(symbol: string): FewShotAdaptation {
    return {
      adaptedWeights: { ...DEFAULT_WEIGHTS },
      confidence: 0.2,
      adaptationSteps: 0,
      sourceSymbols: [],
      explanation: 'Usando pesos por defecto (sin datos de entrenamiento meta).'
    };
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Obtiene estadísticas del meta-modelo
   */
  async getStats(): Promise<{
    metaEpochs: number;
    totalTasks: number;
    avgMetaLoss: number;
    symbolsProfiled: number;
    baseWeights: Record<FactorName, number>;
    lastTraining: number;
  }> {
    await this.initialize();

    if (!this.state) {
      return {
        metaEpochs: 0,
        totalTasks: 0,
        avgMetaLoss: 1,
        symbolsProfiled: 0,
        baseWeights: DEFAULT_WEIGHTS,
        lastTraining: 0
      };
    }

    return {
      metaEpochs: this.state.trainingHistory.metaEpochs,
      totalTasks: this.state.trainingHistory.totalTasks,
      avgMetaLoss: this.state.trainingHistory.avgMetaLoss,
      symbolsProfiled: Object.keys(this.state.symbolProfiles).length,
      baseWeights: this.state.metaWeights.baseWeights,
      lastTraining: this.state.trainingHistory.lastTraining
    };
  }

  /**
   * Obtiene el perfil de un símbolo
   */
  async getSymbolProfile(symbol: string): Promise<SymbolProfile | null> {
    await this.initialize();
    return this.state?.symbolProfiles[symbol] || null;
  }

  /**
   * Reset del sistema meta-learning
   */
  async reset(): Promise<void> {
    this.state = this.createEmptyState();
    await this.saveState();
  }
}

// Singleton export
export const metaLearningService = new MetaLearningService();
