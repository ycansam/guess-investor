import { Router } from 'express';
import { trainingController } from '../controllers/training.controller.js';

const router = Router();

// GET /api/training/stats - Estadísticas de training
router.get('/stats', trainingController.getStats);

// GET /api/training/cache - Todo el cache activo
router.get('/cache', trainingController.getCache);

// POST /api/training/cache - Guardar predicción en cache
router.post('/cache', trainingController.saveCache);

// GET /api/training/cache/:symbol/:timeframe - Obtener predicción específica
router.get('/cache/:symbol/:timeframe', trainingController.getCacheItem);

// DELETE /api/training/cache/:symbol/:timeframe - Eliminar predicción
router.delete('/cache/:symbol/:timeframe', trainingController.deleteCache);

// GET /api/training/symbol/:symbol - Cache por símbolo
router.get('/symbol/:symbol', trainingController.getBySymbol);

// POST /api/training/import - Importar datos desde frontend
router.post('/import', trainingController.import);

// GET /api/training/weights - Pesos aprendidos
router.get('/weights', trainingController.getWeights);

// POST /api/training/weights - Guardar pesos
router.post('/weights', trainingController.saveWeights);

// GET /api/training/adjustments - Todos los ajustes
router.get('/adjustments', trainingController.getAdjustments);

// GET /api/training/adjustments/:symbol - Ajuste por símbolo
router.get('/adjustments/:symbol', trainingController.getAdjustmentBySymbol);

// POST /api/training/adjustments - Guardar ajuste
router.post('/adjustments', trainingController.saveAdjustment);

// GET /api/training/calibration - Calibración de confianza
router.get('/calibration', trainingController.getCalibration);

// POST /api/training/calibration - Guardar calibración
router.post('/calibration', trainingController.saveCalibration);

// POST /api/training/cleanup - Limpiar cache expirado
router.post('/cleanup', trainingController.cleanup);

// DELETE /api/training/cache/all - Borrar TODO el cache
router.delete('/cache/all', trainingController.clearAll);

// DELETE /api/training/weights - Resetear pesos aprendidos
router.delete('/weights', trainingController.resetWeights);

// GET /api/training/export - Exportar todos los datos
router.get('/export', trainingController.export);

export const trainingRoutes = router;
