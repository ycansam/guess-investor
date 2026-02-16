import { Prediction } from '@prisma/client';
import { prisma } from '../config/database.js';

import { calculateIntradayExpiry, calculateNextDayOpen, detectMarketType, getMarketCloseTime } from '../services/external/market-hours.service.js';
import { isMarketClosedForPrediction } from '../services/external/yahoo.service.js';

export type PredictionType = 'close' | 'open_next_day';

// ============================================================================
// TIPOS
// ============================================================================

export interface CreatePredictionData {
  symbol: string;
  asset?: string;
  assetType: string;
  timeframe: string;
  timeframeDays?: number;
  predictionType?: PredictionType; // 'close' (cierre del día) o 'open_next_day' (apertura día siguiente)
  direction: string;
  predictedChange: number;
  confidence: number;
  currentPrice: number;
  targetPrice?: number;
  predictedPriceMin?: number;
  predictedPriceMax?: number;
  currency?: string;
  volatility?: number;
  volatilityCategory?: string;
  factorBreakdown?: Record<string, any>;
  factorWeights?: Record<string, number>;
  reasoning?: string;
  uncertaintyScore?: number;
  uncertaintyData?: Record<string, any>;
  // Datos de análisis
  sentiment?: Record<string, any>;
  historical?: Record<string, any>;
  technical?: Record<string, any>;
  news?: Record<string, any>;
  macro?: Record<string, any>;
}

export interface VerifyPredictionData {
  actualPrice: number;
  actualChange: number;
  actualDirection: 'up' | 'down' | 'neutral';
  directionCorrect: boolean;
  withinRange: boolean;
  priceError: number;
  changeAccuracy: number;
  accuracyScore: number;
  quality: 'excellent' | 'good' | 'poor' | 'very_poor' | 'failed';
  // Bonus por alcanzar objetivo durante el período
  targetReached?: boolean;
  targetReachedAt?: Date;
  periodHigh?: number;
  periodLow?: number;
}

export interface PredictionStats {
  total: number;
  verified: number;
  pending: number;
  active: number;
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
  byConfidence: {
    high: { total: number; accuracy: number };
    medium: { total: number; accuracy: number };
    low: { total: number; accuracy: number };
  };
}

// ============================================================================
// REPOSITORIO
// ============================================================================

