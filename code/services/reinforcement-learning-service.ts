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
 * 
 * Beneficios:
 * - Aprende CUÁNDO predecir (no solo cómo)
 * - Optimiza para reward acumulado, no solo accuracy puntual
 * - Puede aprender patrones complejos estado-acción
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Estado discretizado del mercado/predicción
 */
interface State {
  // Régimen de mercado (discretizado)
  regime: 'bull' | 'bear' | 'sideways' | 'volatile';
  
  // Volatilidad del activo
  volatility: 'low' | 'medium' | 'high';
  
  // Timeframe de la predicción
  timeframe: 'intraday' | 'swing' | 'long';
  
  // Fuerza de señales (discretizada)
  signalStrength: 'weak' | 'moderate' | 'strong';
  
  // Coherencia de factores
  signalCoherence: 'conflicting' | 'mixed' | 'aligned';
  
  // Proximidad a eventos
  eventProximity: 'none' | 'near' | 'imminent';
  
  // Performance reciente del modelo
  recentPerformance: 'poor' | 'average' | 'good';
}

/**
 * Acciones disponibles
 */
type Action = 
  | 'skip'              // No predecir
  | 'predict_low'       // Predecir con confianza baja
  | 'predict_medium'    // Predecir con confianza media
  | 'predict_high';     // Predecir con confianza alta

/**
 * Experiencia para replay
 */
interface Experience {
  state: State;
  action: Action;
  reward: number;
  nextState: State | null;  // null si es terminal
  timestamp: number;
}

/**
 * Q-Table entry
 */
interface QValue {
  stateKey: string;
  action: Action;
  value: number;
  visits: number;
}

interface RLModelState {
  qTable: Record<string, Record<Action, { value: number; visits: number }>>;
  experienceReplay: Experience[];
  totalEpisodes: number;
  explorationRate: number;
  learningMetrics: {
    avgReward: number;
    skipRate: number;
    bestStateActions: Array<{ stateKey: string; action: Action; value: number }>;
  };
  lastUpdate: number;
}

