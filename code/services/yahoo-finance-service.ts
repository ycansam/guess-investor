import apiConfig from '../data/api-config.json';
import { MarketData } from '../types';
import { createMarketDataFromYahoo } from '../utils/market-data-utils';

const config = apiConfig.yahoo;

/**
 * Servicio para obtener datos de Yahoo Finance (usado para acciones europeas)
 */
class YahooFinanceService {
  /**
   * Obtiene cotización de Yahoo Finance via proxy CORS
   */
  async getQuote(symbol: string): Promise<MarketData> {
    try {
      console.log(`[YahooFinanceService] Obteniendo datos para ${symbol}`);

      const yahooUrl = `${config.baseUrl}/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
      const proxyUrl = `${config.corsProxy}${encodeURIComponent(yahooUrl)}`;

      console.log(`[YahooFinanceService] URL con proxy:`, proxyUrl);

      const response = await fetch(proxyUrl);

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const result = data.chart?.result?.[0];

      if (!result) {
        throw new Error(`No se encontraron datos para ${symbol}`);
      }

      const meta = result.meta;
      const quote = result.indicators?.quote?.[0];

      return createMarketDataFromYahoo(symbol, meta, quote);
    } catch (error: any) {
      console.error('[YahooFinanceService] Error:', error);
      throw new Error(`Error al obtener datos de ${symbol}: ${error.message}`);
    }
  }
}

// Exportar instancia singleton
export const yahooFinanceService = new YahooFinanceService();
