import { Worker, Job } from 'bullmq';
import { redisConnection } from '../config/redis';
import { prisma } from '../config/prisma';
import { JobStatus, JobType } from '@prisma/client';
import { DocumentJobPayload } from './queue';
import { jobProcessors } from './processors';
import { logger } from '../utils/logger';

const QUEUE_NAME = 'document-processing';

export const startQueueWorker = () => {
  const worker = new Worker<DocumentJobPayload>(
    QUEUE_NAME,
    async (job: Job<DocumentJobPayload>) => {
      const { documentId, jobType } = job.data;
      logger.info(`Starting background worker process for Job [${job.id}] - Type: ${jobType} on Document: ${documentId}`);

      // 1. Update Database states to PROCESSING
      await prisma.$transaction([
        prisma.jobLog.updateMany({
          where: { documentId, jobType, status: JobStatus.PENDING },
          data: { status: JobStatus.PROCESSING },
        }),
        prisma.document.update({
          where: { id: documentId },
          data: { status: JobStatus.PROCESSING },
        }),
      ]);

      // 2. Fetch the corresponding processor
      const processor = jobProcessors[jobType];
      if (!processor) {
        throw new Error(`No processor registered for job type: ${jobType}`);
      }

      // 3. Execute processor
      const result = await processor.process(job);

      if (!result.success) {
        throw new Error(result.error || `Processor failed for job type: ${jobType}`);
      }

      // 4. Update the specific JobLog to COMPLETED
      const jobLogs = await prisma.jobLog.findMany({
        where: { documentId, jobType, status: JobStatus.PROCESSING },
        orderBy: { updatedAt: 'desc' },
        take: 1,
      });

      if (jobLogs.length > 0) {
        await prisma.jobLog.update({
          where: { id: jobLogs[0].id },
          data: {
            status: JobStatus.COMPLETED,
            resultKey: result.resultKey || null,
          },
        });
      }

      // Only mark document as COMPLETED when ALL its jobs are done (no PENDING or PROCESSING remaining)
      const remainingJobs = await prisma.jobLog.count({
        where: {
          documentId,
          status: { in: [JobStatus.PENDING, JobStatus.PROCESSING] },
        },
      });

      if (remainingJobs === 0) {
        await prisma.document.update({
          where: { id: documentId },
          data: { status: JobStatus.COMPLETED },
        });
        logger.info(`All jobs done — Document [${documentId}] marked COMPLETED`);
      } else {
        logger.info(`Job [${jobType}] done — ${remainingJobs} job(s) still running for Document [${documentId}]`);
      }

      logger.info(`Successfully completed Job [${job.id}] - Type: ${jobType} for Document: ${documentId}`);
      return result;
    },
    {
      connection: redisConnection,
      concurrency: 5, // Process up to 5 jobs concurrently
    }
  );

  // Error listeners
  worker.on('failed', async (job, err) => {
    logger.error(`Job [${job?.id}] failed with error: ${err.message}`);
    
    if (job) {
      const { documentId, jobType } = job.data;
      try {
        const jobLogs = await prisma.jobLog.findMany({
          where: { documentId, jobType, status: JobStatus.PROCESSING },
          orderBy: { updatedAt: 'desc' },
          take: 1,
        });

        const dbUpdates: any[] = [];

        if (jobLogs.length > 0) {
          dbUpdates.push(
            prisma.jobLog.update({
              where: { id: jobLogs[0].id },
              data: {
                status: JobStatus.FAILED,
                error: err.message || 'Unknown processing error',
              },
            })
          );
        }

        dbUpdates.push(
          prisma.document.update({
            where: { id: documentId },
            data: { status: JobStatus.FAILED },
          })
        );

        await prisma.$transaction(dbUpdates);
        logger.info(`Recorded failure for Job [${job.id}] in database`);
      } catch (dbErr: any) {
        logger.error(`Failed to record job failure in database: ${dbErr.message}`);
      }
    }
  });

  worker.on('error', (err) => {
    logger.error(`Queue worker critical error: ${err.message}`);
  });

  logger.info(`Queue Worker listening for jobs in queue "${QUEUE_NAME}"...`);
  return worker;
};
