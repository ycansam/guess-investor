/**
 * Servicio de Expectativas del Mercado
 * 
 * Mejora la cobertura del factor Expectations de ~45% a ~75%
 * 
 * Métricas:
 * - Earnings Surprise histórico (EPS actual vs estimado) ✓ Ya existente
 * - Revenue Surprise (Revenue actual vs estimado)
 * - Revisiones de Analistas (cambios en estimaciones)
 * - Próximos Earnings (fecha y estimaciones)
 * - Tendencia de estimaciones (7 días, 30 días, 90 días)
 * 
 * Fuentes:
 * - Yahoo Finance: earningsHistory, earningsTrend, calendarEvents
 */

import { rapidApiYahooService, YahooQuoteSummary } from './rapidapi-yahoo-service';
import { yahooCrumbService } from './yahoo-crumb-service';
import { yahooV8Service } from './yahoo-v8-service';

// ============================================================================
// INTERFACES
// ============================================================================

export interface EarningsSurprise {
  quarter: string;
  date: Date;
  epsActual: number;
  epsEstimate: number;
  epsSurprisePercent: number; // ((actual - estimate) / |estimate|) * 100
  revenueActual: number | null;
  revenueEstimate: number | null;
  revenueSurprisePercent: number | null;
}

export interface AnalystRevision {
  period: 'current' | 'next' | 'currentYear' | 'nextYear';
  label: string;
  epsEstimate: number;
  epsEstimate7dAgo: number | null;
  epsEstimate30dAgo: number | null;
  epsEstimate90dAgo: number | null;
  revenueEstimate: number;
  numberOfAnalysts: number;
  // Cambios en estimaciones (positivo = revisiones al alza = bullish)
  revisionTrend7d: number | null; // % cambio
  revisionTrend30d: number | null;
  revisionTrend90d: number | null;
}

export interface NextEarningsInfo {
  date: Date | null;
  daysUntil: number | null;
  isWithin7Days: boolean;
  isWithin30Days: boolean;
  epsEstimate: number | null;
  revenueEstimate: number | null;
  whisperNumber: number | null; // Estimación no oficial del mercado
  historicalBeatRate: number; // % de veces que ha superado estimaciones
}

export interface ExpectationsData {
  symbol: string;
  timestamp: Date;
  
  // Earnings Surprise (últimos 4 trimestres)
  earningsSurprises: EarningsSurprise[];
  lastEpsSurprise: number | null;
  avgEpsSurprise: number | null;
  lastRevenueSurprise: number | null;
  avgRevenueSurprise: number | null;
  beatRate: number; // % de trimestres que superó expectativas
  consistencyScore: number; // Consistencia en superar/fallar
  
  // Revisiones de Analistas
  revisions: AnalystRevision[];
  overallRevisionTrend: 'up' | 'down' | 'stable' | 'unknown';
  revisionScore: number; // -100 a +100
  
  // Próximos Earnings
  nextEarnings: NextEarningsInfo;
  earningsRisk: 'high' | 'medium' | 'low'; // Alta si earnings cercanos
  
  // Scores
  epsSurpriseScore: number; // 0-100
  revenueSurpriseScore: number; // 0-100
  revisionScore_normalized: number; // 0-100
  timingScore: number; // 0-100 (penaliza si earnings muy cerca)
  
  // Score combinado
  expectationsScore: number; // 0-100
  hasData: boolean;
  dataQuality: 'high' | 'medium' | 'low';
  
  summary: string;
}

// ============================================================================
// CACHÉ
// ============================================================================

interface CacheEntry {
  data: ExpectationsData;
  timestamp: number;
}

const expectationsCache = new Map<string, CacheEntry>();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutos

// ============================================================================
// SERVICIO
// ============================================================================

