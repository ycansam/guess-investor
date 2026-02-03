/**
 * Commodity Underlying Service
 * 
 * Mapea ETFs/ETCs de commodities a su subyacente real.
 * Para predicciones de ETFs de oro/plata/etc., usa los datos del commodity
 * subyacente (GC=F, SI=F, XAU, XAG) en lugar del ETF individual.
 * 
 * Esto garantiza que todos los ETFs del mismo commodity tengan
 * la misma predicción de dirección.
 */

import { logger } from '../../middleware/logger.js';
import { TechnicalAnalysis, technicalService } from '../external/technical.service.js';
import { yahooService } from '../external/yahoo.service.js';

// ============================================================================
// TIPOS
// ============================================================================

export type CommodityType = 'gold' | 'silver' | 'platinum' | 'palladium' | 'oil_wti' | 'oil_brent' | 'natural_gas';

export interface UnderlyingInfo {
  commodityType: CommodityType;
  underlyingSymbol: string;      // Símbolo del subyacente (GC=F, SI=F, etc.)
  underlyingName: string;        // Nombre legible
  etfCurrency: string;           // Divisa del ETF original
  underlyingCurrency: string;    // Divisa del subyacente (normalmente USD)
}

export interface UnderlyingData {
  symbol: string;
  price: number;
  change1d: number;
  change5d: number;
  change30d: number;
  technical: TechnicalAnalysis;
  timestamp: number;
}

// ============================================================================
// MAPEO DE SUBYACENTES
// ============================================================================

// Símbolo principal para cada commodity
const UNDERLYING_SYMBOLS: Record<CommodityType, { symbol: string; name: string; currency: string }> = {
  gold: { symbol: 'GC=F', name: 'Gold Futures', currency: 'USD' },
  silver: { symbol: 'SI=F', name: 'Silver Futures', currency: 'USD' },
  platinum: { symbol: 'PL=F', name: 'Platinum Futures', currency: 'USD' },
  palladium: { symbol: 'PA=F', name: 'Palladium Futures', currency: 'USD' },
  oil_wti: { symbol: 'CL=F', name: 'WTI Crude Oil Futures', currency: 'USD' },
  oil_brent: { symbol: 'BZ=F', name: 'Brent Crude Oil Futures', currency: 'USD' },
  natural_gas: { symbol: 'NG=F', name: 'Natural Gas Futures', currency: 'USD' },
};

// Patrones para detectar el tipo de commodity
const COMMODITY_PATTERNS: Record<CommodityType, RegExp[]> = {
  gold: [
    /\bgold\b/i, /\bgld\b/i, /\bxau/i, /\biau\b/i, /\bsgol\b/i,
    /\boro\b/i, /\bphau\b/i, /physical gold/i, /wisdomtree.*gold/i,
    /invesco.*gold/i, /ishares.*gold/i, /spdr.*gold/i, /xetra.*gold/i,
    /euwax.*gold/i, /amundi.*gold/i, /xtrackers.*gold/i,
    /\b4gld\b/i, /\begln\b/i, /\bppfb\b/i, /\bsgld\b/i, /\bwgld\b/i,
  ],
  silver: [
    /\bsilver\b/i, /\bslv\b/i, /\bxag/i, /\bphag\b/i, /\bsivr\b/i,
    /\bplata\b/i, /physical silver/i, /wisdomtree.*silver/i,
    /ishares.*silver/i, /sprott.*silver/i, /xtrackers.*silver/i,
    /\bssln\b/i, /\bisln\b/i,
  ],
  platinum: [
    /\bplatinum\b/i, /\bpplt\b/i, /\bxpt/i, /\bplatino\b/i,
    /physical platinum/i, /wisdomtree.*platinum/i,
    /\bphpt\b/i,
  ],
  palladium: [
    /\bpalladium\b/i, /\bpall\b/i, /\bxpd/i, /\bpaladio\b/i,
    /physical palladium/i, /wisdomtree.*palladium/i,
    /\bphpd\b/i,
  ],
  oil_wti: [
    /\bwti\b/i, /west texas/i, /\buso\b/i, /crude oil(?!.*brent)/i,
  ],
  oil_brent: [
    /\bbrent\b/i, /\bbno\b/i, /brent.*crude/i, /\bcrud\b/i,
  ],
  natural_gas: [
    /\bnatural gas\b/i, /\bung\b/i, /\bboil\b/i, /\bgas\b.*\betf\b/i,
  ],
};

