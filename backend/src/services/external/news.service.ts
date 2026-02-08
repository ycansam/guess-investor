/**
 * News Service - VERSIÓN AVANZADA v2.0
 * 
 * Análisis de noticias financieras con:
 * - Análisis de sentimiento avanzado (contexto, negaciones, amplificadores)
 * - Keywords masivos en inglés y español
 * - Keywords por sector específico
 * - Peso por recencia (decay exponencial)
 * - Peso por fuente (base de datos ampliada de credibilidad)
 * - Detección de eventos especiales (earnings, M&A, dividendos, splits)
 * - Reconocimiento de patrones de precio en titulares
 * - Análisis de tono (urgencia, confianza)
 */

import { logger } from '../../middleware/logger.js';

export interface NewsItem {
  title: string;
  publisher: string;
  link: string;
  publishedAt: Date;
  sentiment: 'positive' | 'negative' | 'neutral';
  sentimentScore: number; // -100 a +100
  confidence: number; // 0-100: qué tan seguro estamos del sentimiento
  newsType: NewsType;
  impactMagnitude: 'high' | 'medium' | 'low';
  sourceCredibility: number; // 0-100
  urgencyLevel?: 'urgent' | 'normal'; // Nuevo: urgencia del tono
  priceMoveMentioned?: number; // Nuevo: % mencionado en el titular
}

export type NewsType = 
  | 'earnings'      // Resultados financieros
  | 'guidance'      // Previsiones de la empresa
  | 'analyst'       // Upgrades/downgrades de analistas
  | 'merger_acquisition' // M&A
  | 'product'       // Lanzamientos, innovación
  | 'legal'         // Demandas, multas, regulación
  | 'management'    // Cambios de ejecutivos
  | 'macro'         // Impacto macroeconómico
  | 'sector'        // Noticias del sector
  | 'dividend'      // Dividendos y retribución
  | 'insider'       // Compras/ventas de insiders
  | 'short'         // Short interest, short squeeze
  | 'general';      // Otras

export interface NewsSummary {
  items: NewsItem[];
  overallSentiment: 'positive' | 'negative' | 'neutral';
  sentimentScore: number;
  sentimentConfidence: number;
  hasNews: boolean;
  newsCount: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  highImpactCount: number;
  urgentCount: number; // Nuevo
  summary: string;
  byType: Record<NewsType, { count: number; avgSentiment: number }>;
  signals: string[];
  dataQuality: 'high' | 'medium' | 'low'; // Nuevo
}

// ===== PALABRAS CLAVE v2.0 =====

// Palabras de URGENCIA (aumentan impacto)
const URGENCY_WORDS = [
  'breaking', 'just in', 'alert', 'urgent', 'flash', 'developing',
  'exclusive', 'última hora', 'urgente', 'exclusiva', 'ahora mismo',
];

// Amplificadores (aumentan el peso del siguiente keyword)
const AMPLIFIER_WORDS = [
  'very', 'extremely', 'significantly', 'substantially', 'dramatically',
  'massive', 'huge', 'enormous', 'major', 'critical', 'crucial',
  'much', 'far', 'way', 'sharply', 'strongly', 'heavily',
  'muy', 'extremadamente', 'significativamente', 'drásticamente',
  'masivo', 'enorme', 'importante', 'crítico', 'crucial',
];

// Palabras que indican alta magnitud de impacto - AMPLIADO
const HIGH_IMPACT_KEYWORDS = [
  // Eventos corporativos críticos
  'bankruptcy', 'chapter 11', 'chapter 7', 'liquidation', 'insolvency',
  'fraud', 'sec investigation', 'doj investigation', 'fbi', 'indictment',
  'ceo fired', 'ceo resigns', 'ceo steps down', 'cfo resigns', 'board ousted',
  // Resultados extremos
  'massive', 'plunge', 'crash', 'soar', 'surge', 'record', 'historic',
  'all-time high', 'all-time low', 'blowout', 'smashes', 'crushes',
  'beat estimates', 'miss estimates', 'guidance cut', 'guidance raise',
  'profit warning', 'revenue warning',
  // M&A
  'merger', 'acquisition', 'takeover', 'buyout', 'hostile bid', 'tender offer',
  // Productos críticos
  'fda approval', 'fda reject', 'patent granted', 'breakthrough', 'game-changer',
  'recall', 'data breach', 'hack', 'security breach', 'ransomware',
  // Español
  'quiebra', 'fraude', 'investigación sec', 'dimite', 'despedido',
  'desploma', 'se dispara', 'máximo histórico', 'mínimo histórico',
  'fusión', 'adquisición', 'opa', 'opción de compra',
  'aprobación fda', 'rechazo fda', 'patente', 'hackeo', 'brecha de datos',
];

// Contexto que INVIERTE el sentimiento - AMPLIADO
const NEGATION_WORDS = [
  // Inglés
  'not', 'no', "n't", 'never', 'neither', 'nobody', 'nothing', 'none',
  'fail to', 'fails to', 'failed to', 'unable to', 'decline to', 'declines to',
  'refuse to', 'refuses to', 'rejected', 'denies', 'denied',
  'despite', 'although', 'however', 'but', 'yet', 'still',
  'without', 'lacks', 'missing', 'absent',
  // Español
  'no', 'nunca', 'ninguno', 'ninguna', 'nadie', 'nada', 'ni',
  'falla', 'incapaz de', 'rechaza', 'niega', 'deniega',
  'a pesar de', 'aunque', 'sin embargo', 'pero', 'todavía',
  'sin', 'carece de', 'falta',
];

