/**
 * Market Hours Service (Backend)
 * Detecta horarios de apertura/cierre según el tipo de activo
 * Usado para calcular expiresAt de predicciones correctamente
 */

import { logger } from '../../middleware/logger.js';

// Prefijos comunes de ETCs de commodities (funcionan en cualquier bolsa)
const COMMODITY_ETC_PREFIXES = [
  // iShares Physical
  'PHAU', 'PHAG', 'PHPT', 'PHPM', 'PALL', 'IGLN', 'ISLN', 'IAUP', 'IAGP',
  // WisdomTree
  'WGLD', 'WSLV', 'WPLAT', 'WPALL', 'WOIL', 'WBRT', 'WNGA', 'WCOA', 'WCOB',
  'PHGP', 'PHSP', 'PHPP', 'PHPD', 'CRUD', 'BRNT', 'NGAS', 'APTS', 'AIGC',
  // Invesco/Source
  'SGLD', 'SGLP', 'SGLN', 'SSLV', 'SPLT', 'SPLA',
  // Xtrackers/DWS
  'XGLD', 'XSLV', 'XAD1', 'XAD2', 'XGDU',
  // Amundi
  'GLDA', 'SLVA', 'GLDM',
  // VanEck
  'VZLA', 'VZLC', 'GDX', 'GDXJ',
  // Gold Bullion Securities / ETF Securities
  'GBS', 'GBSS', 'ETFS', 'BULL', 'OILB', 'OILW',
  // Xetra-Gold y similares
  '4GLD', 'GZUR', 'EGLN',
  // Otros
  'ZGLD', 'CSGOLD', 'ZSILVER', 'ZSIL', 'OGZD', 'RICI',
];

// Palabras clave que indican commodities en el nombre del activo
const COMMODITY_KEYWORDS = [
  'GOLD', 'SILVER', 'PLATINUM', 'PALLADIUM', 'PRECIOUS',
  'ORO', 'PLATA', 'PLATINO', 'PALADIO',
  'OIL', 'CRUDE', 'BRENT', 'WTI', 'NATURAL GAS', 'PETROLEUM',
  'PETROLEO', 'CRUDO', 'GAS NATURAL',
  'COPPER', 'ALUMINUM', 'ZINC', 'NICKEL',
  'COBRE', 'ALUMINIO', 'NIQUEL',
  'COMMODITY', 'COMMODITIES', 'PHYSICAL', 'BULLION',
  'MATERIAS PRIMAS', 'RAW MATERIAL',
];

export type MarketType = 
  | 'us_stock'      // NYSE/NASDAQ: 9:30-16:00 ET
  | 'eu_stock'      // LSE/Euronext: 8:00-16:30 local
  | 'spain_stock'   // Madrid: 9:00-17:30
  | 'commodity'     // Commodities/ETCs: casi 24h (cierre viernes ~22:00 UTC)
  | 'crypto'        // 24/7
  | 'forex';        // Casi 24h (cierre viernes 22:00 UTC)

interface MarketCloseTime {
  hourUTC: number;
  minuteUTC: number;
  closesOnWeekend: boolean;
  isNearlyAlwaysOpen: boolean;
}

/**
 * Detecta si un símbolo es un ETC de commodities
 */
function isCommodityETC(symbol: string): boolean {
  const upperSymbol = symbol.toUpperCase();
  const ticker = upperSymbol.split('.')[0];
  
  return COMMODITY_ETC_PREFIXES.some(prefix => 
    ticker === prefix || ticker.startsWith(prefix)
  );
}

/**
 * Detecta si el nombre contiene palabras clave de commodities
 */
function isCommodityByName(assetName?: string): boolean {
  if (!assetName) return false;
  const upperName = assetName.toUpperCase();
  return COMMODITY_KEYWORDS.some(keyword => upperName.includes(keyword));
}

/**
 * Detecta si es crypto
 */
