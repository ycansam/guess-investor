/**
 * News Service - VERSIÓN MEJORADA
 * 
 * Análisis de noticias financieras con:
 * - Análisis de sentimiento más sofisticado (contexto, negaciones)
 * - Peso por recencia (noticias recientes importan más)
 * - Peso por fuente (Reuters, Bloomberg pesan más que blogs)
 * - Detección de magnitud del impacto
 * - Clasificación de tipo de noticia (earnings, M&A, legal, product, etc.)
 */

import { logger } from '../../middleware/logger.js';

export interface NewsItem {
  title: string;
  publisher: string;
  link: string;
  publishedAt: Date;
  sentiment: 'positive' | 'negative' | 'neutral';
  sentimentScore: number; // -100 a +100
  confidence: number; // 0-100: qué tan seguro estamos del sentimiento
  newsType: NewsType;
  impactMagnitude: 'high' | 'medium' | 'low';
  sourceCredibility: number; // 0-100
}

export type NewsType = 
  | 'earnings'      // Resultados financieros
  | 'guidance'      // Previsiones de la empresa
  | 'analyst'       // Upgrades/downgrades de analistas
  | 'merger_acquisition' // M&A
  | 'product'       // Lanzamientos, innovación
  | 'legal'         // Demandas, multas, regulación
  | 'management'    // Cambios de ejecutivos
  | 'macro'         // Impacto macroeconómico
  | 'sector'        // Noticias del sector
  | 'general';      // Otras

export interface NewsSummary {
  items: NewsItem[];
  overallSentiment: 'positive' | 'negative' | 'neutral';
  sentimentScore: number;
  sentimentConfidence: number; // Qué tan fiable es nuestro análisis
  hasNews: boolean;
  newsCount: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  highImpactCount: number;
  summary: string;
  // Nuevo: breakdown por tipo
  byType: Record<NewsType, { count: number; avgSentiment: number }>;
  // Nuevo: señales claras detectadas
  signals: string[];
}

// ===== PALABRAS CLAVE MEJORADAS =====

// Palabras que indican alta magnitud de impacto
const HIGH_IMPACT_KEYWORDS = [
  'bankruptcy', 'fraud', 'sec investigation', 'ceo fired', 'ceo resigns',
  'massive', 'plunge', 'crash', 'soar', 'surge', 'record', 'historic',
  'beat estimates', 'miss estimates', 'guidance cut', 'guidance raise',
  'merger', 'acquisition', 'takeover', 'buyout',
  'fda approval', 'fda reject', 'patent', 'breakthrough',
  'recall', 'data breach', 'hack',
];

// Contexto que INVIERTE el sentimiento
const NEGATION_WORDS = [
  'not', 'no', "n't", 'never', 'neither', 'nobody', 'nothing',
  'fail to', 'unable to', 'decline to', 'refuse to',
  'despite', 'although', 'however', 'but',
];

// Contexto que REDUCE el sentimiento
const UNCERTAINTY_WORDS = [
  'may', 'might', 'could', 'possibly', 'potentially', 'rumor',
  'speculate', 'uncertain', 'unclear', 'if', 'should',
];

// Palabras positivas con peso
const POSITIVE_KEYWORDS: Record<string, number> = {
  // Earnings (muy alto impacto)
  'beats': 30, 'beat estimates': 35, 'exceeds': 30, 'exceeded expectations': 35,
  'record revenue': 40, 'record profit': 40, 'record earnings': 40,
  'raises guidance': 35, 'guidance raise': 35, 'outlook positive': 30,
  
  // Analyst actions
  'upgrade': 25, 'upgraded': 25, 'buy rating': 20, 'outperform': 20,
  'price target raise': 25, 'bullish': 15,
  
  // Growth
  'growth': 15, 'expansion': 15, 'expands': 15, 'growing': 12,
  'strong': 12, 'positive': 10, 'gains': 12, 'rises': 10, 'soars': 20,
  
  // M&A positivo
  'acquisition': 15, 'acquires': 15, 'merger': 12, 'partnership': 12,
  'deal': 10, 'agreement': 8,
  
  // Productos/Innovación
  'launch': 12, 'launches': 12, 'innovation': 15, 'breakthrough': 25,
  'patent': 12, 'fda approval': 35, 'approval': 15,
  
  // Shareholder value
  'dividend': 12, 'buyback': 12, 'share repurchase': 12,
  
  // Spanish
  'supera': 25, 'récord': 30, 'crecimiento': 15, 'sube': 10, 'positivo': 10,
};

