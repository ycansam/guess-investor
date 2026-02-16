/**
 * Backtesting Service
 * 
 * Permite validar el rendimiento del sistema de predicciones
 * usando datos históricos de Yahoo Finance.
 * 
 * Flujo:
 * 1. Obtiene datos históricos de un símbolo
 * 2. Simula predicciones en fechas pasadas
 * 3. Compara con precios reales
 * 4. Calcula métricas de rendimiento
 */

import { logger } from '../../middleware/logger.js';
import { backtestingService, HistoricalBar } from '../analysis/backtesting.service.js';

// ============================================================================
// TIPOS
// ============================================================================

export interface BacktestConfig {
  symbol: string;
  startDate: Date;
  endDate: Date;
  timeframeDays: number;
  skipWeekends?: boolean;
}

export interface BacktestResult {
  symbol: string;
  config: BacktestConfig;
  
  // Resultados
  totalPredictions: number;
  directionCorrect: number;
  directionAccuracy: number;
  
  avgPredictedChange: number;
  avgActualChange: number;
  avgError: number;
  avgAbsError: number;
  
  // Por dirección
  upPredictions: { total: number; correct: number; accuracy: number };
  downPredictions: { total: number; correct: number; accuracy: number };
  
  // Calidad
  excellentCount: number;
  goodCount: number;
  poorCount: number;
  failedCount: number;
  
  // Métricas avanzadas
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
  
  // Detalle
  predictions: BacktestPrediction[];
  
  executedAt: Date;
  durationMs: number;
}

export interface BacktestPrediction {
  date: Date;
  priceAtPrediction: number;
  predictedChange: number;
  predictedDirection: 'up' | 'down' | 'neutral';
  confidence: number;
  
  actualPrice: number;
  actualChange: number;
  actualDirection: 'up' | 'down' | 'neutral';
  
  directionCorrect: boolean;
  error: number;
  accuracyScore: number;
  quality: string;
}

export interface BacktestSummary {
  symbol: string;
  period: string;
  totalTests: number;
  directionAccuracy: number;
  avgAccuracyScore: number;
  bestTimeframe: number;
  recommendation: string;
}

// ============================================================================
// SERVICIO
// ============================================================================

