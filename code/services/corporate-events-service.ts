/**
 * Servicio para obtener eventos corporativos
 * - Calendario de earnings (próximas fechas de resultados)
 * - Dividendos
 * - Splits
 * - Upgrades/Downgrades de analistas
 * 
 * Usa Yahoo Finance quoteSummary módulos: calendarEvents, upgradeDowngradeHistory
 */

import { fetchWithCorsProxy } from './cors-proxy';

export interface EarningsEvent {
  date: Date;
  daysUntil: number;
  isUpcoming: boolean; // true si es en los próximos 30 días
  quarter: string; // "Q1 2025", etc.
  estimatedEPS: number | null;
  revenueEstimate: number | null;
}

export interface DividendEvent {
  exDate: Date | null;
  payDate: Date | null;
  amount: number | null;
  yield: number | null;
  isUpcoming: boolean; // ex-date en próximos 30 días
}

export interface SplitEvent {
  date: Date | null;
  ratio: string | null; // "4:1", "2:1", etc.
  isRecent: boolean; // en últimos 90 días
}

export interface AnalystAction {
  date: Date;
  firm: string;
  action: 'upgrade' | 'downgrade' | 'maintain' | 'init';
  fromGrade: string;
  toGrade: string;
  impact: number; // -100 a +100
}

export interface CorporateEvents {
  symbol: string;
  
  // Earnings
  nextEarningsDate: EarningsEvent | null;
  earningsImpact: number; // -50 a +50 (negativo si earnings cercanos = incertidumbre)
  
  // Dividendos
  dividend: DividendEvent | null;
  dividendImpact: number; // 0 a +30 (positivo si hay dividendo próximo)
  
  // Splits
  recentSplit: SplitEvent | null;
  splitImpact: number; // -20 a +20
  
  // Analyst actions (últimos 30 días)
  recentAnalystActions: AnalystAction[];
  analystActionsImpact: number; // -50 a +50
  
  // Score total
  overallImpact: number; // -100 a +100
  summary: string;
}

// Caché
interface CacheEntry {
  data: CorporateEvents;
  timestamp: number;
}
const eventsCache = new Map<string, CacheEntry>();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutos

class CorporateEventsService {
  /**
   * Obtiene eventos corporativos para un símbolo
   */
  async getCorporateEvents(symbol: string): Promise<CorporateEvents | null> {
    // Las cryptos no tienen eventos corporativos
    if (symbol.includes('-EUR') || symbol.includes('-USD')) {
      console.log(`[CorporateEvents] ${symbol} es crypto, no tiene eventos corporativos`);
      return null;
    }
    
    // Verificar caché
    const cached = eventsCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`[CorporateEvents] Usando caché para ${symbol}`);
      return cached.data;
    }

    try {
      console.log(`[CorporateEvents] Obteniendo eventos corporativos para ${symbol}`);
      
      const modules = [
        'calendarEvents',
        'upgradeDowngradeHistory'
      ].join(',');
      
      const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}`;
      
      const response = await fetchWithCorsProxy(url, {
        signal: AbortSignal.timeout(15000),
      });
      
      const data = await response.json();
      const result = data.quoteSummary?.result?.[0];
      
      if (!result) {
        console.log(`[CorporateEvents] No hay datos para ${symbol}`);
        return null;
      }
      
      const events = this.parseEvents(symbol, result);
      
      // Guardar en caché
      eventsCache.set(symbol, { data: events, timestamp: Date.now() });
      
      return events;
      
    } catch (error: any) {
      console.error(`[CorporateEvents] Error para ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Parsea los eventos desde la respuesta de Yahoo Finance
   */
  private parseEvents(symbol: string, result: any): CorporateEvents {
    const calendar = result.calendarEvents || {};
    const upgrades = result.upgradeDowngradeHistory?.history || [];
    
    // Parsear earnings
    const nextEarningsDate = this.parseEarningsDate(calendar);
    const earningsImpact = this.calculateEarningsImpact(nextEarningsDate);
    
    // Parsear dividendos
    const dividend = this.parseDividend(calendar);
    const dividendImpact = this.calculateDividendImpact(dividend);
    
    // Parsear splits
    const recentSplit = this.parseSplit(calendar);
    const splitImpact = this.calculateSplitImpact(recentSplit);
    
    // Parsear acciones de analistas
    const recentAnalystActions = this.parseAnalystActions(upgrades);
    const analystActionsImpact = this.calculateAnalystActionsImpact(recentAnalystActions);
    
    // Calcular impacto total
    const overallImpact = Math.round(
      earningsImpact * 0.3 + 
      dividendImpact * 0.2 + 
      splitImpact * 0.1 + 
      analystActionsImpact * 0.4
    );
    
    // Generar resumen
    const summary = this.generateSummary(nextEarningsDate, dividend, recentSplit, recentAnalystActions);
    
    return {
      symbol,
      nextEarningsDate,
      earningsImpact,
      dividend,
      dividendImpact,
      recentSplit,
      splitImpact,
      recentAnalystActions,
      analystActionsImpact,
      overallImpact,
      summary
    };
  }

  /**
   * Parsea la fecha del próximo earnings
   */
  private parseEarningsDate(calendar: any): EarningsEvent | null {
    const earnings = calendar.earnings;
    if (!earnings) return null;
    
    // earningsDate puede ser un array con fechas estimadas
    const earningsDates = earnings.earningsDate || [];
    if (earningsDates.length === 0) return null;
    
    const rawDate = earningsDates[0]?.raw;
    if (!rawDate) return null;
    
    const date = new Date(rawDate * 1000);
    const now = new Date();
    const daysUntil = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    // Determinar trimestre
    const month = date.getMonth();
    const year = date.getFullYear();
    const quarter = `Q${Math.ceil((month + 1) / 3)} ${year}`;
    
    return {
      date,
      daysUntil,
      isUpcoming: daysUntil > 0 && daysUntil <= 30,
      quarter,
      estimatedEPS: earnings.earningsAverage?.raw ?? null,
      revenueEstimate: earnings.revenueAverage?.raw ?? null
    };
  }

  /**
   * Calcula el impacto de earnings cercanos
   * Earnings muy cercanos = incertidumbre = impacto negativo leve
   */
  private calculateEarningsImpact(earnings: EarningsEvent | null): number {
    if (!earnings) return 0;
    
    const { daysUntil, isUpcoming } = earnings;
    
    if (!isUpcoming) return 0;
    
    // Earnings en 1-3 días: alta incertidumbre (-30)
    // Earnings en 4-7 días: incertidumbre moderada (-20)
    // Earnings en 8-14 días: incertidumbre leve (-10)
    // Earnings en 15-30 días: anticipación neutral (0)
    
    if (daysUntil <= 3) return -30;
    if (daysUntil <= 7) return -20;
    if (daysUntil <= 14) return -10;
    return 0;
  }

  /**
   * Parsea información de dividendos
   */
  private parseDividend(calendar: any): DividendEvent | null {
    const exDate = calendar.exDividendDate?.raw;
    const dividendDate = calendar.dividendDate?.raw;
    
    if (!exDate && !dividendDate) return null;
    
    const exDateObj = exDate ? new Date(exDate * 1000) : null;
    const payDateObj = dividendDate ? new Date(dividendDate * 1000) : null;
    
    const now = new Date();
    const isUpcoming = exDateObj ? 
      (exDateObj.getTime() > now.getTime() && 
       (exDateObj.getTime() - now.getTime()) / (1000 * 60 * 60 * 24) <= 30) : 
      false;
    
    return {
      exDate: exDateObj,
      payDate: payDateObj,
      amount: null, // No disponible en calendarEvents
      yield: null,
      isUpcoming
    };
  }

  /**
   * Calcula el impacto de dividendos próximos
   */
  private calculateDividendImpact(dividend: DividendEvent | null): number {
    if (!dividend || !dividend.isUpcoming) return 0;
    
    // Dividendo próximo es ligeramente positivo
    return 15;
  }

  /**
   * Parsea información de splits recientes
   */
  private parseSplit(calendar: any): SplitEvent | null {
    // Yahoo Finance no siempre tiene splits en calendarEvents
    // Esto requeriría otro endpoint o datos históricos
    return null;
  }

  /**
   * Calcula el impacto de splits
   */
  private calculateSplitImpact(split: SplitEvent | null): number {
    if (!split || !split.isRecent) return 0;
    
    // Splits recientes suelen ser ligeramente positivos (accesibilidad)
    return 10;
  }

  /**
   * Parsea acciones de analistas de los últimos 30 días
   */
  private parseAnalystActions(history: any[]): AnalystAction[] {
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
          impact
        };
      })
      .slice(0, 10); // Máximo 10 acciones recientes
  }

  /**
   * Determina el tipo de acción del analista
   */
  private determineAction(action: string): 'upgrade' | 'downgrade' | 'maintain' | 'init' {
    const actionLower = (action || '').toLowerCase();
    
    if (actionLower.includes('up') || actionLower === 'upgrade') return 'upgrade';
    if (actionLower.includes('down') || actionLower === 'downgrade') return 'downgrade';
    if (actionLower.includes('init') || actionLower === 'initiated') return 'init';
    return 'maintain';
  }

  /**
   * Calcula el impacto de una acción individual
   */
  private calculateActionImpact(action: 'upgrade' | 'downgrade' | 'maintain' | 'init', toGrade: string): number {
    const gradeLower = (toGrade || '').toLowerCase();
    
    // Base por tipo de acción
    let baseImpact = 0;
    switch (action) {
      case 'upgrade': baseImpact = 30; break;
      case 'downgrade': baseImpact = -30; break;
      case 'init': baseImpact = 10; break;
      case 'maintain': baseImpact = 0; break;
    }
    
    // Modificar por rating destino
    if (gradeLower.includes('buy') || gradeLower.includes('outperform') || gradeLower.includes('overweight')) {
      baseImpact += 10;
    } else if (gradeLower.includes('sell') || gradeLower.includes('underperform') || gradeLower.includes('underweight')) {
      baseImpact -= 10;
    }
    
    return Math.max(-50, Math.min(50, baseImpact));
  }

  /**
   * Calcula el impacto combinado de todas las acciones de analistas
   */
  private calculateAnalystActionsImpact(actions: AnalystAction[]): number {
    if (actions.length === 0) return 0;
    
    // Promedio ponderado (acciones más recientes pesan más)
    let weightedSum = 0;
    let totalWeight = 0;
    
    actions.forEach((action, index) => {
      const weight = 1 / (index + 1); // Primera acción pesa más
      weightedSum += action.impact * weight;
      totalWeight += weight;
    });
    
    return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  }

  /**
   * Genera un resumen textual de los eventos
   */
  private generateSummary(
    earnings: EarningsEvent | null,
    dividend: DividendEvent | null,
    split: SplitEvent | null,
    analystActions: AnalystAction[]
  ): string {
    const parts: string[] = [];
    
    if (earnings?.isUpcoming) {
      parts.push(`📅 Earnings en ${earnings.daysUntil} días (${earnings.quarter})`);
    }
    
    if (dividend?.isUpcoming) {
      parts.push(`💰 Ex-dividendo próximo`);
    }
    
    if (split?.isRecent) {
      parts.push(`📊 Split reciente ${split.ratio}`);
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
  }

  /**
   * Formatea para el prompt de IA
   */
  formatForAI(events: CorporateEvents | null): string {
    if (!events) return 'CORPORATE_EVENTS: No disponible (crypto o sin datos)';
    
    const lines: string[] = ['CORPORATE_EVENTS:'];
    
    if (events.nextEarningsDate) {
      const e = events.nextEarningsDate;
      lines.push(`  Earnings: ${e.quarter} en ${e.daysUntil} días ${e.isUpcoming ? '⚠️ PRÓXIMO' : ''}`);
      if (e.estimatedEPS) lines.push(`    EPS estimado: $${e.estimatedEPS.toFixed(2)}`);
    }
    
    if (events.dividend?.isUpcoming) {
      lines.push(`  Dividendo: Ex-date próximo`);
    }
    
    if (events.recentAnalystActions.length > 0) {
      lines.push(`  Analistas (30d): ${events.recentAnalystActions.length} acciones`);
      events.recentAnalystActions.slice(0, 3).forEach(a => {
        const emoji = a.action === 'upgrade' ? '⬆️' : a.action === 'downgrade' ? '⬇️' : '➡️';
        lines.push(`    ${emoji} ${a.firm}: ${a.action} → ${a.toGrade}`);
      });
    }
    
    lines.push(`  Impacto total: ${events.overallImpact > 0 ? '+' : ''}${events.overallImpact}`);
    
    return lines.join('\n');
  }
}

export const corporateEventsService = new CorporateEventsService();
