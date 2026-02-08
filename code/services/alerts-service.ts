/**
 * Alerts Service
 * Cliente frontend para gestionar alertas de precio
 */


const API_BASE_URL = 'http://192.168.1.45:3001/api';

export interface PriceAlert {
  id: string;
  symbol: string;
  assetName: string;
  targetPrice: number;
  currentPrice: number;
  condition: 'above' | 'below';
  percentChange?: number;
  isActive: boolean;
  isTriggered: boolean;
  triggeredAt?: string;
  triggeredPrice?: number;
  createdAt: string;
  expiresAt?: string;
  note?: string;
}

export interface CreateAlertInput {
  symbol: string;
  assetName: string;
  targetPrice?: number;
  percentChange?: number;
  condition: 'above' | 'below';
  currentPrice: number;
  note?: string;
  expiresAt?: string;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = 10000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const json = await response.json();
  if (!json.success) {
    throw new Error(json.error || 'Error desconocido');
  }
  return json.data;
}

export const alertsService = {
  /**
   * Obtener todas las alertas activas
   */
  async getActiveAlerts(): Promise<PriceAlert[]> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/alerts`);
    return handleResponse<PriceAlert[]>(response);
  },

  /**
   * Obtener alertas para un símbolo específico
   */
  async getAlertsForSymbol(symbol: string): Promise<PriceAlert[]> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/alerts/symbol/${encodeURIComponent(symbol)}`);
    return handleResponse<PriceAlert[]>(response);
  },

  /**
   * Obtener alertas disparadas
   */
  async getTriggeredAlerts(limit: number = 20): Promise<PriceAlert[]> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/alerts/triggered?limit=${limit}`);
    return handleResponse<PriceAlert[]>(response);
  },

  /**
   * Crear una nueva alerta
   */
  async createAlert(input: CreateAlertInput): Promise<PriceAlert> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/alerts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return handleResponse<PriceAlert>(response);
  },

  /**
   * Eliminar una alerta
   */
  async deleteAlert(id: string): Promise<boolean> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/alerts/${id}`, {
      method: 'DELETE',
    });
    const result = await handleResponse<{ deleted: boolean }>(response);
    return result.deleted;
  },

  /**
   * Desactivar una alerta (sin eliminarla)
   */
  async deactivateAlert(id: string): Promise<boolean> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/alerts/${id}/deactivate`, {
      method: 'PATCH',
    });
    const result = await handleResponse<{ deactivated: boolean }>(response);
    return result.deactivated;
  },

  /**
   * Verificar alertas con precios actuales
   * Retorna las alertas que se han disparado
   */
  async checkAlerts(prices: Record<string, number>): Promise<PriceAlert[]> {
    const response = await fetchWithTimeout(`${API_BASE_URL}/alerts/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prices }),
    });
    return handleResponse<PriceAlert[]>(response);
  },

  /**
   * Helper: Crear alerta de precio objetivo desde una predicción
   */
  async createAlertFromPrediction(
    symbol: string,
    assetName: string,
    currentPrice: number,
    targetPrice: number,
    direction: 'up' | 'down'
  ): Promise<PriceAlert> {
    return this.createAlert({
      symbol,
      assetName,
      currentPrice,
      targetPrice,
      condition: direction === 'up' ? 'above' : 'below',
      note: `Alerta desde predicción - Objetivo: ${targetPrice.toFixed(2)}`,
    });
  },

  /**
   * Helper: Crear alerta de cambio porcentual
   */
  async createPercentAlert(
    symbol: string,
    assetName: string,
    currentPrice: number,
    percentChange: number,
    condition: 'above' | 'below'
  ): Promise<PriceAlert> {
    return this.createAlert({
      symbol,
      assetName,
      currentPrice,
      percentChange,
      condition,
      note: `Alerta: ${condition === 'above' ? 'Sube' : 'Baja'} ${percentChange}%`,
    });
  },
};
