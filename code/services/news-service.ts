/**
 * Servicio para obtener noticias de empresas/criptos
 * Usa Yahoo Finance Search API para obtener noticias recientes
 * Analiza el sentimiento de los títulos para determinar impacto
 */

import { fetchWithCorsProxy } from './cors-proxy';

export interface NewsItem {
  title: string;
  publisher: string;
  link: string;
  publishedAt: Date;
  sentiment: 'positive' | 'negative' | 'neutral';
  sentimentScore: number; // -100 a +100
}

export interface NewsSummary {
  items: NewsItem[];
  overallSentiment: 'positive' | 'negative' | 'neutral';
  sentimentScore: number; // -100 a +100 (promedio ponderado)
  hasNews: boolean;
  newsCount: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  summary: string;
}

// Palabras clave para análisis de sentimiento de noticias financieras
const POSITIVE_KEYWORDS = [
  // Crecimiento y expansión
  'growth', 'expansion', 'expands', 'opens', 'launch', 'launches', 'new store', 'new market',
  'revenue growth', 'profit growth', 'sales growth', 'record', 'all-time high', 'surge', 'surges',
  'crecimiento', 'expansión', 'abre', 'lanza', 'nueva tienda', 'nuevo mercado', 'récord',
  
  // Resultados positivos
  'beats', 'exceeds', 'outperform', 'strong', 'positive', 'profit', 'gains', 'rises', 'soars',
  'upgrade', 'upgraded', 'buy rating', 'bullish', 'optimistic', 'success', 'successful',
  'supera', 'positivo', 'beneficio', 'sube', 'alcista', 'éxito',
  
  // Acuerdos y adquisiciones positivas
  'partnership', 'deal', 'acquisition', 'acquires', 'merger', 'invests', 'investment',
  'acuerdo', 'adquisición', 'inversión',
  
  // Dividendos y retornos
  'dividend', 'buyback', 'share repurchase', 'returns to shareholders',
  'dividendo', 'recompra',
  
  // Innovación
  'innovation', 'breakthrough', 'patent', 'award', 'recognition',
  'innovación', 'patente', 'premio',
];

const NEGATIVE_KEYWORDS = [
  // Problemas operativos
  'recall', 'recalls', 'lawsuit', 'sued', 'fine', 'fined', 'penalty', 'investigation',
  'scandal', 'fraud', 'violation', 'breach', 'hack', 'hacked', 'data breach',
  'retirada', 'demanda', 'multa', 'investigación', 'escándalo', 'fraude',
  
  // Resultados negativos
  'misses', 'miss', 'disappoints', 'weak', 'decline', 'declines', 'falls', 'drops', 'plunges',
  'loss', 'losses', 'deficit', 'downgrade', 'downgraded', 'sell rating', 'bearish',
  'decepciona', 'débil', 'caída', 'cae', 'pérdida', 'bajista',
  
  // Problemas de personal/gestión
  'layoffs', 'layoff', 'cuts jobs', 'job cuts', 'restructuring', 'ceo resigns', 'cfo leaves',
  'departure', 'fired', 'ousted',
  'despidos', 'recortes', 'reestructuración', 'dimite', 'renuncia',
  
  // Problemas de mercado
  'bankruptcy', 'default', 'debt crisis', 'warning', 'warns', 'concern', 'concerns',
  'shutdown', 'closes', 'closing stores', 'store closures',
  'quiebra', 'impago', 'crisis', 'alerta', 'cierra', 'cierre',
  
  // Regulación negativa
  'ban', 'banned', 'regulation', 'antitrust', 'blocked',
  'prohibición', 'regulación', 'bloqueado',
];

// Palabras que indican volatilidad (ni positivo ni negativo claro)
const VOLATILITY_KEYWORDS = [
  'ceo change', 'new ceo', 'management change', 'restructure', 'spin-off', 'split',
  'earnings', 'results', 'guidance', 'outlook', 'forecast',
  'cambio ceo', 'nuevo ceo', 'resultados', 'previsiones',
];

