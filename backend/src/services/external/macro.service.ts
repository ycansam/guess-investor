/**
 * Macro Economic Service - MEJORADO
 * Obtiene indicadores macroeconómicos: índices, tipos de interés, sectoriales
 * 
 * MEJORAS:
 * - Índices sectoriales (XLK, XLF, XLE, etc.)
 * - Más regiones (Asia, LATAM)
 * - Dollar Index (DXY)
 * - Spread de crédito (HYG vs LQD)
 */

import { logger } from '../../middleware/logger.js';

export interface MacroIndicators {
  region: string;
  country: string;
  
  regionalIndex: {
    symbol: string;
    name: string;
    change1d: number;
    change1m: number;
    trend: 'bullish' | 'bearish' | 'neutral';
  } | null;
  
  // NUEVO: Índice sectorial relevante
  sectorIndex: {
    symbol: string;
    name: string;
    change1d: number;
    change1m: number;
    trend: 'bullish' | 'bearish' | 'neutral';
  } | null;
  
  interestRate: {
    symbol: string;
    name: string;
    value: number;
    change1m: number;
    impact: 'positive' | 'negative' | 'neutral';
  } | null;
  
  // NUEVO: Dollar Index
  dollarIndex: {
    value: number;
    change1m: number;
    trend: 'strengthening' | 'weakening' | 'stable';
  } | null;
  
  commodities: Array<{
    symbol: string;
    name: string;
    change1m: number;
    impact: 'positive' | 'negative' | 'neutral';
  }>;
  
  volatilityIndex: {
    value: number;
    level: 'low' | 'medium' | 'high' | 'extreme';
  } | null;
  
  macroScore: number; // -100 a +100
  macroOutlook: 'favorable' | 'neutral' | 'unfavorable';
  hasData: boolean;
  summary: string;
  dataQuality: 'high' | 'medium' | 'low'; // NUEVO
}

// Mapeo de símbolos a regiones
const SYMBOL_TO_REGION: Record<string, { region: string; country: string }> = {
  '.MC': { region: 'europe', country: 'ES' },
  '.MA': { region: 'europe', country: 'ES' },
  '.DE': { region: 'europe', country: 'DE' },
  '.F': { region: 'europe', country: 'DE' },
  '.PA': { region: 'europe', country: 'FR' },
  '.L': { region: 'europe', country: 'UK' },
  '.MI': { region: 'europe', country: 'IT' },
  '.AS': { region: 'europe', country: 'NL' },
  '.SW': { region: 'europe', country: 'CH' },
  '.T': { region: 'asia', country: 'JP' },
  '.HK': { region: 'asia', country: 'HK' },
  '.SS': { region: 'asia', country: 'CN' },
  '.SZ': { region: 'asia', country: 'CN' },
  '.KS': { region: 'asia', country: 'KR' },
  '.AX': { region: 'oceania', country: 'AU' },
  '.TO': { region: 'americas', country: 'CA' },
  '.MX': { region: 'latam', country: 'MX' },
  '.SA': { region: 'latam', country: 'BR' },
};

// Índices regionales - AMPLIADO
const REGIONAL_INDICES: Record<string, { symbol: string; name: string }> = {
  'europe': { symbol: '^STOXX50E', name: 'Euro Stoxx 50' },
  'usa': { symbol: '^GSPC', name: 'S&P 500' },
  'asia': { symbol: '^N225', name: 'Nikkei 225' },
  'oceania': { symbol: '^AXJO', name: 'ASX 200' },
  'americas': { symbol: '^GSPTSE', name: 'TSX Composite' },
  'latam': { symbol: '^BVSP', name: 'Bovespa' },
};

