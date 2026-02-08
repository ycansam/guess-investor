/**
 * Servicio de Estacionalidad del Mercado (MEJORADO)
 * 
 * Calcula la estacionalidad usando DATOS HISTÓRICOS REALES del activo con:
 * - Ponderación temporal: datos recientes pesan más que antiguos
 * - Detección de cambios estructurales: ignora datos antes de colapsos/cambios fundamentales
 * - Validación de relevancia: descarta patrones si el activo cambió drásticamente
 * 
 * PROBLEMA RESUELTO: Un activo que pasa de 50€ a 2€ no debe usar patrones antiguos
 * porque el contexto económico/fundamental es completamente diferente.
 */

import { logger } from '../../middleware/logger.js';

export interface SeasonalityAnalysis {
  currentMonth: string;
  monthlyReturns: { month: string; avgReturn: number; yearsAnalyzed: number; weight: number }[];
  currentMonthAvgReturn: number; // Rendimiento promedio histórico del mes actual (ponderado)
  annualAvgReturn: number; // Rendimiento promedio anual (ponderado)
  seasonalScore: number; // -100 a +100 (basado en datos reales)
  hasData: boolean;
  summary: string;
  // Nuevos campos de diagnóstico
  dataReliability: 'high' | 'medium' | 'low' | 'unreliable';
  structuralBreakDetected: boolean;
  effectiveYearsUsed: number; // Años realmente usados después de filtrar
  priceChangeFromStart: number; // Cambio % desde inicio de datos
}

// Cache
const cache = new Map<string, { data: SeasonalityAnalysis; timestamp: number }>();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hora (los datos históricos no cambian frecuentemente)

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

// Umbrales para detección de cambios estructurales
const STRUCTURAL_BREAK_THRESHOLD = 0.70; // Si el precio cayó/subió >70% desde algún punto, considerar quiebre
const RELEVANCE_WINDOW_MONTHS = 24; // Priorizar datos de los últimos 2 años
const MIN_YEARS_FOR_RELIABLE = 3; // Mínimo años para considerar confiable
const EXTREME_VOLATILITY_THRESHOLD = 50; // Si rendimiento mensual >50%, es outlier

/**
 * Obtiene datos históricos de 5 años de Yahoo Finance
 */
