/**
 * Servicio de Calibración de Confianza
 * 
 * Problema: La IA dice "70% confianza" pero acierta solo 55%
 * Solución: Trackear accuracy real por bucket de confianza y calibrar
 * 
 * Ejemplo de tabla de calibración:
 *   Confianza reportada → Accuracy real
 *   90-100%            → 72%
 *   80-89%             → 65%
 *   70-79%             → 58%
 *   60-69%             → 52%
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { predictionTrackingService } from './prediction-tracking-service';

const CALIBRATION_MODEL_KEY = 'confidence-calibration-model';

/**
 * Bucket de calibración (rangos de 10%)
 */
export interface CalibrationBucket {
  range: string; // "70-79%"
  minConfidence: number; // 70
  maxConfidence: number; // 79
  
  // Estadísticas
  totalPredictions: number;
  correctDirections: number;
  avgAccuracyScore: number;
  
  // Resultado de calibración
  realAccuracy: number; // % real de aciertos de dirección
  calibrationError: number; // |confianza_media - accuracy_real|
  
  // Calidad
  quality: 'overconfident' | 'underconfident' | 'calibrated';
}

/**
 * Modelo de calibración completo
 */
export interface CalibrationModel {
  buckets: CalibrationBucket[];
  
  // Métricas globales
  totalSamples: number;
  avgCalibrationError: number; // Error promedio (objetivo: <5%)
  isCalibrated: boolean; // true si error < 5%
  
  // Para ajuste de confianza
  calibrationCurve: {
    reportedConfidence: number;
    realAccuracy: number;
  }[];
  
  lastUpdated: string;
}

/**
 * Resultado de calibrar una confianza
 */
export interface CalibratedConfidence {
  originalConfidence: number; // Confianza original del modelo
  calibratedConfidence: number; // Confianza ajustada por historial
  realAccuracyEstimate: number; // Estimación de accuracy real
  sampleSize: number; // En cuántos datos se basa
  reliability: 'high' | 'medium' | 'low'; // Confiabilidad del ajuste
  explanation: string;
}

class ConfidenceCalibrationService {
  private model: CalibrationModel | null = null;
  private initialized = false;

