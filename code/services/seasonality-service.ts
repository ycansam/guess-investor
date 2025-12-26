/**
 * Servicio de Estacionalidad del Mercado
 * 
 * Analiza patrones estacionales que afectan a diferentes sectores:
 * - Retail: Rebajas, Black Friday, Navidad
 * - Turismo: Temporada alta/baja
 * - Energía: Demanda estacional
 * - General: Sell in May, Rally Santa Claus, etc.
 * - Regional: Eventos específicos por país (Año Nuevo Chino, Buen Fin, etc.)
 */

export interface SeasonalityAnalysis {
  sector: string;
  region: string; // País/región detectada
  seasonalEvents: SeasonalEvent[];
  seasonalScore: number; // -100 a +100
  hasData: boolean;
  summary: string;
  // Patrón histórico del stock específico
  historicalPattern?: {
    lastYear: number; // % cambio mismo período año pasado
    avg3Years: number; // % cambio promedio últimos 3 años en este período
    consistency: number; // 0-100 qué tan consistente es el patrón
    direction: 'bullish' | 'bearish' | 'neutral';
  };
}

export interface SeasonalEvent {
  name: string;
  type: 'positive' | 'negative' | 'neutral';
  impact: 'high' | 'medium' | 'low';
  daysUntil: number; // 0 = ahora mismo, negativo = pasado reciente
  description: string;
  regional?: boolean; // Si es un evento regional específico
}

// Mapeo de sufijos de bolsa a país/región
const EXCHANGE_TO_REGION: Record<string, string> = {
  // España
  '.MC': 'spain',
  '.MA': 'spain',
  // USA (sin sufijo o estos)
  '': 'usa',
  '.US': 'usa',
  '.NYSE': 'usa',
  '.NASDAQ': 'usa',
  // México
  '.MX': 'mexico',
  '.BMV': 'mexico',
  // China
  '.SS': 'china', // Shanghai
  '.SZ': 'china', // Shenzhen
  '.HK': 'china', // Hong Kong
  // Japón
  '.T': 'japan',
  '.TYO': 'japan',
  // UK
  '.L': 'uk',
  '.LSE': 'uk',
  // Alemania
  '.DE': 'germany',
  '.F': 'germany', // Frankfurt
  '.XETRA': 'germany',
  // Francia
  '.PA': 'france',
  // Italia
  '.MI': 'italy',
  // Brasil
  '.SA': 'brazil',
  '.BVMF': 'brazil',
  // India
  '.NS': 'india', // NSE
  '.BO': 'india', // BSE
  // Corea del Sur
  '.KS': 'south_korea',
  '.KQ': 'south_korea',
  // Australia
  '.AX': 'australia',
  // Canadá
  '.TO': 'canada',
  '.V': 'canada',
  // Países Bajos
  '.AS': 'netherlands',
  // Suiza
  '.SW': 'switzerland',
  // Suecia
  '.ST': 'sweden',
  // Rusia
  '.ME': 'russia',
  // Sudáfrica
  '.JO': 'south_africa',
  // Singapur
  '.SI': 'singapore',
  // Tailandia
  '.BK': 'thailand',
  // Indonesia
  '.JK': 'indonesia',
  // Turquía
  '.IS': 'turkey',
  // Arabia Saudí
  '.SR': 'saudi_arabia',
  // Emiratos
  '.AE': 'uae',
  // Israel
  '.TA': 'israel',
  // Polonia
  '.WA': 'poland',
  // Argentina
  '.BA': 'argentina',
  // Chile
  '.SN': 'chile',
  // Colombia
  '.CL': 'colombia',
  // Perú
  '.LM': 'peru',
  // Dinamarca
  '.CO': 'denmark',
  // Finlandia
  '.HE': 'finland',
  // Noruega
  '.OL': 'norway',
  // Bélgica
  '.BR': 'belgium',
  // Austria
  '.VI': 'austria',
  // Portugal
  '.LS': 'portugal',
  // Grecia
  '.AT': 'greece',
  // Taiwán
  '.TW': 'taiwan',
  // Malasia
  '.KL': 'malaysia',
  // Nueva Zelanda
  '.NZ': 'new_zealand',
};

// Eventos regionales por país
interface RegionalEvent {
  name: string;
  region: string;
  month: number;
  dayStart: number;
  dayEnd: number;
  sectors: string[] | 'all'; // 'all' = aplica a todos los sectores
  impact: number;
  description: string;
  isHoliday?: boolean; // Si es festivo (mercado cerrado)
}

