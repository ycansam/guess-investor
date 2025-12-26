import { Router } from 'express';
import { predictionController } from '../controllers/prediction.controller.js';

const router = Router();

// GET /api/predictions/stats
router.get('/stats', predictionController.getStats);

// GET /api/predictions/pending
router.get('/pending', predictionController.getPending);

// GET /api/predictions/symbol/:symbol
router.get('/symbol/:symbol', predictionController.getBySymbol);

// GET /api/predictions/:id
router.get('/:id', predictionController.getById);

// POST /api/predictions - Calcular y guardar predicción
router.post('/', predictionController.create);

// POST /api/predictions/calculate - Solo calcular (preview)
router.post('/calculate', predictionController.calculate);

// POST /api/predictions/:id/verify
router.post('/:id/verify', predictionController.verify);

export const predictionRoutes = router;
