/**
 * Volume Profile Service
 * Analiza el volumen por niveles de precio
 * 
 * Identifica:
 * - POC (Point of Control) - Precio con más volumen
 * - Value Area High/Low - Donde se concentra 70% del volumen
 * - High Volume Nodes - Niveles de soporte/resistencia por volumen
 * - Low Volume Nodes - Zonas de rápido movimiento
 * 
 * Usado por: Paul Tudor Jones
 */

import { logger } from '../../middleware/logger.js';

export interface VolumeProfileData {
  // Point of Control
  poc: number;                    // Precio con mayor volumen
  pocVolume: number;              // Volumen en POC
  
  // Value Area (70% del volumen)
  valueAreaHigh: number;          // Límite superior del value area
  valueAreaLow: number;           // Límite inferior del value area
  valueAreaVolume: number;        // Volumen total en value area
  
  // Niveles clave
  highVolumeNodes: Array<{        // Zonas de alto volumen (soporte/resistencia)
    price: number;
    volume: number;
    type: 'support' | 'resistance';
  }>;
  
  lowVolumeNodes: Array<{         // Zonas de bajo volumen (gaps)
    priceStart: number;
    priceEnd: number;
  }>;
  
  // Posición actual
  currentPrice: number;
  priceLocation: 'above_va' | 'in_va' | 'below_va' | 'at_poc';
  
  // Análisis
  signal: 'bullish' | 'bearish' | 'neutral';
  bias: string;
  summary: string;
  tradingImplication: string;
  
  // Meta
  hasData: boolean;
  period: string;
  totalVolume: number;
}

interface PriceLevel {
  price: number;
  volume: number;
}

// Cache
const cache = new Map<string, { data: VolumeProfileData; timestamp: number }>();
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutos

