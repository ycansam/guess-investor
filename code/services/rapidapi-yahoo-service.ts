/**
 * Servicio para acceder a Yahoo Finance via RapidAPI
 * Esto permite acceder a los endpoints v10/quoteSummary que están bloqueados (401)
 * cuando se acceden directamente.
 *
 * API: https://rapidapi.com/sparior/api/yahoo-finance15
 * Plan gratuito: 100 requests/mes (Basic)
 */

// Configuración de RapidAPI - Yahoo Finance 15 (sparior)
const RAPIDAPI_HOST = 'yahoo-finance15.p.rapidapi.com';

// Obtener API key desde variables de entorno
const getRapidApiKey = (): string | null => {
  // @ts-ignore - Expo inyecta estas variables en tiempo de build
  const envKey = process.env.EXPO_PUBLIC_RAPIDAPI_KEY;
  if (envKey) {
    console.log('[RapidAPI] API key found in env');
    return envKey;
  }

  // Fallback: key hardcodeada temporalmente para testing
  const hardcodedKey = 'de70d66d8emsh2c1ee976f1ba148p1b6a28jsna242656ef045';
  console.log('[RapidAPI] Using hardcoded API key (temporary)');
  return hardcodedKey;
};

// Caché para reducir llamadas a la API (100/mes es muy poco)
const CACHE_DURATION = 60 * 60 * 1000; // 1 hora
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}
const rapidApiCache = new Map<string, CacheEntry<any>>();

/**
 * Datos del quoteSummary de Yahoo Finance
 */
export interface YahooQuoteSummary {
  // Asset Profile
  sector?: string;
  industry?: string;
  longBusinessSummary?: string;
  country?: string;

  // Summary Detail
  previousClose?: number;
  open?: number;
  dayLow?: number;
  dayHigh?: number;
  volume?: number;
  averageVolume?: number;
  marketCap?: number;
  fiftyTwoWeekLow?: number;
  fiftyTwoWeekHigh?: number;
  priceToSalesTrailing12Months?: number;
  fiftyDayAverage?: number;
  twoHundredDayAverage?: number;
  trailingPE?: number;
  forwardPE?: number;
  dividendYield?: number;
  payoutRatio?: number;

  // Financial Data
  currentPrice?: number;
  targetHighPrice?: number;
  targetLowPrice?: number;
  targetMeanPrice?: number;
  targetMedianPrice?: number;
  recommendationMean?: number;
  recommendationKey?: string;
  numberOfAnalystOpinions?: number;
  totalCash?: number;
  totalDebt?: number;
  totalRevenue?: number;
  revenuePerShare?: number;
  revenueGrowth?: number;
  grossMargins?: number;
  operatingMargins?: number;
  profitMargins?: number;
  earningsGrowth?: number;
  returnOnAssets?: number;
  returnOnEquity?: number;
  freeCashflow?: number;
  operatingCashflow?: number;
  debtToEquity?: number;
  currentRatio?: number;

  // Default Key Statistics
  enterpriseValue?: number;
  pegRatio?: number;
  priceToBook?: number;
  beta?: number;
  trailingEps?: number;
  forwardEps?: number;
  bookValue?: number;
  sharesOutstanding?: number;
  floatShares?: number;
  heldPercentInsiders?: number;
  heldPercentInstitutions?: number;
  shortRatio?: number;
  shortPercentOfFloat?: number;

  // Earnings History (últimos 4 trimestres)
  earningsHistory?: Array<{
    fiscalQuarter: string;
    epsActual: number;
    epsEstimate: number;
    epsDifference: number;
    surprisePercent: number;
  }>;

  // Earnings Trend (estimaciones futuras)
  earningsTrend?: {
    currentQuarterEstimate?: number;
    nextQuarterEstimate?: number;
    currentYearEstimate?: number;
    nextYearEstimate?: number;
    revenueEstimateCurrent?: number;
    revenueEstimateNext?: number;
  };

  // Recommendation Trend
  recommendationTrend?: {
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
  };

  // Upgrade/Downgrade History
  upgradeDowngradeHistory?: Array<{
    firm: string;
    toGrade: string;
    fromGrade: string;
    action: string;
    epochGradeDate: number;
  }>;

  // Institutional Ownership
  institutionalOwnership?: {
    ownershipPercent: number;
    institutionCount: number;
  };

  // Insider Transactions
  insiderTransactions?: Array<{
    name: string;
    relation: string;
    shares: number;
    value: number;
    transactionType: string;
    startDate: number;
  }>;

  // Calendar Events
  calendarEvents?: {
    earningsDate?: number;
    earningsDateEnd?: number;
    dividendDate?: number;
    exDividendDate?: number;
  };

