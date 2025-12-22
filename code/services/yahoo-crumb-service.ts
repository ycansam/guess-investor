/**
 * Yahoo Finance Crumb Service
 * 
 * Yahoo Finance v10 API requiere un "crumb" token para autenticación.
 * Este servicio obtiene y gestiona el crumb automáticamente.
 * 
 * Estrategia:
 * 1. Visitar una página de Yahoo Finance para obtener cookies
 * 2. Usar esas cookies para obtener el crumb desde el endpoint específico
 * 3. Usar el crumb en todas las peticiones a v10/quoteSummary
 */

// Caché del crumb
interface CrumbCache {
  crumb: string;
  cookies: string;
  timestamp: number;
}

let crumbCache: CrumbCache | null = null;
const CRUMB_VALIDITY = 30 * 60 * 1000; // 30 minutos

/**
 * Obtiene el crumb y cookies de Yahoo Finance
 */
async function fetchCrumb(): Promise<{ crumb: string; cookies: string } | null> {
  try {
    console.log('[YahooCrumb] Obteniendo nuevo crumb...');
    
    // Paso 1: Visitar la página principal para obtener cookies
    const initialResponse = await fetch('https://finance.yahoo.com', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    // Extraer cookies de la respuesta
    const setCookieHeader = initialResponse.headers.get('set-cookie');
    if (!setCookieHeader) {
      console.log('[YahooCrumb] No se obtuvieron cookies iniciales');
      // Intentar sin cookies (a veces funciona)
    }
    
    // Parsear cookies relevantes
    let cookies = '';
    if (setCookieHeader) {
      const cookieMatches = setCookieHeader.match(/([^,;\s]+=[^,;\s]+)/g);
      if (cookieMatches) {
        cookies = cookieMatches
          .filter(c => c.startsWith('A3=') || c.startsWith('A1=') || c.startsWith('GUC='))
          .join('; ');
      }
    }

    // Paso 2: Obtener el crumb
    // Intentar múltiples endpoints
    const crumbUrls = [
      'https://query1.finance.yahoo.com/v1/test/getcrumb',
      'https://query2.finance.yahoo.com/v1/test/getcrumb',
    ];

    for (const crumbUrl of crumbUrls) {
      try {
        const crumbResponse = await fetch(crumbUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/plain',
            ...(cookies ? { 'Cookie': cookies } : {}),
          },
        });

        if (crumbResponse.ok) {
          const crumb = await crumbResponse.text();
          if (crumb && crumb.length > 5 && !crumb.includes('<')) {
            console.log(`[YahooCrumb] Crumb obtenido: ${crumb.slice(0, 10)}...`);
            return { crumb, cookies };
          }
        }
      } catch (e) {
        console.log(`[YahooCrumb] Fallo con ${crumbUrl}`);
      }
    }

    console.log('[YahooCrumb] No se pudo obtener el crumb');
    return null;
  } catch (error) {
    console.error('[YahooCrumb] Error obteniendo crumb:', error);
    return null;
  }
}

/**
 * Obtiene un crumb válido (de caché o nuevo)
 */
async function getCrumb(): Promise<{ crumb: string; cookies: string } | null> {
  // Verificar si el crumb en caché es válido
  if (crumbCache && Date.now() - crumbCache.timestamp < CRUMB_VALIDITY) {
    return { crumb: crumbCache.crumb, cookies: crumbCache.cookies };
  }

  // Obtener nuevo crumb
  const result = await fetchCrumb();
  if (result) {
    crumbCache = {
      crumb: result.crumb,
      cookies: result.cookies,
      timestamp: Date.now(),
    };
    return result;
  }

  return null;
}

/**
 * Datos del quoteSummary
 */
export interface QuoteSummaryData {
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
  trailingPE?: number;
  forwardPE?: number;
  priceToBook?: number;
  dividendYield?: number;

  // Financial Data
  targetMeanPrice?: number;
  targetHighPrice?: number;
  targetLowPrice?: number;
  numberOfAnalystOpinions?: number;
  recommendationKey?: string;
  recommendationMean?: number;
  totalRevenue?: number;
  revenueGrowth?: number;
  grossMargins?: number;
  operatingMargins?: number;
  profitMargins?: number;
  returnOnEquity?: number;
  returnOnAssets?: number;
  debtToEquity?: number;
  currentRatio?: number;
  earningsGrowth?: number;
  freeCashflow?: number;

