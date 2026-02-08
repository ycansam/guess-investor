/**
 * Shock Detection Service (antes Geopolitical Events)
 * 
 * CAMBIO DE ENFOQUE:
 * - NO predice dirección (imposible de cuantificar bien)
 * - SÍ detecta eventos que aumentan INCERTIDUMBRE y VOLATILIDAD
 * - Reduce confianza en predicciones cuando hay shocks activos
 * - NO modifica el cambio predicho, solo la confianza
 * 
 * Tipos de shocks detectados:
 * - Aranceles y guerras comerciales
 * - Cambios en política de la Fed
 * - Tensiones geopolíticas
 * - Crashes/volatilidad extrema
 * - Crisis bancarias o de deuda
 */

import { logger } from '../../middleware/logger.js';

// ===== TIPOS =====

export type ShockType = 
  | 'trade_shock'         // Aranceles, guerra comercial
  | 'monetary_shock'      // Fed, tipos de interés
  | 'geopolitical_shock'  // Tensiones, sanciones, conflictos
  | 'market_shock'        // Crash, volatilidad extrema
  | 'financial_shock'     // Crisis bancaria, deuda
  | 'regulatory_shock';   // Regulaciones disruptivas

export type ShockSeverity = 'low' | 'moderate' | 'high' | 'severe' | 'extreme';

export interface DetectedShock {
  type: ShockType;
  title: string;
  severity: ShockSeverity;
  detectedAt: Date;
  expiresAt: Date;
  
  // Impacto en predicciones
  uncertaintyIncrease: number;  // 0-100: cuánto aumenta la incertidumbre
  volatilityMultiplier: number; // 1.0-3.0: multiplicador de volatilidad esperada
  
  // Contexto
  regionsAffected: string[];
  sectorsAffected: string[];
  keywords: string[];
  
  reasoning: string;
}

// Renombrar para compatibilidad pero internamente es shock detection
export interface GeopoliticalAnalysis {
  hasActiveEvents: boolean;
  events: DetectedShock[];
  overallRisk: ShockSeverity;
  
  // Impacto agregado en predicciones
  totalUncertaintyIncrease: number;
  maxVolatilityMultiplier: number;
  confidenceReduction: number;  // Cuánto reducir la confianza
  
  signals: string[];
  reasoning: string;
}

// ===== PATRONES DE DETECCIÓN =====

interface ShockPattern {
  type: ShockType;
  requiredKeywords: string[];
  boostKeywords: string[];
  baseSeverity: ShockSeverity;
  baseUncertainty: number;
  baseVolatilityMult: number;
  durationDays: number;
  affectedSectors: string[];
  assetKeywords: string[];
}

