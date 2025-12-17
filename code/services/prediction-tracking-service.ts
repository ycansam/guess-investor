/**
 * Servicio de Tracking de Predicciones
 * Registra todas las predicciones y las compara con resultados reales
 * Usa AsyncStorage para persistencia (compatible con React Native)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AssetType } from '../types';
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
  
  predictedDirection: 'up' | 'down' | 'neutral';
  predictedChange: number; // % cambio predicho
  predictedPriceMin: number;
  predictedPriceMax: number;
  confidence: number; // 0-100
  
  priceAtPrediction: number; // Precio cuando se hizo la predicción
  
  // Resultados (se llenan cuando llega la fecha objetivo)
  status: 'pending' | 'verified' | 'expired' | 'error';
  actualPrice?: number; // Precio real en la fecha objetivo
  actualChange?: number; // % cambio real
  actualDirection?: 'up' | 'down' | 'neutral';
  
  // Métricas de precisión
  directionCorrect?: boolean; // ¿Acertó la dirección?
  priceError?: number; // Error absoluto en % (predicho vs real)
  withinRange?: boolean; // ¿El precio real cayó dentro del rango min-max?
  
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
  }): Promise<void> {
    await this.load();
    
    // Parsear timeframe a días
    const timeframeDays = this.parseTimeframeToDays(prediction.timeframe);
    
    // Calcular fecha objetivo
    const now = new Date();
    const targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + timeframeDays);
    
    // Ajustar a día hábil si es acción
    if (prediction.assetType === 'stock') {
      this.adjustToBusinessDay(targetDate);
    }
    
    const tracked: TrackedPrediction = {
      id: prediction.id,
      symbol: prediction.symbol,
      asset: prediction.asset,
      assetType: prediction.assetType,
      predictionDate: now.toISOString(),
      targetDate: targetDate.toISOString(),
      timeframeDays,
      predictedDirection: prediction.direction,
      predictedChange: prediction.predictedChange,
      predictedPriceMin: prediction.predictedPriceMin,
      predictedPriceMax: prediction.predictedPriceMax,
      confidence: prediction.confidence,
      priceAtPrediction: prediction.currentPrice,
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
   * Verifica predicciones pendientes que ya han llegado a su fecha objetivo
   */
  async verifyPendingPredictions(): Promise<TrackedPrediction[]> {
    await this.load();
    
    const now = new Date();
    const verified: TrackedPrediction[] = [];
    
    for (const prediction of this.predictions) {
      if (prediction.status !== 'pending') continue;
      
      const targetDate = new Date(prediction.targetDate);
      
      // Solo verificar si ya pasó la fecha objetivo
      if (now < targetDate) continue;
      
      try {
        console.log(`[Tracking] Verificando predicción ${prediction.id} para ${prediction.symbol}...`);
        
        // Obtener precio actual
        const currentData = await yahooV8Service.getQuote(prediction.symbol);
        if (!currentData || !currentData.regularMarketPrice) {
          prediction.status = 'error';
          continue;
        }
        
        const actualPrice = currentData.regularMarketPrice;
        const priceAtPrediction = prediction.priceAtPrediction;
        
        // Calcular cambio real
        const actualChange = ((actualPrice - priceAtPrediction) / priceAtPrediction) * 100;
        const actualDirection: 'up' | 'down' | 'neutral' = 
          actualChange > 0.5 ? 'up' : 
          actualChange < -0.5 ? 'down' : 'neutral';
        
        // Verificar precisión
        const directionCorrect = prediction.predictedDirection === actualDirection ||
          (prediction.predictedDirection !== 'neutral' && actualDirection === 'neutral') ||
          (prediction.predictedDirection === actualDirection);
          
        const priceError = Math.abs(prediction.predictedChange - actualChange);
        const withinRange = actualPrice >= prediction.predictedPriceMin && 
                           actualPrice <= prediction.predictedPriceMax;
        
        // Actualizar predicción
        prediction.status = 'verified';
        prediction.actualPrice = actualPrice;
        prediction.actualChange = Math.round(actualChange * 100) / 100;
        prediction.actualDirection = actualDirection;
        prediction.directionCorrect = directionCorrect;
        prediction.priceError = Math.round(priceError * 100) / 100;
        prediction.withinRange = withinRange;
        prediction.verifiedAt = now.toISOString();
        
        verified.push(prediction);
        
        console.log(`[Tracking] Verificado ${prediction.symbol}:`, {
          predicted: `${prediction.predictedDirection} (${prediction.predictedChange}%)`,
          actual: `${actualDirection} (${actualChange.toFixed(2)}%)`,
          correct: directionCorrect,
        });
        
      } catch (error) {
        console.error(`[Tracking] Error verificando ${prediction.symbol}:`, error);
        prediction.status = 'error';
      }
    }
    
    if (verified.length > 0) {
      await this.save();
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
}

export const predictionTrackingService = new PredictionTrackingService();
