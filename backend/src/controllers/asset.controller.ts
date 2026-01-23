import { Request, Response } from 'express';
import { searchTradeRepublicAssets, tradeRepublicAssets } from '../data/trade-republic-assets.js';
import { asyncHandler, NotFoundError } from '../middleware/error-handler.js';
import { historyCacheService } from '../services/external/history-cache.service.js';
import { investorInfoService } from '../services/external/investor-info.service.js';
import { yahooService } from '../services/external/yahoo.service.js';

export const assetController = {
  /**
   * GET /api/assets
   * Obtener lista de todos los activos disponibles
   */
  getAll: asyncHandler(async (_req: Request, res: Response) => {
    // Devolver todos los activos de Trade Republic formateados
    const assets = tradeRepublicAssets.map(asset => ({
      symbol: asset.symbol,
      name: asset.name,
      type: asset.type.toLowerCase(),
      category: asset.category || 'other',
      icon: getAssetIcon(asset.category, asset.type),
    }));

    res.json({
      success: true,
      data: assets,
    });
  }),

  /**
   * GET /api/assets/:symbol/quote
   * Obtener cotización actual
   */
  getQuote: asyncHandler(async (req: Request, res: Response) => {
    const { symbol } = req.params;
    
    const quote = await yahooService.getQuote(symbol.toUpperCase());
    
    if (!quote) {
      throw NotFoundError(`Quote for ${symbol}`);
    }

    res.json({
      success: true,
      data: quote,
    });
  }),

  /**
   * GET /api/assets/:symbol/history
   * Obtener datos históricos
   */
  getHistory: asyncHandler(async (req: Request, res: Response) => {
    const { symbol } = req.params;
    const { range = '1mo', interval = '1d' } = req.query;
    
    const history = await yahooService.getHistory(
      symbol.toUpperCase(),
      range as '1d' | '5d' | '1mo' | '3mo',
      interval as '1m' | '5m' | '15m' | '1h' | '1d'
    );

    res.json({
      success: true,
      data: {
        symbol: symbol.toUpperCase(),
        range,
        interval,
        count: history.length,
        prices: history,
      },
    });
  }),

  /**
   * GET /api/assets/search
   * Buscar activos (combina Yahoo Finance + Trade Republic)
   */
  search: asyncHandler(async (req: Request, res: Response) => {
    const { q } = req.query;
    
    if (!q || typeof q !== 'string') {
      res.json({ success: true, data: [] });
      return;
    }

    // Buscar en paralelo: Yahoo Finance + Trade Republic
    const [yahooResults, trAssets] = await Promise.all([
      yahooService.search(q),
      Promise.resolve(searchTradeRepublicAssets(q)),
    ]);

    // Convertir activos de Trade Republic al formato de respuesta
    const trResults = trAssets.map(asset => ({
      symbol: asset.symbol,
      name: asset.name,
      type: asset.type,
      exchange: 'Trade Republic',
    }));

    // Combinar resultados evitando duplicados (priorizar Trade Republic)
    const seenSymbols = new Set<string>();
    const combined: Array<{ symbol: string; name: string; type: string; exchange?: string }> = [];

    // Primero los de Trade Republic (tienen mejor nombre/descripción)
    for (const result of trResults) {
      const key = result.symbol.toUpperCase();
      if (!seenSymbols.has(key)) {
        seenSymbols.add(key);
        combined.push(result);
      }
    }

    // Luego los de Yahoo Finance
    for (const result of yahooResults) {
      const key = result.symbol.toUpperCase();
      if (!seenSymbols.has(key)) {
        seenSymbols.add(key);
        combined.push(result);
      }
    }

    // Limitar a 20 resultados
    res.json({
      success: true,
      data: combined.slice(0, 20),
    });
  }),

  /**
   * DELETE /api/assets/:symbol/cache
   * Limpiar caché de historial para un símbolo
   */
  clearCache: asyncHandler(async (req: Request, res: Response) => {
    const { symbol } = req.params;
    
    const cleared = historyCacheService.clearSymbol(symbol);
    
    res.json({
      success: true,
      data: {
        symbol: symbol.toUpperCase(),
        clearedEntries: cleared,
        message: cleared > 0 
          ? `Cache cleared for ${symbol.toUpperCase()}` 
          : `No cache entries found for ${symbol.toUpperCase()}`,
      },
    });
  }),

  /**
   * GET /api/assets/cache/stats
   * Obtener estadísticas del caché
   */
  getCacheStats: asyncHandler(async (_req: Request, res: Response) => {
    const stats = historyCacheService.getStats();
    
    res.json({
      success: true,
      data: stats,
    });
  }),

  /**
   * DELETE /api/assets/cache
   * Limpiar todo el caché de historial
   */
  clearAllCache: asyncHandler(async (_req: Request, res: Response) => {
    const statsBefore = historyCacheService.getStats();
    historyCacheService.clear();
    
    res.json({
      success: true,
      data: {
        clearedEntries: statsBefore.entries,
        message: 'All history cache cleared',
      },
    });
  }),

  /**
   * GET /api/assets/:symbol/investor-info
   * Obtener información detallada para inversores (earnings, dividendos, valoración, etc.)
   */
  getInvestorInfo: asyncHandler(async (req: Request, res: Response) => {
    const { symbol } = req.params;
    
    // Primero obtener la cotización actual para tener el precio
    const quote = await yahooService.getQuote(symbol.toUpperCase());
    
    if (!quote) {
      throw NotFoundError(`Quote for ${symbol}`);
    }

    // Obtener información del inversor
    const investorInfo = await investorInfoService.getInvestorInfo(
      symbol.toUpperCase(),
      quote.price,
      quote.name
    );

    if (!investorInfo) {
      // Para cryptos u otros activos sin esta información
      res.json({
        success: true,
        data: null,
        message: 'Investor info not available for this asset type',
      });
      return;
    }

    res.json({
      success: true,
      data: investorInfo,
    });
  }),
};

// Helper para obtener icono según categoría/tipo
function getAssetIcon(category?: string, type?: string): string {
  const iconMap: Record<string, string> = {
    // Categorías
    gold: '🥇',
    silver: '🥈',
    platinum: '💎',
    palladium: '⚪',
    metals: '🏆',
    oil: '🛢️',
    gas: '🔥',
    world: '🌍',
    usa: '🇺🇸',
    europe: '🇪🇺',
    emerging: '🌏',
    tech: '💻',
    bonds: '📜',
    dividend: '💰',
    'clean-energy': '☀️',
    esg: '🌱',
    'small-cap': '📈',
    semiconductors: '🔬',
    crypto: '₿',
    'stock-eu': '🏢',
    // Tipos
    etc: '📊',
    etf: '📈',
    stock: '🏢',
  };
  
  return iconMap[category || ''] || iconMap[type?.toLowerCase() || ''] || '📊';
}
