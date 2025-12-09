import { MarketData } from '../types';

/**
 * Formatea los datos de mercado para mostrar en el prompt de la IA
 */
export function formatMarketDataForAI(
  quote: MarketData,
  currency: string,
  profile?: any,
  news?: any[]
): string {
  const displayName = quote.name || quote.symbol.toUpperCase();

  let dataString = `
📊 DATOS EN TIEMPO REAL DE ${displayName} (${quote.symbol.toUpperCase()}):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 Precio actual: ${currency}${quote.price?.toLocaleString() || 'N/A'}
📈 Cambio: ${quote.change >= 0 ? '+' : ''}${quote.change?.toFixed(2) || '0.00'} (${quote.changePercent >= 0 ? '+' : ''}${quote.changePercent?.toFixed(2) || '0.00'}%)
🔼 Máximo del día: ${currency}${quote.high?.toLocaleString() || 'N/A'}
🔽 Mínimo del día: ${currency}${quote.low?.toLocaleString() || 'N/A'}
🔓 Apertura: ${currency}${quote.open?.toLocaleString() || 'N/A'}
🔒 Cierre anterior: ${currency}${quote.previousClose?.toLocaleString() || 'N/A'}
${quote.volume ? `📊 Volumen: ${quote.volume.toLocaleString()}` : ''}
⏰ Actualizado: ${quote.lastUpdated.toLocaleTimeString()}
`;

  if (profile && profile.name) {
    dataString += `
🏢 PERFIL DE LA EMPRESA:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Nombre: ${profile.name}
Industria: ${profile.finnhubIndustry || 'N/A'}
País: ${profile.country || 'N/A'}
Cap. de Mercado: $${profile.marketCapitalization ? (profile.marketCapitalization / 1000).toFixed(2) + 'B' : 'N/A'}
`;
  }

  if (news && news.length > 0) {
    dataString += `
📰 NOTICIAS RECIENTES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    news.slice(0, 3).forEach((n: any, i: number) => {
      dataString += `
${i + 1}. ${n.headline}`;
    });
  }

  return dataString;
}

/**
 * Convierte precios de USD a otra moneda
 */
export function convertPrices(
  data: { c: number; d: number; h: number; l: number; o: number; pc: number; dp: number },
  rate: number
): { price: number; change: number; high: number; low: number; open: number; prevClose: number; changePercent: number } {
  return {
    price: data.c * rate,
    change: (data.d || 0) * rate,
    high: data.h * rate,
    low: data.l * rate,
    open: data.o * rate,
    prevClose: data.pc * rate,
    changePercent: data.dp || 0, // El porcentaje no cambia con la conversión
  };
}

/**
 * Crea un objeto MarketData desde datos de Finnhub
 */
export function createMarketDataFromFinnhub(
  symbol: string,
  name: string,
  data: any,
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

/**
 * Crea un objeto MarketData desde datos de Yahoo Finance
 */
export function createMarketDataFromYahoo(
  symbol: string,
  meta: any,
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
