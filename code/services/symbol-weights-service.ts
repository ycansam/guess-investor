/**
 * Symbol Weights Service
 * Aprende pesos específicos para cada símbolo cuando hay suficiente historial.
 * 
 * Características:
 * - Pesos individuales por símbolo (cuando hay ≥10 predicciones verificadas)
 * - Blend con pesos globales: 70% símbolo + 30% global
 * - Transferencia de conocimiento entre símbolos similares
 * - Detección de similitud basada en correlación de resultados
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { TrackedPrediction, predictionTrackingService } from './prediction-tracking-service';

// Storage key
const SYMBOL_WEIGHTS_KEY = 'symbol-weights';
const SYMBOL_SIMILARITY_KEY = 'symbol-similarity';

// Mínimo de predicciones para aprender pesos específicos
const MIN_PREDICTIONS_FOR_SYMBOL_WEIGHTS = 10;

// Ratio de blend: 70% específico del símbolo, 30% global
const SYMBOL_BLEND_RATIO = 0.7;
const GLOBAL_BLEND_RATIO = 0.3;

// Umbral de similitud para transferir conocimiento
const SIMILARITY_THRESHOLD = 0.6;

// Factores de análisis
const FACTORS = [
  'trend', 'technical', 'sentiment', 'news', 'macro',
  'competitors', 'forex', 'institutional', 'seasonality',
  'financials', 'expectations'
] as const;

type Factor = typeof FACTORS[number];
type WeightsMap = Record<Factor, number>;
type Timeframe = 'intraday' | 'swing' | 'long';

/**
 * Pesos aprendidos para un símbolo específico
 */
export interface SymbolWeights {
  symbol: string;
  weights: Record<Timeframe, WeightsMap>;
  sampleCount: number;
  confidence: 'high' | 'medium' | 'low'; // Basado en cantidad de samples
  lastUpdated: string;
  performance: {
    avgAccuracyScore: number;
    directionAccuracy: number;
    improvement: number; // % mejora vs pesos globales
  };
  similarSymbols: string[]; // Símbolos con comportamiento similar
}

/**
 * Similitud entre dos símbolos basada en correlación
 */
export interface SymbolSimilarity {
  symbol1: string;
  symbol2: string;
  similarity: number; // 0-1
  correlationType: 'positive' | 'negative' | 'none';
  sharedPatterns: string[]; // e.g., "both_momentum_sensitive", "react_same_to_news"
}

/**
 * Resultado del blend de pesos
 */
export interface BlendedWeights {
  weights: WeightsMap;
  source: 'symbol' | 'similar' | 'global' | 'blend';
  symbolConfidence?: 'high' | 'medium' | 'low';
  blendRatio?: { symbol: number; global: number };
  similarSymbolUsed?: string;
}

class SymbolWeightsService {
  private symbolWeights: Map<string, SymbolWeights> = new Map();
  private similarities: SymbolSimilarity[] = [];
  private initialized = false;

  /**
   * Inicializa el servicio cargando datos guardados
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const [weightsJson, similarityJson] = await Promise.all([
        AsyncStorage.getItem(SYMBOL_WEIGHTS_KEY),
        AsyncStorage.getItem(SYMBOL_SIMILARITY_KEY),
      ]);

      if (weightsJson) {
        const weightsArray: SymbolWeights[] = JSON.parse(weightsJson);
        for (const sw of weightsArray) {
          this.symbolWeights.set(sw.symbol, sw);
        }
      }

      if (similarityJson) {
        this.similarities = JSON.parse(similarityJson);
      }

      this.initialized = true;
      console.log(`[SymbolWeights] Loaded ${this.symbolWeights.size} symbol weights`);
    } catch (error) {
      console.error('[SymbolWeights] Error loading:', error);
      this.initialized = true;
    }
  }

  /**
   * Guarda los pesos en storage
   */
  private async save(): Promise<void> {
    try {
      const weightsArray = Array.from(this.symbolWeights.values());
      await Promise.all([
        AsyncStorage.setItem(SYMBOL_WEIGHTS_KEY, JSON.stringify(weightsArray)),
        AsyncStorage.setItem(SYMBOL_SIMILARITY_KEY, JSON.stringify(this.similarities)),
      ]);
    } catch (error) {
      console.error('[SymbolWeights] Error saving:', error);
    }
  }