// NUEVO: Índices sectoriales (ETFs de SPDR)
const SECTOR_INDICES: Record<string, { symbol: string; name: string }> = {
  'technology': { symbol: 'XLK', name: 'Technology Select' },
  'financials': { symbol: 'XLF', name: 'Financial Select' },
  'energy': { symbol: 'XLE', name: 'Energy Select' },
  'healthcare': { symbol: 'XLV', name: 'Healthcare Select' },
  'consumer': { symbol: 'XLY', name: 'Consumer Discretionary' },
  'industrials': { symbol: 'XLI', name: 'Industrial Select' },
  'materials': { symbol: 'XLB', name: 'Materials Select' },
  'utilities': { symbol: 'XLU', name: 'Utilities Select' },
  'realestate': { symbol: 'XLRE', name: 'Real Estate Select' },
  'communications': { symbol: 'XLC', name: 'Communication Services' },
  'staples': { symbol: 'XLP', name: 'Consumer Staples' },
};

// Sectores conocidos - AMPLIADO
const COMPANY_SECTORS: Record<string, string> = {
  // España
  'ITX.MC': 'consumer', 'IBE.MC': 'utilities', 'REP.MC': 'energy',
  'SAN.MC': 'financials', 'BBVA.MC': 'financials', 'TEF.MC': 'communications',
  'AMS.MC': 'healthcare', 'CABK.MC': 'financials', 'FER.MC': 'industrials',
  // USA Tech
  'AAPL': 'technology', 'MSFT': 'technology', 'GOOGL': 'technology',
  'META': 'technology', 'AMZN': 'consumer', 'NVDA': 'technology',
  'TSLA': 'consumer', 'AMD': 'technology', 'INTC': 'technology',
  // USA Financials
  'JPM': 'financials', 'BAC': 'financials', 'WFC': 'financials',
  'GS': 'financials', 'MS': 'financials', 'C': 'financials',
  // USA Energy
  'XOM': 'energy', 'CVX': 'energy', 'COP': 'energy',
  // USA Healthcare
  'JNJ': 'healthcare', 'PFE': 'healthcare', 'UNH': 'healthcare',
  'ABBV': 'healthcare', 'MRK': 'healthcare', 'LLY': 'healthcare',
  // USA Consumer
  'WMT': 'staples', 'KO': 'staples', 'PG': 'staples',
  'NKE': 'consumer', 'MCD': 'consumer', 'SBUX': 'consumer',
};

