import marketConfig from '../data/market-config.json';

type CurrencyType = 'stock' | 'crypto';

/**
 * Servicio para gestionar configuración de mercados y monedas
 */
class MarketConfigService {
  private europeanSuffixes: string[];
  private cryptoNames: { [key: string]: string };
  private currencyMapping: typeof marketConfig.currencyMapping;

  constructor() {
    this.europeanSuffixes = marketConfig.europeanSuffixes;
    this.cryptoNames = marketConfig.cryptoNames;
    this.currencyMapping = marketConfig.currencyMapping;
  }

  /**
   * Detecta si un símbolo es europeo
   */
  isEuropeanSymbol(symbol: string): boolean {
    const upperSymbol = symbol.toUpperCase();
    return this.europeanSuffixes.some(suffix => upperSymbol.endsWith(suffix));
  }

  /**
   * Obtiene el nombre completo de una criptomoneda
   */
  getCryptoFullName(symbol: string): string {
    return this.cryptoNames[symbol.toUpperCase()] || symbol.toUpperCase();
  }

  /**
   * Determina el símbolo de moneda basado en el símbolo del activo
   */
  getCurrencySymbol(symbol: string, type: CurrencyType = 'stock'): string {
    // Cryptos siempre en euros
    if (type === 'crypto') {
      return '€';
    }

    const upperSymbol = symbol.toUpperCase();

    // Verificar monedas europeas
    if (this.currencyMapping.european.suffixes.some(s => upperSymbol.endsWith(s))) {
      return this.currencyMapping.european.symbol;
    }

    // Verificar libras (UK)
    if (this.currencyMapping.uk.suffixes.some(s => upperSymbol.endsWith(s))) {
      return this.currencyMapping.uk.symbol;
    }

    // Verificar francos suizos
    if (this.currencyMapping.swiss.suffixes.some(s => upperSymbol.endsWith(s))) {
      return this.currencyMapping.swiss.symbol;
    }

    // Por defecto dólares
    return this.currencyMapping.default.symbol;
  }

  /**
   * Obtiene todos los sufijos europeos
   */
  getEuropeanSuffixes(): string[] {
    return this.europeanSuffixes;
  }

  /**
   * Añade un nuevo nombre de criptomoneda (en runtime)
   */
  addCryptoName(symbol: string, name: string): void {
    this.cryptoNames[symbol.toUpperCase()] = name;
  }
}

// Exportar instancia singleton
export const marketConfigService = new MarketConfigService();
