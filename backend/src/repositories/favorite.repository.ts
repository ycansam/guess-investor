import { Favorite } from '@prisma/client';
import { prisma } from '../config/database.js';

export const favoriteRepository = {
  /**
   * Obtener todos los favoritos
   */
  async findAll(): Promise<Favorite[]> {
    return prisma.favorite.findMany({
      orderBy: { sortOrder: 'asc' },
    });
  },

  /**
   * Obtener favorito por símbolo
   */
  async findBySymbol(symbol: string): Promise<Favorite | null> {
    return prisma.favorite.findUnique({ where: { symbol } });
  },

  /**
   * Añadir favorito
   */
  async create(symbol: string, name: string, assetType: string): Promise<Favorite> {
    const maxOrder = await prisma.favorite.aggregate({
      _max: { sortOrder: true },
    });
    
    return prisma.favorite.create({
      data: {
        symbol,
        name,
        assetType,
        sortOrder: (maxOrder._max.sortOrder || 0) + 1,
      },
    });
  },

  /**
   * Eliminar favorito
   */
  async delete(symbol: string): Promise<boolean> {
    try {
      await prisma.favorite.delete({ where: { symbol } });
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Reordenar favoritos
   */
  async reorder(symbols: string[]): Promise<void> {
    const updates = symbols.map((symbol, index) =>
      prisma.favorite.update({
        where: { symbol },
        data: { sortOrder: index },
      })
    );
    await Promise.all(updates);
  },

  /**
   * Verificar si es favorito
   */
  async isFavorite(symbol: string): Promise<boolean> {
    const count = await prisma.favorite.count({ where: { symbol } });
    return count > 0;
  },
};
