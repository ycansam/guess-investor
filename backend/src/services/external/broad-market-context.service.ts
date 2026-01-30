/**
 * Broad Market Context Service
 * Detecta condiciones de mercado amplias (correcciones, crashes, burbujas, toma de beneficios)
 * y proporciona ajustes para las predicciones individuales.
 * 
 * Este servicio es clave para capturar eventos sistémicos que afectan a TODOS los activos,
 * como:
 * - Correcciones de mercado (-5% a -10%)
 * - Crashes (-10%+)
 * - Rally generalizado
 * - Toma de beneficios tras máximos
 * - Sobrevaloración generalizada (P/E ratio alto del mercado)
 */

import { logger } from '../../middleware/logger.js';

// ============================================================================
// TIPOS
// ============================================================================

export type MarketCondition = 
  | 'crash'           // Caída >10% en <2 semanas
  | 'correction'      // Caída 5-10%
  | 'profit_taking'   // Retroceso 3-5% tras máximos
  | 'bubble_warning'  // Sobrevaloración + euforia
  | 'fear_extreme'    // VIX >30, miedo extremo
  | 'recovery'        // Rebote desde mínimos
  | 'bull_healthy'    // Alcista saludable
  | 'bull_euphoria'   // Alcista con exceso de optimismo
  | 'neutral'         // Sin señales claras
  | 'bear_orderly';   // Bajista pero ordenado

export interface BroadMarketData {
  // Índices principales
  sp500: { price: number; change1d: number; change5d: number; change20d: number; fromATH: number } | null;
  nasdaq: { price: number; change1d: number; change5d: number; change20d: number; fromATH: number } | null;
  djia: { price: number; change1d: number; change5d: number; change20d: number; fromATH: number } | null;
  
  // Indicadores de miedo/euforia
  vix: number;
  vixChange5d: number;
  putCallRatio: number;
  
  // Amplitud del mercado
  advanceDeclineRatio: number;  // % de acciones subiendo vs bajando
  newHighsLows: number;         // Ratio nuevos máximos / nuevos mínimos
  
  // Valoración
  sp500PE: number;              // P/E ratio del S&P 500
  buffettIndicator: number;     // Market Cap / GDP (>100% = sobrevaloración)
  
  // Timestamp
  timestamp: string;
}

export interface MarketContextAnalysis {
  condition: MarketCondition;
  severity: 'mild' | 'moderate' | 'severe';
  confidence: number;           // 0-100
  
  // Ajustes recomendados
  predictionBias: number;       // -50 a +50, se suma al predicted change
  confidenceMultiplier: number; // 0.5 a 1.2
  volatilityMultiplier: number; // 1.0 a 2.0
  
  // Información contextual
  signals: string[];
  reasoning: string;
  recommendation: string;
  
  // Datos subyacentes
  data: Partial<BroadMarketData>;
  timestamp: string;
}

// ============================================================================
// CACHE
// ============================================================================

let cachedContext: MarketContextAnalysis | null = null;
let lastFetchTime = 0;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutos

// ============================================================================
// SERVICIO
// ============================================================================

