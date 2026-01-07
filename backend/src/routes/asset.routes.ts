import { Router } from 'express';
import { assetController } from '../controllers/asset.controller.js';

const router = Router();

// GET /api/assets - Lista completa de activos
router.get('/', assetController.getAll);

// GET /api/assets/search?q=AAPL
router.get('/search', assetController.search);

// GET /api/assets/:symbol/quote
router.get('/:symbol/quote', assetController.getQuote);

// GET /api/assets/:symbol/history?range=1mo&interval=1d
router.get('/:symbol/history', assetController.getHistory);

export const assetRoutes = router;
