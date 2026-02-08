import { Router } from 'express';
import { assetController } from '../controllers/asset.controller.js';

const router = Router();

// GET /api/assets - Lista completa de activos
router.get('/', assetController.getAll);

// GET /api/assets/paginated - Lista paginada de activos
router.get('/paginated', assetController.getPaginated);

// GET /api/assets/search?q=AAPL
router.get('/search', assetController.search);

// GET /api/assets/cache/stats - Estadísticas del caché (ANTES de :symbol)
router.get('/cache/stats', assetController.getCacheStats);

// DELETE /api/assets/cache - Limpiar todo el caché
router.delete('/cache', assetController.clearAllCache);

// GET /api/assets/:symbol/quote
router.get('/:symbol/quote', assetController.getQuote);

// GET /api/assets/:symbol/history?range=1mo&interval=1d
router.get('/:symbol/history', assetController.getHistory);

// GET /api/assets/:symbol/investor-info - Información detallada para inversores
router.get('/:symbol/investor-info', assetController.getInvestorInfo);

// DELETE /api/assets/:symbol/cache - Limpiar caché de un símbolo
router.delete('/:symbol/cache', assetController.clearCache);

export const assetRoutes = router;
