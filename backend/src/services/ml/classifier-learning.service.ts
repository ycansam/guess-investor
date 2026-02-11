/**
 * Classifier Learning Service
 * 
 * Aprende y ajusta automáticamente los multiplicadores de cada clasificador
 * de activos basándose en el rendimiento de las predicciones verificadas.
 * 
 * Cuando una predicción se verifica:
 * 1. Identifica qué clasificador usó (assetGroup)
 * 2. Analiza qué factores contribuyeron más al acierto/error
 * 3. Ajusta los multiplicadores de ese clasificador
 * 4. Persiste los cambios para futuras predicciones
 */

import { prisma } from '../../config/database.js';
import { logger } from '../../middleware/logger.js';

// Tipo para los multiplicadores de un clasificador (14 factores)
interface ClassifierMultipliers {
  trend: number;
  technical: number;
  sentiment: number;
  news: number;
  macro: number;
  forex: number;
  institutional: number;
  financials: number;
  intradayTrend: number;
  optionsFlow: number;
  volumeProfile: number;
  divergences: number;
  volatilityIV: number;
  marketBreadth: number;
}

// Estado completo del aprendizaje de clasificadores
interface ClassifierLearningState {
  multipliers: Record<string, ClassifierMultipliers>;
  stats: Record<string, {
    sampleCount: number;
    successRate: number;
    avgAccuracy: number;
    lastUpdated: string;
  }>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// Multiplicadores base (por defecto)
const BASE_MULTIPLIERS: ClassifierMultipliers = {
  trend: 1.0,
  technical: 1.0,
  sentiment: 1.0,
  news: 1.0,
  macro: 1.0,
  forex: 1.0,
  institutional: 1.0,
  financials: 1.0,
  intradayTrend: 1.0,
  optionsFlow: 1.0,
  volumeProfile: 1.0,
  divergences: 1.0,
  volatilityIV: 1.0,
  marketBreadth: 1.0,
};

// Multiplicadores iniciales estáticos (los actuales del código)
const INITIAL_STATIC_MULTIPLIERS: Record<string, Partial<ClassifierMultipliers>> = {
  large_cap_stock: {
    financials: 1.3,
    institutional: 1.2,
    forex: 0.8,
    optionsFlow: 1.3,
  },
  small_cap_stock: {
    technical: 1.3,
    sentiment: 1.2,
    news: 1.3,
    institutional: 0.7,
    financials: 0.8,
    intradayTrend: 1.4,
    divergences: 1.3,
    volumeProfile: 1.2,
    volatilityIV: 1.2,
  },
  crypto_major: {
    sentiment: 1.5,
    news: 1.3,
    macro: 1.2,
    financials: 0.1,
    intradayTrend: 1.5,
    volumeProfile: 1.3,
    divergences: 1.4,
  },
  crypto_alt: {
    sentiment: 1.8,
    technical: 1.3,
    news: 1.4,
    financials: 0.05,
    macro: 0.7,
    intradayTrend: 1.8,
    volumeProfile: 1.5,
    divergences: 1.6,
  },
  etf_index: {
    macro: 1.4,
    trend: 1.2,
    forex: 1.1,
    financials: 0.3,
    marketBreadth: 1.5,
    optionsFlow: 1.2,
    volatilityIV: 1.1,
  },
  commodity: {
    macro: 1.5,
    forex: 2.0,
    sentiment: 0.7,
    financials: 0.1,
    intradayTrend: 1.2,
    volumeProfile: 1.3,
    volatilityIV: 1.4,
  },
  reit: {
    macro: 1.4,
    institutional: 1.3,
    financials: 1.2,
    forex: 0.6,
    marketBreadth: 1.1,
  },
  forex: {
    macro: 1.8,
    sentiment: 1.3,
    news: 1.2,
    financials: 0.1,
    institutional: 0.3,
    intradayTrend: 1.6,
    volumeProfile: 1.4,
    divergences: 1.3,
    volatilityIV: 1.3,
  },
  adr: {
    forex: 1.5,
    macro: 1.3,
    sentiment: 1.2,
  },
  default: {},
};

// Factores de aprendizaje
const LEARNING_RATE = 0.1; // Qué tan rápido aprende (0.1 = 10% de ajuste máximo)
const MIN_SAMPLES_TO_LEARN = 5; // Mínimo de muestras antes de ajustar
const MIN_MULTIPLIER = 0.05; // Multiplicador mínimo (5%)
const MAX_MULTIPLIER = 3.0; // Multiplicador máximo (300%)

class ClassifierLearningService {
  private state: ClassifierLearningState | null = null;
  private MODEL_TYPE = 'classifier_learning';

