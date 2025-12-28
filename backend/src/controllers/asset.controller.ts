import { Request, Response } from 'express';
import { asyncHandler, NotFoundError } from '../middleware/error-handler.js';
import { yahooService } from '../services/external/yahoo.service.js';

export const assetController = {
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
   * Buscar activos
   */
  search: asyncHandler(async (req: Request, res: Response) => {
    const { q } = req.query;
    
    if (!q || typeof q !== 'string') {
      res.json({ success: true, data: [] });
      return;
    }

    const results = await yahooService.search(q);

    res.json({
      success: true,
      data: results,
    });
  }),
};
