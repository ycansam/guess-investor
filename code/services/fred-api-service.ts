/**
 * Servicio de integración con FRED API (Federal Reserve Economic Data)
 * 
 * Proporciona datos económicos en tiempo real:
 * - CPI (Consumer Price Index) - Inflación
 * - GDP (Gross Domestic Product) - PIB
 * - UNRATE (Unemployment Rate) - Tasa de desempleo
 * - FEDFUNDS (Federal Funds Rate) - Tasa de la Fed
 * - DGS10 (10-Year Treasury Rate) - Rendimiento bonos 10 años
 * - PMI (ISM Manufacturing PMI)
 * - PAYEMS (Total Nonfarm Payrolls) - NFP
 * 
 * API: https://fred.stlouisfed.org/docs/api/fred/
 * La API es gratuita con límite de 120 requests por minuto
 * 
 * Nota: Para usar FRED API se necesita API key gratuita de:
 * https://fred.stlouisfed.org/docs/api/api_key.html
 */

import { fetchWithCorsProxy } from './cors-proxy';

// ============================================================================
// CONFIGURACIÓN
// ============================================================================

// API Key de FRED (gratuita, obtener en https://fred.stlouisfed.org/docs/api/api_key.html)
// Si no hay API key configurada, usamos datos de fallback
const FRED_API_KEY = process.env.EXPO_PUBLIC_FRED_API_KEY || '';
const FRED_BASE_URL = 'https://api.stlouisfed.org/fred';

// Series IDs de FRED
const FRED_SERIES = {
  // Inflación
  CPI: 'CPIAUCSL',           // CPI for All Urban Consumers (monthly)
  CPI_YOY: 'CPIAUCNS',       // CPI YoY % change
  CORE_CPI: 'CPILFESL',      // Core CPI (less food and energy)
  PCE: 'PCEPI',              // PCE Price Index (Fed's preferred)
  
  // PIB
  GDP: 'GDP',                 // Gross Domestic Product (quarterly)
  GDP_GROWTH: 'A191RL1Q225SBEA', // Real GDP growth rate
  
  // Empleo
  UNEMPLOYMENT: 'UNRATE',     // Unemployment Rate
  NFP: 'PAYEMS',              // Total Nonfarm Payrolls
  INITIAL_CLAIMS: 'ICSA',     // Initial Jobless Claims (weekly)
  
  // Tasas de interés
  FED_FUNDS: 'FEDFUNDS',      // Federal Funds Effective Rate
  FED_FUNDS_TARGET: 'DFEDTARU', // Fed Funds Target Upper Limit
  T10Y: 'DGS10',              // 10-Year Treasury Constant Maturity
  T2Y: 'DGS2',                // 2-Year Treasury
  T10Y2Y: 'T10Y2Y',           // 10Y-2Y Spread (yield curve)
  
  // Indicadores de actividad
  PMI_MFG: 'MANEMP',          // Manufacturing Employment (proxy for PMI)
  INDUSTRIAL_PROD: 'INDPRO',  // Industrial Production Index
  RETAIL_SALES: 'RSXFS',      // Retail Sales
  
  // Sentimiento
  CONSUMER_SENTIMENT: 'UMCSENT', // University of Michigan Consumer Sentiment
  
  // Mercado inmobiliario
  HOUSING_STARTS: 'HOUST',    // Housing Starts
  
  // Volatilidad / Riesgo
  VIX: 'VIXCLS',              // CBOE Volatility Index
};

// Caché para datos de FRED
interface FREDCacheEntry {
  data: FREDSeriesData;
  timestamp: number;
}
const fredCache = new Map<string, FREDCacheEntry>();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hora (datos económicos no cambian frecuentemente)

// ============================================================================
// INTERFACES
// ============================================================================

export interface FREDObservation {
  date: string;
  value: string; // FRED devuelve strings, '.' significa no disponible
}

