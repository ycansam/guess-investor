/**
 * Intraday Trend Service
 * Analiza tendencias de corto plazo para predicciones intradía
 * 
 * Usa ventanas temporales cortas:
 * - 1h: Momentum inmediato
 * - 4h: Tendencia de sesión
 * - 1d: Tendencia del día
 * 
 * A diferencia del trend clásico (30d/90d), este servicio
 * captura movimientos relevantes para operaciones intradía.
 */

import { logger } from '../../middleware/logger.js';

export interface IntradayTrendData {
  // Cambios por ventana temporal
  change1h: number;          // Cambio última hora
  change4h: number;          // Cambio últimas 4 horas
  changeToday: number;       // Cambio desde apertura
  changePremarket: number;   // Cambio en premarket (si disponible)
  
  // Momentum
  momentum1h: 'strong_up' | 'up' | 'flat' | 'down' | 'strong_down';
  momentum4h: 'strong_up' | 'up' | 'flat' | 'down' | 'strong_down';
  momentumToday: 'strong_up' | 'up' | 'flat' | 'down' | 'strong_down';
  
  // Velocidad del movimiento
  velocity: number;          // Tasa de cambio por hora
  acceleration: number;      // Cambio en la tasa de cambio
  
  // Consistencia
  trendConsistency: number;  // 0-100, qué tan consistente es la dirección
  
  // VWAP
  vwap: number | null;
  priceVsVwap: 'above' | 'below' | 'at';
  vwapDistance: number;      // % distancia al VWAP
  
  // Pivots diarios
  dailyPivot: number | null;
  r1: number | null;
  r2: number | null;
  s1: number | null;
  s2: number | null;
  pivotPosition: 'above_r2' | 'above_r1' | 'above_pivot' | 'below_pivot' | 'below_s1' | 'below_s2';
  
  // Score combinado (-100 a +100)
  intradayTrendScore: number;
  
  // Señal
  signal: 'strong_bullish' | 'bullish' | 'neutral' | 'bearish' | 'strong_bearish';
  confidence: number;
  summary: string;
  
  // Meta
  hasData: boolean;
  dataQuality: 'high' | 'medium' | 'low';
  lastUpdate: Date;
}

// Cache con TTL corto para intradía
const cache = new Map<string, { data: IntradayTrendData; timestamp: number }>();
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutos (más corto para intradía)