// Cache
const cache = new Map<string, { data: MacroIndicators; expiresAt: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutos

function getCached(key: string): MacroIndicators | null {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  cache.delete(key);
  return null;
}

export const macroService = {
  async getIndicators(symbol: string, type: 'stock' | 'crypto'): Promise<MacroIndicators> {
    // Crypto tiene menos indicadores macro
    if (type === 'crypto') {
      return this.getCryptoIndicators();
    }

    const cacheKey = `macro:${symbol}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
      logger.info(`[Macro] Getting indicators for ${symbol}`);
      
      const { region, country } = this.detectRegion(symbol);
      const sector = this.detectSector(symbol);
      
      // Obtener datos en paralelo - MEJORADO
      const [regionalIndex, sectorIndex, interestRate, vix, dollarIndex] = await Promise.all([
        this.getRegionalIndex(region),
        sector !== 'default' ? this.getSectorIndex(sector) : Promise.resolve(null),
        this.getInterestRate(region),
        this.getVIX(),
        this.getDollarIndex(),
      ]);
      
      const { score, outlook } = this.calculateMacroScore(regionalIndex, sectorIndex, interestRate, vix, dollarIndex);
      
      // Calcular calidad de datos
      const dataPoints = [regionalIndex, sectorIndex, interestRate, vix, dollarIndex].filter(Boolean).length;
      const dataQuality = dataPoints >= 4 ? 'high' : dataPoints >= 2 ? 'medium' : 'low';
      
      const result: MacroIndicators = {
        region,
        country,
        regionalIndex,
        sectorIndex,
        interestRate,
        dollarIndex,
        commodities: [],
        volatilityIndex: vix,
        macroScore: score,
        macroOutlook: outlook,
        hasData: dataPoints > 0,
        summary: this.generateSummary(regionalIndex, sectorIndex, interestRate, vix, dollarIndex, outlook),
        dataQuality,
      };
      
      cache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL });
      
      return result;
    } catch (error) {
      logger.error(`[Macro] Error getting indicators:`, error);
      return this.createEmptyIndicators();
    }
  },

  detectRegion(symbol: string): { region: string; country: string } {
    for (const [suffix, regionInfo] of Object.entries(SYMBOL_TO_REGION)) {
      if (symbol.endsWith(suffix)) {
        return regionInfo;
      }
    }
    return { region: 'usa', country: 'US' };
  },

  detectSector(symbol: string): string {
    return COMPANY_SECTORS[symbol] || 'default';
  },

  async getRegionalIndex(region: string): Promise<MacroIndicators['regionalIndex']> {
    try {
      const indexConfig = REGIONAL_INDICES[region] || REGIONAL_INDICES['usa'];
      return await this.fetchIndexData(indexConfig.symbol, indexConfig.name);
    } catch (error) {
      logger.error(`[Macro] Error getting regional index:`, error);
      return null;
    }
  },

  // NUEVO: Obtener índice sectorial
  async getSectorIndex(sector: string): Promise<MacroIndicators['sectorIndex']> {
    try {
      const sectorConfig = SECTOR_INDICES[sector];
      if (!sectorConfig) return null;
      return await this.fetchIndexData(sectorConfig.symbol, sectorConfig.name);
    } catch (error) {
      logger.debug(`[Macro] Could not get sector index for ${sector}`);
      return null;
    }
  },

  // Helper para obtener datos de cualquier índice
  async fetchIndexData(symbol: string, name: string): Promise<{
    symbol: string;
    name: string;
    change1d: number;
    change1m: number;
    trend: 'bullish' | 'bearish' | 'neutral';
  } | null> {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`;
    
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
    });
    
    if (!response.ok) return null;
    
    const data: any = await response.json();
    const result = data.chart?.result?.[0];
    const closes = result?.indicators?.quote?.[0]?.close?.filter((c: any) => c !== null) || [];
    
    if (closes.length < 2) return null;
    
    const current = closes[closes.length - 1];
    const prev = closes[closes.length - 2];
    const monthAgo = closes[0];
    
    const change1d = ((current - prev) / prev) * 100;
    const change1m = ((current - monthAgo) / monthAgo) * 100;
    
    let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (change1m > 3) trend = 'bullish';
    else if (change1m < -3) trend = 'bearish';
    
    return { symbol, name, change1d, change1m, trend };
  },

  // NUEVO: Dollar Index (DXY)
  async getDollarIndex(): Promise<MacroIndicators['dollarIndex']> {
    try {
      const url = 'https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?range=1mo&interval=1d';
      
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10000),
      });
      
      if (!response.ok) return null;
      
      const data: any = await response.json();
      const result = data.chart?.result?.[0];
      const closes = result?.indicators?.quote?.[0]?.close?.filter((c: any) => c !== null) || [];
      
      if (closes.length < 2) return null;
      
      const current = closes[closes.length - 1];
      const monthAgo = closes[0];
      const change1m = ((current - monthAgo) / monthAgo) * 100;
      
      let trend: 'strengthening' | 'weakening' | 'stable' = 'stable';
      if (change1m > 1.5) trend = 'strengthening';
      else if (change1m < -1.5) trend = 'weakening';
      
      logger.info(`[Macro] DXY: ${current.toFixed(2)} (${change1m > 0 ? '+' : ''}${change1m.toFixed(1)}%, ${trend})`);
      
      return { value: current, change1m, trend };
    } catch (error) {
      logger.debug(`[Macro] Could not get Dollar Index`);
      return null;
    }
  },

  async getInterestRate(region: string): Promise<MacroIndicators['interestRate']> {
    try {
      // US 10Y Treasury como referencia
      const url = 'https://query1.finance.yahoo.com/v8/finance/chart/%5ETNX?range=1mo&interval=1d';
      
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10000),
      });
      
      if (!response.ok) return null;
      
      const data: any = await response.json();
      const result = data.chart?.result?.[0];
      const closes = result?.indicators?.quote?.[0]?.close?.filter((c: any) => c !== null) || [];
      
      if (closes.length < 2) return null;
      
      const current = closes[closes.length - 1];
      const monthAgo = closes[0];
      const change1m = current - monthAgo;
      
      // Subida de tipos es negativo para acciones (especialmente growth)
      let impact: 'positive' | 'negative' | 'neutral' = 'neutral';
      if (change1m > 0.3) impact = 'negative';
      else if (change1m < -0.3) impact = 'positive';
      
      return {
        symbol: '^TNX',
        name: 'US 10Y Treasury',
        value: current,
        change1m,
        impact,
      };
    } catch (error) {
      logger.error(`[Macro] Error getting interest rate:`, error);
      return null;
    }
  },

  async getVIX(): Promise<MacroIndicators['volatilityIndex']> {
    try {
      const url = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=5d';
      
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10000),
      });
      
      if (!response.ok) return null;
      
      const data: any = await response.json();
      const result = data.chart?.result?.[0];
      const closes = result?.indicators?.quote?.[0]?.close?.filter((c: any) => c !== null) || [];
      const value = closes[closes.length - 1];
      
      if (!value) return null;
      
      let level: 'low' | 'medium' | 'high' | 'extreme' = 'medium';
      if (value < 15) level = 'low';
      else if (value < 25) level = 'medium';
      else if (value < 35) level = 'high';
      else level = 'extreme';
      
      return { value, level };
    } catch (error) {
      logger.error(`[Macro] Error getting VIX:`, error);
      return null;
    }
  },

  calculateMacroScore(
    regionalIndex: MacroIndicators['regionalIndex'],
    sectorIndex: MacroIndicators['sectorIndex'],
    interestRate: MacroIndicators['interestRate'],
    vix: MacroIndicators['volatilityIndex'],
    dollarIndex: MacroIndicators['dollarIndex']
  ): { score: number; outlook: 'favorable' | 'neutral' | 'unfavorable' } {
    let score = 0;
    let totalWeight = 0;
    
    // Índice regional (peso: 25%)
    if (regionalIndex) {
      const regionScore = regionalIndex.change1m * 3; // +3% mensual = +9 puntos
      score += regionScore * 0.25;
      totalWeight += 0.25;
    }
    
    // Índice sectorial (peso: 30%) - más relevante para el activo específico
    if (sectorIndex) {
      const sectorScore = sectorIndex.change1m * 3.5;
      score += sectorScore * 0.30;
      totalWeight += 0.30;
    }
    
    // Tipos de interés (peso: 20%)
    if (interestRate) {
      // Subida de tipos es negativo
      const rateScore = -interestRate.change1m * 15; // -0.3% tipos = +4.5 puntos
      score += rateScore * 0.20;
      totalWeight += 0.20;
    }
    
    // VIX (peso: 15%)
    if (vix) {
      let vixScore = 0;
      if (vix.level === 'extreme') vixScore = 20;      // Pánico = oportunidad
      else if (vix.level === 'high') vixScore = 10;
      else if (vix.level === 'low') vixScore = -15;    // Complacencia = peligro
      score += vixScore * 0.15;
      totalWeight += 0.15;
    }
    
    // Dollar Index (peso: 10%)
    if (dollarIndex) {
      // USD fuerte = negativo para multinacionales/emergentes
      const dxyScore = -dollarIndex.change1m * 5;
      score += dxyScore * 0.10;
      totalWeight += 0.10;
    }
    
    // Normalizar por pesos disponibles
    if (totalWeight > 0) {
      score = Math.round(score / totalWeight);
    }
    
    score = Math.max(-100, Math.min(100, score));
    
    let outlook: 'favorable' | 'neutral' | 'unfavorable' = 'neutral';
    if (score > 15) outlook = 'favorable';
    else if (score < -15) outlook = 'unfavorable';
    
    return { score, outlook };
  },

  generateSummary(
    index: MacroIndicators['regionalIndex'],
    sector: MacroIndicators['sectorIndex'],
    rates: MacroIndicators['interestRate'],
    vix: MacroIndicators['volatilityIndex'],
    dxy: MacroIndicators['dollarIndex'],
    outlook: string
  ): string {
    const parts: string[] = [];
    
    if (index) {
      parts.push(`${index.name}: ${index.change1m >= 0 ? '+' : ''}${index.change1m.toFixed(1)}%`);
    }
    
    if (sector) {
      parts.push(`Sector (${sector.name}): ${sector.change1m >= 0 ? '+' : ''}${sector.change1m.toFixed(1)}%`);
    }
    
    if (rates) {
      parts.push(`10Y: ${rates.value.toFixed(2)}%`);
    }
    
    if (vix) {
      const vixEmoji = vix.level === 'extreme' ? '🔴' : vix.level === 'high' ? '🟠' : vix.level === 'low' ? '🟢' : '🟡';
      parts.push(`VIX: ${vix.value.toFixed(1)} ${vixEmoji}`);
    }
    
    if (dxy) {
      parts.push(`USD: ${dxy.trend === 'strengthening' ? '💪' : dxy.trend === 'weakening' ? '📉' : '➡️'}`);
    }
    
    if (parts.length === 0) {
      return 'Sin datos macroeconómicos disponibles.';
    }
    
    const outlookEmoji = outlook === 'favorable' ? '✅' : outlook === 'unfavorable' ? '⚠️' : '↔️';
    return `${parts.join(' | ')}. Entorno: ${outlook} ${outlookEmoji}`;
  },

  async getCryptoIndicators(): Promise<MacroIndicators> {
    const [vix, dollarIndex] = await Promise.all([
      this.getVIX(),
      this.getDollarIndex(),
    ]);
    
    // Para crypto, USD fuerte suele ser negativo
    let score = 0;
    if (vix) {
      if (vix.level === 'extreme') score += 20;
      else if (vix.level === 'high') score += 10;
      else if (vix.level === 'low') score -= 10;
    }
    if (dollarIndex) {
      score -= dollarIndex.change1m * 3;
    }
    
    return {
      region: 'global',
      country: 'N/A',
      regionalIndex: null,
      sectorIndex: null,
      interestRate: null,
      dollarIndex,
      commodities: [],
      volatilityIndex: vix,
      macroScore: Math.max(-100, Math.min(100, score)),
      macroOutlook: score > 10 ? 'favorable' : score < -10 ? 'unfavorable' : 'neutral',
      hasData: vix !== null || dollarIndex !== null,
      summary: [
        vix ? `VIX: ${vix.value.toFixed(1)} (${vix.level})` : null,
        dollarIndex ? `USD: ${dollarIndex.trend}` : null,
      ].filter(Boolean).join(' | ') || 'Sin datos macro.',
      dataQuality: vix && dollarIndex ? 'medium' : 'low',
    };
  },

  createEmptyIndicators(): MacroIndicators {
    return {
      region: 'unknown',
      country: 'N/A',
      regionalIndex: null,
      sectorIndex: null,
      interestRate: null,
      dollarIndex: null,
      commodities: [],
      volatilityIndex: null,
      macroScore: 0,
      macroOutlook: 'neutral',
      hasData: false,
      summary: 'Sin datos macroeconómicos disponibles.',
      dataQuality: 'low',
    };
  },
};