  /**
   * Obtiene pesos blendedos para un símbolo
   * Combina pesos específicos del símbolo con pesos globales
   */
  async getBlendedWeights(
    symbol: string,
    timeframe: Timeframe,
    globalWeights: WeightsMap
  ): Promise<BlendedWeights> {
    await this.initialize();

    const symbolWeight = this.symbolWeights.get(symbol.toUpperCase());

    // Si tiene pesos específicos con suficiente confianza
    if (symbolWeight && symbolWeight.sampleCount >= MIN_PREDICTIONS_FOR_SYMBOL_WEIGHTS) {
      const symbolW = symbolWeight.weights[timeframe];
      
      // Blend: 70% símbolo + 30% global
      const blended: WeightsMap = {} as WeightsMap;
      for (const factor of FACTORS) {
        blended[factor] = 
          SYMBOL_BLEND_RATIO * symbolW[factor] + 
          GLOBAL_BLEND_RATIO * globalWeights[factor];
      }

      // Normalizar para que sumen 1
      const total = Object.values(blended).reduce((a, b) => a + b, 0);
      for (const factor of FACTORS) {
        blended[factor] = blended[factor] / total;
      }

      return {
        weights: blended,
        source: 'blend',
        symbolConfidence: symbolWeight.confidence,
        blendRatio: { symbol: SYMBOL_BLEND_RATIO, global: GLOBAL_BLEND_RATIO },
      };
    }

    // Buscar símbolo similar con pesos
    const similarSymbol = await this.findSimilarSymbolWithWeights(symbol);
    if (similarSymbol) {
      const similarW = similarSymbol.weights[timeframe];
      
      // Blend más conservador: 50% similar + 50% global
      const blended: WeightsMap = {} as WeightsMap;
      for (const factor of FACTORS) {
        blended[factor] = 0.5 * similarW[factor] + 0.5 * globalWeights[factor];
      }

      const total = Object.values(blended).reduce((a, b) => a + b, 0);
      for (const factor of FACTORS) {
        blended[factor] = blended[factor] / total;
      }

      return {
        weights: blended,
        source: 'similar',
        similarSymbolUsed: similarSymbol.symbol,
        blendRatio: { symbol: 0.5, global: 0.5 },
      };
    }

    // Sin datos específicos, usar globales
    return {
      weights: globalWeights,
      source: 'global',
    };
  }

  /**
   * Busca un símbolo similar que tenga pesos aprendidos
   */
  private async findSimilarSymbolWithWeights(symbol: string): Promise<SymbolWeights | null> {
    const upperSymbol = symbol.toUpperCase();
    
    // Buscar similitudes donde este símbolo participa
    const relevant = this.similarities
      .filter(s => 
        (s.symbol1 === upperSymbol || s.symbol2 === upperSymbol) &&
        s.similarity >= SIMILARITY_THRESHOLD &&
        s.correlationType === 'positive'
      )
      .sort((a, b) => b.similarity - a.similarity);

    for (const sim of relevant) {
      const otherSymbol = sim.symbol1 === upperSymbol ? sim.symbol2 : sim.symbol1;
      const weights = this.symbolWeights.get(otherSymbol);
      
      if (weights && weights.sampleCount >= MIN_PREDICTIONS_FOR_SYMBOL_WEIGHTS) {
        return weights;
      }
    }

    return null;
  }

