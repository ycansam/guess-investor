/**
 * Economic Calendar Service
 * 
 * Eventos económicos que mueven mercados: FOMC, NFP, GDP, Earnings, etc.
 * Fuentes: Yahoo Finance, Trading Economics (fallback), datos estáticos conocidos.
 */

import { config } from '../../config/index.js';
import { logger } from '../../middleware/logger.js';

// ============================================================================
// TIPOS
// ============================================================================

export type EventImpact = 'high' | 'medium' | 'low';
export type EventCategory = 'central_bank' | 'employment' | 'inflation' | 'gdp' | 'earnings' | 'trade' | 'housing' | 'consumer' | 'manufacturing' | 'other';

export interface EconomicEvent {
  id: string;
  title: string;
  country: string;             // 'US', 'EU', 'UK', 'JP', 'CN' etc.
  countryFlag: string;         // Emoji flag
  date: string;                // ISO date
  time?: string;               // HH:MM UTC
  impact: EventImpact;
  category: EventCategory;
  previous?: string;           // Valor anterior
  forecast?: string;           // Valor esperado
  actual?: string;             // Valor real (si ya salió)
  description?: string;
  affectedAssets?: string[];   // Símbolos afectados
}

export interface EconomicCalendarData {
  today: EconomicEvent[];
  thisWeek: EconomicEvent[];
  nextWeek: EconomicEvent[];
  lastUpdated: string;
}

// ============================================================================
// CACHE
// ============================================================================

let calendarCache: { data: EconomicCalendarData | null; timestamp: number } = {
  data: null,
  timestamp: 0,
};
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutos

// ============================================================================
// EVENTOS RECURRENTES CONOCIDOS (base estática + enriquecimiento dinámico)
// ============================================================================

interface RecurringEvent {
  title: string;
  country: string;
  countryFlag: string;
  impact: EventImpact;
  category: EventCategory;
  description: string;
  affectedAssets: string[];
}

