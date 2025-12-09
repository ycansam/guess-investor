import { appConfig } from '../config/app-config';
import { MarketData } from '../types';

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

class FinnhubService {
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

    // Obtener precio de una acción
    async getStockQuote(symbol: string): Promise<MarketData> {
        try {
            const apiKey = this.getApiKey();
            const response = await fetch(
                `${FINNHUB_BASE_URL}/quote?symbol=${symbol.toUpperCase()}&token=${apiKey}`
            );

            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            if (data.c === 0 && data.h === 0) {
                throw new Error(`No se encontraron datos para ${symbol}`);
            }

            return {
                symbol: symbol.toUpperCase(),
                name: symbol.toUpperCase(),
                price: data.c, // Current price
                change: data.d, // Change
                changePercent: data.dp, // Change percent
                volume: undefined,
                marketCap: undefined,
                lastUpdated: new Date(),
                high: data.h, // High price of the day
                low: data.l, // Low price of the day
                open: data.o, // Open price
                previousClose: data.pc, // Previous close
            };
        } catch (error: any) {
            console.error('Error fetching stock quote:', error);
            throw new Error(`Error al obtener datos de ${symbol}: ${error.message}`);
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

    // Obtener precio de crypto (formato: BINANCE:BTCUSDT)
    async getCryptoQuote(symbol: string): Promise<MarketData> {
        try {
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

            return {
                symbol: symbol.toUpperCase(),
                name: symbol.toUpperCase(),
                price: data.c,
                change: data.d || 0,
                changePercent: data.dp || 0,
                volume: undefined,
                marketCap: undefined,
                lastUpdated: new Date(),
                high: data.h,
                low: data.l,
                open: data.o,
                previousClose: data.pc,
            };
        } catch (error: any) {
            console.error('Error fetching crypto quote:', error);
            throw new Error(`Error al obtener datos de ${symbol}: ${error.message}`);
        }
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

    // Obtener datos formateados para el prompt de Gemini
    async getMarketDataForAI(symbol: string, type: 'stock' | 'crypto' = 'stock'): Promise<string> {
        try {
            const quote = type === 'crypto'
                ? await this.getCryptoQuote(symbol)
                : await this.getStockQuote(symbol);

            const profile = type === 'stock' ? await this.getCompanyProfile(symbol) : null;
            const news = type === 'stock'
                ? await this.getCompanyNews(symbol)
                : await this.getMarketNews('crypto');

            let dataString = `
📊 DATOS EN TIEMPO REAL DE ${symbol.toUpperCase()}:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 Precio actual: $${quote.price.toLocaleString()}
📈 Cambio: ${quote.change >= 0 ? '+' : ''}${quote.change?.toFixed(2)} (${quote.changePercent >= 0 ? '+' : ''}${quote.changePercent?.toFixed(2)}%)
🔼 Máximo del día: $${quote.high?.toLocaleString()}
🔽 Mínimo del día: $${quote.low?.toLocaleString()}
🔓 Apertura: $${quote.open?.toLocaleString()}
🔒 Cierre anterior: $${quote.previousClose?.toLocaleString()}
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
            return `⚠️ No se pudieron obtener datos en tiempo real para ${symbol}: ${error.message}`;
        }
    }
}

export const finnhubService = new FinnhubService();
