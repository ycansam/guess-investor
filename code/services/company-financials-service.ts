/**
 * Servicio para obtener datos financieros fundamentales de empresas
 * Usa Yahoo Finance Quotesummary para obtener:
 * - Ingresos (Revenue)
 * - Beneficio neto (Net Income)
 * - Márgenes (Profit Margins)
 * - Crecimiento de ingresos
 * - PER, EPS, etc.
 * 
 * Prioridad de fuentes:
 * 1. Yahoo V8 (gratis, sin límites)
 * 2. Yahoo Crumb Service (gratis, ilimitado, con autenticación)
 * 3. RapidAPI (100 req/mes - como fallback)
 */

import { rapidApiYahooService, YahooQuoteSummary } from './rapidapi-yahoo-service';
import { QuoteSummaryData, yahooCrumbService } from './yahoo-crumb-service';
import { YahooV8Data, yahooV8Service } from './yahoo-v8-service';

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos de caché (datos financieros cambian poco)

/**
 * Datos financieros de una empresa
 */
export interface CompanyFinancials {
  // Información básica
  name: string;
  symbol: string;
  sector: string;
  industry: string;
  
  // Valoración
  marketCap: number; // Capitalización de mercado
  enterpriseValue: number;
  
  // Ratios de valoración
  peRatio: number; // Price/Earnings
  forwardPE: number; // Forward P/E
  pegRatio: number; // PEG Ratio
  priceToBook: number;
  priceToSales: number;
  
  // Ingresos y beneficios
  revenue: number; // Ingresos totales (últimos 12 meses)
  revenueGrowth: number; // Crecimiento de ingresos (%)
  netIncome: number; // Beneficio neto
  earningsGrowth: number; // Crecimiento de beneficios (%)
  
  // Márgenes
  grossMargin: number; // Margen bruto (%)
  operatingMargin: number; // Margen operativo (%)
  profitMargin: number; // Margen de beneficio neto (%)
  
  // Por acción
  eps: number; // Beneficio por acción (TTM)
  epsForward: number; // EPS estimado próximo año
  
  // Dividendos
  dividendYield: number; // Rentabilidad por dividendo (%)
  payoutRatio: number; // Ratio de pago (%)
  
  // Liquidez y deuda
  currentRatio: number; // Ratio corriente
  debtToEquity: number; // Deuda/Capital
  
  // Rentabilidad
  returnOnEquity: number; // ROE (%)
  returnOnAssets: number; // ROA (%)
  
  // Recomendaciones de analistas
  analystRating: string; // Buy, Hold, Sell, etc.
  targetPrice: number; // Precio objetivo medio
  targetPriceHigh: number;
  targetPriceLow: number;
  numberOfAnalysts: number;
  
  // EXPECTATIVAS DEL MERCADO (Earnings Surprise)
  lastEarningsSurprise: number; // % sorpresa último trimestre (positivo = superó expectativas)
  avgEarningsSurprise: number; // % sorpresa promedio últimos 4 trimestres
  nextEarningsEstimate: number; // EPS estimado próximo trimestre
  currentQuarterGrowthEstimate: number; // % crecimiento esperado este trimestre
  revenueEstimate: number; // Ingresos estimados próximo trimestre
  hasPositiveSurpriseHistory: boolean; // Historial de superar expectativas
  
  // Meta
  lastUpdated: Date;
  dataAvailable: boolean;
}

/**
 * Resultado simplificado para la predicción
 */
export interface FinancialSummary {
  // Para mostrar en UI
  revenue: string; // Formateado: "€5.2B"
  revenueGrowth: number;
  netIncome: string; // Formateado: "€1.8B"
  earningsGrowth: number;
  profitMargin: number;
  peRatio: number;
  analystRating: string;
  targetPrice: number;
  currentVsTarget: number; // % diferencia precio actual vs objetivo
  
  // Expectativas del mercado
  lastEarningsSurprise: number; // % sorpresa último trimestre
  avgEarningsSurprise: number; // % sorpresa promedio
  expectationsOutlook: string; // "Supera expectativas", "Cumple", "Decepciona"
  
  // Score calculado para la predicción
  financialHealthScore: number; // 0-100
  growthScore: number; // 0-100
  valueScore: number; // 0-100
  analystScore: number; // 0-100
  expectationsScore: number; // 0-100 - NUEVO: basado en si supera/cumple expectativas
  hasExpectationsData: boolean; // NUEVO: indica si hay datos reales de expectations
  overallScore: number; // 0-100, promedio ponderado
  
  // Flag de disponibilidad de datos
  dataAvailable: boolean; // Indica si hay datos financieros reales disponibles
}

// Caché
interface CacheEntry {
  data: CompanyFinancials;
  timestamp: number;
}
const financialsCache = new Map<string, CacheEntry>();

class CompanyFinancialsService {
  