export const volumeProfileService = {
  /**
   * Obtiene el Volume Profile para un símbolo
   */
  async getVolumeProfile(symbol: string, period: string = '20d'): Promise<VolumeProfileData> {
    const cacheKey = `${symbol}-${period}`;
    
    // Check cache
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }

    try {
      const data = await this.calculateVolumeProfile(symbol, period);
      
      if (data.hasData) {
        cache.set(cacheKey, { data, timestamp: Date.now() });
        logger.info(`[VolumeProfile] ${symbol}: POC at ${data.poc.toFixed(2)}, Location: ${data.priceLocation}`);
      }
      
      return data;
    } catch (error) {
      logger.error(`[VolumeProfile] Error for ${symbol}:`, error);
      return this.getDefaultData();
    }
  },

  /**
   * Calcula el Volume Profile desde datos de Yahoo
   */
  async calculateVolumeProfile(symbol: string, period: string): Promise<VolumeProfileData> {
    try {
      // Obtener datos históricos
      const range = period.includes('d') ? period : '20d';
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1h&range=${range}`;
      
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch data');
      }

      const json = await response.json() as any;
      const result = json.chart?.result?.[0];
      
      if (!result?.indicators?.quote?.[0]) {
        return this.getDefaultData();
      }

      const quotes = result.indicators.quote[0];
      const highs = quotes.high || [];
      const lows = quotes.low || [];
      const closes = quotes.close || [];
      const volumes = quotes.volume || [];

      if (closes.length < 10) {
        return this.getDefaultData();
      }

      // Calcular rango de precios
      const validHighs = highs.filter((h: number) => h != null);
      const validLows = lows.filter((l: number) => l != null);
      const maxPrice = Math.max(...validHighs);
      const minPrice = Math.min(...validLows);
      const priceRange = maxPrice - minPrice;

      // Dividir en niveles (bins)
      const numBins = 50;
      const binSize = priceRange / numBins;
      const bins: PriceLevel[] = [];

      for (let i = 0; i < numBins; i++) {
        bins.push({
          price: minPrice + (i + 0.5) * binSize,
          volume: 0,
        });
      }

      // Asignar volumen a cada bin
      let totalVolume = 0;
      for (let i = 0; i < closes.length; i++) {
        const high = highs[i];
        const low = lows[i];
        const volume = volumes[i];

        if (high == null || low == null || volume == null) continue;

        totalVolume += volume;
        const avgPrice = (high + low) / 2;

        // Distribuir volumen en los bins que toca la vela
        for (let j = 0; j < numBins; j++) {
          const binLow = minPrice + j * binSize;
          const binHigh = binLow + binSize;

          if (low <= binHigh && high >= binLow) {
            // La vela toca este bin
            const overlap = Math.min(high, binHigh) - Math.max(low, binLow);
            const velaRange = high - low || 1;
            const proportion = overlap / velaRange;
            bins[j].volume += volume * proportion;
          }
        }
      }

      // Encontrar POC (Point of Control)
      let poc = bins[0];
      for (const bin of bins) {
        if (bin.volume > poc.volume) {
          poc = bin;
        }
      }

      // Calcular Value Area (70% del volumen)
      const targetVolume = totalVolume * 0.70;
      let vaVolume = poc.volume;
      let vaHighIndex = bins.indexOf(poc);
      let vaLowIndex = vaHighIndex;

      while (vaVolume < targetVolume && (vaHighIndex < bins.length - 1 || vaLowIndex > 0)) {
        const aboveVolume = vaHighIndex < bins.length - 1 ? bins[vaHighIndex + 1].volume : 0;
        const belowVolume = vaLowIndex > 0 ? bins[vaLowIndex - 1].volume : 0;

        if (aboveVolume >= belowVolume && vaHighIndex < bins.length - 1) {
          vaHighIndex++;
          vaVolume += aboveVolume;
        } else if (vaLowIndex > 0) {
          vaLowIndex--;
          vaVolume += belowVolume;
        } else {
          break;
        }
      }

      const valueAreaHigh = bins[vaHighIndex].price + binSize / 2;
      const valueAreaLow = bins[vaLowIndex].price - binSize / 2;

      // Encontrar High Volume Nodes (picos de volumen)
      const avgVolume = totalVolume / numBins;
      const highVolumeNodes: VolumeProfileData['highVolumeNodes'] = [];
      const currentPrice = closes[closes.length - 1];

      for (const bin of bins) {
        if (bin.volume > avgVolume * 1.5) {
          highVolumeNodes.push({
            price: bin.price,
            volume: bin.volume,
            type: bin.price < currentPrice ? 'support' : 'resistance',
          });
        }
      }

      // Ordenar por volumen descendente y tomar top 5
      highVolumeNodes.sort((a, b) => b.volume - a.volume);
      const topHVN = highVolumeNodes.slice(0, 5);

      // Encontrar Low Volume Nodes (gaps)
      const lowVolumeNodes: VolumeProfileData['lowVolumeNodes'] = [];
      for (let i = 1; i < bins.length - 1; i++) {
        if (bins[i].volume < avgVolume * 0.3) {
          // Buscar el rango completo del LVN
          let start = i;
          let end = i;
          while (end < bins.length - 1 && bins[end + 1].volume < avgVolume * 0.3) {
            end++;
          }
          if (end > start) {
            lowVolumeNodes.push({
              priceStart: bins[start].price - binSize / 2,
              priceEnd: bins[end].price + binSize / 2,
            });
            i = end; // Skip processed bins
          }
        }
      }

      // Determinar posición del precio actual
      let priceLocation: VolumeProfileData['priceLocation'];
      if (Math.abs(currentPrice - poc.price) < binSize) {
        priceLocation = 'at_poc';
      } else if (currentPrice > valueAreaHigh) {
        priceLocation = 'above_va';
      } else if (currentPrice < valueAreaLow) {
        priceLocation = 'below_va';
      } else {
        priceLocation = 'in_va';
      }

      // Generar señal y análisis
      const { signal, bias, summary, tradingImplication } = this.analyzeProfile(
        currentPrice,
        poc.price,
        valueAreaHigh,
        valueAreaLow,
        priceLocation,
        topHVN,
        lowVolumeNodes
      );

      return {
        poc: poc.price,
        pocVolume: poc.volume,
        valueAreaHigh,
        valueAreaLow,
        valueAreaVolume: vaVolume,
        highVolumeNodes: topHVN,
        lowVolumeNodes: lowVolumeNodes.slice(0, 3),
        currentPrice,
        priceLocation,
        signal,
        bias,
        summary,
        tradingImplication,
        hasData: true,
        period,
        totalVolume,
      };
    } catch (error) {
      logger.debug(`[VolumeProfile] Calculation failed:`, error);
      return this.getDefaultData();
    }
  },

  /**
   * Analiza el perfil y genera señales
   */
  analyzeProfile(
    currentPrice: number,
    poc: number,
    vaHigh: number,
    vaLow: number,
    priceLocation: VolumeProfileData['priceLocation'],
    hvn: VolumeProfileData['highVolumeNodes'],
    lvn: VolumeProfileData['lowVolumeNodes']
  ): { signal: 'bullish' | 'bearish' | 'neutral'; bias: string; summary: string; tradingImplication: string } {
    let signal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    let bias = '';
    let summary = '';
    let tradingImplication = '';

    const pocDistance = ((currentPrice - poc) / poc) * 100;
    
    if (priceLocation === 'above_va') {
      signal = 'bullish';
      bias = 'Breakout alcista';
      summary = `📈 Precio ENCIMA del Value Area (>${vaHigh.toFixed(2)}). `;
      summary += `POC en ${poc.toFixed(2)} actúa como soporte fuerte. `;
      tradingImplication = '🟢 Momentum alcista. El precio ha roto resistencia por volumen. POC es soporte clave.';
    } else if (priceLocation === 'below_va') {
      signal = 'bearish';
      bias = 'Breakout bajista';
      summary = `📉 Precio DEBAJO del Value Area (<${vaLow.toFixed(2)}). `;
      summary += `POC en ${poc.toFixed(2)} actúa como resistencia. `;
      tradingImplication = '🔴 Presión vendedora. El precio ha roto soporte por volumen. POC es resistencia clave.';
    } else if (priceLocation === 'at_poc') {
      signal = 'neutral';
      bias = 'En equilibrio';
      summary = `⚖️ Precio EN el POC (${poc.toFixed(2)}). Zona de máxima negociación. `;
      tradingImplication = '⚪ Zona de equilibrio. Espera breakout del Value Area para dirección clara.';
    } else {
      // in_va
      if (pocDistance > 0) {
        signal = 'bullish';
        bias = 'Dentro de VA, sesgo alcista';
        summary = `📊 Precio dentro del Value Area, encima del POC. `;
        tradingImplication = '🟡 Rango definido. Sesgo alcista mientras se mantenga sobre POC.';
      } else {
        signal = 'bearish';
        bias = 'Dentro de VA, sesgo bajista';
        summary = `📊 Precio dentro del Value Area, debajo del POC. `;
        tradingImplication = '🟡 Rango definido. Sesgo bajista mientras se mantenga bajo POC.';
      }
    }

    // Añadir info de HVN cercanos
    const nearbyHVN = hvn.filter(h => Math.abs(h.price - currentPrice) / currentPrice < 0.03);
    if (nearbyHVN.length > 0) {
      const nearestHVN = nearbyHVN[0];
      summary += `HVN cercano en ${nearestHVN.price.toFixed(2)} (${nearestHVN.type}). `;
    }

    // Advertencia de LVN (zonas de movimiento rápido)
    for (const node of lvn) {
      if (currentPrice >= node.priceStart && currentPrice <= node.priceEnd) {
        summary += `⚠️ En zona de bajo volumen - movimientos rápidos posibles. `;
        tradingImplication += ' ⚡ PRECAUCIÓN: Zona de baja liquidez, spreads amplios probables.';
        break;
      }
    }

    return { signal, bias, summary, tradingImplication };
  },

  /**
   * Datos por defecto
   */
  getDefaultData(): VolumeProfileData {
    return {
      poc: 0,
      pocVolume: 0,
      valueAreaHigh: 0,
      valueAreaLow: 0,
      valueAreaVolume: 0,
      highVolumeNodes: [],
      lowVolumeNodes: [],
      currentPrice: 0,
      priceLocation: 'in_va',
      signal: 'neutral',
      bias: '',
      summary: 'ℹ️ Volume Profile no disponible. Datos insuficientes.',
      tradingImplication: '',
      hasData: false,
      period: '',
      totalVolume: 0,
    };
  },
};
