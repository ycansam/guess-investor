/**
 * Macro Economic Service
 * Obtiene indicadores macroeconómicos: índices, tipos de interés, commodities
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
  
  interestRate: {
    symbol: string;
    name: string;
    value: number;
    change1m: number;
    impact: 'positive' | 'negative' | 'neutral';
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
}

// Mapeo de símbolos a regiones
const SYMBOL_TO_REGION: Record<string, { region: string; country: string }> = {
  '.MC': { region: 'europe', country: 'ES' },
  '.DE': { region: 'europe', country: 'DE' },
  '.PA': { region: 'europe', country: 'FR' },
  '.L': { region: 'europe', country: 'UK' },
  '.MI': { region: 'europe', country: 'IT' },
};

// Índices regionales
const REGIONAL_INDICES: Record<string, { symbol: string; name: string }> = {
  'europe': { symbol: '^STOXX50E', name: 'Euro Stoxx 50' },
  'usa': { symbol: '^GSPC', name: 'S&P 500' },
  'asia': { symbol: '^N225', name: 'Nikkei 225' },
};

// Sectores conocidos
const COMPANY_SECTORS: Record<string, string> = {
  'ITX.MC': 'retail',
  'AMZN': 'retail',
  'AAPL': 'technology',
  'MSFT': 'technology',
  'GOOGL': 'technology',
  'META': 'technology',
  'TSLA': 'technology',
  'SAN.MC': 'banking',
  'BBVA.MC': 'banking',
  'REP.MC': 'energy',
  'IBE.MC': 'energy',
  'XOM': 'energy',
  'JPM': 'banking',
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
      
      // Obtener datos en paralelo
      const [regionalIndex, interestRate, vix] = await Promise.all([
        this.getRegionalIndex(region),
        this.getInterestRate(region),
        this.getVIX(),
      ]);
      
      const { score, outlook } = this.calculateMacroScore(regionalIndex, interestRate, vix);
      
      const result: MacroIndicators = {
        region,
        country,
        regionalIndex,
        interestRate,
        commodities: [],
        volatilityIndex: vix,
        macroScore: score,
        macroOutlook: outlook,
        hasData: regionalIndex !== null || interestRate !== null || vix !== null,
        summary: this.generateSummary(regionalIndex, interestRate, vix, outlook),
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
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(indexConfig.symbol)}?range=1mo&interval=1d`;
      
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
      if (change1m > 2) trend = 'bullish';
      else if (change1m < -2) trend = 'bearish';
      
      return {
        symbol: indexConfig.symbol,
        name: indexConfig.name,
        change1d,
        change1m,
        trend,
      };
    } catch (error) {
      logger.error(`[Macro] Error getting regional index:`, error);
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
    interestRate: MacroIndicators['interestRate'],
    vix: MacroIndicators['volatilityIndex']
  ): { score: number; outlook: 'favorable' | 'neutral' | 'unfavorable' } {
    let score = 0;
    let factors = 0;
    
    if (regionalIndex) {
      score += regionalIndex.change1m * 2; // +2% mensual = +4 puntos
      factors++;
    }
    
    if (interestRate) {
      score -= interestRate.change1m * 10; // -0.3% tipos = +3 puntos
      factors++;
    }
    
    if (vix) {
      // VIX alto es contrarian bullish
      if (vix.level === 'extreme') score += 15;
      else if (vix.level === 'high') score += 5;
      else if (vix.level === 'low') score -= 10; // Complacencia
      factors++;
    }
    
    if (factors > 0) {
      score = Math.max(-100, Math.min(100, Math.round(score / factors * 10)));
    }
    
    let outlook: 'favorable' | 'neutral' | 'unfavorable' = 'neutral';
    if (score > 20) outlook = 'favorable';
    else if (score < -20) outlook = 'unfavorable';
    
    return { score, outlook };
  },

  generateSummary(
    index: MacroIndicators['regionalIndex'],
    rates: MacroIndicators['interestRate'],
    vix: MacroIndicators['volatilityIndex'],
    outlook: string
  ): string {
    const parts: string[] = [];
    
    if (index) {
      parts.push(`${index.name}: ${index.change1m >= 0 ? '+' : ''}${index.change1m.toFixed(1)}% mensual`);
    }
    
    if (rates) {
      parts.push(`Tipos 10Y: ${rates.value.toFixed(2)}%`);
    }
    
    if (vix) {
      parts.push(`VIX: ${vix.value.toFixed(1)} (${vix.level})`);
    }
    
    if (parts.length === 0) {
      return 'Sin datos macroeconómicos disponibles.';
    }
    
    return `${parts.join('. ')}. Entorno macro: ${outlook}.`;
  },

  async getCryptoIndicators(): Promise<MacroIndicators> {
    const vix = await this.getVIX();
    
    return {
      region: 'global',
      country: 'N/A',
      regionalIndex: null,
      interestRate: null,
      commodities: [],
      volatilityIndex: vix,
      macroScore: 0,
      macroOutlook: 'neutral',
      hasData: vix !== null,
      summary: vix ? `VIX: ${vix.value.toFixed(1)} (${vix.level})` : 'Sin datos macro.',
    };
  },

  createEmptyIndicators(): MacroIndicators {
    return {
      region: 'unknown',
      country: 'N/A',
      regionalIndex: null,
      interestRate: null,
      commodities: [],
      volatilityIndex: null,
      macroScore: 0,
      macroOutlook: 'neutral',
      hasData: false,
      summary: 'Sin datos macroeconómicos disponibles.',
    };
  },
};
