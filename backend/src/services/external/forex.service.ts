/**
 * Servicio de Análisis de Forex
 * 
 * Obtiene datos REALES de tipos de cambio de Yahoo Finance
 * y calcula el impacto en activos según su moneda
 */

import { logger } from '../../middleware/logger.js';

export interface ForexImpact {
  baseCurrency: string;
  pair: string; // El par analizado (ej: GBPUSD, EURUSD)
  trend: 'strengthening' | 'weakening' | 'stable';
  changePercent: number; // Cambio real del par en el período
  forexScore: number; // -100 a +100
  hasData: boolean;
  summary: string;
}

// Cache por par de divisas
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutos

// Mapeo de sufijos a moneda base
const EXCHANGE_TO_CURRENCY: Record<string, string> = {
  '.MC': 'EUR', '.MA': 'EUR', // España
  '.PA': 'EUR', // Francia
  '.DE': 'EUR', '.F': 'EUR', // Alemania
  '.MI': 'EUR', // Italia
  '.AS': 'EUR', // Países Bajos
  '.L': 'GBP', // UK
  '.SW': 'CHF', // Suiza
  '.T': 'JPY', // Japón
  '.HK': 'HKD', // Hong Kong
  '.AX': 'AUD', // Australia
  '.TO': 'CAD', // Canadá
  '': 'USD', // USA por defecto
};

// Pares de Yahoo Finance para cada moneda vs USD
const CURRENCY_TO_PAIR: Record<string, string> = {
  'EUR': 'EURUSD=X',
  'GBP': 'GBPUSD=X',
  'CHF': 'CHFUSD=X',
  'JPY': 'JPYUSD=X',
  'HKD': 'HKDUSD=X',
  'AUD': 'AUDUSD=X',
  'CAD': 'CADUSD=X',
};

// Keywords para detectar commodities globales (cotizan en USD subyacentemente)
const GLOBAL_COMMODITY_KEYWORDS = [
  'gold', 'silver', 'platinum', 'palladium', 'copper', 'metal', 'precious',
  'oro', 'plata', 'platino', 'paladio', 'cobre', 'physical', 'ishares physical',
  'oil', 'crude', 'brent', 'wti', 'natural gas', 'lng',
  'commodity', 'commodities', 'raw material',
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

/**
 * Obtiene datos reales de un par de divisas de Yahoo Finance
 */
async function fetchForexData(pair: string): Promise<{ change: number; current: number } | null> {
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
    const change = ((currentRate - monthAgoRate) / monthAgoRate) * 100;

    const data = { change, current: currentRate };
    cache.set(pair, { data, timestamp: Date.now() });
    
    logger.info(`[Forex] ${pair}: ${change.toFixed(2)}% (${monthAgoRate.toFixed(4)} → ${currentRate.toFixed(4)})`);
    return data;
  } catch (error) {
    logger.error(`[Forex] Error fetching ${pair}:`, error);
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
    
    // Si ya es USD, no hay impacto forex
    if (currency === 'USD') {
      return this.getDefaultData('USD');
    }

    // Obtener el par correcto para esta moneda
    const pair = CURRENCY_TO_PAIR[currency];
    if (!pair) {
      logger.warn(`[Forex] No pair defined for currency ${currency}`);
      return this.getDefaultData(currency);
    }

    const forexData = await fetchForexData(pair);
    if (!forexData) {
      return this.getDefaultData(currency);
    }

    const { change, current } = forexData;
    const isCommodity = isGlobalCommodity(symbol, assetName);
    
    // Determinar tendencia (para descripción)
    let trend: 'strengthening' | 'weakening' | 'stable' = 'stable';
    if (change > 0.5) trend = 'strengthening';
    else if (change < -0.5) trend = 'weakening';

    // Calcular score basado en datos reales - SIEMPRE calcular aunque sea pequeño
    // Para commodities: moneda local fuerte vs USD = precio local más bajo
    // Para empresas: moneda local fuerte = menos competitivo en exportaciones
    let forexScore = 0;
    let summary = '';

    if (isCommodity) {
      // Commodities cotizan en USD globalmente
      // Moneda local fuerte = precio local baja, Moneda local débil = precio local sube
      // Multiplicador más alto para commodities (impacto directo)
      forexScore = -Math.round(change * 8);
      
      if (change > 0.5) {
        summary = `${currency}/USD +${change.toFixed(1)}%. ${currency} fuerte presiona precios de commodities en ${currency}.`;
      } else if (change < -0.5) {
        summary = `${currency}/USD ${change.toFixed(1)}%. ${currency} débil impulsa precios de commodities en ${currency}.`;
      } else {
        summary = `${currency}/USD ${change >= 0 ? '+' : ''}${change.toFixed(2)}%. Movimiento menor, impacto limitado.`;
      }
    } else {
      // Empresas normales: moneda fuerte afecta exportaciones
      forexScore = -Math.round(change * 5);
      
      if (change > 0.5) {
        summary = `${currency}/USD +${change.toFixed(1)}%. ${currency} fuerte puede afectar competitividad exportadora.`;
      } else if (change < -0.5) {
        summary = `${currency}/USD ${change.toFixed(1)}%. ${currency} débil favorece exportaciones.`;
      } else {
        summary = `${currency}/USD ${change >= 0 ? '+' : ''}${change.toFixed(2)}%. Movimiento menor, impacto limitado.`;
      }
    }

    // Limitar score a -100/+100
    forexScore = Math.max(-100, Math.min(100, forexScore));

    logger.info(`[Forex] ${symbol} (${assetName || 'no name'}): ${currency}, pair=${pair}, change=${change.toFixed(2)}%, score=${forexScore}, commodity=${isCommodity}`);

    return {
      baseCurrency: currency,
      pair: pair.replace('=X', ''),
      trend,
      changePercent: change,
      forexScore,
      hasData: true,
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
      hasData: currency === 'USD', // USD no necesita datos forex
      summary: currency === 'USD' ? 'Activo en USD, sin impacto forex.' : 'Sin datos de forex.',
    };
  },
};
