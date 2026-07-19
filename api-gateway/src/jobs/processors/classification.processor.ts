import { Job } from 'bullmq';
import { IJobProcessor, JobProcessorResult } from './index';
import { DocumentJobPayload } from '../queue';
import { prisma } from '../../config/prisma';
import { downloadFromStorage } from '../../config/storage';
import { logger } from '../../utils/logger';
import { addDocumentJob } from '../queue';
import { JobType, JobStatus } from '@prisma/client';
import mammoth from 'mammoth';

const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || 'docmind-uploads';
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

async function streamToBuffer(stream: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: any[] = [];
    stream.on('data', (chunk: any) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

async function extractTextFromFile(document: any, buffer: Buffer): Promise<string> {
  let text = '';
  if (document.mimeType === 'application/pdf') {
    try {
      const { PDFParse } = require('pdf-parse');
      const parser = new PDFParse({ data: buffer });
      const pdfData = await parser.getText();
      text = pdfData.text || '';
    } catch (e: any) {
      logger.error(`[ClassificationProcessor] pdf-parse error: ${e.message}`);
    }
  } else if (
    document.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    document.name.endsWith('.docx')
  ) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value || '';
    } catch (e: any) {
      logger.error(`[ClassificationProcessor] mammoth error: ${e.message}`);
    }
  } else {
    text = buffer.toString('utf-8');
  }
  return text.trim() || `Document: ${document.name} | Type: ${document.type}`;
}

export class ClassificationProcessor implements IJobProcessor {
  async process(job: Job<DocumentJobPayload>): Promise<JobProcessorResult> {
    const { documentId, userId } = job.data;
    logger.info(`[ClassificationProcessor] Starting for document: ${documentId}`);

    const document = await prisma.document.findUnique({ where: { id: documentId } });
    if (!document) throw new Error(`Document ${documentId} not found`);

    // 1. Download from Supabase Storage
    const fileBuffer = await downloadFromStorage(document.storageKey);

    // 2. Extract text
    const extractedText = await extractTextFromFile(document, fileBuffer);

    // 3. Call AI service
    const res = await fetch(`${AI_SERVICE_URL}/v1/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: extractedText }),
    });

    if (!res.ok) throw new Error(`AI Service /classify returned ${res.status}`);
    const body: any = await res.json();
    if (!body.success) throw new Error('AI Service classification returned failure');

    const { category, confidence } = body;
    logger.info(`[ClassificationProcessor] Classified as: ${category} (conf: ${confidence})`);

    // 4. Upsert classification result
    await prisma.documentClassification.upsert({
      where: { documentId },
      update: { label: category, confidence },
      create: { documentId, label: category, confidence },
    });

    // 5. Chain: enqueue OCR + Entity Extraction after classification
    await prisma.jobLog.createMany({
      data: [
        { documentId, jobType: JobType.OCR, status: JobStatus.PENDING },
        { documentId, jobType: JobType.ENTITY_EXTRACTION, status: JobStatus.PENDING },
      ],
    });
    await addDocumentJob(documentId, userId, JobType.OCR, { extractedText });
    await addDocumentJob(documentId, userId, JobType.ENTITY_EXTRACTION, { extractedText });

    return { success: true, data: { category, confidence } };
  }
}
