/**
 * Servicio de Inversores Institucionales Mejorado
 * 
 * Analiza la actividad de fondos e insiders con mayor detalle
 * Detecta cambios recientes en posiciones institucionales
 */

import { logger } from '../../middleware/logger.js';
import { yahooAuthService } from './yahoo-auth.service.js';

export interface InstitutionalData {
  ownershipPercent: number | null;
  numberOfInstitutions: number | null;
  insiderTrend: 'buying' | 'selling' | 'neutral';
  insiderNetValue: number; // Valor neto de compras/ventas en USD
  recentInsiderTxCount: number; // Número de transacciones recientes
  topHolders: string[];
  hasSmartMoney: boolean; // Si hay fondos de renombre
  institutionalScore: number; // -100 a +100
  hasData: boolean;
  dataQuality: 'high' | 'medium' | 'low';
  summary: string;
}

// Cache
const cache = new Map<string, { data: InstitutionalData; timestamp: number }>();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hora

// Fondos de renombre (smart money) que suelen tener análisis profundo
const SMART_MONEY_KEYWORDS = [
  'vanguard', 'blackrock', 'state street', 'fidelity', 'berkshire',
  'capital group', 'wellington', 't. rowe price', 'jpmorgan',
  'goldman sachs', 'morgan stanley', 'citadel', 'renaissance',
  'bridgewater', 'two sigma', 'de shaw', 'aqr', 'point72',
  'millennium', 'elliott', 'third point', 'pershing square',
  'baupost', 'appaloosa', 'tiger global', 'coatue', 'viking',
  'norges bank', 'government pension', 'sovereign',
];

// Keywords de transacciones de compra
const BUY_KEYWORDS = [
  'purchase', 'buy', 'acquisition', 'exercise', 'conversion',
  'gift received', 'award', 'grant',
];

// Keywords de transacciones de venta
const SELL_KEYWORDS = [
  'sale', 'sell', 'disposition', 'automatic sale',
  'tax withholding', 'gift', 'transfer out',
];

