/**
 * Servicio de Inversores Institucionales
 * 
 * Analiza la actividad de fondos e insiders
 */

import { logger } from '../../middleware/logger.js';

export interface InstitutionalData {
  ownershipPercent: number | null;
  numberOfInstitutions: number | null;
  insiderTrend: 'buying' | 'selling' | 'neutral';
  topHolders: string[];
  institutionalScore: number; // -100 a +100
  hasData: boolean;
  summary: string;
}

// Cache
const cache = new Map<string, { data: InstitutionalData; timestamp: number }>();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hora

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
      // Obtener datos de Yahoo Finance
      const modules = ['institutionOwnership', 'insiderHolders', 'insiderTransactions'];
      const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules.join(',')}`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (!response.ok) {
        logger.warn(`[Institutional] Failed to fetch for ${symbol}: ${response.status}`);
        return this.getDefaultData();
      }

      const json: any = await response.json();
      const result = json.quoteSummary?.result?.[0];

      if (!result) {
        return this.getDefaultData();
      }

      const data = this.parseYahooData(symbol, result);
      cache.set(symbol, { data, timestamp: Date.now() });
      
      logger.info(`[Institutional] ${symbol}: score=${data.institutionalScore}, ownership=${data.ownershipPercent}%`);
      return data;
    } catch (error) {
      logger.error(`[Institutional] Error for ${symbol}:`, error);
      return this.getDefaultData();
    }
  },

  parseYahooData(symbol: string, data: any): InstitutionalData {
    const institutionOwnership = data.institutionOwnership;
    const insiderTransactions = data.insiderTransactions?.transactions || [];

    // Ownership institucional
    let ownershipPercent: number | null = null;
    let numberOfInstitutions: number | null = null;
    const topHolders: string[] = [];

    if (institutionOwnership?.ownershipList) {
      const owners = institutionOwnership.ownershipList;
      numberOfInstitutions = owners.length;
      
      // Top 3 holders
      for (const owner of owners.slice(0, 3)) {
        if (owner.organization) {
          topHolders.push(owner.organization);
        }
      }

      // Calcular % total (aproximado)
      let totalPctHeld = 0;
      for (const owner of owners.slice(0, 10)) {
        if (owner.pctHeld?.raw) {
          totalPctHeld += owner.pctHeld.raw * 100;
        }
      }
      // Estimar ownership total (los top 10 suelen ser ~30-50%)
      ownershipPercent = Math.min(100, totalPctHeld * 1.5);
    }

    // Actividad de insiders
    let insiderBuys = 0;
    let insiderSells = 0;
    let insiderNetValue = 0;

    for (const tx of insiderTransactions.slice(0, 10)) {
      const shares = tx.shares?.raw || 0;
      const value = tx.value?.raw || 0;
      
      if (tx.transactionText?.toLowerCase().includes('purchase') || 
          tx.transactionText?.toLowerCase().includes('buy')) {
        insiderBuys += shares;
        insiderNetValue += value;
      } else if (tx.transactionText?.toLowerCase().includes('sale') || 
                 tx.transactionText?.toLowerCase().includes('sell')) {
        insiderSells += shares;
        insiderNetValue -= value;
      }
    }

    let insiderTrend: 'buying' | 'selling' | 'neutral' = 'neutral';
    if (insiderBuys > insiderSells * 1.5) insiderTrend = 'buying';
    else if (insiderSells > insiderBuys * 1.5) insiderTrend = 'selling';

    // Calcular score
    let institutionalScore = 0;

    // Ownership alto es generalmente positivo (hasta +20)
    if (ownershipPercent !== null) {
      if (ownershipPercent > 70) institutionalScore += 20;
      else if (ownershipPercent > 50) institutionalScore += 15;
      else if (ownershipPercent > 30) institutionalScore += 10;
      else institutionalScore += 5;
    }

    // Actividad de insiders (hasta ±40)
    if (insiderTrend === 'buying') {
      institutionalScore += 40;
    } else if (insiderTrend === 'selling') {
      institutionalScore -= 30;
    }

    institutionalScore = Math.max(-100, Math.min(100, institutionalScore));

    // Generar summary
    let summary = '';
    if (ownershipPercent !== null) {
      summary = `${ownershipPercent.toFixed(0)}% en manos institucionales.`;
    }
    if (insiderTrend !== 'neutral') {
      summary += ` Insiders ${insiderTrend === 'buying' ? 'comprando' : 'vendiendo'}.`;
    }
    if (!summary) {
      summary = 'Sin datos institucionales significativos.';
    }

    return {
      ownershipPercent,
      numberOfInstitutions,
      insiderTrend,
      topHolders,
      institutionalScore,
      hasData: ownershipPercent !== null || insiderTransactions.length > 0,
      summary,
    };
  },

  getDefaultData(): InstitutionalData {
    return {
      ownershipPercent: null,
      numberOfInstitutions: null,
      insiderTrend: 'neutral',
      topHolders: [],
      institutionalScore: 0,
      hasData: false,
      summary: 'Sin datos institucionales.',
    };
  },
};