  /**
   * Reconstruye los pesos de todos los símbolos desde predicciones verificadas
   */
  async rebuildAllSymbolWeights(): Promise<{
    symbolsProcessed: number;
    symbolsWithWeights: number;
    similarities: number;
  }> {
    await this.initialize();

    const allPredictions = await predictionTrackingService.getVerifiedPredictions();
    
    // Agrupar por símbolo
    const bySymbol = new Map<string, TrackedPrediction[]>();
    for (const pred of allPredictions) {
      const symbol = pred.symbol.toUpperCase();
      if (!bySymbol.has(symbol)) {
        bySymbol.set(symbol, []);
      }
      bySymbol.get(symbol)!.push(pred);
    }

    let symbolsWithWeights = 0;

    // Procesar cada símbolo
    for (const [symbol, predictions] of bySymbol.entries()) {
      if (predictions.length >= MIN_PREDICTIONS_FOR_SYMBOL_WEIGHTS) {
        const weights = await this.computeSymbolWeights(symbol, predictions);
        if (weights) {
          this.symbolWeights.set(symbol, weights);
          symbolsWithWeights++;
        }
      }
    }

    // Calcular similitudes entre símbolos
    await this.computeSimilarities(bySymbol);

    await this.save();

    return {
      symbolsProcessed: bySymbol.size,
      symbolsWithWeights,
      similarities: this.similarities.length,
    };
  }

  /**
   * Calcula pesos óptimos para un símbolo específico
   */
  private async computeSymbolWeights(
    symbol: string,
    predictions: TrackedPrediction[]
  ): Promise<SymbolWeights | null> {
    if (predictions.length < MIN_PREDICTIONS_FOR_SYMBOL_WEIGHTS) {
      return null;
    }

    // Agrupar por timeframe
    const byTimeframe: Record<Timeframe, TrackedPrediction[]> = {
      intraday: [],
      swing: [],
      long: [],
    };

    for (const pred of predictions) {
      const tf = this.getTimeframe(pred.timeframeDays);
      byTimeframe[tf].push(pred);
    }

    // Calcular pesos para cada timeframe
    const weights: Record<Timeframe, WeightsMap> = {
      intraday: this.computeTimeframeWeights(byTimeframe.intraday),
      swing: this.computeTimeframeWeights(byTimeframe.swing),
      long: this.computeTimeframeWeights(byTimeframe.long),
    };

    // Calcular métricas de performance
    const avgScore = this.mean(predictions.map(p => p.accuracyScore || 50));
    const directionAcc = predictions.filter(p => p.directionCorrect).length / predictions.length;

    // Determinar confianza basada en cantidad de samples
    let confidence: 'high' | 'medium' | 'low' = 'low';
    if (predictions.length >= 30) confidence = 'high';
    else if (predictions.length >= 15) confidence = 'medium';

    return {
      symbol,
      weights,
      sampleCount: predictions.length,
      confidence,
      lastUpdated: new Date().toISOString(),
      performance: {
        avgAccuracyScore: avgScore,
        directionAccuracy: directionAcc * 100,
        improvement: 0, // Se calculará comparando con global
      },
      similarSymbols: [],
    };
  }

