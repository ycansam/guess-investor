/**
 * Market Psychology Service
 * 
 * Detecta estados psicológicos del mercado que afectan las predicciones:
 * 
 * ESTADOS PSICOLÓGICOS:
 * 1. EUFORIA - Todos comprando, precios disparados, "esta vez es diferente"
 * 2. COMPLACENCIA - VIX bajo, confianza excesiva, nadie espera problemas
 * 3. MIEDO - Ventas por nervios, volatilidad subiendo
 * 4. PÁNICO - Ventas en cascada, VIX disparado, capitulación
 * 5. CAPITULACIÓN - El punto de máximo dolor, suele ser suelo
 * 6. ESPERANZA - Rebote tras pánico, aún hay miedo pero menos
 * 7. OPTIMISMO - Recuperación sostenida, confianza volviendo
 * 
 * INDICADORES PSICOLÓGICOS:
 * - Fear & Greed Index (CNN)
 * - VIX y su velocidad de cambio
 * - Put/Call ratio
 * - Volumen relativo (pánico = volumen extremo)
 * - Amplitud de mercado (¿todos caen o solo algunos?)
 * - Velocidad de movimiento (caídas rápidas = pánico)
 * 
 * SESGOS COGNITIVOS DETECTABLES:
 * - FOMO (Fear Of Missing Out) - rallies parabólicos
 * - Aversión a pérdidas - vender en mínimos
 * - Comportamiento de manada - todos haciendo lo mismo
 * - Exceso de confianza - ignorar señales de peligro
 */

import { logger } from '../../middleware/logger.js';

// ===== TIPOS =====

export type MarketPsychologyState = 
  | 'euphoria'       // Euforia extrema - peligro de burbuja
  | 'greed'          // Codicia - mercado caliente pero no extremo
  | 'complacency'    // Complacencia - calma antes de la tormenta
  | 'anxiety'        // Ansiedad - nerviosismo creciente
  | 'fear'           // Miedo - ventas por nervios
  | 'panic'          // Pánico - ventas en cascada
  | 'capitulation'   // Capitulación - rendición total
  | 'hope'           // Esperanza - primeros signos de recuperación
  | 'optimism'       // Optimismo - confianza volviendo
  | 'neutral';       // Neutral - sin señales claras

export interface MarketPsychologyAnalysis {
  // Estado actual
  currentState: MarketPsychologyState;
  previousState: MarketPsychologyState | null;
  stateIntensity: number;  // 0-100, qué tan extremo es el estado
  
  // Indicadores clave
  indicators: {
    fearGreedIndex: number | null;      // 0-100 (0=miedo extremo, 100=codicia extrema)
    fearGreedTrend: 'rising' | 'falling' | 'stable';
    vix: number | null;
    vixChange1d: number | null;         // Cambio % en 1 día
    vixChange5d: number | null;         // Cambio % en 5 días
    volumeRatio: number | null;         // Volumen actual / promedio (>2 = extremo)
    priceVelocity: number | null;       // Velocidad de movimiento del mercado
  };
  
  // Sesgos detectados
  biasesDetected: {
    fomo: boolean;              // Rally parabólico, todos comprando
    panicSelling: boolean;      // Ventas en cascada
    herdBehavior: boolean;      // Comportamiento de manada
    overconfidence: boolean;    // Ignorando riesgos
    lossAversion: boolean;      // Vendiendo en mínimos por miedo
  };
  
  // Impacto en predicciones
  predictionImpact: {
    bullishBias: number;        // -50 a +50 (ajuste a predicciones alcistas)
    confidenceMultiplier: number; // 0.5 a 1.2
    volatilityExpectation: 'extreme' | 'high' | 'normal' | 'low';
    contrarianSignal: boolean;  // ¿Es momento contrarian? (comprar miedo, vender euforia)
  };
  
  // Para el usuario
  humanReadable: {
    emoji: string;
    title: string;
    description: string;
    advice: string;
  };
  
  signals: string[];
  lastUpdated: Date;
}

// ===== CACHE =====

const cache: {
  psychology: MarketPsychologyAnalysis | null;
  timestamp: number;
} = {
  psychology: null,
  timestamp: 0,
};

