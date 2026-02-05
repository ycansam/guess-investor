/**
 * Market Breadth Service
 * Mide la salud general del mercado (% de acciones subiendo vs bajando)
 * 
 * Si el S&P 500 sube pero pocas acciones suben = divergencia peligrosa
 * Si el S&P 500 sube y muchas acciones suben = tendencia sana
 * 
 * Indicadores:
 * - Advance/Decline ratio
 * - % above 50-day MA
 * - % above 200-day MA
 * - New highs vs new lows
 * 
 * Usado por: Paul Tudor Jones, George Soros
 */

import { logger } from '../../middleware/logger.js';

export interface MarketBreadthData {
  // Principales
  advanceDeclineRatio: number;    // >1 = más subiendo, <1 = más bajando
  percentAdvancing: number;       // % de acciones subiendo hoy
  percentDeclining: number;       // % de acciones bajando hoy
  
  // Medias móviles (estimaciones basadas en ETFs)
  percentAbove50MA: number;       // % acciones arriba de su MA50
  percentAbove200MA: number;      // % acciones arriba de su MA200
  
  // Índice de referencia
  spyChange: number;              // Cambio % del S&P 500
  vixLevel: number;               // Nivel del VIX
  
  // Interpretación
  breadthSignal: 'strong_bullish' | 'bullish' | 'neutral' | 'bearish' | 'strong_bearish';
  marketHealth: 'excellent' | 'good' | 'fair' | 'weak' | 'critical';
  divergence: 'bullish_divergence' | 'bearish_divergence' | 'confirmed' | 'none';
  
  // Análisis
  summary: string;
  tradingImplication: string;
  
  // Meta
  hasData: boolean;
  timestamp: string;
}

// Cache
const cache: { data: MarketBreadthData | null; timestamp: number } = { data: null, timestamp: 0 };
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

