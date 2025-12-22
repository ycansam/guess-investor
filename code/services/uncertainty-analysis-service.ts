/**
 * Servicio de Análisis de Incertidumbre (Meta-Learning)
 * 
 * Detecta condiciones que históricamente causan predicciones fallidas
 * y calcula un "uncertaintyScore" para cada predicción.
 * 
 * El sistema aprende cuándo NO debe predecir.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AssetType } from '../types';
import { CorporateEvents } from './corporate-events-service';
import { predictionTrackingService, TrackedPrediction } from './prediction-tracking-service';

const UNCERTAINTY_PATTERNS_KEY = 'uncertainty-patterns';
const UNCERTAINTY_THRESHOLD = 70; // Score de 0-100, >70 = "no predecir"

/**
 * Factores que pueden causar alta incertidumbre
 */
export interface UncertaintyFactors {
  // Eventos corporativos inminentes
  earningsInDays?: number; // Días hasta el próximo earnings (0 = hoy)
  hasUpcomingEarnings: boolean;
  
  // Volatilidad anormal
  currentVolatility?: number; // Volatilidad actual (%)
  avgVolatility?: number; // Volatilidad promedio histórica
  isVolatilityExtreme: boolean; // Volatilidad >2x promedio
  
  // Insuficiencia de datos
  missingCriticalData: string[]; // Factores sin datos: ['news', 'sentiment']
  dataCompleteness: number; // 0-100, % de factores con datos
  
  // Señales contradictorias
  signalCoherence: number; // 0-100, qué tan coherentes son las señales
  conflictingFactors: number; // Cantidad de factores que se contradicen
  
  // Condiciones de mercado extremas
  marketRegime?: 'panic' | 'euphoria' | 'normal';
  vixLevel?: 'extreme_fear' | 'fear' | 'neutral' | 'complacency' | 'extreme_complacency';
  
  // Historial de fallos en condiciones similares
  historicalFailRate?: number; // % de predicciones fallidas en condiciones similares (0-100)
  similarConditionSamples?: number; // Cantidad de muestras en condiciones similares
}

/**
 * Resultado del análisis de incertidumbre
 */
export interface UncertaintyAnalysis {
  uncertaintyScore: number; // 0-100, donde 100 = máxima incertidumbre
  shouldPredict: boolean; // false si uncertaintyScore > threshold
  confidence: 'high' | 'medium' | 'low' | 'very_low';
  primaryReasons: string[]; // Razones principales de la incertidumbre
  factors: UncertaintyFactors;
  recommendation: string; // Texto para mostrar al usuario
}

/**
 * Patrón de incertidumbre aprendido
 */
interface UncertaintyPattern {
  condition: string; // Descripción de la condición
  failRate: number; // % de predicciones fallidas (0-100)
  samples: number; // Cantidad de muestras
  avgAccuracyScore: number; // Score promedio en estas condiciones
  
  // Condiciones específicas
  earningsProximity?: 'imminent' | 'near' | 'distant'; // <2 días, 2-7 días, >7 días
  volatilityLevel?: 'extreme' | 'high' | 'normal' | 'low';
  dataQuality?: 'insufficient' | 'partial' | 'complete';
  signalType?: 'coherent' | 'mixed' | 'conflicting';
}

class UncertaintyAnalysisService {
  private patterns: UncertaintyPattern[] = [];
  private initialized = false;

  /**
   * Inicializa el servicio y carga patrones aprendidos
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      const stored = await AsyncStorage.getItem(UNCERTAINTY_PATTERNS_KEY);
      if (stored) {
        this.patterns = JSON.parse(stored);
      }
      
      // Si no hay patrones, aprender de predicciones históricas
      if (this.patterns.length === 0) {
        await this.learnFromHistory();
      }
      
      this.initialized = true;
    } catch (error) {
      console.error('Error initializing uncertainty analysis service:', error);
      this.patterns = [];
      this.initialized = true;
    }
  }

  /**
   * Analiza la incertidumbre de una predicción ANTES de generarla
   */
  async analyzeUncertainty(params: {
    symbol: string;
    assetType: AssetType;
    timeframeDays: number;
    volatility?: number;
    avgHistoricalVolatility?: number;
    upcomingEvents?: CorporateEvents;
    factorScores?: Record<string, number>;
    dataCompleteness?: number; // 0-100
    vixLevel?: 'extreme_fear' | 'fear' | 'neutral' | 'complacency' | 'extreme_complacency';
  }): Promise<UncertaintyAnalysis> {
    await this.initialize();

    const factors = this.extractFactors(params);
    const score = this.calculateUncertaintyScore(factors);
    const confidence = this.getConfidenceLevel(score);
    const reasons = this.getPrimaryReasons(factors, score);
    const recommendation = this.generateRecommendation(score, reasons);

    return {
      uncertaintyScore: score,
      shouldPredict: score < UNCERTAINTY_THRESHOLD,
      confidence,
      primaryReasons: reasons,
      factors,
      recommendation,
    };
  }

