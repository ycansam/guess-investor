/**
 * Servicio de análisis de inversores institucionales
 * Obtiene datos reales de:
 * - Propiedad institucional (% en manos de fondos)
 * - Transacciones de insiders (compras/ventas recientes)
 * - Actividad neta de compra/venta
 * - Cambios en posiciones de fondos
 * 
 * Fuente: Yahoo Finance quoteSummary (módulos: institutionOwnership, insiderTransactions, netSharePurchaseActivity)
 */

import { fetchWithCorsProxy } from './cors-proxy';

export interface InstitutionalActivity {
  // Propiedad institucional
  institutionalOwnership: {
    percentage: number; // % de acciones en manos de instituciones
    numberOfInstitutions: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  } | null;
  
  // Transacciones de insiders recientes
  insiderTransactions: {
    totalBuys: number; // Número de compras últimos 6 meses
    totalSells: number; // Número de ventas últimos 6 meses
    netShares: number; // Acciones netas (positivo = más compras)
    netValue: number; // Valor neto de transacciones
    trend: 'buying' | 'selling' | 'neutral';
    recentTransactions: Array<{
      name: string;
      position: string;
      type: 'buy' | 'sell';
      shares: number;
      value: number;
      date: string;
    }>;
  } | null;
  
  // Actividad de compra de acciones (buybacks, insider buying)
  netSharePurchaseActivity: {
    buyPercentInsiderShares: number;
    sellPercentInsiderShares: number;
    netPercentInsiderShares: number;
    trend: 'bullish' | 'bearish' | 'neutral';
  } | null;
  
  // Principales holders institucionales
  topInstitutions: Array<{
    name: string;
    shares: number;
    percentHeld: number;
    change: number; // Cambio % en posición
  }>;
  
  // Score final (-100 a +100)
  institutionalScore: number;
  hasData: boolean;
  summary: string;
}

// Caché
interface CacheEntry {
  data: InstitutionalActivity;
  timestamp: number;
}
const institutionalCache = new Map<string, CacheEntry>();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hora (estos datos cambian poco)

class InstitutionalInvestorsService {
  
