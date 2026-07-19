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
  static async chatWithDocument(userId: string, documentId: string, question: string) {
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
        body: JSON.stringify({ text: ocrText, question }),
      });

      if (!res.ok) {
        throw new Error(`AI Service /chat returned status ${res.status}`);
      }

      const body: any = await res.json();
      if (!body.success) {
        throw new Error(body.detail || 'AI Service chat returned failure');
      }

      return body.answer;
    } catch (error: any) {
      throw new AppError(`AI Q&A Error: ${error.message}`, 500);
    }
  }
}
