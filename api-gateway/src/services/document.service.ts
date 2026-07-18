import { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { prisma } from '../config/prisma';
import { s3Client } from '../config/s3';
import { AppError } from '../middleware/errorHandler';
import { JobStatus, JobType } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { addDocumentJob } from '../jobs/queue';

const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || 'docmind-uploads';

function sanitizeFilename(filename: string): string {
  // Replace spaces with underscores and remove parentheses / brackets to prevent header parsing bugs
  return filename.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9.\-_]/g, '');
}

export class DocumentService {
  // Upload document to S3 and save to PostgreSQL
  static async uploadDocument(userId: string, file: Express.Multer.File) {
    const documentId = uuidv4();
    const fileExt = path.extname(file.originalname).toLowerCase();
    
    // Create a unique S3 key: users/<userId>/<documentId>/filename
    const storageKey = `users/${userId}/${documentId}/${file.originalname}`;

    try {
      // 1. Upload file buffer to S3
      await s3Client.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET_NAME,
          Key: storageKey,
          Body: file.buffer,
          ContentType: file.mimetype,
        })
      );

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

      // 3. Create job log entry for automatic classification
      await prisma.jobLog.create({
        data: {
          documentId: document.id,
          jobType: JobType.CLASSIFICATION,
          status: JobStatus.PENDING,
        },
      });

      // 4. Enqueue the classification job
      await addDocumentJob(document.id, userId, JobType.CLASSIFICATION, {});

      return document;
    } catch (error: any) {
      // In case S3 succeeded but DB insertion failed, attempt rollback of the S3 file
      try {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: S3_BUCKET_NAME,
            Key: storageKey,
          })
        );
      } catch (cleanupErr: any) {
        // Silently swallow rollback errors to report original root error
      }
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
                const rawFilename = job.resultKey.split('/').pop() || 'converted';
                const filename = sanitizeFilename(rawFilename);
                const command = new GetObjectCommand({
                  Bucket: S3_BUCKET_NAME,
                  Key: job.resultKey,
                  ResponseContentDisposition: `attachment; filename="${filename}"`
                });
                const resultUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
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

    // Generate pre-signed URL (valid for 1 hour)
    let downloadUrl = '';
    try {
      const filename = sanitizeFilename(document.name);
      const command = new GetObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: document.storageKey,
        ResponseContentDisposition: `attachment; filename="${filename}"`
      });
      downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    } catch (err: any) {
      throw new AppError(`Error generating download URL: ${err.message}`, 500);
    }

    // Generate pre-signed URLs for any completed conversion/processing outputs
    const jobLogsWithUrls = await Promise.all(
      document.jobLogs.map(async (job) => {
        if (job.status === JobStatus.COMPLETED && job.resultKey) {
          try {
            const rawFilename = job.resultKey.split('/').pop() || 'converted';
            const filename = sanitizeFilename(rawFilename);
            const command = new GetObjectCommand({
              Bucket: S3_BUCKET_NAME,
              Key: job.resultKey,
              ResponseContentDisposition: `attachment; filename="${filename}"`
            });
            const resultUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
            return { ...job, resultUrl };
          } catch (err) {
            return job;
          }
        }
        return job;
      })
    );

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
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: S3_BUCKET_NAME,
          Key: document.storageKey,
        })
      );
    } catch (error: any) {
      // If DB delete succeeded but S3 failed, log it but don't crash the request
      // (a background job or policy could clean up orphaned objects)
    }

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
}
