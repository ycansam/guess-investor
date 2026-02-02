/**
 * Geopolitical & Macro Events Service
 * 
 * Detecta y analiza eventos macro/geopolíticos que impactan el mercado:
 * - Aranceles y guerras comerciales
 * - Cambios en política de la Fed (nuevos presidentes, cambios de tasa)
 * - Tensiones geopolíticas
 * - Sanciones económicas
 * - Crisis de deuda soberana
 * 
 * Estos eventos tienen impacto inmediato y significativo en los mercados,
 * especialmente en sectores específicos.
 */

import { logger } from '../../middleware/logger.js';

// ===== TIPOS =====

export type EventType = 
  | 'tariff_announcement'      // Anuncio de aranceles
  | 'trade_war_escalation'     // Escalada de guerra comercial
  | 'trade_deal'               // Acuerdo comercial
  | 'fed_policy_change'        // Cambio de política Fed
  | 'fed_chair_nomination'     // Nominación nuevo presidente Fed
  | 'rate_decision'            // Decisión de tasas
  | 'geopolitical_tension'     // Tensión geopolítica
  | 'sanctions'                // Sanciones económicas
  | 'debt_crisis'              // Crisis de deuda
  | 'currency_intervention'    // Intervención cambiaria
  | 'commodity_shock'          // Shock de commodities
  | 'banking_crisis';          // Crisis bancaria

export type ImpactSeverity = 'low' | 'moderate' | 'high' | 'severe' | 'extreme';

export interface GeopoliticalEvent {
  type: EventType;
  title: string;
  description: string;
  severity: ImpactSeverity;
  detectedAt: Date;
  expiresAt: Date;
  
  // Impacto en mercados
  impact: {
    overall: number;           // -100 a +100 impacto general
    volatilityIncrease: number; // Multiplicador de volatilidad esperada
    confidenceReduction: number; // Reducción de confianza en predicciones (%)
  };
  
  // Sectores más afectados (positivo o negativo)
  sectorImpact: Record<string, number>;
  
  // Países/regiones afectados
  regionsAffected: string[];
  
  // Keywords para detectar activos relacionados
  relatedKeywords: string[];
}

export interface GeopoliticalAnalysis {
  hasActiveEvents: boolean;
  events: GeopoliticalEvent[];
  overallRisk: ImpactSeverity;
  marketImpact: {
    direction: 'bullish' | 'bearish' | 'mixed' | 'neutral';
    magnitude: number;         // -100 a +100
    volatilityMultiplier: number;
    confidenceAdjustment: number; // Porcentaje de reducción
  };
  signals: string[];
  reasoning: string;
}

// ===== KEYWORDS PARA DETECCIÓN =====

const TARIFF_KEYWORDS = [
  'tariff', 'tariffs', 'arancel', 'aranceles', 
  'import duty', 'import tax', 'trade barrier',
  'trade war', 'guerra comercial', 'protectionism',
];

const FED_KEYWORDS = [
  'federal reserve', 'fed chair', 'fed chairman', 'fed president',
  'jerome powell', 'kevin warsh', 'interest rate', 'rate hike', 'rate cut',
  'monetary policy', 'quantitative easing', 'qe', 'tightening',
  'fomc', 'federal open market',
];

const GEOPOLITICAL_KEYWORDS = [
  'sanctions', 'embargo', 'sanciones', 'military', 'invasion',
  'war', 'conflict', 'missile', 'nuclear', 'tension',
  'crisis', 'diplomatic', 'blockade',
];

const TRADE_DEAL_KEYWORDS = [
  'trade deal', 'trade agreement', 'acuerdo comercial',
  'free trade', 'tariff reduction', 'trade talks',
  'trade negotiations', 'bilateral agreement',
];

// ===== SECTOR IMPACTS =====

const TARIFF_SECTOR_IMPACT: Record<string, number> = {
  'technology': -25,
  'semiconductors': -35,
  'automotive': -30,
  'industrial': -20,
  'materials': -25,
  'consumer_discretionary': -20,
  'retail': -15,
  'agriculture': -30,
  'defense': 10,      // Beneficia de tensiones
  'domestic_services': 5, // Menos expuesto
};

