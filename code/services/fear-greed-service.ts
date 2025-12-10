/**
 * Servicio para obtener el índice Fear & Greed de criptomonedas
 * API gratuita de alternative.me
 */

interface FearGreedData {
  value: number;
  classification: string;
  timestamp: Date;
  nextUpdate: Date;
}

interface FearGreedHistory {
  current: FearGreedData;
  yesterday: FearGreedData | null;
  lastWeek: FearGreedData | null;
  lastMonth: FearGreedData | null;
}

const FEAR_GREED_API = 'https://api.alternative.me/fng/';

class FearGreedService {
  private cache: FearGreedHistory | null = null;
  private cacheTime: number = 0;
  private readonly CACHE_DURATION = 30 * 60 * 1000; // 30 minutos

  /**
   * Obtiene el índice actual de Fear & Greed
   */
  async getIndex(): Promise<FearGreedHistory | null> {
    // Usar caché si está fresco
    if (this.cache && Date.now() - this.cacheTime < this.CACHE_DURATION) {
      console.log('[FearGreed] Usando datos en caché');
      return this.cache;
    }

    try {
      console.log('[FearGreed] Obteniendo índice de miedo/codicia');

      // Obtener datos históricos (hoy, ayer, hace 1 semana, hace 1 mes)
      const response = await fetch(`${FEAR_GREED_API}?limit=31`);

      if (!response.ok) {
        throw new Error(`Error ${response.status}`);
      }

      const data = await response.json();

      if (!data.data || data.data.length === 0) {
        return null;
      }

      const entries = data.data;
      
      const result: FearGreedHistory = {
        current: this.parseEntry(entries[0]),
        yesterday: entries.length > 1 ? this.parseEntry(entries[1]) : null,
        lastWeek: entries.length > 7 ? this.parseEntry(entries[7]) : null,
        lastMonth: entries.length > 30 ? this.parseEntry(entries[30]) : null,
      };

      // Guardar en caché
      this.cache = result;
      this.cacheTime = Date.now();

      return result;
    } catch (error: any) {
      console.error('[FearGreed] Error:', error.message);
      return this.cache; // Devolver caché si hay error
    }
  }

  /**
   * Parsea una entrada del API
   */
  private parseEntry(entry: any): FearGreedData {
    return {
      value: parseInt(entry.value),
      classification: this.translateClassification(entry.value_classification),
      timestamp: new Date(parseInt(entry.timestamp) * 1000),
      nextUpdate: new Date((parseInt(entry.timestamp) + 86400) * 1000),
    };
  }

  /**
   * Traduce la clasificación al español
   */
  private translateClassification(classification: string): string {
    const translations: Record<string, string> = {
      'Extreme Fear': 'Miedo Extremo',
      'Fear': 'Miedo',
      'Neutral': 'Neutral',
      'Greed': 'Codicia',
      'Extreme Greed': 'Codicia Extrema',
    };
    return translations[classification] || classification;
  }

  /**
   * Obtiene el emoji según el valor
   */
  private getEmoji(value: number): string {
    if (value <= 20) return '😱'; // Miedo extremo
    if (value <= 40) return '😰'; // Miedo
    if (value <= 60) return '😐'; // Neutral
    if (value <= 80) return '😊'; // Codicia
    return '🤑'; // Codicia extrema
  }

  /**
   * Obtiene el color según el valor
   */
  private getIndicator(value: number): string {
    if (value <= 25) return '🔴';
    if (value <= 45) return '🟠';
    if (value <= 55) return '🟡';
    if (value <= 75) return '🟢';
    return '💚';
  }

  /**
   * Formatea los datos para incluir en el prompt de la IA
   */
  formatForAI(data: FearGreedHistory): string {
    const { current, yesterday, lastWeek, lastMonth } = data;
    
    let output = `
🎭 ÍNDICE FEAR & GREED (Cripto):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${this.getIndicator(current.value)} Actual: ${current.value}/100 - ${current.classification} ${this.getEmoji(current.value)}
`;

    if (yesterday) {
      const change = current.value - yesterday.value;
      const arrow = change > 0 ? '↑' : change < 0 ? '↓' : '→';
      output += `📅 Ayer: ${yesterday.value}/100 (${arrow}${Math.abs(change)})\n`;
    }

    if (lastWeek) {
      const change = current.value - lastWeek.value;
      const arrow = change > 0 ? '↑' : change < 0 ? '↓' : '→';
      output += `📆 Hace 1 semana: ${lastWeek.value}/100 (${arrow}${Math.abs(change)})\n`;
    }

    if (lastMonth) {
      const change = current.value - lastMonth.value;
      const arrow = change > 0 ? '↑' : change < 0 ? '↓' : '→';
      output += `🗓️ Hace 1 mes: ${lastMonth.value}/100 (${arrow}${Math.abs(change)})\n`;
    }

    output += `
💡 Interpretación:
- 0-25: Miedo Extremo (posible oportunidad de compra)
- 25-45: Miedo
- 45-55: Neutral
- 55-75: Codicia
- 75-100: Codicia Extrema (posible sobrevaloración)
`;

    return output;
  }
}

export const fearGreedService = new FearGreedService();
