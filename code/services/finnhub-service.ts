import { appConfig } from '../config/app-config';
import { MarketData } from '../types';

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
// Usamos un proxy CORS para acceder a Yahoo Finance desde el navegador
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';
const YAHOO_FINANCE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
// API gratuita para tasas de cambio
const EXCHANGE_RATE_API = 'https://api.exchangerate-api.com/v4/latest/USD';

class FinnhubService {
    // Cache para la tasa de cambio (se actualiza cada hora)
    private usdToEurRate: number = 0.86;
    private lastRateUpdate: number = 0;
    private readonly RATE_CACHE_DURATION = 60 * 60 * 1000; // 1 hora

    private getApiKey(): string {
        const apiKey = appConfig.finnhubApiKey;
        if (!apiKey || apiKey === 'TU_FINNHUB_API_KEY') {
            throw new Error(
                'API Key de Finnhub no configurada.\n\n' +
                '1. Ve a https://finnhub.io/register\n' +
                '2. Regístrate GRATIS\n' +
                '3. Copia tu API Key\n' +
                '4. Añádela al archivo .env como EXPO_PUBLIC_FINNHUB_API_KEY'
            );
        }
        return apiKey;
    }

    // Detectar si es un símbolo europeo
    private isEuropeanSymbol(symbol: string): boolean {
        const europeanSuffixes = ['.MC', '.PA', '.DE', '.L', '.MI', '.AS', '.SW', '.VI', '.BR', '.LS', '.WA'];
        return europeanSuffixes.some(suffix => symbol.toUpperCase().endsWith(suffix));
    }

