/**
 * Servicio de Análisis de Forex
 * 
 * Analiza el impacto de los tipos de cambio en activos
 */

import { logger } from '../../middleware/logger.js';

export interface ForexImpact {
  baseCurrency: string;
  trend: 'eur_strong' | 'eur_weak' | 'stable';
  eurUsdChange: number;
  forexScore: number; // -100 a +100
  hasData: boolean;
  summary: string;
}

// Cache
const cache = new Map<string, { data: ForexImpact; timestamp: number }>();
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
  '': 'USD', // USA por defecto
};

function detectCurrency(symbol: string): string {
  for (const [suffix, currency] of Object.entries(EXCHANGE_TO_CURRENCY)) {
    if (suffix && symbol.endsWith(suffix)) {
      return currency;
    }
  }
  return 'USD';
}

export const forexService = {
  async analyzeForexImpact(symbol: string): Promise<ForexImpact> {
    // Cryptos se cotizan en USD, no aplica forex
    if (symbol.includes('-USD') || symbol.includes('-EUR')) {
      return this.getDefaultData('USD');
    }

    const cached = cache.get('forex');
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return this.adjustForSymbol(cached.data, symbol);
    }

    try {
      // Obtener EUR/USD
      const url = 'https://query1.finance.yahoo.com/v8/finance/chart/EURUSD=X?range=1mo&interval=1d';
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (!response.ok) {
        return this.getDefaultData(detectCurrency(symbol));
      }

      const json: any = await response.json();
      const result = json.chart?.result?.[0];
      const quotes = result?.indicators?.quote?.[0];

      if (!quotes?.close) {
        return this.getDefaultData(detectCurrency(symbol));
      }

      const closes = quotes.close.filter((c: number) => c > 0);
      if (closes.length < 2) {
        return this.getDefaultData(detectCurrency(symbol));
      }

      const currentRate = closes[closes.length - 1];
      const monthAgoRate = closes[0];
      const eurUsdChange = ((currentRate - monthAgoRate) / monthAgoRate) * 100;

      // Determinar tendencia
      let trend: 'eur_strong' | 'eur_weak' | 'stable' = 'stable';
      if (eurUsdChange > 1) trend = 'eur_strong';
      else if (eurUsdChange < -1) trend = 'eur_weak';

      // Score depende del activo:
      // - Para empresas europeas exportadoras: EUR débil es positivo
      // - Para empresas europeas importadoras: EUR fuerte es positivo
      // - Para empresas USA: EUR fuerte = más poder adquisitivo europeo
      
      // Score base (perspectiva neutra)
      let forexScore = 0;
      if (Math.abs(eurUsdChange) < 1) {
        forexScore = 0; // Estable, no impacta
      } else if (eurUsdChange > 3) {
        forexScore = -15; // EUR muy fuerte puede afectar exportadores EU
      } else if (eurUsdChange < -3) {
        forexScore = 15; // EUR débil favorece exportadores EU
      } else if (eurUsdChange > 0) {
        forexScore = -5;
      } else {
        forexScore = 5;
      }

      let summary = '';
      if (trend === 'eur_strong') {
        summary = `EUR/USD +${eurUsdChange.toFixed(1)}% mensual. Euro fortalecido.`;
      } else if (trend === 'eur_weak') {
        summary = `EUR/USD ${eurUsdChange.toFixed(1)}% mensual. Euro debilitado.`;
      } else {
        summary = 'EUR/USD estable. Impacto forex mínimo.';
      }

      const forexData: ForexImpact = {
        baseCurrency: 'EUR',
        trend,
        eurUsdChange,
        forexScore,
        hasData: true,
        summary,
      };

      cache.set('forex', { data: forexData, timestamp: Date.now() });
      logger.info(`[Forex] EUR/USD: ${eurUsdChange.toFixed(2)}%, trend=${trend}`);
      
      return this.adjustForSymbol(forexData, symbol);
    } catch (error) {
      logger.error('[Forex] Error:', error);
      return this.getDefaultData(detectCurrency(symbol));
    }
  },

  adjustForSymbol(forexData: ForexImpact, symbol: string): ForexImpact {
    const currency = detectCurrency(symbol);
    
    // Ajustar score según moneda del activo
    let adjustedScore = forexData.forexScore;
    
    if (currency === 'EUR') {
      // Empresas europeas: EUR débil favorece exportaciones
      adjustedScore = forexData.forexScore; // Ya calculado desde perspectiva EUR
    } else if (currency === 'USD') {
      // Empresas USA: USD fuerte favorece poder adquisitivo interno
      // Pero puede afectar ventas internacionales
      adjustedScore = -forexData.forexScore * 0.5; // Invertir y reducir impacto
    } else if (currency === 'GBP') {
      // UK: Similar lógica a EUR
      adjustedScore = forexData.forexScore * 0.7;
    }

    return {
      ...forexData,
      baseCurrency: currency,
      forexScore: Math.round(adjustedScore),
    };
  },

  getDefaultData(currency: string): ForexImpact {
    return {
      baseCurrency: currency,
      trend: 'stable',
      eurUsdChange: 0,
      forexScore: 0,
      hasData: false,
      summary: 'Sin datos de forex.',
    };
  },
};
