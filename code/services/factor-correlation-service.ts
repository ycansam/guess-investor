/**
 * Factor Correlation Service
 * Detecta y modela interacciones entre factores para mejorar predicciones.
 * 
 * Conceptos clave:
 * - Coherence Bonus: Cuando factores importantes coinciden, la señal es más fuerte
 * - Conflict Penalty: Cuando factores se contradicen, reducir confianza
 * - Factor Synergies: Pares de factores que funcionan mejor juntos
 * - Redundancy Detection: Factores que dan la misma información
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { TrackedPrediction, predictionTrackingService } from './prediction-tracking-service';

// Storage key
const CORRELATIONS_KEY = 'factor-correlations';

const FACTORS = [
  'trend', 'technical', 'sentiment', 'news', 'macro',
  'competitors', 'forex', 'institutional', 'seasonality',
  'financials', 'expectations'
] as const;

type Factor = typeof FACTORS[number];

/**
 * Correlación entre dos factores
 */
export interface FactorPairCorrelation {
  factor1: Factor;
  factor2: Factor;
  correlation: number;           // -1 a +1: correlación entre sus valores
  synergyScore: number;          // 0-100: qué tan bien funcionan juntos
  redundancyScore: number;       // 0-100: qué tan redundante es el par
  interactionType: 'synergy' | 'redundant' | 'conflicting' | 'independent';
  conditionalImpact: number;     // Mejora en accuracy cuando ambos son fuertes
}

/**
 * Modelo de interacciones entre factores
 */
export interface FactorInteractionModel {
  correlationMatrix: Record<Factor, Record<Factor, number>>;
  synergies: FactorPairCorrelation[];
  redundancies: FactorPairCorrelation[];
  conflicts: FactorPairCorrelation[];
  lastUpdated: string;
  sampleSize: number;
}

/**
 * Ajuste de confianza basado en interacciones
 */
export interface ConfidenceAdjustment {
  originalConfidence: number;
  adjustedConfidence: number;
  coherenceBonus: number;        // Bonus por factores coherentes
  conflictPenalty: number;       // Penalización por conflictos
  reasons: string[];
}

/**
 * Perfil de señales actual
 */
export interface SignalProfile {
  strongBullish: Factor[];       // Factores muy positivos (>50)
  mildBullish: Factor[];         // Factores positivos (10-50)
  neutral: Factor[];             // Factores neutros (-10 a 10)
  mildBearish: Factor[];         // Factores negativos (-50 a -10)
  strongBearish: Factor[];       // Factores muy negativos (<-50)
  coherenceScore: number;        // 0-100
  conflictScore: number;         // 0-100
  dominantSignal: 'bullish' | 'bearish' | 'mixed' | 'neutral';
}

// Synergías conocidas (pares que funcionan bien juntos)
const KNOWN_SYNERGIES: [Factor, Factor][] = [
  ['trend', 'technical'],        // Momentum confirmado por técnico
  ['sentiment', 'news'],         // Sentiment coherente con noticias
  ['institutional', 'financials'], // Institucionales siguen fundamentales
  ['macro', 'forex'],            // Macro afecta divisas
  ['competitors', 'seasonality'], // Sector + estacionalidad
];

// Pares que suelen ser redundantes
const KNOWN_REDUNDANCIES: [Factor, Factor][] = [
  ['trend', 'sentiment'],        // Sentiment sigue tendencia
  ['news', 'expectations'],      // Noticias crean expectativas
];

