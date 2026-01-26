/**
 * Notes Service
 * 
 * Servicio para gestionar notas de inversión:
 * - Apuntes sobre activos
 * - Tesis de inversión
 * - Precios de referencia (target, entry, stop loss)
 */

// URL base del backend
const API_BASE_URL = __DEV__ 
  ? 'http://localhost:3001/api' 
  : 'https://your-production-url.com/api';

// ============================================================================
// TYPES
// ============================================================================

export type NoteStatus = 'watching' | 'bought' | 'sold' | 'archived';

export interface InvestmentNote {
  id: string;
  symbol: string;
  name: string;
  assetType: string;
  notes?: string;
  thesis?: string;
  targetPrice?: number;
  entryPrice?: number;
  stopLoss?: number;
  status: NoteStatus;
  rating?: number;
  createdAt: string;
  updatedAt: string;
  // Datos de mercado (calculados)
  currentPrice: number;
  dayChange: number;
  atTarget: boolean;
  atEntry: boolean;
  atStopLoss: boolean;
  distanceToTarget: number | null;
  distanceToEntry: number | null;
}

export interface NotesData {
  notes: InvestmentNote[];
  counts: Record<string, number>;
}

export interface CreateNoteInput {
  symbol: string;
  name: string;
  assetType: string;
  notes?: string;
  thesis?: string;
  targetPrice?: number;
  entryPrice?: number;
  stopLoss?: number;
  status?: NoteStatus;
  rating?: number;
}

export interface UpdateNoteInput {
  notes?: string;
  thesis?: string;
  targetPrice?: number | null;
  entryPrice?: number | null;
  stopLoss?: number | null;
  status?: NoteStatus;
  rating?: number | null;
}

// ============================================================================
// SERVICE
// ============================================================================

export const notesService = {
  /**
   * Obtener todas las notas
   */
  async getAll(status?: NoteStatus): Promise<NotesData | null> {
    try {
      const params = status ? `?status=${status}` : '';
      const response = await fetch(`${API_BASE_URL}/notes${params}`);
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
  async update(symbol: string, input: UpdateNoteInput): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/notes/${symbol}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('[Notes] Error updating note:', error);
      return false;
    }
  },

  /**
   * Cambiar estado
   */
  async updateStatus(symbol: string, status: NoteStatus): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/notes/${symbol}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('[Notes] Error updating status:', error);
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
