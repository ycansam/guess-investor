/**
 * Risk/Reward Service
 * Calcula el ratio riesgo/recompensa para cada operación
 * 
 * R/R Ratio = Ganancia Potencial / Pérdida Potencial
 * - R/R 2:1 significa que ganas 2€ por cada 1€ que arriesgas
 * - Con R/R 2:1 solo necesitas acertar 34% para ser rentable
 * - Con R/R 3:1 solo necesitas acertar 25% para ser rentable
 * 
 * Usado por: Stanley Druckenmiller, Paul Tudor Jones, Jesse Livermore
 */

import { logger } from '../../middleware/logger.js';

export interface RiskRewardAnalysis {
  // Niveles de precio
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  
  // Ratios
  riskRewardRatio: number;        // Ej: 2.5 significa 2.5:1
  riskPercent: number;            // % que arriesgas
  rewardPercent: number;          // % que puedes ganar
  
  // Probabilidades implícitas
  breakEvenWinRate: number;       // % de aciertos necesario para no perder
  expectedValue: number;          // Valor esperado dado tu win rate
  
  // Sizing
  kellyPercent: number;           // % óptimo a invertir según Kelly Criterion
  suggestedPositionSize: 'small' | 'medium' | 'large' | 'max';
  
  // Calidad de la operación
  tradeQuality: 'excellent' | 'good' | 'acceptable' | 'poor' | 'avoid';
  qualityScore: number;           // 0-100
  
  // Contexto
  reasoning: string;
  warnings: string[];
  
  // Para UI
  riskRewardDisplay: string;      // "2.5:1"
  riskRewardEmoji: string;        // "🟢" / "🟡" / "🔴"
}

export interface SupportResistance {
  nearestSupport: number | null;
  nearestResistance: number | null;
  supports: number[];
  resistances: number[];
}

