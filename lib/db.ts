import { PrismaClient } from '@prisma/client';

/**
 * Prisma client singleton.
 *
 * In Next.js dev mode the module gets re-evaluated on every hot reload, which
 * would leak connections without the `globalThis` cache. In production each
 * Render instance gets a single client.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
