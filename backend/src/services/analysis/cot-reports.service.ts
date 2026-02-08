/**
 * COT Reports Service (Commitment of Traders)
 * Datos de la CFTC sobre posiciones de grandes traders
 * 
 * Muestra:
 * - Posiciones de Commercials (hedgers)
 * - Posiciones de Large Speculators (fondos)
 * - Posiciones de Small Speculators (retail)
 * 
 * Señales:
 * - Commercials muy largos = Señal alcista (saben lo que hacen)
 * - Large Specs muy largos = Posible techo (contrarian)
 * - Extremos históricos = Puntos de inflexión
 * 
 * Usado por: George Soros
 */

import { logger } from '../../middleware/logger.js';

export interface COTData {
  // Datos principales
  symbol: string;
  reportDate: string;
  
  // Posiciones Commercials (Hedgers - los que saben)
  commercialLong: number;
  commercialShort: number;
  commercialNet: number;
  commercialNetChange: number;
  
  // Posiciones Large Speculators (Fondos)
  largeSpecLong: number;
  largeSpecShort: number;
  largeSpecNet: number;
  largeSpecNetChange: number;
  
  // Posiciones Small Speculators (Retail)
  smallSpecLong: number;
  smallSpecShort: number;
  smallSpecNet: number;
  
  // Open Interest
  openInterest: number;
  openInterestChange: number;
  
  // Análisis
  commercialSentiment: 'very_bullish' | 'bullish' | 'neutral' | 'bearish' | 'very_bearish';
  speculatorSentiment: 'very_bullish' | 'bullish' | 'neutral' | 'bearish' | 'very_bearish';
  contrarian: boolean;
  
  // Señales
  signal: 'bullish' | 'bearish' | 'neutral';
  strength: 'strong' | 'moderate' | 'weak';
  summary: string;
  tradingImplication: string;
  
  // Meta
  hasData: boolean;
  dataSource: string;
}

// Mapeo de símbolos a códigos CFTC
const CFTC_CODES: Record<string, { code: string; name: string }> = {
  // Índices
  'ES': { code: '13874A', name: 'E-Mini S&P 500' },
  'SPY': { code: '13874A', name: 'E-Mini S&P 500' },
  'SPX': { code: '13874A', name: 'E-Mini S&P 500' },
  'NQ': { code: '209742', name: 'E-Mini Nasdaq 100' },
  'QQQ': { code: '209742', name: 'E-Mini Nasdaq 100' },
  'YM': { code: '124603', name: 'E-Mini Dow' },
  'DIA': { code: '124603', name: 'E-Mini Dow' },
  'RTY': { code: '239742', name: 'E-Mini Russell 2000' },
  'IWM': { code: '239742', name: 'E-Mini Russell 2000' },
  
  // Forex
  'EURUSD': { code: '099741', name: 'Euro FX' },
  'EUR': { code: '099741', name: 'Euro FX' },
  'GBPUSD': { code: '096742', name: 'British Pound' },
  'GBP': { code: '096742', name: 'British Pound' },
  'USDJPY': { code: '097741', name: 'Japanese Yen' },
  'JPY': { code: '097741', name: 'Japanese Yen' },
  'AUDUSD': { code: '232741', name: 'Australian Dollar' },
  'AUD': { code: '232741', name: 'Australian Dollar' },
  'USDCAD': { code: '090741', name: 'Canadian Dollar' },
  'CAD': { code: '090741', name: 'Canadian Dollar' },
  'USDCHF': { code: '092741', name: 'Swiss Franc' },
  'CHF': { code: '092741', name: 'Swiss Franc' },
  'DXY': { code: '098662', name: 'US Dollar Index' },
  
  // Commodities
  'GC': { code: '088691', name: 'Gold' },
  'GLD': { code: '088691', name: 'Gold' },
  'GOLD': { code: '088691', name: 'Gold' },
  'SI': { code: '084691', name: 'Silver' },
  'SLV': { code: '084691', name: 'Silver' },
  'CL': { code: '067651', name: 'Crude Oil' },
  'USO': { code: '067651', name: 'Crude Oil' },
  'OIL': { code: '067651', name: 'Crude Oil' },
  'NG': { code: '023651', name: 'Natural Gas' },
  'UNG': { code: '023651', name: 'Natural Gas' },
  'HG': { code: '085692', name: 'Copper' },
  
  // Granos
  'ZC': { code: '002602', name: 'Corn' },
  'CORN': { code: '002602', name: 'Corn' },
  'ZW': { code: '001602', name: 'Wheat' },
  'WHEAT': { code: '001602', name: 'Wheat' },
  'ZS': { code: '005602', name: 'Soybeans' },
  'SOYBEAN': { code: '005602', name: 'Soybeans' },
  
  // Bonos
  'ZB': { code: '020601', name: 'US Treasury Bond' },
  'TLT': { code: '020601', name: 'US Treasury Bond' },
  'ZN': { code: '043602', name: '10-Year T-Note' },
  'ZF': { code: '044601', name: '5-Year T-Note' },
  
  // VIX
  'VIX': { code: '1170E1', name: 'VIX Futures' },
  'UVXY': { code: '1170E1', name: 'VIX Futures' },
};

