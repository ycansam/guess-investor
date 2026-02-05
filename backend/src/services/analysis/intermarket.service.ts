/**
 * Intermarket Analysis Service
 * Analiza correlaciones entre mercados
 * 
 * Relaciones clave:
 * - Acciones vs Bonos (inversa normalmente)
 * - Dólar vs Commodities (inversa)
 * - VIX vs S&P 500 (inversa)
 * - Oro vs Dólar (inversa)
 * - Petróleo vs Energéticas (directa)
 * 
 * Detecta:
 * - Correlaciones rotas (oportunidades)
 * - Risk-on vs Risk-off
 * - Rotación sectorial
 * 
 * Usado por: Paul Tudor Jones, George Soros
 */

import { logger } from '../../middleware/logger.js';

export interface IntermarketData {
  // Correlaciones actuales
  correlations: Array<{
    pair: string;
    asset1: string;
    asset2: string;
    correlation: number;           // -1 a 1
    normalCorrelation: number;     // Lo esperado
    deviation: number;             // Diferencia
    status: 'normal' | 'diverging' | 'broken';
    implication: string;
  }>;
  
  // Régimen de mercado
  marketRegime: 'risk_on' | 'risk_off' | 'mixed';
  regimeStrength: number;          // 0-100
  regimeIndicators: string[];
  
  // Flujos
  flowDirection: 'into_equities' | 'into_bonds' | 'into_cash' | 'into_commodities' | 'mixed';
  
  // Señales
  signals: Array<{
    type: 'opportunity' | 'warning' | 'confirmation';
    description: string;
    confidence: number;
  }>;
  
  // Resumen
  summary: string;
  tradingImplication: string;
  
  // Meta
  hasData: boolean;
  timestamp: string;
}

// Definición de relaciones intermarket
const INTERMARKET_PAIRS = [
  { asset1: 'SPY', asset2: 'TLT', name: 'Acciones vs Bonos', normalCorr: -0.3 },
  { asset1: 'SPY', asset2: 'VXX', name: 'S&P vs VIX', normalCorr: -0.8 },
  { asset1: 'UUP', asset2: 'GLD', name: 'Dólar vs Oro', normalCorr: -0.4 },
  { asset1: 'UUP', asset2: 'USO', name: 'Dólar vs Petróleo', normalCorr: -0.3 },
  { asset1: 'SPY', asset2: 'EEM', name: 'US vs Emergentes', normalCorr: 0.7 },
  { asset1: 'XLF', asset2: 'TLT', name: 'Financieras vs Bonos', normalCorr: -0.5 },
  { asset1: 'XLE', asset2: 'USO', name: 'Energéticas vs Petróleo', normalCorr: 0.8 },
  { asset1: 'GLD', asset2: 'TLT', name: 'Oro vs Bonos', normalCorr: 0.3 },
];

// ETFs para detectar régimen
const RISK_ASSETS = ['SPY', 'QQQ', 'IWM', 'EEM', 'HYG']; // Risk-on
const SAFE_ASSETS = ['TLT', 'GLD', 'UUP', 'VXX'];        // Risk-off

// Cache
const cache = new Map<string, { data: IntermarketData; timestamp: number }>();
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutos

export const intermarketService = {
  /**
   * Obtiene análisis intermarket
   */
  async getIntermarketAnalysis(): Promise<IntermarketData> {
    const cacheKey = 'intermarket';
    
    // Check cache
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }

    try {
      const data = await this.analyzeIntermarket();
      
      if (data.hasData) {
        cache.set(cacheKey, { data, timestamp: Date.now() });
        logger.info(`[Intermarket] Regime: ${data.marketRegime}, Flow: ${data.flowDirection}`);
      }
      
      return data;
    } catch (error) {
      logger.error(`[Intermarket] Error:`, error);
      return this.getDefaultData();
    }
  },

  /**
   * Analiza las relaciones intermarket
   */
  async analyzeIntermarket(): Promise<IntermarketData> {
    try {
      // Obtener datos de todos los activos necesarios
      const allAssets = new Set<string>();
      for (const pair of INTERMARKET_PAIRS) {
        allAssets.add(pair.asset1);
        allAssets.add(pair.asset2);
      }
      for (const asset of [...RISK_ASSETS, ...SAFE_ASSETS]) {
        allAssets.add(asset);
      }

      // Fetch all prices in parallel
      const pricePromises = Array.from(allAssets).map(async (symbol) => {
        const prices = await this.fetchPrices(symbol, '20d');
        return { symbol, prices };
      });

      const priceResults = await Promise.all(pricePromises);
      const priceMap = new Map<string, number[]>();
      const currentPrices = new Map<string, number>();
      const returns = new Map<string, number[]>();

      for (const { symbol, prices } of priceResults) {
        if (prices && prices.length > 5) {
          priceMap.set(symbol, prices);
          currentPrices.set(symbol, prices[prices.length - 1]);
          
          // Calcular returns diarios
          const dailyReturns: number[] = [];
          for (let i = 1; i < prices.length; i++) {
            dailyReturns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
          }
          returns.set(symbol, dailyReturns);
        }
      }

      if (returns.size < 5) {
        return this.getDefaultData();
      }

      // Calcular correlaciones
      const correlations: IntermarketData['correlations'] = [];
      
      for (const pair of INTERMARKET_PAIRS) {
        const returns1 = returns.get(pair.asset1);
        const returns2 = returns.get(pair.asset2);
        
        if (returns1 && returns2) {
          const corr = this.calculateCorrelation(returns1, returns2);
          const deviation = Math.abs(corr - pair.normalCorr);
          
          let status: 'normal' | 'diverging' | 'broken' = 'normal';
          if (deviation > 0.5) {
            status = 'broken';
          } else if (deviation > 0.25) {
            status = 'diverging';
          }

          const implication = this.interpretCorrelation(pair.name, corr, pair.normalCorr, status);

          correlations.push({
            pair: pair.name,
            asset1: pair.asset1,
            asset2: pair.asset2,
            correlation: corr,
            normalCorrelation: pair.normalCorr,
            deviation,
            status,
            implication,
          });
        }
      }

      // Determinar régimen de mercado
      const { marketRegime, regimeStrength, regimeIndicators } = this.detectRegime(returns, currentPrices);

      // Determinar flujos
      const flowDirection = this.detectFlows(returns, currentPrices);

      // Generar señales
      const signals = this.generateSignals(correlations, marketRegime, flowDirection);

      // Generar resumen
      const { summary, tradingImplication } = this.generateSummary(
        correlations, marketRegime, flowDirection, signals
      );

      return {
        correlations,
        marketRegime,
        regimeStrength,
        regimeIndicators,
        flowDirection,
        signals,
        summary,
        tradingImplication,
        hasData: true,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.debug(`[Intermarket] Analysis failed:`, error);
      return this.getDefaultData();
    }
  },

  /**
   * Fetch precios históricos de Yahoo
   */
  async fetchPrices(symbol: string, range: string = '20d'): Promise<number[] | null> {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=${range}`;
      
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) return null;

      const json = await response.json() as any;
      const closes = json.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
      
      if (!closes) return null;
      
      return closes.filter((c: any) => c != null);
    } catch {
      return null;
    }
  },

  /**
   * Calcula correlación de Pearson
   */
  calculateCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n < 5) return 0;

    const x2 = x.slice(-n);
    const y2 = y.slice(-n);

    const meanX = x2.reduce((a, b) => a + b, 0) / n;
    const meanY = y2.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denomX = 0;
    let denomY = 0;

    for (let i = 0; i < n; i++) {
      const dx = x2[i] - meanX;
      const dy = y2[i] - meanY;
      numerator += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }

    const denominator = Math.sqrt(denomX * denomY);
    return denominator === 0 ? 0 : numerator / denominator;
  },

  /**
   * Interpreta una correlación
   */
  interpretCorrelation(pairName: string, current: number, normal: number, status: string): string {
    if (status === 'broken') {
      if (current > normal + 0.3) {
        return `⚠️ Correlación ANORMALMENTE ALTA - Posible oportunidad de reversión`;
      } else {
        return `⚠️ Correlación ROTA - Mercados desacoplados, precaución`;
      }
    } else if (status === 'diverging') {
      return `📊 Correlación divergiendo de lo normal - Monitorear`;
    }
    return `✓ Correlación normal`;
  },

  /**
   * Detecta el régimen de mercado (risk-on vs risk-off)
   */
  detectRegime(returns: Map<string, number[]>, currentPrices: Map<string, number>): {
    marketRegime: IntermarketData['marketRegime'];
    regimeStrength: number;
    regimeIndicators: string[];
  } {
    let riskOnScore = 0;
    let riskOffScore = 0;
    const indicators: string[] = [];

    // Analizar performance reciente de risk assets
    for (const asset of RISK_ASSETS) {
      const rets = returns.get(asset);
      if (rets && rets.length > 0) {
        const recent = rets.slice(-5).reduce((a, b) => a + b, 0);
        if (recent > 0.01) {
          riskOnScore += 2;
          indicators.push(`${asset} subiendo`);
        } else if (recent > 0) {
          riskOnScore += 1;
        } else if (recent < -0.01) {
          riskOffScore += 2;
        } else {
          riskOffScore += 1;
        }
      }
    }

    // Analizar safe havens
    for (const asset of SAFE_ASSETS) {
      const rets = returns.get(asset);
      if (rets && rets.length > 0) {
        const recent = rets.slice(-5).reduce((a, b) => a + b, 0);
        if (recent > 0.01) {
          riskOffScore += 2;
          if (asset === 'VXX') indicators.push('VIX subiendo ⚠️');
          else if (asset === 'TLT') indicators.push('Bonos subiendo (flight to safety)');
          else if (asset === 'GLD') indicators.push('Oro subiendo');
        } else if (recent > 0) {
          riskOffScore += 1;
        } else if (recent < -0.01) {
          riskOnScore += 2;
        }
      }
    }

    const totalScore = riskOnScore + riskOffScore;
    let marketRegime: IntermarketData['marketRegime'] = 'mixed';
    let regimeStrength = 50;

    if (totalScore > 0) {
      const riskOnRatio = riskOnScore / totalScore;
      if (riskOnRatio > 0.65) {
        marketRegime = 'risk_on';
        regimeStrength = Math.round(riskOnRatio * 100);
        indicators.unshift('🟢 RISK-ON');
      } else if (riskOnRatio < 0.35) {
        marketRegime = 'risk_off';
        regimeStrength = Math.round((1 - riskOnRatio) * 100);
        indicators.unshift('🔴 RISK-OFF');
      } else {
        indicators.unshift('🟡 MIXTO');
      }
    }

    return { marketRegime, regimeStrength, regimeIndicators: indicators };
  },

  /**
   * Detecta hacia dónde fluye el dinero
   */
  detectFlows(returns: Map<string, number[]>, currentPrices: Map<string, number>): IntermarketData['flowDirection'] {
    const spyRet = returns.get('SPY')?.slice(-5).reduce((a, b) => a + b, 0) || 0;
    const tltRet = returns.get('TLT')?.slice(-5).reduce((a, b) => a + b, 0) || 0;
    const gldRet = returns.get('GLD')?.slice(-5).reduce((a, b) => a + b, 0) || 0;
    const uupRet = returns.get('UUP')?.slice(-5).reduce((a, b) => a + b, 0) || 0;

    // Determinar el flujo dominante
    const flows = [
      { type: 'into_equities' as const, score: spyRet * 100 },
      { type: 'into_bonds' as const, score: tltRet * 100 },
      { type: 'into_commodities' as const, score: gldRet * 100 },
      { type: 'into_cash' as const, score: uupRet * 100 },
    ];

    flows.sort((a, b) => b.score - a.score);
    
    if (flows[0].score > 1 && flows[0].score > flows[1].score + 0.5) {
      return flows[0].type;
    }
    
    return 'mixed';
  },

  /**
   * Genera señales de trading
   */
  generateSignals(
    correlations: IntermarketData['correlations'],
    regime: IntermarketData['marketRegime'],
    flow: IntermarketData['flowDirection']
  ): IntermarketData['signals'] {
    const signals: IntermarketData['signals'] = [];

    // Señales de correlaciones rotas
    for (const corr of correlations) {
      if (corr.status === 'broken') {
        signals.push({
          type: 'opportunity',
          description: `${corr.pair}: Correlación rota - posible oportunidad de mean reversion`,
          confidence: 70,
        });
      }
    }

    // Señales de régimen
    if (regime === 'risk_on') {
      signals.push({
        type: 'confirmation',
        description: 'Régimen RISK-ON: Favorable para acciones y activos de riesgo',
        confidence: 75,
      });
    } else if (regime === 'risk_off') {
      signals.push({
        type: 'warning',
        description: 'Régimen RISK-OFF: Cautela con acciones, favorecer bonos/oro',
        confidence: 75,
      });
    }

    // Señales de flujo
    if (flow === 'into_bonds' && regime === 'risk_off') {
      signals.push({
        type: 'warning',
        description: 'Flight to safety activo - dinero saliendo de riesgo',
        confidence: 80,
      });
    } else if (flow === 'into_equities' && regime === 'risk_on') {
      signals.push({
        type: 'confirmation',
        description: 'Flujos entrando a renta variable - momentum favorable',
        confidence: 80,
      });
    }

    return signals;
  },

  /**
   * Genera resumen
   */
  generateSummary(
    correlations: IntermarketData['correlations'],
    regime: IntermarketData['marketRegime'],
    flow: IntermarketData['flowDirection'],
    signals: IntermarketData['signals']
  ): { summary: string; tradingImplication: string } {
    let summary = '📊 **Análisis Intermarket**\n\n';

    // Régimen
    if (regime === 'risk_on') {
      summary += '🟢 **Régimen: RISK-ON**\n';
      summary += 'Los mercados favorecen activos de riesgo (acciones, emergentes, high yield).\n\n';
    } else if (regime === 'risk_off') {
      summary += '🔴 **Régimen: RISK-OFF**\n';
      summary += 'Los mercados buscan seguridad (bonos, oro, dólar, cash).\n\n';
    } else {
      summary += '🟡 **Régimen: MIXTO**\n';
      summary += 'Sin dirección clara. Señales contradictorias entre mercados.\n\n';
    }

    // Flujos
    const flowText = {
      into_equities: 'hacia acciones',
      into_bonds: 'hacia bonos (flight to safety)',
      into_commodities: 'hacia commodities',
      into_cash: 'hacia cash (aversión al riesgo)',
      mixed: 'mixtos',
    };
    summary += `💰 **Flujos:** ${flowText[flow]}\n\n`;

    // Correlaciones importantes
    const broken = correlations.filter(c => c.status === 'broken');
    if (broken.length > 0) {
      summary += '⚠️ **Correlaciones Rotas:**\n';
      for (const c of broken) {
        summary += `• ${c.pair}: ${c.correlation.toFixed(2)} (normal: ${c.normalCorrelation.toFixed(2)})\n`;
      }
    }

    // Trading implication
    let tradingImplication = '';
    
    if (regime === 'risk_on') {
      tradingImplication = '🟢 Entorno favorable para LONG en acciones. ';
      if (flow === 'into_equities') {
        tradingImplication += 'Flujos confirman - alta convicción.';
      }
    } else if (regime === 'risk_off') {
      tradingImplication = '🔴 Precaución con LONG en acciones. Considerar reducir exposición o cubrir. ';
      if (flow === 'into_bonds') {
        tradingImplication += 'Flight to safety activo.';
      }
    } else {
      tradingImplication = '🟡 Sin señal direccional clara del intermarket. Usar otros indicadores.';
    }

    if (broken.length > 0) {
      tradingImplication += ` ⚠️ ${broken.length} correlación(es) rota(s) - posibles oportunidades de arbitraje.`;
    }

    return { summary, tradingImplication };
  },

  /**
   * Datos por defecto
   */
  getDefaultData(): IntermarketData {
    return {
      correlations: [],
      marketRegime: 'mixed',
      regimeStrength: 50,
      regimeIndicators: [],
      flowDirection: 'mixed',
      signals: [],
      summary: 'ℹ️ Análisis intermarket no disponible.',
      tradingImplication: '',
      hasData: false,
      timestamp: new Date().toISOString(),
    };
  },
};