const KNOWN_HIGH_IMPACT_EVENTS: RecurringEvent[] = [
  {
    title: 'FOMC Interest Rate Decision',
    country: 'US',
    countryFlag: '🇺🇸',
    impact: 'high',
    category: 'central_bank',
    description: 'Federal Reserve interest rate decision and monetary policy statement',
    affectedAssets: ['SPY', 'QQQ', 'TLT', 'DXY', 'GLD'],
  },
  {
    title: 'Non-Farm Payrolls (NFP)',
    country: 'US',
    countryFlag: '🇺🇸',
    impact: 'high',
    category: 'employment',
    description: 'Monthly employment report - key labor market indicator',
    affectedAssets: ['SPY', 'DXY', 'GLD', 'TLT'],
  },
  {
    title: 'CPI (Consumer Price Index)',
    country: 'US',
    countryFlag: '🇺🇸',
    impact: 'high',
    category: 'inflation',
    description: 'Monthly inflation data - drives Fed policy expectations',
    affectedAssets: ['SPY', 'QQQ', 'TLT', 'GLD', 'DXY'],
  },
  {
    title: 'GDP (Gross Domestic Product)',
    country: 'US',
    countryFlag: '🇺🇸',
    impact: 'high',
    category: 'gdp',
    description: 'Quarterly economic growth report',
    affectedAssets: ['SPY', 'QQQ', 'DXY'],
  },
  {
    title: 'PPI (Producer Price Index)',
    country: 'US',
    countryFlag: '🇺🇸',
    impact: 'medium',
    category: 'inflation',
    description: 'Production-side inflation measure',
    affectedAssets: ['SPY', 'TLT', 'DXY'],
  },
  {
    title: 'Initial Jobless Claims',
    country: 'US',
    countryFlag: '🇺🇸',
    impact: 'medium',
    category: 'employment',
    description: 'Weekly unemployment claims - labor market health',
    affectedAssets: ['SPY', 'DXY'],
  },
  {
    title: 'Retail Sales',
    country: 'US',
    countryFlag: '🇺🇸',
    impact: 'medium',
    category: 'consumer',
    description: 'Monthly consumer spending data',
    affectedAssets: ['SPY', 'XLY', 'XRT'],
  },
  {
    title: 'ISM Manufacturing PMI',
    country: 'US',
    countryFlag: '🇺🇸',
    impact: 'medium',
    category: 'manufacturing',
    description: 'Manufacturing sector activity index',
    affectedAssets: ['SPY', 'XLI', 'DXY'],
  },
  {
    title: 'ISM Services PMI',
    country: 'US',
    countryFlag: '🇺🇸',
    impact: 'medium',
    category: 'manufacturing',
    description: 'Services sector activity index',
    affectedAssets: ['SPY', 'QQQ'],
  },
  {
    title: 'Housing Starts & Building Permits',
    country: 'US',
    countryFlag: '🇺🇸',
    impact: 'low',
    category: 'housing',
    description: 'New housing construction data',
    affectedAssets: ['XHB', 'ITB', 'SPY'],
  },
  {
    title: 'Consumer Confidence',
    country: 'US',
    countryFlag: '🇺🇸',
    impact: 'medium',
    category: 'consumer',
    description: 'Consumer sentiment and spending outlook',
    affectedAssets: ['SPY', 'XLY'],
  },
  {
    title: 'ECB Interest Rate Decision',
    country: 'EU',
    countryFlag: '🇪🇺',
    impact: 'high',
    category: 'central_bank',
    description: 'European Central Bank monetary policy decision',
    affectedAssets: ['EWG', 'FEZ', 'EURUSD=X'],
  },
  {
    title: 'BOE Interest Rate Decision',
    country: 'UK',
    countryFlag: '🇬🇧',
    impact: 'high',
    category: 'central_bank',
    description: 'Bank of England monetary policy decision',
    affectedAssets: ['EWU', 'GBPUSD=X'],
  },
  {
    title: 'BOJ Interest Rate Decision',
    country: 'JP',
    countryFlag: '🇯🇵',
    impact: 'high',
    category: 'central_bank',
    description: 'Bank of Japan monetary policy decision',
    affectedAssets: ['EWJ', 'USDJPY=X'],
  },
  {
    title: 'China PMI (Manufacturing)',
    country: 'CN',
    countryFlag: '🇨🇳',
    impact: 'medium',
    category: 'manufacturing',
    description: 'Chinese manufacturing activity - global demand indicator',
    affectedAssets: ['FXI', 'KWEB', 'BABA'],
  },
  {
    title: 'Trade Balance',
    country: 'US',
    countryFlag: '🇺🇸',
    impact: 'low',
    category: 'trade',
    description: 'Monthly trade deficit/surplus data',
    affectedAssets: ['DXY', 'SPY'],
  },
  {
    title: 'Core PCE Price Index',
    country: 'US',
    countryFlag: '🇺🇸',
    impact: 'high',
    category: 'inflation',
    description: "Fed's preferred inflation measure",
    affectedAssets: ['SPY', 'QQQ', 'TLT', 'GLD', 'DXY'],
  },
  {
    title: 'JOLTS Job Openings',
    country: 'US',
    countryFlag: '🇺🇸',
    impact: 'medium',
    category: 'employment',
    description: 'Job openings and labor turnover survey',
    affectedAssets: ['SPY', 'DXY'],
  },
  {
    title: 'Durable Goods Orders',
    country: 'US',
    countryFlag: '🇺🇸',
    impact: 'medium',
    category: 'manufacturing',
    description: 'Orders for long-lasting goods - business investment indicator',
    affectedAssets: ['SPY', 'XLI'],
  },
];

// ============================================================================
// SERVICIO
// ============================================================================

class EconomicCalendarService {

