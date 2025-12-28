/**
 * Servicio de Estacionalidad del Mercado
 * 
 * Analiza patrones estacionales que afectan a diferentes sectores:
 * - Retail: Rebajas, Black Friday, Navidad
 * - Turismo: Temporada alta/baja
 * - Energía: Demanda estacional
 * - General: Sell in May, Rally Santa Claus, etc.
 */

import { logger } from '../../middleware/logger.js';

export interface SeasonalEvent {
  name: string;
  type: 'positive' | 'negative' | 'neutral';
  impact: 'high' | 'medium' | 'low';
  daysUntil: number;
  description: string;
}

export interface SeasonalityAnalysis {
  sector: string;
  region: string;
  events: SeasonalEvent[];
  seasonalScore: number; // -100 a +100
  hasData: boolean;
  summary: string;
}

// Mapeo de sufijos de bolsa a región
const EXCHANGE_TO_REGION: Record<string, string> = {
  '.MC': 'spain', '.MA': 'spain',
  '': 'usa', '.US': 'usa',
  '.MX': 'mexico',
  '.SS': 'china', '.SZ': 'china', '.HK': 'china',
  '.T': 'japan',
  '.L': 'uk',
  '.DE': 'germany', '.F': 'germany',
  '.PA': 'france',
};

// Sectores por símbolo conocido
const SYMBOL_SECTORS: Record<string, string> = {
  // Retail/Fashion
  'ITX.MC': 'retail', 'AMZN': 'retail', 'WMT': 'retail', 'TGT': 'retail',
  // Tech
  'AAPL': 'technology', 'MSFT': 'technology', 'GOOGL': 'technology', 
  'META': 'technology', 'NVDA': 'technology', 'AMD': 'technology',
  // Finance
  'JPM': 'finance', 'BAC': 'finance', 'GS': 'finance', 'MS': 'finance',
  // Energy
  'XOM': 'energy', 'CVX': 'energy', 'COP': 'energy',
  // Travel
  'UAL': 'travel', 'DAL': 'travel', 'AAL': 'travel', 'MAR': 'travel',
  // Crypto
  'BTC-USD': 'crypto', 'ETH-USD': 'crypto',
};

interface SeasonalPattern {
  name: string;
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
  sectors: string[] | 'all';
  impact: number; // -100 a +100
  description: string;
}

// Patrones estacionales globales
const SEASONAL_PATTERNS: SeasonalPattern[] = [
  // Retail
  {
    name: 'Black Friday/Cyber Monday',
    startMonth: 11, startDay: 20,
    endMonth: 12, endDay: 2,
    sectors: ['retail'],
    impact: 60,
    description: 'Mayor período de ventas del año para retail',
  },
  {
    name: 'Temporada Navideña',
    startMonth: 12, startDay: 1,
    endMonth: 12, endDay: 26,
    sectors: ['retail'],
    impact: 50,
    description: 'Compras navideñas impulsan ventas retail',
  },
  {
    name: 'Rebajas de Enero',
    startMonth: 1, startDay: 2,
    endMonth: 1, endDay: 31,
    sectors: ['retail'],
    impact: 20,
    description: 'Temporada de rebajas post-navidad',
  },
  // General
  {
    name: 'Rally de Santa Claus',
    startMonth: 12, startDay: 24,
    endMonth: 1, endDay: 3,
    sectors: 'all',
    impact: 25,
    description: 'Tendencia alcista histórica en últimos días del año',
  },
  {
    name: 'Sell in May',
    startMonth: 5, startDay: 1,
    endMonth: 5, endDay: 31,
    sectors: 'all',
    impact: -15,
    description: '"Sell in May and go away" - históricamente meses débiles',
  },
  {
    name: 'Efecto Septiembre',
    startMonth: 9, startDay: 1,
    endMonth: 9, endDay: 30,
    sectors: 'all',
    impact: -20,
    description: 'Septiembre históricamente el peor mes para acciones',
  },
  {
    name: 'Efecto Enero',
    startMonth: 1, startDay: 1,
    endMonth: 1, endDay: 15,
    sectors: 'all',
    impact: 15,
    description: 'Tendencia alcista histórica a inicio de año',
  },
  // Earnings Season
  {
    name: 'Temporada de Earnings Q4',
    startMonth: 1, startDay: 10,
    endMonth: 2, endDay: 15,
    sectors: ['technology', 'finance'],
    impact: 10,
    description: 'Reportes de resultados Q4 - alta volatilidad',
  },
  {
    name: 'Temporada de Earnings Q1',
    startMonth: 4, startDay: 10,
    endMonth: 5, endDay: 15,
    sectors: ['technology', 'finance'],
    impact: 10,
    description: 'Reportes de resultados Q1 - alta volatilidad',
  },
  // Travel
  {
    name: 'Temporada Alta Turismo',
    startMonth: 6, startDay: 15,
    endMonth: 8, endDay: 31,
    sectors: ['travel'],
    impact: 40,
    description: 'Verano - pico de viajes y turismo',
  },
  {
    name: 'Temporada Baja Turismo',
    startMonth: 9, startDay: 15,
    endMonth: 11, endDay: 15,
    sectors: ['travel'],
    impact: -20,
    description: 'Otoño - menor actividad turística',
  },
  // Energy
  {
    name: 'Demanda Calefacción',
    startMonth: 11, startDay: 1,
    endMonth: 2, endDay: 28,
    sectors: ['energy'],
    impact: 25,
    description: 'Invierno - mayor demanda de energía',
  },
  {
    name: 'Driving Season',
    startMonth: 5, startDay: 20,
    endMonth: 9, endDay: 5,
    sectors: ['energy'],
    impact: 20,
    description: 'Temporada de viajes en auto - demanda de gasolina',
  },
  // Crypto
  {
    name: 'Halving Aftermath',
    startMonth: 4, startDay: 1,
    endMonth: 12, endDay: 31,
    sectors: ['crypto'],
    impact: 30,
    description: 'Período post-halving históricamente alcista',
  },
  // Fin de trimestre
  {
    name: 'Fin de Trimestre',
    startMonth: 3, startDay: 25,
    endMonth: 3, endDay: 31,
    sectors: ['finance'],
    impact: -10,
    description: 'Rebalanceo de carteras institucionales',
  },
  {
    name: 'Fin de Trimestre Q2',
    startMonth: 6, startDay: 25,
    endMonth: 6, endDay: 30,
    sectors: ['finance'],
    impact: -10,
    description: 'Rebalanceo de carteras institucionales',
  },
];

