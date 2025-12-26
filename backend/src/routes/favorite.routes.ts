import { Router } from 'express';
import { favoriteController } from '../controllers/favorite.controller.js';

const router = Router();

// GET /api/favorites
router.get('/', favoriteController.getAll);

// POST /api/favorites
router.post('/', favoriteController.create);

// PUT /api/favorites/reorder
router.put('/reorder', favoriteController.reorder);

// GET /api/favorites/:symbol/check
router.get('/:symbol/check', favoriteController.check);

// DELETE /api/favorites/:symbol
router.delete('/:symbol', favoriteController.delete);

export const favoriteRoutes = router;