const REGIONAL_EVENTS: RegionalEvent[] = [
  // ========== CHINA ==========
  {
    name: 'Año Nuevo Chino',
    region: 'china',
    month: 2, // Variable (enero-febrero), aproximamos febrero
    dayStart: 1,
    dayEnd: 15,
    sectors: 'all',
    impact: -20, // Mercados cerrados, menor actividad
    description: 'Festival de Primavera - mercados cerrados, menor actividad económica',
    isHoliday: true,
  },
  {
    name: 'Golden Week China (Octubre)',
    region: 'china',
    month: 10,
    dayStart: 1,
    dayEnd: 7,
    sectors: ['travel', 'retail'],
    impact: 30,
    description: 'Semana dorada - pico de turismo y consumo interno',
  },
  {
    name: 'Singles Day (11.11) China',
    region: 'china',
    month: 11,
    dayStart: 10,
    dayEnd: 12,
    sectors: ['retail'],
    impact: 50,
    description: 'Mayor evento de ventas online del mundo',
  },
  {
    name: '618 Shopping Festival',
    region: 'china',
    month: 6,
    dayStart: 15,
    dayEnd: 20,
    sectors: ['retail'],
    impact: 35,
    description: 'Segundo mayor evento de e-commerce en China (JD.com)',
  },
  
  // ========== MÉXICO ==========
  {
    name: 'Buen Fin',
    region: 'mexico',
    month: 11,
    dayStart: 15,
    dayEnd: 20,
    sectors: ['retail', 'tech_consumer'],
    impact: 40,
    description: 'El Black Friday mexicano - mayores descuentos del año',
  },
  {
    name: 'Día de Muertos',
    region: 'mexico',
    month: 11,
    dayStart: 1,
    dayEnd: 2,
    sectors: ['retail', 'travel'],
    impact: 15,
    description: 'Festividad tradicional con aumento de turismo y consumo',
  },
  {
    name: 'Semana Santa México',
    region: 'mexico',
    month: 4,
    dayStart: 1,
    dayEnd: 15,
    sectors: ['travel'],
    impact: 25,
    description: 'Principal período vacacional - pico de turismo',
  },
  {
    name: 'Hot Sale México',
    region: 'mexico',
    month: 5,
    dayStart: 22,
    dayEnd: 31,
    sectors: ['retail'],
    impact: 25,
    description: 'Evento de ventas online de primavera',
  },
  
  // ========== ESPAÑA ==========
  {
    name: 'Reyes Magos',
    region: 'spain',
    month: 1,
    dayStart: 1,
    dayEnd: 6,
    sectors: ['retail'],
    impact: 35,
    description: 'Pico de compras de regalos navideños',
  },
  {
    name: 'Semana Santa España',
    region: 'spain',
    month: 4,
    dayStart: 1,
    dayEnd: 15,
    sectors: ['travel', 'retail'],
    impact: 20,
    description: 'Vacaciones y turismo religioso',
  },
  {
    name: 'Puente de la Constitución',
    region: 'spain',
    month: 12,
    dayStart: 6,
    dayEnd: 9,
    sectors: ['travel', 'retail'],
    impact: 15,
    description: 'Puente festivo - inicio de compras navideñas',
  },
  {
    name: 'Rebajas de Verano España',
    region: 'spain',
    month: 7,
    dayStart: 1,
    dayEnd: 31,
    sectors: ['retail'],
    impact: 25,
    description: 'Rebajas oficiales de verano',
  },
  {
    name: 'Rebajas de Invierno España',
    region: 'spain',
    month: 1,
    dayStart: 7,
    dayEnd: 31,
    sectors: ['retail'],
    impact: 30,
    description: 'Rebajas oficiales post-navideñas',
  },
  
  // ========== USA ==========
  {
    name: 'Thanksgiving',
    region: 'usa',
    month: 11,
    dayStart: 22,
    dayEnd: 28,
    sectors: ['retail', 'consumer_staples', 'travel'],
    impact: 35,
    description: 'Día de Acción de Gracias - inicio de temporada de compras',
  },
  {
    name: 'Black Friday USA',
    region: 'usa',
    month: 11,
    dayStart: 24,
    dayEnd: 30,
    sectors: ['retail', 'tech_consumer'],
    impact: 45,
    description: 'Mayor día de ventas del año en tiendas físicas',
  },
  {
    name: 'Cyber Monday USA',
    region: 'usa',
    month: 12,
    dayStart: 1,
    dayEnd: 3,
    sectors: ['retail', 'tech_consumer'],
    impact: 35,
    description: 'Mayor día de ventas online del año',
  },
  {
    name: 'Memorial Day',
    region: 'usa',
    month: 5,
    dayStart: 25,
    dayEnd: 31,
    sectors: ['retail', 'travel'],
    impact: 20,
    description: 'Fin de semana largo - inicio de verano, ventas',
  },
  {
    name: 'Labor Day',
    region: 'usa',
    month: 9,
    dayStart: 1,
    dayEnd: 7,
    sectors: ['retail'],
    impact: 15,
    description: 'Fin de semana largo - ventas de fin de verano',
  },
  {
    name: '4th of July',
    region: 'usa',
    month: 7,
    dayStart: 1,
    dayEnd: 7,
    sectors: ['retail', 'consumer_staples'],
    impact: 15,
    description: 'Festividad patriótica - barbacoas, viajes cortos',
  },
  {
    name: 'Tax Refund Season',
    region: 'usa',
    month: 3,
    dayStart: 1,
    dayEnd: 31,
    sectors: ['retail', 'tech_consumer'],
    impact: 20,
    description: 'Temporada de devolución de impuestos - mayor gasto',
  },
  
  // ========== UK ==========
  {
    name: 'Boxing Day',
    region: 'uk',
    month: 12,
    dayStart: 26,
    dayEnd: 31,
    sectors: ['retail'],
    impact: 35,
    description: 'Mayores rebajas post-navideñas del Reino Unido',
  },
  {
    name: 'Bank Holiday Mayo',
    region: 'uk',
    month: 5,
    dayStart: 1,
    dayEnd: 7,
    sectors: ['travel', 'retail'],
    impact: 10,
    description: 'Fin de semana largo de primavera',
  },
  {
    name: 'Bank Holiday Agosto',
    region: 'uk',
    month: 8,
    dayStart: 25,
    dayEnd: 31,
    sectors: ['travel'],
    impact: 10,
    description: 'Fin de semana largo de verano',
  },
  
  // ========== JAPÓN ==========
  {
    name: 'Golden Week Japón',
    region: 'japan',
    month: 5,
    dayStart: 1,
    dayEnd: 7,
    sectors: ['travel', 'retail'],
    impact: 30,
    description: 'Semana de festividades nacionales - pico de turismo',
  },
  {
    name: 'Obon Festival',
    region: 'japan',
    month: 8,
    dayStart: 13,
    dayEnd: 16,
    sectors: ['travel'],
    impact: 25,
    description: 'Festival ancestral - muchos viajes familiares',
  },
  {
    name: 'Año Nuevo Japonés',
    region: 'japan',
    month: 1,
    dayStart: 1,
    dayEnd: 3,
    sectors: 'all',
    impact: -10,
    description: 'Festividad nacional - mercados cerrados',
    isHoliday: true,
  },
  {
    name: 'Shichi-Go-San',
    region: 'japan',
    month: 11,
    dayStart: 10,
    dayEnd: 20,
    sectors: ['retail'],
    impact: 10,
    description: 'Celebración infantil tradicional - compras de ropa',
  },
  
  // ========== INDIA ==========
  {
    name: 'Diwali',
    region: 'india',
    month: 11, // Variable (octubre-noviembre)
    dayStart: 1,
    dayEnd: 15,
    sectors: ['retail', 'consumer_staples'],
    impact: 40,
    description: 'Festival de las Luces - pico de consumo anual',
  },
  {
    name: 'Dhanteras',
    region: 'india',
    month: 11,
    dayStart: 1,
    dayEnd: 5,
    sectors: ['retail'],
    impact: 35,
    description: 'Día de comprar oro y electrodomésticos',
  },
  {
    name: 'Holi',
    region: 'india',
    month: 3,
    dayStart: 1,
    dayEnd: 10,
    sectors: ['consumer_staples', 'retail'],
    impact: 15,
    description: 'Festival de colores - aumento de consumo',
  },
  {
    name: 'Durga Puja',
    region: 'india',
    month: 10,
    dayStart: 1,
    dayEnd: 10,
    sectors: ['retail'],
    impact: 20,
    description: 'Festival bengalí - pico de compras regional',
  },
  
  // ========== ALEMANIA ==========
  {
    name: 'Oktoberfest',
    region: 'germany',
    month: 9,
    dayStart: 15,
    dayEnd: 30,
    sectors: ['travel', 'consumer_staples', 'restaurants'],
    impact: 20,
    description: 'Festival de la cerveza - turismo y hostelería',
  },
  {
    name: 'Mercados de Navidad',
    region: 'germany',
    month: 12,
    dayStart: 1,
    dayEnd: 24,
    sectors: ['retail', 'travel'],
    impact: 25,
    description: 'Tradicionales Weihnachtsmärkte - turismo y compras',
  },
  
  // ========== FRANCIA ==========
  {
    name: 'Soldes d\'été',
    region: 'france',
    month: 6,
    dayStart: 25,
    dayEnd: 31,
    sectors: ['retail'],
    impact: 25,
    description: 'Rebajas de verano reguladas por ley',
  },
  {
    name: 'Soldes d\'hiver',
    region: 'france',
    month: 1,
    dayStart: 10,
    dayEnd: 31,
    sectors: ['retail'],
    impact: 30,
    description: 'Rebajas de invierno reguladas por ley',
  },
  {
    name: 'French Days',
    region: 'france',
    month: 5,
    dayStart: 1,
    dayEnd: 7,
    sectors: ['retail'],
    impact: 20,
    description: 'Black Friday francés de primavera',
  },
  
  // ========== BRASIL ==========
  {
    name: 'Carnaval',
    region: 'brazil',
    month: 2,
    dayStart: 20,
    dayEnd: 28,
    sectors: ['travel', 'consumer_staples'],
    impact: 25,
    description: 'Mayor festividad brasileña - turismo masivo',
  },
  {
    name: 'Black Friday Brasil',
    region: 'brazil',
    month: 11,
    dayStart: 22,
    dayEnd: 30,
    sectors: ['retail'],
    impact: 35,
    description: 'Adoptado con fuerza en Brasil',
  },
  {
    name: 'Dia das Mães Brasil',
    region: 'brazil',
    month: 5,
    dayStart: 7,
    dayEnd: 14,
    sectors: ['retail'],
    impact: 25,
    description: 'Segunda fecha comercial más importante en Brasil',
  },
  
  // ========== COREA DEL SUR ==========
  {
    name: 'Chuseok',
    region: 'south_korea',
    month: 9,
    dayStart: 15,
    dayEnd: 20,
    sectors: ['retail', 'travel'],
    impact: 25,
    description: 'Acción de Gracias coreana - regalos y viajes',
  },
  {
    name: 'Seollal',
    region: 'south_korea',
    month: 2,
    dayStart: 1,
    dayEnd: 5,
    sectors: ['retail', 'travel'],
    impact: 20,
    description: 'Año Nuevo Lunar coreano',
  },
  {
    name: 'Pepero Day',
    region: 'south_korea',
    month: 11,
    dayStart: 10,
    dayEnd: 12,
    sectors: ['retail', 'consumer_staples'],
    impact: 15,
    description: 'Día comercial de regalos (como San Valentín)',
  },
  
  // ========== CANADÁ ==========
  {
    name: 'Boxing Day Canadá',
    region: 'canada',
    month: 12,
    dayStart: 26,
    dayEnd: 31,
    sectors: ['retail'],
    impact: 30,
    description: 'Mayores rebajas post-navideñas',
  },
  {
    name: 'Thanksgiving Canadá',
    region: 'canada',
    month: 10,
    dayStart: 10,
    dayEnd: 14,
    sectors: ['consumer_staples', 'retail'],
    impact: 15,
    description: 'Día de Acción de Gracias canadiense',
  },
  {
    name: 'Victoria Day',
    region: 'canada',
    month: 5,
    dayStart: 20,
    dayEnd: 25,
    sectors: ['retail', 'travel'],
    impact: 10,
    description: 'Fin de semana largo - inicio de verano',
  },
  
  // ========== AUSTRALIA ==========
  {
    name: 'Boxing Day Australia',
    region: 'australia',
    month: 12,
    dayStart: 26,
    dayEnd: 31,
    sectors: ['retail'],
    impact: 35,
    description: 'Mayor día de ventas del año en Australia',
  },
  {
    name: 'EOFY Sales',
    region: 'australia',
    month: 6,
    dayStart: 20,
    dayEnd: 30,
    sectors: ['retail', 'tech'],
    impact: 25,
    description: 'Ventas de fin de año fiscal (julio-junio)',
  },
  {
    name: 'Melbourne Cup',
    region: 'australia',
    month: 11,
    dayStart: 1,
    dayEnd: 7,
    sectors: ['retail', 'travel'],
    impact: 10,
    description: 'La carrera que para a Australia',
  },
  
  // ========== EMIRATOS ÁRABES ==========
  {
    name: 'Dubai Shopping Festival',
    region: 'uae',
    month: 1,
    dayStart: 15,
    dayEnd: 31,
    sectors: ['retail', 'travel', 'luxury'],
    impact: 35,
    description: 'Mes de compras y turismo en Dubái',
  },
  {
    name: 'Eid al-Fitr',
    region: 'uae',
    month: 4, // Variable
    dayStart: 1,
    dayEnd: 7,
    sectors: ['retail', 'travel'],
    impact: 30,
    description: 'Fin del Ramadán - celebraciones y compras',
  },
  {
    name: 'Ramadán',
    region: 'uae',
    month: 3, // Variable
    dayStart: 1,
    dayEnd: 30,
    sectors: ['restaurants'],
    impact: -20,
    description: 'Mes de ayuno - menor actividad diurna',
  },
  
  // ========== ARABIA SAUDÍ ==========
  {
    name: 'Riyadh Season',
    region: 'saudi_arabia',
    month: 10,
    dayStart: 15,
    dayEnd: 30,
    sectors: ['travel', 'retail'],
    impact: 25,
    description: 'Temporada de entretenimiento y turismo',
  },
  
  // ========== SINGAPUR ==========
  {
    name: 'Great Singapore Sale',
    region: 'singapore',
    month: 6,
    dayStart: 1,
    dayEnd: 30,
    sectors: ['retail'],
    impact: 30,
    description: 'Evento de compras de un mes',
  },
  
  // ========== ARGENTINA ==========
  {
    name: 'CyberMonday Argentina',
    region: 'argentina',
    month: 11,
    dayStart: 1,
    dayEnd: 5,
    sectors: ['retail'],
    impact: 30,
    description: 'Principal evento de e-commerce',
  },
  {
    name: 'Hot Sale Argentina',
    region: 'argentina',
    month: 5,
    dayStart: 8,
    dayEnd: 12,
    sectors: ['retail'],
    impact: 25,
    description: 'Evento de ventas online de otoño',
  },
  
  // ========== CHILE ==========
  {
    name: 'CyberDay Chile',
    region: 'chile',
    month: 5,
    dayStart: 27,
    dayEnd: 31,
    sectors: ['retail'],
    impact: 30,
    description: 'Principal evento de e-commerce chileno',
  },
  
  // ========== TURQUÍA ==========
  {
    name: 'Bayram (Eid)',
    region: 'turkey',
    month: 4, // Variable
    dayStart: 1,
    dayEnd: 5,
    sectors: ['retail', 'travel'],
    impact: 25,
    description: 'Festival religioso - viajes y compras',
  },
  
  // ========== SUDÁFRICA ==========
  {
    name: 'Black Friday Sudáfrica',
    region: 'south_africa',
    month: 11,
    dayStart: 24,
    dayEnd: 30,
    sectors: ['retail'],
    impact: 35,
    description: 'Adoptado con fuerza en Sudáfrica',
  },

  // ========== PAÍSES BAJOS ==========
  {
    name: 'Koningsdag (Día del Rey)',
    region: 'netherlands',
    month: 4,
    dayStart: 27,
    dayEnd: 27,
    sectors: ['retail', 'travel'],
    impact: 20,
    description: 'Fiesta nacional - mercadillos callejeros y celebraciones',
  },
  {
    name: 'Sinterklaas',
    region: 'netherlands',
    month: 12,
    dayStart: 1,
    dayEnd: 5,
    sectors: ['retail'],
    impact: 35,
    description: 'Principal temporada de regalos holandesa (más que Navidad)',
  },
  {
    name: 'Black Friday Países Bajos',
    region: 'netherlands',
    month: 11,
    dayStart: 25,
    dayEnd: 28,
    sectors: ['retail'],
    impact: 25,
    description: 'Cada vez más popular en retail holandés',
  },

  // ========== SUIZA ==========
  {
    name: 'Fasnacht (Carnaval Basilea)',
    region: 'switzerland',
    month: 2,
    dayStart: 10,
    dayEnd: 13,
    sectors: ['travel'],
    impact: 15,
    description: 'Carnaval tradicional suizo',
  },
  {
    name: 'Día Nacional Suizo',
    region: 'switzerland',
    month: 8,
    dayStart: 1,
    dayEnd: 1,
    sectors: 'all',
    impact: -5,
    description: 'Mercados cerrados - menor actividad',
    isHoliday: true,
  },
  {
    name: 'Black Friday Suiza',
    region: 'switzerland',
    month: 11,
    dayStart: 25,
    dayEnd: 28,
    sectors: ['retail'],
    impact: 25,
    description: 'Creciente popularidad en retail suizo',
  },

  // ========== SUECIA ==========
  {
    name: 'Midsommar (Solsticio)',
    region: 'sweden',
    month: 6,
    dayStart: 19,
    dayEnd: 21,
    sectors: ['retail', 'travel'],
    impact: 20,
    description: 'Celebración del solsticio de verano',
  },
  {
    name: 'Lucia',
    region: 'sweden',
    month: 12,
    dayStart: 13,
    dayEnd: 13,
    sectors: ['retail'],
    impact: 15,
    description: 'Tradición navideña sueca',
  },
  {
    name: 'Mellandagsrea (Rebajas post-Navidad)',
    region: 'sweden',
    month: 12,
    dayStart: 26,
    dayEnd: 31,
    sectors: ['retail'],
    impact: 30,
    description: 'Grandes rebajas entre Navidad y Año Nuevo',
  },
  {
    name: 'Black Week Suecia',
    region: 'sweden',
    month: 11,
    dayStart: 20,
    dayEnd: 30,
    sectors: ['retail'],
    impact: 30,
    description: 'Semana completa de ofertas',
  },

  // ========== DINAMARCA ==========
  {
    name: 'Sankt Hans (Noche San Juan)',
    region: 'denmark',
    month: 6,
    dayStart: 23,
    dayEnd: 24,
    sectors: ['retail', 'travel'],
    impact: 15,
    description: 'Celebración del solsticio de verano danés',
  },
  {
    name: 'Black Friday Dinamarca',
    region: 'denmark',
    month: 11,
    dayStart: 25,
    dayEnd: 28,
    sectors: ['retail'],
    impact: 30,
    description: 'Muy popular en Dinamarca',
  },
  {
    name: 'Julefrokost Season',
    region: 'denmark',
    month: 12,
    dayStart: 1,
    dayEnd: 23,
    sectors: ['retail', 'travel'],
    impact: 20,
    description: 'Temporada de fiestas navideñas corporativas',
  },

  // ========== FINLANDIA ==========
  {
    name: 'Juhannus (Midsummer)',
    region: 'finland',
    month: 6,
    dayStart: 20,
    dayEnd: 22,
    sectors: ['travel'],
    impact: 15,
    description: 'Solsticio de verano finlandés - éxodo a cabañas',
  },
  {
    name: 'Black Friday Finlandia',
    region: 'finland',
    month: 11,
    dayStart: 25,
    dayEnd: 28,
    sectors: ['retail'],
    impact: 25,
    description: 'Creciendo en popularidad',
  },
  {
    name: 'Pikkujoulu (Pequeña Navidad)',
    region: 'finland',
    month: 11,
    dayStart: 15,
    dayEnd: 30,
    sectors: ['retail', 'travel'],
    impact: 20,
    description: 'Fiestas pre-navideñas corporativas',
  },

  // ========== NORUEGA ==========
  {
    name: 'Día de la Constitución (17 de mayo)',
    region: 'norway',
    month: 5,
    dayStart: 17,
    dayEnd: 17,
    sectors: ['retail'],
    impact: 20,
    description: 'Principal fiesta nacional noruega',
  },
  {
    name: 'Romjul (Entre Navidad y Año Nuevo)',
    region: 'norway',
    month: 12,
    dayStart: 26,
    dayEnd: 31,
    sectors: ['retail'],
    impact: 25,
    description: 'Rebajas post-navideñas',
  },
  {
    name: 'Black Friday Noruega',
    region: 'norway',
    month: 11,
    dayStart: 25,
    dayEnd: 28,
    sectors: ['retail'],
    impact: 30,
    description: 'Muy adoptado en retail noruego',
  },

  // ========== BÉLGICA ==========
  {
    name: 'Día Nacional Belga',
    region: 'belgium',
    month: 7,
    dayStart: 21,
    dayEnd: 21,
    sectors: 'all',
    impact: -5,
    description: 'Fiesta nacional - menor actividad',
    isHoliday: true,
  },
  {
    name: 'Sinterklaas Bélgica',
    region: 'belgium',
    month: 12,
    dayStart: 1,
    dayEnd: 6,
    sectors: ['retail'],
    impact: 30,
    description: 'Tradición de regalos belga',
  },
  {
    name: 'Soldes (Rebajas Oficiales)',
    region: 'belgium',
    month: 1,
    dayStart: 3,
    dayEnd: 31,
    sectors: ['retail'],
    impact: 25,
    description: 'Rebajas de invierno reguladas por ley',
  },

  // ========== AUSTRIA ==========
  {
    name: 'Krampusnacht',
    region: 'austria',
    month: 12,
    dayStart: 5,
    dayEnd: 6,
    sectors: ['retail'],
    impact: 15,
    description: 'Tradición pre-navideña',
  },
  {
    name: 'Christkindlmarkt Season',
    region: 'austria',
    month: 11,
    dayStart: 15,
    dayEnd: 24,
    sectors: ['retail', 'travel'],
    impact: 25,
    description: 'Temporada de mercadillos navideños',
  },
  {
    name: 'Black Friday Austria',
    region: 'austria',
    month: 11,
    dayStart: 25,
    dayEnd: 28,
    sectors: ['retail'],
    impact: 25,
    description: 'Cada vez más popular',
  },

  // ========== PORTUGAL ==========
  {
    name: 'Dia de Portugal',
    region: 'portugal',
    month: 6,
    dayStart: 10,
    dayEnd: 10,
    sectors: 'all',
    impact: -5,
    description: 'Día nacional portugués',
    isHoliday: true,
  },
  {
    name: 'Festas de Lisboa (San Antonio)',
    region: 'portugal',
    month: 6,
    dayStart: 1,
    dayEnd: 30,
    sectors: ['travel', 'retail'],
    impact: 20,
    description: 'Fiestas populares de Lisboa',
  },
  {
    name: 'Black Friday Portugal',
    region: 'portugal',
    month: 11,
    dayStart: 25,
    dayEnd: 28,
    sectors: ['retail'],
    impact: 30,
    description: 'Ampliamente adoptado',
  },
  {
    name: 'Saldos de Verão',
    region: 'portugal',
    month: 8,
    dayStart: 1,
    dayEnd: 31,
    sectors: ['retail'],
    impact: 20,
    description: 'Rebajas de verano portuguesas',
  },

  // ========== POLONIA ==========
  {
    name: 'Día de la Independencia Polonia',
    region: 'poland',
    month: 11,
    dayStart: 11,
    dayEnd: 11,
    sectors: 'all',
    impact: -5,
    description: 'Fiesta nacional polaca',
    isHoliday: true,
  },
  {
    name: 'Dzień Dziecka (Día del Niño)',
    region: 'poland',
    month: 6,
    dayStart: 1,
    dayEnd: 1,
    sectors: ['retail'],
    impact: 15,
    description: 'Día de compras para niños',
  },
  {
    name: 'Black Friday Polonia',
    region: 'poland',
    month: 11,
    dayStart: 25,
    dayEnd: 28,
    sectors: ['retail'],
    impact: 30,
    description: 'Muy popular en Polonia',
  },
  {
    name: 'Cyber Monday Polonia',
    region: 'poland',
    month: 12,
    dayStart: 1,
    dayEnd: 2,
    sectors: ['retail'],
    impact: 20,
    description: 'Sigue al Black Friday',
  },

  // ========== GRECIA ==========
  {
    name: 'Semana Santa Ortodoxa',
    region: 'greece',
    month: 4,
    dayStart: 10,
    dayEnd: 20,
    sectors: ['travel', 'retail'],
    impact: 25,
    description: 'Principal festividad religiosa griega',
  },
  {
    name: 'Ferragosto Grecia',
    region: 'greece',
    month: 8,
    dayStart: 15,
    dayEnd: 15,
    sectors: ['travel'],
    impact: 20,
    description: 'Asunción - pico de turismo',
  },
  {
    name: 'Black Friday Grecia',
    region: 'greece',
    month: 11,
    dayStart: 25,
    dayEnd: 28,
    sectors: ['retail'],
    impact: 25,
    description: 'Creciente adopción',
  },

  // ========== ISRAEL ==========
  {
    name: 'Rosh Hashaná (Año Nuevo Judío)',
    region: 'israel',
    month: 9,
    dayStart: 15,
    dayEnd: 17,
    sectors: 'all',
    impact: -20,
    description: 'Año nuevo judío - mercados cerrados',
    isHoliday: true,
  },
  {
    name: 'Yom Kippur',
    region: 'israel',
    month: 9,
    dayStart: 24,
    dayEnd: 25,
    sectors: 'all',
    impact: -30,
    description: 'Día más sagrado - todo paralizado',
    isHoliday: true,
  },
  {
    name: 'Hanukkah',
    region: 'israel',
    month: 12,
    dayStart: 7,
    dayEnd: 15,
    sectors: ['retail'],
    impact: 20,
    description: 'Festividad de las luces - regalos',
  },
  {
    name: 'Pesaj (Pascua Judía)',
    region: 'israel',
    month: 4,
    dayStart: 12,
    dayEnd: 20,
    sectors: ['retail', 'travel'],
    impact: 15,
    description: 'Vacaciones de primavera',
  },

  // ========== TAIWÁN ==========
  {
    name: 'Año Nuevo Lunar Taiwán',
    region: 'taiwan',
    month: 2,
    dayStart: 1,
    dayEnd: 10,
    sectors: 'all',
    impact: -20,
    description: 'Principal festividad - mercados cerrados',
    isHoliday: true,
  },
  {
    name: 'Double 11 Taiwán',
    region: 'taiwan',
    month: 11,
    dayStart: 11,
    dayEnd: 11,
    sectors: ['retail'],
    impact: 35,
    description: 'Singles Day adoptado de China',
  },
  {
    name: 'Festival del Bote del Dragón',
    region: 'taiwan',
    month: 6,
    dayStart: 10,
    dayEnd: 12,
    sectors: ['retail'],
    impact: 15,
    description: 'Festividad tradicional',
  },

  // ========== INDONESIA ==========
  {
    name: 'Lebaran (Eid al-Fitr)',
    region: 'indonesia',
    month: 4,
    dayStart: 9,
    dayEnd: 15,
    sectors: 'all',
    impact: 30,
    description: 'Mayor festividad - pico de consumo',
  },
  {
    name: 'Harbolnas (Día Nacional Compras Online)',
    region: 'indonesia',
    month: 12,
    dayStart: 12,
    dayEnd: 12,
    sectors: ['retail'],
    impact: 40,
    description: 'Principal evento e-commerce indonesio (12.12)',
  },
  {
    name: 'Ramadán',
    region: 'indonesia',
    month: 3,
    dayStart: 10,
    dayEnd: 31,
    sectors: ['retail'],
    impact: 20,
    description: 'Mes de compras pre-Lebaran',
  },

  // ========== MALASIA ==========
  {
    name: 'Hari Raya Aidilfitri',
    region: 'malaysia',
    month: 4,
    dayStart: 9,
    dayEnd: 15,
    sectors: 'all',
    impact: 30,
    description: 'Fin del Ramadán - pico de consumo',
  },
  {
    name: 'Merdeka (Día Independencia)',
    region: 'malaysia',
    month: 8,
    dayStart: 31,
    dayEnd: 31,
    sectors: ['retail'],
    impact: 15,
    description: 'Fiesta nacional malasia',
  },
  {
    name: 'Year End Sale Malaysia',
    region: 'malaysia',
    month: 11,
    dayStart: 1,
    dayEnd: 30,
    sectors: ['retail'],
    impact: 25,
    description: 'Temporada de rebajas de fin de año',
  },
  {
    name: 'Deepavali Malaysia',
    region: 'malaysia',
    month: 10,
    dayStart: 20,
    dayEnd: 25,
    sectors: ['retail'],
    impact: 20,
    description: 'Festival de las luces malasio',
  },

  // ========== TAILANDIA ==========
  {
    name: 'Songkran (Año Nuevo Tailandés)',
    region: 'thailand',
    month: 4,
    dayStart: 13,
    dayEnd: 15,
    sectors: ['travel', 'retail'],
    impact: 25,
    description: 'Festival del agua - pico turístico',
  },
  {
    name: 'Loy Krathong',
    region: 'thailand',
    month: 11,
    dayStart: 15,
    dayEnd: 17,
    sectors: ['travel'],
    impact: 20,
    description: 'Festival de las linternas',
  },
  {
    name: 'Thailand Grand Sale',
    region: 'thailand',
    month: 6,
    dayStart: 15,
    dayEnd: 31,
    sectors: ['retail'],
    impact: 25,
    description: 'Rebajas de mitad de año',
  },
  {
    name: '11.11 Tailandia',
    region: 'thailand',
    month: 11,
    dayStart: 11,
    dayEnd: 11,
    sectors: ['retail'],
    impact: 30,
    description: 'Singles Day tailandés',
  },

  // ========== NUEVA ZELANDA ==========
  {
    name: 'Waitangi Day',
    region: 'new_zealand',
    month: 2,
    dayStart: 6,
    dayEnd: 6,
    sectors: 'all',
    impact: -5,
    description: 'Día nacional de Nueva Zelanda',
    isHoliday: true,
  },
  {
    name: 'Boxing Day NZ',
    region: 'new_zealand',
    month: 12,
    dayStart: 26,
    dayEnd: 31,
    sectors: ['retail'],
    impact: 35,
    description: 'Mayores rebajas del año',
  },
  {
    name: 'Click Frenzy NZ',
    region: 'new_zealand',
    month: 11,
    dayStart: 10,
    dayEnd: 12,
    sectors: ['retail'],
    impact: 25,
    description: 'Evento de compras online',
  },
  {
    name: 'Matariki (Año Nuevo Maorí)',
    region: 'new_zealand',
    month: 7,
    dayStart: 14,
    dayEnd: 14,
    sectors: ['retail', 'travel'],
    impact: 10,
    description: 'Nueva festividad nacional desde 2022',
  },
];

