import { Router } from 'express';
import { predictionController } from '../controllers/prediction.controller.js';

const router = Router();

// GET /api/predictions - Todas las predicciones con filtros
router.get('/', predictionController.getAll);

// GET /api/predictions/stats
router.get('/stats', predictionController.getStats);

// GET /api/predictions/pending
router.get('/pending', predictionController.getPending);

// GET /api/predictions/active
router.get('/active', predictionController.getActive);

// GET /api/predictions/verified
router.get('/verified', predictionController.getVerified);

// GET /api/predictions/symbol/:symbol
router.get('/symbol/:symbol', predictionController.getBySymbol);

// GET /api/predictions/:id
router.get('/:id', predictionController.getById);

// POST /api/predictions - Calcular y guardar predicción
router.post('/', predictionController.create);

// POST /api/predictions/calculate - Solo calcular (preview)
router.post('/calculate', predictionController.calculate);

// POST /api/predictions/track - Registrar predicción para tracking
router.post('/track', predictionController.track);

// POST /api/predictions/:id/verify
router.post('/:id/verify', predictionController.verify);

// POST /api/predictions/verify-pending - Verificar todas las pendientes
router.post('/verify-pending', predictionController.verifyPending);

// POST /api/predictions/import-bulk - Importar predicciones en masa (migración)
router.post('/import-bulk', predictionController.importBulk);

// DELETE /api/predictions/:id
router.delete('/:id', predictionController.delete);

// DELETE /api/predictions - Limpiar todas (solo dev)
router.delete('/', predictionController.clear);

export const predictionRoutes = router;