  /**
   * Obtener calendario económico completo
   */
  async getCalendar(): Promise<EconomicCalendarData> {
    // Check cache
    if (calendarCache.data && (Date.now() - calendarCache.timestamp) < CACHE_DURATION) {
      return calendarCache.data;
    }

    try {
      logger.info('[EconomicCalendar] Fetching calendar data...');
      
      // Intentar obtener datos de API externa
      let events = await this.fetchFromYahooFinance();
      
      // Si no hay suficientes datos, enriquecer con eventos conocidos
      if (events.length < 5) {
        logger.info('[EconomicCalendar] Enriching with known recurring events');
        events = this.enrichWithKnownEvents(events);
      }

      // Separar por período
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfWeek = new Date(today);
      endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
      const endOfNextWeek = new Date(endOfWeek);
      endOfNextWeek.setDate(endOfWeek.getDate() + 7);

      const todayEvents = events.filter(e => {
        const eventDate = new Date(e.date);
        return eventDate.toDateString() === today.toDateString();
      });

      const thisWeekEvents = events.filter(e => {
        const eventDate = new Date(e.date);
        return eventDate >= today && eventDate < endOfWeek;
      });

      const nextWeekEvents = events.filter(e => {
        const eventDate = new Date(e.date);
        return eventDate >= endOfWeek && eventDate < endOfNextWeek;
      });

      // Sort by time within each group
      const sortByDate = (a: EconomicEvent, b: EconomicEvent) => {
        const dateCompare = new Date(a.date).getTime() - new Date(b.date).getTime();
        if (dateCompare !== 0) return dateCompare;
        // High impact first
        const impactOrder: Record<EventImpact, number> = { high: 0, medium: 1, low: 2 };
        return impactOrder[a.impact] - impactOrder[b.impact];
      };

      const data: EconomicCalendarData = {
        today: todayEvents.sort(sortByDate),
        thisWeek: thisWeekEvents.sort(sortByDate),
        nextWeek: nextWeekEvents.sort(sortByDate),
        lastUpdated: new Date().toISOString(),
      };

      calendarCache = { data, timestamp: Date.now() };
      logger.info(`[EconomicCalendar] Loaded ${events.length} events (today: ${todayEvents.length}, week: ${thisWeekEvents.length}, next: ${nextWeekEvents.length})`);
      
      return data;
    } catch (error) {
      logger.error('[EconomicCalendar] Error:', error);
      
      // Return from cache if available even if stale
      if (calendarCache.data) {
        return calendarCache.data;
      }

      // Last resort: generate from known events
      return this.generateFromKnownEvents();
    }
  }

  /**
   * Fetch calendar from Yahoo Finance / RapidAPI
   */
  private async fetchFromYahooFinance(): Promise<EconomicEvent[]> {
    try {
      if (!config.rapidApiKey) {
        logger.warn('[EconomicCalendar] No RapidAPI key configured');
        return [];
      }

      const response = await fetch('https://yahoo-finance15.p.rapidapi.com/api/v1/markets/events', {
        headers: {
          'x-rapidapi-key': config.rapidApiKey,
          'x-rapidapi-host': 'yahoo-finance15.p.rapidapi.com',
        },
      });

      if (!response.ok) {
        logger.warn(`[EconomicCalendar] Yahoo API returned ${response.status}`);
        return [];
      }

      const data = await response.json();
      
      if (!data?.body || !Array.isArray(data.body)) {
        return [];
      }

      return data.body.map((event: any, index: number) => this.mapYahooEvent(event, index)).filter(Boolean);
    } catch (error) {
      logger.warn('[EconomicCalendar] Yahoo Finance fetch failed:', error);
      return [];
    }
  }

  /**
   * Map Yahoo Finance event to our format
   */
  private mapYahooEvent(event: any, index: number): EconomicEvent | null {
    try {
      const title = event.title || event.eventName || event.name || '';
      if (!title) return null;

      return {
        id: `yahoo-${index}-${Date.now()}`,
        title,
        country: this.detectCountry(title),
        countryFlag: this.getCountryFlag(this.detectCountry(title)),
        date: event.date || event.startDate || new Date().toISOString(),
        time: event.time,
        impact: this.classifyImpact(title),
        category: this.classifyCategory(title),
        previous: event.previous?.toString(),
        forecast: event.forecast?.toString() || event.estimate?.toString(),
        actual: event.actual?.toString(),
        description: event.description,
      };
    } catch {
      return null;
    }
  }

