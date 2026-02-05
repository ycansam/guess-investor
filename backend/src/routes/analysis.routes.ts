import { Request, Response, Router } from 'express';
import { asyncHandler, BadRequestError } from '../middleware/error-handler.js';
import { broadMarketContextService } from '../services/external/broad-market-context.service.js';
import { forexService } from '../services/external/forex.service.js';
import { macroService } from '../services/external/macro.service.js';
import { newsService } from '../services/external/news.service.js';
import { sentimentService } from '../services/external/sentiment.service.js';
import { technicalService } from '../services/external/technical.service.js';
import { trendsService } from '../services/external/trends.service.js';
import { divergenceService } from '../services/analysis/divergence.service.js';
import { riskRewardService } from '../services/analysis/risk-reward.service.js';
import { optionsFlowService } from '../services/analysis/options-flow.service.js';
import { logger } from '../middleware/logger.js';

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

/**
 * GET /api/analysis/forex/:symbol
 * Análisis de impacto de divisas para un activo
 */
router.get('/forex/:symbol', asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const assetName = (req.query.name as string) || '';
  
  if (!symbol) {
    throw BadRequestError('Symbol is required');
  }

  const forex = await forexService.analyzeForexImpact(symbol.toUpperCase(), assetName);

  res.json({
    success: true,
    data: forex,
  });
}));

/**
 * GET /api/analysis/market-context
 * Contexto actual del mercado global (correcciones, crashes, burbujas, etc.)
 */
router.get('/market-context', asyncHandler(async (req: Request, res: Response) => {
  const forceRefresh = req.query.refresh === 'true';
  
  const context = await broadMarketContextService.getCurrentContext(forceRefresh);

  res.json({
    success: true,
    data: context,
  });
}));

/**
 * GET /api/analysis/divergences/:symbol
 * Detecta divergencias entre precio y indicadores técnicos (RSI, MACD, Stochastic)
 * Usado por: Soros, Tudor Jones para detectar reversiones
 */
