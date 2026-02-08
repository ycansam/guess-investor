/**
 * Divergence Detection Service
 * Detecta divergencias entre precio y indicadores técnicos (RSI, MACD)
 * 
 * Divergencia = Precio y indicador van en direcciones opuestas
 * - Divergencia Alcista: Precio hace mínimos más bajos, RSI hace mínimos más altos → Posible reversión al alza
 * - Divergencia Bajista: Precio hace máximos más altos, RSI hace máximos más bajos → Posible reversión a la baja
 * 
 * Usado por: Paul Tudor Jones, Jesse Livermore (conceptualmente)
 */

import { logger } from '../../middleware/logger.js';

export interface DivergenceSignal {
  type: 'bullish' | 'bearish';
  indicator: 'RSI' | 'MACD' | 'Stochastic';
  strength: 'weak' | 'moderate' | 'strong';
  description: string;
  priceAction: string;
  indicatorAction: string;
  confidence: number; // 0-100
  tradingImplication: string;
}

export interface DivergenceAnalysis {
  hasDivergence: boolean;
  signals: DivergenceSignal[];
  overallBias: 'bullish' | 'bearish' | 'neutral';
  riskLevel: 'low' | 'medium' | 'high';
  summary: string;
  recommendation: string;
}

interface PricePoint {
  price: number;
  rsi?: number;
  macd?: number;
  stochastic?: number;
  index: number;
}

