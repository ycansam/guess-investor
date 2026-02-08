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
  'UNI-USD': 'crypto_alt', 'UNI-EUR': 'crypto_alt', 'LINK-USD': 'crypto_alt',
  // ETFs e índices
  'SPY': 'etf_index', 'QQQ': 'etf_index', 'VOO': 'etf_index',
  '^GSPC': 'etf_index', '^DJI': 'etf_index', '^IXIC': 'etf_index',
  // Commodities (futuros)
  'GC=F': 'commodity', 'CL=F': 'commodity', 'SI=F': 'commodity', 'NG=F': 'commodity',
  'PL=F': 'commodity', 'PA=F': 'commodity', 'HG=F': 'commodity',
  // Commodity ETFs - Oro
  'GLD': 'commodity', 'IAU': 'commodity', 'SGOL': 'commodity',
  'PPFB.DE': 'commodity', 'EGLN.L': 'commodity', 'SGLN.L': 'commodity',
  'PHAU.L': 'commodity', 'GOLD.L': 'commodity',
  // Commodity ETFs - Plata
  'SLV': 'commodity', 'SIVR': 'commodity',
  'PHAG.MI': 'commodity', 'ISLN.L': 'commodity', 'SSLN.L': 'commodity', 'SLVR.L': 'commodity',
  // Commodity ETFs - Platino/Paladio
  'PPLT': 'commodity', 'PALL': 'commodity',
  'PPLT.MI': 'commodity', 'PHPT.L': 'commodity',
  // Commodity ETFs - Petróleo
  'USO': 'commodity', 'BNO': 'commodity',
  'WTIU.MI': 'commodity', 'CRUD.L': 'commodity',
  // ETFs genéricos
  'CSPX.MI': 'etf_index', 'VEUR.DE': 'etf_index', 'EIMI.AS': 'etf_index',
  'IUIT.AS': 'etf_index', 'WTCH.DE': 'etf_index', 'SUWS.AS': 'etf_index',
  'WSML.AS': 'etf_index', 'SMHS.DE': 'etf_index',
};

// Patrones de nombre para commodity ETFs
const COMMODITY_NAME_PATTERNS = [
  'physical gold', 'gold etc', 'physical silver', 'silver etc',
  'physical platinum', 'platinum etc', 'physical palladium',
  'crude oil', 'wti crude', 'brent crude', 'natural gas',
  'gold trust', 'silver trust', 'commodity', 'metals',
  'physical metals', 'wisdomtree physical', 'ishares physical',
];

function detectAssetGroup(symbol: string, assetType: string, assetName: string = ''): string {
  // 1. Mapeo manual (prioridad máxima)
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

  // 4. Por nombre - Commodities (importante: antes de ETFs)
  const nameLower = assetName.toLowerCase();
  for (const pattern of COMMODITY_NAME_PATTERNS) {
    if (nameLower.includes(pattern)) {
      return 'commodity';
    }
  }

  // 5. Por nombre - ETFs/Index
  if (nameLower.includes('msci') || nameLower.includes('s&p 500') || 
      nameLower.includes('etf') || nameLower.includes('vanguard') ||
      nameLower.includes('ucits') || nameLower.includes('ishares core') ||
      nameLower.includes('leveraged') || nameLower.includes('semiconductor')) {
    return 'etf_index';
  }

  // 6. Por extensión de mercado
  if (symbol.includes('.MC') || symbol.includes('.L') || symbol.includes('.PA') || 
      symbol.includes('.DE') || symbol.includes('.AS') || symbol.includes('.MI')) {
    // Pero verificar si no es ETF/commodity
    if (nameLower.includes('plc') || nameLower.includes('inc') || nameLower.includes('corp')) {
      return 'large_cap_stock';
    }
    return 'large_cap_stock';
  }

  return 'default';
}

async function main() {
  console.log('🔍 Buscando TODAS las predicciones verificadas para actualizar assetGroup...');
  
  // Obtener TODAS las predicciones verificadas (no solo las sin factorBreakdown)
  const predictions = await prisma.prediction.findMany({
    where: {
      verified: true,
    },
    select: {
      id: true,
      symbol: true,
      asset: true,
      assetType: true,
      factorBreakdown: true,
    },
  });

  console.log(`📊 Encontradas ${predictions.length} predicciones verificadas`);

  if (predictions.length === 0) {
    console.log('✅ No hay predicciones para actualizar');
    return;
  }

  let updated = 0;
  let unchanged = 0;
  let errors = 0;
  const groupCounts: Record<string, number> = {};

  for (const pred of predictions) {
    try {
      const newGroup = detectAssetGroup(pred.symbol, pred.assetType, pred.asset || '');
      
      // Contar por grupo
      groupCounts[newGroup] = (groupCounts[newGroup] || 0) + 1;
      
      // Parsear factorBreakdown existente o crear nuevo
      let factorBreakdown: any = {};
      if (pred.factorBreakdown) {
        try {
          factorBreakdown = JSON.parse(pred.factorBreakdown);
        } catch {
          factorBreakdown = {};
        }
      }
      
      // Verificar si necesita actualización
      const currentGroup = factorBreakdown.assetGroup || 'unknown';
      
      if (currentGroup !== newGroup) {
        // Actualizar assetGroup
        factorBreakdown.assetGroup = newGroup;
        factorBreakdown.assetGroupDescription = `Grupo: ${newGroup}`;
        
        // Si no tiene los campos básicos, añadirlos
        if (!factorBreakdown.relevantFactors) {
          factorBreakdown.relevantFactors = ['trend', 'technical', 'sentiment', 'news'];
        }
        if (!factorBreakdown.availableFactors) {
          factorBreakdown.availableFactors = [];
        }
        if (!factorBreakdown.weightsUsed) {
          factorBreakdown.weightsUsed = {};
        }
        
        await prisma.prediction.update({
          where: { id: pred.id },
          data: {
            factorBreakdown: JSON.stringify(factorBreakdown),
          },
        });

        updated++;
        if (updated % 50 === 0) {
          console.log(`  Actualizadas ${updated}...`);
        }
      } else {
        unchanged++;
      }
    } catch (err) {
      errors++;
      console.error(`  Error con ${pred.symbol}: ${err}`);
    }
  }

  console.log(`\n✅ Completado: ${updated} actualizadas, ${unchanged} sin cambios`);
  if (errors > 0) {
    console.log(`⚠️ ${errors} errores`);
  }
  
  console.log(`\n📊 Distribución por grupo:`);
  const sortedGroups = Object.entries(groupCounts).sort((a, b) => b[1] - a[1]);
  for (const [group, count] of sortedGroups) {
    console.log(`  ${group}: ${count} predicciones`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