  // Metadata
  symbol: string;
  shortName?: string;
  longName?: string;
  currency?: string;
  exchangeName?: string;

  // Service metadata
  dataAvailable: boolean;
  lastUpdated: Date;
}

/**
 * Clase principal del servicio RapidAPI Yahoo Finance
 */
class RapidApiYahooService {
  private apiKey: string | null = null;

  constructor() {
    this.apiKey = getRapidApiKey();
    if (!this.apiKey) {
      console.warn(
        '[RapidAPI] No API key configured. Set EXPO_PUBLIC_RAPIDAPI_KEY in .env'
      );
    } else {
      console.log('[RapidAPI] Service initialized with API key');
    }
  }

  /**
   * Verifica si el servicio está disponible
   */
  isAvailable(): boolean {
    const available = !!this.apiKey;
    console.log(`[RapidAPI] isAvailable: ${available}`);
    return available;
  }

  /**
   * Obtiene un módulo específico para un símbolo
   */
  private async getModule(symbol: string, module: string): Promise<any> {
    if (!this.apiKey) return null;

    try {
      const url = `https://${RAPIDAPI_HOST}/api/v1/markets/stock/modules?ticker=${encodeURIComponent(symbol)}&module=${module}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-rapidapi-host': RAPIDAPI_HOST,
          'x-rapidapi-key': this.apiKey,
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        console.error(`[RapidAPI] HTTP ${response.status} for ${symbol}/${module}`);
        return null;
      }

      const data = await response.json();
      return data.body || null;
    } catch (error: any) {
      console.error(`[RapidAPI] Error fetching ${module}:`, error.message);
      return null;
    }
  }

  /**
   * Obtiene el quoteSummary completo de un símbolo
   * Combina múltiples módulos en un solo objeto
   */
  async getQuoteSummary(symbol: string): Promise<YahooQuoteSummary | null> {
    if (!this.apiKey) {
      console.log('[RapidAPI] API key not configured');
      return null;
    }

    // Verificar caché
    const cacheKey = `quoteSummary:${symbol}`;
    const cached = rapidApiCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`[RapidAPI] Cache hit for ${symbol}`);
      return cached.data;
    }

    try {
      console.log(`[RapidAPI] Fetching data for ${symbol} via yahoo-finance15`);

      // Obtener los módulos más importantes en paralelo
      const [
        financialData,
        assetProfile,
        keyStats,
        earningsHistory,
        recommendationTrend,
        calendarEvents,
      ] = await Promise.all([
        this.getModule(symbol, 'financial-data'),
        this.getModule(symbol, 'asset-profile'),
        this.getModule(symbol, 'default-key-statistics'),
        this.getModule(symbol, 'earnings-history'),
        this.getModule(symbol, 'recommendation-trend'),
        this.getModule(symbol, 'calendar-events'),
      ]);

      if (!financialData && !assetProfile) {
        console.log(`[RapidAPI] No data available for ${symbol}`);
        return null;
      }

      const parsed = this.parseModules(symbol, {
        financialData,
        assetProfile,
        keyStats,
        earningsHistory,
        recommendationTrend,
        calendarEvents,
      });

      // Guardar en caché
      rapidApiCache.set(cacheKey, { data: parsed, timestamp: Date.now() });
      console.log(`[RapidAPI] Data fetched and cached for ${symbol}`);

      return parsed;
    } catch (error: any) {
      console.error(`[RapidAPI] Error fetching ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Parsea los módulos al formato YahooQuoteSummary
   */
  private parseModules(
    symbol: string,
    modules: {
      financialData: any;
      assetProfile: any;
      keyStats: any;
      earningsHistory: any;
      recommendationTrend: any;
      calendarEvents: any;
    }
  ): YahooQuoteSummary {
    const { financialData, assetProfile, keyStats, earningsHistory, recommendationTrend, calendarEvents } = modules;

    // Helper para extraer valores
    const getValue = (obj: any): number | undefined => {
      if (obj === null || obj === undefined) return undefined;
      if (typeof obj === 'number') return obj;
      return obj.raw ?? obj.value ?? undefined;
    };

    // Parsear earnings history
    const parsedEarningsHistory = (earningsHistory?.history || []).map((q: any) => ({
      fiscalQuarter: q.quarter?.fmt || q.fiscalQuarter || '',
      epsActual: getValue(q.epsActual) || 0,
      epsEstimate: getValue(q.epsEstimate) || 0,
      epsDifference: getValue(q.epsDifference) || 0,
      surprisePercent: getValue(q.surprisePercent) || 0,
    }));

    // Parsear recommendation trend
    const recTrend = recommendationTrend?.trend?.[0] || {};

    // Parsear calendar events
    const earnings = calendarEvents?.earnings || {};
    const earningsDateRaw = earnings.earningsDate?.[0]?.raw;

    return {
      // Asset Profile
      sector: assetProfile?.sector,
      industry: assetProfile?.industry,
      longBusinessSummary: assetProfile?.longBusinessSummary,
      country: assetProfile?.country,

      // Financial Data
      currentPrice: getValue(financialData?.currentPrice),
      targetHighPrice: getValue(financialData?.targetHighPrice),
      targetLowPrice: getValue(financialData?.targetLowPrice),
      targetMeanPrice: getValue(financialData?.targetMeanPrice),
      targetMedianPrice: getValue(financialData?.targetMedianPrice),
      recommendationMean: getValue(financialData?.recommendationMean),
      recommendationKey: financialData?.recommendationKey,
      numberOfAnalystOpinions: getValue(financialData?.numberOfAnalystOpinions),
      totalCash: getValue(financialData?.totalCash),
      totalDebt: getValue(financialData?.totalDebt),
      totalRevenue: getValue(financialData?.totalRevenue),
      revenuePerShare: getValue(financialData?.revenuePerShare),
      revenueGrowth: getValue(financialData?.revenueGrowth),
      grossMargins: getValue(financialData?.grossMargins),
      operatingMargins: getValue(financialData?.operatingMargins),
      profitMargins: getValue(financialData?.profitMargins),
      earningsGrowth: getValue(financialData?.earningsGrowth),
      returnOnAssets: getValue(financialData?.returnOnAssets),
      returnOnEquity: getValue(financialData?.returnOnEquity),
      freeCashflow: getValue(financialData?.freeCashflow),
      operatingCashflow: getValue(financialData?.operatingCashflow),
      debtToEquity: getValue(financialData?.debtToEquity),
      currentRatio: getValue(financialData?.currentRatio),

      // Key Statistics
      enterpriseValue: getValue(keyStats?.enterpriseValue),
      pegRatio: getValue(keyStats?.pegRatio),
      priceToBook: getValue(keyStats?.priceToBook),
      beta: getValue(keyStats?.beta),
      trailingEps: getValue(keyStats?.trailingEps),
      forwardEps: getValue(keyStats?.forwardEps),
      bookValue: getValue(keyStats?.bookValue),
      sharesOutstanding: getValue(keyStats?.sharesOutstanding),
      floatShares: getValue(keyStats?.floatShares),
      heldPercentInsiders: getValue(keyStats?.heldPercentInsiders),
      heldPercentInstitutions: getValue(keyStats?.heldPercentInstitutions),
      shortRatio: getValue(keyStats?.shortRatio),
      shortPercentOfFloat: getValue(keyStats?.shortPercentOfFloat),
      trailingPE: getValue(keyStats?.trailingPE),
      forwardPE: getValue(keyStats?.forwardPE),
      priceToSalesTrailing12Months: getValue(keyStats?.priceToSalesTrailing12Months),

      // Earnings History
      earningsHistory: parsedEarningsHistory.length > 0 ? parsedEarningsHistory : undefined,

      // Recommendation Trend
      recommendationTrend: {
        strongBuy: recTrend.strongBuy || 0,
        buy: recTrend.buy || 0,
        hold: recTrend.hold || 0,
        sell: recTrend.sell || 0,
        strongSell: recTrend.strongSell || 0,
      },

      // Calendar Events
      calendarEvents: {
        earningsDate: earningsDateRaw,
        dividendDate: getValue(calendarEvents?.dividendDate),
        exDividendDate: getValue(calendarEvents?.exDividendDate),
      },

      // Metadata
      symbol,
      shortName: assetProfile?.shortName,
      longName: assetProfile?.longName || assetProfile?.companyOfficers?.[0]?.name,
      currency: financialData?.financialCurrency,

      // Service metadata
      dataAvailable: !!(financialData || assetProfile),
      lastUpdated: new Date(),
    };
  }

  /**
   * Limpia la caché
   */
  clearCache(): void {
    rapidApiCache.clear();
    console.log('[RapidAPI] Cache cleared');
  }

  /**
   * Obtiene estadísticas de uso de la caché
   */
  getCacheStats(): { entries: number; oldestEntry: Date | null } {
    let oldestTimestamp = Infinity;
    rapidApiCache.forEach((entry) => {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
      }
    });

    return {
      entries: rapidApiCache.size,
      oldestEntry: oldestTimestamp !== Infinity ? new Date(oldestTimestamp) : null,
    };
  }
}

// Exportar instancia singleton
export const rapidApiYahooService = new RapidApiYahooService();

// Exportar también la clase para testing
export { RapidApiYahooService };