router.get('/divergences/:symbol', asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;
  
  if (!symbol) {
    throw BadRequestError('Symbol is required');
  }

  logger.info(`[Analysis] Getting divergences for ${symbol}`);
  const divergences = await divergenceService.getDivergences(symbol.toUpperCase());
  
  res.json({
    success: true,
    data: divergences,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * POST /api/analysis/risk-reward
 * Calcula el Risk/Reward ratio para una operación
 * Body: { symbol, entryPrice?, direction: 'long'|'short', winRate? }
 */
router.post('/risk-reward', asyncHandler(async (req: Request, res: Response) => {
  const { symbol, entryPrice, direction, atr, winRate } = req.body;
  
  if (!symbol || !direction) {
    throw BadRequestError('Symbol and direction are required');
  }

  if (!['long', 'short'].includes(direction)) {
    throw BadRequestError('Direction must be "long" or "short"');
  }

  logger.info(`[Analysis] Calculating R/R for ${symbol} ${direction}`);
  
  const analysis = await riskRewardService.calculate({
    symbol: symbol.toUpperCase(),
    entryPrice,
    direction,
    atr,
    winRate,
  });
  
  res.json({
    success: true,
    data: analysis,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * GET /api/analysis/risk-reward/:symbol/:direction
 * Versión GET simplificada del R/R
 */
router.get('/risk-reward/:symbol/:direction', asyncHandler(async (req: Request, res: Response) => {
  const { symbol, direction } = req.params;
  
  if (!['long', 'short'].includes(direction)) {
    throw BadRequestError('Direction must be "long" or "short"');
  }

  logger.info(`[Analysis] Calculating R/R for ${symbol} ${direction}`);
  
  const analysis = await riskRewardService.calculate({
    symbol: symbol.toUpperCase(),
    direction: direction as 'long' | 'short',
  });
  
  res.json({
    success: true,
    data: analysis,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * GET /api/analysis/options-flow/:symbol
 * Obtiene análisis de flujo de opciones (Put/Call ratio, IV, unusual activity)
 * Usado por: Steve Cohen, James Simons para detectar movimientos institucionales
 */
router.get('/options-flow/:symbol', asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const currentPrice = req.query.price ? parseFloat(req.query.price as string) : undefined;
  
  if (!symbol) {
    throw BadRequestError('Symbol is required');
  }

  logger.info(`[Analysis] Getting options flow for ${symbol}`);
  
  // Si no tenemos precio, intentamos obtenerlo
  let price = currentPrice;
  if (!price) {
    try {
      const quoteUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
      const quoteRes = await fetch(quoteUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(5000),
      });
      const quoteJson = await quoteRes.json();
      price = quoteJson.chart?.result?.[0]?.meta?.regularMarketPrice || 100;
    } catch {
      price = 100;
    }
  }
  
  const optionsFlow = await optionsFlowService.getOptionsFlow(symbol.toUpperCase(), price);
  
  res.json({
    success: true,
    data: optionsFlow,
    currentPrice: price,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * GET /api/analysis/trader-full/:symbol
 * Análisis completo para traders de corto plazo: divergencias + R/R + options flow
 * Inspirado en: Soros, Tudor Jones, Druckenmiller, Simons, Cohen, Livermore
 */
router.get('/trader-full/:symbol', asyncHandler(async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const direction = (req.query.direction as 'long' | 'short') || 'long';
  
  if (!symbol) {
    throw BadRequestError('Symbol is required');
  }

  logger.info(`[Analysis] Full trader analysis for ${symbol.toUpperCase()}`);

  // Primero obtenemos el R/R para tener el precio
  const riskReward = await riskRewardService.calculate({ symbol: symbol.toUpperCase(), direction });

  // Luego ejecutar los otros análisis en paralelo
  const [divergences, optionsFlow] = await Promise.all([
    divergenceService.getDivergences(symbol.toUpperCase()),
    optionsFlowService.getOptionsFlow(symbol.toUpperCase(), riskReward.entryPrice),
  ]);

  // Generar recomendación consolidada
  const recommendation = generateConsolidatedRecommendation(
    divergences,
    riskReward,
    optionsFlow,
    direction
  );

  res.json({
    success: true,
    data: {
      symbol: symbol.toUpperCase(),
      direction,
      divergences,
      riskReward,
      optionsFlow,
      recommendation,
    },
    timestamp: new Date().toISOString(),
  });
}));

/**
 * Genera una recomendación consolidada basada en todos los análisis
 */
function generateConsolidatedRecommendation(
  divergences: any,
  riskReward: any,
  optionsFlow: any,
  direction: 'long' | 'short'
): {
  action: 'strong_entry' | 'entry' | 'wait' | 'avoid';
  confidence: number;
  reasons: string[];
  warnings: string[];
} {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 50;

  // Analizar divergencias
  if (divergences.hasDivergence) {
    if (divergences.type === 'bullish' && direction === 'long') {
      score += 15;
      reasons.push(`✅ Divergencia alcista en ${divergences.indicator} (fuerza: ${divergences.strength})`);
    } else if (divergences.type === 'bearish' && direction === 'short') {
      score += 15;
      reasons.push(`✅ Divergencia bajista en ${divergences.indicator} (fuerza: ${divergences.strength})`);
    } else if (divergences.hasDivergence) {
      score -= 10;
      warnings.push(`⚠️ Divergencia ${divergences.type} contradice dirección ${direction}`);
    }
  }

  // Analizar Risk/Reward
  if (riskReward.riskRewardRatio >= 3) {
    score += 20;
    reasons.push(`✅ Excelente R/R: ${riskReward.riskRewardRatio.toFixed(1)}:1`);
  } else if (riskReward.riskRewardRatio >= 2) {
    score += 10;
    reasons.push(`✅ Buen R/R: ${riskReward.riskRewardRatio.toFixed(1)}:1`);
  } else if (riskReward.riskRewardRatio < 1.5) {
    score -= 15;
    warnings.push(`⚠️ R/R bajo: ${riskReward.riskRewardRatio.toFixed(1)}:1`);
  }

  if (riskReward.tradeQuality === 'excellent') {
    score += 10;
  } else if (riskReward.tradeQuality === 'poor') {
    score -= 10;
    warnings.push('⚠️ Calidad de trade: pobre');
  }

  // Analizar Options Flow
  if (optionsFlow.hasData) {
    if (optionsFlow.overallSignal === 'bullish' && direction === 'long') {
      score += 10;
      reasons.push(`✅ Options flow alcista (P/C: ${optionsFlow.putCallRatio.toFixed(2)})`);
    } else if (optionsFlow.overallSignal === 'bearish' && direction === 'short') {
      score += 10;
      reasons.push(`✅ Options flow bajista (P/C: ${optionsFlow.putCallRatio.toFixed(2)})`);
    } else if (optionsFlow.overallSignal !== 'neutral') {
      score -= 5;
      warnings.push(`⚠️ Options flow ${optionsFlow.overallSignal} contradice dirección`);
    }

    if (optionsFlow.unusualActivity) {
      reasons.push(`🔔 ${optionsFlow.unusualSignal}`);
    }
  }

  // Determinar acción
  let action: 'strong_entry' | 'entry' | 'wait' | 'avoid';
  if (score >= 75) action = 'strong_entry';
  else if (score >= 55) action = 'entry';
  else if (score >= 40) action = 'wait';
  else action = 'avoid';

  if (riskReward.warnings) warnings.push(...riskReward.warnings);

  return {
    action,
    confidence: Math.min(95, Math.max(20, score)),
    reasons,
    warnings,
  };
}

export const analysisRoutes = router;