/**
 * Servicio de análisis de competidores
 * Compara el rendimiento de una empresa con sus competidores del sector
 * 
 * Lógica:
 * - Si a los competidores les va mal → puede arrastrar a la empresa
 * - Si la empresa destaca vs competidores → señal positiva
 * - Si los competidores suben → puede indicar sector fuerte
 * 
 * MEJORADO v1.2:
 * - Comparación de ratios P/E
 * - Market Cap comparativo
 * - Más empresas mapeadas
 * 
 * MEJORADO v1.3:
 * - Detección DINÁMICA de competidores usando Yahoo Finance
 * - Auto-descubre empresas del mismo sector/industria
 * - No requiere mapeos manuales para nuevas empresas
 * 
 * MEJORADO v1.4 (Cobertura ~85%):
 * - Market Share Analysis: Cuota de mercado estimada por revenue
 * - Profitability Analysis: Profit Margin y ROE vs sector
 * - Growth Analysis: Revenue Growth comparativo
 * - Relative Strength: Fuerza relativa y momentum vs sector
 * - 9 métricas por competidor: Revenue, Margins, ROE/ROA, Debt/Equity, Beta
 */

import { fetchWithCorsProxy } from './cors-proxy';

// Interfaz para el resultado del perfil de Yahoo
interface YahooAssetProfile {
  sector: string;
  industry: string;
  fullTimeEmployees?: number;
  country?: string;
}

// Caché para perfiles de empresas
interface ProfileCache {
  profile: YahooAssetProfile;
  timestamp: number;
}
const profileCache = new Map<string, ProfileCache>();
const PROFILE_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 horas (perfiles cambian poco)

// Mapeo industria → símbolos principales (para detectar peers dinámicamente)
const INDUSTRY_MAJOR_PLAYERS: Record<string, string[]> = {
  // Tecnología
  'Software—Infrastructure': ['MSFT', 'ORCL', 'IBM', 'CSCO', 'VMW'],
  'Software—Application': ['CRM', 'ADBE', 'NOW', 'INTU', 'WDAY'],
  'Consumer Electronics': ['AAPL', 'SONY', '005930.KS', '1810.HK'],
  'Semiconductors': ['NVDA', 'AMD', 'INTC', 'TSM', 'AVGO', 'QCOM'],
  'Internet Content & Information': ['GOOGL', 'META', 'SNAP', 'PINS', 'TWTR'],
  'Internet Retail': ['AMZN', 'BABA', 'JD', 'EBAY', 'ETSY'],
  
  // Finanzas
  'Banks—Diversified': ['JPM', 'BAC', 'C', 'WFC', 'USB'],
  'Banks—Regional': ['PNC', 'TFC', 'FITB', 'KEY', 'RF'],
  'Credit Services': ['V', 'MA', 'AXP', 'DFS', 'COF'],
  'Insurance—Diversified': ['BRK-B', 'MET', 'PRU', 'AIG', 'ALL'],
  'Asset Management': ['BLK', 'BX', 'KKR', 'APO', 'TROW'],
  
  // Salud
  'Drug Manufacturers—General': ['JNJ', 'PFE', 'MRK', 'ABBV', 'LLY'],
  'Drug Manufacturers—Specialty & Generic': ['TEVA', 'MYL', 'VTRS', 'ZTS'],
  'Biotechnology': ['AMGN', 'GILD', 'BIIB', 'REGN', 'VRTX'],
  'Medical Devices': ['MDT', 'ABT', 'SYK', 'BSX', 'ISRG'],
  
  // Consumo
  'Restaurants': ['MCD', 'SBUX', 'YUM', 'CMG', 'DRI'],
  'Apparel Manufacturing': ['NKE', 'LULU', 'VFC', 'PVH', 'RL'],
  'Apparel Retail': ['TJX', 'ROST', 'GPS', 'ANF'],
  'Discount Stores': ['WMT', 'COST', 'TGT', 'DG', 'DLTR'],
  'Grocery Stores': ['KR', 'WMT', 'COST', 'SFM'],
  'Beverages—Non-Alcoholic': ['KO', 'PEP', 'MNST', 'CELH'],
  'Household & Personal Products': ['PG', 'CL', 'KMB', 'CHD'],
  
  // Energía
  'Oil & Gas Integrated': ['XOM', 'CVX', 'SHEL', 'BP', 'TTE'],
  'Oil & Gas E&P': ['COP', 'EOG', 'PXD', 'DVN', 'OXY'],
  'Oil & Gas Refining & Marketing': ['VLO', 'MPC', 'PSX'],
  'Utilities—Regulated Electric': ['NEE', 'DUK', 'SO', 'D', 'AEP'],
  'Utilities—Renewable': ['ENPH', 'SEDG', 'RUN', 'FSLR'],
  
  // Industrial
  'Aerospace & Defense': ['BA', 'LMT', 'RTX', 'NOC', 'GD'],
  'Industrial Conglomerates': ['GE', 'MMM', 'HON', 'EMR'],
  'Farm & Heavy Construction Machinery': ['DE', 'CAT', 'AGCO', 'CNHI'],
  'Auto Manufacturers': ['TSLA', 'F', 'GM', 'TM', 'HMC'],
  'Auto Parts': ['APTV', 'BWA', 'ALV', 'LEA'],
  
  // Telecomunicaciones
  'Telecom Services': ['T', 'VZ', 'TMUS', 'VOD.L', 'ORAN.PA'],
  
  // Retail Europeo / Moda
  'Specialty Retail': ['ITX.MC', 'HM-B.ST', 'LULU', 'GPS'],
  'Luxury Goods': ['MC.PA', 'KER.PA', 'RMS.PA', 'RL', 'CPRI'],
  
  // Minería
  'Gold': ['NEM', 'GOLD', 'FNV', 'AEM', 'WPM'],
  'Other Precious Metals & Mining': ['FCX', 'SCCO', 'VALE', 'BHP'],
};

// ETFs sectoriales como fallback
const SECTOR_ETFS: Record<string, { symbol: string; name: string }> = {
  'Technology': { symbol: 'XLK', name: 'Tech Select ETF' },
  'Financial Services': { symbol: 'XLF', name: 'Financials ETF' },
  'Healthcare': { symbol: 'XLV', name: 'Health Care ETF' },
  'Consumer Cyclical': { symbol: 'XLY', name: 'Consumer Discretionary ETF' },
  'Consumer Defensive': { symbol: 'XLP', name: 'Consumer Staples ETF' },
  'Energy': { symbol: 'XLE', name: 'Energy ETF' },
  'Industrials': { symbol: 'XLI', name: 'Industrials ETF' },
  'Communication Services': { symbol: 'XLC', name: 'Communication Services ETF' },
  'Basic Materials': { symbol: 'XLB', name: 'Materials ETF' },
  'Real Estate': { symbol: 'XLRE', name: 'Real Estate ETF' },
  'Utilities': { symbol: 'XLU', name: 'Utilities ETF' },
};

