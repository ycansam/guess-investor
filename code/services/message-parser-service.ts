import { symbolLookupService } from './symbol-lookup-service';

/**
 * Resultado del parsing del mensaje del usuario
 */
export interface ParsedMessage {
  /** Nombre del activo (ej: "Amazon", "Bitcoin") */
  assetName: string;
  /** Simbolo del activo (ej: "AMZN", "BTC-USD") */
  symbol: string;
  /** Tipo de activo */
  assetType: 'stock' | 'crypto';
  /** Fecha objetivo de la prediccion (si se menciona) */
  targetDate: Date | null;
  /** Dias hasta la fecha objetivo */
  timeframeDays: number;
  /** Si el mensaje es una peticion de prediccion financiera */
  isFinancialRequest: boolean;
  /** Mensaje original */
  originalMessage: string;
}

/**
 * Palabras clave que indican una peticion financiera
 */
const FINANCIAL_KEYWORDS = [
  'prediccion', 'precio', 'cotizacion',
  'analisis', 'inversion', 'comprar', 'vender',
  'acciones', 'accion', 'bolsa', 'mercado', 'trading',
  'como va', 'como esta', 'cuanto vale',
  'que opinas', 'forecast', 'prediction', 'price', 'analysis',
  'buy', 'sell', 'stock', 'crypto', 'bitcoin', 'ethereum', 'target',
  'objetivo', 'futuro', 'subira', 'bajara',
  'tendencia', 'trend', 'investing', 'invertir'
];

/**
 * Servicio para extraer informacion de activos y fechas del mensaje del usuario
 * usando analisis local sin dependencias externas
 */
class MessageParserService {
  private cache = new Map<string, ParsedMessage>();

  /**
   * Parsea el mensaje del usuario para extraer activo, simbolo y fecha
   */
  async parseMessage(userMessage: string): Promise<ParsedMessage | null> {
    const cacheKey = userMessage.toLowerCase().trim();
    if (this.cache.has(cacheKey)) {
      console.log('[MessageParser] Usando resultado en cache');
      return this.cache.get(cacheKey)!;
    }

    try {
      console.log('[MessageParser] Parseando mensaje localmente:', userMessage);
      
      const normalizedMessage = userMessage.toLowerCase();
      
      const isFinancialRequest = this.isFinancialRequest(normalizedMessage);
      
      if (!isFinancialRequest) {
        console.log('[MessageParser] No es una peticion financiera');
        return null;
      }

      const foundAsset = this.findAssetInMessage(normalizedMessage);
      
      if (!foundAsset) {
        console.log('[MessageParser] No se encontro activo en el mensaje');
        return null;
      }

      const dateInfo = this.extractDateFromMessage(normalizedMessage);

      const result: ParsedMessage = {
        assetName: foundAsset.name,
        symbol: foundAsset.symbol,
        assetType: foundAsset.type,
        targetDate: dateInfo.date,
        timeframeDays: dateInfo.days,
        isFinancialRequest: true,
        originalMessage: userMessage,
      };

      this.cache.set(cacheKey, result);
      
      console.log('[MessageParser] Resultado:', result);
      return result;

    } catch (error) {
      console.error('[MessageParser] Error parseando mensaje:', error);
      return null;
    }
  }

  private isFinancialRequest(message: string): boolean {
    for (const keyword of FINANCIAL_KEYWORDS) {
      if (message.includes(keyword)) {
        return true;
      }
    }
    
    const foundAsset = this.findAssetInMessage(message);
    return foundAsset !== null;
  }

  private findAssetInMessage(message: string): { name: string; symbol: string; type: 'stock' | 'crypto' } | null {
    const companySymbols = symbolLookupService.getCompanySymbols();
    for (const [name, symbol] of Object.entries(companySymbols)) {
      if (message.includes(name.toLowerCase())) {
        return { name, symbol, type: 'stock' };
      }
    }

    const cryptoSymbols = symbolLookupService.getCryptoSymbols();
    for (const [name, symbol] of Object.entries(cryptoSymbols)) {
      if (message.includes(name.toLowerCase())) {
        return { name, symbol, type: 'crypto' };
      }
    }

    const asset = symbolLookupService.findAsset(message);
    if (asset) {
      return { name: asset.name, symbol: asset.symbol, type: asset.type };
    }

    return null;
  }