const FED_HAWKISH_SECTOR_IMPACT: Record<string, number> = {
  'technology': -30,
  'growth': -35,
  'reits': -25,
  'utilities': -20,
  'consumer_discretionary': -20,
  'financials': 15,   // Bancos benefician de tasas altas
  'value': 5,
};

const FED_DOVISH_SECTOR_IMPACT: Record<string, number> = {
  'technology': 25,
  'growth': 30,
  'reits': 20,
  'utilities': 15,
  'consumer_discretionary': 15,
  'financials': -10,
  'precious_metals': 20,
};

// ===== CACHE Y ESTADO =====

interface EventCache {
  events: GeopoliticalEvent[];
  lastFetch: Date;
  manualEvents: GeopoliticalEvent[]; // Eventos agregados manualmente
}

let eventCache: EventCache = {
  events: [],
  lastFetch: new Date(0),
  manualEvents: [],
};

const CACHE_TTL = 30 * 60 * 1000; // 30 minutos

// ===== FUNCIONES AUXILIARES =====

function calculateSeverityMultipliers(severity: ImpactSeverity): {
  volatilityMultiplier: number;
  confidenceReduction: number;
} {
  switch (severity) {
    case 'extreme':
      return { volatilityMultiplier: 2.5, confidenceReduction: 40 };
    case 'severe':
      return { volatilityMultiplier: 2.0, confidenceReduction: 30 };
    case 'high':
      return { volatilityMultiplier: 1.6, confidenceReduction: 20 };
    case 'moderate':
      return { volatilityMultiplier: 1.3, confidenceReduction: 10 };
    case 'low':
    default:
      return { volatilityMultiplier: 1.1, confidenceReduction: 5 };
  }
}

function determineSeverity(score: number): ImpactSeverity {
  const absScore = Math.abs(score);
  if (absScore >= 80) return 'extreme';
  if (absScore >= 60) return 'severe';
  if (absScore >= 40) return 'high';
  if (absScore >= 20) return 'moderate';
  return 'low';
}

function isAssetAffected(
  symbol: string, 
  assetName: string | undefined,
  event: GeopoliticalEvent
): boolean {
  const searchText = `${symbol} ${assetName || ''}`.toLowerCase();
  return event.relatedKeywords.some(keyword => 
    searchText.includes(keyword.toLowerCase())
  );
}

// ===== CREACIÓN DE EVENTOS =====

function createTariffEvent(
  countries: string[],
  tariffRate: number,
  isRetaliatory: boolean = false
): GeopoliticalEvent {
  const severity = tariffRate >= 25 ? 'severe' : tariffRate >= 10 ? 'high' : 'moderate';
  const multipliers = calculateSeverityMultipliers(severity);
  
  const baseImpact = -Math.min(50, tariffRate * 1.5);
  
  return {
    type: isRetaliatory ? 'trade_war_escalation' : 'tariff_announcement',
    title: isRetaliatory 
      ? `Guerra comercial: aranceles retaliatorios con ${countries.join(', ')}`
      : `Nuevos aranceles del ${tariffRate}% anunciados`,
    description: `Aranceles de ${tariffRate}% ${isRetaliatory ? 'retaliatorios ' : ''}afectando comercio con ${countries.join(', ')}`,
    severity,
    detectedAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 días
    impact: {
      overall: baseImpact * (isRetaliatory ? 1.5 : 1),
      volatilityIncrease: multipliers.volatilityMultiplier,
      confidenceReduction: multipliers.confidenceReduction,
    },
    sectorImpact: TARIFF_SECTOR_IMPACT,
    regionsAffected: countries,
    relatedKeywords: [
      'china', 'chinese', 'mexico', 'mexican', 'canada', 'canadian',
      'import', 'export', 'trade', 'manufacturing', 'supply chain',
      ...countries.map(c => c.toLowerCase()),
    ],
  };
}