// Contexto que REDUCE la certeza del sentimiento - AMPLIADO
const UNCERTAINTY_WORDS = [
  // Inglés
  'may', 'might', 'could', 'possibly', 'potentially', 'perhaps', 'maybe',
  'rumor', 'rumored', 'rumours', 'speculate', 'speculation', 'speculated',
  'uncertain', 'unclear', 'unknown', 'unconfirmed', 'alleged', 'reportedly',
  'if', 'should', 'would', 'appears', 'seems', 'likely', 'unlikely',
  'considering', 'exploring', 'mulling', 'weighing',
  // Español
  'puede', 'podría', 'posiblemente', 'potencialmente', 'quizás', 'tal vez',
  'rumor', 'se rumorea', 'especula', 'especulación',
  'incierto', 'confuso', 'sin confirmar', 'presuntamente', 'supuestamente',
  'si', 'debería', 'parece', 'probablemente', 'improbable',
  'considera', 'explora', 'estudia', 'evalúa',
];

// ===== KEYWORDS POSITIVOS - AMPLIADO MASIVAMENTE =====
const POSITIVE_KEYWORDS: Record<string, number> = {
  // ========== EARNINGS (muy alto impacto) ==========
  'beats': 30, 'beat estimates': 35, 'beat expectations': 35,
  'exceeds': 30, 'exceeded expectations': 35, 'exceeds estimates': 35,
  'tops estimates': 30, 'topped expectations': 32, 'smashes estimates': 40,
  'crushes estimates': 40, 'blowout quarter': 38, 'blowout earnings': 40,
  'record revenue': 40, 'record profit': 42, 'record earnings': 42,
  'record sales': 38, 'record quarter': 38, 'record year': 35,
  'all-time high': 35, 'new high': 25, '52-week high': 28,
  'better than expected': 30, 'above expectations': 28,
  'strong quarter': 28, 'strong results': 28, 'solid quarter': 25,
  'robust earnings': 28, 'impressive results': 30,
  
  // ========== GUIDANCE ==========
  'raises guidance': 35, 'guidance raise': 35, 'raises outlook': 32,
  'outlook positive': 28, 'positive outlook': 28, 'upbeat guidance': 30,
  'raises forecast': 32, 'increases forecast': 30, 'boosts guidance': 32,
  'accelerating growth': 30, 'reaffirms guidance': 20, 'confirms outlook': 18,
  
  // ========== ANALYST ACTIONS ==========
  'upgrade': 25, 'upgraded': 25, 'upgrades': 25, 'double upgrade': 35,
  'buy rating': 22, 'strong buy': 30, 'outperform': 22, 'overweight': 22,
  'price target raise': 25, 'raises price target': 25, 'pt raised': 22,
  'bullish': 18, 'bullish call': 22, 'bull case': 20,
  'top pick': 28, 'best idea': 28, 'conviction buy': 30,
  'initiates buy': 25, 'initiates outperform': 22,
  'positive catalyst': 22, 'upside potential': 20,
  
  // ========== GROWTH & PERFORMANCE ==========
  'growth': 15, 'growing': 12, 'grows': 12, 'expands': 15,
  'strong': 12, 'strength': 10, 'strengthen': 12, 'strengthens': 12,
  'positive': 10, 'gains': 12, 'gain': 10, 'winning': 12,
  'rises': 12, 'rising': 10, 'rise': 8, 'climbs': 12, 'climbing': 10,
  'soars': 25, 'soaring': 22, 'surges': 28, 'surging': 25,
  'jumps': 20, 'jumping': 18, 'rallies': 22, 'rally': 20,
  'spikes': 18, 'spiking': 15, 'advances': 12, 'advancing': 10,
  'outperforms': 20, 'outperforming': 18, 'beats market': 22,
  'momentum': 15, 'breakout': 20, 'breaks out': 22,
  'accelerates': 18, 'accelerating': 15, 'acceleration': 15,
  'turnaround': 22, 'recovery': 18, 'rebounds': 20, 'bounces back': 20,
  
  // ========== M&A POSITIVO ==========
  'acquisition': 15, 'acquires': 18, 'acquired': 15, 'to acquire': 15,
  'merger': 15, 'merges': 15, 'to merge': 12, 'merger agreement': 18,
  'deal': 12, 'closes deal': 18, 'deal announced': 15,
  'partnership': 15, 'partners with': 15, 'strategic partnership': 20,
  'alliance': 12, 'strategic alliance': 15, 'joint venture': 15,
  'agreement': 10, 'signs agreement': 12, 'contract': 10, 'wins contract': 22,
  'collaboration': 12, 'collaborates': 12,
  
  // ========== PRODUCTOS/INNOVACIÓN ==========
  'launch': 15, 'launches': 15, 'launched': 12, 'new product': 15,
  'innovation': 18, 'innovative': 15, 'breakthrough': 28, 'game-changer': 25,
  'patent': 15, 'patent granted': 22, 'patent approval': 20,
  'fda approval': 38, 'fda approves': 38, 'approved': 20, 'approval': 18,
  'clears fda': 35, 'regulatory approval': 25,
  'ai': 15, 'artificial intelligence': 18, 'machine learning': 15,
  'cloud': 12, 'digital transformation': 15, 'automation': 12,
  'expansion': 15, 'enters market': 15, 'market entry': 12, 'global expansion': 18,
  
  // ========== SHAREHOLDER VALUE ==========
  'dividend': 15, 'dividends': 15, 'dividend increase': 25, 'raises dividend': 28,
  'increases dividend': 28, 'special dividend': 30, 'initiates dividend': 22,
  'buyback': 18, 'share buyback': 20, 'share repurchase': 20,
  'repurchase program': 18, '$X billion buyback': 22,
  'stock split': 20, 'splits stock': 18, 'announces split': 20,
  'return to shareholders': 18, 'shareholder returns': 15,
  
  // ========== INSIDER ACTIVITY ==========
  'insider buying': 25, 'insiders buying': 25, 'ceo buys': 28,
  'cfo buys': 25, 'director buys': 22, 'executive buys': 22,
  
  // ========== SHORT INTEREST ==========
  'short squeeze': 30, 'squeeze': 18, 'shorts covering': 22,
  'short interest drops': 20, 'bears retreat': 18,
  
  // ========== ESPAÑOL - AMPLIADO MASIVAMENTE ==========
  // Resultados
  'supera': 28, 'supera expectativas': 35, 'supera estimaciones': 35,
  'bate': 30, 'bate expectativas': 35, 'bate estimaciones': 35,
  'récord': 32, 'récord histórico': 40, 'máximo histórico': 38,
  'mejores resultados': 30, 'resultados sólidos': 25, 'cifras positivas': 22,
  'mejor de lo esperado': 32, 'por encima de lo esperado': 30,
  'sorprende positivamente': 30, 'sorpresa positiva': 28,
  'trimestre fuerte': 28, 'trimestre récord': 35, 'año récord': 32,
  
  // Guidance español
  'eleva previsiones': 32, 'mejora perspectivas': 28, 'sube guidance': 30,
  'revisa al alza': 30, 'perspectivas positivas': 25, 'outlook positivo': 25,
  
  // Analistas español
  'mejora recomendación': 25, 'recomendación de compra': 22,
  'sube precio objetivo': 25, 'eleva precio objetivo': 25,
  'nota positiva': 18, 'visión alcista': 20, 'potencial alcista': 22,
  
  // Crecimiento español
  'crecimiento': 15, 'crece': 12, 'crecer': 10, 'expansión': 15,
  'sube': 12, 'subida': 10, 'alza': 12, 'avanza': 12, 'avance': 10,
  'positivo': 10, 'ganancias': 15, 'ganancia': 12, 'beneficio': 15,
  'mejora': 12, 'mejoras': 10, 'mejorar': 10,
  'dispara': 28, 'se dispara': 30, 'despega': 22, 'despegue': 20,
  'impulsa': 15, 'impulso': 12, 'repunta': 18, 'rebota': 20,
  'lidera': 15, 'liderazgo': 12, 'líder': 10,
  'acelera': 18, 'aceleración': 15, 'impulso positivo': 15,
  'recupera': 18, 'recuperación': 15, 'remonta': 20,
  
  // M&A español
  'compra': 12, 'adquisición': 18, 'adquiere': 18, 'fusión': 15,
  'alianza': 12, 'alianza estratégica': 18, 'acuerdo': 10,
  
  // Productos español
  'lanza': 15, 'lanzamiento': 15, 'innovación': 18, 'innovador': 15,
  'patente': 15, 'aprobación': 18, 'aprobado': 15,
  'entra en mercado': 15, 'nuevo mercado': 15,
  
  // Dividendos español
  'dividendo': 15, 'aumenta dividendo': 28, 'sube dividendo': 28,
  'dividendo extraordinario': 30, 'recompra de acciones': 20,
  'retribución al accionista': 18,
  
  // Otros positivos español
  'máximos': 22, 'nuevos máximos': 25, 'máximos anuales': 22,
  'récord de ventas': 35, 'récord de ingresos': 35,
  'buenas perspectivas': 22, 'optimismo': 18, 'confianza': 12,
};