export interface CompetitorData {
  symbol: string;
  name: string;
  currentPrice: number;
  change1d: number; // Cambio % 1 día
  change1w: number; // Cambio % 1 semana
  change1m: number; // Cambio % 1 mes
  trend: 'up' | 'down' | 'neutral';
  // Fundamentales para comparación
  peRatio?: number;
  marketCap?: number;
  forwardPE?: number;
  // NUEVO v1.4: Métricas avanzadas
  revenue?: number;           // Ingresos totales (TTM)
  revenueGrowth?: number;     // Crecimiento de ingresos YoY %
  profitMargin?: number;      // Margen de beneficio neto %
  grossMargin?: number;       // Margen bruto %
  operatingMargin?: number;   // Margen operativo %
  roe?: number;               // Return on Equity %
  roa?: number;               // Return on Assets %
  debtToEquity?: number;      // Ratio deuda/equity
  beta?: number;              // Beta (volatilidad vs mercado)
}

export interface CompetitorAnalysis {
  sector: string;
  sectorName: string;
  
  // Rendimiento de los competidores
  competitors: CompetitorData[];
  
  // Métricas agregadas del sector
  sectorAvgChange1d: number;
  sectorAvgChange1w: number;
  sectorAvgChange1m: number;
  sectorTrend: 'bullish' | 'bearish' | 'neutral';
  
  // Comparación de la empresa vs sector
  companyVsSector1d: number; // Diferencia % vs promedio sector
  companyVsSector1w: number;
  companyVsSector1m: number;
  outperforming: boolean; // ¿La empresa supera al sector?
  
  // Análisis de valoración
  valuationAnalysis?: {
    companyPE: number;
    sectorAvgPE: number;
    peVsSector: number; // % diferencia (negativo = más barato)
    isUndervalued: boolean;
    companyMarketCap: number;
    sectorAvgMarketCap: number;
    marketCapRank: number; // Posición por tamaño (1 = mayor)
  };
  
  // NUEVO v1.4: Análisis de cuota de mercado y rentabilidad
  marketShareAnalysis?: {
    companyRevenue: number;
    sectorTotalRevenue: number;
    estimatedMarketShare: number;     // % del total de ingresos del sector
    marketShareRank: number;          // Posición por ingresos (1 = mayor)
    revenueVsSectorAvg: number;       // % diferencia vs promedio
  };
  
  profitabilityAnalysis?: {
    companyProfitMargin: number;
    sectorAvgProfitMargin: number;
    marginVsSector: number;           // Diferencia en puntos %
    isMoreProfitable: boolean;
    companyROE: number;
    sectorAvgROE: number;
    roeVsSector: number;
  };
  
  growthAnalysis?: {
    companyRevenueGrowth: number;
    sectorAvgRevenueGrowth: number;
    growthVsSector: number;           // Diferencia en puntos %
    isGrowingFaster: boolean;
  };
  
  relativeStrength?: {
    rs1w: number;                     // Fuerza relativa 1 semana vs sector
    rs1m: number;                     // Fuerza relativa 1 mes vs sector
    rsRating: 'strong' | 'average' | 'weak';
    momentum: 'accelerating' | 'decelerating' | 'stable';
  };
  
  // Score final (-100 a +100)
  competitorScore: number;
  hasData: boolean;
  summary: string;
}