async function fetchHistoricalData(symbol: string): Promise<{ date: Date; close: number }[] | null> {
  try {
    // Obtener 5 años de datos mensuales
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=5y&interval=1mo`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      logger.warn(`[Seasonality] Failed to fetch history for ${symbol}: ${response.status}`);
      return null;
    }

    const json: any = await response.json();
    const result = json.chart?.result?.[0];
    const timestamps = result?.timestamp;
    const quotes = result?.indicators?.quote?.[0];

    if (!timestamps || !quotes?.close) {
      return null;
    }

    const data: { date: Date; close: number }[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (quotes.close[i] && quotes.close[i] > 0) {
        data.push({
          date: new Date(timestamps[i] * 1000),
          close: quotes.close[i],
        });
      }
    }

    logger.info(`[Seasonality] Fetched ${data.length} months of data for ${symbol}`);
    return data;
  } catch (error) {
    logger.error(`[Seasonality] Error fetching history for ${symbol}:`, error);
    return null;
  }
}

/**
 * Detecta si hubo un cambio estructural en el activo (colapso o rally extremo)
 * Devuelve el índice desde el cual los datos son "relevantes" o -1 si no hay quiebre
 */
function detectStructuralBreak(history: { date: Date; close: number }[]): { 
  breakIndex: number; 
  breakDetected: boolean;
  priceChangeFromStart: number;
} {
  if (history.length < 12) {
    return { breakIndex: -1, breakDetected: false, priceChangeFromStart: 0 };
  }

  const currentPrice = history[history.length - 1].close;
  const startPrice = history[0].close;
  const priceChangeFromStart = ((currentPrice - startPrice) / startPrice) * 100;

  // Buscar el punto de quiebre más reciente (máximo o mínimo extremo)
  let maxPrice = 0;
  let minPrice = Infinity;
  let maxIndex = 0;
  let minIndex = 0;

  for (let i = 0; i < history.length; i++) {
    if (history[i].close > maxPrice) {
      maxPrice = history[i].close;
      maxIndex = i;
    }
    if (history[i].close < minPrice) {
      minPrice = history[i].close;
      minIndex = i;
    }
  }

  // Verificar si hubo un colapso (precio actual muy por debajo del máximo)
  const dropFromMax = ((currentPrice - maxPrice) / maxPrice) * 100;
  const riseFromMin = ((currentPrice - minPrice) / minPrice) * 100;

  // Si el precio cayó más del 70% desde máximo histórico reciente
  if (dropFromMax < -STRUCTURAL_BREAK_THRESHOLD * 100 && maxIndex < history.length - 6) {
    logger.info(`[Seasonality] Structural break detected: price dropped ${dropFromMax.toFixed(1)}% from max`);
    return { 
      breakIndex: maxIndex, 
      breakDetected: true,
      priceChangeFromStart 
    };
  }

  // Si el precio subió más del 300% desde mínimo histórico reciente
  if (riseFromMin > 300 && minIndex < history.length - 6) {
    logger.info(`[Seasonality] Structural break detected: price rose ${riseFromMin.toFixed(1)}% from min`);
    return { 
      breakIndex: minIndex, 
      breakDetected: true,
      priceChangeFromStart 
    };
  }

  return { breakIndex: -1, breakDetected: false, priceChangeFromStart };
}

/**
 * Calcula rendimientos mensuales a partir de datos históricos
 * CON PONDERACIÓN TEMPORAL: datos recientes pesan más
 */
function calculateMonthlyReturns(
  history: { date: Date; close: number }[], 
  startFromIndex: number = 0
): Map<number, { returns: number[]; weights: number[] }> {
  const monthlyReturns = new Map<number, { returns: number[]; weights: number[] }>();
  
  // Inicializar todos los meses
  for (let m = 0; m < 12; m++) {
    monthlyReturns.set(m, { returns: [], weights: [] });
  }

  const now = new Date();
  const totalMonths = history.length - startFromIndex;

  // Calcular rendimiento mes a mes desde el índice de inicio
  for (let i = Math.max(1, startFromIndex + 1); i < history.length; i++) {
    const current = history[i];
    const previous = history[i - 1];
    
    const monthReturn = ((current.close - previous.close) / previous.close) * 100;
    
    // Filtrar outliers extremos (ej: splits no ajustados, errores de datos)
    if (Math.abs(monthReturn) > EXTREME_VOLATILITY_THRESHOLD) {
      logger.debug(`[Seasonality] Filtering outlier: ${monthReturn.toFixed(1)}% return`);
      continue;
    }

    const month = current.date.getMonth();
    
    // Calcular peso basado en antigüedad
    // Datos más recientes → peso mayor (hasta 2x)
    const monthsAgo = (now.getFullYear() - current.date.getFullYear()) * 12 + 
                      (now.getMonth() - current.date.getMonth());
    
    // Peso exponencial decreciente: datos de hace 2 años pesan ~0.5, de hace 5 años ~0.1
    const weight = Math.exp(-monthsAgo / RELEVANCE_WINDOW_MONTHS);
    
    monthlyReturns.get(month)?.returns.push(monthReturn);
    monthlyReturns.get(month)?.weights.push(weight);
  }

  return monthlyReturns;
}

/**
 * Calcula promedio ponderado
 */
function weightedAverage(values: number[], weights: number[]): number {
  if (values.length === 0) return 0;
  
  let sumWeighted = 0;
  let sumWeights = 0;
  
  for (let i = 0; i < values.length; i++) {
    sumWeighted += values[i] * weights[i];
    sumWeights += weights[i];
  }
  
  return sumWeights > 0 ? sumWeighted / sumWeights : 0;
}

/**
 * Determina la confiabilidad de los datos
 */
function assessDataReliability(
  effectiveYears: number, 
  structuralBreak: boolean,
  priceChange: number
): 'high' | 'medium' | 'low' | 'unreliable' {
  // Si hubo quiebre estructural, los datos son poco confiables para estacionalidad
  if (structuralBreak) {
    return effectiveYears >= 2 ? 'low' : 'unreliable';
  }
  
  // Si el precio cambió drásticamente (>80%), la estacionalidad es poco fiable
  if (Math.abs(priceChange) > 80) {
    return 'low';
  }
  
  if (effectiveYears >= MIN_YEARS_FOR_RELIABLE) {
    return Math.abs(priceChange) < 50 ? 'high' : 'medium';
  }
  
  if (effectiveYears >= 2) {
    return 'medium';
  }
  
  return 'low';
}

export const seasonalityService = {
  /**
   * Analiza patrones estacionales basándose en datos históricos REALES del activo
   * MEJORADO: Con detección de cambios estructurales y ponderación temporal
   */
  async analyze(symbol: string, assetName?: string): Promise<SeasonalityAnalysis> {
    // Verificar cache
    const cached = cache.get(symbol);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      logger.debug(`[Seasonality] Using cached data for ${symbol}`);
      return cached.data;
    }

    logger.info(`[Seasonality] Fetching real historical data for ${symbol} (${assetName || 'no name'})`);

    // Obtener datos históricos
    const history = await fetchHistoricalData(symbol);
    
    if (!history || history.length < 24) {
      // Necesitamos al menos 2 años de datos
      logger.warn(`[Seasonality] Insufficient historical data for ${symbol}: ${history?.length || 0} months`);
      return this.getDefaultData();
    }

    // NUEVO: Detectar cambios estructurales
    const structuralAnalysis = detectStructuralBreak(history);
    const startIndex = structuralAnalysis.breakDetected 
      ? structuralAnalysis.breakIndex 
      : 0;
    
    // Si el quiebre es muy reciente, no tenemos suficientes datos post-quiebre
    const monthsAfterBreak = history.length - startIndex;
    if (structuralAnalysis.breakDetected && monthsAfterBreak < 12) {
      logger.warn(`[Seasonality] ${symbol}: Structural break too recent, only ${monthsAfterBreak} months of relevant data`);
      return {
        ...this.getDefaultData(),
        structuralBreakDetected: true,
        priceChangeFromStart: structuralAnalysis.priceChangeFromStart,
        dataReliability: 'unreliable',
        summary: `Cambio estructural detectado. Solo ${monthsAfterBreak} meses de datos relevantes - estacionalidad no aplicable.`,
      };
    }

    // Calcular rendimientos mensuales CON PONDERACIÓN TEMPORAL
    const monthlyReturns = calculateMonthlyReturns(history, startIndex);
    
    // Calcular promedios ponderados por mes
    const monthlyAvgs: { month: string; avgReturn: number; yearsAnalyzed: number; weight: number }[] = [];
    let totalWeightedReturns = 0;
    let totalWeight = 0;

    for (let m = 0; m < 12; m++) {
      const data = monthlyReturns.get(m) || { returns: [], weights: [] };
      const avgReturn = weightedAverage(data.returns, data.weights);
      const avgWeight = data.weights.length > 0 
        ? data.weights.reduce((a, b) => a + b, 0) / data.weights.length 
        : 0;
      
      monthlyAvgs.push({
        month: MONTH_NAMES[m],
        avgReturn: Math.round(avgReturn * 100) / 100,
        yearsAnalyzed: data.returns.length,
        weight: Math.round(avgWeight * 100) / 100,
      });

      // Para el promedio anual, también usar ponderación
      for (let i = 0; i < data.returns.length; i++) {
        totalWeightedReturns += data.returns[i] * data.weights[i];
        totalWeight += data.weights[i];
      }
    }

    const annualAvgReturn = totalWeight > 0 ? (totalWeightedReturns / totalWeight) * 12 : 0;
    
    // Obtener datos del mes actual
    const currentMonth = new Date().getMonth();
    const currentMonthData = monthlyAvgs[currentMonth];
    const currentMonthAvgReturn = currentMonthData.avgReturn;

    // Calcular score basado en comparación con el promedio
    const monthlyAvgReturn = annualAvgReturn / 12;
    const deviation = currentMonthAvgReturn - monthlyAvgReturn;
    
    // Normalizar a escala -100 a +100
    let seasonalScore = Math.round(deviation * 15);
    seasonalScore = Math.max(-100, Math.min(100, seasonalScore));

    // Calcular años efectivos usados
    const effectiveYearsUsed = Math.round(monthsAfterBreak / 12 * 10) / 10;
    
    // Evaluar confiabilidad de los datos
    const dataReliability = assessDataReliability(
      effectiveYearsUsed, 
      structuralAnalysis.breakDetected,
      structuralAnalysis.priceChangeFromStart
    );

    // NUEVO: Reducir el score si la confiabilidad es baja
    if (dataReliability === 'low') {
      seasonalScore = Math.round(seasonalScore * 0.5); // Reducir impacto 50%
    } else if (dataReliability === 'unreliable') {
      seasonalScore = 0; // No usar estacionalidad
    }

    // Generar resumen mejorado
    let summary = '';
    
    if (structuralAnalysis.breakDetected) {
      summary += `⚠️ Cambio estructural detectado (${structuralAnalysis.priceChangeFromStart.toFixed(0)}% desde inicio). `;
    }
    
    if (dataReliability === 'unreliable') {
      summary += 'Datos insuficientes para estacionalidad confiable.';
    } else if (dataReliability === 'low') {
      summary += `Estacionalidad con baja fiabilidad (${effectiveYearsUsed} años). `;
    }
    
    if (dataReliability !== 'unreliable') {
      if (currentMonthAvgReturn > monthlyAvgReturn + 1) {
        summary += `${MONTH_NAMES[currentMonth]} históricamente fuerte (+${currentMonthAvgReturn.toFixed(1)}% vs ${monthlyAvgReturn.toFixed(1)}% promedio).`;
      } else if (currentMonthAvgReturn < monthlyAvgReturn - 1) {
        summary += `${MONTH_NAMES[currentMonth]} históricamente débil (${currentMonthAvgReturn.toFixed(1)}% vs ${monthlyAvgReturn.toFixed(1)}% promedio).`;
      } else {
        summary += `${MONTH_NAMES[currentMonth]} en línea con promedio histórico (${currentMonthAvgReturn.toFixed(1)}%).`;
      }
    }

    const result: SeasonalityAnalysis = {
      currentMonth: MONTH_NAMES[currentMonth],
      monthlyReturns: monthlyAvgs,
      currentMonthAvgReturn,
      annualAvgReturn: Math.round(annualAvgReturn * 100) / 100,
      seasonalScore,
      hasData: dataReliability !== 'unreliable',
      summary,
      dataReliability,
      structuralBreakDetected: structuralAnalysis.breakDetected,
      effectiveYearsUsed,
      priceChangeFromStart: Math.round(structuralAnalysis.priceChangeFromStart * 100) / 100,
    };

    // Guardar en cache
    cache.set(symbol, { data: result, timestamp: Date.now() });
    
    logger.info(`[Seasonality] ${symbol}: ${MONTH_NAMES[currentMonth]} avg=${currentMonthAvgReturn.toFixed(2)}%, ` +
      `annual avg=${annualAvgReturn.toFixed(2)}%, score=${seasonalScore}, ` +
      `reliability=${dataReliability}, break=${structuralAnalysis.breakDetected}`);

    return result;
  },

  getDefaultData(): SeasonalityAnalysis {
    const currentMonth = new Date().getMonth();
    return {
      currentMonth: MONTH_NAMES[currentMonth],
      monthlyReturns: [],
      currentMonthAvgReturn: 0,
      annualAvgReturn: 0,
      seasonalScore: 0,
      hasData: false,
      summary: 'Sin datos históricos suficientes para análisis de estacionalidad.',
      dataReliability: 'unreliable',
      structuralBreakDetected: false,
      effectiveYearsUsed: 0,
      priceChangeFromStart: 0,
    };
  },
};
