/**
 * Calendar Effects Service
 * 
 * NOTA: Los efectos de calendario son estadísticamente muy débiles.
 * La bolsa no "sabe" que es viernes o fin de mes.
 * Este servicio solo proporciona contexto informativo, NO ajusta predicciones.
 * 
 * Los movimientos reales vienen de:
 * - Psicología de mercado (miedo/avaricia)
 * - Momentum y tendencias
 * - Noticias y eventos
 * - Flujos institucionales
 * 
 * NO de que sea "viernes 30 de enero".
 */

import { logger } from '../../middleware/logger.js';

// ===== TIPOS =====

export interface CalendarEffectsAnalysis {
  // Fecha actual (solo informativo)
  date: Date;
  dayOfWeek: string;
  dayOfMonth: number;
  month: string;
  monthNumber: number;
  
  // Información contextual (NO afecta predicciones)
  isEndOfMonth: boolean;
  isFriday: boolean;
  isMonday: boolean;
  isJanuary: boolean;
  isEndOfJanuary: boolean;
  isEndOfQuarter: boolean;
  isEndOfYear: boolean;
  
  // Siempre false - no hay "combinaciones peligrosas"
  dangerousCombination: boolean;
  extremeDanger: boolean;
  
  // Siempre valores neutros - el calendario NO ajusta predicciones
  calendarRisk: {
    level: string;
    score: number;
    volatilityMultiplier: number;
    confidenceAdjustment: number;
  };
  
  // Sin ajustes por tipo de activo
  assetTypeAdjustments: {
    preciousMetals: number;
    smallCaps: number;
    highBeta: number;
    etfs: number;
  };
  
  signals: string[];
  reasoning: string;
}

// ===== UTILIDADES DE FECHA =====

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                     'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function isLastNDaysOfMonth(date: Date, n: number): boolean {
  const daysInMonth = getDaysInMonth(date.getFullYear(), date.getMonth());
  return date.getDate() > daysInMonth - n;
}

function isQuarterEnd(month: number): boolean {
  return [2, 5, 8, 11].includes(month);
}

// ===== ANÁLISIS PRINCIPAL =====

function analyzeCalendarEffects(date: Date = new Date()): CalendarEffectsAnalysis {
  const dayOfWeek = date.getDay();
  const dayOfMonth = date.getDate();
  const month = date.getMonth();
  
  // Solo información contextual
  const isFriday = dayOfWeek === 5;
  const isMonday = dayOfWeek === 1;
  const isEndOfMonth = isLastNDaysOfMonth(date, 3);
  const isJanuary = month === 0;
  const isEndOfJanuary = isJanuary && dayOfMonth >= 26;
  const isEndOfQuarter = isQuarterEnd(month) && isLastNDaysOfMonth(date, 5);
  const isEndOfYear = month === 11 && dayOfMonth >= 26;
  
  // Construir señales informativas (sin peso en predicción)
  const signals: string[] = [];
  
  if (isFriday) {
    signals.push('📅 Viernes');
  }
  if (isEndOfMonth) {
    signals.push(`📊 Fin de mes (día ${dayOfMonth})`);
  }
  if (isEndOfJanuary) {
    signals.push('🗓️ Final de enero');
  }
  if (isEndOfQuarter) {
    signals.push('📈 Fin de trimestre');
  }
  if (isEndOfYear) {
    signals.push('🎄 Fin de año');
  }
  
  if (signals.length === 0) {
    signals.push('📅 Sin fechas especiales');
  }
  
  return {
    date,
    dayOfWeek: DAY_NAMES[dayOfWeek],
    dayOfMonth,
    month: MONTH_NAMES[month],
    monthNumber: month + 1,
    
    isEndOfMonth,
    isFriday,
    isMonday,
    isJanuary,
    isEndOfJanuary,
    isEndOfQuarter,
    isEndOfYear,
    
    // Nunca hay "peligro" por calendario
    dangerousCombination: false,
    extremeDanger: false,
    
    // Valores neutros - NO afecta predicciones
    calendarRisk: {
      level: 'none',
      score: 0,
      volatilityMultiplier: 1,
      confidenceAdjustment: 1,
    },
    
    // Sin ajustes
    assetTypeAdjustments: {
      preciousMetals: 0,
      smallCaps: 0,
      highBeta: 0,
      etfs: 0,
    },
    
    signals,
    reasoning: 'El calendario no afecta las predicciones. Los movimientos vienen de psicología de mercado, momentum, noticias y flujos institucionales.',
  };
}

// ===== CACHE =====

let cachedAnalysis: { data: CalendarEffectsAnalysis; date: string } | null = null;

function getCachedOrAnalyze(): CalendarEffectsAnalysis {
  const today = new Date().toDateString();
  
  if (cachedAnalysis && cachedAnalysis.date === today) {
    return cachedAnalysis.data;
  }
  
  const analysis = analyzeCalendarEffects();
  cachedAnalysis = { data: analysis, date: today };
  
  logger.info(`[CalendarEffects] ${analysis.dayOfWeek} ${analysis.dayOfMonth} de ${analysis.month} (solo info, sin ajustes)`);
  
  return analysis;
}

// ===== SERVICIO EXPORTADO =====

export const calendarEffectsService = {
  /**
   * Obtiene el análisis de efectos de calendario para hoy (solo informativo)
   */
  getCurrentAnalysis(): CalendarEffectsAnalysis {
    return getCachedOrAnalyze();
  },
  
  /**
   * Analiza una fecha específica (solo informativo)
   */
  analyzeDate(date: Date): CalendarEffectsAnalysis {
    return analyzeCalendarEffects(date);
  },
  
  /**
   * NO aplica ajustes - el calendario no afecta predicciones
   * Solo devuelve los valores originales con info contextual
   */
  applyToPrediction(
    prediction: { change: number; confidence: number },
    _assetType: 'stock' | 'crypto' | 'forex' | 'commodity' | 'index' | 'etf' | 'other',
    _additionalInfo?: { 
      isPreciousMetal?: boolean;
      isSmallCap?: boolean;
      isHighBeta?: boolean;
      recentPerformance30d?: number;
    }
  ): { 
    adjustedChange: number; 
    adjustedConfidence: number; 
    applied: boolean;
    calendarInfo?: CalendarEffectsAnalysis;
  } {
    const analysis = getCachedOrAnalyze();
    
    // NUNCA ajustar - el calendario no afecta predicciones
    return {
      adjustedChange: prediction.change,
      adjustedConfidence: prediction.confidence,
      applied: false,
      calendarInfo: analysis,
    };
  },
  
  /**
   * Obtiene un resumen rápido (solo informativo)
   */
  getQuickSummary(): { 
    riskLevel: string; 
    mainWarning: string | null;
    emoji: string;
  } {
    const analysis = getCachedOrAnalyze();
    
    return {
      riskLevel: 'none',
      mainWarning: null,
      emoji: '📅',
    };
  },

  /**
   * Limpia el cache (para testing)
   */
  clearCache(): void {
    cachedAnalysis = null;
  },};