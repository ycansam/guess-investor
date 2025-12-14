/**
 * Market Hours Service
 * Detecta horarios de apertura/cierre de bolsas mundiales
 * Indica si el mercado está abierto, cerrado, pre-market o after-hours
 */

// Definición de horarios de bolsas principales (hora local)
interface MarketSchedule {
  name: string;
  nameShort: string;
  timezone: string;
  utcOffset: number; // Offset en horas desde UTC (sin DST)
  dstOffset?: number; // Offset adicional en horario de verano
  dstStart?: { month: number; weekOfMonth: number; dayOfWeek: number }; // Cuándo empieza DST
  dstEnd?: { month: number; weekOfMonth: number; dayOfWeek: number }; // Cuándo termina DST
  regularOpen: { hour: number; minute: number };
  regularClose: { hour: number; minute: number };
  preMarketOpen?: { hour: number; minute: number };
  afterHoursClose?: { hour: number; minute: number };
  lunchBreak?: { start: { hour: number; minute: number }; end: { hour: number; minute: number } };
  weekendDays: number[]; // 0 = domingo, 6 = sábado
  holidays2025: string[]; // Festivos bursátiles 2025 en formato MM-DD
}

// Mapeo de sufijo de símbolo a bolsa
const EXCHANGE_SUFFIXES: Record<string, string> = {
  // Sin sufijo = USA (NYSE/NASDAQ)
  '': 'nyse',
  
  // Europa
  '.MC': 'madrid',      // Bolsa de Madrid
  '.L': 'london',       // London Stock Exchange
  '.PA': 'paris',       // Euronext Paris
  '.DE': 'frankfurt',   // Frankfurt (Xetra)
  '.F': 'frankfurt',    // Frankfurt
  '.AS': 'amsterdam',   // Euronext Amsterdam
  '.BR': 'brussels',    // Euronext Brussels
  '.MI': 'milan',       // Borsa Italiana
  '.SW': 'zurich',      // SIX Swiss
  '.VI': 'vienna',      // Vienna Stock Exchange
  '.ST': 'stockholm',   // Nasdaq Stockholm
  '.CO': 'copenhagen',  // Nasdaq Copenhagen
  '.HE': 'helsinki',    // Nasdaq Helsinki
  '.OL': 'oslo',        // Oslo Børs
  '.LS': 'lisbon',      // Euronext Lisbon
  '.WA': 'warsaw',      // Warsaw Stock Exchange
  '.IS': 'istanbul',    // Borsa Istanbul
  '.AT': 'athens',      // Athens Stock Exchange
  
  // América
  '.MX': 'mexico',      // Bolsa Mexicana de Valores
  '.SA': 'saopaulo',    // B3 São Paulo
  '.BA': 'buenosaires', // BYMA Buenos Aires
  '.SN': 'santiago',    // Bolsa de Santiago
  '.TO': 'toronto',     // Toronto Stock Exchange
  '.V': 'vancouver',    // TSX Venture
  
  // Asia-Pacífico
  '.T': 'tokyo',        // Tokyo Stock Exchange
  '.SS': 'shanghai',    // Shanghai Stock Exchange
  '.SZ': 'shenzhen',    // Shenzhen Stock Exchange
  '.HK': 'hongkong',    // Hong Kong Stock Exchange
  '.TW': 'taiwan',      // Taiwan Stock Exchange
  '.KS': 'seoul',       // Korea Exchange
  '.KQ': 'kosdaq',      // KOSDAQ
  '.SI': 'singapore',   // Singapore Exchange
  '.AX': 'sydney',      // Australian Securities Exchange
  '.NZ': 'newzealand',  // New Zealand Exchange
  '.NS': 'mumbai',      // NSE India
  '.BO': 'mumbai',      // BSE India
  '.BK': 'bangkok',     // Stock Exchange of Thailand
  '.JK': 'jakarta',     // Indonesia Stock Exchange
  '.KL': 'kualalumpur', // Bursa Malaysia
  
  // Oriente Medio y África
  '.TA': 'telaviv',     // Tel Aviv Stock Exchange
  '.SR': 'riyadh',      // Saudi Stock Exchange (Tadawul)
  '.AE': 'abudhabi',    // Abu Dhabi Securities Exchange
  '.DU': 'dubai',       // Dubai Financial Market
  '.JO': 'johannesburg', // Johannesburg Stock Exchange
};