const CACHE_DURATION = 15 * 60 * 1000; // 15 minutos

// ===== FETCHING DATA =====

interface FearGreedData {
  value: number;
  classification: string;
  previousValue: number;
}

async function fetchFearGreedIndex(): Promise<FearGreedData | null> {
  try {
    // CNN Fear & Greed API (alternativa)
    const url = 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata';
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      return null;
    }

    const json: any = await response.json();
    const current = json.fear_and_greed?.score;
    const previous = json.fear_and_greed?.previous_close;
    
    if (current === undefined) {
      return null;
    }

    return {
      value: current,
      classification: getFearGreedClassification(current),
      previousValue: previous || current,
    };
  } catch (error) {
    logger.warn('[MarketPsychology] Could not fetch Fear & Greed index');
    return null;
  }
}

function getFearGreedClassification(value: number): string {
  if (value <= 25) return 'Extreme Fear';
  if (value <= 45) return 'Fear';
  if (value <= 55) return 'Neutral';
  if (value <= 75) return 'Greed';
  return 'Extreme Greed';
}

async function fetchVIXData(): Promise<{ current: number; change1d: number; change5d: number } | null> {
  try {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?range=1mo&interval=1d';
    
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
    const yesterday = closes[closes.length - 2] || current;
    const fiveDaysAgo = closes[Math.max(0, closes.length - 5)] || current;

    return {
      current,
      change1d: ((current - yesterday) / yesterday) * 100,
      change5d: ((current - fiveDaysAgo) / fiveDaysAgo) * 100,
    };
  } catch (error) {
    logger.warn('[MarketPsychology] Could not fetch VIX data');
    return null;
  }
}

async function fetchMarketBreadth(): Promise<{ advancers: number; decliners: number; ratio: number } | null> {
  // Simplificado: usar S&P 500 como proxy
  // En producción, usaríamos datos de amplitud real
  try {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=5d&interval=1d';
    
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
    const volumes = json.chart?.result?.[0]?.indicators?.quote?.[0]?.volume || [];
    
    if (closes.length < 2) {
      return null;
    }

    // Proxy simple: días positivos vs negativos en la semana
    let advancers = 0;
    let decliners = 0;
    
    for (let i = 1; i < closes.length; i++) {
      if (closes[i] > closes[i - 1]) advancers++;
      else if (closes[i] < closes[i - 1]) decliners++;
    }

    return {
      advancers,
      decliners,
      ratio: decliners > 0 ? advancers / decliners : advancers,
    };
  } catch (error) {
    return null;
  }
}

// ===== ANÁLISIS PSICOLÓGICO =====

function determineMarketState(
  fearGreed: FearGreedData | null,
  vix: { current: number; change1d: number; change5d: number } | null
): { state: MarketPsychologyState; intensity: number } {
  let state: MarketPsychologyState = 'neutral';
  let intensity = 50;

  // Si no hay datos, devolver neutral
  if (!fearGreed && !vix) {
    return { state: 'neutral', intensity: 50 };
  }

  const fg = fearGreed?.value ?? 50;
  const vixLevel = vix?.current ?? 20;
  const vixSpike = vix?.change1d ?? 0;

  // === PÁNICO / CAPITULACIÓN ===
  // VIX > 35 con spike > 20% = pánico
  if (vixLevel > 35 && vixSpike > 20) {
    state = 'panic';
    intensity = Math.min(100, 70 + vixSpike);
  }
  // VIX > 40 sostenido = capitulación potencial
  else if (vixLevel > 40) {
    state = 'capitulation';
    intensity = Math.min(100, vixLevel * 2);
  }
  // Fear & Greed < 15 = miedo extremo
  else if (fg < 15) {
    state = vixSpike > 10 ? 'panic' : 'capitulation';
    intensity = 100 - fg;
  }
  
  // === MIEDO ===
  else if (fg < 25 || vixLevel > 30) {
    state = 'fear';
    intensity = Math.max(60, 100 - fg);
  }
  
  // === ANSIEDAD ===
  else if (fg < 40 || (vixLevel > 22 && vixSpike > 5)) {
    state = 'anxiety';
    intensity = 50 + (40 - fg);
  }
  
  // === EUFORIA ===
  // Fear & Greed > 85 = euforia extrema
  else if (fg > 85) {
    state = 'euphoria';
    intensity = fg;
  }
  
  // === CODICIA ===
  else if (fg > 70) {
    state = 'greed';
    intensity = fg;
  }
  
  // === COMPLACENCIA ===
  // VIX muy bajo + Fear & Greed alto = complacencia peligrosa
  else if (vixLevel < 14 && fg > 55) {
    state = 'complacency';
    intensity = 60 + (55 - vixLevel);
  }
  
  // === OPTIMISMO ===
  else if (fg > 55 && fg <= 70) {
    state = 'optimism';
    intensity = fg;
  }
  
  // === ESPERANZA ===
  // Fear & Greed subiendo desde niveles bajos
  else if (fearGreed && fearGreed.value > fearGreed.previousValue && fg < 50) {
    state = 'hope';
    intensity = 50 + (fearGreed.value - fearGreed.previousValue) * 2;
  }

  return { state, intensity: Math.round(Math.min(100, Math.max(0, intensity))) };
}