export const broadMarketContextService = {
  /**
   * Obtiene el contexto actual del mercado (con cache)
   */
  async getCurrentContext(forceRefresh = false): Promise<MarketContextAnalysis> {
    if (!forceRefresh && cachedContext && Date.now() - lastFetchTime < CACHE_TTL) {
      return cachedContext;
    }

    try {
      const data = await this.fetchMarketData();
      const analysis = this.analyzeMarketContext(data);
      
      cachedContext = analysis;
      lastFetchTime = Date.now();
      
      logger.info(`[BroadMarket] Condition: ${analysis.condition} (${analysis.severity}), bias: ${analysis.predictionBias.toFixed(1)}%`);
      
      return analysis;
    } catch (error) {
      logger.error('[BroadMarket] Error fetching market context:', error);
      return this.getDefaultContext();
    }
  },

  /**
   * Obtiene datos de mercado de múltiples fuentes
   */
  async fetchMarketData(): Promise<Partial<BroadMarketData>> {
    const data: Partial<BroadMarketData> = {
      timestamp: new Date().toISOString(),
    };

    try {
      // Obtener datos en paralelo
      const [sp500Data, nasdaqData, vixData] = await Promise.all([
        this.fetchIndexData('^GSPC', '3mo'),  // S&P 500 con 3 meses
        this.fetchIndexData('^IXIC', '3mo'),  // NASDAQ
        this.fetchVIXData(),
      ]);

      if (sp500Data) data.sp500 = sp500Data;
      if (nasdaqData) data.nasdaq = nasdaqData;
      if (vixData) {
        data.vix = vixData.current;
        data.vixChange5d = vixData.change5d;
      }

      // Intentar obtener P/E ratio (usar estimación si no está disponible)
      data.sp500PE = await this.estimateSP500PE();
      
      // Put/Call ratio (intentar, pero no bloquear si falla)
      try {
        data.putCallRatio = await this.fetchPutCallRatio();
      } catch {
        data.putCallRatio = 1.0; // Neutral
      }

    } catch (error) {
      logger.error('[BroadMarket] Error fetching market data:', error);
    }

    return data;
  },

  /**
   * Obtiene datos de un índice
   */
  async fetchIndexData(
    symbol: string,
    range: string = '1mo'
  ): Promise<BroadMarketData['sp500'] | null> {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
      
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) return null;

      const json: any = await response.json();
      const result = json.chart?.result?.[0];
      const closes = result?.indicators?.quote?.[0]?.close?.filter((c: any) => c !== null) || [];

      if (closes.length < 5) return null;

      const current = closes[closes.length - 1];
      const prev1d = closes[closes.length - 2] || current;
      const prev5d = closes[Math.max(0, closes.length - 6)] || current;
      const prev20d = closes[Math.max(0, closes.length - 21)] || current;
      const maxPrice = Math.max(...closes);

      return {
        price: current,
        change1d: ((current - prev1d) / prev1d) * 100,
        change5d: ((current - prev5d) / prev5d) * 100,
        change20d: ((current - prev20d) / prev20d) * 100,
        fromATH: ((current - maxPrice) / maxPrice) * 100, // Siempre <= 0
      };
    } catch (error) {
      logger.error(`[BroadMarket] Error fetching ${symbol}:`, error);
      return null;
    }
  },

  /**
   * Obtiene datos del VIX
   */
  async fetchVIXData(): Promise<{ current: number; change5d: number } | null> {
    try {
      const url = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?range=1mo&interval=1d';
      
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) return null;

      const json: any = await response.json();
      const closes = json.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter((c: any) => c !== null) || [];

      if (closes.length < 5) return null;

      const current = closes[closes.length - 1];
      const prev5d = closes[Math.max(0, closes.length - 6)] || current;

      return {
        current,
        change5d: ((current - prev5d) / prev5d) * 100,
      };
    } catch (error) {
      return null;
    }
  },

  /**
   * Estima el P/E ratio del S&P 500
   * En un sistema real, esto vendría de una API de datos fundamentales
   */
  async estimateSP500PE(): Promise<number> {
    // Valor histórico promedio ~15-20, actualmente (2024-2026) tiende a estar elevado
    // Si tuviéramos acceso a datos reales, usaríamos eso
    // Por ahora, usamos una estimación conservadora
    return 22; // Ligeramente sobrevalorado respecto a la media histórica
  },

  /**
   * Obtiene el Put/Call ratio
   */
  async fetchPutCallRatio(): Promise<number> {
    // Intentar obtener de CBOE o similar
    // Por defecto, retornar neutral si no hay datos
    return 1.0;
  },

  /**
   * Analiza el contexto del mercado y genera recomendaciones
   */
  analyzeMarketContext(data: Partial<BroadMarketData>): MarketContextAnalysis {
    const signals: string[] = [];
    let condition: MarketCondition = 'neutral';
    let severity: 'mild' | 'moderate' | 'severe' = 'mild';
    let confidence = 50;
    let predictionBias = 0;
    let confidenceMultiplier = 1.0;
    let volatilityMultiplier = 1.0;

    const vix = data.vix ?? 20;
    const vixChange5d = data.vixChange5d ?? 0;
    const sp500 = data.sp500;
    const nasdaq = data.nasdaq;
    
    // ========================================================================
    // ANÁLISIS DE CONDICIONES (MEJORADO - más sensible a corto plazo)
    // ========================================================================

    // Calcular la caída más significativa (corto o medio plazo)
    const worstChange = sp500 ? Math.min(sp500.change5d, sp500.change20d) : 0;
    const recentDropSevere = sp500 && sp500.change5d < -5; // Caída >5% en 5 días es severa
    const fromATHDrop = sp500?.fromATH ?? 0; // Siempre negativo o 0

    // 1. CRASH: Caída extrema en CUALQUIER período
    if (sp500 && (sp500.change20d < -10 || sp500.change5d < -7)) {
      condition = 'crash';
      const dropMagnitude = Math.min(sp500.change20d, sp500.change5d);
      severity = dropMagnitude < -12 ? 'severe' : 'moderate';
      confidence = 85;
      predictionBias = dropMagnitude * 0.35; // Sesgo negativo fuerte
      confidenceMultiplier = 0.55; // Mucha incertidumbre
      volatilityMultiplier = 2.0;
      if (sp500.change5d < -7) {
        signals.push(`⚠️ CRASH: S&P 500 ${sp500.change5d.toFixed(1)}% en solo 5 días`);
      }
      if (sp500.change20d < -10) {
        signals.push(`S&P 500 en caída de ${sp500.change20d.toFixed(1)}% en 20 días`);
      }
    }
    // 2. CORRECCIÓN AGUDA: Caída rápida significativa (5-7% en 5 días)
    else if (sp500 && sp500.change5d < -5) {
      condition = 'correction';
      severity = sp500.change5d < -6 ? 'moderate' : 'mild';
      confidence = 80;
      predictionBias = sp500.change5d * 0.3; // Sesgo negativo moderado-alto
      confidenceMultiplier = 0.7;
      volatilityMultiplier = 1.6;
      signals.push(`⚠️ Corrección aguda: ${sp500.change5d.toFixed(1)}% en 5 días`);
    }
    // 3. CORRECCIÓN GRADUAL: Caída lenta pero significativa (5-10% en 20 días)
    else if (sp500 && sp500.change20d < -5) {
      condition = 'correction';
      severity = sp500.change20d < -7 ? 'moderate' : 'mild';
      confidence = 75;
      predictionBias = sp500.change20d * 0.25; // Sesgo negativo moderado
      confidenceMultiplier = 0.75;
      volatilityMultiplier = 1.5;
      signals.push(`Corrección en curso: ${sp500.change20d.toFixed(1)}% en 20 días`);
    }
    // 4. TOMA DE BENEFICIOS / RETROCESO: Caída leve pero notable
    else if (sp500 && (sp500.change5d < -2 || (sp500.change1d < -1.5 && vixChange5d > 15))) {
      condition = 'profit_taking';
      severity = sp500.change5d < -3 ? 'moderate' : 'mild';
      confidence = 65;
      predictionBias = Math.min(sp500.change5d, sp500.change1d * 2) * 0.4; // Sesgo negativo
      confidenceMultiplier = 0.85;
      volatilityMultiplier = 1.3;
      signals.push(`Toma de beneficios: ${sp500.change5d.toFixed(1)}% en 5 días`);
      if (sp500.change1d < -1.5) {
        signals.push(`Caída diaria notable: ${sp500.change1d.toFixed(1)}% hoy`);
      }
      if (vixChange5d > 15) {
        signals.push(`VIX subiendo rápido: +${vixChange5d.toFixed(0)}% en 5 días`);
      }
    }
    // 5. MIEDO EXTREMO: VIX muy alto
    else if (vix > 30) {
      condition = 'fear_extreme';
      severity = vix > 40 ? 'severe' : 'moderate';
      confidence = 80;
      predictionBias = vix > 40 ? 3 : 1; // Ligero sesgo contrarian bullish
      confidenceMultiplier = 0.6;
      volatilityMultiplier = 1.8;
      signals.push(`VIX en nivel de miedo extremo: ${vix.toFixed(1)}`);
    }
    // 6. VIX ELEVÁNDOSE RÁPIDO (señal de nerviosismo creciente)
    else if (vix > 20 && vixChange5d > 25) {
      condition = 'profit_taking';
      severity = 'mild';
      confidence = 60;
      predictionBias = -2;
      confidenceMultiplier = 0.8;
      volatilityMultiplier = 1.4;
      signals.push(`VIX en aumento rápido: ${vix.toFixed(1)} (+${vixChange5d.toFixed(0)}% en 5 días)`);
      signals.push('Señal de nerviosismo creciente en el mercado');
    }
    // 7. EUFORIA ALCISTA: Subidas fuertes + VIX bajo
    else if (sp500 && sp500.change20d > 8 && vix < 15) {
      condition = 'bull_euphoria';
      severity = sp500.change20d > 12 ? 'moderate' : 'mild';
      confidence = 70;
      predictionBias = -3; // Sesgo contrarian bearish
      confidenceMultiplier = 0.8;
      volatilityMultiplier = 1.3;
      signals.push(`Rally eufórico: +${sp500.change20d.toFixed(1)}% en 20 días con VIX bajo`);
    }
    // 8. ADVERTENCIA DE BURBUJA: P/E alto + subidas fuertes
    else if ((data.sp500PE ?? 22) > 25 && sp500 && sp500.change20d > 5) {
      condition = 'bubble_warning';
      severity = 'mild';
      confidence = 60;
      predictionBias = -4;
      confidenceMultiplier = 0.85;
      volatilityMultiplier = 1.2;
      signals.push(`Advertencia de valoración: P/E ~${data.sp500PE} con mercado en rally`);
    }
    // 9. RECUPERACIÓN: Rebote desde mínimos recientes
    else if (sp500 && sp500.change5d > 3 && sp500.change20d < -3) {
      condition = 'recovery';
      severity = 'mild';
      confidence = 60;
      predictionBias = 1.5; // Ligero sesgo positivo
      confidenceMultiplier = 0.85;
      volatilityMultiplier = 1.3;
      signals.push(`Recuperación: +${sp500.change5d.toFixed(1)}% en 5 días desde corrección`);
    }
    // 8. MERCADO ALCISTA SALUDABLE
    else if (sp500 && sp500.change20d > 2 && sp500.change20d < 8 && vix < 20) {
      condition = 'bull_healthy';
      severity = 'mild';
      confidence = 65;
      predictionBias = 1; // Ligero sesgo positivo
      confidenceMultiplier = 1.1;
      volatilityMultiplier = 0.9;
      signals.push(`Mercado alcista saludable: +${sp500.change20d.toFixed(1)}%`);
    }
    // 9. MERCADO BAJISTA ORDENADO
    else if (sp500 && sp500.change20d < -2 && sp500.change20d > -5) {
      condition = 'bear_orderly';
      severity = 'mild';
      confidence = 60;
      predictionBias = -1.5; // Ligero sesgo negativo
      confidenceMultiplier = 0.9;
      volatilityMultiplier = 1.1;
      signals.push(`Mercado bajista ordenado: ${sp500.change20d.toFixed(1)}%`);
    }

    // ========================================================================
    // AJUSTES ADICIONALES
    // ========================================================================

    // Si NASDAQ está cayendo más que S&P, es señal de risk-off en tech
    if (nasdaq && sp500 && nasdaq.change20d < sp500.change20d - 3) {
      signals.push(`Tech bajo presión: NASDAQ ${nasdaq.change20d.toFixed(1)}% vs S&P ${sp500.change20d.toFixed(1)}%`);
      predictionBias -= 1; // Ajuste adicional bajista
    }

    // Si VIX ha subido mucho en 5 días, hay nerviosismo creciente
    if ((data.vixChange5d ?? 0) > 30) {
      signals.push(`VIX en aumento rápido: +${data.vixChange5d?.toFixed(1)}% en 5 días`);
      confidenceMultiplier *= 0.9;
      volatilityMultiplier *= 1.2;
    }

    // Asegurar límites
    predictionBias = Math.max(-30, Math.min(30, predictionBias));
    confidenceMultiplier = Math.max(0.5, Math.min(1.2, confidenceMultiplier));
    volatilityMultiplier = Math.max(1.0, Math.min(2.5, volatilityMultiplier));

    const reasoning = this.generateReasoning(condition, severity, signals);
    const recommendation = this.generateRecommendation(condition, severity);

    return {
      condition,
      severity,
      confidence,
      predictionBias,
      confidenceMultiplier,
      volatilityMultiplier,
      signals,
      reasoning,
      recommendation,
      data,
      timestamp: new Date().toISOString(),
    };
  },

  /**
   * Genera explicación del análisis
   */
  generateReasoning(condition: MarketCondition, severity: string, signals: string[]): string {
    const conditionLabels: Record<MarketCondition, string> = {
      crash: '📉 CRASH DE MERCADO',
      correction: '⚠️ Corrección en curso',
      profit_taking: '💰 Toma de beneficios',
      bubble_warning: '🫧 Advertencia de sobrevaloración',
      fear_extreme: '😱 Miedo extremo (contrarian)',
      recovery: '📈 Recuperación',
      bull_healthy: '🐂 Mercado alcista saludable',
      bull_euphoria: '🚀 Euforia alcista (precaución)',
      neutral: '➡️ Mercado neutral',
      bear_orderly: '🐻 Mercado bajista ordenado',
    };

    let reasoning = `${conditionLabels[condition]} (${severity})`;
    
    if (signals.length > 0) {
      reasoning += `. Señales: ${signals.join('; ')}`;
    }

    return reasoning;
  },

  /**
   * Genera recomendación según condiciones
   */
  generateRecommendation(condition: MarketCondition, severity: string): string {
    switch (condition) {
      case 'crash':
        return severity === 'severe'
          ? 'Extrema precaución. Las predicciones individuales tienen alta incertidumbre. Priorizar preservación de capital.'
          : 'Mercado en caída libre. Considerar que las predicciones pueden verse afectadas por el pánico generalizado.';
      
      case 'correction':
        return 'Corrección en curso. Las predicciones pueden ser más volátiles. Considerar el contexto bajista general.';
      
      case 'profit_taking':
        return 'Retroceso tras máximos. Posible pausa temporal. Las predicciones pueden mostrar sesgo bajista a corto plazo.';
      
      case 'bubble_warning':
        return 'Valoraciones elevadas. Las predicciones alcistas deben tomarse con cautela extra.';
      
      case 'fear_extreme':
        return 'Miedo extremo en el mercado. Puede ser oportunidad contrarian, pero la volatilidad es muy alta.';
      
      case 'recovery':
        return 'Señales de recuperación. Las predicciones pueden ser más fiables si se confirma el rebote.';
      
      case 'bull_healthy':
        return 'Mercado alcista saludable. Condiciones favorables para predicciones alcistas.';
      
      case 'bull_euphoria':
        return 'Exceso de optimismo. Precaución con predicciones muy alcistas, posible reversión.';
      
      case 'bear_orderly':
        return 'Tendencia bajista moderada. Considerar sesgo negativo en predicciones.';
      
      default:
        return 'Condiciones de mercado neutrales. Las predicciones se basan principalmente en factores individuales.';
    }
  },

  /**
   * Contexto por defecto cuando hay error
   */
  getDefaultContext(): MarketContextAnalysis {
    return {
      condition: 'neutral',
      severity: 'mild',
      confidence: 30,
      predictionBias: 0,
      confidenceMultiplier: 1.0,
      volatilityMultiplier: 1.0,
      signals: ['Sin datos de mercado disponibles'],
      reasoning: 'No se pudieron obtener datos de mercado. Usando valores neutrales.',
      recommendation: 'Las predicciones se basan solo en factores individuales sin contexto de mercado.',
      data: {},
      timestamp: new Date().toISOString(),
    };
  },

  /**
   * Aplica el sesgo del contexto de mercado a una predicción
   */
  applyToPredicti(
    predictedChange: number,
    confidence: number,
    assetType: 'stock' | 'crypto' | 'forex' | 'commodity' | 'index' | 'other'
  ): { adjustedChange: number; adjustedConfidence: number; contextApplied: boolean; contextInfo: string } {
    const context = cachedContext;
    
    if (!context || context.condition === 'neutral') {
      return {
        adjustedChange: predictedChange,
        adjustedConfidence: confidence,
        contextApplied: false,
        contextInfo: 'Sin ajuste de contexto de mercado',
      };
    }

    // Determinar factor de aplicación según tipo de activo
    let applicationFactor = 1.0;
    switch (assetType) {
      case 'stock':
      case 'index':
        applicationFactor = 1.0; // Efecto completo
        break;
      case 'crypto':
        applicationFactor = 0.7; // Cripto menos correlacionado pero aún afectado
        break;
      case 'forex':
        applicationFactor = 0.5; // Forex tiene sus propias dinámicas
        break;
      case 'commodity':
        applicationFactor = 0.6;
        break;
      default:
        applicationFactor = 0.8;
    }

    // Aplicar sesgo
    const biasToApply = context.predictionBias * applicationFactor;
    const adjustedChange = predictedChange + biasToApply;
    
    // Aplicar multiplicador de confianza
    const adjustedConfidence = Math.round(
      Math.max(15, Math.min(95, confidence * context.confidenceMultiplier))
    );

    return {
      adjustedChange,
      adjustedConfidence,
      contextApplied: true,
      contextInfo: `${context.condition} (${context.severity}): bias ${biasToApply > 0 ? '+' : ''}${biasToApply.toFixed(1)}%`,
    };
  },

  /**
   * Obtiene el contexto actual en cache (sin fetch)
   */
  getCachedContext(): MarketContextAnalysis | null {
    return cachedContext;
  },

  /**
   * Fuerza la limpieza del cache
   */
  clearCache(): void {
    cachedContext = null;
    lastFetchTime = 0;
  },
};
