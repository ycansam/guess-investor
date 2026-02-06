/**
 * Commodity Correlation Service
 * 
 * Los ETFs de commodities (oro, plata, etc.) siguen al futuro base.
 * - Plata: SI=F
 * - Oro: GC=F
 * - Petróleo: CL=F
 * - Gas: NG=F
 * 
 * Cuando se predice un ETF de commodity:
 * 1. Obtener el cambio % del día del futuro base desde Yahoo
 * 2. Usar esa dirección para el ETF
 */

import { logger } from '../../middleware/logger.js';
import { yahooService } from '../external/yahoo.service.js';

// ============================================================================
// TIPOS
// ============================================================================

export type CommodityType = 'gold' | 'silver' | 'platinum' | 'palladium' | 'oil' | 'gas' | 'other';

interface CachedDirection {
  direction: 'up' | 'down' | 'neutral';
  predictedChange: number;
  confidence: number;
  timestamp: number;
}

// ============================================================================
// FUTURO BASE POR COMMODITY
// ============================================================================

const BASE_FUTURES: Record<CommodityType, string> = {
  gold: 'GC=F',
  silver: 'SI=F',
  platinum: 'PL=F',
  palladium: 'PA=F',
  oil: 'CL=F',
  gas: 'NG=F',
  other: '',
};

// ============================================================================
// DETECCIÓN DE COMMODITY
// ============================================================================

