/**
 * Precious Metals - USD Correlation Service
 * 
 * Detecta la correlación inversa entre el USD y los metales preciosos.
 * Cuando el USD se fortalece → Oro/Plata tienden a caer
 * Cuando el USD se debilita → Oro/Plata tienden a subir
 * 
 * También detecta factores específicos que afectan a metales:
 * - Decisiones de la Fed (tipos de interés)
 * - Inflación/deflación
 * - Safe haven demand
 * - Real yields
 */

import { logger } from '../../middleware/logger.js';

// ===== TIPOS =====

export interface PreciousMetalsAnalysis {
  isPreciousMetal: boolean;
  metalType: 'gold' | 'silver' | 'platinum' | 'palladium' | 'other' | null;
  
  // Análisis USD
  usdStrength: {
    dxyChange1d: number;
    dxyChange5d: number;
    dxyChange20d: number;
    trend: 'strengthening' | 'weakening' | 'stable';
    severity: 'extreme' | 'strong' | 'moderate' | 'mild';
  };
  
  // Impacto calculado
  usdImpact: {
    score: number;           // -100 a +100 (negativo = bearish para metal)
    confidenceAdjustment: number;  // Multiplicador de confianza
    predictionBias: number;  // % a añadir/restar de la predicción
  };
  
  // Factores adicionales
  additionalFactors: {
    realYieldsRising: boolean;      // Yields reales suben → metales caen
    fedHawkish: boolean;            // Fed hawkish → metales caen
    safehavenDemand: boolean;       // Demanda refugio → metales suben
    inflationHedge: boolean;        // Cobertura inflación → metales suben
  };
  
  signals: string[];
  reasoning: string;
  hasData: boolean;
}

// ===== DETECCIÓN DE METALES PRECIOSOS =====

const PRECIOUS_METAL_PATTERNS: Record<string, RegExp[]> = {
  gold: [
    /\bgold\b/i, /\bgld\b/i, /\bxau/i, /\biau\b/i, /\bsgol\b/i,
    /\boro\b/i, /\bphau\b/i, /physical gold/i, /wisdomtree.*gold/i,
    /invesco.*gold/i, /ishares.*gold/i, /spdr.*gold/i,
  ],
  silver: [
    /\bsilver\b/i, /\bslv\b/i, /\bxag/i, /\bphag\b/i, /\bsivr\b/i,
    /\bplata\b/i, /physical silver/i, /wisdomtree.*silver/i,
    /ishares.*silver/i, /sprott.*silver/i,
  ],
  platinum: [
    /\bplatinum\b/i, /\bpplt\b/i, /\bxpt/i, /\bplatino\b/i,
    /physical platinum/i, /wisdomtree.*platinum/i,
  ],
  palladium: [
    /\bpalladium\b/i, /\bpall\b/i, /\bxpd/i, /\bpaladio\b/i,
    /physical palladium/i, /wisdomtree.*palladium/i,
  ],
};

function detectPreciousMetal(symbol: string, assetName?: string): { isPreciousMetal: boolean; metalType: 'gold' | 'silver' | 'platinum' | 'palladium' | 'other' | null } {
  const searchText = `${symbol} ${assetName || ''}`.toLowerCase();
  
  for (const [metalType, patterns] of Object.entries(PRECIOUS_METAL_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(searchText)) {
        return { isPreciousMetal: true, metalType: metalType as 'gold' | 'silver' | 'platinum' | 'palladium' };
      }
    }
  }
  
  // Detección genérica de "metal precioso"
  if (/precious.*metal/i.test(searchText) || /metal.*precioso/i.test(searchText)) {
    return { isPreciousMetal: true, metalType: 'other' };
  }
  
  return { isPreciousMetal: false, metalType: null };
}

// ===== CACHE =====

const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutos

// ===== FETCHING USD INDEX (DXY) =====

interface DXYData {
  change1d: number;
  change5d: number;
  change20d: number;
  current: number;
}

