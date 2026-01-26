/**
 * Portfolio Service
 * 
 * Servicio para gestionar el portfolio del usuario:
 * - Posiciones
 * - Transacciones
 * - Rendimiento
 * - Diversificación
 */

// URL base del backend
const API_BASE_URL = __DEV__ 
  ? 'http://localhost:3001/api' 
  : 'https://your-production-url.com/api';

// ============================================================================
// TYPES
// ============================================================================

export interface PortfolioPosition {
  id: string;
  symbol: string;
  name: string;
  assetType: string;
  shares: number;
  avgCost: number;
  currency: string;
  notes?: string;
  targetPrice?: number;
  stopLoss?: number;
  // Calculados
  currentPrice: number;
  marketValue: number;
  costBasis: number;
  gainLoss: number;
  gainLossPercent: number;
  dayChange: number;
  atTarget: boolean;
  atStopLoss: boolean;
}

export interface PortfolioSummary {
  positionCount: number;
  totalCostBasis: number;
  totalMarketValue: number;
  totalGainLoss: number;
  totalGainLossPercent: number;
  dayChange: number;
}

export interface DiversificationItem {
  symbol: string;
  name: string;
  assetType: string;
  weight: number;
  marketValue: number;
}

export interface AssetTypeAllocation {
  type: string;
  value: number;
  weight: number;
}

export interface PortfolioData {
  positions: PortfolioPosition[];
  summary: PortfolioSummary;
  diversification: DiversificationItem[];
  assetTypeAllocation: AssetTypeAllocation[];
}

export interface PortfolioTransaction {
  id: string;
  symbol: string;
  type: 'buy' | 'sell';
  shares: number;
  price: number;
  totalAmount: number;
  currency: string;
  commission: number;
  notes?: string;
  executedAt: string;
}

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

export interface BuySellInput {
  shares: number;
  price: number;
  commission?: number;
  notes?: string;
}

// ============================================================================
// SERVICE
// ============================================================================

export const portfolioService = {
  /**
   * Obtener todas las posiciones con datos actuales
   */
  async getPositions(): Promise<PortfolioData | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/portfolio/positions`);
      const result = await response.json();
      
      if (result.success) {
        return result.data;
      }
      console.error('[Portfolio] Error getting positions:', result.error);
      return null;
    } catch (error) {
      console.error('[Portfolio] Network error:', error);
      return null;
    }
  },

  /**
   * Crear nueva posición
   */
  async createPosition(input: CreatePositionInput): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/portfolio/positions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('[Portfolio] Error creating position:', error);
      return false;
    }
  },

  /**
   * Actualizar posición (notas, target, stop loss)
   */
  async updatePosition(
    symbol: string,
    updates: { notes?: string; targetPrice?: number; stopLoss?: number }
  ): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/portfolio/positions/${symbol}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('[Portfolio] Error updating position:', error);
      return false;
    }
  },

  /**
   * Comprar más de una posición existente
   */
  async buyMore(symbol: string, input: BuySellInput): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/portfolio/positions/${symbol}/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('[Portfolio] Error buying more:', error);
      return false;
    }
  },

  /**
   * Vender parte o toda la posición
   */
  async sell(symbol: string, input: BuySellInput): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/portfolio/positions/${symbol}/sell`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('[Portfolio] Error selling:', error);
      return false;
    }
  },

  /**
   * Eliminar posición completamente
   */
  async deletePosition(symbol: string): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/portfolio/positions/${symbol}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('[Portfolio] Error deleting position:', error);
      return false;
    }
  },

  /**
   * Obtener historial de transacciones
   */
  async getTransactions(symbol?: string, limit = 100): Promise<PortfolioTransaction[]> {
    try {
      const params = new URLSearchParams();
      if (symbol) params.append('symbol', symbol);
      if (limit) params.append('limit', limit.toString());

      const response = await fetch(`${API_BASE_URL}/portfolio/transactions?${params}`);
      const result = await response.json();
      
      if (result.success) {
        return result.data;
      }
      return [];
    } catch (error) {
      console.error('[Portfolio] Error getting transactions:', error);
      return [];
    }
  },

  /**
   * Eliminar transacción
   */
  async deleteTransaction(id: string): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/portfolio/transactions/${id}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('[Portfolio] Error deleting transaction:', error);
      return false;
    }
  },
};
