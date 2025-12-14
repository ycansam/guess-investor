/**
 * Servicio de análisis de tipos de cambio
 * Analiza cómo las variaciones de divisas afectan a empresas multinacionales
 * 
 * Lógica:
 * - Si el EUR se fortalece → negativo para exportadores europeos (ganan menos al convertir)
 * - Si el EUR se debilita → positivo para exportadores europeos (ganan más al convertir)
 * - Para empresas USA: al revés con el USD
 */

import { fetchWithCorsProxy } from './cors-proxy';

export interface ForexImpact {
  baseCurrency: string; // Moneda base de la empresa (EUR para Inditex)
  
  // Principales pares analizados
  currencyPairs: Array<{
    pair: string; // EUR/USD, EUR/GBP, etc.
    currentRate: number;
    change1w: number; // % cambio última semana
    change1m: number; // % cambio último mes
    trend: 'strengthening' | 'weakening' | 'stable'; // Del EUR
    impact: 'positive' | 'negative' | 'neutral'; // Impacto en la empresa
    relevance: string; // Por qué es relevante
  }>;
  
  // Resumen
  overallTrend: 'eur_strong' | 'eur_weak' | 'stable';
  forexScore: number; // -100 a +100 (positivo = favorable para la empresa)
  hasData: boolean;
  summary: string;
}

// Mapeo de empresas a sus monedas de exposición
// Ordenadas por importancia para la empresa
const COMPANY_FOREX_EXPOSURE: Record<string, { 
  baseCurrency: string; 
  exposures: Array<{ currency: string; relevance: string; weight: number }> 
}> = {
  // Inditex - Opera globalmente, muy expuesta a divisas
  'ITX.MC': {
    baseCurrency: 'EUR',
    exposures: [
      { currency: 'USD', relevance: 'Mercado USA y LatAm (dolarizado)', weight: 0.35 },
      { currency: 'GBP', relevance: 'Mercado Reino Unido', weight: 0.20 },
      { currency: 'CNY', relevance: 'Producción en China', weight: 0.25 },
      { currency: 'JPY', relevance: 'Mercado Japón', weight: 0.20 },
    ]
  },
  
  // Telefónica - LatAm y Europa
  'TEF.MC': {
    baseCurrency: 'EUR',
    exposures: [
      { currency: 'BRL', relevance: 'Brasil (Vivo)', weight: 0.30 },
      { currency: 'GBP', relevance: 'Reino Unido (O2)', weight: 0.25 },
      { currency: 'USD', relevance: 'LatAm dolarizado', weight: 0.25 },
      { currency: 'MXN', relevance: 'México', weight: 0.20 },
    ]
  },
  
  // Santander - Banca global
  'SAN.MC': {
    baseCurrency: 'EUR',
    exposures: [
      { currency: 'GBP', relevance: 'Reino Unido', weight: 0.25 },
      { currency: 'BRL', relevance: 'Brasil', weight: 0.25 },
      { currency: 'USD', relevance: 'USA y LatAm', weight: 0.30 },
      { currency: 'MXN', relevance: 'México', weight: 0.20 },
    ]
  },
  
  // BBVA - Fuerte en México y USA
  'BBVA.MC': {
    baseCurrency: 'EUR',
    exposures: [
      { currency: 'MXN', relevance: 'México (principal mercado)', weight: 0.40 },
      { currency: 'USD', relevance: 'USA', weight: 0.30 },
      { currency: 'TRY', relevance: 'Turquía (Garanti)', weight: 0.30 },
    ]
  },
  
  // Apple - USA pero vende globalmente
  'AAPL': {
    baseCurrency: 'USD',
    exposures: [
      { currency: 'EUR', relevance: 'Europa', weight: 0.30 },
      { currency: 'CNY', relevance: 'China (ventas y producción)', weight: 0.35 },
      { currency: 'JPY', relevance: 'Japón', weight: 0.20 },
      { currency: 'GBP', relevance: 'Reino Unido', weight: 0.15 },
    ]
  },
  
  // Microsoft - Global
  'MSFT': {
    baseCurrency: 'USD',
    exposures: [
      { currency: 'EUR', relevance: 'Europa', weight: 0.35 },
      { currency: 'JPY', relevance: 'Japón', weight: 0.25 },
      { currency: 'GBP', relevance: 'Reino Unido', weight: 0.20 },
      { currency: 'CNY', relevance: 'China', weight: 0.20 },
    ]
  },
  
  // Amazon - Global
  'AMZN': {
    baseCurrency: 'USD',
    exposures: [
      { currency: 'EUR', relevance: 'Europa (Amazon.de, .es, .fr, .it)', weight: 0.30 },
      { currency: 'GBP', relevance: 'Reino Unido', weight: 0.25 },
      { currency: 'JPY', relevance: 'Japón', weight: 0.25 },
      { currency: 'CAD', relevance: 'Canadá', weight: 0.20 },
    ]
  },
  
  // Tesla - Producción en múltiples países
  'TSLA': {
    baseCurrency: 'USD',
    exposures: [
      { currency: 'CNY', relevance: 'Gigafactory Shanghai', weight: 0.35 },
      { currency: 'EUR', relevance: 'Gigafactory Berlín', weight: 0.35 },
      { currency: 'JPY', relevance: 'Proveedores Japón', weight: 0.15 },
      { currency: 'GBP', relevance: 'Ventas UK', weight: 0.15 },
    ]
  },
  
  // Repsol - Petróleo cotiza en USD
  'REP.MC': {
    baseCurrency: 'EUR',
    exposures: [
      { currency: 'USD', relevance: 'Petróleo cotiza en USD', weight: 0.60 },
      { currency: 'GBP', relevance: 'Operaciones UK', weight: 0.20 },
      { currency: 'NOK', relevance: 'Operaciones Noruega', weight: 0.20 },
    ]
  },
  
  // Iberdrola - Utilities global
  'IBE.MC': {
    baseCurrency: 'EUR',
    exposures: [
      { currency: 'USD', relevance: 'Avangrid (USA)', weight: 0.35 },
      { currency: 'GBP', relevance: 'ScottishPower', weight: 0.35 },
      { currency: 'BRL', relevance: 'Neoenergia (Brasil)', weight: 0.30 },
    ]
  },
  
  // Xiaomi - China pero vende global
  '1810.HK': {
    baseCurrency: 'CNY',
    exposures: [
      { currency: 'INR', relevance: 'India (2º mercado)', weight: 0.30 },
      { currency: 'EUR', relevance: 'Europa', weight: 0.30 },
      { currency: 'USD', relevance: 'LatAm y otros', weight: 0.25 },
      { currency: 'IDR', relevance: 'Indonesia', weight: 0.15 },
    ]
  },
};

