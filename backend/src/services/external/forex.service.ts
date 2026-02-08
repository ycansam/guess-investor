/**
 * Servicio de Análisis de Forex Avanzado v2.0
 * 
 * CARACTERÍSTICAS:
 * - Datos REALES de tipos de cambio de Yahoo Finance
 * - Dollar Index (DXY) para contexto global
 * - Volatilidad implícita del mercado forex
 * - Análisis de correlaciones entre divisas
 * - Carry Trade indicators (diferenciales de tipos)
 * - Risk-on/Risk-off sentiment
 * - Análisis por región (EM vs DM)
 * - Pares cruzados para mayor precisión
 * - Detección de eventos de alta volatilidad
 */

import { logger } from '../../middleware/logger.js';

export interface ForexImpact {
  baseCurrency: string;
  pair: string; // El par analizado (ej: GBPUSD, EURUSD)
  trend: 'strengthening' | 'weakening' | 'stable';
  changePercent: number; // Cambio real del par en el período
  weeklyChange?: number; // Cambio semanal para detectar momentum
  dxyChange?: number; // Cambio del Dollar Index
  volatility?: 'high' | 'normal' | 'low'; // Volatilidad del mercado forex
  riskSentiment?: 'risk-on' | 'risk-off' | 'neutral'; // Sentimiento de riesgo global
  regionalTrend?: string; // Tendencia de la región
  carryTradeImpact?: number; // Impacto del carry trade (-100 a +100)
  correlatedPairs?: string[]; // Pares correlacionados
  forexScore: number; // -100 a +100
  hasData: boolean;
  dataQuality: 'high' | 'medium' | 'low';
  summary: string;
}

// Cache por par de divisas
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutos

// ===== CLASIFICACIÓN DE DIVISAS =====

// Divisas de mercados desarrollados (tienden a moverse juntas en risk-off)
const DEVELOPED_MARKET_CURRENCIES = new Set(['EUR', 'GBP', 'CHF', 'JPY', 'AUD', 'CAD', 'NZD', 'SEK', 'NOK', 'DKK']);

// Divisas de mercados emergentes (más volátiles, sensibles a risk-on/off)
const EMERGING_MARKET_CURRENCIES = new Set(['CNY', 'KRW', 'SGD', 'TWD', 'THB', 'INR', 'MXN', 'BRL', 'ZAR', 'TRY', 'PLN', 'CZK', 'HUF']);

// Safe Haven Currencies - se fortalecen en risk-off
const SAFE_HAVEN_CURRENCIES = new Set(['USD', 'CHF', 'JPY']);

// Commodity currencies - correlacionadas con materias primas
const COMMODITY_CURRENCIES = new Set(['AUD', 'CAD', 'NZD', 'NOK', 'BRL', 'MXN', 'ZAR']);

// High-yield currencies (carry trade targets)
const HIGH_YIELD_CURRENCIES = new Set(['BRL', 'MXN', 'TRY', 'ZAR', 'INR']);