function detectBiases(
  state: MarketPsychologyState,
  fearGreed: FearGreedData | null,
  vix: { current: number; change1d: number; change5d: number } | null
): MarketPsychologyAnalysis['biasesDetected'] {
  return {
    // FOMO: Codicia extrema + VIX bajo
    fomo: state === 'euphoria' || (state === 'greed' && (vix?.current ?? 20) < 15),
    
    // Panic Selling: Miedo + VIX subiendo rápido
    panicSelling: state === 'panic' || (state === 'fear' && (vix?.change1d ?? 0) > 15),
    
    // Herd Behavior: Estados extremos (todos haciendo lo mismo)
    herdBehavior: ['euphoria', 'panic', 'capitulation'].includes(state),
    
    // Overconfidence: Complacencia o codicia con VIX muy bajo
    overconfidence: state === 'complacency' || (state === 'greed' && (vix?.current ?? 20) < 12),
    
    // Loss Aversion: Vendiendo después de caídas (miedo tras pánico)
    lossAversion: state === 'fear' && (fearGreed?.value ?? 50) < (fearGreed?.previousValue ?? 50),
  };
}

function calculatePredictionImpact(
  state: MarketPsychologyState,
  intensity: number,
  biases: MarketPsychologyAnalysis['biasesDetected']
): MarketPsychologyAnalysis['predictionImpact'] {
  let bullishBias = 0;
  let confidenceMultiplier = 1.0;
  let volatilityExpectation: 'extreme' | 'high' | 'normal' | 'low' = 'normal';
  let contrarianSignal = false;

  switch (state) {
    case 'euphoria':
      // En euforia, ser muy cauteloso con predicciones alcistas
      bullishBias = -30 - (intensity - 80) * 2; // Hasta -50
      confidenceMultiplier = 0.6;
      volatilityExpectation = 'high';
      contrarianSignal = true; // Señal contrarian: vender
      break;
      
    case 'greed':
      bullishBias = -15;
      confidenceMultiplier = 0.8;
      volatilityExpectation = 'normal';
      break;
      
    case 'complacency':
      // Peligro oculto: parece tranquilo pero puede explotar
      bullishBias = -20;
      confidenceMultiplier = 0.7;
      volatilityExpectation = 'high'; // Se espera aumento
      contrarianSignal = true;
      break;
      
    case 'anxiety':
      bullishBias = -10;
      confidenceMultiplier = 0.85;
      volatilityExpectation = 'high';
      break;
      
    case 'fear':
      // Miedo = oportunidad potencial pero con precaución
      bullishBias = 5;
      confidenceMultiplier = 0.75;
      volatilityExpectation = 'high';
      break;
      
    case 'panic':
      // Pánico extremo = alta volatilidad pero oportunidad contrarian
      bullishBias = 15;
      confidenceMultiplier = 0.5; // Muy baja confianza
      volatilityExpectation = 'extreme';
      contrarianSignal = true; // Señal contrarian: potencial compra
      break;
      
    case 'capitulation':
      // Capitulación = posible suelo, señal contrarian fuerte
      bullishBias = 25;
      confidenceMultiplier = 0.6;
      volatilityExpectation = 'extreme';
      contrarianSignal = true; // Señal contrarian fuerte
      break;
      
    case 'hope':
      bullishBias = 10;
      confidenceMultiplier = 0.85;
      volatilityExpectation = 'high';
      break;
      
    case 'optimism':
      bullishBias = 5;
      confidenceMultiplier = 0.95;
      volatilityExpectation = 'normal';
      break;
      
    default:
      bullishBias = 0;
      confidenceMultiplier = 1.0;
      volatilityExpectation = 'normal';
  }

  // Ajustes por sesgos específicos
  if (biases.fomo) {
    bullishBias -= 15; // FOMO = precaución extra con alcistas
  }
  if (biases.panicSelling) {
    bullishBias += 10; // Panic selling = posible oportunidad
  }
  if (biases.overconfidence) {
    confidenceMultiplier *= 0.8; // Reducir confianza si hay exceso de confianza en el mercado
  }

  return {
    bullishBias: Math.max(-50, Math.min(50, bullishBias)),
    confidenceMultiplier: Math.max(0.5, Math.min(1.2, confidenceMultiplier)),
    volatilityExpectation,
    contrarianSignal,
  };
}