export const intradayTrendService = {
  /**
   * Obtiene análisis de tendencia intradía
   */
  async getIntradayTrend(symbol: string): Promise<IntradayTrendData> {
    const upperSymbol = symbol.toUpperCase();
    
    // Check cache
    const cached = cache.get(upperSymbol);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }

    try {
      const data = await this.analyzeIntradayTrend(upperSymbol);
      
      if (data.hasData) {
        cache.set(upperSymbol, { data, timestamp: Date.now() });
        logger.info(`[IntradayTrend] ${upperSymbol}: 1h=${data.change1h.toFixed(2)}%, 4h=${data.change4h.toFixed(2)}%, score=${data.intradayTrendScore.toFixed(0)}`);
      }
      
      return data;
    } catch (error) {
      logger.error(`[IntradayTrend] Error for ${symbol}:`, error);
      return this.getDefaultData();
    }
  },

  /**
   * Analiza la tendencia intradía
   */
  async analyzeIntradayTrend(symbol: string): Promise<IntradayTrendData> {
    try {
      // Obtener datos de 2 días con intervalo de 5 minutos incluyendo pre/post market
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&range=2d&includePrePost=true`;
      
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return this.getDefaultData();
      }

      const json = await response.json() as any;
      const result = json.chart?.result?.[0];
      
      if (!result?.indicators?.quote?.[0]) {
        return this.getDefaultData();
      }

      const timestamps = result.timestamp || [];
      const closes = result.indicators.quote[0].close || [];
      const volumes = result.indicators.quote[0].volume || [];
      const highs = result.indicators.quote[0].high || [];
      const lows = result.indicators.quote[0].low || [];
      
      // Obtener metadata de trading periods para pre/post market
      const tradingPeriods = result.meta?.tradingPeriods;
      const regularMarketTime = result.meta?.regularMarketTime;
      
      if (closes.length < 12) { // Mínimo 1 hora de datos
        return this.getDefaultData();
      }

      // Precio actual
      const currentPrice = closes[closes.length - 1];
      if (!currentPrice) return this.getDefaultData();

      // Calcular cambios por ventana temporal
      const now = Date.now();
      const oneHourAgo = now - 60 * 60 * 1000;
      const fourHoursAgo = now - 4 * 60 * 60 * 1000;
      
      // Encontrar índices por tiempo
      const idx1h = this.findIndexByTime(timestamps, oneHourAgo);
      const idx4h = this.findIndexByTime(timestamps, fourHoursAgo);
      const idxDayStart = this.findDayStartIndex(timestamps);
      
      const price1h = closes[idx1h] || currentPrice;
      const price4h = closes[idx4h] || currentPrice;
      const priceOpen = closes[idxDayStart] || currentPrice;
      
      const change1h = ((currentPrice - price1h) / price1h) * 100;
      const change4h = ((currentPrice - price4h) / price4h) * 100;
      const changeToday = ((currentPrice - priceOpen) / priceOpen) * 100;
      
      // Pre-market analysis
      const premarketData = this.analyzePremarket(timestamps, closes, volumes, tradingPeriods, regularMarketTime);
      const changePremarket = premarketData.change;
      
      // Momentum
      const momentum1h = this.classifyMomentum(change1h, 0.3);
      const momentum4h = this.classifyMomentum(change4h, 0.6);
      const momentumToday = this.classifyMomentum(changeToday, 1.0);
      
      // Calcular velocidad (cambio por hora)
      const hoursElapsed = Math.max(0.5, (now - timestamps[idxDayStart] * 1000) / (1000 * 60 * 60));
      const velocity = changeToday / hoursElapsed;
      
      // Aceleración (comparando velocidad última hora vs hora anterior)
      const velocity1h = change1h;
      const prevHourChange = idx1h > 12 ? ((closes[idx1h] - closes[idx1h - 12]) / closes[idx1h - 12]) * 100 : 0;
      const acceleration = velocity1h - prevHourChange;
      
      // Consistencia de tendencia
      const trendConsistency = this.calculateTrendConsistency(closes.slice(-24)); // Últimas 2 horas
      
      // Calcular VWAP
      const { vwap, vwapDistance } = this.calculateVWAP(
        closes.slice(idxDayStart), 
        volumes.slice(idxDayStart), 
        currentPrice
      );
      
      // Calcular Pivots
      const { pivot, r1, r2, s1, s2 } = this.calculatePivots(
        highs.slice(0, idxDayStart),
        lows.slice(0, idxDayStart),
        closes.slice(0, idxDayStart)
      );
      
      // Posición vs VWAP
      let priceVsVwap: 'above' | 'below' | 'at' = 'at';
      if (vwap) {
        const distance = ((currentPrice - vwap) / vwap) * 100;
        if (distance > 0.1) priceVsVwap = 'above';
        else if (distance < -0.1) priceVsVwap = 'below';
      }
      
      // Posición vs Pivots
      const pivotPosition = this.getPivotPosition(currentPrice, pivot, r1, r2, s1, s2);
      
      // Score combinado
      const intradayTrendScore = this.calculateIntradayScore({
        change1h,
        change4h,
        changeToday,
        velocity,
        acceleration,
        trendConsistency,
        vwapDistance,
        pivotPosition,
      });
      
      // Señal final
      const signal = this.getSignal(intradayTrendScore);
      const confidence = Math.min(95, Math.abs(intradayTrendScore) * 0.7 + 30);
      
      return {
        change1h,
        change4h,
        changeToday,
        changePremarket,
        momentum1h,
        momentum4h,
        momentumToday,
        velocity,
        acceleration,
        trendConsistency,
        vwap,
        priceVsVwap,
        vwapDistance,
        dailyPivot: pivot,
        r1,
        r2,
        s1,
        s2,
        pivotPosition,
        intradayTrendScore,
        signal,
        confidence,
        summary: this.generateSummary(change1h, change4h, changeToday, signal),
        hasData: true,
        dataQuality: closes.length > 48 ? 'high' : closes.length > 24 ? 'medium' : 'low',
        lastUpdate: new Date(),
      };
    } catch (error) {
      logger.error(`[IntradayTrend] Error analyzing:`, error);
      return this.getDefaultData();
    }
  },

  /**
   * Encuentra el índice más cercano a un timestamp
   */
  findIndexByTime(timestamps: number[], targetTime: number): number {
    for (let i = timestamps.length - 1; i >= 0; i--) {
      if (timestamps[i] * 1000 <= targetTime) {
        return i;
      }
    }
    return 0;
  },

  /**
   * Encuentra el índice del inicio del día actual
   */
  findDayStartIndex(timestamps: number[]): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.getTime();
    
    for (let i = 0; i < timestamps.length; i++) {
      if (timestamps[i] * 1000 >= todayStart) {
        return i;
      }
    }
    return 0;
  },

  /**
   * Analiza datos de pre-market (4:00 AM - 9:30 AM ET)
   */
  analyzePremarket(
    timestamps: number[],
    closes: number[],
    volumes: number[],
    tradingPeriods: any,
    regularMarketTime: number | undefined
  ): { change: number; volume: number; high: number; low: number; hasData: boolean } {
    try {
      const now = new Date();
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      
      // Pre-market: 4:00 AM - 9:30 AM ET (9:00 - 14:30 UTC)
      const premarketStart = new Date(today);
      premarketStart.setUTCHours(9, 0, 0, 0); // 4:00 AM ET
      
      const premarketEnd = new Date(today);
      premarketEnd.setUTCHours(14, 30, 0, 0); // 9:30 AM ET
      
      const premarketStartMs = premarketStart.getTime();
      const premarketEndMs = premarketEnd.getTime();
      
      // Obtener cierre del día anterior (último precio antes de hoy)
      let previousClose = 0;
      const yesterdayEnd = today.getTime();
      
      for (let i = timestamps.length - 1; i >= 0; i--) {
        const ts = timestamps[i] * 1000;
        if (ts < yesterdayEnd && closes[i]) {
          previousClose = closes[i];
          break;
        }
      }
      
      // Si no tenemos cierre anterior, buscar en tradingPeriods o meta
      if (!previousClose && regularMarketTime) {
        // Usar precio de mercado regular como referencia
        for (let i = 0; i < timestamps.length; i++) {
          if (timestamps[i] === regularMarketTime) {
            previousClose = closes[i] || 0;
            break;
          }
        }
      }
      
      // Filtrar datos de premarket de hoy
      const premarketData: { price: number; volume: number }[] = [];
      
      for (let i = 0; i < timestamps.length; i++) {
        const ts = timestamps[i] * 1000;
        if (ts >= premarketStartMs && ts < premarketEndMs && closes[i]) {
          premarketData.push({
            price: closes[i],
            volume: volumes[i] || 0
          });
        }
      }
      
      if (premarketData.length === 0 || !previousClose) {
        return { change: 0, volume: 0, high: 0, low: 0, hasData: false };
      }
      
      const premarketPrices = premarketData.map(d => d.price);
      const lastPremarketPrice = premarketPrices[premarketPrices.length - 1];
      const premarketHigh = Math.max(...premarketPrices);
      const premarketLow = Math.min(...premarketPrices);
      const premarketVolume = premarketData.reduce((sum, d) => sum + d.volume, 0);
      
      const change = ((lastPremarketPrice - previousClose) / previousClose) * 100;
      
      logger.debug(`[IntradayTrend] Premarket: prev=${previousClose.toFixed(2)}, last=${lastPremarketPrice.toFixed(2)}, change=${change.toFixed(2)}%`);
      
      return {
        change,
        volume: premarketVolume,
        high: premarketHigh,
        low: premarketLow,
        hasData: true
      };
    } catch (error) {
      logger.debug(`[IntradayTrend] Premarket analysis error:`, error);
      return { change: 0, volume: 0, high: 0, low: 0, hasData: false };
    }
  },

  /**
   * Clasifica el momentum según el cambio
   */
  classifyMomentum(change: number, threshold: number): 'strong_up' | 'up' | 'flat' | 'down' | 'strong_down' {
    if (change > threshold * 2) return 'strong_up';
    if (change > threshold) return 'up';
    if (change < -threshold * 2) return 'strong_down';
    if (change < -threshold) return 'down';
    return 'flat';
  },

  /**
   * Calcula la consistencia de la tendencia
   */
  calculateTrendConsistency(closes: number[]): number {
    if (closes.length < 2) return 50;
    
    let upMoves = 0;
    let downMoves = 0;
    
    for (let i = 1; i < closes.length; i++) {
      if (closes[i] > closes[i - 1]) upMoves++;
      else if (closes[i] < closes[i - 1]) downMoves++;
    }
    
    const totalMoves = upMoves + downMoves;
    if (totalMoves === 0) return 50;
    
    const dominantMoves = Math.max(upMoves, downMoves);
    return (dominantMoves / totalMoves) * 100;
  },

  /**
   * Calcula VWAP (Volume Weighted Average Price)
   */
  calculateVWAP(closes: number[], volumes: number[], currentPrice: number): { vwap: number | null; vwapDistance: number } {
    let cumPriceVolume = 0;
    let cumVolume = 0;
    
    for (let i = 0; i < closes.length; i++) {
      if (closes[i] && volumes[i]) {
        cumPriceVolume += closes[i] * volumes[i];
        cumVolume += volumes[i];
      }
    }
    
    if (cumVolume === 0) {
      return { vwap: null, vwapDistance: 0 };
    }
    
    const vwap = cumPriceVolume / cumVolume;
    const vwapDistance = ((currentPrice - vwap) / vwap) * 100;
    
    return { vwap, vwapDistance };
  },

  /**
   * Calcula puntos pivote diarios
   */
  calculatePivots(
    highs: number[], 
    lows: number[], 
    closes: number[]
  ): { pivot: number | null; r1: number | null; r2: number | null; s1: number | null; s2: number | null } {
    // Usar el último día completo
    const validHighs = highs.filter(h => h !== null && h > 0);
    const validLows = lows.filter(l => l !== null && l > 0);
    const validCloses = closes.filter(c => c !== null && c > 0);
    
    if (validHighs.length === 0 || validLows.length === 0 || validCloses.length === 0) {
      return { pivot: null, r1: null, r2: null, s1: null, s2: null };
    }
    
    const high = Math.max(...validHighs.slice(-12)); // Últimas horas del día anterior
    const low = Math.min(...validLows.slice(-12));
    const close = validCloses[validCloses.length - 1];
    
    const pivot = (high + low + close) / 3;
    const r1 = 2 * pivot - low;
    const r2 = pivot + (high - low);
    const s1 = 2 * pivot - high;
    const s2 = pivot - (high - low);
    
    return { pivot, r1, r2, s1, s2 };
  },

  /**
   * Determina la posición del precio respecto a los pivots
   */
  getPivotPosition(
    currentPrice: number,
    pivot: number | null,
    r1: number | null,
    r2: number | null,
    s1: number | null,
    s2: number | null
  ): 'above_r2' | 'above_r1' | 'above_pivot' | 'below_pivot' | 'below_s1' | 'below_s2' {
    if (!pivot) return 'above_pivot';
    
    if (r2 && currentPrice > r2) return 'above_r2';
    if (r1 && currentPrice > r1) return 'above_r1';
    if (currentPrice > pivot) return 'above_pivot';
    if (s2 && currentPrice < s2) return 'below_s2';
    if (s1 && currentPrice < s1) return 'below_s1';
    return 'below_pivot';
  },

  /**
   * Calcula el score intradía combinado
   */
  calculateIntradayScore(params: {
    change1h: number;
    change4h: number;
    changeToday: number;
    velocity: number;
    acceleration: number;
    trendConsistency: number;
    vwapDistance: number;
    pivotPosition: string;
  }): number {
    const {
      change1h,
      change4h,
      changeToday,
      velocity,
      acceleration,
      trendConsistency,
      vwapDistance,
      pivotPosition,
    } = params;
    
    // Componente de momentum (40%)
    const momentumScore = (
      (change1h * 15) +     // Últimos 60 min: peso alto
      (change4h * 8) +      // Últimas 4h: peso medio
      (changeToday * 4)     // Desde apertura: peso menor
    );
    
    // Componente de velocidad (20%)
    const velocityScore = velocity * 10;
    
    // Componente de aceleración (15%)
    const accelerationScore = acceleration * 8;
    
    // Componente de consistencia (10%)
    const consistencyScore = ((trendConsistency - 50) / 50) * 15;
    
    // Componente VWAP (10%)
    const vwapScore = vwapDistance * 5;
    
    // Componente de pivots (5%)
    let pivotScore = 0;
    switch (pivotPosition) {
      case 'above_r2': pivotScore = 15; break;
      case 'above_r1': pivotScore = 10; break;
      case 'above_pivot': pivotScore = 5; break;
      case 'below_pivot': pivotScore = -5; break;
      case 'below_s1': pivotScore = -10; break;
      case 'below_s2': pivotScore = -15; break;
    }
    
    // Combinar y normalizar a -100 a +100
    let rawScore = momentumScore + velocityScore + accelerationScore + consistencyScore + vwapScore + pivotScore;
    
    // Aplicar función sigmoide suave para normalizar
    rawScore = Math.max(-100, Math.min(100, rawScore));
    
    return rawScore;
  },

  /**
   * Determina la señal final
   */
  getSignal(score: number): 'strong_bullish' | 'bullish' | 'neutral' | 'bearish' | 'strong_bearish' {
    if (score > 40) return 'strong_bullish';
    if (score > 15) return 'bullish';
    if (score < -40) return 'strong_bearish';
    if (score < -15) return 'bearish';
    return 'neutral';
  },

  /**
   * Genera resumen
   */
  generateSummary(change1h: number, change4h: number, changeToday: number, signal: string): string {
    const direction = signal.includes('bullish') ? 'alcista' : signal.includes('bearish') ? 'bajista' : 'lateral';
    const strength = signal.includes('strong') ? 'fuerte' : 'moderada';
    
    return `Tendencia intradía ${direction} (${strength}). ` +
      `1h: ${change1h >= 0 ? '+' : ''}${change1h.toFixed(2)}%, ` +
      `4h: ${change4h >= 0 ? '+' : ''}${change4h.toFixed(2)}%, ` +
      `Hoy: ${changeToday >= 0 ? '+' : ''}${changeToday.toFixed(2)}%`;
  },

  /**
   * Retorna datos vacíos
   */
  getDefaultData(): IntradayTrendData {
    return {
      change1h: 0,
      change4h: 0,
      changeToday: 0,
      changePremarket: 0,
      momentum1h: 'flat',
      momentum4h: 'flat',
      momentumToday: 'flat',
      velocity: 0,
      acceleration: 0,
      trendConsistency: 50,
      vwap: null,
      priceVsVwap: 'at',
      vwapDistance: 0,
      dailyPivot: null,
      r1: null,
      r2: null,
      s1: null,
      s2: null,
      pivotPosition: 'above_pivot',
      intradayTrendScore: 0,
      signal: 'neutral',
      confidence: 30,
      summary: 'Sin datos suficientes para análisis intradía',
      hasData: false,
      dataQuality: 'low',
      lastUpdate: new Date(),
    };
  },
};
