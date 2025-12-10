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
  const price = quote.price || 0;
  
  return `
📊 DATOS EN TIEMPO REAL: ${displayName} (${quote.symbol.toUpperCase()})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 PRECIO ACTUAL: ${currency}${price.toFixed(2)}
📈 Cambio hoy: ${quote.change >= 0 ? '+' : ''}${quote.change?.toFixed(2) || '0.00'} (${quote.changePercent >= 0 ? '+' : ''}${quote.changePercent?.toFixed(2) || '0.00'}%)
🔼 Máximo del día: ${currency}${quote.high?.toFixed(2) || 'N/A'}
🔽 Mínimo del día: ${currency}${quote.low?.toFixed(2) || 'N/A'}
🔓 Apertura: ${currency}${quote.open?.toFixed(2) || 'N/A'}
🔒 Cierre anterior: ${currency}${quote.previousClose?.toFixed(2) || 'N/A'}
${quote.volume ? `📊 Volumen: ${quote.volume.toLocaleString()}` : ''}
⏰ Actualizado: ${new Date().toLocaleTimeString('es-ES')}
`;
}
