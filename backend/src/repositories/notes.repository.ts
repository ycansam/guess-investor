import { prisma } from '../config/database.js';

export interface CreateNoteInput {
  symbol: string;
  name: string;
  assetType: string;
  notes?: string;
  thesis?: string;
  targetPrice?: number;
  entryPrice?: number;
  stopLoss?: number;
  status?: string;
  rating?: number;
}

export interface UpdateNoteInput {
  notes?: string;
  thesis?: string;
  targetPrice?: number | null;
  entryPrice?: number | null;
  stopLoss?: number | null;
  status?: string;
  rating?: number | null;
}

export const notesRepository = {
  /**
   * Obtener todas las notas
   */
  async findAll(status?: string) {
    return prisma.investmentNote.findMany({
      where: status ? { status } : undefined,
      orderBy: { updatedAt: 'desc' },
    });
  },

  /**
   * Obtener nota por símbolo
   */
  async findBySymbol(symbol: string) {
    return prisma.investmentNote.findUnique({
      where: { symbol: symbol.toUpperCase() },
    });
  },

  /**
   * Crear o actualizar nota (upsert)
   */
  async upsert(input: CreateNoteInput) {
    const symbol = input.symbol.toUpperCase();
    
    return prisma.investmentNote.upsert({
      where: { symbol },
      create: {
        symbol,
        name: input.name,
        assetType: input.assetType,
        notes: input.notes,
        thesis: input.thesis,
        targetPrice: input.targetPrice,
        entryPrice: input.entryPrice,
        stopLoss: input.stopLoss,
        status: input.status || 'watching',
        rating: input.rating,
      },
      update: {
        name: input.name,
        notes: input.notes,
        thesis: input.thesis,
        targetPrice: input.targetPrice,
        entryPrice: input.entryPrice,
        stopLoss: input.stopLoss,
        status: input.status,
        rating: input.rating,
      },
    });
  },

  /**
   * Actualizar nota existente
   */
  async update(symbol: string, input: UpdateNoteInput) {
    return prisma.investmentNote.update({
      where: { symbol: symbol.toUpperCase() },
      data: {
        ...(input.notes !== undefined && { notes: input.notes }),
        ...(input.thesis !== undefined && { thesis: input.thesis }),
        ...(input.targetPrice !== undefined && { targetPrice: input.targetPrice }),
        ...(input.entryPrice !== undefined && { entryPrice: input.entryPrice }),
        ...(input.stopLoss !== undefined && { stopLoss: input.stopLoss }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.rating !== undefined && { rating: input.rating }),
      },
    });
  },

  /**
   * Cambiar estado
   */
  async updateStatus(symbol: string, status: string) {
    return prisma.investmentNote.update({
      where: { symbol: symbol.toUpperCase() },
      data: { status },
    });
  },

  /**
   * Eliminar nota
   */
  async delete(symbol: string) {
    return prisma.investmentNote.delete({
      where: { symbol: symbol.toUpperCase() },
    });
  },

  /**
   * Contar por estado
   */
  async countByStatus() {
    const all = await prisma.investmentNote.groupBy({
      by: ['status'],
      _count: { status: true },
    });

    return all.reduce((acc, item) => {
      acc[item.status] = item._count.status;
      return acc;
    }, {} as Record<string, number>);
  },
};