// Caché de noticias
interface CacheEntry {
  data: NewsSummary;
  timestamp: number;
}
const newsCache = new Map<string, CacheEntry>();
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutos (noticias cambian menos)

class NewsService {
  /**
   * Obtiene noticias recientes para un símbolo
   */
  async getNews(symbol: string, type: 'stock' | 'crypto'): Promise<NewsSummary> {
    // Verificar caché
    const cacheKey = `${symbol}-${type}`;
    const cached = newsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`[News] Usando caché para ${symbol}`);
      return cached.data;
    }

    try {
      console.log(`[News] Obteniendo noticias para ${symbol}`);
      
      // Usar Yahoo Finance Search API para obtener noticias
      const searchTerm = this.getSearchTerm(symbol, type);
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(searchTerm)}&newsCount=10&quotesCount=0`;
      
      const response = await fetchWithCorsProxy(url, {
        signal: AbortSignal.timeout(10000),
      });
      
      const data = await response.json();
      const newsItems = data.news || [];
      
      if (newsItems.length === 0) {
        console.log(`[News] No se encontraron noticias para ${symbol}`);
        return this.createEmptySummary();
      }
      
      // Procesar noticias
      const processedNews = newsItems.map((item: any) => this.processNewsItem(item));
      const summary = this.createSummary(processedNews);
      
      // Guardar en caché
      newsCache.set(cacheKey, { data: summary, timestamp: Date.now() });
      
      console.log(`[News] ${summary.newsCount} noticias encontradas. Sentimiento: ${summary.overallSentiment} (${summary.sentimentScore})`);
      
      return summary;
      
    } catch (error: any) {
      console.error(`[News] Error obteniendo noticias para ${symbol}:`, error.message);
      return this.createEmptySummary();
    }
  }

  /**
   * Determina el término de búsqueda según el tipo de activo
   */
  private getSearchTerm(symbol: string, type: 'stock' | 'crypto'): string {
    if (type === 'crypto') {
      // Para crypto, buscar por nombre
      const cryptoNames: Record<string, string> = {
        'BTC-EUR': 'Bitcoin',
        'BTC-USD': 'Bitcoin',
        'ETH-EUR': 'Ethereum',
        'ETH-USD': 'Ethereum',
        'SOL-EUR': 'Solana',
        'XRP-EUR': 'Ripple XRP',
        'ADA-EUR': 'Cardano',
        'DOGE-EUR': 'Dogecoin',
      };
      return cryptoNames[symbol] || symbol.split('-')[0];
    }
    
    // Para acciones, usar el símbolo directamente
    return symbol;
  }

  /**
   * Procesa un item de noticia y calcula su sentimiento
   */
  private processNewsItem(item: any): NewsItem {
    const title = (item.title || '').toLowerCase();
    const publishedAt = item.providerPublishTime 
      ? new Date(item.providerPublishTime * 1000) 
      : new Date();
    
    // Calcular sentimiento basado en palabras clave
    let score = 0;
    let matchedPositive = 0;
    let matchedNegative = 0;
    
    // Buscar palabras positivas
    for (const keyword of POSITIVE_KEYWORDS) {
      if (title.includes(keyword.toLowerCase())) {
        score += 20;
        matchedPositive++;
      }
    }
    
    // Buscar palabras negativas
    for (const keyword of NEGATIVE_KEYWORDS) {
      if (title.includes(keyword.toLowerCase())) {
        score -= 25; // Negativas pesan más (el mercado reacciona más a malas noticias)
        matchedNegative++;
      }
    }
    
    // Buscar palabras de volatilidad (reducir certeza)
    for (const keyword of VOLATILITY_KEYWORDS) {
      if (title.includes(keyword.toLowerCase())) {
        score = score * 0.5; // Reducir impacto si hay incertidumbre
      }
    }
    
    // Limitar score a -100 a +100
    score = Math.max(-100, Math.min(100, score));
    
    // Determinar sentimiento
    let sentiment: 'positive' | 'negative' | 'neutral';
    if (score > 10) {
      sentiment = 'positive';
    } else if (score < -10) {
      sentiment = 'negative';
    } else {
      sentiment = 'neutral';
    }
    
    return {
      title: item.title || '',
      publisher: item.publisher || 'Unknown',
      link: item.link || '',
      publishedAt,
      sentiment,
      sentimentScore: score,
    };
  }

  /**
   * Crea un resumen de todas las noticias
   */
  private createSummary(items: NewsItem[]): NewsSummary {
    if (items.length === 0) {
      return this.createEmptySummary();
    }
    
    const positiveItems = items.filter(i => i.sentiment === 'positive');
    const negativeItems = items.filter(i => i.sentiment === 'negative');
    const neutralItems = items.filter(i => i.sentiment === 'neutral');
    
    // Calcular score ponderado (noticias más recientes pesan más)
    const now = Date.now();
    let weightedScore = 0;
    let totalWeight = 0;
    
    items.forEach((item, index) => {
      // Peso basado en posición (primeras noticias son más relevantes)
      const positionWeight = 1 / (index + 1);
      
      // Peso basado en antigüedad (últimas 24h pesan más)
      const ageHours = (now - item.publishedAt.getTime()) / (1000 * 60 * 60);
      const ageWeight = ageHours < 24 ? 1.5 : ageHours < 72 ? 1.0 : 0.5;
      
      const weight = positionWeight * ageWeight;
      weightedScore += item.sentimentScore * weight;
      totalWeight += weight;
    });
    
    const avgScore = totalWeight > 0 ? weightedScore / totalWeight : 0;
    
    // Determinar sentimiento general
    let overallSentiment: 'positive' | 'negative' | 'neutral';
    if (avgScore > 15) {
      overallSentiment = 'positive';
    } else if (avgScore < -15) {
      overallSentiment = 'negative';
    } else {
      overallSentiment = 'neutral';
    }
    
    // Generar resumen textual
    const summary = this.generateSummaryText(items, overallSentiment, avgScore);
    
    return {
      items,
      overallSentiment,
      sentimentScore: Math.round(avgScore),
      hasNews: true,
      newsCount: items.length,
      positiveCount: positiveItems.length,
      negativeCount: negativeItems.length,
      neutralCount: neutralItems.length,
      summary,
    };
  }

  /**
   * Genera texto de resumen para mostrar en UI
   */
  private generateSummaryText(
    items: NewsItem[], 
    sentiment: 'positive' | 'negative' | 'neutral',
    score: number
  ): string {
    const recentNews = items.slice(0, 3);
    
    let intro = '';
    if (sentiment === 'positive') {
      intro = '📰 Noticias recientes positivas: ';
    } else if (sentiment === 'negative') {
      intro = '📰 Noticias recientes negativas: ';
    } else {
      intro = '📰 Noticias recientes mixtas: ';
    }
    
    const headlines = recentNews.map(n => n.title).join(' | ');
    
    return intro + headlines.substring(0, 200) + (headlines.length > 200 ? '...' : '');
  }

  /**
   * Crea un resumen vacío cuando no hay noticias
   */
  private createEmptySummary(): NewsSummary {
    return {
      items: [],
      overallSentiment: 'neutral',
      sentimentScore: 0,
      hasNews: false,
      newsCount: 0,
      positiveCount: 0,
      negativeCount: 0,
      neutralCount: 0,
      summary: '',
    };
  }
  
  /**
   * Formatea las noticias para mostrar en la UI de predicción
   */
  formatForDisplay(summary: NewsSummary): string {
    if (!summary.hasNews) {
      return 'Sin noticias recientes';
    }
    
    const emoji = summary.overallSentiment === 'positive' ? '📈' :
                  summary.overallSentiment === 'negative' ? '📉' : '📊';
    
    return `${emoji} ${summary.newsCount} noticias (${summary.positiveCount}+ / ${summary.negativeCount}-)`;
  }
}

export const newsService = new NewsService();
