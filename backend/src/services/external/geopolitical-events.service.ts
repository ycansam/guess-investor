/**
 * Geopolitical & Macro Events Service - VERSIÓN DINÁMICA
 * 
 * Detecta AUTOMÁTICAMENTE eventos macro/geopolíticos analizando noticias en tiempo real:
 * - Aranceles y guerras comerciales
 * - Cambios en política de la Fed
 * - Tensiones geopolíticas
 * - Sanciones económicas
 * - Crashes y volatilidad extrema
 * - Crisis de deuda
 * 
 * El sistema analiza el contenido de las noticias y determina:
 * 1. Tipo de evento
 * 2. Severidad del impacto
 * 3. Sectores afectados
 * 4. Países/regiones involucrados
 * 5. Si es positivo o negativo para el mercado
 */

import { logger } from '../../middleware/logger.js';

// ===== TIPOS =====

export type EventType = 
  | 'tariff_announcement'
  | 'trade_war_escalation'
  | 'trade_deal'
  | 'fed_policy_change'
  | 'fed_chair_nomination'
  | 'rate_decision'
  | 'geopolitical_tension'
  | 'sanctions'
  | 'debt_crisis'
  | 'currency_intervention'
  | 'commodity_shock'
  | 'market_crash'
  | 'banking_crisis'
  | 'crypto_volatility'
  | 'earnings_shock'
  | 'regulatory_action';

export type ImpactSeverity = 'low' | 'moderate' | 'high' | 'severe' | 'extreme';

export interface GeopoliticalEvent {
  type: EventType;
  title: string;
  description: string;
  severity: ImpactSeverity;
  detectedAt: Date;
  expiresAt: Date;
  sourceUrl?: string;
  
  impact: {
    overall: number;
    volatilityIncrease: number;
    confidenceReduction: number;
  };
  
  sectorImpact: Record<string, number>;
  regionsAffected: string[];
  relatedKeywords: string[];
}

export interface GeopoliticalAnalysis {
  hasActiveEvents: boolean;
  events: GeopoliticalEvent[];
  overallRisk: ImpactSeverity;
  marketImpact: {
    direction: 'bullish' | 'bearish' | 'mixed' | 'neutral';
    magnitude: number;
    volatilityMultiplier: number;
    confidenceAdjustment: number;
  };
  signals: string[];
  reasoning: string;
}

// ===== PATRONES DE DETECCIÓN INTELIGENTE =====

interface DetectionPattern {
  type: EventType;
  requiredKeywords: string[];
  boostKeywords: string[];
  negativeKeywords: string[];
  positiveKeywords: string[];
  baseSeverity: ImpactSeverity;
  baseImpact: number;
  durationDays: number;
  defaultSectorImpact: Record<string, number>;
  assetKeywords: string[];
}

