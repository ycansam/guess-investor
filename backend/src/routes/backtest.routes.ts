/**
 * Backtest Routes
 * Rutas para el servicio de backtesting
 */

import { Router } from 'express';
import { backtestController } from '../controllers/backtest.controller.js';

const router = Router();

// POST /api/backtest - Ejecutar backtest para un símbolo
router.post('/', backtestController.runBacktest);

// GET /api/backtest/summary/:symbol - Resumen multi-timeframe
router.get('/summary/:symbol', backtestController.getSummary);

// POST /api/backtest/batch - Backtest por lotes
router.post('/batch', backtestController.runBatch);

export const backtestRoutes = router;