function generateHumanReadable(
  state: MarketPsychologyState,
  intensity: number,
  contrarianSignal: boolean
): MarketPsychologyAnalysis['humanReadable'] {
  const stateInfo: Record<MarketPsychologyState, { emoji: string; title: string; description: string; advice: string }> = {
    euphoria: {
      emoji: '🎢',
      title: 'Euforia Extrema',
      description: 'El mercado está en modo "esta vez es diferente". Todos comprando, nadie ve riesgos.',
      advice: 'Momento de máxima precaución. Históricamente, la euforia precede correcciones. Considera tomar beneficios.',
    },
    greed: {
      emoji: '🤑',
      title: 'Codicia',
      description: 'Optimismo elevado, el mercado está caliente.',
      advice: 'Cuidado con perseguir subidas. Mantén tu plan y no cedas al FOMO.',
    },
    complacency: {
      emoji: '😴',
      title: 'Complacencia',
      description: 'Calma chicha. VIX bajo, nadie espera problemas. Peligro oculto.',
      advice: 'La calma excesiva suele preceder volatilidad. Buen momento para revisar stop-losses.',
    },
    anxiety: {
      emoji: '😰',
      title: 'Ansiedad Creciente',
      description: 'Nerviosismo en aumento, el mercado duda.',
      advice: 'Volatilidad probable. No tomes decisiones impulsivas, espera confirmación.',
    },
    fear: {
      emoji: '😨',
      title: 'Miedo',
      description: 'Los inversores están nerviosos, hay ventas por miedo.',
      advice: 'Si tu tesis no ha cambiado, el miedo de otros puede ser oportunidad. Pero no cojas cuchillos cayendo.',
    },
    panic: {
      emoji: '😱',
      title: 'Pánico',
      description: 'Ventas en cascada, VIX disparado, todos quieren salir.',
      advice: 'NO vendas en pánico si no es parte de tu plan. El pánico suele ser mal consejero.',
    },
    capitulation: {
      emoji: '🏳️',
      title: 'Capitulación',
      description: 'Rendición total. "Lo vendo todo y no vuelvo". Posible suelo.',
      advice: 'Históricamente, la capitulación marca suelos. Si tienes liquidez, puede ser momento de largo plazo.',
    },
    hope: {
      emoji: '🌱',
      title: 'Esperanza',
      description: 'Primeros brotes verdes tras la tormenta. Aún hay miedo pero menos.',
      advice: 'Recuperación temprana. Puede haber retests. No te lances de cabeza.',
    },
    optimism: {
      emoji: '😊',
      title: 'Optimismo',
      description: 'Confianza volviendo, mercado en recuperación sostenida.',
      advice: 'Buen momento para seguir tu plan. El optimismo moderado es sano.',
    },
    neutral: {
      emoji: '😐',
      title: 'Neutral',
      description: 'Sin señales claras de sesgo psicológico en el mercado.',
      advice: 'Condiciones normales. Sigue tu análisis fundamental y técnico.',
    },
  };

  const info = stateInfo[state];
  
  // Añadir nota contrarian si aplica
  if (contrarianSignal) {
    info.advice += ' ⚡ SEÑAL CONTRARIAN: El sentimiento extremo suele revertir.';
  }

  return info;
}