interface PolicyRecommendation {
  recommendedAction: Action;
  confidence: number;
  qValues: Record<Action, number>;
  explanation: string;
  explorationMode: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = 'rl-model-state';

// Hiperparámetros de Q-Learning
const LEARNING_RATE = 0.1;           // α: velocidad de aprendizaje
const DISCOUNT_FACTOR = 0.95;        // γ: importancia de rewards futuros
const INITIAL_EXPLORATION = 0.3;     // ε inicial: probabilidad de explorar
const MIN_EXPLORATION = 0.05;        // ε mínimo
const EXPLORATION_DECAY = 0.995;     // Decaimiento de ε por episodio

const MAX_REPLAY_SIZE = 1000;
const BATCH_SIZE = 32;

const ALL_ACTIONS: Action[] = ['skip', 'predict_low', 'predict_medium', 'predict_high'];

// Rewards
const REWARD_SKIP = 0;               // Neutral por no predecir
const REWARD_EXCELLENT = 100;        // accuracyScore > 75
const REWARD_GOOD = 50;              // accuracyScore 50-75
const REWARD_POOR = -25;             // accuracyScore 25-50
const REWARD_FAILED = -75;           // accuracyScore < 25

// Bonus/Penalty por confianza
const CONFIDENCE_BONUS = {
  predict_low: 0.8,      // Menos riesgo, menos reward
  predict_medium: 1.0,   // Neutral
  predict_high: 1.2      // Más riesgo, más reward si acierta
};

// ============================================================================
// SERVICE
// ============================================================================

class ReinforcementLearningService {
  private state: RLModelState | null = null;
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
      console.error('[RL] Error initializing:', error);
      this.state = this.createEmptyState();
      this.initialized = true;
    }
  }

  private createEmptyState(): RLModelState {
    return {
      qTable: {},
      experienceReplay: [],
      totalEpisodes: 0,
      explorationRate: INITIAL_EXPLORATION,
      learningMetrics: {
        avgReward: 0,
        skipRate: 0,
        bestStateActions: []
      },
      lastUpdate: Date.now()
    };
  }

  private async saveState(): Promise<void> {
    if (!this.state) return;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (error) {
      console.error('[RL] Error saving state:', error);
    }
  }

  /**
   * Convierte estado a key string para Q-table
   */
  private stateToKey(state: State): string {
    return `${state.regime}_${state.volatility}_${state.timeframe}_${state.signalStrength}_${state.signalCoherence}_${state.eventProximity}_${state.recentPerformance}`;
  }

  /**
   * Obtiene Q-value para un par estado-acción
   */
  private getQValue(stateKey: string, action: Action): number {
    if (!this.state) return 0;
    return this.state.qTable[stateKey]?.[action]?.value || 0;
  }

  /**
   * Obtiene el número de visitas para un par estado-acción
   */
  private getVisits(stateKey: string, action: Action): number {
    if (!this.state) return 0;
    return this.state.qTable[stateKey]?.[action]?.visits || 0;
  }

  /**
   * Actualiza Q-value usando la ecuación de Bellman
   */
  private updateQValue(
    stateKey: string,
    action: Action,
    reward: number,
    nextStateKey: string | null
  ): void {
    if (!this.state) return;

    // Inicializar entrada si no existe
    if (!this.state.qTable[stateKey]) {
      this.state.qTable[stateKey] = {} as any;
    }
    if (!this.state.qTable[stateKey][action]) {
      this.state.qTable[stateKey][action] = { value: 0, visits: 0 };
    }

    const currentQ = this.state.qTable[stateKey][action].value;
    
    // Máximo Q-value del siguiente estado (0 si es terminal)
    let maxNextQ = 0;
    if (nextStateKey && this.state.qTable[nextStateKey]) {
      maxNextQ = Math.max(
        ...ALL_ACTIONS.map(a => this.getQValue(nextStateKey, a))
      );
    }

    // Q-Learning update: Q(s,a) = Q(s,a) + α[r + γ·max(Q(s',a')) - Q(s,a)]
    const newQ = currentQ + LEARNING_RATE * (reward + DISCOUNT_FACTOR * maxNextQ - currentQ);
    
    this.state.qTable[stateKey][action].value = newQ;
    this.state.qTable[stateKey][action].visits += 1;
  }

  /**
   * Selecciona acción usando ε-greedy policy
   */
  private selectAction(stateKey: string, explore: boolean = true): Action {
    if (!this.state) return 'predict_medium';

    // Exploración: acción aleatoria
    if (explore && Math.random() < this.state.explorationRate) {
      return ALL_ACTIONS[Math.floor(Math.random() * ALL_ACTIONS.length)];
    }

    // Explotación: mejor acción conocida
    let bestAction: Action = 'predict_medium';
    let bestValue = -Infinity;

    for (const action of ALL_ACTIONS) {
      const qValue = this.getQValue(stateKey, action);
      // Añadir pequeño bonus por exploración (UCB-like)
      const visits = this.getVisits(stateKey, action);
      const explorationBonus = visits === 0 ? 10 : Math.sqrt(2 * Math.log(this.state.totalEpisodes + 1) / visits);
      const adjustedValue = qValue + (explore ? explorationBonus * 5 : 0);
      
      if (adjustedValue > bestValue) {
        bestValue = adjustedValue;
        bestAction = action;
      }
    }

    return bestAction;
  }

  /**
   * Calcula reward basado en el resultado de la predicción
   */
  private calculateReward(
    action: Action,
    accuracyScore: number | null,
    directionCorrect: boolean | null
  ): number {
    // Si no predijo, reward neutral
    if (action === 'skip') {
      return REWARD_SKIP;
    }

    // Si predijo pero no tenemos resultado aún
    if (accuracyScore === null) {
      return 0;
    }

    // Calcular reward base según accuracy
    let baseReward: number;
    if (accuracyScore >= 75) {
      baseReward = REWARD_EXCELLENT;
    } else if (accuracyScore >= 50) {
      baseReward = REWARD_GOOD;
    } else if (accuracyScore >= 25) {
      baseReward = REWARD_POOR;
    } else {
      baseReward = REWARD_FAILED;
    }

    // Aplicar multiplicador de confianza
    const confidenceMultiplier = CONFIDENCE_BONUS[action] || 1.0;
    
    // Bonus por dirección correcta
    const directionBonus = directionCorrect ? 10 : -10;

    return baseReward * confidenceMultiplier + directionBonus;
  }

  /**
   * Obtiene recomendación de política para un estado
   */
  async getPolicy(state: State): Promise<PolicyRecommendation> {
    await this.initialize();
    
    const stateKey = this.stateToKey(state);
    const recommendedAction = this.selectAction(stateKey, false);
    
    // Obtener Q-values para todas las acciones
    const qValues: Record<Action, number> = {} as any;
    for (const action of ALL_ACTIONS) {
      qValues[action] = this.getQValue(stateKey, action);
    }

    // Calcular confianza basada en visitas y diferencia de Q-values
    const visits = Math.max(...ALL_ACTIONS.map(a => this.getVisits(stateKey, a)));
    const qDiff = Math.max(...Object.values(qValues)) - Math.min(...Object.values(qValues));
    const confidence = Math.min(1, (visits / 20) * (qDiff / 50));

    // Generar explicación
    const explanation = this.generateExplanation(state, recommendedAction, qValues);

    return {
      recommendedAction,
      confidence,
      qValues,
      explanation,
      explorationMode: (this.state?.explorationRate || 0) > 0.1
    };
  }

  /**
   * Genera explicación de la recomendación
   */
  private generateExplanation(
    state: State,
    action: Action,
    qValues: Record<Action, number>
  ): string {
    const parts: string[] = [];

    if (action === 'skip') {
      parts.push('Recomendación: NO predecir.');
      if (state.signalCoherence === 'conflicting') {
        parts.push('Señales contradictorias detectadas.');
      }
      if (state.eventProximity === 'imminent') {
        parts.push('Evento importante inminente.');
      }
      if (state.recentPerformance === 'poor') {
        parts.push('Performance reciente pobre en condiciones similares.');
      }
    } else {
      const confidenceLevel = action === 'predict_high' ? 'alta' : 
                              action === 'predict_medium' ? 'media' : 'baja';
      parts.push(`Recomendación: Predecir con confianza ${confidenceLevel}.`);
      
      if (state.signalStrength === 'strong' && state.signalCoherence === 'aligned') {
        parts.push('Señales fuertes y coherentes.');
      }
      if (state.recentPerformance === 'good') {
        parts.push('Buen historial en condiciones similares.');
      }
    }

    // Añadir Q-values si hay suficiente diferencia
    const maxQ = Math.max(...Object.values(qValues));
    const minQ = Math.min(...Object.values(qValues));
    if (maxQ - minQ > 10) {
      parts.push(`(Q-value: ${maxQ.toFixed(1)})`);
    }

    return parts.join(' ');
  }

  /**
   * Registra una experiencia y actualiza el modelo
   */
  async recordExperience(
    state: State,
    action: Action,
    accuracyScore: number | null,
    directionCorrect: boolean | null,
    nextState: State | null
  ): Promise<void> {
    await this.initialize();
    if (!this.state) return;

    const reward = this.calculateReward(action, accuracyScore, directionCorrect);
    
    const experience: Experience = {
      state,
      action,
      reward,
      nextState,
      timestamp: Date.now()
    };

    // Añadir a experience replay
    this.state.experienceReplay.push(experience);
    if (this.state.experienceReplay.length > MAX_REPLAY_SIZE) {
      this.state.experienceReplay = this.state.experienceReplay.slice(-MAX_REPLAY_SIZE);
    }

    // Actualizar Q-value directamente
    const stateKey = this.stateToKey(state);
    const nextStateKey = nextState ? this.stateToKey(nextState) : null;
    this.updateQValue(stateKey, action, reward, nextStateKey);

    // Incrementar episodios y decay exploration
    this.state.totalEpisodes += 1;
    this.state.explorationRate = Math.max(
      MIN_EXPLORATION,
      this.state.explorationRate * EXPLORATION_DECAY
    );

    // Actualizar métricas
    this.updateMetrics();
    
    await this.saveState();
  }

  /**
   * Entrena con experience replay (batch learning)
   */
  async trainFromReplay(batchSize: number = BATCH_SIZE): Promise<{ trained: number; avgLoss: number }> {
    await this.initialize();
    if (!this.state || this.state.experienceReplay.length < batchSize) {
      return { trained: 0, avgLoss: 0 };
    }

    // Muestrear batch aleatorio
    const shuffled = [...this.state.experienceReplay].sort(() => Math.random() - 0.5);
    const batch = shuffled.slice(0, batchSize);

    let totalLoss = 0;
    for (const exp of batch) {
      const stateKey = this.stateToKey(exp.state);
      const nextStateKey = exp.nextState ? this.stateToKey(exp.nextState) : null;
      
      const oldQ = this.getQValue(stateKey, exp.action);
      this.updateQValue(stateKey, exp.action, exp.reward, nextStateKey);
      const newQ = this.getQValue(stateKey, exp.action);
      
      totalLoss += Math.abs(newQ - oldQ);
    }

    await this.saveState();
    
    return {
      trained: batch.length,
      avgLoss: totalLoss / batch.length
    };
  }

  /**
   * Actualiza métricas de aprendizaje
   */
  private updateMetrics(): void {
    if (!this.state) return;

    // Calcular reward promedio
    const recentExperiences = this.state.experienceReplay.slice(-100);
    const avgReward = recentExperiences.length > 0
      ? recentExperiences.reduce((sum, e) => sum + e.reward, 0) / recentExperiences.length
      : 0;

    // Calcular skip rate
    const skipCount = recentExperiences.filter(e => e.action === 'skip').length;
    const skipRate = recentExperiences.length > 0 ? skipCount / recentExperiences.length : 0;

    // Encontrar mejores pares estado-acción
    const bestStateActions: Array<{ stateKey: string; action: Action; value: number }> = [];
    for (const [stateKey, actions] of Object.entries(this.state.qTable)) {
      for (const [action, { value, visits }] of Object.entries(actions)) {
        if (visits >= 5) {
          bestStateActions.push({ stateKey, action: action as Action, value });
        }
      }
    }
    bestStateActions.sort((a, b) => b.value - a.value);

    this.state.learningMetrics = {
      avgReward,
      skipRate,
      bestStateActions: bestStateActions.slice(0, 10)
    };
    this.state.lastUpdate = Date.now();
  }

  /**
   * Obtiene estadísticas del modelo RL
   */
  async getStats(): Promise<{
    totalEpisodes: number;
    explorationRate: number;
    qTableSize: number;
    experienceCount: number;
    learningMetrics: RLModelState['learningMetrics'];
    topPolicies: Array<{ state: string; action: Action; value: number; explanation: string }>;
  }> {
    await this.initialize();

    if (!this.state) {
      return {
        totalEpisodes: 0,
        explorationRate: 0,
        qTableSize: 0,
        experienceCount: 0,
        learningMetrics: { avgReward: 0, skipRate: 0, bestStateActions: [] },
        topPolicies: []
      };
    }

    // Generar explicaciones para top policies
    const topPolicies = this.state.learningMetrics.bestStateActions.slice(0, 5).map(sa => {
      const explanation = sa.action === 'skip' 
        ? 'Evitar predicción en estas condiciones'
        : `Predecir con confianza ${sa.action.replace('predict_', '')}`;
      return {
        state: sa.stateKey,
        action: sa.action,
        value: Math.round(sa.value * 10) / 10,
        explanation
      };
    });

    return {
      totalEpisodes: this.state.totalEpisodes,
      explorationRate: Math.round(this.state.explorationRate * 100) / 100,
      qTableSize: Object.keys(this.state.qTable).length,
      experienceCount: this.state.experienceReplay.length,
      learningMetrics: this.state.learningMetrics,
      topPolicies
    };
  }

  /**
   * Helper: Construye estado desde datos de predicción
   */
  buildState(params: {
    marketRegime: string;
    volatility: 'low' | 'medium' | 'high';
    timeframe: 'intraday' | 'swing' | 'long';
    avgFactorScore: number;
    factorCoherence: number;       // 0-100
    daysToEarnings?: number;
    recentAccuracy?: number;       // 0-100
  }): State {
    // Discretizar régimen
    let regime: State['regime'] = 'sideways';
    if (params.marketRegime.includes('bull')) regime = 'bull';
    else if (params.marketRegime.includes('bear')) regime = 'bear';
    else if (params.marketRegime.includes('volatile') || params.marketRegime.includes('panic')) regime = 'volatile';

    // Discretizar fuerza de señal
    let signalStrength: State['signalStrength'] = 'moderate';
    if (params.avgFactorScore > 70 || params.avgFactorScore < 30) signalStrength = 'strong';
    else if (params.avgFactorScore > 40 && params.avgFactorScore < 60) signalStrength = 'weak';

    // Discretizar coherencia
    let signalCoherence: State['signalCoherence'] = 'mixed';
    if (params.factorCoherence > 70) signalCoherence = 'aligned';
    else if (params.factorCoherence < 30) signalCoherence = 'conflicting';

    // Proximidad a eventos
    let eventProximity: State['eventProximity'] = 'none';
    if (params.daysToEarnings !== undefined) {
      if (params.daysToEarnings <= 2) eventProximity = 'imminent';
      else if (params.daysToEarnings <= 7) eventProximity = 'near';
    }

    // Performance reciente
    let recentPerformance: State['recentPerformance'] = 'average';
    if (params.recentAccuracy !== undefined) {
      if (params.recentAccuracy >= 65) recentPerformance = 'good';
      else if (params.recentAccuracy < 45) recentPerformance = 'poor';
    }

    return {
      regime,
      volatility: params.volatility,
      timeframe: params.timeframe,
      signalStrength,
      signalCoherence,
      eventProximity,
      recentPerformance
    };
  }

  /**
   * Reset del modelo RL
   */
  async reset(): Promise<void> {
    this.state = this.createEmptyState();
    await this.saveState();
  }
}

// Singleton export
export const reinforcementLearningService = new ReinforcementLearningService();