// Mapeo de sufijos de símbolo a moneda base y región
const SYMBOL_SUFFIX_TO_CURRENCY: Record<string, { baseCurrency: string; region: string }> = {
  '.MC': { baseCurrency: 'EUR', region: 'spain' },      // España (Madrid)
  '.PA': { baseCurrency: 'EUR', region: 'france' },     // Francia (París)
  '.DE': { baseCurrency: 'EUR', region: 'germany' },    // Alemania
  '.MI': { baseCurrency: 'EUR', region: 'italy' },      // Italia (Milán)
  '.AS': { baseCurrency: 'EUR', region: 'netherlands' },// Holanda (Amsterdam)
  '.BR': { baseCurrency: 'EUR', region: 'europe' },     // Euronext Bruselas
  '.L': { baseCurrency: 'GBP', region: 'uk' },          // Reino Unido (Londres)
  '.HK': { baseCurrency: 'HKD', region: 'hongkong' },   // Hong Kong
  '.T': { baseCurrency: 'JPY', region: 'japan' },       // Japón (Tokio)
  '.SS': { baseCurrency: 'CNY', region: 'china' },      // China (Shanghai)
  '.SZ': { baseCurrency: 'CNY', region: 'china' },      // China (Shenzhen)
  '.KS': { baseCurrency: 'KRW', region: 'korea' },      // Corea del Sur
  '.AX': { baseCurrency: 'AUD', region: 'australia' },  // Australia
  '.TO': { baseCurrency: 'CAD', region: 'canada' },     // Canadá (Toronto)
  '.SA': { baseCurrency: 'BRL', region: 'brazil' },     // Brasil (Bovespa)
  '.MX': { baseCurrency: 'MXN', region: 'mexico' },     // México
  '.ST': { baseCurrency: 'SEK', region: 'sweden' },     // Suecia (Estocolmo)
  '.OL': { baseCurrency: 'NOK', region: 'norway' },     // Noruega (Oslo)
  '.CO': { baseCurrency: 'DKK', region: 'denmark' },    // Dinamarca (Copenhagen)
  '.HE': { baseCurrency: 'EUR', region: 'finland' },    // Finlandia (Helsinki)
  '.SW': { baseCurrency: 'CHF', region: 'switzerland' },// Suiza
  '.BO': { baseCurrency: 'INR', region: 'india' },      // India (Bombay)
  '.NS': { baseCurrency: 'INR', region: 'india' },      // India (NSE)
  '.JK': { baseCurrency: 'IDR', region: 'indonesia' },  // Indonesia (Jakarta)
  '.SI': { baseCurrency: 'SGD', region: 'singapore' },  // Singapur
  '.TW': { baseCurrency: 'TWD', region: 'taiwan' },     // Taiwán
};