// Mapeo de sufijos a moneda base - AMPLIADO v2
const EXCHANGE_TO_CURRENCY: Record<string, string> = {
  // Europa - Euro
  '.MC': 'EUR', '.MA': 'EUR', // España (Madrid)
  '.PA': 'EUR', // Francia (Paris)
  '.DE': 'EUR', '.F': 'EUR', '.XETRA': 'EUR', '.MU': 'EUR', '.BE': 'EUR', '.DU': 'EUR', '.HA': 'EUR', '.HM': 'EUR', '.SG': 'EUR', // Alemania
  '.MI': 'EUR', // Italia (Milan)
  '.AS': 'EUR', // Países Bajos (Amsterdam)
  '.BR': 'EUR', // Bélgica (Bruselas)
  '.VI': 'EUR', // Austria (Viena)
  '.HE': 'EUR', // Finlandia (Helsinki)
  '.LS': 'EUR', // Portugal (Lisboa)
  '.IR': 'EUR', // Irlanda
  '.AT': 'EUR', // Grecia (Atenas)
  // UK
  '.L': 'GBP', '.IL': 'GBP', '.LSE': 'GBP',
  // Suiza
  '.SW': 'CHF', '.VX': 'CHF', '.ZU': 'CHF',
  // Escandinavia
  '.ST': 'SEK', // Suecia (Estocolmo)
  '.OL': 'NOK', // Noruega (Oslo)
  '.CO': 'DKK', // Dinamarca (Copenhague)
  '.IC': 'ISK', // Islandia
  // Europa del Este
  '.WA': 'PLN', // Polonia (Varsovia)
  '.PR': 'CZK', // Chequia (Praga)
  '.BU': 'HUF', // Hungría (Budapest)
  '.IS': 'TRY', // Turquía (Estambul)
  '.RU': 'RUB', '.ME': 'RUB', // Rusia (Moscú)
  // Asia
  '.T': 'JPY', '.TYO': 'JPY', '.JP': 'JPY', // Japón
  '.HK': 'HKD', // Hong Kong
  '.SS': 'CNY', '.SZ': 'CNY', '.SH': 'CNY', // China continental
  '.KS': 'KRW', '.KQ': 'KRW', // Corea del Sur
  '.SI': 'SGD', // Singapur
  '.TW': 'TWD', '.TWO': 'TWD', // Taiwán
  '.BK': 'THB', '.SET': 'THB', // Tailandia
  '.NS': 'INR', '.BO': 'INR', '.BSE': 'INR', // India
  '.JK': 'IDR', // Indonesia (Yakarta)
  '.KL': 'MYR', // Malasia (Kuala Lumpur)
  '.PS': 'PHP', // Filipinas
  '.VN': 'VND', // Vietnam
  // Oceanía
  '.AX': 'AUD', '.ASX': 'AUD', // Australia
  '.NZ': 'NZD', '.NZE': 'NZD', // Nueva Zelanda
  // América
  '.TO': 'CAD', '.V': 'CAD', '.CN': 'CAD', '.NEO': 'CAD', // Canadá
  '.MX': 'MXN', // México
  '.SA': 'BRL', '.BVMF': 'BRL', // Brasil
  '.BA': 'ARS', // Argentina
  '.SN': 'CLP', // Chile (Santiago)
  '.LM': 'PEN', // Perú (Lima)
  '.BVC': 'COP', // Colombia
  // África y Oriente Medio
  '.JO': 'ZAR', '.JSE': 'ZAR', // Sudáfrica
  '.TA': 'ILS', // Israel (Tel Aviv)
  '.CA': 'EGP', // Egipto (Cairo)
  '.QA': 'QAR', // Qatar
  '.DFM': 'AED', // Dubai Financial Market
  '.ADX': 'AED', // Abu Dhabi Exchange  
  '.SR': 'SAR', // Arabia Saudita
  '': 'USD', // USA por defecto
};

// Pares de Yahoo Finance para cada moneda vs USD - AMPLIADO v2
const CURRENCY_TO_PAIR: Record<string, string> = {
  // G10 - Mayores
  'EUR': 'EURUSD=X',
  'GBP': 'GBPUSD=X',
  'CHF': 'USDCHF=X',
  'JPY': 'USDJPY=X',
  'AUD': 'AUDUSD=X',
  'CAD': 'USDCAD=X',
  'NZD': 'NZDUSD=X',
  'SEK': 'USDSEK=X',
  'NOK': 'USDNOK=X',
  'DKK': 'USDDKK=X',
  // Asia
  'HKD': 'USDHKD=X',
  'CNY': 'USDCNY=X',
  'KRW': 'USDKRW=X',
  'SGD': 'USDSGD=X',
  'TWD': 'USDTWD=X',
  'THB': 'USDTHB=X',
  'INR': 'USDINR=X',
  'IDR': 'USDIDR=X',
  'MYR': 'USDMYR=X',
  'PHP': 'USDPHP=X',
  'VND': 'USDVND=X',
  // Emergentes América
  'MXN': 'USDMXN=X',
  'BRL': 'USDBRL=X',
  'ARS': 'USDARS=X',
  'CLP': 'USDCLP=X',
  'COP': 'USDCOP=X',
  'PEN': 'USDPEN=X',
  // Europa del Este
  'PLN': 'USDPLN=X',
  'CZK': 'USDCZK=X',
  'HUF': 'USDHUF=X',
  'TRY': 'USDTRY=X',
  'RUB': 'USDRUB=X',
  // Otros
  'ZAR': 'USDZAR=X',
  'ILS': 'USDILS=X',
};