    // Obtener precio via Yahoo Finance con proxy CORS (para acciones europeas)
    async getYahooQuote(symbol: string): Promise<MarketData> {
        try {
            console.log(`[FinnhubService] Intentando Yahoo Finance para ${symbol}`);
            
            // Construir la URL de Yahoo Finance y pasarla por el proxy CORS
            const yahooUrl = `${YAHOO_FINANCE_URL}/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
            const proxyUrl = `${CORS_PROXY}${encodeURIComponent(yahooUrl)}`;
            
            console.log(`[FinnhubService] URL con proxy:`, proxyUrl);
            
            const response = await fetch(proxyUrl);

            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            const result = data.chart?.result?.[0];
            
            if (!result) {
                throw new Error(`No se encontraron datos para ${symbol}`);
            }

            const meta = result.meta;
            const quote = result.indicators?.quote?.[0];

            return {
                symbol: symbol.toUpperCase(),
                name: meta.longName || meta.shortName || meta.symbol || symbol.toUpperCase(),
                price: meta.regularMarketPrice || 0,
                change: (meta.regularMarketPrice - meta.previousClose) || 0,
                changePercent: meta.previousClose ? ((meta.regularMarketPrice - meta.previousClose) / meta.previousClose * 100) : 0,
                volume: meta.regularMarketVolume,
                marketCap: undefined,
                lastUpdated: new Date(),
                high: meta.regularMarketDayHigh || quote?.high?.[0],
                low: meta.regularMarketDayLow || quote?.low?.[0],
                open: meta.regularMarketOpen || quote?.open?.[0],
                previousClose: meta.previousClose,
            };
        } catch (error: any) {
            console.error('[FinnhubService] Error fetching Yahoo quote:', error);
            throw new Error(`Error al obtener datos de ${symbol}: ${error.message}`);
        }
    }

    // Obtener precio de una acción (Finnhub para US, Yahoo para Europa)
    async getStockQuote(symbol: string): Promise<MarketData> {
        // Si es símbolo europeo, usar Yahoo Finance directamente
        if (this.isEuropeanSymbol(symbol)) {
            console.log(`[FinnhubService] Símbolo europeo detectado: ${symbol}, usando Yahoo Finance`);
            return this.getYahooQuote(symbol);
        }

        // Intentar con Finnhub primero para acciones US
        try {
            const apiKey = this.getApiKey();
            const response = await fetch(
                `${FINNHUB_BASE_URL}/quote?symbol=${symbol.toUpperCase()}&token=${apiKey}`
            );

            if (!response.ok) {
                // Si Finnhub falla, intentar con Yahoo
                console.log(`[FinnhubService] Finnhub falló para ${symbol}, intentando Yahoo`);
                return this.getYahooQuote(symbol);
            }

            const data = await response.json();

            // Si no hay datos o hay error de acceso, intentar Yahoo
            if (data.error || (data.c === 0 && data.h === 0)) {
                console.log(`[FinnhubService] Sin datos en Finnhub para ${symbol}, intentando Yahoo`);
                return this.getYahooQuote(symbol);
            }

            return {
                symbol: symbol.toUpperCase(),
                name: symbol.toUpperCase(),
                price: data.c,
                change: data.d,
                changePercent: data.dp,
                volume: undefined,
                marketCap: undefined,
                lastUpdated: new Date(),
                high: data.h,
                low: data.l,
                open: data.o,
                previousClose: data.pc,
            };
        } catch (error: any) {
            // Fallback a Yahoo Finance
            console.log(`[FinnhubService] Error Finnhub, fallback a Yahoo para ${symbol}`);
            return this.getYahooQuote(symbol);
        }
    }

    // Obtener perfil de una empresa
    async getCompanyProfile(symbol: string): Promise<any> {
        try {
            const apiKey = this.getApiKey();
            const response = await fetch(
                `${FINNHUB_BASE_URL}/stock/profile2?symbol=${symbol.toUpperCase()}&token=${apiKey}`
            );

            if (!response.ok) {
                throw new Error(`Error ${response.status}`);
            }

            return await response.json();
        } catch (error: any) {
            console.error('Error fetching company profile:', error);
            return null;
        }
    }

    // Obtener tasa de cambio USD a EUR en tiempo real
    private async getUsdToEurRate(): Promise<number> {
        const now = Date.now();
        
        // Usar caché si es reciente
        if (now - this.lastRateUpdate < this.RATE_CACHE_DURATION && this.usdToEurRate > 0) {
            return this.usdToEurRate;
        }

        try {
            console.log('[FinnhubService] Actualizando tasa de cambio USD/EUR');
            const response = await fetch(EXCHANGE_RATE_API);
            
            if (response.ok) {
                const data = await response.json();
                this.usdToEurRate = data.rates?.EUR || 0.86;
                this.lastRateUpdate = now;
                console.log(`[FinnhubService] Tasa USD/EUR actualizada: ${this.usdToEurRate}`);
            }
        } catch (error) {
            console.log('[FinnhubService] Error obteniendo tasa, usando caché:', this.usdToEurRate);
        }

        return this.usdToEurRate;
    }

    // Obtener precio de crypto en EUROS usando Finnhub + conversión
    async getCryptoQuote(symbol: string): Promise<MarketData> {
        try {
            console.log(`[FinnhubService] Obteniendo crypto ${symbol} via Finnhub`);
            
            // Obtener tasa de cambio actualizada
            const usdToEur = await this.getUsdToEurRate();
            
            const apiKey = this.getApiKey();
            // Finnhub usa formato EXCHANGE:PAIR para crypto
            const cryptoSymbol = symbol.includes(':') ? symbol : `BINANCE:${symbol.toUpperCase()}USDT`;

            const response = await fetch(
                `${FINNHUB_BASE_URL}/quote?symbol=${cryptoSymbol}&token=${apiKey}`
            );

            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            if (data.c === 0) {
                throw new Error(`No se encontraron datos para ${symbol}`);
            }

            // Convertir de USD a EUR usando la tasa en tiempo real
            const priceEUR = data.c * usdToEur;
            const changeEUR = (data.d || 0) * usdToEur;
            const highEUR = data.h * usdToEur;
            const lowEUR = data.l * usdToEur;
            const openEUR = data.o * usdToEur;
            const prevCloseEUR = data.pc * usdToEur;

            return {
                symbol: symbol.toUpperCase(),
                name: this.getCryptoFullName(symbol),
                price: priceEUR,
                change: changeEUR,
                changePercent: data.dp || 0, // El porcentaje no cambia con la conversión
                volume: undefined,
                marketCap: undefined,
                lastUpdated: new Date(),
                high: highEUR,
                low: lowEUR,
                open: openEUR,
                previousClose: prevCloseEUR,
            };
        } catch (error: any) {
            console.error('[FinnhubService] Error fetching crypto quote:', error);
            throw new Error(`Error al obtener datos de ${symbol}: ${error.message}`);
        }
    }

    // Obtener nombre completo de la criptomoneda
    private getCryptoFullName(symbol: string): string {
        const cryptoNames: { [key: string]: string } = {
            'BTC': 'Bitcoin',
            'ETH': 'Ethereum',
            'SOL': 'Solana',
            'ADA': 'Cardano',
            'XRP': 'Ripple',
            'DOGE': 'Dogecoin',
            'DOT': 'Polkadot',
            'MATIC': 'Polygon',
            'LINK': 'Chainlink',
            'AVAX': 'Avalanche',
            'LTC': 'Litecoin',
            'SHIB': 'Shiba Inu',
            'UNI': 'Uniswap',
            'BNB': 'Binance Coin',
        };
        return cryptoNames[symbol.toUpperCase()] || symbol.toUpperCase();
    }

    // Obtener noticias del mercado
    async getMarketNews(category: 'general' | 'forex' | 'crypto' | 'merger' = 'general'): Promise<any[]> {
        try {
            const apiKey = this.getApiKey();
            const response = await fetch(
                `${FINNHUB_BASE_URL}/news?category=${category}&token=${apiKey}`
            );

            if (!response.ok) {
                throw new Error(`Error ${response.status}`);
            }

            const news = await response.json();
            return news.slice(0, 5); // Retornar solo las 5 primeras noticias
        } catch (error: any) {
            console.error('Error fetching news:', error);
            return [];
        }
    }

    // Obtener noticias de una empresa específica
    async getCompanyNews(symbol: string): Promise<any[]> {
        try {
            const apiKey = this.getApiKey();
            const today = new Date();
            const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

            const from = lastWeek.toISOString().split('T')[0];
            const to = today.toISOString().split('T')[0];

            const response = await fetch(
                `${FINNHUB_BASE_URL}/company-news?symbol=${symbol.toUpperCase()}&from=${from}&to=${to}&token=${apiKey}`
            );

            if (!response.ok) {
                throw new Error(`Error ${response.status}`);
            }

            const news = await response.json();
            return news.slice(0, 5);
        } catch (error: any) {
            console.error('Error fetching company news:', error);
            return [];
        }
    }

    // Buscar símbolos
    async searchSymbol(query: string): Promise<any[]> {
        try {
            const apiKey = this.getApiKey();
            const response = await fetch(
                `${FINNHUB_BASE_URL}/search?q=${query}&token=${apiKey}`
            );

            if (!response.ok) {
                throw new Error(`Error ${response.status}`);
            }

            const data = await response.json();
            return data.result?.slice(0, 10) || [];
        } catch (error: any) {
            console.error('Error searching symbol:', error);
            return [];
        }
    }

    // Verificar si está configurado
    isConfigured(): boolean {
        return appConfig.finnhubApiKey !== 'TU_FINNHUB_API_KEY' &&
            appConfig.finnhubApiKey !== undefined &&
            appConfig.finnhubApiKey.length > 0;
    }

    // Determinar la moneda basada en el símbolo y tipo
    private getCurrencySymbol(symbol: string, type: 'stock' | 'crypto' = 'stock'): string {
        // Cryptos siempre en euros
        if (type === 'crypto') {
            return '€';
        }
        // Acciones europeas en euros
        if (symbol.endsWith('.MC') || symbol.endsWith('.PA') || symbol.endsWith('.DE') || 
            symbol.endsWith('.MI') || symbol.endsWith('.AS') || symbol.endsWith('.BR') || 
            symbol.endsWith('.LS') || symbol.endsWith('.VI') || symbol.endsWith('.WA')) {
            return '€';
        }
        // Acciones UK en libras
        if (symbol.endsWith('.L')) {
            return '£';
        }
        // Acciones suizas en francos
        if (symbol.endsWith('.SW')) {
            return 'CHF ';
        }
        // Por defecto dólares (acciones US)
        return '$';
    }

    // Obtener datos formateados para el prompt de Gemini
    async getMarketDataForAI(symbol: string, type: 'stock' | 'crypto' = 'stock'): Promise<string> {
        try {
            console.log(`[FinnhubService] Obteniendo datos para ${symbol} (${type})`);
            
            const quote = type === 'crypto'
                ? await this.getCryptoQuote(symbol)
                : await this.getStockQuote(symbol);

            console.log(`[FinnhubService] Quote obtenido:`, quote);

            // Para acciones europeas y crypto no obtenemos perfil de Finnhub
            const isEuropean = this.isEuropeanSymbol(symbol);
            const profile = (type === 'stock' && !isEuropean) ? await this.getCompanyProfile(symbol) : null;
            
            // Noticias solo para acciones US (Finnhub no tiene acceso a crypto news en free tier)
            const news = (type === 'stock' && !isEuropean)
                ? await this.getCompanyNews(symbol)
                : [];

            const currency = this.getCurrencySymbol(symbol, type);
            const displayName = quote.name || symbol.toUpperCase();

            let dataString = `
📊 DATOS EN TIEMPO REAL DE ${displayName} (${symbol.toUpperCase()}):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 Precio actual: ${currency}${quote.price?.toLocaleString() || 'N/A'}
📈 Cambio: ${quote.change >= 0 ? '+' : ''}${quote.change?.toFixed(2) || '0.00'} (${quote.changePercent >= 0 ? '+' : ''}${quote.changePercent?.toFixed(2) || '0.00'}%)
🔼 Máximo del día: ${currency}${quote.high?.toLocaleString() || 'N/A'}
🔽 Mínimo del día: ${currency}${quote.low?.toLocaleString() || 'N/A'}
🔓 Apertura: ${currency}${quote.open?.toLocaleString() || 'N/A'}
🔒 Cierre anterior: ${currency}${quote.previousClose?.toLocaleString() || 'N/A'}
${quote.volume ? `📊 Volumen: ${quote.volume.toLocaleString()}` : ''}
⏰ Actualizado: ${quote.lastUpdated.toLocaleTimeString()}
`;

            if (profile && profile.name) {
                dataString += `
🏢 PERFIL DE LA EMPRESA:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Nombre: ${profile.name}
Industria: ${profile.finnhubIndustry || 'N/A'}
País: ${profile.country || 'N/A'}
Cap. de Mercado: $${profile.marketCapitalization ? (profile.marketCapitalization / 1000).toFixed(2) + 'B' : 'N/A'}
`;
            }

            if (news && news.length > 0) {
                dataString += `
📰 NOTICIAS RECIENTES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
                news.slice(0, 3).forEach((n: any, i: number) => {
                    dataString += `
${i + 1}. ${n.headline}`;
                });
            }

            return dataString;
        } catch (error: any) {
            console.error(`[FinnhubService] Error obteniendo datos para ${symbol}:`, error);
            return `⚠️ No se pudieron obtener datos en tiempo real para ${symbol}: ${error.message}`;
        }
    }
}

export const finnhubService = new FinnhubService();
