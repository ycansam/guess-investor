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
  let dataString = formatQuoteSection(quote, currency);
  dataString += formatProfileSection(profile);
  dataString += formatNewsSection(news);
  return dataString;
}

function formatQuoteSection(quote: MarketData, currency: string): string {
  const displayName = quote.name || quote.symbol.toUpperCase();
  
  return `
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
}

function formatProfileSection(profile?: any): string {
  if (!profile?.name) return '';
  
  return `
🏢 PERFIL DE LA EMPRESA:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Nombre: ${profile.name}
Industria: ${profile.finnhubIndustry || 'N/A'}
País: ${profile.country || 'N/A'}
Cap. de Mercado: $${profile.marketCapitalization ? (profile.marketCapitalization / 1000).toFixed(2) + 'B' : 'N/A'}
`;
}

function formatNewsSection(news?: any[]): string {
  if (!news?.length) return '';
  
  let section = `
📰 NOTICIAS RECIENTES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  
  news.slice(0, 3).forEach((n: any, i: number) => {
    section += `\n${i + 1}. ${n.headline}`;
  });
  
  return section;
}
