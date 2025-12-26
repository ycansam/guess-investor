import { PrismaClient } from '@prisma/client';
import { config } from './index.js';

// Singleton de Prisma
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: config.isDev ? ['query', 'error', 'warn'] : ['error'],
});

if (config.isDev) {
  globalForPrisma.prisma = prisma;
}

export default prisma;
