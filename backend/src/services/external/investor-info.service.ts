/**
 * Servicio de Información para Inversores
 * 
 * Consolida datos críticos que un inversor necesita para tomar decisiones:
 * - Próximos earnings y expectativas
 * - Dividendos (fechas, yield, historial)
 * - Fair Value estimado
 * - Salud financiera (FCF, deuda, etc.)
 * - Métricas de riesgo (beta, volatilidad)
 */

import { logger } from '../../middleware/logger.js';
import { corporateEventsService } from './corporate-events.service.js';
import { expectationsService } from './expectations.service.js';
import { financialsService } from './financials.service.js';
import { yahooAuthService } from './yahoo-auth.service.js';

// ============================================================================
// INTERFACES
// ============================================================================

export interface EarningsInfo {
  nextDate: Date | null;
  daysUntil: number | null;
  quarter: string | null;
  estimatedEPS: number | null;
  revenueEstimate: number | null;
  // Historial de sorpresas
  lastSurprise: number | null; // % sorpresa último trimestre
  avgSurprise: number | null; // % promedio sorpresas
  beatRate: number; // % veces que superó estimaciones
  riskLevel: 'high' | 'medium' | 'low';
}

export interface DividendInfo {
  yield: number | null;
  annualAmount: number | null;
  exDate: Date | null;
  payDate: Date | null;
  frequency: string | null; // 'quarterly', 'monthly', 'annually'
  payoutRatio: number | null;
  yearsConsecutive: number | null; // Años pagando dividendo consecutivo
  growthRate5Y: number | null; // Crecimiento 5 años
  isUpcoming: boolean;
}

export interface FairValueInfo {
  targetPrice: number | null;
  currentPrice: number;
  upside: number | null; // % potencial de subida
  peRatio: number | null;
  forwardPE: number | null;
  pegRatio: number | null;
  priceToBook: number | null;
  priceToSales: number | null;
  // Valoración relativa
  valuationStatus: 'undervalued' | 'fair' | 'overvalued' | 'unknown';
  valuationScore: number; // -100 a +100
}

export interface FinancialHealthInfo {
  // Cash Flow
  freeCashFlow: number | null;
  freeCashFlowFormatted: string | null;
  fcfYield: number | null; // FCF / Market Cap
  
  // Rentabilidad
  profitMargin: number | null;
  operatingMargin: number | null;
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  
  // Crecimiento
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  
  // Deuda
  debtToEquity: number | null;
  currentRatio: number | null;
  quickRatio: number | null;
  interestCoverage: number | null;
  
  // Score general
  healthScore: number; // 0-100
  healthStatus: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
}

export interface RiskMetricsInfo {
  beta: number | null;
  volatility52w: number | null;
  maxDrawdown52w: number | null;
  sharpeRatio: number | null;
  riskLevel: 'low' | 'moderate' | 'high' | 'very_high';
}

export interface InvestorInfo {
  symbol: string;
  name: string;
  currentPrice: number;
  currency: string;
  
  earnings: EarningsInfo;
  dividends: DividendInfo;
  fairValue: FairValueInfo;
  financialHealth: FinancialHealthInfo;
  riskMetrics: RiskMetricsInfo;
  
  // Resumen para el usuario
  summary: string;
  keyPoints: string[];
  lastUpdated: Date;
}

// ============================================================================
// CACHE
// ============================================================================

const cache = new Map<string, { data: InvestorInfo; timestamp: number }>();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutos

// ============================================================================
// SERVICE
// ============================================================================