// Pares que están cotizados como USD/XXX (cambio positivo = USD fuerte)
const USD_BASE_PAIRS = new Set([
  'CHF', 'JPY', 'CAD', 'SEK', 'NOK', 'DKK', // G10
  'HKD', 'CNY', 'KRW', 'SGD', 'TWD', 'THB', 'INR', 'IDR', 'MYR', 'PHP', 'VND', // Asia
  'MXN', 'BRL', 'ARS', 'CLP', 'COP', 'PEN', // LatAm
  'PLN', 'CZK', 'HUF', 'TRY', 'RUB', // Este Europa
  'ZAR', 'ILS' // Otros
]);

// Pares cruzados importantes para correlaciones
const CROSS_PAIRS: Record<string, string[]> = {
  'EUR': ['EURGBP=X', 'EURJPY=X', 'EURCHF=X'],
  'GBP': ['EURGBP=X', 'GBPJPY=X', 'GBPCHF=X'],
  'JPY': ['EURJPY=X', 'GBPJPY=X', 'AUDJPY=X', 'CADJPY=X'],
  'CHF': ['EURCHF=X', 'GBPCHF=X'],
  'AUD': ['AUDJPY=X', 'AUDNZD=X', 'AUDCAD=X'],
  'CAD': ['CADJPY=X', 'AUDCAD=X'],
  'NZD': ['AUDNZD=X', 'NZDJPY=X'],
};

// Dollar Index para contexto global
const DXY_SYMBOL = 'DX-Y.NYB';

// Volatility Index para forex (usar VIX como proxy)
const VIX_SYMBOL = '^VIX';

// Keywords para detectar commodities globales - AMPLIADO
const GLOBAL_COMMODITY_KEYWORDS = [
  // Metales preciosos
  'gold', 'silver', 'platinum', 'palladium', 'precious metal',
  'oro', 'plata', 'platino', 'paladio', 'metal precioso',
  // Energía
  'oil', 'crude', 'brent', 'wti', 'natural gas', 'lng', 'petroleum', 'energy',
  'petróleo', 'gas natural', 'energía', 'crudo',
  'coal', 'uranium', 'carbón', 'uranio',
  // Metales industriales
  'copper', 'iron ore', 'zinc', 'nickel', 'aluminum', 'aluminium', 'tin', 'lead', 'lithium', 'cobalt',
  'cobre', 'hierro', 'zinc', 'níquel', 'aluminio', 'estaño', 'plomo', 'litio', 'cobalto',
  // Agrícolas
  'wheat', 'corn', 'soybean', 'coffee', 'sugar', 'cotton', 'cocoa', 'rice', 'palm oil',
  'trigo', 'maíz', 'soja', 'café', 'azúcar', 'algodón', 'cacao', 'arroz', 'aceite de palma',
  // Genéricos
  'commodity', 'commodities', 'raw material', 'materias primas', 'mining', 'minería',
  'resources', 'recursos naturales', 'physical', 'ishares physical',
];