// Mapeo de símbolos a sectores
const SYMBOL_TO_SECTOR: Record<string, string> = {
  // Retail/Moda
  'ITX.MC': 'retail',
  'H&M-B.ST': 'retail',
  'NKE': 'retail',
  'LULU': 'retail',
  'GAP': 'retail',
  'TJX': 'retail',
  'COST': 'retail',
  'WMT': 'retail',
  'TGT': 'retail',
  'AMZN': 'retail', // También e-commerce
  'BABA': 'retail',
  'JD': 'retail',
  'MELI': 'retail',
  'EBAY': 'retail',
  'ETSY': 'retail',
  'SHOP': 'retail',
  'ROST': 'retail',
  'DG': 'retail', // Dollar General
  'DLTR': 'retail', // Dollar Tree
  'M': 'retail', // Macy's
  'KSS': 'retail', // Kohl's
  'BBY': 'retail', // Best Buy - tech retail
  
  // Lujo (patrón similar a retail pero más Q4)
  'MC.PA': 'luxury', // LVMH
  'KER.PA': 'luxury', // Kering
  'RMS.PA': 'luxury', // Hermès
  'RACE': 'luxury', // Ferrari
  
  // Turismo/Aerolíneas/Hoteles
  'IAG.MC': 'travel',
  'AENA.MC': 'travel',
  'MEL.MC': 'travel',
  'AAL': 'travel',
  'DAL': 'travel',
  'UAL': 'travel',
  'LUV': 'travel',
  'MAR': 'travel',
  'HLT': 'travel',
  'H': 'travel',
  'BKNG': 'travel',
  'ABNB': 'travel',
  'EXPE': 'travel',
  'CCL': 'travel',
  'RCL': 'travel',
  'NCLH': 'travel',
  'DIS': 'travel', // Disney - parques
  'SIX': 'travel', // Six Flags
  'FUN': 'travel', // Cedar Fair
  
  // Restaurantes/Ocio
  'MCD': 'restaurants',
  'SBUX': 'restaurants',
  'CMG': 'restaurants',
  'DPZ': 'restaurants',
  'YUM': 'restaurants',
  'QSR': 'restaurants',
  'DARDEN': 'restaurants',
  
  // Energía
  'REP.MC': 'energy',
  'IBE.MC': 'utilities',
  'ENG.MC': 'utilities',
  'REE.MC': 'utilities',
  'XOM': 'energy',
  'CVX': 'energy',
  'COP': 'energy',
  'SLB': 'energy',
  'NEE': 'utilities',
  'DUK': 'utilities',
  'SO': 'utilities',
  'BP': 'energy',
  'SHEL': 'energy', // Shell
  'TTE': 'energy', // TotalEnergies
  
  // Construcción/Materiales
  'ACS.MC': 'construction',
  'FER.MC': 'construction',
  'FCC.MC': 'construction',
  'CAT': 'construction',
  'DE': 'construction',
  'VMC': 'construction',
  'MLM': 'construction',
  'DHI': 'construction', // DR Horton (viviendas)
  'LEN': 'construction', // Lennar
  'HD': 'construction', // Home Depot
  'LOW': 'construction', // Lowe's
  
  // Tech/Gaming (Q4 fuerte)
  'AAPL': 'tech_consumer',
  'MSFT': 'tech',
  'GOOGL': 'tech',
  'META': 'tech',
  'NVDA': 'tech',
  'AMD': 'tech',
  'INTC': 'tech',
  'EA': 'gaming',
  'TTWO': 'gaming',
  'ATVI': 'gaming',
  'SONY': 'tech_consumer',
  'NTDOY': 'gaming',
  'RBLX': 'gaming',
  'U': 'gaming', // Unity
  'NFLX': 'streaming',
  'ROKU': 'streaming',
  'SPOT': 'streaming',
  
  // Alimentación/Bebidas (relativamente estable)
  'KO': 'consumer_staples',
  'PEP': 'consumer_staples',
  'MDLZ': 'consumer_staples',
  'KHC': 'consumer_staples',
  'GIS': 'consumer_staples', // General Mills
  'K': 'consumer_staples', // Kellogg's
  'HSY': 'consumer_staples', // Hershey
  'TSN': 'consumer_staples', // Tyson Foods
  
  // Bancos (menos estacionalidad)
  'SAN.MC': 'banking',
  'BBVA.MC': 'banking',
  'CABK.MC': 'banking',
  'SAB.MC': 'banking',
  'JPM': 'banking',
  'BAC': 'banking',
  'WFC': 'banking',
  'C': 'banking',
  'GS': 'banking',
  'MS': 'banking',
  'DB': 'banking', // Deutsche Bank
  'UBS': 'banking',
  'CS': 'banking', // Credit Suisse
  
  // Telecomunicaciones
  'TEF.MC': 'telecom',
  'T': 'telecom',
  'VZ': 'telecom',
  'TMUS': 'telecom',
  
  // Farmacéuticas/Salud
  'GRIFOLS.MC': 'healthcare',
  'JNJ': 'healthcare',
  'PFE': 'healthcare',
  'UNH': 'healthcare',
  'MRK': 'healthcare',
  'ABBV': 'healthcare',
};