  /**
   * Inicializa el servicio cargando el estado guardado
   */
  async initialize(): Promise<void> {
    try {
      const saved = await prisma.mLModelState.findFirst({
        where: { modelType: this.MODEL_TYPE },
        orderBy: { createdAt: 'desc' },
      });

      if (saved) {
        this.state = JSON.parse(saved.stateJson);
        
        // Migrar: añadir factores nuevos que falten en el estado guardado
        if (this.state) {
          let migrated = false;
          for (const [group, mults] of Object.entries(this.state.multipliers)) {
            for (const factor of Object.keys(BASE_MULTIPLIERS) as (keyof ClassifierMultipliers)[]) {
              if (!(factor in mults)) {
                (mults as any)[factor] = BASE_MULTIPLIERS[factor];
                migrated = true;
              }
            }
            // Eliminar factores obsoletos (competitors, seasonality, expectations)
            for (const key of Object.keys(mults)) {
              if (!(key in BASE_MULTIPLIERS)) {
                delete (mults as any)[key];
                migrated = true;
              }
            }
          }
          if (migrated) {
            await this.saveState();
            logger.info('[ClassifierLearning] Migrated state: added new factors / removed obsolete ones');
          }
        }
        
        logger.info(`[ClassifierLearning] Loaded state v${this.state?.version} with ${Object.keys(this.state?.multipliers || {}).length} classifiers`);
      } else {
        // Inicializar con multiplicadores estáticos
        this.state = this.createInitialState();
        await this.saveState();
        logger.info('[ClassifierLearning] Created initial state from static multipliers');
      }
    } catch (error) {
      logger.error('[ClassifierLearning] Error loading state:', error);
      this.state = this.createInitialState();
    }
  }

