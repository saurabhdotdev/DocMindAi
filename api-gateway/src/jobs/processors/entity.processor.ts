import { Job } from 'bullmq';
import { IJobProcessor, JobProcessorResult } from './index';
import { DocumentJobPayload } from '../queue';
import { prisma } from '../../config/prisma';
import { downloadFromStorage } from '../../config/storage';
import { logger } from '../../utils/logger';
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

export class EntityExtractionProcessor implements IJobProcessor {
  async process(job: Job<DocumentJobPayload>): Promise<JobProcessorResult> {
    const { documentId, options } = job.data;
    logger.info(`[EntityExtractionProcessor] Running for document: ${documentId}`);

    const document = await prisma.document.findUnique({ where: { id: documentId } });
    if (!document) throw new Error(`Document ${documentId} not found`);

    // Reuse pre-extracted text from chained classification job if available
    let extractedText: string = options?.extractedText || '';

    if (!extractedText) {
      const fileBuffer = await downloadFromStorage(document.storageKey);

      if (document.mimeType === 'application/pdf') {
        try {
          const { PDFParse } = require('pdf-parse');
          const parser = new PDFParse({ data: fileBuffer });
          const pdfData = await parser.getText();
          extractedText = pdfData.text || '';
        } catch (e: any) { logger.error(`pdf-parse error: ${e.message}`); }
      } else if (document.name.endsWith('.docx')) {
        try {
          const res = await mammoth.extractRawText({ buffer: fileBuffer });
          extractedText = res.value || '';
        } catch (e: any) { logger.error(`mammoth error: ${e.message}`); }
      } else {
        extractedText = fileBuffer.toString('utf-8');
      }
    }

    if (!extractedText.trim()) {
      extractedText = `Document: ${document.name}`;
    }

    // Call AI Service for entity extraction
    const res = await fetch(`${AI_SERVICE_URL}/v1/entities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: extractedText }),
    });

    if (!res.ok) throw new Error(`AI Service /entities returned ${res.status}`);
    const body: any = await res.json();
    if (!body.success) throw new Error('AI Service entity extraction returned failure');

    const entities: any[] = body.entities || [];
    logger.info(`[EntityExtractionProcessor] Found ${entities.length} entities in document ${documentId}`);

    // Delete old entities and replace (clean slate on reprocess)
    await prisma.entity.deleteMany({ where: { documentId } });

    if (entities.length > 0) {
      await prisma.entity.createMany({
        data: entities.map((e: any) => ({
          documentId,
          name: e.name || e.value,
          category: e.category,
          value: e.value,
          startChar: e.startChar ?? 0,
          endChar: e.endChar ?? 0,
        })),
      });
    }

    return {
      success: true,
      data: { entitiesFound: entities.length },
    };
  }
}
