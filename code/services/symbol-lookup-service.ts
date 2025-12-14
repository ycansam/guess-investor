import companySymbolsData from '../data/company-symbols.json';
import cryptoSymbolsData from '../data/crypto-symbols.json';
import financialPatternsData from '../data/financial-patterns.json';
import stopWordsData from '../data/stop-words.json';

// Tipos
export type SymbolMap = { [key: string]: string };
export type AssetType = 'stock' | 'crypto';

interface SymbolLookupResult {
  symbol: string;
  type: AssetType;
}

/**
 * Servicio para gestionar símbolos de activos financieros
 */
class SymbolLookupService {
  private companySymbolMap: SymbolMap;
  private cryptoSymbolMap: SymbolMap;
  private stopWords: Set<string>;
  private financialPatterns: RegExp[];
  private commonUpperWords: Set<string>;

  constructor() {
    // Combinar todas las empresas en un solo mapa
    this.companySymbolMap = {
      ...companySymbolsData.spanish,
      ...companySymbolsData.american,
      ...companySymbolsData.european,
      ...companySymbolsData.asian,
    };

    this.cryptoSymbolMap = cryptoSymbolsData;

    // Combinar todas las stopwords
    this.stopWords = new Set([
      ...stopWordsData.verbs,
      ...stopWordsData.time,
      ...stopWordsData.articles,
      ...stopWordsData.finance,
      ...stopWordsData.numbers,
    ]);

    // Crear patrones de regex para peticiones financieras
    this.financialPatterns = this.buildFinancialPatterns();

    // Palabras comunes en mayúsculas que no son símbolos
    this.commonUpperWords = new Set([
      'DE', 'LA', 'EL', 'EN', 'ES', 'UN', 'QUE', 'NO', 'SI', 'HOY', 'YA', 
      'MAS', 'MES', 'USD', 'EUR', 'DAME', 'PRECIO', 'ACTUAL', 'COMO', 
      'ESTA', 'TIEMPO', 'REAL'
    ]);
  }

  private buildFinancialPatterns(): RegExp[] {
    const allPatterns: string[] = [
      ...financialPatternsData.priceAndValue,
      ...financialPatternsData.realTimeData,
      ...financialPatternsData.currentState,
      ...financialPatternsData.actions,
      ...financialPatternsData.assets,
      ...financialPatternsData.analysis,
      ...financialPatternsData.crypto,
    ];

    return allPatterns.map(pattern => new RegExp(pattern, 'i'));
  }

  /**
   * Obtiene el mapa completo de empresas
   */
  getCompanySymbols(): SymbolMap {
    return this.companySymbolMap;
  }

  /**
   * Obtiene el mapa completo de criptomonedas
   */
  getCryptoSymbols(): SymbolMap {
    return this.cryptoSymbolMap;
  }

  /**
   * Obtiene el set de stopwords
   */
  getStopWords(): Set<string> {
    return this.stopWords;
  }

  /**
   * Verifica si una palabra en mayúsculas es común (no es un símbolo)
   */
  isCommonUpperWord(word: string): boolean {
    return this.commonUpperWords.has(word);
  }

  /**
   * Busca un símbolo por nombre de empresa
   */
  findCompanySymbol(name: string): string | null {
    const normalized = name.toLowerCase();
    return this.companySymbolMap[normalized] || null;
  }

  /**
   * Busca un símbolo por nombre de criptomoneda
   */
  findCryptoSymbol(name: string): string | null {
    const normalized = name.toLowerCase();
    return this.cryptoSymbolMap[normalized] || null;
  }

  /**
   * Busca un activo en ambos mapas
   */
  findAsset(name: string): SymbolLookupResult | null {
    const normalized = name.toLowerCase();
    
    if (this.companySymbolMap[normalized]) {
      return { symbol: this.companySymbolMap[normalized], type: 'stock' };
    }
    
    if (this.cryptoSymbolMap[normalized]) {
      return { symbol: this.cryptoSymbolMap[normalized], type: 'crypto' };
    }
    
    return null;
  }

  /**
   * Detecta si el mensaje es una petición financiera
   */
  isFinancialRequest(message: string): boolean {
    return this.financialPatterns.some(pattern => pattern.test(message));
  }

  /**
   * Verifica si el mensaje menciona un activo específico conocido
   */
  mentionsKnownAsset(normalizedMessage: string): boolean {
    // Verificar empresas
    for (const companyName of Object.keys(this.companySymbolMap)) {
      if (normalizedMessage.includes(companyName.toLowerCase())) {
        return true;
      }
    }
    
    // Verificar criptomonedas
    for (const cryptoName of Object.keys(this.cryptoSymbolMap)) {
      if (normalizedMessage.includes(cryptoName.toLowerCase())) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Verifica si hay un símbolo en mayúsculas en el mensaje original
   */
  hasDirectSymbol(message: string): boolean {
    return /\b[A-Z]{2,5}(?:\.[A-Z]{1,2})?\b/.test(message);
  }
}

// Exportar instancia singleton
export const symbolLookupService = new SymbolLookupService();
