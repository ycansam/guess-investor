/**
 * Backtesting Controller
 * 
 * Expone endpoints para ejecutar backtests del sistema de predicciones.
 */

import { Request, Response } from 'express';
import { asyncHandler, BadRequestError } from '../middleware/error-handler.js';
import { backtestService } from '../services/prediction/backtest.service.js';

export const backtestController = {
  /**
   * POST /api/backtest
   * Ejecuta backtest para un símbolo
   */
  runBacktest: asyncHandler(async (req: Request, res: Response) => {
    const { symbol, days = 90, timeframe = 5 } = req.body;
    
    if (!symbol) {
      throw BadRequestError('Symbol is required');
    }
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const result = await backtestService.runBacktest({
      symbol: symbol.toUpperCase(),
      startDate,
      endDate,
      timeframeDays: timeframe,
      skipWeekends: true,
    });
    
    res.json({
      success: true,
      data: {
        symbol: result.symbol,
        period: `${days} days`,
        timeframe: `${timeframe} days`,
        
        // Resultados principales
        totalPredictions: result.totalPredictions,
        directionAccuracy: result.directionAccuracy.toFixed(1),
        avgError: result.avgAbsError.toFixed(2),
        
        // Por dirección
        upAccuracy: result.upPredictions.accuracy.toFixed(1),
        downAccuracy: result.downPredictions.accuracy.toFixed(1),
        
        // Calidad
        quality: {
          excellent: result.excellentCount,
          good: result.goodCount,
          poor: result.poorCount,
          failed: result.failedCount,
        },
        
        // Métricas avanzadas
        advanced: {
          sharpeRatio: result.sharpeRatio.toFixed(2),
          maxDrawdown: result.maxDrawdown.toFixed(2),
          winRate: result.winRate.toFixed(1),
          profitFactor: result.profitFactor.toFixed(2),
        },
        
        // Últimas predicciones
        recentPredictions: result.predictions.slice(-10).map(p => ({
          date: p.date.toISOString().split('T')[0],
          predicted: `${p.predictedChange.toFixed(2)}%`,
          actual: `${p.actualChange.toFixed(2)}%`,
          correct: p.directionCorrect,
          score: p.accuracyScore,
        })),
        
        durationMs: result.durationMs,
      },
    });
  }),
  
  /**
   * GET /api/backtest/summary/:symbol
   * Ejecuta backtest rápido con múltiples timeframes
   */
  getSummary: asyncHandler(async (req: Request, res: Response) => {
    const { symbol } = req.params;
    const days = parseInt(req.query.days as string) || 90;
    
    if (!symbol) {
      throw BadRequestError('Symbol is required');
    }
    
    const summary = await backtestService.runMultiTimeframeBacktest(
      symbol.toUpperCase(),
      days
    );
    
    res.json({
      success: true,
      data: summary,
    });
  }),
  
  /**
   * POST /api/backtest/batch
   * Ejecuta backtest para múltiples símbolos
   */
  runBatch: asyncHandler(async (req: Request, res: Response) => {
    const { symbols, days = 60 } = req.body;
    
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      throw BadRequestError('Symbols array is required');
    }
    
    if (symbols.length > 10) {
      throw BadRequestError('Maximum 10 symbols per batch');
    }
    
    const results = [];
    
    for (const symbol of symbols) {
      try {
        const summary = await backtestService.runMultiTimeframeBacktest(
          symbol.toUpperCase(),
          days
        );
        results.push({ symbol, success: true, data: summary });
      } catch (error: any) {
        results.push({ symbol, success: false, error: error.message });
      }
    }
    
    // Ordenar por accuracy
    results.sort((a, b) => {
      if (!a.success) return 1;
      if (!b.success) return -1;
      return (b.data?.directionAccuracy || 0) - (a.data?.directionAccuracy || 0);
    });
    
    res.json({
      success: true,
      data: {
        tested: symbols.length,
        successful: results.filter(r => r.success).length,
        results,
      },
    });
  }),
};