export interface FREDSeriesData {
  seriesId: string;
  title: string;
  frequency: string;
  units: string;
  lastUpdated: string;
  observations: FREDObservation[];
  latestValue: number | null;
  previousValue: number | null;
  changePercent: number | null;
}

export interface FREDEconomicData {
  // Inflación
  cpi?: {
    current: number;
    previous: number;
    yoyChange: number;
    trend: 'rising' | 'falling' | 'stable';
    lastUpdate: string;
  };
  coreCpi?: {
    current: number;
    previous: number;
    yoyChange: number;
  };
  pce?: {
    current: number;
    previous: number;
    yoyChange: number;
  };
  
  // PIB
  gdp?: {
    current: number;      // Billones USD
    growthRate: number;   // % anualizado
    trend: 'expansion' | 'contraction' | 'stagnation';
    lastUpdate: string;
  };
  
  // Empleo
  employment?: {
    unemploymentRate: number;
    previousRate: number;
    nfpTotal: number;      // Total empleados (millones)
    nfpChange: number;     // Cambio vs mes anterior
    initialClaims: number; // Solicitudes de desempleo semanales
    trend: 'improving' | 'worsening' | 'stable';
    lastUpdate: string;
  };
  
  // Tasas de interés
  interestRates?: {
    fedFunds: number;
    fedFundsTarget: number;
    treasury10Y: number;
    treasury2Y: number;
    yieldCurveSpread: number; // 10Y - 2Y (negativo = inversión = recesión)
    curveStatus: 'normal' | 'flat' | 'inverted';
    lastUpdate: string;
  };
  
  // Sentimiento
  sentiment?: {
    consumerSentiment: number;
    previousSentiment: number;
    trend: 'optimistic' | 'pessimistic' | 'neutral';
  };
  
  // Meta
  hasRealTimeData: boolean;
  usingFallback: boolean;
  lastFetch: Date;
  summary: string;
}

// ============================================================================
// SERVICIO
// ============================================================================

class FREDApiService {
  private apiKeyAvailable: boolean;
  
  constructor() {
    this.apiKeyAvailable = FRED_API_KEY.length > 0;
    if (!this.apiKeyAvailable) {
      console.log('[FRED] API key no configurada. Usando datos de fallback.');
      console.log('[FRED] Para datos en tiempo real, configura EXPO_PUBLIC_FRED_API_KEY');
    } else {
      console.log('[FRED] API key configurada ✓');
    }
  }
  