// Exposiciones genéricas por región (para empresas no mapeadas específicamente)
const GENERIC_EXPOSURES: Record<string, Array<{ currency: string; relevance: string; weight: number }>> = {
  // Empresas europeas (base EUR) - exposición típica global
  'eur': [
    { currency: 'USD', relevance: 'Mercado USA y dolarizado', weight: 0.40 },
    { currency: 'GBP', relevance: 'Mercado Reino Unido', weight: 0.25 },
    { currency: 'CNY', relevance: 'Mercado asiático', weight: 0.20 },
    { currency: 'JPY', relevance: 'Mercado Japón', weight: 0.15 },
  ],
  // Empresas USA (base USD)
  'usd': [
    { currency: 'EUR', relevance: 'Mercado Europeo', weight: 0.35 },
    { currency: 'CNY', relevance: 'Mercado China', weight: 0.30 },
    { currency: 'JPY', relevance: 'Mercado Japón', weight: 0.20 },
    { currency: 'GBP', relevance: 'Mercado Reino Unido', weight: 0.15 },
  ],
  // Empresas UK (base GBP)
  'gbp': [
    { currency: 'USD', relevance: 'Mercado USA', weight: 0.35 },
    { currency: 'EUR', relevance: 'Mercado Europeo', weight: 0.35 },
    { currency: 'CNY', relevance: 'Mercado asiático', weight: 0.15 },
    { currency: 'JPY', relevance: 'Mercado Japón', weight: 0.15 },
  ],
  // Empresas China/HK (base CNY/HKD)
  'cny': [
    { currency: 'USD', relevance: 'Mercado USA y dolarizado', weight: 0.35 },
    { currency: 'EUR', relevance: 'Mercado Europeo', weight: 0.30 },
    { currency: 'JPY', relevance: 'Mercado Japón', weight: 0.20 },
    { currency: 'INR', relevance: 'Mercado India', weight: 0.15 },
  ],
  // Empresas Japón (base JPY)
  'jpy': [
    { currency: 'USD', relevance: 'Mercado USA', weight: 0.40 },
    { currency: 'EUR', relevance: 'Mercado Europeo', weight: 0.25 },
    { currency: 'CNY', relevance: 'Mercado China', weight: 0.25 },
    { currency: 'KRW', relevance: 'Mercado Corea', weight: 0.10 },
  ],
  // Empresas emergentes (Latam, Asia menor)
  'emerging': [
    { currency: 'USD', relevance: 'Comercio internacional (dólar)', weight: 0.50 },
    { currency: 'EUR', relevance: 'Mercado Europeo', weight: 0.30 },
    { currency: 'CNY', relevance: 'Comercio con China', weight: 0.20 },
  ],
  // Default (empresas sin región clara)
  'default': [
    { currency: 'USD', relevance: 'Divisa de referencia global', weight: 0.50 },
    { currency: 'EUR', relevance: 'Segunda divisa global', weight: 0.30 },
    { currency: 'CNY', relevance: 'Tercera divisa global', weight: 0.20 },
  ],
};

