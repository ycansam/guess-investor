/**
 * Servicio de Estacionalidad del Mercado
 * 
 * Calcula la estacionalidad usando DATOS HISTÓRICOS REALES del activo:
 * - Obtiene historial de 5 años de Yahoo Finance
 * - Calcula el rendimiento promedio del activo en el mes actual
 * - Compara con el rendimiento promedio anual
 */

import { logger } from '../../middleware/logger.js';

export interface SeasonalityAnalysis {
  currentMonth: string;
  monthlyReturns: { month: string; avgReturn: number; yearsAnalyzed: number }[];
  currentMonthAvgReturn: number; // Rendimiento promedio histórico del mes actual
  annualAvgReturn: number; // Rendimiento promedio anual
  seasonalScore: number; // -100 a +100 (basado en datos reales)
  hasData: boolean;
  summary: string;
}

// Cache
const cache = new Map<string, { data: SeasonalityAnalysis; timestamp: number }>();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hora (los datos históricos no cambian frecuentemente)

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

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
 * Calcula rendimientos mensuales a partir de datos históricos
 */
function calculateMonthlyReturns(history: { date: Date; close: number }[]): Map<number, number[]> {
  const monthlyReturns = new Map<number, number[]>();
  
  // Inicializar todos los meses
  for (let m = 0; m < 12; m++) {
    monthlyReturns.set(m, []);
  }

  // Calcular rendimiento mes a mes
  for (let i = 1; i < history.length; i++) {
    const current = history[i];
    const previous = history[i - 1];
    
    const monthReturn = ((current.close - previous.close) / previous.close) * 100;
    const month = current.date.getMonth();
    
    monthlyReturns.get(month)?.push(monthReturn);
  }

  return monthlyReturns;
}

export const seasonalityService = {
  /**
   * Analiza patrones estacionales basándose en datos históricos REALES del activo
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

    // Calcular rendimientos mensuales
    const monthlyReturns = calculateMonthlyReturns(history);
    
    // Calcular promedios por mes
    const monthlyAvgs: { month: string; avgReturn: number; yearsAnalyzed: number }[] = [];
    let totalReturns = 0;
    let totalCount = 0;

    for (let m = 0; m < 12; m++) {
      const returns = monthlyReturns.get(m) || [];
      const avg = returns.length > 0 
        ? returns.reduce((a, b) => a + b, 0) / returns.length 
        : 0;
      
      monthlyAvgs.push({
        month: MONTH_NAMES[m],
        avgReturn: Math.round(avg * 100) / 100,
        yearsAnalyzed: returns.length,
      });

      totalReturns += returns.reduce((a, b) => a + b, 0);
      totalCount += returns.length;
    }

    const annualAvgReturn = totalCount > 0 ? (totalReturns / totalCount) * 12 : 0;
    
    // Obtener datos del mes actual
    const currentMonth = new Date().getMonth();
    const currentMonthData = monthlyAvgs[currentMonth];
    const currentMonthAvgReturn = currentMonthData.avgReturn;

    // Calcular score basado en comparación con el promedio
    // Si el mes actual históricamente rinde mejor que el promedio → score positivo
    const monthlyAvgReturn = annualAvgReturn / 12;
    const deviation = currentMonthAvgReturn - monthlyAvgReturn;
    
    // Normalizar a escala -100 a +100
    // Desviaciones de ±5% se consideran significativas (score ±75)
    let seasonalScore = Math.round(deviation * 15);
    seasonalScore = Math.max(-100, Math.min(100, seasonalScore));

    // Generar resumen basado en datos reales
    let summary = '';
    if (currentMonthData.yearsAnalyzed < 3) {
      summary = `Datos limitados (${currentMonthData.yearsAnalyzed} años). `;
    }

    if (currentMonthAvgReturn > monthlyAvgReturn + 1) {
      summary += `${MONTH_NAMES[currentMonth]} históricamente fuerte (+${currentMonthAvgReturn.toFixed(1)}% vs ${monthlyAvgReturn.toFixed(1)}% promedio).`;
    } else if (currentMonthAvgReturn < monthlyAvgReturn - 1) {
      summary += `${MONTH_NAMES[currentMonth]} históricamente débil (${currentMonthAvgReturn.toFixed(1)}% vs ${monthlyAvgReturn.toFixed(1)}% promedio).`;
    } else {
      summary += `${MONTH_NAMES[currentMonth]} en línea con promedio histórico (${currentMonthAvgReturn.toFixed(1)}%).`;
    }

    const result: SeasonalityAnalysis = {
      currentMonth: MONTH_NAMES[currentMonth],
      monthlyReturns: monthlyAvgs,
      currentMonthAvgReturn,
      annualAvgReturn: Math.round(annualAvgReturn * 100) / 100,
      seasonalScore,
      hasData: true,
      summary,
    };

    // Guardar en cache
    cache.set(symbol, { data: result, timestamp: Date.now() });
    
    logger.info(`[Seasonality] ${symbol}: ${MONTH_NAMES[currentMonth]} avg=${currentMonthAvgReturn.toFixed(2)}%, annual avg=${annualAvgReturn.toFixed(2)}%, score=${seasonalScore}`);

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
    };
  },
};