  private extractDateFromMessage(message: string): { date: Date | null; days: number } {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentYear = today.getFullYear();
    
    const monthMap: Record<string, number> = {
      'enero': 0, 'febrero': 1, 'marzo': 2, 'abril': 3,
      'mayo': 4, 'junio': 5, 'julio': 6, 'agosto': 7,
      'septiembre': 8, 'octubre': 9, 'noviembre': 10, 'diciembre': 11,
      'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
      'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11,
      'january': 0, 'february': 1, 'march': 2, 'april': 3,
      'june': 5, 'july': 6, 'august': 7, 'september': 8,
      'october': 9, 'november': 10, 'december': 11,
    };

    const datePatterns = [
      /(\d{1,2})\s*(?:de\s*)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s*(?:de\s*)?(\d{4})?/i,
      /(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s*(\d{1,2})(?:\s*(?:de\s*)?(\d{4}))?/i,
      /(\d{1,2})\s*(?:de\s*)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(?:uary|ruary|ch|il|e|y|ust|tember|ober|ember)?\s*(?:of\s*)?(\d{4})?/i,
    ];

    for (const pattern of datePatterns) {
      const match = message.match(pattern);
      if (match) {
        let day: number;
        let month: number;
        let year: number;

        if (/^\d/.test(match[1])) {
          day = parseInt(match[1]);
          month = monthMap[match[2].toLowerCase()] ?? 0;
          year = match[3] ? parseInt(match[3]) : currentYear;
        } else {
          month = monthMap[match[1].toLowerCase()] ?? 0;
          day = parseInt(match[2]);
          year = match[3] ? parseInt(match[3]) : currentYear;
        }

        const targetDate = new Date(year, month, day);
        if (targetDate < today && !match[3]) {
          targetDate.setFullYear(currentYear + 1);
        }

        const diffTime = targetDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        console.log('[MessageParser] Fecha extraida:', targetDate.toISOString().split('T')[0], '(' + diffDays + ' dias)');
        
        return {
          date: targetDate,
          days: Math.max(1, Math.min(365, diffDays)),
        };
      }
    }

    if (/manana|tomorrow/i.test(message)) {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return { date: tomorrow, days: 1 };
    }
    
    if (/pasado\s*manana|day\s*after/i.test(message)) {
      const dayAfter = new Date(today);
      dayAfter.setDate(dayAfter.getDate() + 2);
      return { date: dayAfter, days: 2 };
    }
    
    if (/proxima?\s*semana|next\s*week/i.test(message)) {
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);
      return { date: nextWeek, days: 7 };
    }
    
    if (/fin\s*de\s*mes|end\s*of\s*month/i.test(message)) {
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      const days = Math.ceil((endOfMonth.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return { date: endOfMonth, days: Math.max(1, days) };
    }
    
    if (/proximo?\s*mes|next\s*month/i.test(message)) {
      const nextMonth = new Date(today);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      return { date: nextMonth, days: 30 };
    }

    const inDaysMatch = message.match(/en\s*(\d+)\s*(dias?|semanas?|meses?|days?|weeks?|months?)/i);
    if (inDaysMatch) {
      const num = parseInt(inDaysMatch[1]);
      const unit = inDaysMatch[2].toLowerCase();
      let days = num;
      
      if (unit.startsWith('semana') || unit.startsWith('week')) {
        days = num * 7;
      } else if (unit.startsWith('mes') || unit.startsWith('month')) {
        days = num * 30;
      }
      
      const futureDate = new Date(today);
      futureDate.setDate(futureDate.getDate() + days);
      return { date: futureDate, days: Math.max(1, Math.min(365, days)) };
    }

    return { date: null, days: 1 };
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export const messageParserService = new MessageParserService();
