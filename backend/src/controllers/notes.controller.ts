import { Request, Response } from 'express';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-handler.js';
import { notesRepository } from '../repositories/notes.repository.js';

// Helper para formatear nota a JSON
const formatNote = (note: {
  id: string;
  symbol: string;
  dineroInvertido: number;
  beneficioEsperado: number;
  perdidaEsperada: number;
  resultado: string | null;
  resultadoFinal: number | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: note.id,
  symbol: note.symbol,
  dineroInvertido: note.dineroInvertido,
  beneficioEsperado: note.beneficioEsperado,
  perdidaEsperada: note.perdidaEsperada,
  resultado: note.resultado,
  resultadoFinal: note.resultadoFinal,
  note: note.note,
  createdAt: note.createdAt.toISOString(),
  updatedAt: note.updatedAt.toISOString(),
});

export const notesController = {
  /**
   * GET /api/notes
   * Obtener todas las notas
   */
  getAll: asyncHandler(async (req: Request, res: Response) => {
    const notes = await notesRepository.findAll();
    const wallet = await notesRepository.getWalletTotals();

    res.json({
      success: true,
      data: {
        notes: notes.map(formatNote),
        count: notes.length,
        wallet,
      },
    });
  }),

  /**
   * GET /api/notes/wallet
   * Obtener totales del wallet
   */
  getWallet: asyncHandler(async (req: Request, res: Response) => {
    const wallet = await notesRepository.getWalletTotals();

    res.json({
      success: true,
      data: wallet,
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
      data: formatNote(note),
    });
  }),

  /**
   * POST /api/notes
   * Crear o actualizar nota
   */
  upsert: asyncHandler(async (req: Request, res: Response) => {
    const { symbol, dineroInvertido, beneficioEsperado, perdidaEsperada, note } = req.body;

    if (!symbol) {
      throw BadRequestError('Missing required field: symbol');
    }

    // Validar que los valores numéricos sean números válidos
    const parsedDinero = parseFloat(dineroInvertido) || 0;
    const parsedBeneficio = parseFloat(beneficioEsperado) || 0;
    const parsedPerdida = parseFloat(perdidaEsperada) || 0;

    const result = await notesRepository.upsert({
      symbol,
      dineroInvertido: parsedDinero,
      beneficioEsperado: parsedBeneficio,
      perdidaEsperada: parsedPerdida,
      note: note || undefined,
    });

    res.status(201).json({
      success: true,
      data: formatNote(result),
    });
  }),

  /**
   * PUT /api/notes/:symbol
   * Actualizar nota
   */
  update: asyncHandler(async (req: Request, res: Response) => {
    const { symbol } = req.params;
    const { dineroInvertido, beneficioEsperado, perdidaEsperada, note } = req.body;

    const existing = await notesRepository.findBySymbol(symbol);
    if (!existing) {
      throw NotFoundError(`Note for ${symbol} not found`);
    }

    const updateData: {
      dineroInvertido?: number;
      beneficioEsperado?: number;
      perdidaEsperada?: number;
      note?: string;
    } = {};

    if (dineroInvertido !== undefined) updateData.dineroInvertido = parseFloat(dineroInvertido);
    if (beneficioEsperado !== undefined) updateData.beneficioEsperado = parseFloat(beneficioEsperado);
    if (perdidaEsperada !== undefined) updateData.perdidaEsperada = parseFloat(perdidaEsperada);
    if (note !== undefined) updateData.note = note;

    const result = await notesRepository.update(symbol, updateData);

    res.json({
      success: true,
      data: formatNote(result),
    });
  }),

  /**
   * POST /api/notes/:symbol/result
   * Establecer resultado (beneficiado o pérdida)
   */
  setResult: asyncHandler(async (req: Request, res: Response) => {
    const { symbol } = req.params;
    const { resultado, resultadoFinal } = req.body;

    if (!resultado || !['beneficiado', 'perdida'].includes(resultado)) {
      throw BadRequestError('resultado must be "beneficiado" or "perdida"');
    }

    if (resultadoFinal === undefined || isNaN(parseFloat(resultadoFinal))) {
      throw BadRequestError('resultadoFinal must be a valid number');
    }

    const existing = await notesRepository.findBySymbol(symbol);
    if (!existing) {
      throw NotFoundError(`Note for ${symbol} not found`);
    }

    const result = await notesRepository.setResult(symbol, {
      resultado,
      resultadoFinal: parseFloat(resultadoFinal),
    });

    res.json({
      success: true,
      data: formatNote(result),
    });
  }),

  /**
   * DELETE /api/notes/:symbol/result
   * Limpiar resultado (reabrir posición)
   */
  clearResult: asyncHandler(async (req: Request, res: Response) => {
    const { symbol } = req.params;

    const existing = await notesRepository.findBySymbol(symbol);
    if (!existing) {
      throw NotFoundError(`Note for ${symbol} not found`);
    }

    const result = await notesRepository.clearResult(symbol);

    res.json({
      success: true,
      data: formatNote(result),
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