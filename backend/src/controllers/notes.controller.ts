import { Request, Response } from 'express';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-handler.js';
import { notesRepository } from '../repositories/notes.repository.js';

export const notesController = {
  /**
   * GET /api/notes
   * Obtener todas las notas
   */
  getAll: asyncHandler(async (req: Request, res: Response) => {
    const notes = await notesRepository.findAll();
    const count = await notesRepository.count();

    res.json({
      success: true,
      data: {
        notes: notes.map(note => ({
          id: note.id,
          symbol: note.symbol,
          note: note.note,
          createdAt: note.createdAt.toISOString(),
          updatedAt: note.updatedAt.toISOString(),
        })),
        count,
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
      data: {
        id: note.id,
        symbol: note.symbol,
        note: note.note,
        createdAt: note.createdAt.toISOString(),
        updatedAt: note.updatedAt.toISOString(),
      },
    });
  }),

  /**
   * POST /api/notes
   * Crear o actualizar nota
   */
  upsert: asyncHandler(async (req: Request, res: Response) => {
    const { symbol, note } = req.body;

    if (!symbol || !note) {
      throw BadRequestError('Missing required fields: symbol, note');
    }

    const result = await notesRepository.upsert({ symbol, note });

    res.status(201).json({
      success: true,
      data: {
        id: result.id,
        symbol: result.symbol,
        note: result.note,
        createdAt: result.createdAt.toISOString(),
        updatedAt: result.updatedAt.toISOString(),
      },
    });
  }),

  /**
   * PUT /api/notes/:symbol
   * Actualizar nota
   */
  update: asyncHandler(async (req: Request, res: Response) => {
    const { symbol } = req.params;
    const { note } = req.body;

    if (!note) {
      throw BadRequestError('Missing required field: note');
    }

    const existing = await notesRepository.findBySymbol(symbol);
    if (!existing) {
      throw NotFoundError(`Note for ${symbol} not found`);
    }

    const result = await notesRepository.update(symbol, { note });

    res.json({
      success: true,
      data: {
        id: result.id,
        symbol: result.symbol,
        note: result.note,
        createdAt: result.createdAt.toISOString(),
        updatedAt: result.updatedAt.toISOString(),
      },
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