function isCrypto(symbol: string): boolean {
  const upperSymbol = symbol.toUpperCase();
  return (
    upperSymbol.endsWith('-USD') ||
    upperSymbol.endsWith('-EUR') ||
    upperSymbol.endsWith('-GBP') ||
    /^(BTC|ETH|SOL|XRP|DOGE|ADA|DOT|AVAX|MATIC|LINK|UNI|ATOM|LTC)$/i.test(upperSymbol)
  );
}

/**
 * Detecta si es forex o futuro de commodities
 */
function isForexOrFutures(symbol: string): boolean {
  const upperSymbol = symbol.toUpperCase();
  return upperSymbol.endsWith('=X') || upperSymbol.endsWith('=F');
}

/**
 * Detecta el tipo de mercado basándose en el símbolo y nombre
 */
export function detectMarketType(symbol: string, assetName?: string): MarketType {
  const upperSymbol = symbol.toUpperCase();
  
  // 1. Crypto - 24/7
  if (isCrypto(upperSymbol)) {
    return 'crypto';
  }
  
  // 2. Forex o Futuros
  if (isForexOrFutures(upperSymbol)) {
    return upperSymbol.endsWith('=F') ? 'commodity' : 'forex';
  }
  
  // 3. ETCs de commodities (cualquier bolsa)
  if (isCommodityETC(upperSymbol) || isCommodityByName(assetName)) {
    return 'commodity';
  }
  
  // 4. Por sufijo de bolsa
  if (upperSymbol.endsWith('.MC')) {
    return 'spain_stock';
  }
  
  if (upperSymbol.endsWith('.L') || 
      upperSymbol.endsWith('.PA') || 
      upperSymbol.endsWith('.DE') ||
      upperSymbol.endsWith('.MI') ||
      upperSymbol.endsWith('.AS') ||
      upperSymbol.endsWith('.SW')) {
    return 'eu_stock';
  }
  
  // Por defecto: US stock
  return 'us_stock';
}

/**
 * Obtiene la hora de cierre del mercado en UTC
 */
export function getMarketCloseTime(marketType: MarketType): MarketCloseTime {
  switch (marketType) {
    case 'crypto':
      // Crypto nunca cierra
      return { 
        hourUTC: 23, 
        minuteUTC: 59, 
        closesOnWeekend: false,
        isNearlyAlwaysOpen: true 
      };
      
    case 'commodity':
    case 'forex':
      // Commodities/Forex: cierra viernes ~22:00 UTC = 23:00 hora España (invierno)
      // Los ETCs de commodities también siguen este horario extendido
      return { 
        hourUTC: 22, 
        minuteUTC: 0, 
        closesOnWeekend: true,  // Solo sábado
        isNearlyAlwaysOpen: true 
      };
      
    case 'us_stock':
      // NYSE/NASDAQ: 16:00 ET = 21:00 UTC (invierno) / 20:00 UTC (verano)
      // Usamos 21:00 UTC para ser conservadores
      return { 
        hourUTC: 21, 
        minuteUTC: 0, 
        closesOnWeekend: true,
        isNearlyAlwaysOpen: false 
      };
      
    case 'spain_stock':
      // Madrid: 17:30 local = 16:30 UTC (invierno) / 15:30 UTC (verano)
      return { 
        hourUTC: 16, 
        minuteUTC: 30, 
        closesOnWeekend: true,
        isNearlyAlwaysOpen: false 
      };
      
    case 'eu_stock':
    default:
      // LSE/Euronext: ~16:30 local = 16:30 UTC (LSE) / 15:30-16:30 UTC (otros)
      return { 
        hourUTC: 16, 
        minuteUTC: 30, 
        closesOnWeekend: true,
        isNearlyAlwaysOpen: false 
      };
  }
}

/**
 * Calcula la fecha de expiración correcta para una predicción intradía
 * Considera el tipo de mercado y horarios específicos
 */
