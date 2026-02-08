/**
 * Alerts Routes
 * Endpoints para gestionar alertas de precio
 */

import { Request, Response, Router } from 'express';
import { logger } from '../middleware/logger.js';
import { alertsService } from '../services/alerts/alerts.service.js';

const router = Router();

/**
 * GET /api/alerts
 * Obtener todas las alertas activas
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const alerts = await alertsService.getActiveAlerts();
    res.json({
      success: true,
      count: alerts.length,
      alerts,
    });
  } catch (error: any) {
    logger.error('[AlertsRoute] Error getting alerts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/alerts/symbol/:symbol
 * Obtener alertas para un símbolo específico
 */
router.get('/symbol/:symbol', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const alerts = await alertsService.getAlertsForSymbol(symbol);
    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      count: alerts.length,
      alerts,
    });
  } catch (error: any) {
    logger.error(`[AlertsRoute] Error getting alerts for ${req.params.symbol}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/alerts/triggered
 * Obtener historial de alertas disparadas
 */
router.get('/triggered', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const alerts = await alertsService.getTriggeredAlerts(limit);
    res.json({
      success: true,
      count: alerts.length,
      alerts,
    });
  } catch (error: any) {
    logger.error('[AlertsRoute] Error getting triggered alerts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/alerts
 * Crear una nueva alerta
 * Body: { symbol, assetName, targetPrice?, percentChange?, condition, currentPrice, note?, expiresAt? }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { symbol, assetName, targetPrice, percentChange, condition, currentPrice, note, expiresAt } = req.body;

    if (!symbol || !condition || !currentPrice) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere symbol, condition y currentPrice',
      });
    }

    if (!targetPrice && !percentChange) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere targetPrice o percentChange',
      });
    }

    if (!['above', 'below'].includes(condition)) {
      return res.status(400).json({
        success: false,
        error: 'condition debe ser "above" o "below"',
      });
    }

    const alert = await alertsService.createAlert({
      symbol,
      assetName: assetName || symbol,
      targetPrice,
      percentChange,
      condition,
      currentPrice,
      note,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });

    res.status(201).json({
      success: true,
      alert,
    });
  } catch (error: any) {
    logger.error('[AlertsRoute] Error creating alert:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/alerts/:id
 * Eliminar una alerta
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const success = await alertsService.deleteAlert(id);
    
    if (success) {
      res.json({ success: true, message: 'Alerta eliminada' });
    } else {
      res.status(404).json({ success: false, error: 'Alerta no encontrada' });
    }
  } catch (error: any) {
    logger.error(`[AlertsRoute] Error deleting alert ${req.params.id}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/alerts/:id/deactivate
 * Desactivar una alerta (soft delete)
 */
router.patch('/:id/deactivate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const success = await alertsService.deactivateAlert(id);
    
    if (success) {
      res.json({ success: true, message: 'Alerta desactivada' });
    } else {
      res.status(404).json({ success: false, error: 'Alerta no encontrada' });
    }
  } catch (error: any) {
    logger.error(`[AlertsRoute] Error deactivating alert ${req.params.id}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
