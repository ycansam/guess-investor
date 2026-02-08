/**
 * Alerts Service
 * Gestiona alertas de precio para activos
 * NOTA: Usa almacenamiento en memoria. Para persistencia con Prisma:
 * 1. Detener el backend
 * 2. Ejecutar: npx prisma generate
 * 3. Reiniciar el backend
 */

import { logger } from '../../middleware/logger.js';
// import { prisma } from '../../config/database.js'; // Descomentar cuando Prisma esté listo

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
  triggeredAt?: Date;
  triggeredPrice?: number;
  createdAt: Date;
  expiresAt?: Date;
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
  expiresAt?: Date;
}

// Almacenamiento en memoria (temporal hasta que Prisma esté configurado)
let alertsStore: PriceAlert[] = [];
let nextId = 1;

function generateId(): string {
  return `alert_${Date.now()}_${nextId++}`;
}

export const alertsService = {
  /**
   * Crear una nueva alerta de precio
   */
  async createAlert(input: CreateAlertInput): Promise<PriceAlert> {
    try {
      const alert: PriceAlert = {
        id: generateId(),
        symbol: input.symbol.toUpperCase(),
        assetName: input.assetName,
        targetPrice: input.targetPrice || 0,
        currentPrice: input.currentPrice,
        percentChange: input.percentChange,
        condition: input.condition,
        isActive: true,
        isTriggered: false,
        createdAt: new Date(),
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
        note: input.note,
      };

      alertsStore.push(alert);
      logger.info(`[Alerts] Created alert for ${input.symbol}: ${input.condition} ${input.targetPrice || input.percentChange + '%'}`);

      return alert;
    } catch (error) {
      logger.error('[Alerts] Error creating alert:', error);
      throw error;
    }
  },

  /**
   * Obtener todas las alertas activas
   */
  async getActiveAlerts(): Promise<PriceAlert[]> {
    try {
      const now = new Date();
      return alertsStore.filter(a => 
        a.isActive && 
        !a.isTriggered && 
        (!a.expiresAt || a.expiresAt > now)
      );
    } catch (error) {
      logger.error('[Alerts] Error getting active alerts:', error);
      return [];
    }
  },

  /**
   * Obtener alertas para un símbolo específico
   */
  async getAlertsForSymbol(symbol: string): Promise<PriceAlert[]> {
    try {
      return alertsStore.filter(a => 
        a.symbol === symbol.toUpperCase() && a.isActive
      );
    } catch (error) {
      logger.error('[Alerts] Error getting alerts for symbol:', error);
      return [];
    }
  },

  /**
   * Obtener alertas disparadas
   */
  async getTriggeredAlerts(limit: number = 20): Promise<PriceAlert[]> {
    try {
      return alertsStore
        .filter(a => a.isTriggered)
        .sort((a, b) => {
          const dateA = a.triggeredAt ? new Date(a.triggeredAt).getTime() : 0;
          const dateB = b.triggeredAt ? new Date(b.triggeredAt).getTime() : 0;
          return dateB - dateA;
        })
        .slice(0, limit);
    } catch (error) {
      logger.error('[Alerts] Error getting triggered alerts:', error);
      return [];
    }
  },

  /**
   * Verificar alertas contra precios actuales
   */
  async checkAlerts(priceUpdates: { symbol: string; price: number }[]): Promise<PriceAlert[]> {
    try {
      const triggeredAlerts: PriceAlert[] = [];
      const now = new Date();

      for (const update of priceUpdates) {
        const symbolAlerts = alertsStore.filter(
          a => a.symbol === update.symbol.toUpperCase() && 
               a.isActive && 
               !a.isTriggered &&
               (!a.expiresAt || a.expiresAt > now)
        );

        for (const alert of symbolAlerts) {
          let shouldTrigger = false;

          if (alert.targetPrice > 0) {
            if (alert.condition === 'above' && update.price >= alert.targetPrice) {
              shouldTrigger = true;
            } else if (alert.condition === 'below' && update.price <= alert.targetPrice) {
              shouldTrigger = true;
            }
          } else if (alert.percentChange) {
            const change = ((update.price - alert.currentPrice) / alert.currentPrice) * 100;
            if (alert.condition === 'above' && change >= alert.percentChange) {
              shouldTrigger = true;
            } else if (alert.condition === 'below' && change <= -alert.percentChange) {
              shouldTrigger = true;
            }
          }

          if (shouldTrigger) {
            alert.isTriggered = true;
            alert.triggeredAt = now;
            alert.triggeredPrice = update.price;
            triggeredAlerts.push(alert);
            
            logger.info(`[Alerts] Alert triggered for ${alert.symbol} at ${update.price}`);
          }
        }
      }

      return triggeredAlerts;
    } catch (error) {
      logger.error('[Alerts] Error checking alerts:', error);
      return [];
    }
  },

  /**
   * Eliminar una alerta
   */
  async deleteAlert(alertId: string): Promise<boolean> {
    try {
      const index = alertsStore.findIndex(a => a.id === alertId);
      if (index === -1) return false;
      
      alertsStore.splice(index, 1);
      logger.info(`[Alerts] Deleted alert ${alertId}`);
      return true;
    } catch (error) {
      logger.error('[Alerts] Error deleting alert:', error);
      return false;
    }
  },

  /**
   * Desactivar una alerta
   */
  async deactivateAlert(alertId: string): Promise<boolean> {
    try {
      const alert = alertsStore.find(a => a.id === alertId);
      if (!alert) return false;
      
      alert.isActive = false;
      logger.info(`[Alerts] Deactivated alert ${alertId}`);
      return true;
    } catch (error) {
      logger.error('[Alerts] Error deactivating alert:', error);
      return false;
    }
  },
};