// Palabras negativas con peso (generalmente pesan más que las positivas)
const NEGATIVE_KEYWORDS: Record<string, number> = {
  // Earnings (muy alto impacto negativo)
  'misses': -35, 'miss estimates': -40, 'disappoints': -30,
  'below expectations': -35, 'weak': -20,
  'cuts guidance': -40, 'guidance cut': -40, 'lowers outlook': -35,
  'profit warning': -40, 'revenue miss': -35,
  
  // Analyst actions
  'downgrade': -30, 'downgraded': -30, 'sell rating': -25, 'underperform': -25,
  'price target cut': -25, 'bearish': -15,
  
  // Legal/Regulatory (alto impacto)
  'lawsuit': -25, 'sued': -25, 'investigation': -30, 'sec investigation': -40,
  'fine': -20, 'fined': -20, 'penalty': -20, 'settlement': -15,
  'fraud': -45, 'scandal': -35, 'violation': -25,
  'antitrust': -25, 'blocked': -20, 'ban': -20, 'banned': -25,
  
  // Operational
  'recall': -30, 'recalls': -30, 'data breach': -35, 'hack': -30, 'hacked': -35,
  'layoffs': -20, 'layoff': -20, 'cuts jobs': -25, 'job cuts': -25,
  'restructuring': -15, 'cost cutting': -12,
  'ceo resigns': -30, 'ceo fired': -35, 'executive leaves': -20,
  
  // Financial distress
  'bankruptcy': -50, 'default': -45, 'debt crisis': -40,
  'loss': -15, 'losses': -18, 'deficit': -15,
  
  // Market action
  'decline': -15, 'declines': -15, 'falls': -15, 'drops': -18,
  'plunges': -30, 'crash': -35, 'tumbles': -25, 'sinks': -20,
  
  // Spanish
  'quiebra': -50, 'despidos': -25, 'pérdida': -20, 'multa': -20, 'baja': -15,
};

// Fuentes con credibilidad (0-100)
const SOURCE_CREDIBILITY: Record<string, number> = {
  'reuters': 95,
  'bloomberg': 95,
  'wall street journal': 90,
  'wsj': 90,
  'financial times': 90,
  'ft': 90,
  'cnbc': 85,
  'barron\'s': 85,
  'marketwatch': 80,
  'yahoo finance': 75,
  'seeking alpha': 70,
  'motley fool': 65,
  'investopedia': 70,
  'benzinga': 70,
  'thestreet': 70,
  'business insider': 75,
  'forbes': 75,
  'ap': 90,
  'associated press': 90,
  'afp': 85,
  // Default para fuentes desconocidas
  'default': 50,
};