function createFedEvent(
  eventSubType: 'hawkish' | 'dovish' | 'chair_change',
  details: string
): GeopoliticalEvent {
  const isHawkish = eventSubType === 'hawkish';
  const isChairChange = eventSubType === 'chair_change';
  
  const severity = isChairChange ? 'high' : 'moderate';
  const multipliers = calculateSeverityMultipliers(severity);
  
  return {
    type: isChairChange ? 'fed_chair_nomination' : 'fed_policy_change',
    title: isChairChange 
      ? 'Nuevo presidente de la Fed nominado'
      : `Fed señala política ${isHawkish ? 'restrictiva' : 'expansiva'}`,
    description: details,
    severity,
    detectedAt: new Date(),
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 días
    impact: {
      overall: isHawkish ? -20 : 15,
      volatilityIncrease: multipliers.volatilityMultiplier,
      confidenceReduction: multipliers.confidenceReduction,
    },
    sectorImpact: isHawkish ? FED_HAWKISH_SECTOR_IMPACT : FED_DOVISH_SECTOR_IMPACT,
    regionsAffected: ['US', 'Global'],
    relatedKeywords: [
      'growth', 'tech', 'nasdaq', 'interest', 'bond', 'treasury',
      'rate sensitive', 'dividend', 'reit',
    ],
  };
}

function createCommodityShockEvent(
  commodity: string,
  changePercent: number,
  reason: string
): GeopoliticalEvent {
  const severity = Math.abs(changePercent) >= 10 ? 'severe' : 
                   Math.abs(changePercent) >= 5 ? 'high' : 'moderate';
  const multipliers = calculateSeverityMultipliers(severity);
  
  const isNegative = changePercent < 0;
  
  return {
    type: 'commodity_shock',
    title: `${commodity} ${isNegative ? 'cae' : 'sube'} ${Math.abs(changePercent).toFixed(1)}%`,
    description: `${reason}. Impacto significativo en mercados relacionados.`,
    severity,
    detectedAt: new Date(),
    expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 días
    impact: {
      overall: changePercent * 2,
      volatilityIncrease: multipliers.volatilityMultiplier,
      confidenceReduction: multipliers.confidenceReduction,
    },
    sectorImpact: {
      'energy': commodity.toLowerCase().includes('oil') ? changePercent * 1.5 : 0,
      'materials': changePercent,
      'precious_metals': commodity.toLowerCase().includes('gold') || 
                         commodity.toLowerCase().includes('silver') ? changePercent : 0,
      'mining': changePercent * 0.8,
    },
    regionsAffected: ['Global'],
    relatedKeywords: [
      commodity.toLowerCase(), 'commodity', 'commodities',
      'oil', 'gold', 'silver', 'copper', 'mining', 'energy',
    ],
  };
}

// ===== ANÁLISIS DE NOTICIAS =====