// Mapeo de empresas a sus competidores directos
// Máximo 2-3 competidores por empresa
const COMPANY_COMPETITORS: Record<string, { sector: string; sectorName: string; competitors: Array<{ symbol: string; name: string }> }> = {
  // Retail / Textil
  'ITX.MC': {
    sector: 'retail_fashion',
    sectorName: 'Moda y Textil',
    competitors: [
      { symbol: 'HM-B.ST', name: 'H&M' },
      { symbol: 'GAP', name: 'Gap Inc' },
    ]
  },
  
  // Tecnología - Big Tech
  'AAPL': {
    sector: 'technology',
    sectorName: 'Tecnología',
    competitors: [
      { symbol: 'MSFT', name: 'Microsoft' },
      { symbol: 'GOOGL', name: 'Google' },
    ]
  },
  'MSFT': {
    sector: 'technology',
    sectorName: 'Tecnología',
    competitors: [
      { symbol: 'AAPL', name: 'Apple' },
      { symbol: 'GOOGL', name: 'Google' },
    ]
  },
  'GOOGL': {
    sector: 'technology',
    sectorName: 'Tecnología',
    competitors: [
      { symbol: 'META', name: 'Meta' },
      { symbol: 'MSFT', name: 'Microsoft' },
    ]
  },
  'META': {
    sector: 'technology',
    sectorName: 'Tecnología',
    competitors: [
      { symbol: 'GOOGL', name: 'Google' },
      { symbol: 'SNAP', name: 'Snap Inc' },
    ]
  },
  'TSLA': {
    sector: 'automotive_ev',
    sectorName: 'Vehículos Eléctricos',
    competitors: [
      { symbol: 'RIVN', name: 'Rivian' },
      { symbol: 'F', name: 'Ford' },
    ]
  },
  'AMZN': {
    sector: 'ecommerce',
    sectorName: 'E-commerce',
    competitors: [
      { symbol: 'WMT', name: 'Walmart' },
      { symbol: 'EBAY', name: 'eBay' },
    ]
  },
  'NVDA': {
    sector: 'semiconductors',
    sectorName: 'Semiconductores',
    competitors: [
      { symbol: 'AMD', name: 'AMD' },
      { symbol: 'INTC', name: 'Intel' },
    ]
  },
  
  // Banca España
  'SAN.MC': {
    sector: 'banking_eu',
    sectorName: 'Banca Europea',
    competitors: [
      { symbol: 'BBVA.MC', name: 'BBVA' },
      { symbol: 'BNP.PA', name: 'BNP Paribas' },
    ]
  },
  'BBVA.MC': {
    sector: 'banking_eu',
    sectorName: 'Banca Europea',
    competitors: [
      { symbol: 'SAN.MC', name: 'Santander' },
      { symbol: 'BNP.PA', name: 'BNP Paribas' },
    ]
  },
  
  // Banca USA
  'JPM': {
    sector: 'banking_us',
    sectorName: 'Banca USA',
    competitors: [
      { symbol: 'BAC', name: 'Bank of America' },
      { symbol: 'GS', name: 'Goldman Sachs' },
    ]
  },
  'BAC': {
    sector: 'banking_us',
    sectorName: 'Banca USA',
    competitors: [
      { symbol: 'JPM', name: 'JPMorgan' },
      { symbol: 'WFC', name: 'Wells Fargo' },
    ]
  },
  'GS': {
    sector: 'banking_us',
    sectorName: 'Banca de Inversión',
    competitors: [
      { symbol: 'MS', name: 'Morgan Stanley' },
      { symbol: 'JPM', name: 'JPMorgan' },
    ]
  },
  'MS': {
    sector: 'banking_us',
    sectorName: 'Banca de Inversión',
    competitors: [
      { symbol: 'GS', name: 'Goldman Sachs' },
      { symbol: 'JPM', name: 'JPMorgan' },
    ]
  },
  
  // Pagos digitales
  'V': {
    sector: 'payments',
    sectorName: 'Pagos Digitales',
    competitors: [
      { symbol: 'MA', name: 'Mastercard' },
      { symbol: 'PYPL', name: 'PayPal' },
    ]
  },
  'MA': {
    sector: 'payments',
    sectorName: 'Pagos Digitales',
    competitors: [
      { symbol: 'V', name: 'Visa' },
      { symbol: 'PYPL', name: 'PayPal' },
    ]
  },
  'PYPL': {
    sector: 'payments',
    sectorName: 'Pagos Digitales',
    competitors: [
      { symbol: 'SQ', name: 'Block (Square)' },
      { symbol: 'V', name: 'Visa' },
    ]
  },
  
  // Semiconductores (ampliado)
  'AMD': {
    sector: 'semiconductors',
    sectorName: 'Semiconductores',
    competitors: [
      { symbol: 'NVDA', name: 'NVIDIA' },
      { symbol: 'INTC', name: 'Intel' },
    ]
  },
  'INTC': {
    sector: 'semiconductors',
    sectorName: 'Semiconductores',
    competitors: [
      { symbol: 'AMD', name: 'AMD' },
      { symbol: 'NVDA', name: 'NVIDIA' },
    ]
  },
  'TSM': {
    sector: 'semiconductors',
    sectorName: 'Fabricación de Chips',
    competitors: [
      { symbol: 'INTC', name: 'Intel' },
      { symbol: 'ASML', name: 'ASML' },
    ]
  },
  'ASML': {
    sector: 'semiconductors',
    sectorName: 'Equipos de Semiconductores',
    competitors: [
      { symbol: 'LRCX', name: 'Lam Research' },
      { symbol: 'AMAT', name: 'Applied Materials' },
    ]
  },
  
  // Healthcare / Pharma
  'JNJ': {
    sector: 'healthcare',
    sectorName: 'Salud Diversificada',
    competitors: [
      { symbol: 'PFE', name: 'Pfizer' },
      { symbol: 'UNH', name: 'UnitedHealth' },
    ]
  },
  'PFE': {
    sector: 'pharma',
    sectorName: 'Farmacéuticas',
    competitors: [
      { symbol: 'MRK', name: 'Merck' },
      { symbol: 'LLY', name: 'Eli Lilly' },
    ]
  },
  'LLY': {
    sector: 'pharma',
    sectorName: 'Farmacéuticas',
    competitors: [
      { symbol: 'NVO', name: 'Novo Nordisk' },
      { symbol: 'PFE', name: 'Pfizer' },
    ]
  },
  'UNH': {
    sector: 'health_insurance',
    sectorName: 'Seguros de Salud',
    competitors: [
      { symbol: 'CVS', name: 'CVS Health' },
      { symbol: 'CI', name: 'Cigna' },
    ]
  },
  
  // Consumer Goods
  'PG': {
    sector: 'consumer_goods',
    sectorName: 'Bienes de Consumo',
    competitors: [
      { symbol: 'KO', name: 'Coca-Cola' },
      { symbol: 'PEP', name: 'PepsiCo' },
    ]
  },
  'KO': {
    sector: 'beverages',
    sectorName: 'Bebidas',
    competitors: [
      { symbol: 'PEP', name: 'PepsiCo' },
      { symbol: 'KDP', name: 'Keurig Dr Pepper' },
    ]
  },
  'PEP': {
    sector: 'beverages',
    sectorName: 'Bebidas y Snacks',
    competitors: [
      { symbol: 'KO', name: 'Coca-Cola' },
      { symbol: 'MDLZ', name: 'Mondelez' },
    ]
  },
  'MCD': {
    sector: 'restaurants',
    sectorName: 'Restaurantes',
    competitors: [
      { symbol: 'SBUX', name: 'Starbucks' },
      { symbol: 'YUM', name: 'Yum! Brands' },
    ]
  },
  'NKE': {
    sector: 'apparel',
    sectorName: 'Ropa Deportiva',
    competitors: [
      { symbol: 'ADDYY', name: 'Adidas' },
      { symbol: 'LULU', name: 'Lululemon' },
    ]
  },
  'WMT': {
    sector: 'retail',
    sectorName: 'Retail',
    competitors: [
      { symbol: 'TGT', name: 'Target' },
      { symbol: 'COST', name: 'Costco' },
    ]
  },
  'COST': {
    sector: 'retail',
    sectorName: 'Retail',
    competitors: [
      { symbol: 'WMT', name: 'Walmart' },
      { symbol: 'TGT', name: 'Target' },
    ]
  },
  'HD': {
    sector: 'home_improvement',
    sectorName: 'Mejoras del Hogar',
    competitors: [
      { symbol: 'LOW', name: 'Lowe\'s' },
      { symbol: 'WMT', name: 'Walmart' },
    ]
  },
  
  // Streaming / Entertainment
  'NFLX': {
    sector: 'streaming',
    sectorName: 'Streaming',
    competitors: [
      { symbol: 'DIS', name: 'Disney' },
      { symbol: 'WBD', name: 'Warner Bros Discovery' },
    ]
  },
  'DIS': {
    sector: 'entertainment',
    sectorName: 'Entretenimiento',
    competitors: [
      { symbol: 'NFLX', name: 'Netflix' },
      { symbol: 'CMCSA', name: 'Comcast' },
    ]
  },
  
  // Cloud / Software
  'CRM': {
    sector: 'software',
    sectorName: 'Software Empresarial',
    competitors: [
      { symbol: 'NOW', name: 'ServiceNow' },
      { symbol: 'ORCL', name: 'Oracle' },
    ]
  },
  'ADBE': {
    sector: 'software',
    sectorName: 'Software Creativo',
    competitors: [
      { symbol: 'CRM', name: 'Salesforce' },
      { symbol: 'MSFT', name: 'Microsoft' },
    ]
  },
  'ORCL': {
    sector: 'software',
    sectorName: 'Software/Cloud',
    competitors: [
      { symbol: 'MSFT', name: 'Microsoft' },
      { symbol: 'IBM', name: 'IBM' },
    ]
  },
  
  // Aeroespacio
  'BA': {
    sector: 'aerospace',
    sectorName: 'Aeroespacial',
    competitors: [
      { symbol: 'LMT', name: 'Lockheed Martin' },
      { symbol: 'RTX', name: 'RTX (Raytheon)' },
    ]
  },
  
  // Autos tradicionales
  'F': {
    sector: 'automotive',
    sectorName: 'Automoción',
    competitors: [
      { symbol: 'GM', name: 'General Motors' },
      { symbol: 'TSLA', name: 'Tesla' },
    ]
  },
  'GM': {
    sector: 'automotive',
    sectorName: 'Automoción',
    competitors: [
      { symbol: 'F', name: 'Ford' },
      { symbol: 'TSLA', name: 'Tesla' },
    ]
  },
  
  // Europeas adicionales
  'MC.PA': {
    sector: 'luxury',
    sectorName: 'Lujo',
    competitors: [
      { symbol: 'KER.PA', name: 'Kering' },
      { symbol: 'RMS.PA', name: 'Hermès' },
    ]
  },
  'OR.PA': {
    sector: 'cosmetics',
    sectorName: 'Cosmética',
    competitors: [
      { symbol: 'EL', name: 'Estée Lauder' },
      { symbol: 'COTY', name: 'Coty' },
    ]
  },
  'SAP.DE': {
    sector: 'software',
    sectorName: 'Software Empresarial',
    competitors: [
      { symbol: 'ORCL', name: 'Oracle' },
      { symbol: 'CRM', name: 'Salesforce' },
    ]
  },
  'SIE.DE': {
    sector: 'industrial',
    sectorName: 'Industrial',
    competitors: [
      { symbol: 'GE', name: 'General Electric' },
      { symbol: 'HON', name: 'Honeywell' },
    ]
  },
  
  // Mineras de oro
  'NEM': {
    sector: 'gold_miners',
    sectorName: 'Mineras de Oro',
    competitors: [
      { symbol: 'GOLD', name: 'Barrick Gold' },
      { symbol: 'FNV', name: 'Franco-Nevada' },
    ]
  },
  'GOLD': {
    sector: 'gold_miners',
    sectorName: 'Mineras de Oro',
    competitors: [
      { symbol: 'NEM', name: 'Newmont' },
      { symbol: 'AEM', name: 'Agnico Eagle' },
    ]
  },
  
  // Energía
  'REP.MC': {
    sector: 'energy_oil',
    sectorName: 'Petróleo y Gas',
    competitors: [
      { symbol: 'XOM', name: 'ExxonMobil' },
      { symbol: 'TTE.PA', name: 'TotalEnergies' },
    ]
  },
  'XOM': {
    sector: 'energy_oil',
    sectorName: 'Petróleo y Gas',
    competitors: [
      { symbol: 'CVX', name: 'Chevron' },
      { symbol: 'COP', name: 'ConocoPhillips' },
    ]
  },
  'CVX': {
    sector: 'energy_oil',
    sectorName: 'Petróleo y Gas',
    competitors: [
      { symbol: 'XOM', name: 'ExxonMobil' },
      { symbol: 'COP', name: 'ConocoPhillips' },
    ]
  },
  'IBE.MC': {
    sector: 'energy_utilities',
    sectorName: 'Utilities',
    competitors: [
      { symbol: 'ELE.MC', name: 'Endesa' },
      { symbol: 'EDP.LS', name: 'EDP' },
    ]
  },
  
  // Telecomunicaciones
  'TEF.MC': {
    sector: 'telecom',
    sectorName: 'Telecomunicaciones',
    competitors: [
      { symbol: 'VOD.L', name: 'Vodafone' },
      { symbol: 'ORAN.PA', name: 'Orange' },
    ]
  },
  
  // Crypto
  'BTC-USD': {
    sector: 'crypto',
    sectorName: 'Criptomonedas',
    competitors: [
      { symbol: 'ETH-USD', name: 'Ethereum' },
      { symbol: 'SOL-USD', name: 'Solana' },
    ]
  },
  'ETH-USD': {
    sector: 'crypto',
    sectorName: 'Criptomonedas',
    competitors: [
      { symbol: 'BTC-USD', name: 'Bitcoin' },
      { symbol: 'SOL-USD', name: 'Solana' },
    ]
  },
  
  // Xiaomi
  '1810.HK': {
    sector: 'consumer_electronics',
    sectorName: 'Electrónica de Consumo',
    competitors: [
      { symbol: 'AAPL', name: 'Apple' },
      { symbol: '005930.KS', name: 'Samsung' },
    ]
  },
};