export const riskRewardService = {
  /**
   * Método simplificado que obtiene todos los datos necesarios
   */
  async calculate(params: {
    symbol: string;
    entryPrice?: number;
    direction: 'long' | 'short';
    atr?: number;
    winRate?: number;
  }): Promise<RiskRewardAnalysis> {
    const { symbol, direction, winRate = 0.55 } = params;
    
    try {
      // Obtener datos del símbolo
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch price data');
      }

      const json = await response.json() as any;
      const result = json.chart?.result?.[0];
      
      if (!result) {
        throw new Error('Invalid price data');
      }

      const currentPrice = params.entryPrice || result.meta?.regularMarketPrice || 100;
      const closes = result.indicators?.quote?.[0]?.close?.filter((c: any) => c !== null) || [];
      const highs = result.indicators?.quote?.[0]?.high?.filter((h: any) => h !== null) || [];
      const lows = result.indicators?.quote?.[0]?.low?.filter((l: any) => l !== null) || [];

      // Calcular ATR si no se proporciona
      const atr = params.atr || this.calculateATR(highs, lows, closes);
      const volatility = (atr / currentPrice) * 100;

      // Calcular soportes y resistencias
      const supportResistance = this.findSupportResistance(closes, highs, lows, currentPrice);

      // Estimar cambio predicho basado en volatilidad y dirección
      const predictedChange = direction === 'long' 
        ? volatility * 1.5 
        : -volatility * 1.5;

      // Confianza estimada basada en S/R y ATR
      const confidence = this.estimateConfidence(currentPrice, supportResistance, direction);

      // Calcular R/R completo
      return this.calculateFull(
        currentPrice,
        predictedChange,
        confidence,
        volatility,
        supportResistance,
        direction === 'long' ? 'up' : 'down'
      );
    } catch (error) {
      logger.error(`[RiskReward] Error calculating for ${symbol}:`, error);
      return this.getDefaultAnalysis(params.entryPrice || 100, direction);
    }
  },

  /**
   * Calcula ATR (Average True Range)
   */
  calculateATR(highs: number[], lows: number[], closes: number[], period: number = 14): number {
    if (highs.length < period + 1) return 0;

    const trueRanges: number[] = [];
    
    for (let i = 1; i < highs.length; i++) {
      const hl = highs[i] - lows[i];
      const hc = Math.abs(highs[i] - closes[i - 1]);
      const lc = Math.abs(lows[i] - closes[i - 1]);
      trueRanges.push(Math.max(hl, hc, lc));
    }

    // Promedio de los últimos 'period' true ranges
    const recentTR = trueRanges.slice(-period);
    return recentTR.reduce((a, b) => a + b, 0) / recentTR.length;
  },

  /**
   * Encuentra soportes y resistencias
   */
  findSupportResistance(closes: number[], highs: number[], lows: number[], currentPrice: number): SupportResistance {
    const supports: number[] = [];
    const resistances: number[] = [];

    // Buscar pivots en los últimos datos
    for (let i = 2; i < closes.length - 2; i++) {
      // Pivot high (resistencia)
      if (highs[i] > highs[i - 1] && highs[i] > highs[i - 2] &&
          highs[i] > highs[i + 1] && highs[i] > highs[i + 2]) {
        resistances.push(highs[i]);
      }
      // Pivot low (soporte)
      if (lows[i] < lows[i - 1] && lows[i] < lows[i - 2] &&
          lows[i] < lows[i + 1] && lows[i] < lows[i + 2]) {
        supports.push(lows[i]);
      }
    }

    // Encontrar el más cercano
    const nearestSupport = supports
      .filter(s => s < currentPrice)
      .sort((a, b) => b - a)[0] || null;
    
    const nearestResistance = resistances
      .filter(r => r > currentPrice)
      .sort((a, b) => a - b)[0] || null;

    return {
      nearestSupport,
      nearestResistance,
      supports: supports.sort((a, b) => b - a).slice(0, 5),
      resistances: resistances.sort((a, b) => a - b).slice(0, 5),
    };
  },

  /**
   * Estima confianza basada en contexto técnico
   */
  estimateConfidence(price: number, sr: SupportResistance, direction: 'long' | 'short'): number {
    let confidence = 50;

    if (direction === 'long') {
      // Más confianza si estamos cerca de soporte
      if (sr.nearestSupport) {
        const distanceToSupport = ((price - sr.nearestSupport) / price) * 100;
        if (distanceToSupport < 2) confidence += 15;
        else if (distanceToSupport < 5) confidence += 10;
      }
      // Menos confianza si estamos cerca de resistencia
      if (sr.nearestResistance) {
        const distanceToResistance = ((sr.nearestResistance - price) / price) * 100;
        if (distanceToResistance < 2) confidence -= 15;
        else if (distanceToResistance < 5) confidence -= 5;
      }
    } else {
      // Short: opuesto
      if (sr.nearestResistance) {
        const distanceToResistance = ((sr.nearestResistance - price) / price) * 100;
        if (distanceToResistance < 2) confidence += 15;
        else if (distanceToResistance < 5) confidence += 10;
      }
      if (sr.nearestSupport) {
        const distanceToSupport = ((price - sr.nearestSupport) / price) * 100;
        if (distanceToSupport < 2) confidence -= 15;
        else if (distanceToSupport < 5) confidence -= 5;
      }
    }

    return Math.max(30, Math.min(80, confidence));
  },

  /**
   * Retorna análisis por defecto
   */
  getDefaultAnalysis(price: number, direction: 'long' | 'short'): RiskRewardAnalysis {
    const stopLoss = direction === 'long' ? price * 0.97 : price * 1.03;
    const takeProfit = direction === 'long' ? price * 1.05 : price * 0.95;
    
    return {
      entryPrice: price,
      stopLoss,
      takeProfit,
      riskRewardRatio: 1.67,
      riskPercent: 3,
      rewardPercent: 5,
      breakEvenWinRate: 37.5,
      expectedValue: 0.5,
      kellyPercent: 5,
      suggestedPositionSize: 'small',
      tradeQuality: 'acceptable',
      qualityScore: 50,
      reasoning: 'Datos insuficientes para análisis detallado. Usando valores conservadores.',
      warnings: ['⚠️ Análisis limitado por falta de datos'],
      riskRewardDisplay: '1.7:1',
      riskRewardEmoji: '🟡',
    };
  },

  /**
   * Calcula el análisis completo de riesgo/recompensa
   */
  calculateFull(
    currentPrice: number,
    predictedChange: number,
    confidence: number,
    volatility: number,
    supportResistance: SupportResistance,
    direction: 'up' | 'down' | 'neutral'
  ): RiskRewardAnalysis {
    const entryPrice = currentPrice;
    
    // Calcular Take Profit basado en predicción
    let takeProfit: number;
    if (direction === 'up') {
      // Si hay resistencia cercana, usar como TP, sino usar predicción
      const predictedTarget = currentPrice * (1 + predictedChange / 100);
      takeProfit = supportResistance.nearestResistance 
        ? Math.min(supportResistance.nearestResistance, predictedTarget * 1.02)
        : predictedTarget;
    } else if (direction === 'down') {
      const predictedTarget = currentPrice * (1 + predictedChange / 100);
      takeProfit = supportResistance.nearestSupport
        ? Math.max(supportResistance.nearestSupport, predictedTarget * 0.98)
        : predictedTarget;
    } else {
      takeProfit = currentPrice; // Neutral = no trade
    }
    
    // Calcular Stop Loss basado en volatilidad y soporte/resistencia
    let stopLoss: number;
    const volatilityStop = currentPrice * (volatility / 100) * 1.5; // 1.5x volatilidad diaria
    
    if (direction === 'up') {
      // Stop debajo del soporte o basado en volatilidad
      const supportStop = supportResistance.nearestSupport 
        ? supportResistance.nearestSupport * 0.99  // 1% debajo del soporte
        : currentPrice - volatilityStop;
      stopLoss = Math.max(supportStop, currentPrice * 0.95); // Máximo 5% de pérdida
    } else if (direction === 'down') {
      // Stop encima de la resistencia o basado en volatilidad
      const resistanceStop = supportResistance.nearestResistance
        ? supportResistance.nearestResistance * 1.01  // 1% encima de resistencia
        : currentPrice + volatilityStop;
      stopLoss = Math.min(resistanceStop, currentPrice * 1.05); // Máximo 5% de pérdida
    } else {
      stopLoss = currentPrice * 0.97; // Default 3% para neutral
    }
    
    // Calcular porcentajes
    const riskPercent = Math.abs((entryPrice - stopLoss) / entryPrice) * 100;
    const rewardPercent = Math.abs((takeProfit - entryPrice) / entryPrice) * 100;
    
    // Risk/Reward Ratio
    const riskRewardRatio = riskPercent > 0 ? rewardPercent / riskPercent : 0;
    
    // Probabilidad de break-even: 1 / (1 + R/R)
    const breakEvenWinRate = riskRewardRatio > 0 
      ? (1 / (1 + riskRewardRatio)) * 100 
      : 50;
    
    // Valor esperado: (WinRate * Reward) - ((1 - WinRate) * Risk)
    const estimatedWinRate = Math.min(95, confidence + 10) / 100; // Confianza + 10% optimismo
    const expectedValue = (estimatedWinRate * rewardPercent) - ((1 - estimatedWinRate) * riskPercent);
    
    // Kelly Criterion: f* = (p * b - q) / b
    // donde p = probabilidad de ganar, b = ratio de pago, q = probabilidad de perder
    const kellyRaw = riskRewardRatio > 0 
      ? ((estimatedWinRate * riskRewardRatio - (1 - estimatedWinRate)) / riskRewardRatio)
      : 0;
    const kellyPercent = Math.max(0, Math.min(25, kellyRaw * 100)); // Cap at 25%
    
    // Determinar tamaño de posición sugerido
    let suggestedPositionSize: 'small' | 'medium' | 'large' | 'max';
    if (kellyPercent < 5) suggestedPositionSize = 'small';
    else if (kellyPercent < 10) suggestedPositionSize = 'medium';
    else if (kellyPercent < 20) suggestedPositionSize = 'large';
    else suggestedPositionSize = 'max';
    
    // Calidad de la operación
    const { tradeQuality, qualityScore } = this.evaluateTradeQuality(
      riskRewardRatio,
      confidence,
      expectedValue,
      direction
    );
    
    // Generar warnings
    const warnings = this.generateWarnings(
      riskRewardRatio,
      riskPercent,
      confidence,
      direction,
      volatility
    );
    
    // Display
    const riskRewardDisplay = `${riskRewardRatio.toFixed(1)}:1`;
    const riskRewardEmoji = riskRewardRatio >= 2 ? '🟢' : riskRewardRatio >= 1 ? '🟡' : '🔴';
    
    // Reasoning
    const reasoning = this.generateReasoning(
      riskRewardRatio,
      breakEvenWinRate,
      expectedValue,
      direction,
      supportResistance
    );
    
    logger.debug(`[RiskReward] R/R: ${riskRewardRatio.toFixed(2)}, Quality: ${tradeQuality}, EV: ${expectedValue.toFixed(2)}%`);
    
    return {
      entryPrice,
      stopLoss,
      takeProfit,
      riskRewardRatio,
      riskPercent,
      rewardPercent,
      breakEvenWinRate,
      expectedValue,
      kellyPercent,
      suggestedPositionSize,
      tradeQuality,
      qualityScore,
      reasoning,
      warnings,
      riskRewardDisplay,
      riskRewardEmoji,
    };
  },

  /**
   * Evalúa la calidad de la operación
   */
  evaluateTradeQuality(
    rr: number,
    confidence: number,
    ev: number,
    direction: 'up' | 'down' | 'neutral'
  ): { tradeQuality: RiskRewardAnalysis['tradeQuality']; qualityScore: number } {
    let score = 0;
    
    // R/R ratio (40 puntos)
    if (rr >= 3) score += 40;
    else if (rr >= 2.5) score += 35;
    else if (rr >= 2) score += 30;
    else if (rr >= 1.5) score += 20;
    else if (rr >= 1) score += 10;
    else score += 0;
    
    // Confianza (30 puntos)
    score += (confidence / 100) * 30;
    
    // Expected Value (30 puntos)
    if (ev > 2) score += 30;
    else if (ev > 1) score += 25;
    else if (ev > 0.5) score += 20;
    else if (ev > 0) score += 10;
    else score += 0;
    
    // Penalización por neutral
    if (direction === 'neutral') score *= 0.5;
    
    let quality: RiskRewardAnalysis['tradeQuality'];
    if (score >= 80) quality = 'excellent';
    else if (score >= 65) quality = 'good';
    else if (score >= 45) quality = 'acceptable';
    else if (score >= 25) quality = 'poor';
    else quality = 'avoid';
    
    return { tradeQuality: quality, qualityScore: Math.round(score) };
  },

  /**
   * Genera warnings de la operación
   */
  generateWarnings(
    rr: number,
    riskPercent: number,
    confidence: number,
    direction: 'up' | 'down' | 'neutral',
    volatility: number
  ): string[] {
    const warnings: string[] = [];
    
    if (rr < 1) {
      warnings.push('⚠️ R/R menor a 1:1 - Arriesgas más de lo que puedes ganar');
    }
    
    if (riskPercent > 3) {
      warnings.push(`⚠️ Riesgo alto (${riskPercent.toFixed(1)}%) - Considera reducir posición`);
    }
    
    if (confidence < 40) {
      warnings.push('⚠️ Confianza baja - Señales poco claras');
    }
    
    if (direction === 'neutral') {
      warnings.push('⚠️ Sin dirección clara - Mejor esperar');
    }
    
    if (volatility > 40) {
      warnings.push(`⚠️ Alta volatilidad (${volatility.toFixed(0)}%) - Stop puede ejecutarse por ruido`);
    }
    
    return warnings;
  },

  /**
   * Genera explicación del análisis
   */
  generateReasoning(
    rr: number,
    breakEven: number,
    ev: number,
    direction: 'up' | 'down' | 'neutral',
    sr: SupportResistance
  ): string {
    const parts: string[] = [];
    
    // R/R explanation
    if (rr >= 2) {
      parts.push(`R/R de ${rr.toFixed(1)}:1 es favorable`);
      parts.push(`solo necesitas acertar ${breakEven.toFixed(0)}% para ser rentable`);
    } else if (rr >= 1) {
      parts.push(`R/R de ${rr.toFixed(1)}:1 es aceptable`);
      parts.push(`necesitas acertar ${breakEven.toFixed(0)}% para no perder`);
    } else {
      parts.push(`R/R de ${rr.toFixed(1)}:1 es desfavorable`);
      parts.push(`necesitas acertar ${breakEven.toFixed(0)}% solo para no perder`);
    }
    
    // EV explanation
    if (ev > 0) {
      parts.push(`Valor esperado positivo (+${ev.toFixed(2)}%)`);
    } else {
      parts.push(`Valor esperado negativo (${ev.toFixed(2)}%)`);
    }
    
    // S/R context
    if (direction === 'up' && sr.nearestResistance) {
      parts.push(`Resistencia en ${sr.nearestResistance.toFixed(2)}`);
    } else if (direction === 'down' && sr.nearestSupport) {
      parts.push(`Soporte en ${sr.nearestSupport.toFixed(2)}`);
    }
    
    return parts.join('. ') + '.';
  },

  /**
   * Calcula niveles de Fibonacci para soporte/resistencia
   */
  calculateFibonacciLevels(high: number, low: number): number[] {
    const diff = high - low;
    const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
    
    return levels.map(level => low + diff * level);
  },
};
