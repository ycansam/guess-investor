/**
 * Servicio unificado de sentimiento de mercado
 * Combina datos de StockTwits, Fear & Greed Index y Reddit
 */

import { fearGreedService } from './fear-greed-service';
import { redditService } from './reddit-service';
import { stocktwitsService } from './stocktwits-service';

export interface MarketSentiment {
  symbol?: string;
  type: 'stock' | 'crypto';
  stocktwits: string | null;
  fearGreed: string | null;
  reddit: string | null;
  summary: string;
  timestamp: Date;
}

class SentimentService {
  /**
   * Obtiene el sentimiento completo para un activo
   */
  async getSentimentForAsset(symbol: string, type: 'stock' | 'crypto' = 'stock'): Promise<MarketSentiment> {
    console.log(`[Sentiment] Obteniendo sentimiento para ${symbol} (${type})`);

    const results = await Promise.allSettled([
      this.getStockTwitsSentiment(symbol),
      type === 'crypto' ? this.getFearGreedSentiment() : Promise.resolve(null),
      this.getRedditSentiment(symbol, type),
    ]);

    const stocktwits = results[0].status === 'fulfilled' ? results[0].value : null;
    const fearGreed = results[1].status === 'fulfilled' ? results[1].value : null;
    const reddit = results[2].status === 'fulfilled' ? results[2].value : null;

    return {
      symbol,
      type,
      stocktwits,
      fearGreed,
      reddit,
      summary: this.generateSummary(stocktwits, fearGreed, reddit),
      timestamp: new Date(),
    };
  }

  /**
   * Obtiene el sentimiento general del mercado (sin símbolo específico)
   */
  async getGeneralSentiment(type: 'stock' | 'crypto' = 'stock'): Promise<MarketSentiment> {
    console.log(`[Sentiment] Obteniendo sentimiento general (${type})`);

    const results = await Promise.allSettled([
      type === 'crypto' ? this.getFearGreedSentiment() : Promise.resolve(null),
      this.getRedditGeneralSentiment(type),
    ]);

    const fearGreed = results[0].status === 'fulfilled' ? results[0].value : null;
    const reddit = results[1].status === 'fulfilled' ? results[1].value : null;

    return {
      type,
      stocktwits: null,
      fearGreed,
      reddit,
      summary: this.generateSummary(null, fearGreed, reddit),
      timestamp: new Date(),
    };
  }

  /**
   * Obtiene sentimiento de StockTwits
   */
  private async getStockTwitsSentiment(symbol: string): Promise<string | null> {
    const data = await stocktwitsService.getSentiment(symbol);
    return data ? stocktwitsService.formatForAI(data) : null;
  }

  /**
   * Obtiene índice Fear & Greed
   */
  private async getFearGreedSentiment(): Promise<string | null> {
    const data = await fearGreedService.getIndex();
    return data ? fearGreedService.formatForAI(data) : null;
  }

  /**
   * Obtiene sentimiento de Reddit para un símbolo
   */
  private async getRedditSentiment(symbol: string, type: 'stock' | 'crypto'): Promise<string | null> {
    const data = await redditService.searchSymbol(symbol, type);
    return data.posts.length > 0 ? redditService.formatForAI(data, symbol) : null;
  }

  /**
   * Obtiene sentimiento general de Reddit
   */
  private async getRedditGeneralSentiment(type: 'stock' | 'crypto'): Promise<string | null> {
    const data = await redditService.getGeneralSentiment(type);
    return data.posts.length > 0 ? redditService.formatForAI(data) : null;
  }

  /**
   * Genera un resumen del sentimiento
   */
  private generateSummary(
    stocktwits: string | null,
    fearGreed: string | null,
    reddit: string | null
  ): string {
    const sources: string[] = [];
    
    if (stocktwits) sources.push('StockTwits');
    if (fearGreed) sources.push('Fear & Greed Index');
    if (reddit) sources.push('Reddit');

    if (sources.length === 0) {
      return 'No se pudo obtener información de sentimiento de mercado.';
    }

    return `Análisis de sentimiento basado en: ${sources.join(', ')}.`;
  }

  /**
   * Formatea todo el sentimiento para incluir en el prompt de la IA
   */
  formatForAI(sentiment: MarketSentiment): string {
    let output = `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 ANÁLISIS DE SENTIMIENTO DE MERCADO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    if (sentiment.stocktwits) {
      output += sentiment.stocktwits;
    }

    if (sentiment.fearGreed) {
      output += sentiment.fearGreed;
    }

    if (sentiment.reddit) {
      output += sentiment.reddit;
    }

    if (!sentiment.stocktwits && !sentiment.fearGreed && !sentiment.reddit) {
      output += '\nℹ️ No se encontró información de sentimiento para este activo.\n';
    }

    output += `\n⚠️ NOTA: El sentimiento de redes sociales es solo un indicador complementario. No debe ser la única base para decisiones de inversión.\n`;

    return output;
  }
}

export const sentimentService = new SentimentService();
