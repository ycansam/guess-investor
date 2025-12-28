import { Request, Response } from 'express';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-handler.js';
import { CreateFavoriteRequestSchema } from '../models/index.js';
import { favoriteRepository } from '../repositories/favorite.repository.js';

export const favoriteController = {
  /**
   * GET /api/favorites
   * Obtener todos los favoritos
   */
  getAll: asyncHandler(async (_req: Request, res: Response) => {
    const favorites = await favoriteRepository.findAll();

    res.json({
      success: true,
      data: favorites.map(f => ({
        id: f.id,
        symbol: f.symbol,
        name: f.name,
        assetType: f.assetType,
        addedAt: f.addedAt.toISOString(),
      })),
    });
  }),

  /**
   * POST /api/favorites
   * Añadir favorito
   */
  create: asyncHandler(async (req: Request, res: Response) => {
    const parsed = CreateFavoriteRequestSchema.safeParse(req.body);
    
    if (!parsed.success) {
      throw BadRequestError('Invalid request body');
    }

    const { symbol, name, assetType } = parsed.data;

    // Verificar si ya existe
    const existing = await favoriteRepository.findBySymbol(symbol);
    if (existing) {
      throw BadRequestError(`${symbol} is already a favorite`);
    }

    const favorite = await favoriteRepository.create(symbol, name, assetType);

    res.status(201).json({
      success: true,
      data: {
        id: favorite.id,
        symbol: favorite.symbol,
        name: favorite.name,
        assetType: favorite.assetType,
        addedAt: favorite.addedAt.toISOString(),
      },
    });
  }),

  /**
   * POST /api/favorites/toggle
   * Toggle favorito (añadir si no existe, eliminar si existe)
   */
  toggle: asyncHandler(async (req: Request, res: Response) => {
    const parsed = CreateFavoriteRequestSchema.safeParse(req.body);
    
    if (!parsed.success) {
      throw BadRequestError('Invalid request body');
    }

    const { symbol, name, assetType } = parsed.data;
    const upperSymbol = symbol.toUpperCase();

    // Verificar si ya existe
    const existing = await favoriteRepository.findBySymbol(upperSymbol);
    
    if (existing) {
      // Eliminar
      await favoriteRepository.delete(upperSymbol);
      res.json({
        success: true,
        data: {
          symbol: upperSymbol,
          isFavorite: false,
          action: 'removed',
        },
      });
    } else {
      // Añadir
      const favorite = await favoriteRepository.create(upperSymbol, name, assetType);
      res.json({
        success: true,
        data: {
          symbol: favorite.symbol,
          isFavorite: true,
          action: 'added',
        },
      });
    }
  }),

  /**
   * DELETE /api/favorites/:symbol
   * Eliminar favorito
   */
  delete: asyncHandler(async (req: Request, res: Response) => {
    const { symbol } = req.params;
    
    const deleted = await favoriteRepository.delete(symbol.toUpperCase());
    
    if (!deleted) {
      throw NotFoundError(`Favorite ${symbol}`);
    }

    res.json({
      success: true,
      message: `${symbol} removed from favorites`,
    });
  }),

  /**
   * GET /api/favorites/:symbol/check
   * Verificar si es favorito
   */
  check: asyncHandler(async (req: Request, res: Response) => {
    const { symbol } = req.params;
    
    const isFavorite = await favoriteRepository.isFavorite(symbol.toUpperCase());

    res.json({
      success: true,
      data: { isFavorite },
    });
  }),

  /**
   * PUT /api/favorites/reorder
   * Reordenar favoritos
   */
  reorder: asyncHandler(async (req: Request, res: Response) => {
    const { symbols } = req.body;
    
    if (!Array.isArray(symbols)) {
      throw BadRequestError('symbols must be an array');
    }

    await favoriteRepository.reorder(symbols);

    res.json({
      success: true,
      message: 'Favorites reordered',
    });
  }),
};
