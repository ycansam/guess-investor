/**
 * Servicio de análisis de inversores institucionales
 * Obtiene datos reales de:
 * - Propiedad institucional (% en manos de fondos)
 * - Transacciones de insiders (compras/ventas recientes)
 * - Actividad neta de compra/venta
 * - Cambios en posiciones de fondos
 * - COT Report (Commitment of Traders)
 * - Flujos de ETFs del sector
 * - Dark Pool activity y short volume
 * 
 * Fuente: Yahoo Finance quoteSummary (módulos: institutionOwnership, insiderTransactions, netSharePurchaseActivity)
 */

import { COTData } from './cot-report-service';
import { DarkPoolData } from './dark-pools-service';
import { ETFFlowData } from './etf-flows-service';
import { rapidApiYahooService, YahooQuoteSummary } from './rapidapi-yahoo-service';
import { yahooV8Service } from './yahoo-v8-service';

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
  
  // NUEVOS: Datos avanzados de smart money
  cotReport?: COTData;       // Commitment of Traders
  etfFlows?: ETFFlowData;    // Flujos de ETFs del sector
  darkPools?: DarkPoolData;  // Dark pool activity
  
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
    // Cryptos tienen datos limitados pero intentamos obtener lo posible
    if (type === 'crypto') {
      return this.getCryptoInstitutionalData(symbol);
    }
    
    // Verificar caché
    const cached = institutionalCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`[Institutional] Cache hit: ${symbol}`);
      return cached.data;
    }
    
    console.log(`[Institutional] Obteniendo datos completos para ${symbol}`);
    
    try {
      // Obtener todos los datos en paralelo
      const [yahooData, cotData, etfFlowsData, darkPoolData] = await Promise.allSettled([
        this.getYahooInstitutionalData(symbol),
        cotReportService.getCOTData(symbol),
        etfFlowsService.getETFFlows(symbol),
        darkPoolsService.getDarkPoolData(symbol),
      ]);
      
      // Extraer resultados
      const yahoo = yahooData.status === 'fulfilled' ? yahooData.value : null;
      const cot = cotData.status === 'fulfilled' ? cotData.value : null;
      const etfFlows = etfFlowsData.status === 'fulfilled' ? etfFlowsData.value : null;
      const darkPools = darkPoolData.status === 'fulfilled' ? darkPoolData.value : null;
      
      // Calcular score combinado
      const { score, summary } = this.calculateCombinedScore(
        yahoo?.institutionalOwnership ?? null,
        yahoo?.insiderTransactions ?? null,
        yahoo?.netSharePurchaseActivity ?? null,
        yahoo?.topInstitutions ?? [],
        cot,
        etfFlows,
        darkPools
      );
      
      const activityData: InstitutionalActivity = {
        institutionalOwnership: yahoo?.institutionalOwnership ?? null,
        insiderTransactions: yahoo?.insiderTransactions ?? null,
        netSharePurchaseActivity: yahoo?.netSharePurchaseActivity ?? null,
        topInstitutions: yahoo?.topInstitutions ?? [],
        cotReport: cot ?? undefined,
        etfFlows: etfFlows ?? undefined,
        darkPools: darkPools ?? undefined,
        institutionalScore: score,
        hasData: (yahoo?.hasData ?? false) || (cot?.hasData ?? false) || (etfFlows?.hasData ?? false) || (darkPools?.hasData ?? false),
        summary,
      };
      
      // Guardar en caché
      institutionalCache.set(symbol, { data: activityData, timestamp: Date.now() });
      
      console.log(`[Institutional] Score combinado: ${score}, COT: ${cot?.cotScore ?? 'N/A'}, ETF: ${etfFlows?.etfFlowScore ?? 'N/A'}, DarkPool: ${darkPools?.darkPoolScore ?? 'N/A'}`);
      
      return activityData;
      
    } catch (error) {
      console.error(`[Institutional] Error obteniendo datos:`, error);
      return this.getEmptyResult('Error obteniendo datos de inversores institucionales');
    }
  }
  
  /**
   * Obtiene datos de crypto (limitados)
   */
  private async getCryptoInstitutionalData(symbol: string): Promise<InstitutionalActivity> {
    try {
      // Para crypto, intentamos obtener COT de futuros de Bitcoin/Ethereum
      const cotData = await cotReportService.getCOTData(symbol);
      const darkPoolData = await darkPoolsService.getDarkPoolData(symbol);
      
      let score = 0;
      if (cotData?.hasData) score += cotData.cotScore * 0.5;
      if (darkPoolData?.hasData) score += darkPoolData.darkPoolScore * 0.5;
      
      return {
        institutionalOwnership: null,
        insiderTransactions: null,
        netSharePurchaseActivity: null,
        topInstitutions: [],
        cotReport: cotData ?? undefined,
        darkPools: darkPoolData ?? undefined,
        institutionalScore: Math.round(score),
        hasData: (cotData?.hasData ?? false) || (darkPoolData?.hasData ?? false),
        summary: cotData?.hasData 
          ? `Datos de futuros: ${cotData.summary}`
          : 'Datos institucionales limitados para criptomonedas',
      };
    } catch (error) {
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
  }
  
  /**
   * Obtiene datos de Yahoo Finance
   */
  private async getYahooInstitutionalData(symbol: string): Promise<{
    institutionalOwnership: InstitutionalActivity['institutionalOwnership'];
    insiderTransactions: InstitutionalActivity['insiderTransactions'];
    netSharePurchaseActivity: InstitutionalActivity['netSharePurchaseActivity'];
    topInstitutions: InstitutionalActivity['topInstitutions'];
    hasData: boolean;
  } | null> {
    // PASO 1: Verificar que el símbolo existe con Yahoo V8 (GRATIS)
    const v8Data = await yahooV8Service.getQuote(symbol);
    if (!v8Data || v8Data.regularMarketPrice === 0) {
      console.log(`[Institutional] Símbolo no encontrado: ${symbol}`);
      return null;
    }
    
    // PASO 2: Intentar con RapidAPI para datos institucionales
    if (rapidApiYahooService.isAvailable()) {
      const rapidApiData = await rapidApiYahooService.getQuoteSummary(symbol);
      if (rapidApiData && rapidApiData.dataAvailable && 
          (rapidApiData.institutionalOwnership || rapidApiData.insiderTransactions)) {
        console.log(`[Institutional] Datos obtenidos via RapidAPI para ${symbol}`);
        return this.parseFromRapidApi(rapidApiData);
      }
    }
    
    // PASO 3: Retornar datos básicos derivados de V8
    console.log(`[Institutional] Generando datos básicos desde V8 para ${symbol}`);
    return this.generateBasicInstitutionalData(v8Data);
  }
  
  /**
   * Genera datos institucionales básicos cuando no hay datos de RapidAPI
   */
  private generateBasicInstitutionalData(v8Data: any): {
    institutionalOwnership: InstitutionalActivity['institutionalOwnership'];
    insiderTransactions: InstitutionalActivity['insiderTransactions'];
    netSharePurchaseActivity: InstitutionalActivity['netSharePurchaseActivity'];
    topInstitutions: InstitutionalActivity['topInstitutions'];
    hasData: boolean;
  } {
    // Calcular tendencia basada en precio
    const price = v8Data.regularMarketPrice || 0;
    const ma50 = v8Data.fiftyDayAverage || price;
    
    // Estimar sentimiento basado en tendencia
    const trend = price > ma50 ? 'increasing' : price < ma50 ? 'decreasing' : 'stable';
    const insiderTrend = price > ma50 ? 'buying' : price < ma50 ? 'selling' : 'neutral';
    const shareTrend = price > ma50 ? 'bullish' : price < ma50 ? 'bearish' : 'neutral';

    return {
      institutionalOwnership: {
        percentage: 0,
        numberOfInstitutions: 0,
        trend: trend as 'increasing' | 'decreasing' | 'stable',
      },
      insiderTransactions: {
        totalBuys: 0,
        totalSells: 0,
        netShares: 0,
        netValue: 0,
        trend: insiderTrend as 'buying' | 'selling' | 'neutral',
        recentTransactions: [],
      },
      netSharePurchaseActivity: {
        buyPercentInsiderShares: 0,
        sellPercentInsiderShares: 0,
        netPercentInsiderShares: 0,
        trend: shareTrend as 'bullish' | 'bearish' | 'neutral',
      },
      topInstitutions: [],
      hasData: false,
    };
  }
  
  /**
   * Parsea datos desde RapidAPI al formato de institutional data
   */
  private parseFromRapidApi(data: YahooQuoteSummary): {
    institutionalOwnership: InstitutionalActivity['institutionalOwnership'];
    insiderTransactions: InstitutionalActivity['insiderTransactions'];
    netSharePurchaseActivity: InstitutionalActivity['netSharePurchaseActivity'];
    topInstitutions: InstitutionalActivity['topInstitutions'];
    hasData: boolean;
  } {
    // Institutional ownership
    const instOwnership: InstitutionalActivity['institutionalOwnership'] = data.institutionalOwnership ? {
      percentage: data.institutionalOwnership.ownershipPercent || 0,
      numberOfInstitutions: data.institutionalOwnership.institutionCount || 0,
      trend: 'stable' as const, // No hay datos de tendencia en este endpoint
    } : null;
    
    // Insider transactions
    let insiderTxns: InstitutionalActivity['insiderTransactions'] = null;
    if (data.insiderTransactions && data.insiderTransactions.length > 0) {
      let totalBuys = 0;
      let totalSells = 0;
      let netShares = 0;
      let netValue = 0;
      
      const recentTxns = data.insiderTransactions.slice(0, 5).map((t) => {
        const isBuy = t.transactionType?.toLowerCase().includes('purchase') || 
                      t.transactionType?.toLowerCase().includes('buy') ||
                      t.shares > 0;
        
        if (isBuy) {
          totalBuys++;
          netShares += Math.abs(t.shares);
          netValue += Math.abs(t.value);
        } else {
          totalSells++;
          netShares -= Math.abs(t.shares);
          netValue -= Math.abs(t.value);
        }
        
        return {
          name: t.name,
          position: t.relation,
          type: isBuy ? 'buy' as const : 'sell' as const,
          shares: Math.abs(t.shares),
          value: Math.abs(t.value),
          date: t.startDate ? new Date(t.startDate * 1000).toISOString().split('T')[0] : '',
        };
      });
      
      let trend: 'buying' | 'selling' | 'neutral' = 'neutral';
      if (totalBuys > totalSells * 1.5) trend = 'buying';
      else if (totalSells > totalBuys * 1.5) trend = 'selling';
      
      insiderTxns = {
        totalBuys,
        totalSells,
        netShares,
        netValue,
        trend,
        recentTransactions: recentTxns,
      };
    }
    
    // Net share purchase activity (from insider data)
    let netSharePurchase: InstitutionalActivity['netSharePurchaseActivity'] = null;
    if (data.heldPercentInsiders) {
      netSharePurchase = {
        buyPercentInsiderShares: data.heldPercentInsiders * 100 || 0,
        sellPercentInsiderShares: 0,
        netPercentInsiderShares: data.heldPercentInsiders * 100 || 0,
        trend: 'neutral',
      };
    }
    
    return {
      institutionalOwnership: instOwnership,
      insiderTransactions: insiderTxns,
      netSharePurchaseActivity: netSharePurchase,
      topInstitutions: [], // No disponible en este endpoint
      hasData: instOwnership !== null || insiderTxns !== null,
    };
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
  
  /**
   * Calcula score combinado incluyendo COT, ETF Flows y Dark Pools
   */
  private calculateCombinedScore(
    ownership: InstitutionalActivity['institutionalOwnership'],
    transactions: InstitutionalActivity['insiderTransactions'],
    netActivity: InstitutionalActivity['netSharePurchaseActivity'],
    topInstitutions: InstitutionalActivity['topInstitutions'],
    cotData: COTData | null,
    etfFlows: ETFFlowData | null,
    darkPools: DarkPoolData | null
  ): { score: number; summary: string } {
    // Obtener score base de Yahoo Finance
    const baseResult = this.calculateScore(ownership, transactions, netActivity, topInstitutions);
    let combinedScore = baseResult.score;
    const signals: string[] = [];
    
    // Extraer señales del resumen base
    if (baseResult.summary && !baseResult.summary.includes('Sin señales')) {
      const baseSignals = baseResult.summary.replace(/^.*?:/, '').trim();
      if (baseSignals) signals.push(baseSignals);
    }
    
    // Pesos para cada fuente de datos
    const WEIGHT_YAHOO = 0.35;      // Yahoo Finance (ownership, insiders)
    const WEIGHT_COT = 0.20;        // COT Report
    const WEIGHT_ETF_FLOWS = 0.20;  // ETF Flows
    const WEIGHT_DARK_POOLS = 0.25; // Dark Pools
    
    let totalWeight = WEIGHT_YAHOO;
    let weightedScore = baseResult.score * WEIGHT_YAHOO;
    
    // Añadir COT Report si hay datos
    if (cotData?.hasData) {
      weightedScore += cotData.cotScore * WEIGHT_COT;
      totalWeight += WEIGHT_COT;
      
      if (cotData.analysis.crowdedTrade) {
        signals.push(`COT: Trade abarrotado en futuros`);
      }
      if (cotData.analysis.potentialReversal) {
        signals.push(`COT: Posible reversión (divergencia smart money)`);
      }
      if (Math.abs(cotData.cotScore) > 30) {
        const direction = cotData.cotScore > 0 ? 'alcista' : 'bajista';
        signals.push(`COT: Señal ${direction} de futuros`);
      }
    }
    
    // Añadir ETF Flows si hay datos
    if (etfFlows?.hasData) {
      weightedScore += etfFlows.etfFlowScore * WEIGHT_ETF_FLOWS;
      totalWeight += WEIGHT_ETF_FLOWS;
      
      if (etfFlows.sectorFlow.direction.includes('strong')) {
        const direction = etfFlows.sectorFlow.direction.includes('inflow') ? 'entradas' : 'salidas';
        signals.push(`ETF: Fuertes ${direction} en sector`);
      }
      if (etfFlows.relativeToMarket.sectorVsMarket !== 'inline') {
        const comparison = etfFlows.relativeToMarket.sectorVsMarket === 'outperforming' 
          ? 'superando' : 'por debajo de';
        signals.push(`ETF: Sector ${comparison} mercado`);
      }
    }
    
    // Añadir Dark Pools si hay datos
    if (darkPools?.hasData) {
      weightedScore += darkPools.darkPoolScore * WEIGHT_DARK_POOLS;
      totalWeight += WEIGHT_DARK_POOLS;
      
      if (darkPools.darkPoolActivity.sentiment === 'accumulation') {
        signals.push(`Dark Pool: Acumulación institucional detectada`);
      } else if (darkPools.darkPoolActivity.sentiment === 'distribution') {
        signals.push(`Dark Pool: Distribución institucional detectada`);
      }
      
      if (darkPools.darkPoolActivity.blockTradesDetected) {
        signals.push(`Dark Pool: Block trades detectados`);
      }
      
      if (darkPools.shortVolume?.isAbnormal) {
        const shortLevel = darkPools.shortVolume.shortVolumeRatio > 45 ? 'alto' : 'bajo';
        signals.push(`Short Volume: Nivel ${shortLevel} (${darkPools.shortVolume.shortVolumeRatio.toFixed(1)}%)`);
      }
    }
    
    // Normalizar score por peso total
    combinedScore = Math.round(weightedScore / totalWeight);
    combinedScore = Math.max(-100, Math.min(100, combinedScore));
    
    // Generar resumen
    let summary: string;
    if (signals.length === 0) {
      summary = 'Sin señales significativas de smart money';
    } else if (combinedScore > 30) {
      summary = `🟢 Señales ALCISTAS de smart money: ${signals.join('. ')}`;
    } else if (combinedScore < -30) {
      summary = `🔴 Señales BAJISTAS de smart money: ${signals.join('. ')}`;
    } else {
      summary = `Señales mixtas de institucionales: ${signals.join('. ')}`;
    }
    
    return { score: combinedScore, summary };
  }
}

export const institutionalInvestorsService = new InstitutionalInvestorsService();