// Patrones estacionales por sector
interface SeasonalPattern {
  name: string;
  months: number[]; // 1-12
  impact: number; // -100 a +100
  description: string;
}

const SECTOR_PATTERNS: Record<string, SeasonalPattern[]> = {
  retail: [
    { name: 'Rebajas de invierno', months: [1, 2], impact: 25, description: 'Aumento de ventas por rebajas post-navideñas' },
    { name: 'Temporada baja primavera', months: [3, 4], impact: -10, description: 'Menor actividad antes de nueva temporada' },
    { name: 'Inicio temporada verano', months: [5, 6], impact: 15, description: 'Lanzamiento colección verano' },
    { name: 'Rebajas de verano', months: [7, 8], impact: 20, description: 'Rebajas de verano impulsan ventas' },
    { name: 'Vuelta al cole', months: [9], impact: 25, description: 'Fuerte demanda por vuelta al colegio' },
    { name: 'Pre-Black Friday', months: [10], impact: 5, description: 'Consumidores esperan ofertas' },
    { name: 'Black Friday/Cyber Monday', months: [11], impact: 40, description: 'Pico de ventas anual' },
    { name: 'Campaña Navidad', months: [12], impact: 45, description: 'Temporada más fuerte del año' },
  ],
  travel: [
    { name: 'Temporada baja invierno', months: [1, 2], impact: -30, description: 'Mínima demanda turística' },
    { name: 'Semana Santa', months: [3, 4], impact: 20, description: 'Pico de viajes por vacaciones' },
    { name: 'Pre-temporada', months: [5], impact: 10, description: 'Reservas para verano' },
    { name: 'Temporada alta', months: [6, 7, 8], impact: 50, description: 'Máxima demanda del año' },
    { name: 'Vuelta de vacaciones', months: [9], impact: -15, description: 'Caída post-verano' },
    { name: 'Temporada media otoño', months: [10, 11], impact: -20, description: 'Demanda reducida' },
    { name: 'Viajes navideños', months: [12], impact: 15, description: 'Viajes familiares navideños' },
  ],
  energy: [
    { name: 'Invierno - Alta demanda', months: [1, 2, 12], impact: 35, description: 'Mayor consumo por calefacción' },
    { name: 'Primavera - Demanda media', months: [3, 4, 5], impact: 0, description: 'Demanda normalizada' },
    { name: 'Verano - Alta demanda AC', months: [6, 7, 8], impact: 25, description: 'Aire acondicionado aumenta demanda' },
    { name: 'Otoño - Demanda baja', months: [9, 10, 11], impact: -15, description: 'Menor necesidad climatización' },
  ],
  utilities: [
    { name: 'Invierno - Alta demanda', months: [1, 2, 12], impact: 30, description: 'Pico de consumo eléctrico' },
    { name: 'Temporada media', months: [3, 4, 5, 9, 10, 11], impact: 0, description: 'Consumo estable' },
    { name: 'Verano - Alta por AC', months: [6, 7, 8], impact: 20, description: 'Aumento por climatización' },
  ],
  construction: [
    { name: 'Invierno - Baja actividad', months: [1, 2, 12], impact: -25, description: 'Mal tiempo reduce obras' },
    { name: 'Primavera - Temporada alta', months: [3, 4, 5], impact: 30, description: 'Inicio de nuevos proyectos' },
    { name: 'Verano - Máxima actividad', months: [6, 7, 8], impact: 35, description: 'Condiciones óptimas para construir' },
    { name: 'Otoño - Actividad media', months: [9, 10, 11], impact: 10, description: 'Cierre de proyectos anuales' },
  ],
  tech_consumer: [
    { name: 'Post-navidad', months: [1, 2], impact: -10, description: 'Resaca de compras navideñas' },
    { name: 'Primavera tranquila', months: [3, 4, 5], impact: 0, description: 'Período sin grandes lanzamientos' },
    { name: 'WWDC/Anuncios verano', months: [6], impact: 15, description: 'Conferencias y anuncios de productos' },
    { name: 'Verano tranquilo', months: [7, 8], impact: -5, description: 'Espera a nuevos productos' },
    { name: 'Lanzamientos otoño', months: [9, 10], impact: 30, description: 'iPhone, nuevos productos' },
    { name: 'Temporada navideña', months: [11, 12], impact: 45, description: 'Máximas ventas del año' },
  ],
  gaming: [
    { name: 'Q1 tranquilo', months: [1, 2, 3], impact: -15, description: 'Pocos lanzamientos importantes' },
    { name: 'E3/Anuncios primavera', months: [4, 5, 6], impact: 10, description: 'Anuncios de nuevos juegos' },
    { name: 'Verano tranquilo', months: [7, 8], impact: -10, description: 'Temporada de sequía' },
    { name: 'Lanzamientos otoño', months: [9, 10], impact: 25, description: 'Grandes lanzamientos pre-navidad' },
    { name: 'Holiday Season', months: [11, 12], impact: 50, description: 'Pico absoluto de ventas' },
  ],
  tech: [
    { name: 'Q1', months: [1, 2, 3], impact: 0, description: 'Período neutral' },
    { name: 'Q2', months: [4, 5, 6], impact: 5, description: 'Conferencias de desarrolladores' },
    { name: 'Q3', months: [7, 8, 9], impact: 0, description: 'Período neutral' },
    { name: 'Q4 - Gasto empresarial', months: [10, 11, 12], impact: 15, description: 'Empresas cierran presupuestos' },
  ],
  consumer_staples: [
    // Muy estable, poca estacionalidad
    { name: 'Todo el año', months: [1,2,3,4,5,6,7,8,9,10,11,12], impact: 0, description: 'Sector defensivo, demanda estable' },
  ],
  banking: [
    { name: 'Q1 - Cierre fiscal', months: [1, 2, 3], impact: 5, description: 'Actividad por cierres fiscales' },
    { name: 'Verano tranquilo', months: [6, 7, 8], impact: -5, description: 'Menor actividad empresarial' },
    { name: 'Q4 - Planificación', months: [10, 11, 12], impact: 5, description: 'Planificación financiera fin de año' },
  ],
  telecom: [
    // Muy estable
    { name: 'Todo el año', months: [1,2,3,4,5,6,7,8,9,10,11,12], impact: 0, description: 'Ingresos recurrentes estables' },
  ],
  healthcare: [
    { name: 'Temporada gripe', months: [1, 2, 11, 12], impact: 10, description: 'Mayor demanda sanitaria' },
    { name: 'Resto del año', months: [3,4,5,6,7,8,9,10], impact: 0, description: 'Demanda relativamente estable' },
  ],
  // Nuevos sectores
  luxury: [
    { name: 'Post-navidad', months: [1, 2], impact: -15, description: 'Caída tras pico navideño' },
    { name: 'Primavera - Colecciones', months: [3, 4, 5], impact: 15, description: 'Nuevas colecciones primavera' },
    { name: 'Verano tranquilo', months: [6, 7, 8], impact: -5, description: 'Clientes de vacaciones' },
    { name: 'Otoño - Fashion weeks', months: [9, 10], impact: 20, description: 'Fashion weeks y nuevas colecciones' },
    { name: 'Holiday Season', months: [11, 12], impact: 40, description: 'Máximas ventas - regalos de lujo' },
  ],
  restaurants: [
    { name: 'Enero saludable', months: [1], impact: -20, description: 'Propósitos de año nuevo reducen consumo' },
    { name: 'San Valentín', months: [2], impact: 15, description: 'Pico de reservas románticas' },
    { name: 'Primavera normal', months: [3, 4, 5], impact: 5, description: 'Actividad estable' },
    { name: 'Verano - Vacaciones', months: [6, 7, 8], impact: 10, description: 'Mayor consumo por ocio' },
    { name: 'Vuelta a rutina', months: [9, 10], impact: 0, description: 'Normalización del consumo' },
    { name: 'Fiestas navideñas', months: [11, 12], impact: 25, description: 'Cenas de empresa y celebraciones' },
  ],
  streaming: [
    { name: 'Invierno - Alta demanda', months: [1, 2, 12], impact: 20, description: 'Más tiempo en casa, más streaming' },
    { name: 'Primavera normal', months: [3, 4, 5], impact: 0, description: 'Actividad estable' },
    { name: 'Verano - Baja demanda', months: [6, 7, 8], impact: -15, description: 'Usuarios de vacaciones, menos uso' },
    { name: 'Otoño - Nuevos lanzamientos', months: [9, 10, 11], impact: 15, description: 'Estrenos de nuevas series' },
  ],
};