  /**
   * Obtiene datos de una serie de FRED
   */
  private async getSeriesData(seriesId: string, limit: number = 12): Promise<FREDSeriesData | null> {
    // Verificar caché
    const cached = fredCache.get(seriesId);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`[FRED] Cache hit: ${seriesId}`);
      return cached.data;
    }
    
    if (!this.apiKeyAvailable) {
      return null;
    }
    
    try {
      // Obtener info de la serie
      const infoUrl = `${FRED_BASE_URL}/series?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json`;
      const infoResponse = await fetchWithCorsProxy(infoUrl, { signal: AbortSignal.timeout(10000) });
      const infoData = await infoResponse.json();
      
      if (!infoData.seriess?.[0]) {
        console.warn(`[FRED] No info for series ${seriesId}`);
        return null;
      }
      
      const seriesInfo = infoData.seriess[0];
      
      // Obtener observaciones recientes
      const obsUrl = `${FRED_BASE_URL}/series/observations?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=${limit}`;
      const obsResponse = await fetchWithCorsProxy(obsUrl, { signal: AbortSignal.timeout(10000) });
      const obsData = await obsResponse.json();
      
      if (!obsData.observations?.length) {
        console.warn(`[FRED] No observations for series ${seriesId}`);
        return null;
      }
      
      // Procesar observaciones
      const observations: FREDObservation[] = obsData.observations
        .filter((obs: any) => obs.value !== '.')
        .reverse(); // Ordenar de más antiguo a más reciente
      
      const latestObs = observations[observations.length - 1];
      const prevObs = observations[observations.length - 2];
      
      const latestValue = latestObs ? parseFloat(latestObs.value) : null;
      const previousValue = prevObs ? parseFloat(prevObs.value) : null;
      
      let changePercent: number | null = null;
      if (latestValue !== null && previousValue !== null && previousValue !== 0) {
        changePercent = ((latestValue - previousValue) / previousValue) * 100;
      }
      
      const result: FREDSeriesData = {
        seriesId,
        title: seriesInfo.title,
        frequency: seriesInfo.frequency,
        units: seriesInfo.units,
        lastUpdated: seriesInfo.last_updated,
        observations,
        latestValue,
        previousValue,
        changePercent,
      };
      
      // Guardar en caché
      fredCache.set(seriesId, { data: result, timestamp: Date.now() });
      
      console.log(`[FRED] ${seriesId}: ${latestValue} (${changePercent?.toFixed(2)}% change)`);
      
      return result;
      
    } catch (error) {
      console.error(`[FRED] Error fetching ${seriesId}:`, error);
      return null;
    }
  }
  
  /**
   * Calcula el cambio YoY para una serie
   */
  private calculateYoYChange(observations: FREDObservation[]): number | null {
    if (observations.length < 12) return null;
    
    const latest = parseFloat(observations[observations.length - 1]?.value);
    const yearAgo = parseFloat(observations[observations.length - 12]?.value);
    
    if (isNaN(latest) || isNaN(yearAgo) || yearAgo === 0) return null;
    
    return ((latest - yearAgo) / yearAgo) * 100;
  }
  
  /**
   * Obtiene todos los indicadores económicos de FRED
   */
  async getEconomicData(): Promise<FREDEconomicData> {
    console.log('[FRED] Fetching economic data...');
    
    // Si no hay API key, devolver datos vacíos
    if (!this.apiKeyAvailable) {
      return {
        hasRealTimeData: false,
        usingFallback: true,
        lastFetch: new Date(),
        summary: 'FRED API key no configurada. Usando datos estáticos.',
      };
    }
    
    try {
      // Obtener múltiples series en paralelo
      const [
        unemploymentData,
        fedFundsData,
        t10yData,
        t2yData,
        t10y2yData,
        sentimentData,
        cpiData,
      ] = await Promise.all([
        this.getSeriesData(FRED_SERIES.UNEMPLOYMENT, 24),
        this.getSeriesData(FRED_SERIES.FED_FUNDS, 12),
        this.getSeriesData(FRED_SERIES.T10Y, 30),
        this.getSeriesData(FRED_SERIES.T2Y, 30),
        this.getSeriesData(FRED_SERIES.T10Y2Y, 30),
        this.getSeriesData(FRED_SERIES.CONSUMER_SENTIMENT, 12),
        this.getSeriesData(FRED_SERIES.CPI, 24),
      ]);
      
      // Construir resultado
      const result: FREDEconomicData = {
        hasRealTimeData: true,
        usingFallback: false,
        lastFetch: new Date(),
        summary: '',
      };
      
      // Procesar CPI
      if (cpiData && cpiData.latestValue !== null) {
        const yoyChange = this.calculateYoYChange(cpiData.observations);
        result.cpi = {
          current: cpiData.latestValue,
          previous: cpiData.previousValue || 0,
          yoyChange: yoyChange || 0,
          trend: (yoyChange || 0) > 3 ? 'rising' : (yoyChange || 0) < 2 ? 'falling' : 'stable',
          lastUpdate: cpiData.lastUpdated,
        };
      }
      
      // Procesar empleo
      if (unemploymentData && unemploymentData.latestValue !== null) {
        const prevRate = unemploymentData.previousValue || unemploymentData.latestValue;
        result.employment = {
          unemploymentRate: unemploymentData.latestValue,
          previousRate: prevRate,
          nfpTotal: 0, // Requiere otra serie
          nfpChange: 0,
          initialClaims: 0,
          trend: unemploymentData.latestValue < prevRate ? 'improving' : 
                 unemploymentData.latestValue > prevRate ? 'worsening' : 'stable',
          lastUpdate: unemploymentData.lastUpdated,
        };
      }
      
      // Procesar tasas de interés
      if (fedFundsData || t10yData || t2yData) {
        const spread = t10y2yData?.latestValue ?? 
          ((t10yData?.latestValue ?? 0) - (t2yData?.latestValue ?? 0));
        
        result.interestRates = {
          fedFunds: fedFundsData?.latestValue ?? 0,
          fedFundsTarget: fedFundsData?.latestValue ?? 0, // Aproximación
          treasury10Y: t10yData?.latestValue ?? 0,
          treasury2Y: t2yData?.latestValue ?? 0,
          yieldCurveSpread: spread,
          curveStatus: spread < -0.1 ? 'inverted' : spread < 0.5 ? 'flat' : 'normal',
          lastUpdate: fedFundsData?.lastUpdated || t10yData?.lastUpdated || '',
        };
      }
      
      // Procesar sentimiento
      if (sentimentData && sentimentData.latestValue !== null) {
        result.sentiment = {
          consumerSentiment: sentimentData.latestValue,
          previousSentiment: sentimentData.previousValue || sentimentData.latestValue,
          trend: sentimentData.latestValue > 80 ? 'optimistic' : 
                 sentimentData.latestValue < 60 ? 'pessimistic' : 'neutral',
        };
      }
      
      // Generar resumen
      const summaryParts: string[] = [];
      
      if (result.cpi) {
        summaryParts.push(`Inflación ${result.cpi.yoyChange.toFixed(1)}% YoY`);
      }
      if (result.employment) {
        summaryParts.push(`Desempleo ${result.employment.unemploymentRate.toFixed(1)}%`);
      }
      if (result.interestRates) {
        summaryParts.push(`Fed Funds ${result.interestRates.fedFunds.toFixed(2)}%`);
        if (result.interestRates.curveStatus === 'inverted') {
          summaryParts.push('⚠️ Curva invertida');
        }
      }
      
      result.summary = summaryParts.join(' | ');
      
      console.log(`[FRED] Data fetched successfully: ${result.summary}`);
      
      return result;
      
    } catch (error) {
      console.error('[FRED] Error fetching economic data:', error);
      return {
        hasRealTimeData: false,
        usingFallback: true,
        lastFetch: new Date(),
        summary: 'Error obteniendo datos de FRED',
      };
    }
  }
  
  /**
   * Obtiene un indicador específico
   */
  async getIndicator(indicator: keyof typeof FRED_SERIES): Promise<FREDSeriesData | null> {
    const seriesId = FRED_SERIES[indicator];
    if (!seriesId) {
      console.warn(`[FRED] Unknown indicator: ${indicator}`);
      return null;
    }
    return this.getSeriesData(seriesId);
  }
  
  /**
   * Verifica si la API está disponible
   */
  isAvailable(): boolean {
    return this.apiKeyAvailable;
  }
  
  /**
   * Obtiene el estado de la curva de rendimiento
   */
  async getYieldCurveStatus(): Promise<{
    spread: number;
    status: 'normal' | 'flat' | 'inverted';
    recessionRisk: 'low' | 'medium' | 'high';
  } | null> {
    const spreadData = await this.getSeriesData(FRED_SERIES.T10Y2Y, 30);
    
    if (!spreadData || spreadData.latestValue === null) {
      return null;
    }
    
    const spread = spreadData.latestValue;
    let status: 'normal' | 'flat' | 'inverted';
    let recessionRisk: 'low' | 'medium' | 'high';
    
    if (spread < -0.5) {
      status = 'inverted';
      recessionRisk = 'high';
    } else if (spread < 0) {
      status = 'inverted';
      recessionRisk = 'medium';
    } else if (spread < 0.5) {
      status = 'flat';
      recessionRisk = 'medium';
    } else {
      status = 'normal';
      recessionRisk = 'low';
    }
    
    return { spread, status, recessionRisk };
  }
}

export const fredApiService = new FREDApiService();