const DETECTION_PATTERNS: DetectionPattern[] = [
  // === ARANCELES Y GUERRA COMERCIAL ===
  {
    type: 'tariff_announcement',
    requiredKeywords: ['tariff', 'tariffs', 'arancel', 'import duty', 'import tax'],
    boostKeywords: ['announce', 'impose', 'new', 'increase', 'raise', 'hike', '%'],
    negativeKeywords: ['impose', 'raise', 'hike', 'increase', 'new tariff', 'retaliat'],
    positiveKeywords: ['remove', 'cut', 'reduce', 'lift', 'exempt', 'pause', 'delay'],
    baseSeverity: 'high',
    baseImpact: -25,
    durationDays: 7,
    defaultSectorImpact: {
      'technology': -25, 'semiconductors': -35, 'automotive': -30,
      'industrial': -20, 'materials': -25, 'retail': -15,
      'agriculture': -30, 'manufacturing': -25,
    },
    assetKeywords: ['china', 'chinese', 'mexico', 'canada', 'eu', 'europe', 'import', 'export', 'trade', 'manufacturing'],
  },
  {
    type: 'trade_war_escalation',
    requiredKeywords: ['trade war', 'guerra comercial', 'retaliat', 'counter-tariff', 'trade tension'],
    boostKeywords: ['escalat', 'intensif', 'worsen', 'deepen', 'spread'],
    negativeKeywords: ['escalat', 'worsen', 'threat', 'warn'],
    positiveKeywords: ['ease', 'cool', 'de-escalat', 'talks', 'negotiat'],
    baseSeverity: 'severe',
    baseImpact: -35,
    durationDays: 14,
    defaultSectorImpact: {
      'technology': -30, 'semiconductors': -40, 'automotive': -35,
      'industrial': -30, 'emerging_markets': -35,
    },
    assetKeywords: ['global', 'international', 'supply chain', 'export', 'import'],
  },
  {
    type: 'trade_deal',
    requiredKeywords: ['trade deal', 'trade agreement', 'acuerdo comercial', 'free trade', 'bilateral'],
    boostKeywords: ['sign', 'reach', 'agree', 'announce', 'historic', 'breakthrough'],
    negativeKeywords: ['fail', 'collapse', 'reject', 'block'],
    positiveKeywords: ['sign', 'reach', 'agree', 'lower tariff', 'reduce barrier'],
    baseSeverity: 'moderate',
    baseImpact: 15,
    durationDays: 7,
    defaultSectorImpact: {
      'technology': 15, 'manufacturing': 20, 'retail': 10,
      'emerging_markets': 20, 'industrial': 15,
    },
    assetKeywords: ['trade', 'export', 'import', 'bilateral'],
  },
  
  // === FED Y POLÍTICA MONETARIA ===
  {
    type: 'fed_chair_nomination',
    requiredKeywords: ['fed chair', 'fed chairman', 'federal reserve chair', 'fed president', 'fed nominee'],
    boostKeywords: ['nomin', 'appoint', 'pick', 'select', 'name', 'trump', 'biden'],
    negativeKeywords: ['hawkish', 'hawk', 'tight', 'inflation fight'],
    positiveKeywords: ['dovish', 'dove', 'accommodat', 'stimul'],
    baseSeverity: 'high',
    baseImpact: -15,
    durationDays: 14,
    defaultSectorImpact: {
      'technology': -20, 'growth': -25, 'reits': -20,
      'utilities': -15, 'financials': 10, 'banks': 15,
    },
    assetKeywords: ['growth', 'tech', 'nasdaq', 'rate sensitive', 'dividend', 'reit', 'bond'],
  },
  {
    type: 'rate_decision',
    requiredKeywords: ['rate hike', 'rate cut', 'interest rate', 'fed rate', 'basis point', 'bps'],
    boostKeywords: ['decision', 'announce', 'fomc', 'meeting', 'unexpect', 'surprise'],
    negativeKeywords: ['hike', 'raise', 'increase', 'higher', 'hawk'],
    positiveKeywords: ['cut', 'lower', 'reduce', 'pause', 'hold', 'dove'],
    baseSeverity: 'high',
    baseImpact: 0,
    durationDays: 5,
    defaultSectorImpact: {
      'technology': -15, 'growth': -20, 'reits': -25,
      'financials': 15, 'banks': 20, 'utilities': -10,
    },
    assetKeywords: ['rate sensitive', 'growth', 'dividend', 'bond', 'treasury'],
  },
  {
    type: 'fed_policy_change',
    requiredKeywords: ['federal reserve', 'fed policy', 'monetary policy', 'quantitative', 'qe', 'taper'],
    boostKeywords: ['shift', 'change', 'pivot', 'reverse', 'signal', 'statement'],
    negativeKeywords: ['tighten', 'reduce', 'end qe', 'hawkish', 'inflation'],
    positiveKeywords: ['ease', 'stimulus', 'dovish', 'inject', 'support'],
    baseSeverity: 'moderate',
    baseImpact: -10,
    durationDays: 10,
    defaultSectorImpact: {
      'technology': -15, 'growth': -20, 'financials': 10,
    },
    assetKeywords: ['fed', 'monetary', 'liquidity', 'treasury'],
  },
  
  // === GEOPOLÍTICA ===
  {
    type: 'geopolitical_tension',
    requiredKeywords: ['military', 'troops', 'missile', 'attack', 'strike', 'invasion', 'war', 'conflict'],
    boostKeywords: ['launch', 'deploy', 'escalat', 'threat', 'border', 'nuclear'],
    negativeKeywords: ['attack', 'strike', 'launch', 'invade', 'escalat', 'threat'],
    positiveKeywords: ['ceasefire', 'peace', 'withdraw', 'de-escalat', 'talks'],
    baseSeverity: 'severe',
    baseImpact: -30,
    durationDays: 14,
    defaultSectorImpact: {
      'defense': 25, 'oil': 20, 'energy': 15,
      'airlines': -30, 'travel': -25, 'consumer': -15,
    },
    assetKeywords: ['defense', 'oil', 'gold', 'safe haven', 'military'],
  },
  {
    type: 'sanctions',
    requiredKeywords: ['sanction', 'embargo', 'ban', 'restrict', 'blacklist'],
    boostKeywords: ['impose', 'new', 'expand', 'target', 'treasury'],
    negativeKeywords: ['impose', 'expand', 'new', 'target'],
    positiveKeywords: ['lift', 'ease', 'remove', 'waiver', 'exempt'],
    baseSeverity: 'high',
    baseImpact: -20,
    durationDays: 30,
    defaultSectorImpact: {
      'energy': -25, 'financials': -20, 'technology': -15,
    },
    assetKeywords: ['russia', 'iran', 'china', 'venezuela', 'oil', 'bank'],
  },
  
  // === MERCADOS Y VOLATILIDAD ===
  {
    type: 'market_crash',
    requiredKeywords: ['crash', 'plunge', 'plummet', 'tumble', 'rout', 'selloff', 'sell-off', 'bloodbath'],
    boostKeywords: ['worst', 'historic', 'record', 'billion', 'trillion', 'wipe'],
    negativeKeywords: ['crash', 'plunge', 'worst', 'panic', 'fear'],
    positiveKeywords: ['recover', 'rebound', 'bounce', 'stabiliz'],
    baseSeverity: 'severe',
    baseImpact: -40,
    durationDays: 5,
    defaultSectorImpact: {
      'technology': -35, 'growth': -40, 'small_cap': -45,
      'financials': -30, 'consumer': -25,
    },
    assetKeywords: ['stock', 'market', 'index', 'nasdaq', 's&p', 'dow'],
  },
  {
    type: 'commodity_shock',
    requiredKeywords: ['oil price', 'gold price', 'silver', 'copper', 'commodity'],
    boostKeywords: ['surge', 'crash', 'plunge', 'spike', 'soar', 'collapse', 'record'],
    negativeKeywords: ['crash', 'plunge', 'collapse', 'tumble', 'drop'],
    positiveKeywords: ['surge', 'soar', 'rally', 'spike', 'record high'],
    baseSeverity: 'high',
    baseImpact: -20,
    durationDays: 5,
    defaultSectorImpact: {
      'energy': -25, 'materials': -20, 'mining': -25,
      'precious_metals': -30, 'commodities': -30,
    },
    assetKeywords: ['gold', 'silver', 'oil', 'copper', 'commodity', 'mining', 'energy'],
  },
  {
    type: 'crypto_volatility',
    requiredKeywords: ['bitcoin', 'crypto', 'cryptocurrency', 'ethereum'],
    boostKeywords: ['crash', 'plunge', 'liquidat', 'billion', 'surge', 'rally', 'record'],
    negativeKeywords: ['crash', 'plunge', 'liquidat', 'hack', 'fraud', 'ban'],
    positiveKeywords: ['surge', 'rally', 'record', 'adopt', 'approv', 'etf'],
    baseSeverity: 'high',
    baseImpact: -15,
    durationDays: 3,
    defaultSectorImpact: {
      'crypto': -35, 'blockchain': -25, 'fintech': -15,
    },
    assetKeywords: ['bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'coinbase', 'blockchain'],
  },
  
  // === CRISIS FINANCIERAS ===
  {
    type: 'banking_crisis',
    requiredKeywords: ['bank fail', 'bank collapse', 'bank run', 'banking crisis', 'svb', 'silicon valley bank'],
    boostKeywords: ['fdic', 'bailout', 'rescue', 'contagion', 'systemic'],
    negativeKeywords: ['fail', 'collapse', 'run', 'crisis', 'contagion'],
    positiveKeywords: ['rescue', 'stabiliz', 'contain', 'recover'],
    baseSeverity: 'extreme',
    baseImpact: -45,
    durationDays: 14,
    defaultSectorImpact: {
      'financials': -50, 'banks': -60, 'regional_banks': -70,
      'technology': -25, 'reits': -30,
    },
    assetKeywords: ['bank', 'financial', 'deposit', 'credit'],
  },
  {
    type: 'debt_crisis',
    requiredKeywords: ['debt crisis', 'default', 'debt ceiling', 'sovereign debt', 'bond yield'],
    boostKeywords: ['imminent', 'warn', 'deadline', 'spike', 'surge'],
    negativeKeywords: ['crisis', 'default', 'spike', 'risk'],
    positiveKeywords: ['deal', 'agree', 'resolve', 'avoid'],
    baseSeverity: 'severe',
    baseImpact: -35,
    durationDays: 14,
    defaultSectorImpact: {
      'financials': -30, 'government': -40, 'bonds': -35,
    },
    assetKeywords: ['treasury', 'bond', 'debt', 'government'],
  },
  
  // === REGULACIÓN ===
  {
    type: 'regulatory_action',
    requiredKeywords: ['antitrust', 'regulat', 'lawsuit', 'investig', 'fine', 'penalty', 'sec', 'ftc', 'doj'],
    boostKeywords: ['billion', 'record', 'break up', 'monopoly', 'fraud'],
    negativeKeywords: ['sue', 'fine', 'penalty', 'ban', 'block', 'investigate'],
    positiveKeywords: ['settle', 'dismiss', 'clear', 'approve'],
    baseSeverity: 'moderate',
    baseImpact: -15,
    durationDays: 7,
    defaultSectorImpact: {
      'technology': -20, 'big_tech': -30, 'financials': -15,
    },
    assetKeywords: ['tech', 'big tech', 'antitrust', 'regulation'],
  },
];

// === PAÍSES Y REGIONES ===
const COUNTRY_PATTERNS: Record<string, string[]> = {
  'US': ['us', 'u.s.', 'united states', 'america', 'washington', 'trump', 'biden', 'congress'],
  'China': ['china', 'chinese', 'beijing', 'xi jinping', 'prc'],
  'EU': ['europe', 'european', 'eu', 'brussels', 'germany', 'france', 'ecb'],
  'UK': ['uk', 'britain', 'british', 'london', 'england', 'boe'],
  'Japan': ['japan', 'japanese', 'tokyo', 'boj', 'yen'],
  'India': ['india', 'indian', 'mumbai', 'rbi', 'modi'],
  'Russia': ['russia', 'russian', 'moscow', 'putin', 'kremlin'],
  'Mexico': ['mexico', 'mexican'],
  'Canada': ['canada', 'canadian', 'ottawa'],
  'Brazil': ['brazil', 'brazilian'],
  'Middle East': ['iran', 'saudi', 'israel', 'opec', 'middle east', 'oil'],
  'Asia': ['asia', 'asian', 'korea', 'taiwan', 'vietnam'],
};

// ===== CACHE =====

interface EventCache {
  events: GeopoliticalEvent[];
  lastFetch: Date;
  newsHashes: Set<string>;
}

let eventCache: EventCache = {
  events: [],
  lastFetch: new Date(0),
  newsHashes: new Set(),
};

const CACHE_TTL = 15 * 60 * 1000; // 15 minutos

// ===== FUNCIONES DE ANÁLISIS =====

function hashNews(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 50);
}