  /**
   * Extrae factores de incertidumbre de los parámetros
   */
  private extractFactors(params: {
    symbol: string;
    assetType: AssetType;
    timeframeDays: number;
    volatility?: number;
    avgHistoricalVolatility?: number;
    upcomingEvents?: CorporateEvents;
    factorScores?: Record<string, number>;
    dataCompleteness?: number;
    vixLevel?: 'extreme_fear' | 'fear' | 'neutral' | 'complacency' | 'extreme_complacency';
  }): UncertaintyFactors {
    const factors: UncertaintyFactors = {
      hasUpcomingEarnings: false,
      isVolatilityExtreme: false,
      missingCriticalData: [],
      dataCompleteness: params.dataCompleteness ?? 0,
      signalCoherence: 50, // Neutral por defecto
      conflictingFactors: 0,
    };

    // 1. Eventos corporativos inminentes
    if (params.upcomingEvents?.nextEarningsDate) {
      const earningsEvent = params.upcomingEvents.nextEarningsDate;
      // nextEarningsDate es un EarningsEvent con propiedad date
      factors.earningsInDays = earningsEvent.daysUntil;
      factors.hasUpcomingEarnings = earningsEvent.daysUntil >= 0 && earningsEvent.daysUntil <= params.timeframeDays + 2;
    }

    // 2. Volatilidad extrema
    if (params.volatility !== undefined && params.avgHistoricalVolatility !== undefined) {
      factors.currentVolatility = params.volatility;
      factors.avgVolatility = params.avgHistoricalVolatility;
      factors.isVolatilityExtreme = params.volatility > params.avgHistoricalVolatility * 2;
    }

    // 3. Datos faltantes
    if (params.factorScores) {
      const totalFactors = Object.keys(params.factorScores).length;
      const factorsWithData = Object.entries(params.factorScores).filter(
        ([_, score]) => score !== 0 && !isNaN(score)
      ).length;
      
      factors.dataCompleteness = totalFactors > 0 ? (factorsWithData / totalFactors) * 100 : 0;
      
      // Identificar qué factores faltan
      Object.entries(params.factorScores).forEach(([name, score]) => {
        if (score === 0 || isNaN(score)) {
          factors.missingCriticalData.push(name);
        }
      });
    }

    // 4. Coherencia de señales
    if (params.factorScores) {
      const { coherence, conflicts } = this.analyzeSignalCoherence(params.factorScores);
      factors.signalCoherence = coherence;
      factors.conflictingFactors = conflicts;
    }

    // 5. Condiciones de mercado
    factors.vixLevel = params.vixLevel;
    if (params.vixLevel === 'extreme_fear') {
      factors.marketRegime = 'panic';
    } else if (params.vixLevel === 'complacency') {
      factors.marketRegime = 'euphoria';
    } else {
      factors.marketRegime = 'normal';
    }

    // 6. Historial de fallos en condiciones similares
    const historicalPattern = this.findSimilarPattern(factors, params.timeframeDays);
    if (historicalPattern) {
      factors.historicalFailRate = historicalPattern.failRate;
      factors.similarConditionSamples = historicalPattern.samples;
    }

    return factors;
  }

  /**
   * Analiza la coherencia de las señales de los factores
   */
  private analyzeSignalCoherence(factorScores: Record<string, number>): {
    coherence: number;
    conflicts: number;
  } {
    const scores = Object.values(factorScores).filter(s => !isNaN(s) && s !== 0);
    
    if (scores.length < 2) {
      return { coherence: 50, conflicts: 0 }; // Insuficientes datos
    }

    // Contar señales positivas, negativas y neutrales
    const positive = scores.filter(s => s > 15).length;
    const negative = scores.filter(s => s < -15).length;
    const neutral = scores.filter(s => s >= -15 && s <= 15).length;

    // Si la mayoría apunta en la misma dirección = alta coherencia
    const total = scores.length;
    const maxDirection = Math.max(positive, negative, neutral);
    const coherenceRatio = maxDirection / total;

    // Coherencia: 0-100
    // 100 = todas las señales van en la misma dirección
    // 0 = señales completamente mezcladas
    const coherence = coherenceRatio * 100;

    // Conflictos: cantidad de señales que van en dirección opuesta a la mayoría
    const conflicts = positive > negative ? negative : positive;

    return { coherence, conflicts };
  }

