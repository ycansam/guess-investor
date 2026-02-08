/**
 * Market Impact News Service
 * 
 * Analiza noticias de alto impacto en el mercado y las relaciona
 * dinámicamente con activos que se benefician o perjudican.
 * 
 * Ejemplos:
 * - Trump ICE → beneficia prisiones privadas, perjudica agricultura
 * - Fed sube tasas → beneficia bancos, perjudica tech growth
 * - Aranceles China → beneficia steel US, perjudica retailers
 */

import { logger } from '../../middleware/logger.js';

// ===== TIPOS =====

export type ImpactDirection = 'bullish' | 'bearish' | 'neutral';
export type ImpactMagnitude = 'high' | 'medium' | 'low';

export interface AffectedAsset {
  symbol: string;
  name: string;
  sector: string;
  impact: ImpactDirection;
  magnitude: ImpactMagnitude;
  reasoning: string;
  confidence: number; // 0-100
}

export interface MarketImpactNews {
  id: string;
  headline: string;
  summary: string;
  source: string;
  publishedAt: Date;
  category: NewsCategory;
  subcategory: string;
  
  // Análisis de impacto
  overallSentiment: ImpactDirection;
  impactMagnitude: ImpactMagnitude;
  urgency: 'breaking' | 'important' | 'normal';
  
  // Activos afectados
  bullishAssets: AffectedAsset[];
  bearishAssets: AffectedAsset[];
  
  // Sectores afectados
  bullishSectors: string[];
  bearishSectors: string[];
  
  // Keywords detectados
  detectedKeywords: string[];
  reasoning: string;
}

export type NewsCategory = 
  | 'political'      // Políticas gubernamentales
  | 'economic'       // Datos económicos, Fed
  | 'trade'          // Aranceles, comercio internacional
  | 'regulation'     // Regulaciones, leyes
  | 'geopolitical'   // Conflictos, tensiones internacionales
  | 'technology'     // Innovación, disrupciones tech
  | 'energy'         // Petróleo, renovables, energía
  | 'healthcare'     // Farmacéuticas, seguros salud
  | 'earnings'       // Resultados de grandes empresas
  | 'commodities'    // Materias primas
  | 'crypto';        // Regulación cripto, adopción

// ===== MAPEO DINÁMICO DE IMPACTOS =====

interface ImpactRule {
  keywords: string[];
  category: NewsCategory;
  subcategory: string;
  bullishAssets: AssetImpact[];
  bearishAssets: AssetImpact[];
  bullishSectors: string[];
  bearishSectors: string[];
  magnitude: ImpactMagnitude;
  reasoning: string;
}

interface AssetImpact {
  symbol: string;
  name: string;
  sector: string;
  reasoning: string;
  magnitude: ImpactMagnitude;
}

