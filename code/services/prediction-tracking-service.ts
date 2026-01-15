/**
 * Servicio de Tracking de Predicciones
 * Ahora usa el backend para todas las operaciones
 */

import { apiClient } from './api-client';

// ============================================================================
// TIPOS
// ============================================================================

export interface TrackedPrediction {
  id: string;
  symbol: string;
  asset: string;
  assetType: string;
  
  // Datos de la predicción
  createdAt: string;
  expiresAt: string;
  timeframeDays: number;
  timeframe: string;
  
  direction: string;
  predictedChange: number;
  predictedPriceMin: number | null;
  predictedPriceMax: number | null;
  confidence: number;
  currentPrice: number;
  targetPrice: number;
  
  // Volatilidad
  volatility?: number;
  volatilityCategory?: string;
  
  // Scores de factores
  factorBreakdown?: any;
  factorWeights?: any;
  
  // Resultados
  verified: boolean;
  verifiedAt?: string;
  actualPrice?: number;
  actualChange?: number;
  actualDirection?: string;
  
  // Métricas de precisión
  directionCorrect?: boolean;
  withinRange?: boolean;
  priceError?: number;
  changeAccuracy?: number;
  accuracyScore?: number;
  quality?: string;
  
  // Uncertainty
  uncertaintyScore?: number;
  uncertaintyData?: any;
}

export interface TrackingStats {
  total: number;
  verified: number;
  pending: number;
  directionAccuracy: number;
  avgAccuracyScore: number;
  avgPriceError: number;
  withinRangeRate: number;
  byQuality: {
    excellent: number;
    good: number;
    poor: number;
    failed: number;
  };
  byDirection: {
    up: { total: number; correct: number };
    down: { total: number; correct: number };
    neutral: { total: number; correct: number };
  };
}

// ============================================================================
// SERVICIO
// ============================================================================

class PredictionTrackingService {
  /**
   * Registrar una nueva predicción para tracking
   * Usa el endpoint /track que guarda la predicción ya calculada
   */
  async trackPrediction(data: {
    symbol: string;
    asset?: string;
    assetType?: string;
    direction: string;
    predictedChange: number;
    predictedPriceMin?: number;
    predictedPriceMax?: number;
    confidence: number;
    currentPrice: number;
    timeframe?: string;
    timeframeDays?: number;
    factorScores?: Record<string, number>;
    factorWeightsUsed?: Record<string, number>;
    volatility?: number;
    uncertaintyScore?: number;
  }): Promise<{ id: string }> {
    try {
      // Usar el endpoint /track que guarda la predicción sin recalcular
      const result = await apiClient.trackPrediction({
        symbol: data.symbol,
        asset: data.asset,
        assetType: data.assetType,
        direction: data.direction,
        predictedChange: data.predictedChange,
        predictedPriceMin: data.predictedPriceMin,
        predictedPriceMax: data.predictedPriceMax,
        confidence: data.confidence,
        currentPrice: data.currentPrice,
        timeframe: data.timeframe,
        timeframeDays: data.timeframeDays || 1,
        volatility: data.volatility,
        factorWeights: data.factorWeightsUsed,
        uncertaintyScore: data.uncertaintyScore,
      });
      console.log(`[Tracking] Predicción registrada: ${result.id}`);
      return { id: result.id };
    } catch (error: any) {
      console.error('[Tracking] Error registrando predicción:', error.message);
      throw error;
    }
  }

  /**
   * Obtener todas las predicciones
   */
  async getAllPredictions(options: {
    limit?: number;
    offset?: number;
    verified?: boolean;
  } = {}): Promise<{ predictions: TrackedPrediction[]; total: number }> {
    try {
      const result = await apiClient.getAllPredictions(options);
      return {
        predictions: result.predictions.map(this.mapPrediction),
        total: result.total,
      };
    } catch (error: any) {
      console.error('[Tracking] Error obteniendo predicciones:', error.message);
      return { predictions: [], total: 0 };
    }
  }