function generateSignals(
  state: MarketPsychologyState,
  intensity: number,
  biases: MarketPsychologyAnalysis['biasesDetected'],
  fearGreed: FearGreedData | null,
  vix: { current: number; change1d: number; change5d: number } | null
): string[] {
  const signals: string[] = [];

  // Estado principal
  const stateEmojis: Record<MarketPsychologyState, string> = {
    euphoria: '🎢', greed: '🤑', complacency: '😴', anxiety: '😰',
    fear: '😨', panic: '😱', capitulation: '🏳️', hope: '🌱',
    optimism: '😊', neutral: '😐',
  };
  
  signals.push(`${stateEmojis[state]} Estado psicológico: ${state.toUpperCase()} (intensidad: ${intensity}/100)`);

  // Fear & Greed
  if (fearGreed) {
    const fgEmoji = fearGreed.value < 25 ? '😰' : fearGreed.value > 75 ? '🤑' : '😐';
    signals.push(`${fgEmoji} Fear & Greed Index: ${fearGreed.value} (${fearGreed.classification})`);
  }

  // VIX
  if (vix) {
    const vixEmoji = vix.current > 30 ? '🚨' : vix.current > 20 ? '⚠️' : '✅';
    signals.push(`${vixEmoji} VIX: ${vix.current.toFixed(1)} (${vix.change1d > 0 ? '+' : ''}${vix.change1d.toFixed(1)}% hoy)`);
  }

  // Sesgos detectados
  if (biases.fomo) {
    signals.push('🚀 FOMO detectado: El mercado está persiguiendo subidas');
  }
  if (biases.panicSelling) {
    signals.push('📉 Panic Selling: Ventas impulsivas por miedo');
  }
  if (biases.herdBehavior) {
    signals.push('🐑 Comportamiento de manada: Todos haciendo lo mismo');
  }
  if (biases.overconfidence) {
    signals.push('😎 Exceso de confianza: El mercado ignora riesgos');
  }
  if (biases.lossAversion) {
    signals.push('😰 Aversión a pérdidas: Vendiendo por miedo a perder más');
  }

  return signals;
}

// ===== SERVICIO PRINCIPAL =====

async function analyzeMarketPsychology(): Promise<MarketPsychologyAnalysis> {
  // Check cache
  if (cache.psychology && Date.now() - cache.timestamp < CACHE_DURATION) {
    return cache.psychology;
  }

  logger.info('[MarketPsychology] Analyzing market psychological state...');

  // Fetch data in parallel
  const [fearGreed, vix] = await Promise.all([
    fetchFearGreedIndex(),
    fetchVIXData(),
  ]);

  // Determine state
  const { state, intensity } = determineMarketState(fearGreed, vix);
  
  // Detect biases
  const biases = detectBiases(state, fearGreed, vix);
  
  // Calculate prediction impact
  const predictionImpact = calculatePredictionImpact(state, intensity, biases);
  
  // Generate human-readable info
  const humanReadable = generateHumanReadable(state, intensity, predictionImpact.contrarianSignal);
  
  // Generate signals
  const signals = generateSignals(state, intensity, biases, fearGreed, vix);

  const analysis: MarketPsychologyAnalysis = {
    currentState: state,
    previousState: cache.psychology?.currentState ?? null,
    stateIntensity: intensity,
    
    indicators: {
      fearGreedIndex: fearGreed?.value ?? null,
      fearGreedTrend: fearGreed 
        ? (fearGreed.value > fearGreed.previousValue ? 'rising' : fearGreed.value < fearGreed.previousValue ? 'falling' : 'stable')
        : 'stable',
      vix: vix?.current ?? null,
      vixChange1d: vix?.change1d ?? null,
      vixChange5d: vix?.change5d ?? null,
      volumeRatio: null, // TODO: implementar
      priceVelocity: null, // TODO: implementar
    },
    
    biasesDetected: biases,
    predictionImpact,
    humanReadable,
    signals,
    lastUpdated: new Date(),
  };

  // Update cache
  cache.psychology = analysis;
  cache.timestamp = Date.now();

  logger.info(`[MarketPsychology] State: ${state} (${intensity}/100), F&G: ${fearGreed?.value ?? 'N/A'}, VIX: ${vix?.current?.toFixed(1) ?? 'N/A'}`);

  return analysis;
}

