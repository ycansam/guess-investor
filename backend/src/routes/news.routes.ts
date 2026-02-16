import { Request, Response, Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
import { logger } from '../middleware/logger.js';
import { marketImpactNewsService } from '../services/external/market-impact-news.service.js';

const router = Router();

/**
 * GET /api/news/market-impact
 * Obtiene noticias de alto impacto con activos afectados
 */
router.get('/market-impact', asyncHandler(async (_req: Request, res: Response) => {
  logger.info('[NewsRoutes] Fetching market impact news');
  
  const news = await marketImpactNewsService.getMarketImpactNews();
  
  res.json({
    success: true,
    data: news,
    count: news.length,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * GET /api/news/symbol/:symbol
 * Obtiene noticias específicas para un símbolo
 * Query params: companyName (opcional)
 */
router.get('/symbol/:symbol', asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const companyName = req.query.companyName as string | undefined;
  
  logger.info(`[NewsRoutes] Fetching news for symbol: ${symbol}`);
  
  const news = await marketImpactNewsService.getNewsForSymbol(symbol.toUpperCase(), companyName);
  
  res.json({
    success: true,
    data: news,
    count: news.length,
    symbol: symbol.toUpperCase(),
    timestamp: new Date().toISOString(),
  });
}));

/**
 * GET /api/news/sentiment/:symbol
 * Obtiene resumen de sentimiento de noticias para un símbolo
 * Útil para ajustar confianza de predicciones
 * Query params: companyName (opcional)
 */
router.get('/sentiment/:symbol', asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const companyName = req.query.companyName as string | undefined;
  
  logger.info(`[NewsRoutes] Fetching sentiment summary for symbol: ${symbol}`);
  
  const summary = await marketImpactNewsService.getNewsSentimentSummary(symbol.toUpperCase(), companyName);
  
  res.json({
    success: true,
    data: summary,
    symbol: symbol.toUpperCase(),
    timestamp: new Date().toISOString(),
  });
}));

export const newsRoutes = router;