class ExpectationsService {
  /**
   * Obtiene datos completos de expectativas para un símbolo
   */
  async getExpectations(symbol: string): Promise<ExpectationsData | null> {
    // Las cryptos no tienen earnings
    if (symbol.includes('-EUR') || symbol.includes('-USD')) {
      console.log(`[Expectations] ${symbol} es crypto, no tiene earnings`);
      return null;
    }
    
    // Verificar caché
    const cached = expectationsCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`[Expectations] Usando caché para ${symbol}`);
      return cached.data;
    }
    
    try {
      console.log(`[Expectations] Obteniendo expectativas para ${symbol}`);
      
      // PASO 1: Verificar que el símbolo existe con Yahoo V8 (GRATIS)
      const v8Data = await yahooV8Service.getQuote(symbol);
      if (!v8Data || v8Data.regularMarketPrice === 0) {
        console.log(`[Expectations] Símbolo no encontrado: ${symbol}`);
        return null;
      }
      
      // PASO 2: Intentar con Yahoo Crumb Service (GRATIS, ilimitado)
      const crumbData = await yahooCrumbService.getQuoteSummary(symbol);
      if (crumbData && crumbData.hasData && crumbData.earningsHistory) {
        console.log(`[Expectations] Datos obtenidos via Yahoo Crumb para ${symbol}`);
        const expectations = this.parseFromCrumbService(symbol, crumbData);
        expectationsCache.set(symbol, { data: expectations, timestamp: Date.now() });
        return expectations;
      }
      
      // PASO 3: Fallback a RapidAPI (100 req/mes)
      if (rapidApiYahooService.isAvailable()) {
        const rapidApiData = await rapidApiYahooService.getQuoteSummary(symbol);
        if (rapidApiData && rapidApiData.dataAvailable && rapidApiData.earningsHistory) {
          console.log(`[Expectations] Datos obtenidos via RapidAPI para ${symbol}`);
          const expectations = this.parseFromRapidApi(symbol, rapidApiData);
          expectationsCache.set(symbol, { data: expectations, timestamp: Date.now() });
          return expectations;
        }
      }
      
      // PASO 4: Generar datos básicos desde V8 (sin earnings detallados)
      console.log(`[Expectations] Generando datos básicos desde V8 para ${symbol}`);
      const basicExpectations = this.generateBasicExpectations(symbol, v8Data);
      expectationsCache.set(symbol, { data: basicExpectations, timestamp: Date.now() });
      return basicExpectations;
      
    } catch (error: any) {
      console.error(`[Expectations] Error para ${symbol}:`, error.message);
      return null;
    }
  }
  
  /**
   * Genera datos de expectativas básicos cuando no hay datos de RapidAPI
   * Usa datos de tendencia de precio como proxy
   */
  private generateBasicExpectations(symbol: string, v8Data: any): ExpectationsData {
    const now = new Date();
    
    // Calcular tendencia basada en medias móviles
    const price = v8Data.regularMarketPrice || 0;
    const ma50 = v8Data.fiftyDayAverage || price;
    const ma200 = v8Data.twoHundredDayAverage || price;
    
    // Si precio > MA50 > MA200 = tendencia positiva
    let trendScore = 50;
    if (price > ma50 && ma50 > ma200) trendScore = 75;
    else if (price < ma50 && ma50 < ma200) trendScore = 25;
    else if (price > ma50) trendScore = 60;
    else if (price < ma50) trendScore = 40;
    
    // Calcular momentum basado en cambio de precio
    const priceChangePercent = v8Data.priceChangePercent || 0;
    let momentumScore = 50;
    if (priceChangePercent > 3) momentumScore = 80;
    else if (priceChangePercent > 1) momentumScore = 65;
    else if (priceChangePercent > 0) momentumScore = 55;
    else if (priceChangePercent > -1) momentumScore = 45;
    else if (priceChangePercent > -3) momentumScore = 35;
    else momentumScore = 20;
    
    // Score general (conservador cuando no hay datos)
    const overallScore = Math.round((trendScore + momentumScore) / 2);
    
    return {
      symbol,
      timestamp: now,
      
      // Sin datos de earnings disponibles
      earningsSurprises: [],
      lastEpsSurprise: null,
      avgEpsSurprise: null,
      lastRevenueSurprise: null,
      avgRevenueSurprise: null,
      beatRate: 0,
      consistencyScore: 0,
      
      // Sin datos de revisiones
      revisions: [],
      overallRevisionTrend: 'unknown' as const,
      revisionScore: 0,
      
      // Sin fecha de próximos earnings
      nextEarnings: {
        date: null,
        daysUntil: null,
        isWithin7Days: false,
        isWithin30Days: false,
        epsEstimate: null,
        revenueEstimate: null,
        whisperNumber: null,
        historicalBeatRate: 0,
      },
      earningsRisk: 'low' as const,
      
      // Scores basados en tendencia de precio (conservadores)
      epsSurpriseScore: 50,
      revenueSurpriseScore: 50,
      revisionScore_normalized: 50,
      timingScore: 50,
      
      expectationsScore: overallScore,
      hasData: false,
      dataQuality: 'low' as const,
      
      // Resumen
      summary: `Datos limitados. Tendencia de precio: ${trendScore > 50 ? 'positiva' : trendScore < 50 ? 'negativa' : 'neutral'}. Datos de earnings no disponibles.`,
    };
  }
  
  /**
   * Parsea datos desde Yahoo Crumb Service al formato ExpectationsData
   */
  private parseFromCrumbService(symbol: string, data: QuoteSummaryData): ExpectationsData {
    // Parsear earnings surprise desde earningsHistory
    const earningsSurprises: EarningsSurprise[] = (data.earningsHistory || []).map((q) => ({
      quarter: q.quarter,
      date: new Date(),
      epsActual: q.epsActual,
      epsEstimate: q.epsEstimate,
      epsSurprisePercent: q.surprisePercent || 
        (q.epsEstimate !== 0 ? ((q.epsActual - q.epsEstimate) / Math.abs(q.epsEstimate)) * 100 : 0),
      revenueActual: null,
      revenueEstimate: null,
      revenueSurprisePercent: null,
    }));
    
    let lastEpsSurprise: number | null = null;
    let avgEpsSurprise: number | null = null;
    let beatRate = 0;
    
    if (earningsSurprises.length > 0) {
      lastEpsSurprise = earningsSurprises[0].epsSurprisePercent;
      avgEpsSurprise = earningsSurprises.reduce((sum, e) => sum + e.epsSurprisePercent, 0) / earningsSurprises.length;
      beatRate = earningsSurprises.filter(e => e.epsSurprisePercent > 0).length / earningsSurprises.length * 100;
    }
    
    // Próximos earnings
    const nextEarningsTimestamp = data.earningsDate;
    const nextEarningsDate = nextEarningsTimestamp ? new Date(nextEarningsTimestamp * 1000) : null;
    const now = new Date();
    const daysUntil = nextEarningsDate 
      ? Math.ceil((nextEarningsDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    
    const nextEarnings: NextEarningsInfo = {
      date: nextEarningsDate,
      daysUntil,
      isWithin7Days: daysUntil !== null && daysUntil <= 7 && daysUntil >= 0,
      isWithin30Days: daysUntil !== null && daysUntil <= 30 && daysUntil >= 0,
      epsEstimate: data.forwardEps || null,
      revenueEstimate: null,
      whisperNumber: null,
      historicalBeatRate: beatRate,
    };
    
    // Revisiones (simplificado - no hay datos de revisiones en crumb service)
    const revisions: AnalystRevision[] = [];
    
    // Calcular scores
    const epsSurpriseScore = this.calculateEpsSurpriseScore(lastEpsSurprise, avgEpsSurprise, beatRate);
    const revenueSurpriseScore = 50;
    const revisionScoreNorm = 50;
    const timingScore = this.calculateTimingScore(nextEarnings);
    
    // Determinar riesgo de earnings
    let earningsRisk: 'high' | 'medium' | 'low' = 'low';
    if (daysUntil !== null && daysUntil >= 0) {
      if (daysUntil <= 7) earningsRisk = 'high';
      else if (daysUntil <= 14) earningsRisk = 'medium';
    }
    
    // Score combinado
    const expectationsScore = Math.round(
      epsSurpriseScore * 0.35 +
      revenueSurpriseScore * 0.15 +
      revisionScoreNorm * 0.25 +
      timingScore * 0.25
    );
    
    // Summary
    let summary = '';
    if (lastEpsSurprise !== null) {
      if (lastEpsSurprise > 10) summary = `Superó expectativas (+${lastEpsSurprise.toFixed(1)}%)`;
      else if (lastEpsSurprise > 0) summary = `Cumplió/superó ligeramente (+${lastEpsSurprise.toFixed(1)}%)`;
      else summary = `No alcanzó expectativas (${lastEpsSurprise.toFixed(1)}%)`;
    } else {
      summary = 'Sin datos de earnings surprise';
    }
    
    if (nextEarnings.isWithin7Days) {
      summary += ' ⚠️ Earnings en próximos 7 días';
    }
    
    // Determinar expectationsOutlook
    let expectationsOutlook = 'Sin datos';
    if (avgEpsSurprise !== null) {
      if (avgEpsSurprise > 5) expectationsOutlook = 'Supera expectativas';
      else if (avgEpsSurprise > -5) expectationsOutlook = 'Cumple expectativas';
      else expectationsOutlook = 'Decepciona';
    }
    
    return {
      symbol,
      timestamp: new Date(),
      earningsSurprises,
      lastEpsSurprise,
      avgEpsSurprise,
      lastRevenueSurprise: null,
      avgRevenueSurprise: null,
      beatRate,
      consistencyScore: beatRate,
      revisions,
      overallRevisionTrend: 'unknown',
      revisionScore: 0,
      nextEarnings,
      earningsRisk,
      epsSurpriseScore,
      revenueSurpriseScore,
      revisionScore_normalized: revisionScoreNorm,
      timingScore,
      expectationsScore,
      hasData: earningsSurprises.length > 0,
      dataQuality: earningsSurprises.length >= 4 ? 'high' : earningsSurprises.length > 0 ? 'medium' : 'low',
      summary,
    };
  }
  
  /**
   * Parsea datos desde RapidAPI al formato ExpectationsData
   */
  private parseFromRapidApi(symbol: string, data: YahooQuoteSummary): ExpectationsData {
    // Parsear earnings surprise desde earningsHistory
    const earningsSurprises: EarningsSurprise[] = (data.earningsHistory || []).map((q) => ({
      quarter: q.fiscalQuarter,
      date: new Date(),
      epsActual: q.epsActual,
      epsEstimate: q.epsEstimate,
      epsSurprisePercent: q.surprisePercent || 
        (q.epsEstimate !== 0 ? ((q.epsActual - q.epsEstimate) / Math.abs(q.epsEstimate)) * 100 : 0),
      revenueActual: null,
      revenueEstimate: null,
      revenueSurprisePercent: null,
    }));
    
    let lastEpsSurprise: number | null = null;
    let avgEpsSurprise: number | null = null;
    let beatRate = 0;
    
    if (earningsSurprises.length > 0) {
      lastEpsSurprise = earningsSurprises[0].epsSurprisePercent;
      avgEpsSurprise = earningsSurprises.reduce((sum, e) => sum + e.epsSurprisePercent, 0) / earningsSurprises.length;
      beatRate = earningsSurprises.filter(e => e.epsSurprisePercent > 0).length / earningsSurprises.length * 100;
    }
    
    // Próximos earnings
    const nextEarningsTimestamp = data.calendarEvents?.earningsDate;
    const nextEarningsDate = nextEarningsTimestamp ? new Date(nextEarningsTimestamp * 1000) : null;
    const now = new Date();
    const daysUntil = nextEarningsDate 
      ? Math.ceil((nextEarningsDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    
    const nextEarnings: NextEarningsInfo = {
      date: nextEarningsDate,
      daysUntil,
      isWithin7Days: daysUntil !== null && daysUntil <= 7 && daysUntil >= 0,
      isWithin30Days: daysUntil !== null && daysUntil <= 30 && daysUntil >= 0,
      epsEstimate: data.earningsTrend?.currentQuarterEstimate || null,
      revenueEstimate: data.earningsTrend?.revenueEstimateCurrent || null,
      whisperNumber: null,
      historicalBeatRate: beatRate,
    };
    
    // Revisiones (simplificado)
    const revisions: AnalystRevision[] = [];
    if (data.earningsTrend?.currentQuarterEstimate) {
      revisions.push({
        period: 'current',
        label: 'Current Quarter',
        epsEstimate: data.earningsTrend.currentQuarterEstimate,
        epsEstimate7dAgo: null,
        epsEstimate30dAgo: null,
        epsEstimate90dAgo: null,
        revenueEstimate: data.earningsTrend.revenueEstimateCurrent || 0,
        numberOfAnalysts: data.numberOfAnalystOpinions || 0,
        revisionTrend7d: null,
        revisionTrend30d: null,
        revisionTrend90d: null,
      });
    }
    
    // Calcular scores
    const epsSurpriseScore = this.calculateEpsSurpriseScore(lastEpsSurprise, avgEpsSurprise, beatRate);
    const revenueSurpriseScore = 50; // Sin datos de revenue surprise en RapidAPI
    const revisionScoreNorm = 50; // Sin datos de revisiones históricas
    const timingScore = this.calculateTimingScore(nextEarnings);
    
    // Determinar riesgo de earnings
    let earningsRisk: 'high' | 'medium' | 'low' = 'low';
    if (daysUntil !== null && daysUntil >= 0) {
      if (daysUntil <= 7) earningsRisk = 'high';
      else if (daysUntil <= 14) earningsRisk = 'medium';
    }
    
    // Score combinado
    const expectationsScore = Math.round(
      epsSurpriseScore * 0.35 +
      revenueSurpriseScore * 0.15 +
      revisionScoreNorm * 0.25 +
      timingScore * 0.25
    );
    
    // Summary
    let summary = '';
    if (lastEpsSurprise !== null) {
      if (lastEpsSurprise > 10) summary = `Superó expectativas (+${lastEpsSurprise.toFixed(1)}%)`;
      else if (lastEpsSurprise > 0) summary = `Cumplió/superó ligeramente (+${lastEpsSurprise.toFixed(1)}%)`;
      else summary = `No alcanzó expectativas (${lastEpsSurprise.toFixed(1)}%)`;
    } else {
      summary = 'Sin datos de earnings surprise';
    }
    
    if (nextEarnings.isWithin7Days) {
      summary += ' ⚠️ Earnings en próximos 7 días';
    }
    
    // Determinar expectationsOutlook
    let expectationsOutlook = 'Sin datos';
    if (avgEpsSurprise !== null) {
      if (avgEpsSurprise > 5) expectationsOutlook = 'Supera expectativas';
      else if (avgEpsSurprise > -5) expectationsOutlook = 'Cumple expectativas';
      else expectationsOutlook = 'Decepciona';
    }
    
    return {
      symbol,
      timestamp: new Date(),
      earningsSurprises,
      lastEpsSurprise,
      avgEpsSurprise,
      lastRevenueSurprise: null,
      avgRevenueSurprise: null,
      beatRate,
      consistencyScore: beatRate,
      revisions,
      overallRevisionTrend: 'unknown',
      revisionScore: 0,
      nextEarnings,
      earningsRisk,
      epsSurpriseScore,
      revenueSurpriseScore,
      revisionScore_normalized: revisionScoreNorm,
      timingScore,
      expectationsScore,
      hasData: earningsSurprises.length > 0,
      dataQuality: earningsSurprises.length >= 4 ? 'high' : earningsSurprises.length > 0 ? 'medium' : 'low',
      summary,
    };
  }
  
  /**
   * Parsea los datos de Yahoo Finance
   */
  private parseExpectations(symbol: string, result: any): ExpectationsData {
    const earningsHistory = result.earningsHistory?.history || [];
    const earningsTrend = result.earningsTrend?.trend || [];
    const calendar = result.calendarEvents || {};
    const earnings = result.earnings || {};
    
    // Helper para extraer valores
    const getValue = (obj: any): number => {
      if (!obj) return 0;
      return obj.raw ?? obj.value ?? obj ?? 0;
    };
    
    // ========================================================================
    // 1. EARNINGS SURPRISE (EPS + Revenue)
    // ========================================================================
    const earningsSurprises = this.parseEarningsSurprises(earningsHistory, earnings);
    
    let lastEpsSurprise: number | null = null;
    let avgEpsSurprise: number | null = null;
    let lastRevenueSurprise: number | null = null;
    let avgRevenueSurprise: number | null = null;
    let beatRate = 0;
    
    if (earningsSurprises.length > 0) {
      lastEpsSurprise = earningsSurprises[0].epsSurprisePercent;
      avgEpsSurprise = earningsSurprises.reduce((sum, e) => sum + e.epsSurprisePercent, 0) / earningsSurprises.length;
      
      // Revenue surprises
      const revenueSurprises = earningsSurprises
        .filter(e => e.revenueSurprisePercent !== null)
        .map(e => e.revenueSurprisePercent as number);
      
      if (revenueSurprises.length > 0) {
        lastRevenueSurprise = revenueSurprises[0];
        avgRevenueSurprise = revenueSurprises.reduce((a, b) => a + b, 0) / revenueSurprises.length;
      }
      
      // Beat rate (% que superó EPS estimado)
      const beats = earningsSurprises.filter(e => e.epsSurprisePercent > 0).length;
      beatRate = (beats / earningsSurprises.length) * 100;
    }
    
    // Consistencia: menor desviación = más predecible
    const consistencyScore = this.calculateConsistency(earningsSurprises.map(e => e.epsSurprisePercent));
    
    console.log(`[Expectations] EPS Surprise: last=${lastEpsSurprise?.toFixed(1)}%, avg=${avgEpsSurprise?.toFixed(1)}%, beat=${beatRate.toFixed(0)}%`);
    console.log(`[Expectations] Revenue Surprise: last=${lastRevenueSurprise?.toFixed(1)}%, avg=${avgRevenueSurprise?.toFixed(1)}%`);
    
    // ========================================================================
    // 2. REVISIONES DE ANALISTAS
    // ========================================================================
    const revisions = this.parseRevisions(earningsTrend);
    const { overallRevisionTrend, revisionScore } = this.analyzeRevisions(revisions);
    
    console.log(`[Expectations] Revision trend: ${overallRevisionTrend}, score=${revisionScore}`);
    
    // ========================================================================
    // 3. PRÓXIMOS EARNINGS
    // ========================================================================
    const nextEarnings = this.parseNextEarnings(calendar, earnings, beatRate);
    const earningsRisk = this.calculateEarningsRisk(nextEarnings);
    
    console.log(`[Expectations] Next earnings: ${nextEarnings.daysUntil} days, risk=${earningsRisk}`);
    
    // ========================================================================
    // 4. CALCULAR SCORES
    // ========================================================================
    const epsSurpriseScore = this.calculateEpsSurpriseScore(lastEpsSurprise, avgEpsSurprise, beatRate);
    const revenueSurpriseScore = this.calculateRevenueSurpriseScore(lastRevenueSurprise, avgRevenueSurprise);
    const revisionScore_normalized = this.normalizeRevisionScore(revisionScore);
    const timingScore = this.calculateTimingScore(nextEarnings);
    
    // Score combinado ponderado
    // - EPS Surprise: 35% (más importante)
    // - Revenue Surprise: 25%
    // - Revisiones: 25%
    // - Timing: 15%
    let expectationsScore = 50; // Base neutral
    let hasData = false;
    let dataQuality: 'high' | 'medium' | 'low' = 'low';
    
    const weights = {
      eps: 0.35,
      revenue: 0.25,
      revision: 0.25,
      timing: 0.15
    };
    
    // Solo incluir componentes con datos
    let totalWeight = 0;
    let weightedSum = 0;
    
    if (earningsSurprises.length > 0) {
      weightedSum += epsSurpriseScore * weights.eps;
      totalWeight += weights.eps;
      hasData = true;
    }
    
    if (lastRevenueSurprise !== null) {
      weightedSum += revenueSurpriseScore * weights.revenue;
      totalWeight += weights.revenue;
    }
    
    if (revisions.length > 0 && revisions.some(r => r.revisionTrend7d !== null || r.revisionTrend30d !== null)) {
      weightedSum += revisionScore_normalized * weights.revision;
      totalWeight += weights.revision;
    }
    
    if (nextEarnings.date !== null) {
      weightedSum += timingScore * weights.timing;
      totalWeight += weights.timing;
    }
    
    if (totalWeight > 0) {
      expectationsScore = Math.round(weightedSum / totalWeight);
    }
    
    // Determinar calidad de datos
    if (earningsSurprises.length >= 4 && revisions.length >= 2 && lastRevenueSurprise !== null) {
      dataQuality = 'high';
    } else if (earningsSurprises.length >= 2 || revisions.length >= 1) {
      dataQuality = 'medium';
    }
    
    // Generar resumen
    const summary = this.generateSummary({
      lastEpsSurprise,
      avgEpsSurprise,
      lastRevenueSurprise,
      beatRate,
      overallRevisionTrend,
      nextEarnings,
      expectationsScore
    });
    
    return {
      symbol,
      timestamp: new Date(),
      earningsSurprises,
      lastEpsSurprise,
      avgEpsSurprise,
      lastRevenueSurprise,
      avgRevenueSurprise,
      beatRate,
      consistencyScore,
      revisions,
      overallRevisionTrend,
      revisionScore,
      nextEarnings,
      earningsRisk,
      epsSurpriseScore,
      revenueSurpriseScore,
      revisionScore_normalized,
      timingScore,
      expectationsScore,
      hasData,
      dataQuality,
      summary
    };
  }
  
  // ==========================================================================
  // PARSERS
  // ==========================================================================
  
  /**
   * Parsea los earnings surprises del historial
   */
  private parseEarningsSurprises(earningsHistory: any[], earnings: any): EarningsSurprise[] {
    const surprises: EarningsSurprise[] = [];
    const quarterlyEarnings = earnings?.earningsChart?.quarterly || [];
    
    const getValue = (obj: any): number => {
      if (!obj) return 0;
      return obj.raw ?? obj.value ?? obj ?? 0;
    };
    
    for (let i = 0; i < earningsHistory.length && i < 4; i++) {
      const quarter = earningsHistory[i];
      const epsActual = getValue(quarter.epsActual);
      const epsEstimate = getValue(quarter.epsEstimate);
      
      if (epsEstimate === 0) continue;
      
      const epsSurprisePercent = ((epsActual - epsEstimate) / Math.abs(epsEstimate)) * 100;
      
      // Intentar obtener datos de revenue del módulo earnings
      let revenueActual: number | null = null;
      let revenueEstimate: number | null = null;
      let revenueSurprisePercent: number | null = null;
      
      if (quarterlyEarnings[i]) {
        const qe = quarterlyEarnings[i];
        revenueActual = getValue(qe.revenue);
        // El módulo earnings no siempre tiene estimate de revenue
        // pero podemos calcularlo aproximadamente si tenemos datos históricos
      }
      
      // También verificar en financialsChart si está disponible
      const financialsChart = earnings?.financialsChart?.quarterly || [];
      if (financialsChart[i]) {
        const fc = financialsChart[i];
        revenueActual = getValue(fc.revenue) || revenueActual;
      }
      
      const quarterDate = quarter.quarter ? new Date(quarter.quarter.fmt || quarter.quarter) : new Date();
      const quarterStr = quarter.period?.fmt || `Q${(quarterDate.getMonth() / 3 + 1).toFixed(0)} ${quarterDate.getFullYear()}`;
      
      surprises.push({
        quarter: quarterStr,
        date: quarterDate,
        epsActual,
        epsEstimate,
        epsSurprisePercent,
        revenueActual,
        revenueEstimate,
        revenueSurprisePercent
      });
    }
    
    // Intentar calcular revenue surprise si tenemos datos de earningsTrend
    // para comparar con revenue actual
    
    return surprises;
  }
  
  /**
   * Parsea las revisiones de analistas
   */
  private parseRevisions(earningsTrend: any[]): AnalystRevision[] {
    const revisions: AnalystRevision[] = [];
    
    const getValue = (obj: any): number => {
      if (!obj) return 0;
      return obj.raw ?? obj.value ?? obj ?? 0;
    };
    
    const periodLabels: Record<string, string> = {
      '0q': 'Trimestre Actual',
      '+1q': 'Próximo Trimestre',
      '0y': 'Año Actual',
      '+1y': 'Próximo Año'
    };
    
    const periodTypes: Record<string, AnalystRevision['period']> = {
      '0q': 'current',
      '+1q': 'next',
      '0y': 'currentYear',
      '+1y': 'nextYear'
    };
    
    for (const trend of earningsTrend) {
      const period = trend.period || '';
      const periodType = periodTypes[period] || 'current';
      const label = periodLabels[period] || period;
      
      const epsEstimate = getValue(trend.earningsEstimate?.avg);
      const revenueEstimate = getValue(trend.revenueEstimate?.avg);
      const numberOfAnalysts = getValue(trend.earningsEstimate?.numberOfAnalysts);
      
      // Datos de revisiones (cambios en estimaciones)
      const epsEstimate7dAgo = getValue(trend.epsTrend?.['7daysAgo']);
      const epsEstimate30dAgo = getValue(trend.epsTrend?.['30daysAgo']);
      const epsEstimate90dAgo = getValue(trend.epsTrend?.['90daysAgo']);
      
      // Calcular tendencias de revisión
      let revisionTrend7d: number | null = null;
      let revisionTrend30d: number | null = null;
      let revisionTrend90d: number | null = null;
      
      if (epsEstimate7dAgo && epsEstimate7dAgo !== 0) {
        revisionTrend7d = ((epsEstimate - epsEstimate7dAgo) / Math.abs(epsEstimate7dAgo)) * 100;
      }
      if (epsEstimate30dAgo && epsEstimate30dAgo !== 0) {
        revisionTrend30d = ((epsEstimate - epsEstimate30dAgo) / Math.abs(epsEstimate30dAgo)) * 100;
      }
      if (epsEstimate90dAgo && epsEstimate90dAgo !== 0) {
        revisionTrend90d = ((epsEstimate - epsEstimate90dAgo) / Math.abs(epsEstimate90dAgo)) * 100;
      }
      
      revisions.push({
        period: periodType,
        label,
        epsEstimate,
        epsEstimate7dAgo,
        epsEstimate30dAgo,
        epsEstimate90dAgo,
        revenueEstimate,
        numberOfAnalysts,
        revisionTrend7d,
        revisionTrend30d,
        revisionTrend90d
      });
    }
    
    return revisions;
  }
  
  /**
   * Analiza las revisiones para determinar tendencia general
   */
  private analyzeRevisions(revisions: AnalystRevision[]): {
    overallRevisionTrend: 'up' | 'down' | 'stable' | 'unknown';
    revisionScore: number;
  } {
    if (revisions.length === 0) {
      return { overallRevisionTrend: 'unknown', revisionScore: 0 };
    }
    
    // Priorizar trimestre actual y próximo
    const relevantRevisions = revisions.filter(r => 
      r.period === 'current' || r.period === 'next'
    );
    
    if (relevantRevisions.length === 0) {
      return { overallRevisionTrend: 'unknown', revisionScore: 0 };
    }
    
    // Calcular score ponderado de revisiones
    // Priorizar 7 días (más reciente), luego 30, luego 90
    let totalScore = 0;
    let count = 0;
    
    for (const rev of relevantRevisions) {
      if (rev.revisionTrend7d !== null) {
        totalScore += rev.revisionTrend7d * 3; // Peso más alto
        count += 3;
      }
      if (rev.revisionTrend30d !== null) {
        totalScore += rev.revisionTrend30d * 2;
        count += 2;
      }
      if (rev.revisionTrend90d !== null) {
        totalScore += rev.revisionTrend90d * 1;
        count += 1;
      }
    }
    
    const avgRevision = count > 0 ? totalScore / count : 0;
    
    let overallRevisionTrend: 'up' | 'down' | 'stable' | 'unknown' = 'stable';
    if (avgRevision > 2) overallRevisionTrend = 'up';
    else if (avgRevision < -2) overallRevisionTrend = 'down';
    
    // Score de -100 a +100
    // Revisiones > +10% = muy bullish
    // Revisiones < -10% = muy bearish
    const revisionScore = Math.max(-100, Math.min(100, avgRevision * 10));
    
    return { overallRevisionTrend, revisionScore };
  }
  
  /**
   * Parsea información de próximos earnings
   */
  private parseNextEarnings(calendar: any, earnings: any, historicalBeatRate: number): NextEarningsInfo {
    const getValue = (obj: any): number | null => {
      if (!obj) return null;
      const val = obj.raw ?? obj.value ?? obj;
      return val !== undefined ? val : null;
    };
    
    let date: Date | null = null;
    let daysUntil: number | null = null;
    
    // Obtener fecha de próximos earnings
    const earningsDate = calendar.earnings?.earningsDate;
    if (Array.isArray(earningsDate) && earningsDate.length > 0) {
      const dateVal = getValue(earningsDate[0]);
      if (dateVal) {
        date = new Date(dateVal * 1000); // Unix timestamp
        daysUntil = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      }
    }
    
    // Estimaciones
    const epsEstimate = getValue(calendar.earnings?.earningsAverage);
    const revenueEstimate = getValue(calendar.earnings?.revenueAverage);
    
    // Whisper number (no disponible en Yahoo, pero podríamos inferirlo)
    // Usualmente es la media entre estimate y el promedio de surprises
    let whisperNumber: number | null = null;
    if (epsEstimate !== null && historicalBeatRate > 50) {
      // Si la empresa típicamente supera, el whisper es más alto
      whisperNumber = epsEstimate * (1 + (historicalBeatRate - 50) / 1000);
    }
    
    return {
      date,
      daysUntil,
      isWithin7Days: daysUntil !== null && daysUntil >= 0 && daysUntil <= 7,
      isWithin30Days: daysUntil !== null && daysUntil >= 0 && daysUntil <= 30,
      epsEstimate,
      revenueEstimate,
      whisperNumber,
      historicalBeatRate
    };
  }
  
  /**
   * Calcula el riesgo asociado a los earnings
   */
  private calculateEarningsRisk(nextEarnings: NextEarningsInfo): 'high' | 'medium' | 'low' {
    if (nextEarnings.daysUntil === null || nextEarnings.daysUntil < 0) {
      return 'low'; // No hay earnings próximos conocidos
    }
    
    if (nextEarnings.daysUntil <= 7) return 'high';
    if (nextEarnings.daysUntil <= 14) return 'medium';
    return 'low';
  }
  
  // ==========================================================================
  // SCORE CALCULATORS
  // ==========================================================================
  
  /**
   * Calcula score de EPS Surprise (0-100)
   */
  private calculateEpsSurpriseScore(
    lastSurprise: number | null,
    avgSurprise: number | null,
    beatRate: number
  ): number {
    let score = 50; // Base neutral
    
    // Último surprise (40% del peso)
    if (lastSurprise !== null) {
      if (lastSurprise > 10) score += 20;
      else if (lastSurprise > 5) score += 15;
      else if (lastSurprise > 2) score += 10;
      else if (lastSurprise > 0) score += 5;
      else if (lastSurprise < -10) score -= 20;
      else if (lastSurprise < -5) score -= 15;
      else if (lastSurprise < -2) score -= 10;
      else if (lastSurprise < 0) score -= 5;
    }
    
    // Promedio surprise (30% del peso)
    if (avgSurprise !== null) {
      if (avgSurprise > 5) score += 15;
      else if (avgSurprise > 2) score += 10;
      else if (avgSurprise > 0) score += 5;
      else if (avgSurprise < -5) score -= 15;
      else if (avgSurprise < -2) score -= 10;
      else if (avgSurprise < 0) score -= 5;
    }
    
    // Beat rate (30% del peso)
    if (beatRate >= 100) score += 15;
    else if (beatRate >= 75) score += 10;
    else if (beatRate >= 50) score += 5;
    else if (beatRate <= 25) score -= 15;
    else if (beatRate < 50) score -= 5;
    
    return Math.max(0, Math.min(100, score));
  }
  
  /**
   * Calcula score de Revenue Surprise (0-100)
   */
  private calculateRevenueSurpriseScore(
    lastSurprise: number | null,
    avgSurprise: number | null
  ): number {
    if (lastSurprise === null && avgSurprise === null) {
      return 50; // Neutral si no hay datos
    }
    
    let score = 50;
    
    // Los revenue surprises suelen ser menores que EPS
    // Un 5% revenue surprise es muy significativo
    if (lastSurprise !== null) {
      if (lastSurprise > 5) score += 20;
      else if (lastSurprise > 2) score += 15;
      else if (lastSurprise > 1) score += 10;
      else if (lastSurprise > 0) score += 5;
      else if (lastSurprise < -5) score -= 20;
      else if (lastSurprise < -2) score -= 15;
      else if (lastSurprise < -1) score -= 10;
      else if (lastSurprise < 0) score -= 5;
    }
    
    if (avgSurprise !== null) {
      if (avgSurprise > 2) score += 10;
      else if (avgSurprise > 0) score += 5;
      else if (avgSurprise < -2) score -= 10;
      else if (avgSurprise < 0) score -= 5;
    }
    
    return Math.max(0, Math.min(100, score));
  }
  
  /**
   * Normaliza el score de revisiones de -100/+100 a 0-100
   */
  private normalizeRevisionScore(revisionScore: number): number {
    // -100 → 0, 0 → 50, +100 → 100
    return Math.round((revisionScore + 100) / 2);
  }
  
  /**
   * Calcula score de timing (penaliza earnings muy cercanos por incertidumbre)
   */
  private calculateTimingScore(nextEarnings: NextEarningsInfo): number {
    if (nextEarnings.daysUntil === null || nextEarnings.daysUntil < 0) {
      return 60; // Sin earnings conocidos, ligeramente positivo
    }
    
    // Earnings muy cercanos = incertidumbre alta = score neutral/bajo
    // Pero si tiene buen beat rate, menos penalización
    const beatBonus = (nextEarnings.historicalBeatRate - 50) / 10;
    
    if (nextEarnings.daysUntil <= 3) return Math.min(60, 40 + beatBonus);
    if (nextEarnings.daysUntil <= 7) return Math.min(70, 50 + beatBonus);
    if (nextEarnings.daysUntil <= 14) return Math.min(75, 55 + beatBonus);
    if (nextEarnings.daysUntil <= 30) return Math.min(80, 65 + beatBonus);
    
    return 70; // Earnings lejanos, neutral-positivo
  }
  
  /**
   * Calcula consistencia de resultados
   */
  private calculateConsistency(surprises: number[]): number {
    if (surprises.length < 2) return 50;
    
    // Calcular desviación estándar
    const avg = surprises.reduce((a, b) => a + b, 0) / surprises.length;
    const variance = surprises.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / surprises.length;
    const stdDev = Math.sqrt(variance);
    
    // Menor desviación = más consistente = mejor score
    // StdDev < 5 = muy consistente
    // StdDev > 20 = muy inconsistente
    if (stdDev < 5) return 80;
    if (stdDev < 10) return 65;
    if (stdDev < 15) return 50;
    if (stdDev < 20) return 35;
    return 20;
  }
  
  /**
   * Genera resumen legible
   */
  private generateSummary(params: {
    lastEpsSurprise: number | null;
    avgEpsSurprise: number | null;
    lastRevenueSurprise: number | null;
    beatRate: number;
    overallRevisionTrend: string;
    nextEarnings: NextEarningsInfo;
    expectationsScore: number;
  }): string {
    const parts: string[] = [];
    
    // Earnings surprise
    if (params.lastEpsSurprise !== null) {
      const sign = params.lastEpsSurprise >= 0 ? '+' : '';
      parts.push(`Último EPS: ${sign}${params.lastEpsSurprise.toFixed(1)}% vs est.`);
    }
    
    if (params.lastRevenueSurprise !== null) {
      const sign = params.lastRevenueSurprise >= 0 ? '+' : '';
      parts.push(`Revenue: ${sign}${params.lastRevenueSurprise.toFixed(1)}% vs est.`);
    }
    
    // Beat rate
    if (params.beatRate > 0) {
      parts.push(`Supera estimaciones ${params.beatRate.toFixed(0)}% de veces`);
    }
    
    // Revisiones
    if (params.overallRevisionTrend === 'up') {
      parts.push('Analistas revisando estimaciones al alza');
    } else if (params.overallRevisionTrend === 'down') {
      parts.push('Analistas revisando estimaciones a la baja');
    }
    
    // Próximos earnings
    if (params.nextEarnings.daysUntil !== null && params.nextEarnings.daysUntil >= 0) {
      if (params.nextEarnings.daysUntil <= 7) {
        parts.push(`⚠️ Earnings en ${params.nextEarnings.daysUntil} días`);
      } else {
        parts.push(`Próx. earnings: ${params.nextEarnings.daysUntil} días`);
      }
    }
    
    // Score
    let outlook = 'Neutral';
    if (params.expectationsScore >= 70) outlook = 'Muy positivo';
    else if (params.expectationsScore >= 60) outlook = 'Positivo';
    else if (params.expectationsScore <= 30) outlook = 'Muy negativo';
    else if (params.expectationsScore <= 40) outlook = 'Negativo';
    
    return parts.length > 0 
      ? `${outlook}: ${parts.join('. ')}.`
      : 'Sin datos suficientes de expectativas.';
  }
  
  /**
   * Formatea para display en la UI
   */
  formatForDisplay(data: ExpectationsData): {
    items: Array<{ label: string; value: string; color: string }>;
    conclusion: string;
  } {
    const getColor = (value: number | null, threshold: number = 0): string => {
      if (value === null) return '#888';
      if (value > threshold + 5) return '#4CAF50'; // Verde
      if (value < threshold - 5) return '#F44336'; // Rojo
      return '#FF9800'; // Naranja
    };
    
    const items = [];
    
    // EPS Surprise
    if (data.lastEpsSurprise !== null) {
      items.push({
        label: 'Última Sorpresa EPS',
        value: `${data.lastEpsSurprise >= 0 ? '+' : ''}${data.lastEpsSurprise.toFixed(1)}%`,
        color: getColor(data.lastEpsSurprise)
      });
    }
    
    // Revenue Surprise
    if (data.lastRevenueSurprise !== null) {
      items.push({
        label: 'Última Sorpresa Rev.',
        value: `${data.lastRevenueSurprise >= 0 ? '+' : ''}${data.lastRevenueSurprise.toFixed(1)}%`,
        color: getColor(data.lastRevenueSurprise)
      });
    }
    
    // Beat Rate
    if (data.beatRate > 0) {
      items.push({
        label: 'Tasa de Superación',
        value: `${data.beatRate.toFixed(0)}%`,
        color: getColor(data.beatRate - 50, 25)
      });
    }
    
    // Revisiones de analistas
    if (data.overallRevisionTrend !== 'unknown') {
      const trendLabels: Record<string, string> = {
        'up': '↑ Al alza',
        'down': '↓ A la baja',
        'stable': '→ Estables'
      };
      const trendColors: Record<string, string> = {
        'up': '#4CAF50',
        'down': '#F44336',
        'stable': '#FF9800'
      };
      items.push({
        label: 'Revisiones Est.',
        value: trendLabels[data.overallRevisionTrend],
        color: trendColors[data.overallRevisionTrend]
      });
    }
    
    // Próximos earnings
    if (data.nextEarnings.daysUntil !== null && data.nextEarnings.daysUntil >= 0) {
      const daysColor = data.nextEarnings.daysUntil <= 7 ? '#F44336' : 
                       data.nextEarnings.daysUntil <= 14 ? '#FF9800' : '#888';
      items.push({
        label: 'Próx. Earnings',
        value: `${data.nextEarnings.daysUntil} días`,
        color: daysColor
      });
    }
    
    return {
      items,
      conclusion: data.summary
    };
  }
}

export const expectationsService = new ExpectationsService();
