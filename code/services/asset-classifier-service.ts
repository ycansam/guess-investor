/**
 * Servicio de Clasificación de Activos
 * Analiza características de cada activo para determinar el timeframe óptimo
 * Considera volatilidad, tipo de activo, liquidez y patrones históricos
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TrainingTimeframe } from './training-cache-service';
import { yahooV8Service } from './yahoo-v8-service';

const STORAGE_KEY = 'asset-classifications';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 horas

export interface AssetCharacteristics {
  symbol: string;
  assetType: 'stock' | 'crypto' | 'etf';
  
  // Métricas de volatilidad
  volatility30d: number; // Desviación estándar de cambios diarios
  volatility90d: number;
  avgDailyChange: number; // % cambio promedio absoluto
  maxDailySwing: number; // Máximo cambio en un día (últimos 30d)
  
  // Métricas de liquidez
  avgVolume30d: number;
  volumeConsistency: number; // 0-100, qué tan consistente es el volumen
  
  // Patrones
  trendStrength: number; // 0-100, qué tan bien sigue tendencias
  meanReversion: number; // 0-100, tendencia a volver a la media
  
  // Timeframes recomendados (basados en características)
  recommendedTimeframes: {
    intraday: number; // Score 0-100
    swing: number;
    longterm: number;
  };
  
  // Timeframes aprendidos (basados en performance histórica)
  learnedTimeframes?: {
    intraday: number; // Accuracy promedio
    swing: number;
    longterm: number;
  };
  
  lastUpdated: string;
}

export interface TimeframeRecommendation {
  timeframe: TrainingTimeframe;
  score: number;
  reason: string;
}

class AssetClassifierService {
  private classifications = new Map<string, AssetCharacteristics>();
  private loaded = false;

  /**
   * Carga clasificaciones desde AsyncStorage
   */
  async load(): Promise<void> {
    if (this.loaded) return;
    
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        this.classifications = new Map(Object.entries(parsed));
      }
      this.loaded = true;
      console.log(`[AssetClassifier] Cargadas ${this.classifications.size} clasificaciones`);
    } catch (error) {
      console.error('[AssetClassifier] Error cargando:', error);
      this.loaded = true;
    }
  }

  /**
   * Guarda clasificaciones en AsyncStorage
   */
  private async save(): Promise<void> {
    try {
      const obj = Object.fromEntries(this.classifications);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch (error) {
      console.error('[AssetClassifier] Error guardando:', error);
    }
  }

  /**
   * Analiza un activo y determina sus características
   */
  async analyzeAsset(symbol: string): Promise<AssetCharacteristics> {
    await this.load();
    
    // Verificar si tenemos cache válida
    const cached = this.classifications.get(symbol);
    if (cached) {
      const age = Date.now() - new Date(cached.lastUpdated).getTime();
      if (age < CACHE_DURATION) {
        console.log(`[AssetClassifier] Cache hit para ${symbol}`);
        return cached;
      }
    }

    console.log(`[AssetClassifier] Analizando ${symbol}...`);

    try {
      // Obtener datos históricos (90 días)
      const historicalData = await yahooV8Service.getHistoricalData(symbol, '90d');
      
      if (!historicalData || historicalData.length < 30) {
        throw new Error('Datos históricos insuficientes');
      }

      // Determinar tipo de activo
      const isCrypto = symbol.includes('-USD') || 
                       ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'ADA', 'DOT', 'MATIC'].includes(symbol);
      const isETF = symbol.match(/^(SPY|QQQ|IWM|DIA|VOO|VTI|EEM|GLD|SLV)/i) !== null;
      const assetType = isCrypto ? 'crypto' : isETF ? 'etf' : 'stock';

      // Calcular cambios diarios
      const dailyChanges: number[] = [];
      const dailyVolumes: number[] = [];
      
      for (let i = 1; i < historicalData.length; i++) {
        const prev = historicalData[i - 1];
        const curr = historicalData[i];
        
        if (prev.close && curr.close) {
          const change = ((curr.close - prev.close) / prev.close) * 100;
          dailyChanges.push(change);
        }
        
        if (curr.volume) {
          dailyVolumes.push(curr.volume);
        }
      }

      // Volatilidad 30d y 90d
      const last30Changes = dailyChanges.slice(-30);
      const volatility30d = this.calculateStdDev(last30Changes);
      const volatility90d = this.calculateStdDev(dailyChanges);

      // Cambio promedio y máximo swing
      const avgDailyChange = last30Changes.reduce((sum, c) => sum + Math.abs(c), 0) / last30Changes.length;
      const maxDailySwing = Math.max(...last30Changes.map(Math.abs));

      // Volumen
      const avgVolume30d = dailyVolumes.slice(-30).reduce((a, b) => a + b, 0) / Math.min(30, dailyVolumes.length);
      const volumeConsistency = this.calculateVolumeConsistency(dailyVolumes.slice(-30));

      // Patrones
      const trendStrength = this.calculateTrendStrength(dailyChanges);
      const meanReversion = this.calculateMeanReversion(dailyChanges);

      // Calcular scores para cada timeframe basados en características
      const recommendedTimeframes = this.calculateTimeframeScores({
        volatility30d,
        avgDailyChange,
        maxDailySwing,
        trendStrength,
        meanReversion,
        assetType,
      });

      const characteristics: AssetCharacteristics = {
        symbol,
        assetType,
        volatility30d,
        volatility90d,
        avgDailyChange,
        maxDailySwing,
        avgVolume30d,
        volumeConsistency,
        trendStrength,
        meanReversion,
        recommendedTimeframes,
        lastUpdated: new Date().toISOString(),
      };

      this.classifications.set(symbol, characteristics);
      await this.save();

      return characteristics;
    } catch (error) {
      console.error(`[AssetClassifier] Error analizando ${symbol}:`, error);
      
      // Fallback: clasificación básica por tipo
      const isCrypto = symbol.includes('-USD') || ['BTC', 'ETH', 'SOL'].includes(symbol);
      return {
        symbol,
        assetType: isCrypto ? 'crypto' : 'stock',
        volatility30d: 0,
        volatility90d: 0,
        avgDailyChange: 0,
        maxDailySwing: 0,
        avgVolume30d: 0,
        volumeConsistency: 50,
        trendStrength: 50,
        meanReversion: 50,
        recommendedTimeframes: isCrypto 
          ? { intraday: 80, swing: 60, longterm: 30 }
          : { intraday: 30, swing: 60, longterm: 80 },
        lastUpdated: new Date().toISOString(),
      };
    }
  }

  /**
   * Obtiene el timeframe recomendado para un activo
   */
  async getRecommendedTimeframe(symbol: string): Promise<TimeframeRecommendation[]> {
    const characteristics = await this.analyzeAsset(symbol);
    
    const recommendations: TimeframeRecommendation[] = [];

    // Si tenemos datos aprendidos, usarlos
    if (characteristics.learnedTimeframes) {
      const learned = characteristics.learnedTimeframes;
      
      recommendations.push(
        {
          timeframe: 'intraday',
          score: Math.round(learned.intraday * 0.6 + characteristics.recommendedTimeframes.intraday * 0.4),
          reason: `Accuracy histórica: ${learned.intraday.toFixed(0)}%`,
        },
        {
          timeframe: 'swing',
          score: Math.round(learned.swing * 0.6 + characteristics.recommendedTimeframes.swing * 0.4),
          reason: `Accuracy histórica: ${learned.swing.toFixed(0)}%`,
        },
        {
          timeframe: 'longterm',
          score: Math.round(learned.longterm * 0.6 + characteristics.recommendedTimeframes.longterm * 0.4),
          reason: `Accuracy histórica: ${learned.longterm.toFixed(0)}%`,
        }
      );
    } else {
      // Usar solo características
      const rec = characteristics.recommendedTimeframes;
      
      if (rec.intraday >= 70) {
        recommendations.push({
          timeframe: 'intraday',
          score: rec.intraday,
          reason: characteristics.assetType === 'crypto' 
            ? 'Alta volatilidad (crypto 24/7)'
            : `Volatilidad ${characteristics.volatility30d.toFixed(1)}%, swings diarios`,
        });
      }
      
      if (rec.swing >= 70) {
        recommendations.push({
          timeframe: 'swing',
          score: rec.swing,
          reason: `Tendencias ${characteristics.trendStrength.toFixed(0)}/100, volatilidad moderada`,
        });
      }
      
      if (rec.longterm >= 70) {
        recommendations.push({
          timeframe: 'longterm',
          score: rec.longterm,
          reason: characteristics.assetType === 'stock'
            ? 'Bajo volatilidad, tendencia estable'
            : 'Movimientos graduales',
        });
      }
    }

    // Ordenar por score descendente
    recommendations.sort((a, b) => b.score - a.score);

    return recommendations.length > 0 
      ? recommendations 
      : [{ timeframe: 'swing', score: 60, reason: 'Timeframe equilibrado por defecto' }];
  }

  /**
   * Actualiza el timeframe aprendido basado en performance
   */
  async updateLearnedTimeframe(
    symbol: string, 
    timeframe: TrainingTimeframe, 
    accuracyScore: number
  ): Promise<void> {
    await this.load();
    
    const characteristics = this.classifications.get(symbol);
    if (!characteristics) return;

    if (!characteristics.learnedTimeframes) {
      characteristics.learnedTimeframes = {
        intraday: 50,
        swing: 50,
        longterm: 50,
      };
    }

    // Promedio móvil exponencial (peso 0.3 al nuevo dato)
    const currentScore = characteristics.learnedTimeframes[timeframe];
    characteristics.learnedTimeframes[timeframe] = currentScore * 0.7 + accuracyScore * 0.3;

    this.classifications.set(symbol, characteristics);
    await this.save();

    console.log(`[AssetClassifier] ${symbol} ${timeframe}: ${characteristics.learnedTimeframes[timeframe].toFixed(1)}%`);
  }

  // ==================== Helpers ====================

  private calculateStdDev(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  private calculateVolumeConsistency(volumes: number[]): number {
    if (volumes.length < 5) return 50;
    const mean = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const deviations = volumes.map(v => Math.abs(v - mean) / mean);
    const avgDeviation = deviations.reduce((a, b) => a + b, 0) / deviations.length;
    return Math.round(Math.max(0, Math.min(100, (1 - avgDeviation) * 100)));
  }

  private calculateTrendStrength(changes: number[]): number {
    if (changes.length < 10) return 50;
    
    // Calcular días consecutivos en la misma dirección
    let maxStreak = 0;
    let currentStreak = 1;
    
    for (let i = 1; i < changes.length; i++) {
      if ((changes[i] > 0 && changes[i - 1] > 0) || (changes[i] < 0 && changes[i - 1] < 0)) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 1;
      }
    }
    
    return Math.round(Math.min(100, (maxStreak / changes.length) * 300));
  }

  private calculateMeanReversion(changes: number[]): number {
    if (changes.length < 10) return 50;
    
    // Contar reversiones (cambio de dirección)
    let reversions = 0;
    for (let i = 1; i < changes.length; i++) {
      if ((changes[i] > 0 && changes[i - 1] < 0) || (changes[i] < 0 && changes[i - 1] > 0)) {
        reversions++;
      }
    }
    
    return Math.round((reversions / (changes.length - 1)) * 100);
  }

  private calculateTimeframeScores(metrics: {
    volatility30d: number;
    avgDailyChange: number;
    maxDailySwing: number;
    trendStrength: number;
    meanReversion: number;
    assetType: 'stock' | 'crypto' | 'etf';
  }): { intraday: number; swing: number; longterm: number } {
    
    let intradayScore = 50;
    let swingScore = 50;
    let longtermScore = 50;

    // Crypto siempre favorece intraday
    if (metrics.assetType === 'crypto') {
      intradayScore += 30;
      swingScore += 10;
    }

    // Alta volatilidad favorece intraday
    if (metrics.volatility30d > 3) {
      intradayScore += 20;
      swingScore += 5;
    } else if (metrics.volatility30d < 1.5) {
      longtermScore += 20;
    }

    // Cambio diario alto favorece intraday
    if (metrics.avgDailyChange > 2) {
      intradayScore += 15;
    } else if (metrics.avgDailyChange < 0.5) {
      longtermScore += 15;
    } else {
      swingScore += 10;
    }

    // Tendencias fuertes favorecen swing y largo plazo
    if (metrics.trendStrength > 70) {
      swingScore += 15;
      longtermScore += 10;
    }

    // Mean reversion alto favorece intraday
    if (metrics.meanReversion > 70) {
      intradayScore += 15;
    }

    // Max swing alto favorece intraday
    if (metrics.maxDailySwing > 5) {
      intradayScore += 10;
    }

    // Normalizar a 0-100
    return {
      intraday: Math.min(100, Math.max(0, intradayScore)),
      swing: Math.min(100, Math.max(0, swingScore)),
      longterm: Math.min(100, Math.max(0, longtermScore)),
    };
  }
}

export const assetClassifierService = new AssetClassifierService();