  // Key Statistics
  beta?: number;
  trailingEps?: number;
  forwardEps?: number;
  pegRatio?: number;
  enterpriseValue?: number;
  sharesOutstanding?: number;
  heldPercentInsiders?: number;
  heldPercentInstitutions?: number;
  shortRatio?: number;

  // Earnings
  earningsHistory?: Array<{
    quarter: string;
    epsActual: number;
    epsEstimate: number;
    surprise: number;
    surprisePercent: number;
  }>;

  // Institutional
  institutionsCount?: number;
  institutionsPercentHeld?: number;
  insiderPercentHeld?: number;

  // Recommendation Trend
  recommendationTrend?: {
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
  };

  // Calendar Events
  earningsDate?: number;
  dividendDate?: number;
  exDividendDate?: number;

  // Asset Profile
  sector?: string;
  industry?: string;
  country?: string;
  
  // Metadata
  symbol: string;
  shortName?: string;
  longName?: string;
  currency?: string;
  hasData: boolean;
}

// Caché de quoteSummary
const quoteSummaryCache = new Map<string, { data: QuoteSummaryData; timestamp: number }>();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hora (estos datos no cambian mucho)

/**
 * Obtiene el quoteSummary de un símbolo usando el crumb
 */
export async function getQuoteSummary(symbol: string): Promise<QuoteSummaryData | null> {
  // Verificar caché
  const cached = quoteSummaryCache.get(symbol);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log(`[YahooCrumb] Cache hit for ${symbol}`);
    return cached.data;
  }

  console.log(`[YahooCrumb] Fetching quoteSummary for ${symbol}`);

  // Primero intentar sin crumb (a veces funciona para algunos endpoints)
  const modules = 'summaryDetail,financialData,defaultKeyStatistics,earningsHistory,recommendationTrend,majorHoldersBreakdown,institutionOwnership,calendarEvents,assetProfile';
  
  // Intentar obtener crumb
  const crumbData = await getCrumb();
  
  const baseUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}`;
  const url = crumbData ? `${baseUrl}&crumb=${encodeURIComponent(crumbData.crumb)}` : baseUrl;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        ...(crumbData?.cookies ? { 'Cookie': crumbData.cookies } : {}),
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      // Si falla con 401, invalidar el crumb
      if (response.status === 401) {
        console.log('[YahooCrumb] Crumb inválido, limpiando caché');
        crumbCache = null;
      }
      console.log(`[YahooCrumb] HTTP ${response.status} for ${symbol}`);
      return createEmptyQuoteSummary(symbol);
    }

    const json = await response.json();
    const result = json.quoteSummary?.result?.[0];

    if (!result) {
      console.log(`[YahooCrumb] No data in response for ${symbol}`);
      return createEmptyQuoteSummary(symbol);
    }

    // Parsear los datos
    const parsed = parseQuoteSummary(symbol, result);
    
    // Guardar en caché
    quoteSummaryCache.set(symbol, { data: parsed, timestamp: Date.now() });
    
    return parsed;
  } catch (error: any) {
    console.error(`[YahooCrumb] Error fetching ${symbol}:`, error.message);
    return createEmptyQuoteSummary(symbol);
  }
}

function createEmptyQuoteSummary(symbol: string): QuoteSummaryData {
  return {
    symbol,
    hasData: false,
  };
}

function parseQuoteSummary(symbol: string, data: any): QuoteSummaryData {
  const sd = data.summaryDetail || {};
  const fd = data.financialData || {};
  const ks = data.defaultKeyStatistics || {};
  const eh = data.earningsHistory?.history || [];
  const rt = data.recommendationTrend?.trend?.[0] || {};
  const mh = data.majorHoldersBreakdown || {};
  const ce = data.calendarEvents || {};
  const ap = data.assetProfile || {};

  // Parsear earnings history
  const earningsHistory = eh.map((e: any) => ({
    quarter: e.fiscalQuarter || '',
    epsActual: e.epsActual?.raw || 0,
    epsEstimate: e.epsEstimate?.raw || 0,
    surprise: e.epsDifference?.raw || 0,
    surprisePercent: e.surprisePercent?.raw || 0,
  }));

  // Parsear recommendation trend
  const recommendationTrend = rt ? {
    strongBuy: rt.strongBuy || 0,
    buy: rt.buy || 0,
    hold: rt.hold || 0,
    sell: rt.sell || 0,
    strongSell: rt.strongSell || 0,
  } : undefined;

  return {
    symbol,
    shortName: data.quoteType?.shortName,
    longName: data.quoteType?.longName,
    currency: sd.currency,
    hasData: true,

    // Summary Detail
    previousClose: sd.previousClose?.raw,
    open: sd.open?.raw,
    dayLow: sd.dayLow?.raw,
    dayHigh: sd.dayHigh?.raw,
    volume: sd.volume?.raw,
    averageVolume: sd.averageVolume?.raw,
    marketCap: sd.marketCap?.raw,
    fiftyTwoWeekLow: sd.fiftyTwoWeekLow?.raw,
    fiftyTwoWeekHigh: sd.fiftyTwoWeekHigh?.raw,
    trailingPE: sd.trailingPE?.raw,
    forwardPE: sd.forwardPE?.raw,
    priceToBook: ks.priceToBook?.raw,
    dividendYield: sd.dividendYield?.raw,

    // Financial Data
    targetMeanPrice: fd.targetMeanPrice?.raw,
    targetHighPrice: fd.targetHighPrice?.raw,
    targetLowPrice: fd.targetLowPrice?.raw,
    numberOfAnalystOpinions: fd.numberOfAnalystOpinions?.raw,
    recommendationKey: fd.recommendationKey,
    recommendationMean: fd.recommendationMean?.raw,
    totalRevenue: fd.totalRevenue?.raw,
    revenueGrowth: fd.revenueGrowth?.raw,
    grossMargins: fd.grossMargins?.raw,
    operatingMargins: fd.operatingMargins?.raw,
    profitMargins: fd.profitMargins?.raw,
    returnOnEquity: fd.returnOnEquity?.raw,
    returnOnAssets: fd.returnOnAssets?.raw,
    debtToEquity: fd.debtToEquity?.raw,
    currentRatio: fd.currentRatio?.raw,
    earningsGrowth: fd.earningsGrowth?.raw,
    freeCashflow: fd.freeCashflow?.raw,

    // Key Statistics
    beta: ks.beta?.raw,
    trailingEps: ks.trailingEps?.raw,
    forwardEps: ks.forwardEps?.raw,
    pegRatio: ks.pegRatio?.raw,
    enterpriseValue: ks.enterpriseValue?.raw,
    sharesOutstanding: ks.sharesOutstanding?.raw,
    heldPercentInsiders: mh.insidersPercentHeld?.raw,
    heldPercentInstitutions: mh.institutionsPercentHeld?.raw,
    shortRatio: ks.shortRatio?.raw,

    // Earnings History
    earningsHistory: earningsHistory.length > 0 ? earningsHistory : undefined,

    // Institutional
    institutionsCount: mh.institutionsCount?.raw,
    institutionsPercentHeld: mh.institutionsPercentHeld?.raw,
    insiderPercentHeld: mh.insidersPercentHeld?.raw,

    // Recommendation Trend
    recommendationTrend,

    // Calendar Events
    earningsDate: ce.earnings?.earningsDate?.[0]?.raw,
    dividendDate: ce.dividendDate?.raw,
    exDividendDate: ce.exDividendDate?.raw,

    // Asset Profile
    sector: ap.sector,
    industry: ap.industry,
    country: ap.country,
  };
}

/**
 * Verifica si el servicio de crumb está disponible
 */
export async function testCrumbService(): Promise<boolean> {
  const crumb = await getCrumb();
  return !!crumb;
}

// Exportar como servicio singleton
export const yahooCrumbService = {
  getQuoteSummary,
  testCrumbService,
};
