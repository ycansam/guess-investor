import { MarketData } from '../types';

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
}

/**
 * Crea un objeto MarketData desde datos de Yahoo Finance
 */
export function createMarketDataFromYahoo(
  symbol: string,
  meta: YahooMeta,
  _quote?: any
): MarketData {
  const price = meta.regularMarketPrice || 0;
  const prevClose = meta.previousClose || 0;

  return {
    symbol: symbol.toUpperCase(),
    name: meta.longName || meta.shortName || meta.symbol || symbol.toUpperCase(),
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
  };
}