class FactorCorrelationService {
  private model: FactorInteractionModel | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const json = await AsyncStorage.getItem(CORRELATIONS_KEY);
      if (json) {
        this.model = JSON.parse(json);
      }
      this.initialized = true;
    } catch (error) {
      console.error('[FactorCorr] Error loading:', error);
      this.initialized = true;
    }
  }

  private async save(): Promise<void> {
    if (!this.model) return;
    try {
      await AsyncStorage.setItem(CORRELATIONS_KEY, JSON.stringify(this.model));
    } catch (error) {
      console.error('[FactorCorr] Error saving:', error);
    }
  }

  /**
   * Analiza el perfil de señales actual
   */
  analyzeSignalProfile(factorScores: Record<string, number>): SignalProfile {
    const profile: SignalProfile = {
      strongBullish: [],
      mildBullish: [],
      neutral: [],
      mildBearish: [],
      strongBearish: [],
      coherenceScore: 0,
      conflictScore: 0,
      dominantSignal: 'neutral',
    };

    // Clasificar factores por intensidad
    for (const factor of FACTORS) {
      const score = factorScores[factor] ?? 0;
      
      if (score > 50) profile.strongBullish.push(factor);
      else if (score > 10) profile.mildBullish.push(factor);
      else if (score >= -10) profile.neutral.push(factor);
      else if (score >= -50) profile.mildBearish.push(factor);
      else profile.strongBearish.push(factor);
    }

    // Calcular coherencia
    const totalBullish = profile.strongBullish.length + profile.mildBullish.length;
    const totalBearish = profile.strongBearish.length + profile.mildBearish.length;
    const total = FACTORS.length;

    // Coherencia alta cuando la mayoría apunta en la misma dirección
    const dominantDirection = Math.max(totalBullish, totalBearish);
    profile.coherenceScore = (dominantDirection / total) * 100;

    // Conflicto cuando hay señales fuertes en ambas direcciones
    if (profile.strongBullish.length > 0 && profile.strongBearish.length > 0) {
      profile.conflictScore = Math.min(profile.strongBullish.length, profile.strongBearish.length) * 30;
    }

    // Señal dominante
    if (totalBullish > totalBearish * 1.5) {
      profile.dominantSignal = 'bullish';
    } else if (totalBearish > totalBullish * 1.5) {
      profile.dominantSignal = 'bearish';
    } else if (profile.conflictScore > 50) {
      profile.dominantSignal = 'mixed';
    }

    return profile;
  }

  /**
   * Calcula ajuste de confianza basado en interacciones
   */
  calculateConfidenceAdjustment(
    factorScores: Record<string, number>,
    baseConfidence: number
  ): ConfidenceAdjustment {
    const profile = this.analyzeSignalProfile(factorScores);
    const reasons: string[] = [];
    
    let coherenceBonus = 0;
    let conflictPenalty = 0;

    // === Coherence Bonus ===
    
    // Bonus si factores importantes coinciden
    if (profile.coherenceScore > 70) {
      coherenceBonus += 10;
      reasons.push(`Alta coherencia (${profile.coherenceScore.toFixed(0)}%): +10% confianza`);
    } else if (profile.coherenceScore > 50) {
      coherenceBonus += 5;
      reasons.push(`Coherencia moderada: +5% confianza`);
    }

    // Bonus por synergias conocidas activas
    for (const [f1, f2] of KNOWN_SYNERGIES) {
      const s1 = factorScores[f1] ?? 0;
      const s2 = factorScores[f2] ?? 0;
      
      // Si ambos son fuertes y en la misma dirección
      if (Math.abs(s1) > 40 && Math.abs(s2) > 40 && s1 * s2 > 0) {
        coherenceBonus += 3;
        reasons.push(`Sinergia ${f1}+${f2} activa: +3%`);
      }
    }

    // === Conflict Penalty ===
    
    // Penalización si hay conflictos fuertes
    if (profile.conflictScore > 60) {
      conflictPenalty += 15;
      reasons.push(`Conflicto severo: -15% confianza`);
    } else if (profile.conflictScore > 30) {
      conflictPenalty += 8;
      reasons.push(`Conflicto moderado: -8% confianza`);
    }

    // Penalización específica: trend vs technical divergiendo
    const trend = factorScores.trend ?? 0;
    const technical = factorScores.technical ?? 0;
    if (Math.abs(trend) > 30 && Math.abs(technical) > 30 && trend * technical < 0) {
      conflictPenalty += 10;
      reasons.push(`Divergencia trend/technical: -10%`);
    }

    // Penalización: sentiment vs institutional divergiendo
    const sentiment = factorScores.sentiment ?? 0;
    const institutional = factorScores.institutional ?? 0;
    if (Math.abs(sentiment) > 30 && Math.abs(institutional) > 30 && sentiment * institutional < 0) {
      conflictPenalty += 8;
      reasons.push(`Retail vs institucional diverge: -8%`);
    }

    // Calcular confianza ajustada
    let adjustedConfidence = baseConfidence + coherenceBonus - conflictPenalty;
    adjustedConfidence = Math.max(30, Math.min(95, adjustedConfidence));

    return {
      originalConfidence: baseConfidence,
      adjustedConfidence,
      coherenceBonus,
      conflictPenalty,
      reasons,
    };
  }

  /**
   * Reconstruye el modelo de correlaciones desde historial
   */
  async rebuildCorrelationModel(): Promise<FactorInteractionModel> {
    await this.initialize();

    const predictions = await predictionTrackingService.getVerifiedPredictions();
    
    if (predictions.length < 20) {
      throw new Error('Necesitas al menos 20 predicciones verificadas');
    }

    // Inicializar matriz de correlación
    const correlationMatrix: Record<Factor, Record<Factor, number>> = {} as any;
    for (const f1 of FACTORS) {
      correlationMatrix[f1] = {} as Record<Factor, number>;
      for (const f2 of FACTORS) {
        correlationMatrix[f1][f2] = f1 === f2 ? 1 : 0;
      }
    }

    // Calcular correlaciones entre pares de factores
    const pairCorrelations: FactorPairCorrelation[] = [];

    for (let i = 0; i < FACTORS.length; i++) {
      for (let j = i + 1; j < FACTORS.length; j++) {
        const f1 = FACTORS[i];
        const f2 = FACTORS[j];

        const correlation = this.computeFactorCorrelation(predictions, f1, f2);
        correlationMatrix[f1][f2] = correlation.valueCorrelation;
        correlationMatrix[f2][f1] = correlation.valueCorrelation;

        pairCorrelations.push({
          factor1: f1,
          factor2: f2,
          correlation: correlation.valueCorrelation,
          synergyScore: correlation.synergyScore,
          redundancyScore: correlation.redundancyScore,
          interactionType: correlation.interactionType,
          conditionalImpact: correlation.conditionalImpact,
        });
      }
    }

    // Clasificar pares
    const synergies = pairCorrelations.filter(p => p.interactionType === 'synergy');
    const redundancies = pairCorrelations.filter(p => p.interactionType === 'redundant');
    const conflicts = pairCorrelations.filter(p => p.interactionType === 'conflicting');

    this.model = {
      correlationMatrix,
      synergies,
      redundancies,
      conflicts,
      lastUpdated: new Date().toISOString(),
      sampleSize: predictions.length,
    };

    await this.save();
    return this.model;
  }

  /**
   * Calcula correlación y sinergia entre dos factores
   */
  private computeFactorCorrelation(
    predictions: TrackedPrediction[],
    f1: Factor,
    f2: Factor
  ): {
    valueCorrelation: number;
    synergyScore: number;
    redundancyScore: number;
    interactionType: 'synergy' | 'redundant' | 'conflicting' | 'independent';
    conditionalImpact: number;
  } {
    const f1Values: number[] = [];
    const f2Values: number[] = [];
    const accuracies: number[] = [];

    for (const pred of predictions) {
      const v1 = pred.factorScores?.[f1];
      const v2 = pred.factorScores?.[f2];
      const acc = pred.accuracyScore;

      if (v1 !== undefined && v2 !== undefined && acc !== undefined) {
        f1Values.push(v1);
        f2Values.push(v2);
        accuracies.push(acc);
      }
    }

    if (f1Values.length < 10) {
      return {
        valueCorrelation: 0,
        synergyScore: 0,
        redundancyScore: 0,
        interactionType: 'independent',
        conditionalImpact: 0,
      };
    }

    // Correlación entre valores de los factores
    const valueCorrelation = this.correlation(f1Values, f2Values);

    // Sinergia: accuracy es mayor cuando AMBOS son fuertes y coinciden
    let bothStrongSameDir = 0;
    let bothStrongSameDirAcc = 0;
    let normalAcc = 0;
    let normalCount = 0;

    for (let i = 0; i < f1Values.length; i++) {
      if (Math.abs(f1Values[i]) > 40 && Math.abs(f2Values[i]) > 40 && f1Values[i] * f2Values[i] > 0) {
        bothStrongSameDir++;
        bothStrongSameDirAcc += accuracies[i];
      } else {
        normalCount++;
        normalAcc += accuracies[i];
      }
    }

    const avgBothStrong = bothStrongSameDir > 0 ? bothStrongSameDirAcc / bothStrongSameDir : 0;
    const avgNormal = normalCount > 0 ? normalAcc / normalCount : 0;
    const conditionalImpact = avgBothStrong - avgNormal;
    const synergyScore = Math.max(0, conditionalImpact);

    // Redundancia: alta correlación positiva entre valores
    const redundancyScore = Math.max(0, (valueCorrelation - 0.5) * 100);

    // Determinar tipo de interacción
    let interactionType: 'synergy' | 'redundant' | 'conflicting' | 'independent' = 'independent';
    
    if (synergyScore > 10) {
      interactionType = 'synergy';
    } else if (redundancyScore > 30) {
      interactionType = 'redundant';
    } else if (valueCorrelation < -0.3) {
      interactionType = 'conflicting';
    }

    return {
      valueCorrelation,
      synergyScore,
      redundancyScore,
      interactionType,
      conditionalImpact,
    };
  }

  /**
   * Obtiene el modelo actual
   */
  async getModel(): Promise<FactorInteractionModel | null> {
    await this.initialize();
    return this.model;
  }

  /**
   * Genera reporte de correlaciones
   */
  async generateReport(): Promise<string> {
    await this.initialize();

    let report = '🔗 CORRELACIONES ENTRE FACTORES\n';
    report += '═'.repeat(50) + '\n\n';

    if (!this.model) {
      report += 'Modelo no entrenado. Ejecuta rebuildCorrelationModel() primero.\n';
      return report;
    }

    report += `Samples: ${this.model.sampleSize} | Updated: ${new Date(this.model.lastUpdated).toLocaleDateString()}\n\n`;

    // Sinergias
    report += '✨ SINERGIAS (funcionan mejor juntos):\n';
    for (const s of this.model.synergies.slice(0, 5)) {
      report += `  ${s.factor1} + ${s.factor2}: +${s.conditionalImpact.toFixed(1)} accuracy\n`;
    }

    // Redundancias
    if (this.model.redundancies.length > 0) {
      report += '\n🔄 REDUNDANCIAS (información similar):\n';
      for (const r of this.model.redundancies.slice(0, 3)) {
        report += `  ${r.factor1} ↔ ${r.factor2}: ${r.redundancyScore.toFixed(0)}% overlap\n`;
      }
    }

    // Conflictos
    if (this.model.conflicts.length > 0) {
      report += '\n⚔️ CONFLICTOS (suelen divergir):\n';
      for (const c of this.model.conflicts.slice(0, 3)) {
        report += `  ${c.factor1} vs ${c.factor2}: corr ${c.correlation.toFixed(2)}\n`;
      }
    }

    return report;
  }

  // === Helpers ===

  private correlation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length < 2) return 0;

    const n = x.length;
    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;

    let num = 0;
    let denX = 0;
    let denY = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      num += dx * dy;
      denX += dx * dx;
      denY += dy * dy;
    }

    const den = Math.sqrt(denX * denY);
    return den > 0 ? num / den : 0;
  }
}

// Singleton
export const factorCorrelationService = new FactorCorrelationService();