// ===== KEYWORDS NEGATIVOS - AMPLIADO MASIVAMENTE =====
const NEGATIVE_KEYWORDS: Record<string, number> = {
  // ========== EARNINGS NEGATIVOS ==========
  'misses': -35, 'miss estimates': -40, 'missed expectations': -38,
  'below estimates': -35, 'below expectations': -35, 'disappoints': -32,
  'disappointing': -30, 'disappointing results': -35, 'weak quarter': -30,
  'weak results': -28, 'weak earnings': -30, 'soft quarter': -25,
  'underwhelms': -28, 'falls short': -30, 'shortfall': -32,
  'worse than expected': -35, 'worse than feared': -38,
  'profit miss': -35, 'revenue miss': -35, 'earnings miss': -38,
  'all-time low': -35, 'new low': -25, '52-week low': -28,
  
  // ========== GUIDANCE NEGATIVA ==========
  'cuts guidance': -40, 'guidance cut': -40, 'lowers guidance': -38,
  'lowers outlook': -35, 'negative outlook': -30, 'warns': -25,
  'profit warning': -42, 'revenue warning': -40, 'earnings warning': -42,
  'lowers forecast': -35, 'reduces forecast': -32, 'slashes guidance': -42,
  'withdraws guidance': -38, 'suspends guidance': -35,
  
  // ========== ANALYST ACTIONS ==========
  'downgrade': -30, 'downgraded': -30, 'downgrades': -30, 'double downgrade': -40,
  'sell rating': -28, 'strong sell': -32, 'underperform': -25, 'underweight': -25,
  'price target cut': -28, 'cuts price target': -28, 'pt lowered': -25,
  'bearish': -18, 'bearish call': -22, 'bear case': -20,
  'initiates sell': -28, 'initiates underperform': -25,
  'negative catalyst': -22, 'downside risk': -20,
  'caution': -15, 'cautious': -12, 'concern': -15, 'concerns': -15,
  
  // ========== LEGAL/REGULATORY ==========
  'lawsuit': -28, 'sued': -28, 'sues': -25, 'litigation': -25,
  'investigation': -32, 'sec investigation': -42, 'doj investigation': -45,
  'fbi investigation': -45, 'probe': -28, 'subpoena': -32,
  'fine': -22, 'fined': -22, 'penalty': -22, 'penalized': -25,
  'settlement': -18, 'settles': -15, 'pays settlement': -20,
  'fraud': -48, 'fraudulent': -45, 'scandal': -38, 'misconduct': -32,
  'violation': -28, 'violates': -28, 'illegal': -35, 'criminal': -40,
  'antitrust': -28, 'monopoly': -25, 'blocked': -22, 'regulatory block': -28,
  'ban': -25, 'banned': -28, 'sanctions': -30, 'embargo': -28,
  'indicted': -48, 'indictment': -48, 'charged': -35, 'charges': -32,
  'class action': -30, 'class-action': -30, 'shareholder lawsuit': -28,
  
  // ========== OPERATIONAL ==========
  'recall': -32, 'recalls': -32, 'product recall': -35, 'safety recall': -38,
  'data breach': -38, 'breach': -30, 'hack': -35, 'hacked': -38,
  'ransomware': -40, 'cyber attack': -38, 'security breach': -35,
  'layoffs': -25, 'layoff': -25, 'cuts jobs': -28, 'job cuts': -28,
  'workforce reduction': -25, 'staff cuts': -25, 'fires': -28,
  'restructuring': -18, 'cost cutting': -15, 'downsizing': -22,
  'plant closure': -28, 'factory closure': -28, 'store closures': -25,
  'ceo resigns': -32, 'ceo fired': -38, 'ceo steps down': -30,
  'cfo resigns': -28, 'executive leaves': -22, 'exodus': -28,
  'supply chain': -15, 'supply chain issues': -22, 'shortage': -18,
  'delays': -15, 'delayed': -12, 'postponed': -12, 'halts': -22,
  
  // ========== FINANCIAL DISTRESS ==========
  'bankruptcy': -50, 'chapter 11': -48, 'chapter 7': -50, 'liquidation': -50,
  'default': -48, 'defaults': -48, 'debt crisis': -42,
  'loss': -18, 'losses': -20, 'net loss': -25, 'operating loss': -25,
  'deficit': -18, 'insolvency': -48, 'insolvent': -48,
  'credit downgrade': -32, 'junk': -28, 'junk status': -32,
  'liquidity': -15, 'liquidity crisis': -35, 'cash burn': -22,
  'debt': -12, 'high debt': -18, 'leverage': -10, 'overleveraged': -22,
  
  // ========== MARKET ACTION ==========
  'decline': -18, 'declines': -18, 'declining': -15,
  'falls': -18, 'falling': -15, 'fell': -15,
  'drops': -20, 'dropping': -18, 'drop': -15,
  'plunges': -32, 'plunging': -30, 'plunge': -28,
  'crash': -38, 'crashes': -38, 'crashing': -35,
  'tumbles': -28, 'tumbling': -25,
  'sinks': -22, 'sinking': -20,
  'collapses': -42, 'collapse': -40, 'collapsing': -38,
  'tanks': -28, 'tanking': -25,
  'slides': -20, 'sliding': -18,
  'plummets': -32, 'plummeting': -30,
  'selloff': -25, 'sell-off': -25, 'selling pressure': -22,
  'rout': -30, 'bloodbath': -35,
  
  // ========== SHORT INTEREST ==========
  'short interest rises': -18, 'heavily shorted': -15,
  'short report': -25, 'short seller': -22, 'bear raid': -25,
  
  // ========== ESPAÑOL - AMPLIADO MASIVAMENTE ==========
  // Resultados negativos
  'decepciona': -32, 'decepcionante': -30, 'decepción': -28,
  'peor de lo esperado': -35, 'por debajo de expectativas': -32,
  'no alcanza': -25, 'no cumple': -25, 'falla estimaciones': -32,
  'débil': -20, 'trimestre débil': -28, 'resultados débiles': -28,
  'flojo': -18, 'cifras flojas': -22, 'mínimo histórico': -35,
  
  // Guidance negativa español
  'rebaja previsiones': -35, 'recorta previsiones': -38,
  'empeora perspectivas': -32, 'baja guidance': -35,
  'revisa a la baja': -32, 'perspectivas negativas': -28,
  'alerta de beneficios': -40, 'aviso de beneficios': -38,
  
  // Legal español
  'demanda': -28, 'demandado': -28, 'demandan': -25,
  'investigación': -32, 'investigado': -30, 'sanción': -25,
  'multa': -22, 'multado': -22, 'penalización': -22,
  'fraude': -48, 'escándalo': -38, 'irregularidades': -32,
  'imputado': -45, 'imputación': -45, 'procesado': -40,
  
  // Operacional español
  'despidos': -28, 'despido': -25, 'recorta plantilla': -28,
  'reduce plantilla': -25, 'ere': -28, 'erte': -20,
  'reestructuración': -18, 'ajuste': -12, 'cierre': -22,
  'cierra': -22, 'cierres': -22, 'planta cerrada': -28,
  'dimite': -28, 'dimisión': -28, 'cesa': -22, 'destituido': -32,
  'problemas': -15, 'dificultades': -18, 'retrasos': -15,
  
  // Distress financiero español
  'quiebra': -50, 'concurso de acreedores': -48, 'liquidación': -50,
  'impago': -45, 'morosidad': -25, 'deuda': -12, 'endeudamiento': -15,
  'pérdida': -20, 'pérdidas': -22, 'números rojos': -25,
  'déficit': -18, 'insolvencia': -48, 'crisis': -28,
  
  // Mercado español
  'cae': -18, 'caída': -20, 'baja': -15, 'bajada': -15,
  'desploma': -35, 'se desploma': -38, 'hunde': -32, 'se hunde': -35,
  'retrocede': -15, 'retroceso': -15, 'pierde': -18,
  'colapsa': -42, 'colapso': -40, 'derrumbe': -38,
  'presión vendedora': -25, 'venta masiva': -28,
  'mínimos': -20, 'nuevos mínimos': -25, 'mínimos anuales': -22,
  
  // Otros negativos español
  'alerta': -18, 'advertencia': -18, 'riesgo': -15, 'preocupación': -15,
  'incertidumbre': -15, 'volatilidad': -12, 'temor': -18, 'miedo': -20,
  'recorta': -22, 'reduce': -15, 'retira': -22, 'suspende': -22,
  'cancela': -20, 'paraliza': -22,
};

