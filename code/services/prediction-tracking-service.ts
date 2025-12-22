/**
 * Servicio de Tracking de Predicciones
 * Registra todas las predicciones y las compara con resultados reales
 * Usa AsyncStorage para persistencia (compatible con React Native)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AssetType } from '../types';
import { accuracyPredictorService } from './accuracy-predictor-service';
import { assetClassifierService } from './asset-classifier-service';
import type { TrainingTimeframe } from './training-cache-service';
import { yahooV8Service } from './yahoo-v8-service';

const TRACKING_STORAGE_KEY = 'prediction-tracking';

export interface TrackedPrediction {
  id: string;
  symbol: string;
  asset: string;
  assetType: AssetType;
  
  // Datos de la predicción
  predictionDate: string; // Fecha cuando se hizo la predicción (ISO)
  targetDate: string; // Fecha objetivo de la predicción (ISO)
  timeframeDays: number; // Días de timeframe
  timeframe?: TrainingTimeframe; // intraday, swing, longterm - NUEVO para clasificación
  
  predictedDirection: 'up' | 'down' | 'neutral';
  predictedChange: number; // % cambio predicho
  predictedPriceMin: number;
  predictedPriceMax: number;
  confidence: number; // 0-100
  
  priceAtPrediction: number; // Precio cuando se hizo la predicción
  
  // Volatilidad del activo (para segmentación ML)
  volatility?: number; // Volatilidad anualizada del activo (%)
  volatilityCategory?: 'low' | 'medium' | 'high'; // <20% = low, 20-50% = medium, >50% = high
  
  // Scores de cada factor (para ML)
  factorScores?: Record<string, number>; // { trend: 25.5, sentiment: -10.2, ... }
  factorWeightsUsed?: Record<string, number>; // Pesos usados en esta predicción
  
  // Resultados (se llenan cuando llega la fecha objetivo)
  status: 'pending' | 'verified' | 'expired' | 'error';
  actualPrice?: number; // Precio real en la fecha objetivo
  actualChange?: number; // % cambio real
  actualDirection?: 'up' | 'down' | 'neutral';
  
  // Métricas de precisión
  directionCorrect?: boolean; // ¿Acertó la dirección?
  priceError?: number; // Error absoluto en % (predicho vs real)
  withinRange?: boolean; // ¿El precio real cayó dentro del rango min-max?
  
  // Scoring de precisión del porcentaje (NUEVO)
  changeAccuracyPercent?: number; // Qué tan cerca estuvo del cambio predicho (0-100%)
  accuracyScore?: number; // Puntuación final 0-100 considerando dirección + precisión
  predictionQuality?: 'excellent' | 'good' | 'poor' | 'failed'; // Clasificación de calidad
  
  // Meta-learning: Uncertainty analysis (para aprender cuándo NO predecir)
  uncertaintyScore?: number; // 0-100, donde 100 = máxima incertidumbre
  uncertaintyFactors?: {
    earningsInDays?: number;
    hasUpcomingEarnings?: boolean;
    currentVolatility?: number;
    isVolatilityExtreme?: boolean;
    dataCompleteness?: number;
    signalCoherence?: number;
    conflictingFactors?: number;
    marketRegime?: 'panic' | 'euphoria' | 'normal';
    vixLevel?: 'extreme_fear' | 'fear' | 'neutral' | 'complacency';
  };
  uncertaintyRecommendation?: string; // Texto explicando la incertidumbre
  
  verifiedAt?: string; // Fecha de verificación (ISO)
}

export interface TrackingStats {
  totalPredictions: number;
  verified: number;
  pending: number;
  
  // Precisión
  directionAccuracy: number; // % de veces que acertó dirección
  avgPriceError: number; // Error promedio en %
  withinRangeRate: number; // % de veces que el precio cayó en el rango
  
  // Nuevas métricas de calidad
  avgAccuracyScore: number; // Puntuación promedio 0-100
  excellentPredictions: number; // Predicciones con >75% accuracy
  goodPredictions: number; // Predicciones con 50-75% accuracy
  poorPredictions: number; // Predicciones con 25-50% accuracy
  failedPredictions: number; // Predicciones con <25% accuracy
  
  // Por dirección
  upPredictions: number;
  upCorrect: number;
  downPredictions: number;
  downCorrect: number;
  neutralPredictions: number;
  
  // Por confianza
  highConfidenceAccuracy: number; // Confianza >= 70%
  mediumConfidenceAccuracy: number; // Confianza 50-69%
  lowConfidenceAccuracy: number; // Confianza < 50%
}

class PredictionTrackingService {
  private predictions: TrackedPrediction[] = [];
  private loaded = false;
  
  /**
   * Carga las predicciones desde AsyncStorage
   */
  async load(): Promise<void> {
    if (this.loaded) return;
    
    try {
      const data = await AsyncStorage.getItem(TRACKING_STORAGE_KEY);
      this.predictions = data ? JSON.parse(data) : [];
      this.loaded = true;
      console.log(`[Tracking] Cargadas ${this.predictions.length} predicciones`);
    } catch (error) {
      console.error('[Tracking] Error cargando predicciones:', error);
      this.predictions = [];
      this.loaded = true;
    }
  }
  
  /**
   * Guarda las predicciones en AsyncStorage
   */
  private async save(): Promise<void> {
    try {
      await AsyncStorage.setItem(TRACKING_STORAGE_KEY, JSON.stringify(this.predictions));
      console.log(`[Tracking] Guardadas ${this.predictions.length} predicciones`);
    } catch (error) {
      console.error('[Tracking] Error guardando predicciones:', error);
    }
  }
  
  /**
   * Registra una nueva predicción para tracking
   */
  async trackPrediction(prediction: {
    id: string;
    symbol: string;
    asset: string;
    assetType: AssetType;
    direction: 'up' | 'down' | 'neutral';
    predictedChange: number;
    predictedPriceMin: number;
    predictedPriceMax: number;
    confidence: number;
    currentPrice: number;
    timeframe: string; // "1 día", "1 semana", "1 mes", etc.
    factorScores?: Record<string, number>; // Scores de cada factor
    factorWeightsUsed?: Record<string, number>; // Pesos usados
    volatility?: number; // Volatilidad anualizada del activo (%)
    // Meta-learning: Uncertainty data
    uncertaintyScore?: number;
    uncertaintyFactors?: {
      earningsInDays?: number;
      hasUpcomingEarnings?: boolean;
      currentVolatility?: number;
      isVolatilityExtreme?: boolean;
      dataCompleteness?: number;
      signalCoherence?: number;
      conflictingFactors?: number;
      marketRegime?: 'panic' | 'euphoria' | 'normal';
      vixLevel?: 'extreme_fear' | 'fear' | 'neutral' | 'complacency';
    };
    uncertaintyRecommendation?: string;
  }): Promise<void> {
    await this.load();
    
    // Parsear timeframe a días
    const timeframeDays = this.parseTimeframeToDays(prediction.timeframe);
    
    // NUEVO: Mapear timeframe string a tipo para clasificación
    let timeframeType: TrainingTimeframe | undefined;
    if (timeframeDays <= 1) {
      timeframeType = 'intraday';
    } else if (timeframeDays <= 7) {
      timeframeType = 'swing';
    } else {
      timeframeType = 'longterm';
    }
    
    // Calcular fecha objetivo
    const now = new Date();
    const targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + timeframeDays);
    
    // Ajustar a día hábil si es acción
    if (prediction.assetType === 'stock') {
      this.adjustToBusinessDay(targetDate);
    }
    
    // Categorizar volatilidad para segmentación ML
    let volatilityCategory: 'low' | 'medium' | 'high' | undefined;
    if (prediction.volatility !== undefined) {
      if (prediction.volatility < 20) {
        volatilityCategory = 'low';
      } else if (prediction.volatility < 50) {
        volatilityCategory = 'medium';
      } else {
        volatilityCategory = 'high';
      }
    }
    
    const tracked: TrackedPrediction = {
      id: prediction.id,
      symbol: prediction.symbol,
      asset: prediction.asset,
      assetType: prediction.assetType,
      predictionDate: now.toISOString(),
      targetDate: targetDate.toISOString(),
      timeframeDays,
      timeframe: timeframeType,
      predictedDirection: prediction.direction,
      predictedChange: prediction.predictedChange,
      predictedPriceMin: prediction.predictedPriceMin,
      predictedPriceMax: prediction.predictedPriceMax,
      confidence: prediction.confidence,
      priceAtPrediction: prediction.currentPrice,
      volatility: prediction.volatility,
      volatilityCategory,
      factorScores: prediction.factorScores,
      factorWeightsUsed: prediction.factorWeightsUsed,
      // Meta-learning: Uncertainty tracking
      uncertaintyScore: prediction.uncertaintyScore,
      uncertaintyFactors: prediction.uncertaintyFactors,
      uncertaintyRecommendation: prediction.uncertaintyRecommendation,
      status: 'pending',
    };
    
    // Evitar duplicados
    const existingIndex = this.predictions.findIndex(p => p.id === prediction.id);
    if (existingIndex >= 0) {
      this.predictions[existingIndex] = tracked;
    } else {
      this.predictions.push(tracked);
    }
    
    await this.save();
    
    console.log(`[Tracking] Registrada predicción para ${prediction.symbol}:`, {
      direction: prediction.direction,
      change: prediction.predictedChange,
      targetDate: targetDate.toLocaleDateString('es-ES'),
    });
  }
  
  /**
   * Determina si el mercado ya cerró para un símbolo dado
   * NYSE/NASDAQ cierran a las 16:00 ET (21:00 UTC, 22:00 España invierno)
   * Crypto opera 24/7, usamos cierre a las 00:00 UTC
   */
  private isMarketClosed(symbol: string, targetDate: Date): boolean {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    
    // Si la fecha objetivo ya pasó, definitivamente podemos verificar
    if (target < today) {
      return true;
    }
    
    // Si es hoy, verificar si el mercado cerró
    if (target.getTime() === today.getTime()) {
      const isCrypto = symbol.includes('-USD') || symbol === 'BTC' || symbol === 'ETH' || 
                       symbol === 'DOGE' || symbol === 'SOL' || symbol === 'XRP';
      
      if (isCrypto) {
        // Crypto: podemos verificar a partir de las 23:00 hora local
        return now.getHours() >= 23;
      } else {
        // Acciones: NYSE cierra 16:00 ET = 21:00 UTC = 22:00 España (invierno)
        // Usamos 22:00 hora local como referencia conservadora
        return now.getHours() >= 22;
      }
    }
    
    // Si la fecha objetivo es futura, el mercado aún no cerró para ese día
    return false;
  }

  /**
   * Verifica predicciones pendientes cuando el mercado ha cerrado
   * Usa el precio de cierre del día objetivo
   */
  async verifyPendingPredictions(): Promise<TrackedPrediction[]> {
    await this.load();
    
    const now = new Date();
    const verified: TrackedPrediction[] = [];
    
    for (const prediction of this.predictions) {
      if (prediction.status !== 'pending') continue;
      
      const targetDate = new Date(prediction.targetDate);
      
      // Verificar si el mercado ya cerró para esta predicción
      if (!this.isMarketClosed(prediction.symbol, targetDate)) {
        console.log(`[Tracking] ${prediction.symbol}: Mercado aún no cierra para fecha ${targetDate.toLocaleDateString()}`);
        continue;
      }
      
      try {
        console.log(`[Tracking] Verificando predicción ${prediction.id} para ${prediction.symbol}...`);
        
        // Obtener datos del mercado
        const currentData = await yahooV8Service.getQuote(prediction.symbol);
        if (!currentData) {
          console.error(`[Tracking] No se pudo obtener datos para ${prediction.symbol}`);
          prediction.status = 'error';
          continue;
        }
        
        // Usar precio de cierre si está disponible, sino precio actual
        // regularMarketPrice es el precio actual/último (único disponible en V8)
        let actualPrice: number;
        
        // Simplificado: usar precio de mercado actual
        // Para predicciones pasadas, esto es el último precio conocido
        actualPrice = currentData.regularMarketPrice || 0;
        
        if (!actualPrice) {
          console.error(`[Tracking] Precio no disponible para ${prediction.symbol}`);
          prediction.status = 'error';
          continue;
        }
        
        const priceAtPrediction = prediction.priceAtPrediction;
        
        // Calcular cambio real
        const actualChange = ((actualPrice - priceAtPrediction) / priceAtPrediction) * 100;
        const actualDirection: 'up' | 'down' | 'neutral' = 
          actualChange > 0.5 ? 'up' : 
          actualChange < -0.5 ? 'down' : 'neutral';
        
        // Verificar precisión de dirección
        const directionCorrect = prediction.predictedDirection === actualDirection ||
          (prediction.predictedDirection !== 'neutral' && actualDirection === 'neutral') ||
          (prediction.predictedDirection === actualDirection);
          
        const priceError = Math.abs(prediction.predictedChange - actualChange);
        const withinRange = actualPrice >= prediction.predictedPriceMin && 
                           actualPrice <= prediction.predictedPriceMax;
        
        // NUEVO: Calcular precisión del cambio porcentual
        // Si predijo +3% y hubo +0.2%, eso es solo 6.67% de precisión (muy malo)
        // Si predijo +3% y hubo +2.8%, eso es 93.33% de precisión (excelente)
        let changeAccuracyPercent = 0;
        
        // Para evitar divisiones por cero o infinitos
        if (Math.abs(prediction.predictedChange) > 0.1) {
          // Calcular qué % del cambio predicho se cumplió
          const fulfillmentRatio = Math.abs(actualChange) / Math.abs(prediction.predictedChange);
          
          // Si la dirección es correcta, el ratio indica precisión
          // Si predijo +3% y hubo +2.5%, ratio = 83.33%
          // Si predijo +3% y hubo +5%, ratio = 166%, pero lo capamos a 100%
          if (directionCorrect && prediction.predictedDirection !== 'neutral') {
            changeAccuracyPercent = Math.min(100, fulfillmentRatio * 100);
            
            // Penalización por exceso: si predijo +3% y hubo +6%, es impreciso
            if (fulfillmentRatio > 1.5) {
              changeAccuracyPercent = Math.max(0, 100 - (fulfillmentRatio - 1) * 50);
            }
          } else {
            // Dirección incorrecta = 0% accuracy en cambio
            changeAccuracyPercent = 0;
          }
        } else {
          // Predicción de cambio muy pequeño (<0.1%)
          if (Math.abs(actualChange) < 0.5) {
            changeAccuracyPercent = 100; // Acertó que sería neutral
          } else {
            changeAccuracyPercent = 0; // Falló
          }
        }
        
        // NUEVO: Calcular accuracy score final (0-100)
        // 50% peso a dirección correcta, 50% peso a precisión del cambio
        const directionScore = directionCorrect ? 50 : 0;
        const changeScore = (changeAccuracyPercent / 100) * 50;
        const accuracyScore = Math.round(directionScore + changeScore);
        
        // NUEVO: Clasificar calidad de la predicción
        let predictionQuality: 'excellent' | 'good' | 'poor' | 'failed';
        if (accuracyScore >= 75) {
          predictionQuality = 'excellent'; // >75%: dirección correcta + cambio preciso
        } else if (accuracyScore >= 50) {
          predictionQuality = 'good'; // 50-75%: dirección correcta pero cambio impreciso
        } else if (accuracyScore >= 25) {
          predictionQuality = 'poor'; // 25-50%: cambio muy impreciso
        } else {
          predictionQuality = 'failed'; // <25%: dirección incorrecta o totalmente errado
        }
        
        // Actualizar predicción
        prediction.status = 'verified';
        prediction.actualPrice = actualPrice;
        prediction.actualChange = Math.round(actualChange * 100) / 100;
        prediction.actualDirection = actualDirection;
        prediction.directionCorrect = directionCorrect;
        prediction.priceError = Math.round(priceError * 100) / 100;
        prediction.withinRange = withinRange;
        prediction.changeAccuracyPercent = Math.round(changeAccuracyPercent);
        prediction.accuracyScore = accuracyScore;
        prediction.predictionQuality = predictionQuality;
        prediction.verifiedAt = now.toISOString();
        
        verified.push(prediction);
        
        // NUEVO: Actualizar clasificador con accuracy por timeframe
        if (prediction.timeframe && prediction.accuracyScore !== undefined) {
          await assetClassifierService.updateLearnedTimeframe(
            prediction.symbol,
            prediction.timeframe,
            prediction.accuracyScore
          );
        }
        
        console.log(`[Tracking] Verificado ${prediction.symbol}:`, {
          predicted: `${prediction.predictedDirection} (${prediction.predictedChange}%)`,
          actual: `${actualDirection} (${actualChange.toFixed(2)}%)`,
          directionCorrect,
          changeAccuracy: `${changeAccuracyPercent.toFixed(1)}%`,
          accuracyScore,
          quality: predictionQuality,
          priceUsed: actualPrice,
        });
        
      } catch (error) {
        console.error(`[Tracking] Error verificando ${prediction.symbol}:`, error);
        prediction.status = 'error';
      }
    }
    
    if (verified.length > 0) {
      await this.save();
      
      // Reconstruir modelo de predicción de accuracy
      try {
        await accuracyPredictorService.rebuildModel();
      } catch (error) {
        console.log('[Tracking] No se pudo actualizar modelo de accuracy');
      }
    }
    
    return verified;
  }
  
  /**
   * Obtiene estadísticas de precisión
   */
  async getStats(): Promise<TrackingStats> {
    await this.load();
    
    const verified = this.predictions.filter(p => p.status === 'verified');
    const pending = this.predictions.filter(p => p.status === 'pending');
    
    // Calcular métricas
    const directionCorrect = verified.filter(p => p.directionCorrect).length;
    const withinRange = verified.filter(p => p.withinRange).length;
    const avgError = verified.length > 0
      ? verified.reduce((sum, p) => sum + (p.priceError || 0), 0) / verified.length
      : 0;
    
    // NUEVO: Calcular métricas de calidad
    const avgAccuracyScore = verified.length > 0
      ? Math.round(verified.reduce((sum, p) => sum + (p.accuracyScore || 0), 0) / verified.length)
      : 0;
    
    const excellentPredictions = verified.filter(p => p.predictionQuality === 'excellent').length;
    const goodPredictions = verified.filter(p => p.predictionQuality === 'good').length;
    const poorPredictions = verified.filter(p => p.predictionQuality === 'poor').length;
    const failedPredictions = verified.filter(p => p.predictionQuality === 'failed').length;
    
    // Por dirección
    const upPredictions = verified.filter(p => p.predictedDirection === 'up');
    const downPredictions = verified.filter(p => p.predictedDirection === 'down');
    const neutralPredictions = verified.filter(p => p.predictedDirection === 'neutral');
    
    // Por confianza
    const highConf = verified.filter(p => p.confidence >= 70);
    const medConf = verified.filter(p => p.confidence >= 50 && p.confidence < 70);
    const lowConf = verified.filter(p => p.confidence < 50);
    
    return {
      totalPredictions: this.predictions.length,
      verified: verified.length,
      pending: pending.length,
      
      directionAccuracy: verified.length > 0 
        ? Math.round((directionCorrect / verified.length) * 100) 
        : 0,
      avgPriceError: Math.round(avgError * 100) / 100,
      withinRangeRate: verified.length > 0 
        ? Math.round((withinRange / verified.length) * 100) 
        : 0,
      
      // Nuevas métricas de calidad
      avgAccuracyScore,
      excellentPredictions,
      goodPredictions,
      poorPredictions,
      failedPredictions,
      
      upPredictions: upPredictions.length,
      upCorrect: upPredictions.filter(p => p.directionCorrect).length,
      downPredictions: downPredictions.length,
      downCorrect: downPredictions.filter(p => p.directionCorrect).length,
      neutralPredictions: neutralPredictions.length,
      
      highConfidenceAccuracy: highConf.length > 0 
        ? Math.round((highConf.filter(p => p.directionCorrect).length / highConf.length) * 100) 
        : 0,
      mediumConfidenceAccuracy: medConf.length > 0 
        ? Math.round((medConf.filter(p => p.directionCorrect).length / medConf.length) * 100) 
        : 0,
      lowConfidenceAccuracy: lowConf.length > 0 
        ? Math.round((lowConf.filter(p => p.directionCorrect).length / lowConf.length) * 100) 
        : 0,
    };
  }
  
  /**
   * Obtiene todas las predicciones (para mostrar historial)
   */
  async getAllPredictions(): Promise<TrackedPrediction[]> {
    await this.load();
    // Ordenar por fecha de predicción, más recientes primero
    return [...this.predictions].sort((a, b) => 
      new Date(b.predictionDate).getTime() - new Date(a.predictionDate).getTime()
    );
  }
  
  /**
   * Obtiene predicciones pendientes
   */
  async getPendingPredictions(): Promise<TrackedPrediction[]> {
    await this.load();
    return this.predictions.filter(p => p.status === 'pending');
  }
  
  /**
   * Obtiene predicciones verificadas (para ML training y análisis de incertidumbre)
   */
  async getVerifiedPredictions(): Promise<TrackedPrediction[]> {
    await this.load();
    return this.predictions.filter(p => p.status === 'verified');
  }
  
  /**
   * Formatea las estadísticas para mostrar
   */
  formatStatsForDisplay(stats: TrackingStats): string {
    if (stats.totalPredictions === 0) {
      return '📊 Aún no hay predicciones registradas para evaluar.';
    }
    
    let output = `📊 **Estadísticas de Predicciones**\n`;
    output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    output += `📈 **Total**: ${stats.totalPredictions} predicciones\n`;
    output += `   ✅ Verificadas: ${stats.verified}\n`;
    output += `   ⏳ Pendientes: ${stats.pending}\n\n`;
    
    if (stats.verified > 0) {
      output += `🎯 **Precisión General**\n`;
      output += `   Dirección correcta: ${stats.directionAccuracy}%\n`;
      output += `   Error promedio: ${stats.avgPriceError}%\n`;
      output += `   Dentro del rango: ${stats.withinRangeRate}%\n\n`;
      
      output += `📊 **Por Dirección**\n`;
      output += `   📈 Subidas: ${stats.upCorrect}/${stats.upPredictions} correctas\n`;
      output += `   📉 Bajadas: ${stats.downCorrect}/${stats.downPredictions} correctas\n`;
      output += `   ➡️ Laterales: ${stats.neutralPredictions}\n\n`;
      
      output += `🔒 **Por Nivel de Confianza**\n`;
      output += `   Alta (≥70%): ${stats.highConfidenceAccuracy}% precisión\n`;
      output += `   Media (50-69%): ${stats.mediumConfidenceAccuracy}% precisión\n`;
      output += `   Baja (<50%): ${stats.lowConfidenceAccuracy}% precisión\n`;
    }
    
    return output;
  }
  
  /**
   * Parsea timeframe a días
   */
  private parseTimeframeToDays(timeframe: string): number {
    const lower = timeframe.toLowerCase();
    
    // Patrones comunes
    if (lower.includes('intradía') || lower.includes('intraday') || lower.includes('hoy')) return 0;
    if (lower.includes('mañana') || lower === '1 día' || lower === '1 day') return 1;
    if (lower.includes('semana') || lower.includes('week')) {
      const match = lower.match(/(\d+)/);
      return match ? parseInt(match[1]) * 7 : 7;
    }
    if (lower.includes('mes') || lower.includes('month')) {
      const match = lower.match(/(\d+)/);
      return match ? parseInt(match[1]) * 30 : 30;
    }
    if (lower.includes('año') || lower.includes('year')) {
      const match = lower.match(/(\d+)/);
      return match ? parseInt(match[1]) * 365 : 365;
    }
    
    // Buscar número de días directamente
    const daysMatch = lower.match(/(\d+)\s*(día|day)/);
    if (daysMatch) return parseInt(daysMatch[1]);
    
    // Default: 1 día
    return 1;
  }
  
  /**
   * Ajusta fecha al siguiente día hábil
   */
  private adjustToBusinessDay(date: Date): void {
    const day = date.getDay();
    if (day === 0) date.setDate(date.getDate() + 1); // Domingo → Lunes
    if (day === 6) date.setDate(date.getDate() + 2); // Sábado → Lunes
  }
  
  /**
   * Recalcula los accuracy scores de todas las predicciones verificadas
   * Útil para migrar datos antiguos cuando se actualiza el sistema de scoring
   */
  async recalculateAccuracyScores(): Promise<number> {
    await this.load();
    
    let updated = 0;
    
    for (const prediction of this.predictions) {
      // Solo recalcular verificadas que no tengan accuracy score
      if (prediction.status !== 'verified' || prediction.accuracyScore !== undefined) {
        continue;
      }
      
      // Verificar que tengamos los datos necesarios
      if (
        prediction.actualChange === undefined ||
        prediction.predictedChange === undefined ||
        prediction.directionCorrect === undefined
      ) {
        continue;
      }
      
      // Calcular precisión del cambio porcentual
      let changeAccuracyPercent = 0;
      
      if (Math.abs(prediction.predictedChange) > 0.1) {
        const fulfillmentRatio = Math.abs(prediction.actualChange) / Math.abs(prediction.predictedChange);
        
        if (prediction.directionCorrect && prediction.predictedDirection !== 'neutral') {
          changeAccuracyPercent = Math.min(100, fulfillmentRatio * 100);
          
          // Penalización por exceso
          if (fulfillmentRatio > 1.5) {
            changeAccuracyPercent = Math.max(0, 100 - (fulfillmentRatio - 1) * 50);
          }
        } else {
          changeAccuracyPercent = 0;
        }
      } else {
        if (Math.abs(prediction.actualChange) < 0.5) {
          changeAccuracyPercent = 100;
        } else {
          changeAccuracyPercent = 0;
        }
      }
      
      // Calcular accuracy score final
      const directionScore = prediction.directionCorrect ? 50 : 0;
      const changeScore = (changeAccuracyPercent / 100) * 50;
      const accuracyScore = Math.round(directionScore + changeScore);
      
      // Clasificar calidad
      let predictionQuality: 'excellent' | 'good' | 'poor' | 'failed';
      if (accuracyScore >= 75) {
        predictionQuality = 'excellent';
      } else if (accuracyScore >= 50) {
        predictionQuality = 'good';
      } else if (accuracyScore >= 25) {
        predictionQuality = 'poor';
      } else {
        predictionQuality = 'failed';
      }
      
      // Actualizar predicción
      prediction.changeAccuracyPercent = Math.round(changeAccuracyPercent);
      prediction.accuracyScore = accuracyScore;
      prediction.predictionQuality = predictionQuality;
      
      updated++;
    }
    
    if (updated > 0) {
      await this.save();
      console.log(`[Tracking] Recalculados ${updated} accuracy scores`);
    }
    
    return updated;
  }
  
  /**
   * Exporta predicciones verificadas en formato JSON para el sistema ML de Python
   * Retorna string JSON listo para guardar en archivo o copiar
   */
  async exportForML(): Promise<string> {
    await this.load();
    
    const verified = this.predictions.filter(p => p.status === 'verified');
    
    const exportData = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      total_predictions: this.predictions.length,
      verified_count: verified.length,
      verified_predictions: verified.map(p => ({
        id: p.id,
        symbol: p.symbol,
        assetType: p.assetType,
        timeframeDays: p.timeframeDays,
        predictedDirection: p.predictedDirection,
        predictedChange: p.predictedChange,
        predictedPriceMin: p.predictedPriceMin,
        predictedPriceMax: p.predictedPriceMax,
        confidence: p.confidence,
        priceAtPrediction: p.priceAtPrediction,
        factorScores: p.factorScores || {},
        factorWeightsUsed: p.factorWeightsUsed || {},
        actualPrice: p.actualPrice,
        actualChange: p.actualChange,
        actualDirection: p.actualDirection,
        directionCorrect: p.directionCorrect,
        priceError: p.priceError,
        withinRange: p.withinRange,
        predictionDate: p.predictionDate,
        verifiedAt: p.verifiedAt,
      })),
    };
    
    return JSON.stringify(exportData, null, 2);
  }
  
  /**
   * Limpia predicciones antiguas (más de 90 días)
   */
  async cleanOldPredictions(daysToKeep: number = 90): Promise<number> {
    await this.load();
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    const before = this.predictions.length;
    this.predictions = this.predictions.filter(p => 
      new Date(p.predictionDate) > cutoffDate
    );
    const removed = before - this.predictions.length;
    
    if (removed > 0) {
      await this.save();
      console.log(`[Tracking] Limpiadas ${removed} predicciones antiguas`);
    }
    
    return removed;
  }
  
  /**
   * RESET COMPLETO: Borra todas las predicciones y datos de ML
   */
  async resetAll(): Promise<void> {
    console.log('[Tracking] 🗑️ Reseteando todas las predicciones y datos de ML...');
    
    const keysToRemove = [
      'prediction-tracking',
      'accuracy-predictor-model',
      'learned-weights',
      'ml-training-history',
      'ml-sync-status',
      'ml-export-data',
      'asset-classifications',
      'training-predictions-cache',
    ];
    
    for (const key of keysToRemove) {
      try {
        await AsyncStorage.removeItem(key);
        console.log(`[Tracking] ✅ Borrado: ${key}`);
      } catch (error) {
        console.log(`[Tracking] ⚠️ Error borrando ${key}:`, error);
      }
    }
    
    // Resetear estado interno
    this.predictions = [];
    this.loaded = false;
    
    console.log('[Tracking] ✅ Reset completo!');
  }
}

export const predictionTrackingService = new PredictionTrackingService();
