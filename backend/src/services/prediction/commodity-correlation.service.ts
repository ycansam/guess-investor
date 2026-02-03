/**
 * Commodity Correlation Service
 * 
 * Asegura que los ETFs/ETCs del mismo subyacente (oro, plata, etc.)
 * tengan predicciones coherentes - no puede uno subir y otro bajar.
 * 
 * Si hay múltiples predicciones para el mismo commodity, se usa
 * el consenso ponderado por confianza.
 */

import { logger } from '../../middleware/logger.js';

// ============================================================================
// TIPOS
// ============================================================================

export type CommodityType = 'gold' | 'silver' | 'platinum' | 'palladium' | 'oil' | 'gas' | 'other';

export interface CommodityPrediction {
  symbol: string;
  commodityType: CommodityType;
  direction: 'up' | 'down' | 'neutral';
  predictedChange: number;
  confidence: number;
  timestamp: number;
}

interface ConsensusPrediction {
  direction: 'up' | 'down' | 'neutral';
  avgChange: number;
  avgConfidence: number;
  participantCount: number;
  strongestSignal: CommodityPrediction | null;
}

// ============================================================================
// DETECCIÓN DE COMMODITY
// ============================================================================

const COMMODITY_PATTERNS: Record<CommodityType, RegExp[]> = {
  gold: [
    /\bgold\b/i, /\bgld\b/i, /\bxau/i, /\biau\b/i, /\bsgol\b/i,
    /\boro\b/i, /\bphau\b/i, /physical gold/i, /wisdomtree.*gold/i,
    /invesco.*gold/i, /ishares.*gold/i, /spdr.*gold/i, /xetra.*gold/i,
    /euwax.*gold/i, /amundi.*gold/i, /xtrackers.*gold/i,
  ],
  silver: [
    /\bsilver\b/i, /\bslv\b/i, /\bxag/i, /\bphag\b/i, /\bsivr\b/i,
    /\bplata\b/i, /physical silver/i, /wisdomtree.*silver/i,
    /ishares.*silver/i, /sprott.*silver/i, /xtrackers.*silver/i,
  ],
  platinum: [
    /\bplatinum\b/i, /\bpplt\b/i, /\bxpt/i, /\bplatino\b/i,
    /physical platinum/i, /wisdomtree.*platinum/i,
  ],
  palladium: [
    /\bpalladium\b/i, /\bpall\b/i, /\bxpd/i, /\bpaladio\b/i,
    /physical palladium/i, /wisdomtree.*palladium/i,
  ],
  oil: [
    /\boil\b/i, /\bcrude\b/i, /\bbrent\b/i, /\bwti\b/i, /\buso\b/i,
    /\bpetroleo\b/i, /\bpetróleo\b/i, /crude oil/i,
  ],
  gas: [
    /\bgas\b/i, /\bnatural gas\b/i, /\bung\b/i, /\bboil\b/i,
  ],
  other: [],
};

/**
 * Detecta el tipo de commodity de un activo
 */
export function detectCommodityType(symbol: string, assetName?: string): CommodityType | null {
  const searchText = `${symbol} ${assetName || ''}`.toLowerCase();
  
  for (const [commodityType, patterns] of Object.entries(COMMODITY_PATTERNS)) {
    if (commodityType === 'other') continue;
    for (const pattern of patterns) {
      if (pattern.test(searchText)) {
        return commodityType as CommodityType;
      }
    }
  }
  
  return null;
}

// ============================================================================
// CACHE DE PREDICCIONES RECIENTES (últimos 5 minutos)
// ============================================================================

const recentPredictions = new Map<CommodityType, CommodityPrediction[]>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

function cleanExpiredPredictions() {
  const now = Date.now();
  for (const [type, predictions] of recentPredictions.entries()) {
    const valid = predictions.filter(p => now - p.timestamp < CACHE_TTL);
    if (valid.length > 0) {
      recentPredictions.set(type, valid);
    } else {
      recentPredictions.delete(type);
    }
  }
}

// ============================================================================
// SERVICE
// ============================================================================

