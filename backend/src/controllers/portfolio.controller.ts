import { Request, Response } from 'express';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-handler.js';
import { portfolioRepository } from '../repositories/portfolio.repository.js';
import { yahooService } from '../services/external/yahoo.service.js';
import { logger } from '../middleware/logger.js';

export const portfolioController = {
  // ============================================================================
  // POSITIONS
  // ============================================================================

  /**
   * GET /api/portfolio/positions
   * Obtener todas las posiciones con precios actuales
   */
  getPositions: asyncHandler(async (_req: Request, res: Response) => {
    const positions = await portfolioRepository.findAllPositions();

    // Obtener precios actuales para todas las posiciones
    const positionsWithPrices = await Promise.all(
      positions.map(async (position) => {
        try {
          const quote = await yahooService.getQuote(position.symbol);
          const currentPrice = quote?.price || position.avgCost;
          const marketValue = position.shares * currentPrice;
          const costBasis = position.shares * position.avgCost;
          const gainLoss = marketValue - costBasis;
          const gainLossPercent = costBasis > 0 ? ((marketValue - costBasis) / costBasis) * 100 : 0;

          return {
            id: position.id,
            symbol: position.symbol,
            name: position.name,
            assetType: position.assetType,
            shares: position.shares,
            avgCost: position.avgCost,
            currency: position.currency,
            notes: position.notes,
            targetPrice: position.targetPrice,
            stopLoss: position.stopLoss,
            // Datos calculados
            currentPrice,
            marketValue,
            costBasis,
            gainLoss,
            gainLossPercent,
            dayChange: quote?.changePercent || 0,
            // Alertas
            atTarget: position.targetPrice ? currentPrice >= position.targetPrice : false,
            atStopLoss: position.stopLoss ? currentPrice <= position.stopLoss : false,
          };
        } catch (error) {
          logger.warn(`[Portfolio] Could not get quote for ${position.symbol}`);
          return {
            id: position.id,
            symbol: position.symbol,
            name: position.name,
            assetType: position.assetType,
            shares: position.shares,
            avgCost: position.avgCost,
            currency: position.currency,
            notes: position.notes,
            targetPrice: position.targetPrice,
            stopLoss: position.stopLoss,
            currentPrice: position.avgCost,
            marketValue: position.shares * position.avgCost,
            costBasis: position.shares * position.avgCost,
            gainLoss: 0,
            gainLossPercent: 0,
            dayChange: 0,
            atTarget: false,
            atStopLoss: false,
          };
        }
      })
    );

    // Calcular totales
    const totalCostBasis = positionsWithPrices.reduce((sum, p) => sum + p.costBasis, 0);
    const totalMarketValue = positionsWithPrices.reduce((sum, p) => sum + p.marketValue, 0);
    const totalGainLoss = totalMarketValue - totalCostBasis;
    const totalGainLossPercent = totalCostBasis > 0 ? (totalGainLoss / totalCostBasis) * 100 : 0;

    // Calcular diversificación
    const diversification = positionsWithPrices.map(p => ({
      symbol: p.symbol,
      name: p.name,
      assetType: p.assetType,
      weight: totalMarketValue > 0 ? (p.marketValue / totalMarketValue) * 100 : 0,
      marketValue: p.marketValue,
    }));

    // Diversificación por tipo de activo
    const byAssetType = positionsWithPrices.reduce((acc, p) => {
      const type = p.assetType;
      if (!acc[type]) acc[type] = 0;
      acc[type] += p.marketValue;
      return acc;
    }, {} as Record<string, number>);

    const assetTypeAllocation = Object.entries(byAssetType).map(([type, value]) => ({
      type,
      value,
      weight: totalMarketValue > 0 ? (value / totalMarketValue) * 100 : 0,
    }));

    res.json({
      success: true,
      data: {
        positions: positionsWithPrices,
        summary: {
          positionCount: positionsWithPrices.length,
          totalCostBasis,
          totalMarketValue,
          totalGainLoss,
          totalGainLossPercent,
          dayChange: positionsWithPrices.reduce((sum, p) => sum + (p.marketValue * p.dayChange / 100), 0),
        },
        diversification,
        assetTypeAllocation,
      },
    });
  }),

  /**
   * POST /api/portfolio/positions
   * Crear nueva posición
   */
  createPosition: asyncHandler(async (req: Request, res: Response) => {
    const { symbol, name, assetType, shares, avgCost, currency, notes, targetPrice, stopLoss } = req.body;

    if (!symbol || !name || !assetType || shares === undefined || avgCost === undefined) {
      throw BadRequestError('Missing required fields: symbol, name, assetType, shares, avgCost');
    }

    if (shares <= 0 || avgCost <= 0) {
      throw BadRequestError('shares and avgCost must be positive numbers');
    }

    // Verificar si ya existe
    const existing = await portfolioRepository.findPositionBySymbol(symbol);
    if (existing) {
      throw BadRequestError(`Position for ${symbol} already exists. Use PUT to update.`);
    }

    const position = await portfolioRepository.createPosition({
      symbol,
      name,
      assetType,
      shares,
      avgCost,
      currency,
      notes,
      targetPrice,
      stopLoss,
    });

    // Registrar transacción de compra
    await portfolioRepository.createTransaction({
      symbol,
      type: 'buy',
      shares,
      price: avgCost,
      currency: currency || 'USD',
      notes: 'Initial position',
    });

    res.status(201).json({
      success: true,
      data: position,
    });
  }),

  /**
   * PUT /api/portfolio/positions/:symbol
   * Actualizar posición
   */
  updatePosition: asyncHandler(async (req: Request, res: Response) => {
    const { symbol } = req.params;
    const { shares, avgCost, notes, targetPrice, stopLoss } = req.body;

    const existing = await portfolioRepository.findPositionBySymbol(symbol);
    if (!existing) {
      throw NotFoundError(`Position for ${symbol} not found`);
    }

    const position = await portfolioRepository.updatePosition(symbol, {
      shares,
      avgCost,
      notes,
      targetPrice,
      stopLoss,
    });

    res.json({
      success: true,
      data: position,
    });
  }),

  /**
   * POST /api/portfolio/positions/:symbol/buy
   * Añadir a posición existente
   */
  buyMore: asyncHandler(async (req: Request, res: Response) => {
    const { symbol } = req.params;
    const { shares, price, commission, notes } = req.body;

    if (!shares || !price || shares <= 0 || price <= 0) {
      throw BadRequestError('shares and price must be positive numbers');
    }

    const existing = await portfolioRepository.findPositionBySymbol(symbol);
    if (!existing) {
      throw NotFoundError(`Position for ${symbol} not found. Create it first.`);
    }

    const position = await portfolioRepository.addToPosition(symbol, shares, price);

    // Registrar transacción
    await portfolioRepository.createTransaction({
      symbol,
      type: 'buy',
      shares,
      price,
      currency: existing.currency,
      commission: commission || 0,
      notes,
    });

    res.json({
      success: true,
      data: position,
    });
  }),

  /**
   * POST /api/portfolio/positions/:symbol/sell
   * Vender parte o toda la posición
   */
  sell: asyncHandler(async (req: Request, res: Response) => {
    const { symbol } = req.params;
    const { shares, price, commission, notes } = req.body;

    if (!shares || !price || shares <= 0 || price <= 0) {
      throw BadRequestError('shares and price must be positive numbers');
    }

    const existing = await portfolioRepository.findPositionBySymbol(symbol);
    if (!existing) {
      throw NotFoundError(`Position for ${symbol} not found`);
    }

    if (shares > existing.shares) {
      throw BadRequestError(`Cannot sell ${shares} shares, only ${existing.shares} available`);
    }

    // Registrar transacción primero
    await portfolioRepository.createTransaction({
      symbol,
      type: 'sell',
      shares,
      price,
      currency: existing.currency,
      commission: commission || 0,
      notes,
    });

    const position = await portfolioRepository.reducePosition(symbol, shares);

    res.json({
      success: true,
      data: position,
      message: position ? 'Position reduced' : 'Position closed',
    });
  }),

  /**
   * DELETE /api/portfolio/positions/:symbol
   * Eliminar posición
   */
  deletePosition: asyncHandler(async (req: Request, res: Response) => {
    const { symbol } = req.params;

    const existing = await portfolioRepository.findPositionBySymbol(symbol);
    if (!existing) {
      throw NotFoundError(`Position for ${symbol} not found`);
    }

    await portfolioRepository.deletePosition(symbol);

    res.json({
      success: true,
      message: `Position for ${symbol} deleted`,
    });
  }),

  // ============================================================================
  // TRANSACTIONS
  // ============================================================================

  /**
   * GET /api/portfolio/transactions
   * Obtener historial de transacciones
   */
  getTransactions: asyncHandler(async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const symbol = req.query.symbol as string;

    const transactions = symbol
      ? await portfolioRepository.findTransactionsBySymbol(symbol)
      : await portfolioRepository.findAllTransactions(limit);

    res.json({
      success: true,
      data: transactions.map(t => ({
        id: t.id,
        symbol: t.symbol,
        type: t.type,
        shares: t.shares,
        price: t.price,
        totalAmount: t.totalAmount,
        currency: t.currency,
        commission: t.commission,
        notes: t.notes,
        executedAt: t.executedAt.toISOString(),
      })),
    });
  }),

  /**
   * DELETE /api/portfolio/transactions/:id
   * Eliminar transacción
   */
  deleteTransaction: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    await portfolioRepository.deleteTransaction(id);

    res.json({
      success: true,
      message: 'Transaction deleted',
    });
  }),

  // ============================================================================
  // SUMMARY
  // ============================================================================

  /**
   * GET /api/portfolio/summary
   * Obtener resumen del portfolio
   */
  getSummary: asyncHandler(async (_req: Request, res: Response) => {
    const summary = await portfolioRepository.getPortfolioSummary();

    res.json({
      success: true,
      data: summary,
    });
  }),
};
