/**
 * Lista de activos populares disponibles en Trade Republic
 * Estos activos se añaden a los resultados de búsqueda de Yahoo Finance
 * para mejorar la cobertura de ETCs/ETFs europeos
 */

export interface TradeRepublicAsset {
  symbol: string;      // Símbolo en Yahoo Finance
  name: string;        // Nombre del activo
  type: string;        // Tipo: ETC, ETF, STOCK, CRYPTO
  isin?: string;       // ISIN para referencia
  category?: string;   // Categoría: gold, silver, crypto, etc.
  keywords: string[];  // Palabras clave para búsqueda
}

export const tradeRepublicAssets: TradeRepublicAsset[] = [
  // =====================
  // ETCs de ORO FÍSICO
  // =====================
  {
    symbol: 'PPFB.DE',
    name: 'iShares Physical Gold ETC',
    type: 'ETC',
    isin: 'IE00B4ND3602',
    category: 'gold',
    keywords: ['gold', 'oro', 'physical gold', 'ishares', 'oro fisico', 'physical'],
  },
  {
    symbol: 'EGLN.L',
    name: 'iShares Physical Gold ETC USD (Acc)',
    type: 'ETC',
    isin: 'IE00B4ND3602',
    category: 'gold',
    keywords: ['gold', 'oro', 'physical gold', 'ishares', 'oro fisico', 'physical', 'usd', 'acc', 'accumulating'],
  },
  {
    symbol: '4GLD.DE',
    name: 'Xetra-Gold',
    type: 'ETC',
    isin: 'DE000A0S9GB0',
    category: 'gold',
    keywords: ['gold', 'oro', 'xetra', 'xetra-gold', 'oro fisico'],
  },
  {
    symbol: 'SGLD.MI',
    name: 'Invesco Physical Gold ETC',
    type: 'ETC',
    isin: 'IE00B579F325',
    category: 'gold',
    keywords: ['gold', 'oro', 'invesco', 'physical gold', 'oro fisico'],
  },
  {
    symbol: '8PSG.DE',
    name: 'Invesco Physical Gold ETC (EUR)',
    type: 'ETC',
    isin: 'IE00B579F325',
    category: 'gold',
    keywords: ['gold', 'oro', 'invesco', 'physical gold', 'oro fisico'],
  },
  {
    symbol: 'GOLD.MI',
    name: 'Amundi Physical Gold ETC',
    type: 'ETC',
    isin: 'FR0013416716',
    category: 'gold',
    keywords: ['gold', 'oro', 'amundi', 'physical gold', 'oro fisico'],
  },
  {
    symbol: 'WGLD.MI',
    name: 'WisdomTree Core Physical Gold',
    type: 'ETC',
    isin: 'DE000A3GNQ18',
    category: 'gold',
    keywords: ['gold', 'oro', 'wisdomtree', 'physical gold', 'oro fisico'],
  },
  {
    symbol: 'XAD5.MI',
    name: 'Xtrackers Physical Gold ETC',
    type: 'ETC',
    isin: 'DE000A1E0HR8',
    category: 'gold',
    keywords: ['gold', 'oro', 'xtrackers', 'physical gold', 'oro fisico', 'dws'],
  },
  {
    symbol: 'EWG0LD.DE',
    name: 'EUWAX Gold II',
    type: 'ETC',
    isin: 'DE000EWG2LD7',
    category: 'gold',
    keywords: ['gold', 'oro', 'euwax', 'physical gold', 'oro fisico'],
  },

  // =====================
  // ETCs de PLATA FÍSICA
  // =====================
  {
    symbol: 'PHAG.MI',
    name: 'WisdomTree Physical Silver',
    type: 'ETC',
    isin: 'JE00B1VS3333',
    category: 'silver',
    keywords: ['silver', 'plata', 'wisdomtree', 'physical silver', 'plata fisica'],
  },
  {
    symbol: 'SSLN.L',
    name: 'iShares Physical Silver ETC',
    type: 'ETC',
    isin: 'IE00B4NCWG09',
    category: 'silver',
    keywords: ['silver', 'plata', 'ishares', 'physical silver', 'plata fisica', 'lbma', 'ppfd'],
  },
  {
    symbol: 'ISLN.L',
    name: 'iShares Physical Silver ETC (USD)',
    type: 'ETC',
    isin: 'IE00B4NCWG09',
    category: 'silver',
    keywords: ['silver', 'plata', 'ishares', 'physical silver', 'plata fisica', 'usd'],
  },
  {
    symbol: 'XAD3.MI',
    name: 'Xtrackers Physical Silver ETC',
    type: 'ETC',
    isin: 'DE000A1E0HS6',
    category: 'silver',
    keywords: ['silver', 'plata', 'xtrackers', 'physical silver', 'plata fisica'],
  },

  // =====================
  // ETCs de PLATINO
  // =====================
  {
    symbol: 'PHPT.MI',
    name: 'WisdomTree Physical Platinum',
    type: 'ETC',
    isin: 'JE00B1VS2W53',
    category: 'platinum',
    keywords: ['platinum', 'platino', 'wisdomtree', 'physical platinum'],
  },
  {
    symbol: 'PPLT.MI',
    name: 'iShares Physical Platinum ETC',
    type: 'ETC',
    isin: 'IE00B4LHWP62',
    category: 'platinum',
    keywords: ['platinum', 'platino', 'ishares', 'physical platinum'],
  },

  // =====================
  // ETCs de PALADIO
  // =====================
  {
    symbol: 'PHPD.MI',
    name: 'WisdomTree Physical Palladium',
    type: 'ETC',
    isin: 'JE00B1VS3W29',
    category: 'palladium',
    keywords: ['palladium', 'paladio', 'wisdomtree', 'physical palladium'],
  },

  // =====================
  // ETCs MULTI-METAL
  // =====================
  {
    symbol: 'PHPM.MI',
    name: 'WisdomTree Physical Precious Metals',
    type: 'ETC',
    isin: 'JE00B1VS3586',
    category: 'metals',
    keywords: ['precious metals', 'metales preciosos', 'wisdomtree', 'gold silver platinum'],
  },

  // =====================
  // ETCs de PETROLEO
  // =====================
  {
    symbol: 'CRUD.MI',
    name: 'WisdomTree Brent Crude Oil',
    type: 'ETC',
    isin: 'JE00B78CGV99',
    category: 'oil',
    keywords: ['oil', 'petroleo', 'crude', 'brent', 'wisdomtree'],
  },
  {
    symbol: 'WTIU.MI',
    name: 'WisdomTree WTI Crude Oil',
    type: 'ETC',
    isin: 'DE000A0KRJX4',
    category: 'oil',
    keywords: ['oil', 'petroleo', 'wti', 'crude', 'wisdomtree'],
  },

  // =====================
  // ETCs de GAS NATURAL
  // =====================
  {
    symbol: 'NGAS.MI',
    name: 'WisdomTree Natural Gas',
    type: 'ETC',
    isin: 'JE00B3QRCQ69',
    category: 'gas',
    keywords: ['natural gas', 'gas natural', 'wisdomtree', 'gas'],
  },

  // =====================
  // ETFs ÍNDICES MUNDIALES
  // =====================
  {
    symbol: 'VWCE.DE',
    name: 'Vanguard FTSE All-World UCITS ETF',
    type: 'ETF',
    isin: 'IE00BK5BQT80',
    category: 'world',
    keywords: ['world', 'mundial', 'vanguard', 'all world', 'ftse', 'global'],
  },
  {
    symbol: 'IWDA.AS',
    name: 'iShares Core MSCI World UCITS ETF',
    type: 'ETF',
    isin: 'IE00B4L5Y983',
    category: 'world',
    keywords: ['world', 'mundial', 'ishares', 'msci world', 'global'],
  },
  {
    symbol: 'SWDA.MI',
    name: 'iShares Core MSCI World UCITS ETF',
    type: 'ETF',
    isin: 'IE00B4L5Y983',
    category: 'world',
    keywords: ['world', 'mundial', 'ishares', 'msci world', 'global'],
  },
  {
    symbol: 'EUNL.DE',
    name: 'iShares Core MSCI World UCITS ETF',
    type: 'ETF',
    isin: 'IE00B4L5Y983',
    category: 'world',
    keywords: ['world', 'mundial', 'ishares', 'msci world', 'global'],
  },

  // =====================
  // ETFs S&P 500
  // =====================
  {
    symbol: 'VUAA.DE',
    name: 'Vanguard S&P 500 UCITS ETF',
    type: 'ETF',
    isin: 'IE00BFMXXD54',
    category: 'usa',
    keywords: ['sp500', 's&p 500', 'vanguard', 'usa', 'america', 'us'],
  },
  {
    symbol: 'SXR8.DE',
    name: 'iShares Core S&P 500 UCITS ETF',
    type: 'ETF',
    isin: 'IE00B5BMR087',
    category: 'usa',
    keywords: ['sp500', 's&p 500', 'ishares', 'usa', 'america', 'us'],
  },
  {
    symbol: 'CSPX.MI',
    name: 'iShares Core S&P 500 UCITS ETF',
    type: 'ETF',
    isin: 'IE00B5BMR087',
    category: 'usa',
    keywords: ['sp500', 's&p 500', 'ishares', 'usa', 'america', 'us'],
  },

  // =====================
  // ETFs NASDAQ
  // =====================
  {
    symbol: 'EQQQ.DE',
    name: 'Invesco EQQQ NASDAQ-100 UCITS ETF',
    type: 'ETF',
    isin: 'IE0032077012',
    category: 'usa',
    keywords: ['nasdaq', 'nasdaq100', 'invesco', 'tech', 'tecnologia', 'usa'],
  },
  {
    symbol: 'SXRV.DE',
    name: 'iShares Nasdaq 100 UCITS ETF',
    type: 'ETF',
    isin: 'IE00B53SZB19',
    category: 'usa',
    keywords: ['nasdaq', 'nasdaq100', 'ishares', 'tech', 'tecnologia', 'usa'],
  },

  // =====================
  // ETFs EUROPA
  // =====================
  {
    symbol: 'VEUR.DE',
    name: 'Vanguard FTSE Developed Europe UCITS ETF',
    type: 'ETF',
    isin: 'IE00B945VV12',
    category: 'europe',
    keywords: ['europe', 'europa', 'vanguard', 'developed europe'],
  },
  {
    symbol: 'IMEU.AS',
    name: 'iShares Core MSCI Europe UCITS ETF',
    type: 'ETF',
    isin: 'IE00B4K48X80',
    category: 'europe',
    keywords: ['europe', 'europa', 'ishares', 'msci europe'],
  },
  {
    symbol: 'EXW1.DE',
    name: 'iShares EURO STOXX 50 UCITS ETF',
    type: 'ETF',
    isin: 'DE0005933956',
    category: 'europe',
    keywords: ['euro stoxx', 'eurostoxx', 'ishares', 'europa', 'eurozone'],
  },

  // =====================
  // ETFs MERCADOS EMERGENTES
  // =====================
  {
    symbol: 'VFEM.DE',
    name: 'Vanguard FTSE Emerging Markets UCITS ETF',
    type: 'ETF',
    isin: 'IE00B3VVMM84',
    category: 'emerging',
    keywords: ['emerging', 'emergentes', 'vanguard', 'em', 'mercados emergentes'],
  },
  {
    symbol: 'EIMI.AS',
    name: 'iShares Core MSCI EM IMI UCITS ETF',
    type: 'ETF',
    isin: 'IE00BKM4GZ66',
    category: 'emerging',
    keywords: ['emerging', 'emergentes', 'ishares', 'em', 'mercados emergentes'],
  },

  // =====================
  // ETFs TECNOLOGÍA
  // =====================
  {
    symbol: 'IUIT.AS',
    name: 'iShares S&P 500 Information Technology Sector UCITS ETF',
    type: 'ETF',
    isin: 'IE00B3WJKG14',
    category: 'tech',
    keywords: ['tech', 'tecnologia', 'ishares', 'technology', 'it', 'software'],
  },
  {
    symbol: 'WTCH.DE',
    name: 'WisdomTree Nasdaq 100 3x Daily Leveraged',
    type: 'ETF',
    isin: 'IE00BLRPRL42',
    category: 'tech',
    keywords: ['nasdaq', 'tech', 'leveraged', 'apalancado', '3x'],
  },

  // =====================
  // ETFs BONOS
  // =====================
  {
    symbol: 'IBGS.AS',
    name: 'iShares Euro Government Bond 1-3yr UCITS ETF',
    type: 'ETF',
    isin: 'IE00B14X4Q57',
    category: 'bonds',
    keywords: ['bonds', 'bonos', 'government', 'euro', 'renta fija', 'fixed income'],
  },
  {
    symbol: 'IEAC.AS',
    name: 'iShares Core Euro Corporate Bond UCITS ETF',
    type: 'ETF',
    isin: 'IE00B3F81R35',
    category: 'bonds',
    keywords: ['bonds', 'bonos', 'corporate', 'corporativos', 'euro', 'renta fija'],
  },

  // =====================
  // ETFs DIVIDENDOS
  // =====================
  {
    symbol: 'VHYL.AS',
    name: 'Vanguard FTSE All-World High Dividend Yield UCITS ETF',
    type: 'ETF',
    isin: 'IE00B8GKDB10',
    category: 'dividend',
    keywords: ['dividend', 'dividendos', 'vanguard', 'high yield', 'income'],
  },
  {
    symbol: 'IDVY.AS',
    name: 'iShares Euro Dividend UCITS ETF',
    type: 'ETF',
    isin: 'IE00B0M62S72',
    category: 'dividend',
    keywords: ['dividend', 'dividendos', 'ishares', 'euro', 'income'],
  },

  // =====================
  // ETFs CLEAN ENERGY / ESG
  // =====================
  {
    symbol: 'INRG.MI',
    name: 'iShares Global Clean Energy UCITS ETF',
    type: 'ETF',
    isin: 'IE00B1XNHC34',
    category: 'clean-energy',
    keywords: ['clean energy', 'energia limpia', 'renewable', 'renovable', 'solar', 'wind', 'eolica'],
  },
  {
    symbol: 'SUWS.AS',
    name: 'iShares MSCI World SRI UCITS ETF',
    type: 'ETF',
    isin: 'IE00BYX2JD69',
    category: 'esg',
    keywords: ['esg', 'sri', 'sostenible', 'sustainable', 'responsible'],
  },

  // =====================
  // ETFs SMALL CAPS
  // =====================
  {
    symbol: 'WSML.AS',
    name: 'iShares MSCI World Small Cap UCITS ETF',
    type: 'ETF',
    isin: 'IE00BF4RFH31',
    category: 'small-cap',
    keywords: ['small cap', 'small', 'pequeñas empresas', 'world small'],
  },
  {
    symbol: 'ZPRR.DE',
    name: 'SPDR Russell 2000 US Small Cap UCITS ETF',
    type: 'ETF',
    isin: 'IE00BJ38QD84',
    category: 'small-cap',
    keywords: ['small cap', 'russell', 'us small', 'pequeñas empresas'],
  },

  // =====================
  // ETFs SEMICONDUCTORES
  // =====================
  {
    symbol: 'SMHS.DE',
    name: 'VanEck Semiconductor UCITS ETF',
    type: 'ETF',
    isin: 'IE00BMC38736',
    category: 'semiconductors',
    keywords: ['semiconductor', 'chips', 'vaneck', 'nvidia', 'amd', 'intel'],
  },

  // =====================
  // CRYPTOS (Trade Republic)
  // =====================
  {
    symbol: 'BTC-EUR',
    name: 'Bitcoin EUR',
    type: 'CRYPTO',
    category: 'crypto',
    keywords: ['bitcoin', 'btc', 'crypto', 'criptomoneda'],
  },
  {
    symbol: 'ETH-EUR',
    name: 'Ethereum EUR',
    type: 'CRYPTO',
    category: 'crypto',
    keywords: ['ethereum', 'eth', 'crypto', 'criptomoneda'],
  },
  {
    symbol: 'SOL-EUR',
    name: 'Solana EUR',
    type: 'CRYPTO',
    category: 'crypto',
    keywords: ['solana', 'sol', 'crypto', 'criptomoneda'],
  },
  {
    symbol: 'XRP-EUR',
    name: 'XRP EUR',
    type: 'CRYPTO',
    category: 'crypto',
    keywords: ['xrp', 'ripple', 'crypto', 'criptomoneda'],
  },
  {
    symbol: 'ADA-EUR',
    name: 'Cardano EUR',
    type: 'CRYPTO',
    category: 'crypto',
    keywords: ['cardano', 'ada', 'crypto', 'criptomoneda'],
  },
  {
    symbol: 'DOT-EUR',
    name: 'Polkadot EUR',
    type: 'CRYPTO',
    category: 'crypto',
    keywords: ['polkadot', 'dot', 'crypto', 'criptomoneda'],
  },
  {
    symbol: 'AVAX-EUR',
    name: 'Avalanche EUR',
    type: 'CRYPTO',
    category: 'crypto',
    keywords: ['avalanche', 'avax', 'crypto', 'criptomoneda'],
  },
  {
    symbol: 'LINK-EUR',
    name: 'Chainlink EUR',
    type: 'CRYPTO',
    category: 'crypto',
    keywords: ['chainlink', 'link', 'crypto', 'criptomoneda'],
  },
  {
    symbol: 'MATIC-EUR',
    name: 'Polygon EUR',
    type: 'CRYPTO',
    category: 'crypto',
    keywords: ['polygon', 'matic', 'crypto', 'criptomoneda'],
  },
  {
    symbol: 'UNI-EUR',
    name: 'Uniswap EUR',
    type: 'CRYPTO',
    category: 'crypto',
    keywords: ['uniswap', 'uni', 'crypto', 'criptomoneda', 'defi'],
  },

  // =====================
  // ACCIONES POPULARES EUROPEAS
  // =====================
  {
    symbol: 'ITX.MC',
    name: 'Inditex',
    type: 'STOCK',
    isin: 'ES0148396007',
    category: 'stock-eu',
    keywords: ['inditex', 'zara', 'españa', 'spain', 'retail', 'moda'],
  },
  {
    symbol: 'SAN.MC',
    name: 'Banco Santander',
    type: 'STOCK',
    isin: 'ES0113900J37',
    category: 'stock-eu',
    keywords: ['santander', 'banco', 'bank', 'españa', 'spain'],
  },
  {
    symbol: 'BBVA.MC',
    name: 'BBVA',
    type: 'STOCK',
    isin: 'ES0113211835',
    category: 'stock-eu',
    keywords: ['bbva', 'banco', 'bank', 'españa', 'spain'],
  },
  {
    symbol: 'IBE.MC',
    name: 'Iberdrola',
    type: 'STOCK',
    isin: 'ES0144580Y14',
    category: 'stock-eu',
    keywords: ['iberdrola', 'energia', 'utilities', 'españa', 'spain', 'renovables'],
  },
  {
    symbol: 'TEF.MC',
    name: 'Telefónica',
    type: 'STOCK',
    isin: 'ES0178430E18',
    category: 'stock-eu',
    keywords: ['telefonica', 'telecom', 'españa', 'spain'],
  },
  {
    symbol: 'REP.MC',
    name: 'Repsol',
    type: 'STOCK',
    isin: 'ES0173516115',
    category: 'stock-eu',
    keywords: ['repsol', 'petroleo', 'oil', 'españa', 'spain', 'energia'],
  },
  {
    symbol: 'ASML.AS',
    name: 'ASML Holding',
    type: 'STOCK',
    isin: 'NL0010273215',
    category: 'stock-eu',
    keywords: ['asml', 'semiconductores', 'chips', 'holanda', 'netherlands', 'tech'],
  },
  {
    symbol: 'MC.PA',
    name: 'LVMH',
    type: 'STOCK',
    isin: 'FR0000121014',
    category: 'stock-eu',
    keywords: ['lvmh', 'lujo', 'luxury', 'francia', 'france', 'louis vuitton'],
  },
  {
    symbol: 'SAP.DE',
    name: 'SAP SE',
    type: 'STOCK',
    isin: 'DE0007164600',
    category: 'stock-eu',
    keywords: ['sap', 'software', 'alemania', 'germany', 'tech', 'erp'],
  },
  {
    symbol: 'SIE.DE',
    name: 'Siemens AG',
    type: 'STOCK',
    isin: 'DE0007236101',
    category: 'stock-eu',
    keywords: ['siemens', 'industrial', 'alemania', 'germany', 'ingenieria'],
  },
  {
    symbol: 'ALV.DE',
    name: 'Allianz SE',
    type: 'STOCK',
    isin: 'DE0008404005',
    category: 'stock-eu',
    keywords: ['allianz', 'seguros', 'insurance', 'alemania', 'germany'],
  },
  {
    symbol: 'DTE.DE',
    name: 'Deutsche Telekom',
    type: 'STOCK',
    isin: 'DE0005557508',
    category: 'stock-eu',
    keywords: ['deutsche telekom', 'telecom', 'alemania', 'germany', 't-mobile'],
  },
  {
    symbol: 'VOW3.DE',
    name: 'Volkswagen AG',
    type: 'STOCK',
    isin: 'DE0007664039',
    category: 'stock-eu',
    keywords: ['volkswagen', 'vw', 'auto', 'coches', 'alemania', 'germany'],
  },
  {
    symbol: 'BMW.DE',
    name: 'BMW AG',
    type: 'STOCK',
    isin: 'DE0005190003',
    category: 'stock-eu',
    keywords: ['bmw', 'auto', 'coches', 'alemania', 'germany', 'premium'],
  },
  {
    symbol: 'ADS.DE',
    name: 'Adidas AG',
    type: 'STOCK',
    isin: 'DE000A1EWWW0',
    category: 'stock-eu',
    keywords: ['adidas', 'deporte', 'sport', 'alemania', 'germany', 'zapatillas'],
  },
  {
    symbol: 'OR.PA',
    name: "L'Oréal",
    type: 'STOCK',
    isin: 'FR0000120321',
    category: 'stock-eu',
    keywords: ['loreal', 'cosmetica', 'beauty', 'francia', 'france'],
  },
  {
    symbol: 'TTE.PA',
    name: 'TotalEnergies',
    type: 'STOCK',
    isin: 'FR0000120271',
    category: 'stock-eu',
    keywords: ['total', 'totalenergies', 'petroleo', 'oil', 'francia', 'france', 'energia'],
  },
  {
    symbol: 'BNP.PA',
    name: 'BNP Paribas',
    type: 'STOCK',
    isin: 'FR0000131104',
    category: 'stock-eu',
    keywords: ['bnp', 'paribas', 'banco', 'bank', 'francia', 'france'],
  },
  {
    symbol: 'NESN.SW',
    name: 'Nestlé',
    type: 'STOCK',
    isin: 'CH0038863350',
    category: 'stock-eu',
    keywords: ['nestle', 'alimentacion', 'food', 'suiza', 'switzerland'],
  },
  {
    symbol: 'NOVN.SW',
    name: 'Novartis',
    type: 'STOCK',
    isin: 'CH0012005267',
    category: 'stock-eu',
    keywords: ['novartis', 'pharma', 'farmaceutica', 'suiza', 'switzerland'],
  },
  {
    symbol: 'ROG.SW',
    name: 'Roche Holding',
    type: 'STOCK',
    isin: 'CH0012032048',
    category: 'stock-eu',
    keywords: ['roche', 'pharma', 'farmaceutica', 'suiza', 'switzerland'],
  },

  // =====================
  // S&P 500 - TOP 100 STOCKS
  // =====================
  { symbol: 'AAPL', name: 'Apple Inc.', type: 'STOCK', category: 'stock-us', keywords: ['apple', 'iphone', 'tech', 'tecnologia'] },
  { symbol: 'MSFT', name: 'Microsoft Corporation', type: 'STOCK', category: 'stock-us', keywords: ['microsoft', 'windows', 'azure', 'tech'] },
  { symbol: 'GOOGL', name: 'Alphabet Inc. Class A', type: 'STOCK', category: 'stock-us', keywords: ['google', 'alphabet', 'search', 'youtube'] },
  { symbol: 'GOOG', name: 'Alphabet Inc. Class C', type: 'STOCK', category: 'stock-us', keywords: ['google', 'alphabet', 'search'] },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', type: 'STOCK', category: 'stock-us', keywords: ['amazon', 'ecommerce', 'aws', 'cloud'] },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', type: 'STOCK', category: 'stock-us', keywords: ['nvidia', 'gpu', 'ai', 'chips', 'semiconductor'] },
  { symbol: 'META', name: 'Meta Platforms Inc.', type: 'STOCK', category: 'stock-us', keywords: ['meta', 'facebook', 'instagram', 'whatsapp'] },
  { symbol: 'TSLA', name: 'Tesla Inc.', type: 'STOCK', category: 'stock-us', keywords: ['tesla', 'ev', 'electric', 'musk'] },
  { symbol: 'BRK-B', name: 'Berkshire Hathaway Inc. Class B', type: 'STOCK', category: 'stock-us', keywords: ['berkshire', 'buffett', 'warren'] },
  { symbol: 'LLY', name: 'Eli Lilly and Company', type: 'STOCK', category: 'stock-us', keywords: ['lilly', 'pharma', 'farmaceutica'] },
  { symbol: 'V', name: 'Visa Inc.', type: 'STOCK', category: 'stock-us', keywords: ['visa', 'pagos', 'payments', 'fintech'] },
  { symbol: 'UNH', name: 'UnitedHealth Group Inc.', type: 'STOCK', category: 'stock-us', keywords: ['united', 'health', 'seguro', 'insurance'] },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', type: 'STOCK', category: 'stock-us', keywords: ['jpmorgan', 'chase', 'banco', 'bank'] },
  { symbol: 'JNJ', name: 'Johnson & Johnson', type: 'STOCK', category: 'stock-us', keywords: ['johnson', 'pharma', 'healthcare'] },
  { symbol: 'XOM', name: 'Exxon Mobil Corporation', type: 'STOCK', category: 'stock-us', keywords: ['exxon', 'mobil', 'oil', 'petroleo', 'energia'] },
  { symbol: 'WMT', name: 'Walmart Inc.', type: 'STOCK', category: 'stock-us', keywords: ['walmart', 'retail', 'tienda'] },
  { symbol: 'MA', name: 'Mastercard Inc.', type: 'STOCK', category: 'stock-us', keywords: ['mastercard', 'pagos', 'payments'] },
  { symbol: 'PG', name: 'Procter & Gamble Co.', type: 'STOCK', category: 'stock-us', keywords: ['procter', 'gamble', 'consumer'] },
  { symbol: 'HD', name: 'The Home Depot Inc.', type: 'STOCK', category: 'stock-us', keywords: ['home depot', 'retail', 'construccion'] },
  { symbol: 'CVX', name: 'Chevron Corporation', type: 'STOCK', category: 'stock-us', keywords: ['chevron', 'oil', 'petroleo', 'energia'] },
  { symbol: 'MRK', name: 'Merck & Co. Inc.', type: 'STOCK', category: 'stock-us', keywords: ['merck', 'pharma', 'farmaceutica'] },
  { symbol: 'ABBV', name: 'AbbVie Inc.', type: 'STOCK', category: 'stock-us', keywords: ['abbvie', 'pharma', 'biotech'] },
  { symbol: 'COST', name: 'Costco Wholesale Corporation', type: 'STOCK', category: 'stock-us', keywords: ['costco', 'retail', 'wholesale'] },
  { symbol: 'AVGO', name: 'Broadcom Inc.', type: 'STOCK', category: 'stock-us', keywords: ['broadcom', 'semiconductor', 'chips'] },
  { symbol: 'PEP', name: 'PepsiCo Inc.', type: 'STOCK', category: 'stock-us', keywords: ['pepsi', 'pepsico', 'bebidas', 'snacks'] },
  { symbol: 'KO', name: 'The Coca-Cola Company', type: 'STOCK', category: 'stock-us', keywords: ['coca-cola', 'coke', 'bebidas'] },
  { symbol: 'ADBE', name: 'Adobe Inc.', type: 'STOCK', category: 'stock-us', keywords: ['adobe', 'photoshop', 'software'] },
  { symbol: 'TMO', name: 'Thermo Fisher Scientific Inc.', type: 'STOCK', category: 'stock-us', keywords: ['thermo', 'fisher', 'scientific', 'lab'] },
  { symbol: 'CRM', name: 'Salesforce Inc.', type: 'STOCK', category: 'stock-us', keywords: ['salesforce', 'crm', 'cloud', 'saas'] },
  { symbol: 'CSCO', name: 'Cisco Systems Inc.', type: 'STOCK', category: 'stock-us', keywords: ['cisco', 'networking', 'tech'] },
  { symbol: 'ACN', name: 'Accenture plc', type: 'STOCK', category: 'stock-us', keywords: ['accenture', 'consulting', 'tech'] },
  { symbol: 'MCD', name: 'McDonald\'s Corporation', type: 'STOCK', category: 'stock-us', keywords: ['mcdonalds', 'fast food', 'restaurante'] },
  { symbol: 'BAC', name: 'Bank of America Corp.', type: 'STOCK', category: 'stock-us', keywords: ['bank of america', 'banco', 'bank'] },
  { symbol: 'ABT', name: 'Abbott Laboratories', type: 'STOCK', category: 'stock-us', keywords: ['abbott', 'healthcare', 'medical'] },
  { symbol: 'NFLX', name: 'Netflix Inc.', type: 'STOCK', category: 'stock-us', keywords: ['netflix', 'streaming', 'video'] },
  { symbol: 'AMD', name: 'Advanced Micro Devices Inc.', type: 'STOCK', category: 'stock-us', keywords: ['amd', 'cpu', 'gpu', 'semiconductor'] },
  { symbol: 'ORCL', name: 'Oracle Corporation', type: 'STOCK', category: 'stock-us', keywords: ['oracle', 'database', 'cloud', 'software'] },
  { symbol: 'DIS', name: 'The Walt Disney Company', type: 'STOCK', category: 'stock-us', keywords: ['disney', 'entertainment', 'streaming'] },
  { symbol: 'INTC', name: 'Intel Corporation', type: 'STOCK', category: 'stock-us', keywords: ['intel', 'cpu', 'semiconductor', 'chips'] },
  { symbol: 'WFC', name: 'Wells Fargo & Company', type: 'STOCK', category: 'stock-us', keywords: ['wells fargo', 'banco', 'bank'] },
  { symbol: 'INTU', name: 'Intuit Inc.', type: 'STOCK', category: 'stock-us', keywords: ['intuit', 'turbotax', 'quickbooks', 'fintech'] },
  { symbol: 'QCOM', name: 'Qualcomm Inc.', type: 'STOCK', category: 'stock-us', keywords: ['qualcomm', 'mobile', 'chips', '5g'] },
  { symbol: 'VZ', name: 'Verizon Communications Inc.', type: 'STOCK', category: 'stock-us', keywords: ['verizon', 'telecom', 'mobile'] },
  { symbol: 'CAT', name: 'Caterpillar Inc.', type: 'STOCK', category: 'stock-us', keywords: ['caterpillar', 'maquinaria', 'industrial'] },
  { symbol: 'CMCSA', name: 'Comcast Corporation', type: 'STOCK', category: 'stock-us', keywords: ['comcast', 'cable', 'media', 'nbc'] },
  { symbol: 'TXN', name: 'Texas Instruments Inc.', type: 'STOCK', category: 'stock-us', keywords: ['texas instruments', 'semiconductor', 'chips'] },
  { symbol: 'IBM', name: 'International Business Machines', type: 'STOCK', category: 'stock-us', keywords: ['ibm', 'tech', 'cloud', 'ai'] },
  { symbol: 'GE', name: 'General Electric Company', type: 'STOCK', category: 'stock-us', keywords: ['general electric', 'industrial', 'aviation'] },
  { symbol: 'NOW', name: 'ServiceNow Inc.', type: 'STOCK', category: 'stock-us', keywords: ['servicenow', 'saas', 'cloud', 'workflow'] },
  { symbol: 'ISRG', name: 'Intuitive Surgical Inc.', type: 'STOCK', category: 'stock-us', keywords: ['intuitive', 'surgical', 'robot', 'medical'] },
  { symbol: 'GS', name: 'Goldman Sachs Group Inc.', type: 'STOCK', category: 'stock-us', keywords: ['goldman', 'sachs', 'banco', 'investment'] },
  { symbol: 'PFE', name: 'Pfizer Inc.', type: 'STOCK', category: 'stock-us', keywords: ['pfizer', 'pharma', 'vaccine'] },
  { symbol: 'UBER', name: 'Uber Technologies Inc.', type: 'STOCK', category: 'stock-us', keywords: ['uber', 'rideshare', 'delivery'] },
  { symbol: 'NEE', name: 'NextEra Energy Inc.', type: 'STOCK', category: 'stock-us', keywords: ['nextera', 'energy', 'renewable', 'utilities'] },
  { symbol: 'AXP', name: 'American Express Company', type: 'STOCK', category: 'stock-us', keywords: ['amex', 'american express', 'credit card'] },
  { symbol: 'SPGI', name: 'S&P Global Inc.', type: 'STOCK', category: 'stock-us', keywords: ['s&p', 'ratings', 'financial'] },
  { symbol: 'BKNG', name: 'Booking Holdings Inc.', type: 'STOCK', category: 'stock-us', keywords: ['booking', 'travel', 'hotels'] },
  { symbol: 'BLK', name: 'BlackRock Inc.', type: 'STOCK', category: 'stock-us', keywords: ['blackrock', 'asset management', 'etf'] },
  { symbol: 'T', name: 'AT&T Inc.', type: 'STOCK', category: 'stock-us', keywords: ['att', 'telecom', 'mobile'] },
  { symbol: 'HON', name: 'Honeywell International Inc.', type: 'STOCK', category: 'stock-us', keywords: ['honeywell', 'industrial', 'aerospace'] },
  { symbol: 'LOW', name: 'Lowe\'s Companies Inc.', type: 'STOCK', category: 'stock-us', keywords: ['lowes', 'retail', 'home improvement'] },
  { symbol: 'UNP', name: 'Union Pacific Corporation', type: 'STOCK', category: 'stock-us', keywords: ['union pacific', 'railroad', 'transport'] },
  { symbol: 'RTX', name: 'RTX Corporation', type: 'STOCK', category: 'stock-us', keywords: ['rtx', 'raytheon', 'defense', 'aerospace'] },
  { symbol: 'DE', name: 'Deere & Company', type: 'STOCK', category: 'stock-us', keywords: ['deere', 'john deere', 'agriculture', 'tractors'] },
  { symbol: 'SYK', name: 'Stryker Corporation', type: 'STOCK', category: 'stock-us', keywords: ['stryker', 'medical', 'devices'] },
  { symbol: 'AMAT', name: 'Applied Materials Inc.', type: 'STOCK', category: 'stock-us', keywords: ['applied materials', 'semiconductor', 'equipment'] },
  { symbol: 'LMT', name: 'Lockheed Martin Corporation', type: 'STOCK', category: 'stock-us', keywords: ['lockheed', 'martin', 'defense', 'military'] },
  { symbol: 'MDT', name: 'Medtronic plc', type: 'STOCK', category: 'stock-us', keywords: ['medtronic', 'medical', 'devices'] },
  { symbol: 'ELV', name: 'Elevance Health Inc.', type: 'STOCK', category: 'stock-us', keywords: ['elevance', 'anthem', 'health', 'insurance'] },
  { symbol: 'SCHW', name: 'Charles Schwab Corporation', type: 'STOCK', category: 'stock-us', keywords: ['schwab', 'broker', 'trading'] },
  { symbol: 'ADP', name: 'Automatic Data Processing Inc.', type: 'STOCK', category: 'stock-us', keywords: ['adp', 'payroll', 'hr'] },
  { symbol: 'VRTX', name: 'Vertex Pharmaceuticals Inc.', type: 'STOCK', category: 'stock-us', keywords: ['vertex', 'pharma', 'biotech'] },
  { symbol: 'BMY', name: 'Bristol-Myers Squibb Company', type: 'STOCK', category: 'stock-us', keywords: ['bristol', 'myers', 'pharma'] },
  { symbol: 'GILD', name: 'Gilead Sciences Inc.', type: 'STOCK', category: 'stock-us', keywords: ['gilead', 'pharma', 'biotech'] },
  { symbol: 'PANW', name: 'Palo Alto Networks Inc.', type: 'STOCK', category: 'stock-us', keywords: ['palo alto', 'cybersecurity', 'security'] },
  { symbol: 'LRCX', name: 'Lam Research Corporation', type: 'STOCK', category: 'stock-us', keywords: ['lam research', 'semiconductor', 'equipment'] },
  { symbol: 'REGN', name: 'Regeneron Pharmaceuticals Inc.', type: 'STOCK', category: 'stock-us', keywords: ['regeneron', 'pharma', 'biotech'] },
  { symbol: 'CI', name: 'The Cigna Group', type: 'STOCK', category: 'stock-us', keywords: ['cigna', 'health', 'insurance'] },
  { symbol: 'MU', name: 'Micron Technology Inc.', type: 'STOCK', category: 'stock-us', keywords: ['micron', 'memory', 'chips', 'semiconductor'] },
  { symbol: 'CB', name: 'Chubb Limited', type: 'STOCK', category: 'stock-us', keywords: ['chubb', 'insurance', 'seguros'] },
  { symbol: 'ZTS', name: 'Zoetis Inc.', type: 'STOCK', category: 'stock-us', keywords: ['zoetis', 'animal health', 'veterinary'] },
  { symbol: 'KLAC', name: 'KLA Corporation', type: 'STOCK', category: 'stock-us', keywords: ['kla', 'semiconductor', 'equipment'] },
  { symbol: 'MDLZ', name: 'Mondelez International Inc.', type: 'STOCK', category: 'stock-us', keywords: ['mondelez', 'oreo', 'snacks', 'food'] },
  { symbol: 'MMC', name: 'Marsh & McLennan Companies Inc.', type: 'STOCK', category: 'stock-us', keywords: ['marsh', 'insurance', 'consulting'] },
  { symbol: 'SO', name: 'The Southern Company', type: 'STOCK', category: 'stock-us', keywords: ['southern', 'utilities', 'energy'] },
  { symbol: 'MO', name: 'Altria Group Inc.', type: 'STOCK', category: 'stock-us', keywords: ['altria', 'tobacco', 'marlboro'] },
  { symbol: 'CME', name: 'CME Group Inc.', type: 'STOCK', category: 'stock-us', keywords: ['cme', 'futures', 'exchange', 'trading'] },
  { symbol: 'DUK', name: 'Duke Energy Corporation', type: 'STOCK', category: 'stock-us', keywords: ['duke', 'energy', 'utilities'] },
  { symbol: 'CL', name: 'Colgate-Palmolive Company', type: 'STOCK', category: 'stock-us', keywords: ['colgate', 'palmolive', 'consumer'] },
  { symbol: 'SNPS', name: 'Synopsys Inc.', type: 'STOCK', category: 'stock-us', keywords: ['synopsys', 'eda', 'semiconductor', 'software'] },
  { symbol: 'CDNS', name: 'Cadence Design Systems Inc.', type: 'STOCK', category: 'stock-us', keywords: ['cadence', 'eda', 'semiconductor', 'software'] },
  { symbol: 'FDX', name: 'FedEx Corporation', type: 'STOCK', category: 'stock-us', keywords: ['fedex', 'shipping', 'logistics'] },
  { symbol: 'PNC', name: 'PNC Financial Services Group Inc.', type: 'STOCK', category: 'stock-us', keywords: ['pnc', 'banco', 'bank'] },
  { symbol: 'ICE', name: 'Intercontinental Exchange Inc.', type: 'STOCK', category: 'stock-us', keywords: ['ice', 'exchange', 'nyse', 'trading'] },
  { symbol: 'COP', name: 'ConocoPhillips', type: 'STOCK', category: 'stock-us', keywords: ['conocophillips', 'oil', 'petroleo', 'energy'] },
  { symbol: 'EOG', name: 'EOG Resources Inc.', type: 'STOCK', category: 'stock-us', keywords: ['eog', 'oil', 'gas', 'energy'] },
  { symbol: 'USB', name: 'U.S. Bancorp', type: 'STOCK', category: 'stock-us', keywords: ['us bancorp', 'banco', 'bank'] },
  { symbol: 'SLB', name: 'Schlumberger Limited', type: 'STOCK', category: 'stock-us', keywords: ['schlumberger', 'oil', 'services'] },
  { symbol: 'TGT', name: 'Target Corporation', type: 'STOCK', category: 'stock-us', keywords: ['target', 'retail', 'tienda'] },
  { symbol: 'PYPL', name: 'PayPal Holdings Inc.', type: 'STOCK', category: 'stock-us', keywords: ['paypal', 'payments', 'fintech'] },
  { symbol: 'SQ', name: 'Block Inc.', type: 'STOCK', category: 'stock-us', keywords: ['block', 'square', 'payments', 'fintech'] },
  { symbol: 'SHOP', name: 'Shopify Inc.', type: 'STOCK', category: 'stock-us', keywords: ['shopify', 'ecommerce', 'saas'] },
  { symbol: 'PLTR', name: 'Palantir Technologies Inc.', type: 'STOCK', category: 'stock-us', keywords: ['palantir', 'data', 'analytics', 'ai'] },
  { symbol: 'SNOW', name: 'Snowflake Inc.', type: 'STOCK', category: 'stock-us', keywords: ['snowflake', 'cloud', 'data', 'warehouse'] },
  { symbol: 'CRWD', name: 'CrowdStrike Holdings Inc.', type: 'STOCK', category: 'stock-us', keywords: ['crowdstrike', 'cybersecurity', 'security'] },
  { symbol: 'DDOG', name: 'Datadog Inc.', type: 'STOCK', category: 'stock-us', keywords: ['datadog', 'monitoring', 'cloud', 'devops'] },
  { symbol: 'NET', name: 'Cloudflare Inc.', type: 'STOCK', category: 'stock-us', keywords: ['cloudflare', 'cdn', 'security', 'internet'] },
  { symbol: 'ZS', name: 'Zscaler Inc.', type: 'STOCK', category: 'stock-us', keywords: ['zscaler', 'cybersecurity', 'cloud'] },
  { symbol: 'TEAM', name: 'Atlassian Corporation', type: 'STOCK', category: 'stock-us', keywords: ['atlassian', 'jira', 'confluence', 'software'] },
  { symbol: 'WDAY', name: 'Workday Inc.', type: 'STOCK', category: 'stock-us', keywords: ['workday', 'hr', 'saas', 'cloud'] },
  { symbol: 'COIN', name: 'Coinbase Global Inc.', type: 'STOCK', category: 'stock-us', keywords: ['coinbase', 'crypto', 'exchange', 'bitcoin'] },
  { symbol: 'MSTR', name: 'MicroStrategy Inc.', type: 'STOCK', category: 'stock-us', keywords: ['microstrategy', 'bitcoin', 'analytics'] },
  { symbol: 'RIVN', name: 'Rivian Automotive Inc.', type: 'STOCK', category: 'stock-us', keywords: ['rivian', 'ev', 'electric', 'truck'] },
  { symbol: 'LCID', name: 'Lucid Group Inc.', type: 'STOCK', category: 'stock-us', keywords: ['lucid', 'ev', 'electric', 'luxury'] },
  { symbol: 'NIO', name: 'NIO Inc.', type: 'STOCK', category: 'stock-us', keywords: ['nio', 'ev', 'electric', 'china'] },
  { symbol: 'XPEV', name: 'XPeng Inc.', type: 'STOCK', category: 'stock-us', keywords: ['xpeng', 'ev', 'electric', 'china'] },
  { symbol: 'LI', name: 'Li Auto Inc.', type: 'STOCK', category: 'stock-us', keywords: ['li auto', 'ev', 'electric', 'china'] },
  { symbol: 'F', name: 'Ford Motor Company', type: 'STOCK', category: 'stock-us', keywords: ['ford', 'auto', 'ev', 'cars'] },
  { symbol: 'GM', name: 'General Motors Company', type: 'STOCK', category: 'stock-us', keywords: ['gm', 'general motors', 'auto', 'ev'] },
  { symbol: 'BA', name: 'Boeing Company', type: 'STOCK', category: 'stock-us', keywords: ['boeing', 'aerospace', 'aviation'] },
  { symbol: 'ABNB', name: 'Airbnb Inc.', type: 'STOCK', category: 'stock-us', keywords: ['airbnb', 'travel', 'rental'] },
  { symbol: 'DASH', name: 'DoorDash Inc.', type: 'STOCK', category: 'stock-us', keywords: ['doordash', 'delivery', 'food'] },
  { symbol: 'RBLX', name: 'Roblox Corporation', type: 'STOCK', category: 'stock-us', keywords: ['roblox', 'gaming', 'metaverse'] },
  { symbol: 'U', name: 'Unity Software Inc.', type: 'STOCK', category: 'stock-us', keywords: ['unity', 'gaming', 'engine', 'development'] },
  { symbol: 'ZM', name: 'Zoom Video Communications Inc.', type: 'STOCK', category: 'stock-us', keywords: ['zoom', 'video', 'conferencing'] },
  { symbol: 'ROKU', name: 'Roku Inc.', type: 'STOCK', category: 'stock-us', keywords: ['roku', 'streaming', 'tv'] },
  { symbol: 'SPOT', name: 'Spotify Technology SA', type: 'STOCK', category: 'stock-us', keywords: ['spotify', 'music', 'streaming', 'podcast'] },
  { symbol: 'TTD', name: 'The Trade Desk Inc.', type: 'STOCK', category: 'stock-us', keywords: ['trade desk', 'advertising', 'digital'] },
  { symbol: 'MELI', name: 'MercadoLibre Inc.', type: 'STOCK', category: 'stock-us', keywords: ['mercadolibre', 'ecommerce', 'latam'] },
  { symbol: 'SE', name: 'Sea Limited', type: 'STOCK', category: 'stock-us', keywords: ['sea', 'shopee', 'gaming', 'asia'] },
  { symbol: 'BABA', name: 'Alibaba Group Holding Ltd.', type: 'STOCK', category: 'stock-us', keywords: ['alibaba', 'ecommerce', 'china', 'cloud'] },
  { symbol: 'JD', name: 'JD.com Inc.', type: 'STOCK', category: 'stock-us', keywords: ['jd', 'ecommerce', 'china'] },
  { symbol: 'PDD', name: 'PDD Holdings Inc.', type: 'STOCK', category: 'stock-us', keywords: ['pdd', 'pinduoduo', 'temu', 'ecommerce', 'china'] },
  { symbol: 'BIDU', name: 'Baidu Inc.', type: 'STOCK', category: 'stock-us', keywords: ['baidu', 'search', 'ai', 'china'] },
  { symbol: 'TSM', name: 'Taiwan Semiconductor Manufacturing', type: 'STOCK', category: 'stock-us', keywords: ['tsmc', 'semiconductor', 'foundry', 'taiwan'] },

  // =====================
  // ÍNDICES PRINCIPALES
  // =====================
  { symbol: '^GSPC', name: 'S&P 500', type: 'INDEX', category: 'index', keywords: ['sp500', 's&p', 'index', 'us'] },
  { symbol: '^DJI', name: 'Dow Jones Industrial Average', type: 'INDEX', category: 'index', keywords: ['dow', 'djia', 'index'] },
  { symbol: '^IXIC', name: 'NASDAQ Composite', type: 'INDEX', category: 'index', keywords: ['nasdaq', 'tech', 'index'] },
  { symbol: '^NDX', name: 'NASDAQ 100', type: 'INDEX', category: 'index', keywords: ['nasdaq 100', 'tech', 'index'] },
  { symbol: '^RUT', name: 'Russell 2000', type: 'INDEX', category: 'index', keywords: ['russell', 'small cap', 'index'] },
  { symbol: '^VIX', name: 'CBOE Volatility Index', type: 'INDEX', category: 'index', keywords: ['vix', 'volatility', 'fear'] },
  { symbol: '^FTSE', name: 'FTSE 100', type: 'INDEX', category: 'index', keywords: ['ftse', 'uk', 'london', 'index'] },
  { symbol: '^GDAXI', name: 'DAX Performance Index', type: 'INDEX', category: 'index', keywords: ['dax', 'germany', 'alemania', 'index'] },
  { symbol: '^FCHI', name: 'CAC 40', type: 'INDEX', category: 'index', keywords: ['cac', 'france', 'francia', 'index'] },
  { symbol: '^STOXX50E', name: 'EURO STOXX 50', type: 'INDEX', category: 'index', keywords: ['stoxx', 'europe', 'euro', 'index'] },
  { symbol: '^N225', name: 'Nikkei 225', type: 'INDEX', category: 'index', keywords: ['nikkei', 'japan', 'japon', 'index'] },
  { symbol: '^HSI', name: 'Hang Seng Index', type: 'INDEX', category: 'index', keywords: ['hang seng', 'hong kong', 'china', 'index'] },
  { symbol: '000001.SS', name: 'SSE Composite Index', type: 'INDEX', category: 'index', keywords: ['shanghai', 'china', 'index'] },
  { symbol: '^IBEX', name: 'IBEX 35', type: 'INDEX', category: 'index', keywords: ['ibex', 'spain', 'espana', 'index'] },
  { symbol: '^SSMI', name: 'Swiss Market Index', type: 'INDEX', category: 'index', keywords: ['smi', 'swiss', 'suiza', 'index'] },
  { symbol: '^AORD', name: 'All Ordinaries', type: 'INDEX', category: 'index', keywords: ['aord', 'australia', 'index'] },

  // =====================
  // ETFs POPULARES
  // =====================
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', type: 'ETF', category: 'etf', keywords: ['spy', 'sp500', 'etf'] },
  { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', type: 'ETF', category: 'etf', keywords: ['voo', 'vanguard', 'sp500', 'etf'] },
  { symbol: 'IVV', name: 'iShares Core S&P 500 ETF', type: 'ETF', category: 'etf', keywords: ['ivv', 'ishares', 'sp500', 'etf'] },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust', type: 'ETF', category: 'etf', keywords: ['qqq', 'nasdaq', 'tech', 'etf'] },
  { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', type: 'ETF', category: 'etf', keywords: ['vti', 'vanguard', 'total market'] },
  { symbol: 'IWM', name: 'iShares Russell 2000 ETF', type: 'ETF', category: 'etf', keywords: ['iwm', 'russell', 'small cap'] },
  { symbol: 'DIA', name: 'SPDR Dow Jones Industrial Average ETF', type: 'ETF', category: 'etf', keywords: ['dia', 'dow', 'etf'] },
  { symbol: 'VIG', name: 'Vanguard Dividend Appreciation ETF', type: 'ETF', category: 'etf', keywords: ['vig', 'dividend', 'vanguard'] },
  { symbol: 'SCHD', name: 'Schwab U.S. Dividend Equity ETF', type: 'ETF', category: 'etf', keywords: ['schd', 'dividend', 'schwab'] },
  { symbol: 'VGT', name: 'Vanguard Information Technology ETF', type: 'ETF', category: 'etf', keywords: ['vgt', 'tech', 'vanguard'] },
  { symbol: 'XLK', name: 'Technology Select Sector SPDR Fund', type: 'ETF', category: 'etf', keywords: ['xlk', 'tech', 'sector'] },
  { symbol: 'XLF', name: 'Financial Select Sector SPDR Fund', type: 'ETF', category: 'etf', keywords: ['xlf', 'financials', 'banks'] },
  { symbol: 'XLE', name: 'Energy Select Sector SPDR Fund', type: 'ETF', category: 'etf', keywords: ['xle', 'energy', 'oil'] },
  { symbol: 'XLV', name: 'Health Care Select Sector SPDR Fund', type: 'ETF', category: 'etf', keywords: ['xlv', 'healthcare', 'pharma'] },
  { symbol: 'ARKK', name: 'ARK Innovation ETF', type: 'ETF', category: 'etf', keywords: ['arkk', 'ark', 'innovation', 'cathie wood'] },
  { symbol: 'ARKG', name: 'ARK Genomic Revolution ETF', type: 'ETF', category: 'etf', keywords: ['arkg', 'ark', 'genomics', 'biotech'] },
  { symbol: 'VEA', name: 'Vanguard FTSE Developed Markets ETF', type: 'ETF', category: 'etf', keywords: ['vea', 'international', 'developed'] },
  { symbol: 'VWO', name: 'Vanguard FTSE Emerging Markets ETF', type: 'ETF', category: 'etf', keywords: ['vwo', 'emerging', 'markets'] },
  { symbol: 'EEM', name: 'iShares MSCI Emerging Markets ETF', type: 'ETF', category: 'etf', keywords: ['eem', 'emerging', 'markets'] },
  { symbol: 'GLD', name: 'SPDR Gold Shares', type: 'ETF', category: 'gold', keywords: ['gld', 'gold', 'oro', 'etf'] },
  { symbol: 'IAU', name: 'iShares Gold Trust', type: 'ETF', category: 'gold', keywords: ['iau', 'gold', 'oro', 'ishares'] },
  { symbol: 'SLV', name: 'iShares Silver Trust', type: 'ETF', category: 'silver', keywords: ['slv', 'silver', 'plata', 'ishares'] },
  { symbol: 'USO', name: 'United States Oil Fund LP', type: 'ETF', category: 'oil', keywords: ['uso', 'oil', 'petroleo', 'crude'] },
  { symbol: 'UNG', name: 'United States Natural Gas Fund LP', type: 'ETF', category: 'gas', keywords: ['ung', 'natural gas', 'gas'] },
  { symbol: 'TLT', name: 'iShares 20+ Year Treasury Bond ETF', type: 'ETF', category: 'bonds', keywords: ['tlt', 'bonds', 'treasury', 'long term'] },
  { symbol: 'BND', name: 'Vanguard Total Bond Market ETF', type: 'ETF', category: 'bonds', keywords: ['bnd', 'bonds', 'vanguard'] },
  { symbol: 'LQD', name: 'iShares iBoxx $ Investment Grade Corporate Bond ETF', type: 'ETF', category: 'bonds', keywords: ['lqd', 'corporate', 'bonds'] },
  { symbol: 'HYG', name: 'iShares iBoxx $ High Yield Corporate Bond ETF', type: 'ETF', category: 'bonds', keywords: ['hyg', 'high yield', 'junk bonds'] },
  { symbol: 'AGG', name: 'iShares Core U.S. Aggregate Bond ETF', type: 'ETF', category: 'bonds', keywords: ['agg', 'bonds', 'aggregate'] },
  { symbol: 'VNQ', name: 'Vanguard Real Estate ETF', type: 'ETF', category: 'real-estate', keywords: ['vnq', 'real estate', 'reit', 'vanguard'] },
  { symbol: 'KWEB', name: 'KraneShares CSI China Internet ETF', type: 'ETF', category: 'etf', keywords: ['kweb', 'china', 'internet', 'tech'] },
  { symbol: 'SOXX', name: 'iShares Semiconductor ETF', type: 'ETF', category: 'etf', keywords: ['soxx', 'semiconductor', 'chips'] },
  { symbol: 'SMH', name: 'VanEck Semiconductor ETF', type: 'ETF', category: 'etf', keywords: ['smh', 'semiconductor', 'chips'] },
  { symbol: 'IBB', name: 'iShares Biotechnology ETF', type: 'ETF', category: 'etf', keywords: ['ibb', 'biotech', 'pharma'] },
  { symbol: 'XBI', name: 'SPDR S&P Biotech ETF', type: 'ETF', category: 'etf', keywords: ['xbi', 'biotech', 'spdr'] },
  { symbol: 'SOXL', name: 'Direxion Daily Semiconductor Bull 3X', type: 'ETF', category: 'etf', keywords: ['soxl', 'semiconductor', 'leveraged', '3x'] },
  { symbol: 'TQQQ', name: 'ProShares UltraPro QQQ', type: 'ETF', category: 'etf', keywords: ['tqqq', 'nasdaq', 'leveraged', '3x'] },
  { symbol: 'SQQQ', name: 'ProShares UltraPro Short QQQ', type: 'ETF', category: 'etf', keywords: ['sqqq', 'nasdaq', 'inverse', 'short'] },
  { symbol: 'SPXS', name: 'Direxion Daily S&P 500 Bear 3X', type: 'ETF', category: 'etf', keywords: ['spxs', 'sp500', 'inverse', 'bear'] },

  // =====================
  // MÁS ACCIONES EUROPEAS
  // =====================
  { symbol: 'SAN.MC', name: 'Banco Santander', type: 'STOCK', category: 'stock-eu', keywords: ['santander', 'banco', 'spain', 'bank'] },
  { symbol: 'BBVA.MC', name: 'Banco Bilbao Vizcaya Argentaria', type: 'STOCK', category: 'stock-eu', keywords: ['bbva', 'banco', 'spain', 'bank'] },
  { symbol: 'ITX.MC', name: 'Inditex', type: 'STOCK', category: 'stock-eu', keywords: ['inditex', 'zara', 'fashion', 'spain'] },
  { symbol: 'IBE.MC', name: 'Iberdrola', type: 'STOCK', category: 'stock-eu', keywords: ['iberdrola', 'utilities', 'energy', 'spain'] },
  { symbol: 'TEF.MC', name: 'Telefónica', type: 'STOCK', category: 'stock-eu', keywords: ['telefonica', 'telecom', 'spain'] },
  { symbol: 'REP.MC', name: 'Repsol', type: 'STOCK', category: 'stock-eu', keywords: ['repsol', 'oil', 'petroleo', 'spain'] },
  { symbol: 'FER.MC', name: 'Ferrovial', type: 'STOCK', category: 'stock-eu', keywords: ['ferrovial', 'infrastructure', 'spain'] },
  { symbol: 'AMS.MC', name: 'Amadeus IT Group', type: 'STOCK', category: 'stock-eu', keywords: ['amadeus', 'travel', 'tech', 'spain'] },
  { symbol: 'CABK.MC', name: 'CaixaBank', type: 'STOCK', category: 'stock-eu', keywords: ['caixabank', 'banco', 'spain', 'bank'] },
  { symbol: 'ACS.MC', name: 'ACS Actividades de Construcción', type: 'STOCK', category: 'stock-eu', keywords: ['acs', 'construction', 'spain'] },
  { symbol: 'ALV.DE', name: 'Allianz SE', type: 'STOCK', category: 'stock-eu', keywords: ['allianz', 'insurance', 'germany'] },
  { symbol: 'BAS.DE', name: 'BASF SE', type: 'STOCK', category: 'stock-eu', keywords: ['basf', 'chemicals', 'germany'] },
  { symbol: 'BAY.DE', name: 'Bayer AG', type: 'STOCK', category: 'stock-eu', keywords: ['bayer', 'pharma', 'germany'] },
  { symbol: 'BMW.DE', name: 'BMW AG', type: 'STOCK', category: 'stock-eu', keywords: ['bmw', 'auto', 'cars', 'germany'] },
  { symbol: 'DBK.DE', name: 'Deutsche Bank AG', type: 'STOCK', category: 'stock-eu', keywords: ['deutsche', 'bank', 'germany'] },
  { symbol: 'DTE.DE', name: 'Deutsche Telekom AG', type: 'STOCK', category: 'stock-eu', keywords: ['telekom', 'telecom', 'germany'] },
  { symbol: 'MBG.DE', name: 'Mercedes-Benz Group AG', type: 'STOCK', category: 'stock-eu', keywords: ['mercedes', 'benz', 'auto', 'germany'] },
  { symbol: 'MUV2.DE', name: 'Munich Re', type: 'STOCK', category: 'stock-eu', keywords: ['munich', 'reinsurance', 'germany'] },
  { symbol: 'SIE.DE', name: 'Siemens AG', type: 'STOCK', category: 'stock-eu', keywords: ['siemens', 'industrial', 'germany'] },
  { symbol: 'VOW3.DE', name: 'Volkswagen AG', type: 'STOCK', category: 'stock-eu', keywords: ['volkswagen', 'vw', 'auto', 'germany'] },
  { symbol: 'AZN.L', name: 'AstraZeneca PLC', type: 'STOCK', category: 'stock-eu', keywords: ['astrazeneca', 'pharma', 'uk'] },
  { symbol: 'BP.L', name: 'BP PLC', type: 'STOCK', category: 'stock-eu', keywords: ['bp', 'oil', 'petroleo', 'uk'] },
  { symbol: 'GSK.L', name: 'GSK PLC', type: 'STOCK', category: 'stock-eu', keywords: ['gsk', 'glaxo', 'pharma', 'uk'] },
  { symbol: 'HSBA.L', name: 'HSBC Holdings PLC', type: 'STOCK', category: 'stock-eu', keywords: ['hsbc', 'bank', 'uk', 'asia'] },
  { symbol: 'SHEL.L', name: 'Shell PLC', type: 'STOCK', category: 'stock-eu', keywords: ['shell', 'oil', 'petroleo', 'uk'] },
  { symbol: 'ULVR.L', name: 'Unilever PLC', type: 'STOCK', category: 'stock-eu', keywords: ['unilever', 'consumer', 'uk'] },
  { symbol: 'RIO.L', name: 'Rio Tinto PLC', type: 'STOCK', category: 'stock-eu', keywords: ['rio tinto', 'mining', 'uk'] },
  { symbol: 'RDSA.L', name: 'Shell PLC Class A', type: 'STOCK', category: 'stock-eu', keywords: ['shell', 'oil', 'uk'] },
  { symbol: 'ENEL.MI', name: 'Enel SpA', type: 'STOCK', category: 'stock-eu', keywords: ['enel', 'utilities', 'energy', 'italy'] },
  { symbol: 'ENI.MI', name: 'Eni SpA', type: 'STOCK', category: 'stock-eu', keywords: ['eni', 'oil', 'petroleo', 'italy'] },
  { symbol: 'ISP.MI', name: 'Intesa Sanpaolo SpA', type: 'STOCK', category: 'stock-eu', keywords: ['intesa', 'bank', 'italy'] },
  { symbol: 'UCG.MI', name: 'UniCredit SpA', type: 'STOCK', category: 'stock-eu', keywords: ['unicredit', 'bank', 'italy'] },
  { symbol: 'STLA', name: 'Stellantis NV', type: 'STOCK', category: 'stock-eu', keywords: ['stellantis', 'fiat', 'peugeot', 'auto'] },
  { symbol: 'ASML.AS', name: 'ASML Holding NV', type: 'STOCK', category: 'stock-eu', keywords: ['asml', 'semiconductor', 'lithography', 'netherlands'] },
  { symbol: 'PHIA.AS', name: 'Koninklijke Philips NV', type: 'STOCK', category: 'stock-eu', keywords: ['philips', 'healthcare', 'netherlands'] },
  { symbol: 'INGA.AS', name: 'ING Groep NV', type: 'STOCK', category: 'stock-eu', keywords: ['ing', 'bank', 'netherlands'] },
  { symbol: 'AD.AS', name: 'Koninklijke Ahold Delhaize NV', type: 'STOCK', category: 'stock-eu', keywords: ['ahold', 'delhaize', 'retail', 'netherlands'] },

  // =====================
  // MÁS CRIPTOMONEDAS
  // =====================
  { symbol: 'BTC-USD', name: 'Bitcoin USD', type: 'CRYPTO', category: 'crypto', keywords: ['bitcoin', 'btc', 'crypto'] },
  { symbol: 'ETH-USD', name: 'Ethereum USD', type: 'CRYPTO', category: 'crypto', keywords: ['ethereum', 'eth', 'crypto'] },
  { symbol: 'BNB-USD', name: 'Binance Coin USD', type: 'CRYPTO', category: 'crypto', keywords: ['binance', 'bnb', 'crypto'] },
  { symbol: 'XRP-USD', name: 'XRP USD', type: 'CRYPTO', category: 'crypto', keywords: ['xrp', 'ripple', 'crypto'] },
  { symbol: 'SOL-USD', name: 'Solana USD', type: 'CRYPTO', category: 'crypto', keywords: ['solana', 'sol', 'crypto'] },
  { symbol: 'ADA-USD', name: 'Cardano USD', type: 'CRYPTO', category: 'crypto', keywords: ['cardano', 'ada', 'crypto'] },
  { symbol: 'DOGE-USD', name: 'Dogecoin USD', type: 'CRYPTO', category: 'crypto', keywords: ['dogecoin', 'doge', 'meme', 'crypto'] },
  { symbol: 'AVAX-USD', name: 'Avalanche USD', type: 'CRYPTO', category: 'crypto', keywords: ['avalanche', 'avax', 'crypto'] },
  { symbol: 'DOT-USD', name: 'Polkadot USD', type: 'CRYPTO', category: 'crypto', keywords: ['polkadot', 'dot', 'crypto'] },
  { symbol: 'LINK-USD', name: 'Chainlink USD', type: 'CRYPTO', category: 'crypto', keywords: ['chainlink', 'link', 'crypto', 'oracle'] },
  { symbol: 'MATIC-USD', name: 'Polygon USD', type: 'CRYPTO', category: 'crypto', keywords: ['polygon', 'matic', 'crypto', 'layer2'] },
  { symbol: 'SHIB-USD', name: 'Shiba Inu USD', type: 'CRYPTO', category: 'crypto', keywords: ['shiba', 'shib', 'meme', 'crypto'] },
  { symbol: 'LTC-USD', name: 'Litecoin USD', type: 'CRYPTO', category: 'crypto', keywords: ['litecoin', 'ltc', 'crypto'] },
  { symbol: 'UNI-USD', name: 'Uniswap USD', type: 'CRYPTO', category: 'crypto', keywords: ['uniswap', 'uni', 'defi', 'crypto'] },
  { symbol: 'ATOM-USD', name: 'Cosmos USD', type: 'CRYPTO', category: 'crypto', keywords: ['cosmos', 'atom', 'crypto'] },
  { symbol: 'XLM-USD', name: 'Stellar USD', type: 'CRYPTO', category: 'crypto', keywords: ['stellar', 'xlm', 'crypto'] },
  { symbol: 'ETC-USD', name: 'Ethereum Classic USD', type: 'CRYPTO', category: 'crypto', keywords: ['ethereum classic', 'etc', 'crypto'] },
  { symbol: 'FIL-USD', name: 'Filecoin USD', type: 'CRYPTO', category: 'crypto', keywords: ['filecoin', 'fil', 'storage', 'crypto'] },
  { symbol: 'NEAR-USD', name: 'NEAR Protocol USD', type: 'CRYPTO', category: 'crypto', keywords: ['near', 'protocol', 'crypto'] },
  { symbol: 'APT-USD', name: 'Aptos USD', type: 'CRYPTO', category: 'crypto', keywords: ['aptos', 'apt', 'crypto'] },
  { symbol: 'ARB-USD', name: 'Arbitrum USD', type: 'CRYPTO', category: 'crypto', keywords: ['arbitrum', 'arb', 'layer2', 'crypto'] },
  { symbol: 'OP-USD', name: 'Optimism USD', type: 'CRYPTO', category: 'crypto', keywords: ['optimism', 'op', 'layer2', 'crypto'] },
  { symbol: 'AAVE-USD', name: 'Aave USD', type: 'CRYPTO', category: 'crypto', keywords: ['aave', 'defi', 'lending', 'crypto'] },
  { symbol: 'MKR-USD', name: 'Maker USD', type: 'CRYPTO', category: 'crypto', keywords: ['maker', 'mkr', 'defi', 'dai', 'crypto'] },
  { symbol: 'CRO-USD', name: 'Cronos USD', type: 'CRYPTO', category: 'crypto', keywords: ['cronos', 'cro', 'crypto.com', 'crypto'] },
  { symbol: 'ALGO-USD', name: 'Algorand USD', type: 'CRYPTO', category: 'crypto', keywords: ['algorand', 'algo', 'crypto'] },
  { symbol: 'VET-USD', name: 'VeChain USD', type: 'CRYPTO', category: 'crypto', keywords: ['vechain', 'vet', 'supply chain', 'crypto'] },
  { symbol: 'FTM-USD', name: 'Fantom USD', type: 'CRYPTO', category: 'crypto', keywords: ['fantom', 'ftm', 'crypto'] },
  { symbol: 'ICP-USD', name: 'Internet Computer USD', type: 'CRYPTO', category: 'crypto', keywords: ['internet computer', 'icp', 'crypto'] },
  { symbol: 'SAND-USD', name: 'The Sandbox USD', type: 'CRYPTO', category: 'crypto', keywords: ['sandbox', 'sand', 'metaverse', 'crypto'] },
  { symbol: 'MANA-USD', name: 'Decentraland USD', type: 'CRYPTO', category: 'crypto', keywords: ['decentraland', 'mana', 'metaverse', 'crypto'] },
  { symbol: 'AXS-USD', name: 'Axie Infinity USD', type: 'CRYPTO', category: 'crypto', keywords: ['axie', 'axs', 'gaming', 'nft', 'crypto'] },
  { symbol: 'PEPE-USD', name: 'Pepe USD', type: 'CRYPTO', category: 'crypto', keywords: ['pepe', 'meme', 'crypto'] },
  { symbol: 'WIF-USD', name: 'dogwifhat USD', type: 'CRYPTO', category: 'crypto', keywords: ['dogwifhat', 'wif', 'meme', 'solana', 'crypto'] },
  { symbol: 'BONK-USD', name: 'Bonk USD', type: 'CRYPTO', category: 'crypto', keywords: ['bonk', 'meme', 'solana', 'crypto'] },

  // =====================
  // FUTUROS / COMMODITIES
  // =====================
  { symbol: 'GC=F', name: 'Gold Futures', type: 'FUTURE', category: 'commodity', keywords: ['gold', 'oro', 'futures', 'comex'] },
  { symbol: 'SI=F', name: 'Silver Futures', type: 'FUTURE', category: 'commodity', keywords: ['silver', 'plata', 'futures', 'comex'] },
  { symbol: 'CL=F', name: 'Crude Oil Futures', type: 'FUTURE', category: 'commodity', keywords: ['crude', 'oil', 'petroleo', 'wti', 'futures'] },
  { symbol: 'BZ=F', name: 'Brent Crude Oil Futures', type: 'FUTURE', category: 'commodity', keywords: ['brent', 'crude', 'oil', 'futures'] },
  { symbol: 'NG=F', name: 'Natural Gas Futures', type: 'FUTURE', category: 'commodity', keywords: ['natural gas', 'gas', 'futures'] },
  { symbol: 'HG=F', name: 'Copper Futures', type: 'FUTURE', category: 'commodity', keywords: ['copper', 'cobre', 'futures'] },
  { symbol: 'PL=F', name: 'Platinum Futures', type: 'FUTURE', category: 'commodity', keywords: ['platinum', 'platino', 'futures'] },
  { symbol: 'PA=F', name: 'Palladium Futures', type: 'FUTURE', category: 'commodity', keywords: ['palladium', 'paladio', 'futures'] },
  { symbol: 'ZC=F', name: 'Corn Futures', type: 'FUTURE', category: 'commodity', keywords: ['corn', 'maiz', 'agriculture', 'futures'] },
  { symbol: 'ZW=F', name: 'Wheat Futures', type: 'FUTURE', category: 'commodity', keywords: ['wheat', 'trigo', 'agriculture', 'futures'] },
  { symbol: 'ZS=F', name: 'Soybean Futures', type: 'FUTURE', category: 'commodity', keywords: ['soybean', 'soja', 'agriculture', 'futures'] },
  { symbol: 'KC=F', name: 'Coffee Futures', type: 'FUTURE', category: 'commodity', keywords: ['coffee', 'cafe', 'futures'] },
  { symbol: 'CT=F', name: 'Cotton Futures', type: 'FUTURE', category: 'commodity', keywords: ['cotton', 'algodon', 'futures'] },
  { symbol: 'SB=F', name: 'Sugar Futures', type: 'FUTURE', category: 'commodity', keywords: ['sugar', 'azucar', 'futures'] },
  { symbol: 'CC=F', name: 'Cocoa Futures', type: 'FUTURE', category: 'commodity', keywords: ['cocoa', 'cacao', 'futures'] },

  // =====================
  // FOREX
  // =====================
  { symbol: 'EURUSD=X', name: 'EUR/USD', type: 'FOREX', category: 'forex', keywords: ['euro', 'dollar', 'eurusd', 'forex'] },
  { symbol: 'GBPUSD=X', name: 'GBP/USD', type: 'FOREX', category: 'forex', keywords: ['pound', 'libra', 'dollar', 'gbpusd', 'forex'] },
  { symbol: 'USDJPY=X', name: 'USD/JPY', type: 'FOREX', category: 'forex', keywords: ['dollar', 'yen', 'usdjpy', 'forex'] },
  { symbol: 'USDCHF=X', name: 'USD/CHF', type: 'FOREX', category: 'forex', keywords: ['dollar', 'franc', 'usdchf', 'forex'] },
  { symbol: 'AUDUSD=X', name: 'AUD/USD', type: 'FOREX', category: 'forex', keywords: ['aussie', 'dollar', 'audusd', 'forex'] },
  { symbol: 'USDCAD=X', name: 'USD/CAD', type: 'FOREX', category: 'forex', keywords: ['dollar', 'loonie', 'usdcad', 'forex'] },
  { symbol: 'NZDUSD=X', name: 'NZD/USD', type: 'FOREX', category: 'forex', keywords: ['kiwi', 'dollar', 'nzdusd', 'forex'] },
  { symbol: 'EURGBP=X', name: 'EUR/GBP', type: 'FOREX', category: 'forex', keywords: ['euro', 'pound', 'eurgbp', 'forex'] },
  { symbol: 'EURJPY=X', name: 'EUR/JPY', type: 'FOREX', category: 'forex', keywords: ['euro', 'yen', 'eurjpy', 'forex'] },
  { symbol: 'GBPJPY=X', name: 'GBP/JPY', type: 'FOREX', category: 'forex', keywords: ['pound', 'yen', 'gbpjpy', 'forex'] },
];

/**
 * Buscar en los activos de Trade Republic
 * @param query - Término de búsqueda
 * @returns Lista de activos que coinciden
 */
export function searchTradeRepublicAssets(query: string): TradeRepublicAsset[] {
  const normalizedQuery = query.toLowerCase().trim();
  
  if (normalizedQuery.length < 2) return [];
  
  const results: Array<{ asset: TradeRepublicAsset; score: number }> = [];
  
  for (const asset of tradeRepublicAssets) {
    let score = 0;
    
    // Coincidencia exacta del símbolo (máxima prioridad)
    if (asset.symbol.toLowerCase() === normalizedQuery) {
      score = 100;
    }
    // Símbolo empieza con la query
    else if (asset.symbol.toLowerCase().startsWith(normalizedQuery)) {
      score = 80;
    }
    // Símbolo contiene la query
    else if (asset.symbol.toLowerCase().includes(normalizedQuery)) {
      score = 60;
    }
    // Nombre contiene la query
    else if (asset.name.toLowerCase().includes(normalizedQuery)) {
      score = 50;
    }
    // ISIN coincide
    else if (asset.isin?.toLowerCase().includes(normalizedQuery)) {
      score = 70;
    }
    // Keywords coinciden
    else {
      for (const keyword of asset.keywords) {
        if (keyword.includes(normalizedQuery) || normalizedQuery.includes(keyword)) {
          score = Math.max(score, 40);
          break;
        }
      }
    }
    
    if (score > 0) {
      results.push({ asset, score });
    }
  }
  
  // Ordenar por score descendente
  results.sort((a, b) => b.score - a.score);
  
  return results.map(r => r.asset);
}
