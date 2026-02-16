import { prisma } from '../config/database.js';

export interface CreateNoteInput {
  symbol: string;
  dineroInvertido: number;
  beneficioEsperado: number;
  perdidaEsperada: number;
  note?: string;
}

export interface UpdateNoteInput {
  dineroInvertido?: number;
  beneficioEsperado?: number;
  perdidaEsperada?: number;
  note?: string;
}

export interface SetResultInput {
  resultado: 'beneficiado' | 'perdida';
  resultadoFinal: number;
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
   * Crear nota
   */
  async create(input: CreateNoteInput) {
    const symbol = input.symbol.toUpperCase();
    
    return prisma.investmentNote.create({
      data: {
        symbol,
        dineroInvertido: input.dineroInvertido,
        beneficioEsperado: input.beneficioEsperado,
        perdidaEsperada: input.perdidaEsperada,
        note: input.note || null,
      },
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
        dineroInvertido: input.dineroInvertido,
        beneficioEsperado: input.beneficioEsperado,
        perdidaEsperada: input.perdidaEsperada,
        note: input.note || null,
      },
      update: {
        dineroInvertido: input.dineroInvertido,
        beneficioEsperado: input.beneficioEsperado,
        perdidaEsperada: input.perdidaEsperada,
        note: input.note || null,
      },
    });
  },

  /**
   * Actualizar nota existente
   */
  async update(symbol: string, input: UpdateNoteInput) {
    return prisma.investmentNote.update({
      where: { symbol: symbol.toUpperCase() },
      data: input,
    });
  },

  /**
   * Establecer resultado (beneficiado o pérdida)
   */
  async setResult(symbol: string, input: SetResultInput) {
    return prisma.investmentNote.update({
      where: { symbol: symbol.toUpperCase() },
      data: {
        resultado: input.resultado,
        resultadoFinal: input.resultadoFinal,
      },
    });
  },

  /**
   * Limpiar resultado (reabrir posición)
   */
  async clearResult(symbol: string) {
    return prisma.investmentNote.update({
      where: { symbol: symbol.toUpperCase() },
      data: {
        resultado: null,
        resultadoFinal: null,
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

  /**
   * Obtener totales del wallet
   */
  async getWalletTotals() {
    const notes = await prisma.investmentNote.findMany({
      where: {
        resultado: { not: null },
      },
    });

    let totalBeneficios = 0;
    let totalPerdidas = 0;
    let countBeneficios = 0;
    let countPerdidas = 0;

    for (const note of notes) {
      if (note.resultado === 'beneficiado' && note.resultadoFinal !== null) {
        totalBeneficios += note.resultadoFinal;
        countBeneficios++;
      } else if (note.resultado === 'perdida' && note.resultadoFinal !== null) {
        totalPerdidas += Math.abs(note.resultadoFinal);
        countPerdidas++;
      }
    }

    return {
      totalBeneficios,
      totalPerdidas,
      balance: totalBeneficios - totalPerdidas,
      countBeneficios,
      countPerdidas,
      countAbiertas: await prisma.investmentNote.count({ where: { resultado: null } }),
    };
  },
};