  /**
   * Calcula pesos óptimos para un timeframe basado en correlación con resultados
   */
  private computeTimeframeWeights(predictions: TrackedPrediction[]): WeightsMap {
    // Si no hay suficientes datos, usar pesos iguales
    if (predictions.length < 3) {
      const equalWeight = 1 / FACTORS.length;
      const weights: WeightsMap = {} as WeightsMap;
      for (const factor of FACTORS) {
        weights[factor] = equalWeight;
      }
      return weights;
    }

    // Calcular correlación de cada factor con el accuracy
    const correlations: Record<Factor, number> = {} as Record<Factor, number>;
    
    for (const factor of FACTORS) {
      const factorScores: number[] = [];
      const accuracies: number[] = [];

      for (const pred of predictions) {
        if (pred.factorScores && pred.factorScores[factor] !== undefined && pred.accuracyScore !== undefined) {
          factorScores.push(pred.factorScores[factor]);
          accuracies.push(pred.accuracyScore);
        }
      }

      if (factorScores.length >= 3) {
        correlations[factor] = Math.abs(this.correlation(factorScores, accuracies));
      } else {
        correlations[factor] = 0.1; // Peso mínimo si no hay datos
      }
    }

    // Convertir correlaciones a pesos (normalizado)
    const totalCorr = Object.values(correlations).reduce((a, b) => a + b, 0);
    const weights: WeightsMap = {} as WeightsMap;
    
    for (const factor of FACTORS) {
      // Aplicar límites min/max
      let weight = totalCorr > 0 ? correlations[factor] / totalCorr : 1 / FACTORS.length;
      weight = Math.max(0.01, Math.min(0.40, weight)); // [0.01, 0.40]
      weights[factor] = weight;
    }

    // Renormalizar
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    for (const factor of FACTORS) {
      weights[factor] = weights[factor] / total;
    }

    return weights;
  }

  /**
   * Calcula similitudes entre símbolos basado en cómo responden a los factores
   */
  private async computeSimilarities(
    bySymbol: Map<string, TrackedPrediction[]>
  ): Promise<void> {
    this.similarities = [];
    const symbols = Array.from(bySymbol.keys());

    // Solo calcular para símbolos con suficientes predicciones
    const validSymbols = symbols.filter(s => 
      (bySymbol.get(s)?.length || 0) >= 5
    );

    for (let i = 0; i < validSymbols.length; i++) {
      for (let j = i + 1; j < validSymbols.length; j++) {
        const sym1 = validSymbols[i];
        const sym2 = validSymbols[j];
        
        const similarity = this.computeSymbolSimilarity(
          bySymbol.get(sym1)!,
          bySymbol.get(sym2)!
        );

        if (similarity.similarity >= 0.3) { // Solo guardar si hay algo de similitud
          this.similarities.push({
            symbol1: sym1,
            symbol2: sym2,
            ...similarity,
          });
        }
      }
    }

    // Actualizar lista de símbolos similares en cada SymbolWeights
    for (const [symbol, weights] of this.symbolWeights.entries()) {
      const similar = this.similarities
        .filter(s => 
          (s.symbol1 === symbol || s.symbol2 === symbol) &&
          s.similarity >= SIMILARITY_THRESHOLD
        )
        .map(s => s.symbol1 === symbol ? s.symbol2 : s.symbol1);
      
      weights.similarSymbols = similar;
    }
  }

  /**
   * Calcula la similitud entre dos símbolos
   */
  private computeSymbolSimilarity(
    preds1: TrackedPrediction[],
    preds2: TrackedPrediction[]
  ): Omit<SymbolSimilarity, 'symbol1' | 'symbol2'> {
    // Calcular perfil de respuesta a factores para cada símbolo
    const profile1 = this.computeFactorProfile(preds1);
    const profile2 = this.computeFactorProfile(preds2);

    // Calcular correlación entre perfiles
    const p1Values = FACTORS.map(f => profile1[f]);
    const p2Values = FACTORS.map(f => profile2[f]);
    
    const corr = this.correlation(p1Values, p2Values);
    const similarity = (corr + 1) / 2; // Normalizar a [0, 1]

    // Determinar tipo de correlación
    let correlationType: 'positive' | 'negative' | 'none' = 'none';
    if (corr > 0.3) correlationType = 'positive';
    else if (corr < -0.3) correlationType = 'negative';

    // Identificar patrones compartidos
    const sharedPatterns: string[] = [];
    
    // Ambos sensibles a técnico
    if (profile1.technical > 0.15 && profile2.technical > 0.15) {
      sharedPatterns.push('both_technical_sensitive');
    }
    
    // Ambos sensibles a sentiment
    if (profile1.sentiment > 0.12 && profile2.sentiment > 0.12) {
      sharedPatterns.push('both_sentiment_driven');
    }

    // Ambos responden similar a noticias
    if (Math.abs(profile1.news - profile2.news) < 0.05) {
      sharedPatterns.push('similar_news_response');
    }

    return {
      similarity,
      correlationType,
      sharedPatterns,
    };
  }