const SHOCK_PATTERNS: ShockPattern[] = [
  // === SHOCKS COMERCIALES ===
  {
    type: 'trade_shock',
    requiredKeywords: ['tariff', 'tariffs', 'trade war', 'trade tension', 'import duty', 'retaliat'],
    boostKeywords: ['announce', 'impose', 'new', 'escalat', 'china', 'mexico', 'eu', '%', 'billion'],
    baseSeverity: 'high',
    baseUncertainty: 40,
    baseVolatilityMult: 1.6,
    durationDays: 7,
    affectedSectors: ['technology', 'semiconductors', 'automotive', 'manufacturing', 'retail'],
    assetKeywords: ['china', 'trade', 'export', 'import', 'manufacturing', 'supply chain'],
  },
  {
    type: 'trade_shock',
    requiredKeywords: ['trade deal', 'trade agreement', 'trade talks'],
    boostKeywords: ['sign', 'reach', 'agree', 'breakthrough', 'progress'],
    baseSeverity: 'moderate',
    baseUncertainty: 20,
    baseVolatilityMult: 1.2,
    durationDays: 3,
    affectedSectors: ['technology', 'manufacturing', 'retail'],
    assetKeywords: ['trade', 'export', 'import'],
  },
  
  // === SHOCKS MONETARIOS ===
  {
    type: 'monetary_shock',
    requiredKeywords: ['fed', 'federal reserve', 'interest rate', 'rate hike', 'rate cut', 'rate decision'],
    boostKeywords: ['unexpected', 'surprise', 'hawkish', 'dovish', 'pause', 'emergency', 'basis point'],
    baseSeverity: 'high',
    baseUncertainty: 35,
    baseVolatilityMult: 1.5,
    durationDays: 5,
    affectedSectors: ['all'],
    assetKeywords: ['rate', 'fed', 'bond', 'yield', 'treasury'],
  },
  {
    type: 'monetary_shock',
    requiredKeywords: ['fed chair', 'powell', 'fomc', 'quantitative'],
    boostKeywords: ['nomin', 'fire', 'resign', 'qe', 'taper'],
    baseSeverity: 'moderate',
    baseUncertainty: 25,
    baseVolatilityMult: 1.3,
    durationDays: 7,
    affectedSectors: ['all'],
    assetKeywords: ['fed', 'monetary', 'policy'],
  },
  
  // === SHOCKS GEOPOLÍTICOS ===
  {
    type: 'geopolitical_shock',
    requiredKeywords: ['sanction', 'military', 'war', 'invasion', 'attack', 'conflict', 'tension'],
    boostKeywords: ['russia', 'china', 'iran', 'north korea', 'israel', 'escalat', 'nuclear'],
    baseSeverity: 'severe',
    baseUncertainty: 50,
    baseVolatilityMult: 2.0,
    durationDays: 14,
    affectedSectors: ['defense', 'energy', 'commodities'],
    assetKeywords: ['oil', 'defense', 'gold', 'commodities', 'emerging'],
  },
  {
    type: 'geopolitical_shock',
    requiredKeywords: ['summit', 'diplomatic', 'peace talk', 'ceasefire'],
    boostKeywords: ['agree', 'progress', 'breakthrough'],
    baseSeverity: 'low',
    baseUncertainty: 15,
    baseVolatilityMult: 1.1,
    durationDays: 3,
    affectedSectors: ['defense', 'energy'],
    assetKeywords: ['oil', 'defense'],
  },
  
  // === SHOCKS DE MERCADO ===
  {
    type: 'market_shock',
    requiredKeywords: ['crash', 'plunge', 'selloff', 'rout', 'panic', 'black'],
    boostKeywords: ['worst', 'historic', 'billion wiped', 'circuit breaker', 'halt'],
    baseSeverity: 'extreme',
    baseUncertainty: 70,
    baseVolatilityMult: 2.5,
    durationDays: 5,
    affectedSectors: ['all'],
    assetKeywords: ['market', 'stock', 'index'],
  },
  {
    type: 'market_shock',
    requiredKeywords: ['vix', 'volatility', 'fear index'],
    boostKeywords: ['spike', 'surge', 'record', 'highest'],
    baseSeverity: 'high',
    baseUncertainty: 45,
    baseVolatilityMult: 1.8,
    durationDays: 3,
    affectedSectors: ['all'],
    assetKeywords: ['volatility', 'vix'],
  },
  
  // === SHOCKS FINANCIEROS ===
  {
    type: 'financial_shock',
    requiredKeywords: ['bank failure', 'bank crisis', 'bank run', 'banking crisis', 'svb', 'silicon valley bank'],
    boostKeywords: ['collapse', 'fdic', 'bailout', 'contagion', 'deposit'],
    baseSeverity: 'severe',
    baseUncertainty: 55,
    baseVolatilityMult: 2.0,
    durationDays: 10,
    affectedSectors: ['financials', 'regional_banks'],
    assetKeywords: ['bank', 'financial', 'regional'],
  },
  {
    type: 'financial_shock',
    requiredKeywords: ['debt ceiling', 'default', 'treasury', 'debt crisis'],
    boostKeywords: ['deadline', 'shutdown', 'downgrade', 'x-date'],
    baseSeverity: 'severe',
    baseUncertainty: 50,
    baseVolatilityMult: 1.9,
    durationDays: 14,
    affectedSectors: ['all'],
    assetKeywords: ['treasury', 'government', 'bond'],
  },
  
  // === SHOCKS REGULATORIOS ===
  {
    type: 'regulatory_shock',
    requiredKeywords: ['antitrust', 'sec', 'ftc', 'regulat', 'investigation', 'probe'],
    boostKeywords: ['break up', 'billion fine', 'lawsuit', 'monopoly', 'fraud'],
    baseSeverity: 'moderate',
    baseUncertainty: 30,
    baseVolatilityMult: 1.4,
    durationDays: 7,
    affectedSectors: ['technology', 'big_tech', 'financials'],
    assetKeywords: ['tech', 'regulation', 'antitrust'],
  },
];

