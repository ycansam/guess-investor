import { MarketData } from '../types';

/**
 * Formatea los datos de mercado para mostrar en el prompt de la IA
 */
export function formatMarketDataForAI(quote: MarketData): string {
  const currency = getCurrencySymbol(quote.currency || 'USD');
  return formatQuoteSection(quote, currency);
}

/**
 * Obtiene el símbolo de la moneda
 */
function getCurrencySymbol(currencyCode: string): string {
  const symbols: Record<string, string> = {
    'USD': '$',
    'EUR': '€',
    'GBP': '£',
    'JPY': '¥',
  };
  return symbols[currencyCode] || currencyCode + ' ';
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
