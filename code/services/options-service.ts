/**
 * Servicio para obtener datos de opciones del mercado
 * Calcula Put/Call ratio desde datos de CBOE
 * Indicador de sentimiento: ratio alto = bearish, ratio bajo = bullish
 */

import { fetchWithCorsProxy } from './cors-proxy';

interface OptionsData {
  symbol: string;
  putCallRatio: number;
  totalPutVolume: number;
  totalCallVolume: number;
  totalPutOpenInterest: number;
  totalCallOpenInterest: number;
  sentiment: 'extreme_fear' | 'bearish' | 'neutral' | 'bullish' | 'extreme_greed';
  sentimentScore: number; // -100 a +100
  timestamp: Date;
}

interface SPXOptionsResponse {
  symbol: string;
  pcRatio: number;
  pcRatioVolume: number;
  sentiment: 'extreme_fear' | 'bearish' | 'neutral' | 'bullish' | 'extreme_greed';
  sentimentScore: number;
  timestamp: Date;
}

// URLs de CBOE para datos de opciones
const CBOE_OPTIONS_URLS = {
  SPX: 'https://cdn.cboe.com/api/global/delayed_quotes/options/_SPX.json',
  VIX: 'https://cdn.cboe.com/api/global/delayed_quotes/options/_VIX.json',
};

class OptionsService {
  /**
   * Obtiene el Put/Call ratio del S&P 500 (indicador de mercado general)
   */
  async getSPXPutCallRatio(): Promise<SPXOptionsResponse | null> {
    try {
      console.log('[Options] Obteniendo Put/Call ratio del SPX desde CBOE...');
      
      const response = await fetchWithCorsProxy(CBOE_OPTIONS_URLS.SPX);
      
      if (!response.ok) {
        console.log(`[Options] Error ${response.status} obteniendo datos de SPX`);
        return null;
      }
      
      const data = await response.json();
      
      if (!data.data?.options || !Array.isArray(data.data.options)) {
        console.log('[Options] Respuesta de CBOE sin datos de opciones');
        return null;
      }

      // Calcular Put/Call ratio
      const result = this.calculatePutCallRatio(data.data.options);
      
      console.log(`[Options] Put/Call ratio SPX: ${result.pcRatio.toFixed(2)} (${result.sentiment})`);
      
      return {
        symbol: 'SPX',
        pcRatio: result.pcRatio,
        pcRatioVolume: result.pcRatioVolume,
        sentiment: result.sentiment,
        sentimentScore: result.sentimentScore,
        timestamp: new Date(data.timestamp || Date.now()),
      };
    } catch (error) {
      console.error('[Options] Error obteniendo Put/Call ratio:', error);
      return null;
    }
  }

  /**
   * Calcula el Put/Call ratio y Open Interest ratio
   */
  private calculatePutCallRatio(options: any[]): {
    pcRatio: number;
    pcRatioVolume: number;
    sentiment: 'extreme_fear' | 'bearish' | 'neutral' | 'bullish' | 'extreme_greed';
    sentimentScore: number;
  } {
    let totalPutVolume = 0;
    let totalCallVolume = 0;
    let totalPutOI = 0;
    let totalCallOI = 0;

    for (const option of options) {
      const optionSymbol = option.option || '';
      const volume = option.volume || 0;
      const openInterest = option.open_interest || 0;

      // Identificar si es Put (P) o Call (C) por el símbolo
      // Formato: SPX251219C06820000 (C = Call, P = Put)
      if (optionSymbol.includes('P')) {
        totalPutVolume += volume;
        totalPutOI += openInterest;
      } else if (optionSymbol.includes('C')) {
        totalCallVolume += volume;
        totalCallOI += openInterest;
      }
    }

    // Put/Call ratio basado en Open Interest (más estable)
    const pcRatio = totalCallOI > 0 ? totalPutOI / totalCallOI : 1;
    
    // Put/Call ratio basado en Volume (más volátil, pero muestra actividad reciente)
    const pcRatioVolume = totalCallVolume > 0 ? totalPutVolume / totalCallVolume : 1;

    // Interpretar el ratio:
    // < 0.7 = Extreme Greed (muchas más calls que puts - muy bullish)
    // 0.7 - 0.9 = Bullish
    // 0.9 - 1.1 = Neutral
    // 1.1 - 1.3 = Bearish
    // > 1.3 = Extreme Fear (muchas más puts que calls - muy bearish)
    let sentiment: 'extreme_fear' | 'bearish' | 'neutral' | 'bullish' | 'extreme_greed';
    let sentimentScore: number;

    if (pcRatio < 0.7) {
      sentiment = 'extreme_greed';
      sentimentScore = 80 + Math.min(20, (0.7 - pcRatio) * 100);
    } else if (pcRatio < 0.9) {
      sentiment = 'bullish';
      sentimentScore = 20 + ((0.9 - pcRatio) / 0.2) * 60;
    } else if (pcRatio <= 1.1) {
      sentiment = 'neutral';
      sentimentScore = -20 + ((1.1 - pcRatio) / 0.2) * 40;
    } else if (pcRatio <= 1.3) {
      sentiment = 'bearish';
      sentimentScore = -20 - ((pcRatio - 1.1) / 0.2) * 60;
    } else {
      sentiment = 'extreme_fear';
      sentimentScore = -80 - Math.min(20, (pcRatio - 1.3) * 50);
    }

    // Limitar a rango -100 a +100
    sentimentScore = Math.max(-100, Math.min(100, sentimentScore));

    return { pcRatio, pcRatioVolume, sentiment, sentimentScore };
  }

