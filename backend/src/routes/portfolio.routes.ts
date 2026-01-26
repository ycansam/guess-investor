import { Router } from 'express';
import { portfolioController } from '../controllers/portfolio.controller.js';

const router = Router();

// ============================================================================
// POSITIONS
// ============================================================================

// GET /api/portfolio/positions - Obtener todas las posiciones
router.get('/positions', portfolioController.getPositions);

// POST /api/portfolio/positions - Crear nueva posición
router.post('/positions', portfolioController.createPosition);

// PUT /api/portfolio/positions/:symbol - Actualizar posición
router.put('/positions/:symbol', portfolioController.updatePosition);

// POST /api/portfolio/positions/:symbol/buy - Comprar más
router.post('/positions/:symbol/buy', portfolioController.buyMore);

// POST /api/portfolio/positions/:symbol/sell - Vender
router.post('/positions/:symbol/sell', portfolioController.sell);

// DELETE /api/portfolio/positions/:symbol - Eliminar posición
router.delete('/positions/:symbol', portfolioController.deletePosition);

// ============================================================================
// TRANSACTIONS
// ============================================================================

// GET /api/portfolio/transactions - Obtener historial
router.get('/transactions', portfolioController.getTransactions);

// DELETE /api/portfolio/transactions/:id - Eliminar transacción
router.delete('/transactions/:id', portfolioController.deleteTransaction);

// ============================================================================
// SUMMARY
// ============================================================================

// GET /api/portfolio/summary - Resumen del portfolio
router.get('/summary', portfolioController.getSummary);

export const portfolioRoutes = router;