  /**
   * Obtener predicciones pendientes de verificar
   */
  async getPending(): Promise<TrackedPrediction[]> {
    try {
      const predictions = await apiClient.getPendingPredictions();
      return predictions.map(this.mapPrediction);
    } catch (error: any) {
      console.error('[Tracking] Error obteniendo pendientes:', error.message);
      return [];
    }
  }

  /**
   * Obtener predicciones por símbolo
   */
  async getBySymbol(symbol: string, limit: number = 10): Promise<TrackedPrediction[]> {
    try {
      const predictions = await apiClient.getPredictionsBySymbol(symbol, limit);
      return predictions.map(this.mapPrediction);
    } catch (error: any) {
      console.error('[Tracking] Error obteniendo por símbolo:', error.message);
      return [];
    }
  }

  /**
   * Verificar una predicción manualmente
   */
  async verifyPrediction(id: string, actualPrice: number): Promise<TrackedPrediction | null> {
    try {
      const result = await apiClient.verifyPrediction(id, actualPrice);
      return this.mapPrediction(result);
    } catch (error: any) {
      console.error('[Tracking] Error verificando predicción:', error.message);
      return null;
    }
  }

  /**
   * Verificar todas las predicciones pendientes automáticamente
   */
  async verifyAllPending(): Promise<{ verified: number; results: any[] }> {
    try {
      return await apiClient.verifyAllPending();
    } catch (error: any) {
      console.error('[Tracking] Error verificando pendientes:', error.message);
      return { verified: 0, results: [] };
    }
  }

  /**
   * Obtener estadísticas de tracking
   */
  async getStats(): Promise<TrackingStats> {
    try {
      return await apiClient.getPredictionStats();
    } catch (error: any) {
      console.error('[Tracking] Error obteniendo stats:', error.message);
      return this.getEmptyStats();
    }
  }

  /**
   * Mapear predicción del backend al formato del frontend
   */
  private mapPrediction(p: any): TrackedPrediction {
    return {
      id: p.id,
      symbol: p.symbol,
      asset: p.asset || p.symbol,
      assetType: p.assetType,
      createdAt: p.createdAt,
      expiresAt: p.expiresAt,
      timeframeDays: p.timeframeDays,
      timeframe: p.timeframe,
      direction: p.direction,
      predictedChange: p.predictedChange,
      predictedPriceMin: p.predictedPriceMin,
      predictedPriceMax: p.predictedPriceMax,
      confidence: p.confidence,
      currentPrice: p.currentPrice,
      targetPrice: p.targetPrice,
      volatility: p.volatility,
      volatilityCategory: p.volatilityCategory,
      // Backend already parses JSON fields, no need to parse again
      factorBreakdown: p.factorBreakdown,
      factorWeights: p.factorWeights,
      verified: p.verified,
      verifiedAt: p.verifiedAt,
      actualPrice: p.actualPrice,
      actualChange: p.actualChange,
      actualDirection: p.actualDirection,
      directionCorrect: p.directionCorrect,
      withinRange: p.withinRange,
      priceError: p.priceError,
      changeAccuracy: p.changeAccuracy,
      accuracyScore: p.accuracyScore,
      quality: p.quality,
      uncertaintyScore: p.uncertaintyScore,
      uncertaintyData: p.uncertaintyData,
    };
  }

  /**
   * Stats vacías
   */
  private getEmptyStats(): TrackingStats {
    return {
      total: 0,
      verified: 0,
      pending: 0,
      directionAccuracy: 0,
      avgAccuracyScore: 0,
      avgPriceError: 0,
      withinRangeRate: 0,
      byQuality: { excellent: 0, good: 0, poor: 0, failed: 0 },
      byDirection: {
        up: { total: 0, correct: 0 },
        down: { total: 0, correct: 0 },
        neutral: { total: 0, correct: 0 },
      },
    };
  }
}

export const predictionTrackingService = new PredictionTrackingService();