// Reglas de mapeo de impacto - DINÁMICO Y EXPANDIBLE
const IMPACT_RULES: ImpactRule[] = [
  // ===== INMIGRACIÓN / ICE =====
  {
    keywords: ['ice', 'immigration', 'deportation', 'border', 'migrant', 'undocumented', 'illegal immigrant'],
    category: 'political',
    subcategory: 'Immigration Enforcement',
    bullishAssets: [
      { symbol: 'GEO', name: 'GEO Group', sector: 'Private Prisons', reasoning: 'Mayor demanda de centros de detención', magnitude: 'high' },
      { symbol: 'CXW', name: 'CoreCivic', sector: 'Private Prisons', reasoning: 'Contratos con ICE para detención', magnitude: 'high' },
      { symbol: 'AXON', name: 'Axon Enterprise', sector: 'Security Tech', reasoning: 'Equipamiento para agencias policiales', magnitude: 'medium' },
      { symbol: 'PLTR', name: 'Palantir', sector: 'Data Analytics', reasoning: 'Contratos de vigilancia con gobierno', magnitude: 'medium' },
    ],
    bearishAssets: [
      { symbol: 'CAG', name: 'Conagra Brands', sector: 'Food Processing', reasoning: 'Escasez de trabajadores en plantas', magnitude: 'medium' },
      { symbol: 'TSN', name: 'Tyson Foods', sector: 'Food Processing', reasoning: 'Dependencia de mano de obra inmigrante', magnitude: 'high' },
      { symbol: 'JBS', name: 'JBS USA', sector: 'Meat Processing', reasoning: 'Alto % trabajadores inmigrantes', magnitude: 'high' },
      { symbol: 'DHI', name: 'D.R. Horton', sector: 'Homebuilders', reasoning: 'Escasez de trabajadores construcción', magnitude: 'medium' },
      { symbol: 'LEN', name: 'Lennar', sector: 'Homebuilders', reasoning: 'Costos laborales construcción', magnitude: 'medium' },
      { symbol: 'CAT', name: 'Caterpillar', sector: 'Construction Equipment', reasoning: 'Menor actividad construcción', magnitude: 'low' },
    ],
    bullishSectors: ['Private Prisons', 'Security & Defense', 'Border Tech'],
    bearishSectors: ['Agriculture', 'Food Processing', 'Construction', 'Hospitality'],
    magnitude: 'high',
    reasoning: 'Enforcement de inmigración afecta directamente mano de obra en sectores dependientes de inmigrantes',
  },
  
  // ===== ARANCELES / TRADE WAR =====
  {
    keywords: ['tariff', 'trade war', 'import duty', 'china tariff', 'tariffs on'],
    category: 'trade',
    subcategory: 'Tariffs',
    bullishAssets: [
      { symbol: 'NUE', name: 'Nucor', sector: 'Steel', reasoning: 'Protección de acero doméstico', magnitude: 'high' },
      { symbol: 'X', name: 'US Steel', sector: 'Steel', reasoning: 'Aranceles protegen manufactura US', magnitude: 'high' },
      { symbol: 'CLF', name: 'Cleveland-Cliffs', sector: 'Steel', reasoning: 'Competencia reducida de China', magnitude: 'high' },
      { symbol: 'AA', name: 'Alcoa', sector: 'Aluminum', reasoning: 'Aranceles en aluminio', magnitude: 'medium' },
    ],
    bearishAssets: [
      { symbol: 'AAPL', name: 'Apple', sector: 'Technology', reasoning: 'Manufactura en China afectada', magnitude: 'high' },
      { symbol: 'TSLA', name: 'Tesla', sector: 'Automotive', reasoning: 'Componentes y producción en China', magnitude: 'medium' },
      { symbol: 'WMT', name: 'Walmart', sector: 'Retail', reasoning: 'Importa mayoría de productos de China', magnitude: 'high' },
      { symbol: 'TGT', name: 'Target', sector: 'Retail', reasoning: 'Costos de importación aumentan', magnitude: 'high' },
      { symbol: 'NKE', name: 'Nike', sector: 'Apparel', reasoning: 'Producción asiática afectada', magnitude: 'medium' },
      { symbol: 'COST', name: 'Costco', sector: 'Retail', reasoning: 'Productos importados más caros', magnitude: 'medium' },
    ],
    bullishSectors: ['US Steel', 'US Manufacturing', 'Domestic Production'],
    bearishSectors: ['Retail', 'Technology Hardware', 'Consumer Goods', 'Automotive'],
    magnitude: 'high',
    reasoning: 'Aranceles protegen industria doméstica pero aumentan costos para importadores',
  },
  
  // ===== FED / INTEREST RATES =====
  {
    keywords: ['fed rate', 'interest rate hike', 'fed hikes', 'rate increase', 'federal reserve raises'],
    category: 'economic',
    subcategory: 'Rate Hike',
    bullishAssets: [
      { symbol: 'JPM', name: 'JPMorgan', sector: 'Banking', reasoning: 'Mayores márgenes de interés', magnitude: 'high' },
      { symbol: 'BAC', name: 'Bank of America', sector: 'Banking', reasoning: 'Profit de tasas más altas', magnitude: 'high' },
      { symbol: 'WFC', name: 'Wells Fargo', sector: 'Banking', reasoning: 'NIM mejora con tasas altas', magnitude: 'high' },
      { symbol: 'GS', name: 'Goldman Sachs', sector: 'Investment Banking', reasoning: 'Beneficia de volatilidad', magnitude: 'medium' },
      { symbol: 'TRV', name: 'Travelers', sector: 'Insurance', reasoning: 'Mejor rendimiento de inversiones', magnitude: 'medium' },
    ],
    bearishAssets: [
      { symbol: 'ARKK', name: 'ARK Innovation', sector: 'Growth Tech', reasoning: 'Growth stocks muy sensibles a tasas', magnitude: 'high' },
      { symbol: 'SQ', name: 'Block', sector: 'Fintech', reasoning: 'Valuaciones tech comprimidas', magnitude: 'high' },
      { symbol: 'SHOP', name: 'Shopify', sector: 'E-commerce', reasoning: 'Descuento de flujos futuros', magnitude: 'high' },
      { symbol: 'ITB', name: 'iShares Home Construction', sector: 'Homebuilders', reasoning: 'Hipotecas más caras', magnitude: 'high' },
      { symbol: 'XLU', name: 'Utilities Select', sector: 'Utilities', reasoning: 'Compiten con bonos', magnitude: 'medium' },
    ],
    bullishSectors: ['Banking', 'Insurance', 'Financials'],
    bearishSectors: ['Growth Tech', 'Real Estate', 'Homebuilders', 'Utilities', 'REITs'],
    magnitude: 'high',
    reasoning: 'Tasas altas benefician bancos pero comprimen valuaciones de growth',
  },
  
  // ===== FED RATE CUT =====
  {
    keywords: ['fed cut', 'rate cut', 'fed lowers', 'interest rate cut', 'federal reserve cuts'],
    category: 'economic',
    subcategory: 'Rate Cut',
    bullishAssets: [
      { symbol: 'ARKK', name: 'ARK Innovation', sector: 'Growth Tech', reasoning: 'Tasas bajas favorecen growth', magnitude: 'high' },
      { symbol: 'QQQ', name: 'Invesco QQQ', sector: 'Tech', reasoning: 'Tech beneficia de tasas bajas', magnitude: 'high' },
      { symbol: 'ITB', name: 'iShares Home Construction', sector: 'Homebuilders', reasoning: 'Hipotecas más accesibles', magnitude: 'high' },
      { symbol: 'XLU', name: 'Utilities Select', sector: 'Utilities', reasoning: 'Dividendos más atractivos vs bonos', magnitude: 'medium' },
      { symbol: 'GLD', name: 'SPDR Gold', sector: 'Gold', reasoning: 'Oro sube con tasas bajas', magnitude: 'medium' },
    ],
    bearishAssets: [
      { symbol: 'JPM', name: 'JPMorgan', sector: 'Banking', reasoning: 'Márgenes de interés comprimidos', magnitude: 'medium' },
      { symbol: 'BAC', name: 'Bank of America', sector: 'Banking', reasoning: 'NIM se reduce', magnitude: 'medium' },
    ],
    bullishSectors: ['Technology', 'Growth', 'Real Estate', 'Homebuilders', 'Gold'],
    bearishSectors: ['Banking'],
    magnitude: 'high',
    reasoning: 'Recorte de tasas impulsa activos de riesgo y real estate',
  },
  
  // ===== OIL / ENERGY =====
  {
    keywords: ['oil price surge', 'oil spikes', 'opec cut', 'oil supply', 'crude oil jumps', 'oil rises'],
    category: 'energy',
    subcategory: 'Oil Price Increase',
    bullishAssets: [
      { symbol: 'XOM', name: 'Exxon Mobil', sector: 'Oil & Gas', reasoning: 'Mayores márgenes en crudo', magnitude: 'high' },
      { symbol: 'CVX', name: 'Chevron', sector: 'Oil & Gas', reasoning: 'Precio de venta mayor', magnitude: 'high' },
      { symbol: 'OXY', name: 'Occidental Petroleum', sector: 'Oil & Gas', reasoning: 'Pure play en petróleo', magnitude: 'high' },
      { symbol: 'COP', name: 'ConocoPhillips', sector: 'Oil & Gas', reasoning: 'E&P beneficia de precios altos', magnitude: 'high' },
      { symbol: 'SLB', name: 'Schlumberger', sector: 'Oil Services', reasoning: 'Mayor actividad de perforación', magnitude: 'medium' },
      { symbol: 'HAL', name: 'Halliburton', sector: 'Oil Services', reasoning: 'Servicios petroleros en demanda', magnitude: 'medium' },
    ],
    bearishAssets: [
      { symbol: 'AAL', name: 'American Airlines', sector: 'Airlines', reasoning: 'Combustible es costo principal', magnitude: 'high' },
      { symbol: 'DAL', name: 'Delta Airlines', sector: 'Airlines', reasoning: 'Márgenes comprimidos por fuel', magnitude: 'high' },
      { symbol: 'UAL', name: 'United Airlines', sector: 'Airlines', reasoning: 'Aumenta costo operativo', magnitude: 'high' },
      { symbol: 'UBER', name: 'Uber', sector: 'Ride-sharing', reasoning: 'Conductores piden más por combustible', magnitude: 'medium' },
      { symbol: 'FDX', name: 'FedEx', sector: 'Logistics', reasoning: 'Costos de transporte suben', magnitude: 'medium' },
    ],
    bullishSectors: ['Oil & Gas', 'Energy Services', 'Pipelines'],
    bearishSectors: ['Airlines', 'Trucking', 'Logistics', 'Consumer Discretionary'],
    magnitude: 'high',
    reasoning: 'Petróleo alto beneficia productores pero perjudica consumidores de combustible',
  },
  
  // ===== ANTITRUST / BIG TECH =====
  {
    keywords: ['antitrust', 'monopoly', 'breakup', 'doj lawsuit', 'ftc lawsuit', 'competition concerns'],
    category: 'regulation',
    subcategory: 'Antitrust',
    bullishAssets: [
      { symbol: 'SNAP', name: 'Snap', sector: 'Social Media', reasoning: 'Competencia más justa vs Meta', magnitude: 'medium' },
      { symbol: 'PINS', name: 'Pinterest', sector: 'Social Media', reasoning: 'Menos dominio de big tech', magnitude: 'medium' },
      { symbol: 'ETSY', name: 'Etsy', sector: 'E-commerce', reasoning: 'Amazon fragmentado ayuda', magnitude: 'medium' },
      { symbol: 'SHOP', name: 'Shopify', sector: 'E-commerce', reasoning: 'Alternativa a Amazon', magnitude: 'medium' },
    ],
    bearishAssets: [
      { symbol: 'GOOGL', name: 'Alphabet', sector: 'Big Tech', reasoning: 'Principal target antitrust', magnitude: 'high' },
      { symbol: 'META', name: 'Meta Platforms', sector: 'Big Tech', reasoning: 'Riesgo de division', magnitude: 'high' },
      { symbol: 'AMZN', name: 'Amazon', sector: 'Big Tech', reasoning: 'AWS podría separarse', magnitude: 'high' },
      { symbol: 'AAPL', name: 'Apple', sector: 'Big Tech', reasoning: 'App Store bajo escrutinio', magnitude: 'medium' },
    ],
    bullishSectors: ['Small Cap Tech', 'Alternative Platforms'],
    bearishSectors: ['Big Tech', 'FAANG'],
    magnitude: 'high',
    reasoning: 'Acciones antitrust amenazan a big tech pero benefician competidores',
  },
  
  // ===== CRYPTO REGULATION =====
  {
    keywords: ['crypto regulation', 'bitcoin ban', 'sec crypto', 'crypto crackdown', 'stablecoin regulation'],
    category: 'crypto',
    subcategory: 'Crypto Regulation',
    bullishAssets: [
      { symbol: 'JPM', name: 'JPMorgan', sector: 'Banking', reasoning: 'Menos competencia de DeFi', magnitude: 'low' },
      { symbol: 'V', name: 'Visa', sector: 'Payments', reasoning: 'Pagos tradicionales protegidos', magnitude: 'low' },
      { symbol: 'MA', name: 'Mastercard', sector: 'Payments', reasoning: 'Stablecoins regulados benefician', magnitude: 'low' },
    ],
    bearishAssets: [
      { symbol: 'COIN', name: 'Coinbase', sector: 'Crypto Exchange', reasoning: 'Regulación amenaza negocio', magnitude: 'high' },
      { symbol: 'MSTR', name: 'MicroStrategy', sector: 'Bitcoin Holder', reasoning: 'Hold masivo de BTC afectado', magnitude: 'high' },
      { symbol: 'SQ', name: 'Block', sector: 'Fintech', reasoning: 'Negocio Bitcoin Cash App', magnitude: 'medium' },
      { symbol: 'PYPL', name: 'PayPal', sector: 'Fintech', reasoning: 'Servicios crypto afectados', magnitude: 'medium' },
    ],
    bullishSectors: ['Traditional Finance', 'Banks'],
    bearishSectors: ['Crypto', 'DeFi', 'Fintech'],
    magnitude: 'medium',
    reasoning: 'Regulación cripto beneficia finanzas tradicionales',
  },
  
  // ===== AI / ARTIFICIAL INTELLIGENCE =====
  {
    keywords: ['ai regulation', 'artificial intelligence law', 'ai safety', 'ai ban', 'ai restrictions'],
    category: 'technology',
    subcategory: 'AI Regulation',
    bullishAssets: [
      { symbol: 'IBM', name: 'IBM', sector: 'Enterprise Tech', reasoning: 'AI empresarial regulado', magnitude: 'medium' },
      { symbol: 'ORCL', name: 'Oracle', sector: 'Enterprise Tech', reasoning: 'Soluciones compliant', magnitude: 'medium' },
    ],
    bearishAssets: [
      { symbol: 'NVDA', name: 'NVIDIA', sector: 'AI Hardware', reasoning: 'Menor demanda por restricciones', magnitude: 'high' },
      { symbol: 'MSFT', name: 'Microsoft', sector: 'AI Software', reasoning: 'Copilot/OpenAI afectados', magnitude: 'medium' },
      { symbol: 'GOOGL', name: 'Alphabet', sector: 'AI Research', reasoning: 'Gemini bajo escrutinio', magnitude: 'medium' },
      { symbol: 'META', name: 'Meta', sector: 'AI Research', reasoning: 'LLaMA y AI afectados', magnitude: 'medium' },
    ],
    bullishSectors: ['Traditional Software', 'Consulting'],
    bearishSectors: ['AI Hardware', 'AI Software', 'GPU'],
    magnitude: 'medium',
    reasoning: 'Regulación AI frena avance pero protege incumbentes',
  },
  
  // ===== HEALTHCARE / PHARMA =====
  {
    keywords: ['drug pricing', 'medicare negotiation', 'pharma regulation', 'insulin cap', 'drug price cap'],
    category: 'healthcare',
    subcategory: 'Drug Pricing',
    bullishAssets: [
      { symbol: 'CVS', name: 'CVS Health', sector: 'Pharmacy', reasoning: 'PBM beneficia de precios bajos', magnitude: 'medium' },
      { symbol: 'WBA', name: 'Walgreens', sector: 'Pharmacy', reasoning: 'Volumen de prescripciones sube', magnitude: 'medium' },
      { symbol: 'HIMS', name: 'Hims & Hers', sector: 'Telehealth', reasoning: 'Medicinas genéricas accesibles', magnitude: 'medium' },
    ],
    bearishAssets: [
      { symbol: 'PFE', name: 'Pfizer', sector: 'Pharma', reasoning: 'Márgenes de medicamentos bajan', magnitude: 'high' },
      { symbol: 'MRK', name: 'Merck', sector: 'Pharma', reasoning: 'Negociación de precios Medicare', magnitude: 'high' },
      { symbol: 'LLY', name: 'Eli Lilly', sector: 'Pharma', reasoning: 'Insulina con precio cap', magnitude: 'high' },
      { symbol: 'NVO', name: 'Novo Nordisk', sector: 'Pharma', reasoning: 'Ozempic/Wegovy precios regulados', magnitude: 'high' },
      { symbol: 'ABBV', name: 'AbbVie', sector: 'Pharma', reasoning: 'Humira y otros afectados', magnitude: 'medium' },
    ],
    bullishSectors: ['Pharmacy Retail', 'Generic Drugs', 'Telehealth'],
    bearishSectors: ['Big Pharma', 'Biotech'],
    magnitude: 'high',
    reasoning: 'Caps de precios reducen márgenes de farmacéuticas',
  },
  
  // ===== DEFENSE / MILITARY =====
  {
    keywords: ['military spending', 'defense budget', 'pentagon', 'nato spending', 'defense contract'],
    category: 'political',
    subcategory: 'Defense Spending',
    bullishAssets: [
      { symbol: 'LMT', name: 'Lockheed Martin', sector: 'Defense', reasoning: 'Principal contractor DoD', magnitude: 'high' },
      { symbol: 'RTX', name: 'RTX Corporation', sector: 'Defense', reasoning: 'Misiles y sistemas de defensa', magnitude: 'high' },
      { symbol: 'NOC', name: 'Northrop Grumman', sector: 'Defense', reasoning: 'Bombarderos y espacio', magnitude: 'high' },
      { symbol: 'GD', name: 'General Dynamics', sector: 'Defense', reasoning: 'Submarinos y tanques', magnitude: 'high' },
      { symbol: 'BA', name: 'Boeing', sector: 'Aerospace & Defense', reasoning: 'División defensa beneficia', magnitude: 'medium' },
    ],
    bearishAssets: [],
    bullishSectors: ['Defense', 'Aerospace', 'Cybersecurity'],
    bearishSectors: [],
    magnitude: 'high',
    reasoning: 'Mayor gasto militar beneficia contratistas de defensa',
  },
  
  // ===== EV / ELECTRIC VEHICLES =====
  {
    keywords: ['ev tax credit', 'electric vehicle incentive', 'ev subsidy', 'ev mandate', 'emission standards'],
    category: 'regulation',
    subcategory: 'EV Policy',
    bullishAssets: [
      { symbol: 'TSLA', name: 'Tesla', sector: 'EV', reasoning: 'Líder en vehículos eléctricos', magnitude: 'high' },
      { symbol: 'RIVN', name: 'Rivian', sector: 'EV', reasoning: 'EV trucks benefician', magnitude: 'high' },
      { symbol: 'LCID', name: 'Lucid', sector: 'EV', reasoning: 'EV de lujo con créditos', magnitude: 'medium' },
      { symbol: 'LI', name: 'Li Auto', sector: 'EV China', reasoning: 'EVs en general benefician', magnitude: 'medium' },
      { symbol: 'CHPT', name: 'ChargePoint', sector: 'EV Charging', reasoning: 'Infraestructura de carga', magnitude: 'high' },
      { symbol: 'PLUG', name: 'Plug Power', sector: 'Clean Energy', reasoning: 'Hidrógeno para transporte', magnitude: 'medium' },
    ],
    bearishAssets: [
      { symbol: 'F', name: 'Ford', sector: 'Auto Legacy', reasoning: 'Transición costosa a EV', magnitude: 'low' },
      { symbol: 'GM', name: 'General Motors', sector: 'Auto Legacy', reasoning: 'ICE business afectado', magnitude: 'low' },
      { symbol: 'XOM', name: 'Exxon Mobil', sector: 'Oil & Gas', reasoning: 'Menor demanda de gasolina largo plazo', magnitude: 'low' },
    ],
    bullishSectors: ['EV', 'EV Charging', 'Batteries', 'Clean Energy'],
    bearishSectors: ['Traditional Auto', 'Oil & Gas'],
    magnitude: 'medium',
    reasoning: 'Subsidios EV aceleran adopción de vehículos eléctricos',
  },
  
  // ===== INFLATION =====
  {
    keywords: ['inflation rises', 'cpi higher', 'inflation surges', 'price increases', 'inflation data hot'],
    category: 'economic',
    subcategory: 'Inflation Up',
    bullishAssets: [
      { symbol: 'GLD', name: 'SPDR Gold', sector: 'Gold', reasoning: 'Oro como hedge inflacionario', magnitude: 'high' },
      { symbol: 'IAU', name: 'iShares Gold', sector: 'Gold', reasoning: 'Protección contra inflación', magnitude: 'high' },
      { symbol: 'TIP', name: 'iShares TIPS', sector: 'TIPS', reasoning: 'Bonos indexados a inflación', magnitude: 'medium' },
      { symbol: 'DBA', name: 'Invesco DB Agriculture', sector: 'Commodities', reasoning: 'Commodities suben con inflación', magnitude: 'medium' },
      { symbol: 'XOM', name: 'Exxon Mobil', sector: 'Energy', reasoning: 'Energía correlaciona con inflación', magnitude: 'medium' },
    ],
    bearishAssets: [
      { symbol: 'TLT', name: 'iShares 20+ Treasury', sector: 'Bonds', reasoning: 'Bonos largo plazo pierden valor', magnitude: 'high' },
      { symbol: 'ARKK', name: 'ARK Innovation', sector: 'Growth', reasoning: 'Growth sufre con inflación alta', magnitude: 'high' },
      { symbol: 'WMT', name: 'Walmart', sector: 'Retail', reasoning: 'Consumidores gastan menos', magnitude: 'medium' },
    ],
    bullishSectors: ['Gold', 'Commodities', 'Energy', 'TIPS'],
    bearishSectors: ['Long Duration Bonds', 'Growth Tech', 'Consumer Discretionary'],
    magnitude: 'high',
    reasoning: 'Inflación alta beneficia activos reales, perjudica bonos y growth',
  },
  
  // ===== CHINA TENSIONS =====
  {
    keywords: ['china tension', 'taiwan', 'china sanction', 'china ban', 'us china'],
    category: 'geopolitical',
    subcategory: 'China Tensions',
    bullishAssets: [
      { symbol: 'LMT', name: 'Lockheed Martin', sector: 'Defense', reasoning: 'Mayor gasto defensa', magnitude: 'high' },
      { symbol: 'RTX', name: 'RTX Corporation', sector: 'Defense', reasoning: 'Sistemas de defensa en demanda', magnitude: 'high' },
      { symbol: 'INDA', name: 'iShares MSCI India', sector: 'India', reasoning: 'Alternativa a manufactura China', magnitude: 'medium' },
      { symbol: 'VNM', name: 'VanEck Vietnam', sector: 'Vietnam', reasoning: 'Supply chain shift', magnitude: 'medium' },
    ],
    bearishAssets: [
      { symbol: 'AAPL', name: 'Apple', sector: 'Tech', reasoning: 'Manufactura en China', magnitude: 'high' },
      { symbol: 'NVDA', name: 'NVIDIA', sector: 'Semiconductors', reasoning: 'Export restrictions a China', magnitude: 'high' },
      { symbol: 'BABA', name: 'Alibaba', sector: 'China Tech', reasoning: 'ADR chino afectado', magnitude: 'high' },
      { symbol: 'JD', name: 'JD.com', sector: 'China E-commerce', reasoning: 'Riesgo geopolítico', magnitude: 'high' },
      { symbol: 'PDD', name: 'PDD Holdings', sector: 'China E-commerce', reasoning: 'Tensiones US-China', magnitude: 'high' },
      { symbol: 'NIO', name: 'NIO', sector: 'China EV', reasoning: 'EV chino bajo presión', magnitude: 'high' },
    ],
    bullishSectors: ['Defense', 'India', 'Vietnam', 'Mexico Manufacturing'],
    bearishSectors: ['China Tech', 'US Companies with China Exposure', 'Semiconductors'],
    magnitude: 'high',
    reasoning: 'Tensiones China afectan supply chains y empresas con exposición',
  },
  
  // ===== EARNINGS SEASON =====
  {
    keywords: ['earnings beat', 'strong earnings', 'profit surge', 'revenue growth'],
    category: 'earnings',
    subcategory: 'Positive Earnings',
    bullishAssets: [],
    bearishAssets: [],
    bullishSectors: ['Market Broad'],
    bearishSectors: [],
    magnitude: 'medium',
    reasoning: 'Earnings positivos de grandes empresas mejoran sentimiento general',
  },
];