export const divergenceService = {
  /**
   * Obtiene análisis de divergencias para un símbolo (método principal)
   */
  async getDivergences(symbol: string): Promise<DivergenceAnalysis> {
    try {
      // Obtener datos históricos
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return this.getDefaultAnalysis('No se pudieron obtener datos para ' + symbol);
      }

      const json = await response.json() as any;
      const result = json.chart?.result?.[0];
      
      if (!result?.indicators?.quote?.[0]?.close) {
        return this.getDefaultAnalysis('Datos inválidos para ' + symbol);
      }

      const closes = result.indicators.quote[0].close.filter((c: any) => c !== null) as number[];
      const highs = result.indicators.quote[0].high.filter((h: any) => h !== null) as number[];
      const lows = result.indicators.quote[0].low.filter((l: any) => l !== null) as number[];

      if (closes.length < 20) {
        return this.getDefaultAnalysis('Datos insuficientes');
      }

      // Calcular indicadores
      const rsiValues = this.calculateRSI(closes, 14);
      const macdValues = this.calculateMACD(closes);
      const stochasticValues = this.calculateStochastic(closes, highs, lows);

      // Analizar divergencias
      const analysis = this.analyze(closes, rsiValues, macdValues, stochasticValues);
      
      logger.info(`[Divergence] ${symbol}: ${analysis.hasDivergence ? analysis.overallBias : 'sin divergencias'}`);
      
      return analysis;
    } catch (error) {
      logger.error(`[Divergence] Error analyzing ${symbol}:`, error);
      return this.getDefaultAnalysis('Error al analizar divergencias');
    }
  },

  /**
   * Retorna análisis por defecto
   */
  getDefaultAnalysis(message: string): DivergenceAnalysis {
    return {
      hasDivergence: false,
      signals: [],
      overallBias: 'neutral',
      riskLevel: 'low',
      summary: message,
      recommendation: '',
    };
  },

  /**
   * Calcula RSI
   */
  calculateRSI(prices: number[], period: number = 14): number[] {
    const rsi: number[] = [];
    if (prices.length < period + 1) return rsi;

    let gains = 0;
    let losses = 0;

    // Primer RSI
    for (let i = 1; i <= period; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    // Primeros valores vacíos
    for (let i = 0; i < period; i++) {
      rsi.push(50); // valor neutral
    }

    // RSI inicial
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi.push(100 - (100 / (1 + rs)));

    // RSI restantes
    for (let i = period + 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      const currentGain = change > 0 ? change : 0;
      const currentLoss = change < 0 ? -change : 0;

      avgGain = (avgGain * (period - 1) + currentGain) / period;
      avgLoss = (avgLoss * (period - 1) + currentLoss) / period;

      const rsCalc = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rsCalc)));
    }

    return rsi;
  },

  /**
   * Calcula MACD (histogram)
   */
  calculateMACD(prices: number[], fast: number = 12, slow: number = 26, signal: number = 9): number[] {
    const ema = (data: number[], period: number): number[] => {
      const result: number[] = [];
      const multiplier = 2 / (period + 1);
      
      // SMA inicial
      let sum = 0;
      for (let i = 0; i < period && i < data.length; i++) {
        sum += data[i];
        result.push(sum / (i + 1));
      }
      
      // EMA
      for (let i = period; i < data.length; i++) {
        const emaVal = (data[i] - result[i - 1]) * multiplier + result[i - 1];
        result.push(emaVal);
      }
      
      return result;
    };

    const emaFast = ema(prices, fast);
    const emaSlow = ema(prices, slow);
    
    // MACD line
    const macdLine: number[] = [];
    for (let i = 0; i < prices.length; i++) {
      macdLine.push((emaFast[i] || 0) - (emaSlow[i] || 0));
    }
    
    // Signal line
    const signalLine = ema(macdLine, signal);
    
    // Histogram
    const histogram: number[] = [];
    for (let i = 0; i < prices.length; i++) {
      histogram.push((macdLine[i] || 0) - (signalLine[i] || 0));
    }
    
    return histogram;
  },

  /**
   * Calcula Stochastic %K
   */
  calculateStochastic(closes: number[], highs: number[], lows: number[], period: number = 14): number[] {
    const stoch: number[] = [];
    
    for (let i = 0; i < closes.length; i++) {
      if (i < period - 1) {
        stoch.push(50);
        continue;
      }
      
      let lowestLow = Infinity;
      let highestHigh = -Infinity;
      
      for (let j = i - period + 1; j <= i; j++) {
        if (lows[j] < lowestLow) lowestLow = lows[j];
        if (highs[j] > highestHigh) highestHigh = highs[j];
      }
      
      const range = highestHigh - lowestLow;
      if (range === 0) {
        stoch.push(50);
      } else {
        stoch.push(((closes[i] - lowestLow) / range) * 100);
      }
    }
    
    return stoch;
  },

  /**
   * Analiza divergencias en los datos históricos
   */
  analyze(
    prices: number[],
    rsiValues: number[],
    macdValues: number[],
    stochasticValues?: number[]
  ): DivergenceAnalysis {
    const signals: DivergenceSignal[] = [];
    
    if (prices.length < 10) {
      return {
        hasDivergence: false,
        signals: [],
        overallBias: 'neutral',
        riskLevel: 'low',
        summary: 'Datos insuficientes para análisis de divergencias',
        recommendation: '',
      };
    }

    // Encontrar máximos y mínimos locales (últimos 20 períodos)
    const lookback = Math.min(20, prices.length);
    const recentPrices = prices.slice(-lookback);
    const recentRSI = rsiValues.slice(-lookback);
    const recentMACD = macdValues.slice(-lookback);
    const recentStoch = stochasticValues?.slice(-lookback);

    // Detectar divergencias RSI
    const rsiDivergence = this.detectDivergence(recentPrices, recentRSI, 'RSI');
    if (rsiDivergence) {
      signals.push(rsiDivergence);
    }

    // Detectar divergencias MACD
    const macdDivergence = this.detectDivergence(recentPrices, recentMACD, 'MACD');
    if (macdDivergence) {
      signals.push(macdDivergence);
    }

    // Detectar divergencias Stochastic
    if (recentStoch && recentStoch.length > 0) {
      const stochDivergence = this.detectDivergence(recentPrices, recentStoch, 'Stochastic');
      if (stochDivergence) {
        signals.push(stochDivergence);
      }
    }

    // Determinar bias general
    const bullishCount = signals.filter(s => s.type === 'bullish').length;
    const bearishCount = signals.filter(s => s.type === 'bearish').length;
    
    let overallBias: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (bullishCount > bearishCount) overallBias = 'bullish';
    else if (bearishCount > bullishCount) overallBias = 'bearish';

    // Calcular nivel de riesgo
    const strongSignals = signals.filter(s => s.strength === 'strong').length;
    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    if (strongSignals >= 2) riskLevel = 'high';
    else if (signals.length >= 2 || strongSignals >= 1) riskLevel = 'medium';

    // Generar resumen
    const summary = this.generateSummary(signals, overallBias);
    const recommendation = this.generateRecommendation(signals, overallBias, riskLevel);

    logger.debug(`[Divergence] Found ${signals.length} divergences, bias: ${overallBias}`);

    return {
      hasDivergence: signals.length > 0,
      signals,
      overallBias,
      riskLevel,
      summary,
      recommendation,
    };
  },

  /**
   * Detecta divergencia entre precio y un indicador
   */
  detectDivergence(
    prices: number[],
    indicator: number[],
    indicatorName: 'RSI' | 'MACD' | 'Stochastic'
  ): DivergenceSignal | null {
    if (prices.length < 5 || indicator.length < 5) return null;

    // Encontrar los últimos 2 picos y valles significativos
    const { highs: priceHighs, lows: priceLows } = this.findPeaksAndValleys(prices);
    const { highs: indHighs, lows: indLows } = this.findPeaksAndValleys(indicator);

    // Divergencia Bajista: Precio hace higher highs, indicador hace lower highs
    if (priceHighs.length >= 2 && indHighs.length >= 2) {
      const [prevPriceHigh, currPriceHigh] = priceHighs.slice(-2);
      const [prevIndHigh, currIndHigh] = indHighs.slice(-2);

      // Verificar que los picos están relativamente alineados en tiempo
      if (Math.abs(currPriceHigh.index - currIndHigh.index) <= 3) {
        const priceHigherHigh = currPriceHigh.value > prevPriceHigh.value;
        const indLowerHigh = currIndHigh.value < prevIndHigh.value;

        if (priceHigherHigh && indLowerHigh) {
          const strength = this.calculateStrength(
            (currPriceHigh.value - prevPriceHigh.value) / prevPriceHigh.value,
            (prevIndHigh.value - currIndHigh.value) / Math.abs(prevIndHigh.value || 1)
          );

          return {
            type: 'bearish',
            indicator: indicatorName,
            strength,
            description: `Divergencia bajista en ${indicatorName}`,
            priceAction: 'Precio hace máximos más altos',
            indicatorAction: `${indicatorName} hace máximos más bajos`,
            confidence: strength === 'strong' ? 80 : strength === 'moderate' ? 65 : 50,
            tradingImplication: 'Posible reversión a la baja. El momentum alcista se está debilitando.',
          };
        }
      }
    }

    // Divergencia Alcista: Precio hace lower lows, indicador hace higher lows
    if (priceLows.length >= 2 && indLows.length >= 2) {
      const [prevPriceLow, currPriceLow] = priceLows.slice(-2);
      const [prevIndLow, currIndLow] = indLows.slice(-2);

      if (Math.abs(currPriceLow.index - currIndLow.index) <= 3) {
        const priceLowerLow = currPriceLow.value < prevPriceLow.value;
        const indHigherLow = currIndLow.value > prevIndLow.value;

        if (priceLowerLow && indHigherLow) {
          const strength = this.calculateStrength(
            (prevPriceLow.value - currPriceLow.value) / prevPriceLow.value,
            (currIndLow.value - prevIndLow.value) / Math.abs(prevIndLow.value || 1)
          );

          return {
            type: 'bullish',
            indicator: indicatorName,
            strength,
            description: `Divergencia alcista en ${indicatorName}`,
            priceAction: 'Precio hace mínimos más bajos',
            indicatorAction: `${indicatorName} hace mínimos más altos`,
            confidence: strength === 'strong' ? 80 : strength === 'moderate' ? 65 : 50,
            tradingImplication: 'Posible reversión al alza. La presión vendedora se está agotando.',
          };
        }
      }
    }

    return null;
  },

  /**
   * Encuentra picos y valles en una serie de datos
   */
  findPeaksAndValleys(data: number[]): { 
    highs: Array<{ value: number; index: number }>; 
    lows: Array<{ value: number; index: number }>;
  } {
    const highs: Array<{ value: number; index: number }> = [];
    const lows: Array<{ value: number; index: number }> = [];

    for (let i = 2; i < data.length - 2; i++) {
      // Pico local
      if (data[i] > data[i - 1] && data[i] > data[i - 2] && 
          data[i] > data[i + 1] && data[i] > data[i + 2]) {
        highs.push({ value: data[i], index: i });
      }
      // Valle local
      if (data[i] < data[i - 1] && data[i] < data[i - 2] && 
          data[i] < data[i + 1] && data[i] < data[i + 2]) {
        lows.push({ value: data[i], index: i });
      }
    }

    return { highs, lows };
  },

  /**
   * Calcula la fuerza de la divergencia
   */
  calculateStrength(priceChange: number, indicatorChange: number): 'weak' | 'moderate' | 'strong' {
    const avgChange = (Math.abs(priceChange) + Math.abs(indicatorChange)) / 2;
    
    if (avgChange > 0.05) return 'strong';     // >5% diferencia
    if (avgChange > 0.02) return 'moderate';   // 2-5%
    return 'weak';                              // <2%
  },

  /**
   * Genera resumen de divergencias
   */
  generateSummary(signals: DivergenceSignal[], bias: 'bullish' | 'bearish' | 'neutral'): string {
    if (signals.length === 0) {
      return 'No se detectaron divergencias significativas. Precio e indicadores alineados.';
    }

    const indicators = signals.map(s => s.indicator).join(', ');
    const types = [...new Set(signals.map(s => s.type))];

    if (types.length === 1) {
      return `⚠️ Divergencia ${types[0] === 'bullish' ? 'ALCISTA' : 'BAJISTA'} detectada en ${indicators}. ${
        types[0] === 'bullish' 
          ? 'El precio podría rebotar pronto.' 
          : 'El precio podría corregir pronto.'
      }`;
    }

    return `⚠️ Señales mixtas: divergencias en ${indicators}. Mercado en punto de inflexión potencial.`;
  },

  /**
   * Genera recomendación de trading
   */
  generateRecommendation(
    signals: DivergenceSignal[], 
    bias: 'bullish' | 'bearish' | 'neutral',
    riskLevel: 'low' | 'medium' | 'high'
  ): string {
    if (signals.length === 0) {
      return '';
    }

    const strongSignals = signals.filter(s => s.strength === 'strong');

    if (bias === 'bullish') {
      if (strongSignals.length > 0) {
        return '🟢 ALERTA: Divergencia alcista fuerte. Considerar posiciones largas con stop ajustado.';
      }
      return '🟡 Divergencia alcista moderada. Esperar confirmación antes de entrar largo.';
    }

    if (bias === 'bearish') {
      if (strongSignals.length > 0) {
        return '🔴 ALERTA: Divergencia bajista fuerte. Considerar cerrar largos o abrir cortos con stop.';
      }
      return '🟡 Divergencia bajista moderada. Precaución con posiciones largas.';
    }

    return '⚠️ Señales contradictorias. Mejor esperar claridad antes de operar.';
  },
};
