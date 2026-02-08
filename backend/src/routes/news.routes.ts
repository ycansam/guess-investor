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

export const newsRoutes = router;
