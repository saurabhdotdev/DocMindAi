import { Job } from 'bullmq';
import { IJobProcessor, JobProcessorResult } from './index';
import { DocumentJobPayload } from '../queue';
import { prisma } from '../../config/prisma';
import { downloadFromStorage } from '../../config/storage';
import { logger } from '../../utils/logger';
import mammoth from 'mammoth';

const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || 'docmind-uploads';
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

export class OcrProcessor implements IJobProcessor {
  async process(job: Job<DocumentJobPayload>): Promise<JobProcessorResult> {
    const { documentId, options } = job.data;
    logger.info(`[OcrProcessor] Running for document: ${documentId}`);

    const document = await prisma.document.findUnique({ where: { id: documentId } });
    if (!document) throw new Error(`Document ${documentId} not found`);

    let extractedText: string = options?.extractedText || '';
    let layoutData: any = null;

    const isAudioOrVideo = document.mimeType.startsWith('audio/') || 
                           document.mimeType.startsWith('video/') || 
                           document.name.endsWith('.mp3') || 
                           document.name.endsWith('.wav') || 
                           document.name.endsWith('.mp4') ||
                           document.name.endsWith('.m4a');

    if (isAudioOrVideo) {
      logger.info(`[OcrProcessor] Audio/Video file detected. Requesting AI transcription...`);
      // Call AI Service transcribe endpoint
      const transcribeRes = await fetch(`${AI_SERVICE_URL}/v1/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storageKey: document.storageKey, docName: document.name }),
      });

      if (!transcribeRes.ok) throw new Error(`AI Service /transcribe returned ${transcribeRes.status}`);
      const transcribeBody: any = await transcribeRes.json();
      if (!transcribeBody.success) throw new Error('AI Service transcription returned failure');

      extractedText = transcribeBody.text;
      layoutData = transcribeBody.layout;
    } else {
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

      layoutData = body.data;
    }

    logger.info(`[OcrProcessor] Parsing complete — ${layoutData.pagesCount || 1} pages/segments, ${layoutData.blocks?.length} blocks`);

    // Save OCR/Transcript result to DB (upsert safe)
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

    // Evaluate workflows for document automation
    try {
      const fullDoc = await prisma.document.findUnique({
        where: { id: documentId },
        include: { classification: true, resumeAnalysis: true, entities: true },
      });

      if (fullDoc) {
        const workflows = await prisma.workflow.findMany({
          where: { userId: fullDoc.userId, isActive: true, trigger: 'DOCUMENT_PROCESSED' },
        });

        for (const wf of workflows) {
          try {
            const conditions: any = wf.conditions || {};
            const field = conditions.field;
            const operator = conditions.operator;
            const value = conditions.value;

            let match = false;

            if (field === 'category') {
              const categoryLabel = fullDoc.classification?.label || 'Unknown';
              if (operator === 'equals' && categoryLabel.toLowerCase() === String(value).toLowerCase()) {
                match = true;
              }
            } else if (field === 'size') {
              const docSizeKb = fullDoc.size / 1024;
              if (operator === 'greater_than' && docSizeKb > Number(value)) {
                match = true;
              }
            } else if (field === 'skills') {
              const skillsList = (fullDoc.resumeAnalysis?.skills as string[]) || [];
              const hasSkill = skillsList.some(s => s.toLowerCase().includes(String(value).toLowerCase()));
              if (operator === 'contains' && hasSkill) {
                match = true;
              }
            }

            if (match) {
              const actions: any = wf.actions || {};
              if (actions.action === 'MOVE_TO_FOLDER' && actions.folderId) {
                await prisma.document.update({
                  where: { id: documentId },
                  data: { folderId: actions.folderId },
                });
                logger.info(`[Workflow] Document ${documentId} auto-moved to folder ${actions.folderId} via workflow: ${wf.name}`);
              }
            }
          } catch (wfErr: any) {
            logger.error(`[Workflow] Execution failed for ${wf.id}: ${wfErr.message}`);
          }
        }
      }
    } catch (err: any) {
      logger.error(`[Workflow Engine] Error fetching document context: ${err.message}`);
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
      data: { pagesCount: layoutData.pagesCount || 1, blocksCount: layoutData.blocks?.length || 0 },
    };
  }
}
