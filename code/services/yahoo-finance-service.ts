import apiConfig from '../data/api-config.json';
import { MarketData } from '../types';
import { formatMarketDataForAI } from '../utils/format-market-data';
import { createMarketDataFromYahoo } from '../utils/yahoo-data-mapper';

const config = apiConfig.yahoo;

/**
 * Tipo de activo para determinar el formato del símbolo
 */
export type AssetType = 'stock' | 'crypto';

/**
 * Servicio unificado para obtener datos de mercado via Yahoo Finance
 * Soporta acciones (US, EU) y criptomonedas
 */
class YahooFinanceService {
  /**
   * Convierte un símbolo al formato de Yahoo Finance
   * - Acciones US: AAPL, MSFT
   * - Acciones EU: ITX.MC, SAP.DE
   * - Criptos: BTC-EUR, ETH-EUR (en euros)
   */
  private formatSymbolForYahoo(symbol: string, type: AssetType): string {
    if (type === 'crypto') {
      // Si ya tiene formato Yahoo, devolverlo
      if (symbol.includes('-')) return symbol;
      // Convertir BTC -> BTC-EUR (criptos en euros)
      return `${symbol.toUpperCase()}-EUR`;
    }
    // Para acciones, devolver tal cual (ya viene con sufijo si es EU)
    return symbol.toUpperCase();
  }

  /**
   * Obtiene cotización de Yahoo Finance via proxy CORS
   */
  async getQuote(symbol: string, type: AssetType = 'stock'): Promise<MarketData> {
    const yahooSymbol = this.formatSymbolForYahoo(symbol, type);
    
    try {
      console.log(`[YahooFinance] Obteniendo datos para ${yahooSymbol} (${type})`);

      const yahooUrl = `${config.baseUrl}/${encodeURIComponent(yahooSymbol)}?interval=1d&range=1d`;
      const proxyUrl = `${config.corsProxy}${encodeURIComponent(yahooUrl)}`;

      const response = await fetch(proxyUrl);

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const result = data.chart?.result?.[0];

      if (!result) {
        throw new Error(`No se encontraron datos para ${yahooSymbol}`);
      }

      const meta = result.meta;
      const quote = result.indicators?.quote?.[0];

      return createMarketDataFromYahoo(yahooSymbol, meta, quote, type);
    } catch (error: any) {
      console.error(`[YahooFinance] Error para ${yahooSymbol}:`, error.message);
      throw new Error(`Error al obtener datos de ${symbol}: ${error.message}`);
    }
  }

  /**
   * Obtiene cotización de una acción
   */
  async getStockQuote(symbol: string): Promise<MarketData> {
    return this.getQuote(symbol, 'stock');
  }

  /**
   * Obtiene cotización de una criptomoneda
   */
  async getCryptoQuote(symbol: string): Promise<MarketData> {
    return this.getQuote(symbol, 'crypto');
  }

  /**
   * Obtiene datos formateados para incluir en el prompt de la IA
   */
  async getMarketDataForAI(symbol: string, type: AssetType = 'stock'): Promise<string> {
    try {
      const marketData = await this.getQuote(symbol, type);
      return formatMarketDataForAI(marketData);
    } catch (error: any) {
      console.error(`[YahooFinance] Error formateando datos para AI:`, error.message);
      return `No se pudieron obtener datos para ${symbol}: ${error.message}`;
    }
  }

  /**
   * Obtiene múltiples cotizaciones en paralelo
   */
  async getMultipleQuotes(
    symbols: { symbol: string; type: AssetType }[]
  ): Promise<Map<string, MarketData>> {
    const results = new Map<string, MarketData>();
    
    const promises = symbols.map(async ({ symbol, type }) => {
      try {
        const data = await this.getQuote(symbol, type);
        results.set(symbol, data);
      } catch (error) {
        console.log(`[YahooFinance] No se pudo obtener ${symbol}`);
      }
    });

    await Promise.all(promises);
    return results;
  }
}

// Exportar instancia singleton
export const yahooFinanceService = new YahooFinanceService();