export const investorInfoService = {
  /**
   * Obtiene información completa para inversores
   */
  async getInvestorInfo(symbol: string, currentPrice: number, name?: string): Promise<InvestorInfo | null> {
    // Las cryptos no tienen esta información
    if (symbol.includes('-USD') || symbol.includes('-EUR')) {
      return null;
    }

    // Verificar cache
    const cached = cache.get(symbol);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }

    try {
      logger.info(`[InvestorInfo] Fetching data for ${symbol}`);

      // Obtener datos de múltiples fuentes en paralelo
      const [corporateEvents, expectations, financials, additionalData] = await Promise.all([
        corporateEventsService.getCorporateEvents(symbol).catch(() => null),
        expectationsService.getExpectations(symbol).catch(() => null),
        financialsService.getFinancials(symbol, currentPrice).catch(() => null),
        this.fetchAdditionalYahooData(symbol).catch(() => null),
      ]);

      // Construir objeto de información
      const investorInfo = this.buildInvestorInfo(
        symbol,
        name || symbol,
        currentPrice,
        corporateEvents,
        expectations,
        financials,
        additionalData
      );

      cache.set(symbol, { data: investorInfo, timestamp: Date.now() });
      logger.info(`[InvestorInfo] ${symbol}: earnings in ${investorInfo.earnings.daysUntil} days, yield=${investorInfo.dividends.yield}%`);
      
      return investorInfo;
    } catch (error) {
      logger.error(`[InvestorInfo] Error for ${symbol}:`, error);
      return null;
    }
  },

  /**
   * Obtiene datos adicionales de Yahoo Finance
   */
  async fetchAdditionalYahooData(symbol: string): Promise<any> {
    try {
      const modules = ['defaultKeyStatistics', 'financialData', 'summaryDetail', 'price'];
      const result = await yahooAuthService.fetchQuoteSummary(symbol, modules);
      return result;
    } catch {
      return null;
    }
  },

  /**
   * Construye el objeto InvestorInfo completo
   */
  buildInvestorInfo(
    symbol: string,
    name: string,
    currentPrice: number,
    corporateEvents: any,
    expectations: any,
    financials: any,
    additionalData: any
  ): InvestorInfo {
    const keyStats = additionalData?.defaultKeyStatistics || {};
    const financial = additionalData?.financialData || {};
    const summary = additionalData?.summaryDetail || {};
    const priceData = additionalData?.price || {};
    const currency = priceData.currency || 'USD';

    // -------------------------------------------------------------------------
    // EARNINGS
    // -------------------------------------------------------------------------
    const earnings: EarningsInfo = {
      nextDate: corporateEvents?.nextEarningsDate?.date || expectations?.nextEarningsDate || null,
      daysUntil: corporateEvents?.nextEarningsDate?.daysUntil ?? expectations?.daysUntilEarnings ?? null,
      quarter: corporateEvents?.nextEarningsDate?.quarter || null,
      estimatedEPS: corporateEvents?.nextEarningsDate?.estimatedEPS || null,
      revenueEstimate: corporateEvents?.nextEarningsDate?.revenueEstimate || null,
      lastSurprise: expectations?.lastEpsSurprise || null,
      avgSurprise: expectations?.avgEpsSurprise || null,
      beatRate: expectations?.beatRate || 0,
      riskLevel: expectations?.earningsRisk || 'medium',
    };

    // -------------------------------------------------------------------------
    // DIVIDENDS
    // -------------------------------------------------------------------------
    const dividendYield = summary.dividendYield != null ? summary.dividendYield * 100 : null;
    const dividendRate = summary.dividendRate ?? null;
    const payoutRatio = summary.payoutRatio != null ? summary.payoutRatio * 100 : null;
    const fiveYearAvgDividendYield = summary.fiveYearAvgDividendYield ?? null;

    const dividends: DividendInfo = {
      yield: dividendYield,
      annualAmount: dividendRate,
      exDate: corporateEvents?.dividend?.exDate || null,
      payDate: corporateEvents?.dividend?.payDate || null,
      frequency: this.detectDividendFrequency(dividendRate, dividendYield),
      payoutRatio,
      yearsConsecutive: null, // Requiere datos históricos más profundos
      growthRate5Y: fiveYearAvgDividendYield && dividendYield 
        ? ((dividendYield / fiveYearAvgDividendYield) - 1) * 100 
        : null,
      isUpcoming: corporateEvents?.dividend?.isUpcoming || false,
    };

    // -------------------------------------------------------------------------
    // FAIR VALUE
    // -------------------------------------------------------------------------
    const targetPrice = financial.targetMeanPrice ?? financials?.targetPrice ?? null;
    const upside = targetPrice && currentPrice > 0 
      ? ((targetPrice - currentPrice) / currentPrice) * 100 
      : null;

    const peRatio = summary.trailingPE ?? financials?.peRatio ?? null;
    const forwardPE = summary.forwardPE ?? keyStats.forwardPE ?? financials?.forwardPE ?? null;
    const pegRatio = keyStats.pegRatio ?? financials?.pegRatio ?? null;
    const priceToBook = keyStats.priceToBook ?? financials?.priceToBook ?? null;
    const priceToSales = summary.priceToSalesTrailing12Months ?? financials?.priceToSales ?? null;

    // Calcular valoración
    const { valuationStatus, valuationScore } = this.calculateValuation(
      peRatio, forwardPE, pegRatio, priceToBook, upside
    );

    const fairValue: FairValueInfo = {
      targetPrice,
      currentPrice,
      upside,
      peRatio,
      forwardPE,
      pegRatio,
      priceToBook,
      priceToSales,
      valuationStatus,
      valuationScore,
    };

    // -------------------------------------------------------------------------
    // FINANCIAL HEALTH
    // -------------------------------------------------------------------------
    const freeCashFlow = financial.freeCashflow ?? null;
    const marketCap = priceData.marketCap ?? summary.marketCap ?? null;
    const fcfYield = freeCashFlow && marketCap && marketCap > 0 
      ? (freeCashFlow / marketCap) * 100 
      : null;

    const profitMargin = financial.profitMargins != null ? financial.profitMargins * 100 : financials?.profitMargin ?? null;
    const operatingMargin = financial.operatingMargins != null ? financial.operatingMargins * 100 : financials?.operatingMargin ?? null;
    const returnOnEquity = financial.returnOnEquity != null ? financial.returnOnEquity * 100 : financials?.returnOnEquity ?? null;
    const returnOnAssets = financial.returnOnAssets != null ? financial.returnOnAssets * 100 : financials?.returnOnAssets ?? null;
    const revenueGrowth = financial.revenueGrowth != null ? financial.revenueGrowth * 100 : financials?.revenueGrowth ?? null;
    const earningsGrowth = financial.earningsGrowth != null ? financial.earningsGrowth * 100 : financials?.earningsGrowth ?? null;
    const debtToEquity = financial.debtToEquity ?? financials?.debtToEquity ?? null;
    const currentRatio = financial.currentRatio ?? financials?.currentRatio ?? null;
    const quickRatio = financial.quickRatio ?? null;

    // Calcular health score
    const { healthScore, healthStatus } = this.calculateHealthScore(
      profitMargin, returnOnEquity, debtToEquity, currentRatio, revenueGrowth
    );

    const financialHealth: FinancialHealthInfo = {
      freeCashFlow,
      freeCashFlowFormatted: this.formatLargeNumber(freeCashFlow, currency),
      fcfYield,
      profitMargin,
      operatingMargin,
      returnOnEquity,
      returnOnAssets,
      revenueGrowth,
      earningsGrowth,
      debtToEquity,
      currentRatio,
      quickRatio,
      interestCoverage: null, // Requiere datos adicionales
      healthScore,
      healthStatus,
    };

    // -------------------------------------------------------------------------
    // RISK METRICS
    // -------------------------------------------------------------------------
    const beta = keyStats.beta ?? summary.beta ?? null;
    const week52High = summary.fiftyTwoWeekHigh ?? null;
    const week52Low = summary.fiftyTwoWeekLow ?? null;
    const volatility52w = week52High && week52Low && week52Low > 0
      ? ((week52High - week52Low) / week52Low) * 100
      : null;
    const maxDrawdown52w = week52High && currentPrice > 0
      ? ((week52High - currentPrice) / week52High) * 100
      : null;

    const riskLevel = this.calculateRiskLevel(beta, volatility52w);

    const riskMetrics: RiskMetricsInfo = {
      beta,
      volatility52w,
      maxDrawdown52w,
      sharpeRatio: null, // Requiere cálculo con datos históricos
      riskLevel,
    };

    // -------------------------------------------------------------------------
    // SUMMARY & KEY POINTS
    // -------------------------------------------------------------------------
    const { summary: summaryText, keyPoints } = this.generateSummary(
      symbol, earnings, dividends, fairValue, financialHealth, riskMetrics
    );

    return {
      symbol,
      name,
      currentPrice,
      currency,
      earnings,
      dividends,
      fairValue,
      financialHealth,
      riskMetrics,
      summary: summaryText,
      keyPoints,
      lastUpdated: new Date(),
    };
  },

  /**
   * Detecta la frecuencia de pago de dividendos
   */
  detectDividendFrequency(rate: number | null, yieldPct: number | null): string | null {
    if (!rate || !yieldPct) return null;
    // Esto es una aproximación, la frecuencia real requiere datos históricos
    return 'quarterly';
  },

  /**
   * Calcula el estado de valoración
   */
  calculateValuation(
    pe: number | null,
    forwardPE: number | null,
    peg: number | null,
    pb: number | null,
    upside: number | null
  ): { valuationStatus: 'undervalued' | 'fair' | 'overvalued' | 'unknown'; valuationScore: number } {
    let score = 0;
    let factors = 0;

    // P/E Ratio
    if (pe !== null && pe > 0) {
      factors++;
      if (pe < 15) score += 30;
      else if (pe < 20) score += 15;
      else if (pe < 25) score += 0;
      else if (pe < 35) score -= 15;
      else score -= 30;
    }

    // PEG Ratio
    if (peg !== null && peg > 0) {
      factors++;
      if (peg < 1) score += 30;
      else if (peg < 1.5) score += 15;
      else if (peg < 2) score += 0;
      else score -= 20;
    }

    // Price to Book
    if (pb !== null && pb > 0) {
      factors++;
      if (pb < 1) score += 20;
      else if (pb < 2) score += 10;
      else if (pb < 4) score += 0;
      else score -= 15;
    }

    // Upside potential
    if (upside !== null) {
      factors++;
      if (upside > 20) score += 25;
      else if (upside > 10) score += 15;
      else if (upside > 0) score += 5;
      else if (upside > -10) score -= 5;
      else score -= 20;
    }

    if (factors === 0) {
      return { valuationStatus: 'unknown', valuationScore: 0 };
    }

    const avgScore = Math.round(score / factors * 2); // Normalizar
    const valuationScore = Math.max(-100, Math.min(100, avgScore));

    let valuationStatus: 'undervalued' | 'fair' | 'overvalued' | 'unknown';
    if (valuationScore > 25) valuationStatus = 'undervalued';
    else if (valuationScore > -25) valuationStatus = 'fair';
    else valuationStatus = 'overvalued';

    return { valuationStatus, valuationScore };
  },

  /**
   * Calcula el score de salud financiera
   */
  calculateHealthScore(
    profitMargin: number | null,
    roe: number | null,
    debtToEquity: number | null,
    currentRatio: number | null,
    revenueGrowth: number | null
  ): { healthScore: number; healthStatus: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown' } {
    let score = 50; // Base
    let factors = 0;

    if (profitMargin !== null) {
      factors++;
      if (profitMargin > 20) score += 15;
      else if (profitMargin > 10) score += 8;
      else if (profitMargin > 0) score += 0;
      else score -= 15;
    }

    if (roe !== null) {
      factors++;
      if (roe > 20) score += 15;
      else if (roe > 15) score += 8;
      else if (roe > 10) score += 0;
      else score -= 10;
    }

    if (debtToEquity !== null) {
      factors++;
      if (debtToEquity < 0.5) score += 12;
      else if (debtToEquity < 1) score += 6;
      else if (debtToEquity < 2) score += 0;
      else score -= 15;
    }

    if (currentRatio !== null) {
      factors++;
      if (currentRatio > 2) score += 10;
      else if (currentRatio > 1.5) score += 5;
      else if (currentRatio > 1) score += 0;
      else score -= 15;
    }

    if (revenueGrowth !== null) {
      factors++;
      if (revenueGrowth > 20) score += 12;
      else if (revenueGrowth > 10) score += 6;
      else if (revenueGrowth > 0) score += 0;
      else score -= 10;
    }

    if (factors === 0) {
      return { healthScore: 0, healthStatus: 'unknown' };
    }

    const healthScore = Math.max(0, Math.min(100, score));
    
    let healthStatus: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';
    if (healthScore >= 75) healthStatus = 'excellent';
    else if (healthScore >= 55) healthStatus = 'good';
    else if (healthScore >= 35) healthStatus = 'fair';
    else healthStatus = 'poor';

    return { healthScore, healthStatus };
  },

  /**
   * Calcula el nivel de riesgo
   */
  calculateRiskLevel(beta: number | null, volatility: number | null): 'low' | 'moderate' | 'high' | 'very_high' {
    let riskScore = 0;

    if (beta !== null) {
      if (beta < 0.8) riskScore += 0;
      else if (beta < 1.2) riskScore += 1;
      else if (beta < 1.5) riskScore += 2;
      else riskScore += 3;
    }

    if (volatility !== null) {
      if (volatility < 30) riskScore += 0;
      else if (volatility < 50) riskScore += 1;
      else if (volatility < 80) riskScore += 2;
      else riskScore += 3;
    }

    if (riskScore <= 1) return 'low';
    if (riskScore <= 3) return 'moderate';
    if (riskScore <= 5) return 'high';
    return 'very_high';
  },

  /**
   * Formatea números grandes
   */
  formatLargeNumber(value: number | null, currency: string = 'USD'): string | null {
    if (value === null) return null;

    const currencySymbol = currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';
    const absValue = Math.abs(value);
    const sign = value < 0 ? '-' : '';

    if (absValue >= 1e12) return `${sign}${currencySymbol}${(absValue / 1e12).toFixed(1)}T`;
    if (absValue >= 1e9) return `${sign}${currencySymbol}${(absValue / 1e9).toFixed(1)}B`;
    if (absValue >= 1e6) return `${sign}${currencySymbol}${(absValue / 1e6).toFixed(1)}M`;
    return `${sign}${currencySymbol}${absValue.toFixed(0)}`;
  },

  /**
   * Genera resumen y puntos clave
   */
  generateSummary(
    symbol: string,
    earnings: EarningsInfo,
    dividends: DividendInfo,
    fairValue: FairValueInfo,
    health: FinancialHealthInfo,
    risk: RiskMetricsInfo
  ): { summary: string; keyPoints: string[] } {
    const keyPoints: string[] = [];

    // Earnings
    if (earnings.daysUntil !== null && earnings.daysUntil > 0 && earnings.daysUntil <= 30) {
      keyPoints.push(`📅 Earnings en ${earnings.daysUntil} días${earnings.quarter ? ` (${earnings.quarter})` : ''}`);
    }
    if (earnings.beatRate > 70) {
      keyPoints.push(`✅ Historial sólido: supera expectativas ${earnings.beatRate.toFixed(0)}% de las veces`);
    }

    // Dividends
    if (dividends.yield !== null && dividends.yield > 0) {
      keyPoints.push(`💰 Dividendo: ${dividends.yield.toFixed(2)}% anual`);
    }
    if (dividends.isUpcoming && dividends.exDate) {
      keyPoints.push(`📆 Ex-dividendo próximo: ${dividends.exDate.toLocaleDateString()}`);
    }

    // Fair Value
    if (fairValue.upside !== null) {
      if (fairValue.upside > 15) {
        keyPoints.push(`📈 Potencial alcista: +${fairValue.upside.toFixed(1)}% vs precio objetivo`);
      } else if (fairValue.upside < -15) {
        keyPoints.push(`⚠️ Cotiza ${Math.abs(fairValue.upside).toFixed(1)}% por encima del objetivo`);
      }
    }
    if (fairValue.valuationStatus === 'undervalued') {
      keyPoints.push(`🎯 Valoración: posiblemente infravalorada`);
    } else if (fairValue.valuationStatus === 'overvalued') {
      keyPoints.push(`⚠️ Valoración: posiblemente sobrevalorada`);
    }

    // Health
    if (health.healthStatus === 'excellent') {
      keyPoints.push(`💪 Salud financiera excelente`);
    } else if (health.healthStatus === 'poor') {
      keyPoints.push(`⚠️ Salud financiera débil`);
    }
    if (health.fcfYield !== null && health.fcfYield > 5) {
      keyPoints.push(`💵 FCF Yield atractivo: ${health.fcfYield.toFixed(1)}%`);
    }

    // Risk
    if (risk.riskLevel === 'very_high') {
      keyPoints.push(`🔴 Riesgo muy alto (beta: ${risk.beta?.toFixed(2) || 'N/A'})`);
    } else if (risk.riskLevel === 'low') {
      keyPoints.push(`🟢 Riesgo bajo (beta: ${risk.beta?.toFixed(2) || 'N/A'})`);
    }

    // Summary
    const summaryParts: string[] = [];

    if (fairValue.valuationStatus !== 'unknown') {
      const valText = fairValue.valuationStatus === 'undervalued' ? 'infravalorada' :
                      fairValue.valuationStatus === 'overvalued' ? 'sobrevalorada' : 'valoración justa';
      summaryParts.push(valText);
    }

    if (health.healthStatus !== 'unknown') {
      summaryParts.push(`salud ${health.healthStatus === 'excellent' ? 'excelente' : 
                                health.healthStatus === 'good' ? 'buena' :
                                health.healthStatus === 'fair' ? 'aceptable' : 'débil'}`);
    }

    if (risk.riskLevel) {
      const riskText = risk.riskLevel === 'low' ? 'bajo riesgo' :
                       risk.riskLevel === 'moderate' ? 'riesgo moderado' :
                       risk.riskLevel === 'high' ? 'alto riesgo' : 'muy alto riesgo';
      summaryParts.push(riskText);
    }

    const summary = summaryParts.length > 0
      ? `${symbol}: ${summaryParts.join(', ')}.`
      : `${symbol}: información limitada disponible.`;

    return { summary, keyPoints: keyPoints.slice(0, 5) };
  },
};
