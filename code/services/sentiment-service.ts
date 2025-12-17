/**
 * Servicio unificado de sentimiento de mercado
 * Combina datos de Finviz, Fear & Greed Index, Reddit, VIX y Put/Call Ratio
 * NOTA: Finviz reemplaza a StockTwits (bloqueado por Cloudflare)
 */

import { fearGreedService } from './fear-greed-service';
import { FinvizData, finvizService } from './finviz-service';
import { optionsService } from './options-service';
import { redditService } from './reddit-service';
import { stocktwitsService } from './stocktwits-service';
import { vixService } from './vix-service';

export interface MarketSentiment {
  symbol?: string;
  type: 'stock' | 'crypto';
  stocktwits: string | null;
  finviz: string | null; // Nueva fuente principal
  fearGreed: string | null;
  reddit: string | null;
  vix: string | null;
  putCallRatio: string | null;
  summary: string;
  overallScore: number; // -100 a +100
  finvizData?: FinvizData | null; // Datos raw de Finviz
  timestamp: Date;
}

class SentimentService {
  /**
   * Obtiene el sentimiento completo para un activo
   */
  async getSentimentForAsset(symbol: string, type: 'stock' | 'crypto' = 'stock'): Promise<MarketSentiment> {
    console.log(`[Sentiment] Obteniendo sentimiento para ${symbol} (${type})`);

    const results = await Promise.allSettled([
      type === 'stock' ? this.getFinvizData(symbol) : Promise.resolve(null),
      this.getStockTwitsSentiment(symbol), // Fallback, suele fallar por Cloudflare
      type === 'crypto' ? this.getFearGreedSentiment() : Promise.resolve(null),
      this.getRedditSentiment(symbol, type),
      type === 'stock' ? this.getVIXSentiment() : Promise.resolve(null),
      type === 'stock' ? this.getPutCallRatioSentiment() : Promise.resolve(null),
    ]);

    const finvizData = results[0].status === 'fulfilled' ? results[0].value : null;
    const stocktwits = results[1].status === 'fulfilled' ? results[1].value : null;
    const fearGreed = results[2].status === 'fulfilled' ? results[2].value : null;
    const reddit = results[3].status === 'fulfilled' ? results[3].value : null;
    const vix = results[4].status === 'fulfilled' ? results[4].value : null;
    const putCallRatio = results[5].status === 'fulfilled' ? results[5].value : null;

    // Formatear Finviz para display
    const finviz = finvizData ? finvizService.formatForAI(finvizData) : null;

    // Calcular score general (ahora incluye Finviz)
    const overallScore = await this.calculateOverallScore(type, finvizData);

    return {
      symbol,
      type,
      stocktwits,
      finviz,
      finvizData,
      fearGreed,
      reddit,
      vix,
      putCallRatio,
      summary: this.generateSummary(stocktwits, fearGreed, reddit, vix, putCallRatio, finviz),
      overallScore,
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
      type === 'stock' ? this.getVIXSentiment() : Promise.resolve(null),
      type === 'stock' ? this.getPutCallRatioSentiment() : Promise.resolve(null),
    ]);

    const fearGreed = results[0].status === 'fulfilled' ? results[0].value : null;
    const reddit = results[1].status === 'fulfilled' ? results[1].value : null;
    const vix = results[2].status === 'fulfilled' ? results[2].value : null;
    const putCallRatio = results[3].status === 'fulfilled' ? results[3].value : null;

    // Calcular score general
    const overallScore = await this.calculateOverallScore(type);