  /**
   * Calcula el score de incertidumbre (0-100)
   */
  private calculateUncertaintyScore(factors: UncertaintyFactors): number {
    let score = 0;

    // 1. Earnings inminentes (+40 puntos si <2 días, +20 si <7 días)
    if (factors.earningsInDays !== undefined) {
      if (factors.earningsInDays < 2) {
        score += 40;
      } else if (factors.earningsInDays < 7) {
        score += 20;
      }
    }

    // 2. Volatilidad extrema (+30 puntos)
    if (factors.isVolatilityExtreme) {
      score += 30;
    }

    // 3. Datos faltantes (+25 puntos si <50% completo, +15 si <75%)
    if (factors.dataCompleteness < 50) {
      score += 25;
    } else if (factors.dataCompleteness < 75) {
      score += 15;
    }

    // 4. Señales contradictorias (+20 puntos si coherencia <40%)
    if (factors.signalCoherence < 40) {
      score += 20;
    } else if (factors.signalCoherence < 60) {
      score += 10;
    }

    // 5. Condiciones de mercado extremas (+15 puntos)
    if (factors.marketRegime === 'panic' || factors.marketRegime === 'euphoria') {
      score += 15;
    }

    // 6. Historial de fallos en condiciones similares
    if (factors.historicalFailRate !== undefined && factors.similarConditionSamples !== undefined) {
      if (factors.similarConditionSamples >= 5) {
        // Solo considerar si hay suficientes muestras
        if (factors.historicalFailRate > 60) {
          score += 30; // >60% fallos históricos = muy incierto
        } else if (factors.historicalFailRate > 40) {
          score += 15;
        }
      }
    }

    return Math.min(score, 100);
  }

  /**
   * Obtiene el nivel de confianza basado en el score
   */
  private getConfidenceLevel(score: number): 'high' | 'medium' | 'low' | 'very_low' {
    if (score >= 80) return 'very_low';
    if (score >= 60) return 'low';
    if (score >= 40) return 'medium';
    return 'high';
  }

  /**
   * Obtiene las razones principales de la incertidumbre
   */
  private getPrimaryReasons(factors: UncertaintyFactors, score: number): string[] {
    const reasons: string[] = [];

    if (factors.earningsInDays !== undefined && factors.earningsInDays < 7) {
      reasons.push(`Earnings en ${factors.earningsInDays} días - alta volatilidad esperada`);
    }

    if (factors.isVolatilityExtreme) {
      reasons.push(`Volatilidad ${factors.currentVolatility?.toFixed(0)}% (2x promedio) - movimientos impredecibles`);
    }

    if (factors.dataCompleteness < 60) {
      reasons.push(`Datos incompletos (${factors.dataCompleteness.toFixed(0)}%) - factores faltantes: ${factors.missingCriticalData.slice(0, 3).join(', ')}`);
    }

    if (factors.signalCoherence < 50) {
      reasons.push(`Señales contradictorias (${factors.conflictingFactors} conflictos) - dirección incierta`);
    }

    if (factors.marketRegime === 'panic') {
      reasons.push('Mercado en pánico - movimientos irracionales');
    } else if (factors.marketRegime === 'euphoria') {
      reasons.push('Mercado en euforia - riesgo de corrección');
    }

    if (factors.historicalFailRate !== undefined && factors.historicalFailRate > 50 && factors.similarConditionSamples && factors.similarConditionSamples >= 5) {
      reasons.push(`Historial: ${factors.historicalFailRate.toFixed(0)}% fallos en condiciones similares`);
    }

    return reasons.slice(0, 3); // Máximo 3 razones principales
  }

  /**
   * Genera recomendación para el usuario
   */
  private generateRecommendation(score: number, reasons: string[]): string {
    if (score >= UNCERTAINTY_THRESHOLD) {
      return `⚠️ NO RECOMENDADO predecir (Incertidumbre: ${score}%)\n\nRazones:\n${reasons.map(r => `• ${r}`).join('\n')}`;
    } else if (score >= 50) {
      return `⚡ Predicción posible pero con precaución (Incertidumbre: ${score}%)\n\nFactores de riesgo:\n${reasons.map(r => `• ${r}`).join('\n')}`;
    } else {
      return `✅ Condiciones favorables para predicción (Incertidumbre: ${score}%)`;
    }
  }

