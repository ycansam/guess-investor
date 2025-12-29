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
    symbol: 'SIVR.MI',
    name: 'iShares Physical Silver ETC',
    type: 'ETC',
    isin: 'IE00B4NCWG09',
    category: 'silver',
    keywords: ['silver', 'plata', 'ishares', 'physical silver', 'plata fisica'],
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