  /**
   * Detectar país del evento por título
   */
  private detectCountry(title: string): string {
    const upper = title.toUpperCase();
    if (upper.includes('ECB') || upper.includes('EUROZONE') || upper.includes('EU ')) return 'EU';
    if (upper.includes('BOE') || upper.includes('UK ') || upper.includes('BRITAIN')) return 'UK';
    if (upper.includes('BOJ') || upper.includes('JAPAN')) return 'JP';
    if (upper.includes('CHINA') || upper.includes('CHINESE') || upper.includes('PBOC')) return 'CN';
    if (upper.includes('CANADA') || upper.includes('BOC ')) return 'CA';
    if (upper.includes('AUSTRALIA') || upper.includes('RBA')) return 'AU';
    return 'US';
  }

  /**
   * Obtener emoji de bandera
   */
  private getCountryFlag(country: string): string {
    const flags: Record<string, string> = {
      'US': '🇺🇸', 'EU': '🇪🇺', 'UK': '🇬🇧', 'JP': '🇯🇵',
      'CN': '🇨🇳', 'CA': '🇨🇦', 'AU': '🇦🇺', 'CH': '🇨🇭',
    };
    return flags[country] || '🌍';
  }

  /**
   * Clasificar impacto por título
   */
  private classifyImpact(title: string): EventImpact {
    const upper = title.toUpperCase();
    const highImpact = [
      'FOMC', 'RATE DECISION', 'NON-FARM', 'NFP', 'CPI', 'GDP',
      'CORE PCE', 'FED CHAIR', 'POWELL', 'ECB', 'BOE', 'BOJ',
    ];
    const mediumImpact = [
      'PPI', 'RETAIL SALES', 'JOBLESS CLAIMS', 'PMI', 'ISM',
      'CONSUMER CONFIDENCE', 'DURABLE GOODS', 'JOLTS', 'ADP',
    ];

    if (highImpact.some(kw => upper.includes(kw))) return 'high';
    if (mediumImpact.some(kw => upper.includes(kw))) return 'medium';
    return 'low';
  }

  /**
   * Clasificar categoría
   */
  private classifyCategory(title: string): EventCategory {
    const upper = title.toUpperCase();
    if (/FOMC|RATE|FED|ECB|BOE|BOJ|CENTRAL BANK|POWELL|LAGARDE/i.test(upper)) return 'central_bank';
    if (/NFP|PAYROLL|EMPLOYMENT|JOBLESS|UNEMPLOYMENT|JOLTS|ADP|LABOR/i.test(upper)) return 'employment';
    if (/CPI|PPI|INFLATION|PCE|PRICE INDEX/i.test(upper)) return 'inflation';
    if (/GDP|GROSS DOMESTIC/i.test(upper)) return 'gdp';
    if (/EARNINGS|REVENUE|EPS|QUARTERLY RESULTS/i.test(upper)) return 'earnings';
    if (/TRADE|EXPORT|IMPORT|TARIFF/i.test(upper)) return 'trade';
    if (/HOUSING|HOME|BUILDING PERMIT|CONSTRUCTION/i.test(upper)) return 'housing';
    if (/CONSUMER|RETAIL|SPENDING|SENTIMENT/i.test(upper)) return 'consumer';
    if (/PMI|ISM|MANUFACTURING|INDUSTRIAL|DURABLE/i.test(upper)) return 'manufacturing';
    return 'other';
  }

  /**
   * Enriquecer datos con eventos recurrentes conocidos
   */
  private enrichWithKnownEvents(existing: EconomicEvent[]): EconomicEvent[] {
    const now = new Date();
    const events = [...existing];
    const existingTitles = new Set(existing.map(e => e.title.toUpperCase()));

    // Generar eventos para las próximas 2 semanas basándose en patrones conocidos
    for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
      const date = new Date(now);
      date.setDate(date.getDate() + dayOffset);
      
      const dayOfWeek = date.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) continue; // Skip weekends

      const weekOfMonth = Math.ceil(date.getDate() / 7);
      const dateStr = date.toISOString().split('T')[0];

      // NFP: primer viernes del mes
      if (dayOfWeek === 5 && weekOfMonth === 1) {
        this.addIfNotExists(events, existingTitles, {
          ...KNOWN_HIGH_IMPACT_EVENTS.find(e => e.title.includes('Non-Farm'))!,
          id: `known-nfp-${dateStr}`,
          date: dateStr,
          time: '13:30',
        });
      }

