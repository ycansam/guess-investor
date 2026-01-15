/**
 * Trends Service
 * Analiza tendencias de activos: rachas, momentum, patrones
 */

import { logger } from '../../middleware/logger.js';
import { yahooService } from './yahoo.service.js';

// Lista de activos populares para escanear
const POPULAR_ASSETS = [
  // Tech Giants
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA',
  // Finance
  'JPM', 'BAC', 'V', 'MA',
  // Healthcare
  'JNJ', 'PFE', 'UNH',
  // Consumer
  'KO', 'PEP', 'MCD', 'NKE', 'DIS',
  // Energy
  'XOM', 'CVX',
  // ETFs
  'SPY', 'QQQ', 'IWM', 'VTI',
  // Crypto
  'BTC-USD', 'ETH-USD', 'SOL-USD',
  // European
  'SAP.DE', 'ASML.AS', 'MC.PA',
];

export interface TrendRanking {
  symbol: string;
  name: string;
  currentPrice: number;
  streak: {
    direction: 'up' | 'down' | 'sideways';
    days: number;
    totalChange: number;
  };
  momentum: {
    signal: 'bullish' | 'bearish' | 'neutral';
    strength: 'strong' | 'moderate' | 'weak';
    score: number; // -10 a +10
  };
  change24h: number;
  change7d: number;
  change30d: number;
  trendScore: number; // Score compuesto para ranking
  trendPrediction: 'continue' | 'reverse' | 'uncertain';
}

export interface TrendStreak {
  direction: 'up' | 'down' | 'sideways';
  days: number;
  totalChange: number;
  avgDailyChange: number;
  startDate: string;
  endDate: string;
}

export interface TrendMomentum {
  short: number;  // 5 días
  medium: number; // 20 días
  long: number;   // 50 días
  signal: 'bullish' | 'bearish' | 'neutral';
  strength: 'strong' | 'moderate' | 'weak';
}

export interface TrendSupport {
  level: number;
  strength: 'strong' | 'moderate' | 'weak';
  distancePercent: number;
}

export interface TrendResistance {
  level: number;
  strength: 'strong' | 'moderate' | 'weak';
  distancePercent: number;
}

export interface TrendVolatility {
  current: number;       // Volatilidad actual (últimos 5 días)
  average: number;       // Volatilidad promedio (30 días)
  trend: 'increasing' | 'decreasing' | 'stable';
  percentile: number;    // En qué percentil está respecto a su histórico
}

export interface TrendAnalysis {
  symbol: string;
  currentPrice: number;
  
  // Racha actual
  currentStreak: TrendStreak;
  
  // Momentum
  momentum: TrendMomentum;
  
  // Soportes y resistencias
  supports: TrendSupport[];
  resistances: TrendResistance[];
  
  // Volatilidad
  volatility: TrendVolatility;
  
  // Estadísticas de tendencia
  stats: {
    up_days_30d: number;
    down_days_30d: number;
    flat_days_30d: number;
    best_day_30d: { date: string; change: number };
    worst_day_30d: { date: string; change: number };
    avg_up_move: number;
    avg_down_move: number;
  };
  
  // Predicción de tendencia
  trendPrediction: {
    direction: 'continue' | 'reverse' | 'uncertain';
    probability: number;
    reasoning: string;
  };
  
  analyzedAt: Date;
}

// Cache en memoria
const cache = new Map<string, { data: TrendAnalysis; expiresAt: number }>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutos

