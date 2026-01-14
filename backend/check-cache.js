const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const all = await p.trainingCache.findMany();
  console.log('Total registros en TrainingCache:', all.length);
  
  const now = new Date();
  const active = all.filter(x => new Date(x.expiresAt) > now);
  console.log('Activos (no expirados):', active.length);
  
  if (all.length > 0) {
    console.log('\nÚltimos 5 registros:');
    all.slice(-5).forEach(x => {
      console.log(`  ${x.symbol} ${x.timeframe} - expires: ${x.expiresAt} - ${new Date(x.expiresAt) > now ? 'ACTIVO' : 'EXPIRADO'}`);
    });
  }
  
  // Opción: extender predicciones expiradas recientes (últimas 24 horas)
  const yesterDay = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const recentExpired = all.filter(x => {
    const exp = new Date(x.expiresAt);
    return exp > yesterDay && exp < now;
  });
  
  console.log(`\nPredicciones expiradas en las últimas 24h: ${recentExpired.length}`);
  
  if (process.argv.includes('--fix')) {
    console.log('\nExtendiendo predicciones expiradas...');
    const durations = {
      intraday: 24 * 60 * 60 * 1000,  // 24 horas
      swing: 7 * 24 * 60 * 60 * 1000, // 7 días
      longterm: 30 * 24 * 60 * 60 * 1000, // 30 días
    };
    
    let fixed = 0;
    for (const pred of recentExpired) {
      const duration = durations[pred.timeframe] || durations.swing;
      const newExpiry = new Date(now.getTime() + duration);
      await p.trainingCache.update({
        where: { id: pred.id },
        data: { expiresAt: newExpiry }
      });
      fixed++;
    }
    console.log(`Extendidas ${fixed} predicciones`);
  } else {
    console.log('\nEjecuta con --fix para extender las predicciones expiradas');
  }
}

main().finally(() => p.$disconnect());