  /**
   * Crea el estado inicial a partir de los multiplicadores estáticos
   */
  private createInitialState(): ClassifierLearningState {
    const multipliers: Record<string, ClassifierMultipliers> = {};
    const stats: Record<string, { sampleCount: number; successRate: number; avgAccuracy: number; lastUpdated: string }> = {};

    for (const [group, staticMults] of Object.entries(INITIAL_STATIC_MULTIPLIERS)) {
      multipliers[group] = { ...BASE_MULTIPLIERS, ...staticMults };
      stats[group] = {
        sampleCount: 0,
        successRate: 0,
        avgAccuracy: 0,
        lastUpdated: new Date().toISOString(),
      };
    }

    return {
      multipliers,
      stats,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Guarda el estado actual en la base de datos
   */
  private async saveState(): Promise<void> {
    if (!this.state) return;

    try {
      this.state.updatedAt = new Date().toISOString();
      this.state.version += 1;

      await prisma.mLModelState.upsert({
        where: {
          modelType_version: {
            modelType: this.MODEL_TYPE,
            version: 1, // Siempre usamos versión 1 y actualizamos
          },
        },
        update: {
          stateJson: JSON.stringify(this.state),
          updatedAt: new Date(),
        },
        create: {
          modelType: this.MODEL_TYPE,
          version: 1,
          stateJson: JSON.stringify(this.state),
        },
      });

      logger.debug(`[ClassifierLearning] Saved state v${this.state.version}`);
    } catch (error) {
      logger.error('[ClassifierLearning] Error saving state:', error);
    }
  }

  /**
   * Obtiene los multiplicadores para un clasificador
   */
  getMultipliers(assetGroup: string): ClassifierMultipliers {
    if (!this.state) {
      // Si no hay estado, devolver estáticos
      return { ...BASE_MULTIPLIERS, ...(INITIAL_STATIC_MULTIPLIERS[assetGroup] || {}) };
    }

    return this.state.multipliers[assetGroup] || this.state.multipliers['default'] || BASE_MULTIPLIERS;
  }

  /**
   * Obtiene todos los multiplicadores aprendidos
   */
  getAllMultipliers(): Record<string, ClassifierMultipliers> {
    if (!this.state) {
      const result: Record<string, ClassifierMultipliers> = {};
      for (const [group, mults] of Object.entries(INITIAL_STATIC_MULTIPLIERS)) {
        result[group] = { ...BASE_MULTIPLIERS, ...mults };
      }
      return result;
    }
    return this.state.multipliers;
  }

  /**
   * Obtiene estadísticas de aprendizaje
   */
  getStats(): Record<string, { sampleCount: number; successRate: number; avgAccuracy: number; lastUpdated: string }> {
    return this.state?.stats || {};
  }

  /**
   * Aprende de una predicción verificada
   * Este es el método principal que ajusta los multiplicadores
   */
  async learnFromVerifiedPrediction(prediction: {
    assetGroup: string;
    directionCorrect: boolean;
    accuracyScore: number;
    factorScores: Record<string, number>; // Score de cada factor (-100 a 100)
    factorWeights: Record<string, number>; // Peso usado de cada factor
    predictedChange: number;
    actualChange: number;
  }): Promise<void> {
    if (!this.state) await this.initialize();
    if (!this.state) return;

    const { assetGroup, directionCorrect, accuracyScore, factorScores, predictedChange, actualChange } = prediction;

    // Asegurar que existe el grupo
    if (!this.state.multipliers[assetGroup]) {
      this.state.multipliers[assetGroup] = { ...BASE_MULTIPLIERS };
      this.state.stats[assetGroup] = {
        sampleCount: 0,
        successRate: 0,
        avgAccuracy: 0,
        lastUpdated: new Date().toISOString(),
      };
    }

    const stats = this.state.stats[assetGroup];
    const oldMultipliers = { ...this.state.multipliers[assetGroup] };

    // Actualizar estadísticas
    stats.sampleCount += 1;
    stats.successRate = ((stats.successRate * (stats.sampleCount - 1)) + (directionCorrect ? 1 : 0)) / stats.sampleCount;
    stats.avgAccuracy = ((stats.avgAccuracy * (stats.sampleCount - 1)) + accuracyScore) / stats.sampleCount;
    stats.lastUpdated = new Date().toISOString();

    // Solo ajustar si tenemos suficientes muestras
    if (stats.sampleCount < MIN_SAMPLES_TO_LEARN) {
      logger.debug(`[ClassifierLearning] ${assetGroup}: ${stats.sampleCount}/${MIN_SAMPLES_TO_LEARN} samples, not adjusting yet`);
      await this.saveState();
      return;
    }

    // Calcular el error de predicción
    const predictionError = actualChange - predictedChange;
    const predictionCorrect = directionCorrect && accuracyScore > 50;

    // Ajustar cada factor según su contribución al error
    for (const factor of Object.keys(BASE_MULTIPLIERS) as (keyof ClassifierMultipliers)[]) {
      const score = factorScores[factor] || 0;
      
      // Si el factor tenía un score significativo
      if (Math.abs(score) > 10) {
        const signalDirection = score > 0 ? 1 : -1;
        const actualDirection = actualChange > 0 ? 1 : -1;
        const factorWasRight = signalDirection === actualDirection;

        // Ajuste: si el factor acertó, aumentar su multiplicador; si falló, reducirlo
        let adjustment = 0;
        if (factorWasRight && predictionCorrect) {
          // El factor ayudó a acertar → aumentar ligeramente
          adjustment = LEARNING_RATE * 0.5;
        } else if (factorWasRight && !predictionCorrect) {
          // El factor tenía razón pero la predicción falló → aumentar más
          adjustment = LEARNING_RATE;
        } else if (!factorWasRight && predictionCorrect) {
          // El factor falló pero la predicción acertó → reducir ligeramente
          adjustment = -LEARNING_RATE * 0.3;
        } else {
          // El factor falló y la predicción también → reducir más
          adjustment = -LEARNING_RATE * 0.7;
        }

        // Aplicar ajuste con límites
        const currentMult = this.state.multipliers[assetGroup][factor];
        const newMult = Math.max(MIN_MULTIPLIER, Math.min(MAX_MULTIPLIER, currentMult * (1 + adjustment)));
        this.state.multipliers[assetGroup][factor] = newMult;
      }
    }

    // Log de cambios significativos
    const changes: string[] = [];
    for (const factor of Object.keys(BASE_MULTIPLIERS) as (keyof ClassifierMultipliers)[]) {
      const oldVal = oldMultipliers[factor];
      const newVal = this.state.multipliers[assetGroup][factor];
      if (Math.abs(newVal - oldVal) > 0.01) {
        changes.push(`${factor}: ${(oldVal * 100).toFixed(0)}% → ${(newVal * 100).toFixed(0)}%`);
      }
    }

    if (changes.length > 0) {
      logger.info(`[ClassifierLearning] ${assetGroup} adjusted: ${changes.join(', ')}`);
    }

    await this.saveState();
  }

  /**
   * Entrena con múltiples predicciones verificadas (batch)
   */
  async trainFromBatch(predictions: Array<{
    assetGroup: string;
    directionCorrect: boolean;
    accuracyScore: number;
    factorScores: Record<string, number>;
    factorWeights: Record<string, number>;
    predictedChange: number;
    actualChange: number;
  }>): Promise<{ trained: number; byGroup: Record<string, number> }> {
    const byGroup: Record<string, number> = {};
    let trained = 0;

    for (const pred of predictions) {
      await this.learnFromVerifiedPrediction(pred);
      trained++;
      byGroup[pred.assetGroup] = (byGroup[pred.assetGroup] || 0) + 1;
    }

    logger.info(`[ClassifierLearning] Batch trained ${trained} predictions across ${Object.keys(byGroup).length} groups`);
    return { trained, byGroup };
  }

  /**
   * Obtiene el estado completo para diagnóstico
   */
  getDiagnostics(): {
    isInitialized: boolean;
    version: number;
    totalGroups: number;
    totalSamples: number;
    groups: Array<{
      name: string;
      sampleCount: number;
      successRate: number;
      avgAccuracy: number;
      multipliers: ClassifierMultipliers;
    }>;
  } {
    if (!this.state) {
      return {
        isInitialized: false,
        version: 0,
        totalGroups: 0,
        totalSamples: 0,
        groups: [],
      };
    }

    const groups = Object.entries(this.state.multipliers).map(([name, multipliers]) => ({
      name,
      sampleCount: this.state!.stats[name]?.sampleCount || 0,
      successRate: this.state!.stats[name]?.successRate || 0,
      avgAccuracy: this.state!.stats[name]?.avgAccuracy || 0,
      multipliers,
    }));

    const totalSamples = groups.reduce((sum, g) => sum + g.sampleCount, 0);

    return {
      isInitialized: true,
      version: this.state.version,
      totalGroups: groups.length,
      totalSamples,
      groups,
    };
  }

  /**
   * Reinicia los multiplicadores a los valores estáticos iniciales
   */
  async reset(): Promise<void> {
    this.state = this.createInitialState();
    await this.saveState();
    logger.info('[ClassifierLearning] Reset to initial static multipliers');
  }
}

// Singleton
export const classifierLearningService = new ClassifierLearningService();

// Inicializar al importar
classifierLearningService.initialize().catch(err => {
  logger.error('[ClassifierLearning] Failed to initialize:', err);
});
