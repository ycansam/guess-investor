/**
 * Catalyst Calendar Service
 * Identifica eventos próximos que pueden mover el precio
 * 
 * Catalizadores:
 * - Earnings (reportes trimestrales)
 * - Dividendos (ex-date, payment date)
 * - Stock splits
 * - FDA decisions (biotech)
 * - Product launches
 * - Conferencias de inversores
 * 
 * Usado por: Steve Cohen, George Soros
 */

import { logger } from '../../middleware/logger.js';

export interface CatalystEvent {
  type: 'earnings' | 'dividend' | 'split' | 'conference' | 'fda' | 'other';
  title: string;
  date: string;           // ISO date
  daysUntil: number;      // Días hasta el evento
  importance: 'low' | 'medium' | 'high' | 'critical';
  expectedImpact: 'bullish' | 'bearish' | 'volatile' | 'neutral';
  details: string;
}

export interface CatalystCalendarData {
  // Eventos próximos
  upcomingEvents: CatalystEvent[];
  nextEvent: CatalystEvent | null;
  
  // Earnings específico
  earningsDate: string | null;
  daysUntilEarnings: number | null;
  earningsEstimate: number | null;
  
  // Dividendos
  exDividendDate: string | null;
  dividendDate: string | null;
  dividendAmount: number | null;
  dividendYield: number | null;
  
  // Análisis
  volatilityWarning: boolean;
  summary: string;
  tradingImplication: string;
  
  // Meta
  hasData: boolean;
}

// Cache
const cache = new Map<string, { data: CatalystCalendarData; timestamp: number }>();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutos

export const catalystCalendarService = {
  /**
   * Obtiene calendario de catalizadores para un símbolo
   */
  async getCatalysts(symbol: string): Promise<CatalystCalendarData> {
    // Check cache
    const cached = cache.get(symbol);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }

    try {
      // Primero intentar con investor-info (más fiable)
      const investorData = await this.fetchFromInvestorInfo(symbol);
      
      if (investorData && investorData.hasData) {
        cache.set(symbol, { data: investorData, timestamp: Date.now() });
        if (investorData.nextEvent) {
          logger.info(`[Catalyst] ${symbol}: Next event in ${investorData.nextEvent.daysUntil} days (${investorData.nextEvent.type})`);
        }
        return investorData;
      }
      
      // Fallback a Yahoo Finance directo
      const data = await this.fetchFromYahoo(symbol);
      
      cache.set(symbol, { data, timestamp: Date.now() });
      
      if (data.nextEvent) {
        logger.info(`[Catalyst] ${symbol}: Next event in ${data.nextEvent.daysUntil} days (${data.nextEvent.type})`);
      }
      
      return data;
    } catch (error) {
      logger.error(`[Catalyst] Error fetching for ${symbol}:`, error);
      return this.getDefaultData();
    }
  },

  /**
   * Obtiene datos del endpoint investor-info existente
   */
  async fetchFromInvestorInfo(symbol: string): Promise<CatalystCalendarData | null> {
    try {
      const url = `http://localhost:3001/api/assets/${encodeURIComponent(symbol)}/investor-info`;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return null;
      }

      const json = await response.json() as any;
      const data = json.data;
      
      if (!data) {
        return null;
      }

      const events: CatalystEvent[] = [];
      const now = new Date();

      // Earnings
      let earningsDate: string | null = null;
      let daysUntilEarnings: number | null = null;
      let earningsEstimate: number | null = null;

      if (data.earnings?.nextDate) {
        const nextEarningsDate = new Date(data.earnings.nextDate);
        earningsDate = nextEarningsDate.toISOString().split('T')[0];
        const calculatedDaysUntil = data.earnings.daysUntil ?? Math.ceil((nextEarningsDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        daysUntilEarnings = calculatedDaysUntil;
        earningsEstimate = data.earnings.estimatedEPS || null;

        if (calculatedDaysUntil >= 0 && calculatedDaysUntil <= 90) {
          events.push({
            type: 'earnings',
            title: `Earnings Report${data.earnings.quarter ? ` Q${data.earnings.quarter}` : ''}`,
            date: earningsDate,
            daysUntil: calculatedDaysUntil,
            importance: calculatedDaysUntil <= 7 ? 'critical' : calculatedDaysUntil <= 14 ? 'high' : 'medium',
            expectedImpact: 'volatile',
            details: earningsEstimate 
              ? `EPS estimado: $${earningsEstimate.toFixed(2)}, Beat rate: ${data.earnings.beatRate || 0}%`
              : `Beat rate histórico: ${data.earnings.beatRate || 0}%`,
          });
        }
      }

      // Dividendos
      let exDividendDate: string | null = null;
      let dividendDate: string | null = null;
      let dividendAmount: number | null = null;
      let dividendYield: number | null = null;

      if (data.dividends) {
        dividendAmount = data.dividends.annualAmount || null;
        dividendYield = data.dividends.yield || null;
        
        if (data.dividends.exDate) {
          const exDate = new Date(data.dividends.exDate);
          exDividendDate = exDate.toISOString().split('T')[0];
          const daysUntilExDiv = Math.ceil((exDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysUntilExDiv >= 0 && daysUntilExDiv <= 60) {
            events.push({
              type: 'dividend',
              title: 'Ex-Dividend Date',
              date: exDividendDate,
              daysUntil: daysUntilExDiv,
              importance: daysUntilExDiv <= 3 ? 'high' : 'medium',
              expectedImpact: daysUntilExDiv === 0 ? 'bearish' : 'neutral',
              details: dividendAmount 
                ? `Dividendo: $${dividendAmount.toFixed(2)} (${dividendYield?.toFixed(2)}% yield)`
                : 'Fecha ex-dividendo',
            });
          }
        }
        
        if (data.dividends.payDate) {
          dividendDate = new Date(data.dividends.payDate).toISOString().split('T')[0];
        }
      }

      // Ordenar eventos por fecha
      events.sort((a, b) => a.daysUntil - b.daysUntil);
      const nextEvent = events.length > 0 ? events[0] : null;

      // Generar análisis
      const { volatilityWarning, summary, tradingImplication } = this.analyze(events, daysUntilEarnings);

      return {
        upcomingEvents: events,
        nextEvent,
        earningsDate,
        daysUntilEarnings,
        earningsEstimate,
        exDividendDate,
        dividendDate,
        dividendAmount,
        dividendYield,
        volatilityWarning,
        summary,
        tradingImplication,
        hasData: events.length > 0 || earningsDate !== null,
      };
    } catch (error) {
      logger.debug(`[Catalyst] Failed to fetch from investor-info`);
      return null;
    }
  },

  /**
   * Fetch catalyst data from Yahoo Finance
   */
  async fetchFromYahoo(symbol: string): Promise<CatalystCalendarData> {
    try {
      // Intentar con v11 primero
      let url = `https://query2.finance.yahoo.com/v11/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=calendarEvents,summaryDetail`;
      
      let response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        // Fallback a v10
        url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=calendarEvents,earnings,summaryDetail`;
        response = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          signal: AbortSignal.timeout(10000),
        });
        
        if (!response.ok) {
          return this.getDefaultData();
        }
      }

      const json = await response.json() as any;
      const result = json.quoteSummary?.result?.[0];
      
      if (!result) {
        return this.getDefaultData();
      }

      const calendar = result.calendarEvents;
      const earnings = result.earnings;
      const summary = result.summaryDetail;

      const events: CatalystEvent[] = [];
      const now = new Date();

      // Earnings date
      let earningsDate: string | null = null;
      let daysUntilEarnings: number | null = null;
      let earningsEstimate: number | null = null;

      if (calendar?.earnings?.earningsDate) {
        const dates = calendar.earnings.earningsDate;
        if (dates.length > 0) {
          const nextEarningsTimestamp = dates[0].raw;
          const nextEarningsDate = new Date(nextEarningsTimestamp * 1000);
          earningsDate = nextEarningsDate.toISOString().split('T')[0];
          daysUntilEarnings = Math.ceil((nextEarningsDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          
          // Obtener estimación
          earningsEstimate = calendar.earnings.earningsAverage?.raw || null;

          if (daysUntilEarnings >= 0 && daysUntilEarnings <= 60) {
            events.push({
              type: 'earnings',
              title: `Earnings Report Q${this.getCurrentQuarter()}`,
              date: earningsDate,
              daysUntil: daysUntilEarnings,
              importance: daysUntilEarnings <= 7 ? 'critical' : daysUntilEarnings <= 14 ? 'high' : 'medium',
              expectedImpact: 'volatile',
              details: earningsEstimate 
                ? `EPS estimado: $${earningsEstimate.toFixed(2)}`
                : 'Fecha de reporte de ganancias',
            });
          }
        }
      }

      // Ex-Dividend date
      let exDividendDate: string | null = null;
      let dividendDate: string | null = null;
      let dividendAmount: number | null = null;
      let dividendYield: number | null = null;

      if (calendar?.exDividendDate?.raw) {
        const exDivTimestamp = calendar.exDividendDate.raw;
        const exDivDate = new Date(exDivTimestamp * 1000);
        exDividendDate = exDivDate.toISOString().split('T')[0];
        const daysUntilExDiv = Math.ceil((exDivDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        
        dividendDate = calendar.dividendDate?.fmt || null;
        dividendAmount = summary?.dividendRate?.raw || null;
        dividendYield = summary?.dividendYield?.raw ? summary.dividendYield.raw * 100 : null;

        if (daysUntilExDiv >= 0 && daysUntilExDiv <= 60) {
          events.push({
            type: 'dividend',
            title: 'Ex-Dividend Date',
            date: exDividendDate,
            daysUntil: daysUntilExDiv,
            importance: daysUntilExDiv <= 3 ? 'high' : 'medium',
            expectedImpact: daysUntilExDiv === 0 ? 'bearish' : 'neutral', // Precio baja en ex-date
            details: dividendAmount 
              ? `Dividendo: $${dividendAmount.toFixed(2)} (${dividendYield?.toFixed(2)}% yield)`
              : 'Fecha ex-dividendo',
          });
        }
      }

      // Ordenar eventos por fecha
      events.sort((a, b) => a.daysUntil - b.daysUntil);

      // Determinar próximo evento
      const nextEvent = events.length > 0 ? events[0] : null;

      // Generar análisis
      const { volatilityWarning, summary: summaryText, tradingImplication } = this.analyze(events, daysUntilEarnings);

      return {
        upcomingEvents: events,
        nextEvent,
        earningsDate,
        daysUntilEarnings,
        earningsEstimate,
        exDividendDate,
        dividendDate,
        dividendAmount,
        dividendYield,
        volatilityWarning,
        summary: summaryText,
        tradingImplication,
        hasData: true,
      };
    } catch (error) {
      logger.debug(`[Catalyst] Failed to fetch for symbol`);
      return this.getDefaultData();
    }
  },

  /**
   * Obtener el trimestre actual
   */
  getCurrentQuarter(): number {
    const month = new Date().getMonth();
    return Math.floor(month / 3) + 1;
  },

  /**
   * Analizar catalizadores
   */
  analyze(
    events: CatalystEvent[],
    daysUntilEarnings: number | null
  ): { volatilityWarning: boolean; summary: string; tradingImplication: string } {
    let volatilityWarning = false;
    let summary = '';
    let tradingImplication = '';

    if (events.length === 0) {
      return {
        volatilityWarning: false,
        summary: 'Sin catalizadores próximos identificados.',
        tradingImplication: 'Movimiento de precio probablemente por factores técnicos o macro.',
      };
    }

    // Advertencia de volatilidad si earnings cerca
    if (daysUntilEarnings !== null && daysUntilEarnings <= 7) {
      volatilityWarning = true;
      summary = `⚡ EARNINGS en ${daysUntilEarnings} días. Alta volatilidad esperada.`;
      tradingImplication = 'No recomendado mantener posiciones a través de earnings sin cobertura. IV suele estar inflado.';
    } else if (daysUntilEarnings !== null && daysUntilEarnings <= 14) {
      volatilityWarning = true;
      summary = `📅 Earnings en ${daysUntilEarnings} días. Prepararse para volatilidad.`;
      tradingImplication = 'Considerar reducir tamaño de posición o usar opciones para protección.';
    } else {
      const nextEvent = events[0];
      summary = `📆 Próximo evento: ${nextEvent.title} en ${nextEvent.daysUntil} días.`;
      
      if (nextEvent.type === 'dividend') {
        tradingImplication = 'Si quieres el dividendo, debes comprar ANTES del ex-dividend date.';
      } else {
        tradingImplication = 'Evento puede actuar como catalizador de precio.';
      }
    }

    // Múltiples eventos
    if (events.length > 1) {
      summary += ` (${events.length} eventos próximos)`;
    }

    return { volatilityWarning, summary, tradingImplication };
  },

  /**
   * Datos por defecto
   */
  getDefaultData(): CatalystCalendarData {
    return {
      upcomingEvents: [],
      nextEvent: null,
      earningsDate: null,
      daysUntilEarnings: null,
      earningsEstimate: null,
      exDividendDate: null,
      dividendDate: null,
      dividendAmount: null,
      dividendYield: null,
      volatilityWarning: false,
      summary: 'Sin datos de calendario disponibles.',
      tradingImplication: '',
      hasData: false,
    };
  },
};
