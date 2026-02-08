/**
 * Sector Rotation Service
 * Detecta flujos de capital entre sectores del mercado
 * 
 * Indicadores de rotación:
 * - Risk-On: Tech, Consumer Discretionary, Small Caps → Apetito por riesgo
 * - Risk-Off: Utilities, Consumer Staples, Healthcare → Aversión al riesgo
 * - Defensivo: Bonds, Gold → Huida a seguridad
 * 
 * Útil para:
 * - Confirmar tendencias de mercado
 * - Identificar cambios de régimen
 * - Ajustar pesos de sectores en predicciones
 */

import { logger } from '../../middleware/logger.js';

export interface SectorData {
  symbol: string;
  name: string;
  etf: string;
  change1d: number;
  change5d: number;
  change1m: number;
  volume: number;
  avgVolume: number;
  volumeRatio: number;
  relativeStrength: number;  // vs SPY
  momentum: 'strong_up' | 'up' | 'flat' | 'down' | 'strong_down';
}

export interface RotationAnalysis {
  // Estado actual del mercado
  marketRegime: 'risk_on' | 'risk_off' | 'mixed' | 'transitioning';
  regimeStrength: number;
  regimeConfidence: number;
  
  // Flujos de capital
  moneyFlow: {
    intoRiskOn: number;    // -100 a +100
    intoDefensive: number;  // -100 a +100
    intoGrowth: number;     // -100 a +100
    intoValue: number;      // -100 a +100
  };
  
  // Sectores por rendimiento
  topSectors: SectorData[];
  bottomSectors: SectorData[];
  
  // Análisis detallado por sector
  sectors: Record<string, SectorData>;
  
  // Señales de rotación
  rotationSignals: RotationSignal[];
  
  // Impacto en predicción
  predictionImpact: {
    bullishBias: number;     // -50 a +50
    sectorBias: Record<string, number>;
    riskLevel: 'low' | 'medium' | 'high';
  };
  
  // Meta
  lastUpdate: Date;
  dataQuality: 'high' | 'medium' | 'low';
}

export interface RotationSignal {
  type: 'rotation_in' | 'rotation_out' | 'divergence' | 'breakout';
  fromSector?: string;
  toSector?: string;
  strength: number;
  description: string;
  timestamp: Date;
}

// Definición de sectores y sus ETFs representativos
const SECTORS = {
  // Risk-On (Crecimiento/Riesgo)
  XLK: { name: 'Technology', category: 'risk_on', weight: 0.15 },
  XLY: { name: 'Consumer Discretionary', category: 'risk_on', weight: 0.10 },
  XLC: { name: 'Communication Services', category: 'risk_on', weight: 0.08 },
  IWM: { name: 'Small Caps', category: 'risk_on', weight: 0.08 },
  
  // Risk-Off (Defensivo)
  XLU: { name: 'Utilities', category: 'risk_off', weight: 0.08 },
  XLP: { name: 'Consumer Staples', category: 'risk_off', weight: 0.08 },
  XLV: { name: 'Healthcare', category: 'risk_off', weight: 0.10 },
  
  // Cíclicos
  XLF: { name: 'Financials', category: 'cyclical', weight: 0.10 },
  XLI: { name: 'Industrials', category: 'cyclical', weight: 0.08 },
  XLB: { name: 'Materials', category: 'cyclical', weight: 0.05 },
  
  // Energía
  XLE: { name: 'Energy', category: 'energy', weight: 0.05 },
  
  // Real Estate
  XLRE: { name: 'Real Estate', category: 'real_estate', weight: 0.05 },
  
  // Safe Havens
  GLD: { name: 'Gold', category: 'safe_haven', weight: 0.05 },
  TLT: { name: 'Long-Term Bonds', category: 'safe_haven', weight: 0.05 },
};

// Benchmark
const BENCHMARK = 'SPY';

