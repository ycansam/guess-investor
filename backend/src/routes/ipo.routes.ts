/**
 * IPO Routes
 * 
 * Endpoints para obtener información de IPOs recientes y próximas.
 */

import { Request, Response, Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
import { logger } from '../middleware/logger.js';
import { ipoService } from '../services/external/ipo.service.js';

const router = Router();

/**
 * GET /api/ipo
 * Obtiene todos los datos de IPOs (recientes, próximas, hot)
 */
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  logger.info('[IPO Routes] Fetching all IPO data');

  const data = await ipoService.getIPOData();

  res.json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * POST /api/ipo/clear-cache
 * Limpia el cache de IPOs
 */
router.post('/clear-cache', asyncHandler(async (_req: Request, res: Response) => {
  ipoService.clearCache();

  res.json({
    success: true,
    message: 'IPO cache cleared',
    timestamp: new Date().toISOString(),
  });
}));

export const ipoRoutes = router;