// Pares de forex a monitorear (base EUR)
const FOREX_PAIRS: Record<string, string> = {
  'USD': 'EURUSD=X',   // EUR/USD
  'GBP': 'EURGBP=X',   // EUR/GBP
  'JPY': 'EURJPY=X',   // EUR/JPY
  'CNY': 'EURCNY=X',   // EUR/CNY
  'CHF': 'EURCHF=X',   // EUR/CHF
  'BRL': 'EURBRL=X',   // EUR/BRL
  'MXN': 'EURMXN=X',   // EUR/MXN
  'TRY': 'EURTRY=X',   // EUR/TRY
  'CAD': 'EURCAD=X',   // EUR/CAD
  'AUD': 'EURAUD=X',   // EUR/AUD
  'INR': 'EURINR=X',   // EUR/INR
  'NOK': 'EURNOK=X',   // EUR/NOK
  'IDR': 'EURIDR=X',   // EUR/IDR
  'KRW': 'EURKRW=X',   // EUR/KRW
  'HKD': 'EURHKD=X',   // EUR/HKD
  'SEK': 'EURSEK=X',   // EUR/SEK
  'DKK': 'EURDKK=X',   // EUR/DKK
  'SGD': 'EURSGD=X',   // EUR/SGD
  'TWD': 'EURTWD=X',   // EUR/TWD
  'PLN': 'EURPLN=X',   // EUR/PLN
  'CZK': 'EURCZK=X',   // EUR/CZK
  'ZAR': 'EURZAR=X',   // EUR/ZAR
  'RUB': 'EURRUB=X',   // EUR/RUB
  'THB': 'EURTHB=X',   // EUR/THB
  'PHP': 'EURPHP=X',   // EUR/PHP
  'CLP': 'EURCLP=X',   // EUR/CLP
  'COP': 'EURCOP=X',   // EUR/COP
  'ARS': 'EURARS=X',   // EUR/ARS
  'NZD': 'EURNZD=X',   // EUR/NZD
  'EUR': 'EURUSD=X',   // Si la base es EUR y busca EUR, usar USD como referencia
};

// Caché
interface CacheEntry {
  data: { currentRate: number; change1w: number; change1m: number };
  timestamp: number;
}
const forexCache = new Map<string, CacheEntry>();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutos

class ForexAnalysisService {
  
