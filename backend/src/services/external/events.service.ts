/**
 * Events Service
 * Obtiene eventos importantes: earnings, dividendos, splits
 * Datos desde Yahoo Finance
 */

import { logger } from '../../middleware/logger.js';
import { yahooService } from './yahoo.service.js';

// Cache para eventos
const eventsCache = new Map<string, { data: AssetEvents; expiresAt: number }>();
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 horas

export interface EarningsEvent {
  date: Date;
  isEstimate: boolean;
  epsEstimate?: number;
  epsPrevious?: number;
  revenueEstimate?: number;
  revenuePrevious?: number;
  daysUntil: number;
}

export interface DividendEvent {
  exDate?: Date;
  paymentDate?: Date;
  amount?: number;
  yield?: number;
  frequency?: string; // 'quarterly', 'monthly', 'annual'
  daysUntilEx?: number;
}

export interface SplitEvent {
  date: Date;
  ratio: string; // "4:1", "2:1", etc.
  daysUntil: number;
}

export interface AssetEvents {
  symbol: string;
  hasData: boolean;
  
  // Próximos earnings
  nextEarnings?: EarningsEvent;
  lastEarnings?: {
    date: Date;
    epsActual?: number;
    epsSurprise?: number;
    revenueSurprise?: number;
  };
  
  // Dividendos
  dividend?: DividendEvent;
  
  // Splits
  nextSplit?: SplitEvent;
  
  // Warnings para el inversor
  warnings: string[];
  
  // Score de riesgo por eventos (-50 a +50)
  eventRiskScore: number;
  
  fetchedAt: Date;
}