export const marketBreadthService = {
  /**
   * Obtiene datos de market breadth
   */
  async getMarketBreadth(): Promise<MarketBreadthData> {
    // Check cache
    if (cache.data && Date.now() - cache.timestamp < CACHE_DURATION) {
      return cache.data;
    }

    try {
      // Obtener datos de varios ETFs/índices para estimar breadth
      const data = await this.calculateBreadth();
      
      cache.data = data;
      cache.timestamp = Date.now();
      
      logger.info(`[MarketBreadth] A/D: ${data.advanceDeclineRatio.toFixed(2)}, Health: ${data.marketHealth}, Signal: ${data.breadthSignal}`);
      
      return data;
    } catch (error) {
      logger.error(`[MarketBreadth] Error:`, error);
      return this.getDefaultData();
    }
  },

  /**
   * Calcula market breadth usando ETFs sectoriales
   */
  async calculateBreadth(): Promise<MarketBreadthData> {
    // ETFs sectoriales para estimar breadth
    const sectorETFs = [
      'XLK', // Technology
      'XLF', // Financials
      'XLV', // Healthcare
      'XLC', // Communications
      'XLY', // Consumer Discretionary
      'XLP', // Consumer Staples
      'XLE', // Energy
      'XLI', // Industrials
      'XLB', // Materials
      'XLU', // Utilities
      'XLRE', // Real Estate
    ];

    // Fetch SPY, VIX, y sectores
    const symbols = ['SPY', '^VIX', ...sectorETFs];
    const quotes = await this.fetchMultipleQuotes(symbols);

    // SPY y VIX
    const spyChange = quotes['SPY']?.changePercent || 0;
    const vixLevel = quotes['^VIX']?.price || 20;

    // Contar sectores subiendo/bajando
    let advancing = 0;
    let declining = 0;
    let unchanged = 0;

    sectorETFs.forEach(etf => {
      const change = quotes[etf]?.changePercent || 0;
      if (change > 0.1) advancing++;
      else if (change < -0.1) declining++;
      else unchanged++;
    });

    const total = sectorETFs.length;
    const percentAdvancing = (advancing / total) * 100;
    const percentDeclining = (declining / total) * 100;
    const advanceDeclineRatio = declining > 0 ? advancing / declining : advancing > 0 ? 10 : 1;

    // Estimar % above MAs basado en VIX y tendencia
    // En mercados reales, esto vendría de screeners
    const percentAbove50MA = this.estimatePercentAboveMA(spyChange, vixLevel, 50);
    const percentAbove200MA = this.estimatePercentAboveMA(spyChange, vixLevel, 200);

    // Determinar señales
    const breadthSignal = this.determineBreadthSignal(advanceDeclineRatio, percentAdvancing);
    const marketHealth = this.determineMarketHealth(percentAbove50MA, percentAbove200MA, vixLevel);
    const divergence = this.detectDivergence(spyChange, advanceDeclineRatio);

    // Generar análisis
    const { summary, tradingImplication } = this.analyze(
      breadthSignal,
      marketHealth,
      divergence,
      spyChange,
      percentAdvancing,
      vixLevel
    );

    return {
      advanceDeclineRatio,
      percentAdvancing,
      percentDeclining,
      percentAbove50MA,
      percentAbove200MA,
      spyChange,
      vixLevel,
      breadthSignal,
      marketHealth,
      divergence,
      summary,
      tradingImplication,
      hasData: true,
      timestamp: new Date().toISOString(),
    };
  },

  /**
   * Fetch múltiples cotizaciones
   */
  async fetchMultipleQuotes(symbols: string[]): Promise<Record<string, { price: number; changePercent: number } | null>> {
    const results: Record<string, { price: number; changePercent: number } | null> = {};

    // Fetch en paralelo
    await Promise.all(symbols.map(async (symbol) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
        const response = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
          const json = await response.json() as any;
          const meta = json.chart?.result?.[0]?.meta;
          if (meta) {
            const price = meta.regularMarketPrice || 0;
            const prevClose = meta.chartPreviousClose || meta.previousClose || price;
            const changePercent = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
            results[symbol] = { price, changePercent };
          }
        }
      } catch {
        results[symbol] = null;
      }
    }));

    return results;
  },

  /**
   * Estima % de acciones arriba de MA (simplificado)
   */
  estimatePercentAboveMA(spyChange: number, vix: number, maPeriod: number): number {
    // Estimación basada en condiciones de mercado
    // En producción, usarías un screener real
    
    let base = 50; // Neutral
    
    // Ajustar por VIX
    if (vix < 15) base += 15;
    else if (vix < 20) base += 5;
    else if (vix > 30) base -= 20;
    else if (vix > 25) base -= 10;
    
    // Ajustar por cambio reciente del SPY
    base += spyChange * 5;
    
    // MA200 suele ser más estable que MA50
    if (maPeriod === 200) {
      base = base * 0.9 + 5; // Menos extremo
    }
    
    return Math.max(10, Math.min(90, base));
  },

  /**
   * Determina señal de breadth
   */
  determineBreadthSignal(adRatio: number, percentAdvancing: number): MarketBreadthData['breadthSignal'] {
    if (adRatio > 3 || percentAdvancing > 80) return 'strong_bullish';
    if (adRatio > 1.5 || percentAdvancing > 60) return 'bullish';
    if (adRatio < 0.33 || percentAdvancing < 20) return 'strong_bearish';
    if (adRatio < 0.67 || percentAdvancing < 40) return 'bearish';
    return 'neutral';
  },

  /**
   * Determina salud del mercado
   */
  determineMarketHealth(above50MA: number, above200MA: number, vix: number): MarketBreadthData['marketHealth'] {
    const score = (above50MA + above200MA) / 2 - (vix - 15);
    
    if (score > 70) return 'excellent';
    if (score > 55) return 'good';
    if (score > 40) return 'fair';
    if (score > 25) return 'weak';
    return 'critical';
  },

  /**
   * Detecta divergencias entre índice y breadth
   */
  detectDivergence(spyChange: number, adRatio: number): MarketBreadthData['divergence'] {
    // SPY sube pero pocos sectores suben = bearish divergence
    if (spyChange > 0.5 && adRatio < 0.8) return 'bearish_divergence';
    
    // SPY baja pero muchos sectores suben = bullish divergence
    if (spyChange < -0.5 && adRatio > 1.2) return 'bullish_divergence';
    
    // Confirmado si están alineados
    if ((spyChange > 0.3 && adRatio > 1.2) || (spyChange < -0.3 && adRatio < 0.8)) {
      return 'confirmed';
    }
    
    return 'none';
  },

  /**
   * Genera análisis
   */
  analyze(
    signal: MarketBreadthData['breadthSignal'],
    health: MarketBreadthData['marketHealth'],
    divergence: MarketBreadthData['divergence'],
    spyChange: number,
    percentAdvancing: number,
    vix: number
  ): { summary: string; tradingImplication: string } {
    let summary = '';
    let tradingImplication = '';

    // Summary
    const healthEmoji = {
      excellent: '💪',
      good: '✅',
      fair: '➖',
      weak: '⚠️',
      critical: '🔴',
    }[health];

    summary = `${healthEmoji} Salud del mercado: ${health.toUpperCase()}. `;
    summary += `${percentAdvancing.toFixed(0)}% de sectores subiendo. `;
    summary += `VIX: ${vix.toFixed(1)}.`;

    // Divergencias
    if (divergence === 'bearish_divergence') {
      summary = `⚠️ DIVERGENCIA BAJISTA: S&P sube pero breadth débil. Precaución.`;
      tradingImplication = 'Rally estrecho, sostenido por pocas acciones. Riesgo de reversión.';
    } else if (divergence === 'bullish_divergence') {
      summary = `🟢 DIVERGENCIA ALCISTA: S&P baja pero breadth fuerte. Posible rebote.`;
      tradingImplication = 'Fortaleza subyacente. El índice podría recuperarse.';
    } else if (signal === 'strong_bullish') {
      tradingImplication = 'Participación amplia en el rally. Tendencia saludable.';
    } else if (signal === 'strong_bearish') {
      tradingImplication = 'Venta generalizada. Evitar ir contra la tendencia.';
    } else {
      tradingImplication = 'Mercado mixto. Selectividad es clave.';
    }

    return { summary, tradingImplication };
  },

  /**
   * Datos por defecto
   */
  getDefaultData(): MarketBreadthData {
    return {
      advanceDeclineRatio: 1,
      percentAdvancing: 50,
      percentDeclining: 50,
      percentAbove50MA: 50,
      percentAbove200MA: 50,
      spyChange: 0,
      vixLevel: 20,
      breadthSignal: 'neutral',
      marketHealth: 'fair',
      divergence: 'none',
      summary: 'Sin datos de market breadth disponibles.',
      tradingImplication: '',
      hasData: false,
      timestamp: new Date().toISOString(),
    };
  },
};