async function fetchDXYData(): Promise<DXYData | null> {
  const cacheKey = 'DXY';
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    // DX-Y.NYB es el índice dólar en Yahoo Finance
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?range=1mo&interval=1d';
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      logger.warn(`[PreciousMetals-USD] Failed to fetch DXY: ${response.status}`);
      return null;
    }

    const json: any = await response.json();
    const result = json.chart?.result?.[0];
    const closes = result?.indicators?.quote?.[0]?.close?.filter((c: number) => c > 0) || [];
    
    if (closes.length < 5) {
      logger.warn('[PreciousMetals-USD] Insufficient DXY data');
      return null;
    }

    const current = closes[closes.length - 1];
    const yesterday = closes[closes.length - 2] || current;
    const fiveDaysAgo = closes[Math.max(0, closes.length - 5)] || current;
    const twentyDaysAgo = closes[0] || current;

    const data: DXYData = {
      change1d: ((current - yesterday) / yesterday) * 100,
      change5d: ((current - fiveDaysAgo) / fiveDaysAgo) * 100,
      change20d: ((current - twentyDaysAgo) / twentyDaysAgo) * 100,
      current,
    };

    cache.set(cacheKey, { data, timestamp: Date.now() });
    logger.info(`[PreciousMetals-USD] DXY: ${current.toFixed(2)}, 1d: ${data.change1d.toFixed(2)}%, 5d: ${data.change5d.toFixed(2)}%, 20d: ${data.change20d.toFixed(2)}%`);
    
    return data;
  } catch (error) {
    logger.error('[PreciousMetals-USD] Error fetching DXY:', error);
    return null;
  }
}

// ===== FETCHING REAL YIELDS (10Y TIPS) =====

async function fetchRealYields(): Promise<{ rising: boolean; level: number } | null> {
  const cacheKey = 'REAL_YIELDS';
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    // ^TNX es el yield del 10Y Treasury
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/%5ETNX?range=1mo&interval=1d';
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      return null;
    }

    const json: any = await response.json();
    const closes = json.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter((c: number) => c > 0) || [];
    
    if (closes.length < 5) {
      return null;
    }

    const current = closes[closes.length - 1];
    const fiveDaysAgo = closes[Math.max(0, closes.length - 5)];
    const rising = current > fiveDaysAgo + 0.05; // +5 bps en 5 días

    const data = { rising, level: current };
    cache.set(cacheKey, { data, timestamp: Date.now() });
    
    logger.info(`[PreciousMetals-USD] 10Y Yield: ${current.toFixed(2)}%, rising: ${rising}`);
    return data;
  } catch (error) {
    return null;
  }
}

// ===== ANÁLISIS PRINCIPAL =====

function analyzeUSDStrength(dxy: DXYData): PreciousMetalsAnalysis['usdStrength'] {
  // Determinar tendencia basada en el cambio de 5 días (más estable)
  let trend: 'strengthening' | 'weakening' | 'stable' = 'stable';
  
  // Umbral: ±0.5% en 5 días es significativo para el DXY
  if (dxy.change5d > 0.5) trend = 'strengthening';
  else if (dxy.change5d < -0.5) trend = 'weakening';
  
  // Determinar severidad
  let severity: 'extreme' | 'strong' | 'moderate' | 'mild' = 'mild';
  const absChange5d = Math.abs(dxy.change5d);
  
  if (absChange5d > 3) severity = 'extreme';
  else if (absChange5d > 2) severity = 'strong';
  else if (absChange5d > 1) severity = 'moderate';
  
  return {
    dxyChange1d: dxy.change1d,
    dxyChange5d: dxy.change5d,
    dxyChange20d: dxy.change20d,
    trend,
    severity,
  };
}

function calculateUSDImpact(
  usdStrength: PreciousMetalsAnalysis['usdStrength'],
  metalType: string | null
): PreciousMetalsAnalysis['usdImpact'] {
  // CORRELACIÓN INVERSA: USD sube → Metales bajan
  // Multiplicadores por tipo de metal (plata más volátil que oro)
  const volatilityMultiplier: Record<string, number> = {
    gold: 1.0,
    silver: 1.5,      // Plata es ~1.5x más volátil que oro
    platinum: 1.2,
    palladium: 1.3,
    other: 1.1,
  };
  
  const mult = volatilityMultiplier[metalType || 'other'] || 1.0;
  
  // Score basado en cambio de 5 días (más relevante que 1 día)
  // USD +1% → Score aprox -15 a -20 para metales
  let score = -usdStrength.dxyChange5d * 15 * mult;
  
  // Amplificar si el cambio de 1 día es en la misma dirección (momentum)
  if ((usdStrength.dxyChange1d > 0 && usdStrength.dxyChange5d > 0) ||
      (usdStrength.dxyChange1d < 0 && usdStrength.dxyChange5d < 0)) {
    score *= 1.2; // +20% si hay momentum consistente
  }
  
  // Limitar score
  score = Math.max(-100, Math.min(100, Math.round(score)));
  
  // Calcular bias de predicción
  // USD +2% en 5d → bias de aproximadamente -3% a -5% para metales
  let predictionBias = -usdStrength.dxyChange5d * 2 * mult;
  predictionBias = Math.max(-10, Math.min(10, predictionBias));
  
  // Ajuste de confianza (más incertidumbre si USD muy volátil)
  let confidenceAdjustment = 1.0;
  if (usdStrength.severity === 'extreme') {
    confidenceAdjustment = 0.7; // -30% confianza en movimientos extremos
  } else if (usdStrength.severity === 'strong') {
    confidenceAdjustment = 0.85;
  }
  
  return {
    score,
    confidenceAdjustment,
    predictionBias,
  };
}

