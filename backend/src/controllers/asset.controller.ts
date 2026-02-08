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
   * GET /api/assets/paginated
   * Obtener lista paginada de activos con opción de búsqueda dinámica
   */
  getPaginated: asyncHandler(async (req: Request, res: Response) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(50, Math.max(10, parseInt(req.query.pageSize as string) || 20));
    const category = req.query.category as string | undefined;
    const search = req.query.search as string | undefined;

    // Filtrar activos por categoría si se especifica
    let filteredAssets = tradeRepublicAssets;
    if (category) {
      filteredAssets = filteredAssets.filter(a => a.category === category);
    }

    // Si hay búsqueda, usar la función de búsqueda
    if (search && search.trim()) {
      const searchResults = searchTradeRepublicAssets(search);
      // Combinar con búsqueda en Yahoo para más resultados
      try {
        const yahooResults = await yahooService.search(search);
        const seenSymbols = new Set(searchResults.map(a => a.symbol.toUpperCase()));
        
        // Añadir resultados de Yahoo que no estén ya
        for (const yResult of yahooResults) {
          if (!seenSymbols.has(yResult.symbol.toUpperCase())) {
            seenSymbols.add(yResult.symbol.toUpperCase());
            // Convertir resultado de Yahoo a formato TradeRepublicAsset compatible
            searchResults.push({
              symbol: yResult.symbol,
              name: yResult.name,
              type: yResult.type || 'STOCK',
              category: detectCategory(yResult.symbol, yResult.type),
              keywords: [yResult.symbol.toLowerCase(), yResult.name.toLowerCase()],
            });
          }
        }
      } catch {
        // Si falla Yahoo, seguir solo con resultados locales
      }
      
      filteredAssets = searchResults as typeof filteredAssets;
    }

    const total = filteredAssets.length;
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const pageAssets = filteredAssets.slice(startIndex, endIndex);
    const hasMore = endIndex < total;

    const assets = pageAssets.map(asset => ({
      symbol: asset.symbol,
      name: asset.name,
      type: asset.type.toLowerCase(),
      category: asset.category || 'other',
      icon: getAssetIcon(asset.category, asset.type),
    }));

    res.json({
      success: true,
      data: assets,
      pagination: {
        page,
        pageSize,
        total,
        hasMore,
        totalPages: Math.ceil(total / pageSize),
      },
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
    const { q, limit } = req.query;
    
    if (!q || typeof q !== 'string') {
      res.json({ success: true, data: [] });
      return;
    }

    const maxResults = Math.min(parseInt(limit as string) || 30, 50); // Max 50 resultados

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

    // Ordenar: primero los que coinciden exactamente con la búsqueda
    const queryUpper = q.toUpperCase();
    combined.sort((a, b) => {
      const aExact = a.symbol.toUpperCase() === queryUpper || a.symbol.toUpperCase().startsWith(queryUpper);
      const bExact = b.symbol.toUpperCase() === queryUpper || b.symbol.toUpperCase().startsWith(queryUpper);
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return 0;
    });

    res.json({
      success: true,
      data: combined.slice(0, maxResults),
      total: combined.length,
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

// Helper para detectar categoría de un activo basándose en su símbolo y tipo
function detectCategory(symbol: string, type?: string): string {
  const s = symbol.toUpperCase();
  const t = (type || '').toUpperCase();
  
  // Crypto
  if (t === 'CRYPTOCURRENCY' || s.includes('-USD') || s.includes('-EUR')) return 'crypto';
  
  // Índices
  if (s.startsWith('^') || t === 'INDEX') return 'index';
  
  // Futuros
  if (s.includes('=F')) return 'commodity';
  
  // Forex
  if (s.includes('=X') || t === 'FOREX' || t === 'CURRENCY') return 'forex';
  
  // ETFs/ETCs
  if (t === 'ETF' || t === 'ETC') return 'etf';
  
  // Acciones europeas por exchange
  if (s.endsWith('.DE') || s.endsWith('.MC') || s.endsWith('.PA') || 
      s.endsWith('.L') || s.endsWith('.MI') || s.endsWith('.AS') ||
      s.endsWith('.SW')) return 'stock-eu';
  
  // Default: stock US
  return 'stock-us';
}

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
