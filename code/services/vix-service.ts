/**
 * Servicio para obtener el índice VIX (Volatility Index)
 * El VIX es conocido como el "índice del miedo" del mercado
 * Valores altos = miedo/incertidumbre, valores bajos = complacencia
 */

import { fetchWithCorsProxy } from './cors-proxy';

interface VIXData {
  value: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  sentiment: 'extreme_fear' | 'fear' | 'neutral' | 'complacency' | 'extreme_complacency';
  sentimentScore: number; // -100 a +100 (negativo = miedo, positivo = complacencia)
  interpretation: string;
  timestamp: Date;
}

// El VIX se puede obtener de Yahoo Finance
const VIX_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX';

// Niveles históricos del VIX
const VIX_LEVELS = {
  EXTREME_FEAR: 30,      // Crisis, pánico
  FEAR: 20,              // Miedo elevado
  NEUTRAL_HIGH: 15,      // Neutral alto
  NEUTRAL_LOW: 12,       // Neutral bajo
  COMPLACENCY: 12,       // Complacencia
  EXTREME_COMPLACENCY: 10, // Complacencia extrema
};

class VIXService {
  /**
   * Obtiene el valor actual del VIX
   */
  async getCurrentVIX(): Promise<VIXData | null> {
    try {
      console.log('[VIX] Obteniendo índice VIX...');
      
      const response = await fetchWithCorsProxy(VIX_URL);
      
      if (!response.ok) {
        console.log(`[VIX] Error ${response.status} obteniendo VIX`);
        return null;
      }
      
      const data = await response.json();
      
      const result = data.chart?.result?.[0];
      if (!result) {
        console.log('[VIX] Respuesta sin datos válidos');
        return null;
      }

      const meta = result.meta;
      const quote = result.indicators?.quote?.[0];
      
      const currentPrice = meta.regularMarketPrice || quote?.close?.[quote.close.length - 1];
      const previousClose = meta.chartPreviousClose || meta.previousClose;
      const change = currentPrice - previousClose;
      const changePercent = (change / previousClose) * 100;

      // Determinar sentimiento basado en nivel del VIX
      const { sentiment, sentimentScore, interpretation } = this.interpretVIX(currentPrice, change);

      console.log(`[VIX] Valor: ${currentPrice.toFixed(2)} (${sentiment})`);

      return {
        value: currentPrice,
        change,
        changePercent,
        high: meta.regularMarketDayHigh || currentPrice,
        low: meta.regularMarketDayLow || currentPrice,
        open: meta.regularMarketOpen || previousClose,
        previousClose,
        sentiment,
        sentimentScore,
        interpretation,
        timestamp: new Date(meta.regularMarketTime * 1000),
      };
    } catch (error) {
      console.error('[VIX] Error obteniendo VIX:', error);
      return null;
    }
  }

