import { Router } from 'express';
import { analysisRoutes } from './analysis.routes.js';
import { assetRoutes } from './asset.routes.js';
import { favoriteRoutes } from './favorite.routes.js';
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
router.use('/predictions', predictionRoutes);
router.use('/analysis', analysisRoutes);
router.use('/training', trainingRoutes);

export const apiRoutes = router;