function detectCountries(text: string): string[] {
  const lowerText = text.toLowerCase();
  const detected: string[] = [];
  
  for (const [country, patterns] of Object.entries(COUNTRY_PATTERNS)) {
    if (patterns.some(p => lowerText.includes(p))) {
      detected.push(country);
    }
  }
  
  return detected.length > 0 ? detected : ['Global'];
}

function countKeywordMatches(text: string, keywords: string[]): number {
  const lowerText = text.toLowerCase();
  return keywords.filter(kw => lowerText.includes(kw.toLowerCase())).length;
}

function calculateSeverity(
  baseScore: number,
  boostMatches: number,
  hasPercentage: boolean
): ImpactSeverity {
  let score = baseScore + (boostMatches * 10) + (hasPercentage ? 15 : 0);
  
  if (score >= 80) return 'extreme';
  if (score >= 60) return 'severe';
  if (score >= 40) return 'high';
  if (score >= 20) return 'moderate';
  return 'low';
}

function extractPercentage(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*%/);
  return match ? parseFloat(match[1]) : null;
}

function extractBillions(text: string): number | null {
  const match = text.match(/\$?\s*(\d+(?:\.\d+)?)\s*(billion|trillion|B|T)/i);
  if (!match) return null;
  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  return unit.startsWith('t') ? value * 1000 : value;
}

