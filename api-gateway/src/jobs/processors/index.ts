import { Job } from 'bullmq';
import { DocumentJobPayload } from '../queue';
import { JobType } from '@prisma/client';
import { ConversionProcessor } from './conversion.processor';
import { OcrProcessor } from './ocr.processor';
import { ClassificationProcessor } from './classification.processor';

export interface JobProcessorResult {
  success: boolean;
  resultKey?: string; // S3 storage path for output file
  data?: any; // Additional metadata (like OCR layout or summaries)
  error?: string;
}

export interface IJobProcessor {
  process(job: Job<DocumentJobPayload>): Promise<JobProcessorResult>;
}

// Registry mapping JobTypes to processors
export const jobProcessors: Record<JobType, IJobProcessor | null> = {
  CONVERSION: new ConversionProcessor(),
  OCR: new OcrProcessor(),
  SUMMARIZATION: null,
  TRANSLATION: null,
  ENTITY_EXTRACTION: null,
  CLASSIFICATION: new ClassificationProcessor(),
  TABLE_EXTRACTION: null,
  AUDIO_AI: null,
  VIDEO_AI: null,
  IMAGE_AI: null,
};
