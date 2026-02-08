/**
 * Notes Service
 * 
 * Servicio simplificado para gestionar notas de inversión
 * Solo 3 campos de dinero + resultado + nota de texto
 */

// URL base del backend
const API_BASE_URL = __DEV__ 
  ? 'http://localhost:3001/api' 
  : 'https://your-production-url.com/api';

// ============================================================================
// TYPES
// ============================================================================

export type ResultadoTipo = 'beneficiado' | 'perdida';

export interface InvestmentNote {
  id: string;
  symbol: string;
  dineroInvertido: number;
  beneficioEsperado: number;
  perdidaEsperada: number;
  resultado: ResultadoTipo | null;
  resultadoFinal: number | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WalletTotals {
  totalBeneficios: number;
  totalPerdidas: number;
  balance: number;
  countBeneficios: number;
  countPerdidas: number;
  countAbiertas: number;
}

export interface NotesData {
  notes: InvestmentNote[];
  count: number;
  wallet: WalletTotals;
}

export interface CreateNoteInput {
  symbol: string;
  dineroInvertido: number;
  beneficioEsperado: number;
  perdidaEsperada: number;
  note?: string;
}

// ============================================================================
// SERVICE
// ============================================================================

export const notesService = {
  /**
   * Obtener todas las notas
   */
  async getAll(): Promise<NotesData | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/notes`);
      const result = await response.json();
      
      if (result.success) {
        return result.data;
      }
      console.error('[Notes] Error getting notes:', result.error);
      return null;
    } catch (error) {
      console.error('[Notes] Network error:', error);
      return null;
    }
  },

  /**
   * Obtener totales del wallet
   */
  async getWallet(): Promise<WalletTotals | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/notes/wallet`);
      const result = await response.json();
      
      if (result.success) {
        return result.data;
      }
      return null;
    } catch (error) {
      console.error('[Notes] Error getting wallet:', error);
      return null;
    }
  },

  /**
   * Obtener nota por símbolo
   */
  async getBySymbol(symbol: string): Promise<InvestmentNote | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/notes/${symbol}`);
      const result = await response.json();
      
      if (result.success) {
        return result.data;
      }
      return null;
    } catch (error) {
      console.error('[Notes] Error getting note:', error);
      return null;
    }
  },

  /**
   * Crear o actualizar nota
   */
  async upsert(input: CreateNoteInput): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('[Notes] Error creating note:', error);
      return false;
    }
  },

  /**
   * Actualizar nota
   */
  async update(symbol: string, data: Partial<CreateNoteInput>): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/notes/${symbol}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('[Notes] Error updating note:', error);
      return false;
    }
  },

  /**
   * Establecer resultado (beneficiado o pérdida)
   */
  async setResult(symbol: string, resultado: ResultadoTipo, resultadoFinal: number): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/notes/${symbol}/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resultado, resultadoFinal }),
      });
      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('[Notes] Error setting result:', error);
      return false;
    }
  },

  /**
   * Limpiar resultado (reabrir posición)
   */
  async clearResult(symbol: string): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/notes/${symbol}/result`, {
        method: 'DELETE',
      });
      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('[Notes] Error clearing result:', error);
      return false;
    }
  },

  /**
   * Eliminar nota
   */
  async delete(symbol: string): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/notes/${symbol}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('[Notes] Error deleting note:', error);
      return false;
    }
  },
};