export const institutionalService = {
  async getInstitutionalActivity(symbol: string, type: 'stock' | 'crypto'): Promise<InstitutionalData> {
    // Cryptos no tienen datos institucionales tradicionales
    if (type === 'crypto' || symbol.includes('-USD') || symbol.includes('-EUR')) {
      return this.getDefaultData();
    }

    const cached = cache.get(symbol);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }

    try {
      // Obtener datos de Yahoo Finance con autenticación
      const modules = ['institutionOwnership', 'insiderHolders', 'insiderTransactions', 'majorHoldersBreakdown'];
      const result = await yahooAuthService.fetchQuoteSummary(symbol, modules);

      if (!result) {
        return this.getDefaultData();
      }

      const data = this.parseYahooData(symbol, result);
      cache.set(symbol, { data, timestamp: Date.now() });
      
      logger.info(`[Institutional] ${symbol}: score=${data.institutionalScore}, ownership=${data.ownershipPercent}%, smartMoney=${data.hasSmartMoney}, insiderNet=$${data.insiderNetValue}`);
      return data;
    } catch (error) {
      logger.error(`[Institutional] Error for ${symbol}:`, error);
      return this.getDefaultData();
    }
  },

  parseYahooData(symbol: string, data: any): InstitutionalData {
    const institutionOwnership = data.institutionOwnership;
    const majorHoldersBreakdown = data.majorHoldersBreakdown;
    const insiderTransactions = data.insiderTransactions?.transactions || [];

    // Ownership institucional
    let ownershipPercent: number | null = null;
    let numberOfInstitutions: number | null = null;
    const topHolders: string[] = [];
    let hasSmartMoney = false;

    // Usar majorHoldersBreakdown si está disponible (más preciso)
    if (majorHoldersBreakdown) {
      const instHold = majorHoldersBreakdown.institutionsPercentHeld;
      if (instHold !== undefined) {
        ownershipPercent = instHold * 100;
      }
      numberOfInstitutions = majorHoldersBreakdown.institutionsCount ?? null;
    }

    if (institutionOwnership?.ownershipList) {
      const owners = institutionOwnership.ownershipList;
      
      if (!numberOfInstitutions) {
        numberOfInstitutions = owners.length;
      }
      
      // Top 5 holders con detalles
      for (const owner of owners.slice(0, 5)) {
        if (owner.organization) {
          const name = owner.organization;
          topHolders.push(name);
          
          // Verificar si es smart money
          const nameLower = name.toLowerCase();
          if (SMART_MONEY_KEYWORDS.some(keyword => nameLower.includes(keyword))) {
            hasSmartMoney = true;
          }
        }
      }

      // Si no tenemos ownership del breakdown, calcularlo
      if (ownershipPercent === null) {
        let totalPctHeld = 0;
        for (const owner of owners.slice(0, 10)) {
          const pctHeld = owner.pctHeld ?? 0;
          totalPctHeld += pctHeld * 100;
        }
        ownershipPercent = Math.min(100, totalPctHeld * 1.5);
      }
    }

    // Actividad de insiders - análisis mejorado
    let insiderBuyShares = 0;
    let insiderSellShares = 0;
    let insiderBuyValue = 0;
    let insiderSellValue = 0;
    let recentTxCount = 0;
    const now = Date.now();
    const threeMonthsAgo = now - 90 * 24 * 60 * 60 * 1000;

    for (const tx of insiderTransactions) {
      const shares = tx.shares ?? 0;
      const value = tx.value ?? 0;
      const txText = (tx.transactionText || '').toLowerCase();
      const txDate = tx.startDate?.raw ? tx.startDate.raw * 1000 : 0;
      
      // Solo contar transacciones recientes (últimos 3 meses)
      const isRecent = txDate > threeMonthsAgo;
      if (isRecent) {
        recentTxCount++;
      }

      // Determinar si es compra o venta
      const isBuy = BUY_KEYWORDS.some(keyword => txText.includes(keyword));
      const isSell = SELL_KEYWORDS.some(keyword => txText.includes(keyword));
      
      // Dar más peso a transacciones recientes
      const weight = isRecent ? 1.5 : 1;

      if (isBuy && !isSell) {
        insiderBuyShares += shares * weight;
        insiderBuyValue += value * weight;
      } else if (isSell && !isBuy) {
        insiderSellShares += shares * weight;
        insiderSellValue += value * weight;
      }
      // Si es ambiguo (ej: "tax withholding" en un award), ignorar
    }

    const insiderNetValue = insiderBuyValue - insiderSellValue;

    // Determinar tendencia de insiders
    let insiderTrend: 'buying' | 'selling' | 'neutral' = 'neutral';
    
    // Basarse más en valor que en shares (más significativo)
    if (insiderBuyValue > 0 || insiderSellValue > 0) {
      const ratio = insiderBuyValue / Math.max(insiderSellValue, 1);
      if (ratio > 2) insiderTrend = 'buying';
      else if (ratio < 0.5) insiderTrend = 'selling';
    } else if (insiderBuyShares > 0 || insiderSellShares > 0) {
      // Fallback a shares si no hay valores
      if (insiderBuyShares > insiderSellShares * 1.5) insiderTrend = 'buying';
      else if (insiderSellShares > insiderBuyShares * 1.5) insiderTrend = 'selling';
    }

    // Calcular score con pesos mejorados
    let institutionalScore = 0;

    // Ownership institucional (hasta +25)
    if (ownershipPercent !== null) {
      if (ownershipPercent > 80) institutionalScore += 25;
      else if (ownershipPercent > 60) institutionalScore += 20;
      else if (ownershipPercent > 40) institutionalScore += 15;
      else if (ownershipPercent > 20) institutionalScore += 10;
      else institutionalScore += 5;
    }

    // Smart money bonus (+10)
    if (hasSmartMoney) {
      institutionalScore += 10;
    }

    // Actividad de insiders (hasta ±50)
    if (insiderTrend === 'buying') {
      // Escalar por valor de transacciones
      if (insiderNetValue > 10000000) institutionalScore += 50; // > $10M
      else if (insiderNetValue > 1000000) institutionalScore += 40; // > $1M
      else if (insiderNetValue > 100000) institutionalScore += 30; // > $100K
      else institutionalScore += 20;
    } else if (insiderTrend === 'selling') {
      // Ventas son ligeramente menos negativas (pueden ser por diversificación)
      if (Math.abs(insiderNetValue) > 10000000) institutionalScore -= 40;
      else if (Math.abs(insiderNetValue) > 1000000) institutionalScore -= 30;
      else if (Math.abs(insiderNetValue) > 100000) institutionalScore -= 20;
      else institutionalScore -= 10;
    }

    // Muchas transacciones recientes indica atención (+5)
    if (recentTxCount > 5) {
      institutionalScore += 5;
    }

    institutionalScore = Math.max(-100, Math.min(100, institutionalScore));

    // Determinar calidad de datos
    const dataQuality: 'high' | 'medium' | 'low' = 
      (ownershipPercent !== null && insiderTransactions.length > 0) ? 'high' :
      (ownershipPercent !== null || insiderTransactions.length > 0) ? 'medium' : 'low';

    // Generar summary con emojis
    let summary = '';
    if (ownershipPercent !== null) {
      const emoji = ownershipPercent > 60 ? '🏦' : ownershipPercent > 30 ? '📊' : '📉';
      summary = `${emoji} ${ownershipPercent.toFixed(0)}% institucional (${numberOfInstitutions || '?'} fondos).`;
    }
    if (hasSmartMoney && topHolders.length > 0) {
      summary += ` Smart money: ${topHolders.slice(0, 2).join(', ')}.`;
    }
    if (insiderTrend !== 'neutral') {
      const emoji = insiderTrend === 'buying' ? '🟢' : '🔴';
      const netStr = Math.abs(insiderNetValue) > 1000000 
        ? `$${(insiderNetValue / 1000000).toFixed(1)}M` 
        : Math.abs(insiderNetValue) > 1000 
        ? `$${(insiderNetValue / 1000).toFixed(0)}K`
        : '';
      summary += ` ${emoji} Insiders ${insiderTrend === 'buying' ? 'comprando' : 'vendiendo'}${netStr ? ` (neto: ${netStr})` : ''}.`;
    }
    if (!summary) {
      summary = '❓ Sin datos institucionales significativos.';
    }

    return {
      ownershipPercent,
      numberOfInstitutions,
      insiderTrend,
      insiderNetValue,
      recentInsiderTxCount: recentTxCount,
      topHolders,
      hasSmartMoney,
      institutionalScore,
      hasData: ownershipPercent !== null || insiderTransactions.length > 0,
      dataQuality,
      summary,
    };
  },

  getDefaultData(): InstitutionalData {
    return {
      ownershipPercent: null,
      numberOfInstitutions: null,
      insiderTrend: 'neutral',
      insiderNetValue: 0,
      recentInsiderTxCount: 0,
      topHolders: [],
      hasSmartMoney: false,
      institutionalScore: 0,
      hasData: false,
      dataQuality: 'low',
      summary: '❓ Sin datos institucionales.',
    };
  },
};