// ===== CACHE =====
const cache = new Map<string, { data: NewsSummary; expiresAt: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutos

function getCached(key: string): NewsSummary | null {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  cache.delete(key);
  return null;
}

// ===== FUNCIONES DE ANÁLISIS =====

function getSourceCredibility(publisher: string): number {
  const normalizedPublisher = publisher.toLowerCase();
  for (const [source, credibility] of Object.entries(SOURCE_CREDIBILITY)) {
    if (normalizedPublisher.includes(source)) {
      return credibility;
    }
  }
  return SOURCE_CREDIBILITY['default'];
}

function detectNewsType(title: string): NewsType {
  const t = title.toLowerCase();
  
  if (/earnings|revenue|profit|eps|quarter|q[1-4]|fiscal|results/.test(t)) return 'earnings';
  if (/guidance|outlook|forecast|expect/.test(t)) return 'guidance';
  if (/upgrade|downgrade|rating|price target|analyst/.test(t)) return 'analyst';
  if (/merger|acquisition|acquire|buyout|takeover|deal/.test(t)) return 'merger_acquisition';
  if (/launch|product|release|patent|fda|approval|innovation/.test(t)) return 'product';
  if (/lawsuit|sue|fine|penalty|investigation|sec|regulat|antitrust/.test(t)) return 'legal';
  if (/ceo|cfo|executive|board|resign|appoint|hire|fire/.test(t)) return 'management';
  if (/fed|rate|inflation|gdp|economy|recession|employment/.test(t)) return 'macro';
  if (/industry|sector|market share|competitor/.test(t)) return 'sector';
  
  return 'general';
}

function detectImpactMagnitude(title: string, sentimentScore: number): 'high' | 'medium' | 'low' {
  const t = title.toLowerCase();
  
  // Palabras de alto impacto
  if (HIGH_IMPACT_KEYWORDS.some(kw => t.includes(kw))) {
    return 'high';
  }
  
  // Score extremo indica alto impacto
  if (Math.abs(sentimentScore) >= 30) {
    return 'high';
  }
  
  if (Math.abs(sentimentScore) >= 15) {
    return 'medium';
  }
  
  return 'low';
}

function hasNegationBefore(title: string, keywordIndex: number): boolean {
  // Buscar negaciones en las 3 palabras anteriores
  const beforeText = title.substring(Math.max(0, keywordIndex - 30), keywordIndex).toLowerCase();
  return NEGATION_WORDS.some(neg => beforeText.includes(neg));
}

function hasUncertainty(title: string): boolean {
  const t = title.toLowerCase();
  return UNCERTAINTY_WORDS.some(unc => t.includes(unc));
}

function analyzeSentiment(title: string): { score: number; confidence: number } {
  const t = title.toLowerCase();
  let score = 0;
  let matchCount = 0;
  
  // Buscar palabras positivas
  for (const [keyword, weight] of Object.entries(POSITIVE_KEYWORDS)) {
    const index = t.indexOf(keyword);
    if (index !== -1) {
      let adjustedWeight = weight;
      
      // Verificar negación
      if (hasNegationBefore(t, index)) {
        adjustedWeight = -adjustedWeight * 0.8; // Invertir pero reducir un poco
      }
      
      score += adjustedWeight;
      matchCount++;
    }
  }
  
  // Buscar palabras negativas
  for (const [keyword, weight] of Object.entries(NEGATIVE_KEYWORDS)) {
    const index = t.indexOf(keyword);
    if (index !== -1) {
      let adjustedWeight = weight;
      
      // Verificar negación (convierte negativo en menos negativo)
      if (hasNegationBefore(t, index)) {
        adjustedWeight = -adjustedWeight * 0.5; // Invertir parcialmente
      }
      
      score += adjustedWeight;
      matchCount++;
    }
  }
  
  // Reducir score si hay incertidumbre
  if (hasUncertainty(t)) {
    score *= 0.6;
  }
  
  // Limitar score
  score = Math.max(-100, Math.min(100, score));
  
  // Calcular confianza basada en número de matches y claridad
  let confidence = 30; // Base
  if (matchCount >= 3) confidence = 80;
  else if (matchCount >= 2) confidence = 65;
  else if (matchCount >= 1) confidence = 50;
  
  // Reducir confianza si hay incertidumbre
  if (hasUncertainty(t)) {
    confidence *= 0.7;
  }
  
  return { score: Math.round(score), confidence: Math.round(confidence) };
}

// ===== SERVICIO EXPORTADO =====

export const newsService = {
  async getNews(symbol: string, type: 'stock' | 'crypto' = 'stock'): Promise<NewsSummary> {
    const cacheKey = `news:${symbol}:${type}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
      logger.info(`[News] Getting news for ${symbol}`);
      
      const searchTerm = this.getSearchTerm(symbol, type);
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(searchTerm)}&newsCount=15&quotesCount=0`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        signal: AbortSignal.timeout(10000),
      });
      
      if (!response.ok) {
        throw new Error(`Yahoo API error: ${response.status}`);
      }
      
      const data: any = await response.json();
      const newsItems = data.news || [];
      
      if (newsItems.length === 0) {
        return this.createEmptySummary();
      }
      
      const processedNews = newsItems.map((item: any) => this.processNewsItem(item));
      const summary = this.createSummary(processedNews);
      
      cache.set(cacheKey, { data: summary, expiresAt: Date.now() + CACHE_TTL });
      
      logger.info(`[News] ${summary.newsCount} news. Sentiment: ${summary.overallSentiment} (${summary.sentimentScore}, conf: ${summary.sentimentConfidence}%). High impact: ${summary.highImpactCount}`);
      
      return summary;
    } catch (error: any) {
      logger.error(`[News] Error getting news for ${symbol}:`, error.message);
      return this.createEmptySummary();
    }
  },

  getSearchTerm(symbol: string, type: 'stock' | 'crypto'): string {
    if (type === 'crypto') {
      const cryptoNames: Record<string, string> = {
        'BTC-EUR': 'Bitcoin', 'BTC-USD': 'Bitcoin',
        'ETH-EUR': 'Ethereum', 'ETH-USD': 'Ethereum',
        'SOL-EUR': 'Solana', 'SOL-USD': 'Solana',
        'XRP-EUR': 'Ripple XRP', 'ADA-EUR': 'Cardano',
        'DOGE-EUR': 'Dogecoin',
      };
      return cryptoNames[symbol] || symbol.split('-')[0];
    }
    return symbol;
  },

  processNewsItem(item: any): NewsItem {
    const title = item.title || '';
    const publisher = item.publisher || 'Unknown';
    const publishedAt = item.providerPublishTime
      ? new Date(item.providerPublishTime * 1000)
      : new Date();
    
    const { score, confidence } = analyzeSentiment(title);
    const sourceCredibility = getSourceCredibility(publisher);
    const newsType = detectNewsType(title);
    const impactMagnitude = detectImpactMagnitude(title, score);
    
    let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
    if (score >= 12) sentiment = 'positive';
    else if (score <= -12) sentiment = 'negative';
    
    return {
      title,
      publisher,
      link: item.link || '',
      publishedAt,
      sentiment,
      sentimentScore: score,
      confidence,
      newsType,
      impactMagnitude,
      sourceCredibility,
    };
  },

  createSummary(items: NewsItem[]): NewsSummary {
    const positiveNews = items.filter(n => n.sentiment === 'positive');
    const negativeNews = items.filter(n => n.sentiment === 'negative');
    const neutralNews = items.filter(n => n.sentiment === 'neutral');
    const highImpactNews = items.filter(n => n.impactMagnitude === 'high');
    
    // Promedio ponderado por:
    // 1. Recencia (noticias más recientes pesan más)
    // 2. Credibilidad de la fuente
    // 3. Magnitud del impacto
    // 4. Confianza del análisis
    let totalScore = 0;
    let totalWeight = 0;
    let totalConfidence = 0;
    const now = Date.now();
    
    for (const item of items) {
      // Factor de recencia: decae exponencialmente
      const ageHours = (now - item.publishedAt.getTime()) / (1000 * 60 * 60);
      const recencyWeight = Math.exp(-ageHours / 48); // Mitad de peso a las 48h
      
      // Factor de credibilidad (0.5 a 1.0)
      const credibilityWeight = 0.5 + (item.sourceCredibility / 200);
      
      // Factor de impacto
      const impactWeight = item.impactMagnitude === 'high' ? 1.5 :
                          item.impactMagnitude === 'medium' ? 1.0 : 0.6;
      
      const weight = recencyWeight * credibilityWeight * impactWeight;
      
      totalScore += item.sentimentScore * weight;
      totalWeight += weight;
      totalConfidence += item.confidence * weight;
    }
    
    const avgScore = totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;
    const avgConfidence = totalWeight > 0 ? Math.round(totalConfidence / totalWeight) : 0;
    
    // Ajustar confianza por cantidad de noticias
    let finalConfidence = avgConfidence;
    if (items.length >= 5) finalConfidence = Math.min(95, finalConfidence + 15);
    else if (items.length >= 3) finalConfidence = Math.min(90, finalConfidence + 10);
    else if (items.length <= 1) finalConfidence = Math.max(20, finalConfidence - 20);
    
    let overallSentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
    if (avgScore >= 12) overallSentiment = 'positive';
    else if (avgScore <= -12) overallSentiment = 'negative';
    
    // Breakdown por tipo
    const byType = this.calculateByType(items);
    
    // Generar señales
    const signals = this.generateSignals(items, avgScore, positiveNews.length, negativeNews.length, highImpactNews);
    
    const summary = this.generateSummaryText(
      positiveNews.length, negativeNews.length, 
      overallSentiment, avgScore, highImpactNews, signals
    );
    
    return {
      items,
      overallSentiment,
      sentimentScore: avgScore,
      sentimentConfidence: finalConfidence,
      hasNews: items.length > 0,
      newsCount: items.length,
      positiveCount: positiveNews.length,
      negativeCount: negativeNews.length,
      neutralCount: neutralNews.length,
      highImpactCount: highImpactNews.length,
      summary,
      byType,
      signals,
    };
  },

  calculateByType(items: NewsItem[]): Record<NewsType, { count: number; avgSentiment: number }> {
    const types: NewsType[] = ['earnings', 'guidance', 'analyst', 'merger_acquisition', 
                               'product', 'legal', 'management', 'macro', 'sector', 'general'];
    
    const result: Record<NewsType, { count: number; avgSentiment: number }> = {} as any;
    
    for (const type of types) {
      const typeItems = items.filter(i => i.newsType === type);
      result[type] = {
        count: typeItems.length,
        avgSentiment: typeItems.length > 0 
          ? Math.round(typeItems.reduce((sum, i) => sum + i.sentimentScore, 0) / typeItems.length)
          : 0,
      };
    }
    
    return result;
  },

  generateSignals(
    items: NewsItem[], 
    avgScore: number,
    positiveCount: number,
    negativeCount: number,
    highImpactNews: NewsItem[]
  ): string[] {
    const signals: string[] = [];
    
    // Señales de alto impacto
    const highImpactNegative = highImpactNews.filter(n => n.sentiment === 'negative');
    const highImpactPositive = highImpactNews.filter(n => n.sentiment === 'positive');
    
    if (highImpactNegative.length >= 2) {
      signals.push(`⚠️ ${highImpactNegative.length} noticias negativas de alto impacto`);
    } else if (highImpactNegative.length === 1) {
      signals.push(`⚠️ Noticia negativa importante: ${highImpactNegative[0].title.substring(0, 50)}...`);
    }
    
    if (highImpactPositive.length >= 2) {
      signals.push(`✅ ${highImpactPositive.length} noticias positivas de alto impacto`);
    } else if (highImpactPositive.length === 1) {
      signals.push(`✅ Noticia positiva importante: ${highImpactPositive[0].title.substring(0, 50)}...`);
    }
    
    // Señales por tipo
    const earningsNews = items.filter(i => i.newsType === 'earnings');
    if (earningsNews.length > 0) {
      const earningsAvg = earningsNews.reduce((sum, i) => sum + i.sentimentScore, 0) / earningsNews.length;
      if (earningsAvg >= 20) {
        signals.push('📈 Resultados financieros positivos');
      } else if (earningsAvg <= -20) {
        signals.push('📉 Resultados financieros decepcionantes');
      }
    }
    
    const analystNews = items.filter(i => i.newsType === 'analyst');
    if (analystNews.length > 0) {
      const analystAvg = analystNews.reduce((sum, i) => sum + i.sentimentScore, 0) / analystNews.length;
      if (analystAvg >= 15) {
        signals.push('📊 Analistas optimistas');
      } else if (analystAvg <= -15) {
        signals.push('📊 Analistas pesimistas');
      }
    }
    
    const legalNews = items.filter(i => i.newsType === 'legal' && i.sentiment === 'negative');
    if (legalNews.length > 0) {
      signals.push('⚖️ Problemas legales/regulatorios detectados');
    }
    
    // Señal de consenso
    if (positiveCount >= 4 && negativeCount === 0) {
      signals.push('🟢 Consenso muy positivo en noticias');
    } else if (negativeCount >= 4 && positiveCount === 0) {
      signals.push('🔴 Consenso muy negativo en noticias');
    } else if (positiveCount >= 3 && negativeCount >= 3) {
      signals.push('⚡ Noticias mixtas - alta incertidumbre');
    }
    
    return signals;
  },

  generateSummaryText(
    positive: number, 
    negative: number, 
    sentiment: string, 
    score: number,
    highImpactNews: NewsItem[],
    signals: string[]
  ): string {
    if (positive === 0 && negative === 0) {
      return 'Noticias neutrales, sin impacto significativo esperado.';
    }
    
    let base = '';
    
    if (sentiment === 'positive') {
      if (score >= 30) {
        base = `Sentimiento muy positivo (${positive} noticias favorables). Score: +${score}.`;
      } else {
        base = `Sentimiento moderadamente positivo. ${positive} de ${positive + negative} noticias favorables.`;
      }
    } else if (sentiment === 'negative') {
      if (score <= -30) {
        base = `Sentimiento muy negativo (${negative} noticias desfavorables). Score: ${score}.`;
      } else {
        base = `Sentimiento moderadamente negativo. ${negative} de ${positive + negative} noticias desfavorables.`;
      }
    } else {
      base = `Sentimiento mixto: ${positive} positivas, ${negative} negativas.`;
    }
    
    // Añadir info de alto impacto si existe
    if (highImpactNews.length > 0) {
      base += ` ${highImpactNews.length} noticia(s) de alto impacto.`;
    }
    
    return base;
  },

  createEmptySummary(): NewsSummary {
    return {
      items: [],
      overallSentiment: 'neutral',
      sentimentScore: 0,
      sentimentConfidence: 0,
      hasNews: false,
      newsCount: 0,
      positiveCount: 0,
      negativeCount: 0,
      neutralCount: 0,
      highImpactCount: 0,
      summary: 'No se encontraron noticias recientes.',
      byType: {
        earnings: { count: 0, avgSentiment: 0 },
        guidance: { count: 0, avgSentiment: 0 },
        analyst: { count: 0, avgSentiment: 0 },
        merger_acquisition: { count: 0, avgSentiment: 0 },
        product: { count: 0, avgSentiment: 0 },
        legal: { count: 0, avgSentiment: 0 },
        management: { count: 0, avgSentiment: 0 },
        macro: { count: 0, avgSentiment: 0 },
        sector: { count: 0, avgSentiment: 0 },
        general: { count: 0, avgSentiment: 0 },
      },
      signals: [],
    };
  },
};
