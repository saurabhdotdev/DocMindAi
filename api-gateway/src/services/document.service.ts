import { prisma } from '../config/prisma';
import { uploadToStorage, downloadFromStorage, deleteFromStorage, getPublicUrl } from '../config/storage';
import { AppError } from '../middleware/errorHandler';
import { JobStatus, JobType } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { addDocumentJob } from '../jobs/queue';


function sanitizeFilename(filename: string): string {
  // Replace spaces with underscores and remove parentheses / brackets to prevent header parsing bugs
  return filename.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9.\-_]/g, '');
}

export class DocumentService {
  // Upload document to S3 and save to PostgreSQL
  static async uploadDocument(userId: string, file: Express.Multer.File) {
    const documentId = uuidv4();
    const fileExt = path.extname(file.originalname).toLowerCase();
    const storageKey = `users/${userId}/${documentId}/${file.originalname}`;

    try {
      // 1. Upload file to Supabase Storage
      await uploadToStorage(storageKey, file.buffer, file.mimetype);

      // 2. Insert metadata record in database
      const document = await prisma.document.create({
        data: {
          id: documentId,
          userId,
          name: file.originalname,
          type: fileExt.replace('.', '').toUpperCase(),
          size: file.size,
          storageKey,
          mimeType: file.mimetype,
          status: JobStatus.PENDING,
        },
      });

      // 3. Enqueue the classification job (automatically creates PENDING JobLog)
      await addDocumentJob(document.id, userId, JobType.CLASSIFICATION, {});

      return document;
    } catch (error: any) {
      try { await deleteFromStorage(storageKey); } catch (_) {}
      throw new AppError(`Failed to process document upload: ${error.message}`, 500);
    }
  }

