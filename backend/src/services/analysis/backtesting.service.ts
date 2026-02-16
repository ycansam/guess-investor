/**
 * Backtesting Service
 * Valida estrategias de predicción usando datos históricos
 * 
 * Permite:
 * - Probar predicciones contra datos pasados
 * - Calcular métricas de precisión por estrategia
 * - Identificar condiciones de mercado óptimas
 * - Optimizar pesos de factores
 */

import { logger } from '../../middleware/logger.js';

export interface BacktestConfig {
  symbol: string;
  startDate: Date;
  endDate: Date;
  timeframeDays: number;        // 1 = intradía, 7 = swing, 30 = largo
  predictionThreshold: number;  // Mínimo score para considerar señal
  stopLoss?: number;            // % de stop loss
  takeProfit?: number;          // % de take profit
}

export interface BacktestTrade {
  entryDate: Date;
  exitDate: Date;
  entryPrice: number;
  exitPrice: number;
  predictedDirection: 'bullish' | 'bearish';
  actualDirection: 'up' | 'down';
  predictionScore: number;
  confidence: number;
  profit: number;              // % de ganancia/pérdida
  wasCorrect: boolean;
  exitReason: 'target' | 'stop' | 'timeframe' | 'signal_change';
  factors: Record<string, number>;
}

export interface BacktestResult {
  config: BacktestConfig;
  
  // Métricas principales
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;            // %
  
  // Rendimiento
  totalProfit: number;        // % acumulado
  averageProfit: number;      // % promedio por trade
  maxDrawdown: number;        // Máxima pérdida desde pico
  sharpeRatio: number;        // Riesgo ajustado
  profitFactor: number;       // Ganancias / Pérdidas
  
  // Por dirección
  bullishAccuracy: number;
  bearishAccuracy: number;
  
  // Por condición de mercado
  trendingAccuracy: number;
  rangingAccuracy: number;
  volatileAccuracy: number;
  
  // Análisis de factores
  factorContribution: Record<string, {
    avgWhenCorrect: number;
    avgWhenWrong: number;
    correlation: number;
  }>;
  
  // Trades individuales
  trades: BacktestTrade[];
  
  // Equity curve
  equityCurve: { date: Date; equity: number }[];
  
  // Meta
  executionTime: number;
  dataQuality: 'high' | 'medium' | 'low';
}

export interface MarketCondition {
  type: 'trending_up' | 'trending_down' | 'ranging' | 'volatile';
  strength: number;
  volatility: number;
}

// Cache para datos históricos
const historicalCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 horas

