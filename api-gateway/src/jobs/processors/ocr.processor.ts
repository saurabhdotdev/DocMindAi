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

export class OcrProcessor implements IJobProcessor {
  async process(job: Job<DocumentJobPayload>): Promise<JobProcessorResult> {
    const { documentId, options } = job.data;
    logger.info(`[OcrProcessor] Running for document: ${documentId}`);

    const document = await prisma.document.findUnique({ where: { id: documentId } });
    if (!document) throw new Error(`Document ${documentId} not found`);

    // Use extracted text passed from classification job, or re-extract from S3
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

    // Call AI Service for OCR layout analysis
    const res = await fetch(`${AI_SERVICE_URL}/v1/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: extractedText }),
    });

    if (!res.ok) throw new Error(`AI Service /ocr returned ${res.status}`);
    const body: any = await res.json();
    if (!body.success) throw new Error('AI Service OCR returned failure');

    const layoutData = body.data;
    logger.info(`[OcrProcessor] OCR complete — ${layoutData.pagesCount} pages, ${layoutData.blocks?.length} blocks`);

    // Save OCR result to DB (upsert safe)
    const existing = await prisma.oCRResult.findUnique({ where: { documentId } });
    if (existing) {
      await prisma.oCRResult.update({
        where: { documentId },
        data: { text: extractedText, layout: layoutData },
      });
    } else {
      await prisma.oCRResult.create({
        data: { documentId, text: extractedText, layout: layoutData },
      });
    }

    // Trigger Qdrant indexing asynchronously
    fetch(`${AI_SERVICE_URL}/v1/index`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId: documentId, docName: document.name, text: extractedText }),
    }).catch(err => {
      logger.error(`[OcrProcessor] Qdrant indexing trigger failed: ${err.message}`);
    });

    return {
      success: true,
      data: { pagesCount: layoutData.pagesCount, blocksCount: layoutData.blocks?.length || 0 },
    };
  }
}