export const backtestService = {
  /**
   * Ejecuta backtest para un símbolo con configuración específica
   */
  async runBacktest(config: BacktestConfig): Promise<BacktestResult> {
    const startTime = Date.now();
    logger.info(`[Backtest] Starting backtest for ${config.symbol}`);
    
    // Obtener datos históricos
    const history = await this.getHistoricalData(
      config.symbol,
      config.startDate,
      config.endDate
    );
    
    if (history.length < config.timeframeDays + 5) {
      throw new Error(`Insufficient historical data for ${config.symbol}. Need at least ${config.timeframeDays + 5} days.`);
    }
    
    const predictions: BacktestPrediction[] = [];
    
    // Simular predicciones día a día
    for (let i = 0; i < history.length - config.timeframeDays; i++) {
      const currentDay = history[i];
      const targetDay = history[i + config.timeframeDays];
      
      // Saltar fines de semana si está configurado
      if (config.skipWeekends) {
        const dayOfWeek = new Date(currentDay.date).getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;
      }
      
      // Simular predicción con datos hasta ese día
      const prediction = await this.simulatePrediction(
        config.symbol,
        currentDay,
        config.timeframeDays
      );
      
      // Calcular resultado real
      const actualChange = ((targetDay.close - currentDay.close) / currentDay.close) * 100;
      const actualDirection = actualChange > 0.5 ? 'up' : actualChange < -0.5 ? 'down' : 'neutral';
      
      // Verificar acierto
      const directionCorrect = 
        (prediction.direction === 'up' && actualChange >= 0) ||
        (prediction.direction === 'down' && actualChange <= 0) ||
        (prediction.direction === 'neutral' && Math.abs(actualChange) < 0.5);
      
      // Calcular accuracy score
      const accuracyScore = this.calculateAccuracyScore(
        prediction.predictedChange,
        actualChange,
        directionCorrect
      );
      
      // Calidad
      const quality = this.getQuality(accuracyScore, directionCorrect);
      
      predictions.push({
        date: new Date(currentDay.date),
        priceAtPrediction: currentDay.close,
        predictedChange: prediction.predictedChange,
        predictedDirection: prediction.direction,
        confidence: prediction.confidence,
        actualPrice: targetDay.close,
        actualChange,
        actualDirection,
        directionCorrect,
        error: actualChange - prediction.predictedChange,
        accuracyScore,
        quality,
      });
    }
    
    // Calcular métricas
    const result = this.calculateMetrics(config, predictions);
    result.durationMs = Date.now() - startTime;
    
    logger.info(`[Backtest] Completed for ${config.symbol}: ${result.directionAccuracy.toFixed(1)}% accuracy`);
    
    return result;
  },
  
  /**
   * Ejecuta backtest rápido con múltiples timeframes
   */
  async runMultiTimeframeBacktest(
    symbol: string,
    days: number = 90
  ): Promise<BacktestSummary> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const timeframes = [1, 3, 5, 7, 14];
    const results: BacktestResult[] = [];
    
    for (const tf of timeframes) {
      try {
        const result = await this.runBacktest({
          symbol,
          startDate,
          endDate,
          timeframeDays: tf,
          skipWeekends: true,
        });
        results.push(result);
      } catch (error) {
        logger.warn(`[Backtest] Failed for ${symbol} with ${tf}d timeframe:`, error);
      }
    }
    
    if (results.length === 0) {
      throw new Error(`No backtest results for ${symbol}`);
    }
    
    // Encontrar mejor timeframe
    const bestResult = results.reduce((best, current) => 
      current.directionAccuracy > best.directionAccuracy ? current : best
    );
    
    // Calcular promedio
    const avgAccuracy = results.reduce((sum, r) => sum + r.directionAccuracy, 0) / results.length;
    const avgScore = results.reduce((sum, r) => sum + (r.predictions.reduce((s, p) => s + p.accuracyScore, 0) / r.predictions.length), 0) / results.length;
    
    // Recomendación
    let recommendation = '';
    if (avgAccuracy > 60) {
      recommendation = `✅ Buen candidato para trading. Mejor timeframe: ${bestResult.config.timeframeDays} días`;
    } else if (avgAccuracy > 50) {
      recommendation = `⚠️ Resultados mixtos. Considerar con precaución.`;
    } else {
      recommendation = `❌ Difícil de predecir con este modelo. Evitar o mejorar datos.`;
    }
    
    return {
      symbol,
      period: `${days} días`,
      totalTests: results.reduce((sum, r) => sum + r.totalPredictions, 0),
      directionAccuracy: avgAccuracy,
      avgAccuracyScore: avgScore,
      bestTimeframe: bestResult.config.timeframeDays,
      recommendation,
    };
  },
  
  /**
   * Obtiene datos históricos de Yahoo Finance
   * Usa el servicio de backtesting existente
   */
  async getHistoricalData(
    symbol: string,
    startDate: Date,
    endDate: Date
  ): Promise<Array<{ date: string; close: number; open: number; high: number; low: number; volume: number }>> {
    try {
      const data = await backtestingService.getHistoricalData(symbol, startDate, endDate);
      
      if (!data || data.length === 0) {
        throw new Error('No historical data available');
      }
      
      // Convertir formato HistoricalBar a nuestro formato
      return data.map((bar: HistoricalBar) => ({
        date: bar.date.toISOString(),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume || 0,
      }));
    } catch (error) {
      logger.error(`[Backtest] Error getting historical data for ${symbol}:`, error);
      throw error;
    }
  },
  
  /**
   * Simula una predicción con datos de un día específico
   * Esta es una versión simplificada que usa datos básicos
   */
  async simulatePrediction(
    symbol: string,
    dayData: { date: string; close: number; open: number; high: number; low: number },
    timeframeDays: number
  ): Promise<{ predictedChange: number; direction: 'up' | 'down' | 'neutral'; confidence: number }> {
    // Usar datos del día para estimar dirección
    const dailyChange = ((dayData.close - dayData.open) / dayData.open) * 100;
    const range = ((dayData.high - dayData.low) / dayData.low) * 100;
    
    // Modelo simplificado basado en momentum
    // En producción usaríamos el calculator completo
    const momentum = dailyChange * 0.6;
    const volatilityFactor = Math.min(range / 3, 2);
    
    // Calcular predicción
    let predictedChange = momentum * (1 + Math.random() * 0.4 - 0.2);
    predictedChange = predictedChange * (timeframeDays / 5); // Escalar por timeframe
    
    // Limitar
    predictedChange = Math.max(-10, Math.min(10, predictedChange));
    
    // Dirección
    const direction: 'up' | 'down' | 'neutral' = 
      predictedChange > 0.3 ? 'up' : predictedChange < -0.3 ? 'down' : 'neutral';
    
    // Confianza basada en claridad de señal
    const signalStrength = Math.abs(predictedChange);
    const confidence = Math.min(85, 40 + signalStrength * 10 + Math.random() * 15);
    
    return { predictedChange, direction, confidence };
  },
  
  /**
   * Calcula accuracy score
   */
  calculateAccuracyScore(
    predictedChange: number,
    actualChange: number,
    directionCorrect: boolean
  ): number {
    if (!directionCorrect) {
      return Math.max(0, 30 - Math.abs(actualChange) * 5);
    }
    
    const predictedMag = Math.abs(predictedChange);
    const actualMag = Math.abs(actualChange);
    
    if (predictedMag < 0.1 && actualMag < 0.5) {
      return 100;
    }
    
    if (predictedMag > 0.1) {
      const magError = Math.abs(actualMag - predictedMag) / Math.max(predictedMag, 1);
      const magAccuracy = Math.max(0, 1 - magError);
      return Math.round(50 + magAccuracy * 50);
    }
    
    return 60;
  },
  
  /**
   * Determina calidad
   */
  getQuality(accuracyScore: number, directionCorrect: boolean): string {
    if (!directionCorrect) return 'failed';
    if (accuracyScore >= 75) return 'excellent';
    if (accuracyScore >= 50) return 'good';
    if (accuracyScore >= 25) return 'poor';
    return 'failed';
  },
  
  /**
   * Calcula todas las métricas de backtest
   */
  calculateMetrics(
    config: BacktestConfig,
    predictions: BacktestPrediction[]
  ): BacktestResult {
    const total = predictions.length;
    const correct = predictions.filter(p => p.directionCorrect).length;
    
    // Por dirección
    const upPreds = predictions.filter(p => p.predictedDirection === 'up');
    const downPreds = predictions.filter(p => p.predictedDirection === 'down');
    
    // Calidad
    const excellent = predictions.filter(p => p.quality === 'excellent').length;
    const good = predictions.filter(p => p.quality === 'good').length;
    const poor = predictions.filter(p => p.quality === 'poor').length;
    const failed = predictions.filter(p => p.quality === 'failed').length;
    
    // Promedios
    const avgPredicted = predictions.reduce((s, p) => s + p.predictedChange, 0) / total;
    const avgActual = predictions.reduce((s, p) => s + p.actualChange, 0) / total;
    const avgError = predictions.reduce((s, p) => s + p.error, 0) / total;
    const avgAbsError = predictions.reduce((s, p) => s + Math.abs(p.error), 0) / total;
    
    // Métricas avanzadas
    const returns = predictions.map(p => p.directionCorrect ? Math.abs(p.actualChange) : -Math.abs(p.actualChange));
    const avgReturn = returns.reduce((s, r) => s + r, 0) / total;
    const stdDev = Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / total);
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;
    
    // Drawdown
    let peak = 0;
    let maxDrawdown = 0;
    let cumulative = 0;
    for (const r of returns) {
      cumulative += r;
      if (cumulative > peak) peak = cumulative;
      const dd = peak - cumulative;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }
    
    // Profit factor
    const gains = returns.filter(r => r > 0).reduce((s, r) => s + r, 0);
    const losses = Math.abs(returns.filter(r => r < 0).reduce((s, r) => s + r, 0));
    const profitFactor = losses > 0 ? gains / losses : gains > 0 ? 999 : 0;
    
    return {
      symbol: config.symbol,
      config,
      totalPredictions: total,
      directionCorrect: correct,
      directionAccuracy: (correct / total) * 100,
      avgPredictedChange: avgPredicted,
      avgActualChange: avgActual,
      avgError,
      avgAbsError,
      upPredictions: {
        total: upPreds.length,
        correct: upPreds.filter(p => p.directionCorrect).length,
        accuracy: upPreds.length > 0 ? (upPreds.filter(p => p.directionCorrect).length / upPreds.length) * 100 : 0,
      },
      downPredictions: {
        total: downPreds.length,
        correct: downPreds.filter(p => p.directionCorrect).length,
        accuracy: downPreds.length > 0 ? (downPreds.filter(p => p.directionCorrect).length / downPreds.length) * 100 : 0,
      },
      excellentCount: excellent,
      goodCount: good,
      poorCount: poor,
      failedCount: failed,
      sharpeRatio,
      maxDrawdown,
      winRate: (correct / total) * 100,
      profitFactor,
      predictions,
      executedAt: new Date(),
      durationMs: 0,
    };
  },
};
