/**
 * Corporate Events Service
 * 
 * Obtiene eventos corporativos que pueden afectar predicciones:
 * - Próximas fechas de earnings
 * - Dividendos y ex-dates
 * - Acciones de analistas (upgrades/downgrades)
 * 
 * Migrado de: code/services/corporate-events-service.ts
 */

import { logger } from '../../middleware/logger.js';

// ============================================================================
// INTERFACES
// ============================================================================

export interface EarningsEvent {
  date: Date;
  daysUntil: number;
  isUpcoming: boolean;
  quarter: string;
  estimatedEPS: number | null;
  revenueEstimate: number | null;
}

export interface DividendEvent {
  exDate: Date | null;
  payDate: Date | null;
  amount: number | null;
  yield: number | null;
  isUpcoming: boolean;
}

export interface AnalystAction {
  date: Date;
  firm: string;
  action: 'upgrade' | 'downgrade' | 'maintain' | 'init';
  fromGrade: string;
  toGrade: string;
  impact: number;
}

export interface CorporateEvents {
  symbol: string;
  nextEarningsDate: EarningsEvent | null;
  earningsImpact: number;
  dividend: DividendEvent | null;
  dividendImpact: number;
  recentAnalystActions: AnalystAction[];
  analystActionsImpact: number;
  overallImpact: number;
  summary: string;
}

// ============================================================================
// CACHE
// ============================================================================

interface CacheEntry {
  data: CorporateEvents;
  timestamp: number;
}
const eventsCache = new Map<string, CacheEntry>();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutos

// ============================================================================
// SERVICE
// ============================================================================

