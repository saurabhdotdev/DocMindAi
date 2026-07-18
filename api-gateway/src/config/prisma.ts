import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prismaClientSingleton = () => {
  return new PrismaClient({
    log: [
      {
        emit: 'event',
        level: 'query',
      },
      {
        emit: 'event',
        level: 'error',
      },
      {
        emit: 'event',
        level: 'info',
      },
      {
        emit: 'event',
        level: 'warn',
      },
    ],
  });
};

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>;
}

export const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma;
}

// Attach log listeners
(prisma as any).$on('query', (e: any) => {
  // Queries can be verbose, you can uncomment this in deep debugging
  // logger.debug(`Query: ${e.query} -- Params: ${e.params} -- Duration: ${e.duration}ms`);
});

(prisma as any).$on('error', (e: any) => {
  logger.error(`Prisma Error: ${e.message}`);
});

(prisma as any).$on('warn', (e: any) => {
  logger.warn(`Prisma Warning: ${e.message}`);
});

(prisma as any).$on('info', (e: any) => {
  logger.info(`Prisma Info: ${e.message}`);
});
