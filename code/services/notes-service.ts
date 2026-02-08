/**
 * Notes Service
 * 
 * Servicio simple para gestionar notas de texto por activo
 */

// URL base del backend
const API_BASE_URL = __DEV__ 
  ? 'http://localhost:3001/api' 
  : 'https://your-production-url.com/api';

// ============================================================================
// TYPES
// ============================================================================

export interface InvestmentNote {
  id: string;
  symbol: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotesData {
  notes: InvestmentNote[];
  count: number;
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
  async upsert(symbol: string, note: string): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, note }),
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
  async update(symbol: string, note: string): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/notes/${symbol}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('[Notes] Error updating note:', error);
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