export const backtestingService = {
  /**
   * Ejecuta un backtest completo
   */
  async runBacktest(config: BacktestConfig): Promise<BacktestResult> {
    const startTime = Date.now();
    logger.info(`[Backtest] Starting for ${config.symbol} from ${config.startDate.toISOString()} to ${config.endDate.toISOString()}`);

    try {
      // 1. Obtener datos históricos
      const historicalData = await this.getHistoricalData(
        config.symbol,
        config.startDate,
        config.endDate
      );

      if (historicalData.length < 30) {
        throw new Error('Insufficient historical data for backtest');
      }

      // 2. Simular predicciones y trades
      const trades = await this.simulateTrades(config, historicalData);

      // 3. Calcular métricas
      const metrics = this.calculateMetrics(trades, config);

      // 4. Analizar contribución de factores
      const factorContribution = this.analyzeFactorContribution(trades);

      // 5. Generar equity curve
      const equityCurve = this.generateEquityCurve(trades);

      const result: BacktestResult = {
        config,
        totalTrades: trades.length,
        winningTrades: trades.filter(t => t.wasCorrect).length,
        losingTrades: trades.filter(t => !t.wasCorrect).length,
        winRate: metrics.winRate,
        totalProfit: metrics.totalProfit,
        averageProfit: metrics.averageProfit,
        maxDrawdown: metrics.maxDrawdown,
        sharpeRatio: metrics.sharpeRatio,
        profitFactor: metrics.profitFactor,
        bullishAccuracy: metrics.bullishAccuracy,
        bearishAccuracy: metrics.bearishAccuracy,
        trendingAccuracy: metrics.trendingAccuracy,
        rangingAccuracy: metrics.rangingAccuracy,
        volatileAccuracy: metrics.volatileAccuracy,
        factorContribution,
        trades,
        equityCurve,
        executionTime: Date.now() - startTime,
        dataQuality: historicalData.length > 200 ? 'high' : historicalData.length > 100 ? 'medium' : 'low',
      };

      logger.info(`[Backtest] Completed: ${trades.length} trades, ${metrics.winRate.toFixed(1)}% win rate, ${metrics.totalProfit.toFixed(2)}% profit`);
      
      return result;
    } catch (error) {
      logger.error(`[Backtest] Error:`, error);
      throw error;
    }
  },

  /**
   * Obtiene datos históricos de Yahoo Finance
   */
  async getHistoricalData(symbol: string, startDate: Date, endDate: Date): Promise<HistoricalBar[]> {
    const cacheKey = `${symbol}_${startDate.getTime()}_${endDate.getTime()}`;
    const cached = historicalCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }

    try {
      const period1 = Math.floor(startDate.getTime() / 1000);
      const period2 = Math.floor(endDate.getTime() / 1000);
      
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d`;
      
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const json = await response.json() as any;
      const result = json.chart?.result?.[0];
      
      if (!result?.indicators?.quote?.[0]) {
        throw new Error('No data in response');
      }

      const timestamps = result.timestamp || [];
      const quote = result.indicators.quote[0];
      
      const data: HistoricalBar[] = [];
      
      for (let i = 0; i < timestamps.length; i++) {
        if (quote.open[i] && quote.high[i] && quote.low[i] && quote.close[i]) {
          data.push({
            date: new Date(timestamps[i] * 1000),
            open: quote.open[i],
            high: quote.high[i],
            low: quote.low[i],
            close: quote.close[i],
            volume: quote.volume[i] || 0,
          });
        }
      }

      historicalCache.set(cacheKey, { data, timestamp: Date.now() });
      
      return data;
    } catch (error) {
      logger.error(`[Backtest] Error fetching historical data:`, error);
      return [];
    }
  },

  /**
   * Simula trades basados en predicciones históricas
   */
  async simulateTrades(config: BacktestConfig, data: HistoricalBar[]): Promise<BacktestTrade[]> {
    const trades: BacktestTrade[] = [];
    
    // Necesitamos al menos 30 días de lookback para calcular indicadores
    const lookbackDays = 30;
    
    for (let i = lookbackDays; i < data.length - config.timeframeDays; i++) {
      const window = data.slice(i - lookbackDays, i + 1);
      const entryBar = data[i];
      const exitBar = data[Math.min(i + config.timeframeDays, data.length - 1)];
      
      // Calcular predicción simulada basada en indicadores técnicos
      const prediction = this.calculateHistoricalPrediction(window);
      
      // Solo tomar trades con señal fuerte
      if (Math.abs(prediction.score) < config.predictionThreshold) {
        continue;
      }
      
      const predictedDirection = prediction.score > 0 ? 'bullish' : 'bearish';
      const actualChange = ((exitBar.close - entryBar.close) / entryBar.close) * 100;
      const actualDirection = actualChange > 0 ? 'up' : 'down';
      
      // Determinar si fue correcto
      const wasCorrect = (predictedDirection === 'bullish' && actualDirection === 'up') ||
                         (predictedDirection === 'bearish' && actualDirection === 'down');
      
      // Calcular profit considerando dirección
      let profit = predictedDirection === 'bullish' ? actualChange : -actualChange;
      
      // Aplicar stop loss / take profit si están configurados
      let exitReason: BacktestTrade['exitReason'] = 'timeframe';
      
      if (config.stopLoss && profit < -config.stopLoss) {
        profit = -config.stopLoss;
        exitReason = 'stop';
      }
      
      if (config.takeProfit && profit > config.takeProfit) {
        profit = config.takeProfit;
        exitReason = 'target';
      }
      
      trades.push({
        entryDate: entryBar.date,
        exitDate: exitBar.date,
        entryPrice: entryBar.close,
        exitPrice: exitBar.close,
        predictedDirection,
        actualDirection,
        predictionScore: prediction.score,
        confidence: prediction.confidence,
        profit,
        wasCorrect,
        exitReason,
        factors: prediction.factors,
      });
      
      // Saltar días hasta después del exit para evitar overlap
      i += config.timeframeDays - 1;
    }
    
    return trades;
  },

  /**
   * Calcula predicción basada en datos históricos (para backtest)
   */
  calculateHistoricalPrediction(data: HistoricalBar[]): { 
    score: number; 
    confidence: number; 
    factors: Record<string, number>;
  } {
    const closes = data.map(d => d.close);
    const volumes = data.map(d => d.volume);
    const current = closes[closes.length - 1];
    
    // RSI (14 períodos)
    const rsi = this.calculateRSI(closes, 14);
    const rsiScore = rsi < 30 ? 30 : rsi > 70 ? -30 : (50 - rsi) * 0.6;
    
    // MACD
    const macd = this.calculateMACD(closes);
    const macdScore = macd.histogram * 20;
    
    // Moving Averages
    const sma20 = this.calculateSMA(closes, 20);
    const sma50 = closes.length >= 50 ? this.calculateSMA(closes, 50) : sma20;
    const maScore = current > sma20 ? 15 : -15;
    const maCrossScore = sma20 > sma50 ? 10 : -10;
    
    // Momentum
    const momentum5 = ((current - closes[closes.length - 6]) / closes[closes.length - 6]) * 100;
    const momentumScore = Math.min(30, Math.max(-30, momentum5 * 3));
    
    // Volume trend
    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const recentVolume = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const volumeScore = recentVolume > avgVolume * 1.5 ? 10 : recentVolume < avgVolume * 0.5 ? -5 : 0;
    
    // Volatility
    const returns = closes.slice(1).map((c, i) => (c - closes[i]) / closes[i]);
    const volatility = Math.sqrt(returns.reduce((sum, r) => sum + r * r, 0) / returns.length) * Math.sqrt(252);
    const volatilityScore = volatility > 0.4 ? -10 : volatility < 0.15 ? 5 : 0;
    
    // Combine factors
    const factors: Record<string, number> = {
      rsi: rsiScore,
      macd: macdScore,
      ma: maScore,
      maCross: maCrossScore,
      momentum: momentumScore,
      volume: volumeScore,
      volatility: volatilityScore,
    };
    
    // Weighted sum
    const weights = {
      rsi: 0.15,
      macd: 0.20,
      ma: 0.15,
      maCross: 0.10,
      momentum: 0.25,
      volume: 0.10,
      volatility: 0.05,
    };
    
    let score = 0;
    for (const [factor, value] of Object.entries(factors)) {
      score += value * (weights[factor as keyof typeof weights] || 0.1);
    }
    
    // Normalize to -100 to +100
    score = Math.max(-100, Math.min(100, score));
    
    // Confidence based on factor agreement
    const signs = Object.values(factors).map(v => Math.sign(v));
    const agreement = signs.filter(s => s === Math.sign(score)).length / signs.length;
    const confidence = Math.min(95, 30 + agreement * 50 + Math.abs(score) * 0.2);
    
    return { score, confidence, factors };
  },

  /**
   * Calcula RSI
   */
  calculateRSI(closes: number[], period: number): number {
    if (closes.length < period + 1) return 50;
    
    let gains = 0;
    let losses = 0;
    
    for (let i = closes.length - period; i < closes.length; i++) {
      const change = closes[i] - closes[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    
    if (losses === 0) return 100;
    if (gains === 0) return 0;
    
    const rs = (gains / period) / (losses / period);
    return 100 - (100 / (1 + rs));
  },

  /**
   * Calcula MACD
   */
  calculateMACD(closes: number[]): { macd: number; signal: number; histogram: number } {
    const ema12 = this.calculateEMA(closes, 12);
    const ema26 = this.calculateEMA(closes, 26);
    const macdLine = ema12 - ema26;
    
    // Aproximar signal line
    const signalLine = macdLine * 0.9; // Simplificación
    const histogram = macdLine - signalLine;
    
    return { macd: macdLine, signal: signalLine, histogram };
  },

  /**
   * Calcula SMA
   */
  calculateSMA(data: number[], period: number): number {
    if (data.length < period) return data[data.length - 1];
    const slice = data.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  },

  /**
   * Calcula EMA
   */
  calculateEMA(data: number[], period: number): number {
    if (data.length < period) return data[data.length - 1];
    
    const multiplier = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    for (let i = period; i < data.length; i++) {
      ema = (data[i] - ema) * multiplier + ema;
    }
    
    return ema;
  },

  /**
   * Calcula métricas del backtest
   */
  calculateMetrics(trades: BacktestTrade[], config: BacktestConfig) {
    if (trades.length === 0) {
      return {
        winRate: 0,
        totalProfit: 0,
        averageProfit: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
        profitFactor: 0,
        bullishAccuracy: 0,
        bearishAccuracy: 0,
        trendingAccuracy: 0,
        rangingAccuracy: 0,
        volatileAccuracy: 0,
      };
    }

    const winning = trades.filter(t => t.wasCorrect);
    const losing = trades.filter(t => !t.wasCorrect);
    
    const winRate = (winning.length / trades.length) * 100;
    const profits = trades.map(t => t.profit);
    const totalProfit = profits.reduce((a, b) => a + b, 0);
    const averageProfit = totalProfit / trades.length;
    
    // Max drawdown
    let peak = 0;
    let maxDrawdown = 0;
    let equity = 0;
    
    for (const profit of profits) {
      equity += profit;
      if (equity > peak) peak = equity;
      const drawdown = peak - equity;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }
    
    // Sharpe ratio (simplificado)
    const mean = averageProfit;
    const stdDev = Math.sqrt(
      profits.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / profits.length
    );
    const sharpeRatio = stdDev === 0 ? 0 : (mean / stdDev) * Math.sqrt(252 / config.timeframeDays);
    
    // Profit factor
    const grossProfit = profits.filter(p => p > 0).reduce((a, b) => a + b, 0);
    const grossLoss = Math.abs(profits.filter(p => p < 0).reduce((a, b) => a + b, 0));
    const profitFactor = grossLoss === 0 ? grossProfit : grossProfit / grossLoss;
    
    // Por dirección
    const bullishTrades = trades.filter(t => t.predictedDirection === 'bullish');
    const bearishTrades = trades.filter(t => t.predictedDirection === 'bearish');
    const bullishAccuracy = bullishTrades.length > 0 
      ? (bullishTrades.filter(t => t.wasCorrect).length / bullishTrades.length) * 100 
      : 0;
    const bearishAccuracy = bearishTrades.length > 0 
      ? (bearishTrades.filter(t => t.wasCorrect).length / bearishTrades.length) * 100 
      : 0;
    
    return {
      winRate,
      totalProfit,
      averageProfit,
      maxDrawdown,
      sharpeRatio,
      profitFactor,
      bullishAccuracy,
      bearishAccuracy,
      trendingAccuracy: winRate, // TODO: Clasificar condiciones de mercado
      rangingAccuracy: winRate,
      volatileAccuracy: winRate,
    };
  },

  /**
   * Analiza contribución de cada factor
   */
  analyzeFactorContribution(trades: BacktestTrade[]): Record<string, {
    avgWhenCorrect: number;
    avgWhenWrong: number;
    correlation: number;
  }> {
    if (trades.length === 0) return {};
    
    const factors = Object.keys(trades[0]?.factors || {});
    const contribution: Record<string, any> = {};
    
    for (const factor of factors) {
      const correctTrades = trades.filter(t => t.wasCorrect);
      const wrongTrades = trades.filter(t => !t.wasCorrect);
      
      const avgWhenCorrect = correctTrades.length > 0
        ? correctTrades.reduce((sum, t) => sum + (t.factors[factor] || 0), 0) / correctTrades.length
        : 0;
        
      const avgWhenWrong = wrongTrades.length > 0
        ? wrongTrades.reduce((sum, t) => sum + (t.factors[factor] || 0), 0) / wrongTrades.length
        : 0;
      
      // Simple correlation with outcome
      const factorValues = trades.map(t => t.factors[factor] || 0);
      const outcomes = trades.map(t => t.wasCorrect ? 1 : -1);
      const correlation = this.calculateCorrelation(factorValues, outcomes);
      
      contribution[factor] = { avgWhenCorrect, avgWhenWrong, correlation };
    }
    
    return contribution;
  },

  /**
   * Calcula correlación de Pearson
   */
  calculateCorrelation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length === 0) return 0;
    
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);
    
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    return denominator === 0 ? 0 : numerator / denominator;
  },

  /**
   * Genera curva de equity
   */
  generateEquityCurve(trades: BacktestTrade[]): { date: Date; equity: number }[] {
    const curve: { date: Date; equity: number }[] = [];
    let equity = 100; // Starting with 100%
    
    for (const trade of trades) {
      equity += trade.profit;
      curve.push({
        date: trade.exitDate,
        equity,
      });
    }
    
    return curve;
  },

  /**
   * Ejecuta backtest rápido para optimización
   */
  async quickBacktest(
    symbol: string,
    days: number = 90,
    timeframeDays: number = 1
  ): Promise<{ winRate: number; profit: number; trades: number }> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const result = await this.runBacktest({
      symbol,
      startDate,
      endDate,
      timeframeDays,
      predictionThreshold: 20,
    });
    
    return {
      winRate: result.winRate,
      profit: result.totalProfit,
      trades: result.totalTrades,
    };
  },

  /**
   * Compara múltiples configuraciones
   */
  async compareStrategies(
    symbol: string,
    configs: Partial<BacktestConfig>[]
  ): Promise<{ config: Partial<BacktestConfig>; result: BacktestResult }[]> {
    const baseConfig: BacktestConfig = {
      symbol,
      startDate: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
      endDate: new Date(),
      timeframeDays: 1,
      predictionThreshold: 20,
    };
    
    const results = [];
    
    for (const partialConfig of configs) {
      const config = { ...baseConfig, ...partialConfig };
      const result = await this.runBacktest(config);
      results.push({ config: partialConfig, result });
    }
    
    // Sort by Sharpe ratio
    results.sort((a, b) => b.result.sharpeRatio - a.result.sharpeRatio);
    
    return results;
  },

  /**
   * Limpia cache
   */
  clearCache() {
    historicalCache.clear();
  },
};

export interface HistoricalBar {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