// ===== FUENTES CON CREDIBILIDAD - AMPLIADO =====
const SOURCE_CREDIBILITY: Record<string, number> = {
  // Tier 1 - Máxima credibilidad (90-100)
  'reuters': 98,
  'bloomberg': 98,
  'wall street journal': 95,
  'wsj': 95,
  'financial times': 95,
  'ft': 95,
  'the economist': 92,
  'ap': 95,
  'associated press': 95,
  'afp': 92,
  
  // Tier 2 - Alta credibilidad (80-89)
  'cnbc': 88,
  'barron\'s': 88,
  'marketwatch': 85,
  'investor\'s business daily': 85,
  'ibd': 85,
  'business insider': 82,
  'forbes': 82,
  'fortune': 82,
  'nytimes': 85,
  'new york times': 85,
  'washington post': 82,
  'bbc': 85,
  'cnn business': 80,
  
  // Tier 3 - Buena credibilidad (70-79)
  'yahoo finance': 78,
  'seeking alpha': 72,
  'thestreet': 72,
  'benzinga': 75,
  'investopedia': 75,
  'zacks': 72,
  'tipranks': 72,
  
  // Tier 4 - Credibilidad media (60-69)
  'motley fool': 65,
  'fool.com': 65,
  'investing.com': 68,
  'finviz': 65,
  'stocktwits': 60,
  
  // Fuentes españolas
  'expansion': 85,
  'expansión': 85,
  'cinco dias': 85,
  'cinco días': 85,
  'el economista': 82,
  'eleconomista': 82,
  'la vanguardia': 80,
  'el pais': 82,
  'el país': 82,
  'el mundo': 78,
  'abc': 75,
  'infobolsa': 72,
  'bolsamania': 70,
  'estrategias de inversión': 72,
  'invertia': 70,
  
  // Fuentes internacionales adicionales
  'handelsblatt': 85, // Alemania
  'les echos': 85, // Francia
  'nikkei': 88, // Japón
  'south china morning post': 80, // Asia
  'scmp': 80,
  
  // Default para fuentes desconocidas
  'default': 50,
};