export const commodityCorrelationService = {
  /**
   * Registra una predicción de commodity para usar en consenso
   */
  registerPrediction(
    symbol: string,
    assetName: string,
    direction: 'up' | 'down' | 'neutral',
    predictedChange: number,
    confidence: number
  ): void {
    const commodityType = detectCommodityType(symbol, assetName);
    if (!commodityType) return;
    
    cleanExpiredPredictions();
    
    const prediction: CommodityPrediction = {
      symbol,
      commodityType,
      direction,
      predictedChange,
      confidence,
      timestamp: Date.now(),
    };
    
    const existing = recentPredictions.get(commodityType) || [];
    // Evitar duplicados del mismo símbolo
    const filtered = existing.filter(p => p.symbol !== symbol);
    filtered.push(prediction);
    recentPredictions.set(commodityType, filtered);
    
    logger.debug(`[CommodityCorr] Registered ${symbol} (${commodityType}): ${direction} ${predictedChange.toFixed(2)}%`);
  },

  /**
   * Obtiene el consenso de predicciones para un commodity
   */
  getConsensus(commodityType: CommodityType): ConsensusPrediction | null {
    cleanExpiredPredictions();
    
    const predictions = recentPredictions.get(commodityType);
    if (!predictions || predictions.length === 0) return null;
    
    // Calcular promedio ponderado por confianza
    let totalWeight = 0;
    let weightedChangeSum = 0;
    let upVotes = 0;
    let downVotes = 0;
    let strongestSignal: CommodityPrediction | null = null;
    let strongestConfidence = 0;
    
    for (const pred of predictions) {
      const weight = pred.confidence / 100;
      totalWeight += weight;
      weightedChangeSum += pred.predictedChange * weight;
      
      if (pred.direction === 'up') upVotes += weight;
      else if (pred.direction === 'down') downVotes += weight;
      
      if (pred.confidence > strongestConfidence) {
        strongestConfidence = pred.confidence;
        strongestSignal = pred;
      }
    }
    
    const avgChange = totalWeight > 0 ? weightedChangeSum / totalWeight : 0;
    const avgConfidence = predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length;
    
    // Determinar dirección por consenso
    let direction: 'up' | 'down' | 'neutral' = 'neutral';
    if (upVotes > downVotes * 1.2) direction = 'up';
    else if (downVotes > upVotes * 1.2) direction = 'down';
    
    return {
      direction,
      avgChange,
      avgConfidence,
      participantCount: predictions.length,
      strongestSignal,
    };
  },

  /**
   * Ajusta una predicción según el consenso del commodity
   * Devuelve la predicción ajustada si hay conflicto con el consenso
   */
  adjustPrediction(
    symbol: string,
    assetName: string,
    direction: 'up' | 'down' | 'neutral',
    predictedChange: number,
    confidence: number
  ): { 
    adjusted: boolean;
    newDirection: 'up' | 'down' | 'neutral';
    newChange: number;
    newConfidence: number;
    reason: string | null;
  } {
    const commodityType = detectCommodityType(symbol, assetName);
    if (!commodityType) {
      return { adjusted: false, newDirection: direction, newChange: predictedChange, newConfidence: confidence, reason: null };
    }
    
    // Primero registrar esta predicción
    this.registerPrediction(symbol, assetName, direction, predictedChange, confidence);
    
    // Obtener consenso (incluyendo esta predicción)
    const consensus = this.getConsensus(commodityType);
    if (!consensus || consensus.participantCount < 2) {
      // No hay suficientes predicciones para consenso
      return { adjusted: false, newDirection: direction, newChange: predictedChange, newConfidence: confidence, reason: null };
    }
    
    // Detectar conflicto: esta predicción va contra el consenso
    const isConflicting = (
      (direction === 'up' && consensus.direction === 'down') ||
      (direction === 'down' && consensus.direction === 'up')
    );
    
    if (!isConflicting) {
      // No hay conflicto, mantener predicción original
      return { adjusted: false, newDirection: direction, newChange: predictedChange, newConfidence: confidence, reason: null };
    }
    
    // HAY CONFLICTO: Ajustar hacia el consenso
    const commodityName = commodityType === 'gold' ? 'Oro' : 
                         commodityType === 'silver' ? 'Plata' : 
                         commodityType === 'platinum' ? 'Platino' :
                         commodityType === 'palladium' ? 'Paladio' :
                         commodityType === 'oil' ? 'Petróleo' :
                         commodityType === 'gas' ? 'Gas Natural' : 'Commodity';
    
    // Usar el consenso como nueva predicción
    const newDirection = consensus.direction;
    // Promedio entre predicción original y consenso (dar más peso al consenso)
    const newChange = consensus.avgChange * 0.7 + predictedChange * 0.3;
    // Reducir confianza por el conflicto
    const newConfidence = Math.max(30, Math.min(confidence, consensus.avgConfidence) - 10);
    
    const reason = `Ajustado por coherencia con otros ETFs de ${commodityName} (${consensus.participantCount} activos). ` +
                  `Consenso: ${consensus.direction === 'up' ? '📈' : '📉'} ${consensus.avgChange.toFixed(2)}%`;
    
    logger.info(`[CommodityCorr] ${symbol}: Conflict with ${commodityType} consensus. ` +
               `Original: ${direction} ${predictedChange.toFixed(2)}% → Adjusted: ${newDirection} ${newChange.toFixed(2)}%`);
    
    return { adjusted: true, newDirection, newChange, newConfidence, reason };
  },

  /**
   * Verifica si un activo es un commodity trackeable
   */
  isCommodity(symbol: string, assetName?: string): boolean {
    return detectCommodityType(symbol, assetName) !== null;
  },

  /**
   * Obtiene estadísticas del cache
   */
  getStats(): { commodityType: string; count: number; latestDirection: string }[] {
    cleanExpiredPredictions();
    
    const stats: { commodityType: string; count: number; latestDirection: string }[] = [];
    for (const [type, predictions] of recentPredictions.entries()) {
      const consensus = this.getConsensus(type);
      stats.push({
        commodityType: type,
        count: predictions.length,
        latestDirection: consensus?.direction || 'neutral',
      });
    }
    return stats;
  },

  /**
   * Limpia el cache
   */
  clearCache(): void {
    recentPredictions.clear();
    logger.info('[CommodityCorr] Cache cleared');
  },
};