  /**
   * Obtiene datos históricos de un par de forex
   */
  private async getForexData(currency: string): Promise<{ currentRate: number; change1w: number; change1m: number } | null> {
    const pairSymbol = FOREX_PAIRS[currency];
    if (!pairSymbol) {
      console.warn(`[Forex] Par no configurado para ${currency}`);
      return null;
    }
    
    // Verificar caché
    const cached = forexCache.get(currency);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`[Forex] Cache hit: ${currency}`);
      return cached.data;
    }
    
    try {
      const endDate = Math.floor(Date.now() / 1000);
      const startDate = endDate - (35 * 24 * 60 * 60); // 35 días
      
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(pairSymbol)}?period1=${startDate}&period2=${endDate}&interval=1d`;
      
      const response = await fetchWithCorsProxy(url);
      const data = await response.json();
      
      if (!data.chart?.result?.[0]) {
        console.warn(`[Forex] Sin datos para ${pairSymbol}`);
        return null;
      }
      
      const result = data.chart.result[0];
      const closes = result.indicators?.quote?.[0]?.close?.filter((c: number | null) => c !== null) || [];
      
      if (closes.length < 5) {
        return null;
      }
      
      const currentRate = closes[closes.length - 1];
      const weekAgoRate = closes[Math.max(0, closes.length - 6)];
      const monthAgoRate = closes[0];
      
      // Cambio positivo = EUR se fortaleció (sube vs la otra moneda)
      const change1w = ((currentRate - weekAgoRate) / weekAgoRate) * 100;
      const change1m = ((currentRate - monthAgoRate) / monthAgoRate) * 100;
      
      const forexData = { currentRate, change1w, change1m };
      
      // Guardar en caché
      forexCache.set(currency, { data: forexData, timestamp: Date.now() });
      
      console.log(`[Forex] EUR/${currency}: ${currentRate.toFixed(4)}, 1w: ${change1w.toFixed(2)}%, 1m: ${change1m.toFixed(2)}%`);
      
      return forexData;
      
    } catch (error) {
      console.error(`[Forex] Error obteniendo ${currency}:`, error);
      return null;
    }
  }
  
  /**
   * Detecta la moneda base y exposiciones para un símbolo
   * Usa el mapeo específico si existe, o infiere de la bolsa
   */
  private getExposureForSymbol(symbol: string): { baseCurrency: string; exposures: Array<{ currency: string; relevance: string; weight: number }> } {
    // 1. Primero buscar en el mapeo específico
    if (COMPANY_FOREX_EXPOSURE[symbol]) {
      console.log(`[Forex] Usando mapeo específico para ${symbol}`);
      return COMPANY_FOREX_EXPOSURE[symbol];
    }
    
    // 2. Detectar por sufijo de bolsa
    for (const [suffix, info] of Object.entries(SYMBOL_SUFFIX_TO_CURRENCY)) {
      if (symbol.endsWith(suffix)) {
        const baseCurrency = info.baseCurrency;
        let exposureKey: string;
        
        // Determinar qué exposiciones genéricas usar
        if (['EUR'].includes(baseCurrency)) {
          exposureKey = 'eur';
        } else if (['USD'].includes(baseCurrency)) {
          exposureKey = 'usd';
        } else if (['GBP'].includes(baseCurrency)) {
          exposureKey = 'gbp';
        } else if (['CNY', 'HKD'].includes(baseCurrency)) {
          exposureKey = 'cny';
        } else if (['JPY'].includes(baseCurrency)) {
          exposureKey = 'jpy';
        } else if (['BRL', 'MXN', 'INR', 'IDR', 'KRW', 'TWD'].includes(baseCurrency)) {
          exposureKey = 'emerging';
        } else {
          exposureKey = 'default';
        }
        
        console.log(`[Forex] Detectado ${symbol} → ${info.region} (${baseCurrency}), usando exposición: ${exposureKey}`);
        return {
          baseCurrency,
          exposures: GENERIC_EXPOSURES[exposureKey] || GENERIC_EXPOSURES['default'],
        };
      }
    }
    
    // 3. Detectar cryptos (terminan en -USD, -EUR, etc.)
    if (symbol.includes('-USD') || symbol.includes('-EUR')) {
      console.log(`[Forex] ${symbol} es crypto - forex no aplica significativamente`);
      return {
        baseCurrency: 'USD',
        exposures: [], // Cryptos no tienen la misma exposición forex
      };
    }
    
    // 4. Si no tiene sufijo, asumir USA (NYSE, NASDAQ)
    console.log(`[Forex] ${symbol} sin sufijo, asumiendo USD (mercado USA)`);
    return {
      baseCurrency: 'USD',
      exposures: GENERIC_EXPOSURES['usd'],
    };
  }
  
  /**
   * Analiza el impacto de tipos de cambio para una empresa
   */
  async analyzeForexImpact(symbol: string): Promise<ForexImpact> {
    console.log(`[Forex] Analizando impacto forex para ${symbol}`);
    
    const exposure = this.getExposureForSymbol(symbol);
    
    // Si no hay exposures (ej: crypto), devolver sin datos
    if (exposure.exposures.length === 0) {
      console.log(`[Forex] ${symbol} sin exposición forex relevante`);
      return {
        baseCurrency: exposure.baseCurrency,
        currencyPairs: [],
        overallTrend: 'stable',
        forexScore: 0,
        hasData: false,
        summary: 'Tipo de activo sin exposición forex significativa',
      };
    }
    
    // Obtener datos de cada divisa a la que está expuesta
    const pairPromises = exposure.exposures.map(async (exp) => {
      const data = await this.getForexData(exp.currency);
      return { exposure: exp, data };
    });
    
    const results = await Promise.all(pairPromises);
    const validResults = results.filter(r => r.data !== null);
    
    if (validResults.length === 0) {
      return {
        baseCurrency: exposure.baseCurrency,
        currencyPairs: [],
        overallTrend: 'stable',
        forexScore: 0,
        hasData: false,
        summary: 'Error obteniendo datos de divisas',
      };
    }
    
    // Construir análisis de cada par
    const currencyPairs = validResults.map(({ exposure: exp, data }) => {
      // Determinar tendencia del EUR vs esta moneda
      let trend: 'strengthening' | 'weakening' | 'stable' = 'stable';
      if (data!.change1w > 0.5) trend = 'strengthening'; // EUR subió
      else if (data!.change1w < -0.5) trend = 'weakening'; // EUR bajó
      
      // Para empresas con base EUR:
      // - EUR se fortalece = NEGATIVO (exportaciones valen menos)
      // - EUR se debilita = POSITIVO (exportaciones valen más)
      // Para empresas USA (base USD): al revés
      let impact: 'positive' | 'negative' | 'neutral' = 'neutral';
      
      if (exposure.baseCurrency === 'EUR') {
        // Empresa europea: EUR fuerte = malo
        if (trend === 'strengthening') impact = 'negative';
        else if (trend === 'weakening') impact = 'positive';
      } else if (exposure.baseCurrency === 'USD') {
        // Empresa USA: USD fuerte = malo para ventas internacionales
        // Como medimos EUR/X, si EUR sube, USD baja relativamente
        if (trend === 'strengthening') impact = 'positive'; // USD más débil
        else if (trend === 'weakening') impact = 'negative'; // USD más fuerte
      } else if (exposure.baseCurrency === 'CNY') {
        // Empresa China: CNY débil = positivo para exportaciones
        if (trend === 'strengthening') impact = 'positive'; // EUR sube, CNY relativamente más débil
        else if (trend === 'weakening') impact = 'negative';
      }
      
      return {
        pair: `EUR/${exp.currency}`,
        currentRate: data!.currentRate,
        change1w: data!.change1w,
        change1m: data!.change1m,
        trend,
        impact,
        relevance: exp.relevance,
      };
    });
    
    // Calcular score ponderado (-100 a +100)
    let forexScore = 0;
    let totalWeight = 0;
    
    for (const result of validResults) {
      const { exposure: exp, data } = result;
      totalWeight += exp.weight;
      
      // Impacto basado en cambio semanal (más reciente y relevante)
      // Normalizar: ±2% cambio semanal = ±50 puntos
      let pairImpact = data!.change1w * 25; // ±2% = ±50
      
      // Invertir para empresas EUR (EUR fuerte = negativo)
      if (exposure.baseCurrency === 'EUR') {
        pairImpact = -pairImpact; // EUR sube = negativo
      }
      // Para empresas no-EUR (USD, CNY), ya está bien: EUR sube = su moneda más competitiva
      
      forexScore += pairImpact * exp.weight;
    }
    
    // Normalizar por peso total
    if (totalWeight > 0) {
      forexScore = forexScore / totalWeight;
    }
    
    // Limitar a -100 a +100
    forexScore = Math.max(-100, Math.min(100, forexScore));
    
    // Tendencia general del EUR
    const avgEurChange = currencyPairs.reduce((sum, p) => sum + p.change1w, 0) / currencyPairs.length;
    let overallTrend: 'eur_strong' | 'eur_weak' | 'stable' = 'stable';
    if (avgEurChange > 0.5) overallTrend = 'eur_strong';
    else if (avgEurChange < -0.5) overallTrend = 'eur_weak';
    
    // Generar resumen
    let summary = '';
    const positiveImpacts = currencyPairs.filter(p => p.impact === 'positive').length;
    const negativeImpacts = currencyPairs.filter(p => p.impact === 'negative').length;
    
    if (exposure.baseCurrency === 'EUR') {
      if (overallTrend === 'eur_strong') {
        summary = `Euro fortalecido (${avgEurChange.toFixed(1)}% esta semana). `;
        summary += `Esto es NEGATIVO para ${symbol} ya que sus ingresos internacionales valen menos en euros.`;
      } else if (overallTrend === 'eur_weak') {
        summary = `Euro debilitado (${avgEurChange.toFixed(1)}% esta semana). `;
        summary += `Esto es POSITIVO para ${symbol} ya que sus ingresos internacionales valen más en euros.`;
      } else {
        summary = `Tipos de cambio estables esta semana. Impacto neutral en ${symbol}.`;
      }
    } else {
      if (forexScore > 20) {
        summary = `Movimientos de divisas favorables para ${symbol} (score: ${forexScore.toFixed(0)}).`;
      } else if (forexScore < -20) {
        summary = `Movimientos de divisas desfavorables para ${symbol} (score: ${forexScore.toFixed(0)}).`;
      } else {
        summary = `Impacto de divisas neutral para ${symbol}.`;
      }
    }
    
    console.log(`[Forex] Score: ${forexScore.toFixed(0)}, Trend: ${overallTrend}`);
    console.log(`[Forex] ${summary}`);
    
    return {
      baseCurrency: exposure.baseCurrency,
      currencyPairs,
      overallTrend,
      forexScore: Math.round(forexScore),
      hasData: true,
      summary,
    };
  }
}

export const forexAnalysisService = new ForexAnalysisService();
