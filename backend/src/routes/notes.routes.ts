import { Router } from 'express';
import { notesController } from '../controllers/notes.controller.js';

const router = Router();

// GET /api/notes - Obtener todas las notas
router.get('/', notesController.getAll);

// GET /api/notes/:symbol - Obtener nota por símbolo
router.get('/:symbol', notesController.getBySymbol);

// POST /api/notes - Crear o actualizar nota
router.post('/', notesController.upsert);

// PUT /api/notes/:symbol - Actualizar nota
router.put('/:symbol', notesController.update);

// PATCH /api/notes/:symbol/status - Cambiar estado
router.patch('/:symbol/status', notesController.updateStatus);

// DELETE /api/notes/:symbol - Eliminar nota
router.delete('/:symbol', notesController.delete);

export const notesRoutes = router;
