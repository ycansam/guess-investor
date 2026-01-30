import { prisma } from '../config/database.js';

export interface CreateNoteInput {
  symbol: string;
  note: string;
}

export interface UpdateNoteInput {
  note: string;
}

export const notesRepository = {
  /**
   * Obtener todas las notas
   */
  async findAll() {
    return prisma.investmentNote.findMany({
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
        note: input.note,
      },
      update: {
        note: input.note,
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
        note: input.note,
      },
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
   * Contar total de notas
   */
  async count() {
    return prisma.investmentNote.count();
  },
};