      // CPI: normalmente segundo martes/miércoles del mes
      if ((dayOfWeek === 2 || dayOfWeek === 3) && weekOfMonth === 2) {
        this.addIfNotExists(events, existingTitles, {
          ...KNOWN_HIGH_IMPACT_EVENTS.find(e => e.title.includes('CPI'))!,
          id: `known-cpi-${dateStr}`,
          date: dateStr,
          time: '13:30',
        });
      }

      // Initial Jobless Claims: cada jueves
      if (dayOfWeek === 4) {
        this.addIfNotExists(events, existingTitles, {
          ...KNOWN_HIGH_IMPACT_EVENTS.find(e => e.title.includes('Initial Jobless'))!,
          id: `known-claims-${dateStr}`,
          date: dateStr,
          time: '13:30',
        });
      }

      // Retail Sales: normalmente tercer miércoles
      if (dayOfWeek === 3 && weekOfMonth === 3) {
        this.addIfNotExists(events, existingTitles, {
          ...KNOWN_HIGH_IMPACT_EVENTS.find(e => e.title.includes('Retail Sales'))!,
          id: `known-retail-${dateStr}`,
          date: dateStr,
          time: '13:30',
        });
      }

      // ISM Manufacturing PMI: primer día laborable del mes
      if (date.getDate() <= 3 && dayOfWeek >= 1 && dayOfWeek <= 5) {
        this.addIfNotExists(events, existingTitles, {
          ...KNOWN_HIGH_IMPACT_EVENTS.find(e => e.title.includes('ISM Manufacturing'))!,
          id: `known-ism-${dateStr}`,
          date: dateStr,
          time: '15:00',
        });
      }

      // Consumer Confidence: último martes del mes
      if (dayOfWeek === 2 && date.getDate() >= 25) {
        this.addIfNotExists(events, existingTitles, {
          ...KNOWN_HIGH_IMPACT_EVENTS.find(e => e.title.includes('Consumer Confidence'))!,
          id: `known-conconf-${dateStr}`,
          date: dateStr,
          time: '15:00',
        });
      }
    }

    return events;
  }

  /**
   * Helper para añadir evento si no existe ya
   */
  private addIfNotExists(
    events: EconomicEvent[],
    existingTitles: Set<string>,
    event: RecurringEvent & { id: string; date: string; time?: string }
  ) {
    const { id, date, time, title, country, countryFlag, impact, category, description, affectedAssets } = event;
    if (!existingTitles.has(title.toUpperCase())) {
      events.push({
        id,
        title,
        country,
        countryFlag,
        date,
        time,
        impact,
        category,
        description,
        affectedAssets,
      });
      existingTitles.add(title.toUpperCase());
    }
  }

  /**
   * Generar calendario completo desde eventos conocidos (fallback)
   */
  private generateFromKnownEvents(): EconomicCalendarData {
    const events = this.enrichWithKnownEvents([]);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfWeek = new Date(today);
    endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
    const endOfNextWeek = new Date(endOfWeek);
    endOfNextWeek.setDate(endOfWeek.getDate() + 7);

    const sortByDate = (a: EconomicEvent, b: EconomicEvent) => {
      const dateCompare = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (dateCompare !== 0) return dateCompare;
      const impactOrder: Record<EventImpact, number> = { high: 0, medium: 1, low: 2 };
      return impactOrder[a.impact] - impactOrder[b.impact];
    };

    return {
      today: events.filter(e => new Date(e.date).toDateString() === today.toDateString()).sort(sortByDate),
      thisWeek: events.filter(e => { const d = new Date(e.date); return d >= today && d < endOfWeek; }).sort(sortByDate),
      nextWeek: events.filter(e => { const d = new Date(e.date); return d >= endOfWeek && d < endOfNextWeek; }).sort(sortByDate),
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Limpiar cache
   */
  clearCache() {
    calendarCache = { data: null, timestamp: 0 };
    logger.info('[EconomicCalendar] Cache cleared');
  }
}

export const economicCalendarService = new EconomicCalendarService();
