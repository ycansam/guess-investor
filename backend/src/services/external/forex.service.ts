/**
 * Servicio de Análisis de Forex Mejorado
 * 
 * Obtiene datos REALES de tipos de cambio de Yahoo Finance
 * Analiza múltiples pares de divisas y el Dollar Index (DXY)
 * Calcula el impacto en activos según su moneda y tipo
 */

import { logger } from '../../middleware/logger.js';

export interface ForexImpact {
  baseCurrency: string;
  pair: string; // El par analizado (ej: GBPUSD, EURUSD)
  trend: 'strengthening' | 'weakening' | 'stable';
  changePercent: number; // Cambio real del par en el período
  weeklyChange?: number; // Cambio semanal para detectar momentum
  dxyChange?: number; // Cambio del Dollar Index
  forexScore: number; // -100 a +100
  hasData: boolean;
  dataQuality: 'high' | 'medium' | 'low';
  summary: string;
}

// Cache por par de divisas
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutos

// Mapeo de sufijos a moneda base - AMPLIADO
const EXCHANGE_TO_CURRENCY: Record<string, string> = {
  // Europa - Euro
  '.MC': 'EUR', '.MA': 'EUR', // España
  '.PA': 'EUR', // Francia
  '.DE': 'EUR', '.F': 'EUR', '.XETRA': 'EUR', // Alemania
  '.MI': 'EUR', // Italia
  '.AS': 'EUR', // Países Bajos
  '.BR': 'EUR', // Bélgica
  '.VI': 'EUR', // Austria
  '.HE': 'EUR', // Finlandia
  '.LS': 'EUR', // Portugal
  '.IR': 'EUR', // Irlanda
  // UK
  '.L': 'GBP', '.IL': 'GBP',
  // Suiza
  '.SW': 'CHF', '.VX': 'CHF',
  // Escandinavia
  '.ST': 'SEK', // Suecia
  '.OL': 'NOK', // Noruega
  '.CO': 'DKK', // Dinamarca
  // Asia
  '.T': 'JPY', '.TYO': 'JPY', // Japón
  '.HK': 'HKD', // Hong Kong
  '.SS': 'CNY', '.SZ': 'CNY', // China continental
  '.KS': 'KRW', '.KQ': 'KRW', // Corea del Sur
  '.SI': 'SGD', // Singapur
  '.TW': 'TWD', // Taiwán
  '.BK': 'THB', // Tailandia
  '.NS': 'INR', '.BO': 'INR', // India
  // Oceanía
  '.AX': 'AUD', // Australia
  '.NZ': 'NZD', // Nueva Zelanda
  // América
  '.TO': 'CAD', '.V': 'CAD', // Canadá
  '.MX': 'MXN', // México
  '.SA': 'BRL', // Brasil
  '': 'USD', // USA por defecto
};

// Pares de Yahoo Finance para cada moneda vs USD - AMPLIADO
const CURRENCY_TO_PAIR: Record<string, string> = {
  // Mayores (G10)
  'EUR': 'EURUSD=X',
  'GBP': 'GBPUSD=X',
  'CHF': 'USDCHF=X', // USD/CHF, necesita inversión
  'JPY': 'USDJPY=X', // USD/JPY, necesita inversión
  'AUD': 'AUDUSD=X',
  'CAD': 'USDCAD=X', // USD/CAD, necesita inversión
  'NZD': 'NZDUSD=X',
  'SEK': 'USDSEK=X', // USD/SEK, necesita inversión
  'NOK': 'USDNOK=X', // USD/NOK, necesita inversión
  'DKK': 'USDDKK=X', // USD/DKK, necesita inversión
  // Asia
  'HKD': 'USDHKD=X',
  'CNY': 'USDCNY=X', // USD/CNY, necesita inversión
  'KRW': 'USDKRW=X',
  'SGD': 'USDSGD=X',
  'TWD': 'USDTWD=X',
  'THB': 'USDTHB=X',
  'INR': 'USDINR=X',
  // Emergentes América
  'MXN': 'USDMXN=X',
  'BRL': 'USDBRL=X',
};

// Pares que están cotizados como USD/XXX (el cambio positivo significa USD fuerte)
const USD_BASE_PAIRS = new Set(['CHF', 'JPY', 'CAD', 'SEK', 'NOK', 'DKK', 'HKD', 'CNY', 'KRW', 'SGD', 'TWD', 'THB', 'INR', 'MXN', 'BRL']);

// Dollar Index para contexto global
const DXY_SYMBOL = 'DX-Y.NYB';

