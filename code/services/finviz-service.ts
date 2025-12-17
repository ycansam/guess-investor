/**
 * Servicio para obtener datos de Finviz
 * Proporciona: recomendación de analistas, target price, RSI, volumen relativo, 
 * short float, insider transactions, y más
 * 
 * NOTA: Finviz funciona sin problemas de Cloudflare, a diferencia de StockTwits
 */

import { fetchWithCorsProxy } from './cors-proxy';

export interface FinvizData {
  symbol: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  
  // Analyst data
  targetPrice: number | null;
  recommendation: number | null; // 1 = Strong Buy, 5 = Strong Sell
  
  // Technical indicators
  rsi: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  relativeVolume: number | null;
  
  // Short interest & insiders
  shortFloat: number | null;
  insiderOwn: number | null;
  insiderTrans: number | null; // Positive = buying, negative = selling
  
  // Fundamental
  peRatio: number | null;
  forwardPE: number | null;
  peg: number | null;
  
  // Volatility
  atr: number | null;
  volatility: number | null; // Weekly/Monthly volatility
  beta: number | null;
  
  // Calculated scores
  analystScore: number; // -100 to +100 based on recommendation
  technicalScore: number; // -100 to +100 based on RSI, SMA trends
  
  timestamp: Date;
}

const FINVIZ_URL = 'https://finviz.com/quote.ashx';

class FinvizService {
  