  /**
   * Obtiene datos financieros completos de una empresa
   */
  async getFinancials(symbol: string): Promise<CompanyFinancials | null> {
    // Las cryptos no tienen financiales
    if (symbol.includes('-EUR') || symbol.includes('-USD')) {
      console.log(`[Financials] ${symbol} es crypto, no tiene datos financieros`);
      return null;
    }
    
    // Verificar caché
    const cached = financialsCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`[Financials] Usando caché para ${symbol}`);
      return cached.data;
    }
    
    try {
      console.log(`[Financials] Obteniendo datos financieros para ${symbol}`);
      
      // PRIORIDAD 1: Yahoo V8 Extendido (gratis, sin límites, incluye dividendos)
      const v8Data = await yahooV8Service.getExtendedQuote(symbol);
      if (v8Data && v8Data.regularMarketPrice > 0) {
        console.log(`[Financials] Datos básicos obtenidos via Yahoo V8 para ${symbol}`);
        
        // PRIORIDAD 2: Yahoo Crumb Service (gratis, con autenticación)
        const crumbData = await yahooCrumbService.getQuoteSummary(symbol);
        if (crumbData && crumbData.hasData) {
          console.log(`[Financials] Datos completos via Yahoo Crumb para ${symbol}`);
          const financials = this.parseFromCrumbService(symbol, crumbData, v8Data);
          financialsCache.set(symbol, { data: financials, timestamp: Date.now() });
          return financials;
        }
        
        // PRIORIDAD 3: RapidAPI (100 req/mes - como fallback)
        if (rapidApiYahooService.isAvailable()) {
          const rapidApiData = await rapidApiYahooService.getQuoteSummary(symbol);
          if (rapidApiData && rapidApiData.dataAvailable) {
            console.log(`[Financials] Datos completos via RapidAPI para ${symbol}`);
            const financials = this.parseFromRapidApi(symbol, rapidApiData, v8Data);
            financialsCache.set(symbol, { data: financials, timestamp: Date.now() });
            return financials;
          }
        }
        
        // Si no hay datos completos, usar solo datos de V8 extendido
        console.log(`[Financials] Usando solo datos V8 extendido para ${symbol}`);
        const financials = this.parseFromYahooV8(symbol, v8Data);
        financialsCache.set(symbol, { data: financials, timestamp: Date.now() });
        return financials;
      }
      
      // PRIORIDAD 4: Solo Crumb Service (cuando V8 falla)
      const crumbData = await yahooCrumbService.getQuoteSummary(symbol);
      if (crumbData && crumbData.hasData) {
        console.log(`[Financials] Datos obtenidos via Yahoo Crumb para ${symbol}`);
        const financials = this.parseFromCrumbService(symbol, crumbData);
        financialsCache.set(symbol, { data: financials, timestamp: Date.now() });
        return financials;
      }
      
      // PRIORIDAD 5: RapidAPI solo (cuando todo lo demás falla)
      if (rapidApiYahooService.isAvailable()) {
        const rapidApiData = await rapidApiYahooService.getQuoteSummary(symbol);
        if (rapidApiData && rapidApiData.dataAvailable) {
          console.log(`[Financials] Datos obtenidos via RapidAPI para ${symbol}`);
          const financials = this.parseFromRapidApi(symbol, rapidApiData);
          financialsCache.set(symbol, { data: financials, timestamp: Date.now() });
          return financials;
        }
      }
      
      console.log(`[Financials] No se pudieron obtener datos para ${symbol}`);
      return null;
      const result = data.quoteSummary?.result?.[0];
      
      if (!result) {
        console.log(`[Financials] No hay datos para ${symbol}`);
        return null;
      }
      
      const financials = this.parseFinancials(symbol, result);
      financialsCache.set(symbol, { data: financials, timestamp: Date.now() });
      
      return financials;
      
    } catch (error: any) {
      console.error(`[Financials] Error para ${symbol}:`, error.message);
      return null;
    }
  }
  
  /**
   * Parsea datos de Yahoo V8 Extendido (precio, dividendos, volatilidad)
   * Calcula métricas derivadas cuando es posible
   */
  private parseFromYahooV8(symbol: string, v8Data: YahooV8Data): CompanyFinancials {
    const priceChangePercent = v8Data.priceChangePercent || 0;
    
    // Calcular posición en el rango 52w
    const fiftyTwoWeekRange = v8Data.fiftyTwoWeekHigh - v8Data.fiftyTwoWeekLow;
    const positionIn52W = fiftyTwoWeekRange > 0 
      ? ((v8Data.regularMarketPrice - v8Data.fiftyTwoWeekLow) / fiftyTwoWeekRange) * 100 
      : 50;
    
    // Calcular score de precio
    let priceScore = 50;
    if (priceChangePercent > 5) priceScore = 75;
    else if (priceChangePercent > 2) priceScore = 65;
    else if (priceChangePercent > 0) priceScore = 55;
    else if (priceChangePercent > -2) priceScore = 45;
    else if (priceChangePercent > -5) priceScore = 35;
    else priceScore = 25;
    
    // Score de tendencia (basado en medias móviles)
    let trendScore = 50;
    if (v8Data.fiftyDayAverage > 0 && v8Data.twoHundredDayAverage > 0) {
      if (v8Data.regularMarketPrice > v8Data.fiftyDayAverage && v8Data.fiftyDayAverage > v8Data.twoHundredDayAverage) {
        trendScore = 75; // Tendencia alcista
      } else if (v8Data.regularMarketPrice < v8Data.fiftyDayAverage && v8Data.fiftyDayAverage < v8Data.twoHundredDayAverage) {
        trendScore = 25; // Tendencia bajista
      }
    }
    
    // Usar dividendYield calculado desde V8 extendido
    const dividendYield = v8Data.dividendYield || 0;
    
    // Determinar nombre del activo
    const name = v8Data.longName || v8Data.shortName || symbol;
    
    // Construir descripción del analista basada en datos técnicos disponibles
    let analystRating = 'Datos técnicos V8';
    if (dividendYield > 0) {
      analystRating += ` | Div: ${dividendYield.toFixed(2)}%`;
    }
    if (v8Data.volatility30d) {
      analystRating += ` | Vol: ${v8Data.volatility30d.toFixed(1)}%`;
    }
    
    // Tenemos datos parciales pero útiles (precio, dividendos si existen, tendencia)
    const hasUsefulData = v8Data.regularMarketPrice > 0 && 
                          (v8Data.fiftyDayAverage > 0 || dividendYield > 0);
    
    return {
      // Información básica
      symbol,
      name,
      sector: '',
      industry: '',
      
      // Valoración (no disponible sin datos fundamentales)
      marketCap: 0,
      enterpriseValue: 0,
      
      // Ratios de valoración (no disponible)
      peRatio: 0,
      forwardPE: 0,
      pegRatio: 0,
      priceToBook: 0,
      priceToSales: 0,
      
      // Ingresos y beneficios (no disponible)
      revenue: 0,
      revenueGrowth: 0,
      netIncome: 0,
      earningsGrowth: 0,
      
      // Márgenes (no disponible)
      grossMargin: 0,
      operatingMargin: 0,
      profitMargin: 0,
      
      // Por acción (no disponible)
      eps: 0,
      epsForward: 0,
      
      // Dividendos - AHORA DISPONIBLE VIA V8 EXTENDIDO
      dividendYield,
      payoutRatio: 0, // No disponible sin fundamentales
      
      // Liquidez y deuda (no disponible)
      currentRatio: 0,
      debtToEquity: 0,
      
      // Rentabilidad (no disponible)
      returnOnEquity: 0,
      returnOnAssets: 0,
      
      // Analistas (descripción técnica)
      analystRating,
      targetPrice: 0,
      targetPriceHigh: 0,
      targetPriceLow: 0,
      numberOfAnalysts: 0,
      
      // Expectativas (no disponible)
      lastEarningsSurprise: 0,
      avgEarningsSurprise: 0,
      nextEarningsEstimate: 0,
      currentQuarterGrowthEstimate: 0,
      revenueEstimate: 0,
      hasPositiveSurpriseHistory: false,
      
      // Meta - marcamos como parcialmente disponible
      lastUpdated: new Date(),
      dataAvailable: hasUsefulData, // TRUE si tenemos datos técnicos útiles
    };
  }
  
  /**
   * Parsea la respuesta de Yahoo Finance
   */
  private parseFinancials(symbol: string, data: any): CompanyFinancials {
    const profile = data.assetProfile || {};
    const summary = data.summaryDetail || {};
    const financial = data.financialData || {};
    const keyStats = data.defaultKeyStatistics || {};
    const recommendations = data.recommendationTrend?.trend?.[0] || {};
    const earningsHistory = data.earningsHistory?.history || [];
    const earningsTrend = data.earningsTrend?.trend || [];
    
    // Helper para extraer valores numéricos de Yahoo
    const getValue = (obj: any): number => {
      if (!obj) return 0;
      return obj.raw ?? obj.value ?? obj ?? 0;
    };
    
    const getPercent = (obj: any): number => {
      const val = getValue(obj);
      // Si ya está en formato porcentual (0.25 = 25%), convertir
      return val < 1 && val > -1 ? val * 100 : val;
    };
    
    // Calcular rating de analistas
    const totalRecs = (recommendations.strongBuy || 0) + 
                     (recommendations.buy || 0) + 
                     (recommendations.hold || 0) + 
                     (recommendations.sell || 0) + 
                     (recommendations.strongSell || 0);
    
    let analystRating = 'Sin datos';
    if (totalRecs > 0) {
      const buyScore = (recommendations.strongBuy || 0) * 2 + (recommendations.buy || 0);
      const sellScore = (recommendations.strongSell || 0) * 2 + (recommendations.sell || 0);
      if (buyScore > sellScore * 2) analystRating = 'Compra fuerte';
      else if (buyScore > sellScore) analystRating = 'Comprar';
      else if (sellScore > buyScore * 2) analystRating = 'Venta fuerte';
      else if (sellScore > buyScore) analystRating = 'Vender';
      else analystRating = 'Mantener';
    }
    
    // NUEVO: Calcular earnings surprise (diferencia entre actual y estimado)
    let lastEarningsSurprise = 0;
    let avgEarningsSurprise = 0;
    let positiveSurprises = 0;
    
    if (earningsHistory.length > 0) {
      const surprises: number[] = [];
      
      for (const quarter of earningsHistory) {
        const actual = getValue(quarter.epsActual);
        const estimate = getValue(quarter.epsEstimate);
        
        if (estimate !== 0) {
          const surprise = ((actual - estimate) / Math.abs(estimate)) * 100;
          surprises.push(surprise);
          if (surprise > 0) positiveSurprises++;
        }
      }
      
      if (surprises.length > 0) {
        lastEarningsSurprise = surprises[0]; // Último trimestre
        avgEarningsSurprise = surprises.reduce((a, b) => a + b, 0) / surprises.length;
      }
      
      console.log(`[Financials] Earnings surprises: last=${lastEarningsSurprise.toFixed(1)}%, avg=${avgEarningsSurprise.toFixed(1)}%, positivos=${positiveSurprises}/${earningsHistory.length}`);
    }
    
    // NUEVO: Obtener estimaciones del próximo trimestre
    let nextEarningsEstimate = 0;
    let currentQuarterGrowthEstimate = 0;
    let revenueEstimate = 0;
    
    if (earningsTrend.length > 0) {
      // El primer elemento suele ser el trimestre actual/próximo
      const currentTrend = earningsTrend[0];
      nextEarningsEstimate = getValue(currentTrend.earningsEstimate?.avg);
      currentQuarterGrowthEstimate = getPercent(currentTrend.growth);
      revenueEstimate = getValue(currentTrend.revenueEstimate?.avg);
      
      console.log(`[Financials] Próximo trimestre: EPS estimado=${nextEarningsEstimate}, crecimiento=${currentQuarterGrowthEstimate.toFixed(1)}%`);
    }
    
    return {
      name: profile.longName || symbol,
      symbol,
      sector: profile.sector || 'Desconocido',
      industry: profile.industry || 'Desconocido',
      
      marketCap: getValue(summary.marketCap),
      enterpriseValue: getValue(keyStats.enterpriseValue),
      
      peRatio: getValue(summary.trailingPE),
      forwardPE: getValue(summary.forwardPE),
      pegRatio: getValue(keyStats.pegRatio),
      priceToBook: getValue(summary.priceToBook),
      priceToSales: getValue(keyStats.priceToSalesTrailing12Months),
      
      revenue: getValue(financial.totalRevenue),
      revenueGrowth: getPercent(financial.revenueGrowth),
      netIncome: getValue(financial.netIncomeToCommon) || getValue(keyStats.netIncomeToCommon),
      earningsGrowth: getPercent(financial.earningsGrowth),
      
      grossMargin: getPercent(financial.grossMargins),
      operatingMargin: getPercent(financial.operatingMargins),
      profitMargin: getPercent(financial.profitMargins),
      
      eps: getValue(keyStats.trailingEps),
      epsForward: getValue(keyStats.forwardEps),
      
      dividendYield: getPercent(summary.dividendYield),
      payoutRatio: getPercent(summary.payoutRatio),
      
      currentRatio: getValue(financial.currentRatio),
      debtToEquity: getValue(financial.debtToEquity),
      
      returnOnEquity: getPercent(financial.returnOnEquity),
      returnOnAssets: getPercent(financial.returnOnAssets),
      
      analystRating,
      targetPrice: getValue(financial.targetMeanPrice),
      targetPriceHigh: getValue(financial.targetHighPrice),
      targetPriceLow: getValue(financial.targetLowPrice),
      numberOfAnalysts: getValue(financial.numberOfAnalystOpinions),
      
      // Expectativas del mercado
      lastEarningsSurprise,
      avgEarningsSurprise,
      nextEarningsEstimate,
      currentQuarterGrowthEstimate,
      revenueEstimate,
      hasPositiveSurpriseHistory: positiveSurprises >= Math.ceil(earningsHistory.length / 2),
      
      lastUpdated: new Date(),
      dataAvailable: true,
    };
  }
  
  /**
   * Parsea datos desde Yahoo Crumb Service al formato CompanyFinancials
   * Opcionalmente combina con datos de Yahoo V8
   */
  private parseFromCrumbService(symbol: string, data: QuoteSummaryData, v8Data?: YahooV8Data): CompanyFinancials {
    // Calcular rating de analistas desde recommendationTrend
    const recs = data.recommendationTrend || { strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 0 };
    const totalRecs = recs.strongBuy + recs.buy + recs.hold + recs.sell + recs.strongSell;
    
    let analystRating = 'Sin datos';
    if (totalRecs > 0) {
      const buyScore = recs.strongBuy * 2 + recs.buy;
      const sellScore = recs.strongSell * 2 + recs.sell;
      if (buyScore > sellScore * 2) analystRating = 'Compra fuerte';
      else if (buyScore > sellScore) analystRating = 'Comprar';
      else if (sellScore > buyScore * 2) analystRating = 'Venta fuerte';
      else if (sellScore > buyScore) analystRating = 'Vender';
      else analystRating = 'Mantener';
    }
    
    // Calcular earnings surprise desde earningsHistory
    let lastEarningsSurprise = 0;
    let avgEarningsSurprise = 0;
    let positiveSurprises = 0;
    const earningsHistory: { quarter: string; epsActual: number; epsEstimate: number; surprise: number }[] = [];
    
    if (data.earningsHistory && data.earningsHistory.length > 0) {
      const surprises: number[] = [];
      
      for (const quarter of data.earningsHistory) {
        if (quarter.epsEstimate !== 0) {
          const surprise = quarter.surprisePercent || 
            ((quarter.epsActual - quarter.epsEstimate) / Math.abs(quarter.epsEstimate)) * 100;
          surprises.push(surprise);
          if (surprise > 0) positiveSurprises++;
          earningsHistory.push({
            quarter: quarter.quarter,
            epsActual: quarter.epsActual,
            epsEstimate: quarter.epsEstimate,
            surprise,
          });
        }
      }
      
      if (surprises.length > 0) {
        lastEarningsSurprise = surprises[0];
        avgEarningsSurprise = surprises.reduce((a, b) => a + b, 0) / surprises.length;
      }
    }
    
    // Convertir porcentajes (vienen como decimales 0.25 = 25%)
    const toPercent = (val: number | undefined): number => {
      if (!val) return 0;
      return val < 1 && val > -1 ? val * 100 : val;
    };
    
    // Usar datos de V8 si están disponibles
    const price = v8Data?.regularMarketPrice || 0;
    const marketCap = v8Data?.marketCap || data.marketCap || 0;
    
    return {
      name: data.longName || data.shortName || symbol,
      symbol,
      sector: data.sector || '',
      industry: data.industry || '',
      
      marketCap,
      enterpriseValue: data.enterpriseValue || 0,
      
      peRatio: data.trailingPE || 0,
      forwardPE: data.forwardPE || 0,
      pegRatio: data.pegRatio || 0,
      priceToBook: data.priceToBook || 0,
      priceToSales: 0, // No disponible directamente
      
      revenue: data.totalRevenue || 0,
      revenueGrowth: toPercent(data.revenueGrowth),
      netIncome: 0, // No viene directamente
      earningsGrowth: toPercent(data.earningsGrowth),
      
      grossMargin: toPercent(data.grossMargins),
      operatingMargin: toPercent(data.operatingMargins),
      profitMargin: toPercent(data.profitMargins),
      
      eps: data.trailingEps || 0,
      epsForward: data.forwardEps || 0,
      
      dividendYield: toPercent(data.dividendYield),
      payoutRatio: 0, // No disponible
      
      currentRatio: data.currentRatio || 0,
      debtToEquity: data.debtToEquity || 0,
      
      returnOnEquity: toPercent(data.returnOnEquity),
      returnOnAssets: toPercent(data.returnOnAssets),
      
      analystRating,
      targetPrice: data.targetMeanPrice || 0,
      targetPriceHigh: data.targetHighPrice || 0,
      targetPriceLow: data.targetLowPrice || 0,
      numberOfAnalysts: data.numberOfAnalystOpinions || 0,
      
      earningsHistory,
      lastEarningsSurprise,
      avgEarningsSurprise,
      nextEarningsEstimate: 0,
      currentQuarterGrowthEstimate: 0,
      revenueEstimate: 0,
      hasPositiveSurpriseHistory: positiveSurprises >= Math.ceil(earningsHistory.length / 2),
      
      lastUpdated: new Date(),
      dataAvailable: true,
    };
  }
  
  /**
   * Parsea datos desde RapidAPI al formato CompanyFinancials
   * Opcionalmente combina con datos de Yahoo V8
   */
  private parseFromRapidApi(symbol: string, data: YahooQuoteSummary, v8Data?: YahooV8Data): CompanyFinancials {
    // Calcular rating de analistas desde recommendationTrend
    const recs = data.recommendationTrend || { strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 0 };
    const totalRecs = recs.strongBuy + recs.buy + recs.hold + recs.sell + recs.strongSell;
    
    let analystRating = 'Sin datos';
    if (totalRecs > 0) {
      const buyScore = recs.strongBuy * 2 + recs.buy;
      const sellScore = recs.strongSell * 2 + recs.sell;
      if (buyScore > sellScore * 2) analystRating = 'Compra fuerte';
      else if (buyScore > sellScore) analystRating = 'Comprar';
      else if (sellScore > buyScore * 2) analystRating = 'Venta fuerte';
      else if (sellScore > buyScore) analystRating = 'Vender';
      else analystRating = 'Mantener';
    }
    
    // Calcular earnings surprise desde earningsHistory
    let lastEarningsSurprise = 0;
    let avgEarningsSurprise = 0;
    let positiveSurprises = 0;
    
    if (data.earningsHistory && data.earningsHistory.length > 0) {
      const surprises: number[] = [];
      
      for (const quarter of data.earningsHistory) {
        if (quarter.epsEstimate !== 0) {
          const surprise = quarter.surprisePercent || 
            ((quarter.epsActual - quarter.epsEstimate) / Math.abs(quarter.epsEstimate)) * 100;
          surprises.push(surprise);
          if (surprise > 0) positiveSurprises++;
        }
      }
      
      if (surprises.length > 0) {
        lastEarningsSurprise = surprises[0];
        avgEarningsSurprise = surprises.reduce((a, b) => a + b, 0) / surprises.length;
      }
    }
    
    // Estimaciones de próximo trimestre
    const nextEarningsEstimate = data.earningsTrend?.currentQuarterEstimate || 0;
    const currentQuarterGrowthEstimate = 0; // No disponible directamente
    const revenueEstimate = data.earningsTrend?.revenueEstimateCurrent || 0;
    
    // Convertir porcentajes (vienen como decimales 0.25 = 25%)
    const toPercent = (val: number | undefined): number => {
      if (!val) return 0;
      return val < 1 && val > -1 ? val * 100 : val;
    };
    
    return {
      name: data.longName || data.shortName || symbol,
      symbol,
      sector: data.sector || '',
      industry: data.industry || '',
      
      marketCap: data.marketCap || 0,
      enterpriseValue: data.enterpriseValue || 0,
      
      peRatio: data.trailingPE || 0,
      forwardPE: data.forwardPE || 0,
      pegRatio: data.pegRatio || 0,
      priceToBook: data.priceToBook || 0,
      priceToSales: data.priceToSalesTrailing12Months || 0,
      
      revenue: data.totalRevenue || 0,
      revenueGrowth: toPercent(data.revenueGrowth),
      netIncome: 0, // No viene directamente, se puede calcular
      earningsGrowth: toPercent(data.earningsGrowth),
      
      grossMargin: toPercent(data.grossMargins),
      operatingMargin: toPercent(data.operatingMargins),
      profitMargin: toPercent(data.profitMargins),
      
      eps: data.trailingEps || 0,
      epsForward: data.forwardEps || 0,
      
      dividendYield: toPercent(data.dividendYield),
      payoutRatio: toPercent(data.payoutRatio),
      
      currentRatio: data.currentRatio || 0,
      debtToEquity: data.debtToEquity || 0,
      
      returnOnEquity: toPercent(data.returnOnEquity),
      returnOnAssets: toPercent(data.returnOnAssets),
      
      analystRating,
      targetPrice: data.targetMeanPrice || 0,
      targetPriceHigh: data.targetHighPrice || 0,
      targetPriceLow: data.targetLowPrice || 0,
      numberOfAnalysts: data.numberOfAnalystOpinions || 0,
      
      lastEarningsSurprise,
      avgEarningsSurprise,
      nextEarningsEstimate,
      currentQuarterGrowthEstimate,
      revenueEstimate,
      hasPositiveSurpriseHistory: data.earningsHistory 
        ? positiveSurprises >= Math.ceil(data.earningsHistory.length / 2) 
        : false,
      
      lastUpdated: new Date(),
      dataAvailable: true,
    };
  }
  
  /**
   * Obtiene un resumen simplificado con scores para la predicción
   */
  async getFinancialSummary(symbol: string, currentPrice: number): Promise<FinancialSummary | null> {
    const financials = await this.getFinancials(symbol);
    
    if (!financials || !financials.dataAvailable) {
      return null;
    }
    
    // Formatear números grandes
    const formatBillions = (num: number): string => {
      if (num >= 1e12) return `€${(num / 1e12).toFixed(1)}T`;
      if (num >= 1e9) return `€${(num / 1e9).toFixed(1)}B`;
      if (num >= 1e6) return `€${(num / 1e6).toFixed(0)}M`;
      return `€${num.toFixed(0)}`;
    };
    
    // Calcular diferencia vs precio objetivo
    const currentVsTarget = financials.targetPrice > 0
      ? ((financials.targetPrice - currentPrice) / currentPrice) * 100
      : 0;
    
    // --- CALCULAR SCORES ---
    
    // 1. Financial Health Score (basado en márgenes, liquidez, deuda)
    let healthScore = 50; // Base
    if (financials.profitMargin > 15) healthScore += 15;
    else if (financials.profitMargin > 10) healthScore += 10;
    else if (financials.profitMargin > 5) healthScore += 5;
    else if (financials.profitMargin < 0) healthScore -= 20;
    
    if (financials.currentRatio > 1.5) healthScore += 10;
    else if (financials.currentRatio < 1) healthScore -= 10;
    
    if (financials.debtToEquity < 50) healthScore += 10;
    else if (financials.debtToEquity > 150) healthScore -= 15;
    
    if (financials.returnOnEquity > 20) healthScore += 15;
    else if (financials.returnOnEquity > 10) healthScore += 5;
    
    healthScore = Math.max(0, Math.min(100, healthScore));
    
    // 2. Growth Score (basado en crecimiento de ingresos y beneficios)
    let growthScore = 50;
    if (financials.revenueGrowth > 20) growthScore += 25;
    else if (financials.revenueGrowth > 10) growthScore += 15;
    else if (financials.revenueGrowth > 5) growthScore += 5;
    else if (financials.revenueGrowth < 0) growthScore -= 20;
    
    if (financials.earningsGrowth > 25) growthScore += 25;
    else if (financials.earningsGrowth > 10) growthScore += 10;
    else if (financials.earningsGrowth < 0) growthScore -= 20;
    
    growthScore = Math.max(0, Math.min(100, growthScore));
    
    // 3. Value Score (basado en ratios de valoración)
    let valueScore = 50;
    if (financials.peRatio > 0) {
      if (financials.peRatio < 15) valueScore += 20;
      else if (financials.peRatio < 25) valueScore += 10;
      else if (financials.peRatio > 50) valueScore -= 15;
    }
    
    if (financials.pegRatio > 0 && financials.pegRatio < 1) valueScore += 15;
    else if (financials.pegRatio > 2) valueScore -= 10;
    
    if (currentVsTarget > 20) valueScore += 20; // Muy por debajo del objetivo
    else if (currentVsTarget > 10) valueScore += 10;
    else if (currentVsTarget < -10) valueScore -= 15; // Por encima del objetivo
    
    valueScore = Math.max(0, Math.min(100, valueScore));
    
    // 4. Analyst Score
    let analystScore = 50;
    if (financials.analystRating === 'Compra fuerte') analystScore = 90;
    else if (financials.analystRating === 'Comprar') analystScore = 75;
    else if (financials.analystRating === 'Mantener') analystScore = 50;
    else if (financials.analystRating === 'Vender') analystScore = 30;
    else if (financials.analystRating === 'Venta fuerte') analystScore = 10;
    
    // 5. NUEVO: Expectations Score (basado en earnings surprises)
    // Si la empresa supera consistentemente las expectativas, es alcista
    // Si decepciona, es bajista
    let expectationsScore = 50; // Neutral por defecto
    let expectationsOutlook = 'Sin datos';
    let hasExpectationsData = false; // Solo true si hay datos reales
    
    // Solo calcular si hay datos REALES de earnings surprise
    const hasEarningsData = financials.lastEarningsSurprise !== 0 || financials.avgEarningsSurprise !== 0;
    if (hasEarningsData) {
      hasExpectationsData = true;
      // Última sorpresa de earnings tiene peso importante
      if (financials.lastEarningsSurprise > 10) {
        expectationsScore += 25; // Gran sorpresa positiva
      } else if (financials.lastEarningsSurprise > 5) {
        expectationsScore += 15;
      } else if (financials.lastEarningsSurprise > 0) {
        expectationsScore += 8;
      } else if (financials.lastEarningsSurprise < -10) {
        expectationsScore -= 25; // Gran decepción
      } else if (financials.lastEarningsSurprise < -5) {
        expectationsScore -= 15;
      } else if (financials.lastEarningsSurprise < 0) {
        expectationsScore -= 8;
      }
      
      // Historial de sorpresas también cuenta
      if (financials.avgEarningsSurprise > 5) {
        expectationsScore += 10;
      } else if (financials.avgEarningsSurprise < -5) {
        expectationsScore -= 10;
      }
      
      // Bonus si tiene historial positivo consistente
      if (financials.hasPositiveSurpriseHistory) {
        expectationsScore += 10;
      }
      
      // Determinar outlook
      if (expectationsScore >= 70) {
        expectationsOutlook = 'Supera expectativas';
      } else if (expectationsScore >= 55) {
        expectationsOutlook = 'Cumple expectativas';
      } else if (expectationsScore <= 35) {
        expectationsOutlook = 'Decepciona';
      } else {
        expectationsOutlook = 'Mixto';
      }
      
      console.log(`[Financials] Expectations score: ${expectationsScore} (${expectationsOutlook})`);
    } else {
      console.log(`[Financials] Sin datos de earnings surprise, expectations no aplica`);
    }
    
    expectationsScore = Math.max(0, Math.min(100, expectationsScore));

    // Overall Score (ponderado) - ACTUALIZADO con expectativas
    // Las expectativas del mercado son muy importantes para movimientos a corto plazo
    // SOLO incluir expectations si hay datos reales
    let overallScore: number;
    if (hasExpectationsData) {
      overallScore = Math.round(
        (healthScore * 0.20) +
        (growthScore * 0.20) +
        (valueScore * 0.20) +
        (analystScore * 0.15) +
        (expectationsScore * 0.25)
      );
    } else {
      // Sin datos de expectations, redistribuir pesos
      overallScore = Math.round(
        (healthScore * 0.25) +
        (growthScore * 0.25) +
        (valueScore * 0.25) +
        (analystScore * 0.25)
      );
    }
    
    return {
      revenue: formatBillions(financials.revenue),
      revenueGrowth: financials.revenueGrowth,
      netIncome: formatBillions(financials.netIncome),
      earningsGrowth: financials.earningsGrowth,
      profitMargin: financials.profitMargin,
      peRatio: financials.peRatio,
      analystRating: financials.analystRating,
      targetPrice: financials.targetPrice,
      currentVsTarget,
      lastEarningsSurprise: financials.lastEarningsSurprise,
      avgEarningsSurprise: financials.avgEarningsSurprise,
      expectationsOutlook,
      financialHealthScore: healthScore,
      growthScore,
      valueScore,
      analystScore,
      expectationsScore,
      hasExpectationsData, // NUEVO: indica si hay datos reales
      overallScore,
      dataAvailable: true, // Si llegamos aquí, hay datos disponibles
    };
  }
  
  /**
   * Formatea los datos financieros para mostrar en la UI
   */
  formatForDisplay(summary: FinancialSummary): {
    items: Array<{ label: string; value: string; color: string }>;
    conclusion: string;
  } {
    const getColor = (value: number, thresholds: [number, number] = [0, 0]): string => {
      if (value > thresholds[1]) return '#4CAF50'; // Verde
      if (value < thresholds[0]) return '#F44336'; // Rojo
      return '#FF9800'; // Naranja
    };
    
    const items = [
      {
        label: 'Ingresos',
        value: summary.revenue,
        color: '#333',
      },
      {
        label: 'Crec. Ingresos',
        value: `${summary.revenueGrowth >= 0 ? '+' : ''}${summary.revenueGrowth.toFixed(1)}%`,
        color: getColor(summary.revenueGrowth, [0, 10]),
      },
      {
        label: 'Beneficio Neto',
        value: summary.netIncome,
        color: '#333',
      },
      {
        label: 'Crec. Beneficio',
        value: `${summary.earningsGrowth >= 0 ? '+' : ''}${summary.earningsGrowth.toFixed(1)}%`,
        color: getColor(summary.earningsGrowth, [-5, 10]),
      },
      {
        label: 'Margen Neto',
        value: `${summary.profitMargin.toFixed(1)}%`,
        color: getColor(summary.profitMargin, [5, 15]),
      },
      {
        label: 'PER',
        value: summary.peRatio > 0 ? summary.peRatio.toFixed(1) : 'N/A',
        color: summary.peRatio > 0 ? (summary.peRatio < 25 ? '#4CAF50' : summary.peRatio > 40 ? '#F44336' : '#FF9800') : '#888',
      },
    ];
    
    // Generar conclusión basada en los scores
    let conclusion = '';
    if (summary.overallScore >= 70) {
      conclusion = `Fundamentales sólidos (${summary.overallScore}/100). `;
      if (summary.growthScore >= 70) conclusion += `Crecimiento fuerte (ingresos ${summary.revenueGrowth >= 0 ? '+' : ''}${summary.revenueGrowth.toFixed(0)}%). `;
      if (summary.currentVsTarget > 10) conclusion += `Precio ${summary.currentVsTarget.toFixed(0)}% por debajo del objetivo de analistas (€${summary.targetPrice.toFixed(2)}). `;
      conclusion += `Rating: ${summary.analystRating}.`;
    } else if (summary.overallScore >= 50) {
      conclusion = `Fundamentales aceptables (${summary.overallScore}/100). `;
      if (summary.revenueGrowth < 5) conclusion += `Crecimiento moderado. `;
      if (summary.currentVsTarget > 0) conclusion += `Potencial alcista ${summary.currentVsTarget.toFixed(0)}% según analistas. `;
      else conclusion += `Precio cerca del objetivo de analistas. `;
      conclusion += `Rating: ${summary.analystRating}.`;
    } else {
      conclusion = `Fundamentales débiles (${summary.overallScore}/100). `;
      if (summary.revenueGrowth < 0) conclusion += `Ingresos cayendo (${summary.revenueGrowth.toFixed(0)}%). `;
      if (summary.profitMargin < 5) conclusion += `Márgenes bajos (${summary.profitMargin.toFixed(1)}%). `;
      if (summary.currentVsTarget < 0) conclusion += `Precio ${Math.abs(summary.currentVsTarget).toFixed(0)}% por encima del objetivo. `;
      conclusion += `Rating: ${summary.analystRating}.`;
    }
    
    return { items, conclusion };
  }
}

export const companyFinancialsService = new CompanyFinancialsService();
