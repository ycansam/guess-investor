/**
 * Calendar Effects Service
 * 
 * Detecta patrones de calendario que afectan a los mercados:
 * 
 * 1. EFECTO FIN DE MES
 *    - Últimos 2-3 días del mes = rebalanceos de fondos/ETFs
 *    - Mayor volatilidad, especialmente en activos que más subieron
 * 
 * 2. EFECTO VIERNES
 *    - Los viernes tienden a tener más toma de beneficios
 *    - "No me llevo riesgo al fin de semana"
 * 
 * 3. JANUARY EFFECT
 *    - Enero suele ser alcista (dinero nuevo, optimismo)
 *    - Final de enero = agotamiento del efecto
 * 
 * 4. COMBINACIONES PELIGROSAS
 *    - Viernes + Fin de mes = máxima presión vendedora
 *    - Viernes + Fin de enero = especialmente para activos volátiles
 * 
 * 5. EFECTOS POR TIPO DE ACTIVO
 *    - Metales preciosos: más vulnerables a correcciones de calendario
 *    - Small caps: más afectados por rebalanceos
 */

import { logger } from '../../middleware/logger.js';

// ===== TIPOS =====

export interface CalendarEffectsAnalysis {
  // Fecha actual
  date: Date;
  dayOfWeek: string;
  dayOfMonth: number;
  month: string;
  monthNumber: number;
  
  // Efectos detectados
  isEndOfMonth: boolean;          // Últimos 3 días del mes
  isFriday: boolean;
  isMonday: boolean;
  isJanuary: boolean;
  isEndOfJanuary: boolean;        // Últimos 5 días de enero
  isEndOfQuarter: boolean;        // Final de trimestre (mar, jun, sep, dic)
  isEndOfYear: boolean;           // Últimos 5 días de diciembre
  
  // Efectos combinados
  dangerousCombination: boolean;  // Viernes + fin de mes
  extremeDanger: boolean;         // Viernes + fin de enero/trimestre
  
  // Impacto calculado
  calendarRisk: {
    level: 'extreme' | 'high' | 'moderate' | 'low' | 'none';
    score: number;                // 0-100 (mayor = más riesgo)
    volatilityMultiplier: number; // Multiplicador de volatilidad esperada
    confidenceAdjustment: number; // Multiplicador de confianza (< 1 = reducir)
  };
  
