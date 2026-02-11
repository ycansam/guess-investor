/**
 * Extended Hours (Pre-Market & After-Hours) Routes
 */

import { Request, Response, Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
import { logger } from '../middleware/logger.js';
import { extendedHoursService } from '../services/external/extended-hours.service.js';

const router = Router();

/**
 * GET /api/movers
 * Obtiene pre-market & after-hours movers
 */
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  logger.info('[Movers Routes] Fetching extended hours movers');

  const data = await extendedHoursService.getMovers();

  res.json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * POST /api/movers/clear-cache
 */
router.post('/clear-cache', asyncHandler(async (_req: Request, res: Response) => {
  extendedHoursService.clearCache();

  res.json({
    success: true,
    message: 'Movers cache cleared',
    timestamp: new Date().toISOString(),
  });
}));

export const moversRoutes = router;
