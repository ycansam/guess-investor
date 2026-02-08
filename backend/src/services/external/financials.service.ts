/**
 * Servicio de Datos Financieros Mejorado
 * 
 * Obtiene métricas financieras fundamentales de empresas
 * Incluye ratios avanzados: EV/EBITDA, FCF Yield, Quality Score
 */

import { logger } from '../../middleware/logger.js';
import { yahooAuthService } from './yahoo-auth.service.js';

export interface FinancialsData {
  // Valoración clásica
  peRatio: number | null;
  forwardPE: number | null;
  pegRatio: number | null;
  priceToBook: number | null;
  priceToSales: number | null;
  
  // Valoración avanzada
  evToEbitda: number | null; // Enterprise Value / EBITDA
  evToRevenue: number | null; // Enterprise Value / Revenue
  fcfYield: number | null; // Free Cash Flow Yield (FCF / Market Cap)
  
  // Rentabilidad
  profitMargin: number | null;
  operatingMargin: number | null;
  grossMargin: number | null;
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  
  // Crecimiento
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  
  // Dividendos
  dividendYield: number | null;
  payoutRatio: number | null;
  
  // Deuda y liquidez
  debtToEquity: number | null;
  currentRatio: number | null;
  quickRatio: number | null;
  
  // Target de analistas
  targetPrice: number | null;
  targetVsCurrent: number | null; // % diferencia
  recommendationMean: number | null; // 1=strong buy, 5=strong sell
  numberOfAnalysts: number | null;
  
  // Scores
  financialsScore: number; // -100 a +100
  valuationScore: number; // -50 a +50
  qualityScore: number; // -50 a +50
  hasData: boolean;
  dataQuality: 'high' | 'medium' | 'low';
  summary: string;
}

// Cache
const cache = new Map<string, { data: FinancialsData; timestamp: number }>();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hora

// Rangos de valoración por sector (P/E promedio)
const SECTOR_PE_RANGES: Record<string, { low: number; mid: number; high: number }> = {
  'technology': { low: 20, mid: 35, high: 50 },
  'healthcare': { low: 18, mid: 28, high: 40 },
  'financials': { low: 10, mid: 15, high: 20 },
  'consumer': { low: 15, mid: 22, high: 30 },
  'energy': { low: 8, mid: 12, high: 18 },
  'utilities': { low: 12, mid: 18, high: 25 },
  'industrials': { low: 15, mid: 20, high: 28 },
  'default': { low: 15, mid: 22, high: 35 },
};