// Keywords para detectar empresas exportadoras - AMPLIADO
const EXPORTER_KEYWORDS = [
  'export', 'exporter', 'international', 'global', 'worldwide', 'multinational', 'overseas',
  'exportador', 'exportación', 'internacional', 'global', 'mundial', 'multinacional',
  'cross-border', 'foreign sales', 'foreign revenue', 'global presence',
  'ventas internacionales', 'presencia global', 'operaciones internacionales',
];

// Keywords para sectores sensibles a forex
const FOREX_SENSITIVE_SECTORS = {
  // Muy sensibles (alta exposición internacional)
  high: ['technology', 'pharma', 'luxury', 'automotive', 'aerospace', 'semiconductors'],
  // Moderadamente sensibles
  medium: ['industrial', 'chemicals', 'consumer goods', 'beverages', 'retail'],
  // Menos sensibles (más domésticos)
  low: ['utilities', 'telecom', 'real estate', 'banking', 'insurance', 'healthcare services'],
};

function detectCurrency(symbol: string): string {
  for (const [suffix, currency] of Object.entries(EXCHANGE_TO_CURRENCY)) {
    if (suffix && symbol.endsWith(suffix)) {
      return currency;
    }
  }
  return 'USD';
}

function isGlobalCommodity(symbol: string, assetName?: string): boolean {
  const searchText = `${symbol} ${assetName || ''}`.toLowerCase();
  return GLOBAL_COMMODITY_KEYWORDS.some(keyword => searchText.includes(keyword));
}

function isExporter(assetName?: string): boolean {
  if (!assetName) return false;
  const searchText = assetName.toLowerCase();
  return EXPORTER_KEYWORDS.some(keyword => searchText.includes(keyword));
}

/**
 * Determina la sensibilidad forex del activo por sector
 */
function getForexSensitivity(assetName?: string): 'high' | 'medium' | 'low' {
  if (!assetName) return 'medium';
  const name = assetName.toLowerCase();
  
  for (const sector of FOREX_SENSITIVE_SECTORS.high) {
    if (name.includes(sector)) return 'high';
  }
  for (const sector of FOREX_SENSITIVE_SECTORS.low) {
    if (name.includes(sector)) return 'low';
  }
  return 'medium';
}

/**
 * Determina si la moneda es safe haven
 */
function isSafeHaven(currency: string): boolean {
  return SAFE_HAVEN_CURRENCIES.has(currency);
}

/**
 * Determina si es moneda de mercado emergente
 */
function isEmergingMarket(currency: string): boolean {
  return EMERGING_MARKET_CURRENCIES.has(currency);
}

/**
 * Determina si es moneda commodity
 */
function isCommodityCurrency(currency: string): boolean {
  return COMMODITY_CURRENCIES.has(currency);
}

/**
 * Obtiene datos reales de un par de divisas de Yahoo Finance
 * Devuelve cambio mensual, semanal y volatilidad
 */