  /**
   * Obtiene datos de opciones para un símbolo específico (si está disponible)
   */
  async getOptionsData(symbol: string): Promise<OptionsData | null> {
    // Por ahora solo SPX está disponible públicamente en CBOE
    // Para símbolos individuales, usamos el SPX como indicador de mercado general
    if (symbol.toUpperCase() === 'SPX' || symbol.toUpperCase() === '^SPX') {
      const spxData = await this.getSPXPutCallRatio();
      if (spxData) {
        return {
          symbol: 'SPX',
          putCallRatio: spxData.pcRatio,
          totalPutVolume: 0,
          totalCallVolume: 0,
          totalPutOpenInterest: 0,
          totalCallOpenInterest: 0,
          sentiment: spxData.sentiment,
          sentimentScore: spxData.sentimentScore,
          timestamp: spxData.timestamp,
        };
      }
    }
    return null;
  }

  /**
   * Obtiene el Put/Call ratio general del mercado (SPX) como referencia
   */
  async getMarketPutCallRatio(): Promise<SPXOptionsResponse | null> {
    return this.getSPXPutCallRatio();
  }

  /**
   * Formatea los datos de opciones para incluir en el prompt de la IA
   */
  formatForAI(data: SPXOptionsResponse): string {
    const sentimentEmoji = {
      extreme_fear: '😱',
      bearish: '🐻',
      neutral: '😐',
      bullish: '🐂',
      extreme_greed: '🤑',
    };

    const sentimentLabel = {
      extreme_fear: 'Miedo Extremo',
      bearish: 'Bajista',
      neutral: 'Neutral',
      bullish: 'Alcista',
      extreme_greed: 'Codicia Extrema',
    };

    return `
📊 PUT/CALL RATIO (SPX)
━━━━━━━━━━━━━━━━━━━━━━
• Ratio Put/Call (OI): ${data.pcRatio.toFixed(2)}
• Ratio Put/Call (Vol): ${data.pcRatioVolume.toFixed(2)}
• Sentimiento: ${sentimentEmoji[data.sentiment]} ${sentimentLabel[data.sentiment]}
• Score: ${data.sentimentScore > 0 ? '+' : ''}${data.sentimentScore.toFixed(0)}/100

📈 Interpretación:
${this.getInterpretation(data.pcRatio, data.sentiment)}
`;
  }

  /**
   * Genera interpretación del ratio
   */
  private getInterpretation(ratio: number, sentiment: string): string {
    if (sentiment === 'extreme_greed') {
      return '⚠️ El mercado está muy optimista. Posible señal contraria - las correcciones suelen venir después de optimismo extremo.';
    } else if (sentiment === 'bullish') {
      return '✅ Más operadores están comprando calls que puts. Sentimiento alcista moderado.';
    } else if (sentiment === 'neutral') {
      return '➡️ Equilibrio entre puts y calls. El mercado no muestra dirección clara.';
    } else if (sentiment === 'bearish') {
      return '⚠️ Más operadores están comprando puts que calls. Sentimiento bajista moderado.';
    } else {
      return '💡 Miedo extremo en opciones. Históricamente, estos niveles suelen preceder rebotes.';
    }
  }
}

export const optionsService = new OptionsService();