export const eventsService = {
  /**
   * Obtener eventos importantes para un símbolo
   */
  async getEvents(symbol: string): Promise<AssetEvents> {
    const cacheKey = symbol.toUpperCase();
    const cached = eventsCache.get(cacheKey);
    
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    try {
      logger.info(`[Events] Fetching events for ${symbol}`);
      
      // Obtener datos de Yahoo Finance
      const [quote, calendarData] = await Promise.all([
        yahooService.getQuote(symbol),
        this.fetchCalendarData(symbol),
      ]);

      const warnings: string[] = [];
      let eventRiskScore = 0;
      const now = new Date();

      // Procesar earnings
      let nextEarnings: EarningsEvent | undefined;
      let lastEarnings: AssetEvents['lastEarnings'] | undefined;
      
      if (calendarData.earnings) {
        const earningsDate = calendarData.earnings.earningsDate;
        if (earningsDate) {
          const daysUntil = Math.ceil((earningsDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysUntil > 0 && daysUntil <= 90) {
            nextEarnings = {
              date: earningsDate,
              isEstimate: calendarData.earnings.isEstimate || false,
              epsEstimate: calendarData.earnings.epsEstimate,
              epsPrevious: calendarData.earnings.epsPrevious,
              revenueEstimate: calendarData.earnings.revenueEstimate,
              revenuePrevious: calendarData.earnings.revenuePrevious,
              daysUntil,
            };

            // Warnings según proximidad
            if (daysUntil <= 3) {
              warnings.push(`⚠️ EARNINGS en ${daysUntil} día${daysUntil > 1 ? 's' : ''} - Alto riesgo de volatilidad`);
              eventRiskScore -= 30;
            } else if (daysUntil <= 7) {
              warnings.push(`📅 Earnings en ${daysUntil} días - Precaución`);
              eventRiskScore -= 15;
            } else if (daysUntil <= 14) {
              warnings.push(`📆 Earnings en ${daysUntil} días`);
              eventRiskScore -= 5;
            }
          }
        }

        // Últimos earnings
        if (calendarData.earnings.lastEarningsDate) {
          lastEarnings = {
            date: calendarData.earnings.lastEarningsDate,
            epsActual: calendarData.earnings.epsActual,
            epsSurprise: calendarData.earnings.epsSurprise,
            revenueSurprise: calendarData.earnings.revenueSurprise,
          };
        }
      }

      // Procesar dividendos
      let dividend: DividendEvent | undefined;
      if (quote?.dividendYield || calendarData.dividend) {
        const exDate = calendarData.dividend?.exDate;
        let daysUntilEx: number | undefined;
        
        if (exDate) {
          daysUntilEx = Math.ceil((exDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysUntilEx > 0 && daysUntilEx <= 30) {
            warnings.push(`💰 Ex-dividendo en ${daysUntilEx} días`);
            eventRiskScore += 5; // Pequeño bonus
          }
        }

        dividend = {
          exDate: calendarData.dividend?.exDate,
          paymentDate: calendarData.dividend?.paymentDate,
          amount: calendarData.dividend?.amount,
          yield: quote?.dividendYield,
          frequency: calendarData.dividend?.frequency,
          daysUntilEx: daysUntilEx && daysUntilEx > 0 ? daysUntilEx : undefined,
        };
      }

      // Procesar splits (raramente disponible en Yahoo)
      let nextSplit: SplitEvent | undefined;
      if (calendarData.split) {
        const splitDate = calendarData.split.date;
        const daysUntil = Math.ceil((splitDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysUntil > 0 && daysUntil <= 60) {
          nextSplit = {
            date: splitDate,
            ratio: calendarData.split.ratio,
            daysUntil,
          };
          warnings.push(`✂️ Split ${calendarData.split.ratio} en ${daysUntil} días`);
        }
      }

      const events: AssetEvents = {
        symbol: symbol.toUpperCase(),
        hasData: !!(nextEarnings || dividend || nextSplit),
        nextEarnings,
        lastEarnings,
        dividend,
        nextSplit,
        warnings,
        eventRiskScore,
        fetchedAt: now,
      };

      eventsCache.set(cacheKey, { data: events, expiresAt: Date.now() + CACHE_TTL });
      logger.info(`[Events] ${symbol}: ${warnings.length} warnings, risk score: ${eventRiskScore}`);

      return events;
    } catch (error) {
      logger.error(`[Events] Error fetching events for ${symbol}:`, error);
      return {
        symbol: symbol.toUpperCase(),
        hasData: false,
        warnings: [],
        eventRiskScore: 0,
        fetchedAt: new Date(),
      };
    }
  },

  /**
   * Fetch calendar data desde Yahoo Finance
   */
  async fetchCalendarData(symbol: string): Promise<{
    earnings?: {
      earningsDate?: Date;
      isEstimate?: boolean;
      epsEstimate?: number;
      epsPrevious?: number;
      revenueEstimate?: number;
      revenuePrevious?: number;
      lastEarningsDate?: Date;
      epsActual?: number;
      epsSurprise?: number;
      revenueSurprise?: number;
    };
    dividend?: {
      exDate?: Date;
      paymentDate?: Date;
      amount?: number;
      frequency?: string;
    };
    split?: {
      date: Date;
      ratio: string;
    };
  }> {
    try {
      const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=calendarEvents,earningsHistory,defaultKeyStatistics`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (!response.ok) {
        logger.warn(`[Events] Yahoo calendar API error: ${response.status}`);
        return {};
      }

      const data = await response.json();
      const result = data?.quoteSummary?.result?.[0];
      
      if (!result) return {};

      const calendar = result.calendarEvents;
      const earningsHistory = result.earningsHistory?.history?.[0];
      const keyStats = result.defaultKeyStatistics;

      const output: ReturnType<typeof this.fetchCalendarData> extends Promise<infer T> ? T : never = {};

      // Earnings
      if (calendar?.earnings) {
        const earningsDate = calendar.earnings.earningsDate?.[0]?.raw;
        output.earnings = {
          earningsDate: earningsDate ? new Date(earningsDate * 1000) : undefined,
          isEstimate: calendar.earnings.isEstimate,
          epsEstimate: calendar.earnings.earningsAverage?.raw,
          revenueEstimate: calendar.earnings.revenueAverage?.raw,
        };

        // Último earnings del historial
        if (earningsHistory) {
          output.earnings.lastEarningsDate = earningsHistory.quarterDate ? new Date(earningsHistory.quarterDate) : undefined;
          output.earnings.epsActual = earningsHistory.epsActual?.raw;
          output.earnings.epsPrevious = earningsHistory.epsEstimate?.raw;
          output.earnings.epsSurprise = earningsHistory.surprisePercent?.raw;
        }
      }

      // Dividendos
      if (calendar?.exDividendDate || keyStats?.dividendRate) {
        output.dividend = {
          exDate: calendar?.exDividendDate?.raw ? new Date(calendar.exDividendDate.raw * 1000) : undefined,
          amount: keyStats?.dividendRate?.raw,
          frequency: keyStats?.dividendYield?.raw > 0 ? 'quarterly' : undefined,
        };
      }

      return output;
    } catch (error) {
      logger.error(`[Events] Error fetching calendar:`, error);
      return {};
    }
  },

  /**
   * Limpiar cache
   */
  clearCache() {
    eventsCache.clear();
    logger.info('[Events] Cache cleared');
  },
};