  // Ajuste específico por tipo de activo
  assetTypeAdjustments: {
    preciousMetals: number;       // Bias para metales preciosos
    smallCaps: number;            // Bias para small caps
    highBeta: number;             // Bias para activos high-beta
    etfs: number;                 // Bias para ETFs (sujetos a rebalanceos)
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
  return [2, 5, 8, 11].includes(month); // Marzo, Junio, Septiembre, Diciembre (0-indexed)
}

// ===== ANÁLISIS PRINCIPAL =====

function analyzeCalendarEffects(date: Date = new Date()): CalendarEffectsAnalysis {
  const dayOfWeek = date.getDay();
  const dayOfMonth = date.getDate();
  const month = date.getMonth();
  const year = date.getFullYear();
  const daysInMonth = getDaysInMonth(year, month);
  
  // Detectar efectos básicos
  const isFriday = dayOfWeek === 5;
  const isMonday = dayOfWeek === 1;
  const isEndOfMonth = isLastNDaysOfMonth(date, 3);
  const isJanuary = month === 0;
  const isEndOfJanuary = isJanuary && dayOfMonth >= 26;
  const isEndOfQuarter = isQuarterEnd(month) && isLastNDaysOfMonth(date, 5);
  const isEndOfYear = month === 11 && dayOfMonth >= 26;
  
  // Detectar combinaciones peligrosas
  const dangerousCombination = isFriday && isEndOfMonth;
  const extremeDanger = isFriday && (isEndOfJanuary || isEndOfQuarter || isEndOfYear);
  
  // Calcular riesgo de calendario
  let riskScore = 0;
  const signals: string[] = [];
  
  // Viernes base: +15 puntos
  if (isFriday) {
    riskScore += 15;
    signals.push('📅 Viernes: Mayor toma de beneficios antes del fin de semana');
  }
  
  // Fin de mes: +25 puntos
  if (isEndOfMonth) {
    riskScore += 25;
    signals.push(`📊 Fin de mes (día ${dayOfMonth}/${daysInMonth}): Rebalanceos de fondos y ETFs`);
  }
  
  // Enero: efectos especiales
  if (isJanuary) {
    if (isEndOfJanuary) {
      riskScore += 20;
      signals.push('🎯 Final de enero: Agotamiento del "January Effect", posible corrección');
    } else if (dayOfMonth <= 10) {
      riskScore -= 10; // Principio de enero suele ser alcista
      signals.push('🚀 Inicio de enero: "January Effect" en curso, tendencia alcista típica');
    }
  }
  
  // Fin de trimestre: +20 puntos
  if (isEndOfQuarter) {
    riskScore += 20;
    signals.push('📈 Fin de trimestre: Window dressing y rebalanceos institucionales');
  }
  
  // Fin de año: +15 puntos (tax-loss harvesting ya pasó, pero hay ajustes)
  if (isEndOfYear) {
    riskScore += 15;
    signals.push('🎄 Fin de año: Ajustes finales de carteras');
  }
  
  // Combinaciones peligrosas
  if (dangerousCombination && !extremeDanger) {
    riskScore += 15; // Bonus por combinación
    signals.push('⚠️ COMBINACIÓN: Viernes + Fin de mes = presión vendedora aumentada');
  }
  
  if (extremeDanger) {
    riskScore += 25; // Bonus extra
    signals.push('🚨 COMBINACIÓN EXTREMA: Viernes + Fin de mes/trimestre = máxima presión vendedora');
  }
  
  // Lunes: efecto contrario (a veces rebote tras ventas de viernes)
  if (isMonday && !isEndOfMonth) {
    riskScore -= 5;
    signals.push('📈 Lunes: Posible rebote si hubo ventas el viernes');
  }
  
  // Limitar score
  riskScore = Math.max(0, Math.min(100, riskScore));
  
  // Determinar nivel de riesgo
  let riskLevel: 'extreme' | 'high' | 'moderate' | 'low' | 'none' = 'none';
  if (riskScore >= 60) riskLevel = 'extreme';
  else if (riskScore >= 40) riskLevel = 'high';
  else if (riskScore >= 20) riskLevel = 'moderate';
  else if (riskScore >= 10) riskLevel = 'low';
  
  // Calcular multiplicadores
  // Mayor riesgo = mayor volatilidad esperada, menor confianza
  const volatilityMultiplier = 1 + (riskScore / 100) * 0.5; // 1.0 a 1.5
  const confidenceAdjustment = 1 - (riskScore / 100) * 0.3; // 1.0 a 0.7
  
  // Ajustes por tipo de activo
  // Los activos más volátiles/especulativos sufren más en estas fechas
  const baseAdjustment = -(riskScore / 100) * 3; // Hasta -3% de bias
  
  const assetTypeAdjustments = {
    preciousMetals: baseAdjustment * 1.5,  // Metales preciosos: -4.5% máximo
    smallCaps: baseAdjustment * 1.3,       // Small caps: -3.9% máximo
    highBeta: baseAdjustment * 1.4,        // High beta: -4.2% máximo
    etfs: baseAdjustment * 1.2,            // ETFs: -3.6% máximo
  };
  
  // Construir razonamiento
  let reasoning = '';
  if (riskScore === 0) {
    reasoning = 'Sin efectos de calendario significativos hoy.';
  } else if (riskScore < 20) {
    reasoning = 'Efectos de calendario menores. Impacto limitado esperado.';
  } else if (riskScore < 40) {
    reasoning = 'Efectos de calendario moderados. Posible aumento de volatilidad.';
  } else if (riskScore < 60) {
    reasoning = 'Efectos de calendario significativos. Mayor probabilidad de toma de beneficios y volatilidad aumentada.';
  } else {
    reasoning = 'Combinación de efectos de calendario de alto riesgo. Históricamente, fechas como esta son propensas a correcciones bruscas, especialmente en activos que más han subido.';
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
    
    dangerousCombination,
    extremeDanger,
    
    calendarRisk: {
      level: riskLevel,
      score: riskScore,
      volatilityMultiplier,
      confidenceAdjustment,
    },
    
    assetTypeAdjustments,
    signals,
    reasoning,
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
  
  logger.info(`[CalendarEffects] ${analysis.dayOfWeek} ${analysis.dayOfMonth} de ${analysis.month}: Risk level=${analysis.calendarRisk.level} (${analysis.calendarRisk.score}/100)`);
  
  return analysis;
}

// ===== SERVICIO EXPORTADO =====

export const calendarEffectsService = {
  /**
   * Obtiene el análisis de efectos de calendario para hoy
   */
  getCurrentAnalysis(): CalendarEffectsAnalysis {
    return getCachedOrAnalyze();
  },
  
  /**
   * Analiza una fecha específica (para backtesting)
   */
  analyzeDate(date: Date): CalendarEffectsAnalysis {
    return analyzeCalendarEffects(date);
  },
  
  /**
   * Aplica ajustes de calendario a una predicción
   */
  applyToPrediction(
    prediction: { change: number; confidence: number },
    assetType: 'stock' | 'crypto' | 'forex' | 'commodity' | 'index' | 'etf' | 'other',
    additionalInfo?: { 
      isPreciousMetal?: boolean;
      isSmallCap?: boolean;
      isHighBeta?: boolean;
      recentPerformance30d?: number; // % ganado en 30 días
    }
  ): { 
    adjustedChange: number; 
    adjustedConfidence: number; 
    applied: boolean;
    calendarInfo?: CalendarEffectsAnalysis;
  } {
    const analysis = getCachedOrAnalyze();
    
    // Si no hay riesgo significativo, no ajustar
    if (analysis.calendarRisk.score < 15) {
      return {
        adjustedChange: prediction.change,
        adjustedConfidence: prediction.confidence,
        applied: false,
      };
    }
    
    let adjustedChange = prediction.change;
    let adjustedConfidence = Math.round(prediction.confidence * analysis.calendarRisk.confidenceAdjustment);
    
    // Aplicar bias según tipo de activo
    let bias = 0;
    
    if (additionalInfo?.isPreciousMetal || assetType === 'commodity') {
      bias = analysis.assetTypeAdjustments.preciousMetals;
    } else if (additionalInfo?.isSmallCap) {
      bias = analysis.assetTypeAdjustments.smallCaps;
    } else if (additionalInfo?.isHighBeta) {
      bias = analysis.assetTypeAdjustments.highBeta;
    } else if (assetType === 'index') {
      bias = analysis.assetTypeAdjustments.etfs;
    } else if (assetType === 'crypto') {
      bias = analysis.assetTypeAdjustments.highBeta * 1.2; // Crypto aún más volátil
    }
    
    // FACTOR CLAVE: Si el activo ha subido mucho recientemente, es más vulnerable
    // "Se vende lo que más ha subido"
    if (additionalInfo?.recentPerformance30d !== undefined) {
      const perf = additionalInfo.recentPerformance30d;
      
      if (perf > 20) {
        // Ha subido >20% en 30 días = muy vulnerable
        bias *= 2.0;
        logger.info(`[CalendarEffects] Asset up ${perf.toFixed(1)}% in 30d - doubling calendar bias`);
      } else if (perf > 10) {
        // Ha subido >10% en 30 días = vulnerable
        bias *= 1.5;
        logger.info(`[CalendarEffects] Asset up ${perf.toFixed(1)}% in 30d - increasing calendar bias`);
      } else if (perf < -10) {
        // Ya ha caído mucho = menos vulnerable a más ventas
        bias *= 0.5;
        logger.info(`[CalendarEffects] Asset down ${perf.toFixed(1)}% in 30d - reducing calendar bias`);
      }
    }
    
    // Aplicar bias
    adjustedChange += bias;
    
    // Si la predicción es muy alcista en un día peligroso, moderar
    if (analysis.calendarRisk.level === 'extreme' && prediction.change > 2) {
      adjustedChange = Math.min(adjustedChange, prediction.change * 0.5);
      adjustedConfidence = Math.round(adjustedConfidence * 0.8);
      logger.info(`[CalendarEffects] Extreme risk day - capping bullish prediction`);
    }
    
    return {
      adjustedChange,
      adjustedConfidence,
      applied: true,
      calendarInfo: analysis,
    };
  },
  
  /**
   * Obtiene un resumen rápido para mostrar al usuario
   */
  getQuickSummary(): { 
    riskLevel: string; 
    mainWarning: string | null;
    emoji: string;
  } {
    const analysis = getCachedOrAnalyze();
    
    const emojis: Record<string, string> = {
      extreme: '🚨',
      high: '⚠️',
      moderate: '📊',
      low: '📅',
      none: '✅',
    };
    
    return {
      riskLevel: analysis.calendarRisk.level,
      mainWarning: analysis.signals.length > 0 ? analysis.signals[0] : null,
      emoji: emojis[analysis.calendarRisk.level],
    };
  },
};