// Efectos generales del mercado (aplican a todos)
interface MarketEffect {
  name: string;
  checkFn: (date: Date) => boolean;
  impact: number;
  description: string;
}

const MARKET_EFFECTS: MarketEffect[] = [
  {
    name: 'Rally de Santa Claus',
    checkFn: (date: Date) => {
      const month = date.getMonth() + 1;
      const day = date.getDate();
      // Últimos 5 días de diciembre + primeros 2 de enero
      return (month === 12 && day >= 26) || (month === 1 && day <= 2);
    },
    impact: 15,
    description: 'Históricamente el mercado sube en las últimas sesiones del año',
  },
  {
    name: 'Efecto enero',
    checkFn: (date: Date) => date.getMonth() === 0 && date.getDate() <= 15,
    impact: 10,
    description: 'Small caps tienden a subir a principios de enero',
  },
  {
    name: 'Sell in May',
    checkFn: (date: Date) => {
      const month = date.getMonth() + 1;
      return month >= 5 && month <= 10;
    },
    impact: -8,
    description: '"Sell in May and go away" - históricamente peor rendimiento mayo-octubre',
  },
  {
    name: 'Pre-elecciones USA',
    checkFn: (date: Date) => {
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      // Año electoral USA y meses previos
      return year % 4 === 0 && month >= 9 && month <= 11;
    },
    impact: -5,
    description: 'Incertidumbre pre-electoral suele generar volatilidad',
  },
  {
    name: 'Triple Witching',
    checkFn: (date: Date) => {
      const month = date.getMonth() + 1;
      // Tercer viernes de marzo, junio, septiembre, diciembre
      if (![3, 6, 9, 12].includes(month)) return false;
      const day = date.getDate();
      const dayOfWeek = date.getDay();
      return dayOfWeek === 5 && day >= 15 && day <= 21;
    },
    impact: 0, // Neutral pero aumenta volatilidad
    description: 'Vencimiento de opciones - mayor volatilidad',
  },
  {
    name: 'Fin de mes',
    checkFn: (date: Date) => {
      const day = date.getDate();
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      // Últimos 3 días del mes + primeros 2 (cobro nóminas)
      return day >= lastDay - 2 || day <= 2;
    },
    impact: 5,
    description: 'Días de cobro de nóminas - mayor consumo',
  },
  {
    name: 'Efecto lunes',
    checkFn: (date: Date) => date.getDay() === 1,
    impact: -3,
    description: 'Históricamente los lunes tienen peor rendimiento',
  },
  {
    name: 'Window Dressing fin trimestre',
    checkFn: (date: Date) => {
      const month = date.getMonth() + 1;
      const day = date.getDate();
      // Última semana de marzo, junio, septiembre, diciembre
      return [3, 6, 9, 12].includes(month) && day >= 25;
    },
    impact: 8,
    description: 'Fondos compran acciones ganadoras para reportes',
  },
  {
    name: 'Inicio de año fiscal',
    checkFn: (date: Date) => {
      const month = date.getMonth() + 1;
      const day = date.getDate();
      // Primera semana de abril (Japón, UK) o enero (USA, Europa)
      return (month === 1 && day <= 7) || (month === 4 && day <= 7);
    },
    impact: 5,
    description: 'Nuevos presupuestos de inversión disponibles',
  },
];

