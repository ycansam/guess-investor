/**
 * Servicio de Datos Financieros
 * 
 * Obtiene métricas financieras fundamentales de empresas
 */

import { logger } from '../../middleware/logger.js';
import { yahooAuthService } from './yahoo-auth.service.js';

export interface FinancialsData {
  // Valoración
  peRatio: number | null;
  forwardPE: number | null;
  pegRatio: number | null;
  priceToBook: number | null;
  priceToSales: number | null;
  
  // Rentabilidad
  profitMargin: number | null;
  operatingMargin: number | null;
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  
  // Crecimiento
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  
  // Dividendos
  dividendYield: number | null;
  payoutRatio: number | null;
  
  // Deuda
  debtToEquity: number | null;
  currentRatio: number | null;
  
  // Target de analistas
  targetPrice: number | null;
  targetVsCurrent: number | null; // % diferencia
  recommendationMean: number | null; // 1=strong buy, 5=strong sell
  
  // Score combinado
  financialsScore: number; // -100 a +100
  hasData: boolean;
  summary: string;
}

// Cache
const cache = new Map<string, { data: FinancialsData; timestamp: number }>();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hora

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
      const modules = ['defaultKeyStatistics', 'financialData', 'summaryDetail'];
      const result = await yahooAuthService.fetchQuoteSummary(symbol, modules);

      if (!result) {
        return null;
      }

      const data = this.parseYahooData(symbol, result, currentPrice);
      cache.set(symbol, { data, timestamp: Date.now() });
      
      logger.info(`[Financials] ${symbol}: score=${data.financialsScore}, P/E=${data.peRatio}`);
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

    // Extraer valores - yahoo-finance2 devuelve valores directamente, no con .raw
    const peRatio = summary.trailingPE ?? null;
    const forwardPE = summary.forwardPE ?? keyStats.forwardPE ?? null;
    const pegRatio = keyStats.pegRatio ?? null;
    const priceToBook = keyStats.priceToBook ?? null;
    const priceToSales = summary.priceToSalesTrailing12Months ?? null;
    
    const profitMargin = financial.profitMargins != null ? financial.profitMargins * 100 : null;
    const operatingMargin = financial.operatingMargins != null ? financial.operatingMargins * 100 : null;
    const returnOnEquity = financial.returnOnEquity != null ? financial.returnOnEquity * 100 : null;
    const returnOnAssets = financial.returnOnAssets != null ? financial.returnOnAssets * 100 : null;
    
    const revenueGrowth = financial.revenueGrowth != null ? financial.revenueGrowth * 100 : null;
    const earningsGrowth = financial.earningsGrowth != null ? financial.earningsGrowth * 100 : null;
    
    const dividendYield = summary.dividendYield != null ? summary.dividendYield * 100 : null;
    const payoutRatio = summary.payoutRatio != null ? summary.payoutRatio * 100 : null;
    
    const debtToEquity = financial.debtToEquity ?? null;
    const currentRatio = financial.currentRatio ?? null;
    
    const targetPrice = financial.targetMeanPrice ?? null;
    const targetVsCurrent = targetPrice && currentPrice > 0 
      ? ((targetPrice - currentPrice) / currentPrice) * 100 
      : null;
    const recommendationMean = financial.recommendationMean ?? null;

    // Calcular score
    let financialsScore = 0;
    let factorsUsed = 0;

    // P/E Ratio (hasta ±15)
    if (peRatio !== null) {
      factorsUsed++;
      if (peRatio < 15) financialsScore += 15;
      else if (peRatio < 25) financialsScore += 10;
      else if (peRatio < 35) financialsScore += 0;
      else if (peRatio < 50) financialsScore -= 10;
      else financialsScore -= 15;
    }

    // PEG Ratio (hasta ±15)
    if (pegRatio !== null) {
      factorsUsed++;
      if (pegRatio < 1) financialsScore += 15;
      else if (pegRatio < 1.5) financialsScore += 10;
      else if (pegRatio < 2) financialsScore += 5;
      else if (pegRatio < 3) financialsScore -= 5;
      else financialsScore -= 10;
    }

    // Profit Margin (hasta ±10)
    if (profitMargin !== null) {
      factorsUsed++;
      if (profitMargin > 20) financialsScore += 10;
      else if (profitMargin > 10) financialsScore += 5;
      else if (profitMargin > 0) financialsScore += 0;
      else financialsScore -= 10;
    }

    // ROE (hasta ±10)
    if (returnOnEquity !== null) {
      factorsUsed++;
      if (returnOnEquity > 20) financialsScore += 10;
      else if (returnOnEquity > 15) financialsScore += 5;
      else if (returnOnEquity > 10) financialsScore += 0;
      else if (returnOnEquity > 0) financialsScore -= 5;
      else financialsScore -= 10;
    }

    // Revenue Growth (hasta ±10)
    if (revenueGrowth !== null) {
      factorsUsed++;
      if (revenueGrowth > 20) financialsScore += 10;
      else if (revenueGrowth > 10) financialsScore += 5;
      else if (revenueGrowth > 0) financialsScore += 0;
      else if (revenueGrowth > -10) financialsScore -= 5;
      else financialsScore -= 10;
    }

    // Debt to Equity (hasta ±10)
    if (debtToEquity !== null) {
      factorsUsed++;
      if (debtToEquity < 0.5) financialsScore += 10;
      else if (debtToEquity < 1) financialsScore += 5;
      else if (debtToEquity < 2) financialsScore += 0;
      else financialsScore -= 10;
    }

    // Target Price vs Current (hasta ±20)
    if (targetVsCurrent !== null) {
      factorsUsed++;
      if (targetVsCurrent > 20) financialsScore += 20;
      else if (targetVsCurrent > 10) financialsScore += 15;
      else if (targetVsCurrent > 0) financialsScore += 5;
      else if (targetVsCurrent > -10) financialsScore -= 5;
      else financialsScore -= 15;
    }

    // Recommendation Mean (hasta ±10)
    if (recommendationMean !== null) {
      factorsUsed++;
      if (recommendationMean <= 1.5) financialsScore += 10; // Strong Buy
      else if (recommendationMean <= 2.5) financialsScore += 5; // Buy
      else if (recommendationMean <= 3.5) financialsScore += 0; // Hold
      else financialsScore -= 10; // Sell
    }

    financialsScore = Math.max(-100, Math.min(100, financialsScore));

    // Generar summary
    const summaryParts: string[] = [];
    
    if (peRatio !== null) {
      summaryParts.push(`P/E: ${peRatio.toFixed(1)}`);
    }
    if (profitMargin !== null) {
      summaryParts.push(`Margen: ${profitMargin.toFixed(1)}%`);
    }
    if (targetVsCurrent !== null) {
      const direction = targetVsCurrent > 0 ? 'por encima' : 'por debajo';
      summaryParts.push(`Target ${Math.abs(targetVsCurrent).toFixed(0)}% ${direction}`);
    }

    const summaryText = summaryParts.length > 0 
      ? summaryParts.join('. ') + '.'
      : 'Sin datos financieros disponibles.';

    return {
      peRatio,
      forwardPE,
      pegRatio,
      priceToBook,
      priceToSales,
      profitMargin,
      operatingMargin,
      returnOnEquity,
      returnOnAssets,
      revenueGrowth,
      earningsGrowth,
      dividendYield,
      payoutRatio,
      debtToEquity,
      currentRatio,
      targetPrice,
      targetVsCurrent,
      recommendationMean,
      financialsScore,
      hasData: factorsUsed > 0,
      summary: summaryText,
    };
  },
};
