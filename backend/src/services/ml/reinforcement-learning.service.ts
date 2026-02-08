/**
 * Reinforcement Learning Service
 * 
 * Trata cada predicción como una "acción" y aprende la política óptima:
 * - Estado: Condiciones actuales (régimen, volatilidad, señales, etc.)
 * - Acción: Predecir (con qué confianza) o No predecir
 * - Reward: accuracyScore de la predicción (o 0 si no predijo)
 * 
 * Usa Q-Learning con aproximación de función (tabular discretizado)
 * para aprender qué combinaciones de condiciones llevan a buenas predicciones.
 */

import { prisma } from '../../config/database.js';
import { logger } from '../../middleware/logger.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Estado discretizado del mercado/predicción
 */
export interface RLState {
  regime: 'bull' | 'bear' | 'sideways' | 'volatile';
  volatility: 'low' | 'medium' | 'high';
  timeframe: 'intraday' | 'swing' | 'long';
  signalStrength: 'weak' | 'moderate' | 'strong';
  signalCoherence: 'conflicting' | 'mixed' | 'aligned';
  eventProximity: 'none' | 'near' | 'imminent';
  recentPerformance: 'poor' | 'average' | 'good';
}

export type RLAction = 'skip' | 'predict_low' | 'predict_medium' | 'predict_high';

interface Experience {
  state: RLState;
  action: RLAction;
  reward: number;
  nextState: RLState | null;
  timestamp: number;
}

interface QEntry {
  value: number;
  visits: number;
}

interface RLModelState {
  qTable: Record<string, Record<RLAction, QEntry>>;
  experienceReplay: Experience[];
  totalEpisodes: number;
  explorationRate: number;
  learningMetrics: {
    avgReward: number;
    skipRate: number;
    bestStateActions: Array<{ stateKey: string; action: RLAction; value: number }>;
  };
  lastUpdate: number;
}