  /**
   * Interpreta el valor del VIX
   */
  private interpretVIX(vixValue: number, change: number): {
    sentiment: 'extreme_fear' | 'fear' | 'neutral' | 'complacency' | 'extreme_complacency';
    sentimentScore: number;
    interpretation: string;
  } {
    let sentiment: 'extreme_fear' | 'fear' | 'neutral' | 'complacency' | 'extreme_complacency';
    let sentimentScore: number;
    let interpretation: string;

    // El VIX está invertido vs el mercado:
    // VIX alto = mercado bajista/miedoso = score negativo
    // VIX bajo = mercado alcista/complaciente = score positivo

    if (vixValue >= VIX_LEVELS.EXTREME_FEAR) {
      sentiment = 'extreme_fear';
      // VIX 30+ -> score entre -60 y -100
      sentimentScore = -60 - Math.min(40, (vixValue - 30) * 2);
      interpretation = `🔴 VIX en ${vixValue.toFixed(1)} indica PÁNICO en el mercado. Históricamente, niveles extremos de miedo suelen preceder rebotes importantes.`;
    } else if (vixValue >= VIX_LEVELS.FEAR) {
      sentiment = 'fear';
      // VIX 20-30 -> score entre -20 y -60
      sentimentScore = -20 - ((vixValue - 20) / 10) * 40;
      interpretation = `🟠 VIX elevado en ${vixValue.toFixed(1)}. El mercado muestra nerviosismo. Los inversores buscan protección.`;
    } else if (vixValue >= VIX_LEVELS.NEUTRAL_LOW) {
      sentiment = 'neutral';
      // VIX 12-20 -> score entre -20 y +20
      const midpoint = (VIX_LEVELS.FEAR + VIX_LEVELS.NEUTRAL_LOW) / 2;
      sentimentScore = ((midpoint - vixValue) / (midpoint - VIX_LEVELS.NEUTRAL_LOW)) * 20;
      interpretation = `🟡 VIX en ${vixValue.toFixed(1)} dentro del rango normal. El mercado está relativamente tranquilo.`;
    } else if (vixValue >= VIX_LEVELS.EXTREME_COMPLACENCY) {
      sentiment = 'complacency';
      // VIX 10-12 -> score entre +20 y +60
      sentimentScore = 20 + ((12 - vixValue) / 2) * 40;
      interpretation = `🟢 VIX bajo en ${vixValue.toFixed(1)}. El mercado está confiado. ⚠️ La complacencia extrema a veces precede correcciones.`;
    } else {
      sentiment = 'extreme_complacency';
      // VIX < 10 -> score entre +60 y +100
      sentimentScore = 60 + Math.min(40, (10 - vixValue) * 20);
      interpretation = `⚠️ VIX extremadamente bajo (${vixValue.toFixed(1)}). Complacencia extrema en el mercado. Históricamente, estos niveles son insostenibles.`;
    }

    // Ajustar score basado en cambio diario
    if (Math.abs(change) > 2) {
      const changeAdjustment = change > 0 ? -10 : 10; // VIX subiendo = más miedo
      sentimentScore += changeAdjustment;
    }

    // Limitar a rango -100 a +100
    sentimentScore = Math.max(-100, Math.min(100, sentimentScore));

    return { sentiment, sentimentScore, interpretation };
  }

  /**
   * Formatea los datos del VIX para incluir en el prompt de la IA
   */
  formatForAI(data: VIXData): string {
    const sentimentEmoji = {
      extreme_fear: '😱',
      fear: '😰',
      neutral: '😐',
      complacency: '😌',
      extreme_complacency: '😴',
    };

    const sentimentLabel = {
      extreme_fear: 'Pánico Extremo',
      fear: 'Miedo',
      neutral: 'Normal',
      complacency: 'Complacencia',
      extreme_complacency: 'Complacencia Extrema',
    };

    const changeEmoji = data.change > 0 ? '📈' : data.change < 0 ? '📉' : '➡️';
    const changeSign = data.change >= 0 ? '+' : '';

    return `
📊 ÍNDICE VIX (Índice del Miedo)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Valor Actual: ${data.value.toFixed(2)} ${changeEmoji} ${changeSign}${data.change.toFixed(2)} (${changeSign}${data.changePercent.toFixed(2)}%)
• Rango del día: ${data.low.toFixed(2)} - ${data.high.toFixed(2)}
• Estado: ${sentimentEmoji[data.sentiment]} ${sentimentLabel[data.sentiment]}
• Score: ${data.sentimentScore > 0 ? '+' : ''}${data.sentimentScore.toFixed(0)}/100

📈 Interpretación:
${data.interpretation}

📚 Niveles de referencia:
• > 30: Pánico extremo
• 20-30: Miedo elevado  
• 12-20: Normal
• < 12: Complacencia
`;
  }

  /**
   * Obtiene el sentimiento del VIX como score simple
   */
  async getVIXSentimentScore(): Promise<number> {
    const vixData = await this.getCurrentVIX();
    return vixData ? vixData.sentimentScore : 0;
  }
}

export const vixService = new VIXService();