// ===== SERVICIO EXPORTADO =====

export const marketPsychologyService = {
  /**
   * Obtiene el análisis psicológico actual del mercado
   */
  async getCurrentAnalysis(): Promise<MarketPsychologyAnalysis> {
    return analyzeMarketPsychology();
  },
  
  /**
   * Aplica ajustes psicológicos a una predicción
   */
  async applyToPrediction(
    prediction: { change: number; confidence: number },
    assetType: 'stock' | 'crypto' | 'forex' | 'commodity' | 'index' | 'other'
  ): Promise<{
    adjustedChange: number;
    adjustedConfidence: number;
    applied: boolean;
    psychologyInfo?: MarketPsychologyAnalysis;
  }> {
    try {
      const analysis = await analyzeMarketPsychology();
      
      // Si estado neutral, no ajustar
      if (analysis.currentState === 'neutral') {
        return {
          adjustedChange: prediction.change,
          adjustedConfidence: prediction.confidence,
          applied: false,
        };
      }
      
      let adjustedChange = prediction.change;
      let adjustedConfidence = Math.round(prediction.confidence * analysis.predictionImpact.confidenceMultiplier);
      
      // Aplicar bias
      // Si la predicción es alcista, aplicar bullishBias
      if (prediction.change > 0) {
        // En euforia, el bias es negativo (reduce predicciones alcistas)
        // En pánico, el bias es positivo (aumenta predicciones alcistas - contrarian)
        const biasEffect = analysis.predictionImpact.bullishBias / 100 * Math.abs(prediction.change);
        adjustedChange += biasEffect;
      } else {
        // Si la predicción es bajista, invertir el efecto
        const biasEffect = -analysis.predictionImpact.bullishBias / 100 * Math.abs(prediction.change);
        adjustedChange += biasEffect;
      }
      
      // Ajustes específicos por tipo de activo
      // Crypto es más sensible a psicología
      if (assetType === 'crypto') {
        adjustedConfidence = Math.round(adjustedConfidence * 0.9); // Reducir confianza extra
        if (analysis.biasesDetected.fomo || analysis.biasesDetected.panicSelling) {
          adjustedChange *= 1.3; // Amplificar el efecto psicológico
        }
      }
      
      // Commodities en pánico tienden a correlacionar
      if (assetType === 'commodity' && ['panic', 'capitulation'].includes(analysis.currentState)) {
        adjustedConfidence = Math.round(adjustedConfidence * 0.8);
      }
      
      return {
        adjustedChange,
        adjustedConfidence,
        applied: true,
        psychologyInfo: analysis,
      };
    } catch (e) {
      logger.warn(`[MarketPsychology] Error applying to prediction: ${(e as Error).message}`);
      return {
        adjustedChange: prediction.change,
        adjustedConfidence: prediction.confidence,
        applied: false,
      };
    }
  },
  
  /**
   * Obtiene un resumen rápido para UI
   */
  async getQuickSummary(): Promise<{
    state: MarketPsychologyState;
    emoji: string;
    title: string;
    intensity: number;
    contrarianSignal: boolean;
  }> {
    const analysis = await analyzeMarketPsychology();
    return {
      state: analysis.currentState,
      emoji: analysis.humanReadable.emoji,
      title: analysis.humanReadable.title,
      intensity: analysis.stateIntensity,
      contrarianSignal: analysis.predictionImpact.contrarianSignal,
    };
  },
};