// Keywords para detectar commodities globales (cotizan en USD subyacentemente)
const GLOBAL_COMMODITY_KEYWORDS = [
  'gold', 'silver', 'platinum', 'palladium', 'copper', 'metal', 'precious',
  'oro', 'plata', 'platino', 'paladio', 'cobre', 'physical', 'ishares physical',
  'oil', 'crude', 'brent', 'wti', 'natural gas', 'lng', 'petróleo', 'gas natural',
  'commodity', 'commodities', 'raw material', 'materias primas',
  'wheat', 'corn', 'soybean', 'coffee', 'sugar', 'cotton', // Agrícolas
  'trigo', 'maíz', 'soja', 'café', 'azúcar', 'algodón',
  'iron ore', 'zinc', 'nickel', 'aluminum', 'tin', 'lead', // Metales industriales
  'hierro', 'zinc', 'níquel', 'aluminio', 'estaño', 'plomo',
];

// Keywords para detectar empresas exportadoras (más sensibles a forex)
const EXPORTER_KEYWORDS = [
  'export', 'international', 'global', 'worldwide', 'multinational',
  'exportador', 'internacional', 'mundial', 'multinacional',
];

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
 * Obtiene datos reales de un par de divisas de Yahoo Finance
 * Devuelve cambio mensual y semanal para detectar momentum
 */
async function fetchForexData(pair: string): Promise<{ 
  monthlyChange: number; 
  weeklyChange: number;
  current: number;
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

    const data = { monthlyChange, weeklyChange, current: currentRate };
    cache.set(pair, { data, timestamp: Date.now() });
    
    logger.info(`[Forex] ${pair}: Monthly ${monthlyChange.toFixed(2)}%, Weekly ${weeklyChange.toFixed(2)}% (${monthAgoRate.toFixed(4)} → ${currentRate.toFixed(4)})`);
    return data;
  } catch (error) {
    logger.error(`[Forex] Error fetching ${pair}:`, error);
    return null;
  }
}

/**
 * Obtiene el Dollar Index (DXY) para contexto global
 */
async function fetchDXY(): Promise<number | null> {
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

    cache.set('DXY', { data: change, timestamp: Date.now() });
    logger.info(`[Forex] DXY: ${change.toFixed(2)}%`);
    return change;
  } catch (error) {
    return null;
  }
}