// Eventos específicos con fechas fijas
interface FixedEvent {
  name: string;
  month: number;
  dayStart: number;
  dayEnd: number;
  sectors: string[];
  impact: number;
  description: string;
}

const FIXED_EVENTS: FixedEvent[] = [
  {
    name: 'Black Friday',
    month: 11,
    dayStart: 22,
    dayEnd: 30,
    sectors: ['retail', 'tech_consumer'],
    impact: 35,
    description: 'Semana de mayores descuentos del año',
  },
  {
    name: 'Cyber Monday',
    month: 12,
    dayStart: 1,
    dayEnd: 3,
    sectors: ['retail', 'tech_consumer'],
    impact: 25,
    description: 'Pico de ventas online',
  },
  {
    name: 'Prime Day',
    month: 7,
    dayStart: 10,
    dayEnd: 15,
    sectors: ['retail'],
    impact: 20,
    description: 'Amazon Prime Day impulsa e-commerce',
  },
  {
    name: 'Singles Day (11.11)',
    month: 11,
    dayStart: 10,
    dayEnd: 12,
    sectors: ['retail'],
    impact: 15,
    description: 'Mayor evento de ventas en Asia',
  },
  {
    name: 'Navidad',
    month: 12,
    dayStart: 15,
    dayEnd: 25,
    sectors: ['retail', 'travel', 'tech_consumer', 'gaming'],
    impact: 40,
    description: 'Pico máximo de consumo anual',
  },
  // Eventos adicionales
  {
    name: 'Rebajas de enero',
    month: 1,
    dayStart: 7,
    dayEnd: 28,
    sectors: ['retail'],
    impact: 25,
    description: 'Rebajas post-navideñas impulsan ventas',
  },
  {
    name: 'San Valentín',
    month: 2,
    dayStart: 7,
    dayEnd: 14,
    sectors: ['retail'],
    impact: 15,
    description: 'Aumento de ventas por regalos',
  },
  {
    name: 'Semana Santa',
    month: 4, // Variable, pero aproximado
    dayStart: 1,
    dayEnd: 20,
    sectors: ['travel', 'retail'],
    impact: 20,
    description: 'Pico de viajes y compras pre-vacaciones',
  },
  {
    name: 'Día de la Madre',
    month: 5,
    dayStart: 1,
    dayEnd: 7,
    sectors: ['retail'],
    impact: 15,
    description: 'Aumento de ventas por regalos',
  },
  {
    name: 'Rebajas de verano',
    month: 7,
    dayStart: 1,
    dayEnd: 31,
    sectors: ['retail'],
    impact: 20,
    description: 'Rebajas de temporada impulsan ventas',
  },
  {
    name: 'Vuelta al cole',
    month: 9,
    dayStart: 1,
    dayEnd: 15,
    sectors: ['retail', 'tech_consumer'],
    impact: 25,
    description: 'Fuerte gasto en material escolar y tecnología',
  },
  {
    name: 'Halloween',
    month: 10,
    dayStart: 25,
    dayEnd: 31,
    sectors: ['retail', 'gaming'],
    impact: 10,
    description: 'Ventas de disfraces y promociones temáticas',
  },
  // Eventos deportivos
  {
    name: 'Super Bowl',
    month: 2,
    dayStart: 1,
    dayEnd: 15,
    sectors: ['retail', 'consumer_staples'], // TVs, snacks, bebidas
    impact: 10,
    description: 'Aumento ventas TVs, snacks y bebidas',
  },
  // Earnings seasons (aumenta volatilidad)
  {
    name: 'Earnings Season Q4',
    month: 1,
    dayStart: 10,
    dayEnd: 31,
    sectors: ['tech', 'banking', 'retail', 'tech_consumer'],
    impact: 0, // Neutral pero importante
    description: 'Temporada de resultados Q4 - mayor volatilidad',
  },
  {
    name: 'Earnings Season Q1',
    month: 4,
    dayStart: 10,
    dayEnd: 30,
    sectors: ['tech', 'banking', 'retail', 'tech_consumer'],
    impact: 0,
    description: 'Temporada de resultados Q1 - mayor volatilidad',
  },
  {
    name: 'Earnings Season Q2',
    month: 7,
    dayStart: 10,
    dayEnd: 31,
    sectors: ['tech', 'banking', 'retail', 'tech_consumer'],
    impact: 0,
    description: 'Temporada de resultados Q2 - mayor volatilidad',
  },
  {
    name: 'Earnings Season Q3',
    month: 10,
    dayStart: 10,
    dayEnd: 31,
    sectors: ['tech', 'banking', 'retail', 'tech_consumer'],
    impact: 0,
    description: 'Temporada de resultados Q3 - mayor volatilidad',
  },
];