export const trendsService = {
  /**
   * Obtener análisis de tendencia completo
   */
  async analyzeTrend(symbol: string): Promise<TrendAnalysis | null> {
    const cacheKey = `trend:${symbol}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    try {
      // Obtener datos históricos (3 meses para análisis completo)
      const history = await yahooService.getHistory(symbol, '3mo', '1d');
      
      if (!history || history.length < 10) {
        logger.warn(`[Trends] Insufficient history for ${symbol}: ${history?.length || 0} points`);
        return null;
      }

      // Obtener precio actual
      const quote = await yahooService.getQuote(symbol);
      const currentPrice = quote?.price || history[history.length - 1].close;

      // Calcular cambios diarios
      const dailyChanges: { date: string; change: number; close: number }[] = [];
      for (let i = 1; i < history.length; i++) {
        const prev = history[i - 1];
        const curr = history[i];
        const change = ((curr.close - prev.close) / prev.close) * 100;
        dailyChanges.push({
          date: new Date(curr.timestamp).toISOString().split('T')[0],
          change,
          close: curr.close,
        });
      }

      // Calcular racha actual
      const currentStreak = this.calculateStreak(dailyChanges);
      
      // Calcular momentum
      const momentum = this.calculateMomentum(dailyChanges, currentPrice);
      
      // Calcular soportes y resistencias
      const { supports, resistances } = this.calculateSupportResistance(history, currentPrice);
      
      // Calcular volatilidad
      const volatility = this.calculateVolatility(dailyChanges);
      
      // Estadísticas de 30 días
      const last30 = dailyChanges.slice(-30);
      const upDays = last30.filter(d => d.change > 0.1);
      const downDays = last30.filter(d => d.change < -0.1);
      const flatDays = last30.filter(d => Math.abs(d.change) <= 0.1);
      
      const sortedByChange = [...last30].sort((a, b) => b.change - a.change);
      const bestDay = sortedByChange[0];
      const worstDay = sortedByChange[sortedByChange.length - 1];
      
      const stats = {
        up_days_30d: upDays.length,
        down_days_30d: downDays.length,
        flat_days_30d: flatDays.length,
        best_day_30d: { date: bestDay?.date || '', change: bestDay?.change || 0 },
        worst_day_30d: { date: worstDay?.date || '', change: worstDay?.change || 0 },
        avg_up_move: upDays.length > 0 ? upDays.reduce((s, d) => s + d.change, 0) / upDays.length : 0,
        avg_down_move: downDays.length > 0 ? downDays.reduce((s, d) => s + d.change, 0) / downDays.length : 0,
      };

      // Predicción de tendencia
      const trendPrediction = this.predictTrend(currentStreak, momentum, stats, volatility);

      const analysis: TrendAnalysis = {
        symbol,
        currentPrice,
        currentStreak,
        momentum,
        supports,
        resistances,
        volatility,
        stats,
        trendPrediction,
        analyzedAt: new Date(),
      };

      cache.set(cacheKey, { data: analysis, expiresAt: Date.now() + CACHE_TTL });
      logger.info(`[Trends] Analyzed ${symbol}: ${currentStreak.days}d ${currentStreak.direction} streak, momentum ${momentum.signal}`);

      return analysis;
    } catch (error) {
      logger.error(`[Trends] Error analyzing ${symbol}:`, error);
      return null;
    }
  },

  /**
   * Calcular racha actual (días consecutivos subiendo/bajando)
   */
  calculateStreak(dailyChanges: { date: string; change: number }[]): TrendStreak {
    if (dailyChanges.length === 0) {
      return {
        direction: 'sideways',
        days: 0,
        totalChange: 0,
        avgDailyChange: 0,
        startDate: '',
        endDate: '',
      };
    }

    const lastDay = dailyChanges[dailyChanges.length - 1];
    const threshold = 0.1; // Umbral para considerar subida/bajada
    
    let direction: 'up' | 'down' | 'sideways';
    if (lastDay.change > threshold) direction = 'up';
    else if (lastDay.change < -threshold) direction = 'down';
    else direction = 'sideways';

    let days = 1;
    let totalChange = lastDay.change;
    let startDate = lastDay.date;
    const endDate = lastDay.date;

    // Contar días consecutivos
    for (let i = dailyChanges.length - 2; i >= 0; i--) {
      const day = dailyChanges[i];
      const dayDir: 'up' | 'down' | 'sideways' = 
        day.change > threshold ? 'up' : 
        day.change < -threshold ? 'down' : 'sideways';
      
      // Permitir días laterales dentro de la racha
      if (dayDir === direction || dayDir === 'sideways') {
        days++;
        totalChange += day.change;
        startDate = day.date;
      } else {
        break;
      }
    }

    return {
      direction,
      days,
      totalChange,
      avgDailyChange: totalChange / days,
      startDate,
      endDate,
    };
  },

  /**
   * Calcular momentum en diferentes periodos
   */
  calculateMomentum(dailyChanges: { date: string; change: number; close: number }[], currentPrice: number): TrendMomentum {
    const getROC = (days: number): number => {
      if (dailyChanges.length < days) return 0;
      const pastPrice = dailyChanges[dailyChanges.length - days]?.close || currentPrice;
      return ((currentPrice - pastPrice) / pastPrice) * 100;
    };

    const short = getROC(5);
    const medium = getROC(20);
    const long = dailyChanges.length >= 50 ? getROC(50) : getROC(Math.min(30, dailyChanges.length));

    // Determinar señal
    let signal: 'bullish' | 'bearish' | 'neutral';
    const avgMomentum = (short + medium + long) / 3;
    
    if (short > 0 && medium > 0 && long > 0) {
      signal = 'bullish';
    } else if (short < 0 && medium < 0 && long < 0) {
      signal = 'bearish';
    } else if (avgMomentum > 1) {
      signal = 'bullish';
    } else if (avgMomentum < -1) {
      signal = 'bearish';
    } else {
      signal = 'neutral';
    }

    // Determinar fuerza
    const absAvg = Math.abs(avgMomentum);
    let strength: 'strong' | 'moderate' | 'weak';
    if (absAvg > 5) strength = 'strong';
    else if (absAvg > 2) strength = 'moderate';
    else strength = 'weak';

    return { short, medium, long, signal, strength };
  },

  /**
   * Calcular niveles de soporte y resistencia
   */
  calculateSupportResistance(
    history: { close: number; high: number; low: number; timestamp: number }[],
    currentPrice: number
  ): { supports: TrendSupport[]; resistances: TrendResistance[] } {
    const prices = history.map(h => ({ high: h.high, low: h.low, close: h.close }));
    
    // Encontrar mínimos y máximos locales
    const localMins: number[] = [];
    const localMaxs: number[] = [];
    
    for (let i = 2; i < prices.length - 2; i++) {
      const curr = prices[i];
      const prev1 = prices[i - 1];
      const prev2 = prices[i - 2];
      const next1 = prices[i + 1];
      const next2 = prices[i + 2];
      
      // Mínimo local
      if (curr.low < prev1.low && curr.low < prev2.low && 
          curr.low < next1.low && curr.low < next2.low) {
        localMins.push(curr.low);
      }
      
      // Máximo local
      if (curr.high > prev1.high && curr.high > prev2.high &&
          curr.high > next1.high && curr.high > next2.high) {
        localMaxs.push(curr.high);
      }
    }

    // Agrupar niveles cercanos (cluster)
    const clusterLevels = (levels: number[], threshold: number): number[] => {
      if (levels.length === 0) return [];
      const sorted = [...levels].sort((a, b) => a - b);
      const clusters: number[][] = [[sorted[0]]];
      
      for (let i = 1; i < sorted.length; i++) {
        const last = clusters[clusters.length - 1];
        const avg = last.reduce((s, v) => s + v, 0) / last.length;
        if (Math.abs(sorted[i] - avg) / avg < threshold) {
          last.push(sorted[i]);
        } else {
          clusters.push([sorted[i]]);
        }
      }
      
      return clusters.map(c => c.reduce((s, v) => s + v, 0) / c.length);
    };

    const supportLevels = clusterLevels(localMins.filter(l => l < currentPrice), 0.02);
    const resistanceLevels = clusterLevels(localMaxs.filter(l => l > currentPrice), 0.02);

    const supports: TrendSupport[] = supportLevels
      .sort((a, b) => b - a) // Más cercano primero
      .slice(0, 3)
      .map(level => ({
        level,
        strength: localMins.filter(l => Math.abs(l - level) / level < 0.02).length >= 3 ? 'strong' :
                  localMins.filter(l => Math.abs(l - level) / level < 0.02).length >= 2 ? 'moderate' : 'weak',
        distancePercent: ((currentPrice - level) / currentPrice) * 100,
      }));

    const resistances: TrendResistance[] = resistanceLevels
      .sort((a, b) => a - b) // Más cercano primero
      .slice(0, 3)
      .map(level => ({
        level,
        strength: localMaxs.filter(l => Math.abs(l - level) / level < 0.02).length >= 3 ? 'strong' :
                  localMaxs.filter(l => Math.abs(l - level) / level < 0.02).length >= 2 ? 'moderate' : 'weak',
        distancePercent: ((level - currentPrice) / currentPrice) * 100,
      }));

    return { supports, resistances };
  },

  /**
   * Calcular volatilidad
   */
  calculateVolatility(dailyChanges: { change: number }[]): TrendVolatility {
    const calcStdDev = (arr: number[]): number => {
      if (arr.length === 0) return 0;
      const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
      const variance = arr.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / arr.length;
      return Math.sqrt(variance);
    };

    const last5 = dailyChanges.slice(-5).map(d => d.change);
    const last30 = dailyChanges.slice(-30).map(d => d.change);
    const all = dailyChanges.map(d => d.change);

    const current = calcStdDev(last5) * Math.sqrt(252); // Anualizada
    const average = calcStdDev(last30) * Math.sqrt(252);
    
    // Calcular percentil
    const historicalVols: number[] = [];
    for (let i = 5; i < dailyChanges.length; i++) {
      const window = dailyChanges.slice(i - 5, i).map(d => d.change);
      historicalVols.push(calcStdDev(window) * Math.sqrt(252));
    }
    const belowCount = historicalVols.filter(v => v < current).length;
    const percentile = (belowCount / historicalVols.length) * 100;

    let trend: 'increasing' | 'decreasing' | 'stable';
    if (current > average * 1.2) trend = 'increasing';
    else if (current < average * 0.8) trend = 'decreasing';
    else trend = 'stable';

    return { current, average, trend, percentile };
  },

  /**
   * Predecir si la tendencia continuará o se revertirá
   */
  predictTrend(
    streak: TrendStreak,
    momentum: TrendMomentum,
    stats: TrendAnalysis['stats'],
    volatility: TrendVolatility
  ): TrendAnalysis['trendPrediction'] {
    let continueScore = 0;
    let reverseScore = 0;
    const reasons: string[] = [];

    // Factor 1: Longitud de la racha
    if (streak.days >= 5) {
      reverseScore += 2;
      reasons.push(`Racha de ${streak.days} días es larga, posible agotamiento`);
    } else if (streak.days >= 3) {
      continueScore += 1;
      reasons.push(`Racha de ${streak.days} días muestra momentum`);
    }

    // Factor 2: Momentum alineado con racha
    if ((streak.direction === 'up' && momentum.signal === 'bullish') ||
        (streak.direction === 'down' && momentum.signal === 'bearish')) {
      continueScore += 2;
      reasons.push('Momentum alineado con la racha');
    } else if ((streak.direction === 'up' && momentum.signal === 'bearish') ||
               (streak.direction === 'down' && momentum.signal === 'bullish')) {
      reverseScore += 2;
      reasons.push('Momentum contrario a la racha');
    }

    // Factor 3: Fuerza del momentum
    if (momentum.strength === 'strong') {
      if (momentum.signal !== 'neutral') {
        continueScore += 1;
        reasons.push('Momentum fuerte');
      }
    }

    // Factor 4: Volatilidad
    if (volatility.percentile > 80) {
      reverseScore += 1;
      reasons.push('Volatilidad alta, mayor incertidumbre');
    }

    // Factor 5: Balance up/down días
    const ratio = stats.up_days_30d / (stats.down_days_30d || 1);
    if (streak.direction === 'up' && ratio > 1.5) {
      continueScore += 1;
      reasons.push('Historial alcista reciente');
    } else if (streak.direction === 'down' && ratio < 0.7) {
      continueScore += 1;
      reasons.push('Historial bajista reciente');
    }

    // Determinar predicción
    const diff = continueScore - reverseScore;
    let direction: 'continue' | 'reverse' | 'uncertain';
    let probability: number;

    if (diff >= 2) {
      direction = 'continue';
      probability = Math.min(75, 50 + diff * 8);
    } else if (diff <= -2) {
      direction = 'reverse';
      probability = Math.min(75, 50 + Math.abs(diff) * 8);
    } else {
      direction = 'uncertain';
      probability = 50;
    }

    return {
      direction,
      probability,
      reasoning: reasons.slice(0, 3).join('. '),
    };
  },

  /**
   * Obtener ranking de activos por tendencia
   */
  async getTopTrends(
    category: 'gainers' | 'losers' | 'streaks' | 'momentum' | 'all' = 'all',
    limit: number = 20
  ): Promise<TrendRanking[]> {
    const cacheKey = `top-trends:${category}`;
    const cached = topTrendsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data.slice(0, limit);
    }

    logger.info(`[TrendsService] Scanning ${POPULAR_ASSETS.length} assets for top trends...`);
    
    const rankings: TrendRanking[] = [];
    const batchSize = 5;
    
    // Procesar en lotes para no saturar la API
    for (let i = 0; i < POPULAR_ASSETS.length; i += batchSize) {
      const batch = POPULAR_ASSETS.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(symbol => this.analyzeTrendQuick(symbol))
      );
      
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          rankings.push(result.value);
        }
      }
      
      // Pequeña pausa entre lotes
      if (i + batchSize < POPULAR_ASSETS.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // Ordenar según categoría
    let sorted: TrendRanking[];
    switch (category) {
      case 'gainers':
        sorted = rankings
          .filter(r => r.streak.direction === 'up' || r.change7d > 0)
          .sort((a, b) => b.trendScore - a.trendScore);
        break;
      case 'losers':
        sorted = rankings
          .filter(r => r.streak.direction === 'down' || r.change7d < 0)
          .sort((a, b) => a.trendScore - b.trendScore);
        break;
      case 'streaks':
        sorted = rankings.sort((a, b) => b.streak.days - a.streak.days);
        break;
      case 'momentum':
        sorted = rankings
          .filter(r => r.momentum.signal !== 'neutral')
          .sort((a, b) => Math.abs(b.momentum.score) - Math.abs(a.momentum.score));
        break;
      default:
        sorted = rankings.sort((a, b) => Math.abs(b.trendScore) - Math.abs(a.trendScore));
    }
    
    // Guardar en cache
    topTrendsCache.set(cacheKey, {
      data: sorted,
      expiresAt: Date.now() + TOP_TRENDS_CACHE_TTL,
    });
    
    logger.info(`[TrendsService] Found ${sorted.length} assets for category ${category}`);
    return sorted.slice(0, limit);
  },

  /**
   * Análisis rápido para ranking (menos detallado que analyzeTrend)
   */
  async analyzeTrendQuick(symbol: string): Promise<TrendRanking | null> {
    try {
      // Obtener datos históricos (1 mes es suficiente para ranking)
      const history = await yahooService.getHistory(symbol, '1mo', '1d');
      
      if (!history || history.length < 5) {
        return null;
      }

      const prices = history.map(d => d.close);
      const currentPrice = prices[prices.length - 1];
      
      // Calcular cambios
      const change24h = history.length >= 2 
        ? ((prices[prices.length - 1] - prices[prices.length - 2]) / prices[prices.length - 2]) * 100 
        : 0;
      const change7d = history.length >= 7 
        ? ((prices[prices.length - 1] - prices[Math.max(0, prices.length - 7)]) / prices[Math.max(0, prices.length - 7)]) * 100 
        : 0;
      const change30d = history.length >= 20 
        ? ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100 
        : 0;
      
      // Calcular racha
      let streakDays = 0;
      let streakDirection: 'up' | 'down' | 'sideways' = 'sideways';
      let streakChange = 0;
      
      for (let i = history.length - 1; i > 0; i--) {
        const dayChange = ((history[i].close - history[i-1].close) / history[i-1].close) * 100;
        const direction = dayChange > 0.1 ? 'up' : dayChange < -0.1 ? 'down' : 'sideways';
        
        if (i === history.length - 1) {
          streakDirection = direction;
        }
        
        if (direction === streakDirection || direction === 'sideways') {
          streakDays++;
          streakChange += dayChange;
        } else {
          break;
        }
      }
      
      // Calcular momentum (simple)
      const shortMA = this.calculateSMA(prices, 5);
      const longMA = this.calculateSMA(prices, 20);
      const momentumScore = shortMA && longMA ? ((shortMA - longMA) / longMA) * 100 : 0;
      
      let momentumSignal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
      let momentumStrength: 'strong' | 'moderate' | 'weak' = 'weak';
      
      if (momentumScore > 3) {
        momentumSignal = 'bullish';
        momentumStrength = momentumScore > 8 ? 'strong' : momentumScore > 5 ? 'moderate' : 'weak';
      } else if (momentumScore < -3) {
        momentumSignal = 'bearish';
        momentumStrength = momentumScore < -8 ? 'strong' : momentumScore < -5 ? 'moderate' : 'weak';
      }
      
      // Calcular trend score compuesto
      // Combina racha, momentum y cambios recientes
      const trendScore = (
        (streakDirection === 'up' ? streakDays * 2 : streakDirection === 'down' ? -streakDays * 2 : 0) +
        momentumScore * 1.5 +
        change7d * 0.5 +
        (change24h > 0 ? 2 : change24h < 0 ? -2 : 0)
      );
      
      // Predicción simple
      let trendPrediction: 'continue' | 'reverse' | 'uncertain' = 'uncertain';
      if (streakDays >= 3 && ((streakDirection === 'up' && momentumSignal === 'bullish') ||
          (streakDirection === 'down' && momentumSignal === 'bearish'))) {
        trendPrediction = 'continue';
      } else if (streakDays >= 5 && ((streakDirection === 'up' && momentumSignal === 'bearish') ||
                 (streakDirection === 'down' && momentumSignal === 'bullish'))) {
        trendPrediction = 'reverse';
      }
      
      // Obtener nombre del activo
      const quote = await yahooService.getQuote(symbol);
      const name = quote?.name || symbol;
      
      return {
        symbol,
        name,
        currentPrice,
        streak: {
          direction: streakDirection,
          days: streakDays,
          totalChange: streakChange,
        },
        momentum: {
          signal: momentumSignal,
          strength: momentumStrength,
          score: Math.round(momentumScore * 10) / 10,
        },
        change24h: Math.round(change24h * 100) / 100,
        change7d: Math.round(change7d * 100) / 100,
        change30d: Math.round(change30d * 100) / 100,
        trendScore: Math.round(trendScore * 10) / 10,
        trendPrediction,
      };
    } catch (error) {
      logger.warn(`[TrendsService] Failed to analyze ${symbol}:`, error);
      return null;
    }
  },

  /**
   * Calcular SMA simple
   */
  calculateSMA(prices: number[], period: number): number | null {
    if (prices.length < period) return null;
    const slice = prices.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  },
};

// Cache para top trends (más largo porque es costoso calcular)
const topTrendsCache = new Map<string, { data: TrendRanking[]; expiresAt: number }>();
const TOP_TRENDS_CACHE_TTL = 30 * 60 * 1000; // 30 minutos
