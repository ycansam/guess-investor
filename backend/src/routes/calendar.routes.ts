/**
 * Economic Calendar Routes
 */

import { Request, Response, Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
import { logger } from '../middleware/logger.js';
import { economicCalendarService } from '../services/external/economic-calendar.service.js';

const router = Router();

/**
 * GET /api/calendar
 * Obtiene el calendario económico
 */
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  logger.info('[Calendar Routes] Fetching economic calendar');

  const data = await economicCalendarService.getCalendar();

  res.json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * POST /api/calendar/clear-cache
 */
router.post('/clear-cache', asyncHandler(async (_req: Request, res: Response) => {
  economicCalendarService.clearCache();

  res.json({
    success: true,
    message: 'Calendar cache cleared',
    timestamp: new Date().toISOString(),
  });
}));

export const calendarRoutes = router;
