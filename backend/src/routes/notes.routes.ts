import { Router } from 'express';
import { notesController } from '../controllers/notes.controller.js';

const router = Router();

// GET /api/notes - Obtener todas las notas
router.get('/', notesController.getAll);

// GET /api/notes/wallet - Obtener totales del wallet (debe ir antes de /:symbol)
router.get('/wallet', notesController.getWallet);

// GET /api/notes/:symbol - Obtener nota por símbolo
router.get('/:symbol', notesController.getBySymbol);

// POST /api/notes - Crear o actualizar nota
router.post('/', notesController.upsert);

// PUT /api/notes/:symbol - Actualizar nota
router.put('/:symbol', notesController.update);

// POST /api/notes/:symbol/result - Establecer resultado
router.post('/:symbol/result', notesController.setResult);

// DELETE /api/notes/:symbol/result - Limpiar resultado
router.delete('/:symbol/result', notesController.clearResult);

// DELETE /api/notes/:symbol - Eliminar nota
router.delete('/:symbol', notesController.delete);

export const notesRoutes = router;