  /**
   * Inicializa el servicio y carga/construye el modelo
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // Intentar cargar modelo existente
      const stored = await AsyncStorage.getItem(CALIBRATION_MODEL_KEY);
      if (stored) {
        this.model = JSON.parse(stored);
      }
      
      // Reconstruir modelo si no existe o está desactualizado
      if (!this.model) {
        await this.rebuildModel();
      }
      
      this.initialized = true;
    } catch (error) {
      console.error('[Calibration] Error initializing:', error);
      this.model = this.createEmptyModel();
      this.initialized = true;
    }
  }

  /**
   * Crea un modelo vacío
   */
  private createEmptyModel(): CalibrationModel {
    const buckets: CalibrationBucket[] = [];
    
    // Crear buckets de 10% cada uno (50-59, 60-69, 70-79, 80-89, 90-100)
    for (let min = 50; min <= 90; min += 10) {
      const max = min === 90 ? 100 : min + 9;
      buckets.push({
        range: `${min}-${max}%`,
        minConfidence: min,
        maxConfidence: max,
        totalPredictions: 0,
        correctDirections: 0,
        avgAccuracyScore: 0,
        realAccuracy: 0,
        calibrationError: 0,
        quality: 'calibrated',
      });
    }
    
    return {
      buckets,
      totalSamples: 0,
      avgCalibrationError: 0,
      isCalibrated: false,
      calibrationCurve: [],
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Reconstruye el modelo a partir de predicciones verificadas
   */
  async rebuildModel(): Promise<CalibrationModel> {
    console.log('[Calibration] Rebuilding model...');
    
    const predictions = await predictionTrackingService.getVerifiedPredictions();
    
    if (predictions.length < 5) {
      console.log('[Calibration] Insufficient data for calibration');
      this.model = this.createEmptyModel();
      return this.model;
    }
    
    // Inicializar buckets
    const model = this.createEmptyModel();
    
    // Agrupar predicciones por bucket de confianza
    for (const pred of predictions) {
      const bucket = model.buckets.find(
        b => pred.confidence >= b.minConfidence && pred.confidence <= b.maxConfidence
      );
      
      if (bucket) {
        bucket.totalPredictions++;
        if (pred.directionCorrect) {
          bucket.correctDirections++;
        }
        bucket.avgAccuracyScore = (
          (bucket.avgAccuracyScore * (bucket.totalPredictions - 1) + (pred.accuracyScore || 0))
        ) / bucket.totalPredictions;
      }
    }
    
    // Calcular métricas para cada bucket
    let totalError = 0;
    let bucketsWithData = 0;
    
    for (const bucket of model.buckets) {
      if (bucket.totalPredictions > 0) {
        // Accuracy real = % de predicciones con dirección correcta
        bucket.realAccuracy = (bucket.correctDirections / bucket.totalPredictions) * 100;
        
        // Confianza media del bucket
        const midConfidence = (bucket.minConfidence + bucket.maxConfidence) / 2;
        
        // Error de calibración = |confianza_reportada - accuracy_real|
        bucket.calibrationError = Math.abs(midConfidence - bucket.realAccuracy);
        
        // Determinar calidad
        if (bucket.calibrationError <= 5) {
          bucket.quality = 'calibrated';
        } else if (midConfidence > bucket.realAccuracy) {
          bucket.quality = 'overconfident';
        } else {
          bucket.quality = 'underconfident';
        }
        
        totalError += bucket.calibrationError;
        bucketsWithData++;
        
        // Añadir a curva de calibración
        model.calibrationCurve.push({
          reportedConfidence: midConfidence,
          realAccuracy: bucket.realAccuracy,
        });
      }
    }
    
    // Calcular métricas globales
    model.totalSamples = predictions.length;
    model.avgCalibrationError = bucketsWithData > 0 ? totalError / bucketsWithData : 0;
    model.isCalibrated = model.avgCalibrationError < 5;
    model.lastUpdated = new Date().toISOString();
    
    // Ordenar curva de calibración
    model.calibrationCurve.sort((a, b) => a.reportedConfidence - b.reportedConfidence);
    
    // Guardar modelo
    this.model = model;
    await AsyncStorage.setItem(CALIBRATION_MODEL_KEY, JSON.stringify(model));
    
    console.log(`[Calibration] Model rebuilt with ${predictions.length} samples, avgError: ${model.avgCalibrationError.toFixed(1)}%`);
    
    return model;
  }

  /**
   * Obtiene el modelo actual
   */
  async getModel(): Promise<CalibrationModel> {
    await this.initialize();
    return this.model || this.createEmptyModel();
  }

  /**
   * Calibra una confianza basándose en el historial
   * 
   * Ejemplo: Si históricamente cuando dices 75% confianza aciertas 60%,
   * esta función retorna 60% como confianza calibrada.
   */
  async calibrateConfidence(originalConfidence: number): Promise<CalibratedConfidence> {
    await this.initialize();
    
    if (!this.model || this.model.totalSamples < 10) {
      return {
        originalConfidence,
        calibratedConfidence: originalConfidence,
        realAccuracyEstimate: originalConfidence,
        sampleSize: this.model?.totalSamples || 0,
        reliability: 'low',
        explanation: 'Insuficientes datos para calibrar. Se muestra confianza sin ajustar.',
      };
    }
    
    // Encontrar el bucket correspondiente
    const bucket = this.model.buckets.find(
      b => originalConfidence >= b.minConfidence && originalConfidence <= b.maxConfidence
    );
    
    if (!bucket || bucket.totalPredictions < 3) {
      // No hay datos suficientes para este rango - interpolar
      return this.interpolateCalibration(originalConfidence);
    }
    
    // Calcular confianza calibrada
    const midConfidence = (bucket.minConfidence + bucket.maxConfidence) / 2;
    const adjustment = bucket.realAccuracy - midConfidence;
    const calibratedConfidence = Math.max(30, Math.min(95, originalConfidence + adjustment));
    
    // Determinar reliability
    let reliability: 'high' | 'medium' | 'low';
    if (bucket.totalPredictions >= 20) {
      reliability = 'high';
    } else if (bucket.totalPredictions >= 10) {
      reliability = 'medium';
    } else {
      reliability = 'low';
    }
    
    // Generar explicación
    let explanation = '';
    if (bucket.quality === 'overconfident') {
      explanation = `Históricamente, con ${bucket.range} confianza, el accuracy real ha sido ${bucket.realAccuracy.toFixed(0)}% (sobreconfiado).`;
    } else if (bucket.quality === 'underconfident') {
      explanation = `Históricamente, con ${bucket.range} confianza, el accuracy real ha sido ${bucket.realAccuracy.toFixed(0)}% (infraconfiado).`;
    } else {
      explanation = `La confianza está bien calibrada para este rango (${bucket.range}).`;
    }
    
    return {
      originalConfidence,
      calibratedConfidence: Math.round(calibratedConfidence),
      realAccuracyEstimate: Math.round(bucket.realAccuracy),
      sampleSize: bucket.totalPredictions,
      reliability,
      explanation,
    };
  }

  /**
   * Interpola calibración cuando no hay datos exactos del bucket
   */
  private interpolateCalibration(originalConfidence: number): CalibratedConfidence {
    if (!this.model || this.model.calibrationCurve.length < 2) {
      return {
        originalConfidence,
        calibratedConfidence: originalConfidence,
        realAccuracyEstimate: originalConfidence,
        sampleSize: 0,
        reliability: 'low',
        explanation: 'Insuficientes datos para interpolación.',
      };
    }
    
    const curve = this.model.calibrationCurve;
    
    // Encontrar puntos para interpolar
    let lower = curve[0];
    let upper = curve[curve.length - 1];
    
    for (let i = 0; i < curve.length - 1; i++) {
      if (curve[i].reportedConfidence <= originalConfidence && 
          curve[i + 1].reportedConfidence >= originalConfidence) {
        lower = curve[i];
        upper = curve[i + 1];
        break;
      }
    }
    
    // Interpolación lineal
    const range = upper.reportedConfidence - lower.reportedConfidence;
    const t = range > 0 ? (originalConfidence - lower.reportedConfidence) / range : 0.5;
    const interpolatedAccuracy = lower.realAccuracy + t * (upper.realAccuracy - lower.realAccuracy);
    
    return {
      originalConfidence,
      calibratedConfidence: Math.round(interpolatedAccuracy),
      realAccuracyEstimate: Math.round(interpolatedAccuracy),
      sampleSize: this.model.totalSamples,
      reliability: 'medium',
      explanation: `Estimación interpolada basada en ${this.model.totalSamples} predicciones.`,
    };
  }

  /**
   * Obtiene el error de calibración para una predicción
   * (diferencia entre confianza reportada y accuracy real esperado)
   */
  async getCalibrationError(confidence: number): Promise<number> {
    const calibrated = await this.calibrateConfidence(confidence);
    return Math.abs(confidence - calibrated.realAccuracyEstimate);
  }

  /**
   * Obtiene un resumen de calibración para mostrar en UI
   */
  async getCalibrationSummary(): Promise<{
    status: 'well_calibrated' | 'needs_improvement' | 'insufficient_data';
    avgError: number;
    worstBucket: CalibrationBucket | null;
    recommendation: string;
  }> {
    await this.initialize();
    
    if (!this.model || this.model.totalSamples < 10) {
      return {
        status: 'insufficient_data',
        avgError: 0,
        worstBucket: null,
        recommendation: 'Necesitas al menos 10 predicciones verificadas para calibrar.',
      };
    }
    
    // Encontrar el bucket con mayor error
    const bucketsWithData = this.model.buckets.filter(b => b.totalPredictions >= 3);
    const worstBucket = bucketsWithData.reduce((worst, current) => 
      current.calibrationError > (worst?.calibrationError || 0) ? current : worst
    , null as CalibrationBucket | null);
    
    let status: 'well_calibrated' | 'needs_improvement';
    let recommendation: string;
    
    if (this.model.avgCalibrationError < 5) {
      status = 'well_calibrated';
      recommendation = '✅ La confianza está bien calibrada. El modelo es confiable.';
    } else if (this.model.avgCalibrationError < 15) {
      status = 'needs_improvement';
      if (worstBucket?.quality === 'overconfident') {
        recommendation = `⚠️ El modelo es sobreconfiado en el rango ${worstBucket.range}. Considera ajustar los pesos.`;
      } else if (worstBucket?.quality === 'underconfident') {
        recommendation = `📈 El modelo es infraconfiado en el rango ${worstBucket.range}. ¡Buen trabajo!`;
      } else {
        recommendation = '⚠️ La calibración necesita mejorar. Acumula más predicciones.';
      }
    } else {
      status = 'needs_improvement';
      recommendation = '❌ La calibración es pobre. El modelo necesita más datos o ajustes significativos.';
    }
    
    return {
      status,
      avgError: this.model.avgCalibrationError,
      worstBucket,
      recommendation,
    };
  }

  /**
   * Genera un reporte de calibración en texto
   */
  async generateReport(): Promise<string> {
    await this.initialize();
    
    if (!this.model || this.model.totalSamples < 5) {
      return 'Insuficientes datos para generar reporte de calibración.';
    }
    
    let report = '📊 REPORTE DE CALIBRACIÓN DE CONFIANZA\n';
    report += '═'.repeat(50) + '\n\n';
    
    report += `Total de predicciones: ${this.model.totalSamples}\n`;
    report += `Error promedio de calibración: ${this.model.avgCalibrationError.toFixed(1)}%\n`;
    report += `Estado: ${this.model.isCalibrated ? '✅ Bien calibrado' : '⚠️ Necesita mejora'}\n\n`;
    
    report += 'TABLA DE CALIBRACIÓN:\n';
    report += '─'.repeat(50) + '\n';
    report += 'Confianza   | Samples | Dir. OK | Accuracy Real | Error\n';
    report += '─'.repeat(50) + '\n';
    
    for (const bucket of this.model.buckets) {
      if (bucket.totalPredictions > 0) {
        const dirOkPercent = (bucket.correctDirections / bucket.totalPredictions * 100).toFixed(0);
        const qualityIcon = bucket.quality === 'calibrated' ? '✓' : 
                           bucket.quality === 'overconfident' ? '↑' : '↓';
        
        report += `${bucket.range.padEnd(11)} | ${String(bucket.totalPredictions).padEnd(7)} | `;
        report += `${dirOkPercent.padStart(3)}%    | `;
        report += `${bucket.realAccuracy.toFixed(0).padStart(3)}%          | `;
        report += `${bucket.calibrationError.toFixed(0).padStart(2)}% ${qualityIcon}\n`;
      }
    }
    
    report += '─'.repeat(50) + '\n';
    report += 'Leyenda: ✓ calibrado, ↑ sobreconfiado, ↓ infraconfiado\n';
    
    return report;
  }

  /**
   * Resetea el modelo de calibración
   */
  async reset(): Promise<void> {
    this.model = null;
    this.initialized = false;
    await AsyncStorage.removeItem(CALIBRATION_MODEL_KEY);
    console.log('[Calibration] Model reset');
  }
}

export const confidenceCalibrationService = new ConfidenceCalibrationService();