// ===== PATRONES DE PRECIO EN TITULARES =====
const PRICE_PATTERN = /(?:up|down|rises?|falls?|gains?|drops?|surges?|plunges?|sube|baja|cae|sube)\s*(\d+(?:\.\d+)?)\s*%/i;
const PRICE_TARGET_PATTERN = /price target.*?\$?(\d+(?:\.\d+)?)/i;

// ===== CACHE =====
const cache = new Map<string, { data: NewsSummary; expiresAt: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutos

function getCached(key: string): NewsSummary | null {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  cache.delete(key);
  return null;
}

// ===== FUNCIONES DE ANÁLISIS =====

function getSourceCredibility(publisher: string): number {
  const normalizedPublisher = publisher.toLowerCase();
  for (const [source, credibility] of Object.entries(SOURCE_CREDIBILITY)) {
    if (normalizedPublisher.includes(source)) {
      return credibility;
    }
  }
  return SOURCE_CREDIBILITY['default'];
}

/**
 * Detecta si el titular tiene tono de urgencia
 */
function detectUrgency(title: string): 'urgent' | 'normal' {
  const t = title.toLowerCase();
  return URGENCY_WORDS.some(word => t.includes(word)) ? 'urgent' : 'normal';
}

/**
 * Extrae porcentaje mencionado en el titular
 */
function extractPriceMove(title: string): number | undefined {
  const match = title.match(PRICE_PATTERN);
  if (match) {
    return parseFloat(match[1]);
  }
  return undefined;
}

/**
 * Detecta si hay amplificador antes de una palabra
 */
function hasAmplifier(title: string, keywordIndex: number): boolean {
  const beforeText = title.substring(Math.max(0, keywordIndex - 25), keywordIndex).toLowerCase();
  return AMPLIFIER_WORDS.some(amp => beforeText.includes(amp));
}

function detectNewsType(title: string): NewsType {
  const t = title.toLowerCase();
  
  // Earnings y resultados
  if (/earnings|revenue|profit|eps|quarter|q[1-4]|fiscal|results|resultados|beneficio|ingresos|trimestre/i.test(t)) return 'earnings';
  
  // Guidance
  if (/guidance|outlook|forecast|expect|previsiones|perspectivas/i.test(t)) return 'guidance';
  
  // Analistas
  if (/upgrade|downgrade|rating|price target|analyst|mejora recomendación|rebaja/i.test(t)) return 'analyst';
  
  // M&A
  if (/merger|acquisition|acquire|buyout|takeover|deal|fusión|adquisición|opa|compra de/i.test(t)) return 'merger_acquisition';
  
  // Productos
  if (/launch|product|release|patent|fda|approval|innovation|lanza|patente|aprobación/i.test(t)) return 'product';
  
  // Legal
  if (/lawsuit|sue|fine|penalty|investigation|sec|regulat|antitrust|demanda|multa|investigación|sanción/i.test(t)) return 'legal';
  
  // Management
  if (/ceo|cfo|executive|board|resign|appoint|hire|fire|dimite|nombra|destituye/i.test(t)) return 'management';
  
  // Macro
  if (/fed|rate|inflation|gdp|economy|recession|employment|inflación|pib|tipos|desempleo/i.test(t)) return 'macro';
  
  // Sector
  if (/industry|sector|market share|competitor|competencia|cuota de mercado/i.test(t)) return 'sector';
  
  // Dividendos
  if (/dividend|buyback|repurchase|split|dividendo|recompra|split/i.test(t)) return 'dividend';
  
  // Insiders
  if (/insider|director buys|ceo buys|executive purchase|compra de acciones por/i.test(t)) return 'insider';
  
  // Shorts
  if (/short|squeeze|bear|shorts|posiciones cortas/i.test(t)) return 'short';
  
  return 'general';
}

function detectImpactMagnitude(title: string, sentimentScore: number): 'high' | 'medium' | 'low' {
  const t = title.toLowerCase();
  
  // Palabras de alto impacto
  if (HIGH_IMPACT_KEYWORDS.some(kw => t.includes(kw))) {
    return 'high';
  }
  
  // Score extremo indica alto impacto
  if (Math.abs(sentimentScore) >= 30) {
    return 'high';
  }
  
  if (Math.abs(sentimentScore) >= 15) {
    return 'medium';
  }
  
  return 'low';
}

function hasNegationBefore(title: string, keywordIndex: number): boolean {
  // Buscar negaciones en las 3 palabras anteriores
  const beforeText = title.substring(Math.max(0, keywordIndex - 30), keywordIndex).toLowerCase();
  return NEGATION_WORDS.some(neg => beforeText.includes(neg));
}

function hasUncertainty(title: string): boolean {
  const t = title.toLowerCase();
  return UNCERTAINTY_WORDS.some(unc => t.includes(unc));
}

function analyzeSentiment(title: string): { score: number; confidence: number } {
  const t = title.toLowerCase();
  let score = 0;
  let matchCount = 0;
  let hasHighImpactMatch = false;
  
  // Buscar palabras positivas
  for (const [keyword, weight] of Object.entries(POSITIVE_KEYWORDS)) {
    const index = t.indexOf(keyword);
    if (index !== -1) {
      let adjustedWeight = weight;
      
      // Verificar negación
      if (hasNegationBefore(t, index)) {
        adjustedWeight = -adjustedWeight * 0.8;
      }
      
      // Verificar amplificador
      if (hasAmplifier(t, index)) {
        adjustedWeight = Math.round(adjustedWeight * 1.4);
      }
      
      // Track high impact
      if (Math.abs(weight) >= 30) {
        hasHighImpactMatch = true;
      }
      
      score += adjustedWeight;
      matchCount++;
    }
  }
  
  // Buscar palabras negativas
  for (const [keyword, weight] of Object.entries(NEGATIVE_KEYWORDS)) {
    const index = t.indexOf(keyword);
    if (index !== -1) {
      let adjustedWeight = weight;
      
      // Verificar negación
      if (hasNegationBefore(t, index)) {
        adjustedWeight = -adjustedWeight * 0.5;
      }
      
      // Verificar amplificador
      if (hasAmplifier(t, index)) {
        adjustedWeight = Math.round(adjustedWeight * 1.4);
      }
      
      // Track high impact
      if (Math.abs(weight) >= 30) {
        hasHighImpactMatch = true;
      }
      
      score += adjustedWeight;
      matchCount++;
    }
  }
  
  // Reducir score si hay incertidumbre
  if (hasUncertainty(t)) {
    score *= 0.6;
  }
  
  // Aumentar si es urgente
  if (detectUrgency(t) === 'urgent') {
    score = Math.round(score * 1.15);
  }
  
  // Limitar score
  score = Math.max(-100, Math.min(100, score));
  
  // Calcular confianza
  let confidence = 30;
  if (matchCount >= 4) confidence = 90;
  else if (matchCount >= 3) confidence = 80;
  else if (matchCount >= 2) confidence = 65;
  else if (matchCount >= 1) confidence = 50;
  
  // Aumentar confianza si hay match de alto impacto
  if (hasHighImpactMatch) {
    confidence = Math.min(95, confidence + 10);
  }
  
  // Reducir confianza si hay incertidumbre
  if (hasUncertainty(t)) {
    confidence = Math.round(confidence * 0.7);
  }
  
  return { score: Math.round(score), confidence: Math.round(confidence) };
}

// ===== SERVICIO EXPORTADO =====

export const newsService = {
  async getNews(symbol: string, type: 'stock' | 'crypto' = 'stock'): Promise<NewsSummary> {
    const cacheKey = `news:${symbol}:${type}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
      logger.info(`[News] Getting news for ${symbol}`);
      
      const searchTerm = this.getSearchTerm(symbol, type);
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(searchTerm)}&newsCount=15&quotesCount=0`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        signal: AbortSignal.timeout(10000),
      });
      
      if (!response.ok) {
        throw new Error(`Yahoo API error: ${response.status}`);
      }
      
      const data: any = await response.json();
      const newsItems = data.news || [];
      
      if (newsItems.length === 0) {
        return this.createEmptySummary();
      }
      
      const processedNews = newsItems.map((item: any) => this.processNewsItem(item));
      const summary = this.createSummary(processedNews);
      
      cache.set(cacheKey, { data: summary, expiresAt: Date.now() + CACHE_TTL });
      
      logger.info(`[News] ${summary.newsCount} news. Sentiment: ${summary.overallSentiment} (${summary.sentimentScore}, conf: ${summary.sentimentConfidence}%). High impact: ${summary.highImpactCount}`);
      
      return summary;
    } catch (error: any) {
      logger.error(`[News] Error getting news for ${symbol}:`, error.message);
      return this.createEmptySummary();
    }
  },

  getSearchTerm(symbol: string, type: 'stock' | 'crypto'): string {
    if (type === 'crypto') {
      const cryptoNames: Record<string, string> = {
        'BTC-EUR': 'Bitcoin', 'BTC-USD': 'Bitcoin',
        'ETH-EUR': 'Ethereum', 'ETH-USD': 'Ethereum',
        'SOL-EUR': 'Solana', 'SOL-USD': 'Solana',
        'XRP-EUR': 'Ripple XRP', 'ADA-EUR': 'Cardano',
        'DOGE-EUR': 'Dogecoin',
      };
      return cryptoNames[symbol] || symbol.split('-')[0];
    }
    return symbol;
  },

  processNewsItem(item: any): NewsItem {
    const title = item.title || '';
    const publisher = item.publisher || 'Unknown';
    const publishedAt = item.providerPublishTime
      ? new Date(item.providerPublishTime * 1000)
      : new Date();
    
    const { score, confidence } = analyzeSentiment(title);
    const sourceCredibility = getSourceCredibility(publisher);
    const newsType = detectNewsType(title);
    const impactMagnitude = detectImpactMagnitude(title, score);
    const urgencyLevel = detectUrgency(title);
    const priceMoveMentioned = extractPriceMove(title);
    
    let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
    if (score >= 12) sentiment = 'positive';
    else if (score <= -12) sentiment = 'negative';
    
    return {
      title,
      publisher,
      link: item.link || '',
      publishedAt,
      sentiment,
      sentimentScore: score,
      confidence,
      newsType,
      impactMagnitude,
      sourceCredibility,
      urgencyLevel,
      priceMoveMentioned,
    };
  },

  createSummary(items: NewsItem[]): NewsSummary {
    const positiveNews = items.filter(n => n.sentiment === 'positive');
    const negativeNews = items.filter(n => n.sentiment === 'negative');
    const neutralNews = items.filter(n => n.sentiment === 'neutral');
    const highImpactNews = items.filter(n => n.impactMagnitude === 'high');
    const urgentNews = items.filter(n => n.urgencyLevel === 'urgent');
    
    // Promedio ponderado por:
    // 1. Recencia (noticias más recientes pesan más)
    // 2. Credibilidad de la fuente
    // 3. Magnitud del impacto
    // 4. Confianza del análisis
    // 5. Urgencia
    let totalScore = 0;
    let totalWeight = 0;
    let totalConfidence = 0;
    const now = Date.now();
    
    for (const item of items) {
      // Factor de recencia: decae exponencialmente
      const ageHours = (now - item.publishedAt.getTime()) / (1000 * 60 * 60);
      const recencyWeight = Math.exp(-ageHours / 48); // Mitad de peso a las 48h
      
      // Factor de credibilidad (0.5 a 1.0)
      const credibilityWeight = 0.5 + (item.sourceCredibility / 200);
      
      // Factor de impacto
      const impactWeight = item.impactMagnitude === 'high' ? 1.5 :
                          item.impactMagnitude === 'medium' ? 1.0 : 0.6;
      
      // Factor de urgencia
      const urgencyWeight = item.urgencyLevel === 'urgent' ? 1.25 : 1.0;
      
      const weight = recencyWeight * credibilityWeight * impactWeight * urgencyWeight;
      
      totalScore += item.sentimentScore * weight;
      totalWeight += weight;
      totalConfidence += item.confidence * weight;
    }
    
    const avgScore = totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;
    const avgConfidence = totalWeight > 0 ? Math.round(totalConfidence / totalWeight) : 0;
    
    // Ajustar confianza por cantidad de noticias
    let finalConfidence = avgConfidence;
    if (items.length >= 5) finalConfidence = Math.min(95, finalConfidence + 15);
    else if (items.length >= 3) finalConfidence = Math.min(90, finalConfidence + 10);
    else if (items.length <= 1) finalConfidence = Math.max(20, finalConfidence - 20);
    
    // Aumentar confianza si hay noticias urgentes (son más fiables por ser recientes)
    if (urgentNews.length > 0) {
      finalConfidence = Math.min(95, finalConfidence + 5);
    }
    
    let overallSentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
    if (avgScore >= 12) overallSentiment = 'positive';
    else if (avgScore <= -12) overallSentiment = 'negative';
    
    // Breakdown por tipo
    const byType = this.calculateByType(items);
    
    // Generar señales
    const signals = this.generateSignals(items, avgScore, positiveNews.length, negativeNews.length, highImpactNews);
    
    const summary = this.generateSummaryText(
      positiveNews.length, negativeNews.length, 
      overallSentiment, avgScore, highImpactNews, signals
    );
    
    // Determinar calidad de datos
    const avgCredibility = items.length > 0 
      ? items.reduce((sum, i) => sum + i.sourceCredibility, 0) / items.length 
      : 0;
    const dataQuality: 'high' | 'medium' | 'low' = 
      items.length >= 5 && avgCredibility >= 75 ? 'high' :
      items.length >= 2 && avgCredibility >= 60 ? 'medium' : 'low';
    
    return {
      items,
      overallSentiment,
      sentimentScore: avgScore,
      sentimentConfidence: finalConfidence,
      hasNews: items.length > 0,
      newsCount: items.length,
      positiveCount: positiveNews.length,
      negativeCount: negativeNews.length,
      neutralCount: neutralNews.length,
      highImpactCount: highImpactNews.length,
      urgentCount: urgentNews.length,
      summary,
      byType,
      signals,
      dataQuality,
    };
  },

  calculateByType(items: NewsItem[]): Record<NewsType, { count: number; avgSentiment: number }> {
    const types: NewsType[] = ['earnings', 'guidance', 'analyst', 'merger_acquisition', 
                               'product', 'legal', 'management', 'macro', 'sector', 'dividend', 'insider', 'short', 'general'];
    
    const result: Record<NewsType, { count: number; avgSentiment: number }> = {} as any;
    
    for (const type of types) {
      const typeItems = items.filter(i => i.newsType === type);
      result[type] = {
        count: typeItems.length,
        avgSentiment: typeItems.length > 0 
          ? Math.round(typeItems.reduce((sum, i) => sum + i.sentimentScore, 0) / typeItems.length)
          : 0,
      };
    }
    
    return result;
  },

  generateSignals(
    items: NewsItem[], 
    avgScore: number,
    positiveCount: number,
    negativeCount: number,
    highImpactNews: NewsItem[]
  ): string[] {
    const signals: string[] = [];
    
    // Señales de alto impacto
    const highImpactNegative = highImpactNews.filter(n => n.sentiment === 'negative');
    const highImpactPositive = highImpactNews.filter(n => n.sentiment === 'positive');
    
    if (highImpactNegative.length >= 2) {
      signals.push(`⚠️ ${highImpactNegative.length} noticias negativas de alto impacto`);
    } else if (highImpactNegative.length === 1) {
      signals.push(`⚠️ Noticia negativa importante: ${highImpactNegative[0].title.substring(0, 50)}...`);
    }
    
    if (highImpactPositive.length >= 2) {
      signals.push(`✅ ${highImpactPositive.length} noticias positivas de alto impacto`);
    } else if (highImpactPositive.length === 1) {
      signals.push(`✅ Noticia positiva importante: ${highImpactPositive[0].title.substring(0, 50)}...`);
    }
    
    // Señales por tipo
    const earningsNews = items.filter(i => i.newsType === 'earnings');
    if (earningsNews.length > 0) {
      const earningsAvg = earningsNews.reduce((sum, i) => sum + i.sentimentScore, 0) / earningsNews.length;
      if (earningsAvg >= 20) {
        signals.push('📈 Resultados financieros positivos');
      } else if (earningsAvg <= -20) {
        signals.push('📉 Resultados financieros decepcionantes');
      }
    }
    
    const analystNews = items.filter(i => i.newsType === 'analyst');
    if (analystNews.length > 0) {
      const analystAvg = analystNews.reduce((sum, i) => sum + i.sentimentScore, 0) / analystNews.length;
      if (analystAvg >= 15) {
        signals.push('📊 Analistas optimistas');
      } else if (analystAvg <= -15) {
        signals.push('📊 Analistas pesimistas');
      }
    }
    
    const legalNews = items.filter(i => i.newsType === 'legal' && i.sentiment === 'negative');
    if (legalNews.length > 0) {
      signals.push('⚖️ Problemas legales/regulatorios detectados');
    }
    
    // Señal de consenso
    if (positiveCount >= 4 && negativeCount === 0) {
      signals.push('🟢 Consenso muy positivo en noticias');
    } else if (negativeCount >= 4 && positiveCount === 0) {
      signals.push('🔴 Consenso muy negativo en noticias');
    } else if (positiveCount >= 3 && negativeCount >= 3) {
      signals.push('⚡ Noticias mixtas - alta incertidumbre');
    }
    
    return signals;
  },

  generateSummaryText(
    positive: number, 
    negative: number, 
    sentiment: string, 
    score: number,
    highImpactNews: NewsItem[],
    signals: string[]
  ): string {
    if (positive === 0 && negative === 0) {
      return 'Noticias neutrales, sin impacto significativo esperado.';
    }
    
    let base = '';
    
    if (sentiment === 'positive') {
      if (score >= 30) {
        base = `Sentimiento muy positivo (${positive} noticias favorables). Score: +${score}.`;
      } else {
        base = `Sentimiento moderadamente positivo. ${positive} de ${positive + negative} noticias favorables.`;
      }
    } else if (sentiment === 'negative') {
      if (score <= -30) {
        base = `Sentimiento muy negativo (${negative} noticias desfavorables). Score: ${score}.`;
      } else {
        base = `Sentimiento moderadamente negativo. ${negative} de ${positive + negative} noticias desfavorables.`;
      }
    } else {
      base = `Sentimiento mixto: ${positive} positivas, ${negative} negativas.`;
    }
    
    // Añadir info de alto impacto si existe
    if (highImpactNews.length > 0) {
      base += ` ${highImpactNews.length} noticia(s) de alto impacto.`;
    }
    
    return base;
  },

  createEmptySummary(): NewsSummary {
    return {
      items: [],
      overallSentiment: 'neutral',
      sentimentScore: 0,
      sentimentConfidence: 0,
      hasNews: false,
      newsCount: 0,
      positiveCount: 0,
      negativeCount: 0,
      neutralCount: 0,
      highImpactCount: 0,
      urgentCount: 0,
      summary: 'No se encontraron noticias recientes.',
      byType: {
        earnings: { count: 0, avgSentiment: 0 },
        guidance: { count: 0, avgSentiment: 0 },
        analyst: { count: 0, avgSentiment: 0 },
        merger_acquisition: { count: 0, avgSentiment: 0 },
        product: { count: 0, avgSentiment: 0 },
        legal: { count: 0, avgSentiment: 0 },
        management: { count: 0, avgSentiment: 0 },
        macro: { count: 0, avgSentiment: 0 },
        sector: { count: 0, avgSentiment: 0 },
        dividend: { count: 0, avgSentiment: 0 },
        insider: { count: 0, avgSentiment: 0 },
        short: { count: 0, avgSentiment: 0 },
        general: { count: 0, avgSentiment: 0 },
      },
      signals: [],
      dataQuality: 'low',
    };
  },
};