class SeasonalityService {
  /**
   * Analiza la estacionalidad para un símbolo dado
   */
  analyzeSeasonality(symbol: string): SeasonalityAnalysis {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    
    // Detectar sector y región
    const sector = this.detectSector(symbol);
    const region = this.detectRegion(symbol);
    
    if (!sector || sector === 'unknown') {
      return {
        sector: 'Desconocido',
        region: this.getRegionName(region),
        seasonalEvents: [],
        seasonalScore: 0,
        hasData: false,
        summary: 'No hay patrones estacionales definidos para este activo',
      };
    }
    
    const events: SeasonalEvent[] = [];
    let totalScore = 0;
    let scoreCount = 0;
    
    // 1. Obtener patrón del sector para el mes actual
    const sectorPatterns = SECTOR_PATTERNS[sector] || [];
    for (const pattern of sectorPatterns) {
      if (pattern.months.includes(currentMonth)) {
        events.push({
          name: pattern.name,
          type: pattern.impact > 10 ? 'positive' : pattern.impact < -10 ? 'negative' : 'neutral',
          impact: Math.abs(pattern.impact) > 30 ? 'high' : Math.abs(pattern.impact) > 15 ? 'medium' : 'low',
          daysUntil: 0,
          description: pattern.description,
        });
        totalScore += pattern.impact;
        scoreCount++;
      }
    }
    
    // 2. Verificar eventos REGIONALES específicos del país
    for (const event of REGIONAL_EVENTS) {
      if (event.region !== region) continue;
      
      // Verificar si aplica al sector
      const appliesToSector = event.sectors === 'all' || event.sectors.includes(sector);
      if (!appliesToSector) continue;
      
      const daysUntil = this.daysUntilEvent(now, event.month, event.dayStart);
      
      // Evento actual o próximo (30 días)
      if (daysUntil >= -5 && daysUntil <= 30) {
        events.push({
          name: event.name,
          type: event.impact > 0 ? 'positive' : event.impact < 0 ? 'negative' : 'neutral',
          impact: Math.abs(event.impact) > 30 ? 'high' : Math.abs(event.impact) > 15 ? 'medium' : 'low',
          daysUntil,
          description: event.description,
          regional: true,
        });
        
        // Más impacto si está muy cerca
        if (daysUntil <= 7 && daysUntil >= -5) {
          totalScore += event.impact;
          scoreCount++;
        } else if (daysUntil <= 14) {
          totalScore += event.impact * 0.5;
          scoreCount++;
        }
      }
    }
    
    // 3. Verificar eventos fijos globales (solo si no hay ya uno regional similar)
    for (const event of FIXED_EVENTS) {
      if (!event.sectors.includes(sector)) continue;
      
      // Saltar si ya hay un evento regional con nombre similar
      const hasRegionalEquivalent = events.some(e => 
        e.regional && e.name.toLowerCase().includes(event.name.toLowerCase().split(' ')[0])
      );
      if (hasRegionalEquivalent) continue;
      
      const daysUntil = this.daysUntilEvent(now, event.month, event.dayStart);
      
      // Evento actual o próximo (30 días)
      if (daysUntil >= -5 && daysUntil <= 30) {
        events.push({
          name: event.name,
          type: event.impact > 0 ? 'positive' : 'negative',
          impact: 'high',
          daysUntil,
          description: event.description,
        });
        
        // Más impacto si está muy cerca
        if (daysUntil <= 7 && daysUntil >= -5) {
          totalScore += event.impact;
          scoreCount++;
        } else if (daysUntil <= 14) {
          totalScore += event.impact * 0.5;
          scoreCount++;
        }
      }
    }
    
    // 4. Efectos generales del mercado
    for (const effect of MARKET_EFFECTS) {
      if (effect.checkFn(now)) {
        events.push({
          name: effect.name,
          type: effect.impact > 5 ? 'positive' : effect.impact < -5 ? 'negative' : 'neutral',
          impact: Math.abs(effect.impact) > 10 ? 'medium' : 'low',
          daysUntil: 0,
          description: effect.description,
        });
        totalScore += effect.impact;
        scoreCount++;
      }
    }
    
    // Calcular score final
    const seasonalScore = scoreCount > 0 
      ? Math.max(-100, Math.min(100, totalScore / scoreCount * 2))
      : 0;
    
    // Generar resumen
    const summary = this.generateSummary(sector, region, events, seasonalScore);
    
    return {
      sector: this.getSectorName(sector),
      region: this.getRegionName(region),
      seasonalEvents: events.slice(0, 5), // Máximo 5 eventos
      seasonalScore: Math.round(seasonalScore),
      hasData: events.length > 0,
      summary,
      historicalPattern: undefined, // Se llena con analyzeSeasonalityWithHistory
    };
  }
  
  /**
   * Versión asíncrona que incluye patrones históricos del stock específico
   */
  async analyzeSeasonalityWithHistory(symbol: string): Promise<SeasonalityAnalysis> {
    // Obtener análisis base síncrono
    const baseAnalysis = this.analyzeSeasonality(symbol);
    
    // Intentar obtener patrón histórico
    try {
      const historicalPattern = await this.getHistoricalPattern(symbol);
      
      if (historicalPattern) {
        // Ajustar score basándose en patrón histórico
        let adjustedScore = baseAnalysis.seasonalScore;
        
        // El patrón histórico aporta hasta ±15 puntos
        if (historicalPattern.consistency > 60) {
          if (historicalPattern.direction === 'bullish') {
            adjustedScore += Math.min(15, historicalPattern.avg3Years * 0.5);
          } else if (historicalPattern.direction === 'bearish') {
            adjustedScore -= Math.min(15, Math.abs(historicalPattern.avg3Years) * 0.5);
          }
        }
        
        adjustedScore = Math.max(-100, Math.min(100, adjustedScore));
        
        // Actualizar summary con info histórica
        let updatedSummary = baseAnalysis.summary;
        if (historicalPattern.consistency > 50) {
          const patternDesc = historicalPattern.direction === 'bullish' 
            ? `📊 Históricamente positivo en este período (+${historicalPattern.avg3Years.toFixed(1)}% avg 3Y)`
            : historicalPattern.direction === 'bearish'
            ? `📊 Históricamente negativo en este período (${historicalPattern.avg3Years.toFixed(1)}% avg 3Y)`
            : '';
          if (patternDesc) {
            updatedSummary = `${updatedSummary} ${patternDesc}`;
          }
        }
        
        return {
          ...baseAnalysis,
          seasonalScore: Math.round(adjustedScore),
          summary: updatedSummary,
          historicalPattern,
        };
      }
    } catch (error) {
      console.warn(`[Seasonality] No se pudo obtener patrón histórico para ${symbol}:`, error);
    }
    
    return baseAnalysis;
  }
  