// Horarios de las principales bolsas
const MARKET_SCHEDULES: Record<string, MarketSchedule> = {
  // === ESTADOS UNIDOS ===
  nyse: {
    name: 'New York Stock Exchange / NASDAQ',
    nameShort: 'NYSE',
    timezone: 'America/New_York',
    utcOffset: -5,
    dstOffset: 1,
    dstStart: { month: 3, weekOfMonth: 2, dayOfWeek: 0 }, // 2º domingo de marzo
    dstEnd: { month: 11, weekOfMonth: 1, dayOfWeek: 0 }, // 1er domingo de noviembre
    regularOpen: { hour: 9, minute: 30 },
    regularClose: { hour: 16, minute: 0 },
    preMarketOpen: { hour: 4, minute: 0 },
    afterHoursClose: { hour: 20, minute: 0 },
    weekendDays: [0, 6],
    holidays2025: [
      '01-01', // Año Nuevo
      '01-20', // Martin Luther King Jr. Day
      '02-17', // Presidents Day
      '04-18', // Good Friday
      '05-26', // Memorial Day
      '06-19', // Juneteenth
      '07-04', // Independence Day
      '09-01', // Labor Day
      '11-27', // Thanksgiving
      '12-25', // Christmas
    ],
  },

  // === EUROPA ===
  madrid: {
    name: 'Bolsa de Madrid (BME)',
    nameShort: 'BME',
    timezone: 'Europe/Madrid',
    utcOffset: 1,
    dstOffset: 1,
    dstStart: { month: 3, weekOfMonth: -1, dayOfWeek: 0 }, // Último domingo de marzo
    dstEnd: { month: 10, weekOfMonth: -1, dayOfWeek: 0 }, // Último domingo de octubre
    regularOpen: { hour: 9, minute: 0 },
    regularClose: { hour: 17, minute: 30 },
    weekendDays: [0, 6],
    holidays2025: [
      '01-01', // Año Nuevo
      '04-18', // Viernes Santo
      '05-01', // Día del Trabajo
      '12-25', // Navidad
      '12-26', // San Esteban
    ],
  },

  london: {
    name: 'London Stock Exchange',
    nameShort: 'LSE',
    timezone: 'Europe/London',
    utcOffset: 0,
    dstOffset: 1,
    dstStart: { month: 3, weekOfMonth: -1, dayOfWeek: 0 },
    dstEnd: { month: 10, weekOfMonth: -1, dayOfWeek: 0 },
    regularOpen: { hour: 8, minute: 0 },
    regularClose: { hour: 16, minute: 30 },
    weekendDays: [0, 6],
    holidays2025: [
      '01-01', // New Year
      '04-18', // Good Friday
      '04-21', // Easter Monday
      '05-05', // Early May Bank Holiday
      '05-26', // Spring Bank Holiday
      '08-25', // Summer Bank Holiday
      '12-25', // Christmas
      '12-26', // Boxing Day
    ],
  },

  paris: {
    name: 'Euronext Paris',
    nameShort: 'EPA',
    timezone: 'Europe/Paris',
    utcOffset: 1,
    dstOffset: 1,
    dstStart: { month: 3, weekOfMonth: -1, dayOfWeek: 0 },
    dstEnd: { month: 10, weekOfMonth: -1, dayOfWeek: 0 },
    regularOpen: { hour: 9, minute: 0 },
    regularClose: { hour: 17, minute: 30 },
    weekendDays: [0, 6],
    holidays2025: [
      '01-01', // Nouvel An
      '04-18', // Vendredi Saint
      '04-21', // Lundi de Pâques
      '05-01', // Fête du Travail
      '12-25', // Noël
      '12-26', // Saint-Étienne
    ],
  },

  frankfurt: {
    name: 'Frankfurt Stock Exchange (Xetra)',
    nameShort: 'FRA',
    timezone: 'Europe/Berlin',
    utcOffset: 1,
    dstOffset: 1,
    dstStart: { month: 3, weekOfMonth: -1, dayOfWeek: 0 },
    dstEnd: { month: 10, weekOfMonth: -1, dayOfWeek: 0 },
    regularOpen: { hour: 9, minute: 0 },
    regularClose: { hour: 17, minute: 30 },
    weekendDays: [0, 6],
    holidays2025: [
      '01-01', // Neujahr
      '04-18', // Karfreitag
      '04-21', // Ostermontag
      '05-01', // Tag der Arbeit
      '12-24', // Heiligabend
      '12-25', // Weihnachten
      '12-26', // 2. Weihnachtstag
      '12-31', // Silvester
    ],
  },

  amsterdam: {
    name: 'Euronext Amsterdam',
    nameShort: 'AMS',
    timezone: 'Europe/Amsterdam',
    utcOffset: 1,
    dstOffset: 1,
    dstStart: { month: 3, weekOfMonth: -1, dayOfWeek: 0 },
    dstEnd: { month: 10, weekOfMonth: -1, dayOfWeek: 0 },
    regularOpen: { hour: 9, minute: 0 },
    regularClose: { hour: 17, minute: 30 },
    weekendDays: [0, 6],
    holidays2025: [
      '01-01', '04-18', '04-21', '04-27', '05-01', '12-25', '12-26',
    ],
  },

  brussels: {
    name: 'Euronext Brussels',
    nameShort: 'EBR',
    timezone: 'Europe/Brussels',
    utcOffset: 1,
    dstOffset: 1,
    dstStart: { month: 3, weekOfMonth: -1, dayOfWeek: 0 },
    dstEnd: { month: 10, weekOfMonth: -1, dayOfWeek: 0 },
    regularOpen: { hour: 9, minute: 0 },
    regularClose: { hour: 17, minute: 30 },
    weekendDays: [0, 6],
    holidays2025: ['01-01', '04-18', '04-21', '05-01', '12-25', '12-26'],
  },

  milan: {
    name: 'Borsa Italiana',
    nameShort: 'BIT',
    timezone: 'Europe/Rome',
    utcOffset: 1,
    dstOffset: 1,
    dstStart: { month: 3, weekOfMonth: -1, dayOfWeek: 0 },
    dstEnd: { month: 10, weekOfMonth: -1, dayOfWeek: 0 },
    regularOpen: { hour: 9, minute: 0 },
    regularClose: { hour: 17, minute: 30 },
    weekendDays: [0, 6],
    holidays2025: ['01-01', '04-18', '04-21', '05-01', '08-15', '12-24', '12-25', '12-26', '12-31'],
  },

  zurich: {
    name: 'SIX Swiss Exchange',
    nameShort: 'SWX',
    timezone: 'Europe/Zurich',
    utcOffset: 1,
    dstOffset: 1,
    dstStart: { month: 3, weekOfMonth: -1, dayOfWeek: 0 },
    dstEnd: { month: 10, weekOfMonth: -1, dayOfWeek: 0 },
    regularOpen: { hour: 9, minute: 0 },
    regularClose: { hour: 17, minute: 30 },
    weekendDays: [0, 6],
    holidays2025: ['01-01', '01-02', '04-18', '04-21', '05-01', '05-29', '06-09', '08-01', '12-24', '12-25', '12-26', '12-31'],
  },

  stockholm: {
    name: 'Nasdaq Stockholm',
    nameShort: 'STO',
    timezone: 'Europe/Stockholm',
    utcOffset: 1,
    dstOffset: 1,
    dstStart: { month: 3, weekOfMonth: -1, dayOfWeek: 0 },
    dstEnd: { month: 10, weekOfMonth: -1, dayOfWeek: 0 },
    regularOpen: { hour: 9, minute: 0 },
    regularClose: { hour: 17, minute: 30 },
    weekendDays: [0, 6],
    holidays2025: ['01-01', '01-06', '04-18', '04-21', '05-01', '05-29', '06-06', '06-20', '12-24', '12-25', '12-26', '12-31'],
  },

  copenhagen: {
    name: 'Nasdaq Copenhagen',
    nameShort: 'CPH',
    timezone: 'Europe/Copenhagen',
    utcOffset: 1,
    dstOffset: 1,
    dstStart: { month: 3, weekOfMonth: -1, dayOfWeek: 0 },
    dstEnd: { month: 10, weekOfMonth: -1, dayOfWeek: 0 },
    regularOpen: { hour: 9, minute: 0 },
    regularClose: { hour: 17, minute: 0 },
    weekendDays: [0, 6],
    holidays2025: ['01-01', '04-17', '04-18', '04-21', '05-16', '05-29', '06-05', '12-24', '12-25', '12-26', '12-31'],
  },

  helsinki: {
    name: 'Nasdaq Helsinki',
    nameShort: 'HEL',
    timezone: 'Europe/Helsinki',
    utcOffset: 2,
    dstOffset: 1,
    dstStart: { month: 3, weekOfMonth: -1, dayOfWeek: 0 },
    dstEnd: { month: 10, weekOfMonth: -1, dayOfWeek: 0 },
    regularOpen: { hour: 10, minute: 0 },
    regularClose: { hour: 18, minute: 30 },
    weekendDays: [0, 6],
    holidays2025: ['01-01', '01-06', '04-18', '04-21', '05-01', '05-29', '06-20', '12-06', '12-24', '12-25', '12-26'],
  },

  oslo: {
    name: 'Oslo Børs',
    nameShort: 'OSL',
    timezone: 'Europe/Oslo',
    utcOffset: 1,
    dstOffset: 1,
    dstStart: { month: 3, weekOfMonth: -1, dayOfWeek: 0 },
    dstEnd: { month: 10, weekOfMonth: -1, dayOfWeek: 0 },
    regularOpen: { hour: 9, minute: 0 },
    regularClose: { hour: 16, minute: 20 },
    weekendDays: [0, 6],
    holidays2025: ['01-01', '04-17', '04-18', '04-21', '05-01', '05-17', '05-29', '06-09', '12-24', '12-25', '12-26', '12-31'],
  },

  lisbon: {
    name: 'Euronext Lisbon',
    nameShort: 'ELI',
    timezone: 'Europe/Lisbon',
    utcOffset: 0,
    dstOffset: 1,
    dstStart: { month: 3, weekOfMonth: -1, dayOfWeek: 0 },
    dstEnd: { month: 10, weekOfMonth: -1, dayOfWeek: 0 },
    regularOpen: { hour: 8, minute: 0 },
    regularClose: { hour: 16, minute: 30 },
    weekendDays: [0, 6],
    holidays2025: ['01-01', '04-18', '04-21', '05-01', '12-25', '12-26'],
  },

  warsaw: {
    name: 'Warsaw Stock Exchange',
    nameShort: 'WSE',
    timezone: 'Europe/Warsaw',
    utcOffset: 1,
    dstOffset: 1,
    dstStart: { month: 3, weekOfMonth: -1, dayOfWeek: 0 },
    dstEnd: { month: 10, weekOfMonth: -1, dayOfWeek: 0 },
    regularOpen: { hour: 9, minute: 0 },
    regularClose: { hour: 17, minute: 0 },
    weekendDays: [0, 6],
    holidays2025: ['01-01', '01-06', '04-21', '05-01', '05-03', '06-19', '08-15', '11-01', '11-11', '12-25', '12-26'],
  },

  istanbul: {
    name: 'Borsa Istanbul',
    nameShort: 'BIST',
    timezone: 'Europe/Istanbul',
    utcOffset: 3,
    regularOpen: { hour: 10, minute: 0 },
    regularClose: { hour: 18, minute: 0 },
    lunchBreak: { start: { hour: 13, minute: 0 }, end: { hour: 14, minute: 0 } },
    weekendDays: [0, 6],
    holidays2025: ['01-01', '04-23', '05-01', '05-19', '06-06', '06-07', '06-08', '06-09', '07-15', '08-30', '10-29'],
  },

  athens: {
    name: 'Athens Stock Exchange',
    nameShort: 'ATH',
    timezone: 'Europe/Athens',
    utcOffset: 2,
    dstOffset: 1,
    dstStart: { month: 3, weekOfMonth: -1, dayOfWeek: 0 },
    dstEnd: { month: 10, weekOfMonth: -1, dayOfWeek: 0 },
    regularOpen: { hour: 10, minute: 0 },
    regularClose: { hour: 17, minute: 20 },
    weekendDays: [0, 6],
    holidays2025: ['01-01', '01-06', '03-03', '03-25', '04-18', '04-21', '05-01', '06-09', '08-15', '10-28', '12-25', '12-26'],
  },

  vienna: {
    name: 'Vienna Stock Exchange',
    nameShort: 'VIE',
    timezone: 'Europe/Vienna',
    utcOffset: 1,
    dstOffset: 1,
    dstStart: { month: 3, weekOfMonth: -1, dayOfWeek: 0 },
    dstEnd: { month: 10, weekOfMonth: -1, dayOfWeek: 0 },
    regularOpen: { hour: 9, minute: 0 },
    regularClose: { hour: 17, minute: 30 },
    weekendDays: [0, 6],
    holidays2025: ['01-01', '04-18', '04-21', '05-01', '05-29', '06-09', '06-19', '08-15', '10-26', '11-01', '12-08', '12-24', '12-25', '12-26', '12-31'],
  },

  // === AMÉRICA ===
  mexico: {
    name: 'Bolsa Mexicana de Valores',
    nameShort: 'BMV',
    timezone: 'America/Mexico_City',
    utcOffset: -6,
    dstOffset: 1,
    dstStart: { month: 4, weekOfMonth: 1, dayOfWeek: 0 },
    dstEnd: { month: 10, weekOfMonth: -1, dayOfWeek: 0 },
    regularOpen: { hour: 8, minute: 30 },
    regularClose: { hour: 15, minute: 0 },
    weekendDays: [0, 6],
    holidays2025: ['01-01', '02-03', '03-17', '04-17', '04-18', '05-01', '05-05', '09-16', '11-17', '12-12', '12-25'],
  },

  saopaulo: {
    name: 'B3 - Brasil Bolsa Balcão',
    nameShort: 'B3',
    timezone: 'America/Sao_Paulo',
    utcOffset: -3,
    regularOpen: { hour: 10, minute: 0 },
    regularClose: { hour: 17, minute: 55 },
    preMarketOpen: { hour: 9, minute: 45 },
    afterHoursClose: { hour: 18, minute: 30 },
    weekendDays: [0, 6],
    holidays2025: ['01-01', '03-03', '03-04', '04-18', '04-21', '05-01', '06-19', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'],
  },

  buenosaires: {
    name: 'BYMA Buenos Aires',
    nameShort: 'BYMA',
    timezone: 'America/Argentina/Buenos_Aires',
    utcOffset: -3,
    regularOpen: { hour: 11, minute: 0 },
    regularClose: { hour: 17, minute: 0 },
    weekendDays: [0, 6],
    holidays2025: ['01-01', '03-03', '03-04', '03-24', '04-02', '04-18', '05-01', '05-25', '06-16', '06-20', '07-09', '08-18', '10-13', '11-24', '12-08', '12-25'],
  },

  santiago: {
    name: 'Bolsa de Santiago',
    nameShort: 'BCS',
    timezone: 'America/Santiago',
    utcOffset: -4,
    dstOffset: 1,
    dstStart: { month: 9, weekOfMonth: 1, dayOfWeek: 0 },
    dstEnd: { month: 4, weekOfMonth: 1, dayOfWeek: 0 },
    regularOpen: { hour: 9, minute: 30 },
    regularClose: { hour: 16, minute: 0 },
    weekendDays: [0, 6],
    holidays2025: ['01-01', '04-18', '04-19', '05-01', '05-21', '06-29', '07-16', '08-15', '09-18', '09-19', '10-12', '10-31', '11-01', '12-08', '12-25'],
  },

  toronto: {
    name: 'Toronto Stock Exchange',
    nameShort: 'TSX',
    timezone: 'America/Toronto',
    utcOffset: -5,
    dstOffset: 1,
    dstStart: { month: 3, weekOfMonth: 2, dayOfWeek: 0 },
    dstEnd: { month: 11, weekOfMonth: 1, dayOfWeek: 0 },
    regularOpen: { hour: 9, minute: 30 },
    regularClose: { hour: 16, minute: 0 },
    preMarketOpen: { hour: 7, minute: 0 },
    afterHoursClose: { hour: 17, minute: 0 },
    weekendDays: [0, 6],
    holidays2025: ['01-01', '02-17', '04-18', '05-19', '07-01', '08-04', '09-01', '10-13', '11-11', '12-25', '12-26'],
  },

  vancouver: {
    name: 'TSX Venture Exchange',
    nameShort: 'TSXV',
    timezone: 'America/Vancouver',
    utcOffset: -8,
    dstOffset: 1,
    dstStart: { month: 3, weekOfMonth: 2, dayOfWeek: 0 },
    dstEnd: { month: 11, weekOfMonth: 1, dayOfWeek: 0 },
    regularOpen: { hour: 6, minute: 30 },
    regularClose: { hour: 13, minute: 0 },
    weekendDays: [0, 6],
    holidays2025: ['01-01', '02-17', '04-18', '05-19', '07-01', '08-04', '09-01', '10-13', '11-11', '12-25', '12-26'],
  },

  // === ASIA-PACÍFICO ===
  tokyo: {
    name: 'Tokyo Stock Exchange',
    nameShort: 'TSE',
    timezone: 'Asia/Tokyo',
    utcOffset: 9,
    regularOpen: { hour: 9, minute: 0 },
    regularClose: { hour: 15, minute: 0 },
    lunchBreak: { start: { hour: 11, minute: 30 }, end: { hour: 12, minute: 30 } },
    weekendDays: [0, 6],
    holidays2025: ['01-01', '01-02', '01-03', '01-13', '02-11', '02-23', '02-24', '03-20', '04-29', '05-03', '05-04', '05-05', '05-06', '07-21', '08-11', '09-15', '09-23', '10-13', '11-03', '11-23', '11-24', '12-31'],
  },

  shanghai: {
    name: 'Shanghai Stock Exchange',
    nameShort: 'SSE',
    timezone: 'Asia/Shanghai',
    utcOffset: 8,
    regularOpen: { hour: 9, minute: 30 },
    regularClose: { hour: 15, minute: 0 },
    lunchBreak: { start: { hour: 11, minute: 30 }, end: { hour: 13, minute: 0 } },
    weekendDays: [0, 6],
    holidays2025: ['01-01', '01-28', '01-29', '01-30', '01-31', '02-01', '02-02', '02-03', '02-04', '04-04', '04-05', '04-06', '05-01', '05-02', '05-03', '05-04', '05-05', '06-02', '09-15', '10-01', '10-02', '10-03', '10-04', '10-05', '10-06', '10-07'],
  },

  shenzhen: {
    name: 'Shenzhen Stock Exchange',
    nameShort: 'SZSE',
    timezone: 'Asia/Shanghai',
    utcOffset: 8,
    regularOpen: { hour: 9, minute: 30 },
    regularClose: { hour: 15, minute: 0 },
    lunchBreak: { start: { hour: 11, minute: 30 }, end: { hour: 13, minute: 0 } },
    weekendDays: [0, 6],
    holidays2025: ['01-01', '01-28', '01-29', '01-30', '01-31', '02-01', '02-02', '02-03', '02-04', '04-04', '04-05', '04-06', '05-01', '05-02', '05-03', '05-04', '05-05', '06-02', '09-15', '10-01', '10-02', '10-03', '10-04', '10-05', '10-06', '10-07'],
  },

  hongkong: {
    name: 'Hong Kong Stock Exchange',
    nameShort: 'HKEX',
    timezone: 'Asia/Hong_Kong',
    utcOffset: 8,
    regularOpen: { hour: 9, minute: 30 },
    regularClose: { hour: 16, minute: 0 },
    lunchBreak: { start: { hour: 12, minute: 0 }, end: { hour: 13, minute: 0 } },
    weekendDays: [0, 6],
    holidays2025: ['01-01', '01-29', '01-30', '01-31', '04-04', '04-18', '04-21', '05-01', '05-05', '06-02', '07-01', '10-01', '10-07', '12-25', '12-26'],
  },

  taiwan: {
    name: 'Taiwan Stock Exchange',
    nameShort: 'TWSE',
    timezone: 'Asia/Taipei',
    utcOffset: 8,
    regularOpen: { hour: 9, minute: 0 },
    regularClose: { hour: 13, minute: 30 },
    weekendDays: [0, 6],
    holidays2025: ['01-01', '01-27', '01-28', '01-29', '01-30', '01-31', '02-28', '04-03', '04-04', '05-01', '06-02', '09-29', '10-10'],
  },

  seoul: {
    name: 'Korea Exchange',
    nameShort: 'KRX',
    timezone: 'Asia/Seoul',
    utcOffset: 9,
    regularOpen: { hour: 9, minute: 0 },
    regularClose: { hour: 15, minute: 30 },
    weekendDays: [0, 6],
    holidays2025: ['01-01', '01-28', '01-29', '01-30', '03-01', '05-05', '05-06', '06-06', '08-15', '10-06', '10-07', '10-08', '10-09', '12-25'],
  },

  kosdaq: {
    name: 'KOSDAQ',
    nameShort: 'KOSDAQ',
    timezone: 'Asia/Seoul',
    utcOffset: 9,
    regularOpen: { hour: 9, minute: 0 },
    regularClose: { hour: 15, minute: 30 },
    weekendDays: [0, 6],
    holidays2025: ['01-01', '01-28', '01-29', '01-30', '03-01', '05-05', '05-06', '06-06', '08-15', '10-06', '10-07', '10-08', '10-09', '12-25'],
  },

  singapore: {
    name: 'Singapore Exchange',
    nameShort: 'SGX',
    timezone: 'Asia/Singapore',
    utcOffset: 8,
    regularOpen: { hour: 9, minute: 0 },
    regularClose: { hour: 17, minute: 0 },
    weekendDays: [0, 6],
    holidays2025: ['01-01', '01-29', '01-30', '04-18', '05-01', '05-12', '06-06', '08-09', '10-20', '11-01', '12-25'],
  },

  sydney: {
    name: 'Australian Securities Exchange',
    nameShort: 'ASX',
    timezone: 'Australia/Sydney',
    utcOffset: 10,
    dstOffset: 1,
    dstStart: { month: 10, weekOfMonth: 1, dayOfWeek: 0 },
    dstEnd: { month: 4, weekOfMonth: 1, dayOfWeek: 0 },
    regularOpen: { hour: 10, minute: 0 },
    regularClose: { hour: 16, minute: 0 },
    preMarketOpen: { hour: 7, minute: 0 },
    weekendDays: [0, 6],
    holidays2025: ['01-01', '01-27', '04-18', '04-21', '04-25', '06-09', '12-25', '12-26'],
  },

  newzealand: {
    name: 'New Zealand Exchange',
    nameShort: 'NZX',
    timezone: 'Pacific/Auckland',
    utcOffset: 12,
    dstOffset: 1,
    dstStart: { month: 9, weekOfMonth: -1, dayOfWeek: 0 },
    dstEnd: { month: 4, weekOfMonth: 1, dayOfWeek: 0 },
    regularOpen: { hour: 10, minute: 0 },
    regularClose: { hour: 16, minute: 45 },
    weekendDays: [0, 6],
    holidays2025: ['01-01', '01-02', '01-27', '02-06', '04-18', '04-21', '04-25', '06-02', '10-27', '12-25', '12-26'],
  },

  mumbai: {
    name: 'National Stock Exchange of India',
    nameShort: 'NSE',
    timezone: 'Asia/Kolkata',
    utcOffset: 5.5,
    regularOpen: { hour: 9, minute: 15 },
    regularClose: { hour: 15, minute: 30 },
    preMarketOpen: { hour: 9, minute: 0 },
    weekendDays: [0, 6],
    holidays2025: ['01-26', '02-26', '03-14', '03-31', '04-10', '04-14', '04-18', '05-01', '08-15', '08-27', '10-02', '10-21', '10-22', '11-01', '11-05', '12-25'],
  },

  bangkok: {
    name: 'Stock Exchange of Thailand',
    nameShort: 'SET',
    timezone: 'Asia/Bangkok',
    utcOffset: 7,
    regularOpen: { hour: 10, minute: 0 },
    regularClose: { hour: 16, minute: 30 },
    lunchBreak: { start: { hour: 12, minute: 30 }, end: { hour: 14, minute: 30 } },
    weekendDays: [0, 6],
    holidays2025: ['01-01', '02-12', '04-07', '04-14', '04-15', '04-16', '05-01', '05-12', '06-03', '07-28', '08-12', '10-13', '10-23', '12-05', '12-10', '12-31'],
  },

  jakarta: {
    name: 'Indonesia Stock Exchange',
    nameShort: 'IDX',
    timezone: 'Asia/Jakarta',
    utcOffset: 7,
    regularOpen: { hour: 9, minute: 0 },
    regularClose: { hour: 16, minute: 0 },
    weekendDays: [0, 6],
    holidays2025: ['01-01', '01-27', '01-29', '03-29', '03-31', '04-18', '05-01', '05-12', '05-29', '06-01', '06-06', '06-07', '08-17', '09-05', '12-25'],
  },

  kualalumpur: {
    name: 'Bursa Malaysia',
    nameShort: 'KLSE',
    timezone: 'Asia/Kuala_Lumpur',
    utcOffset: 8,
    regularOpen: { hour: 9, minute: 0 },
    regularClose: { hour: 17, minute: 0 },
    lunchBreak: { start: { hour: 12, minute: 30 }, end: { hour: 14, minute: 30 } },
    weekendDays: [0, 6],
    holidays2025: ['01-01', '01-29', '01-30', '02-01', '03-18', '03-31', '04-18', '05-01', '05-12', '05-17', '06-03', '06-07', '07-07', '08-31', '09-16', '10-20', '11-09', '12-25'],
  },

  // === ORIENTE MEDIO Y ÁFRICA ===
  telaviv: {
    name: 'Tel Aviv Stock Exchange',
    nameShort: 'TASE',
    timezone: 'Asia/Jerusalem',
    utcOffset: 2,
    dstOffset: 1,
    dstStart: { month: 3, weekOfMonth: -1, dayOfWeek: 5 },
    dstEnd: { month: 10, weekOfMonth: -1, dayOfWeek: 0 },
    regularOpen: { hour: 10, minute: 0 },
    regularClose: { hour: 17, minute: 25 },
    weekendDays: [5, 6], // Viernes y sábado
    holidays2025: ['04-13', '04-14', '04-17', '05-02', '06-02', '10-03', '10-07', '10-08', '10-14'],
  },

  riyadh: {
    name: 'Saudi Stock Exchange (Tadawul)',
    nameShort: 'TADAWUL',
    timezone: 'Asia/Riyadh',
    utcOffset: 3,
    regularOpen: { hour: 10, minute: 0 },
    regularClose: { hour: 15, minute: 0 },
    weekendDays: [5, 6], // Viernes y sábado
    holidays2025: ['03-30', '03-31', '04-01', '04-02', '06-05', '06-06', '06-07', '06-08', '06-09', '06-10', '09-23'],
  },

  abudhabi: {
    name: 'Abu Dhabi Securities Exchange',
    nameShort: 'ADX',
    timezone: 'Asia/Dubai',
    utcOffset: 4,
    regularOpen: { hour: 10, minute: 0 },
    regularClose: { hour: 14, minute: 0 },
    weekendDays: [5, 6],
    holidays2025: ['01-01', '03-30', '03-31', '04-01', '06-06', '06-07', '06-08', '07-18', '12-02', '12-03'],
  },

  dubai: {
    name: 'Dubai Financial Market',
    nameShort: 'DFM',
    timezone: 'Asia/Dubai',
    utcOffset: 4,
    regularOpen: { hour: 10, minute: 0 },
    regularClose: { hour: 14, minute: 0 },
    weekendDays: [5, 6],
    holidays2025: ['01-01', '03-30', '03-31', '04-01', '06-06', '06-07', '06-08', '07-18', '12-02', '12-03'],
  },

  johannesburg: {
    name: 'Johannesburg Stock Exchange',
    nameShort: 'JSE',
    timezone: 'Africa/Johannesburg',
    utcOffset: 2,
    regularOpen: { hour: 9, minute: 0 },
    regularClose: { hour: 17, minute: 0 },
    weekendDays: [0, 6],
    holidays2025: ['01-01', '03-21', '04-18', '04-21', '04-27', '04-28', '05-01', '06-16', '08-09', '09-24', '12-16', '12-25', '12-26'],
  },
};

// Estado del mercado
export type MarketStatus = 'open' | 'closed' | 'pre-market' | 'after-hours' | 'lunch-break' | 'holiday' | 'weekend';

export interface MarketHoursInfo {
  exchange: string;
  exchangeShort: string;
  status: MarketStatus;
  statusEmoji: string;
  statusText: string;
  localTime: string;
  nextEvent: string;
  nextEventTime: string;
  regularHours: string;
  hasExtendedHours: boolean;
  timezone: string;
  isHoliday: boolean;
  holidayName?: string;
}

/**
 * Detecta el exchange basándose en el sufijo del símbolo
 */
function detectExchange(symbol: string): string {
  // Buscar el sufijo más largo que coincida
  let bestMatch = 'nyse'; // Por defecto USA
  let longestSuffix = 0;

  for (const [suffix, exchange] of Object.entries(EXCHANGE_SUFFIXES)) {
    if (suffix.length > 0 && symbol.toUpperCase().endsWith(suffix.toUpperCase())) {
      if (suffix.length > longestSuffix) {
        longestSuffix = suffix.length;
        bestMatch = exchange;
      }
    }
  }

  return bestMatch;
}

/**
 * Calcula si hay DST (horario de verano) activo
 */
function isDSTActive(schedule: MarketSchedule, date: Date): boolean {
  if (!schedule.dstStart || !schedule.dstEnd || !schedule.dstOffset) {
    return false;
  }

  const year = date.getFullYear();
  
  // Calcular fecha de inicio de DST
  const dstStartDate = getNthDayOfMonth(year, schedule.dstStart.month, schedule.dstStart.dayOfWeek, schedule.dstStart.weekOfMonth);
  const dstEndDate = getNthDayOfMonth(year, schedule.dstEnd.month, schedule.dstEnd.dayOfWeek, schedule.dstEnd.weekOfMonth);

  // Manejar hemisferio sur donde DST cruza el año
  if (schedule.dstStart.month > schedule.dstEnd.month) {
    return date >= dstStartDate || date < dstEndDate;
  }

  return date >= dstStartDate && date < dstEndDate;
}

/**
 * Obtiene el n-ésimo día de la semana de un mes
 */
function getNthDayOfMonth(year: number, month: number, dayOfWeek: number, weekOfMonth: number): Date {
  if (weekOfMonth === -1) {
    // Último del mes
    const lastDay = new Date(year, month, 0);
    const diff = (lastDay.getDay() - dayOfWeek + 7) % 7;
    lastDay.setDate(lastDay.getDate() - diff);
    return lastDay;
  }

  const firstDay = new Date(year, month - 1, 1);
  const diff = (dayOfWeek - firstDay.getDay() + 7) % 7;
  const nthDay = 1 + diff + (weekOfMonth - 1) * 7;
  return new Date(year, month - 1, nthDay);
}

/**
 * Convierte hora UTC a hora local del mercado
 */
function getMarketLocalTime(schedule: MarketSchedule, utcDate: Date): Date {
  let offset = schedule.utcOffset;
  if (isDSTActive(schedule, utcDate)) {
    offset += schedule.dstOffset || 0;
  }
  
  const localTime = new Date(utcDate.getTime() + offset * 60 * 60 * 1000);
  return localTime;
}

/**
 * Formatea hora en formato HH:MM
 */
function formatTime(hour: number, minute: number): string {
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

/**
 * Verifica si es un día festivo bursátil
 */
function isMarketHoliday(schedule: MarketSchedule, date: Date): boolean {
  const monthDay = `${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
  return schedule.holidays2025.includes(monthDay);
}

/**
 * Obtiene el estado actual del mercado
 */
function getMarketStatus(schedule: MarketSchedule, localTime: Date): { status: MarketStatus; inLunchBreak: boolean } {
  const dayOfWeek = localTime.getDay();
  const currentMinutes = localTime.getHours() * 60 + localTime.getMinutes();

  // Verificar fin de semana
  if (schedule.weekendDays.includes(dayOfWeek)) {
    return { status: 'weekend', inLunchBreak: false };
  }

  // Verificar festivo
  if (isMarketHoliday(schedule, localTime)) {
    return { status: 'holiday', inLunchBreak: false };
  }

  const openMinutes = schedule.regularOpen.hour * 60 + schedule.regularOpen.minute;
  const closeMinutes = schedule.regularClose.hour * 60 + schedule.regularClose.minute;

  // Verificar descanso para almuerzo
  if (schedule.lunchBreak) {
    const lunchStartMinutes = schedule.lunchBreak.start.hour * 60 + schedule.lunchBreak.start.minute;
    const lunchEndMinutes = schedule.lunchBreak.end.hour * 60 + schedule.lunchBreak.end.minute;
    
    if (currentMinutes >= lunchStartMinutes && currentMinutes < lunchEndMinutes) {
      return { status: 'lunch-break', inLunchBreak: true };
    }
  }

  // Verificar horario regular
  if (currentMinutes >= openMinutes && currentMinutes < closeMinutes) {
    return { status: 'open', inLunchBreak: false };
  }

  // Verificar pre-market
  if (schedule.preMarketOpen) {
    const preMarketMinutes = schedule.preMarketOpen.hour * 60 + schedule.preMarketOpen.minute;
    if (currentMinutes >= preMarketMinutes && currentMinutes < openMinutes) {
      return { status: 'pre-market', inLunchBreak: false };
    }
  }

  // Verificar after-hours
  if (schedule.afterHoursClose) {
    const afterHoursMinutes = schedule.afterHoursClose.hour * 60 + schedule.afterHoursClose.minute;
    if (currentMinutes >= closeMinutes && currentMinutes < afterHoursMinutes) {
      return { status: 'after-hours', inLunchBreak: false };
    }
  }

  return { status: 'closed', inLunchBreak: false };
}

/**
 * Calcula el próximo evento del mercado
 */
function getNextEvent(schedule: MarketSchedule, localTime: Date, status: MarketStatus): { event: string; time: string } {
  const currentMinutes = localTime.getHours() * 60 + localTime.getMinutes();
  const openMinutes = schedule.regularOpen.hour * 60 + schedule.regularOpen.minute;
  const closeMinutes = schedule.regularClose.hour * 60 + schedule.regularClose.minute;

  switch (status) {
    case 'open':
      // Verificar si viene descanso de almuerzo
      if (schedule.lunchBreak) {
        const lunchStartMinutes = schedule.lunchBreak.start.hour * 60 + schedule.lunchBreak.start.minute;
        if (currentMinutes < lunchStartMinutes) {
          return {
            event: 'Descanso almuerzo',
            time: formatTime(schedule.lunchBreak.start.hour, schedule.lunchBreak.start.minute),
          };
        }
      }
      return {
        event: 'Cierre',
        time: formatTime(schedule.regularClose.hour, schedule.regularClose.minute),
      };

    case 'lunch-break':
      return {
        event: 'Reapertura',
        time: formatTime(schedule.lunchBreak!.end.hour, schedule.lunchBreak!.end.minute),
      };

    case 'pre-market':
      return {
        event: 'Apertura regular',
        time: formatTime(schedule.regularOpen.hour, schedule.regularOpen.minute),
      };

    case 'after-hours':
      return {
        event: 'Fin after-hours',
        time: formatTime(schedule.afterHoursClose!.hour, schedule.afterHoursClose!.minute),
      };

    case 'closed':
      if (currentMinutes < openMinutes) {
        if (schedule.preMarketOpen) {
          const preMarketMinutes = schedule.preMarketOpen.hour * 60 + schedule.preMarketOpen.minute;
          if (currentMinutes < preMarketMinutes) {
            return {
              event: 'Pre-market',
              time: formatTime(schedule.preMarketOpen.hour, schedule.preMarketOpen.minute),
            };
          }
        }
        return {
          event: 'Apertura',
          time: formatTime(schedule.regularOpen.hour, schedule.regularOpen.minute),
        };
      }
      // Después del cierre, próxima apertura es mañana
      return {
        event: 'Próxima apertura',
        time: `Mañana ${formatTime(schedule.regularOpen.hour, schedule.regularOpen.minute)}`,
      };

    case 'weekend':
    case 'holiday':
      return {
        event: 'Próxima apertura',
        time: `Lunes ${formatTime(schedule.regularOpen.hour, schedule.regularOpen.minute)}`,
      };

    default:
      return { event: '', time: '' };
  }
}

/**
 * Obtiene emoji y texto para el estado
 */
function getStatusDisplay(status: MarketStatus): { emoji: string; text: string } {
  switch (status) {
    case 'open':
      return { emoji: '🟢', text: 'Abierto' };
    case 'closed':
      return { emoji: '🔴', text: 'Cerrado' };
    case 'pre-market':
      return { emoji: '🟡', text: 'Pre-Market' };
    case 'after-hours':
      return { emoji: '🟠', text: 'After-Hours' };
    case 'lunch-break':
      return { emoji: '🍽️', text: 'Descanso' };
    case 'holiday':
      return { emoji: '📅', text: 'Festivo' };
    case 'weekend':
      return { emoji: '📅', text: 'Fin de semana' };
    default:
      return { emoji: '⚪', text: 'Desconocido' };
  }
}

/**
 * Obtiene información completa de horarios del mercado
 */
export function getMarketHours(symbol: string): MarketHoursInfo {
  const exchangeKey = detectExchange(symbol);
  const schedule = MARKET_SCHEDULES[exchangeKey] || MARKET_SCHEDULES.nyse;

  const now = new Date();
  const marketLocalTime = getMarketLocalTime(schedule, now);
  const { status } = getMarketStatus(schedule, marketLocalTime);
  const { emoji, text } = getStatusDisplay(status);
  const nextEvent = getNextEvent(schedule, marketLocalTime, status);

  const regularHours = `${formatTime(schedule.regularOpen.hour, schedule.regularOpen.minute)} - ${formatTime(schedule.regularClose.hour, schedule.regularClose.minute)}`;

  // Formatear hora local del mercado
  const localTimeStr = `${marketLocalTime.getHours().toString().padStart(2, '0')}:${marketLocalTime.getMinutes().toString().padStart(2, '0')}`;

  return {
    exchange: schedule.name,
    exchangeShort: schedule.nameShort,
    status,
    statusEmoji: emoji,
    statusText: text,
    localTime: localTimeStr,
    nextEvent: nextEvent.event,
    nextEventTime: nextEvent.time,
    regularHours,
    hasExtendedHours: !!(schedule.preMarketOpen || schedule.afterHoursClose),
    timezone: schedule.timezone,
    isHoliday: status === 'holiday',
  };
}

/**
 * Verifica si el usuario puede operar ahora mismo
 */
export function canTradeNow(symbol: string): { canTrade: boolean; reason: string; suggestion: string } {
  const info = getMarketHours(symbol);

  switch (info.status) {
    case 'open':
      return {
        canTrade: true,
        reason: `El mercado ${info.exchangeShort} está abierto`,
        suggestion: `Puedes operar ahora. Cierra a las ${info.nextEventTime}`,
      };

    case 'pre-market':
      return {
        canTrade: true,
        reason: `${info.exchangeShort} en horario pre-market`,
        suggestion: 'Operaciones con liquidez limitada. Apertura regular próximamente.',
      };

    case 'after-hours':
      return {
        canTrade: true,
        reason: `${info.exchangeShort} en horario after-hours`,
        suggestion: 'Operaciones con liquidez limitada y mayor spread.',
      };

    case 'lunch-break':
      return {
        canTrade: false,
        reason: `${info.exchangeShort} en descanso de almuerzo`,
        suggestion: `Reabre a las ${info.nextEventTime}`,
      };

    case 'closed':
      return {
        canTrade: false,
        reason: `${info.exchangeShort} cerrado`,
        suggestion: `${info.nextEvent} a las ${info.nextEventTime}`,
      };

    case 'holiday':
      return {
        canTrade: false,
        reason: `${info.exchangeShort} cerrado por festivo`,
        suggestion: 'El mercado reabrirá el próximo día hábil.',
      };

    case 'weekend':
      return {
        canTrade: false,
        reason: `${info.exchangeShort} cerrado por fin de semana`,
        suggestion: 'El mercado reabrirá el lunes.',
      };

    default:
      return {
        canTrade: false,
        reason: 'Estado del mercado desconocido',
        suggestion: 'Verifica el horario del mercado.',
      };
  }
}

/**
 * Obtiene un resumen compacto del estado del mercado
 */
export function getMarketStatusSummary(symbol: string): string {
  const info = getMarketHours(symbol);
  const tradeInfo = canTradeNow(symbol);

  if (info.status === 'open') {
    return `${info.statusEmoji} ${info.exchangeShort} abierto (${info.localTime} local) · Cierra ${info.nextEventTime}`;
  }

  if (info.status === 'pre-market' || info.status === 'after-hours') {
    return `${info.statusEmoji} ${info.exchangeShort} ${info.statusText} (${info.localTime} local) · ${info.nextEvent} ${info.nextEventTime}`;
  }

  return `${info.statusEmoji} ${info.exchangeShort} ${info.statusText} · ${info.nextEvent} ${info.nextEventTime}`;
}

export default {
  getMarketHours,
  canTradeNow,
  getMarketStatusSummary,
};
