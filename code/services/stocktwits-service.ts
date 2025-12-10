/**
 * Servicio para obtener sentimiento de mercado desde StockTwits
 * API gratuita que proporciona sentimiento bullish/bearish por activo
 * NOTA: Solo soporta símbolos americanos y criptos populares
 */

import apiConfig from '../data/api-config.json';

interface StockTwitsSentiment {
  symbol: string;
  name: string;
  sentiment: {
    bullish: number;
    bearish: number;
    total: number;
    bullishPercent: number;
    bearishPercent: number;
  };
  messages: StockTwitsMessage[];
  timestamp: Date;
}

interface StockTwitsMessage {
  body: string;
  sentiment: 'bullish' | 'bearish' | null;
  createdAt: string;
  user: string;
}

const STOCKTWITS_API = 'https://api.stocktwits.com/api/2';
const CORS_PROXY = apiConfig.yahoo.corsProxy; // Reutilizar el proxy de Yahoo

// Símbolos europeos que NO están en StockTwits
const UNSUPPORTED_SUFFIXES = ['.MC', '.DE', '.PA', '.AS', '.MI', '.L', '.SW', '.CO', '.ST', '.HE', '.OL', '.BR', '.VI', '.IR', '.LS'];

// Mapeo de empresas europeas a sus equivalentes en StockTwits (si existen ADRs)
const EUROPEAN_TO_US_MAP: Record<string, string> = {
  // Algunas empresas europeas tienen ADRs en USA
  'SAP.DE': 'SAP',
  'ASML.AS': 'ASML',
  'NVO.CO': 'NVO',
  'TM.MC': 'TM',
  'UL.AS': 'UL',
  // Inditex NO tiene ADR en USA, no hay equivalente
};

class StockTwitsService {
  /**
   * Verifica si un símbolo está soportado por StockTwits
   */
  private isSupported(symbol: string): boolean {
    // Si tiene sufijo europeo y no hay mapeo, no está soportado
    for (const suffix of UNSUPPORTED_SUFFIXES) {
      if (symbol.toUpperCase().endsWith(suffix) && !EUROPEAN_TO_US_MAP[symbol.toUpperCase()]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Obtiene el sentimiento y mensajes recientes para un símbolo
   */
  async getSentiment(symbol: string): Promise<StockTwitsSentiment | null> {
    try {
      // Verificar si el símbolo está soportado
      if (!this.isSupported(symbol)) {
        console.log(`[StockTwits] Símbolo ${symbol} no soportado (mercado europeo sin ADR)`);
        return null;
      }

      // StockTwits usa símbolos sin sufijos (AAPL, BTC.X para crypto)
      const stocktwitsSymbol = this.formatSymbol(symbol);
      console.log(`[StockTwits] Obteniendo sentimiento para ${stocktwitsSymbol}`);

      // Usar proxy CORS para evitar bloqueos
      const apiUrl = `${STOCKTWITS_API}/streams/symbol/${stocktwitsSymbol}.json`;
      const url = `${CORS_PROXY}${encodeURIComponent(apiUrl)}`;
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          console.log(`[StockTwits] Símbolo ${stocktwitsSymbol} no encontrado en StockTwits`);
        } else {
          console.log(`[StockTwits] Error ${response.status} para ${stocktwitsSymbol}`);
        }
        return null;
      }

      const data = await response.json();

      if (!data.symbol || !data.messages) {
        return null;
      }

      // Calcular sentimiento de los últimos mensajes
      const messages = data.messages || [];
      const sentimentCounts = this.calculateSentiment(messages);

      return {
        symbol: data.symbol.symbol,
        name: data.symbol.title,
        sentiment: sentimentCounts,
        messages: messages.slice(0, 5).map((msg: any) => ({
          body: msg.body,
          sentiment: msg.entities?.sentiment?.basic || null,
          createdAt: msg.created_at,
          user: msg.user?.username || 'anonymous',
        })),
        timestamp: new Date(),
      };
    } catch (error: any) {
      console.error('[StockTwits] Error:', error.message);
      return null;
    }
  }

  /**
   * Convierte símbolo al formato de StockTwits
   * - Acciones US: AAPL, MSFT
   * - Crypto: BTC.X, ETH.X
   * - Europeas con ADR: usa el mapeo
   */
  private formatSymbol(symbol: string): string {
    const upperSymbol = symbol.toUpperCase();
    
    // Si hay mapeo europeo -> US, usarlo
    if (EUROPEAN_TO_US_MAP[upperSymbol]) {
      return EUROPEAN_TO_US_MAP[upperSymbol];
    }
    
    // Quitar sufijos de bolsa (.MC, .DE, etc)
    let cleanSymbol = upperSymbol.split('.')[0];
    
    // Si es cripto (viene como BTC-EUR o BTC), añadir .X
    if (symbol.includes('-EUR') || symbol.includes('-USD')) {
      cleanSymbol = symbol.split('-')[0].toUpperCase() + '.X';
    }
    
    // Lista de criptos conocidas para añadir .X
    const cryptos = ['BTC', 'ETH', 'SOL', 'ADA', 'XRP', 'DOGE', 'DOT', 'MATIC', 'LINK', 'AVAX', 'LTC', 'SHIB', 'UNI', 'BNB'];
    if (cryptos.includes(cleanSymbol)) {
      cleanSymbol += '.X';
    }

    return cleanSymbol;
  }

  /**
   * Calcula el sentimiento basado en los mensajes
   */
  private calculateSentiment(messages: any[]): StockTwitsSentiment['sentiment'] {
    let bullish = 0;
    let bearish = 0;

    messages.forEach((msg: any) => {
      const sentiment = msg.entities?.sentiment?.basic;
      if (sentiment === 'Bullish') bullish++;
      if (sentiment === 'Bearish') bearish++;
    });

    const total = bullish + bearish;
    
    return {
      bullish,
      bearish,
      total,
      bullishPercent: total > 0 ? Math.round((bullish / total) * 100) : 50,
      bearishPercent: total > 0 ? Math.round((bearish / total) * 100) : 50,
    };
  }

  /**
   * Formatea el sentimiento para incluir en el prompt de la IA
   */
  formatForAI(sentiment: StockTwitsSentiment): string {
    const { bullishPercent, bearishPercent, total } = sentiment.sentiment;
    const trend = bullishPercent > 60 ? '🟢 ALCISTA' : bearishPercent > 60 ? '🔴 BAJISTA' : '🟡 NEUTRAL';

    let output = `
📱 SENTIMIENTO STOCKTWITS - ${sentiment.name} (${sentiment.symbol}):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Tendencia: ${trend}
🐂 Bullish: ${bullishPercent}%
🐻 Bearish: ${bearishPercent}%
💬 Mensajes analizados: ${total}
`;

    if (sentiment.messages.length > 0) {
      output += `\n📝 Últimos comentarios:\n`;
      sentiment.messages.slice(0, 3).forEach((msg, i) => {
        const emoji = msg.sentiment === 'bullish' ? '🐂' : msg.sentiment === 'bearish' ? '🐻' : '💬';
        output += `${i + 1}. ${emoji} @${msg.user}: "${msg.body.slice(0, 100)}${msg.body.length > 100 ? '...' : ''}"\n`;
      });
    }

    return output;
  }
}

export const stocktwitsService = new StockTwitsService();