  /**
   * Obtiene datos de inversores institucionales para un símbolo
   */
  async getInstitutionalActivity(symbol: string, type: 'stock' | 'crypto'): Promise<InstitutionalActivity> {
    // Cryptos no tienen inversores institucionales tradicionales
    if (type === 'crypto') {
      return {
        institutionalOwnership: null,
        insiderTransactions: null,
        netSharePurchaseActivity: null,
        topInstitutions: [],
        institutionalScore: 0,
        hasData: false,
        summary: 'Las criptomonedas no tienen datos de inversores institucionales tradicionales',
      };
    }
    
    // Verificar caché
    const cached = institutionalCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`[Institutional] Cache hit: ${symbol}`);
      return cached.data;
    }
    
    console.log(`[Institutional] Obteniendo datos para ${symbol}`);
    
    try {
      // Módulos de Yahoo Finance para inversores
      const modules = [
        'institutionOwnership',
        'fundOwnership', 
        'insiderHolders',
        'insiderTransactions',
        'netSharePurchaseActivity',
        'majorHoldersBreakdown',
      ].join(',');
      
      const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}`;
      
      const response = await fetchWithCorsProxy(url);
      const data = await response.json();
      
      if (!data.quoteSummary?.result?.[0]) {
        console.warn(`[Institutional] Sin datos para ${symbol}`);
        return this.getEmptyResult('No se encontraron datos de inversores institucionales');
      }
      
      const result = data.quoteSummary.result[0];
      
      // Parsear datos de propiedad institucional
      const institutionalOwnership = this.parseInstitutionalOwnership(result);
      
      // Parsear transacciones de insiders
      const insiderTransactions = this.parseInsiderTransactions(result);
      
      // Parsear actividad neta de compra
      const netSharePurchaseActivity = this.parseNetSharePurchase(result);
      
      // Parsear top instituciones
      const topInstitutions = this.parseTopInstitutions(result);
      
      // Calcular score y generar resumen
      const { score, summary } = this.calculateScore(
        institutionalOwnership,
        insiderTransactions,
        netSharePurchaseActivity,
        topInstitutions
      );
      
      const activityData: InstitutionalActivity = {
        institutionalOwnership,
        insiderTransactions,
        netSharePurchaseActivity,
        topInstitutions,
        institutionalScore: score,
        hasData: institutionalOwnership !== null || insiderTransactions !== null || topInstitutions.length > 0,
        summary,
      };
      
      // Guardar en caché
      institutionalCache.set(symbol, { data: activityData, timestamp: Date.now() });
      
      console.log(`[Institutional] Score: ${score}, hasData: ${activityData.hasData}`);
      
      return activityData;
      
    } catch (error) {
      console.error(`[Institutional] Error obteniendo datos:`, error);
      return this.getEmptyResult('Error obteniendo datos de inversores institucionales');
    }
  }
  
  private getEmptyResult(message: string): InstitutionalActivity {
    return {
      institutionalOwnership: null,
      insiderTransactions: null,
      netSharePurchaseActivity: null,
      topInstitutions: [],
      institutionalScore: 0,
      hasData: false,
      summary: message,
    };
  }
  
  private parseInstitutionalOwnership(result: any): InstitutionalActivity['institutionalOwnership'] {
    try {
      const breakdown = result.majorHoldersBreakdown;
      const institutions = result.institutionOwnership?.ownershipList || [];
      
      if (!breakdown) return null;
      
      const pctHeldByInstitutions = breakdown.institutionsPercentHeld?.raw || 0;
      const numberOfInstitutions = breakdown.institutionsCount?.raw || institutions.length;
      
      // Determinar tendencia comparando con datos históricos
      // (Simplificado: asumimos estable si no hay suficientes datos)
      let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
      
      // Si hay cambios en posiciones recientes, inferir tendencia
      if (institutions.length > 0) {
        const totalChange = institutions.reduce((sum: number, inst: any) => {
          return sum + (inst.pctChange?.raw || 0);
        }, 0);
        
        if (totalChange > 1) trend = 'increasing';
        else if (totalChange < -1) trend = 'decreasing';
      }
      
      console.log(`[Institutional] Ownership: ${(pctHeldByInstitutions * 100).toFixed(1)}% (${numberOfInstitutions} instituciones, trend: ${trend})`);
      
      return {
        percentage: pctHeldByInstitutions * 100,
        numberOfInstitutions,
        trend,
      };
    } catch (error) {
      console.warn(`[Institutional] Error parseando ownership:`, error);
      return null;
    }
  }
  
  private parseInsiderTransactions(result: any): InstitutionalActivity['insiderTransactions'] {
    try {
      const transactions = result.insiderTransactions?.transactions || [];
      
      if (transactions.length === 0) return null;
      
      let totalBuys = 0;
      let totalSells = 0;
      let netShares = 0;
      let netValue = 0;
      
      const recentTransactions: InstitutionalActivity['insiderTransactions']['recentTransactions'] = [];
      
      // Procesar últimas transacciones (máximo 10)
      const recentTxs = transactions.slice(0, 10);
      
      for (const tx of recentTxs) {
        const shares = tx.shares?.raw || 0;
        const value = tx.value?.raw || 0;
        const transactionType = tx.transactionText?.toLowerCase() || '';
        
        // Determinar si es compra o venta
        const isBuy = transactionType.includes('purchase') || 
                      transactionType.includes('buy') ||
                      transactionType.includes('acquisition') ||
                      transactionType.includes('exercise');
        const isSell = transactionType.includes('sale') || 
                       transactionType.includes('sell') ||
                       transactionType.includes('disposition');
        
        if (isBuy) {
          totalBuys++;
          netShares += shares;
          netValue += value;
        } else if (isSell) {
          totalSells++;
          netShares -= shares;
          netValue -= value;
        }
        
        // Añadir a lista de transacciones recientes
        if (recentTransactions.length < 5 && (isBuy || isSell)) {
          recentTransactions.push({
            name: tx.filerName || 'Insider',
            position: tx.filerRelation || 'Unknown',
            type: isBuy ? 'buy' : 'sell',
            shares: Math.abs(shares),
            value: Math.abs(value),
            date: tx.startDate?.fmt || '',
          });
        }
      }
      
      // Determinar tendencia
      let trend: 'buying' | 'selling' | 'neutral' = 'neutral';
      if (totalBuys > totalSells * 1.5) trend = 'buying';
      else if (totalSells > totalBuys * 1.5) trend = 'selling';
      
      console.log(`[Institutional] Insider tx: ${totalBuys} compras, ${totalSells} ventas (trend: ${trend})`);
      
      return {
        totalBuys,
        totalSells,
        netShares,
        netValue,
        trend,
        recentTransactions,
      };
    } catch (error) {
      console.warn(`[Institutional] Error parseando insider transactions:`, error);
      return null;
    }
  }
  
  private parseNetSharePurchase(result: any): InstitutionalActivity['netSharePurchaseActivity'] {
    try {
      const activity = result.netSharePurchaseActivity;
      
      if (!activity) return null;
      
      const buyPct = activity.buyPercentInsiderShares?.raw || 0;
      const sellPct = activity.sellPercentInsiderShares?.raw || 0;
      const netPct = activity.netPercentInsiderShares?.raw || 0;
      
      let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
      if (netPct > 0.5) trend = 'bullish';
      else if (netPct < -0.5) trend = 'bearish';
      
      console.log(`[Institutional] Net share activity: buy ${(buyPct * 100).toFixed(1)}%, sell ${(sellPct * 100).toFixed(1)}%, net ${(netPct * 100).toFixed(1)}%`);
      
      return {
        buyPercentInsiderShares: buyPct * 100,
        sellPercentInsiderShares: sellPct * 100,
        netPercentInsiderShares: netPct * 100,
        trend,
      };
    } catch (error) {
      console.warn(`[Institutional] Error parseando net share purchase:`, error);
      return null;
    }
  }
  
  private parseTopInstitutions(result: any): InstitutionalActivity['topInstitutions'] {
    try {
      const institutions = result.institutionOwnership?.ownershipList || [];
      const funds = result.fundOwnership?.ownershipList || [];
      
      // Combinar instituciones y fondos
      const allHolders = [...institutions, ...funds];
      
      // Ordenar por % de posición y tomar top 5
      const topHolders = allHolders
        .sort((a: any, b: any) => (b.pctHeld?.raw || 0) - (a.pctHeld?.raw || 0))
        .slice(0, 5)
        .map((holder: any) => ({
          name: holder.organization || 'Unknown',
          shares: holder.position?.raw || 0,
          percentHeld: (holder.pctHeld?.raw || 0) * 100,
          change: (holder.pctChange?.raw || 0) * 100,
        }));
      
      if (topHolders.length > 0) {
        console.log(`[Institutional] Top holders: ${topHolders.map(h => h.name).join(', ')}`);
      }
      
      return topHolders;
    } catch (error) {
      console.warn(`[Institutional] Error parseando top institutions:`, error);
      return [];
    }
  }
  
  private calculateScore(
    ownership: InstitutionalActivity['institutionalOwnership'],
    transactions: InstitutionalActivity['insiderTransactions'],
    netActivity: InstitutionalActivity['netSharePurchaseActivity'],
    topInstitutions: InstitutionalActivity['topInstitutions']
  ): { score: number; summary: string } {
    let score = 0;
    const signals: string[] = [];
    
    // 1. Propiedad institucional (30% del score)
    if (ownership) {
      // Alto % institucional = más estabilidad y confianza
      if (ownership.percentage > 80) {
        score += 15;
        signals.push('Alta propiedad institucional');
      } else if (ownership.percentage > 50) {
        score += 10;
      } else if (ownership.percentage < 20) {
        score -= 5;
      }
      
      // Tendencia de ownership
      if (ownership.trend === 'increasing') {
        score += 15;
        signals.push('Instituciones aumentando posiciones');
      } else if (ownership.trend === 'decreasing') {
        score -= 15;
        signals.push('Instituciones reduciendo posiciones');
      }
    }
    
    // 2. Transacciones de insiders (40% del score)
    if (transactions) {
      if (transactions.trend === 'buying') {
        score += 30;
        signals.push(`Insiders comprando (${transactions.totalBuys} compras vs ${transactions.totalSells} ventas)`);
      } else if (transactions.trend === 'selling') {
        score -= 25;
        signals.push(`Insiders vendiendo (${transactions.totalSells} ventas vs ${transactions.totalBuys} compras)`);
      }
      
      // Bonus/penalización por volumen
      if (transactions.netValue > 1000000) {
        score += 10; // Compras masivas
      } else if (transactions.netValue < -1000000) {
        score -= 10; // Ventas masivas
      }
    }
    
    // 3. Actividad neta (20% del score)
    if (netActivity) {
      if (netActivity.trend === 'bullish') {
        score += 15;
        signals.push('Actividad neta de compra positiva');
      } else if (netActivity.trend === 'bearish') {
        score -= 15;
        signals.push('Actividad neta de venta negativa');
      }
    }
    
    // 4. Cambios en top instituciones (10% del score)
    if (topInstitutions.length > 0) {
      const avgChange = topInstitutions.reduce((sum, inst) => sum + inst.change, 0) / topInstitutions.length;
      
      if (avgChange > 5) {
        score += 10;
        signals.push('Grandes fondos aumentando posiciones');
      } else if (avgChange < -5) {
        score -= 10;
        signals.push('Grandes fondos reduciendo posiciones');
      }
    }
    
    // Limitar score a -100 a +100
    score = Math.max(-100, Math.min(100, score));
    
    // Generar resumen
    let summary: string;
    if (signals.length === 0) {
      summary = 'Sin señales significativas de inversores institucionales';
    } else if (score > 30) {
      summary = `Señales ALCISTAS de grandes inversores: ${signals.join('. ')}`;
    } else if (score < -30) {
      summary = `Señales BAJISTAS de grandes inversores: ${signals.join('. ')}`;
    } else {
      summary = `Señales mixtas: ${signals.join('. ')}`;
    }
    
    return { score, summary };
  }
}

export const institutionalInvestorsService = new InstitutionalInvestorsService();
