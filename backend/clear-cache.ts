import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Borrar todo el training cache de EGLN.L
  const deletedCache = await prisma.trainingCache.deleteMany({
    where: { symbol: 'EGLN.L' }
  });
  console.log('Deleted training cache entries:', deletedCache.count);
  
  // Verificar predicciones
  const preds = await prisma.prediction.findMany({
    where: { symbol: 'EGLN.L' },
    select: { id: true, currency: true, currentPrice: true, targetPrice: true, createdAt: true }
  });
  console.log('\nPredicciones EGLN.L:', preds.length);
  preds.forEach(p => {
    console.log(`  - Currency: ${p.currency}, Price: ${p.currentPrice}, Target: ${p.targetPrice}`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