export const financialsService = {
  async getFinancials(symbol: string, currentPrice: number): Promise<FinancialsData | null> {
    // Cryptos no tienen datos financieros
    if (symbol.includes('-USD') || symbol.includes('-EUR')) {
      return null;
    }

    const cached = cache.get(symbol);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }

    try {
      const modules = ['defaultKeyStatistics', 'financialData', 'summaryDetail', 'cashflowStatementHistory'];
      const result = await yahooAuthService.fetchQuoteSummary(symbol, modules);

      if (!result) {
        return null;
      }

      const data = this.parseYahooData(symbol, result, currentPrice);
      cache.set(symbol, { data, timestamp: Date.now() });
      
      logger.info(`[Financials] ${symbol}: score=${data.financialsScore}, P/E=${data.peRatio}, EV/EBITDA=${data.evToEbitda}, FCF Yield=${data.fcfYield?.toFixed(1)}%`);
      return data;
    } catch (error) {
      logger.error(`[Financials] Error for ${symbol}:`, error);
      return null;
    }
  },

  parseYahooData(symbol: string, data: any, currentPrice: number): FinancialsData {
    const keyStats = data.defaultKeyStatistics || {};
    const financial = data.financialData || {};
    const summary = data.summaryDetail || {};
    const cashflow = data.cashflowStatementHistory?.cashflowStatements?.[0] || {};

    // Extraer valores básicos
    const peRatio = summary.trailingPE ?? null;
    const forwardPE = summary.forwardPE ?? keyStats.forwardPE ?? null;
    const pegRatio = keyStats.pegRatio ?? null;
    const priceToBook = keyStats.priceToBook ?? null;
    const priceToSales = summary.priceToSalesTrailing12Months ?? null;
    
    // Valores avanzados
    const evToEbitda = keyStats.enterpriseToEbitda ?? null;
    const evToRevenue = keyStats.enterpriseToRevenue ?? null;
    
    // Calcular FCF Yield si hay datos
    let fcfYield: number | null = null;
    const marketCap = summary.marketCap ?? keyStats.marketCap;
    const fcf = cashflow.freeCashFlow ?? financial.freeCashflow;
    if (fcf && marketCap && marketCap > 0) {
      fcfYield = (fcf / marketCap) * 100;
    }
    
    // Márgenes
    const profitMargin = financial.profitMargins != null ? financial.profitMargins * 100 : null;
    const operatingMargin = financial.operatingMargins != null ? financial.operatingMargins * 100 : null;
    const grossMargin = financial.grossMargins != null ? financial.grossMargins * 100 : null;
    const returnOnEquity = financial.returnOnEquity != null ? financial.returnOnEquity * 100 : null;
    const returnOnAssets = financial.returnOnAssets != null ? financial.returnOnAssets * 100 : null;
    
    const revenueGrowth = financial.revenueGrowth != null ? financial.revenueGrowth * 100 : null;
    const earningsGrowth = financial.earningsGrowth != null ? financial.earningsGrowth * 100 : null;
    
    const dividendYield = summary.dividendYield != null ? summary.dividendYield * 100 : null;
    const payoutRatio = summary.payoutRatio != null ? summary.payoutRatio * 100 : null;
    
    const debtToEquity = financial.debtToEquity ?? null;
    const currentRatio = financial.currentRatio ?? null;
    const quickRatio = financial.quickRatio ?? null;
    
    const targetPrice = financial.targetMeanPrice ?? null;
    const targetVsCurrent = targetPrice && currentPrice > 0 
      ? ((targetPrice - currentPrice) / currentPrice) * 100 
      : null;
    const recommendationMean = financial.recommendationMean ?? null;
    const numberOfAnalysts = financial.numberOfAnalystOpinions ?? null;

    // Calcular Valuation Score (basado en múltiplos)
    let valuationScore = 0;
    let valuationFactors = 0;

    // P/E Ratio (hasta ±15)
    if (peRatio !== null && peRatio > 0) {
      valuationFactors++;
      if (peRatio < 12) valuationScore += 15;
      else if (peRatio < 18) valuationScore += 10;
      else if (peRatio < 25) valuationScore += 5;
      else if (peRatio < 35) valuationScore += 0;
      else if (peRatio < 50) valuationScore -= 10;
      else valuationScore -= 15;
    }

    // Forward P/E (bonus si mejora vs trailing)
    if (forwardPE !== null && peRatio !== null && forwardPE > 0 && peRatio > 0) {
      const improvement = (peRatio - forwardPE) / peRatio * 100;
      if (improvement > 20) valuationScore += 5; // P/E forward mucho mejor
    }

    // PEG Ratio (hasta ±10)
    if (pegRatio !== null && pegRatio > 0) {
      valuationFactors++;
      if (pegRatio < 0.8) valuationScore += 10;
      else if (pegRatio < 1) valuationScore += 8;
      else if (pegRatio < 1.5) valuationScore += 5;
      else if (pegRatio < 2) valuationScore += 0;
      else if (pegRatio < 3) valuationScore -= 5;
      else valuationScore -= 10;
    }

    // EV/EBITDA (hasta ±12) - métrica clave para valor
    if (evToEbitda !== null && evToEbitda > 0) {
      valuationFactors++;
      if (evToEbitda < 6) valuationScore += 12;
      else if (evToEbitda < 10) valuationScore += 8;
      else if (evToEbitda < 15) valuationScore += 4;
      else if (evToEbitda < 20) valuationScore += 0;
      else if (evToEbitda < 30) valuationScore -= 5;
      else valuationScore -= 10;
    }

    // FCF Yield (hasta ±10) - crucial para value investing
    if (fcfYield !== null) {
      valuationFactors++;
      if (fcfYield > 10) valuationScore += 10; // Excelente
      else if (fcfYield > 6) valuationScore += 7;
      else if (fcfYield > 4) valuationScore += 4;
      else if (fcfYield > 2) valuationScore += 0;
      else if (fcfYield > 0) valuationScore -= 3;
      else valuationScore -= 8; // FCF negativo es preocupante
    }

    valuationScore = Math.max(-50, Math.min(50, valuationScore));

    // Calcular Quality Score (basado en fundamentales)
    let qualityScore = 0;
    let qualityFactors = 0;

    // Profit Margin (hasta ±10)
    if (profitMargin !== null) {
      qualityFactors++;
      if (profitMargin > 25) qualityScore += 10;
      else if (profitMargin > 15) qualityScore += 7;
      else if (profitMargin > 10) qualityScore += 4;
      else if (profitMargin > 5) qualityScore += 0;
      else if (profitMargin > 0) qualityScore -= 3;
      else qualityScore -= 8;
    }

    // Gross Margin (hasta ±8)
    if (grossMargin !== null) {
      qualityFactors++;
      if (grossMargin > 60) qualityScore += 8;
      else if (grossMargin > 40) qualityScore += 5;
      else if (grossMargin > 25) qualityScore += 2;
      else if (grossMargin > 15) qualityScore += 0;
      else qualityScore -= 5;
    }

    // ROE (hasta ±10)
    if (returnOnEquity !== null) {
      qualityFactors++;
      if (returnOnEquity > 25) qualityScore += 10;
      else if (returnOnEquity > 18) qualityScore += 7;
      else if (returnOnEquity > 12) qualityScore += 4;
      else if (returnOnEquity > 8) qualityScore += 0;
      else if (returnOnEquity > 0) qualityScore -= 3;
      else qualityScore -= 8;
    }

    // Revenue Growth (hasta ±8)
    if (revenueGrowth !== null) {
      qualityFactors++;
      if (revenueGrowth > 30) qualityScore += 8;
      else if (revenueGrowth > 15) qualityScore += 5;
      else if (revenueGrowth > 5) qualityScore += 2;
      else if (revenueGrowth > 0) qualityScore += 0;
      else if (revenueGrowth > -10) qualityScore -= 3;
      else qualityScore -= 7;
    }

    // Debt to Equity (hasta ±8)
    if (debtToEquity !== null) {
      qualityFactors++;
      if (debtToEquity < 0.3) qualityScore += 8;
      else if (debtToEquity < 0.7) qualityScore += 5;
      else if (debtToEquity < 1.2) qualityScore += 2;
      else if (debtToEquity < 2) qualityScore += 0;
      else if (debtToEquity < 3) qualityScore -= 4;
      else qualityScore -= 8;
    }

    // Current Ratio (hasta ±6)
    if (currentRatio !== null) {
      qualityFactors++;
      if (currentRatio > 2.5) qualityScore += 6;
      else if (currentRatio > 1.5) qualityScore += 4;
      else if (currentRatio > 1.1) qualityScore += 2;
      else if (currentRatio > 0.9) qualityScore -= 2;
      else qualityScore -= 6;
    }

    qualityScore = Math.max(-50, Math.min(50, qualityScore));

    // Score de analistas (hasta ±20)
    let analystScore = 0;
    if (targetVsCurrent !== null) {
      if (targetVsCurrent > 30) analystScore += 15;
      else if (targetVsCurrent > 15) analystScore += 10;
      else if (targetVsCurrent > 5) analystScore += 5;
      else if (targetVsCurrent > -5) analystScore += 0;
      else if (targetVsCurrent > -15) analystScore -= 5;
      else analystScore -= 10;
    }
    
    if (recommendationMean !== null) {
      if (recommendationMean <= 1.5) analystScore += 5; // Strong Buy
      else if (recommendationMean <= 2.3) analystScore += 3; // Buy
      else if (recommendationMean <= 3) analystScore += 0; // Hold
      else if (recommendationMean <= 4) analystScore -= 3; // Underperform
      else analystScore -= 5; // Sell
    }

    // Financials Score combinado
    const financialsScore = Math.max(-100, Math.min(100, valuationScore + qualityScore + analystScore));

    // Determinar calidad de datos
    const totalFactors = valuationFactors + qualityFactors;
    const dataQuality: 'high' | 'medium' | 'low' = 
      totalFactors >= 8 ? 'high' :
      totalFactors >= 4 ? 'medium' : 'low';

    // Generar summary con emojis
    const summaryParts: string[] = [];
    
    // Valoración
    if (peRatio !== null) {
      const emoji = peRatio < 18 ? '💰' : peRatio > 35 ? '⚠️' : '📊';
      summaryParts.push(`${emoji} P/E: ${peRatio.toFixed(1)}`);
    }
    if (evToEbitda !== null) {
      summaryParts.push(`EV/EBITDA: ${evToEbitda.toFixed(1)}`);
    }
    if (fcfYield !== null) {
      const emoji = fcfYield > 6 ? '💵' : fcfYield < 0 ? '🔴' : '';
      summaryParts.push(`${emoji}FCF Yield: ${fcfYield.toFixed(1)}%`);
    }
    
    // Calidad
    if (profitMargin !== null) {
      summaryParts.push(`Margen: ${profitMargin.toFixed(1)}%`);
    }
    if (returnOnEquity !== null && returnOnEquity > 15) {
      summaryParts.push(`ROE: ${returnOnEquity.toFixed(0)}%`);
    }
    
    // Analistas
    if (targetVsCurrent !== null) {
      const emoji = targetVsCurrent > 15 ? '🎯' : targetVsCurrent < -10 ? '⬇️' : '';
      const direction = targetVsCurrent > 0 ? '+' : '';
      summaryParts.push(`${emoji}Target: ${direction}${targetVsCurrent.toFixed(0)}%`);
    }

    const summaryText = summaryParts.length > 0 
      ? summaryParts.join('. ') + '.'
      : '❓ Sin datos financieros disponibles.';

    return {
      peRatio,
      forwardPE,
      pegRatio,
      priceToBook,
      priceToSales,
      evToEbitda,
      evToRevenue,
      fcfYield,
      profitMargin,
      operatingMargin,
      grossMargin,
      returnOnEquity,
      returnOnAssets,
      revenueGrowth,
      earningsGrowth,
      dividendYield,
      payoutRatio,
      debtToEquity,
      currentRatio,
      quickRatio,
      targetPrice,
      targetVsCurrent,
      recommendationMean,
      numberOfAnalysts,
      financialsScore,
      valuationScore,
      qualityScore,
      hasData: totalFactors > 0,
      dataQuality,
      summary: summaryText,
    };
  },
};