// Cache
const cache = new Map<string, { data: RotationAnalysis; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

export const sectorRotationService = {
  /**
   * Obtiene análisis completo de rotación sectorial
   */
  async getRotationAnalysis(): Promise<RotationAnalysis> {
    const cacheKey = 'sector_rotation';
    const cached = cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }

    try {
      // 1. Obtener datos de todos los sectores y benchmark
      const sectorSymbols = [...Object.keys(SECTORS), BENCHMARK];
      const sectorDataMap = await this.fetchSectorData(sectorSymbols);
      
      // 2. Calcular métricas relativas
      const benchmarkData = sectorDataMap.get(BENCHMARK);
      const sectors: Record<string, SectorData> = {};
      
      for (const [symbol, def] of Object.entries(SECTORS)) {
        const data = sectorDataMap.get(symbol);
        if (data) {
          const relativeStrength = benchmarkData 
            ? data.change5d - benchmarkData.change5d 
            : 0;
          
          sectors[symbol] = {
            symbol,
            name: def.name,
            etf: symbol,
            ...data,
            relativeStrength,
            momentum: this.classifyMomentum(data.change5d),
          };
        }
      }
      
      // 3. Ordenar por rendimiento
      const sortedSectors = Object.values(sectors).sort((a, b) => b.change5d - a.change5d);
      const topSectors = sortedSectors.slice(0, 3);
      const bottomSectors = sortedSectors.slice(-3).reverse();
      
      // 4. Calcular flujos de capital
      const moneyFlow = this.calculateMoneyFlow(sectors);
      
      // 5. Determinar régimen de mercado
      const { regime, strength, confidence } = this.determineMarketRegime(sectors, moneyFlow);
      
      // 6. Detectar señales de rotación
      const rotationSignals = this.detectRotationSignals(sectors, topSectors, bottomSectors);
      
      // 7. Calcular impacto en predicciones
      const predictionImpact = this.calculatePredictionImpact(regime, moneyFlow, sectors);
      
      const analysis: RotationAnalysis = {
        marketRegime: regime,
        regimeStrength: strength,
        regimeConfidence: confidence,
        moneyFlow,
        topSectors,
        bottomSectors,
        sectors,
        rotationSignals,
        predictionImpact,
        lastUpdate: new Date(),
        dataQuality: Object.keys(sectors).length >= 10 ? 'high' : 'medium',
      };
      
      cache.set(cacheKey, { data: analysis, timestamp: Date.now() });
      
      logger.info(`[SectorRotation] Regime: ${regime} (${strength.toFixed(0)}%), Top: ${topSectors.map(s => s.symbol).join(', ')}`);
      
      return analysis;
    } catch (error) {
      logger.error(`[SectorRotation] Error:`, error);
      return this.getDefaultAnalysis();
    }
  },

  /**
   * Obtiene datos de múltiples símbolos
   */
  async fetchSectorData(symbols: string[]): Promise<Map<string, {
    change1d: number;
    change5d: number;
    change1m: number;
    volume: number;
    avgVolume: number;
    volumeRatio: number;
  }>> {
    const results = new Map();
    
    // Hacer requests en paralelo (batches de 5)
    const batchSize = 5;
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const promises = batch.map(symbol => this.fetchSingleSymbol(symbol));
      const batchResults = await Promise.all(promises);
      
      batch.forEach((symbol, idx) => {
        if (batchResults[idx]) {
          results.set(symbol, batchResults[idx]);
        }
      });
    }
    
    return results;
  },

  /**
   * Obtiene datos de un símbolo
   */
  async fetchSingleSymbol(symbol: string): Promise<{
    change1d: number;
    change5d: number;
    change1m: number;
    volume: number;
    avgVolume: number;
    volumeRatio: number;
  } | null> {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1mo`;
      
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) return null;

      const json = await response.json() as any;
      const result = json.chart?.result?.[0];
      
      if (!result?.indicators?.quote?.[0]) return null;

      const closes = result.indicators.quote[0].close?.filter((c: number) => c) || [];
      const volumes = result.indicators.quote[0].volume?.filter((v: number) => v) || [];
      
      if (closes.length < 5) return null;

      const current = closes[closes.length - 1];
      const prev1d = closes[closes.length - 2] || current;
      const prev5d = closes[Math.max(0, closes.length - 6)] || current;
      const prev1m = closes[0];
      
      const change1d = ((current - prev1d) / prev1d) * 100;
      const change5d = ((current - prev5d) / prev5d) * 100;
      const change1m = ((current - prev1m) / prev1m) * 100;
      
      const volume = volumes[volumes.length - 1] || 0;
      const avgVolume = volumes.length > 0 
        ? volumes.reduce((a: number, b: number) => a + b, 0) / volumes.length 
        : 0;
      const volumeRatio = avgVolume > 0 ? volume / avgVolume : 1;
      
      return { change1d, change5d, change1m, volume, avgVolume, volumeRatio };
    } catch (error) {
      logger.debug(`[SectorRotation] Error fetching ${symbol}:`, error);
      return null;
    }
  },

  /**
   * Clasifica momentum
   */
  classifyMomentum(change: number): SectorData['momentum'] {
    if (change > 3) return 'strong_up';
    if (change > 1) return 'up';
    if (change < -3) return 'strong_down';
    if (change < -1) return 'down';
    return 'flat';
  },

  /**
   * Calcula flujos de capital entre categorías
   */
  calculateMoneyFlow(sectors: Record<string, SectorData>): RotationAnalysis['moneyFlow'] {
    // Risk-On: Tech, Consumer Discretionary, Comm Services, Small Caps
    const riskOnSymbols = ['XLK', 'XLY', 'XLC', 'IWM'];
    const riskOnAvg = this.calculateCategoryAverage(sectors, riskOnSymbols);
    
    // Defensive: Utilities, Staples, Healthcare
    const defensiveSymbols = ['XLU', 'XLP', 'XLV'];
    const defensiveAvg = this.calculateCategoryAverage(sectors, defensiveSymbols);
    
    // Growth vs Value proxy
    const growthSymbols = ['XLK', 'XLC', 'XLY'];
    const valueSymbols = ['XLF', 'XLE', 'XLV'];
    const growthAvg = this.calculateCategoryAverage(sectors, growthSymbols);
    const valueAvg = this.calculateCategoryAverage(sectors, valueSymbols);
    
    // Normalizar a -100 a +100
    const normalize = (val: number) => Math.max(-100, Math.min(100, val * 10));
    
    return {
      intoRiskOn: normalize(riskOnAvg - defensiveAvg),
      intoDefensive: normalize(defensiveAvg - riskOnAvg),
      intoGrowth: normalize(growthAvg - valueAvg),
      intoValue: normalize(valueAvg - growthAvg),
    };
  },

  /**
   * Calcula promedio de una categoría
   */
  calculateCategoryAverage(sectors: Record<string, SectorData>, symbols: string[]): number {
    const validSectors = symbols
      .map(s => sectors[s])
      .filter(s => s);
    
    if (validSectors.length === 0) return 0;
    
    return validSectors.reduce((sum, s) => sum + s.change5d, 0) / validSectors.length;
  },

  /**
   * Determina el régimen de mercado
   */
  determineMarketRegime(
    sectors: Record<string, SectorData>,
    moneyFlow: RotationAnalysis['moneyFlow']
  ): { regime: RotationAnalysis['marketRegime']; strength: number; confidence: number } {
    const { intoRiskOn, intoDefensive } = moneyFlow;
    
    // Calcular spread entre risk-on y defensive
    const spread = intoRiskOn - intoDefensive;
    
    let regime: RotationAnalysis['marketRegime'];
    let strength: number;
    
    if (spread > 30) {
      regime = 'risk_on';
      strength = Math.min(100, spread);
    } else if (spread < -30) {
      regime = 'risk_off';
      strength = Math.min(100, Math.abs(spread));
    } else if (Math.abs(spread) < 10) {
      regime = 'mixed';
      strength = 50;
    } else {
      regime = 'transitioning';
      strength = 50 + Math.abs(spread);
    }
    
    // Confianza basada en consistencia de sectores
    const sectorValues = Object.values(sectors);
    const positiveCount = sectorValues.filter(s => s.change5d > 0).length;
    const consistency = Math.abs(positiveCount / sectorValues.length - 0.5) * 2;
    const confidence = 40 + consistency * 40 + Math.abs(spread) * 0.2;
    
    return { regime, strength, confidence: Math.min(95, confidence) };
  },

  /**
   * Detecta señales de rotación
   */
  detectRotationSignals(
    sectors: Record<string, SectorData>,
    topSectors: SectorData[],
    bottomSectors: SectorData[]
  ): RotationSignal[] {
    const signals: RotationSignal[] = [];
    
    // 1. Rotación fuerte hacia un sector
    for (const sector of topSectors) {
      if (sector.change5d > 5 && sector.volumeRatio > 1.5) {
        signals.push({
          type: 'rotation_in',
          toSector: sector.symbol,
          strength: Math.min(100, sector.change5d * 10),
          description: `Fuerte flujo hacia ${sector.name} (+${sector.change5d.toFixed(1)}% con volumen ${sector.volumeRatio.toFixed(1)}x)`,
          timestamp: new Date(),
        });
      }
    }
    
    // 2. Rotación fuerte desde un sector
    for (const sector of bottomSectors) {
      if (sector.change5d < -5 && sector.volumeRatio > 1.5) {
        signals.push({
          type: 'rotation_out',
          fromSector: sector.symbol,
          strength: Math.min(100, Math.abs(sector.change5d) * 10),
          description: `Salida de ${sector.name} (${sector.change5d.toFixed(1)}% con volumen ${sector.volumeRatio.toFixed(1)}x)`,
          timestamp: new Date(),
        });
      }
    }
    
    // 3. Divergencia entre sectores correlacionados
    const techXlk = sectors['XLK'];
    const commXlc = sectors['XLC'];
    if (techXlk && commXlc) {
      const divergence = Math.abs(techXlk.change5d - commXlc.change5d);
      if (divergence > 4) {
        signals.push({
          type: 'divergence',
          description: `Divergencia Tech vs Comm Services: ${divergence.toFixed(1)}%`,
          strength: divergence * 10,
          timestamp: new Date(),
        });
      }
    }
    
    // 4. Breakout: Sector superando significativamente al benchmark
    for (const sector of Object.values(sectors)) {
      if (sector.relativeStrength > 3) {
        signals.push({
          type: 'breakout',
          toSector: sector.symbol,
          strength: sector.relativeStrength * 15,
          description: `${sector.name} superando al mercado por ${sector.relativeStrength.toFixed(1)}%`,
          timestamp: new Date(),
        });
      }
    }
    
    return signals.sort((a, b) => b.strength - a.strength).slice(0, 5);
  },

  /**
   * Calcula impacto en predicciones
   */
  calculatePredictionImpact(
    regime: RotationAnalysis['marketRegime'],
    moneyFlow: RotationAnalysis['moneyFlow'],
    sectors: Record<string, SectorData>
  ): RotationAnalysis['predictionImpact'] {
    // Bullish bias basado en régimen
    let bullishBias = 0;
    switch (regime) {
      case 'risk_on':
        bullishBias = 20 + moneyFlow.intoRiskOn * 0.2;
        break;
      case 'risk_off':
        bullishBias = -15 + moneyFlow.intoDefensive * -0.1;
        break;
      case 'transitioning':
        bullishBias = moneyFlow.intoRiskOn * 0.1;
        break;
      default:
        bullishBias = 0;
    }
    
    // Sector bias
    const sectorBias: Record<string, number> = {};
    for (const [symbol, data] of Object.entries(sectors)) {
      // Sesgo positivo si el sector está outperforming
      sectorBias[symbol] = data.relativeStrength * 2;
    }
    
    // Risk level
    const volatility = Object.values(sectors)
      .map(s => Math.abs(s.change5d))
      .reduce((a, b) => a + b, 0) / Object.values(sectors).length;
    
    const riskLevel = volatility > 5 ? 'high' : volatility > 2 ? 'medium' : 'low';
    
    return {
      bullishBias: Math.max(-50, Math.min(50, bullishBias)),
      sectorBias,
      riskLevel,
    };
  },

  /**
   * Obtiene el sector de un símbolo específico
   */
  async getSymbolSector(symbol: string): Promise<string | null> {
    // Mapeo básico de grandes empresas a sectores
    const sectorMap: Record<string, string> = {
      // Technology
      'AAPL': 'XLK', 'MSFT': 'XLK', 'NVDA': 'XLK', 'GOOGL': 'XLC', 'META': 'XLC',
      'AMZN': 'XLY', 'TSLA': 'XLY', 'NFLX': 'XLC', 'AMD': 'XLK', 'INTC': 'XLK',
      // Financials
      'JPM': 'XLF', 'BAC': 'XLF', 'WFC': 'XLF', 'GS': 'XLF', 'MS': 'XLF',
      // Healthcare
      'JNJ': 'XLV', 'UNH': 'XLV', 'PFE': 'XLV', 'MRK': 'XLV', 'ABBV': 'XLV',
      // Energy
      'XOM': 'XLE', 'CVX': 'XLE', 'COP': 'XLE',
      // Consumer
      'WMT': 'XLP', 'PG': 'XLP', 'KO': 'XLP', 'PEP': 'XLP',
      'NKE': 'XLY', 'SBUX': 'XLY', 'MCD': 'XLY', 'HD': 'XLY',
    };
    
    return sectorMap[symbol.toUpperCase()] || null;
  },

  /**
   * Obtiene sesgo de rotación para un símbolo específico
   */
  async getRotationBiasForSymbol(symbol: string): Promise<number> {
    try {
      const sector = await this.getSymbolSector(symbol);
      if (!sector) return 0;
      
      const analysis = await this.getRotationAnalysis();
      return analysis.predictionImpact.sectorBias[sector] || 0;
    } catch {
      return 0;
    }
  },

  /**
   * Datos por defecto
   */
  getDefaultAnalysis(): RotationAnalysis {
    return {
      marketRegime: 'mixed',
      regimeStrength: 50,
      regimeConfidence: 30,
      moneyFlow: {
        intoRiskOn: 0,
        intoDefensive: 0,
        intoGrowth: 0,
        intoValue: 0,
      },
      topSectors: [],
      bottomSectors: [],
      sectors: {},
      rotationSignals: [],
      predictionImpact: {
        bullishBias: 0,
        sectorBias: {},
        riskLevel: 'medium',
      },
      lastUpdate: new Date(),
      dataQuality: 'low',
    };
  },

  /**
   * Limpia cache
   */
  clearCache() {
    cache.clear();
  },
};
