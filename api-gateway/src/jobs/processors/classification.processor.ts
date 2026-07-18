import { Job } from 'bullmq';
import { IJobProcessor, JobProcessorResult } from './index';
import { DocumentJobPayload } from '../queue';
import { prisma } from '../../config/prisma';
import { s3Client } from '../../config/s3';
import { GetObjectCommand } from '@aws-sdk/client-s3';
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

export class ClassificationProcessor implements IJobProcessor {
  async process(job: Job<DocumentJobPayload>): Promise<JobProcessorResult> {
    const { documentId } = job.data;
    logger.info(`[ClassificationProcessor] Starting document classification for document: ${documentId}`);

    // 1. Fetch document metadata
    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new Error(`Document ${documentId} not found in database`);
    }

    // 2. Fetch original file buffer from S3
    logger.info(`[ClassificationProcessor] Downloading original S3 file: ${document.storageKey}`);
    const s3Response = await s3Client.send(
      new GetObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: document.storageKey,
      })
    );

    const originalFileBuffer = await streamToBuffer(s3Response.Body);
    let extractedText = '';

    // 3. Extract text content based on file type
    if (document.mimeType === 'application/pdf') {
      try {
        const pdf = require('pdf-parse');
        const parser = new pdf.PDFParse({ data: originalFileBuffer });
        const pdfData = await parser.getText();
        extractedText = pdfData.text || '';
      } catch (pdfErr: any) {
        logger.error(`[ClassificationProcessor] pdf-parse failed: ${pdfErr.message}`);
      }
    } else if (
      document.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      document.name.endsWith('.docx')
    ) {
      try {
        const result = await mammoth.extractRawText({ buffer: originalFileBuffer });
        extractedText = result.value || '';
      } catch (docxErr: any) {
        logger.error(`[ClassificationProcessor] mammoth failed: ${docxErr.message}`);
      }
    } else {
      // Fallback: decode basic text files
      extractedText = originalFileBuffer.toString('utf-8');
    }

    if (!extractedText.trim()) {
      extractedText = `Document details:\nName: ${document.name}\nType: ${document.type}`;
    }

    // 4. Send POST request to FastAPI AI Service
    const classifyUrl = `${AI_SERVICE_URL}/v1/classify`;
    logger.info(`[ClassificationProcessor] Requesting classification from AI Service: ${classifyUrl}`);

    try {
      const response = await fetch(classifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: extractedText }),
      });

      if (!response.ok) {
        throw new Error(`AI Service returned status ${response.status}: ${response.statusText}`);
      }

      const resBody: any = await response.json();
      if (!resBody.success) {
        throw new Error('AI Service classification failed');
      }

      const { category, confidence } = resBody;
      logger.info(`[ClassificationProcessor] Document ${documentId} classified as: ${category} (conf: ${confidence})`);

      // 5. Save results to database
      await prisma.documentClassification.upsert({
        where: { documentId: document.id },
        update: {
          label: category,
          confidence: confidence,
        },
        create: {
          documentId: document.id,
          label: category,
          confidence: confidence,
        },
      });

      return {
        success: true,
        data: {
          category,
          confidence,
        },
      };
    } catch (apiErr: any) {
      logger.error(`[ClassificationProcessor] API call to AI Service failed: ${apiErr.message}`);
      throw new Error(`Classification API failed: ${apiErr.message}`);
    }
  }
}