async function fetchForexData(pair: string): Promise<{ 
  monthlyChange: number; 
  weeklyChange: number;
  current: number;
  high: number;
  low: number;
  volatility: number; // Rango como % del precio
} | null> {
  const cached = cache.get(pair);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${pair}?range=1mo&interval=1d`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      logger.warn(`[Forex] Failed to fetch ${pair}: ${response.status}`);
      return null;
    }

    const json: any = await response.json();
    const result = json.chart?.result?.[0];
    const quotes = result?.indicators?.quote?.[0];

    if (!quotes?.close) {
      return null;
    }

    const closes = quotes.close.filter((c: number) => c > 0);
    const highs = quotes.high?.filter((h: number) => h > 0) || closes;
    const lows = quotes.low?.filter((l: number) => l > 0) || closes;
    
    if (closes.length < 2) {
      return null;
    }

    const currentRate = closes[closes.length - 1];
    const monthAgoRate = closes[0];
    const monthlyChange = ((currentRate - monthAgoRate) / monthAgoRate) * 100;
    
    // Calcular cambio semanal (últimos 5 días si hay suficientes datos)
    const weekAgoIndex = Math.max(0, closes.length - 6);
    const weekAgoRate = closes[weekAgoIndex];
    const weeklyChange = ((currentRate - weekAgoRate) / weekAgoRate) * 100;

    // Calcular volatilidad (rango como % del precio medio)
    const high = Math.max(...highs);
    const low = Math.min(...lows);
    const avgPrice = (high + low) / 2;
    const volatility = ((high - low) / avgPrice) * 100;

    const data = { monthlyChange, weeklyChange, current: currentRate, high, low, volatility };
    cache.set(pair, { data, timestamp: Date.now() });
    
    logger.info(`[Forex] ${pair}: Monthly ${monthlyChange.toFixed(2)}%, Weekly ${weeklyChange.toFixed(2)}%, Vol ${volatility.toFixed(2)}%`);
    return data;
  } catch (error) {
    logger.error(`[Forex] Error fetching ${pair}:`, error);
    return null;
  }
}

/**
 * Obtiene el Dollar Index (DXY) para contexto global
 */
async function fetchDXY(): Promise<{ change: number; current: number } | null> {
  const cached = cache.get('DXY');
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${DXY_SYMBOL}?range=1mo&interval=1d`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      return null;
    }

    const json: any = await response.json();
    const result = json.chart?.result?.[0];
    const quotes = result?.indicators?.quote?.[0];

    if (!quotes?.close) {
      return null;
    }

    const closes = quotes.close.filter((c: number) => c > 0);
    if (closes.length < 2) {
      return null;
    }

    const current = closes[closes.length - 1];
    const monthAgo = closes[0];
    const change = ((current - monthAgo) / monthAgo) * 100;

    const data = { change, current };
    cache.set('DXY', { data, timestamp: Date.now() });
    logger.info(`[Forex] DXY: ${change.toFixed(2)}% (${current.toFixed(2)})`);
    return data;
  } catch (error) {
    return null;
  }
}

/**
 * Obtiene VIX para determinar risk sentiment
 */
