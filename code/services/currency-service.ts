/**
 * Servicio para conversión de monedas a EUR
 * Usa Yahoo Finance para obtener tipos de cambio en tiempo real
 */

import apiConfig from '../data/api-config.json';
import { fetchWithCorsProxy } from './cors-proxy';

const config = apiConfig.yahoo;

// Caché de tipos de cambio (válido por 1 hora)
const CACHE_DURATION = 60 * 60 * 1000; // 1 hora

interface ExchangeRateCache {
  rate: number;
  timestamp: number;
}

const exchangeRateCache = new Map<string, ExchangeRateCache>();

// Tipos de cambio actualizados (Diciembre 2024) como fallback si falla la API
const FALLBACK_RATES: Record<string, number> = {
  USD: 0.95,    // 1 USD = 0.95 EUR
  HKD: 0.1071,  // 1 HKD = 0.1071 EUR (42.96 HKD = 4.60 EUR)
  GBP: 1.20,    // 1 GBP = 1.20 EUR (British Pound)
  JPY: 0.0063,  // 1 JPY = 0.0063 EUR (Japanese Yen)
  CNY: 0.13,    // 1 CNY = 0.13 EUR (Chinese Yuan)
  KRW: 0.00068, // 1 KRW = 0.00068 EUR (Korean Won)
  CHF: 1.07,    // 1 CHF = 1.07 EUR (Swiss Franc)
  SEK: 0.088,   // 1 SEK = 0.088 EUR (Swedish Krona)
  NOK: 0.084,   // 1 NOK = 0.084 EUR (Norwegian Krone)
  DKK: 0.134,   // 1 DKK = 0.134 EUR (Danish Krone)
  AUD: 0.61,    // 1 AUD = 0.61 EUR (Australian Dollar)
  CAD: 0.68,    // 1 CAD = 0.68 EUR (Canadian Dollar)
  SGD: 0.70,    // 1 SGD = 0.70 EUR (Singapore Dollar)
  INR: 0.011,   // 1 INR = 0.011 EUR (Indian Rupee)
  EUR: 1,       // EUR a EUR = 1
};

class CurrencyService {
  /**
   * Obtiene el tipo de cambio de una moneda a EUR
   */
  async getExchangeRateToEUR(currency: string): Promise<number> {
    const currencyUpper = currency.toUpperCase();
    
    // Si ya es EUR, no hay conversión
    if (currencyUpper === 'EUR') {
      return 1;
    }

    // Verificar caché
    const cached = exchangeRateCache.get(currencyUpper);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`[Currency] Usando caché para ${currencyUpper}/EUR: ${cached.rate}`);
      return cached.rate;
    }

    try {
      // Yahoo Finance usa el formato XXXEUR=X para tipos de cambio
      const symbol = `${currencyUpper}EUR=X`;
      console.log(`[Currency] Obteniendo tipo de cambio ${currencyUpper} -> EUR`);

      const yahooUrl = `${config.baseUrl}/${encodeURIComponent(symbol)}?interval=1d&range=1d`;

      const response = await fetchWithCorsProxy(yahooUrl, {
        signal: AbortSignal.timeout(8000),
      });

      const data = await response.json();
      const result = data.chart?.result?.[0];
      const rate = result?.meta?.regularMarketPrice;

      if (rate && rate > 0) {
        console.log(`[Currency] ${currencyUpper}/EUR = ${rate}`);
        exchangeRateCache.set(currencyUpper, { rate, timestamp: Date.now() });
        return rate;
      }

      throw new Error('No se encontró el tipo de cambio');
    } catch (error: any) {
      console.warn(`[Currency] Error obteniendo ${currencyUpper}/EUR: ${error.message}`);
      
      // Usar fallback
      const fallback = FALLBACK_RATES[currencyUpper];
      if (fallback) {
        console.log(`[Currency] Usando fallback para ${currencyUpper}: ${fallback}`);
        return fallback;
      }

      // Si no tenemos fallback, asumir USD
      console.warn(`[Currency] Moneda ${currencyUpper} desconocida, asumiendo USD`);
      return FALLBACK_RATES.USD;
    }
  }

  /**
   * Convierte un precio de una moneda a EUR
   */
  async convertToEUR(price: number, fromCurrency: string): Promise<number> {
    const rate = await this.getExchangeRateToEUR(fromCurrency);
    const converted = price * rate;
    console.log(`[Currency] ${price} ${fromCurrency} = ${converted.toFixed(2)} EUR`);
    return converted;
  }

  /**
   * Detecta la moneda basándose en el símbolo del activo
   */
  getCurrencyFromSymbol(symbol: string): string {
    const upper = symbol.toUpperCase();
    
    // Mercados por sufijo
    if (upper.endsWith('.HK')) return 'HKD';
    if (upper.endsWith('.T')) return 'JPY';
    if (upper.endsWith('.KS') || upper.endsWith('.KQ')) return 'KRW';
    if (upper.endsWith('.SS') || upper.endsWith('.SZ')) return 'CNY';
    if (upper.endsWith('.L')) return 'GBP';
    if (upper.endsWith('.PA') || upper.endsWith('.MC') || upper.endsWith('.DE') || 
        upper.endsWith('.MI') || upper.endsWith('.AS')) return 'EUR';
    if (upper.endsWith('.SW')) return 'CHF';
    if (upper.endsWith('.ST')) return 'SEK';
    if (upper.endsWith('.OL')) return 'NOK';
    if (upper.endsWith('.CO')) return 'DKK';
    if (upper.endsWith('.AX')) return 'AUD';
    if (upper.endsWith('.TO') || upper.endsWith('.V')) return 'CAD';
    if (upper.endsWith('.SI')) return 'SGD';
    if (upper.endsWith('.NS') || upper.endsWith('.BO')) return 'INR';
    
    // Cryptos en EUR
    if (upper.includes('-EUR')) return 'EUR';
    if (upper.includes('-USD')) return 'USD';
    
    // Por defecto, acciones sin sufijo son USD (mercado americano)
    if (!upper.includes('.')) return 'USD';
    
    return 'USD';
  }
}

export const currencyService = new CurrencyService();