async function fetchAndAnalyzeNews(): Promise<GeopoliticalEvent[]> {
  const events: GeopoliticalEvent[] = [];
  
  try {
    // Buscar noticias de mercado globales con más queries
    const queries = [
      'tariffs trade war',
      'federal reserve fed chair',
      'trump tariff',
      'trade deal agreement',
      'gold silver crash selloff',
      'commodity prices',
    ];
    
    for (const query of queries) {
      try {
        const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=5&quotesCount=0`;
        
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          signal: AbortSignal.timeout(8000),
        });
        
        if (!response.ok) continue;
        
        const data: any = await response.json();
        const newsItems = data.news || [];
        
        for (const item of newsItems) {
          const title = (item.title || '').toLowerCase();
          const publishedAt = item.providerPublishTime 
            ? new Date(item.providerPublishTime * 1000) 
            : new Date();
          
          // Solo noticias recientes (últimas 48 horas)
          const hoursSincePublished = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60);
          if (hoursSincePublished > 48) continue;
          
          // Detectar eventos de aranceles
          if (TARIFF_KEYWORDS.some(kw => title.includes(kw))) {
            const countries: string[] = [];
            if (title.includes('china') || title.includes('chinese')) countries.push('China');
            if (title.includes('mexico') || title.includes('mexican')) countries.push('Mexico');
            if (title.includes('canada') || title.includes('canadian')) countries.push('Canada');
            if (title.includes('eu') || title.includes('europe')) countries.push('EU');
            if (title.includes('india')) countries.push('India');
            
            if (countries.length > 0) {
              const isRetaliatory = title.includes('retaliat') || title.includes('response') || title.includes('counter');
              const tariffRate = extractTariffRate(title) || 25;
              
              // Verificar si ya existe un evento similar
              const exists = events.some(e => 
                e.type === 'tariff_announcement' && 
                e.regionsAffected.some(r => countries.includes(r))
              );
              
              if (!exists) {
                events.push(createTariffEvent(countries, tariffRate, isRetaliatory));
              }
            }
          }
          
          // Detectar eventos de la Fed
          if (FED_KEYWORDS.some(kw => title.includes(kw))) {
            const isHawkish = title.includes('hawkish') || title.includes('raise') || 
                             title.includes('hike') || title.includes('tighten');
            const isDovish = title.includes('dovish') || title.includes('cut') || 
                            title.includes('lower') || title.includes('ease');
            const isChairChange = title.includes('chair') || title.includes('nomin');
            
            if (isChairChange || isHawkish || isDovish) {
              const eventSubType = isChairChange ? 'chair_change' : (isHawkish ? 'hawkish' : 'dovish');
              
              // Verificar si ya existe un evento de Fed
              const exists = events.some(e => 
                e.type === 'fed_policy_change' || e.type === 'fed_chair_nomination'
              );
              
              if (!exists) {
                events.push(createFedEvent(eventSubType, item.title || 'Cambio en política de la Fed'));
              }
            }
          }
          
          // Detectar acuerdos comerciales (positivo)
          if (TRADE_DEAL_KEYWORDS.some(kw => title.includes(kw))) {
            const countries: string[] = [];
            if (title.includes('china')) countries.push('China');
            if (title.includes('india')) countries.push('India');
            if (title.includes('mexico')) countries.push('Mexico');
            if (title.includes('canada')) countries.push('Canada');
            
            if (countries.length > 0) {
              const exists = events.some(e => e.type === 'trade_deal');
              if (!exists) {
                events.push({
                  type: 'trade_deal',
                  title: `Acuerdo comercial con ${countries.join(', ')}`,
                  description: item.title || 'Nuevo acuerdo comercial anunciado',
                  severity: 'moderate',
                  detectedAt: new Date(),
                  expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
                  impact: {
                    overall: 15,
                    volatilityIncrease: 1.1,
                    confidenceReduction: 5,
                  },
                  sectorImpact: Object.fromEntries(
                    Object.entries(TARIFF_SECTOR_IMPACT).map(([k, v]) => [k, -v * 0.5])
                  ),
                  regionsAffected: countries,
                  relatedKeywords: countries.map(c => c.toLowerCase()),
                });
              }
            }
          }
        }
      } catch (err) {
        // Continuar con siguiente query
      }
    }
    
  } catch (error: any) {
    logger.warn(`[GeopoliticalEvents] Error fetching news: ${error.message}`);
  }
  
  return events;
}

function extractTariffRate(text: string): number | null {
  const match = text.match(/(\d+)%?\s*(?:tariff|percent|arancel)/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

// ===== SERVICIO PRINCIPAL =====

async function analyzeGeopoliticalEvents(): Promise<GeopoliticalAnalysis> {
  // Verificar cache
  const cacheAge = Date.now() - eventCache.lastFetch.getTime();
  
  if (cacheAge < CACHE_TTL && eventCache.events.length > 0) {
    return buildAnalysis([...eventCache.events, ...eventCache.manualEvents]);
  }
  
  // Fetch nuevos eventos
  try {
    const fetchedEvents = await fetchAndAnalyzeNews();
    
    // Filtrar eventos expirados
    const now = new Date();
    const validEvents = [
      ...fetchedEvents,
      ...eventCache.manualEvents.filter(e => e.expiresAt > now),
    ].filter(e => e.expiresAt > now);
    
    eventCache = {
      events: fetchedEvents,
      lastFetch: new Date(),
      manualEvents: eventCache.manualEvents.filter(e => e.expiresAt > now),
    };
    
    const analysis = buildAnalysis(validEvents);
    
    if (analysis.hasActiveEvents) {
      logger.info(`[GeopoliticalEvents] ${validEvents.length} active events. Risk: ${analysis.overallRisk}. Impact: ${analysis.marketImpact.magnitude.toFixed(0)}`);
    }
    
    return analysis;
    
  } catch (error: any) {
    logger.error(`[GeopoliticalEvents] Analysis error: ${error.message}`);
    return buildAnalysis([...eventCache.events, ...eventCache.manualEvents]);
  }
}

function buildAnalysis(events: GeopoliticalEvent[]): GeopoliticalAnalysis {
  if (events.length === 0) {
    return {
      hasActiveEvents: false,
      events: [],
      overallRisk: 'low',
      marketImpact: {
        direction: 'neutral',
        magnitude: 0,
        volatilityMultiplier: 1.0,
        confidenceAdjustment: 0,
      },
      signals: ['Sin eventos geopolíticos significativos detectados'],
      reasoning: 'El mercado opera sin perturbaciones geopolíticas mayores.',
    };
  }
  
  // Calcular impacto agregado
  let totalImpact = 0;
  let maxVolatilityMultiplier = 1.0;
  let maxConfidenceReduction = 0;
  const signals: string[] = [];
  
  for (const event of events) {
    totalImpact += event.impact.overall;
    maxVolatilityMultiplier = Math.max(maxVolatilityMultiplier, event.impact.volatilityIncrease);
    maxConfidenceReduction = Math.max(maxConfidenceReduction, event.impact.confidenceReduction);
    
    const emoji = event.impact.overall < 0 ? '⚠️' : '✅';
    signals.push(`${emoji} ${event.title}`);
  }
  
  // Determinar dirección y severidad
  const direction = totalImpact > 10 ? 'bullish' : 
                    totalImpact < -10 ? 'bearish' : 
                    events.length > 1 ? 'mixed' : 'neutral';
  
  const overallRisk = determineSeverity(totalImpact);
  
  return {
    hasActiveEvents: true,
    events,
    overallRisk,
    marketImpact: {
      direction,
      magnitude: Math.max(-100, Math.min(100, totalImpact)),
      volatilityMultiplier: maxVolatilityMultiplier,
      confidenceAdjustment: maxConfidenceReduction,
    },
    signals,
    reasoning: generateReasoning(events, direction, overallRisk),
  };
}

function generateReasoning(
  events: GeopoliticalEvent[], 
  direction: string, 
  risk: ImpactSeverity
): string {
  const eventTypes = events.map(e => e.type);
  
  if (eventTypes.includes('tariff_announcement') || eventTypes.includes('trade_war_escalation')) {
    return `Tensiones comerciales activas afectando mercados. Sectores expuestos al comercio internacional bajo presión. Volatilidad elevada esperada.`;
  }
  
  if (eventTypes.includes('fed_chair_nomination') || eventTypes.includes('fed_policy_change')) {
    return `Cambios en política monetaria de la Fed generando incertidumbre. Mercados ajustando expectativas de tasas y liquidez.`;
  }
  
  if (eventTypes.includes('trade_deal')) {
    return `Acuerdos comerciales positivos reduciendo tensiones. Mejora de expectativas para sectores exportadores.`;
  }
  
  if (eventTypes.includes('commodity_shock')) {
    return `Shock en mercados de commodities afectando sectores relacionados. Ajustar exposición a materiales y energía.`;
  }
  
  return `Múltiples eventos geopolíticos activos (${events.length}). Riesgo ${risk}. Dirección del mercado: ${direction}.`;
}

// ===== EXPORT =====

export const geopoliticalEventsService = {
  /**
   * Obtiene el análisis actual de eventos geopolíticos
   */
  async getCurrentAnalysis(): Promise<GeopoliticalAnalysis> {
    return analyzeGeopoliticalEvents();
  },
  
  /**
   * Agrega un evento manual (para eventos conocidos que el scraping no detecte)
   */
  addManualEvent(event: Omit<GeopoliticalEvent, 'detectedAt'>): void {
    const fullEvent: GeopoliticalEvent = {
      ...event,
      detectedAt: new Date(),
    };
    eventCache.manualEvents.push(fullEvent);
    logger.info(`[GeopoliticalEvents] Manual event added: ${event.title}`);
  },
  
  /**
   * Crea un evento de aranceles
   */
  createTariffEvent,
  
  /**
   * Crea un evento de la Fed
   */
  createFedEvent,
  
  /**
   * Crea un evento de shock de commodities
   */
  createCommodityShockEvent,
  
  /**
   * Aplica el impacto geopolítico a una predicción
   */
  async applyToPrediction(
    prediction: { change: number; confidence: number },
    symbol: string,
    assetName?: string,
    assetType: 'stock' | 'crypto' | 'forex' | 'commodity' | 'index' | 'etf' | 'other' = 'stock'
  ): Promise<{
    adjustedChange: number;
    adjustedConfidence: number;
    applied: boolean;
    geopoliticalInfo?: GeopoliticalAnalysis;
    appliedEvents?: string[];
  }> {
    try {
      const analysis = await analyzeGeopoliticalEvents();
      
      if (!analysis.hasActiveEvents) {
        return {
          adjustedChange: prediction.change,
          adjustedConfidence: prediction.confidence,
          applied: false,
        };
      }
      
      // Filtrar eventos relevantes para este activo
      const relevantEvents = analysis.events.filter(event => 
        isAssetAffected(symbol, assetName, event)
      );
      
      if (relevantEvents.length === 0) {
        // Aún aplicar ajuste de confianza por incertidumbre general
        const generalConfidenceReduction = analysis.marketImpact.confidenceAdjustment * 0.3;
        
        return {
          adjustedChange: prediction.change,
          adjustedConfidence: Math.max(15, prediction.confidence - generalConfidenceReduction),
          applied: generalConfidenceReduction > 2,
          geopoliticalInfo: analysis,
        };
      }
      
      // Calcular ajuste específico
      let totalAdjustment = 0;
      const appliedEvents: string[] = [];
      
      for (const event of relevantEvents) {
        // Factor de aplicación según tipo de activo
        let applicationFactor = 1.0;
        switch (assetType) {
          case 'stock':
          case 'etf':
            applicationFactor = 1.0;
            break;
          case 'index':
            applicationFactor = 0.8;
            break;
          case 'crypto':
            applicationFactor = 0.5; // Cripto menos correlacionado con geopolítica
            break;
          case 'forex':
            applicationFactor = 0.7;
            break;
          case 'commodity':
            applicationFactor = event.type === 'commodity_shock' ? 1.2 : 0.6;
            break;
          default:
            applicationFactor = 0.7;
        }
        
        totalAdjustment += (event.impact.overall / 100) * applicationFactor;
        appliedEvents.push(event.title);
      }
      
      // Aplicar ajuste (máximo ±5% de cambio adicional)
      const changeAdjustment = Math.max(-5, Math.min(5, totalAdjustment * 3));
      const adjustedChange = prediction.change + changeAdjustment;
      
      // Reducir confianza
      const confidenceReduction = analysis.marketImpact.confidenceAdjustment;
      const adjustedConfidence = Math.max(15, Math.min(95, prediction.confidence - confidenceReduction));
      
      logger.debug(`[GeopoliticalEvents] Applied to ${symbol}: change ${prediction.change.toFixed(2)}% → ${adjustedChange.toFixed(2)}%, confidence ${prediction.confidence}% → ${adjustedConfidence}%`);
      
      return {
        adjustedChange,
        adjustedConfidence,
        applied: true,
        geopoliticalInfo: analysis,
        appliedEvents,
      };
      
    } catch (error: any) {
      logger.error(`[GeopoliticalEvents] Error applying to prediction: ${error.message}`);
      return {
        adjustedChange: prediction.change,
        adjustedConfidence: prediction.confidence,
        applied: false,
      };
    }
  },
  
  /**
   * Obtiene un resumen rápido
   */
  async getQuickSummary(): Promise<{
    hasEvents: boolean;
    riskLevel: ImpactSeverity;
    mainEvent: string | null;
    emoji: string;
  }> {
    const analysis = await analyzeGeopoliticalEvents();
    
    if (!analysis.hasActiveEvents) {
      return {
        hasEvents: false,
        riskLevel: 'low',
        mainEvent: null,
        emoji: '🌍',
      };
    }
    
    const emoji = analysis.marketImpact.direction === 'bearish' ? '⚠️' :
                  analysis.marketImpact.direction === 'bullish' ? '✅' : '🔄';
    
    return {
      hasEvents: true,
      riskLevel: analysis.overallRisk,
      mainEvent: analysis.events[0]?.title || null,
      emoji,
    };
  },
  
  /**
   * Limpia el cache
   */
  clearCache(): void {
    eventCache = {
      events: [],
      lastFetch: new Date(0),
      manualEvents: [],
    };
  },
  
  /**
   * Carga eventos conocidos actuales (basados en noticias recientes)
   * Llamar al iniciar el servidor para tener eventos pre-cargados
   */
  loadKnownCurrentEvents(): void {
    const now = new Date();
    
    // Evento: Nominación de Kevin Warsh como presidente de la Fed
    // Esto causó caída en commodities (especialmente metales preciosos)
    // Warsh es considerado "hawkish" - política monetaria restrictiva
    const warshEvent: GeopoliticalEvent = {
      type: 'fed_chair_nomination',
      title: 'Kevin Warsh nominado como próximo presidente de la Fed',
      description: 'Trump nominó a Kevin Warsh como nuevo presidente de la Fed. Warsh es considerado hawkish, lo que provocó una fuerte caída en metales preciosos y commodities por expectativas de política monetaria más restrictiva.',
      severity: 'high',
      detectedAt: new Date('2026-01-31'),
      expiresAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000), // 14 días
      impact: {
        overall: -25,
        volatilityIncrease: 1.5,
        confidenceReduction: 15,
      },
      sectorImpact: {
        ...FED_HAWKISH_SECTOR_IMPACT,
        'precious_metals': -40, // Caída extra fuerte en metales
        'commodities': -30,
      },
      regionsAffected: ['US', 'Global'],
      relatedKeywords: [
        'gold', 'silver', 'platinum', 'palladium', 'precious',
        'commodity', 'commodities', 'mining', 'gld', 'slv',
        'growth', 'tech', 'nasdaq', 'rate sensitive',
      ],
    };
    
    // Evento: Acuerdo comercial con India
    // Positivo para mercados, reduce tensiones comerciales
    const indiaTradeEvent: GeopoliticalEvent = {
      type: 'trade_deal',
      title: 'Acuerdo comercial EE.UU.-India: reducción de aranceles',
      description: 'Trump anunció acuerdo comercial con India para reducir aranceles inmediatamente. Esto reduce tensiones comerciales globales y es positivo para mercados emergentes.',
      severity: 'moderate',
      detectedAt: new Date('2026-02-02'),
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 días
      impact: {
        overall: 10,
        volatilityIncrease: 1.1,
        confidenceReduction: 5,
      },
      sectorImpact: {
        'technology': 10,
        'emerging_markets': 15,
        'manufacturing': 8,
        'pharmaceuticals': 10, // India es gran exportador de pharma
      },
      regionsAffected: ['US', 'India', 'Asia'],
      relatedKeywords: [
        'india', 'indian', 'emerging', 'asia', 'pharma',
        'generic', 'outsourcing', 'it services',
      ],
    };
    
    // Evento: Volatilidad extrema en cripto
    // $2.5B en liquidaciones de Bitcoin
    const cryptoVolatilityEvent: GeopoliticalEvent = {
      type: 'commodity_shock',
      title: 'Volatilidad extrema en cripto: $2.5B en liquidaciones',
      description: 'El mercado cripto experimentó volatilidad extrema con $2.5 billones en liquidaciones de Bitcoin. Señal de aversión al riesgo en activos especulativos.',
      severity: 'high',
      detectedAt: new Date('2026-02-02'),
      expiresAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000), // 3 días
      impact: {
        overall: -15,
        volatilityIncrease: 2.0,
        confidenceReduction: 20,
      },
      sectorImpact: {
        'crypto': -30,
        'blockchain': -20,
        'fintech': -10,
        'speculative': -25,
      },
      regionsAffected: ['Global'],
      relatedKeywords: [
        'bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'cryptocurrency',
        'coinbase', 'coin', 'blockchain', 'defi',
      ],
    };
    
    // Solo agregar si no están expirados y no existen ya
    const knownEvents = [warshEvent, indiaTradeEvent, cryptoVolatilityEvent];
    
    for (const event of knownEvents) {
      if (event.expiresAt > now) {
        const exists = eventCache.manualEvents.some(e => 
          e.type === event.type && e.title === event.title
        );
        if (!exists) {
          eventCache.manualEvents.push(event);
          logger.info(`[GeopoliticalEvents] Loaded known event: ${event.title}`);
        }
      }
    }
  },
};

// Auto-cargar eventos conocidos al importar el módulo
geopoliticalEventsService.loadKnownCurrentEvents();