// Sectores genéricos para empresas no mapeadas
const GENERIC_SECTOR_COMPETITORS: Record<string, Array<{ symbol: string; name: string }>> = {
  'technology': [
    { symbol: 'QQQ', name: 'Nasdaq ETF' },
    { symbol: 'XLK', name: 'Tech Select ETF' },
  ],
  'banking': [
    { symbol: 'XLF', name: 'Financials ETF' },
  ],
  'energy': [
    { symbol: 'XLE', name: 'Energy ETF' },
  ],
  'default': [
    { symbol: '^GSPC', name: 'S&P 500' },
  ],
};

// Caché
interface CacheEntry {
  data: CompetitorData;
  timestamp: number;
}
const competitorCache = new Map<string, CacheEntry>();
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutos

// Caché para competidores dinámicos descubiertos
interface DynamicCompetitorCache {
  competitors: Array<{ symbol: string; name: string }>;
  sector: string;
  sectorName: string;
  timestamp: number;
}
const dynamicCompetitorCache = new Map<string, DynamicCompetitorCache>();
const DYNAMIC_CACHE_DURATION = 60 * 60 * 1000; // 1 hora

class CompetitorsService {
  
  /**
   * NUEVO: Obtiene el perfil del activo (sector, industria) desde Yahoo Finance
   */
  private async getAssetProfile(symbol: string): Promise<YahooAssetProfile | null> {
    // Verificar caché
    const cached = profileCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < PROFILE_CACHE_DURATION) {
      console.log(`[Competitors] Profile cache hit: ${symbol}`);
      return cached.profile;
    }
    