// === PAÍSES Y REGIONES ===
const REGION_PATTERNS: Record<string, string[]> = {
  'US': ['us', 'u.s.', 'united states', 'america', 'washington', 'trump', 'biden'],
  'China': ['china', 'chinese', 'beijing'],
  'EU': ['europe', 'european', 'eu', 'ecb', 'germany', 'france'],
  'UK': ['uk', 'britain', 'british', 'boe'],
  'Russia': ['russia', 'russian', 'putin'],
  'Middle East': ['iran', 'saudi', 'israel', 'opec', 'middle east'],
  'Asia': ['japan', 'korea', 'taiwan'],
  'Global': ['global', 'worldwide', 'international'],
};

// ===== CACHE =====
interface ShockCache {
  shocks: DetectedShock[];
  lastFetch: Date;
  newsHashes: Set<string>;
}

let shockCache: ShockCache = {
  shocks: [],
  lastFetch: new Date(0),
  newsHashes: new Set(),
};

const CACHE_TTL = 15 * 60 * 1000; // 15 minutos

// ===== FUNCIONES DE ANÁLISIS =====

function hashNews(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 50);
}

function detectRegions(text: string): string[] {
  const lowerText = text.toLowerCase();
  const detected: string[] = [];
  
  for (const [region, patterns] of Object.entries(REGION_PATTERNS)) {
    if (patterns.some(p => lowerText.includes(p))) {
      detected.push(region);
    }
  }
  
  return detected.length > 0 ? detected : ['Global'];
}

function countMatches(text: string, keywords: string[]): number {
  const lowerText = text.toLowerCase();
  return keywords.filter(kw => lowerText.includes(kw.toLowerCase())).length;
}

function calculateSeverity(baseScore: number, boostMatches: number): ShockSeverity {
  const score = baseScore + (boostMatches * 15);
  
  if (score >= 80) return 'extreme';
  if (score >= 60) return 'severe';
  if (score >= 40) return 'high';
  if (score >= 25) return 'moderate';
  return 'low';
}

function analyzeNewsForShock(title: string, description: string = ''): DetectedShock | null {
  const fullText = `${title} ${description}`.toLowerCase();
  
  let bestMatch: { pattern: ShockPattern; score: number } | null = null;
  
  for (const pattern of SHOCK_PATTERNS) {
    const requiredMatches = countMatches(fullText, pattern.requiredKeywords);
    if (requiredMatches === 0) continue;
    
    const boostMatches = countMatches(fullText, pattern.boostKeywords);
    const score = (requiredMatches * 25) + (boostMatches * 10);
    
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { pattern, score };
    }
  }
  
  if (!bestMatch || bestMatch.score < 25) return null;
  
  const pattern = bestMatch.pattern;
  const boostMatches = countMatches(fullText, pattern.boostKeywords);
  
  // Calcular severidad ajustada
  const severityOrder: ShockSeverity[] = ['low', 'moderate', 'high', 'severe', 'extreme'];
  let severityIndex = severityOrder.indexOf(pattern.baseSeverity);
  if (boostMatches >= 3) severityIndex = Math.min(4, severityIndex + 1);
  const severity = severityOrder[severityIndex];
  
  // Ajustar incertidumbre y volatilidad por severidad
  const severityMultipliers: Record<ShockSeverity, number> = {
    'low': 0.7,
    'moderate': 1.0,
    'high': 1.3,
    'severe': 1.6,
    'extreme': 2.0,
  };
  
  const multiplier = severityMultipliers[severity];
  const uncertainty = Math.min(90, Math.round(pattern.baseUncertainty * multiplier));
  const volatilityMult = Math.min(3.0, pattern.baseVolatilityMult * (1 + (multiplier - 1) * 0.3));
  
  const regions = detectRegions(fullText);
  
  return {
    type: pattern.type,
    title: title.length > 150 ? title.substring(0, 147) + '...' : title,
    severity,
    detectedAt: new Date(),
    expiresAt: new Date(Date.now() + pattern.durationDays * 24 * 60 * 60 * 1000),
    uncertaintyIncrease: uncertainty,
    volatilityMultiplier: Math.round(volatilityMult * 100) / 100,
    regionsAffected: regions,
    sectorsAffected: pattern.affectedSectors,
    keywords: pattern.assetKeywords,
    reasoning: generateShockReasoning(pattern.type, severity, regions),
  };
}

