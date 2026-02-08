/**
 * Options Flow Service
 * Analiza el flujo de opciones para detectar movimientos institucionales
 * 
 * El options flow revela:
 * - Apuestas grandes de institucionales (unusual activity)
 * - Sentimiento del mercado (put/call ratio)
 * - Posibles movimientos antes de noticias
 * 
 * Usado por: Steve Cohen, James Simons
 * 
 * NOTA: Usa datos públicos de Yahoo Finance (limitados pero gratuitos)
 */

import { logger } from '../../middleware/logger.js';

export interface OptionsFlowData {
  // Put/Call Ratio
  putCallRatio: number;           // <0.7 = bullish, >1.0 = bearish
  putCallSignal: 'very_bullish' | 'bullish' | 'neutral' | 'bearish' | 'very_bearish';
  
  // Implied Volatility
  impliedVolatility: number;      // IV actual
  ivPercentile: number;           // IV rank (0-100, dónde está respecto al histórico)
  ivSignal: 'low' | 'normal' | 'elevated' | 'extreme';
  
  // Open Interest
  callOpenInterest: number;
  putOpenInterest: number;
  oiTrend: 'increasing' | 'stable' | 'decreasing';
  
  // Max Pain (precio donde más opciones expiran sin valor)
  maxPain: number | null;
  maxPainDistance: number | null;  // % distancia del precio actual al max pain
  
  // Unusual Activity (simplificado)
  unusualActivity: boolean;
  unusualSignal: string | null;
  
  // Resumen
  overallSignal: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  summary: string;
  institutionalHint: string;
  
  // Datos crudos
  hasData: boolean;
  dataQuality: 'high' | 'medium' | 'low';
}

// Cache
const cache = new Map<string, { data: OptionsFlowData; timestamp: number }>();
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutos

export const optionsFlowService = {
  /**
   * Obtiene análisis de options flow para un símbolo
   */
  async getOptionsFlow(symbol: string, currentPrice: number): Promise<OptionsFlowData> {
    // Check cache
    const cached = cache.get(symbol);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }

    try {
      // Obtener datos de opciones de Yahoo Finance
      const optionsData = await this.fetchOptionsData(symbol);
      
      if (!optionsData) {
        return this.getDefaultData();
      }

      // Analizar los datos
      const analysis = this.analyzeOptionsData(optionsData, currentPrice);
      
      // Cache
      cache.set(symbol, { data: analysis, timestamp: Date.now() });
      
      logger.info(`[OptionsFlow] ${symbol}: P/C ratio ${analysis.putCallRatio.toFixed(2)}, IV ${analysis.impliedVolatility.toFixed(1)}%, signal: ${analysis.overallSignal}`);
      
      return analysis;
    } catch (error) {
      logger.error(`[OptionsFlow] Error fetching options for ${symbol}:`, error);
      return this.getDefaultData();
    }
  },

  /**
   * Fetch options data from Yahoo Finance
   */
  async fetchOptionsData(symbol: string): Promise<any | null> {
    try {
      // Obtener cadena de opciones
      const url = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`;
      
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        logger.debug(`[OptionsFlow] No options data for ${symbol}`);
        return null;
      }

      const json = await response.json() as any;
      return json.optionChain?.result?.[0] || null;
    } catch (error) {
      logger.debug(`[OptionsFlow] Failed to fetch options for ${symbol}`);
      return null;
    }
  },

  /**
   * Analiza los datos de opciones
   */
  analyzeOptionsData(data: any, currentPrice: number): OptionsFlowData {
    const quote = data.quote || {};
    const options = data.options?.[0] || {};
    const calls = options.calls || [];
    const puts = options.puts || [];

    // Put/Call Ratio basado en Open Interest
    let callOI = 0;
    let putOI = 0;
    let totalCallVolume = 0;
    let totalPutVolume = 0;
    let weightedCallIV = 0;
    let weightedPutIV = 0;
    let ivCount = 0;

    calls.forEach((call: any) => {
      callOI += call.openInterest || 0;
      totalCallVolume += call.volume || 0;
      if (call.impliedVolatility) {
        weightedCallIV += call.impliedVolatility * (call.openInterest || 1);
        ivCount += call.openInterest || 1;
      }
    });

    puts.forEach((put: any) => {
      putOI += put.openInterest || 0;
      totalPutVolume += put.volume || 0;
      if (put.impliedVolatility) {
        weightedPutIV += put.impliedVolatility * (put.openInterest || 1);
        ivCount += put.openInterest || 1;
      }
    });

    // Put/Call Ratio (por OI)
    const putCallRatio = callOI > 0 ? putOI / callOI : 1;
    const putCallSignal = this.interpretPutCallRatio(putCallRatio);

    // Implied Volatility (promedio ponderado)
    const avgIV = ivCount > 0 ? ((weightedCallIV + weightedPutIV) / ivCount) * 100 : 25;
    const ivSignal = this.interpretIV(avgIV);
    const ivPercentile = this.estimateIVPercentile(avgIV, quote.symbol);

    // Max Pain calculation (simplificado)
    const maxPain = this.calculateMaxPain(calls, puts, currentPrice);
    const maxPainDistance = maxPain ? ((currentPrice - maxPain) / maxPain) * 100 : null;

    // Detectar actividad inusual
    const { unusual, signal: unusualSignal } = this.detectUnusualActivity(
      calls, puts, totalCallVolume, totalPutVolume, callOI, putOI
    );

    // Determinar señal general
    const { overallSignal, confidence } = this.determineOverallSignal(
      putCallRatio, avgIV, unusual, maxPainDistance, putCallSignal
    );

    // Generar resumen
    const summary = this.generateSummary(putCallSignal, ivSignal, unusual, maxPain, currentPrice);
    const institutionalHint = this.generateInstitutionalHint(putCallRatio, unusual, unusualSignal);

    // OI Trend (simplificado - necesitaríamos histórico para esto)
    const oiTrend: 'increasing' | 'stable' | 'decreasing' = 'stable';

    return {
      putCallRatio,
      putCallSignal,
      impliedVolatility: avgIV,
      ivPercentile,
      ivSignal,
      callOpenInterest: callOI,
      putOpenInterest: putOI,
      oiTrend,
      maxPain,
      maxPainDistance,
      unusualActivity: unusual,
      unusualSignal,
      overallSignal,
      confidence,
      summary,
      institutionalHint,
      hasData: true,
      dataQuality: calls.length > 10 && puts.length > 10 ? 'high' : 'medium',
    };
  },

  /**
   * Interpreta el Put/Call ratio
   */
  interpretPutCallRatio(ratio: number): OptionsFlowData['putCallSignal'] {
    if (ratio < 0.5) return 'very_bullish';
    if (ratio < 0.7) return 'bullish';
    if (ratio <= 1.0) return 'neutral';
    if (ratio <= 1.3) return 'bearish';
    return 'very_bearish';
  },

  /**
   * Interpreta la Implied Volatility
   */
  interpretIV(iv: number): OptionsFlowData['ivSignal'] {
    if (iv < 20) return 'low';
    if (iv < 35) return 'normal';
    if (iv < 50) return 'elevated';
    return 'extreme';
  },

  /**
   * Estima el percentil de IV (simplificado)
   */
  estimateIVPercentile(iv: number, symbol?: string): number {
    // Estimación basada en rangos típicos
    // En producción, usarías histórico real de IV
    if (iv < 15) return 10;
    if (iv < 20) return 25;
    if (iv < 25) return 40;
    if (iv < 30) return 50;
    if (iv < 40) return 65;
    if (iv < 50) return 80;
    return 95;
  },

  /**
   * Calcula el Max Pain (precio donde más opciones expiran sin valor)
   */
  calculateMaxPain(calls: any[], puts: any[], currentPrice: number): number | null {
    if (calls.length === 0 && puts.length === 0) return null;

    // Obtener todos los strikes únicos
    const strikes = new Set<number>();
    calls.forEach((c: any) => strikes.add(c.strike));
    puts.forEach((p: any) => strikes.add(p.strike));

    if (strikes.size === 0) return null;

    // Para cada strike, calcular el "pain" total
    let minPain = Infinity;
    let maxPainStrike = currentPrice;

    strikes.forEach(strike => {
      let totalPain = 0;

      // Pain para calls (si precio > strike, calls ITM, vendedores pagan)
      calls.forEach((call: any) => {
        if (strike > call.strike) {
          totalPain += (strike - call.strike) * (call.openInterest || 0);
        }
      });

      // Pain para puts (si precio < strike, puts ITM, vendedores pagan)
      puts.forEach((put: any) => {
        if (strike < put.strike) {
          totalPain += (put.strike - strike) * (put.openInterest || 0);
        }
      });

      if (totalPain < minPain) {
        minPain = totalPain;
        maxPainStrike = strike;
      }
    });

    return maxPainStrike;
  },

  /**
   * Detecta actividad inusual
   */
  detectUnusualActivity(
    calls: any[],
    puts: any[],
    callVolume: number,
    putVolume: number,
    callOI: number,
    putOI: number
  ): { unusual: boolean; signal: string | null } {
    // Volumen muy alto respecto a OI indica actividad inusual
    const callVolumeRatio = callOI > 0 ? callVolume / callOI : 0;
    const putVolumeRatio = putOI > 0 ? putVolume / putOI : 0;

    // Buscar contratos individuales con volumen inusual
    let unusualCall = calls.find((c: any) => 
      c.volume > 1000 && c.openInterest > 0 && c.volume / c.openInterest > 2
    );
    let unusualPut = puts.find((p: any) => 
      p.volume > 1000 && p.openInterest > 0 && p.volume / p.openInterest > 2
    );

    if (unusualCall) {
      return {
        unusual: true,
        signal: `🟢 Actividad inusual en CALLS strike $${unusualCall.strike} (${unusualCall.volume.toLocaleString()} vol)`,
      };
    }

    if (unusualPut) {
      return {
        unusual: true,
        signal: `🔴 Actividad inusual en PUTS strike $${unusualPut.strike} (${unusualPut.volume.toLocaleString()} vol)`,
      };
    }

    if (callVolumeRatio > 0.5 || putVolumeRatio > 0.5) {
      const type = callVolumeRatio > putVolumeRatio ? 'calls' : 'puts';
      return {
        unusual: true,
        signal: `⚡ Volumen elevado en ${type} respecto a OI`,
      };
    }

    return { unusual: false, signal: null };
  },

  /**
   * Determina la señal general
   */
  determineOverallSignal(
    pcRatio: number,
    iv: number,
    unusual: boolean,
    maxPainDist: number | null,
    pcSignal: OptionsFlowData['putCallSignal']
  ): { overallSignal: 'bullish' | 'bearish' | 'neutral'; confidence: number } {
    let bullishPoints = 0;
    let bearishPoints = 0;

    // Put/Call ratio
    if (pcRatio < 0.7) bullishPoints += 2;
    else if (pcRatio < 0.9) bullishPoints += 1;
    else if (pcRatio > 1.2) bearishPoints += 2;
    else if (pcRatio > 1.0) bearishPoints += 1;

    // IV (IV alto puede indicar movimiento esperado)
    if (iv > 40) {
      // Alta IV = incertidumbre, reducir confianza
    }

    // Max Pain (precio tiende a gravitar hacia max pain)
    if (maxPainDist !== null) {
      if (maxPainDist > 3) bearishPoints += 1; // Precio muy arriba del max pain
      else if (maxPainDist < -3) bullishPoints += 1; // Precio muy abajo
    }

    const total = bullishPoints + bearishPoints;
    let confidence = 50;
    let signal: 'bullish' | 'bearish' | 'neutral' = 'neutral';

    if (bullishPoints > bearishPoints + 1) {
      signal = 'bullish';
      confidence = Math.min(80, 50 + bullishPoints * 10);
    } else if (bearishPoints > bullishPoints + 1) {
      signal = 'bearish';
      confidence = Math.min(80, 50 + bearishPoints * 10);
    }

    if (unusual) confidence = Math.min(90, confidence + 10);

    return { overallSignal: signal, confidence };
  },

  /**
   * Genera resumen
   */
  generateSummary(
    pcSignal: OptionsFlowData['putCallSignal'],
    ivSignal: OptionsFlowData['ivSignal'],
    unusual: boolean,
    maxPain: number | null,
    currentPrice: number
  ): string {
    const parts: string[] = [];

    // P/C
    const pcText = {
      very_bullish: 'P/C muy bajo (alcista)',
      bullish: 'P/C bajo (ligeramente alcista)',
      neutral: 'P/C neutral',
      bearish: 'P/C alto (ligeramente bajista)',
      very_bearish: 'P/C muy alto (bajista)',
    };
    parts.push(pcText[pcSignal]);

    // IV
    if (ivSignal === 'extreme') {
      parts.push('IV extrema (movimiento grande esperado)');
    } else if (ivSignal === 'elevated') {
      parts.push('IV elevada');
    }

    // Unusual
    if (unusual) {
      parts.push('actividad inusual detectada');
    }

    // Max Pain
    if (maxPain !== null) {
      const dist = ((currentPrice - maxPain) / maxPain) * 100;
      if (Math.abs(dist) > 2) {
        parts.push(`Max Pain en $${maxPain.toFixed(2)} (${dist > 0 ? '+' : ''}${dist.toFixed(1)}%)`);
      }
    }

    return parts.join('. ') + '.';
  },

  /**
   * Genera hint sobre institucionales
   */
  generateInstitutionalHint(
    pcRatio: number,
    unusual: boolean,
    unusualSignal: string | null
  ): string {
    if (unusual && unusualSignal) {
      return unusualSignal + ' - Posible posicionamiento institucional.';
    }

    if (pcRatio < 0.6) {
      return '🐂 Los market makers están posicionados para subidas.';
    } else if (pcRatio > 1.3) {
      return '🐻 Alto interés en protección bajista (puts).';
    }

    return 'Sin señales claras de posicionamiento institucional.';
  },

  /**
   * Datos por defecto cuando no hay opciones
   */
  getDefaultData(): OptionsFlowData {
    return {
      putCallRatio: 1,
      putCallSignal: 'neutral',
      impliedVolatility: 25,
      ivPercentile: 50,
      ivSignal: 'normal',
      callOpenInterest: 0,
      putOpenInterest: 0,
      oiTrend: 'stable',
      maxPain: null,
      maxPainDistance: null,
      unusualActivity: false,
      unusualSignal: null,
      overallSignal: 'neutral',
      confidence: 30,
      summary: 'Sin datos de opciones disponibles para este activo.',
      institutionalHint: 'No hay información de flujo de opciones.',
      hasData: false,
      dataQuality: 'low',
    };
  },
};
