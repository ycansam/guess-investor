import { Router } from 'express';
import { analysisRoutes } from './analysis.routes.js';
import { assetRoutes } from './asset.routes.js';
import { backtestRoutes } from './backtest.routes.js';
import { favoriteRoutes } from './favorite.routes.js';
import { ipoRoutes } from './ipo.routes.js';
import mlRoutes from './ml.routes.js';
import { newsRoutes } from './news.routes.js';
import { notesRoutes } from './notes.routes.js';
import { predictionRoutes } from './prediction.routes.js';
import { trainingRoutes } from './training.routes.js';

const router = Router();

// Health check
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
router.use('/assets', assetRoutes);
router.use('/favorites', favoriteRoutes);
router.use('/notes', notesRoutes);
router.use('/news', newsRoutes);
router.use('/predictions', predictionRoutes);
router.use('/analysis', analysisRoutes);
router.use('/training', trainingRoutes);
router.use('/ml', mlRoutes);
router.use('/backtest', backtestRoutes);
router.use('/ipo', ipoRoutes);

export const apiRoutes = router;