async function fetchVIX(): Promise<number | null> {
  const cached = cache.get('VIX');
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${VIX_SYMBOL}?range=5d&interval=1d`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) return null;

    const json: any = await response.json();
    const result = json.chart?.result?.[0];
    const quotes = result?.indicators?.quote?.[0];

    if (!quotes?.close) return null;

    const closes = quotes.close.filter((c: number) => c > 0);
    const current = closes[closes.length - 1];

    cache.set('VIX', { data: current, timestamp: Date.now() });
    return current;
  } catch (error) {
    return null;
  }
}

/**
 * Determina el risk sentiment basado en VIX y DXY
 */
function determineRiskSentiment(vix: number | null, dxyChange: number | null): 'risk-on' | 'risk-off' | 'neutral' {
  let riskScore = 0;
  
  if (vix !== null) {
    if (vix > 25) riskScore -= 2; // Alto VIX = risk-off
    else if (vix > 20) riskScore -= 1;
    else if (vix < 15) riskScore += 1; // Bajo VIX = risk-on
    else if (vix < 12) riskScore += 2;
  }
  
  if (dxyChange !== null) {
    // USD fuerte generalmente = risk-off
    if (dxyChange > 2) riskScore -= 1;
    else if (dxyChange < -2) riskScore += 1;
  }
  
  if (riskScore >= 2) return 'risk-on';
  if (riskScore <= -2) return 'risk-off';
  return 'neutral';
}

/**
 * Determina volatilidad del mercado forex
 */
function determineForexVolatility(forexVol: number, vix: number | null): 'high' | 'normal' | 'low' {
  // Volatilidad forex típica mensual: 1-4%
  if (forexVol > 4 || (vix !== null && vix > 25)) return 'high';
  if (forexVol < 1.5 && (vix === null || vix < 15)) return 'low';
  return 'normal';
}

/**
 * Genera análisis regional
 */
function getRegionalAnalysis(currency: string, change: number): string {
  if (EMERGING_MARKET_CURRENCIES.has(currency)) {
    if (change > 2) return 'Divisa EM fuerte, flujos positivos';
    if (change < -2) return 'Divisa EM débil, posible flight-to-quality';
    return 'Divisa EM estable';
  }
  
  if (DEVELOPED_MARKET_CURRENCIES.has(currency)) {
    if (currency === 'JPY' || currency === 'CHF') {
      if (change > 1) return `${getCurrencyName(currency)} como safe-haven fuerte`;
      if (change < -1) return `${getCurrencyName(currency)} safe-haven débil, risk-on`;
    }
    return 'Divisa DM con movimiento normal';
  }
  
  return '';
}

export const forexService = {
  async analyzeForexImpact(symbol: string, assetName?: string): Promise<ForexImpact> {
    // Cryptos se cotizan en USD, no aplica forex
    if (symbol.includes('-USD') || symbol.includes('-EUR')) {
      return this.getDefaultData('USD');
    }

    const currency = detectCurrency(symbol);
    
    // Fetch datos en paralelo: par principal, DXY, VIX
    const [dxyData, vix] = await Promise.all([
      fetchDXY(),
      fetchVIX(),
    ]);
    
    const dxyChange = dxyData?.change ?? null;
    const riskSentiment = determineRiskSentiment(vix, dxyChange);
    
    // Si ya es USD, no hay impacto forex directo pero damos contexto con DXY
    if (currency === 'USD') {
      const volatility = vix ? determineForexVolatility(2, vix) : 'normal';
      
      if (dxyChange !== null && Math.abs(dxyChange) > 1) {
        return {
          baseCurrency: 'USD',
          pair: 'DXY',
          trend: dxyChange > 0.5 ? 'strengthening' : dxyChange < -0.5 ? 'weakening' : 'stable',
          changePercent: dxyChange,
          dxyChange,
          volatility,
          riskSentiment,
          forexScore: 0,
          hasData: true,
          dataQuality: 'medium',
          summary: `💵 DXY ${dxyChange > 0 ? '+' : ''}${dxyChange.toFixed(1)}%. USD ${dxyChange > 0 ? 'fortalecido' : 'debilitado'}. ${riskSentiment === 'risk-off' ? '⚠️ Risk-off' : riskSentiment === 'risk-on' ? '✅ Risk-on' : ''}`,
        };
      }
      return this.getDefaultData('USD');
    }

    // Obtener el par correcto para esta moneda
    const pair = CURRENCY_TO_PAIR[currency];
    if (!pair) {
      logger.warn(`[Forex] No pair defined for currency ${currency}`);
      return this.getDefaultData(currency);
    }

    // Fetch datos del par
    const forexData = await fetchForexData(pair);

    if (!forexData) {
      return this.getDefaultData(currency);
    }

    const { monthlyChange, weeklyChange, volatility: forexVol } = forexData;
    const isCommodity = isGlobalCommodity(symbol, assetName);
    const isExporterCompany = isExporter(assetName);
    const forexSensitivity = getForexSensitivity(assetName);
    const isEM = isEmergingMarket(currency);
    const isSH = isSafeHaven(currency);
    const isCommodityCurr = isCommodityCurrency(currency);
    
    // Normalizar el cambio: queremos siempre "moneda local vs USD"
    const normalizedChange = USD_BASE_PAIRS.has(currency) ? -monthlyChange : monthlyChange;
    const normalizedWeekly = USD_BASE_PAIRS.has(currency) ? -weeklyChange : weeklyChange;
    
    // Determinar tendencia
    let trend: 'strengthening' | 'weakening' | 'stable' = 'stable';
    if (normalizedChange > 0.5) trend = 'strengthening';
    else if (normalizedChange < -0.5) trend = 'weakening';

    // Detectar momentum
    const hasMomentum = Math.sign(normalizedWeekly) === Math.sign(normalizedChange) && Math.abs(normalizedWeekly) > 0.3;
    const hasReversal = Math.sign(normalizedWeekly) !== Math.sign(normalizedChange) && Math.abs(normalizedChange) > 1;

    // Determinar volatilidad del mercado
    const volatility = determineForexVolatility(forexVol, vix);

    // Calcular score basado en datos reales
    let forexScore = 0;
    const summaryParts: string[] = [];
    const currencyName = getCurrencyName(currency);

    // Multiplicador base por sensibilidad del activo
    const sensitivityMultiplier = forexSensitivity === 'high' ? 1.5 : forexSensitivity === 'low' ? 0.6 : 1.0;

    if (isCommodity) {
      // Commodities cotizan en USD globalmente
      // Moneda local fuerte = precio local baja, Moneda local débil = precio local sube
      forexScore = -Math.round(normalizedChange * 8 * sensitivityMultiplier);
      
      if (normalizedChange > 0.5) {
        summaryParts.push(`💱 ${currencyName} fuerte (+${normalizedChange.toFixed(1)}%) presiona commodities locales`);
      } else if (normalizedChange < -0.5) {
        summaryParts.push(`💱 ${currencyName} débil (${normalizedChange.toFixed(1)}%) impulsa commodities locales`);
      } else {
        summaryParts.push(`💱 ${currencyName} estable, impacto forex limitado`);
      }
    } else {
      // Empresas: moneda fuerte afecta competitividad exportadora
      const baseMultiplier = isExporterCompany ? 7 : 4;
      forexScore = -Math.round(normalizedChange * baseMultiplier * sensitivityMultiplier);
      
      if (normalizedChange > 0.5) {
        summaryParts.push(`💱 ${currencyName} fuerte (+${normalizedChange.toFixed(1)}%) afecta competitividad`);
      } else if (normalizedChange < -0.5) {
        summaryParts.push(`💱 ${currencyName} débil (${normalizedChange.toFixed(1)}%) favorece exportaciones`);
      } else {
        summaryParts.push(`💱 ${currencyName} estable`);
      }
    }

    // Ajustes por características de la moneda
    if (isEM) {
      // Monedas emergentes más volátiles
      forexScore = Math.round(forexScore * 1.3);
      if (riskSentiment === 'risk-off' && normalizedChange < 0) {
        summaryParts.push('⚠️ Divisa EM en risk-off');
        forexScore -= 10;
      } else if (riskSentiment === 'risk-on' && normalizedChange > 0) {
        summaryParts.push('✅ Divisa EM beneficiada por risk-on');
        forexScore += 10;
      }
    }

    if (isCommodityCurr && dxyChange !== null) {
      // Monedas commodity correlacionadas inversamente con DXY
      if (dxyChange > 1.5 && normalizedChange < 0) {
        summaryParts.push('🛢️ Presión por USD fuerte en moneda commodity');
      } else if (dxyChange < -1.5 && normalizedChange > 0) {
        summaryParts.push('🛢️ Moneda commodity beneficiada por USD débil');
      }
    }

    if (isSH && trend !== 'stable') {
      summaryParts.push(`🛡️ Safe-haven ${trend === 'strengthening' ? 'fuerte' : 'débil'}`);
    }

    // Añadir contexto de momentum/reversal
    if (hasMomentum && Math.abs(normalizedChange) > 1) {
      summaryParts.push(`📈 Momentum ${trend === 'strengthening' ? 'alcista' : 'bajista'}`);
      forexScore = Math.round(forexScore * 1.2);
    } else if (hasReversal) {
      summaryParts.push('🔄 Posible reversión');
    }

    // Alta volatilidad
    if (volatility === 'high') {
      summaryParts.push('⚡ Alta volatilidad forex');
    }

    // Añadir contexto de DXY
    if (dxyChange !== null && Math.abs(dxyChange) > 1) {
      summaryParts.push(`DXY ${dxyChange > 0 ? '+' : ''}${dxyChange.toFixed(1)}%`);
    }

    // Limitar score a -100/+100
    forexScore = Math.max(-100, Math.min(100, forexScore));

    // Determinar calidad de datos
    const dataQuality: 'high' | 'medium' | 'low' = 
      forexData && dxyData && vix ? 'high' :
      forexData && (dxyData || vix) ? 'medium' : 'low';

    // Análisis regional
    const regionalTrend = getRegionalAnalysis(currency, normalizedChange);

    // Pares correlacionados
    const correlatedPairs = CROSS_PAIRS[currency] || [];

    logger.info(`[Forex] ${symbol}: ${currency}, change=${normalizedChange.toFixed(2)}%, score=${forexScore}, EM=${isEM}, commodity=${isCommodity}, exporter=${isExporterCompany}, risk=${riskSentiment}`);

    return {
      baseCurrency: currency,
      pair: pair.replace('=X', ''),
      trend,
      changePercent: normalizedChange,
      weeklyChange: normalizedWeekly,
      dxyChange: dxyChange ?? undefined,
      volatility,
      riskSentiment,
      regionalTrend: regionalTrend || undefined,
      correlatedPairs: correlatedPairs.length > 0 ? correlatedPairs.map(p => p.replace('=X', '')) : undefined,
      forexScore,
      hasData: true,
      dataQuality,
      summary: summaryParts.join('. ') + '.',
    };
  },

  getDefaultData(currency: string): ForexImpact {
    return {
      baseCurrency: currency,
      pair: currency === 'USD' ? 'N/A' : `${currency}USD`,
      trend: 'stable',
      changePercent: 0,
      forexScore: 0,
      hasData: currency === 'USD',
      dataQuality: currency === 'USD' ? 'medium' : 'low',
      summary: currency === 'USD' ? '💵 Activo en USD, sin impacto forex directo.' : '❓ Sin datos de forex disponibles.',
    };
  },
};

/**
 * Nombres legibles de monedas - AMPLIADO
 */
function getCurrencyName(currency: string): string {
  const names: Record<string, string> = {
    // G10
    'USD': 'Dólar USA',
    'EUR': 'Euro',
    'GBP': 'Libra esterlina',
    'CHF': 'Franco suizo',
    'JPY': 'Yen japonés',
    'AUD': 'Dólar australiano',
    'CAD': 'Dólar canadiense',
    'NZD': 'Dólar neozelandés',
    'SEK': 'Corona sueca',
    'NOK': 'Corona noruega',
    'DKK': 'Corona danesa',
    // Asia
    'HKD': 'Dólar HK',
    'CNY': 'Yuan chino',
    'KRW': 'Won coreano',
    'SGD': 'Dólar singapurense',
    'TWD': 'Dólar taiwanés',
    'THB': 'Baht tailandés',
    'INR': 'Rupia india',
    'IDR': 'Rupia indonesia',
    'MYR': 'Ringgit malayo',
    'PHP': 'Peso filipino',
    'VND': 'Dong vietnamita',
    // LatAm
    'MXN': 'Peso mexicano',
    'BRL': 'Real brasileño',
    'ARS': 'Peso argentino',
    'CLP': 'Peso chileno',
    'COP': 'Peso colombiano',
    'PEN': 'Sol peruano',
    // Europa del Este
    'PLN': 'Zloty polaco',
    'CZK': 'Corona checa',
    'HUF': 'Florín húngaro',
    'TRY': 'Lira turca',
    'RUB': 'Rublo ruso',
    // Otros
    'ZAR': 'Rand sudafricano',
    'ILS': 'Shekel israelí',
    'ISK': 'Corona islandesa',
    'QAR': 'Riyal qatarí',
    'AED': 'Dírham EAU',
    'SAR': 'Riyal saudí',
    'EGP': 'Libra egipcia',
  };
  return names[currency] || currency;
}