    return {
      type,
      stocktwits: null,
      finviz: null,
      finvizData: null,
      fearGreed,
      reddit,
      vix,
      putCallRatio,
      summary: this.generateSummary(null, fearGreed, reddit, vix, putCallRatio, null),
      overallScore,
      timestamp: new Date(),
    };
  }

  /**
   * Obtiene datos de Finviz (reemplaza StockTwits que está bloqueado)
   */
  private async getFinvizData(symbol: string): Promise<FinvizData | null> {
    try {
      return await finvizService.getData(symbol);
    } catch (error) {
      console.log(`[Sentiment] Error obteniendo Finviz para ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Obtiene sentimiento de StockTwits (fallback, suele estar bloqueado por Cloudflare)
   */
  private async getStockTwitsSentiment(symbol: string): Promise<string | null> {
    try {
      const data = await stocktwitsService.getSentiment(symbol);
      return data ? stocktwitsService.formatForAI(data) : null;
    } catch (error) {
      // StockTwits suele fallar por Cloudflare, no loggear como error
      console.log(`[Sentiment] StockTwits no disponible para ${symbol}`);
      return null;
    }
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
   * Obtiene datos del VIX
   */
  private async getVIXSentiment(): Promise<string | null> {
    const data = await vixService.getCurrentVIX();
    return data ? vixService.formatForAI(data) : null;
  }

  /**
   * Obtiene Put/Call ratio del mercado
   */
  private async getPutCallRatioSentiment(): Promise<string | null> {
    const data = await optionsService.getMarketPutCallRatio();
    return data ? optionsService.formatForAI(data) : null;
  }

  /**
   * Calcula un score de sentimiento general combinando todas las fuentes
   */
  private async calculateOverallScore(type: 'stock' | 'crypto', finvizData?: FinvizData | null): Promise<number> {
    const scores: { score: number; weight: number }[] = [];

    try {
      // Finviz (peso alto - datos de analistas y técnicos muy fiables)
      if (finvizData) {
        // Score de analistas (recomendación + target)
        if (finvizData.analystScore !== 0) {
          scores.push({ score: finvizData.analystScore, weight: 35 });
        }
        // Score técnico (RSI, SMAs)
        if (finvizData.technicalScore !== 0) {
          scores.push({ score: finvizData.technicalScore, weight: 20 });
        }
      }

      // VIX (solo para stocks) - peso alto porque es muy confiable
      if (type === 'stock') {
        const vixData = await vixService.getCurrentVIX();
        if (vixData) {
          scores.push({ score: vixData.sentimentScore, weight: 25 });
        }

        // Put/Call Ratio - peso medio para stocks
        const pcData = await optionsService.getMarketPutCallRatio();
        if (pcData) {
          scores.push({ score: pcData.sentimentScore, weight: 20 });
        }
      }

      // Fear & Greed (solo para crypto)
      if (type === 'crypto') {
        const fgData = await fearGreedService.getIndex();
        if (fgData && fgData.current) {
          // Convertir valor 0-100 a -100 a +100
          const fgScore = (fgData.current.value - 50) * 2;
          scores.push({ score: fgScore, weight: 40 });
        }
      }

      // Si no hay scores, retornar 0
      if (scores.length === 0) {
        return 0;
      }

      // Calcular promedio ponderado
      const totalWeight = scores.reduce((sum, s) => sum + s.weight, 0);
      const weightedSum = scores.reduce((sum, s) => sum + s.score * s.weight, 0);
      
      return Math.round(weightedSum / totalWeight);
    } catch (error) {
      console.error('[Sentiment] Error calculando score general:', error);
      return 0;
    }
  }

  /**
   * Genera un resumen del sentimiento
   */
  private generateSummary(
    stocktwits: string | null,
    fearGreed: string | null,
    reddit: string | null,
    vix: string | null,
    putCallRatio: string | null,
    finviz: string | null
  ): string {
    const sources: string[] = [];
    
    if (finviz) sources.push('Finviz (Analysts)');
    if (stocktwits) sources.push('StockTwits');
    if (fearGreed) sources.push('Fear & Greed Index');
    if (reddit) sources.push('Reddit');
    if (vix) sources.push('VIX');
    if (putCallRatio) sources.push('Put/Call Ratio');

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

    // Score general primero
    if (sentiment.overallScore !== 0) {
      const scoreEmoji = sentiment.overallScore > 30 ? '🟢' : 
                         sentiment.overallScore > 0 ? '🟡' :
                         sentiment.overallScore > -30 ? '🟠' : '🔴';
      const scoreLabel = sentiment.overallScore > 50 ? 'Muy Alcista' :
                         sentiment.overallScore > 20 ? 'Alcista' :
                         sentiment.overallScore > -20 ? 'Neutral' :
                         sentiment.overallScore > -50 ? 'Bajista' : 'Muy Bajista';
      output += `\n${scoreEmoji} SCORE GENERAL: ${sentiment.overallScore > 0 ? '+' : ''}${sentiment.overallScore}/100 (${scoreLabel})\n`;
    }

    // Finviz primero (datos de analistas - muy importantes)
    if (sentiment.finviz) {
      output += `\n📊 FINVIZ (Consensus de Analistas):\n${sentiment.finviz}\n`;
    }

    // VIX (indicador institucional principal)
    if (sentiment.vix) {
      output += sentiment.vix;
    }

    // Put/Call Ratio (indicador de opciones)
    if (sentiment.putCallRatio) {
      output += sentiment.putCallRatio;
    }

    if (sentiment.stocktwits) {
      output += sentiment.stocktwits;
    }

    if (sentiment.fearGreed) {
      output += sentiment.fearGreed;
    }

    if (sentiment.reddit) {
      output += sentiment.reddit;
    }

    if (!sentiment.finviz && !sentiment.stocktwits && !sentiment.fearGreed && !sentiment.reddit && !sentiment.vix && !sentiment.putCallRatio) {
      output += '\nℹ️ No se encontró información de sentimiento para este activo.\n';
    }

    output += `\n⚠️ NOTA: El sentimiento de mercado es solo un indicador complementario. No debe ser la única base para decisiones de inversión.\n`;

    return output;
  }

  /**
   * Obtiene el score de sentimiento como número para usar en predicciones
   */
  async getSentimentScore(type: 'stock' | 'crypto' = 'stock'): Promise<number> {
    return this.calculateOverallScore(type);
  }
}

export const sentimentService = new SentimentService();