// Detectar divisa del ETF por sufijo de mercado
const MARKET_CURRENCIES: Record<string, string> = {
  '.L': 'GBP',    // Londres (aunque muchos ETCs cotizan en USD)
  '.MI': 'EUR',   // Milán
  '.DE': 'EUR',   // Alemania
  '.PA': 'EUR',   // París
  '.AS': 'EUR',   // Ámsterdam
  '.MC': 'EUR',   // Madrid
  '.SW': 'CHF',   // Suiza
};

// ============================================================================
// CACHE
// ============================================================================

const underlyingCache = new Map<string, { data: UnderlyingData; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

// ============================================================================
// SERVICE
// ============================================================================

export const commodityUnderlyingService = {
  /**
   * Detecta si un activo es un ETF/ETC de commodity y devuelve info del subyacente
   */
  detectUnderlying(symbol: string, assetName?: string): UnderlyingInfo | null {
    const searchText = `${symbol} ${assetName || ''}`.toLowerCase();
    
    // No aplicar a futuros directos (ya son el subyacente)
    if (symbol.endsWith('=F') || symbol.endsWith('=X')) {
      return null;
    }
    
    // Detectar tipo de commodity
    for (const [commodityType, patterns] of Object.entries(COMMODITY_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(searchText)) {
          const underlying = UNDERLYING_SYMBOLS[commodityType as CommodityType];
          
          // Detectar divisa del ETF
          let etfCurrency = 'USD';
          for (const [suffix, currency] of Object.entries(MARKET_CURRENCIES)) {
            if (symbol.includes(suffix)) {
              etfCurrency = currency;
              break;
            }
          }
          // Muchos ETCs en Londres cotizan en USD aunque tengan .L
          if (symbol.endsWith('.L') && (searchText.includes('usd') || searchText.includes('(usd)'))) {
            etfCurrency = 'USD';
          }
          
          return {
            commodityType: commodityType as CommodityType,
            underlyingSymbol: underlying.symbol,
            underlyingName: underlying.name,
            etfCurrency,
            underlyingCurrency: underlying.currency,
          };
        }
      }
    }
    
    return null;
  },

  /**
   * Obtiene los datos del subyacente (con cache)
   */
  async getUnderlyingData(commodityType: CommodityType): Promise<UnderlyingData | null> {
    const underlying = UNDERLYING_SYMBOLS[commodityType];
    const cacheKey = underlying.symbol;
    
    // Check cache
    const cached = underlyingCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      logger.debug(`[CommodityUnderlying] Using cached data for ${cacheKey}`);
      return cached.data;
    }
    
    try {
      // Obtener quote del subyacente
      const quote = await yahooService.getQuote(underlying.symbol);
      if (!quote?.price) {
        logger.warn(`[CommodityUnderlying] Could not get quote for ${underlying.symbol}`);
        return null;
      }
      
      // Obtener historial para cambios
      const history = await yahooService.getHistory(underlying.symbol, '1mo', '1d');
      let change1d = quote.changePercent || 0;
      let change5d = 0;
      let change30d = 0;
      
      if (history && history.length > 0) {
        const currentPrice = quote.price;
        if (history.length >= 5) {
          const price5d = history[history.length - 5]?.close;
          if (price5d) change5d = ((currentPrice - price5d) / price5d) * 100;
        }
        if (history.length >= 22) {
          const price30d = history[history.length - 22]?.close;
          if (price30d) change30d = ((currentPrice - price30d) / price30d) * 100;
        } else if (history.length > 0) {
          const priceOldest = history[0]?.close;
          if (priceOldest) change30d = ((currentPrice - priceOldest) / priceOldest) * 100;
        }
      }
      
      // Obtener análisis técnico del subyacente
      const technical = await technicalService.analyze(underlying.symbol);
      
      const data: UnderlyingData = {
        symbol: underlying.symbol,
        price: quote.price,
        change1d,
        change5d,
        change30d,
        technical,
        timestamp: Date.now(),
      };
      
      // Cache
      underlyingCache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL });
      
      logger.info(`[CommodityUnderlying] Fetched ${underlying.symbol}: price=${quote.price}, change1d=${change1d.toFixed(2)}%, technical=${technical.technicalScore}`);
      
      return data;
    } catch (error) {
      logger.error(`[CommodityUnderlying] Error fetching ${underlying.symbol}:`, error);
      return null;
    }
  },

  /**
   * Obtiene datos técnicos del subyacente para usar en predicción de ETF
   * Devuelve los indicadores técnicos del commodity real en lugar del ETF
   */
  async getTechnicalForETF(
    symbol: string, 
    assetName?: string
  ): Promise<{ 
    useUnderlying: boolean; 
    underlying?: UnderlyingInfo;
    underlyingData?: UnderlyingData;
    technical?: TechnicalAnalysis;
  }> {
    const underlyingInfo = this.detectUnderlying(symbol, assetName);
    
    if (!underlyingInfo) {
      return { useUnderlying: false };
    }
    
    const underlyingData = await this.getUnderlyingData(underlyingInfo.commodityType);
    
    if (!underlyingData) {
      logger.warn(`[CommodityUnderlying] Could not get underlying data for ${symbol}, falling back to ETF data`);
      return { useUnderlying: false };
    }
    
    logger.info(`[CommodityUnderlying] ${symbol} → Using ${underlyingInfo.underlyingSymbol} (${underlyingInfo.underlyingName}) data`);
    
    return {
      useUnderlying: true,
      underlying: underlyingInfo,
      underlyingData,
      technical: underlyingData.technical,
    };
  },

  /**
   * Ajusta el cambio predicho por diferencia de divisa
   * Si el ETF cotiza en EUR y el subyacente en USD, ajustar por movimiento EUR/USD
   */
  async adjustForCurrency(
    predictedChange: number,
    etfCurrency: string,
    underlyingCurrency: string
  ): Promise<{ adjustedChange: number; currencyImpact: number }> {
    if (etfCurrency === underlyingCurrency) {
      return { adjustedChange: predictedChange, currencyImpact: 0 };
    }
    
    try {
      // Obtener movimiento de la divisa
      // Si ETF en EUR y subyacente en USD, necesitamos EUR/USD
      const pair = `${etfCurrency}${underlyingCurrency}=X`;
      const quote = await yahooService.getQuote(pair);
      
      if (quote?.changePercent) {
        // Si EUR sube vs USD, el ETF en EUR debería subir menos que el subyacente en USD
        const currencyImpact = -quote.changePercent; // Invertido
        const adjustedChange = predictedChange + currencyImpact * 0.3; // 30% del impacto
        
        logger.debug(`[CommodityUnderlying] Currency adjustment: ${pair} ${quote.changePercent.toFixed(2)}% → impact ${currencyImpact.toFixed(2)}%`);
        
        return { adjustedChange, currencyImpact };
      }
    } catch (e) {
      logger.debug(`[CommodityUnderlying] Could not get currency data`);
    }
    
    return { adjustedChange: predictedChange, currencyImpact: 0 };
  },

  /**
   * Limpia el cache
   */
  clearCache(): void {
    underlyingCache.clear();
    logger.info('[CommodityUnderlying] Cache cleared');
  },

  /**
   * Verifica si un activo es un ETF de commodity
   */
  isCommodityETF(symbol: string, assetName?: string): boolean {
    return this.detectUnderlying(symbol, assetName) !== null;
  },
};