export interface PolicyRecommendation {
  recommendedAction: RLAction;
  confidence: number;
  qValues: Record<RLAction, number>;
  explanation: string;
  explorationMode: boolean;
  shouldPredict: boolean;
  suggestedConfidenceLevel: 'low' | 'medium' | 'high' | null;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const LEARNING_RATE = 0.1;
const DISCOUNT_FACTOR = 0.95;
const INITIAL_EXPLORATION = 0.3;
const MIN_EXPLORATION = 0.05;
const EXPLORATION_DECAY = 0.995;
const MAX_REPLAY_SIZE = 1000;

const ALL_ACTIONS: RLAction[] = ['skip', 'predict_low', 'predict_medium', 'predict_high'];

const REWARD_SKIP = 0;
const REWARD_EXCELLENT = 100;
const REWARD_GOOD = 50;
const REWARD_POOR = -25;
const REWARD_FAILED = -75;

const CONFIDENCE_BONUS: Record<RLAction, number> = {
  skip: 0,
  predict_low: 0.8,
  predict_medium: 1.0,
  predict_high: 1.2,
};

// In-memory cache (persisted to DB periodically)
let modelState: RLModelState | null = null;
let stateLoaded = false;

// ============================================================================
// SERVICE
// ============================================================================

export const reinforcementLearningService = {
  /**
   * Inicializa el modelo RL
   */
  async initialize(): Promise<void> {
    if (stateLoaded) return;
    
    try {
      const stored = await prisma.mLModelState.findFirst({
        where: { modelType: 'reinforcement_learning' },
        orderBy: { createdAt: 'desc' },
      });
      
      if (stored?.stateJson) {
        modelState = JSON.parse(stored.stateJson);
        logger.info(`[RL] Loaded model state with ${modelState?.totalEpisodes || 0} episodes`);
      } else {
        modelState = this.createEmptyState();
        logger.info('[RL] Created empty model state');
      }
      stateLoaded = true;
    } catch (error) {
      logger.error('[RL] Error initializing:', error);
      modelState = this.createEmptyState();
      stateLoaded = true;
    }
  },

  createEmptyState(): RLModelState {
    return {
      qTable: {},
      experienceReplay: [],
      totalEpisodes: 0,
      explorationRate: INITIAL_EXPLORATION,
      learningMetrics: {
        avgReward: 0,
        skipRate: 0,
        bestStateActions: [],
      },
      lastUpdate: Date.now(),
    };
  },

  async saveState(): Promise<void> {
    if (!modelState) return;
    
    try {
      await prisma.mLModelState.upsert({
        where: { 
          modelType_version: { 
            modelType: 'reinforcement_learning', 
            version: 1 
          } 
        },
        update: {
          stateJson: JSON.stringify(modelState),
          updatedAt: new Date(),
        },
        create: {
          modelType: 'reinforcement_learning',
          version: 1,
          stateJson: JSON.stringify(modelState),
        },
      });
    } catch (error) {
      logger.error('[RL] Error saving state:', error);
    }
  },

  stateToKey(state: RLState): string {
    return `${state.regime}_${state.volatility}_${state.timeframe}_${state.signalStrength}_${state.signalCoherence}_${state.eventProximity}_${state.recentPerformance}`;
  },

  getQValue(stateKey: string, action: RLAction): number {
    return modelState?.qTable[stateKey]?.[action]?.value || 0;
  },

  getVisits(stateKey: string, action: RLAction): number {
    return modelState?.qTable[stateKey]?.[action]?.visits || 0;
  },

  /**
   * Actualiza Q-value usando ecuación de Bellman
   */
  updateQValue(
    stateKey: string,
    action: RLAction,
    reward: number,
    nextStateKey: string | null
  ): void {
    if (!modelState) return;

    if (!modelState.qTable[stateKey]) {
      modelState.qTable[stateKey] = {} as Record<RLAction, QEntry>;
    }
    if (!modelState.qTable[stateKey][action]) {
      modelState.qTable[stateKey][action] = { value: 0, visits: 0 };
    }

    const currentQ = modelState.qTable[stateKey][action].value;
    
    let maxNextQ = 0;
    if (nextStateKey && modelState.qTable[nextStateKey]) {
      maxNextQ = Math.max(...ALL_ACTIONS.map(a => this.getQValue(nextStateKey, a)));
    }

    // Q(s,a) = Q(s,a) + α[r + γ·max(Q(s',a')) - Q(s,a)]
    const newQ = currentQ + LEARNING_RATE * (reward + DISCOUNT_FACTOR * maxNextQ - currentQ);
    
    modelState.qTable[stateKey][action].value = newQ;
    modelState.qTable[stateKey][action].visits += 1;
  },

  /**
   * Selecciona acción usando ε-greedy policy
   */
  selectAction(stateKey: string, explore: boolean = true): RLAction {
    if (!modelState) return 'predict_medium';

    // Exploración
    if (explore && Math.random() < modelState.explorationRate) {
      return ALL_ACTIONS[Math.floor(Math.random() * ALL_ACTIONS.length)];
    }

    // Explotación: mejor acción conocida
    let bestAction: RLAction = 'predict_medium';
    let bestValue = -Infinity;

    for (const action of ALL_ACTIONS) {
      const qValue = this.getQValue(stateKey, action);
      const visits = this.getVisits(stateKey, action);
      const explorationBonus = visits === 0 ? 10 : Math.sqrt(2 * Math.log(modelState.totalEpisodes + 1) / visits);
      const adjustedValue = qValue + (explore ? explorationBonus * 5 : 0);
      
      if (adjustedValue > bestValue) {
        bestValue = adjustedValue;
        bestAction = action;
      }
    }

    return bestAction;
  },

  /**
   * Calcula reward basado en resultado de predicción
   */
  calculateReward(action: RLAction, accuracyScore: number | null, directionCorrect: boolean | null): number {
    if (action === 'skip') return REWARD_SKIP;
    if (accuracyScore === null) return 0;

    let baseReward: number;
    if (accuracyScore >= 75) baseReward = REWARD_EXCELLENT;
    else if (accuracyScore >= 50) baseReward = REWARD_GOOD;
    else if (accuracyScore >= 25) baseReward = REWARD_POOR;
    else baseReward = REWARD_FAILED;

    const confidenceMultiplier = CONFIDENCE_BONUS[action];
    const directionBonus = directionCorrect ? 10 : -10;

    return baseReward * confidenceMultiplier + directionBonus;
  },

  /**
   * Obtiene recomendación de política para un estado
   */
  async getPolicy(state: RLState): Promise<PolicyRecommendation> {
    await this.initialize();
    
    const stateKey = this.stateToKey(state);
    const recommendedAction = this.selectAction(stateKey, false);
    
    const qValues: Record<RLAction, number> = {} as Record<RLAction, number>;
    for (const action of ALL_ACTIONS) {
      qValues[action] = this.getQValue(stateKey, action);
    }

    const visits = Math.max(...ALL_ACTIONS.map(a => this.getVisits(stateKey, a)));
    const qDiff = Math.max(...Object.values(qValues)) - Math.min(...Object.values(qValues));
    const confidence = Math.min(1, (visits / 20) * (qDiff / 50));

    const explanation = this.generateExplanation(state, recommendedAction, qValues);

    return {
      recommendedAction,
      confidence,
      qValues,
      explanation,
      explorationMode: (modelState?.explorationRate || 0) > 0.1,
      shouldPredict: recommendedAction !== 'skip',
      suggestedConfidenceLevel: recommendedAction === 'skip' ? null :
        recommendedAction === 'predict_high' ? 'high' :
        recommendedAction === 'predict_low' ? 'low' : 'medium',
    };
  },

  generateExplanation(state: RLState, action: RLAction, qValues: Record<RLAction, number>): string {
    const parts: string[] = [];

    if (action === 'skip') {
      parts.push('Recomendación: NO predecir.');
      if (state.signalCoherence === 'conflicting') parts.push('Señales contradictorias.');
      if (state.eventProximity === 'imminent') parts.push('Evento importante inminente.');
      if (state.recentPerformance === 'poor') parts.push('Performance reciente pobre.');
    } else {
      const level = action === 'predict_high' ? 'alta' : action === 'predict_low' ? 'baja' : 'media';
      parts.push(`Recomendación: Predecir con confianza ${level}.`);
      if (state.signalStrength === 'strong' && state.signalCoherence === 'aligned') {
        parts.push('Señales fuertes y coherentes.');
      }
      if (state.recentPerformance === 'good') parts.push('Buen historial reciente.');
    }

    const maxQ = Math.max(...Object.values(qValues));
    if (maxQ > 10) parts.push(`(Q: ${maxQ.toFixed(1)})`);

    return parts.join(' ');
  },

  /**
   * Registra experiencia y actualiza modelo
   */
  async recordExperience(
    state: RLState,
    action: RLAction,
    accuracyScore: number | null,
    directionCorrect: boolean | null,
    nextState: RLState | null
  ): Promise<void> {
    await this.initialize();
    if (!modelState) return;

    const reward = this.calculateReward(action, accuracyScore, directionCorrect);
    const stateKey = this.stateToKey(state);
    const nextStateKey = nextState ? this.stateToKey(nextState) : null;

    // Actualizar Q-value
    this.updateQValue(stateKey, action, reward, nextStateKey);

    // Agregar a replay buffer
    const experience: Experience = {
      state,
      action,
      reward,
      nextState,
      timestamp: Date.now(),
    };

    modelState.experienceReplay.push(experience);
    if (modelState.experienceReplay.length > MAX_REPLAY_SIZE) {
      modelState.experienceReplay.shift();
    }

    // Actualizar métricas
    modelState.totalEpisodes++;
    modelState.explorationRate = Math.max(
      MIN_EXPLORATION,
      modelState.explorationRate * EXPLORATION_DECAY
    );

    // Actualizar métricas de aprendizaje
    const recentRewards = modelState.experienceReplay.slice(-50).map(e => e.reward);
    modelState.learningMetrics.avgReward = recentRewards.reduce((a, b) => a + b, 0) / recentRewards.length;
    
    const recentSkips = modelState.experienceReplay.slice(-50).filter(e => e.action === 'skip').length;
    modelState.learningMetrics.skipRate = recentSkips / Math.min(50, modelState.experienceReplay.length);

    modelState.lastUpdate = Date.now();

    // Guardar cada 10 episodios
    if (modelState.totalEpisodes % 10 === 0) {
      await this.saveState();
    }

    logger.debug(`[RL] Experience recorded: ${action} → reward ${reward.toFixed(1)} (total: ${modelState.totalEpisodes})`);
  },

  /**
   * Discretiza condiciones actuales a un estado RL
   */
  discretizeState(params: {
    vix?: number;
    volatility: number;
    timeframeDays: number;
    combinedScore: number;
    signalCoherence: 'coherent_bullish' | 'coherent_bearish' | 'mixed' | 'neutral' | 'insufficient';
    hasUpcomingEvents: boolean;
    recentAccuracy: number;
  }): RLState {
    // Régimen
    let regime: RLState['regime'] = 'sideways';
    const vix = params.vix ?? 20;
    if (vix > 30) regime = 'volatile';
    else if (params.combinedScore > 20) regime = 'bull';
    else if (params.combinedScore < -20) regime = 'bear';

    // Volatilidad
    let volatility: RLState['volatility'] = 'medium';
    if (params.volatility < 20) volatility = 'low';
    else if (params.volatility > 40) volatility = 'high';

    // Timeframe
    let timeframe: RLState['timeframe'] = 'swing';
    if (params.timeframeDays <= 1) timeframe = 'intraday';
    else if (params.timeframeDays > 7) timeframe = 'long';

    // Signal strength
    let signalStrength: RLState['signalStrength'] = 'moderate';
    const absScore = Math.abs(params.combinedScore);
    if (absScore < 15) signalStrength = 'weak';
    else if (absScore > 40) signalStrength = 'strong';

    // Signal coherence
    let signalCoherence: RLState['signalCoherence'] = 'mixed';
    if (params.signalCoherence === 'coherent_bullish' || params.signalCoherence === 'coherent_bearish') {
      signalCoherence = 'aligned';
    } else if (params.signalCoherence === 'mixed') {
      signalCoherence = 'conflicting';
    }

    // Event proximity
    const eventProximity: RLState['eventProximity'] = params.hasUpcomingEvents ? 'near' : 'none';

    // Recent performance
    let recentPerformance: RLState['recentPerformance'] = 'average';
    if (params.recentAccuracy > 70) recentPerformance = 'good';
    else if (params.recentAccuracy < 40) recentPerformance = 'poor';

    return {
      regime,
      volatility,
      timeframe,
      signalStrength,
      signalCoherence,
      eventProximity,
      recentPerformance,
    };
  },

  /**
   * Obtiene estadísticas del modelo
   */
  async getStats(): Promise<{
    totalEpisodes: number;
    explorationRate: number;
    avgReward: number;
    skipRate: number;
    qTableSize: number;
    successRate: number;
  }> {
    await this.initialize();
    
    // Calcular tasa de éxito (experiencias con reward > 0)
    const experiences = modelState?.experienceReplay || [];
    const successCount = experiences.filter(e => e.reward > 0).length;
    const successRate = experiences.length > 0 ? successCount / experiences.length : 0;
    
    return {
      totalEpisodes: modelState?.totalEpisodes || 0,
      explorationRate: modelState?.explorationRate || INITIAL_EXPLORATION,
      avgReward: modelState?.learningMetrics.avgReward || 0,
      skipRate: modelState?.learningMetrics.skipRate || 0,
      qTableSize: Object.keys(modelState?.qTable || {}).length,
      successRate,
    };
  },

  /**
   * Resetea el modelo RL a estado inicial (también en memoria)
   */
  async reset(): Promise<void> {
    modelState = this.createEmptyState();
    stateLoaded = true;
    logger.info('[RL] Model reset to initial state');
  },
};
