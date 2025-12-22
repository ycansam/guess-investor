/**
 * Servicio de Métricas ML
 * Calcula métricas clave para tracking de mejoras del sistema ML
 */

import { predictionTrackingService, TrackedPrediction } from './prediction-tracking-service';

export interface MLMetrics {
  // Métricas básicas
  totalVerified: number;
  totalPending: number;
  
  // Direction accuracy
  directionAccuracy: number; // % predicciones con dirección correcta
  
  // Calibration error
  calibrationError: number; // |confianza - accuracy real| promedio
  calibrationByBucket: {
    bucket: string;
    avgConfidence: number;
    avgAccuracy: number;
    error: number;
    count: number;
  }[];
  
  // Accuracy score
  avgAccuracyScore: number; // Promedio de accuracyScore
  
  // Quality rates
  excellentRate: number; // % con score >75
  goodRate: number; // % con score 50-75
  poorRate: number; // % con score 25-50
  failedRate: number; // % con score <25
  
  // Sharpe ratio simulado
  sharpeRatio: number | null; // Ratio riesgo/retorno simulado
  
  // Métricas adicionales útiles
  avgPriceError: number; // Error promedio en %
  withinRangeRate: number; // % que cayó dentro del rango
  
  // Por timeframe
  byTimeframe: {
    timeframe: string;
    count: number;
    directionAccuracy: number;
    avgAccuracyScore: number;
  }[];
  
  // Por volatilidad
  byVolatility: {
    category: string;
    count: number;
    directionAccuracy: number;
    avgAccuracyScore: number;
  }[];
  
  // Metadata
  calculatedAt: Date;
  dataQuality: 'insufficient' | 'low' | 'medium' | 'high';
  dataQualityReason: string;
}

class MLMetricsService {
  /**
   * Calcula todas las métricas del sistema ML
   */
  async calculateMetrics(): Promise<MLMetrics> {
    const allPredictions = await predictionTrackingService.getAllPredictions();
    const verified = allPredictions.filter(p => p.status === 'verified');
    const pending = allPredictions.filter(p => p.status === 'pending');
    
    // Determinar calidad de los datos
    const { quality, reason } = this.assessDataQuality(verified.length);
    
    // Si no hay suficientes datos
    if (verified.length === 0) {
      return this.emptyMetrics(quality, reason);
    }
    
    return {
      totalVerified: verified.length,
      totalPending: pending.length,
      directionAccuracy: this.calculateDirectionAccuracy(verified),
      calibrationError: this.calculateCalibrationError(verified),
      calibrationByBucket: this.calculateCalibrationByBucket(verified),
      avgAccuracyScore: this.calculateAvgAccuracyScore(verified),
      excellentRate: this.calculateExcellentRate(verified),
      goodRate: this.calculateGoodRate(verified),
      poorRate: this.calculatePoorRate(verified),
      failedRate: this.calculateFailedRate(verified),
      sharpeRatio: this.calculateSharpeRatio(verified),
      avgPriceError: this.calculateAvgPriceError(verified),
      withinRangeRate: this.calculateWithinRangeRate(verified),
      byTimeframe: this.calculateByTimeframe(verified),
      byVolatility: this.calculateByVolatility(verified),
      calculatedAt: new Date(),
      dataQuality: quality,
      dataQualityReason: reason,
    };
  }
  
  /**
   * Evalúa la calidad de los datos disponibles
   */
  private assessDataQuality(verifiedCount: number): { quality: MLMetrics['dataQuality']; reason: string } {
    if (verifiedCount === 0) {
      return { quality: 'insufficient', reason: 'No hay predicciones verificadas' };
    }
    if (verifiedCount < 10) {
      return { quality: 'low', reason: `Solo ${verifiedCount} predicciones verificadas (mínimo recomendado: 30)` };
    }
    if (verifiedCount < 30) {
      return { quality: 'medium', reason: `${verifiedCount} predicciones verificadas. Métricas fiables a partir de 50+` };
    }
    return { quality: 'high', reason: `${verifiedCount} predicciones verificadas. Métricas estadísticamente significativas` };
  }
  
