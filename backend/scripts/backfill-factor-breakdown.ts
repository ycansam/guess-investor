/**
 * Script para backfill de factorBreakdown en predicciones antiguas
 * Ejecutar con: npx tsx scripts/backfill-factor-breakdown.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Mapa de símbolos conocidos a grupos
const SYMBOL_TO_GROUP: Record<string, string> = {
  // Crypto majors
  'BTC-USD': 'crypto_major', 'ETH-USD': 'crypto_major', 'BNB-USD': 'crypto_major',
  'BTC-EUR': 'crypto_major', 'ETH-EUR': 'crypto_major', 'BNB-EUR': 'crypto_major',
  // Crypto alts
  'SOL-USD': 'crypto_alt', 'ADA-USD': 'crypto_alt', 'DOGE-USD': 'crypto_alt',
  'XRP-USD': 'crypto_alt', 'AVAX-USD': 'crypto_alt', 'DOT-USD': 'crypto_alt',
  // ETFs e índices
  'SPY': 'etf_index', 'QQQ': 'etf_index', 'VOO': 'etf_index',
  '^GSPC': 'etf_index', '^DJI': 'etf_index', '^IXIC': 'etf_index',
  // Commodities
  'GC=F': 'commodity', 'CL=F': 'commodity', 'SI=F': 'commodity', 'NG=F': 'commodity',
};

function detectAssetGroup(symbol: string, assetType: string, assetName: string = ''): string {
  // 1. Mapeo manual
  if (SYMBOL_TO_GROUP[symbol]) return SYMBOL_TO_GROUP[symbol];

  // 2. Crypto por tipo
  if (assetType === 'crypto') {
    const majorCryptos = ['BTC', 'ETH', 'BNB'];
    const base = symbol.replace(/-USD|-EUR|-GBP/g, '');
    return majorCryptos.includes(base) ? 'crypto_major' : 'crypto_alt';
  }

  // 3. Patrones de símbolo
  if (symbol.startsWith('^')) return 'etf_index';
  if (symbol.endsWith('=F')) return 'commodity';
  if (symbol.endsWith('=X')) return 'forex';

  // 4. Por nombre
  const nameLower = assetName.toLowerCase();
  if (nameLower.includes('physical gold') || nameLower.includes('gold etc') || 
      nameLower.includes('physical silver') || nameLower.includes('physical metals')) {
    return 'commodity';
  }
  if (nameLower.includes('msci') || nameLower.includes('s&p 500') || 
      nameLower.includes('etf') || nameLower.includes('vanguard')) {
    return 'etf_index';
  }

  // 5. Por extensión de mercado
  if (symbol.includes('.MC') || symbol.includes('.L') || symbol.includes('.PA') || 
      symbol.includes('.DE') || symbol.includes('.AS')) {
    return 'large_cap_stock';
  }

  return 'default';
}

async function main() {
  console.log('🔍 Buscando predicciones verificadas sin factorBreakdown...');
  
  const predictions = await prisma.prediction.findMany({
    where: {
      verified: true,
      factorBreakdown: null,
    },
    select: {
      id: true,
      symbol: true,
      asset: true,
      assetType: true,
    },
  });

  console.log(`📊 Encontradas ${predictions.length} predicciones para actualizar`);

  if (predictions.length === 0) {
    console.log('✅ No hay predicciones para actualizar');
    return;
  }

  let updated = 0;
  let errors = 0;

  for (const pred of predictions) {
    try {
      const assetGroup = detectAssetGroup(pred.symbol, pred.assetType, pred.asset || '');
      
      const factorBreakdown = {
        assetGroup,
        assetGroupDescription: `Grupo: ${assetGroup}`,
        relevantFactors: ['trend', 'technical', 'sentiment', 'news'],
        availableFactors: [],
        weightsUsed: {},
        usingLearnedWeights: false,
        confidenceExplanation: 'Datos reconstruidos',
        signalSummary: 'insufficient',
      };

      await prisma.prediction.update({
        where: { id: pred.id },
        data: {
          factorBreakdown: JSON.stringify(factorBreakdown),
        },
      });

      updated++;
      if (updated % 10 === 0) {
        console.log(`  Actualizadas ${updated}/${predictions.length}...`);
      }
    } catch (err) {
      errors++;
      console.error(`  Error con ${pred.symbol}: ${err}`);
    }
  }

  console.log(`\n✅ Completado: ${updated}/${predictions.length} predicciones actualizadas`);
  if (errors > 0) {
    console.log(`⚠️ ${errors} errores`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