// Eventos regionales específicos
interface RegionalEvent {
  name: string;
  region: string;
  month: number;
  dayStart: number;
  dayEnd: number;
  sectors: string[] | 'all';
  impact: number;
  description: string;
}

const REGIONAL_EVENTS: RegionalEvent[] = [
  // China
  {
    name: 'Singles Day (11.11)',
    region: 'china',
    month: 11,
    dayStart: 10,
    dayEnd: 12,
    sectors: ['retail'],
    impact: 50,
    description: 'Mayor evento de ventas online del mundo',
  },
  {
    name: 'Año Nuevo Chino',
    region: 'china',
    month: 2,
    dayStart: 1,
    dayEnd: 15,
    sectors: 'all',
    impact: -20,
    description: 'Mercados cerrados, menor actividad',
  },
  // México
  {
    name: 'Buen Fin',
    region: 'mexico',
    month: 11,
    dayStart: 15,
    dayEnd: 21,
    sectors: ['retail'],
    impact: 40,
    description: 'Equivalente mexicano de Black Friday',
  },
  // USA
  {
    name: 'Tax Day',
    region: 'usa',
    month: 4,
    dayStart: 12,
    dayEnd: 17,
    sectors: 'all',
    impact: -10,
    description: 'Fecha límite de impuestos - posibles ventas',
  },
];

function detectRegion(symbol: string): string {
  for (const [suffix, region] of Object.entries(EXCHANGE_TO_REGION)) {
    if (suffix && symbol.endsWith(suffix)) {
      return region;
    }
  }
  // Default USA para símbolos sin sufijo
  return 'usa';
}

function detectSector(symbol: string): string {
  if (SYMBOL_SECTORS[symbol]) {
    return SYMBOL_SECTORS[symbol];
  }
  // Inferir por patrón
  if (symbol.endsWith('-USD')) return 'crypto';
  return 'general';
}