    try {
      const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=assetProfile`;
      const response = await fetchWithCorsProxy(url, { signal: AbortSignal.timeout(10000) });
      const data = await response.json();
      
      const profile = data.quoteSummary?.result?.[0]?.assetProfile;
      if (!profile || !profile.sector || !profile.industry) {
        console.log(`[Competitors] No profile data for ${symbol}`);
        return null;
      }
      
      const assetProfile: YahooAssetProfile = {
        sector: profile.sector,
        industry: profile.industry,
        fullTimeEmployees: profile.fullTimeEmployees,
        country: profile.country,
      };
      
      // Guardar en caché
      profileCache.set(symbol, { profile: assetProfile, timestamp: Date.now() });
      
      console.log(`[Competitors] ${symbol} profile: ${assetProfile.sector} / ${assetProfile.industry}`);
      
      return assetProfile;
    } catch (error) {
      console.warn(`[Competitors] Error getting profile for ${symbol}:`, error);
      return null;
    }
  }
  
  /**
   * NUEVO: Descubre competidores dinámicamente basándose en sector/industria
   */
  private async discoverCompetitors(symbol: string): Promise<{ 
    sector: string; 
    sectorName: string; 
    competitors: Array<{ symbol: string; name: string }> 
  } | null> {
    // Verificar caché
    const cached = dynamicCompetitorCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < DYNAMIC_CACHE_DURATION) {
      console.log(`[Competitors] Dynamic cache hit: ${symbol}`);
      return cached;
    }
    
    // Obtener perfil del activo
    const profile = await this.getAssetProfile(symbol);
    if (!profile) {
      return null;
    }
    
    const { sector, industry } = profile;
    console.log(`[Competitors] Discovering peers for ${symbol}: ${sector} / ${industry}`);
    
    // 1. Buscar por industria específica primero
    let peerSymbols = INDUSTRY_MAJOR_PLAYERS[industry];
    
    // 2. Si no hay industria exacta, buscar industria similar
    if (!peerSymbols) {
      for (const [ind, symbols] of Object.entries(INDUSTRY_MAJOR_PLAYERS)) {
        if (industry.toLowerCase().includes(ind.split('—')[0].toLowerCase()) ||
            ind.toLowerCase().includes(industry.split(' ')[0].toLowerCase())) {
          peerSymbols = symbols;
          console.log(`[Competitors] Matched industry ${ind} for ${industry}`);
          break;
        }
      }
    }
    
    // 3. Fallback: usar ETF del sector
    if (!peerSymbols || peerSymbols.length === 0) {
      const sectorETF = SECTOR_ETFS[sector];
      if (sectorETF) {
        console.log(`[Competitors] Using sector ETF as fallback: ${sectorETF.symbol}`);
        const result = {
          sector: sector.toLowerCase().replace(/\s+/g, '_'),
          sectorName: sector,
          competitors: [sectorETF],
          timestamp: Date.now(),
        };
        dynamicCompetitorCache.set(symbol, result);
        return result;
      }
    }
    
    if (!peerSymbols || peerSymbols.length === 0) {
      console.log(`[Competitors] No peers found for ${symbol}`);
      return null;
    }
    
    // Filtrar el propio símbolo y limitar a 3 competidores
    const filteredPeers = peerSymbols
      .filter(s => s.toUpperCase() !== symbol.toUpperCase())
      .slice(0, 3);
    
    // Obtener nombres de las empresas
    const peersWithNames = await this.getPeerNames(filteredPeers);
    
    const result = {
      sector: sector.toLowerCase().replace(/\s+/g, '_'),
      sectorName: industry,
      competitors: peersWithNames,
      timestamp: Date.now(),
    };
    
    // Guardar en caché
    dynamicCompetitorCache.set(symbol, result);
    
    console.log(`[Competitors] Discovered ${peersWithNames.length} peers for ${symbol}:`, peersWithNames.map(p => p.symbol));
    
    return result;
  }
  
  /**
   * NUEVO: Obtiene nombres de empresas desde Yahoo
   */
  private async getPeerNames(symbols: string[]): Promise<Array<{ symbol: string; name: string }>> {
    const results: Array<{ symbol: string; name: string }> = [];
    
    for (const symbol of symbols) {
      try {
        const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=price`;
        const response = await fetchWithCorsProxy(url, { signal: AbortSignal.timeout(5000) });
        const data = await response.json();
        
        const price = data.quoteSummary?.result?.[0]?.price;
        const name = price?.shortName || price?.longName || symbol;
        
        results.push({ symbol, name });
      } catch {
        // Si falla, usar el símbolo como nombre
        results.push({ symbol, name: symbol });
      }
    }
    
    return results;
  }
  
  /**
   * Obtiene datos de un competidor
   */
  private async getCompetitorData(symbol: string, name: string): Promise<CompetitorData | null> {
    // Verificar caché
    const cached = competitorCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`[Competitors] Cache hit: ${symbol}`);
      return cached.data;
    }
    
    try {
      // Obtener datos del último mes
      const endDate = Math.floor(Date.now() / 1000);
      const startDate = endDate - (35 * 24 * 60 * 60); // 35 días para tener margen
      
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${startDate}&period2=${endDate}&interval=1d`;
      
      const response = await fetchWithCorsProxy(url);
      const data = await response.json();
      
      if (!data.chart?.result?.[0]) {
        console.warn(`[Competitors] Sin datos para ${symbol}`);
        return null;
      }
      
      const result = data.chart.result[0];
      const quotes = result.indicators?.quote?.[0];
      const closes = quotes?.close?.filter((c: number | null) => c !== null) || [];
      
      if (closes.length < 5) {
        console.warn(`[Competitors] Datos insuficientes para ${symbol}`);
        return null;
      }
      
      const currentPrice = closes[closes.length - 1];
      const previousClose = closes[closes.length - 2] || currentPrice;
      const weekAgoPrice = closes[Math.max(0, closes.length - 6)] || currentPrice;
      const monthAgoPrice = closes[0] || currentPrice;
      
      const change1d = ((currentPrice - previousClose) / previousClose) * 100;
      const change1w = ((currentPrice - weekAgoPrice) / weekAgoPrice) * 100;
      const change1m = ((currentPrice - monthAgoPrice) / monthAgoPrice) * 100;
      
      // Determinar tendencia
      let trend: 'up' | 'down' | 'neutral' = 'neutral';
      if (change1w > 1 && change1m > 2) trend = 'up';
      else if (change1w < -1 && change1m < -2) trend = 'down';
      
      // Obtener P/E ratio, market cap y métricas avanzadas
      let peRatio: number | undefined;
      let marketCap: number | undefined;
      let forwardPE: number | undefined;
      // Métricas avanzadas v1.4
      let revenue: number | undefined;
      let revenueGrowth: number | undefined;
      let profitMargin: number | undefined;
      let grossMargin: number | undefined;
      let operatingMargin: number | undefined;
      let roe: number | undefined;
      let roa: number | undefined;
      let debtToEquity: number | undefined;
      let beta: number | undefined;
      
      try {
        const summaryUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=summaryDetail,defaultKeyStatistics,price,financialData`;
        const summaryResponse = await fetchWithCorsProxy(summaryUrl);
        const summaryData = await summaryResponse.json();
        
        const summaryResult = summaryData.quoteSummary?.result?.[0];
        if (summaryResult) {
          // P/E Ratio (trailing)
          const trailingPE = summaryResult.summaryDetail?.trailingPE?.raw;
          if (trailingPE && trailingPE > 0 && trailingPE < 1000) {
            peRatio = trailingPE;
          }
          
          // Forward P/E
          const fwdPE = summaryResult.summaryDetail?.forwardPE?.raw;
          if (fwdPE && fwdPE > 0 && fwdPE < 1000) {
            forwardPE = fwdPE;
          }
          
          // Market Cap
          const mktCap = summaryResult.price?.marketCap?.raw;
          if (mktCap && mktCap > 0) {
            marketCap = mktCap;
          }
          
          // Beta
          const betaVal = summaryResult.defaultKeyStatistics?.beta?.raw;
          if (betaVal && betaVal > 0) {
            beta = betaVal;
          }
          
          // NUEVAS MÉTRICAS de financialData
          const financialData = summaryResult.financialData;
          if (financialData) {
            // Revenue (Total Revenue)
            const totalRevenue = financialData.totalRevenue?.raw;
            if (totalRevenue && totalRevenue > 0) {
              revenue = totalRevenue;
            }
            
            // Revenue Growth
            const revGrowth = financialData.revenueGrowth?.raw;
            if (revGrowth !== undefined) {
              revenueGrowth = revGrowth * 100; // Convertir a %
            }
            
            // Profit Margins
            const profitMarg = financialData.profitMargins?.raw;
            if (profitMarg !== undefined) {
              profitMargin = profitMarg * 100;
            }
            
            const grossMarg = financialData.grossMargins?.raw;
            if (grossMarg !== undefined) {
              grossMargin = grossMarg * 100;
            }
            
            const opMarg = financialData.operatingMargins?.raw;
            if (opMarg !== undefined) {
              operatingMargin = opMarg * 100;
            }
            
            // ROE y ROA
            const returnOnEquity = financialData.returnOnEquity?.raw;
            if (returnOnEquity !== undefined) {
              roe = returnOnEquity * 100;
            }
            
            const returnOnAssets = financialData.returnOnAssets?.raw;
            if (returnOnAssets !== undefined) {
              roa = returnOnAssets * 100;
            }
            
            // Debt to Equity
            const debtEquity = financialData.debtToEquity?.raw;
            if (debtEquity !== undefined) {
              debtToEquity = debtEquity;
            }
          }
        }
      } catch (valuationError) {
        console.warn(`[Competitors] No se pudo obtener valoración para ${symbol}`);
      }
      
      const competitorData: CompetitorData = {
        symbol,
        name,
        currentPrice,
        change1d,
        change1w,
        change1m,
        trend,
        peRatio,
        marketCap,
        forwardPE,
        // Métricas avanzadas
        revenue,
        revenueGrowth,
        profitMargin,
        grossMargin,
        operatingMargin,
        roe,
        roa,
        debtToEquity,
        beta,
      };
      
      // Guardar en caché
      competitorCache.set(symbol, { data: competitorData, timestamp: Date.now() });
      
      console.log(`[Competitors] ${symbol}: 1d=${change1d.toFixed(2)}%, 1w=${change1w.toFixed(2)}%, 1m=${change1m.toFixed(2)}%, P/E=${peRatio?.toFixed(1) || 'N/A'}`);
      
      return competitorData;
      
    } catch (error) {
      console.error(`[Competitors] Error obteniendo datos de ${symbol}:`, error);
      return null;
    }
  }
  
  /**
   * Analiza competidores para un símbolo
   * v1.4: Añade market share, profitability, growth y relative strength
   */
  async analyzeCompetitors(
    symbol: string,
    companyChange1d: number,
    companyChange1w: number,
    companyChange1m: number,
    companyPE?: number,
    companyMarketCap?: number,
    // NUEVO v1.4: métricas adicionales de la empresa
    companyRevenue?: number,
    companyRevenueGrowth?: number,
    companyProfitMargin?: number,
    companyROE?: number
  ): Promise<CompetitorAnalysis> {
    console.log(`[Competitors] Analizando competidores para ${symbol}`);
    
    // 1. Primero buscar en mapeo manual (más preciso)
    let competitorConfig = COMPANY_COMPETITORS[symbol];
    let isDynamic = false;
    
    // 2. Si no hay mapeo, intentar descubrir competidores dinámicamente
    if (!competitorConfig) {
      console.log(`[Competitors] No hay mapeo manual, intentando descubrimiento dinámico...`);
      const discovered = await this.discoverCompetitors(symbol);
      
      if (discovered && discovered.competitors.length > 0) {
        competitorConfig = discovered;
        isDynamic = true;
        console.log(`[Competitors] ✓ Descubiertos ${discovered.competitors.length} competidores dinámicamente para ${symbol}`);
      }
    }
    
    if (!competitorConfig) {
      console.log(`[Competitors] Sin competidores mapeados ni dinámicos para ${symbol}`);
      return {
        sector: 'unknown',
        sectorName: 'Desconocido',
        competitors: [],
        sectorAvgChange1d: 0,
        sectorAvgChange1w: 0,
        sectorAvgChange1m: 0,
        sectorTrend: 'neutral',
        companyVsSector1d: 0,
        companyVsSector1w: 0,
        companyVsSector1m: 0,
        outperforming: false,
        competitorScore: 0,
        hasData: false,
        summary: 'Sin datos de competidores disponibles',
      };
    }
    
    console.log(`[Competitors] Usando ${isDynamic ? 'peers dinámicos' : 'mapeo manual'}: ${competitorConfig.competitors.map(c => c.symbol).join(', ')}`);
    
    // Obtener datos de cada competidor en paralelo
    const competitorPromises = competitorConfig.competitors.map(comp => 
      this.getCompetitorData(comp.symbol, comp.name)
    );
    
    const competitorResults = await Promise.all(competitorPromises);
    const validCompetitors = competitorResults.filter((c): c is CompetitorData => c !== null);
    
    if (validCompetitors.length === 0) {
      console.log(`[Competitors] No se pudieron obtener datos de competidores`);
      return {
        sector: competitorConfig.sector,
        sectorName: competitorConfig.sectorName,
        competitors: [],
        sectorAvgChange1d: 0,
        sectorAvgChange1w: 0,
        sectorAvgChange1m: 0,
        sectorTrend: 'neutral',
        companyVsSector1d: 0,
        companyVsSector1w: 0,
        companyVsSector1m: 0,
        outperforming: false,
        competitorScore: 0,
        hasData: false,
        summary: 'Error obteniendo datos de competidores',
      };
    }
    
    // Calcular promedios del sector (competidores)
    const sectorAvgChange1d = validCompetitors.reduce((sum, c) => sum + c.change1d, 0) / validCompetitors.length;
    const sectorAvgChange1w = validCompetitors.reduce((sum, c) => sum + c.change1w, 0) / validCompetitors.length;
    const sectorAvgChange1m = validCompetitors.reduce((sum, c) => sum + c.change1m, 0) / validCompetitors.length;
    
    // Tendencia del sector
    let sectorTrend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (sectorAvgChange1w > 1 && sectorAvgChange1m > 2) sectorTrend = 'bullish';
    else if (sectorAvgChange1w < -1 && sectorAvgChange1m < -2) sectorTrend = 'bearish';
    
    // Comparar empresa vs sector
    const companyVsSector1d = companyChange1d - sectorAvgChange1d;
    const companyVsSector1w = companyChange1w - sectorAvgChange1w;
    const companyVsSector1m = companyChange1m - sectorAvgChange1m;
    
    // ¿Supera al sector?
    const outperforming = companyVsSector1w > 0 && companyVsSector1m > 0;
    
    // Calcular score (-100 a +100)
    let competitorScore = 0;
    
    // 1. Efecto del sector (40% del score)
    // Si el sector está mal, puede arrastrar a la empresa
    // Si el sector está bien, puede beneficiar
    if (sectorTrend === 'bullish') {
      competitorScore += 20; // Sector fuerte = positivo
    } else if (sectorTrend === 'bearish') {
      competitorScore -= 20; // Sector débil = negativo
    }
    
    // Ajuste por magnitud del cambio del sector
    competitorScore += Math.max(-20, Math.min(20, sectorAvgChange1w * 2));
    
    // 2. Rendimiento relativo (60% del score)
    // Si la empresa supera a competidores = muy positivo
    if (outperforming) {
      competitorScore += 30;
      // Bonus adicional si supera significativamente
      if (companyVsSector1w > 3) competitorScore += 15;
    } else {
      // Si está por debajo del sector
      if (companyVsSector1w < -3) competitorScore -= 25;
      else if (companyVsSector1w < 0) competitorScore -= 10;
    }
    
    // Ajuste fino por rendimiento relativo semanal
    competitorScore += Math.max(-15, Math.min(15, companyVsSector1w * 2));
    
    // 3. Análisis de valoración P/E (bonus/penalización adicional)
    let valuationAnalysis: CompetitorAnalysis['valuationAnalysis'] = undefined;
    
    // Calcular P/E promedio del sector
    const competitorsWithPE = validCompetitors.filter(c => c.peRatio && c.peRatio > 0);
    if (competitorsWithPE.length > 0 && companyPE && companyPE > 0) {
      const sectorAvgPE = competitorsWithPE.reduce((sum, c) => sum + (c.peRatio || 0), 0) / competitorsWithPE.length;
      const peVsSector = companyPE - sectorAvgPE;
      const peRatio = companyPE / sectorAvgPE;
      
      // Si la empresa tiene P/E más bajo que el promedio del sector = infravalorada
      const isUndervalued = peRatio < 0.85; // 15% más barato
      const isOvervalued = peRatio > 1.25;  // 25% más caro
      
      // Ajuste de score por valoración (±10 puntos max)
      if (isUndervalued) {
        competitorScore += Math.min(10, (1 - peRatio) * 20);
        console.log(`[Competitors] ${symbol} infravalorado: P/E ${companyPE.toFixed(1)} vs sector ${sectorAvgPE.toFixed(1)} (+bonus)`);
      } else if (isOvervalued) {
        competitorScore -= Math.min(10, (peRatio - 1) * 15);
        console.log(`[Competitors] ${symbol} sobrevalorado: P/E ${companyPE.toFixed(1)} vs sector ${sectorAvgPE.toFixed(1)} (-penalty)`);
      }
      
      // Market cap ranking
      let marketCapRank = 1;
      if (companyMarketCap) {
        const competitorsWithMktCap = validCompetitors.filter(c => c.marketCap && c.marketCap > 0);
        const sortedByMktCap = [...competitorsWithMktCap].sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));
        
        // Encontrar posición de la empresa
        for (let i = 0; i < sortedByMktCap.length; i++) {
          if ((sortedByMktCap[i].marketCap || 0) > companyMarketCap) {
            marketCapRank++;
          } else {
            break;
          }
        }
        
        // Bonus por ser líder del sector (mayor market cap)
        if (marketCapRank === 1 && sortedByMktCap.length > 0) {
          competitorScore += 5;
          console.log(`[Competitors] ${symbol} es líder del sector por market cap (+5)`);
        }
      }
      
      const sectorAvgMarketCap = validCompetitors
        .filter(c => c.marketCap && c.marketCap > 0)
        .reduce((sum, c) => sum + (c.marketCap || 0), 0) / Math.max(1, validCompetitors.filter(c => c.marketCap).length);
      
      valuationAnalysis = {
        companyPE: companyPE,
        sectorAvgPE: sectorAvgPE,
        peVsSector: peVsSector,
        isUndervalued: isUndervalued,
        companyMarketCap: companyMarketCap,
        sectorAvgMarketCap: sectorAvgMarketCap,
        marketCapRank: marketCapRank,
      };
    }
    
    // 4. NUEVO v1.4: Análisis de Market Share (cuota de mercado)
    let marketShareAnalysis: CompetitorAnalysis['marketShareAnalysis'] = undefined;
    const competitorsWithRevenue = validCompetitors.filter(c => c.revenue && c.revenue > 0);
    
    if (competitorsWithRevenue.length > 0 && companyRevenue && companyRevenue > 0) {
      const sectorTotalRevenue = competitorsWithRevenue.reduce((sum, c) => sum + (c.revenue || 0), 0) + companyRevenue;
      const estimatedMarketShare = (companyRevenue / sectorTotalRevenue) * 100;
      const sectorAvgRevenue = competitorsWithRevenue.reduce((sum, c) => sum + (c.revenue || 0), 0) / competitorsWithRevenue.length;
      const revenueVsSectorAvg = ((companyRevenue - sectorAvgRevenue) / sectorAvgRevenue) * 100;
      
      // Calcular ranking por revenue
      const sortedByRevenue = [...competitorsWithRevenue].sort((a, b) => (b.revenue || 0) - (a.revenue || 0));
      let marketShareRank = 1;
      for (const comp of sortedByRevenue) {
        if ((comp.revenue || 0) > companyRevenue) {
          marketShareRank++;
        } else {
          break;
        }
      }
      
      marketShareAnalysis = {
        companyRevenue,
        sectorTotalRevenue,
        estimatedMarketShare,
        marketShareRank,
        revenueVsSectorAvg,
      };
      
      // Bonus por ser líder en revenue (+5)
      if (marketShareRank === 1) {
        competitorScore += 5;
        console.log(`[Competitors] ${symbol} es líder del sector por revenue (+5)`);
      }
      
      // Bonus/penalización por market share significativo
      if (estimatedMarketShare > 30) {
        competitorScore += 5;
        console.log(`[Competitors] ${symbol} tiene alta cuota de mercado: ${estimatedMarketShare.toFixed(1)}% (+5)`);
      } else if (estimatedMarketShare < 10 && competitorsWithRevenue.length >= 3) {
        competitorScore -= 3;
      }
    }
    
    // 5. NUEVO v1.4: Análisis de Profitability (rentabilidad)
    let profitabilityAnalysis: CompetitorAnalysis['profitabilityAnalysis'] = undefined;
    const competitorsWithMargin = validCompetitors.filter(c => c.profitMargin !== undefined);
    const competitorsWithROE = validCompetitors.filter(c => c.roe !== undefined);
    
    if ((competitorsWithMargin.length > 0 && companyProfitMargin !== undefined) ||
        (competitorsWithROE.length > 0 && companyROE !== undefined)) {
      
      const sectorAvgProfitMargin = competitorsWithMargin.length > 0
        ? competitorsWithMargin.reduce((sum, c) => sum + (c.profitMargin || 0), 0) / competitorsWithMargin.length
        : 0;
      
      const sectorAvgROE = competitorsWithROE.length > 0
        ? competitorsWithROE.reduce((sum, c) => sum + (c.roe || 0), 0) / competitorsWithROE.length
        : 0;
      
      const marginVsSector = (companyProfitMargin ?? 0) - sectorAvgProfitMargin;
      const roeVsSector = (companyROE ?? 0) - sectorAvgROE;
      const isMoreProfitable = marginVsSector > 2 || roeVsSector > 3;
      
      profitabilityAnalysis = {
        companyProfitMargin: companyProfitMargin ?? 0,
        sectorAvgProfitMargin,
        marginVsSector,
        isMoreProfitable,
        companyROE: companyROE ?? 0,
        sectorAvgROE,
        roeVsSector,
      };
      
      // Bonus por ser más rentable (+8 max)
      if (isMoreProfitable) {
        competitorScore += Math.min(8, marginVsSector + roeVsSector / 2);
        console.log(`[Competitors] ${symbol} es más rentable que el sector (+bonus)`);
      } else if (marginVsSector < -5 || roeVsSector < -5) {
        competitorScore -= 5;
        console.log(`[Competitors] ${symbol} tiene menor rentabilidad que el sector (-5)`);
      }
    }
    
    // 6. NUEVO v1.4: Análisis de Growth (crecimiento)
    let growthAnalysis: CompetitorAnalysis['growthAnalysis'] = undefined;
    const competitorsWithGrowth = validCompetitors.filter(c => c.revenueGrowth !== undefined);
    
    if (competitorsWithGrowth.length > 0 && companyRevenueGrowth !== undefined) {
      const sectorAvgRevenueGrowth = competitorsWithGrowth.reduce((sum, c) => sum + (c.revenueGrowth || 0), 0) / competitorsWithGrowth.length;
      const growthVsSector = companyRevenueGrowth - sectorAvgRevenueGrowth;
      const isGrowingFaster = growthVsSector > 5;
      
      growthAnalysis = {
        companyRevenueGrowth,
        sectorAvgRevenueGrowth,
        growthVsSector,
        isGrowingFaster,
      };
      
      // Bonus por crecer más rápido (+7 max)
      if (isGrowingFaster) {
        competitorScore += Math.min(7, growthVsSector / 2);
        console.log(`[Competitors] ${symbol} crece más rápido que el sector: +${growthVsSector.toFixed(1)}pp (+bonus)`);
      } else if (growthVsSector < -10) {
        competitorScore -= 5;
        console.log(`[Competitors] ${symbol} crece menos que el sector (-5)`);
      }
    }
    
    // 7. NUEVO v1.4: Relative Strength (fuerza relativa)
    let relativeStrength: CompetitorAnalysis['relativeStrength'] = undefined;
    
    // Calcular RS (fuerza relativa vs sector)
    const rs1w = companyVsSector1w;
    const rs1m = companyVsSector1m;
    
    let rsRating: 'strong' | 'average' | 'weak' = 'average';
    if (rs1w > 3 && rs1m > 5) {
      rsRating = 'strong';
    } else if (rs1w < -3 && rs1m < -5) {
      rsRating = 'weak';
    }
    
    // Detectar momentum (aceleración/desaceleración)
    // Si el RS de la semana es mejor que el RS del mes (proporcionalmente), está acelerando
    let momentum: 'accelerating' | 'decelerating' | 'stable' = 'stable';
    const weeklyRSNormalized = rs1w * 4; // Normalizar a escala mensual
    if (weeklyRSNormalized > rs1m + 2) {
      momentum = 'accelerating';
    } else if (weeklyRSNormalized < rs1m - 2) {
      momentum = 'decelerating';
    }
    
    relativeStrength = {
      rs1w,
      rs1m,
      rsRating,
      momentum,
    };
    
    // Bonus/penalización por fuerza relativa
    if (rsRating === 'strong') {
      competitorScore += 5;
      if (momentum === 'accelerating') {
        competitorScore += 3;
        console.log(`[Competitors] ${symbol} tiene RS fuerte y acelerando (+8)`);
      }
    } else if (rsRating === 'weak') {
      competitorScore -= 5;
      if (momentum === 'decelerating') {
        competitorScore -= 3;
        console.log(`[Competitors] ${symbol} tiene RS débil y desacelerando (-8)`);
      }
    }
    
    // Limitar a -100 a +100
    competitorScore = Math.max(-100, Math.min(100, competitorScore));
    
    // Generar resumen
    let summary = '';
    if (validCompetitors.length > 0) {
      const competitorNames = validCompetitors.map(c => c.name).join(' y ');
      
      if (sectorTrend === 'bearish') {
        if (outperforming) {
          summary = `Sector débil (${competitorNames} caen), pero ${symbol} destaca (+${companyVsSector1w.toFixed(1)}% vs sector)`;
        } else {
          summary = `Sector débil: ${competitorNames} en caída. Posible presión a la baja`;
        }
      } else if (sectorTrend === 'bullish') {
        if (outperforming) {
          summary = `Sector fuerte y ${symbol} lidera (+${companyVsSector1w.toFixed(1)}% vs competidores)`;
        } else {
          summary = `Sector fuerte pero ${symbol} rezagado vs ${competitorNames}`;
        }
      } else {
        if (outperforming) {
          summary = `${symbol} supera a ${competitorNames} en +${companyVsSector1w.toFixed(1)}%`;
        } else {
          summary = `${symbol} similar a competidores (${competitorNames})`;
        }
      }
      
      // Añadir info de valoración al summary
      if (valuationAnalysis) {
        if (valuationAnalysis.isUndervalued) {
          summary += `. P/E atractivo (${valuationAnalysis.companyPE?.toFixed(1)} vs ${valuationAnalysis.sectorAvgPE?.toFixed(1)} sector)`;
        } else if (valuationAnalysis.peVsSector && valuationAnalysis.peVsSector > valuationAnalysis.sectorAvgPE * 0.25) {
          summary += `. P/E elevado vs sector`;
        }
      }
    }
    
    console.log(`[Competitors] Score: ${competitorScore}, Sector: ${sectorTrend}, Outperforming: ${outperforming}`);
    console.log(`[Competitors] ${summary}`);
    
    return {
      sector: competitorConfig.sector,
      sectorName: competitorConfig.sectorName,
      competitors: validCompetitors,
      sectorAvgChange1d,
      sectorAvgChange1w,
      sectorAvgChange1m,
      sectorTrend,
      companyVsSector1d,
      companyVsSector1w,
      companyVsSector1m,
      outperforming,
      competitorScore,
      hasData: true,
      summary,
      valuationAnalysis,
      // NUEVO v1.4
      marketShareAnalysis,
      profitabilityAnalysis,
      growthAnalysis,
      relativeStrength,
    };
  }
}

export const competitorsService = new CompetitorsService();
