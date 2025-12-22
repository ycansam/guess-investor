/**
 * Feature Engineering Service
 * Crea features derivados automáticamente para mejorar las predicciones.
 * 
 * Features derivados:
 * - RSI Divergence: RSI vs precio divergiendo
 * - Momentum Exhaustion: Volumen cayendo en rally
 * - Earnings Proximity Risk: Cercanía a earnings
 * - Signal Coherence: Qué tan alineados están los factores
 * - Trend Strength: Fuerza de la tendencia actual
 * - Mean Reversion Signal: Probabilidad de reversión
 * - Sector Rotation: Si el sector está recibiendo flujos
 * - Volatility Regime: Régimen de volatilidad actual
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { predictionTrackingService } from './prediction-tracking-service';

// Storage key
const FEATURE_IMPORTANCE_KEY = 'feature-importance';

/**
 * Features básicos (los 11 factores originales)
 */
const BASE_FACTORS = [
  'trend', 'technical', 'sentiment', 'news', 'macro',
  'competitors', 'forex', 'institutional', 'seasonality',
  'financials', 'expectations'
] as const;

type BaseFactor = typeof BASE_FACTORS[number];

/**
 * Features derivados
 */
export interface DerivedFeatures {
  // Divergencias
  rsiDivergence: number;          // -100 a +100: negativo = bearish divergence
  macdDivergence: number;         // -100 a +100
  volumeDivergence: number;       // Volumen vs precio
  
  // Momentum
  momentumExhaustion: number;     // 0-100: alto = momentum agotándose
  trendStrength: number;          // 0-100: fuerza de tendencia
  trendAge: number;               // 0-100: qué tan "vieja" es la tendencia
  
  // Riesgo/Eventos
  earningsProximityRisk: number;  // 0-100: riesgo por cercanía a earnings
  eventRisk: number;              // 0-100: riesgo por eventos próximos
  
  // Coherencia
  signalCoherence: number;        // 0-100: qué tan alineados están los factores
  bullBearBalance: number;        // -100 a +100: balance de señales
  conflictLevel: number;          // 0-100: nivel de señales contradictorias
  
  // Mean Reversion
  meanReversionSignal: number;    // -100 a +100: señal de reversión
  overboughtOversold: number;     // -100 (oversold) a +100 (overbought)
  
  // Sector/Mercado
  sectorMomentum: number;         // -100 a +100: momento del sector
  marketBreadth: number;          // 0-100: salud del mercado general
  
  // Volatilidad
  volatilityRegime: number;       // 0 = low, 50 = medium, 100 = high
  volatilityTrend: number;        // -100 (cayendo) a +100 (subiendo)
}

/**
 * Importancia de cada feature
 */
export interface FeatureImportance {
  feature: string;
  importance: number;         // 0-100
  correlation: number;        // Correlación con accuracy
  predictivePower: number;    // Qué tan bien predice por sí solo
  isUseful: boolean;          // Si vale la pena incluirlo
}

/**
 * Feature set completo
 */
export interface EnhancedFeatures {
  baseFeatures: Record<BaseFactor, number>;
  derivedFeatures: DerivedFeatures;
  allFeatures: Record<string, number>;
  featureCount: number;
}