// ===== SERVICIO EXPORTADO =====

export const preciousMetalsUSDService = {
  /**
   * Analiza el impacto del USD en un activo de metales preciosos
   */
  async analyze(symbol: string, assetName?: string): Promise<PreciousMetalsAnalysis> {
    const { isPreciousMetal, metalType } = detectPreciousMetal(symbol, assetName);
    
    // Si no es metal precioso, retornar análisis vacío
    if (!isPreciousMetal) {
      return {
        isPreciousMetal: false,
        metalType: null,
        usdStrength: {
          dxyChange1d: 0,
          dxyChange5d: 0,
          dxyChange20d: 0,
          trend: 'stable',
          severity: 'mild',
        },
        usdImpact: {
          score: 0,
          confidenceAdjustment: 1.0,
          predictionBias: 0,
        },
        additionalFactors: {
          realYieldsRising: false,
          fedHawkish: false,
          safehavenDemand: false,
          inflationHedge: false,
        },
        signals: [],
        reasoning: 'No es un metal precioso, análisis USD no aplica.',
        hasData: false,
      };
    }
    
    logger.info(`[PreciousMetals-USD] Analyzing ${symbol} (${metalType})`);
    
    // Obtener datos del DXY
    const dxyData = await fetchDXYData();
    if (!dxyData) {
      return {
        isPreciousMetal: true,
        metalType,
        usdStrength: {
          dxyChange1d: 0,
          dxyChange5d: 0,
          dxyChange20d: 0,
          trend: 'stable',
          severity: 'mild',
        },
        usdImpact: {
          score: 0,
          confidenceAdjustment: 1.0,
          predictionBias: 0,
        },
        additionalFactors: {
          realYieldsRising: false,
          fedHawkish: false,
          safehavenDemand: false,
          inflationHedge: false,
        },
        signals: ['No se pudieron obtener datos del índice dólar (DXY)'],
        reasoning: 'Sin datos de DXY, no se puede calcular correlación inversa.',
        hasData: false,
      };
    }
    
    // Analizar fortaleza del USD
    const usdStrength = analyzeUSDStrength(dxyData);
    
    // Calcular impacto en el metal
    const usdImpact = calculateUSDImpact(usdStrength, metalType);
    
    // Obtener yields reales (factor adicional)
    const realYields = await fetchRealYields();
    
    // Construir factores adicionales
    const additionalFactors = {
      realYieldsRising: realYields?.rising || false,
      fedHawkish: realYields?.rising || false, // Simplificado: yields subiendo = Fed hawkish
      safehavenDemand: false, // TODO: detectar desde VIX alto
      inflationHedge: false,  // TODO: detectar desde datos de inflación
    };
    
    // Construir señales
    const signals: string[] = [];
    
    if (usdStrength.trend === 'strengthening') {
      signals.push(`💪 USD fortaleciéndose: DXY ${dxyData.change5d > 0 ? '+' : ''}${dxyData.change5d.toFixed(2)}% en 5d`);
      signals.push(`⚠️ Correlación inversa: USD fuerte → ${metalType === 'gold' ? 'Oro' : metalType === 'silver' ? 'Plata' : 'Metal'} presionado a la baja`);
    } else if (usdStrength.trend === 'weakening') {
      signals.push(`📉 USD debilitándose: DXY ${dxyData.change5d.toFixed(2)}% en 5d`);
      signals.push(`✅ Correlación inversa: USD débil → ${metalType === 'gold' ? 'Oro' : metalType === 'silver' ? 'Plata' : 'Metal'} favorecido`);
    }
    
    if (additionalFactors.realYieldsRising) {
      signals.push('📈 Yields reales subiendo: presión adicional sobre metales');
    }
    
    if (usdStrength.severity === 'extreme') {
      signals.push('🚨 Movimiento EXTREMO del USD: alta incertidumbre');
    } else if (usdStrength.severity === 'strong') {
      signals.push('⚡ Movimiento fuerte del USD');
    }
    
    // Construir razonamiento
    let reasoning = '';
    if (usdStrength.trend === 'strengthening') {
      reasoning = `El índice dólar (DXY) ha subido ${dxyData.change5d.toFixed(2)}% en 5 días. `;
      reasoning += `Los metales preciosos como ${metalType === 'gold' ? 'el oro' : metalType === 'silver' ? 'la plata' : 'este metal'} tienen correlación inversa con el USD: `;
      reasoning += `cuando el dólar se fortalece, los metales tienden a caer porque se vuelven más caros para compradores en otras divisas. `;
      reasoning += `Impacto estimado: ${usdImpact.predictionBias.toFixed(1)}% en la predicción.`;
    } else if (usdStrength.trend === 'weakening') {
      reasoning = `El índice dólar (DXY) ha caído ${Math.abs(dxyData.change5d).toFixed(2)}% en 5 días. `;
      reasoning += `Esto favorece a ${metalType === 'gold' ? 'el oro' : metalType === 'silver' ? 'la plata' : 'este metal'} por la correlación inversa: `;
      reasoning += `un dólar débil hace los metales más baratos para compradores internacionales. `;
      reasoning += `Impacto estimado: +${Math.abs(usdImpact.predictionBias).toFixed(1)}% en la predicción.`;
    } else {
      reasoning = `El índice dólar (DXY) está relativamente estable (${dxyData.change5d.toFixed(2)}% en 5d). `;
      reasoning += `Sin presión significativa desde el USD para ${metalType === 'gold' ? 'el oro' : metalType === 'silver' ? 'la plata' : 'este metal'}.`;
    }
    
    logger.info(`[PreciousMetals-USD] ${symbol}: USD ${usdStrength.trend} (${usdStrength.severity}), score=${usdImpact.score}, bias=${usdImpact.predictionBias.toFixed(2)}%`);
    
    return {
      isPreciousMetal: true,
      metalType,
      usdStrength,
      usdImpact,
      additionalFactors,
      signals,
      reasoning,
      hasData: true,
    };
  },
  
  /**
   * Aplica el ajuste de USD a una predicción existente
   */
  applyToPrediction(
    prediction: { change: number; confidence: number },
    analysis: PreciousMetalsAnalysis
  ): { adjustedChange: number; adjustedConfidence: number; applied: boolean } {
    if (!analysis.isPreciousMetal || !analysis.hasData) {
      return {
        adjustedChange: prediction.change,
        adjustedConfidence: prediction.confidence,
        applied: false,
      };
    }
    
    // Aplicar bias al cambio
    let adjustedChange = prediction.change + analysis.usdImpact.predictionBias;
    
    // Aplicar multiplicador de confianza
    let adjustedConfidence = Math.round(prediction.confidence * analysis.usdImpact.confidenceAdjustment);
    
    // Si el USD está muy fuerte y la predicción es muy alcista, ser más conservador
    if (analysis.usdStrength.trend === 'strengthening' && prediction.change > 2) {
      adjustedChange = Math.min(adjustedChange, prediction.change * 0.5);
      logger.info(`[PreciousMetals-USD] Capping bullish prediction due to strong USD`);
    }
    
    // Si el USD está muy débil y la predicción es muy bajista, ser más conservador
    if (analysis.usdStrength.trend === 'weakening' && prediction.change < -2) {
      adjustedChange = Math.max(adjustedChange, prediction.change * 0.5);
      logger.info(`[PreciousMetals-USD] Capping bearish prediction due to weak USD`);
    }
    
    return {
      adjustedChange,
      adjustedConfidence,
      applied: true,
    };
  },
  
  /**
   * Verifica si un activo es metal precioso
   */
  isPreciousMetal(symbol: string, assetName?: string): boolean {
    return detectPreciousMetal(symbol, assetName).isPreciousMetal;
  },
};