  // Retrieve user documents with pagination
  static async listDocuments(userId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [documents, total] = await prisma.$transaction([
      prisma.document.findMany({
        where: { userId },
        include: {
          jobLogs: {
            orderBy: { createdAt: 'desc' }
          },
          classification: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.document.count({
        where: { userId },
      }),
    ]);

    // Resolve pre-signed URLs for completed job log results
    const documentsWithUrls = await Promise.all(
      documents.map(async (doc) => {
        const jobLogsWithUrls = await Promise.all(
          doc.jobLogs.map(async (job) => {
            if (job.status === JobStatus.COMPLETED && job.resultKey) {
              try {
                const resultUrl = getPublicUrl(job.resultKey);
                return { ...job, resultUrl };
              } catch (err) {
                return job;
              }
            }
            return job;
          })
        );
        return {
          ...doc,
          jobLogs: jobLogsWithUrls,
        };
      })
    );

    return {
      documents: documentsWithUrls,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  // Fetch document details and generate S3 pre-signed download URL
  static async getDocumentDetails(userId: string, documentId: string) {
    const document = await prisma.document.findFirst({
      where: { id: documentId, userId },
      include: {
        jobLogs: {
          orderBy: { createdAt: 'desc' }
        },
        ocrResult: true, // Include full OCR text for detail view
        classification: true,
        resumeAnalysis: true,
        entities: {
          orderBy: { category: 'asc' }
        },
      },
    });


    if (!document) {
      throw new AppError('Document not found or access denied', 404);
    }

    // Generate public download URL via Supabase Storage
    let downloadUrl = '';
    try {
      downloadUrl = getPublicUrl(document.storageKey);
    } catch (err: any) {
      downloadUrl = '';
    }

    // Generate public URLs for any completed conversion/processing outputs
    const jobLogsWithUrls = document.jobLogs.map((job) => {
      if (job.status === JobStatus.COMPLETED && job.resultKey) {
        try {
          const resultUrl = getPublicUrl(job.resultKey);
          return { ...job, resultUrl };
        } catch (err) {
          return job;
        }
      }
      return job;
    });

    return {
      ...document,
      jobLogs: jobLogsWithUrls,
      downloadUrl,
    };
  }

  // Delete document from S3 and database
  static async deleteDocument(userId: string, documentId: string) {
    const document = await prisma.document.findFirst({
      where: { id: documentId, userId },
    });

    if (!document) {
      throw new AppError('Document not found or access denied', 404);
    }

    // Delete in database first, then delete in S3
    await prisma.document.delete({
      where: { id: documentId },
    });

    try {
      await deleteFromStorage(document.storageKey);
    } catch (_) {}

    return { success: true };
  }

  // Trigger format conversion job
  static async triggerConversion(userId: string, documentId: string, targetFormat: string) {
    const document = await prisma.document.findFirst({
      where: { id: documentId, userId },
    });

    if (!document) {
      throw new AppError('Document not found or access denied', 404);
    }

    const sourceFormat = document.type.toUpperCase();
    const cleanTarget = targetFormat.toUpperCase();

    // Map source formats to valid target formats
    const CONVERSION_MAP: Record<string, string[]> = {
      PDF: ['DOCX', 'PNG', 'PDF', 'TXT', 'XML', 'KML', 'JSON'],
      DOCX: ['PDF', 'DOCX', 'TXT', 'XML', 'KML', 'JSON'],
      PPTX: ['PDF', 'TXT'],
      PPT: ['PDF', 'TXT'],
      XLSX: ['CSV', 'JSON', 'XML'],
      CSV: ['XLSX', 'JSON', 'XML'],
      PNG: ['JPG', 'PNG'],
      WEBP: ['JPG', 'PNG'],
      GIF: ['JPG', 'PNG'],
      BMP: ['JPG', 'PNG'],
      HEIC: ['JPG', 'PNG'],
      JPEG: ['JPG', 'PNG'],
      JPG: ['JPG', 'PNG'],
      MOV: ['MP4'],
      AVI: ['MP4'],
      MP4: ['MP3'],
      MP3: ['WAV'],
    };

    const allowedTargets = CONVERSION_MAP[sourceFormat];
    if (!allowedTargets || !allowedTargets.includes(cleanTarget)) {
      throw new AppError(`Conversion from ${sourceFormat} to ${cleanTarget} is not supported`, 400);
    }

    // Mark the document status as PENDING (waiting for background job)
    await prisma.document.update({
      where: { id: documentId },
      data: { status: JobStatus.PENDING },
    });

    // Enqueue conversion background job
    const jobResult = await addDocumentJob(documentId, userId, JobType.CONVERSION, {
      targetFormat: cleanTarget,
    });

    return jobResult;
  }

  // Ask questions about document content using AI Service Q&A
  static async chatWithDocument(userId: string, documentId: string, question: string, systemPrompt?: string) {
    const document = await prisma.document.findFirst({
      where: { id: documentId, userId },
      include: {
        ocrResult: true,
      },
    });

    if (!document) {
      throw new AppError('Document not found or access denied', 404);
    }

    const ocrText = document.ocrResult?.text || '';
    if (!ocrText.trim()) {
      throw new AppError('This document has no extracted text. Please wait for OCR or upload a text-readable file.', 400);
    }

    const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

    try {
      const res = await fetch(`${AI_SERVICE_URL}/v1/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: ocrText, question, docId: documentId, systemPrompt }),
      });

      if (!res.ok) {
        throw new Error(`AI Service /chat returned status ${res.status}`);
      }

      const body: any = await res.json();
      if (!body.success) {
        throw new Error(body.detail || 'AI Service chat returned failure');
      }

      return {
        answer: body.answer,
        sources: body.sources || [],
      };
    } catch (error: any) {
      throw new AppError(`AI Q&A Error: ${error.message}`, 500);
    }
  }

  // Ask questions across multiple documents simultaneously
  static async chatWithMultipleDocuments(userId: string, documentIds: string[], question: string) {
    const documents = await prisma.document.findMany({
      where: {
        id: { in: documentIds },
        userId,
      },
      include: {
        ocrResult: true,
      },
    });

    if (documents.length === 0) {
      throw new AppError('No matching documents found or access denied', 404);
    }

    // Build combined text fallback
    let combinedText = '';
    for (const doc of documents) {
      const text = doc.ocrResult?.text || '';
      if (text.trim()) {
        combinedText += `\n\n--- Document: ${doc.name} ---\n${text}`;
      }
    }

    if (!combinedText.trim()) {
      throw new AppError('None of the selected documents have extracted OCR text yet.', 400);
    }

    const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

    try {
      const res = await fetch(`${AI_SERVICE_URL}/v1/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: combinedText, question, docId: documentIds }),
      });

      if (!res.ok) {
        throw new Error(`AI Service /chat returned status ${res.status}`);
      }

      const body: any = await res.json();
      if (!body.success) {
        throw new Error(body.detail || 'AI Service chat returned failure');
      }

      return {
        answer: body.answer,
        sources: body.sources || [],
      };
    } catch (error: any) {
      throw new AppError(`AI Q&A Error: ${error.message}`, 500);
    }
  }

  // Generate comparison matrix of documents
  static async compareDocuments(userId: string, docIds: string[]) {
    const documents = await prisma.document.findMany({
      where: {
        id: { in: docIds },
        userId,
      },
      include: {
        classification: true,
        resumeAnalysis: true,
        entities: true,
      },
    });

    if (documents.length === 0) {
      throw new AppError('No matching documents found', 404);
    }

    const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

    try {
      const res = await fetch(`${AI_SERVICE_URL}/v1/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docs: documents }),
      });

      if (!res.ok) {
        throw new Error(`AI Service /compare returned status ${res.status}`);
      }

      const body: any = await res.json();
      return body.comparison || [];
    } catch (error: any) {
      throw new AppError(`AI Comparison Error: ${error.message}`, 500);
    }
  }

  // Update layout block text and trigger indexing update
  static async updateOcrLayout(userId: string, documentId: string, blocks: any[]) {
    const document = await prisma.document.findFirst({
      where: { id: documentId, userId },
      include: { ocrResult: true },
    });

    if (!document) {
      throw new AppError('Document not found or access denied', 404);
    }

    // Build combined full text
    const combinedText = blocks.map(b => b.text).join('\n');

    // Update layout data & text in DB
    if (document.ocrResult) {
      await prisma.oCRResult.update({
        where: { documentId },
        data: {
          text: combinedText,
          layout: { ...document.ocrResult.layout as any, blocks },
        },
      });
    } else {
      await prisma.oCRResult.create({
        data: {
          documentId,
          text: combinedText,
          layout: { pagesCount: 1, blocks },
        },
      });
    }

    const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

    // Update Qdrant vector database asynchronously
    fetch(`${AI_SERVICE_URL}/v1/index`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId: documentId, docName: document.name, text: combinedText }),
    }).catch(err => {
      console.error(`Qdrant re-indexing error: ${err.message}`);
    });
  }

  // Translate document layout text blocks
  static async translateDocumentLayout(userId: string, documentId: string, targetLang: string) {
    const document = await prisma.document.findFirst({
      where: { id: documentId, userId },
      include: { ocrResult: true },
    });

    if (!document || !document.ocrResult) {
      throw new AppError('Document layout text not found or access denied', 404);
    }

    const layout = document.ocrResult.layout as any;
    const blocks = layout.blocks || [];

    const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

    try {
      const res = await fetch(`${AI_SERVICE_URL}/v1/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks, targetLang }),
      });

      if (!res.ok) {
        throw new Error(`AI Service /translate returned status ${res.status}`);
      }

      const body: any = await res.json();
      return body.blocks || [];
    } catch (error: any) {
      throw new AppError(`AI Translation Error: ${error.message}`, 500);
    }
  }

  // Multi-agent document debate simulation
  static async debateDocument(userId: string, id: string, question: string, agentIds?: string[]) {
    const document = await prisma.document.findFirst({
      where: { id, userId },
      include: { ocrResult: true },
    });

    if (!document || !document.ocrResult) {
      throw new AppError('Document layout text not found or access denied', 404);
    }

    let customAgentsList: any[] = [];
    if (agentIds && agentIds.length > 0) {
      customAgentsList = await prisma.agentProfile.findMany({
        where: { id: { in: agentIds }, userId },
      });
    }

    const text = document.ocrResult.text;
    const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

    try {
      const res = await fetch(`${AI_SERVICE_URL}/v1/debate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          question,
          agents: customAgentsList.map(a => ({
            name: a.name,
            systemPrompt: a.systemPrompt,
            avatar: a.avatar,
          })),
        }),
      });

      if (!res.ok) {
        throw new Error(`AI Service /debate returned status ${res.status}`);
      }

      const body: any = await res.json();
      return body.debate || [];
    } catch (error: any) {
      throw new AppError(`AI Debate Error: ${error.message}`, 500);
    }
  }

  // NPR podcast conversational summaries script generator
  static async podcastDocument(userId: string, id: string) {
    const document = await prisma.document.findFirst({
      where: { id, userId },
      include: { ocrResult: true },
    });

    if (!document || !document.ocrResult) {
      throw new AppError('Document layout text not found or access denied', 404);
    }

    const text = document.ocrResult.text;
    const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

    try {
      const res = await fetch(`${AI_SERVICE_URL}/v1/podcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        throw new Error(`AI Service /podcast returned status ${res.status}`);
      }

      const body: any = await res.json();
      return body.podcast || {};
    } catch (error: any) {
      throw new AppError(`AI Podcast Error: ${error.message}`, 500);
    }
  }

  // Merge multiple PDF documents into one new document
  static async mergeDocuments(userId: string, documentIds: string[], name: string) {
    if (!documentIds || documentIds.length < 2) {
      throw new AppError('At least 2 documents are required to merge', 400);
    }

    const docs = await prisma.document.findMany({
      where: { id: { in: documentIds }, userId },
    });

    if (docs.length !== documentIds.length) {
      throw new AppError('One or more selected documents were not found or access denied', 404);
    }

    const nonPdfs = docs.filter(d => d.type !== 'PDF');
    if (nonPdfs.length > 0) {
      throw new AppError('Only PDF documents can be merged at this time', 400);
    }

    let finalName = name.trim();
    if (!finalName.toLowerCase().endsWith('.pdf')) {
      finalName += '.pdf';
    }

    const { PDFDocument } = require('pdf-lib');
    const mergedPdf = await PDFDocument.create();

    for (const docId of documentIds) {
      const doc = docs.find(d => d.id === docId)!;
      const buffer = await downloadFromStorage(doc.storageKey);
      const pdf = await PDFDocument.load(buffer);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((page: any) => mergedPdf.addPage(page));
    }

    const mergedBuffer = await mergedPdf.save();
    const documentId = uuidv4();
    const storageKey = `users/${userId}/${documentId}/${finalName}`;

    await uploadToStorage(storageKey, Buffer.from(mergedBuffer), 'application/pdf');

    const document = await prisma.document.create({
      data: {
        id: documentId,
        userId,
        name: finalName,
        type: 'PDF',
        size: mergedBuffer.length,
        storageKey,
        mimeType: 'application/pdf',
        status: JobStatus.PENDING,
      },
    });

    await addDocumentJob(document.id, userId, JobType.CLASSIFICATION, {});
    return document;
  }

  // Split a PDF document into multiple documents by ranges
  static async splitDocument(userId: string, id: string, rangesStr: string) {
    const doc = await prisma.document.findFirst({
      where: { id, userId },
    });

    if (!doc) {
      throw new AppError('Document not found', 404);
    }

    if (doc.type !== 'PDF') {
      throw new AppError('Only PDF documents can be split', 400);
    }

    const originalBuffer = await downloadFromStorage(doc.storageKey);
    const { PDFDocument } = require('pdf-lib');
    const originalPdf = await PDFDocument.load(originalBuffer);
    const totalPages = originalPdf.getPageCount();

    // Helper to parse page ranges e.g. "1-2, 3"
    const parts = rangesStr.split(',').map(p => p.trim());
    const parsedRanges: { start: number; end: number }[] = [];

    for (const part of parts) {
      if (part.includes('-')) {
        const [startStr, endStr] = part.split('-');
        const start = Math.max(1, parseInt(startStr, 10));
        const end = Math.min(totalPages, parseInt(endStr, 10));
        if (start <= end) parsedRanges.push({ start, end });
      } else {
        const page = parseInt(part, 10);
        if (page >= 1 && page <= totalPages) {
          parsedRanges.push({ start: page, end: page });
        }
      }
    }

    if (parsedRanges.length === 0) {
      throw new AppError('No valid page ranges provided', 400);
    }

    const baseName = doc.name.substring(0, doc.name.lastIndexOf('.'));
    const createdDocs = [];

    for (let i = 0; i < parsedRanges.length; i++) {
      const range = parsedRanges[i];
      const splitPdf = await PDFDocument.create();
      
      const pageIndices = [];
      for (let p = range.start - 1; p <= range.end - 1; p++) {
        pageIndices.push(p);
      }

      const copiedPages = await splitPdf.copyPages(originalPdf, pageIndices);
      copiedPages.forEach((page: any) => splitPdf.addPage(page));

      const splitBuffer = await splitPdf.save();
      const documentId = uuidv4();
      const nameSuffix = range.start === range.end ? `_page_${range.start}` : `_pages_${range.start}-${range.end}`;
      const splitName = `${baseName}${nameSuffix}.pdf`;
      const storageKey = `users/${userId}/${documentId}/${splitName}`;

      await uploadToStorage(storageKey, Buffer.from(splitBuffer), 'application/pdf');

      const document = await prisma.document.create({
        data: {
          id: documentId,
          userId,
          name: splitName,
          type: 'PDF',
          size: splitBuffer.length,
          storageKey,
          mimeType: 'application/pdf',
          status: JobStatus.PENDING,
        },
      });

      await addDocumentJob(document.id, userId, JobType.CLASSIFICATION, {});
      createdDocs.push(document);
    }

    return createdDocs;
  }
}
