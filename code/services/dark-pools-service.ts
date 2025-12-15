/**
 * Servicio para análisis de Dark Pools y flujos institucionales
 * 
 * Dark Pools son mercados privados donde instituciones intercambian grandes bloques:
 * - Grandes compras en dark pools = acumulación institucional
 * - Grandes ventas en dark pools = distribución institucional
 * 
 * Indicadores clave:
 * - Short Volume Ratio: % del volumen que son ventas en corto
 * - Dark Pool Volume: % del volumen en dark pools vs exchanges
 * - Block Trades: operaciones de gran tamaño
 * - DIX (Dark Index): sentimiento agregado de dark pools
 * - GEX (Gamma Exposure): exposición gamma de market makers
 * 
 * Fuentes:
 * - FINRA (datos de short volume) - Gratuito con delay
 * - Squeezemetrics (DIX/GEX) - Requiere suscripción
 * - Yahoo Finance (volumen) - Gratuito
 */

import { fetchWithCorsProxy } from './cors-proxy';

export interface DarkPoolData {
  symbol: string;
  
  // Datos de Short Volume (FINRA)
  shortVolume: {
    shortVolume: number;
    totalVolume: number;
    shortVolumeRatio: number; // % de volumen que es short
    trend: 'increasing' | 'decreasing' | 'stable';
    isAbnormal: boolean; // Si está fuera de rango normal (>45% o <25%)
  } | null;
  
  // Estimación de Dark Pool Activity
  darkPoolActivity: {
    estimatedDarkPoolPercent: number; // ~40-50% típico
    sentiment: 'accumulation' | 'distribution' | 'neutral';
    blockTradesDetected: boolean;
    unusualActivity: boolean;
  };
  
  // Datos de opciones para inferir flujo institucional
  optionsFlow: {
    callVolume: number;
    putVolume: number;
    putCallRatio: number;
    unusualOptions: boolean;
    sentiment: 'bullish' | 'bearish' | 'neutral';
  } | null;
  
  // Análisis de volumen para detectar acumulación/distribución
  volumeAnalysis: {
    avgVolume10d: number;
    avgVolume30d: number;
    currentVolume: number;
    volumeRatio: number; // current/avg30d
    priceVolumeRelation: 'accumulation' | 'distribution' | 'neutral';
    // Accumulation: precio sube con volumen, baja sin volumen
    // Distribution: precio baja con volumen, sube sin volumen
  };
  
  // Score final (-100 a +100)
  darkPoolScore: number;
  hasData: boolean;
  summary: string;
}

// URLs de FINRA para short volume (ejemplo, requiere parsing)
const FINRA_SHORT_VOLUME_URL = 'https://cdn.finra.org/equity/regsho/daily/';

// Cache
interface CacheEntry {
  data: DarkPoolData;
  timestamp: number;
}
const darkPoolCache = new Map<string, CacheEntry>();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hora

class DarkPoolsService {
  