// ===== SERVICIO PRINCIPAL =====

class MarketImpactNewsService {
  private readonly GOOGLE_NEWS_RSS = 'https://news.google.com/rss/search';
  private readonly NEWSDATA_API = 'https://newsdata.io/api/1/news';
  
  /**
   * Obtiene noticias de impacto de mercado
   */
  async getMarketImpactNews(): Promise<MarketImpactNews[]> {
    try {
      // Buscar noticias de múltiples categorías
      const searchTerms = [
        'stock market news',
        'federal reserve',
        'tariffs trade',
        'trump policy',
        'biden policy',
        'SEC regulation',
        'oil prices',
        'inflation data',
        'earnings report',
        'antitrust tech',
        'immigration policy',
        'china us trade',
      ];
      
      const allNews: MarketImpactNews[] = [];
      
      // Buscar en paralelo
      const newsPromises = searchTerms.slice(0, 5).map(term => 
        this.fetchNewsForTerm(term).catch(() => [])
      );
      
      const results = await Promise.all(newsPromises);
      
      for (const newsItems of results) {
        for (const item of newsItems) {
          const analyzed = this.analyzeNewsImpact(item);
          if (analyzed && (analyzed.bullishAssets.length > 0 || analyzed.bearishAssets.length > 0)) {
            allNews.push(analyzed);
          }
        }
      }
      
      // Ordenar por urgencia e impacto
      return allNews
        .sort((a, b) => {
          const urgencyOrder = { breaking: 0, important: 1, normal: 2 };
          const magnitudeOrder = { high: 0, medium: 1, low: 2 };
          
          if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
            return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
          }
          return magnitudeOrder[a.impactMagnitude] - magnitudeOrder[b.impactMagnitude];
        })
        .slice(0, 20); // Top 20 noticias
        
    } catch (error) {
      logger.error('[MarketImpactNews] Error fetching news:', error);
      return this.getMockNews(); // Fallback a noticias mock para demo
    }
  }
  
  /**
   * Busca noticias para un término específico usando RSS
   */
  private async fetchNewsForTerm(term: string): Promise<RawNewsItem[]> {
    try {
      const encodedTerm = encodeURIComponent(term);
      const url = `${this.GOOGLE_NEWS_RSS}?q=${encodedTerm}&hl=en-US&gl=US&ceid=US:en`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const xml = await response.text();
      return this.parseRSSFeed(xml);
    } catch (error) {
      logger.debug(`[MarketImpactNews] Failed to fetch news for "${term}":`, error);
      return [];
    }
  }
  
  /**
   * Parsea feed RSS de Google News
   */
  private parseRSSFeed(xml: string): RawNewsItem[] {
    const items: RawNewsItem[] = [];
    
    // Regex simple para extraer items del RSS
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const titleRegex = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/;
    const linkRegex = /<link>(.*?)<\/link>/;
    const pubDateRegex = /<pubDate>(.*?)<\/pubDate>/;
    const sourceRegex = /<source.*?>(.*?)<\/source>/;
    
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
      const itemXml = match[1];
      
      const titleMatch = titleRegex.exec(itemXml);
      const linkMatch = linkRegex.exec(itemXml);
      const dateMatch = pubDateRegex.exec(itemXml);
      const sourceMatch = sourceRegex.exec(itemXml);
      
      if (titleMatch && linkMatch) {
        items.push({
          title: (titleMatch[1] || titleMatch[2] || '').trim(),
          link: linkMatch[1].trim(),
          publishedAt: dateMatch ? new Date(dateMatch[1]) : new Date(),
          source: sourceMatch ? sourceMatch[1].trim() : 'Unknown',
        });
      }
    }
    
    return items.slice(0, 10); // Máximo 10 por búsqueda
  }
  
  /**
   * Analiza una noticia y determina su impacto en activos
   */
  private analyzeNewsImpact(rawNews: RawNewsItem): MarketImpactNews | null {
    const titleLower = rawNews.title.toLowerCase();
    
    // Buscar regla que matchee
    let matchedRule: ImpactRule | null = null;
    let maxKeywordMatches = 0;
    const detectedKeywords: string[] = [];
    
    for (const rule of IMPACT_RULES) {
      const matches = rule.keywords.filter(kw => titleLower.includes(kw.toLowerCase()));
      if (matches.length > maxKeywordMatches) {
        maxKeywordMatches = matches.length;
        matchedRule = rule;
        detectedKeywords.length = 0;
        detectedKeywords.push(...matches);
      }
    }
    
    if (!matchedRule || maxKeywordMatches === 0) {
      return null;
    }
    
    // Determinar urgencia
    const urgency = this.detectUrgency(rawNews.title);
    
    // Generar ID único
    const id = `news_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Construir activos afectados
    const bullishAssets: AffectedAsset[] = matchedRule.bullishAssets.map(a => ({
      symbol: a.symbol,
      name: a.name,
      sector: a.sector,
      impact: 'bullish' as ImpactDirection,
      magnitude: a.magnitude,
      reasoning: a.reasoning,
      confidence: maxKeywordMatches > 1 ? 80 : 60,
    }));
    
    const bearishAssets: AffectedAsset[] = matchedRule.bearishAssets.map(a => ({
      symbol: a.symbol,
      name: a.name,
      sector: a.sector,
      impact: 'bearish' as ImpactDirection,
      magnitude: a.magnitude,
      reasoning: a.reasoning,
      confidence: maxKeywordMatches > 1 ? 80 : 60,
    }));
    
    return {
      id,
      headline: rawNews.title,
      summary: this.generateSummary(rawNews.title, matchedRule),
      source: rawNews.source,
      publishedAt: rawNews.publishedAt,
      category: matchedRule.category,
      subcategory: matchedRule.subcategory,
      overallSentiment: this.determineOverallSentiment(matchedRule),
      impactMagnitude: matchedRule.magnitude,
      urgency,
      bullishAssets,
      bearishAssets,
      bullishSectors: matchedRule.bullishSectors,
      bearishSectors: matchedRule.bearishSectors,
      detectedKeywords,
      reasoning: matchedRule.reasoning,
    };
  }
  
  /**
   * Detecta si la noticia es urgente
   */
  private detectUrgency(title: string): 'breaking' | 'important' | 'normal' {
    const titleLower = title.toLowerCase();
    
    const breakingWords = ['breaking', 'just in', 'alert', 'urgent', 'flash'];
    const importantWords = ['major', 'significant', 'announces', 'decision', 'official'];
    
    if (breakingWords.some(w => titleLower.includes(w))) {
      return 'breaking';
    }
    if (importantWords.some(w => titleLower.includes(w))) {
      return 'important';
    }
    return 'normal';
  }
  
  /**
   * Genera resumen de la noticia
   */
  private generateSummary(title: string, rule: ImpactRule): string {
    return `${title}. Esta noticia afecta principalmente a los sectores de ${rule.bullishSectors.concat(rule.bearishSectors).slice(0, 3).join(', ')}.`;
  }
  
  /**
   * Determina sentimiento general basado en balance de activos
   */
  private determineOverallSentiment(rule: ImpactRule): ImpactDirection {
    const bullishCount = rule.bullishAssets.length + rule.bullishSectors.length;
    const bearishCount = rule.bearishAssets.length + rule.bearishSectors.length;
    
    if (bullishCount > bearishCount * 1.5) return 'bullish';
    if (bearishCount > bullishCount * 1.5) return 'bearish';
    return 'neutral';
  }
  
  /**
   * Noticias mock para demostración cuando no hay API disponible
   */
  private getMockNews(): MarketImpactNews[] {
    const now = new Date();
    
    return [
      {
        id: 'mock_1',
        headline: 'Trump Administration Announces Major ICE Enforcement Operation',
        summary: 'Massive deportation operation targeting sanctuary cities. Private prison stocks rally on detention demand.',
        source: 'Reuters',
        publishedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        category: 'political',
        subcategory: 'Immigration Enforcement',
        overallSentiment: 'neutral',
        impactMagnitude: 'high',
        urgency: 'breaking',
        bullishAssets: [
          { symbol: 'GEO', name: 'GEO Group', sector: 'Private Prisons', impact: 'bullish', magnitude: 'high', reasoning: 'Mayor demanda de centros de detención', confidence: 85 },
          { symbol: 'CXW', name: 'CoreCivic', sector: 'Private Prisons', impact: 'bullish', magnitude: 'high', reasoning: 'Contratos con ICE para detención', confidence: 85 },
          { symbol: 'AXON', name: 'Axon Enterprise', sector: 'Security Tech', impact: 'bullish', magnitude: 'medium', reasoning: 'Equipamiento para agencias policiales', confidence: 70 },
        ],
        bearishAssets: [
          { symbol: 'TSN', name: 'Tyson Foods', sector: 'Food Processing', impact: 'bearish', magnitude: 'high', reasoning: 'Dependencia de mano de obra inmigrante', confidence: 80 },
          { symbol: 'DHI', name: 'D.R. Horton', sector: 'Homebuilders', impact: 'bearish', magnitude: 'medium', reasoning: 'Escasez de trabajadores construcción', confidence: 75 },
          { symbol: 'LEN', name: 'Lennar', sector: 'Homebuilders', impact: 'bearish', magnitude: 'medium', reasoning: 'Costos laborales construcción', confidence: 75 },
        ],
        bullishSectors: ['Private Prisons', 'Security & Defense', 'Border Tech'],
        bearishSectors: ['Food Processing', 'Construction', 'Agriculture'],
        detectedKeywords: ['ice', 'deportation', 'immigration'],
        reasoning: 'Enforcement de inmigración afecta directamente mano de obra en sectores dependientes de inmigrantes',
      },
      {
        id: 'mock_2',
        headline: 'Federal Reserve Signals Aggressive Rate Hikes Amid Inflation Concerns',
        summary: 'Fed Chair Powell indicates multiple 50bp hikes possible. Banks rally, tech sells off on growth concerns.',
        source: 'Bloomberg',
        publishedAt: new Date(now.getTime() - 4 * 60 * 60 * 1000),
        category: 'economic',
        subcategory: 'Rate Hike',
        overallSentiment: 'neutral',
        impactMagnitude: 'high',
        urgency: 'important',
        bullishAssets: [
          { symbol: 'JPM', name: 'JPMorgan', sector: 'Banking', impact: 'bullish', magnitude: 'high', reasoning: 'Mayores márgenes de interés', confidence: 90 },
          { symbol: 'BAC', name: 'Bank of America', sector: 'Banking', impact: 'bullish', magnitude: 'high', reasoning: 'Profit de tasas más altas', confidence: 88 },
          { symbol: 'WFC', name: 'Wells Fargo', sector: 'Banking', impact: 'bullish', magnitude: 'high', reasoning: 'NIM mejora con tasas altas', confidence: 85 },
        ],
        bearishAssets: [
          { symbol: 'ARKK', name: 'ARK Innovation', sector: 'Growth Tech', impact: 'bearish', magnitude: 'high', reasoning: 'Growth stocks muy sensibles a tasas', confidence: 90 },
          { symbol: 'SHOP', name: 'Shopify', sector: 'E-commerce', impact: 'bearish', magnitude: 'high', reasoning: 'Descuento de flujos futuros', confidence: 85 },
          { symbol: 'SQ', name: 'Block', sector: 'Fintech', impact: 'bearish', magnitude: 'high', reasoning: 'Valuaciones tech comprimidas', confidence: 85 },
        ],
        bullishSectors: ['Banking', 'Insurance', 'Financials'],
        bearishSectors: ['Growth Tech', 'Real Estate', 'Homebuilders'],
        detectedKeywords: ['fed', 'rate hike', 'interest rate'],
        reasoning: 'Tasas altas benefician bancos pero comprimen valuaciones de growth',
      },
      {
        id: 'mock_3',
        headline: 'New Tariffs on Chinese Imports Announced: 25% on Electronics',
        summary: 'Trade tensions escalate with broad tariffs. US steel rallies, retailers and tech fall on supply chain fears.',
        source: 'CNBC',
        publishedAt: new Date(now.getTime() - 6 * 60 * 60 * 1000),
        category: 'trade',
        subcategory: 'Tariffs',
        overallSentiment: 'neutral',
        impactMagnitude: 'high',
        urgency: 'breaking',
        bullishAssets: [
          { symbol: 'NUE', name: 'Nucor', sector: 'Steel', impact: 'bullish', magnitude: 'high', reasoning: 'Protección de acero doméstico', confidence: 85 },
          { symbol: 'X', name: 'US Steel', sector: 'Steel', impact: 'bullish', magnitude: 'high', reasoning: 'Aranceles protegen manufactura US', confidence: 85 },
          { symbol: 'CLF', name: 'Cleveland-Cliffs', sector: 'Steel', impact: 'bullish', magnitude: 'high', reasoning: 'Competencia reducida de China', confidence: 80 },
        ],
        bearishAssets: [
          { symbol: 'AAPL', name: 'Apple', sector: 'Technology', impact: 'bearish', magnitude: 'high', reasoning: 'Manufactura en China afectada', confidence: 90 },
          { symbol: 'WMT', name: 'Walmart', sector: 'Retail', impact: 'bearish', magnitude: 'high', reasoning: 'Importa mayoría de productos de China', confidence: 88 },
          { symbol: 'TGT', name: 'Target', sector: 'Retail', impact: 'bearish', magnitude: 'high', reasoning: 'Costos de importación aumentan', confidence: 85 },
        ],
        bullishSectors: ['US Steel', 'US Manufacturing'],
        bearishSectors: ['Retail', 'Technology Hardware', 'Consumer Goods'],
        detectedKeywords: ['tariff', 'china', 'import'],
        reasoning: 'Aranceles protegen industria doméstica pero aumentan costos para importadores',
      },
      {
        id: 'mock_4',
        headline: 'Oil Surges Above $100 as OPEC Announces Supply Cuts',
        summary: 'Energy stocks rally on oil price spike. Airlines and logistics suffer as fuel costs soar.',
        source: 'Financial Times',
        publishedAt: new Date(now.getTime() - 8 * 60 * 60 * 1000),
        category: 'energy',
        subcategory: 'Oil Price Increase',
        overallSentiment: 'neutral',
        impactMagnitude: 'high',
        urgency: 'important',
        bullishAssets: [
          { symbol: 'XOM', name: 'Exxon Mobil', sector: 'Oil & Gas', impact: 'bullish', magnitude: 'high', reasoning: 'Mayores márgenes en crudo', confidence: 92 },
          { symbol: 'CVX', name: 'Chevron', sector: 'Oil & Gas', impact: 'bullish', magnitude: 'high', reasoning: 'Precio de venta mayor', confidence: 90 },
          { symbol: 'OXY', name: 'Occidental Petroleum', sector: 'Oil & Gas', impact: 'bullish', magnitude: 'high', reasoning: 'Pure play en petróleo', confidence: 88 },
        ],
        bearishAssets: [
          { symbol: 'AAL', name: 'American Airlines', sector: 'Airlines', impact: 'bearish', magnitude: 'high', reasoning: 'Combustible es costo principal', confidence: 90 },
          { symbol: 'DAL', name: 'Delta Airlines', sector: 'Airlines', impact: 'bearish', magnitude: 'high', reasoning: 'Márgenes comprimidos por fuel', confidence: 88 },
          { symbol: 'FDX', name: 'FedEx', sector: 'Logistics', impact: 'bearish', magnitude: 'medium', reasoning: 'Costos de transporte suben', confidence: 80 },
        ],
        bullishSectors: ['Oil & Gas', 'Energy Services'],
        bearishSectors: ['Airlines', 'Logistics', 'Transportation'],
        detectedKeywords: ['oil', 'opec', 'supply cut'],
        reasoning: 'Petróleo alto beneficia productores pero perjudica consumidores de combustible',
      },
      {
        id: 'mock_5',
        headline: 'DOJ Files Antitrust Lawsuit Against Google for Search Monopoly',
        summary: 'Big tech under pressure as regulators target dominant players. Smaller competitors may benefit.',
        source: 'Wall Street Journal',
        publishedAt: new Date(now.getTime() - 10 * 60 * 60 * 1000),
        category: 'regulation',
        subcategory: 'Antitrust',
        overallSentiment: 'bearish',
        impactMagnitude: 'high',
        urgency: 'important',
        bullishAssets: [
          { symbol: 'DDG', name: 'DuckDuckGo (if public)', sector: 'Search', impact: 'bullish', magnitude: 'medium', reasoning: 'Alternativa a Google', confidence: 70 },
          { symbol: 'MSFT', name: 'Microsoft', sector: 'Tech', impact: 'bullish', magnitude: 'medium', reasoning: 'Bing podría ganar share', confidence: 65 },
        ],
        bearishAssets: [
          { symbol: 'GOOGL', name: 'Alphabet', sector: 'Big Tech', impact: 'bearish', magnitude: 'high', reasoning: 'Principal target antitrust', confidence: 95 },
          { symbol: 'META', name: 'Meta Platforms', sector: 'Big Tech', impact: 'bearish', magnitude: 'medium', reasoning: 'Precedente para más regulación', confidence: 75 },
        ],
        bullishSectors: ['Alternative Search', 'Small Cap Tech'],
        bearishSectors: ['Big Tech', 'FAANG'],
        detectedKeywords: ['antitrust', 'monopoly', 'doj lawsuit'],
        reasoning: 'Acciones antitrust amenazan a big tech pero benefician competidores',
      },
    ];
  }
}

interface RawNewsItem {
  title: string;
  link: string;
  publishedAt: Date;
  source: string;
}

export const marketImpactNewsService = new MarketImpactNewsService();
