import { Queue } from 'bullmq';
import { redisConnection } from '../config/redis';
import { prisma } from '../config/prisma';
import { JobType, JobStatus } from '@prisma/client';
import { logger } from '../utils/logger';

const QUEUE_NAME = 'document-processing';

// Instantiate BullMQ Queue
export const documentQueue = new Queue(QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3, // Retry up to 3 times on failure
    backoff: {
      type: 'exponential',
      delay: 5000, // Wait 5s, 10s, 20s...
    },
    removeOnComplete: true, // Clean up successful Redis keys
    removeOnFail: false, // Keep failed jobs in Redis for analysis
  },
});

export interface DocumentJobPayload {
  documentId: string;
  jobType: JobType;
  userId: string;
  options?: any;
}

/**
 * Creates a database job log and enqueues the task in BullMQ.
 */
export async function addDocumentJob(
  documentId: string,
  userId: string,
  jobType: JobType,
  options: any = {}
) {
  try {
    // 1. Create JobLog record in database
    const jobLog = await prisma.jobLog.create({
      data: {
        documentId,
        jobType,
        status: JobStatus.PENDING,
      },
    });

    const payload: DocumentJobPayload = {
      documentId,
      jobType,
      userId,
      options,
    };

    // 2. Queue the job in Redis
    const jobName = `${jobType.toLowerCase()}_${documentId}`;
    const job = await documentQueue.add(jobName, payload);

    logger.info(`Queued background job [${jobType}] for Document [${documentId}] - Job ID: ${job.id}`);
    return { jobLogId: jobLog.id, jobId: job.id };
  } catch (error: any) {
    logger.error(`Failed to queue job [${jobType}] for Document [${documentId}]: ${error.message}`);
    throw error;
  }
}
