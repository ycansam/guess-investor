/**
 * Servicio de Expectativas del Mercado
 * 
 * Obtiene datos de earnings y expectativas de analistas de Yahoo Finance
 */

import { logger } from '../../middleware/logger.js';
import { yahooAuthService } from './yahoo-auth.service.js';

export interface ExpectationsData {
  symbol: string;
  
  // Próximo earnings
  nextEarningsDate: Date | null;
  daysUntilEarnings: number | null;
  
  // Earnings históricos
  lastEpsSurprise: number | null;  // % surprise último trimestre
  avgEpsSurprise: number | null;   // % promedio sorpresas
  beatRate: number;                 // % veces que superó estimaciones
  
  // Revisiones de analistas
  revisionTrend: 'up' | 'down' | 'stable' | 'unknown';
  
  // Risk level
  earningsRisk: 'high' | 'medium' | 'low';
  
  // Score combinado (-100 a +100)
  expectationsScore: number;
  hasData: boolean;
  summary: string;
}

// Cache en memoria
const cache = new Map<string, { data: ExpectationsData; timestamp: number }>();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hora

export const expectationsService = {
  async getExpectations(symbol: string): Promise<ExpectationsData | null> {
    // Las cryptos no tienen earnings
    if (symbol.includes('-USD') || symbol.includes('-EUR')) {
      return null;
    }

    // Verificar cache
    const cached = cache.get(symbol);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }

    try {
      // Obtener datos de Yahoo Finance quoteSummary con autenticación
      const modules = ['calendarEvents', 'earningsHistory', 'earningsTrend'];
      const result = await yahooAuthService.fetchQuoteSummary(symbol, modules);

      if (!result) {
        return this.getDefaultData(symbol);
      }

      const expectations = this.parseYahooData(symbol, result);
      cache.set(symbol, { data: expectations, timestamp: Date.now() });
      
      logger.info(`[Expectations] ${symbol}: score=${expectations.expectationsScore}, beatRate=${expectations.beatRate}%`);
      return expectations;
    } catch (error) {
      logger.error(`[Expectations] Error for ${symbol}:`, error);
      return this.getDefaultData(symbol);
    }
  },

  parseYahooData(symbol: string, data: any): ExpectationsData {
    const calendarEvents = data.calendarEvents;
    const earningsHistory = data.earningsHistory?.history || [];
    const earningsTrend = data.earningsTrend?.trend || [];

    // Próximo earnings
    let nextEarningsDate: Date | null = null;
    let daysUntilEarnings: number | null = null;
    
    // yahoo-finance2 devuelve Date directamente para earningsDate
    if (calendarEvents?.earnings?.earningsDate?.[0]) {
      const earningsDateValue = calendarEvents.earnings.earningsDate[0];
      // Puede ser un Date o un timestamp
      if (earningsDateValue instanceof Date) {
        nextEarningsDate = earningsDateValue;
      } else if (typeof earningsDateValue === 'number') {
        nextEarningsDate = new Date(earningsDateValue * 1000);
      }
      if (nextEarningsDate) {
        daysUntilEarnings = Math.ceil((nextEarningsDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      }
    }

    // Earnings surprise histórico
    let surprises: number[] = [];
    let beatCount = 0;
    
    for (const earning of earningsHistory.slice(0, 4)) {
      // yahoo-finance2 devuelve valores directamente
      const actual = earning.epsActual;
      const estimate = earning.epsEstimate;
      
      if (actual !== undefined && estimate !== undefined && estimate !== 0) {
        const surprise = ((actual - estimate) / Math.abs(estimate)) * 100;
        surprises.push(surprise);
        if (actual > estimate) beatCount++;
      }
    }

    const lastEpsSurprise = surprises.length > 0 ? surprises[0] : null;
    const avgEpsSurprise = surprises.length > 0 ? surprises.reduce((a, b) => a + b, 0) / surprises.length : null;
    const beatRate = earningsHistory.length > 0 ? (beatCount / Math.min(4, earningsHistory.length)) * 100 : 50;

    // Tendencia de revisiones
    let revisionTrend: 'up' | 'down' | 'stable' | 'unknown' = 'unknown';
    let revisionScore = 0;

    if (earningsTrend.length > 0) {
      const currentTrend = earningsTrend.find((t: any) => t.period === '0q');
      if (currentTrend) {
        // yahoo-finance2 devuelve valores directamente sin .raw
        const current = currentTrend.epsTrend?.current ?? 0;
        const weekAgo = currentTrend.epsTrend?.['7daysAgo'] ?? current;
        const monthAgo = currentTrend.epsTrend?.['30daysAgo'] ?? current;
        
        if (current > weekAgo && current > monthAgo) {
          revisionTrend = 'up';
          revisionScore = 30;
        } else if (current < weekAgo && current < monthAgo) {
          revisionTrend = 'down';
          revisionScore = -30;
        } else {
          revisionTrend = 'stable';
          revisionScore = 0;
        }
      }
    }

    // Risk level basado en proximidad de earnings
    let earningsRisk: 'high' | 'medium' | 'low' = 'low';
    let timingPenalty = 0;
    
    if (daysUntilEarnings !== null) {
      if (daysUntilEarnings <= 7) {
        earningsRisk = 'high';
        timingPenalty = -20; // Penalizar predicciones cerca de earnings
      } else if (daysUntilEarnings <= 21) {
        earningsRisk = 'medium';
        timingPenalty = -10;
      }
    }

    // Calcular score combinado (-100 a +100)
    let expectationsScore = 0;
    
    // Beat rate contribuye significativamente
    if (beatRate >= 75) expectationsScore += 30;
    else if (beatRate >= 50) expectationsScore += 10;
    else if (beatRate < 25) expectationsScore -= 30;
    else expectationsScore -= 10;

    // Surprise promedio
    if (avgEpsSurprise !== null) {
      if (avgEpsSurprise > 10) expectationsScore += 25;
      else if (avgEpsSurprise > 0) expectationsScore += 10;
      else if (avgEpsSurprise < -10) expectationsScore -= 25;
      else expectationsScore -= 10;
    }

    // Agregar revisiones y timing
    expectationsScore += revisionScore + timingPenalty;

    // Limitar a -100/+100
    expectationsScore = Math.max(-100, Math.min(100, expectationsScore));

    // Generar summary
    let summary = '';
    if (beatRate >= 75) {
      summary = `Historial sólido: supera estimaciones ${beatRate.toFixed(0)}% de las veces.`;
    } else if (beatRate < 50) {
      summary = `Historial débil: solo supera estimaciones ${beatRate.toFixed(0)}% de las veces.`;
    } else {
      summary = `Historial mixto: supera estimaciones ${beatRate.toFixed(0)}% de las veces.`;
    }

    if (daysUntilEarnings !== null && daysUntilEarnings <= 14) {
      summary += ` ⚠️ Earnings en ${daysUntilEarnings} días.`;
    }

    return {
      symbol,
      nextEarningsDate,
      daysUntilEarnings,
      lastEpsSurprise,
      avgEpsSurprise,
      beatRate,
      revisionTrend,
      earningsRisk,
      expectationsScore,
      hasData: true,
      summary,
    };
  },

  getDefaultData(symbol: string): ExpectationsData {
    return {
      symbol,
      nextEarningsDate: null,
      daysUntilEarnings: null,
      lastEpsSurprise: null,
      avgEpsSurprise: null,
      beatRate: 50,
      revisionTrend: 'unknown',
      earningsRisk: 'low',
      expectationsScore: 0,
      hasData: false,
      summary: 'Sin datos de expectativas disponibles.',
    };
  },
};
