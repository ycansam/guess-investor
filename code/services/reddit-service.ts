/**
 * Servicio para obtener posts populares de Reddit
 * Subreddits: r/wallstreetbets, r/stocks, r/CryptoCurrency
 */

import { fetchWithCorsProxy } from './cors-proxy';

interface RedditPost {
  title: string;
  score: number;
  numComments: number;
  author: string;
  subreddit: string;
  url: string;
  createdAt: Date;
  flair?: string;
}

interface RedditSentiment {
  subreddit: string;
  posts: RedditPost[];
  hotTopics: string[];
  timestamp: Date;
}

type SubredditType = 'wallstreetbets' | 'stocks' | 'CryptoCurrency' | 'investing';

class RedditService {
  private readonly SUBREDDITS: Record<string, SubredditType[]> = {
    stock: ['wallstreetbets', 'stocks', 'investing'],
    crypto: ['CryptoCurrency', 'wallstreetbets'],
  };

  /**
   * Obtiene posts populares de un subreddit
   */
  async getHotPosts(subreddit: SubredditType, limit: number = 10): Promise<RedditPost[]> {
    try {
      console.log(`[Reddit] Obteniendo posts de r/${subreddit}`);

      const redditUrl = `https://www.reddit.com/r/${subreddit}/hot.json?limit=${limit}`;
      const response = await fetchWithCorsProxy(redditUrl);

      if (!response.ok) {
        throw new Error(`Error ${response.status}`);
      }

      const data = await response.json();
      const posts = data.data?.children || [];

      return posts
        .filter((post: any) => !post.data.stickied) // Excluir posts fijados
        .map((post: any) => ({
          title: post.data.title,
          score: post.data.score,
          numComments: post.data.num_comments,
          author: post.data.author,
          subreddit: post.data.subreddit,
          url: `https://reddit.com${post.data.permalink}`,
          createdAt: new Date(post.data.created_utc * 1000),
          flair: post.data.link_flair_text,
        }));
    } catch (error: any) {
      console.error(`[Reddit] Error en r/${subreddit}:`, error.message);
      return [];
    }
  }

  /**
   * Busca menciones de un símbolo en subreddits
   */
  async searchSymbol(symbol: string, type: 'stock' | 'crypto' = 'stock'): Promise<RedditSentiment> {
    const subreddits = this.SUBREDDITS[type];
    const allPosts: RedditPost[] = [];

    // Obtener posts de cada subreddit relevante
    for (const subreddit of subreddits) {
      const posts = await this.getHotPosts(subreddit, 25);
      
      // Filtrar posts que mencionen el símbolo
      const relevantPosts = posts.filter(post => 
        this.postMentionsSymbol(post, symbol)
      );
      
      allPosts.push(...relevantPosts);
    }

    // Ordenar por score
    allPosts.sort((a, b) => b.score - a.score);

    // Extraer temas calientes
    const hotTopics = this.extractHotTopics(allPosts);

    return {
      subreddit: subreddits.join(', '),
      posts: allPosts.slice(0, 10),
      hotTopics,
      timestamp: new Date(),
    };
  }

  /**
   * Obtiene el sentimiento general de los subreddits financieros
   */
  async getGeneralSentiment(type: 'stock' | 'crypto' = 'stock'): Promise<RedditSentiment> {
    const mainSubreddit = type === 'crypto' ? 'CryptoCurrency' : 'wallstreetbets';
    const posts = await this.getHotPosts(mainSubreddit as SubredditType, 25);

    return {
      subreddit: mainSubreddit,
      posts: posts.slice(0, 10),
      hotTopics: this.extractHotTopics(posts),
      timestamp: new Date(),
    };
  }

  /**
   * Verifica si un post menciona un símbolo
   */
  private postMentionsSymbol(post: RedditPost, symbol: string): boolean {
    const cleanSymbol = symbol.split('.')[0].split('-')[0].toUpperCase();
    const title = post.title.toUpperCase();
    
    // Buscar símbolo con $ (común en WSB)
    if (title.includes(`$${cleanSymbol}`)) return true;
    
    // Buscar símbolo como palabra completa
    const regex = new RegExp(`\\b${cleanSymbol}\\b`, 'i');
    return regex.test(post.title);
  }

  /**
   * Extrae los tickers más mencionados
   */
  private extractHotTopics(posts: RedditPost[]): string[] {
    const tickerRegex = /\$([A-Z]{2,5})\b/g;
    const mentions: Record<string, number> = {};

    posts.forEach(post => {
      const matches = post.title.match(tickerRegex);
      if (matches) {
        matches.forEach(ticker => {
          const clean = ticker.replace('$', '');
          mentions[clean] = (mentions[clean] || 0) + 1;
        });
      }
    });

    // Ordenar por menciones y devolver top 5
    return Object.entries(mentions)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([ticker]) => ticker);
  }

  /**
   * Formatea los datos para incluir en el prompt de la IA
   */
  formatForAI(data: RedditSentiment, symbol?: string): string {
    let output = `
🔥 REDDIT - ${symbol ? `Menciones de ${symbol}` : `Tendencias en r/${data.subreddit}`}:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

    if (data.hotTopics.length > 0) {
      output += `📈 Tickers más mencionados: ${data.hotTopics.map(t => `$${t}`).join(', ')}\n\n`;
    }

    if (data.posts.length > 0) {
      output += `📝 Posts populares:\n`;
      data.posts.slice(0, 5).forEach((post, i) => {
        const sentiment = this.detectPostSentiment(post.title);
        output += `${i + 1}. ${sentiment} [${post.score}⬆️] "${post.title.slice(0, 80)}${post.title.length > 80 ? '...' : ''}" (r/${post.subreddit})\n`;
      });
    } else {
      output += `ℹ️ No se encontraron posts relevantes\n`;
    }

    return output;
  }

  /**
   * Detecta sentimiento básico del título
   */
  private detectPostSentiment(title: string): string {
    const bullishWords = ['moon', 'rocket', 'buy', 'bull', 'gains', 'up', 'long', '🚀', '💎', '🐂'];
    const bearishWords = ['crash', 'sell', 'bear', 'down', 'short', 'loss', 'dump', '📉', '🐻'];
    
    const lowerTitle = title.toLowerCase();
    
    const bullishCount = bullishWords.filter(w => lowerTitle.includes(w)).length;
    const bearishCount = bearishWords.filter(w => lowerTitle.includes(w)).length;
    
    if (bullishCount > bearishCount) return '🐂';
    if (bearishCount > bullishCount) return '🐻';
    return '💬';
  }
}

export const redditService = new RedditService();
