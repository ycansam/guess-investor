import { MarketData } from '../types';

type AssetType = 'stock' | 'crypto';

interface YahooMeta {
  regularMarketPrice?: number;
  previousClose?: number;
  regularMarketVolume?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketOpen?: number;
  longName?: string;
  shortName?: string;
  symbol?: string;
  currency?: string;
}

/**
 * Crea un objeto MarketData desde datos de Yahoo Finance
 */
export function createMarketDataFromYahoo(
  symbol: string,
  meta: YahooMeta,
  _quote?: any,
  type: AssetType = 'stock'
): MarketData {
  const price = meta.regularMarketPrice || 0;
  const prevClose = meta.previousClose || 0;
  
  // Para criptos, mostrar nombre más limpio
  let displayName = meta.longName || meta.shortName || meta.symbol || symbol.toUpperCase();
  if (type === 'crypto') {
    // "Bitcoin USD" -> "Bitcoin"
    displayName = displayName.replace(/ USD$/, '');
  }

  return {
    symbol: symbol.toUpperCase(),
    name: displayName,
    price,
    change: price - prevClose,
    changePercent: prevClose ? ((price - prevClose) / prevClose * 100) : 0,
    volume: meta.regularMarketVolume,
    marketCap: undefined,
    lastUpdated: new Date(),
    high: meta.regularMarketDayHigh,
    low: meta.regularMarketDayLow,
    open: meta.regularMarketOpen,
    previousClose: prevClose,
    currency: meta.currency || 'USD',
  };
}
