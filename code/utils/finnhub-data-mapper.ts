import { MarketData } from '../types';

interface FinnhubQuoteData {
  c: number;  // Current price
  d: number;  // Change
  dp: number; // Change percent
  h: number;  // High
  l: number;  // Low
  o: number;  // Open
  pc: number; // Previous close
}

interface ConvertedPrices {
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
}

/**
 * Convierte precios de USD a otra moneda
 */
export function convertPrices(data: FinnhubQuoteData, rate: number): ConvertedPrices {
  return {
    price: data.c * rate,
    change: (data.d || 0) * rate,
    high: data.h * rate,
    low: data.l * rate,
    open: data.o * rate,
    prevClose: data.pc * rate,
    changePercent: data.dp || 0,
  };
}

/**
 * Crea un objeto MarketData desde datos de Finnhub
 */
export function createMarketDataFromFinnhub(
  symbol: string,
  name: string,
  data: FinnhubQuoteData,
  conversionRate: number = 1
): MarketData {
  const converted = convertPrices(data, conversionRate);

  return {
    symbol: symbol.toUpperCase(),
    name,
    price: converted.price,
    change: converted.change,
    changePercent: converted.changePercent,
    volume: undefined,
    marketCap: undefined,
    lastUpdated: new Date(),
    high: converted.high,
    low: converted.low,
    open: converted.open,
    previousClose: converted.prevClose,
  };
}
