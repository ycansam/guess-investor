import { prisma } from '../config/database.js';

export interface CreatePositionInput {
  symbol: string;
  name: string;
  assetType: string;
  shares: number;
  avgCost: number;
  currency?: string;
  notes?: string;
  targetPrice?: number;
  stopLoss?: number;
}

export interface UpdatePositionInput {
  shares?: number;
  avgCost?: number;
  notes?: string;
  targetPrice?: number;
  stopLoss?: number;
}

export interface CreateTransactionInput {
  symbol: string;
  type: 'buy' | 'sell';
  shares: number;
  price: number;
  currency?: string;
  commission?: number;
  notes?: string;
  executedAt?: Date;
}

export const portfolioRepository = {
  // ============================================================================
  // POSITIONS
  // ============================================================================

  /**
   * Obtener todas las posiciones
   */
  async findAllPositions() {
    return prisma.portfolioPosition.findMany({
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Obtener posición por símbolo
   */
  async findPositionBySymbol(symbol: string) {
    return prisma.portfolioPosition.findUnique({
      where: { symbol: symbol.toUpperCase() },
    });
  },

  /**
   * Crear nueva posición
   */
  async createPosition(input: CreatePositionInput) {
    return prisma.portfolioPosition.create({
      data: {
        symbol: input.symbol.toUpperCase(),
        name: input.name,
        assetType: input.assetType,
        shares: input.shares,
        avgCost: input.avgCost,
        currency: input.currency || 'USD',
        notes: input.notes,
        targetPrice: input.targetPrice,
        stopLoss: input.stopLoss,
      },
    });
  },

  /**
   * Actualizar posición existente
   */
  async updatePosition(symbol: string, input: UpdatePositionInput) {
    return prisma.portfolioPosition.update({
      where: { symbol: symbol.toUpperCase() },
      data: {
        ...(input.shares !== undefined && { shares: input.shares }),
        ...(input.avgCost !== undefined && { avgCost: input.avgCost }),
        ...(input.notes !== undefined && { notes: input.notes }),
        ...(input.targetPrice !== undefined && { targetPrice: input.targetPrice }),
        ...(input.stopLoss !== undefined && { stopLoss: input.stopLoss }),
      },
    });
  },

  /**
   * Añadir a posición existente (compra adicional)
   */
  async addToPosition(symbol: string, shares: number, price: number) {
    const existing = await this.findPositionBySymbol(symbol);
    if (!existing) return null;

    // Calcular nuevo promedio
    const totalShares = existing.shares + shares;
    const totalCost = (existing.shares * existing.avgCost) + (shares * price);
    const newAvgCost = totalCost / totalShares;

    return prisma.portfolioPosition.update({
      where: { symbol: symbol.toUpperCase() },
      data: {
        shares: totalShares,
        avgCost: newAvgCost,
      },
    });
  },

  /**
   * Reducir posición (venta parcial)
   */
  async reducePosition(symbol: string, shares: number) {
    const existing = await this.findPositionBySymbol(symbol);
    if (!existing) return null;

    const newShares = existing.shares - shares;
    
    if (newShares <= 0) {
      // Eliminar posición si se vendió todo
      await prisma.portfolioPosition.delete({
        where: { symbol: symbol.toUpperCase() },
      });
      return null;
    }

    return prisma.portfolioPosition.update({
      where: { symbol: symbol.toUpperCase() },
      data: { shares: newShares },
    });
  },

  /**
   * Eliminar posición
   */
  async deletePosition(symbol: string) {
    return prisma.portfolioPosition.delete({
      where: { symbol: symbol.toUpperCase() },
    });
  },

  // ============================================================================
  // TRANSACTIONS
  // ============================================================================

  /**
   * Obtener todas las transacciones
   */
  async findAllTransactions(limit = 100) {
    return prisma.portfolioTransaction.findMany({
      orderBy: { executedAt: 'desc' },
      take: limit,
    });
  },

  /**
   * Obtener transacciones por símbolo
   */
  async findTransactionsBySymbol(symbol: string) {
    return prisma.portfolioTransaction.findMany({
      where: { symbol: symbol.toUpperCase() },
      orderBy: { executedAt: 'desc' },
    });
  },

  /**
   * Crear transacción
   */
  async createTransaction(input: CreateTransactionInput) {
    return prisma.portfolioTransaction.create({
      data: {
        symbol: input.symbol.toUpperCase(),
        type: input.type,
        shares: input.shares,
        price: input.price,
        totalAmount: input.shares * input.price,
        currency: input.currency || 'USD',
        commission: input.commission || 0,
        notes: input.notes,
        executedAt: input.executedAt || new Date(),
      },
    });
  },

  /**
   * Eliminar transacción
   */
  async deleteTransaction(id: string) {
    return prisma.portfolioTransaction.delete({
      where: { id },
    });
  },

  /**
   * Obtener resumen del portfolio
   */
  async getPortfolioSummary() {
    const positions = await this.findAllPositions();
    const transactions = await this.findAllTransactions(1000);

    // Calcular totales
    const totalInvested = positions.reduce((sum, p) => sum + (p.shares * p.avgCost), 0);
    const totalBuys = transactions
      .filter(t => t.type === 'buy')
      .reduce((sum, t) => sum + t.totalAmount, 0);
    const totalSells = transactions
      .filter(t => t.type === 'sell')
      .reduce((sum, t) => sum + t.totalAmount, 0);
    const totalCommissions = transactions.reduce((sum, t) => sum + t.commission, 0);

    return {
      positionCount: positions.length,
      totalInvested,
      totalBuys,
      totalSells,
      totalCommissions,
      netInflow: totalBuys - totalSells - totalCommissions,
    };
  },
};
