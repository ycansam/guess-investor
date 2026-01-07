import { Request, Response } from 'express';
import { searchTradeRepublicAssets, tradeRepublicAssets } from '../data/trade-republic-assets.js';
import { asyncHandler, NotFoundError } from '../middleware/error-handler.js';
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