  /**
   * Retorna métricas vacías
   */
  private emptyMetrics(quality: MLMetrics['dataQuality'], reason: string): MLMetrics {
    return {
      totalVerified: 0,
      totalPending: 0,
      directionAccuracy: 0,
      calibrationError: 0,
      calibrationByBucket: [],
      avgAccuracyScore: 0,
      excellentRate: 0,
      goodRate: 0,
      poorRate: 0,
      failedRate: 0,
      sharpeRatio: null,
      avgPriceError: 0,
      withinRangeRate: 0,
      byTimeframe: [],
      byVolatility: [],
      calculatedAt: new Date(),
      dataQuality: quality,
      dataQualityReason: reason,
    };
  }
  
  /**
   * Calcula % de predicciones con dirección correcta
   */
  private calculateDirectionAccuracy(predictions: TrackedPrediction[]): number {
    if (predictions.length === 0) return 0;
    const correct = predictions.filter(p => p.directionCorrect === true).length;
    return Math.round((correct / predictions.length) * 100);
  }
  
  /**
   * Calcula error de calibración promedio
   */
  private calculateCalibrationError(predictions: TrackedPrediction[]): number {
    const withScores = predictions.filter(p => 
      p.confidence !== undefined && 
      p.accuracyScore !== undefined
    );
    
    if (withScores.length === 0) return 0;
    
    const errors = withScores.map(p => 
      Math.abs(p.confidence! - p.accuracyScore!)
    );
    
    const avgError = errors.reduce((a, b) => a + b, 0) / errors.length;
    return Math.round(avgError * 10) / 10;
  }
  
  /**
   * Calcula calibración por buckets de confianza
   */
  private calculateCalibrationByBucket(predictions: TrackedPrediction[]): MLMetrics['calibrationByBucket'] {
    const withScores = predictions.filter(p => 
      p.confidence !== undefined && 
      p.accuracyScore !== undefined
    );
    
    if (withScores.length === 0) return [];
    
    const buckets = new Map<string, { confidences: number[]; accuracies: number[] }>();
    
    for (const p of withScores) {
      const bucketStart = Math.floor(p.confidence! / 10) * 10;
      const bucketEnd = bucketStart + 9;
      const bucketKey = `${bucketStart}-${bucketEnd}%`;
      
      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, { confidences: [], accuracies: [] });
      }
      
