import { Job } from 'bullmq';
import { IJobProcessor, JobProcessorResult } from './index';
import { DocumentJobPayload } from '../queue';
import { prisma } from '../../config/prisma';
import { logger } from '../../utils/logger';

export class OcrProcessor implements IJobProcessor {
  async process(job: Job<DocumentJobPayload>): Promise<JobProcessorResult> {
    const { documentId } = job.data;
    logger.info(`[OcrProcessor] Running OCR layout analysis for document: ${documentId}`);

    // Simulate OCR processing delay
    await new Promise((resolve) => setTimeout(resolve, 3500));

    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new Error(`Document ${documentId} not found in database`);
    }

    // Insert simulated OCR Results
    const mockOcrText = `DocMind AI OCR Result Output\n============================\nDocument Name: ${document.name}\nExtracted text lines and structural content...`;
    const mockLayoutJson = {
      pagesCount: 1,
      language: 'en',
      confidence: 99.4,
      blocks: [
        {
          type: 'header',
          text: 'DocMind AI OCR Result Output',
          boundingBox: [10, 10, 200, 30],
        },
        {
          type: 'paragraph',
          text: `Document Name: ${document.name}`,
          boundingBox: [10, 50, 400, 100],
        },
      ],
    };

    // Save OCR results in DB
    await prisma.oCRResult.create({
      data: {
        documentId: document.id,
        text: mockOcrText,
        layout: mockLayoutJson,
      },
    });

    logger.info(`[OcrProcessor] OCR processing completed for Document ${documentId}`);

    return {
      success: true,
      data: {
        wordsCount: 12,
        pagesParsed: 1,
      },
    };
  }
}
