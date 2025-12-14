/**
 * Servicio de indicadores macroeconómicos
 * Obtiene datos reales de:
 * - Índices bursátiles regionales (salud económica)
 * - Tipos de interés (bonos)
 * - Commodities relevantes (petróleo, materias primas)
 * - Índices de volatilidad (VIX)
 */

import { fetchWithCorsProxy } from './cors-proxy';

export interface MacroIndicators {
  region: string;
  country: string;
  
  // Índices de mercado (tendencia económica general)
  regionalIndex: {
    symbol: string;
    name: string;
    change1d: number;
    change1m: number;
    trend: 'bullish' | 'bearish' | 'neutral';
  } | null;
  
  // Tipos de interés (coste de financiación)
  interestRate: {
    symbol: string;
    name: string;
    value: number;
    change1m: number;
    impact: 'positive' | 'negative' | 'neutral'; // Subida = negativo para acciones
  } | null;
  
  // Commodities relevantes para el sector
  commodities: Array<{
    symbol: string;
    name: string;
    change1m: number;
    impact: 'positive' | 'negative' | 'neutral';
    relevance: string; // Por qué es relevante
  }>;
  
  // Volatilidad del mercado (VIX)
  volatilityIndex: {
    value: number;
    level: 'low' | 'medium' | 'high' | 'extreme';
  } | null;
  
  // Score general
  macroScore: number; // -100 a +100
  macroOutlook: 'favorable' | 'neutral' | 'unfavorable';
  hasData: boolean;
  summary: string;
}

// Mapeo de símbolos a regiones
const SYMBOL_TO_REGION: Record<string, { region: string; country: string }> = {
  // España
  '.MC': { region: 'europe', country: 'ES' },
  // Alemania
  '.DE': { region: 'europe', country: 'DE' },
  // Francia
  '.PA': { region: 'europe', country: 'FR' },
  // UK
  '.L': { region: 'europe', country: 'UK' },
  // Italia
  '.MI': { region: 'europe', country: 'IT' },
  // USA (sin sufijo o con sufijos específicos)
  'default': { region: 'usa', country: 'US' },
};

// Índices regionales
const REGIONAL_INDICES: Record<string, { symbol: string; name: string }> = {
  'europe': { symbol: '^STOXX50E', name: 'Euro Stoxx 50' },
  'usa': { symbol: '^GSPC', name: 'S&P 500' },
  'asia': { symbol: '^N225', name: 'Nikkei 225' },
  'china': { symbol: '000001.SS', name: 'Shanghai Composite' },
  'uk': { symbol: '^FTSE', name: 'FTSE 100' },
};

// Bonos/Tipos de interés por región
const INTEREST_RATES: Record<string, { symbol: string; name: string }> = {
  'europe': { symbol: '^TNX', name: 'US 10Y Treasury' }, // Referencia global
  'usa': { symbol: '^TNX', name: 'US 10Y Treasury' },
  'uk': { symbol: '^TNX', name: 'US 10Y Treasury' },
};

// Sectores y sus commodities relevantes
const SECTOR_COMMODITIES: Record<string, Array<{ symbol: string; name: string; relevance: string; invertImpact?: boolean }>> = {
  // Retail/Textil (como Inditex)
  'retail': [
    { symbol: 'CL=F', name: 'Petróleo (WTI)', relevance: 'Coste de transporte', invertImpact: true },
    { symbol: 'CT=F', name: 'Algodón', relevance: 'Materia prima textil', invertImpact: true },
    { symbol: 'EURUSD=X', name: 'EUR/USD', relevance: 'Tipo de cambio exportaciones', invertImpact: false },
  ],
  // Tecnología
  'technology': [
    { symbol: 'CL=F', name: 'Petróleo', relevance: 'Costes operativos', invertImpact: true },
    { symbol: '^TNX', name: 'Tipos de interés', relevance: 'Valoración growth', invertImpact: true },
  ],
  // Energía
  'energy': [
    { symbol: 'CL=F', name: 'Petróleo (WTI)', relevance: 'Precio del producto', invertImpact: false },
    { symbol: 'NG=F', name: 'Gas Natural', relevance: 'Precio del producto', invertImpact: false },
  ],
  // Banca
  'banking': [
    { symbol: '^TNX', name: 'Tipos de interés', relevance: 'Margen de intereses', invertImpact: false },
  ],
  // Consumo
  'consumer': [
    { symbol: 'CL=F', name: 'Petróleo', relevance: 'Coste de transporte', invertImpact: true },
  ],
  // Default
  'default': [
    { symbol: 'CL=F', name: 'Petróleo', relevance: 'Costes generales', invertImpact: true },
  ],
};