      const bucket = buckets.get(bucketKey)!;
      bucket.confidences.push(p.confidence!);
      bucket.accuracies.push(p.accuracyScore!);
    }
    
    return Array.from(buckets.entries()).map(([bucket, data]) => {
      const avgConfidence = data.confidences.reduce((a, b) => a + b, 0) / data.confidences.length;
      const avgAccuracy = data.accuracies.reduce((a, b) => a + b, 0) / data.accuracies.length;
      const error = Math.abs(avgConfidence - avgAccuracy);
      
      return {
        bucket,
        avgConfidence: Math.round(avgConfidence * 10) / 10,
        avgAccuracy: Math.round(avgAccuracy * 10) / 10,
        error: Math.round(error * 10) / 10,
        count: data.confidences.length,
      };
    }).sort((a, b) => {
      const aStart = parseInt(a.bucket.split('-')[0]);
      const bStart = parseInt(b.bucket.split('-')[0]);
      return bStart - aStart;
    });
  }
  
  /**
   * Calcula accuracy score promedio
   */
  private calculateAvgAccuracyScore(predictions: TrackedPrediction[]): number {
    const withScores = predictions.filter(p => p.accuracyScore !== undefined);
    if (withScores.length === 0) return 0;
    
    const sum = withScores.reduce((acc, p) => acc + p.accuracyScore!, 0);
    return Math.round((sum / withScores.length) * 10) / 10;
  }
  
  /**
   * Calcula % de predicciones excelentes (>75)
   */
  private calculateExcellentRate(predictions: TrackedPrediction[]): number {
    const withScores = predictions.filter(p => p.accuracyScore !== undefined);
    if (withScores.length === 0) return 0;
    
    const excellent = withScores.filter(p => p.accuracyScore! > 75).length;
    return Math.round((excellent / withScores.length) * 100);
  }
  
  /**
   * Calcula % de predicciones buenas (50-75)
   */
  private calculateGoodRate(predictions: TrackedPrediction[]): number {
    const withScores = predictions.filter(p => p.accuracyScore !== undefined);
    if (withScores.length === 0) return 0;
    
    const good = withScores.filter(p => p.accuracyScore! >= 50 && p.accuracyScore! <= 75).length;
    return Math.round((good / withScores.length) * 100);
  }
  
  /**
   * Calcula % de predicciones pobres (25-50)
   */
  private calculatePoorRate(predictions: TrackedPrediction[]): number {
    const withScores = predictions.filter(p => p.accuracyScore !== undefined);
    if (withScores.length === 0) return 0;
    
    const poor = withScores.filter(p => p.accuracyScore! >= 25 && p.accuracyScore! < 50).length;
    return Math.round((poor / withScores.length) * 100);
  }
  
  /**
   * Calcula % de predicciones fallidas (<25)
   */
  private calculateFailedRate(predictions: TrackedPrediction[]): number {
    const withScores = predictions.filter(p => p.accuracyScore !== undefined);
    if (withScores.length === 0) return 0;
    
    const failed = withScores.filter(p => p.accuracyScore! < 25).length;
    return Math.round((failed / withScores.length) * 100);
  }
  
  /**
   * Calcula Sharpe Ratio simulado
   * Si siguieras las predicciones (comprar cuando predice subida, vender cuando predice bajada)
   */
  private calculateSharpeRatio(predictions: TrackedPrediction[]): number | null {
    if (predictions.length < 10) return null; // Insuficientes datos
    
    // Retornos si siguieras las predicciones
    const returns = predictions.map(p => {
      // Si predijo subida y subió → ganancia
      // Si predijo subida y bajó → pérdida
      const direction = p.predictedChange > 0 ? 1 : -1;
      return direction * (p.actualChange || 0) / 100; // Normalizar a decimal
    });
    
    // Retorno promedio
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    
    // Desviación estándar de retornos
    const variance = returns.reduce((acc, r) => acc + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    
    if (stdDev === 0) return null;
    
    // Sharpe = (retorno promedio - risk free rate) / desviación estándar
    // Asumimos risk free rate = 0 para simplificar
    const sharpe = avgReturn / stdDev;
    
    return Math.round(sharpe * 100) / 100;
  }
  
  /**
   * Calcula error promedio en precio
   */
  private calculateAvgPriceError(predictions: TrackedPrediction[]): number {
    if (predictions.length === 0) return 0;
    
    const errors = predictions.map(p => {
      const predicted = Math.abs(p.predictedChange);
      const actual = Math.abs(p.actualChange || 0);
      return Math.abs(predicted - actual);
    });
    
    const avg = errors.reduce((a, b) => a + b, 0) / errors.length;
    return Math.round(avg * 100) / 100;
  }
  
  /**
   * Calcula % que cayó dentro del rango predicho
   */
  private calculateWithinRangeRate(predictions: TrackedPrediction[]): number {
    if (predictions.length === 0) return 0;
    
    const withinRange = predictions.filter(p => p.withinRange === true).length;
    return Math.round((withinRange / predictions.length) * 100);
  }
  
  /**
   * Agrupa métricas por timeframe
   */
  private calculateByTimeframe(predictions: TrackedPrediction[]): MLMetrics['byTimeframe'] {
    const groups = new Map<string, TrackedPrediction[]>();
    
    for (const p of predictions) {
      const tf = this.getTimeframeCategory(p.timeframeDays);
      if (!groups.has(tf)) groups.set(tf, []);
      groups.get(tf)!.push(p);
    }
    
    return Array.from(groups.entries()).map(([timeframe, preds]) => ({
      timeframe,
      count: preds.length,
      directionAccuracy: this.calculateDirectionAccuracy(preds),
      avgAccuracyScore: this.calculateAvgAccuracyScore(preds),
    }));
  }
  
  /**
   * Agrupa métricas por volatilidad
   */
  private calculateByVolatility(predictions: TrackedPrediction[]): MLMetrics['byVolatility'] {
    const groups = new Map<string, TrackedPrediction[]>();
    
    for (const p of predictions) {
      const vol = p.volatilityCategory || 'unknown';
      if (!groups.has(vol)) groups.set(vol, []);
      groups.get(vol)!.push(p);
    }
    
    return Array.from(groups.entries()).map(([category, preds]) => ({
      category,
      count: preds.length,
      directionAccuracy: this.calculateDirectionAccuracy(preds),
      avgAccuracyScore: this.calculateAvgAccuracyScore(preds),
    }));
  }
  
  private getTimeframeCategory(days: number): string {
    if (days <= 1) return 'intraday';
    if (days <= 7) return 'swing';
    return 'long';
  }
  
  /**
   * Genera reporte de texto de las métricas
   */
  async generateReport(): Promise<string> {
    const metrics = await this.calculateMetrics();
    
    const lines: string[] = [];
    lines.push('📊 REPORTE DE MÉTRICAS ML');
    lines.push('═'.repeat(50));
    lines.push('');
    lines.push(`Calculado: ${metrics.calculatedAt.toLocaleString()}`);
    lines.push(`Calidad de datos: ${metrics.dataQuality.toUpperCase()}`);
    lines.push(`  → ${metrics.dataQualityReason}`);
    lines.push('');
    
    lines.push('📈 MÉTRICAS PRINCIPALES');
    lines.push('─'.repeat(50));
    lines.push(`Predicciones verificadas: ${metrics.totalVerified}`);
    lines.push(`Predicciones pendientes: ${metrics.totalPending}`);
    lines.push('');
    lines.push(`Direction Accuracy: ${metrics.directionAccuracy}% (objetivo: 65%)`);
    lines.push(`Avg Accuracy Score: ${metrics.avgAccuracyScore}% (objetivo: 60%)`);
    lines.push(`Calibration Error: ${metrics.calibrationError}% (objetivo: <5%)`);
    lines.push(`Sharpe Ratio: ${metrics.sharpeRatio !== null ? metrics.sharpeRatio.toFixed(2) : 'N/A'} (objetivo: >1.0)`);
    lines.push('');
    
    lines.push('⭐ DISTRIBUCIÓN DE CALIDAD');
    lines.push('─'.repeat(50));
    lines.push(`Excellent (>75): ${metrics.excellentRate}% (objetivo: 25%)`);
    lines.push(`Good (50-75): ${metrics.goodRate}%`);
    lines.push(`Poor (25-50): ${metrics.poorRate}%`);
    lines.push(`Failed (<25): ${metrics.failedRate}% (objetivo: <10%)`);
    lines.push('');
    
    if (metrics.calibrationByBucket.length > 0) {
      lines.push('📐 CALIBRACIÓN POR CONFIANZA');
      lines.push('─'.repeat(50));
      lines.push('Bucket      | Confianza | Accuracy | Error | Samples');
      lines.push('─'.repeat(50));
      for (const b of metrics.calibrationByBucket) {
        lines.push(
          `${b.bucket.padEnd(11)} | ${b.avgConfidence.toFixed(1).padStart(9)} | ` +
          `${b.avgAccuracy.toFixed(1).padStart(8)} | ${b.error.toFixed(1).padStart(5)} | ${b.count}`
        );
      }
      lines.push('');
    }
    
    if (metrics.byTimeframe.length > 0) {
      lines.push('⏱️ POR TIMEFRAME');
      lines.push('─'.repeat(50));
      for (const tf of metrics.byTimeframe) {
        lines.push(`${tf.timeframe}: ${tf.directionAccuracy}% direction, ${tf.avgAccuracyScore}% score (n=${tf.count})`);
      }
      lines.push('');
    }
    
    if (metrics.byVolatility.length > 0) {
      lines.push('📊 POR VOLATILIDAD');
      lines.push('─'.repeat(50));
      for (const v of metrics.byVolatility) {
        lines.push(`${v.category}: ${v.directionAccuracy}% direction, ${v.avgAccuracyScore}% score (n=${v.count})`);
      }
      lines.push('');
    }
    
    lines.push('═'.repeat(50));
    
    return lines.join('\n');
  }
}

export const mlMetricsService = new MLMetricsService();