  /**
   * Obtiene el patrón histórico de un stock para el período actual del año
   * Analiza los últimos 3 años para el mismo período de 30 días
   */
  private async getHistoricalPattern(symbol: string): Promise<SeasonalityAnalysis['historicalPattern']> {
    try {
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentDay = now.getDate();
      
      // Obtener datos de los últimos 4 años
      const endDate = Math.floor(Date.now() / 1000);
      const startDate = endDate - (4 * 365 * 24 * 60 * 60); // 4 años atrás
      
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${startDate}&period2=${endDate}&interval=1d`;
      
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const data = await response.json();
      
      if (!data.chart?.result?.[0]) {
        return undefined;
      }
      
      const result = data.chart.result[0];
      const timestamps = result.timestamp || [];
      const closes = result.indicators?.quote?.[0]?.close || [];
      
      if (timestamps.length < 250) { // Mínimo ~1 año de datos
        return undefined;
      }
      
      // Calcular cambios para el mismo período en años anteriores
      const periodChanges: number[] = [];
      
      for (let yearsAgo = 1; yearsAgo <= 3; yearsAgo++) {
        const targetDate = new Date(now);
        targetDate.setFullYear(targetDate.getFullYear() - yearsAgo);
        
        // Buscar el precio al inicio del período (15 días antes) y al final
        const periodStart = new Date(targetDate);
        periodStart.setDate(periodStart.getDate() - 15);
        
        const periodEnd = new Date(targetDate);
        periodEnd.setDate(periodEnd.getDate() + 15);
        
        let startPrice: number | null = null;
        let endPrice: number | null = null;
        
        for (let i = 0; i < timestamps.length; i++) {
          const date = new Date(timestamps[i] * 1000);
          const price = closes[i];
          
          if (price === null || price === undefined) continue;
          
          // Buscar precio cercano al inicio del período
          if (!startPrice && Math.abs(date.getTime() - periodStart.getTime()) < 5 * 24 * 60 * 60 * 1000) {
            startPrice = price;
          }
          
          // Buscar precio cercano al final del período
          if (Math.abs(date.getTime() - periodEnd.getTime()) < 5 * 24 * 60 * 60 * 1000) {
            endPrice = price;
          }
        }
        
        if (startPrice && endPrice && startPrice > 0) {
          const change = ((endPrice - startPrice) / startPrice) * 100;
          periodChanges.push(change);
        }
      }
      
      if (periodChanges.length === 0) {
        return undefined;
      }
      
      const lastYear = periodChanges[0] || 0;
      const avg3Years = periodChanges.reduce((a, b) => a + b, 0) / periodChanges.length;
      
      // Calcular consistencia (qué tan seguido el patrón va en la misma dirección)
      const positiveCount = periodChanges.filter(c => c > 0).length;
      const negativeCount = periodChanges.filter(c => c < 0).length;
      const dominantDirection = positiveCount > negativeCount ? 'positive' : 'negative';
      const consistency = Math.max(positiveCount, negativeCount) / periodChanges.length * 100;
      
      // Determinar dirección solo si hay consistencia
      let direction: 'bullish' | 'bearish' | 'neutral' = 'neutral';
      if (consistency >= 66 && avg3Years > 2) {
        direction = 'bullish';
      } else if (consistency >= 66 && avg3Years < -2) {
        direction = 'bearish';
      }
      
      console.log(`[Seasonality] ${symbol} patrón histórico: lastYear=${lastYear.toFixed(1)}%, avg3Y=${avg3Years.toFixed(1)}%, consistency=${consistency.toFixed(0)}%, direction=${direction}`);
      
      return {
        lastYear,
        avg3Years,
        consistency,
        direction,
      };
      
    } catch (error) {
      console.warn(`[Seasonality] Error obteniendo patrón histórico:`, error);
      return undefined;
    }
  }
  
  /**
   * Detecta la región/país basándose en el sufijo de la bolsa
   */
  private detectRegion(symbol: string): string {
    // Buscar sufijo de bolsa
    for (const [suffix, region] of Object.entries(EXCHANGE_TO_REGION)) {
      if (suffix && symbol.endsWith(suffix)) {
        return region;
      }
    }
    
    // Sin sufijo = USA por defecto
    if (!symbol.includes('.')) {
      return 'usa';
    }
    
    return 'global';
  }
  
  private detectSector(symbol: string): string {
    // Primero buscar mapeo exacto
    if (SYMBOL_TO_SECTOR[symbol]) {
      return SYMBOL_TO_SECTOR[symbol];
    }
    
    // Intentar detectar por sufijo o patrón
    const upperSymbol = symbol.toUpperCase();
    
    // Cripto - no tiene estacionalidad tradicional
    if (upperSymbol.includes('-EUR') || upperSymbol.includes('-USD') || 
        upperSymbol.includes('BTC') || upperSymbol.includes('ETH')) {
      return 'crypto';
    }
    
    return 'unknown';
  }
  
  private daysUntilEvent(now: Date, eventMonth: number, eventDay: number): number {
    const currentYear = now.getFullYear();
    let eventDate = new Date(currentYear, eventMonth - 1, eventDay);
    
    // Si el evento ya pasó este año, calcular para el año que viene
    if (eventDate < now) {
      // Pero si pasó hace menos de 7 días, devolver negativo
      const daysPassed = Math.floor((now.getTime() - eventDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysPassed <= 7) {
        return -daysPassed;
      }
      eventDate = new Date(currentYear + 1, eventMonth - 1, eventDay);
    }
    
    return Math.floor((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }
  
  private getRegionName(region: string): string {
    const names: Record<string, string> = {
      usa: '🇺🇸 Estados Unidos',
      spain: '🇪🇸 España',
      mexico: '🇲🇽 México',
      china: '🇨🇳 China',
      japan: '🇯🇵 Japón',
      uk: '🇬🇧 Reino Unido',
      germany: '🇩🇪 Alemania',
      france: '🇫🇷 Francia',
      italy: '🇮🇹 Italia',
      brazil: '🇧🇷 Brasil',
      india: '🇮🇳 India',
      south_korea: '🇰🇷 Corea del Sur',
      australia: '🇦🇺 Australia',
      canada: '🇨🇦 Canadá',
      netherlands: '🇳🇱 Países Bajos',
      switzerland: '🇨🇭 Suiza',
      sweden: '🇸🇪 Suecia',
      denmark: '🇩🇰 Dinamarca',
      finland: '🇫🇮 Finlandia',
      norway: '🇳🇴 Noruega',
      belgium: '🇧🇪 Bélgica',
      austria: '🇦🇹 Austria',
      portugal: '🇵🇹 Portugal',
      greece: '🇬🇷 Grecia',
      russia: '🇷🇺 Rusia',
      south_africa: '🇿🇦 Sudáfrica',
      singapore: '🇸🇬 Singapur',
      thailand: '🇹🇭 Tailandia',
      indonesia: '🇮🇩 Indonesia',
      malaysia: '🇲🇾 Malasia',
      taiwan: '🇹🇼 Taiwán',
      new_zealand: '🇳🇿 Nueva Zelanda',
      turkey: '🇹🇷 Turquía',
      saudi_arabia: '🇸🇦 Arabia Saudí',
      uae: '🇦🇪 Emiratos Árabes',
      israel: '🇮🇱 Israel',
      poland: '🇵🇱 Polonia',
      argentina: '🇦🇷 Argentina',
      chile: '🇨🇱 Chile',
      colombia: '🇨🇴 Colombia',
      peru: '🇵🇪 Perú',
      global: '🌍 Global',
    };
    return names[region] || region;
  }
  
  private getSectorName(sector: string): string {
    const names: Record<string, string> = {
      retail: 'Retail/Moda',
      travel: 'Turismo/Viajes',
      energy: 'Energía',
      utilities: 'Utilities',
      construction: 'Construcción',
      tech_consumer: 'Tech Consumer',
      gaming: 'Gaming/Videojuegos',
      tech: 'Tecnología',
      consumer_staples: 'Consumo Básico',
      banking: 'Banca',
      telecom: 'Telecomunicaciones',
      healthcare: 'Salud/Farmacéutica',
      crypto: 'Criptomonedas',
      luxury: 'Lujo',
      restaurants: 'Restauración/Ocio',
      streaming: 'Streaming/Entretenimiento',
    };
    return names[sector] || sector;
  }
  
  private generateSummary(sector: string, region: string, events: SeasonalEvent[], score: number): string {
    if (events.length === 0) {
      return 'Sin patrones estacionales significativos para este período.';
    }
    
    const positiveEvents = events.filter(e => e.type === 'positive');
    const negativeEvents = events.filter(e => e.type === 'negative');
    const upcomingEvents = events.filter(e => e.daysUntil > 0 && e.daysUntil <= 14);
    const regionalEvents = events.filter(e => e.regional);
    
    let summary = '';
    
    if (score > 20) {
      summary = '📈 Temporada favorable. ';
    } else if (score < -20) {
      summary = '📉 Temporada desfavorable. ';
    } else {
      summary = '➖ Temporada neutral. ';
    }
    
    // Priorizar eventos regionales en el resumen
    if (regionalEvents.length > 0 && regionalEvents[0].daysUntil <= 14) {
      const regional = regionalEvents[0];
      if (regional.daysUntil === 0 || regional.daysUntil < 0) {
        summary += `🎯 ${regional.name}: ${regional.description}. `;
      } else {
        summary += `🎯 Próximo: ${regional.name} en ${regional.daysUntil} días. `;
      }
    } else if (positiveEvents.length > 0) {
      summary += `${positiveEvents[0].name}: ${positiveEvents[0].description}. `;
    }
    
    if (upcomingEvents.length > 0 && !regionalEvents.some(e => e.daysUntil > 0 && e.daysUntil <= 14)) {
      const next = upcomingEvents[0];
      summary += `Próximo: ${next.name} en ${next.daysUntil} días.`;
    }
    
    return summary.trim();
  }
}

export const seasonalityService = new SeasonalityService();