  /**
   * Calcula el perfil de respuesta a factores de un símbolo
   * (Qué tan bien predice cada factor el resultado para este símbolo)
   */
  private computeFactorProfile(predictions: TrackedPrediction[]): Record<Factor, number> {
    const profile: Record<Factor, number> = {} as Record<Factor, number>;
    
    for (const factor of FACTORS) {
      const scores: number[] = [];
      const accuracies: number[] = [];

      for (const pred of predictions) {
        if (pred.factorScores?.[factor] !== undefined && pred.accuracyScore !== undefined) {
          scores.push(pred.factorScores[factor]);
          accuracies.push(pred.accuracyScore);
        }
      }

      // Calcular correlación como medida de "importancia" del factor
      if (scores.length >= 3) {
        profile[factor] = Math.abs(this.correlation(scores, accuracies));
      } else {
        profile[factor] = 0.09; // Default si no hay datos
      }
    }

    // Normalizar
    const total = Object.values(profile).reduce((a, b) => a + b, 0);
    for (const factor of FACTORS) {
      profile[factor] = total > 0 ? profile[factor] / total : 1 / FACTORS.length;
    }

    return profile;
  }

  /**
   * Obtiene info de un símbolo específico
   */
  async getSymbolInfo(symbol: string): Promise<SymbolWeights | null> {
    await this.initialize();
    return this.symbolWeights.get(symbol.toUpperCase()) || null;
  }

  /**
   * Lista todos los símbolos con pesos aprendidos
   */
  async listSymbolsWithWeights(): Promise<SymbolWeights[]> {
    await this.initialize();
    return Array.from(this.symbolWeights.values())
      .sort((a, b) => b.sampleCount - a.sampleCount);
  }

  /**
   * Obtiene símbolos similares a uno dado
   */
  async getSimilarSymbols(symbol: string): Promise<SymbolSimilarity[]> {
    await this.initialize();
    const upper = symbol.toUpperCase();
    return this.similarities
      .filter(s => s.symbol1 === upper || s.symbol2 === upper)
      .sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Genera un reporte de pesos por símbolo
   */
  async generateReport(): Promise<string> {
    await this.initialize();

    const symbols = Array.from(this.symbolWeights.values())
      .sort((a, b) => b.sampleCount - a.sampleCount);

    if (symbols.length === 0) {
      return 'No hay símbolos con suficientes predicciones para pesos específicos.';
    }

    let report = '📊 PESOS POR SÍMBOLO\n';
    report += '═'.repeat(50) + '\n\n';

    for (const sw of symbols) {
      const confEmoji = sw.confidence === 'high' ? '🟢' : sw.confidence === 'medium' ? '🟡' : '🔴';
      report += `${confEmoji} ${sw.symbol} (n=${sw.sampleCount})\n`;
      report += `   Accuracy: ${sw.performance.avgAccuracyScore.toFixed(1)}% | Dir: ${sw.performance.directionAccuracy.toFixed(0)}%\n`;
      
      if (sw.similarSymbols.length > 0) {
        report += `   Similar a: ${sw.similarSymbols.join(', ')}\n`;
      }

      // Top 3 factores para swing (el más común)
      const swingWeights = Object.entries(sw.weights.swing)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      report += `   Top factores: ${swingWeights.map(([f, w]) => `${f}:${(w * 100).toFixed(0)}%`).join(', ')}\n`;
      report += '\n';
    }

    return report;
  }

  // === Helpers ===

  private getTimeframe(days: number): Timeframe {
    if (days <= 1) return 'intraday';
    if (days <= 7) return 'swing';
    return 'long';
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
export const symbolWeightsService = new SymbolWeightsService();