const COMMODITY_PATTERNS: Record<CommodityType, RegExp[]> = {
  gold: [
    /\bgold\b/i, /\bgld\b/i, /\bxau/i, /\biau\b/i, /\bsgol\b/i,
    /\boro\b/i, /\bphau\b/i, /physical gold/i, /wisdomtree.*gold/i,
    /invesco.*gold/i, /ishares.*gold/i, /spdr.*gold/i, /xetra.*gold/i,
    /euwax.*gold/i, /amundi.*gold/i, /xtrackers.*gold/i,
    /\begln\b/i, /\bigln\b/i, /\bsgbs\b/i,
    /\bgc=f\b/i, // El propio futuro
  ],
  silver: [
    /\bsilver\b/i, /\bslv\b/i, /\bxag/i, /\bphag\b/i, /\bsivr\b/i,
    /\bplata\b/i, /physical silver/i, /wisdomtree.*silver/i,
    /ishares.*silver/i, /sprott.*silver/i, /xtrackers.*silver/i,
    /\bssln\b/i, /\bisln\b/i, /\bslvp\b/i,
    /\bsi=f\b/i, // El propio futuro
  ],
  platinum: [
    /\bplatinum\b/i, /\bpplt\b/i, /\bxpt/i, /\bplatino\b/i,
    /physical platinum/i, /wisdomtree.*platinum/i, /\bphpt\b/i,
    /\bpl=f\b/i,
  ],
  palladium: [
    /\bpalladium\b/i, /\bpall\b/i, /\bxpd/i, /\bpaladio\b/i,
    /physical palladium/i, /wisdomtree.*palladium/i, /\bphpm\b/i,
    /\bpa=f\b/i,
  ],
  oil: [
    /\boil\b/i, /\bcrude\b/i, /\bbrent\b/i, /\bwti\b/i, /\buso\b/i,
    /\bpetroleo\b/i, /\bpetróleo\b/i, /crude oil/i,
    /\bcl=f\b/i, /\bbz=f\b/i,
  ],
  gas: [
    /\bnatural gas\b/i, /\bung\b/i, /\bboil\b/i,
    /\bng=f\b/i, /\bngas\b/i,
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

/**
 * Verifica si el símbolo es el futuro base de su commodity
 */
function isBaseFuture(symbol: string): boolean {
  const upperSymbol = symbol.toUpperCase();
  return Object.values(BASE_FUTURES).some(f => f && upperSymbol === f);
}

// ============================================================================
// CACHE DE DIRECCIÓN DEL FUTURO BASE (30 minutos)
// ============================================================================

const baseDirectionCache = new Map<CommodityType, CachedDirection>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutos

function getCachedDirection(commodityType: CommodityType): CachedDirection | null {
  const cached = baseDirectionCache.get(commodityType);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached;
  }
  return null;
}

function setCachedDirection(commodityType: CommodityType, direction: 'up' | 'down' | 'neutral', predictedChange: number, confidence: number): void {
  baseDirectionCache.set(commodityType, {
    direction,
    predictedChange,
    confidence,
    timestamp: Date.now(),
  });
}

function getCommodityName(type: CommodityType): string {
  const names: Record<CommodityType, string> = {
    gold: 'Oro',
    silver: 'Plata',
    platinum: 'Platino',
    palladium: 'Paladio',
    oil: 'Petróleo',
    gas: 'Gas Natural',
    other: 'Commodity',
  };
  return names[type];
}

// ============================================================================
// SERVICE
// ============================================================================

export const commodityCorrelationService = {
  /**
   * Registra la dirección del futuro base para un commodity.
   * Llamar esto cuando se calcula la predicción del futuro (SI=F, GC=F, etc.)
   */
  registerBaseFutureDirection(
    symbol: string,
    assetName: string,
    direction: 'up' | 'down' | 'neutral',
    predictedChange: number,
    confidence: number
  ): void {
    const commodityType = detectCommodityType(symbol, assetName);
    if (!commodityType) return;
    
    // Solo registrar si es el futuro base
    if (isBaseFuture(symbol)) {
      setCachedDirection(commodityType, direction, predictedChange, confidence);
      logger.info(`[CommodityCorr] Registrado futuro base ${symbol} (${commodityType}): ${direction} ${predictedChange.toFixed(2)}%`);
    }
  },

  /**
   * Ajusta la predicción de un ETF de commodity para seguir al futuro base.
   * Si no hay caché, obtiene el cambio actual del futuro base desde Yahoo.
   */
  async adjustPrediction(
    symbol: string,
    assetName: string,
    direction: 'up' | 'down' | 'neutral',
    predictedChange: number,
    confidence: number
  ): Promise<{ 
    adjusted: boolean;
    newDirection: 'up' | 'down' | 'neutral';
    newChange: number;
    newConfidence: number;
    reason: string | null;
  }> {
    const commodityType = detectCommodityType(symbol, assetName);
    
    // No es un commodity → no ajustar
    if (!commodityType) {
      return { 
        adjusted: false, 
        newDirection: direction, 
        newChange: predictedChange, 
        newConfidence: confidence, 
        reason: null 
      };
    }
    
    // Si ES el futuro base, registrar su dirección y no ajustar
    if (isBaseFuture(symbol)) {
      setCachedDirection(commodityType, direction, predictedChange, confidence);
      return { 
        adjusted: false, 
        newDirection: direction, 
        newChange: predictedChange, 
        newConfidence: confidence, 
        reason: null 
      };
    }
    
    // Es un ETF de commodity → buscar dirección del futuro base
    let baseDirection = getCachedDirection(commodityType);
    
    // Si no hay caché, obtener el cambio actual del futuro base
    if (!baseDirection) {
      const baseFuture = BASE_FUTURES[commodityType];
      if (baseFuture) {
        try {
          logger.info(`[CommodityCorr] ${symbol}: Obteniendo dirección de ${baseFuture}...`);
          const quote = await yahooService.getQuote(baseFuture);
          if (quote) {
            const futureChange = quote.regularMarketChangePercent ?? quote.changePercent ?? 0;
            const futureDirection: 'up' | 'down' | 'neutral' = 
              futureChange > 0.3 ? 'up' : futureChange < -0.3 ? 'down' : 'neutral';
            
            setCachedDirection(commodityType, futureDirection, futureChange, 70);
            baseDirection = { direction: futureDirection, predictedChange: futureChange, confidence: 70, timestamp: Date.now() };
            
            logger.info(`[CommodityCorr] ${baseFuture} cambio hoy: ${futureChange.toFixed(2)}% → dirección: ${futureDirection}`);
          }
        } catch (error) {
          logger.warn(`[CommodityCorr] Error obteniendo ${baseFuture}: ${error}`);
        }
      }
    }
    
    if (!baseDirection) {
      // No pudimos obtener dirección del futuro base
      logger.debug(`[CommodityCorr] ${symbol}: No se pudo obtener dirección del futuro base`);
      return { 
        adjusted: false, 
        newDirection: direction, 
        newChange: predictedChange, 
        newConfidence: confidence, 
        reason: null 
      };
    }
    
    // Hay dirección del futuro base → verificar si coincide
    const needsAdjustment = (
      (direction === 'up' && baseDirection.direction === 'down') ||
      (direction === 'down' && baseDirection.direction === 'up')
    );
    
    if (!needsAdjustment) {
      // Misma dirección, todo OK
      return { 
        adjusted: false, 
        newDirection: direction, 
        newChange: predictedChange, 
        newConfidence: confidence, 
        reason: null 
      };
    }
    
    // CONFLICTO: El ETF va en dirección opuesta al futuro base → corregir
    const commodityName = getCommodityName(commodityType);
    const baseFuture = BASE_FUTURES[commodityType];
    
    const newDirection = baseDirection.direction;
    // Ajustar el cambio: usar el signo del futuro base con magnitud del ETF
    const sign = baseDirection.direction === 'up' ? 1 : baseDirection.direction === 'down' ? -1 : 0;
    const newChange = sign * Math.abs(predictedChange);
    
    const reason = `Ajustado para seguir al ${commodityName} (${baseFuture}): ${baseDirection.direction === 'up' ? '📈' : '📉'} ${baseDirection.predictedChange.toFixed(2)}%`;
    
    logger.info(`[CommodityCorr] ${symbol}: Corregido para seguir ${baseFuture}. ` +
               `Original: ${direction} ${predictedChange.toFixed(2)}% → Corregido: ${newDirection} ${newChange.toFixed(2)}%`);
    
    return { 
      adjusted: true, 
      newDirection, 
      newChange, 
      newConfidence: confidence, 
      reason 
    };
  },

  /**
   * Obtiene el símbolo del futuro base para un commodity
   */
  getBaseFuture(commodityType: CommodityType): string {
    return BASE_FUTURES[commodityType] || '';
  },

  /**
   * Verifica si un activo es un commodity
   */
  isCommodity(symbol: string, assetName?: string): boolean {
    return detectCommodityType(symbol, assetName) !== null;
  },

  /**
   * Obtiene estadísticas del cache
   */
  getStats(): { commodityType: string; direction: string; baseFuture: string; age: string }[] {
    const stats: { commodityType: string; direction: string; baseFuture: string; age: string }[] = [];
    const now = Date.now();
    
    for (const [type, data] of baseDirectionCache.entries()) {
      if (now - data.timestamp < CACHE_TTL) {
        const ageMinutes = Math.round((now - data.timestamp) / 60000);
        stats.push({
          commodityType: type,
          direction: `${data.direction} ${data.predictedChange.toFixed(2)}%`,
          baseFuture: BASE_FUTURES[type],
          age: `${ageMinutes}min`,
        });
      }
    }
    return stats;
  },

  /**
   * Limpia el cache
   */
  clearCache(): void {
    baseDirectionCache.clear();
    logger.info('[CommodityCorr] Cache cleared');
  },
};