  /**
   * Obtiene todos los datos disponibles de Finviz para un símbolo
   */
  async getData(symbol: string): Promise<FinvizData | null> {
    try {
      // Limpiar símbolo (quitar sufijos como .MC, .DE)
      const cleanSymbol = this.cleanSymbol(symbol);
      
      console.log(`[Finviz] Obteniendo datos para ${cleanSymbol}`);
      
      const url = `${FINVIZ_URL}?t=${cleanSymbol}`;
      const response = await fetchWithCorsProxy(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (!response.ok) {
        console.log(`[Finviz] Error HTTP: ${response.status}`);
        return null;
      }
      
      const html = await response.text();
      
      // Verificar si el símbolo existe
      if (html.includes('Quote Not Found') || html.includes('not available')) {
        console.log(`[Finviz] Símbolo ${cleanSymbol} no encontrado`);
        return null;
      }
      
      return this.parseFinvizData(cleanSymbol, html);
      
    } catch (error) {
      console.error(`[Finviz] Error obteniendo datos:`, error);
      return null;
    }
  }
  
  /**
   * Limpia el símbolo para Finviz (solo soporta US stocks)
   */
  private cleanSymbol(symbol: string): string {
    // Quitar sufijos de mercados europeos
    const suffixes = ['.MC', '.DE', '.PA', '.AS', '.MI', '.L', '.SW', '.CO', '.ST'];
    let clean = symbol.toUpperCase();
    
    for (const suffix of suffixes) {
      if (clean.endsWith(suffix)) {
        // Finviz no soporta acciones europeas directamente
        // Algunos tienen ADRs, mapear si es posible
        return this.mapToUSSymbol(clean) || clean.replace(suffix, '');
      }
    }
    
    return clean;
  }
  
  /**
   * Mapea símbolos europeos a ADRs de USA si existen
   */
  private mapToUSSymbol(symbol: string): string | null {
    const euroToUS: Record<string, string> = {
      'SAP.DE': 'SAP',
      'ASML.AS': 'ASML',
      'NVO.CO': 'NVO',
      'TM.MC': 'TM',
      'UL.AS': 'UL',
      'PHG.AS': 'PHG',
      'SHELL.AS': 'SHEL',
      'BP.L': 'BP',
      'GSK.L': 'GSK',
      'AZN.L': 'AZN',
      'NVS.SW': 'NVS',
    };
    
    return euroToUS[symbol.toUpperCase()] || null;
  }
  
  /**
   * Parsea el HTML de Finviz y extrae los datos
   */
  private parseFinvizData(symbol: string, html: string): FinvizData {
    const extractValue = (pattern: RegExp): string | null => {
      const match = html.match(pattern);
      return match ? match[1].trim() : null;
    };
    
    const parseNumber = (value: string | null): number | null => {
      if (!value || value === '-') return null;
      // Limpiar caracteres no numéricos excepto punto y signo
      const clean = value.replace(/[^0-9.\-]/g, '');
      const num = parseFloat(clean);
      return isNaN(num) ? null : num;
    };
    
    const parsePercent = (value: string | null): number | null => {
      if (!value || value === '-') return null;
      const clean = value.replace('%', '').trim();
      const num = parseFloat(clean);
      return isNaN(num) ? null : num;
    };
    
    // Extraer valores usando regex
    const price = parseNumber(extractValue(/class="quote-price_wrapper__B_OeP"[^>]*>([^<]+)/));
    const change = parseNumber(extractValue(/class="quote-price_change_wrapper__f3RjX"[^>]*>([^<]+)/));
    const changePercent = parsePercent(extractValue(/class="quote-price_change_wrapper__f3RjX"[^>]*>[^<]*<[^>]*>([^<]+)/));
    
    // Datos de la tabla de fundamentals/technicals
    const targetPrice = parseNumber(extractValue(/Target Price.*?>([0-9.]+)</));
    const recommendation = parseNumber(extractValue(/Recom.*?>([0-9.]+)</));
    const rsi = parseNumber(extractValue(/RSI \(14\).*?>([0-9.]+)</));
    const sma20 = parsePercent(extractValue(/SMA20.*?>([\-0-9.]+%)</));
    const sma50 = parsePercent(extractValue(/SMA50.*?>([\-0-9.]+%)</));
    const sma200 = parsePercent(extractValue(/SMA200.*?>([\-0-9.]+%)</));
    const relativeVolume = parseNumber(extractValue(/Rel Volume.*?>([0-9.]+)</));
    const shortFloat = parsePercent(extractValue(/Short Float.*?>([0-9.]+%)/));
    const insiderOwn = parsePercent(extractValue(/Insider Own.*?>([0-9.]+%)/));
    const insiderTrans = parsePercent(extractValue(/Insider Trans.*?>([\-0-9.]+%)/));
    const peRatio = parseNumber(extractValue(/P\/E<\/b><\/td><td[^>]*>([0-9.]+)/));
    const forwardPE = parseNumber(extractValue(/Forward P\/E.*?>([0-9.]+)</));
    const peg = parseNumber(extractValue(/PEG.*?>([0-9.]+)</));
    const atr = parseNumber(extractValue(/ATR.*?>([0-9.]+)</));
    const volatility = parsePercent(extractValue(/Volatility.*?>([0-9.]+%)/));
    const beta = parseNumber(extractValue(/Beta.*?>([0-9.\-]+)</));
    
    // Calcular scores
    const analystScore = this.calculateAnalystScore(recommendation, targetPrice, price);
    const technicalScore = this.calculateTechnicalScore(rsi, sma20, sma50, sma200, relativeVolume);
    
    return {
      symbol,
      price,
      change,
      changePercent,
      targetPrice,
      recommendation,
      rsi,
      sma20,
      sma50,
      sma200,
      relativeVolume,
      shortFloat,
      insiderOwn,
      insiderTrans,
      atr,
      volatility,
      beta,
      peRatio,
      forwardPE,
      peg,
      analystScore,
      technicalScore,
      timestamp: new Date(),
    };
  }
  
  /**
   * Calcula score de analistas (-100 a +100)
   * 1 = Strong Buy = +100
   * 2 = Buy = +50
   * 3 = Hold = 0
   * 4 = Sell = -50
   * 5 = Strong Sell = -100
   */
  private calculateAnalystScore(
    recommendation: number | null, 
    targetPrice: number | null, 
    currentPrice: number | null
  ): number {
    let score = 0;
    
    // Score basado en recomendación (peso 60%)
    if (recommendation !== null) {
      // Invertir escala: 1 = +100, 5 = -100
      score += ((3 - recommendation) / 2) * 100 * 0.6;
    }
    
    // Score basado en upside al target (peso 40%)
    if (targetPrice !== null && currentPrice !== null && currentPrice > 0) {
      const upside = ((targetPrice - currentPrice) / currentPrice) * 100;
      // Limitar upside a -50% / +50% para el cálculo
      const clampedUpside = Math.max(-50, Math.min(50, upside));
      score += (clampedUpside / 50) * 100 * 0.4;
    }
    
    return Math.round(Math.max(-100, Math.min(100, score)));
  }
  
  /**
   * Calcula score técnico (-100 a +100)
   */
  private calculateTechnicalScore(
    rsi: number | null,
    sma20: number | null,
    sma50: number | null,
    sma200: number | null,
    relativeVolume: number | null
  ): number {
    let score = 0;
    let weights = 0;
    
    // RSI: <30 muy alcista, 30-40 alcista, 40-60 neutral, 60-70 bajista, >70 muy bajista
    if (rsi !== null) {
      if (rsi < 30) score += 80;
      else if (rsi < 40) score += 40;
      else if (rsi < 50) score += 10;
      else if (rsi < 60) score -= 10;
      else if (rsi < 70) score -= 40;
      else score -= 80;
      weights += 1;
    }
    
    // SMA20: precio vs SMA20 (tendencia corto plazo)
    if (sma20 !== null) {
      score += Math.max(-50, Math.min(50, sma20 * 5));
      weights += 0.5;
    }
    
    // SMA50: tendencia medio plazo
    if (sma50 !== null) {
      score += Math.max(-50, Math.min(50, sma50 * 3));
      weights += 0.5;
    }
    
    // SMA200: tendencia largo plazo
    if (sma200 !== null) {
      score += Math.max(-50, Math.min(50, sma200 * 2));
      weights += 0.5;
    }
    
    // Relative Volume: alto volumen puede indicar interés
    if (relativeVolume !== null && relativeVolume > 1.5) {
      // Alto volumen - neutral pero indica actividad
      score += 10;
      weights += 0.2;
    }
    
    if (weights === 0) return 0;
    
    return Math.round(Math.max(-100, Math.min(100, score / weights)));
  }
  
  /**
   * Formatea los datos para mostrar en la UI
   */
  formatForDisplay(data: FinvizData): string {
    const lines: string[] = [];
    
    if (data.recommendation !== null) {
      const recomText = this.getRecommendationText(data.recommendation);
      lines.push(`📊 Analistas: ${recomText} (${data.recommendation.toFixed(2)}/5)`);
    }
    
    if (data.targetPrice !== null && data.price !== null) {
      const upside = ((data.targetPrice - data.price) / data.price * 100).toFixed(1);
      lines.push(`🎯 Target: $${data.targetPrice.toFixed(2)} (${upside}% upside)`);
    }
    
    if (data.rsi !== null) {
      const rsiText = data.rsi < 30 ? '🟢 Sobrevendido' : 
                      data.rsi > 70 ? '🔴 Sobrecomprado' : '⚪ Neutral';
      lines.push(`📈 RSI(14): ${data.rsi.toFixed(1)} ${rsiText}`);
    }
    
    if (data.shortFloat !== null && data.shortFloat > 10) {
      lines.push(`🩳 Short Float: ${data.shortFloat.toFixed(1)}% (alto)`);
    }
    
    if (data.insiderTrans !== null && Math.abs(data.insiderTrans) > 1) {
      const insiderText = data.insiderTrans > 0 ? '🟢 Comprando' : '🔴 Vendiendo';
      lines.push(`👔 Insiders: ${insiderText} (${data.insiderTrans > 0 ? '+' : ''}${data.insiderTrans.toFixed(1)}%)`);
    }
    
    return lines.join('\n');
  }
  
  /**
   * Formatea para IA
   */
  formatForAI(data: FinvizData): string {
    const parts: string[] = [];
    
    parts.push(`FINVIZ DATA FOR ${data.symbol}:`);
    
    if (data.recommendation !== null) {
      parts.push(`- Analyst Recommendation: ${data.recommendation.toFixed(2)} (1=Strong Buy, 5=Strong Sell)`);
      parts.push(`- Analyst Score: ${data.analystScore}/100`);
    }
    
    if (data.targetPrice !== null && data.price !== null) {
      const upside = ((data.targetPrice - data.price) / data.price * 100);
      parts.push(`- Target Price: $${data.targetPrice.toFixed(2)} (${upside.toFixed(1)}% upside)`);
    }
    
    if (data.rsi !== null) {
      parts.push(`- RSI(14): ${data.rsi.toFixed(1)}`);
    }
    
    if (data.sma20 !== null) parts.push(`- Price vs SMA20: ${data.sma20}%`);
    if (data.sma50 !== null) parts.push(`- Price vs SMA50: ${data.sma50}%`);
    if (data.sma200 !== null) parts.push(`- Price vs SMA200: ${data.sma200}%`);
    
    parts.push(`- Technical Score: ${data.technicalScore}/100`);
    
    if (data.shortFloat !== null) {
      parts.push(`- Short Float: ${data.shortFloat}%`);
    }
    
    if (data.insiderTrans !== null) {
      parts.push(`- Insider Transactions: ${data.insiderTrans > 0 ? '+' : ''}${data.insiderTrans}%`);
    }
    
    if (data.beta !== null) {
      parts.push(`- Beta: ${data.beta}`);
    }
    
    return parts.join('\n');
  }
  
  /**
   * Convierte recomendación numérica a texto
   */
  private getRecommendationText(recom: number): string {
    if (recom <= 1.5) return 'Compra fuerte';
    if (recom <= 2.5) return 'Comprar';
    if (recom <= 3.5) return 'Mantener';
    if (recom <= 4.5) return 'Vender';
    return 'Venta fuerte';
  }
  
  /**
   * Obtiene solo la recomendación y target price (versión rápida)
   */
  async getQuickAnalystData(symbol: string): Promise<{
    recommendation: number | null;
    targetPrice: number | null;
    rsi: number | null;
    analystScore: number;
  } | null> {
    const data = await this.getData(symbol);
    if (!data) return null;
    
    return {
      recommendation: data.recommendation,
      targetPrice: data.targetPrice,
      rsi: data.rsi,
      analystScore: data.analystScore,
    };
  }
}

export const finvizService = new FinvizService();