export const predictionRepository = {
  /**
   * Crear una nueva predicción
   * @param data - Datos de la predicción
   * @param data.predictionType - 'close' para cierre del día, 'open_next_day' para apertura del día siguiente
   */
  async create(data: CreatePredictionData): Promise<Prediction> {
    const timeframeDays = data.timeframeDays || 1;
    const predictionType = data.predictionType || 'close';
    const now = new Date();
    let expiresAt: Date;
    
    if (predictionType === 'open_next_day') {
      // Predicción para la apertura del día siguiente
      expiresAt = calculateNextDayOpen(data.symbol, data.assetType, data.asset);
    } else if (timeframeDays === 1) {
      // Para predicciones intradía (cierre de hoy) usar el nuevo servicio que detecta
      // el tipo de mercado (commodities, forex, stocks) y aplica el horario correcto
      expiresAt = calculateIntradayExpiry(data.symbol, data.assetType, data.asset);
    } else {
      // Para predicciones de más días: usar horario específico del mercado
      const marketType = detectMarketType(data.symbol, data.asset);
      const closeTime = getMarketCloseTime(marketType);
      
      expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + timeframeDays);
      expiresAt.setUTCHours(closeTime.hourUTC, closeTime.minuteUTC, 0, 0);
      
      // Ajustar a día hábil si es acción y no es commodity/forex (24h)
      if (data.assetType === 'stock' && !closeTime.isNearlyAlwaysOpen) {
        const day = expiresAt.getDay();
        if (day === 0) expiresAt.setDate(expiresAt.getDate() + 1);
        if (day === 6) expiresAt.setDate(expiresAt.getDate() + 2);
      }
    }

    const targetPrice = data.targetPrice || 
      data.currentPrice * (1 + data.predictedChange / 100);

    return prisma.prediction.create({
      data: {
        symbol: data.symbol,
        asset: data.asset,
        assetType: data.assetType,
        timeframe: data.timeframe,
        timeframeDays,
        predictionType,
        direction: data.direction,
        predictedChange: data.predictedChange,
        confidence: data.confidence,
        currentPrice: data.currentPrice,
        targetPrice,
        predictedPriceMin: data.predictedPriceMin,
        predictedPriceMax: data.predictedPriceMax,
        currency: data.currency || 'EUR',
        volatility: data.volatility,
        volatilityCategory: data.volatilityCategory,
        expiresAt,
        factorBreakdown: data.factorBreakdown ? JSON.stringify(data.factorBreakdown) : null,
        factorWeights: data.factorWeights ? JSON.stringify(data.factorWeights) : null,
        reasoning: data.reasoning,
        uncertaintyScore: data.uncertaintyScore,
        uncertaintyData: data.uncertaintyData ? JSON.stringify(data.uncertaintyData) : null,
        sentimentData: data.sentiment ? JSON.stringify(data.sentiment) : null,
        historicalData: data.historical ? JSON.stringify(data.historical) : null,
        technicalData: data.technical ? JSON.stringify(data.technical) : null,
        newsData: data.news ? JSON.stringify(data.news) : null,
        macroData: data.macro ? JSON.stringify(data.macro) : null,
      },
    });
  },

  /**
   * Buscar predicción reciente duplicada (mismo symbol el mismo día)
   * Solo permite UNA predicción por activo por día calendario
   */
  async findRecentDuplicate(symbol: string, _timeframeDays: number): Promise<Prediction | null> {
    // Inicio del día actual (00:00)
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    return prisma.prediction.findFirst({
      where: {
        symbol: symbol.toUpperCase(),
        // Ya no filtramos por timeframeDays - solo 1 predicción por día por símbolo
        createdAt: { gte: startOfDay },
        verified: false, // Solo predicciones no verificadas
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Obtener predicción por ID
   */
  async findById(id: string): Promise<Prediction | null> {
    return prisma.prediction.findUnique({ where: { id } });
  },

  /**
   * Obtener todas las predicciones con paginación
   */
  async findAll(options: {
    limit?: number;
    offset?: number;
    verified?: boolean;
    symbol?: string;
  } = {}): Promise<{ predictions: Prediction[]; total: number }> {
    const { limit = 50, offset = 0, verified, symbol } = options;
    
    const where: any = {};
    if (verified !== undefined) where.verified = verified;
    if (symbol) where.symbol = symbol.toUpperCase();

    const [predictions, total] = await Promise.all([
      prisma.prediction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.prediction.count({ where }),
    ]);

    return { predictions, total };
  },

  /**
   * Obtener predicciones por símbolo
   */
  async findBySymbol(symbol: string, limit = 10): Promise<Prediction[]> {
    return prisma.prediction.findMany({
      where: { symbol: symbol.toUpperCase() },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  },

  /**
   * Obtener predicciones pendientes de verificar
   * Incluye:
   * - Predicciones ya expiradas (expiresAt <= ahora)
   * - Predicciones que expiran en fin de semana cuando el mercado ya cerró (viernes 4 PM ET)
   */
  async findPendingVerification(): Promise<Prediction[]> {
    // Obtener todas las predicciones no verificadas
    const unverified = await prisma.prediction.findMany({
      where: { verified: false },
      orderBy: { expiresAt: 'asc' },
    });
    
    // Filtrar las que ya pueden verificarse (expiradas O mercado cerrado para fin de semana)
    // Pasar createdAt para evitar verificar predicciones hechas después del cierre
    return unverified.filter(p => isMarketClosedForPrediction(p.expiresAt, p.createdAt));
  },

  /**
   * Obtener predicciones activas (no expiradas y mercado aún no cerrado)
   */
  async findActive(): Promise<Prediction[]> {
    // Obtener todas las predicciones no verificadas
    const unverified = await prisma.prediction.findMany({
      where: { verified: false },
      orderBy: { expiresAt: 'asc' },
    });
    
    // Filtrar las que aún están activas (mercado no ha cerrado para ellas)
    return unverified.filter(p => !isMarketClosedForPrediction(p.expiresAt, p.createdAt));
  },

  /**
   * Obtener predicciones verificadas para entrenamiento
   */
  async findVerified(limit = 100): Promise<Prediction[]> {
    return prisma.prediction.findMany({
      where: { verified: true },
      orderBy: { verifiedAt: 'desc' },
      take: limit,
    });
  },

  /**
   * Verificar una predicción con resultado real
   */
  async verify(id: string, data: VerifyPredictionData): Promise<Prediction> {
    return prisma.prediction.update({
      where: { id },
      data: {
        verified: true,
        verifiedAt: new Date(),
        actualPrice: data.actualPrice,
        actualChange: data.actualChange,
        actualDirection: data.actualDirection,
        directionCorrect: data.directionCorrect,
        withinRange: data.withinRange,
        priceError: data.priceError,
        changeAccuracy: data.changeAccuracy,
        accuracyScore: data.accuracyScore,
        quality: data.quality,
        targetReached: data.targetReached,
        targetReachedAt: data.targetReachedAt,
        periodHigh: data.periodHigh,
        periodLow: data.periodLow,
      },
    });
  },

  /**
   * Actualizar solo scores de una predicción (para recálculos)
   */
  async updateScores(
    id: string,
    data: {
      accuracyScore: number;
      quality: string;
      directionCorrect?: boolean;
      actualDirection?: 'up' | 'down' | 'neutral';
    }
  ): Promise<Prediction> {
    return prisma.prediction.update({
      where: { id },
      data: {
        accuracyScore: data.accuracyScore,
        quality: data.quality,
        ...(data.directionCorrect !== undefined ? { directionCorrect: data.directionCorrect } : {}),
        ...(data.actualDirection ? { actualDirection: data.actualDirection } : {}),
      },
    });
  },

  /**
   * Obtener estadísticas completas de predicciones
   */
  async getStats(): Promise<PredictionStats> {
    // Obtener predicciones no verificadas para calcular pending/active con lógica de mercado
    const unverified = await prisma.prediction.findMany({
      where: { verified: false },
      select: { expiresAt: true, createdAt: true },
    });
    
    const pendingCount = unverified.filter(p => isMarketClosedForPrediction(p.expiresAt, p.createdAt)).length;
    const activeCount = unverified.filter(p => !isMarketClosedForPrediction(p.expiresAt, p.createdAt)).length;
    
    const [total, verified] = await Promise.all([
      prisma.prediction.count(),
      prisma.prediction.count({ where: { verified: true } }),
    ]);

    // Estadísticas de verificadas
    const verifiedPredictions = await prisma.prediction.findMany({
      where: { verified: true },
      select: {
        direction: true,
        directionCorrect: true,
        accuracyScore: true,
        priceError: true,
        withinRange: true,
        quality: true,
        confidence: true,
      },
    });

    // Calcular métricas EXCLUYENDO predicciones laterales/neutral
    // Las laterales no cuentan para accuracy ("sin señal clara")
    const directionalPredictions = verifiedPredictions.filter(p => p.direction !== 'neutral');
    const correctDirection = directionalPredictions.filter(p => p.directionCorrect).length;
    const withinRangeCount = verifiedPredictions.filter(p => p.withinRange).length;
    const avgAccuracyScore = directionalPredictions.length > 0
      ? directionalPredictions.reduce((sum, p) => sum + (p.accuracyScore || 0), 0) / directionalPredictions.length
      : 0;
    const avgPriceError = verifiedPredictions.length > 0
      ? verifiedPredictions.reduce((sum, p) => sum + (p.priceError || 0), 0) / verifiedPredictions.length
      : 0;

    // Por calidad
    // Fusionar 'poor' y 'very_poor' en un solo campo 'poor' para simplificar stats
    const byQuality = {
      excellent: verifiedPredictions.filter(p => p.quality === 'excellent').length,
      good: verifiedPredictions.filter(p => p.quality === 'good').length,
      poor: verifiedPredictions.filter(p => p.quality === 'poor' || p.quality === 'very_poor').length,
      failed: verifiedPredictions.filter(p => p.quality === 'failed').length,
    };

    // Por dirección
    const upPredictions = verifiedPredictions.filter(p => p.direction === 'up');
    const downPredictions = verifiedPredictions.filter(p => p.direction === 'down');
    const neutralPredictions = verifiedPredictions.filter(p => p.direction === 'neutral');
    
    const byDirection = {
      up: { 
        total: upPredictions.length, 
        correct: upPredictions.filter(p => p.directionCorrect).length 
      },
      down: { 
        total: downPredictions.length, 
        correct: downPredictions.filter(p => p.directionCorrect).length 
      },
      neutral: { 
        total: neutralPredictions.length, 
        correct: neutralPredictions.filter(p => p.directionCorrect).length 
      },
    };

    // Por confianza
    const highConfidence = verifiedPredictions.filter(p => p.confidence >= 70);
    const mediumConfidence = verifiedPredictions.filter(p => p.confidence >= 50 && p.confidence < 70);
    const lowConfidence = verifiedPredictions.filter(p => p.confidence < 50);

    const byConfidence = {
      high: {
        total: highConfidence.length,
        accuracy: highConfidence.length > 0
          ? highConfidence.filter(p => p.directionCorrect).length / highConfidence.length * 100
          : 0,
      },
      medium: {
        total: mediumConfidence.length,
        accuracy: mediumConfidence.length > 0
          ? mediumConfidence.filter(p => p.directionCorrect).length / mediumConfidence.length * 100
          : 0,
      },
      low: {
        total: lowConfidence.length,
        accuracy: lowConfidence.length > 0
          ? lowConfidence.filter(p => p.directionCorrect).length / lowConfidence.length * 100
          : 0,
      },
    };

    return {
      total,
      verified: verifiedPredictions.length,
      pending: pendingCount,
      active: activeCount,
      directionAccuracy: directionalPredictions.length > 0 
        ? (correctDirection / directionalPredictions.length) * 100 
        : 0,
      avgAccuracyScore,
      avgPriceError,
      withinRangeRate: verifiedPredictions.length > 0
        ? (withinRangeCount / verifiedPredictions.length) * 100
        : 0,
      byQuality,
      byDirection,
      byConfidence,
    };
  },

  /**
   * Eliminar predicción por ID
   */
  async delete(id: string): Promise<void> {
    await prisma.prediction.delete({ where: { id } });
  },

  /**
   * Eliminar predicciones antiguas verificadas
   */
  async deleteOld(olderThan: Date): Promise<number> {
    const result = await prisma.prediction.deleteMany({
      where: {
        createdAt: { lt: olderThan },
        verified: true,
      },
    });
    return result.count;
  },

  /**
   * Limpiar todas las predicciones (para testing)
   */
  async clear(): Promise<number> {
    const result = await prisma.prediction.deleteMany();
    return result.count;
  },

  /**
   * Importar predicciones en masa (para migración desde AsyncStorage)
   */
  async importBulk(predictions: any[]): Promise<{ imported: number; errors: string[] }> {
    let imported = 0;
    const errors: string[] = [];

    // Log para debug
    if (predictions.length > 0) {
      const sample = predictions[0];
      const parsed = typeof sample === 'string' ? JSON.parse(sample) : sample;
      const hasAccuracy = parsed.accuracyScore !== undefined && parsed.accuracyScore !== null;
      console.log('[Import] Sample prediction:', {
        id: parsed.id,
        symbol: parsed.symbol,
        verified: parsed.verified,
        hasAccuracyScore: hasAccuracy,
        willBeVerified: parsed.verified === true || hasAccuracy,
        accuracyScore: parsed.accuracyScore,
        quality: parsed.quality,
        actualPrice: parsed.actualPrice,
        rawType: typeof sample,
      });
      
      // Contar cuántas tienen accuracy
      let withAccuracy = 0;
      for (const pred of predictions.slice(0, 50)) {
        const p = typeof pred === 'string' ? JSON.parse(pred) : pred;
        if (p.accuracyScore !== undefined && p.accuracyScore !== null) withAccuracy++;
      }
      console.log(`[Import] De las primeras 50, ${withAccuracy} tienen accuracyScore (serán marcadas como verificadas)`);
    }

    for (const p of predictions) {
      try {
        // Parsear datos si vienen como string (del AsyncStorage)
        const prediction = typeof p === 'string' ? JSON.parse(p) : p;
        
        // Convertir fechas
        const createdAt = prediction.createdAt ? new Date(prediction.createdAt) : new Date();
        const expiresAt = prediction.expiresAt ? new Date(prediction.expiresAt) : new Date();
        
        // IMPORTANTE: Si tiene accuracyScore, considerarla como verificada
        // aunque verified sea false (bug en el frontend original)
        const hasAccuracyData = prediction.accuracyScore !== undefined && prediction.accuracyScore !== null;
        const isVerified = prediction.verified === true || hasAccuracyData;
        const verifiedAt = prediction.verifiedAt 
          ? new Date(prediction.verifiedAt) 
          : (hasAccuracyData ? new Date(prediction.expiresAt || prediction.createdAt) : null);
        
        // Usar upsert para evitar duplicados si se importa varias veces
        await prisma.prediction.upsert({
          where: { id: prediction.id },
          update: {
            // Actualizar si ya existe
            verified: isVerified,
            verifiedAt,
            actualPrice: prediction.actualPrice,
            actualChange: prediction.actualChange,
            actualDirection: prediction.actualDirection,
            directionCorrect: prediction.directionCorrect,
            withinRange: prediction.withinRange,
            priceError: prediction.priceError,
            changeAccuracy: prediction.changeAccuracy,
            accuracyScore: prediction.accuracyScore,
            quality: prediction.quality,
          },
          create: {
            id: prediction.id,
            symbol: prediction.symbol?.toUpperCase() || 'UNKNOWN',
            asset: prediction.asset || prediction.name || null,
            assetType: prediction.assetType || prediction.asset_type || 'stock',
            timeframe: prediction.timeframe || 'intraday',
            timeframeDays: prediction.timeframeDays || prediction.timeframe_days || 1,
            direction: prediction.direction || 'neutral',
            predictedChange: prediction.predictedChange || prediction.predicted_change || 0,
            confidence: prediction.confidence || 50,
            currentPrice: prediction.currentPrice || prediction.current_price || 0,
            targetPrice: prediction.targetPrice || prediction.target_price || 0,
            predictedPriceMin: prediction.predictedPriceMin || prediction.predicted_price_min || null,
            predictedPriceMax: prediction.predictedPriceMax || prediction.predicted_price_max || null,
            currency: prediction.currency || 'USD',
            volatility: prediction.volatility || null,
            volatilityCategory: prediction.volatilityCategory || prediction.volatility_category || null,
            factorBreakdown: prediction.factorBreakdown ? 
              (typeof prediction.factorBreakdown === 'string' ? prediction.factorBreakdown : JSON.stringify(prediction.factorBreakdown)) : null,
            factorWeights: prediction.factorWeights ?
              (typeof prediction.factorWeights === 'string' ? prediction.factorWeights : JSON.stringify(prediction.factorWeights)) : null,
            uncertaintyScore: prediction.uncertaintyScore || null,
            uncertaintyData: prediction.uncertaintyData ?
              (typeof prediction.uncertaintyData === 'string' ? prediction.uncertaintyData : JSON.stringify(prediction.uncertaintyData)) : null,
            createdAt,
            expiresAt,
            verified: isVerified,
            verifiedAt,
            actualPrice: prediction.actualPrice || null,
            actualChange: prediction.actualChange || null,
            actualDirection: prediction.actualDirection || null,
            directionCorrect: prediction.directionCorrect ?? null,
            withinRange: prediction.withinRange ?? null,
            priceError: prediction.priceError || null,
            changeAccuracy: prediction.changeAccuracy || null,
            accuracyScore: prediction.accuracyScore || null,
            quality: prediction.quality || null,
          },
        });
        imported++;
      } catch (error: any) {
        const id = typeof p === 'string' ? 'unknown' : p.id || 'unknown';
        errors.push(`Error importing ${id}: ${error.message}`);
        console.error(`[Import] Error importing prediction:`, error.message);
      }
    }

    console.log(`[Import] Imported ${imported} predictions, ${errors.length} errors`);
    return { imported, errors };
  },
};