function isDateInRange(
  now: Date,
  startMonth: number, startDay: number,
  endMonth: number, endDay: number
): { inRange: boolean; daysUntil: number } {
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();
  
  // Crear fechas para comparación (año actual)
  const year = now.getFullYear();
  let startDate = new Date(year, startMonth - 1, startDay);
  let endDate = new Date(year, endMonth - 1, endDay);
  
  // Manejar rangos que cruzan el año (ej: diciembre a enero)
  if (endMonth < startMonth) {
    if (currentMonth >= startMonth) {
      endDate = new Date(year + 1, endMonth - 1, endDay);
    } else {
      startDate = new Date(year - 1, startMonth - 1, startDay);
    }
  }
  
  const nowTime = now.getTime();
  const startTime = startDate.getTime();
  const endTime = endDate.getTime();
  
  const inRange = nowTime >= startTime && nowTime <= endTime;
  
  // Calcular días hasta el inicio
  let daysUntil = 0;
  if (nowTime < startTime) {
    daysUntil = Math.ceil((startTime - nowTime) / (1000 * 60 * 60 * 24));
  } else if (nowTime > endTime) {
    // El evento ya pasó, calcular para próximo año
    const nextStart = new Date(year + 1, startMonth - 1, startDay);
    daysUntil = Math.ceil((nextStart.getTime() - nowTime) / (1000 * 60 * 60 * 24));
  }
  
  return { inRange, daysUntil };
}

export const seasonalityService = {
  analyze(symbol: string): SeasonalityAnalysis {
    const now = new Date();
    const region = detectRegion(symbol);
    const sector = detectSector(symbol);
    
    const activeEvents: SeasonalEvent[] = [];
    let totalImpact = 0;
    
    // Verificar patrones globales
    for (const pattern of SEASONAL_PATTERNS) {
      // Verificar si aplica al sector
      if (pattern.sectors !== 'all' && !pattern.sectors.includes(sector)) {
        continue;
      }
      
      const { inRange, daysUntil } = isDateInRange(
        now,
        pattern.startMonth, pattern.startDay,
        pattern.endMonth, pattern.endDay
      );
      
      // Incluir si está activo o próximo (menos de 14 días)
      if (inRange || daysUntil <= 14) {
        activeEvents.push({
          name: pattern.name,
          type: pattern.impact > 0 ? 'positive' : pattern.impact < 0 ? 'negative' : 'neutral',
          impact: Math.abs(pattern.impact) > 30 ? 'high' : Math.abs(pattern.impact) > 15 ? 'medium' : 'low',
          daysUntil: inRange ? 0 : daysUntil,
          description: pattern.description,
        });
        
        // Solo sumar impacto de eventos activos
        if (inRange) {
          totalImpact += pattern.impact;
        } else if (daysUntil <= 7) {
          // Eventos próximos tienen impacto reducido
          totalImpact += pattern.impact * 0.3;
        }
      }
    }
    
    // Verificar eventos regionales
    for (const event of REGIONAL_EVENTS) {
      if (event.region !== region) continue;
      if (event.sectors !== 'all' && !event.sectors.includes(sector)) continue;
      
      const { inRange, daysUntil } = isDateInRange(
        now,
        event.month, event.dayStart,
        event.month, event.dayEnd
      );
      
      if (inRange || daysUntil <= 14) {
        activeEvents.push({
          name: event.name,
          type: event.impact > 0 ? 'positive' : event.impact < 0 ? 'negative' : 'neutral',
          impact: Math.abs(event.impact) > 30 ? 'high' : Math.abs(event.impact) > 15 ? 'medium' : 'low',
          daysUntil: inRange ? 0 : daysUntil,
          description: event.description,
        });
        
        if (inRange) {
          totalImpact += event.impact;
        } else if (daysUntil <= 7) {
          totalImpact += event.impact * 0.3;
        }
      }
    }
    
    // Limitar score a -100/+100
    const seasonalScore = Math.max(-100, Math.min(100, totalImpact));
    
    // Generar resumen
    let summary = '';
    if (activeEvents.length === 0) {
      summary = 'Sin eventos estacionales significativos actualmente.';
    } else {
      const positiveEvents = activeEvents.filter(e => e.type === 'positive' && e.daysUntil === 0);
      const negativeEvents = activeEvents.filter(e => e.type === 'negative' && e.daysUntil === 0);
      
      if (positiveEvents.length > 0) {
        summary = `Período favorable: ${positiveEvents.map(e => e.name).join(', ')}.`;
      } else if (negativeEvents.length > 0) {
        summary = `Período desfavorable: ${negativeEvents.map(e => e.name).join(', ')}.`;
      } else {
        const upcoming = activeEvents.filter(e => e.daysUntil > 0);
        if (upcoming.length > 0) {
          summary = `Próximo: ${upcoming[0].name} en ${upcoming[0].daysUntil} días.`;
        }
      }
    }
    
    logger.debug(`[Seasonality] ${symbol}: ${activeEvents.length} eventos, score=${seasonalScore}`);
    
    return {
      sector,
      region,
      events: activeEvents,
      seasonalScore,
      hasData: true, // Siempre tenemos datos de estacionalidad
      summary,
    };
  },
};
