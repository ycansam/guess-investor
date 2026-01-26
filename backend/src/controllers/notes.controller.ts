import { Request, Response } from 'express';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-handler.js';
import { logger } from '../middleware/logger.js';
import { notesRepository } from '../repositories/notes.repository.js';
import { yahooService } from '../services/external/yahoo.service.js';

export const notesController = {
  /**
   * GET /api/notes
   * Obtener todas las notas con precios actuales
   */
  getAll: asyncHandler(async (req: Request, res: Response) => {
    const status = req.query.status as string | undefined;
    const notes = await notesRepository.findAll(status);

    // Obtener precios actuales
    const notesWithPrices = await Promise.all(
      notes.map(async (note) => {
        try {
          const quote = await yahooService.getQuote(note.symbol);
          const currentPrice = quote?.price || 0;
          
          return {
            id: note.id,
            symbol: note.symbol,
            name: note.name,
            assetType: note.assetType,
            notes: note.notes,
            thesis: note.thesis,
            targetPrice: note.targetPrice,
            entryPrice: note.entryPrice,
            stopLoss: note.stopLoss,
            status: note.status,
            rating: note.rating,
            createdAt: note.createdAt.toISOString(),
            updatedAt: note.updatedAt.toISOString(),
            // Datos de mercado
            currentPrice,
            dayChange: quote?.changePercent || 0,
            // Alertas de precio
            atTarget: note.targetPrice ? currentPrice >= note.targetPrice : false,
            atEntry: note.entryPrice ? currentPrice <= note.entryPrice : false,
            atStopLoss: note.stopLoss ? currentPrice <= note.stopLoss : false,
            // Distancia a targets (%)
            distanceToTarget: note.targetPrice && currentPrice 
              ? ((note.targetPrice - currentPrice) / currentPrice) * 100 
              : null,
            distanceToEntry: note.entryPrice && currentPrice
              ? ((note.entryPrice - currentPrice) / currentPrice) * 100
              : null,
          };
        } catch (error) {
          logger.warn(`[Notes] Could not get quote for ${note.symbol}`);
          return {
            id: note.id,
            symbol: note.symbol,
            name: note.name,
            assetType: note.assetType,
            notes: note.notes,
            thesis: note.thesis,
            targetPrice: note.targetPrice,
            entryPrice: note.entryPrice,
            stopLoss: note.stopLoss,
            status: note.status,
            rating: note.rating,
            createdAt: note.createdAt.toISOString(),
            updatedAt: note.updatedAt.toISOString(),
            currentPrice: 0,
            dayChange: 0,
            atTarget: false,
            atEntry: false,
            atStopLoss: false,
            distanceToTarget: null,
            distanceToEntry: null,
          };
        }
      })
    );

    // Contar por estado
    const counts = await notesRepository.countByStatus();

    res.json({
      success: true,
      data: {
        notes: notesWithPrices,
        counts,
      },
    });
  }),

  /**
   * GET /api/notes/:symbol
   * Obtener nota por símbolo
   */
  getBySymbol: asyncHandler(async (req: Request, res: Response) => {
    const { symbol } = req.params;
    const note = await notesRepository.findBySymbol(symbol);

    if (!note) {
      throw NotFoundError(`Note for ${symbol} not found`);
    }

    res.json({
      success: true,
      data: note,
    });
  }),

  /**
   * POST /api/notes
   * Crear o actualizar nota
   */
  upsert: asyncHandler(async (req: Request, res: Response) => {
    const { symbol, name, assetType, notes, thesis, targetPrice, entryPrice, stopLoss, status, rating } = req.body;

    if (!symbol || !name || !assetType) {
      throw BadRequestError('Missing required fields: symbol, name, assetType');
    }

    const note = await notesRepository.upsert({
      symbol,
      name,
      assetType,
      notes,
      thesis,
      targetPrice,
      entryPrice,
      stopLoss,
      status,
      rating,
    });

    res.status(201).json({
      success: true,
      data: note,
    });
  }),

  /**
   * PUT /api/notes/:symbol
   * Actualizar nota
   */
  update: asyncHandler(async (req: Request, res: Response) => {
    const { symbol } = req.params;
    const { notes, thesis, targetPrice, entryPrice, stopLoss, status, rating } = req.body;

    const existing = await notesRepository.findBySymbol(symbol);
    if (!existing) {
      throw NotFoundError(`Note for ${symbol} not found`);
    }

    const note = await notesRepository.update(symbol, {
      notes,
      thesis,
      targetPrice,
      entryPrice,
      stopLoss,
      status,
      rating,
    });

    res.json({
      success: true,
      data: note,
    });
  }),

  /**
   * PATCH /api/notes/:symbol/status
   * Cambiar estado rápido
   */
  updateStatus: asyncHandler(async (req: Request, res: Response) => {
    const { symbol } = req.params;
    const { status } = req.body;

    if (!status || !['watching', 'bought', 'sold', 'archived'].includes(status)) {
      throw BadRequestError('Invalid status. Must be: watching, bought, sold, archived');
    }

    const note = await notesRepository.updateStatus(symbol, status);

    res.json({
      success: true,
      data: note,
    });
  }),

  /**
   * DELETE /api/notes/:symbol
   * Eliminar nota
   */
  delete: asyncHandler(async (req: Request, res: Response) => {
    const { symbol } = req.params;

    const existing = await notesRepository.findBySymbol(symbol);
    if (!existing) {
      throw NotFoundError(`Note for ${symbol} not found`);
    }

    await notesRepository.delete(symbol);

    res.json({
      success: true,
      message: `Note for ${symbol} deleted`,
    });
  }),
};