class FeatureEngineeringService {
  private featureImportance: Map<string, FeatureImportance> = new Map();
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const json = await AsyncStorage.getItem(FEATURE_IMPORTANCE_KEY);
      if (json) {
        const array: FeatureImportance[] = JSON.parse(json);
        for (const fi of array) {
          this.featureImportance.set(fi.feature, fi);
        }
      }
      this.initialized = true;
    } catch (error) {
      console.error('[FeatureEng] Error loading:', error);
      this.initialized = true;
    }
  }

  private async save(): Promise<void> {
    try {
      const array = Array.from(this.featureImportance.values());
      await AsyncStorage.setItem(FEATURE_IMPORTANCE_KEY, JSON.stringify(array));
    } catch (error) {
      console.error('[FeatureEng] Error saving:', error);
    }
  }

  /**
   * Genera features derivados a partir de los base factors
   */
  generateDerivedFeatures(
    baseFactors: Record<string, number>,
    metadata?: {
      daysToEarnings?: number;
      volatility?: number;
      volumeChange?: number;
      priceChange5d?: number;
      priceChange20d?: number;
      sectorChange?: number;
    }
  ): DerivedFeatures {
    const trend = baseFactors.trend ?? 0;
    const technical = baseFactors.technical ?? 0;
    const sentiment = baseFactors.sentiment ?? 0;
    const news = baseFactors.news ?? 0;
    const institutional = baseFactors.institutional ?? 0;
    const competitors = baseFactors.competitors ?? 0;
    const macro = baseFactors.macro ?? 0;

    // === Divergencias ===
    
    // RSI Divergence: Si técnico dice sobrecompra pero trend sigue subiendo
    const rsiDivergence = this.computeDivergence(technical, trend);
    
    // MACD Divergence aproximado
    const macdDivergence = this.computeDivergence(technical * 0.6 + trend * 0.4, sentiment);
    
    // Volume Divergence
    const volumeChange = metadata?.volumeChange ?? 0;
    const priceChange = metadata?.priceChange5d ?? 0;
    const volumeDivergence = this.computeDivergence(volumeChange, priceChange);

    // === Momentum ===
    
    // Momentum Exhaustion: tendencia fuerte pero volumen cayendo
    const momentumExhaustion = Math.max(0, Math.min(100,
      Math.abs(trend) > 50 && volumeChange < 0 
        ? 50 + Math.abs(trend) * 0.5 - volumeChange * 0.3
        : 20
    ));
    
    // Trend Strength
    const trendStrength = Math.min(100, Math.abs(trend) + Math.abs(technical) * 0.3);
    
    // Trend Age (simulado)
    const trendAge = Math.min(100, Math.abs(metadata?.priceChange20d ?? 0) * 2);

    // === Riesgo/Eventos ===
    
    // Earnings Proximity Risk
    const daysToEarnings = metadata?.daysToEarnings ?? 999;
    const earningsProximityRisk = daysToEarnings <= 0 ? 0 : 
      daysToEarnings <= 3 ? 90 :
      daysToEarnings <= 7 ? 70 :
      daysToEarnings <= 14 ? 40 :
      daysToEarnings <= 30 ? 20 : 5;
    
    // Event Risk combinado
    const eventRisk = Math.min(100, earningsProximityRisk + Math.abs(news) * 0.3);

    // === Coherencia ===
    
    // Signal Coherence: qué tan de acuerdo están los factores
    const signals = [trend, technical, sentiment, news, institutional];
    const positives = signals.filter(s => s > 10).length;
    const negatives = signals.filter(s => s < -10).length;
    const signalCoherence = Math.abs(positives - negatives) / signals.length * 100;
    
    // Bull/Bear Balance
    const bullBearBalance = this.mean(signals);
    
    // Conflict Level
    const conflictLevel = 100 - signalCoherence;

    // === Mean Reversion ===
    
    // Señal de reversión
    const overboughtOversold = technical; // Usando technical como proxy de RSI
    const meanReversionSignal = overboughtOversold > 70 ? -(overboughtOversold - 70) * 2 :
                                 overboughtOversold < -70 ? -((overboughtOversold + 70) * 2) : 0;

    // === Sector/Mercado ===
    
    const sectorMomentum = competitors;
    const marketBreadth = Math.min(100, Math.max(0, 50 + macro * 0.5));

    // === Volatilidad ===
    
    const vol = metadata?.volatility ?? 30;
    const volatilityRegime = vol < 20 ? 20 : vol > 50 ? 80 : 50;
    const volatilityTrend = 0; // Necesitaría histórico

    return {
      rsiDivergence,
      macdDivergence,
      volumeDivergence,
      momentumExhaustion,
      trendStrength,
      trendAge,
      earningsProximityRisk,
      eventRisk,
      signalCoherence,
      bullBearBalance,
      conflictLevel,
      meanReversionSignal,
      overboughtOversold,
      sectorMomentum,
      marketBreadth,
      volatilityRegime,
      volatilityTrend,
    };
  }

  /**
   * Genera feature set completo
   */
  generateEnhancedFeatures(
    baseFactors: Record<string, number>,
    metadata?: {
      daysToEarnings?: number;
      volatility?: number;
      volumeChange?: number;
      priceChange5d?: number;
      priceChange20d?: number;
      sectorChange?: number;
    }
  ): EnhancedFeatures {
    const derived = this.generateDerivedFeatures(baseFactors, metadata);

    const allFeatures: Record<string, number> = {
      // Base features
      ...baseFactors,
      // Derived features
      ...derived,
    };

    return {
      baseFeatures: baseFactors as Record<BaseFactor, number>,
      derivedFeatures: derived,
      allFeatures,
      featureCount: Object.keys(allFeatures).length,
    };
  }

  /**
   * Calcula la importancia de cada feature basado en historial
   */
  async computeFeatureImportance(): Promise<FeatureImportance[]> {
    await this.initialize();

    const predictions = await predictionTrackingService.getVerifiedPredictions();
    
    if (predictions.length < 20) {
      return [];
    }

    // Regenerar derived features para predicciones históricas
    const enhancedPredictions = predictions.map(pred => ({
      prediction: pred,
      enhanced: this.generateEnhancedFeatures(pred.factorScores || {}, {
        volatility: pred.volatility,
        daysToEarnings: pred.uncertaintyFactors?.earningsInDays,
      }),
    }));

    const importances: FeatureImportance[] = [];

    // Calcular importancia de cada feature
    const allFeatureNames = Object.keys(enhancedPredictions[0].enhanced.allFeatures);

    for (const featureName of allFeatureNames) {
      const featureValues: number[] = [];
      const accuracyValues: number[] = [];

      for (const ep of enhancedPredictions) {
        const value = ep.enhanced.allFeatures[featureName];
        const accuracy = ep.prediction.accuracyScore;

        if (value !== undefined && accuracy !== undefined) {
          featureValues.push(value);
          accuracyValues.push(accuracy);
        }
      }

      if (featureValues.length >= 10) {
        const correlation = this.correlation(featureValues, accuracyValues);
        const absCorr = Math.abs(correlation);
        
        // Importancia basada en correlación
        const importance = absCorr * 100;
        
        // Predictive power: R² aproximado
        const predictivePower = Math.pow(absCorr, 2) * 100;

        const fi: FeatureImportance = {
          feature: featureName,
          importance,
          correlation,
          predictivePower,
          isUseful: importance > 10, // >10% correlación es útil
        };

        importances.push(fi);
        this.featureImportance.set(featureName, fi);
      }
    }

    await this.save();

    return importances.sort((a, b) => b.importance - a.importance);
  }

  /**
   * Obtiene los features más importantes
   */
  async getTopFeatures(n: number = 10): Promise<FeatureImportance[]> {
    await this.initialize();
    
    if (this.featureImportance.size === 0) {
      await this.computeFeatureImportance();
    }

    return Array.from(this.featureImportance.values())
      .sort((a, b) => b.importance - a.importance)
      .slice(0, n);
  }

  /**
   * Genera reporte de features
   */
  async generateReport(): Promise<string> {
    const topFeatures = await this.getTopFeatures(15);

    let report = '🔧 FEATURE ENGINEERING\n';
    report += '═'.repeat(50) + '\n\n';

    report += 'FEATURES DERIVADOS DISPONIBLES:\n';
    report += '  Divergencias: RSI, MACD, Volume\n';
    report += '  Momentum: Exhaustion, Trend Strength, Trend Age\n';
    report += '  Riesgo: Earnings Proximity, Event Risk\n';
    report += '  Coherencia: Signal Coherence, Bull/Bear Balance\n';
    report += '  Mean Reversion: Overbought/Oversold Signal\n';
    report += '  Mercado: Sector Momentum, Market Breadth\n';
    report += '  Volatilidad: Regime, Trend\n\n';

    if (topFeatures.length > 0) {
      report += 'TOP FEATURES POR IMPORTANCIA:\n';
      for (const fi of topFeatures) {
        const useful = fi.isUseful ? '✅' : '⬜';
        const corrSign = fi.correlation >= 0 ? '+' : '';
        report += `  ${useful} ${fi.feature}: ${fi.importance.toFixed(1)}% (corr: ${corrSign}${fi.correlation.toFixed(2)})\n`;
      }
    } else {
      report += 'Insuficientes datos para calcular importancia de features\n';
    }

    return report;
  }

  // === Helpers ===

  private computeDivergence(signal1: number, signal2: number): number {
    // Divergencia cuando señales van en direcciones opuestas
    if ((signal1 > 20 && signal2 < -20) || (signal1 < -20 && signal2 > 20)) {
      return (signal1 - signal2) / 2;
    }
    return 0;
  }

  private mean(values: number[]): number {
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  }

  private correlation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length < 2) return 0;

    const n = x.length;
    const meanX = this.mean(x);
    const meanY = this.mean(y);

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
export const featureEngineeringService = new FeatureEngineeringService();
