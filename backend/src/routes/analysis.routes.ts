import { Request, Response, Router } from 'express';
import { asyncHandler, BadRequestError } from '../middleware/error-handler.js';
import { macroService } from '../services/external/macro.service.js';
import { newsService } from '../services/external/news.service.js';
import { sentimentService } from '../services/external/sentiment.service.js';
import { technicalService } from '../services/external/technical.service.js';
import { trendsService } from '../services/external/trends.service.js';

const router = Router();

/**
 * GET /api/analysis/technical/:symbol
 * Análisis técnico completo
 */
router.get('/technical/:symbol', asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;
  
  if (!symbol) {
    throw BadRequestError('Symbol is required');
  }

  const analysis = await technicalService.analyze(symbol.toUpperCase());

  res.json({
    success: true,
    data: analysis,
  });
}));

/**
 * GET /api/analysis/news/:symbol
 * Noticias y análisis de sentimiento
 */
router.get('/news/:symbol', asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const type = (req.query.type as string) || 'stock';
  
  if (!symbol) {
    throw BadRequestError('Symbol is required');
  }

  const news = await newsService.getNews(symbol.toUpperCase(), type as 'stock' | 'crypto');

  res.json({
    success: true,
    data: news,
  });
}));

/**
 * GET /api/analysis/sentiment/:symbol
 * Sentimiento del mercado (VIX, Fear & Greed)
 */
router.get('/sentiment/:symbol', asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const type = (req.query.type as string) || 'stock';
  
  if (!symbol) {
    throw BadRequestError('Symbol is required');
  }

  const sentiment = await sentimentService.getSentiment(symbol.toUpperCase(), type as 'stock' | 'crypto');

  res.json({
    success: true,
    data: sentiment,
  });
}));

/**
 * GET /api/analysis/macro/:symbol
 * Indicadores macroeconómicos
 */
router.get('/macro/:symbol', asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const type = (req.query.type as string) || 'stock';
  
  if (!symbol) {
    throw BadRequestError('Symbol is required');
  }

  const macro = await macroService.getIndicators(symbol.toUpperCase(), type as 'stock' | 'crypto');

  res.json({
    success: true,
    data: macro,
  });
}));

/**
 * GET /api/analysis/full/:symbol
 * Análisis completo (todos los datos de una vez)
 */
router.get('/full/:symbol', asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const type = (req.query.type as string) || 'stock';
  
  if (!symbol) {
    throw BadRequestError('Symbol is required');
  }

  const symbolUpper = symbol.toUpperCase();
  const assetType = type as 'stock' | 'crypto';

  // Obtener todos los datos en paralelo
  const [technical, news, sentiment, macro] = await Promise.all([
    technicalService.analyze(symbolUpper),
    newsService.getNews(symbolUpper, assetType),
    sentimentService.getSentiment(symbolUpper, assetType),
    macroService.getIndicators(symbolUpper, assetType),
  ]);

  res.json({
    success: true,
    data: {
      symbol: symbolUpper,
      type: assetType,
      technical,
      news,
      sentiment,
      macro,
      analyzedAt: new Date().toISOString(),
    },
  });
}));

/**
 * GET /api/analysis/trends/:symbol
 * Análisis de tendencias: rachas, momentum, soportes/resistencias
 */
router.get('/trends/:symbol', asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;
  
  if (!symbol) {
    throw BadRequestError('Symbol is required');
  }

  const trends = await trendsService.analyzeTrend(symbol.toUpperCase());

  if (!trends) {
    res.json({
      success: false,
      error: 'No trend data available for this symbol',
    });
    return;
  }

  res.json({
    success: true,
    data: trends,
  });
}));

/**
 * GET /api/analysis/top-trends
 * Ranking de activos por tendencia
 * Query params:
 *   - category: 'gainers' | 'losers' | 'streaks' | 'momentum' | 'all' (default: 'all')
 *   - limit: number (default: 20, max: 50)
 */
router.get('/top-trends', asyncHandler(async (req: Request, res: Response) => {
  const category = (req.query.category as string) || 'all';
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
  
  const validCategories = ['gainers', 'losers', 'streaks', 'momentum', 'all'];
  if (!validCategories.includes(category)) {
    throw BadRequestError(`Invalid category. Must be one of: ${validCategories.join(', ')}`);
  }

  const trends = await trendsService.getTopTrends(
    category as 'gainers' | 'losers' | 'streaks' | 'momentum' | 'all',
    limit
  );

  res.json({
    success: true,
    data: {
      category,
      count: trends.length,
      trends,
      analyzedAt: new Date().toISOString(),
    },
  });
}));

export const analysisRoutes = router;