// Mapeo de empresas conocidas a sectores
const COMPANY_SECTORS: Record<string, string> = {
  'ITX.MC': 'retail',      // Inditex
  'AMZN': 'retail',        // Amazon
  'AAPL': 'technology',    // Apple
  'MSFT': 'technology',    // Microsoft
  'GOOGL': 'technology',   // Google
  'META': 'technology',    // Meta
  'TSLA': 'technology',    // Tesla
  'SAN.MC': 'banking',     // Santander
  'BBVA.MC': 'banking',    // BBVA
  'REP.MC': 'energy',      // Repsol
  'IBE.MC': 'energy',      // Iberdrola
  'TEF.MC': 'technology',  // Telefónica
  'XOM': 'energy',         // Exxon
  'JPM': 'banking',        // JP Morgan
  'BAC': 'banking',        // Bank of America
};

// Caché
interface CacheEntry {
  data: any;
  timestamp: number;
}
const macroCache = new Map<string, CacheEntry>();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutos (datos macro cambian poco)

class MacroEconomicService {
  /**
   * Obtiene indicadores macroeconómicos para un símbolo
   */
  async getIndicators(symbol: string, type: 'stock' | 'crypto'): Promise<MacroIndicators> {
    // Crypto no tiene indicadores macro tradicionales
    if (type === 'crypto') {
      return this.getCryptoIndicators(symbol);
    }
    
    // Verificar caché
    const cached = macroCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`[Macro] Usando caché para ${symbol}`);
      return cached.data;
    }
    
    try {
      console.log(`[Macro] Obteniendo indicadores macroeconómicos para ${symbol}`);
      
      // Detectar región y sector
      const { region, country } = this.detectRegion(symbol);
      const sector = this.detectSector(symbol);
      
      console.log(`[Macro] Región: ${region}, País: ${country}, Sector: ${sector}`);
      
      // Obtener datos en paralelo
      const [regionalIndex, interestRate, commodities, vix] = await Promise.all([
        this.getRegionalIndex(region),
        this.getInterestRate(region),
        this.getCommodities(sector),
        this.getVIX(),
      ]);
      
      // Calcular score macro
      const { score, outlook } = this.calculateMacroScore(
        regionalIndex,
        interestRate,
        commodities,
        vix
      );
      
      const summary = this.generateSummary(region, score, outlook, commodities);
      
      const result: MacroIndicators = {
        region,
        country,
        regionalIndex,
        interestRate,
        commodities,
        volatilityIndex: vix,
        macroScore: score,
        macroOutlook: outlook,
        hasData: regionalIndex !== null || commodities.length > 0,
        summary,
      };
      
      // Guardar en caché
      macroCache.set(symbol, { data: result, timestamp: Date.now() });
      
      console.log(`[Macro] Score: ${score} (${outlook})`);
      
      return result;
      
    } catch (error: any) {
      console.error(`[Macro] Error:`, error.message);
      return this.createEmptyIndicators();
    }
  }
  
  /**
   * Detecta la región basándose en el símbolo
   */
  private detectRegion(symbol: string): { region: string; country: string } {
    for (const [suffix, info] of Object.entries(SYMBOL_TO_REGION)) {
      if (suffix !== 'default' && symbol.endsWith(suffix)) {
        return info;
      }
    }
    
    // Símbolos de Hong Kong
    if (symbol.endsWith('.HK')) {
      return { region: 'asia', country: 'HK' };
    }
    
    // Por defecto USA
    return SYMBOL_TO_REGION['default'];
  }
  
  /**
   * Detecta el sector de la empresa
   */
  private detectSector(symbol: string): string {
    return COMPANY_SECTORS[symbol] || 'default';
  }
  
  /**
   * Obtiene datos del índice regional
   */
  private async getRegionalIndex(region: string): Promise<MacroIndicators['regionalIndex']> {
    const indexInfo = REGIONAL_INDICES[region] || REGIONAL_INDICES['usa'];
    
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(indexInfo.symbol)}?range=1mo&interval=1d`;
      const response = await fetchWithCorsProxy(url, { signal: AbortSignal.timeout(10000) });
      const data = await response.json();
      
      const result = data.chart?.result?.[0];
      if (!result) return null;
      
      const closes = result.indicators?.quote?.[0]?.close || [];
      const validCloses = closes.filter((c: number | null) => c !== null);
      
      if (validCloses.length < 2) return null;
      
      const currentPrice = validCloses[validCloses.length - 1];
      const previousClose = validCloses[validCloses.length - 2];
      const monthAgoPrice = validCloses[0];
      
      const change1d = ((currentPrice - previousClose) / previousClose) * 100;
      const change1m = ((currentPrice - monthAgoPrice) / monthAgoPrice) * 100;
      
      let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
      if (change1m > 3) trend = 'bullish';
      else if (change1m < -3) trend = 'bearish';
      
      return {
        symbol: indexInfo.symbol,
        name: indexInfo.name,
        change1d: Math.round(change1d * 100) / 100,
        change1m: Math.round(change1m * 100) / 100,
        trend,
      };
    } catch (error) {
      console.warn(`[Macro] Error obteniendo índice regional:`, error);
      return null;
    }
  }
  
  /**
   * Obtiene datos de tipos de interés
   */
  private async getInterestRate(region: string): Promise<MacroIndicators['interestRate']> {
    const rateInfo = INTEREST_RATES[region] || INTEREST_RATES['usa'];
    
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(rateInfo.symbol)}?range=1mo&interval=1d`;
      const response = await fetchWithCorsProxy(url, { signal: AbortSignal.timeout(10000) });
      const data = await response.json();
      
      const result = data.chart?.result?.[0];
      if (!result) return null;
      
      const closes = result.indicators?.quote?.[0]?.close || [];
      const validCloses = closes.filter((c: number | null) => c !== null);
      
      if (validCloses.length < 2) return null;
      
      const currentValue = validCloses[validCloses.length - 1];
      const monthAgoValue = validCloses[0];
      
      const change1m = currentValue - monthAgoValue; // Cambio absoluto en puntos
      
      // Subida de tipos = negativo para acciones (en general)
      let impact: 'positive' | 'negative' | 'neutral' = 'neutral';
      if (change1m > 0.2) impact = 'negative'; // Subida significativa
      else if (change1m < -0.2) impact = 'positive'; // Bajada
      
      return {
        symbol: rateInfo.symbol,
        name: rateInfo.name,
        value: Math.round(currentValue * 100) / 100,
        change1m: Math.round(change1m * 100) / 100,
        impact,
      };
    } catch (error) {
      console.warn(`[Macro] Error obteniendo tipos de interés:`, error);
      return null;
    }
  }
  
  /**
   * Obtiene datos de commodities relevantes para el sector
   */
  private async getCommodities(sector: string): Promise<MacroIndicators['commodities']> {
    const sectorCommodities = SECTOR_COMMODITIES[sector] || SECTOR_COMMODITIES['default'];
    const results: MacroIndicators['commodities'] = [];
    
    for (const commodity of sectorCommodities) {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(commodity.symbol)}?range=1mo&interval=1d`;
        const response = await fetchWithCorsProxy(url, { signal: AbortSignal.timeout(8000) });
        const data = await response.json();
        
        const result = data.chart?.result?.[0];
        if (!result) continue;
        
        const closes = result.indicators?.quote?.[0]?.close || [];
        const validCloses = closes.filter((c: number | null) => c !== null);
        
        if (validCloses.length < 2) continue;
        
        const currentPrice = validCloses[validCloses.length - 1];
        const monthAgoPrice = validCloses[0];
        
        const change1m = ((currentPrice - monthAgoPrice) / monthAgoPrice) * 100;
        
        // Determinar impacto (algunos commodities afectan inversamente)
        let impact: 'positive' | 'negative' | 'neutral' = 'neutral';
        if (commodity.invertImpact) {
          // Subida de petróleo = negativo para retail
          if (change1m > 5) impact = 'negative';
          else if (change1m < -5) impact = 'positive';
        } else {
          // Subida = positivo (ej: petróleo para petroleras)
          if (change1m > 5) impact = 'positive';
          else if (change1m < -5) impact = 'negative';
        }
        
        results.push({
          symbol: commodity.symbol,
          name: commodity.name,
          change1m: Math.round(change1m * 100) / 100,
          impact,
          relevance: commodity.relevance,
        });
        
      } catch (error) {
        console.warn(`[Macro] Error obteniendo ${commodity.name}:`, error);
      }
    }
    
    return results;
  }
  
  /**
   * Obtiene el índice VIX (volatilidad del mercado)
   */
  private async getVIX(): Promise<MacroIndicators['volatilityIndex']> {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?range=1d&interval=1d`;
      const response = await fetchWithCorsProxy(url, { signal: AbortSignal.timeout(8000) });
      const data = await response.json();
      
      const result = data.chart?.result?.[0];
      if (!result) return null;
      
      const closes = result.indicators?.quote?.[0]?.close || [];
      const validCloses = closes.filter((c: number | null) => c !== null);
      
      if (validCloses.length === 0) return null;
      
      const value = validCloses[validCloses.length - 1];
      
      // Clasificar nivel de volatilidad
      let level: 'low' | 'medium' | 'high' | 'extreme' = 'medium';
      if (value < 15) level = 'low';
      else if (value < 20) level = 'medium';
      else if (value < 30) level = 'high';
      else level = 'extreme';
      
      return {
        value: Math.round(value * 100) / 100,
        level,
      };
    } catch (error) {
      console.warn(`[Macro] Error obteniendo VIX:`, error);
      return null;
    }
  }
  
  /**
   * Calcula el score macroeconómico general
   */
  private calculateMacroScore(
    regionalIndex: MacroIndicators['regionalIndex'],
    interestRate: MacroIndicators['interestRate'],
    commodities: MacroIndicators['commodities'],
    vix: MacroIndicators['volatilityIndex']
  ): { score: number; outlook: 'favorable' | 'neutral' | 'unfavorable' } {
    let score = 0;
    let factors = 0;
    
    // Índice regional (peso: 35%)
    if (regionalIndex) {
      let indexScore = 0;
      if (regionalIndex.trend === 'bullish') indexScore = 30;
      else if (regionalIndex.trend === 'bearish') indexScore = -30;
      
      // Ajustar por magnitud
      indexScore += Math.min(Math.max(regionalIndex.change1m * 2, -20), 20);
      
      score += indexScore * 0.35;
      factors++;
    }
    
    // Tipos de interés (peso: 25%)
    if (interestRate) {
      let rateScore = 0;
      if (interestRate.impact === 'positive') rateScore = 20;
      else if (interestRate.impact === 'negative') rateScore = -25;
      
      score += rateScore * 0.25;
      factors++;
    }
    
    // Commodities (peso: 25%)
    if (commodities.length > 0) {
      let commodityScore = 0;
      for (const c of commodities) {
        if (c.impact === 'positive') commodityScore += 15;
        else if (c.impact === 'negative') commodityScore -= 15;
      }
      commodityScore = commodityScore / commodities.length; // Promedio
      
      score += commodityScore * 0.25;
      factors++;
    }
    
    // VIX (peso: 15%)
    if (vix) {
      let vixScore = 0;
      if (vix.level === 'low') vixScore = 20;
      else if (vix.level === 'medium') vixScore = 5;
      else if (vix.level === 'high') vixScore = -15;
      else if (vix.level === 'extreme') vixScore = -30;
      
      score += vixScore * 0.15;
      factors++;
    }
    
    // Si no hay factores, retornar neutral
    if (factors === 0) {
      return { score: 0, outlook: 'neutral' };
    }
    
    // Normalizar score si no tenemos todos los factores
    score = score / (factors / 4);
    
    // Limitar a -100 a +100
    score = Math.max(-100, Math.min(100, Math.round(score)));
    
    // Determinar outlook
    let outlook: 'favorable' | 'neutral' | 'unfavorable' = 'neutral';
    if (score > 20) outlook = 'favorable';
    else if (score < -20) outlook = 'unfavorable';
    
    return { score, outlook };
  }
  
  /**
   * Genera un resumen textual
   */
  private generateSummary(
    region: string,
    score: number,
    outlook: string,
    commodities: MacroIndicators['commodities']
  ): string {
    const regionNames: Record<string, string> = {
      'europe': 'Europa',
      'usa': 'EEUU',
      'asia': 'Asia',
      'china': 'China',
      'uk': 'Reino Unido',
    };
    
    let summary = `📊 Entorno macro ${regionNames[region] || region}: `;
    
    if (outlook === 'favorable') {
      summary += 'condiciones favorables';
    } else if (outlook === 'unfavorable') {
      summary += 'condiciones desfavorables';
    } else {
      summary += 'condiciones mixtas';
    }
    
    // Añadir detalle de commodities más relevantes
    const significantCommodities = commodities.filter(c => c.impact !== 'neutral');
    if (significantCommodities.length > 0) {
      const details = significantCommodities.map(c => {
        const arrow = c.change1m > 0 ? '↑' : '↓';
        const impact = c.impact === 'positive' ? '(+)' : '(-)';
        return `${c.name} ${arrow}${Math.abs(c.change1m).toFixed(1)}% ${impact}`;
      });
      summary += '. ' + details.join(', ');
    }
    
    return summary;
  }
  
  /**
   * Indicadores para crypto (diferente a acciones)
   */
  private async getCryptoIndicators(symbol: string): Promise<MacroIndicators> {
    // Para crypto, usamos BTC como referencia macro del mercado
    try {
      const btcUrl = `https://query1.finance.yahoo.com/v8/finance/chart/BTC-USD?range=1mo&interval=1d`;
      const response = await fetchWithCorsProxy(btcUrl, { signal: AbortSignal.timeout(10000) });
      const data = await response.json();
      
      const result = data.chart?.result?.[0];
      if (!result) return this.createEmptyIndicators();
      
      const closes = result.indicators?.quote?.[0]?.close || [];
      const validCloses = closes.filter((c: number | null) => c !== null);
      
      if (validCloses.length < 2) return this.createEmptyIndicators();
      
      const currentPrice = validCloses[validCloses.length - 1];
      const monthAgoPrice = validCloses[0];
      const change1m = ((currentPrice - monthAgoPrice) / monthAgoPrice) * 100;
      
      // El estado de BTC indica el estado del mercado crypto
      let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
      if (change1m > 10) trend = 'bullish';
      else if (change1m < -10) trend = 'bearish';
      
      const score = Math.min(100, Math.max(-100, change1m * 2));
      
      return {
        region: 'global',
        country: 'CRYPTO',
        regionalIndex: {
          symbol: 'BTC-USD',
          name: 'Bitcoin (referencia)',
          change1d: 0,
          change1m: Math.round(change1m * 100) / 100,
          trend,
        },
        interestRate: null,
        commodities: [],
        volatilityIndex: null,
        macroScore: Math.round(score),
        macroOutlook: score > 20 ? 'favorable' : score < -20 ? 'unfavorable' : 'neutral',
        hasData: true,
        summary: `📊 Mercado crypto: ${trend === 'bullish' ? 'alcista' : trend === 'bearish' ? 'bajista' : 'lateral'} (BTC ${change1m > 0 ? '+' : ''}${change1m.toFixed(1)}% mensual)`,
      };
    } catch (error) {
      return this.createEmptyIndicators();
    }
  }
  
  /**
   * Crea indicadores vacíos
   */
  private createEmptyIndicators(): MacroIndicators {
    return {
      region: 'unknown',
      country: 'XX',
      regionalIndex: null,
      interestRate: null,
      commodities: [],
      volatilityIndex: null,
      macroScore: 0,
      macroOutlook: 'neutral',
      hasData: false,
      summary: '',
    };
  }
}

export const macroEconomicService = new MacroEconomicService();