function generateShockReasoning(type: ShockType, severity: ShockSeverity, regions: string[]): string {
  const typeDescriptions: Record<ShockType, string> = {
    'trade_shock': 'Tensiones comerciales',
    'monetary_shock': 'Cambios en política monetaria',
    'geopolitical_shock': 'Tensiones geopolíticas',
    'market_shock': 'Volatilidad extrema del mercado',
    'financial_shock': 'Estrés en sistema financiero',
    'regulatory_shock': 'Acción regulatoria significativa',
  };
  
  return `${typeDescriptions[type]} (${severity}). Regiones: ${regions.join(', ')}. Aumenta incertidumbre.`;
}

// ===== FETCH DE NOTICIAS =====

async function fetchNews(query: string): Promise<Array<{ title: string; description?: string }>> {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=6&quotesCount=0`;
    
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(8000),
    });
    
    if (!response.ok) return [];
    
    const data: any = await response.json();
    return (data.news || [])
      .filter((item: any) => {
        if (!item.providerPublishTime) return true;
        const hoursSince = (Date.now() - item.providerPublishTime * 1000) / (1000 * 60 * 60);
        return hoursSince <= 48; // Solo últimas 48 horas
      })
      .map((item: any) => ({
        title: item.title || '',
        description: item.summary || '',
      }));
  } catch {
    return [];
  }
}

async function scanForShocks(): Promise<DetectedShock[]> {
  const shocks: DetectedShock[] = [];
  
  // Queries para detectar shocks
  const queries = [
    'tariffs trade war',
    'federal reserve rate decision',
    'geopolitical tension conflict',
    'stock market crash volatility',
    'banking crisis',
    'sanctions',
  ];
  
  const allNews = await Promise.all(queries.map(q => fetchNews(q)));
  
  for (const newsItems of allNews) {
    for (const item of newsItems) {
      const hash = hashNews(item.title);
      if (shockCache.newsHashes.has(hash)) continue;
      
      const shock = analyzeNewsForShock(item.title, item.description);
      if (shock) {
        shocks.push(shock);
        shockCache.newsHashes.add(hash);
      }
    }
  }
  
  return shocks;
}

async function getActiveShocks(): Promise<GeopoliticalAnalysis> {
  const now = Date.now();
  
  // Limpiar shocks expirados
  shockCache.shocks = shockCache.shocks.filter(s => s.expiresAt > new Date());
  
  // Refrescar si es necesario
  if (now - shockCache.lastFetch.getTime() > CACHE_TTL) {
    try {
      const newShocks = await scanForShocks();
      
      // Merge con existentes (evitar duplicados)
      for (const shock of newShocks) {
        const exists = shockCache.shocks.some(s => s.type === shock.type && s.title === shock.title);
        if (!exists) {
          shockCache.shocks.push(shock);
        }
      }
      
      shockCache.lastFetch = new Date();
      
      logger.info(`[ShockDetection] Scanned news. Active shocks: ${shockCache.shocks.length}`);
    } catch (error: any) {
      logger.error(`[ShockDetection] Error scanning: ${error.message}`);
    }
  }
  
  return aggregateShocks(shockCache.shocks);
}

function aggregateShocks(shocks: DetectedShock[]): GeopoliticalAnalysis {
  if (shocks.length === 0) {
    return {
      hasActiveEvents: false,
      events: [],
      overallRisk: 'low',
      totalUncertaintyIncrease: 0,
      maxVolatilityMultiplier: 1.0,
      confidenceReduction: 0,
      signals: [],
      reasoning: 'Sin shocks detectados. Condiciones normales de mercado.',
    };
  }
  
  // Calcular impacto agregado (no lineal - hay saturación)
  const uncertainties = shocks.map(s => s.uncertaintyIncrease);
  const maxUncertainty = Math.max(...uncertainties);
  const avgUncertainty = uncertainties.reduce((a, b) => a + b, 0) / uncertainties.length;
  // Combinación: máximo + 30% del resto
  const totalUncertainty = Math.min(90, maxUncertainty + (avgUncertainty - maxUncertainty) * 0.3);
  
  const maxVolatilityMult = Math.max(...shocks.map(s => s.volatilityMultiplier));
  
  // Confidence reduction basado en incertidumbre total
  // Fórmula: reduce más agresivamente con alta incertidumbre
  const confidenceReduction = Math.round(totalUncertainty * 0.5); // 50% de la incertidumbre
  
  // Determinar riesgo general
  const severityOrder: ShockSeverity[] = ['low', 'moderate', 'high', 'severe', 'extreme'];
  const maxSeverityIndex = Math.max(...shocks.map(s => severityOrder.indexOf(s.severity)));
  const overallRisk = severityOrder[maxSeverityIndex];
  
  // Generar señales
  const signals: string[] = [];
  const shockTypes = new Set(shocks.map(s => s.type));
  
  if (shockTypes.has('trade_shock')) {
    signals.push('⚠️ Tensiones comerciales activas');
  }
  if (shockTypes.has('monetary_shock')) {
    signals.push('🏦 Incertidumbre en política monetaria');
  }
  if (shockTypes.has('geopolitical_shock')) {
    signals.push('🌍 Riesgos geopolíticos elevados');
  }
  if (shockTypes.has('market_shock')) {
    signals.push('📉 Volatilidad de mercado extrema');
  }
  if (shockTypes.has('financial_shock')) {
    signals.push('💰 Estrés en sistema financiero');
  }
  
  if (confidenceReduction >= 30) {
    signals.push(`🔴 Alta incertidumbre: confianza -${confidenceReduction}%`);
  } else if (confidenceReduction >= 15) {
    signals.push(`🟡 Incertidumbre moderada: confianza -${confidenceReduction}%`);
  }
  
  const reasoning = `${shocks.length} shock(s) activo(s). ` +
    `Riesgo: ${overallRisk}. ` +
    `Incertidumbre: +${Math.round(totalUncertainty)}%. ` +
    `Volatilidad: x${maxVolatilityMult.toFixed(1)}. ` +
    `Predicciones menos fiables.`;
  
  return {
    hasActiveEvents: true,
    events: shocks,
    overallRisk,
    totalUncertaintyIncrease: Math.round(totalUncertainty),
    maxVolatilityMultiplier: maxVolatilityMult,
    confidenceReduction,
    signals,
    reasoning,
  };
}

function isAssetAffected(symbol: string, assetName: string | undefined, shock: DetectedShock): boolean {
  const searchText = `${symbol} ${assetName || ''}`.toLowerCase();
  return shock.keywords.some(kw => searchText.includes(kw.toLowerCase()));
}

// ===== SERVICIO EXPORTADO =====

export const geopoliticalEventsService = {
  async getCurrentAnalysis(): Promise<GeopoliticalAnalysis> {
    return getActiveShocks();
  },
  
  /**
   * Aplica shock detection a una predicción
   * IMPORTANTE: Solo reduce confianza, NO modifica el cambio predicho
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
      const analysis = await getActiveShocks();
      
      if (!analysis.hasActiveEvents) {
        return {
          adjustedChange: prediction.change,  // NO modificamos el cambio
          adjustedConfidence: prediction.confidence,
          applied: false,
        };
      }
      
      // Encontrar shocks que afectan específicamente a este activo
      const relevantShocks = analysis.events.filter(shock => 
        isAssetAffected(symbol, assetName, shock) ||
        shock.sectorsAffected.includes('all')
      );
      
      if (relevantShocks.length === 0) {
        // Shocks globales afectan un poco a todos
        const globalReduction = Math.round(analysis.confidenceReduction * 0.3);
        
        return {
          adjustedChange: prediction.change,  // NO modificamos el cambio
          adjustedConfidence: Math.max(20, prediction.confidence - globalReduction),
          applied: globalReduction >= 3,
          geopoliticalInfo: analysis,
        };
      }
      
      // Calcular reducción de confianza para este activo
      const maxShockUncertainty = Math.max(...relevantShocks.map(s => s.uncertaintyIncrease));
      
      // Factor por tipo de activo (algunos son más sensibles)
      const assetSensitivity: Record<string, number> = {
        'stock': 1.0,
        'etf': 0.9,
        'index': 0.8,
        'crypto': 0.7, // Menos correlacionado con eventos tradicionales
        'forex': 1.1,  // Muy sensible a eventos
        'commodity': 1.2, // Muy sensible (oil, gold)
        'other': 0.8,
      };
      
      const sensitivity = assetSensitivity[assetType] || 1.0;
      const confidenceReduction = Math.round(maxShockUncertainty * 0.5 * sensitivity);
      
      const adjustedConfidence = Math.max(20, Math.round(prediction.confidence - confidenceReduction));
      
      logger.debug(`[ShockDetection] ${symbol}: ${relevantShocks.length} relevant shocks. Confidence: ${prediction.confidence}% → ${adjustedConfidence}%`);
      
      return {
        adjustedChange: prediction.change,  // NUNCA modificamos el cambio
        adjustedConfidence,
        applied: true,
        geopoliticalInfo: analysis,
        appliedEvents: relevantShocks.map(s => s.title),
      };
      
    } catch (error: any) {
      logger.error(`[ShockDetection] Error: ${error.message}`);
      return {
        adjustedChange: prediction.change,
        adjustedConfidence: prediction.confidence,
        applied: false,
      };
    }
  },
  
  async getQuickSummary(): Promise<{
    hasEvents: boolean;
    riskLevel: ShockSeverity;
    mainEvent: string | null;
    eventCount: number;
    confidenceImpact: number;
    emoji: string;
  }> {
    const analysis = await getActiveShocks();
    
    if (!analysis.hasActiveEvents) {
      return {
        hasEvents: false,
        riskLevel: 'low',
        mainEvent: null,
        eventCount: 0,
        confidenceImpact: 0,
        emoji: '🟢',
      };
    }
    
    const emoji = analysis.overallRisk === 'extreme' || analysis.overallRisk === 'severe' ? '🔴' :
                  analysis.overallRisk === 'high' ? '🟠' : '🟡';
    
    return {
      hasEvents: true,
      riskLevel: analysis.overallRisk,
      mainEvent: analysis.events[0]?.title || null,
      eventCount: analysis.events.length,
      confidenceImpact: analysis.confidenceReduction,
      emoji,
    };
  },
  
  async forceRefresh(): Promise<GeopoliticalAnalysis> {
    shockCache.lastFetch = new Date(0);
    return getActiveShocks();
  },
  
  clearCache(): void {
    shockCache = {
      shocks: [],
      lastFetch: new Date(0),
      newsHashes: new Set(),
    };
  },
};
