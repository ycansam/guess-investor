/**
 * Volatility Analysis Service
 * Compara volatilidad implícita vs realizada
 * 
 * IV > RV = Opciones "caras" (vender premium)
 * IV < RV = Opciones "baratas" (comprar opciones)
 * 
 * También detecta:
 * - Volatility crush (post-earnings)
 * - Volatility expansion
 * - Percentil histórico de IV
 * 
 * Usado por: Jim Simons
 */

import { logger } from '../../middleware/logger.js';

export interface VolatilityData {
  // Volatilidades
  impliedVolatility: number;      // IV actual (%)
  realizedVolatility: number;     // Volatilidad histórica (%)
  ivRvSpread: number;             // IV - RV
  ivRvRatio: number;              // IV / RV
  
  // Percentiles
  ivPercentile: number;           // Percentil de IV vs histórico (0-100)
  rvPercentile: number;           // Percentil de RV vs histórico
  
  // VIX (para referencia de mercado)
  vixLevel: number;
  vixPercentile: number;
  
  // Análisis
  optionsPricing: 'expensive' | 'fair' | 'cheap';
  volatilityRegime: 'low' | 'normal' | 'elevated' | 'high' | 'extreme';
  
  // Señales
  signal: 'sell_premium' | 'buy_options' | 'neutral';
  confidence: number;
  
  // Predicción
  expectedMove: number;           // Movimiento esperado basado en IV
  
  // Resumen
  summary: string;
  tradingImplication: string;
  
  // Meta
  hasData: boolean;
  symbol: string;
}

// Cache
const cache = new Map<string, { data: VolatilityData; timestamp: number }>();
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutos

export const volatilityService = {
  /**
   * Obtiene análisis de volatilidad para un símbolo
   */
  async getVolatilityAnalysis(symbol: string): Promise<VolatilityData> {
    const upperSymbol = symbol.toUpperCase();
    
    // Check cache
    const cached = cache.get(upperSymbol);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }

    try {
      const data = await this.analyzeVolatility(upperSymbol);
      
      if (data.hasData) {
        cache.set(upperSymbol, { data, timestamp: Date.now() });
        logger.info(`[Volatility] ${upperSymbol}: IV ${data.impliedVolatility.toFixed(1)}%, RV ${data.realizedVolatility.toFixed(1)}%, Spread ${data.ivRvSpread.toFixed(1)}%`);
      }
      
      return data;
    } catch (error) {
      logger.error(`[Volatility] Error for ${symbol}:`, error);
      return this.getDefaultData(upperSymbol);
    }
  },

  /**
   * Analiza la volatilidad de un símbolo
   */
  async analyzeVolatility(symbol: string): Promise<VolatilityData> {
    try {
      // Obtener datos en paralelo
      const [priceData, vixData] = await Promise.all([
        this.fetchPriceData(symbol),
        this.fetchVIX(),
      ]);

      if (!priceData || priceData.prices.length < 30) {
        return this.getDefaultData(symbol);
      }

      // Calcular volatilidad realizada (20 días)
      const realizedVolatility = this.calculateRealizedVolatility(priceData.prices, 20);
      
      // Calcular volatilidad realizada histórica para percentiles
      const rvHistory = this.calculateRollingRV(priceData.prices, 20);
      const rvPercentile = this.calculatePercentile(rvHistory, realizedVolatility);

      // Estimar IV (usando VIX como proxy para acciones, o calculando de ATR)
      const impliedVolatility = this.estimateIV(priceData, vixData);
      
      // Calcular spread y ratio
      const ivRvSpread = impliedVolatility - realizedVolatility;
      const ivRvRatio = realizedVolatility > 0 ? impliedVolatility / realizedVolatility : 1;

      // Determinar si las opciones están caras o baratas
      let optionsPricing: VolatilityData['optionsPricing'] = 'fair';
      if (ivRvRatio > 1.3) {
        optionsPricing = 'expensive';
      } else if (ivRvRatio < 0.8) {
        optionsPricing = 'cheap';
      }

      // Determinar régimen de volatilidad
      const volatilityRegime = this.determineVolatilityRegime(impliedVolatility, vixData?.vix || 20);

      // Calcular IV percentile (usando VIX history como proxy)
      const ivPercentile = vixData?.vixPercentile || 50;

      // Generar señal
      const { signal, confidence } = this.generateSignal(optionsPricing, volatilityRegime, ivPercentile);

      // Calcular movimiento esperado (basado en IV anualizada)
      const daysToExpiry = 30; // Asumimos opciones a 30 días
      const expectedMove = (impliedVolatility / 100) * Math.sqrt(daysToExpiry / 365) * priceData.currentPrice;
      const expectedMovePercent = (expectedMove / priceData.currentPrice) * 100;

      // Generar resumen
      const { summary, tradingImplication } = this.generateSummary(
        symbol, impliedVolatility, realizedVolatility, ivRvSpread, optionsPricing, 
        volatilityRegime, signal, expectedMovePercent, vixData?.vix || 0
      );

      return {
        impliedVolatility,
        realizedVolatility,
        ivRvSpread,
        ivRvRatio,
        ivPercentile,
        rvPercentile,
        vixLevel: vixData?.vix || 0,
        vixPercentile: vixData?.vixPercentile || 50,
        optionsPricing,
        volatilityRegime,
        signal,
        confidence,
        expectedMove: expectedMovePercent,
        summary,
        tradingImplication,
        hasData: true,
        symbol,
      };
    } catch (error) {
      logger.debug(`[Volatility] Analysis failed for ${symbol}:`, error);
      return this.getDefaultData(symbol);
    }
  },

  /**
   * Fetch price data from Yahoo
   */
  async fetchPriceData(symbol: string): Promise<{
    prices: number[];
    highs: number[];
    lows: number[];
    currentPrice: number;
  } | null> {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo`;
      
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) return null;

      const json = await response.json() as any;
      const result = json.chart?.result?.[0];
      
      if (!result?.indicators?.quote?.[0]) return null;

      const quotes = result.indicators.quote[0];
      const closes = (quotes.close || []).filter((c: any) => c != null);
      const highs = (quotes.high || []).filter((h: any) => h != null);
      const lows = (quotes.low || []).filter((l: any) => l != null);

      return {
        prices: closes,
        highs,
        lows,
        currentPrice: closes[closes.length - 1],
      };
    } catch {
      return null;
    }
  },

  /**
   * Fetch VIX data
   */
  async fetchVIX(): Promise<{ vix: number; vixPercentile: number } | null> {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=1y`;
      
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) return null;

      const json = await response.json() as any;
      const closes = json.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
      
      if (!closes || closes.length < 10) return null;

      const validCloses = closes.filter((c: any) => c != null);
      const currentVix = validCloses[validCloses.length - 1];
      const vixPercentile = this.calculatePercentile(validCloses, currentVix);

      return { vix: currentVix, vixPercentile };
    } catch {
      return null;
    }
  },

  /**
   * Calcula volatilidad realizada (annualizada)
   */
  calculateRealizedVolatility(prices: number[], period: number): number {
    if (prices.length < period + 1) return 0;

    const returns: number[] = [];
    for (let i = prices.length - period; i < prices.length; i++) {
      if (prices[i - 1] > 0) {
        returns.push(Math.log(prices[i] / prices[i - 1]));
      }
    }

    if (returns.length < 5) return 0;

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);
    
    // Anualizar (252 días de trading)
    return stdDev * Math.sqrt(252) * 100;
  },

  /**
   * Calcula RV rolling para obtener histórico
   */
  calculateRollingRV(prices: number[], period: number): number[] {
    const rvHistory: number[] = [];
    
    for (let i = period + 1; i <= prices.length; i++) {
      const slice = prices.slice(i - period - 1, i);
      const rv = this.calculateRealizedVolatility(slice, period);
      if (rv > 0) rvHistory.push(rv);
    }
    
    return rvHistory;
  },

  /**
   * Estima IV (usando VIX y ATR como proxy)
   */
  estimateIV(priceData: { prices: number[]; highs: number[]; lows: number[]; currentPrice: number }, vixData: { vix: number } | null): number {
    // Para una estimación más precisa, calcularíamos de opciones reales
    // Aquí usamos una aproximación basada en VIX + prima específica del activo
    
    // Calcular ATR para estimar volatilidad específica
    const atr = this.calculateATR(priceData.highs, priceData.lows, priceData.prices, 14);
    const atrPercent = (atr / priceData.currentPrice) * 100 * Math.sqrt(252); // Anualizado
    
    // Si tenemos VIX, usarlo como base
    const baseIV = vixData?.vix || 20;
    
    // Ajustar por volatilidad específica del activo
    const rv = this.calculateRealizedVolatility(priceData.prices, 20);
    
    // IV típicamente es mayor que RV (prima por incertidumbre)
    // Usamos un blend de VIX, ATR y RV
    const estimatedIV = (baseIV * 0.3) + (atrPercent * 0.3) + (rv * 1.15 * 0.4);
    
    return Math.max(estimatedIV, rv * 1.1); // IV nunca debería ser menor que RV * 1.1
  },

  /**
   * Calcula ATR
   */
  calculateATR(highs: number[], lows: number[], closes: number[], period: number): number {
    if (highs.length < period + 1) return 0;

    const trueRanges: number[] = [];
    const start = Math.max(1, highs.length - period - 1);

    for (let i = start; i < highs.length; i++) {
      const high = highs[i];
      const low = lows[i];
      const prevClose = closes[i - 1];
      
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trueRanges.push(tr);
    }

    return trueRanges.slice(-period).reduce((a, b) => a + b, 0) / period;
  },

  /**
   * Calcula percentil
   */
  calculatePercentile(data: number[], value: number): number {
    if (data.length === 0) return 50;
    const sorted = [...data].sort((a, b) => a - b);
    const index = sorted.findIndex(v => v >= value);
    if (index === -1) return 100;
    return Math.round((index / sorted.length) * 100);
  },

  /**
   * Determina el régimen de volatilidad
   */
  determineVolatilityRegime(iv: number, vix: number): VolatilityData['volatilityRegime'] {
    const avgVol = (iv + vix) / 2;
    
    if (avgVol < 12) return 'low';
    if (avgVol < 18) return 'normal';
    if (avgVol < 25) return 'elevated';
    if (avgVol < 35) return 'high';
    return 'extreme';
  },

  /**
   * Genera señal de trading
   */
  generateSignal(
    pricing: VolatilityData['optionsPricing'],
    regime: VolatilityData['volatilityRegime'],
    ivPercentile: number
  ): { signal: VolatilityData['signal']; confidence: number } {
    let signal: VolatilityData['signal'] = 'neutral';
    let confidence = 50;

    if (pricing === 'expensive' && ivPercentile > 70) {
      signal = 'sell_premium';
      confidence = 65 + Math.min(20, (ivPercentile - 70));
    } else if (pricing === 'cheap' && ivPercentile < 30) {
      signal = 'buy_options';
      confidence = 65 + Math.min(20, (30 - ivPercentile));
    }

    // Ajustar por régimen extremo
    if (regime === 'extreme') {
      if (signal === 'sell_premium') {
        confidence -= 15; // Más riesgo en volatilidad extrema
      }
    } else if (regime === 'low') {
      if (signal === 'sell_premium') {
        confidence -= 10; // Menos premium para colectar
      }
    }

    return { signal, confidence };
  },

  /**
   * Genera resumen
   */
  generateSummary(
    symbol: string,
    iv: number,
    rv: number,
    spread: number,
    pricing: string,
    regime: string,
    signal: string,
    expectedMove: number,
    vix: number
  ): { summary: string; tradingImplication: string } {
    let summary = `📊 **Volatilidad ${symbol}**\n\n`;
    
    summary += `• IV (Implícita): ${iv.toFixed(1)}%\n`;
    summary += `• RV (Realizada 20d): ${rv.toFixed(1)}%\n`;
    summary += `• Spread IV-RV: ${spread > 0 ? '+' : ''}${spread.toFixed(1)}%\n`;
    summary += `• VIX actual: ${vix.toFixed(1)}\n`;
    summary += `• Régimen: ${regime.toUpperCase()}\n\n`;
    
    summary += `📏 **Movimiento esperado (30d):** ±${expectedMove.toFixed(1)}%\n`;

    let tradingImplication = '';

    if (pricing === 'expensive') {
      summary += `\n💰 Opciones CARAS (IV >> RV)`;
      tradingImplication = '💡 **Vender premium** puede ser favorable. IV inflada = mayor recaudación de prima. ';
      tradingImplication += 'Considerar: credit spreads, iron condors, covered calls.';
    } else if (pricing === 'cheap') {
      summary += `\n💰 Opciones BARATAS (IV << RV)`;
      tradingImplication = '💡 **Comprar opciones** puede ser favorable. IV baja = primas baratas. ';
      tradingImplication += 'Considerar: straddles, strangles antes de catalizadores.';
    } else {
      summary += `\n💰 Opciones precio JUSTO`;
      tradingImplication = '⚪ Sin edge claro en volatilidad. Enfocarse en dirección.';
    }

    if (regime === 'extreme') {
      tradingImplication += ' ⚠️ VOLATILIDAD EXTREMA - Aumentar precaución y reducir tamaño.';
    }

    return { summary, tradingImplication };
  },

  /**
   * Datos por defecto
   */
  getDefaultData(symbol: string): VolatilityData {
    return {
      impliedVolatility: 0,
      realizedVolatility: 0,
      ivRvSpread: 0,
      ivRvRatio: 1,
      ivPercentile: 50,
      rvPercentile: 50,
      vixLevel: 0,
      vixPercentile: 50,
      optionsPricing: 'fair',
      volatilityRegime: 'normal',
      signal: 'neutral',
      confidence: 50,
      expectedMove: 0,
      summary: 'ℹ️ Análisis de volatilidad no disponible.',
      tradingImplication: '',
      hasData: false,
      symbol,
    };
  },
};