// Cache
const cache = new Map<string, { data: COTData; timestamp: number }>();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 horas (COT se publica semanalmente)

export const cotReportsService = {
  /**
   * Obtiene datos COT para un símbolo
   */
  async getCOTReport(symbol: string): Promise<COTData> {
    const upperSymbol = symbol.toUpperCase();
    
    // Check cache
    const cached = cache.get(upperSymbol);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }

    try {
      // Verificar si tenemos código CFTC para este símbolo
      const cftcInfo = CFTC_CODES[upperSymbol];
      
      if (!cftcInfo) {
        // Para acciones individuales, usamos datos del S&P como proxy del sentimiento general
        return this.getProxyData(upperSymbol);
      }

      // Intentar obtener datos de CFTC
      const data = await this.fetchFromCFTC(upperSymbol, cftcInfo);
      
      if (data) {
        cache.set(upperSymbol, { data, timestamp: Date.now() });
        logger.info(`[COT] ${upperSymbol}: Commercial sentiment ${data.commercialSentiment}, Signal: ${data.signal}`);
        return data;
      }

      return this.getDefaultData(upperSymbol);
    } catch (error) {
      logger.error(`[COT] Error fetching for ${symbol}:`, error);
      return this.getDefaultData(upperSymbol);
    }
  },

  /**
   * Fetch COT data from CFTC
   * Nota: CFTC publica datos en formato CSV cada viernes
   */
  async fetchFromCFTC(symbol: string, cftcInfo: { code: string; name: string }): Promise<COTData | null> {
    try {
      // CFTC Disaggregated Futures Only Report
      // URL del reporte semanal más reciente
      const year = new Date().getFullYear();
      const url = `https://www.cftc.gov/dea/newcot/f_disagg.txt`;
      
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        // Intentar con el formato legacy
        return this.fetchLegacyCOT(symbol, cftcInfo);
      }

      const text = await response.text();
      const lines = text.split('\n');
      
      // Buscar la línea con nuestro código
      for (const line of lines) {
        if (line.includes(cftcInfo.code) || line.toLowerCase().includes(cftcInfo.name.toLowerCase())) {
          return this.parseDisaggregatedLine(symbol, cftcInfo.name, line);
        }
      }

      // Si no encontramos, intentar formato legacy
      return this.fetchLegacyCOT(symbol, cftcInfo);
    } catch (error) {
      logger.debug(`[COT] CFTC fetch failed, trying legacy format`);
      return this.fetchLegacyCOT(symbol, cftcInfo);
    }
  },

  /**
   * Fetch formato legacy de COT
   */
  async fetchLegacyCOT(symbol: string, cftcInfo: { code: string; name: string }): Promise<COTData | null> {
    try {
      // Formato legacy: futures only
      const url = `https://www.cftc.gov/dea/newcot/deafut.txt`;
      
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        return null;
      }

      const text = await response.text();
      const lines = text.split('\n');
      
      for (const line of lines) {
        if (line.includes(cftcInfo.code) || line.toLowerCase().includes(cftcInfo.name.toLowerCase())) {
          return this.parseLegacyLine(symbol, cftcInfo.name, line);
        }
      }

      return null;
    } catch {
      return null;
    }
  },

  /**
   * Parsea línea del formato disaggregated
   */
  parseDisaggregatedLine(symbol: string, name: string, line: string): COTData | null {
    try {
      const fields = line.split(',').map(f => f.trim().replace(/"/g, ''));
      
      // El formato disaggregated tiene muchos campos
      // Buscamos los campos relevantes por posición aproximada
      const reportDate = fields[2] || new Date().toISOString().split('T')[0];
      const openInterest = parseInt(fields[7]) || 0;
      
      // Producer/Merchant (Commercials)
      const prodLong = parseInt(fields[8]) || 0;
      const prodShort = parseInt(fields[9]) || 0;
      
      // Swap Dealers
      const swapLong = parseInt(fields[10]) || 0;
      const swapShort = parseInt(fields[11]) || 0;
      
      // Managed Money (Large Specs)
      const mmLong = parseInt(fields[12]) || 0;
      const mmShort = parseInt(fields[13]) || 0;
      
      // Other Reportables
      const otherLong = parseInt(fields[14]) || 0;
      const otherShort = parseInt(fields[15]) || 0;
      
      // Non-Reportable (Small Specs)
      const nrLong = parseInt(fields[16]) || 0;
      const nrShort = parseInt(fields[17]) || 0;

      // Commercials = Producers + Swap Dealers
      const commercialLong = prodLong + swapLong;
      const commercialShort = prodShort + swapShort;
      const commercialNet = commercialLong - commercialShort;

      // Large Specs = Managed Money + Other
      const largeSpecLong = mmLong + otherLong;
      const largeSpecShort = mmShort + otherShort;
      const largeSpecNet = largeSpecLong - largeSpecShort;

      // Small Specs = Non-Reportable
      const smallSpecLong = nrLong;
      const smallSpecShort = nrShort;
      const smallSpecNet = smallSpecLong - smallSpecShort;

      return this.buildCOTData(symbol, name, {
        reportDate,
        openInterest,
        commercialLong,
        commercialShort,
        commercialNet,
        largeSpecLong,
        largeSpecShort,
        largeSpecNet,
        smallSpecLong,
        smallSpecShort,
        smallSpecNet,
      });
    } catch (error) {
      logger.debug(`[COT] Failed to parse disaggregated line`);
      return null;
    }
  },

  /**
   * Parsea línea del formato legacy
   */
  parseLegacyLine(symbol: string, name: string, line: string): COTData | null {
    try {
      const fields = line.split(',').map(f => f.trim().replace(/"/g, ''));
      
      const reportDate = fields[2] || new Date().toISOString().split('T')[0];
      const openInterest = parseInt(fields[7]) || 0;
      
      // Commercial (Non-Commercial = Large Specs en legacy)
      const ncLong = parseInt(fields[8]) || 0;
      const ncShort = parseInt(fields[9]) || 0;
      
      // Commercial
      const commLong = parseInt(fields[11]) || 0;
      const commShort = parseInt(fields[12]) || 0;
      
      // Non-Reportable
      const nrLong = parseInt(fields[14]) || 0;
      const nrShort = parseInt(fields[15]) || 0;

      return this.buildCOTData(symbol, name, {
        reportDate,
        openInterest,
        commercialLong: commLong,
        commercialShort: commShort,
        commercialNet: commLong - commShort,
        largeSpecLong: ncLong,
        largeSpecShort: ncShort,
        largeSpecNet: ncLong - ncShort,
        smallSpecLong: nrLong,
        smallSpecShort: nrShort,
        smallSpecNet: nrLong - nrShort,
      });
    } catch {
      return null;
    }
  },

  /**
   * Construye el objeto COTData con análisis
   */
  buildCOTData(symbol: string, name: string, raw: {
    reportDate: string;
    openInterest: number;
    commercialLong: number;
    commercialShort: number;
    commercialNet: number;
    largeSpecLong: number;
    largeSpecShort: number;
    largeSpecNet: number;
    smallSpecLong: number;
    smallSpecShort: number;
    smallSpecNet: number;
  }): COTData {
    // Calcular sentimientos
    const commercialSentiment = this.calculateSentiment(raw.commercialNet, raw.openInterest);
    const speculatorSentiment = this.calculateSentiment(raw.largeSpecNet, raw.openInterest);
    
    // Señal contrarian: cuando specs están muy alcistas, puede ser techo
    const contrarian = (speculatorSentiment === 'very_bullish' || speculatorSentiment === 'very_bearish');
    
    // Señal principal: seguimos a los commercials (saben lo que hacen)
    let signal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    let strength: 'strong' | 'moderate' | 'weak' = 'weak';
    
    if (commercialSentiment === 'very_bullish') {
      signal = 'bullish';
      strength = 'strong';
    } else if (commercialSentiment === 'bullish') {
      signal = 'bullish';
      strength = 'moderate';
    } else if (commercialSentiment === 'very_bearish') {
      signal = 'bearish';
      strength = 'strong';
    } else if (commercialSentiment === 'bearish') {
      signal = 'bearish';
      strength = 'moderate';
    }

    // Si hay divergencia con especuladores, aumenta la señal
    if (contrarian && signal !== 'neutral') {
      if ((commercialSentiment.includes('bullish') && speculatorSentiment.includes('bearish')) ||
          (commercialSentiment.includes('bearish') && speculatorSentiment.includes('bullish'))) {
        strength = 'strong';
      }
    }

    const { summary, tradingImplication } = this.generateAnalysis(
      symbol, name, commercialSentiment, speculatorSentiment, signal, strength, contrarian
    );

    return {
      symbol,
      reportDate: raw.reportDate,
      commercialLong: raw.commercialLong,
      commercialShort: raw.commercialShort,
      commercialNet: raw.commercialNet,
      commercialNetChange: 0, // Requeriría datos históricos
      largeSpecLong: raw.largeSpecLong,
      largeSpecShort: raw.largeSpecShort,
      largeSpecNet: raw.largeSpecNet,
      largeSpecNetChange: 0,
      smallSpecLong: raw.smallSpecLong,
      smallSpecShort: raw.smallSpecShort,
      smallSpecNet: raw.smallSpecNet,
      openInterest: raw.openInterest,
      openInterestChange: 0,
      commercialSentiment,
      speculatorSentiment,
      contrarian,
      signal,
      strength,
      summary,
      tradingImplication,
      hasData: true,
      dataSource: 'CFTC COT Report',
    };
  },

  /**
   * Calcula el sentimiento basado en la posición neta
   */
  calculateSentiment(netPosition: number, openInterest: number): COTData['commercialSentiment'] {
    if (openInterest === 0) return 'neutral';
    
    const percentOfOI = (netPosition / openInterest) * 100;
    
    if (percentOfOI > 30) return 'very_bullish';
    if (percentOfOI > 10) return 'bullish';
    if (percentOfOI < -30) return 'very_bearish';
    if (percentOfOI < -10) return 'bearish';
    return 'neutral';
  },

  /**
   * Genera análisis en texto
   */
  generateAnalysis(
    symbol: string,
    name: string,
    commercialSentiment: string,
    speculatorSentiment: string,
    signal: string,
    strength: string,
    contrarian: boolean
  ): { summary: string; tradingImplication: string } {
    let summary = `📊 COT Report para ${name}:\n`;
    
    // Commercials
    if (commercialSentiment === 'very_bullish') {
      summary += `• Commercials MUY LARGOS - Los hedgers están acumulando fuertemente.\n`;
    } else if (commercialSentiment === 'bullish') {
      summary += `• Commercials largos - Los hedgers están posicionados al alza.\n`;
    } else if (commercialSentiment === 'very_bearish') {
      summary += `• Commercials MUY CORTOS - Los hedgers están cubriendo agresivamente.\n`;
    } else if (commercialSentiment === 'bearish') {
      summary += `• Commercials cortos - Los hedgers están cubriendo posiciones.\n`;
    } else {
      summary += `• Commercials neutrales.\n`;
    }

    // Large Specs
    if (speculatorSentiment === 'very_bullish') {
      summary += `• Fondos MUY LARGOS - ⚠️ Posible señal contrarian (techo cercano).\n`;
    } else if (speculatorSentiment === 'bullish') {
      summary += `• Fondos largos - Momentum a favor.\n`;
    } else if (speculatorSentiment === 'very_bearish') {
      summary += `• Fondos MUY CORTOS - ⚠️ Posible señal contrarian (suelo cercano).\n`;
    } else if (speculatorSentiment === 'bearish') {
      summary += `• Fondos cortos - Presión vendedora.\n`;
    }

    let tradingImplication = '';
    
    if (signal === 'bullish' && strength === 'strong') {
      tradingImplication = '🟢 Señal ALCISTA fuerte. Los commercials (los que saben) están comprando.';
    } else if (signal === 'bullish') {
      tradingImplication = '🟢 Señal alcista moderada. Posicionamiento favorable.';
    } else if (signal === 'bearish' && strength === 'strong') {
      tradingImplication = '🔴 Señal BAJISTA fuerte. Los commercials están vendiendo/cubriendo.';
    } else if (signal === 'bearish') {
      tradingImplication = '🔴 Señal bajista moderada. Precaución recomendada.';
    } else {
      tradingImplication = '⚪ Sin señal clara del COT. Posicionamiento mixto.';
    }

    if (contrarian) {
      tradingImplication += ' ⚠️ Posiciones especulativas en extremo - posible punto de inflexión.';
    }

    return { summary, tradingImplication };
  },

  /**
   * Para acciones sin datos COT específicos, usamos S&P como proxy
   */
  async getProxyData(symbol: string): Promise<COTData> {
    // Obtener datos del S&P 500 como proxy del sentimiento general
    const spyData = await this.getCOTReport('SPY');
    
    if (spyData.hasData) {
      return {
        ...spyData,
        symbol,
        summary: `ℹ️ ${symbol} no tiene datos COT específicos. Usando S&P 500 como proxy del sentimiento institucional:\n` + spyData.summary,
        tradingImplication: `(Proxy S&P 500) ${spyData.tradingImplication}`,
        dataSource: 'CFTC COT Report (S&P 500 proxy)',
      };
    }

    return this.getDefaultData(symbol);
  },

  /**
   * Datos por defecto
   */
  getDefaultData(symbol: string): COTData {
    return {
      symbol,
      reportDate: '',
      commercialLong: 0,
      commercialShort: 0,
      commercialNet: 0,
      commercialNetChange: 0,
      largeSpecLong: 0,
      largeSpecShort: 0,
      largeSpecNet: 0,
      largeSpecNetChange: 0,
      smallSpecLong: 0,
      smallSpecShort: 0,
      smallSpecNet: 0,
      openInterest: 0,
      openInterestChange: 0,
      commercialSentiment: 'neutral',
      speculatorSentiment: 'neutral',
      contrarian: false,
      signal: 'neutral',
      strength: 'weak',
      summary: 'ℹ️ Datos COT no disponibles. Los reportes se publican cada viernes.',
      tradingImplication: 'Consulta cftc.gov para datos actualizados de posicionamiento.',
      hasData: false,
      dataSource: 'N/A',
    };
  },
};
