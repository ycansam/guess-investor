/**
 * Sector Heat Map Routes
 */

import { Request, Response, Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
import { logger } from '../middleware/logger.js';
import { sectorHeatMapService } from '../services/external/sector-heatmap.service.js';

const router = Router();

/**
 * GET /api/sectors
 * Obtiene datos del heat map por sector
 */
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  logger.info('[Sectors Routes] Fetching sector heatmap');

  const data = await sectorHeatMapService.getHeatMap();

  res.json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * POST /api/sectors/clear-cache
 */
router.post('/clear-cache', asyncHandler(async (_req: Request, res: Response) => {
  sectorHeatMapService.clearCache();

  res.json({
    success: true,
    message: 'Sectors cache cleared',
    timestamp: new Date().toISOString(),
  });
}));

export const sectorsRoutes = router;