export function calculateIntradayExpiry(
  symbol: string, 
  assetType: string,
  assetName?: string
): Date {
  const now = new Date();
  const marketType = detectMarketType(symbol, assetName);
  const closeTime = getMarketCloseTime(marketType);
  
  logger.debug(`[MarketHours] ${symbol}: marketType=${marketType}, closeTime=${closeTime.hourUTC}:${closeTime.minuteUTC} UTC`);
  
  // Para crypto, usar fin del día
  if (marketType === 'crypto') {
    const expiry = new Date(now);
    expiry.setUTCHours(23, 59, 0, 0);
    // Si ya pasó, usar mañana
    if (now >= expiry) {
      expiry.setDate(expiry.getDate() + 1);
    }
    return expiry;
  }
  
  // Para commodities/forex con horario casi 24h
  if (closeTime.isNearlyAlwaysOpen) {
    const expiry = new Date(now);
    expiry.setUTCHours(closeTime.hourUTC, closeTime.minuteUTC, 0, 0);
    
    // Si ya pasó el cierre de hoy, usar mañana
    if (now >= expiry) {
      expiry.setDate(expiry.getDate() + 1);
    }
    
    // Commodities/Forex solo cierran sábado completo
    const day = expiry.getDay();
    if (day === 6) { // Sábado -> Domingo noche (apertura)
      // En realidad, la predicción debería verificarse el viernes cierre
      // Retroceder a viernes
      expiry.setDate(expiry.getDate() - 1);
    }
    
    return expiry;
  }
  
  // Para stocks regulares
  const expiry = new Date(now);
  expiry.setUTCHours(closeTime.hourUTC, closeTime.minuteUTC, 0, 0);
  
  // Si ya pasó el cierre de hoy, usar mañana
  if (now >= expiry) {
    expiry.setDate(expiry.getDate() + 1);
  }
  
  // Ajustar fines de semana para stocks
  if (closeTime.closesOnWeekend && assetType === 'stock') {
    const day = expiry.getDay();
    if (day === 0) expiry.setDate(expiry.getDate() + 1); // Domingo → Lunes
    if (day === 6) expiry.setDate(expiry.getDate() + 2); // Sábado → Lunes
  }
  
  return expiry;
}

/**
 * Verifica si el mercado está cerrado para verificar una predicción
 */
export function isMarketClosedForVerification(
  symbol: string,
  expiresAt: Date,
  assetName?: string
): boolean {
  const now = new Date();
  const marketType = detectMarketType(symbol, assetName);
  const closeTime = getMarketCloseTime(marketType);
  
  // Si ya expiró, el mercado cerró para esta predicción
  if (expiresAt <= now) {
    return true;
  }
  
  // Para crypto (24/7), solo verificar si expiró
  if (marketType === 'crypto') {
    return expiresAt <= now;
  }
  
  // Para commodities/forex con horario casi 24h
  if (closeTime.isNearlyAlwaysOpen) {
    const todayClose = new Date(now);
    todayClose.setUTCHours(closeTime.hourUTC, closeTime.minuteUTC, 0, 0);
    
    // Si la predicción expira hoy y ya pasó el cierre
    if (expiresAt.toDateString() === now.toDateString() && now >= todayClose) {
      return true;
    }
    
    // Si estamos en fin de semana (sábado), el viernes ya cerró
    if (now.getDay() === 6) {
      return true;
    }
    
    return false;
  }
  
  // Para stocks regulares
  const expiresDay = expiresAt.getDay();
  const isWeekend = expiresDay === 0 || expiresDay === 6;
  
  if (isWeekend) {
    // La predicción expira en fin de semana, verificar si el viernes cerró
    const lastFriday = new Date(expiresAt);
    while (lastFriday.getDay() !== 5) {
      lastFriday.setDate(lastFriday.getDate() - 1);
    }
    lastFriday.setUTCHours(closeTime.hourUTC, closeTime.minuteUTC, 0, 0);
    
    return now >= lastFriday;
  }
  
  // La predicción expira en día hábil
  const todayClose = new Date(expiresAt);
  todayClose.setUTCHours(closeTime.hourUTC, closeTime.minuteUTC, 0, 0);
  
  return now >= todayClose;
}

export const marketHoursService = {
  detectMarketType,
  getMarketCloseTime,
  calculateIntradayExpiry,
  isMarketClosedForVerification,
};

export default marketHoursService;
