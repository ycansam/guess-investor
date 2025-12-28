/**
 * News Service
 * Obtiene y analiza noticias financieras usando Yahoo Finance Search
 */

import { logger } from '../../middleware/logger.js';

export interface NewsItem {
  title: string;
  publisher: string;
  link: string;
  publishedAt: Date;
  sentiment: 'positive' | 'negative' | 'neutral';
  sentimentScore: number;
}

export interface NewsSummary {
  items: NewsItem[];
  overallSentiment: 'positive' | 'negative' | 'neutral';
  sentimentScore: number;
  hasNews: boolean;
  newsCount: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  summary: string;
}

// Palabras clave para sentimiento
const POSITIVE_KEYWORDS = [
  'growth', 'expansion', 'expands', 'launch', 'launches', 'record', 'surge', 'surges',
  'beats', 'exceeds', 'outperform', 'strong', 'positive', 'profit', 'gains', 'rises', 'soars',
  'upgrade', 'upgraded', 'buy rating', 'bullish', 'optimistic', 'success',
  'partnership', 'deal', 'acquisition', 'acquires', 'merger', 'invests',
  'dividend', 'buyback', 'innovation', 'breakthrough', 'patent', 'award',
  'crecimiento', 'expansión', 'récord', 'supera', 'positivo', 'beneficio', 'sube',
];

const NEGATIVE_KEYWORDS = [
  'recall', 'recalls', 'lawsuit', 'sued', 'fine', 'fined', 'penalty', 'investigation',
  'scandal', 'fraud', 'violation', 'breach', 'hack', 'hacked', 'data breach',
  'misses', 'miss', 'disappoints', 'weak', 'decline', 'declines', 'falls', 'drops', 'plunges',
  'loss', 'losses', 'deficit', 'downgrade', 'downgraded', 'sell rating', 'bearish',
  'layoffs', 'layoff', 'cuts jobs', 'job cuts', 'restructuring', 'ceo resigns',
  'bankruptcy', 'default', 'debt crisis', 'warning', 'warns', 'concern',
  'shutdown', 'closes', 'closing stores', 'ban', 'banned', 'antitrust', 'blocked',
  'quiebra', 'despidos', 'pérdida', 'bajista', 'cierra', 'multa',
];

// Cache
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

export const newsService = {
  async getNews(symbol: string, type: 'stock' | 'crypto' = 'stock'): Promise<NewsSummary> {
    const cacheKey = `news:${symbol}:${type}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
      logger.info(`[News] Getting news for ${symbol}`);
      
      const searchTerm = this.getSearchTerm(symbol, type);
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(searchTerm)}&newsCount=10&quotesCount=0`;
      
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
      
      logger.info(`[News] ${summary.newsCount} news found. Sentiment: ${summary.overallSentiment} (${summary.sentimentScore})`);
      
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
    const title = (item.title || '').toLowerCase();
    const publishedAt = item.providerPublishTime
      ? new Date(item.providerPublishTime * 1000)
      : new Date();
    
    let score = 0;
    
    // Buscar palabras positivas
    for (const keyword of POSITIVE_KEYWORDS) {
      if (title.includes(keyword.toLowerCase())) {
        score += 20;
      }
    }
    
    // Buscar palabras negativas (pesan más)
    for (const keyword of NEGATIVE_KEYWORDS) {
      if (title.includes(keyword.toLowerCase())) {
        score -= 25;
      }
    }
    
    // Limitar score
    score = Math.max(-100, Math.min(100, score));
    
    let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
    if (score >= 15) sentiment = 'positive';
    else if (score <= -15) sentiment = 'negative';
    
    return {
      title: item.title || '',
      publisher: item.publisher || 'Unknown',
      link: item.link || '',
      publishedAt,
      sentiment,
      sentimentScore: score,
    };
  },

  createSummary(items: NewsItem[]): NewsSummary {
    const positiveNews = items.filter(n => n.sentiment === 'positive');
    const negativeNews = items.filter(n => n.sentiment === 'negative');
    const neutralNews = items.filter(n => n.sentiment === 'neutral');
    
    // Promedio ponderado (noticias más recientes pesan más)
    let totalScore = 0;
    let totalWeight = 0;
    const now = Date.now();
    
    for (const item of items) {
      const ageHours = (now - item.publishedAt.getTime()) / (1000 * 60 * 60);
      const weight = Math.max(0.1, 1 - (ageHours / 168)); // Decae en una semana
      totalScore += item.sentimentScore * weight;
      totalWeight += weight;
    }
    
    const avgScore = totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;
    
    let overallSentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
    if (avgScore >= 15) overallSentiment = 'positive';
    else if (avgScore <= -15) overallSentiment = 'negative';
    
    const summary = this.generateSummaryText(positiveNews.length, negativeNews.length, overallSentiment, avgScore);
    
    return {
      items,
      overallSentiment,
      sentimentScore: avgScore,
      hasNews: items.length > 0,
      newsCount: items.length,
      positiveCount: positiveNews.length,
      negativeCount: negativeNews.length,
      neutralCount: neutralNews.length,
      summary,
    };
  },

  generateSummaryText(positive: number, negative: number, sentiment: string, score: number): string {
    if (positive === 0 && negative === 0) {
      return 'Noticias neutrales, sin impacto significativo esperado.';
    }
    
    if (sentiment === 'positive') {
      return `${positive} noticias positivas dominan. Score: +${score}. Posible impulso alcista.`;
    }
    
    if (sentiment === 'negative') {
      return `${negative} noticias negativas dominan. Score: ${score}. Posible presión bajista.`;
    }
    
    return `Sentimiento mixto: ${positive} positivas, ${negative} negativas.`;
  },

  createEmptySummary(): NewsSummary {
    return {
      items: [],
      overallSentiment: 'neutral',
      sentimentScore: 0,
      hasNews: false,
      newsCount: 0,
      positiveCount: 0,
      negativeCount: 0,
      neutralCount: 0,
      summary: 'No se encontraron noticias recientes.',
    };
  },
};