function analyzeNewsItem(
  title: string,
  description: string = ''
): GeopoliticalEvent | null {
  const fullText = `${title} ${description}`.toLowerCase();
  
  // Buscar qué patrón coincide mejor
  let bestMatch: { pattern: DetectionPattern; score: number } | null = null;
  
  for (const pattern of DETECTION_PATTERNS) {
    const requiredMatches = countKeywordMatches(fullText, pattern.requiredKeywords);
    
    if (requiredMatches === 0) continue;
    
    const boostMatches = countKeywordMatches(fullText, pattern.boostKeywords);
    const score = (requiredMatches * 30) + (boostMatches * 10);
    
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { pattern, score };
    }
  }
  
  if (!bestMatch || bestMatch.score < 30) return null;
  
  const pattern = bestMatch.pattern;
  
  // Analizar sentimiento del evento
  const negativeMatches = countKeywordMatches(fullText, pattern.negativeKeywords);
  const positiveMatches = countKeywordMatches(fullText, pattern.positiveKeywords);
  const isPositive = positiveMatches > negativeMatches;
  
  // Calcular impacto
  let impact = pattern.baseImpact;
  if (isPositive && pattern.baseImpact < 0) {
    impact = Math.abs(pattern.baseImpact) * 0.7;
  } else if (!isPositive && pattern.baseImpact > 0) {
    impact = -pattern.baseImpact;
  }
  
  // Ajustar por porcentajes mencionados
  const percentage = extractPercentage(fullText);
  if (percentage) {
    if (percentage >= 25) impact *= 1.5;
    else if (percentage >= 10) impact *= 1.2;
  }
  
  // Ajustar por cantidades en billones
  const billions = extractBillions(fullText);
  if (billions) {
    if (billions >= 100) impact *= 1.5;
    else if (billions >= 10) impact *= 1.2;
  }
  
  // Limitar impacto
  impact = Math.max(-100, Math.min(100, impact));
  
  // Calcular severidad
  const boostMatches = countKeywordMatches(fullText, pattern.boostKeywords);
  const severity = calculateSeverity(bestMatch.score, boostMatches, percentage !== null);
  
  // Detectar países
  const regions = detectCountries(fullText);
  
  // Ajustar sector impact según si es positivo o negativo
  const sectorImpact = { ...pattern.defaultSectorImpact };
  if (isPositive) {
    for (const sector of Object.keys(sectorImpact)) {
      sectorImpact[sector] = -sectorImpact[sector] * 0.6;
    }
  }
  
  // Multiplicadores de volatilidad y confianza
  const severityMultipliers: Record<ImpactSeverity, { vol: number; conf: number }> = {
    'extreme': { vol: 2.5, conf: 40 },
    'severe': { vol: 2.0, conf: 30 },
    'high': { vol: 1.6, conf: 20 },
    'moderate': { vol: 1.3, conf: 10 },
    'low': { vol: 1.1, conf: 5 },
  };
  
  const multipliers = severityMultipliers[severity];
  
  return {
    type: pattern.type,
    title: title.length > 150 ? title.substring(0, 147) + '...' : title,
    description: description || title,
    severity,
    detectedAt: new Date(),
    expiresAt: new Date(Date.now() + pattern.durationDays * 24 * 60 * 60 * 1000),
    impact: {
      overall: Math.round(impact),
      volatilityIncrease: multipliers.vol,
      confidenceReduction: multipliers.conf,
    },
    sectorImpact,
    regionsAffected: regions,
    relatedKeywords: [...pattern.assetKeywords, ...regions.map(r => r.toLowerCase())],
  };
}