export const forexService = {
  async analyzeForexImpact(symbol: string, assetName?: string): Promise<ForexImpact> {
    // Cryptos se cotizan en USD, no aplica forex
    if (symbol.includes('-USD') || symbol.includes('-EUR')) {
      return this.getDefaultData('USD');
    }

    const currency = detectCurrency(symbol);
    
    // Si ya es USD, no hay impacto forex directo pero podemos dar contexto con DXY
    if (currency === 'USD') {
      const dxyChange = await fetchDXY();
      if (dxyChange !== null && Math.abs(dxyChange) > 1) {
        return {
          baseCurrency: 'USD',
          pair: 'DXY',
          trend: dxyChange > 0.5 ? 'strengthening' : dxyChange < -0.5 ? 'weakening' : 'stable',
          changePercent: dxyChange,
          dxyChange,
          forexScore: 0, // Sin impacto directo en activos USD
          hasData: true,
          dataQuality: 'medium',
          summary: `💵 Dollar Index ${dxyChange > 0 ? '+' : ''}${dxyChange.toFixed(1)}%. USD ${dxyChange > 0 ? 'fortalecido' : 'debilitado'} globalmente.`,
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

    // Fetch datos del par y DXY en paralelo
    const [forexData, dxyChange] = await Promise.all([
      fetchForexData(pair),
      fetchDXY(),
    ]);

    if (!forexData) {
      return this.getDefaultData(currency);
    }

    const { monthlyChange, weeklyChange, current } = forexData;
    const isCommodity = isGlobalCommodity(symbol, assetName);
    const isExporterCompany = isExporter(assetName);
    
    // Normalizar el cambio: queremos siempre "moneda local vs USD"
    // Si es USD_BASE_PAIR (USD/XXX), un cambio positivo significa USD fuerte = moneda local débil
    // Queremos que 'change' positivo = moneda local fuerte
    const normalizedChange = USD_BASE_PAIRS.has(currency) ? -monthlyChange : monthlyChange;
    const normalizedWeekly = USD_BASE_PAIRS.has(currency) ? -weeklyChange : weeklyChange;
    
    // Determinar tendencia
    let trend: 'strengthening' | 'weakening' | 'stable' = 'stable';
    if (normalizedChange > 0.5) trend = 'strengthening';
    else if (normalizedChange < -0.5) trend = 'weakening';

    // Detectar momentum: si semanal y mensual van en misma dirección, más confianza
    const hasMomentum = Math.sign(normalizedWeekly) === Math.sign(normalizedChange) && Math.abs(normalizedWeekly) > 0.3;

    // Calcular score basado en datos reales
    let forexScore = 0;
    let summary = '';
    const currencyName = getCurrencyName(currency);

    if (isCommodity) {
      // Commodities cotizan en USD globalmente
      // Moneda local fuerte = precio local baja, Moneda local débil = precio local sube
      forexScore = -Math.round(normalizedChange * 8);
      
      if (normalizedChange > 0.5) {
        summary = `💱 ${currencyName} fuerte (+${normalizedChange.toFixed(1)}%) presiona precios de commodities en moneda local.`;
      } else if (normalizedChange < -0.5) {
        summary = `💱 ${currencyName} débil (${normalizedChange.toFixed(1)}%) impulsa precios de commodities en moneda local.`;
      } else {
        summary = `💱 ${currencyName} estable (${normalizedChange >= 0 ? '+' : ''}${normalizedChange.toFixed(2)}%). Impacto forex limitado.`;
      }
    } else {
      // Empresas: moneda fuerte afecta exportaciones, pero también importaciones
      // Multiplicador más alto para exportadores conocidos
      const multiplier = isExporterCompany ? 6 : 4;
      forexScore = -Math.round(normalizedChange * multiplier);
      
      if (normalizedChange > 0.5) {
        summary = `💱 ${currencyName} fuerte (+${normalizedChange.toFixed(1)}%) puede afectar competitividad exportadora.`;
      } else if (normalizedChange < -0.5) {
        summary = `💱 ${currencyName} débil (${normalizedChange.toFixed(1)}%) favorece exportaciones y resultados en ${currency}.`;
      } else {
        summary = `💱 ${currencyName} estable (${normalizedChange >= 0 ? '+' : ''}${normalizedChange.toFixed(2)}%). Impacto forex limitado.`;
      }
    }

    // Añadir contexto de momentum si existe
    if (hasMomentum && Math.abs(normalizedChange) > 1) {
      summary += ` Momentum ${trend === 'strengthening' ? 'alcista' : 'bajista'} confirmado.`;
      forexScore = Math.round(forexScore * 1.2); // Aumentar impacto con momentum
    }

    // Añadir contexto de DXY si disponible
    if (dxyChange !== null && Math.abs(dxyChange) > 1) {
      summary += ` DXY ${dxyChange > 0 ? '+' : ''}${dxyChange.toFixed(1)}%.`;
    }

    // Limitar score a -100/+100
    forexScore = Math.max(-100, Math.min(100, forexScore));

    // Determinar calidad de datos
    const dataQuality: 'high' | 'medium' | 'low' = 
      forexData && dxyChange !== null ? 'high' :
      forexData ? 'medium' : 'low';

    logger.info(`[Forex] ${symbol} (${assetName || 'no name'}): ${currency}, pair=${pair}, change=${normalizedChange.toFixed(2)}%, weekly=${normalizedWeekly.toFixed(2)}%, score=${forexScore}, commodity=${isCommodity}, exporter=${isExporterCompany}`);

    return {
      baseCurrency: currency,
      pair: pair.replace('=X', ''),
      trend,
      changePercent: normalizedChange,
      weeklyChange: normalizedWeekly,
      dxyChange: dxyChange ?? undefined,
      forexScore,
      hasData: true,
      dataQuality,
      summary,
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
 * Nombres legibles de monedas
 */
function getCurrencyName(currency: string): string {
  const names: Record<string, string> = {
    'EUR': 'Euro',
    'GBP': 'Libra',
    'CHF': 'Franco suizo',
    'JPY': 'Yen',
    'AUD': 'Dólar australiano',
    'CAD': 'Dólar canadiense',
    'NZD': 'Dólar neozelandés',
    'SEK': 'Corona sueca',
    'NOK': 'Corona noruega',
    'DKK': 'Corona danesa',
    'HKD': 'Dólar HK',
    'CNY': 'Yuan',
    'KRW': 'Won',
    'SGD': 'Dólar singapurense',
    'TWD': 'Dólar taiwanés',
    'THB': 'Baht',
    'INR': 'Rupia',
    'MXN': 'Peso mexicano',
    'BRL': 'Real',
  };
  return names[currency] || currency;
}