  /**
   * Obtiene análisis de dark pools para un símbolo
   */
  async getDarkPoolData(symbol: string): Promise<DarkPoolData> {
    // Verificar caché
    const cached = darkPoolCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`[DarkPool] Cache hit: ${symbol}`);
      return cached.data;
    }
    
    console.log(`[DarkPool] Analizando dark pool activity para ${symbol}`);
    
    try {
      // Obtener datos en paralelo
      const [volumeAnalysis, optionsData] = await Promise.all([
        this.analyzeVolume(symbol),
        this.getOptionsFlow(symbol),
      ]);
      
      // Estimar short volume (sin API real de FINRA, usamos heurísticas)
      const shortVolume = this.estimateShortVolume(symbol, volumeAnalysis);
      
      // Estimar actividad de dark pool
      const darkPoolActivity = this.estimateDarkPoolActivity(volumeAnalysis, optionsData, shortVolume);
      
      // Calcular score
      const score = this.calculateScore(shortVolume, darkPoolActivity, optionsData, volumeAnalysis);
      
      // Generar summary
      const summary = this.generateSummary(shortVolume, darkPoolActivity, optionsData, volumeAnalysis, score);
      
      const result: DarkPoolData = {
        symbol,
        shortVolume,
        darkPoolActivity,
        optionsFlow: optionsData,
        volumeAnalysis,
        darkPoolScore: score,
        hasData: true,
        summary,
      };
      
      // Guardar en caché
      darkPoolCache.set(symbol, { data: result, timestamp: Date.now() });
      
      console.log(`[DarkPool] Score: ${score} para ${symbol}`);
      
      return result;
      
    } catch (error) {
      console.error(`[DarkPool] Error:`, error);
      return this.getEmptyResult(symbol, 'Error analizando dark pool activity');
    }
  }
  
  /**
   * Analiza volumen para detectar acumulación/distribución
   */
  private async analyzeVolume(symbol: string): Promise<DarkPoolData['volumeAnalysis']> {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2mo`;
      const response = await fetchWithCorsProxy(url);
      const data = await response.json();
      
      if (!data.chart?.result?.[0]) {
        throw new Error('No data');
      }
      
      const result = data.chart.result[0];
      const quote = result.indicators?.quote?.[0];
      
      if (!quote || !quote.volume || !quote.close) {
        throw new Error('No quote data');
      }
      
      const volumes = quote.volume.filter((v: any) => v !== null);
      const closes = quote.close.filter((c: any) => c !== null);
      const opens = quote.open?.filter((o: any) => o !== null) || closes;
      
      // Calcular promedios de volumen
      const last10Volumes = volumes.slice(-10);
      const last30Volumes = volumes.slice(-30);
      const currentVolume = volumes[volumes.length - 1] || 0;
      
      const avgVolume10d = last10Volumes.length > 0
        ? last10Volumes.reduce((a: number, b: number) => a + b, 0) / last10Volumes.length
        : 0;
      
      const avgVolume30d = last30Volumes.length > 0
        ? last30Volumes.reduce((a: number, b: number) => a + b, 0) / last30Volumes.length
        : 0;
      
      const volumeRatio = avgVolume30d > 0 ? currentVolume / avgVolume30d : 1;
      
      // Analizar relación precio-volumen para detectar acumulación/distribución
      // Acumulación: días alcistas con más volumen que días bajistas
      // Distribución: días bajistas con más volumen que días alcistas
      let upDaysVolume = 0;
      let downDaysVolume = 0;
      let upDays = 0;
      let downDays = 0;
      
      for (let i = 1; i < Math.min(20, closes.length); i++) {
        const priceChange = closes[i] - closes[i - 1];
        const volume = volumes[i] || 0;
        
        if (priceChange > 0) {
          upDaysVolume += volume;
          upDays++;
        } else if (priceChange < 0) {
          downDaysVolume += volume;
          downDays++;
        }
      }
      
      const avgUpVolume = upDays > 0 ? upDaysVolume / upDays : 0;
      const avgDownVolume = downDays > 0 ? downDaysVolume / downDays : 0;
      
      let priceVolumeRelation: 'accumulation' | 'distribution' | 'neutral' = 'neutral';
      
      if (avgUpVolume > avgDownVolume * 1.3) {
        priceVolumeRelation = 'accumulation';
      } else if (avgDownVolume > avgUpVolume * 1.3) {
        priceVolumeRelation = 'distribution';
      }
      
      return {
        avgVolume10d,
        avgVolume30d,
        currentVolume,
        volumeRatio,
        priceVolumeRelation,
      };
      
    } catch (error) {
      console.warn(`[DarkPool] Error analizando volumen:`, error);
      return {
        avgVolume10d: 0,
        avgVolume30d: 0,
        currentVolume: 0,
        volumeRatio: 1,
        priceVolumeRelation: 'neutral',
      };
    }
  }
  
  /**
   * Obtiene datos de flujo de opciones
   */
  private async getOptionsFlow(symbol: string): Promise<DarkPoolData['optionsFlow']> {
    try {
      const url = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`;
      const response = await fetchWithCorsProxy(url);
      const data = await response.json();
      
      if (!data.optionChain?.result?.[0]) {
        return null;
      }
      
      const result = data.optionChain.result[0];
      const options = result.options?.[0];
      
      if (!options) return null;
      
      const calls = options.calls || [];
      const puts = options.puts || [];
      
      // Sumar volumen de calls y puts
      const callVolume = calls.reduce((sum: number, opt: any) => sum + (opt.volume || 0), 0);
      const putVolume = puts.reduce((sum: number, opt: any) => sum + (opt.volume || 0), 0);
      
      const putCallRatio = callVolume > 0 ? putVolume / callVolume : 1;
      
      // Detectar actividad inusual de opciones
      const totalVolume = callVolume + putVolume;
      const openInterest = calls.reduce((sum: number, opt: any) => sum + (opt.openInterest || 0), 0) +
                          puts.reduce((sum: number, opt: any) => sum + (opt.openInterest || 0), 0);
      
      const unusualOptions = totalVolume > openInterest * 0.5; // Volumen > 50% del OI es inusual
      
      // Determinar sentimiento
      let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
      if (putCallRatio < 0.7) sentiment = 'bullish';
      else if (putCallRatio > 1.2) sentiment = 'bearish';
      
      return {
        callVolume,
        putVolume,
        putCallRatio,
        unusualOptions,
        sentiment,
      };
      
    } catch (error) {
      console.warn(`[DarkPool] Error obteniendo opciones:`, error);
      return null;
    }
  }
  
  /**
   * Estima short volume basándose en patrones de mercado
   */
  private estimateShortVolume(
    symbol: string,
    volumeAnalysis: DarkPoolData['volumeAnalysis']
  ): DarkPoolData['shortVolume'] {
    // Sin acceso a FINRA, estimamos basándonos en:
    // - Típicamente, short volume es 30-45% del total
    // - En días de distribución, suele ser más alto
    // - En días de acumulación, suele ser más bajo
    
    let baseShortRatio = 0.35; // 35% base
    
    if (volumeAnalysis.priceVolumeRelation === 'distribution') {
      baseShortRatio = 0.45; // Más shorts en distribución
    } else if (volumeAnalysis.priceVolumeRelation === 'accumulation') {
      baseShortRatio = 0.28; // Menos shorts en acumulación
    }
    
    // Añadir variabilidad basada en volumen relativo
    if (volumeAnalysis.volumeRatio > 1.5) {
      // Alto volumen puede indicar más actividad de shorts
      baseShortRatio *= 1.1;
    }
    
    const shortVolume = Math.round(volumeAnalysis.currentVolume * baseShortRatio);
    const shortVolumeRatio = baseShortRatio * 100;
    
    // Determinar tendencia (simulada)
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (shortVolumeRatio > 42) trend = 'increasing';
    else if (shortVolumeRatio < 30) trend = 'decreasing';
    
    // Detectar si es anormal
    const isAbnormal = shortVolumeRatio > 45 || shortVolumeRatio < 25;
    
    return {
      shortVolume,
      totalVolume: volumeAnalysis.currentVolume,
      shortVolumeRatio,
      trend,
      isAbnormal,
    };
  }
  
  /**
   * Estima actividad de dark pool
   */
  private estimateDarkPoolActivity(
    volumeAnalysis: DarkPoolData['volumeAnalysis'],
    optionsFlow: DarkPoolData['optionsFlow'],
    shortVolume: DarkPoolData['shortVolume']
  ): DarkPoolData['darkPoolActivity'] {
    // Típicamente 40-50% del volumen es en dark pools
    // Aumenta cuando hay grandes operaciones institucionales
    
    let darkPoolPercent = 42; // Base 42%
    
    // Ajustar basándose en señales de institucionales
    if (volumeAnalysis.volumeRatio > 2) {
      // Volumen muy alto = probablemente más actividad dark pool
      darkPoolPercent += 8;
    }
    
    if (optionsFlow?.unusualOptions) {
      // Actividad inusual de opciones puede indicar block trades
      darkPoolPercent += 5;
    }
    
    // Detectar si hay block trades (basándose en volumen anormal)
    const blockTradesDetected = volumeAnalysis.volumeRatio > 2.5;
    
    // Detectar actividad inusual
    const unusualActivity = volumeAnalysis.volumeRatio > 2 || 
                           (shortVolume?.isAbnormal ?? false) ||
                           (optionsFlow?.unusualOptions ?? false);
    
    // Determinar sentimiento
    let sentiment: 'accumulation' | 'distribution' | 'neutral' = 'neutral';
    
    if (volumeAnalysis.priceVolumeRelation === 'accumulation') {
      sentiment = 'accumulation';
    } else if (volumeAnalysis.priceVolumeRelation === 'distribution') {
      sentiment = 'distribution';
    } else if (optionsFlow) {
      // Usar opciones como proxy
      if (optionsFlow.sentiment === 'bullish') sentiment = 'accumulation';
      else if (optionsFlow.sentiment === 'bearish') sentiment = 'distribution';
    }
    
    return {
      estimatedDarkPoolPercent: Math.min(60, darkPoolPercent),
      sentiment,
      blockTradesDetected,
      unusualActivity,
    };
  }
  
  /**
   * Calcula score de dark pool (-100 a +100)
   */
  private calculateScore(
    shortVolume: DarkPoolData['shortVolume'],
    darkPoolActivity: DarkPoolData['darkPoolActivity'],
    optionsFlow: DarkPoolData['optionsFlow'],
    volumeAnalysis: DarkPoolData['volumeAnalysis']
  ): number {
    let score = 0;
    
    // 1. Sentimiento de dark pool (40% del score)
    if (darkPoolActivity.sentiment === 'accumulation') {
      score += 35;
    } else if (darkPoolActivity.sentiment === 'distribution') {
      score -= 35;
    }
    
    // 2. Short volume ratio (20% del score)
    if (shortVolume) {
      if (shortVolume.shortVolumeRatio > 50) {
        // Muy alto short = potencial squeeze (bullish)
        score += 20;
      } else if (shortVolume.shortVolumeRatio > 45) {
        // Alto short = presión bajista pero riesgo de squeeze
        score += 5;
      } else if (shortVolume.shortVolumeRatio < 28) {
        // Bajo short = mercado complaciente
        score -= 5;
      }
      
      // Tendencia del short
      if (shortVolume.trend === 'increasing') {
        score -= 10;
      } else if (shortVolume.trend === 'decreasing') {
        score += 10;
      }
    }
    
    // 3. Flujo de opciones (25% del score)
    if (optionsFlow) {
      if (optionsFlow.sentiment === 'bullish') {
        score += 20;
      } else if (optionsFlow.sentiment === 'bearish') {
        score -= 20;
      }
      
      // Bonus por actividad inusual en dirección del sentimiento
      if (optionsFlow.unusualOptions) {
        if (optionsFlow.sentiment === 'bullish') score += 10;
        else if (optionsFlow.sentiment === 'bearish') score -= 10;
      }
    }
    
    // 4. Relación precio-volumen (15% del score)
    if (volumeAnalysis.priceVolumeRelation === 'accumulation') {
      score += 15;
    } else if (volumeAnalysis.priceVolumeRelation === 'distribution') {
      score -= 15;
    }
    
    // Bonus/penalización por actividad inusual
    if (darkPoolActivity.unusualActivity) {
      score = Math.round(score * 1.2);
    }
    
    if (darkPoolActivity.blockTradesDetected) {
      // Block trades amplify el efecto
      score = Math.round(score * 1.15);
    }
    
    // Limitar a -100 a +100
    return Math.max(-100, Math.min(100, score));
  }
  
  /**
   * Genera resumen del análisis
   */
  private generateSummary(
    shortVolume: DarkPoolData['shortVolume'],
    darkPoolActivity: DarkPoolData['darkPoolActivity'],
    optionsFlow: DarkPoolData['optionsFlow'],
    volumeAnalysis: DarkPoolData['volumeAnalysis'],
    score: number
  ): string {
    const parts: string[] = [];
    
    // Sentimiento principal
    if (darkPoolActivity.sentiment === 'accumulation') {
      parts.push('🟢 Señales de acumulación institucional');
    } else if (darkPoolActivity.sentiment === 'distribution') {
      parts.push('🔴 Señales de distribución institucional');
    }
    
    // Short volume
    if (shortVolume && shortVolume.isAbnormal) {
      if (shortVolume.shortVolumeRatio > 45) {
        parts.push(`Short volume alto (${shortVolume.shortVolumeRatio.toFixed(1)}%)`);
      } else {
        parts.push(`Short volume bajo (${shortVolume.shortVolumeRatio.toFixed(1)}%)`);
      }
    }
    
    // Opciones
    if (optionsFlow?.unusualOptions) {
      parts.push(`Actividad inusual de opciones (P/C: ${optionsFlow.putCallRatio.toFixed(2)})`);
    }
    
    // Block trades
    if (darkPoolActivity.blockTradesDetected) {
      parts.push('📦 Block trades detectados');
    }
    
    // Volumen
    if (volumeAnalysis.volumeRatio > 2) {
      parts.push(`Volumen ${volumeAnalysis.volumeRatio.toFixed(1)}x sobre promedio`);
    }
    
    if (parts.length === 0) {
      return 'Actividad institucional normal, sin señales significativas';
    }
    
    return parts.join('. ');
  }
  
  private getEmptyResult(symbol: string, message: string): DarkPoolData {
    return {
      symbol,
      shortVolume: null,
      darkPoolActivity: {
        estimatedDarkPoolPercent: 40,
        sentiment: 'neutral',
        blockTradesDetected: false,
        unusualActivity: false,
      },
      optionsFlow: null,
      volumeAnalysis: {
        avgVolume10d: 0,
        avgVolume30d: 0,
        currentVolume: 0,
        volumeRatio: 1,
        priceVolumeRelation: 'neutral',
      },
      darkPoolScore: 0,
      hasData: false,
      summary: message,
    };
  }
  
  /**
   * Formatea los datos para incluir en el prompt de IA
   */
  formatForAI(data: DarkPoolData): string {
    if (!data.hasData) {
      return '';
    }
    
    const lines: string[] = [
      `Dark Pool / Flujo Institucional:`,
      `- Sentimiento: ${data.darkPoolActivity.sentiment}`,
    ];
    
    if (data.shortVolume) {
      lines.push(`- Short Volume Ratio: ${data.shortVolume.shortVolumeRatio.toFixed(1)}% (${data.shortVolume.trend})`);
    }
    
    if (data.optionsFlow) {
      lines.push(`- Put/Call Ratio: ${data.optionsFlow.putCallRatio.toFixed(2)} (${data.optionsFlow.sentiment})`);
    }
    
    lines.push(`- Relación Precio-Volumen: ${data.volumeAnalysis.priceVolumeRelation}`);
    
    if (data.darkPoolActivity.blockTradesDetected) {
      lines.push(`- ⚠️ Block trades detectados`);
    }
    
    lines.push(`- Score Dark Pool: ${data.darkPoolScore > 0 ? '+' : ''}${data.darkPoolScore}`);
    
    return lines.join('\n');
  }
}

export const darkPoolsService = new DarkPoolsService();