// ===== FETCH DE NOTICIAS =====

async function fetchNewsFromSource(query: string): Promise<Array<{ title: string; description?: string; url?: string }>> {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=8&quotesCount=0`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(10000),
    });
    
    if (!response.ok) return [];
    
    const data: any = await response.json();
    const newsItems = data.news || [];
    
    return newsItems
      .filter((item: any) => {
        if (!item.providerPublishTime) return true;
        const publishedAt = new Date(item.providerPublishTime * 1000);
        const hoursSince = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60);
        return hoursSince <= 72;
      })
      .map((item: any) => ({
        title: item.title || '',
        description: item.summary || '',
        url: item.link || '',
      }));
  } catch (error) {
    return [];
  }
}

async function fetchAndAnalyzeAllNews(): Promise<GeopoliticalEvent[]> {
  const events: GeopoliticalEvent[] = [];
  
  const queries = [
    'tariffs trade war',
    'trump tariff',
    'trade deal agreement',
    'china trade',
    'federal reserve rate',
    'fed chair powell',
    'interest rate decision',
    'sanctions russia',
    'middle east conflict',
    'military tension',
    'stock market crash selloff',
    'gold silver crash',
    'bitcoin crypto crash',
    'market volatility vix',
    'banking crisis',
    'debt ceiling default',
    'antitrust big tech',
    'sec investigation',
  ];
  
  const batchSize = 4;
  for (let i = 0; i < queries.length; i += batchSize) {
    const batch = queries.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(q => fetchNewsFromSource(q)));
    
    for (const newsItems of results) {
      for (const item of newsItems) {
        if (!item.title) continue;
        
        const hash = hashNews(item.title);
        if (eventCache.newsHashes.has(hash)) continue;
        
        const event = analyzeNewsItem(item.title, item.description);
        
        if (event) {
          eventCache.newsHashes.add(hash);
          event.sourceUrl = item.url;
          
          const isDuplicate = events.some(e => 
            e.type === event.type && 
            e.regionsAffected.some(r => event.regionsAffected.includes(r))
          );
          
          if (!isDuplicate) {
            events.push(event);
            logger.debug(`[GeopoliticalEvents] Detected: [${event.type}] ${event.title.substring(0, 60)}...`);
          }
        }
      }
    }
    
    if (i + batchSize < queries.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  events.sort((a, b) => {
    const severityOrder: Record<ImpactSeverity, number> = {
      'extreme': 5, 'severe': 4, 'high': 3, 'moderate': 2, 'low': 1
    };
    return severityOrder[b.severity] - severityOrder[a.severity];
  });
  
  return events.slice(0, 10);
}

// ===== ANÁLISIS PRINCIPAL =====

async function analyzeGeopoliticalEvents(): Promise<GeopoliticalAnalysis> {
  const cacheAge = Date.now() - eventCache.lastFetch.getTime();
  
  if (cacheAge < CACHE_TTL && eventCache.events.length > 0) {
    return buildAnalysis(eventCache.events);
  }
  
  try {
    logger.info('[GeopoliticalEvents] Fetching and analyzing news...');
    const events = await fetchAndAnalyzeAllNews();
    
    const now = new Date();
    const validPrevious = eventCache.events.filter(e => e.expiresAt > now);
    
    const allEvents = [...events];
    for (const prev of validPrevious) {
      if (!allEvents.some(e => e.type === prev.type && e.title === prev.title)) {
        allEvents.push(prev);
      }
    }
    
    eventCache = {
      events: allEvents,
      lastFetch: new Date(),
      newsHashes: eventCache.newsHashes,
    };
    
    if (eventCache.newsHashes.size > 500) {
      const arr = Array.from(eventCache.newsHashes);
      eventCache.newsHashes = new Set(arr.slice(-300));
    }
    
    const analysis = buildAnalysis(allEvents);
    
    if (analysis.hasActiveEvents) {
      logger.info(`[GeopoliticalEvents] ${allEvents.length} events detected. Risk: ${analysis.overallRisk}. Direction: ${analysis.marketImpact.direction}`);
    }
    
    return analysis;
    
  } catch (error: any) {
    logger.error(`[GeopoliticalEvents] Error: ${error.message}`);
    return buildAnalysis(eventCache.events);
  }
}

function buildAnalysis(events: GeopoliticalEvent[]): GeopoliticalAnalysis {
  const now = new Date();
  const activeEvents = events.filter(e => e.expiresAt > now);
  
  if (activeEvents.length === 0) {
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
      signals: ['📊 Sin eventos macro/geopolíticos significativos detectados'],
      reasoning: 'El mercado opera sin perturbaciones geopolíticas mayores.',
    };
  }
  
  let totalImpact = 0;
  let maxVolatilityMultiplier = 1.0;
  let maxConfidenceReduction = 0;
  const signals: string[] = [];
  
  for (const event of activeEvents) {
    totalImpact += event.impact.overall;
    maxVolatilityMultiplier = Math.max(maxVolatilityMultiplier, event.impact.volatilityIncrease);
    maxConfidenceReduction = Math.max(maxConfidenceReduction, event.impact.confidenceReduction);
    
    const emoji = event.impact.overall < 0 ? '⚠️' : '✅';
    signals.push(`${emoji} ${event.title}`);
  }
  
  const direction = totalImpact > 15 ? 'bullish' : 
                    totalImpact < -15 ? 'bearish' : 
                    activeEvents.length > 1 ? 'mixed' : 'neutral';
  
  const absImpact = Math.abs(totalImpact);
  const overallRisk: ImpactSeverity = 
    absImpact >= 60 ? 'extreme' :
    absImpact >= 40 ? 'severe' :
    absImpact >= 25 ? 'high' :
    absImpact >= 10 ? 'moderate' : 'low';
  
  return {
    hasActiveEvents: true,
    events: activeEvents,
    overallRisk,
    marketImpact: {
      direction,
      magnitude: Math.max(-100, Math.min(100, totalImpact)),
      volatilityMultiplier: maxVolatilityMultiplier,
      confidenceAdjustment: maxConfidenceReduction,
    },
    signals,
    reasoning: generateReasoning(activeEvents, direction, overallRisk),
  };
}

function generateReasoning(
  events: GeopoliticalEvent[], 
  direction: string, 
  risk: ImpactSeverity
): string {
  const types = events.map(e => e.type);
  const parts: string[] = [];
  
  if (types.includes('tariff_announcement') || types.includes('trade_war_escalation')) {
    parts.push('Tensiones comerciales activas afectando mercados');
  }
  if (types.includes('fed_chair_nomination') || types.includes('fed_policy_change') || types.includes('rate_decision')) {
    parts.push('Cambios en política monetaria generando incertidumbre');
  }
  if (types.includes('geopolitical_tension') || types.includes('sanctions')) {
    parts.push('Tensiones geopolíticas elevando prima de riesgo');
  }
  if (types.includes('market_crash') || types.includes('commodity_shock')) {
    parts.push('Volatilidad extrema en mercados');
  }
  if (types.includes('crypto_volatility')) {
    parts.push('Turbulencia en mercado cripto');
  }
  if (types.includes('trade_deal')) {
    parts.push('Acuerdos comerciales mejorando perspectivas');
  }
  
  if (parts.length === 0) {
    parts.push(`${events.length} eventos macro detectados`);
  }
  
  return `${parts.join('. ')}. Riesgo: ${risk}. Sesgo: ${direction}.`;
}

// ===== APLICACIÓN A PREDICCIONES =====

function isAssetAffected(
  symbol: string,
  assetName: string | undefined,
  event: GeopoliticalEvent
): boolean {
  const searchText = `${symbol} ${assetName || ''}`.toLowerCase();
  return event.relatedKeywords.some(kw => searchText.includes(kw.toLowerCase()));
}

// ===== SERVICIO EXPORTADO =====

export const geopoliticalEventsService = {
  async getCurrentAnalysis(): Promise<GeopoliticalAnalysis> {
    return analyzeGeopoliticalEvents();
  },
  
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
      
      const relevantEvents = analysis.events.filter(event => 
        isAssetAffected(symbol, assetName, event)
      );
      
      if (relevantEvents.length === 0) {
        const generalConfidenceReduction = analysis.marketImpact.confidenceAdjustment * 0.3;
        
        return {
          adjustedChange: prediction.change,
          adjustedConfidence: Math.max(15, Math.round(prediction.confidence - generalConfidenceReduction)),
          applied: generalConfidenceReduction > 2,
          geopoliticalInfo: analysis,
        };
      }
      
      let totalAdjustment = 0;
      const appliedEvents: string[] = [];
      
      for (const event of relevantEvents) {
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
            applicationFactor = event.type === 'crypto_volatility' ? 1.2 : 0.5;
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
      
      const changeAdjustment = Math.max(-5, Math.min(5, totalAdjustment * 3));
      const adjustedChange = prediction.change + changeAdjustment;
      
      const confidenceReduction = analysis.marketImpact.confidenceAdjustment;
      const adjustedConfidence = Math.max(15, Math.min(95, Math.round(prediction.confidence - confidenceReduction)));
      
      logger.debug(`[GeopoliticalEvents] Applied to ${symbol}: change ${prediction.change.toFixed(2)}% → ${adjustedChange.toFixed(2)}%, confidence ${prediction.confidence}% → ${adjustedConfidence}%`);
      
      return {
        adjustedChange,
        adjustedConfidence,
        applied: true,
        geopoliticalInfo: analysis,
        appliedEvents,
      };
      
    } catch (error: any) {
      logger.error(`[GeopoliticalEvents] Error applying: ${error.message}`);
      return {
        adjustedChange: prediction.change,
        adjustedConfidence: prediction.confidence,
        applied: false,
      };
    }
  },
  
  async getQuickSummary(): Promise<{
    hasEvents: boolean;
    riskLevel: ImpactSeverity;
    mainEvent: string | null;
    eventCount: number;
    emoji: string;
  }> {
    const analysis = await analyzeGeopoliticalEvents();
    
    if (!analysis.hasActiveEvents) {
      return {
        hasEvents: false,
        riskLevel: 'low',
        mainEvent: null,
        eventCount: 0,
        emoji: '🌍',
      };
    }
    
    const emoji = analysis.marketImpact.direction === 'bearish' ? '⚠️' :
                  analysis.marketImpact.direction === 'bullish' ? '✅' : '🔄';
    
    return {
      hasEvents: true,
      riskLevel: analysis.overallRisk,
      mainEvent: analysis.events[0]?.title || null,
      eventCount: analysis.events.length,
      emoji,
    };
  },
  
  async forceRefresh(): Promise<GeopoliticalAnalysis> {
    eventCache.lastFetch = new Date(0);
    return analyzeGeopoliticalEvents();
  },
  
  clearCache(): void {
    eventCache = {
      events: [],
      lastFetch: new Date(0),
      newsHashes: new Set(),
    };
  },
};
