import apiConfig from '../data/api-config.json';

interface ExchangeRateCache {
  rate: number;
  lastUpdate: number;
}

/**
 * Servicio para gestionar tasas de cambio de divisas
 */
class ExchangeRateService {
  private cache: ExchangeRateCache;
  private readonly config = apiConfig.exchangeRate;

  constructor() {
    this.cache = {
      rate: this.config.defaultUsdToEur,
      lastUpdate: 0,
    };
  }

  /**
   * Obtiene la tasa de cambio USD a EUR (con caché)
   */
  async getUsdToEurRate(): Promise<number> {
    const now = Date.now();

    // Usar caché si es reciente
    if (now - this.cache.lastUpdate < this.config.cacheDurationMs && this.cache.rate > 0) {
      return this.cache.rate;
    }

    try {
      console.log('[ExchangeRateService] Actualizando tasa de cambio USD/EUR');
      const response = await fetch(this.config.baseUrl);

      if (response.ok) {
        const data = await response.json();
        this.cache.rate = data.rates?.EUR || this.config.defaultUsdToEur;
        this.cache.lastUpdate = now;
        console.log(`[ExchangeRateService] Tasa USD/EUR actualizada: ${this.cache.rate}`);
      }
    } catch (error) {
      console.log('[ExchangeRateService] Error obteniendo tasa, usando caché:', this.cache.rate);
    }

    return this.cache.rate;
  }

  /**
   * Convierte un valor de USD a EUR
   */
  async convertUsdToEur(usdAmount: number): Promise<number> {
    const rate = await this.getUsdToEurRate();
    return usdAmount * rate;
  }

  /**
   * Obtiene la tasa actual del caché sin hacer fetch
   */
  getCachedRate(): number {
    return this.cache.rate;
  }

  /**
   * Fuerza una actualización de la tasa
   */
  async forceUpdate(): Promise<number> {
    this.cache.lastUpdate = 0;
    return this.getUsdToEurRate();
  }
}

// Exportar instancia singleton
export const exchangeRateService = new ExchangeRateService();