export const corporateEventsService = {
  /**
   * Obtiene eventos corporativos para un símbolo
   */
  async getCorporateEvents(symbol: string): Promise<CorporateEvents | null> {
    // Las cryptos no tienen eventos corporativos
    if (symbol.includes('-EUR') || symbol.includes('-USD')) {
      return null;
    }

    // Verificar cache
    const cached = eventsCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }

    try {
      logger.debug(`[CorporateEvents] Fetching events for ${symbol}`);

      // Intentar obtener datos de Yahoo Finance
      const events = await this.fetchFromYahoo(symbol);
      
      if (events) {
        eventsCache.set(symbol, { data: events, timestamp: Date.now() });
        return events;
      }

      // Fallback: generar datos básicos
      const basicEvents = this.generateBasicEvents(symbol);
      eventsCache.set(symbol, { data: basicEvents, timestamp: Date.now() });
      return basicEvents;

    } catch (error: any) {
      logger.warn(`[CorporateEvents] Error for ${symbol}: ${error.message}`);
      return null;
    }
  },

  /**
   * Intenta obtener datos de Yahoo Finance
   */
  async fetchFromYahoo(symbol: string): Promise<CorporateEvents | null> {
    try {
      // Usar Yahoo Finance v8 API para quoteSummary
      const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=calendarEvents,upgradeDowngradeHistory`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (!response.ok) {
        return null;
      }

      const data: any = await response.json();
      const result = data?.quoteSummary?.result?.[0];
      
      if (!result) {
        return null;
      }

      return this.parseYahooResponse(symbol, result);
    } catch {
      return null;
    }
  },

  /**
   * Parsea la respuesta de Yahoo Finance
   */
  parseYahooResponse(symbol: string, result: any): CorporateEvents {
    const calendar = result.calendarEvents || {};
    const upgrades = result.upgradeDowngradeHistory?.history || [];

    // Parsear earnings
    const nextEarningsDate = this.parseEarningsDate(calendar);
    const earningsImpact = this.calculateEarningsImpact(nextEarningsDate);

    // Parsear dividendos
    const dividend = this.parseDividend(calendar);
    const dividendImpact = this.calculateDividendImpact(dividend);

    // Parsear acciones de analistas
    const recentAnalystActions = this.parseAnalystActions(upgrades);
    const analystActionsImpact = this.calculateAnalystActionsImpact(recentAnalystActions);

    // Calcular impacto total
    const overallImpact = Math.round(
      earningsImpact * 0.3 +
      dividendImpact * 0.2 +
      analystActionsImpact * 0.5
    );

    // Generar resumen
    const summary = this.generateSummary(nextEarningsDate, dividend, recentAnalystActions);

    return {
      symbol,
      nextEarningsDate,
      earningsImpact,
      dividend,
      dividendImpact,
      recentAnalystActions,
      analystActionsImpact,
      overallImpact,
      summary,
    };
  },

  /**
   * Genera eventos básicos cuando no hay datos
   */
  generateBasicEvents(symbol: string): CorporateEvents {
    return {
      symbol,
      nextEarningsDate: null,
      earningsImpact: 0,
      dividend: null,
      dividendImpact: 0,
      recentAnalystActions: [],
      analystActionsImpact: 0,
      overallImpact: 0,
      summary: 'Sin datos de eventos corporativos disponibles',
    };
  },

  /**
   * Parsea la fecha del próximo earnings
   */
  parseEarningsDate(calendar: any): EarningsEvent | null {
    const earnings = calendar.earnings;
    if (!earnings) return null;

    const earningsDates = earnings.earningsDate || [];
    if (earningsDates.length === 0) return null;

    const rawDate = earningsDates[0]?.raw;
    if (!rawDate) return null;

    const date = new Date(rawDate * 1000);
    const now = new Date();
    const daysUntil = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    const month = date.getMonth();
    const year = date.getFullYear();
    const quarter = `Q${Math.ceil((month + 1) / 3)} ${year}`;

    return {
      date,
      daysUntil,
      isUpcoming: daysUntil > 0 && daysUntil <= 30,
      quarter,
      estimatedEPS: earnings.earningsAverage?.raw ?? null,
      revenueEstimate: earnings.revenueAverage?.raw ?? null,
    };
  },

  /**
   * Calcula el impacto de earnings cercanos
   */
  calculateEarningsImpact(earnings: EarningsEvent | null): number {
    if (!earnings || !earnings.isUpcoming) return 0;

    const { daysUntil } = earnings;

    // Earnings muy cercanos = incertidumbre
    if (daysUntil <= 3) return -30;
    if (daysUntil <= 7) return -20;
    if (daysUntil <= 14) return -10;
    return 0;
  },

  /**
   * Parsea información de dividendos
   */
  parseDividend(calendar: any): DividendEvent | null {
    const exDate = calendar.exDividendDate?.raw;
    const dividendDate = calendar.dividendDate?.raw;

    if (!exDate && !dividendDate) return null;

    const exDateObj = exDate ? new Date(exDate * 1000) : null;
    const payDateObj = dividendDate ? new Date(dividendDate * 1000) : null;

    const now = new Date();
    const isUpcoming = exDateObj
      ? exDateObj.getTime() > now.getTime() &&
        (exDateObj.getTime() - now.getTime()) / (1000 * 60 * 60 * 24) <= 30
      : false;

    return {
      exDate: exDateObj,
      payDate: payDateObj,
      amount: null,
      yield: null,
      isUpcoming,
    };
  },

  /**
   * Calcula el impacto de dividendos próximos
   */
  calculateDividendImpact(dividend: DividendEvent | null): number {
    if (!dividend || !dividend.isUpcoming) return 0;
    return 15;
  },

  /**
   * Parsea acciones de analistas de los últimos 30 días
   */
  parseAnalystActions(history: any[]): AnalystAction[] {
    if (!Array.isArray(history) || history.length === 0) return [];

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    return history
      .filter(item => {
        const epochDate = item.epochGradeDate;
        if (!epochDate) return false;
        const date = new Date(epochDate * 1000);
        return date >= thirtyDaysAgo;
      })
      .map(item => {
        const action = this.determineAction(item.action);
        const impact = this.calculateActionImpact(action, item.toGrade);

        return {
          date: new Date(item.epochGradeDate * 1000),
          firm: item.firm || 'Unknown',
          action,
          fromGrade: item.fromGrade || '',
          toGrade: item.toGrade || '',
          impact,
        };
      })
      .slice(0, 10);
  },

  /**
   * Determina el tipo de acción del analista
   */
  determineAction(action: string): 'upgrade' | 'downgrade' | 'maintain' | 'init' {
    const actionLower = (action || '').toLowerCase();

    if (actionLower.includes('up') || actionLower === 'upgrade') return 'upgrade';
    if (actionLower.includes('down') || actionLower === 'downgrade') return 'downgrade';
    if (actionLower.includes('init') || actionLower === 'initiated') return 'init';
    return 'maintain';
  },

  /**
   * Calcula el impacto de una acción individual
   */
  calculateActionImpact(action: 'upgrade' | 'downgrade' | 'maintain' | 'init', toGrade: string): number {
    const gradeLower = (toGrade || '').toLowerCase();

    let baseImpact = 0;
    switch (action) {
      case 'upgrade': baseImpact = 30; break;
      case 'downgrade': baseImpact = -30; break;
      case 'init': baseImpact = 10; break;
      case 'maintain': baseImpact = 0; break;
    }

    if (gradeLower.includes('buy') || gradeLower.includes('outperform') || gradeLower.includes('overweight')) {
      baseImpact += 10;
    } else if (gradeLower.includes('sell') || gradeLower.includes('underperform') || gradeLower.includes('underweight')) {
      baseImpact -= 10;
    }

    return Math.max(-50, Math.min(50, baseImpact));
  },

  /**
   * Calcula el impacto combinado de todas las acciones de analistas
   */
  calculateAnalystActionsImpact(actions: AnalystAction[]): number {
    if (actions.length === 0) return 0;

    let weightedSum = 0;
    let totalWeight = 0;

    actions.forEach((action, index) => {
      const weight = 1 / (index + 1);
      weightedSum += action.impact * weight;
      totalWeight += weight;
    });

    return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  },

  /**
   * Genera un resumen textual de los eventos
   */
  generateSummary(
    earnings: EarningsEvent | null,
    dividend: DividendEvent | null,
    analystActions: AnalystAction[]
  ): string {
    const parts: string[] = [];

    if (earnings?.isUpcoming) {
      parts.push(`📅 Earnings en ${earnings.daysUntil} días (${earnings.quarter})`);
    }

    if (dividend?.isUpcoming) {
      parts.push(`💰 Ex-dividendo próximo`);
    }

    if (analystActions.length > 0) {
      const upgrades = analystActions.filter(a => a.action === 'upgrade').length;
      const downgrades = analystActions.filter(a => a.action === 'downgrade').length;

      if (upgrades > downgrades) {
        parts.push(`📈 ${upgrades} upgrades vs ${downgrades} downgrades (30d)`);
      } else if (downgrades > upgrades) {
        parts.push(`📉 ${downgrades} downgrades vs ${upgrades} upgrades (30d)`);
      } else if (upgrades > 0) {
        parts.push(`📊 ${upgrades} upgrades, ${downgrades} downgrades (30d)`);
      }
    }

    return parts.join(' | ') || 'Sin eventos corporativos relevantes';
  },

  /**
   * Obtiene el score para usar en predicciones
   */
  async getScore(symbol: string): Promise<number> {
    const events = await this.getCorporateEvents(symbol);
    return events?.overallImpact || 0;
  },

  /**
   * Verifica si hay earnings próximos (para uncertainty analysis)
   */
  async getEarningsProximity(symbol: string): Promise<number | undefined> {
    const events = await this.getCorporateEvents(symbol);
    return events?.nextEarningsDate?.daysUntil;
  },
};
