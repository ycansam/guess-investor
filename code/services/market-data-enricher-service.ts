import { extractDirectSymbols, extractWords, normalizeText } from '../utils/text-utils';
import { finnhubService } from './finnhub-service';
import { symbolLookupService } from './symbol-lookup-service';

interface MarketDataResult {
  enrichedMessage: string;
  foundSymbols: string[];
  hasMarketData: boolean;
}

/**
 * Servicio para enriquecer mensajes con datos de mercado
 */
class MarketDataEnricherService {
  /**
   * Enriquece un mensaje del usuario con datos de mercado en tiempo real
   */
  async enrichMessage(userMessage: string): Promise<MarketDataResult> {
    console.log('[MarketDataEnricher] Procesando mensaje:', userMessage);
    
    const normalizedMessage = normalizeText(userMessage);
    const foundSymbols = new Set<string>();
    let marketData = '';
    
    const isFinancialRequest = symbolLookupService.isFinancialRequest(userMessage);
    const isFinnhubConfigured = finnhubService.isConfigured();

    console.log('[MarketDataEnricher] ¿Es petición financiera?', isFinancialRequest);
    console.log('[MarketDataEnricher] Finnhub configurado:', isFinnhubConfigured);

    if (!isFinnhubConfigured) {
      console.log('[MarketDataEnricher] Finnhub NO está configurado');
      return this.buildResult(userMessage, foundSymbols, marketData);
    }

    // 1. Buscar empresas conocidas
    marketData += await this.searchKnownCompanies(normalizedMessage, foundSymbols);

    // 2. Buscar criptomonedas conocidas
    marketData += await this.searchKnownCryptos(normalizedMessage, foundSymbols);

    // 3. Buscar símbolos directos en mayúsculas
    marketData += await this.searchDirectSymbols(userMessage, foundSymbols);

    // 4. Buscar en Finnhub si hay activo específico no encontrado
    if (isFinancialRequest && foundSymbols.size === 0) {
      marketData += await this.searchFinnhub(userMessage, normalizedMessage, foundSymbols);
    }

    console.log(`[MarketDataEnricher] Símbolos encontrados: ${Array.from(foundSymbols).join(', ')}`);
    console.log(`[MarketDataEnricher] ¿Hay datos de mercado? ${marketData.length > 0}`);

    return this.buildResult(userMessage, foundSymbols, marketData);
  }

  private async searchKnownCompanies(
    normalizedMessage: string, 
    foundSymbols: Set<string>
  ): Promise<string> {
    let marketData = '';
    const companySymbols = symbolLookupService.getCompanySymbols();

    for (const [companyName, symbol] of Object.entries(companySymbols)) {
      const normalizedCompany = normalizeText(companyName);
      
      if (normalizedMessage.includes(normalizedCompany) && !foundSymbols.has(symbol)) {
        console.log(`[MarketDataEnricher] Encontrada empresa: ${companyName} -> ${symbol}`);
        foundSymbols.add(symbol);
        
        try {
          const data = await finnhubService.getMarketDataForAI(symbol, 'stock');
          marketData += '\n' + data;
        } catch (e: any) {
          console.log(`[MarketDataEnricher] Error obteniendo datos para ${symbol}:`, e.message);
        }
      }
    }

    return marketData;
  }

  private async searchKnownCryptos(
    normalizedMessage: string, 
    foundSymbols: Set<string>
  ): Promise<string> {
    let marketData = '';
    const cryptoSymbols = symbolLookupService.getCryptoSymbols();

    for (const [cryptoName, symbol] of Object.entries(cryptoSymbols)) {
      const normalizedCrypto = normalizeText(cryptoName);
      
      if (normalizedMessage.includes(normalizedCrypto) && !foundSymbols.has(symbol)) {
        console.log(`[MarketDataEnricher] Encontrada crypto: ${cryptoName} -> ${symbol}`);
        foundSymbols.add(symbol);
        
        try {
          const data = await finnhubService.getMarketDataForAI(symbol, 'crypto');
          marketData += '\n' + data;
        } catch (e: any) {
          console.log(`[MarketDataEnricher] Error obteniendo datos crypto para ${symbol}:`, e.message);
        }
      }
    }

    return marketData;
  }

