import { appConfig } from '../config/app-config';
import apiConfig from '../data/api-config.json';
import { MarketData } from '../types';
import { createMarketDataFromFinnhub, formatMarketDataForAI } from '../utils/market-data-utils';
import { exchangeRateService } from './exchange-rate-service';
import { marketConfigService } from './market-config-service';
import { yahooFinanceService } from './yahoo-finance-service';

const config = apiConfig.finnhub;
const defaults = apiConfig.defaults;

/**
 * Servicio principal para obtener datos de mercado de Finnhub
 * Refactorizado para ser escalable y mantenible
 */
class FinnhubService {
  /**
   * Valida y obtiene la API key
   */
  private getApiKey(): string {
    const apiKey = appConfig.finnhubApiKey;
    
    if (!apiKey || apiKey === 'TU_FINNHUB_API_KEY') {
      throw new Error(
        'API Key de Finnhub no configurada.\n\n' +
        '1. Ve a https://finnhub.io/register\n' +
        '2. Regístrate GRATIS\n' +
        '3. Copia tu API Key\n' +
        '4. Añádela al archivo .env como EXPO_PUBLIC_FINNHUB_API_KEY'
      );
    }
    
    return apiKey;
  }

  /**
   * Construye la URL de la API de Finnhub
   */
  private buildUrl(endpoint: string, params: Record<string, string>): string {
    const apiKey = this.getApiKey();
    const queryParams = new URLSearchParams({ ...params, token: apiKey });
    return `${config.baseUrl}${endpoint}?${queryParams}`;
  }

  /**
   * Obtiene cotización de una acción
   */
  async getStockQuote(symbol: string): Promise<MarketData> {
    // Si es símbolo europeo, usar Yahoo Finance
    if (marketConfigService.isEuropeanSymbol(symbol)) {
      console.log(`[FinnhubService] Símbolo europeo: ${symbol}, usando Yahoo Finance`);
      return yahooFinanceService.getQuote(symbol);
    }

    // Intentar con Finnhub para acciones US
    try {
      const url = this.buildUrl(config.endpoints.quote, { symbol: symbol.toUpperCase() });
      const response = await fetch(url);

      if (!response.ok) {
        console.log(`[FinnhubService] Finnhub falló para ${symbol}, intentando Yahoo`);
        return yahooFinanceService.getQuote(symbol);
      }

      const data = await response.json();

      // Si no hay datos, intentar Yahoo
      if (data.error || (data.c === 0 && data.h === 0)) {
        console.log(`[FinnhubService] Sin datos en Finnhub para ${symbol}, intentando Yahoo`);
        return yahooFinanceService.getQuote(symbol);
      }

      return createMarketDataFromFinnhub(symbol, symbol.toUpperCase(), data);
    } catch (error: any) {
      console.log(`[FinnhubService] Error Finnhub, fallback a Yahoo para ${symbol}`);
      return yahooFinanceService.getQuote(symbol);
    }
  }

  /**
   * Obtiene cotización de criptomoneda en EUR
   */
  async getCryptoQuote(symbol: string): Promise<MarketData> {
    try {
      console.log(`[FinnhubService] Obteniendo crypto ${symbol}`);

      // Obtener tasa de cambio
      const usdToEur = await exchangeRateService.getUsdToEurRate();

      // Construir símbolo para Finnhub
      const cryptoSymbol = symbol.includes(':') 
        ? symbol 
        : `${defaults.cryptoExchange}:${symbol.toUpperCase()}USDT`;

      const url = this.buildUrl(config.endpoints.quote, { symbol: cryptoSymbol });
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.c === 0) {
        throw new Error(`No se encontraron datos para ${symbol}`);
      }

      const name = marketConfigService.getCryptoFullName(symbol);
      return createMarketDataFromFinnhub(symbol, name, data, usdToEur);
    } catch (error: any) {
      console.error('[FinnhubService] Error fetching crypto:', error);
      throw new Error(`Error al obtener datos de ${symbol}: ${error.message}`);
    }
  }

  /**
   * Obtiene perfil de una empresa
   */
  async getCompanyProfile(symbol: string): Promise<any> {
    try {
      const url = this.buildUrl(config.endpoints.profile, { symbol: symbol.toUpperCase() });
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Error ${response.status}`);
      }

      return await response.json();
    } catch (error: any) {
      console.error('Error fetching company profile:', error);
      return null;
    }
  }

  /**
   * Obtiene noticias del mercado
   */
  async getMarketNews(category: 'general' | 'forex' | 'crypto' | 'merger' = 'general'): Promise<any[]> {
    try {
      const url = this.buildUrl(config.endpoints.news, { category });
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Error ${response.status}`);
      }

      const news = await response.json();
      return news.slice(0, defaults.newsLimit);
    } catch (error: any) {
      console.error('Error fetching news:', error);
      return [];
    }
  }

  /**
   * Obtiene noticias de una empresa específica
   */
  async getCompanyNews(symbol: string): Promise<any[]> {
    try {
      const today = new Date();
      const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

      const url = this.buildUrl(config.endpoints.companyNews, {
        symbol: symbol.toUpperCase(),
        from: lastWeek.toISOString().split('T')[0],
        to: today.toISOString().split('T')[0],
      });

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Error ${response.status}`);
      }

      const news = await response.json();
      return news.slice(0, defaults.newsLimit);
    } catch (error: any) {
      console.error('Error fetching company news:', error);
      return [];
    }
  }

  /**
   * Busca símbolos por query
   */
  async searchSymbol(query: string): Promise<any[]> {
    try {
      const url = this.buildUrl(config.endpoints.search, { q: query });
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Error ${response.status}`);
      }

      const data = await response.json();
      return data.result?.slice(0, defaults.searchLimit) || [];
    } catch (error: any) {
      console.error('Error searching symbol:', error);
      return [];
    }
  }

  /**
   * Obtiene datos formateados para el prompt de IA
   */
  async getMarketDataForAI(symbol: string, type: 'stock' | 'crypto' = 'stock'): Promise<string> {
    try {
      console.log(`[FinnhubService] Obteniendo datos para ${symbol} (${type})`);

      const quote = type === 'crypto'
        ? await this.getCryptoQuote(symbol)
        : await this.getStockQuote(symbol);

      console.log(`[FinnhubService] Quote obtenido:`, quote);

      // Solo obtener perfil y noticias para acciones US
      const isEuropean = marketConfigService.isEuropeanSymbol(symbol);
      const profile = (type === 'stock' && !isEuropean) 
        ? await this.getCompanyProfile(symbol) 
        : null;
      const news = (type === 'stock' && !isEuropean)
        ? await this.getCompanyNews(symbol)
        : [];

      const currency = marketConfigService.getCurrencySymbol(symbol, type);
      
      return formatMarketDataForAI(quote, currency, profile, news);
    } catch (error: any) {
      console.error(`[FinnhubService] Error obteniendo datos para ${symbol}:`, error);
      return `⚠️ No se pudieron obtener datos en tiempo real para ${symbol}: ${error.message}`;
    }
  }

  /**
   * Verifica si el servicio está configurado
   */
  isConfigured(): boolean {
    return appConfig.finnhubApiKey !== 'TU_FINNHUB_API_KEY' &&
      appConfig.finnhubApiKey !== undefined &&
      appConfig.finnhubApiKey.length > 0;
  }
}

// Exportar instancia singleton
export const finnhubService = new FinnhubService();