  /**
   * Busca un patrón similar en el historial aprendido
   */
  private findSimilarPattern(factors: UncertaintyFactors, timeframeDays: number): UncertaintyPattern | null {
    // Clasificar earnings proximity
    let earningsProx: 'imminent' | 'near' | 'distant' | undefined;
    if (factors.earningsInDays !== undefined) {
      if (factors.earningsInDays < 2) earningsProx = 'imminent';
      else if (factors.earningsInDays < 7) earningsProx = 'near';
      else earningsProx = 'distant';
    }

    // Clasificar volatility
    let volLevel: 'extreme' | 'high' | 'normal' | 'low' | undefined;
    if (factors.isVolatilityExtreme) volLevel = 'extreme';
    else if (factors.currentVolatility !== undefined) {
      if (factors.currentVolatility > 50) volLevel = 'high';
      else if (factors.currentVolatility > 20) volLevel = 'normal';
      else volLevel = 'low';
    }

    // Clasificar data quality
    let dataQual: 'insufficient' | 'partial' | 'complete';
    if (factors.dataCompleteness < 50) dataQual = 'insufficient';
    else if (factors.dataCompleteness < 80) dataQual = 'partial';
    else dataQual = 'complete';

    // Clasificar signals
    let signalType: 'coherent' | 'mixed' | 'conflicting';
    if (factors.signalCoherence > 70) signalType = 'coherent';
    else if (factors.signalCoherence > 40) signalType = 'mixed';
    else signalType = 'conflicting';

    // Buscar patrón que coincida
    return this.patterns.find(p => {
      let matches = 0;
      let total = 0;

      if (p.earningsProximity && earningsProx) {
        total++;
        if (p.earningsProximity === earningsProx) matches++;
      }
      if (p.volatilityLevel && volLevel) {
        total++;
        if (p.volatilityLevel === volLevel) matches++;
      }
      if (p.dataQuality) {
        total++;
        if (p.dataQuality === dataQual) matches++;
      }
      if (p.signalType) {
        total++;
        if (p.signalType === signalType) matches++;
      }

      // Requiere al menos 60% de coincidencia
      return total > 0 && (matches / total) >= 0.6;
    }) || null;
  }

  /**
   * Aprende patrones de incertidumbre del historial de predicciones
   */
  async learnFromHistory(): Promise<void> {
    try {
      const verifiedPredictions = await predictionTrackingService.getVerifiedPredictions();
      
      if (verifiedPredictions.length < 10) {
        // Insuficientes datos para aprender
        return;
      }

      // Agrupar por condiciones
      const groups = this.groupByConditions(verifiedPredictions);

      // Crear patrones
      this.patterns = groups.map(group => ({
        condition: group.description,
        failRate: (group.failed / group.total) * 100,
        samples: group.total,
        avgAccuracyScore: group.avgScore,
        earningsProximity: group.earningsProx,
        volatilityLevel: group.volLevel,
        dataQuality: group.dataQual,
        signalType: group.signalType,
      }));

      // Guardar patrones
      await AsyncStorage.setItem(UNCERTAINTY_PATTERNS_KEY, JSON.stringify(this.patterns));
    } catch (error) {
      console.error('Error learning from history:', error);
    }
  }

  /**
   * Agrupa predicciones por condiciones similares
   */
  private groupByConditions(predictions: TrackedPrediction[]): Array<{
    description: string;
    total: number;
    failed: number;
    avgScore: number;
    earningsProx?: 'imminent' | 'near' | 'distant';
    volLevel?: 'extreme' | 'high' | 'normal' | 'low';
    dataQual?: 'insufficient' | 'partial' | 'complete';
    signalType?: 'coherent' | 'mixed' | 'conflicting';
  }> {
    // TODO: Implementar agrupación más sofisticada
    // Por ahora, agrupar solo por volatilidad
    const groups: Map<string, TrackedPrediction[]> = new Map();

    predictions.forEach(p => {
      const key = p.volatilityCategory || 'unknown';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    });

    return Array.from(groups.entries()).map(([key, preds]) => {
      const failed = preds.filter(p => p.predictionQuality === 'failed').length;
      const avgScore = preds.reduce((sum, p) => sum + (p.accuracyScore || 0), 0) / preds.length;

      return {
        description: `Volatility: ${key}`,
        total: preds.length,
        failed,
        avgScore,
        volLevel: key === 'high' ? 'high' : key === 'low' ? 'low' : 'normal',
      };
    });
  }

  /**
   * Registra el resultado de una predicción para aprendizaje futuro
   */
  async recordPredictionOutcome(
    prediction: TrackedPrediction,
    uncertaintyFactors: UncertaintyFactors
  ): Promise<void> {
    // Este método será llamado cuando se verifique una predicción
    // Para actualizar los patrones aprendidos
    await this.learnFromHistory();
  }

  /**
   * Resetea todos los patrones aprendidos
   */
  async reset(): Promise<void> {
    this.patterns = [];
    await AsyncStorage.removeItem(UNCERTAINTY_PATTERNS_KEY);
    this.initialized = false;
  }
}

export const uncertaintyAnalysisService = new UncertaintyAnalysisService();