  private async searchDirectSymbols(
    userMessage: string, 
    foundSymbols: Set<string>
  ): Promise<string> {
    let marketData = '';
    const directSymbols = extractDirectSymbols(userMessage);

    for (const symbol of directSymbols) {
      if (foundSymbols.has(symbol) || symbolLookupService.isCommonUpperWord(symbol)) {
        continue;
      }

      console.log(`[MarketDataEnricher] Probando símbolo directo: ${symbol}`);
      
      try {
        const data = await finnhubService.getMarketDataForAI(symbol, 'stock');
        
        if (!data.includes('No se pudieron obtener') && !data.includes('Error')) {
          console.log(`[MarketDataEnricher] Símbolo válido: ${symbol}`);
          foundSymbols.add(symbol);
          marketData += '\n' + data;
        }
      } catch (e: any) {
        console.log(`[MarketDataEnricher] Símbolo ${symbol} no válido`);
      }
    }

    return marketData;
  }

  private async searchFinnhub(
    userMessage: string,
    normalizedMessage: string,
    foundSymbols: Set<string>
  ): Promise<string> {
    // Solo buscar si menciona un activo específico
    const mentionsKnownAsset = symbolLookupService.mentionsKnownAsset(normalizedMessage);
    const hasDirectSymbol = symbolLookupService.hasDirectSymbol(userMessage);

    if (!mentionsKnownAsset && !hasDirectSymbol) {
      console.log('[MarketDataEnricher] No se detectó activo específico, saltando búsqueda Finnhub');
      return '';
    }

    const stopWords = symbolLookupService.getStopWords();
    const potentialAssets = extractWords(userMessage, stopWords);
    
    console.log('[MarketDataEnricher] Buscando activos potenciales:', potentialAssets);

    for (const word of potentialAssets) {
      if (word.length < 4) continue; // Mínimo 4 caracteres

      try {
        console.log(`[MarketDataEnricher] Buscando en Finnhub: "${word}"`);
        const searchResults = await finnhubService.searchSymbol(word);
        
        if (searchResults.length > 0) {
          const bestMatch = searchResults[0];
          console.log(`[MarketDataEnricher] Resultado:`, bestMatch);
          
          if (bestMatch.symbol && !foundSymbols.has(bestMatch.symbol)) {
            foundSymbols.add(bestMatch.symbol);
            const data = await finnhubService.getMarketDataForAI(bestMatch.symbol, 'stock');
            console.log(`[MarketDataEnricher] Datos obtenidos para ${bestMatch.symbol}`);
            return '\n' + data; // Solo tomar el primer resultado válido
          }
        }
      } catch (e: any) {
        console.log(`[MarketDataEnricher] Error buscando "${word}":`, e.message);
      }
    }

    return '';
  }

  private buildResult(
    userMessage: string, 
    foundSymbols: Set<string>, 
    marketData: string
  ): MarketDataResult {
    const hasMarketData = marketData.length > 0;

    if (hasMarketData) {
      const enrichedMessage = `${userMessage}\n\n--- DATOS DE MERCADO EN TIEMPO REAL (Finnhub API) ---${marketData}\n\nIMPORTANTE: Estos son datos REALES y actualizados. Úsalos en tu respuesta y menciona que son datos en tiempo real.`;
      
      return {
        enrichedMessage,
        foundSymbols: Array.from(foundSymbols),
        hasMarketData: true,
      };
    }

    return {
      enrichedMessage: userMessage,
      foundSymbols: Array.from(foundSymbols),
      hasMarketData: false,
    };
  }
}

// Exportar instancia singleton
export const marketDataEnricherService = new MarketDataEnricherService();
