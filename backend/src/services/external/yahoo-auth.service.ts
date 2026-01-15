/**
 * Servicio de Yahoo Finance usando yahoo-finance2
 * 
 * Esta librería maneja automáticamente la autenticación y el crumb
 */

import YahooFinance from 'yahoo-finance2';
import { logger } from '../../middleware/logger.js';

// Crear instancia de Yahoo Finance
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export const yahooAuthService = {
  /**
   * Obtiene datos de quoteSummary usando yahoo-finance2
   * Retorna los datos en el mismo formato que esperan los servicios
   */
  async fetchQuoteSummary(symbol: string, modules: string[]): Promise<any | null> {
    try {
      const result = await yahooFinance.quoteSummary(symbol, {
        modules: modules as any[],
      });
      
      logger.info(`[YahooAuth] Datos obtenidos para ${symbol}: ${modules.join(', ')}`);
      return result;
    } catch (error) {
      logger.warn(`[YahooAuth] Error obteniendo ${symbol}:`, error instanceof Error ? error.message : error);
      return null;
    }
  },
};
