import { Request, Response, NextFunction } from 'express';
import { DocumentService } from '../services/document.service';
import { AppError } from '../middleware/errorHandler';
import { prisma } from '../config/prisma';

export class DocumentController {
  // Handle file uploads
  static async upload(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        return next(new AppError('No file uploaded or file rejected by validator', 400));
      }

      if (!req.user) {
        return next(new AppError('User session not found', 401));
      }

      const document = await DocumentService.uploadDocument(req.user.id, req.file);

      return res.status(201).json({
        success: true,
        message: 'Document uploaded successfully',
        data: document,
      });
    } catch (error) {
      return next(error);
    }
  }

  // Handle document listing
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return next(new AppError('User session not found', 401));
      }

      const page = parseInt(req.query.page as string || '1', 10);
      const limit = parseInt(req.query.limit as string || '10', 10);

      const result = await DocumentService.listDocuments(req.user.id, page, limit);

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      return next(error);
    }
  }

  // Fetch single document details
  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return next(new AppError('User session not found', 401));
      }

      const { id } = req.params;
      const document = await DocumentService.getDocumentDetails(req.user.id, id);

      return res.status(200).json({
        success: true,
        data: document,
      });
    } catch (error) {
      return next(error);
    }
  }

  // Trigger document format conversion
  static async convert(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return next(new AppError('User session not found', 401));
      }

      const { id } = req.params;
      const { targetFormat } = req.body;

      if (!targetFormat) {
        return next(new AppError('Target format is required', 400));
      }

      const result = await DocumentService.triggerConversion(req.user.id, id, targetFormat);

      return res.status(200).json({
        success: true,
        message: 'Conversion job enqueued successfully',
        data: result,
      });
    } catch (error) {
      return next(error);
    }
  }

  // Delete document
  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return next(new AppError('User session not found', 401));
      }

      const { id } = req.params;
      await DocumentService.deleteDocument(req.user.id, id);

      return res.status(200).json({
        success: true,
        message: 'Document deleted successfully',
      });
    } catch (error) {
      return next(error);
    }
  }

  // Chat / Q&A with document text
  static async chat(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return next(new AppError('User session not found', 401));
      }

      const { id } = req.params;
      const { question } = req.body;

      if (!question || !question.trim()) {
        return next(new AppError('Question is required', 400));
      }

      const { answer, sources } = await DocumentService.chatWithDocument(req.user.id, id, question.trim());

      return res.status(200).json({
        success: true,
        answer,
        sources,
      });
    } catch (error) {
      return next(error);
    }
  }

  // Multi-document Chat / Q&A
  static async multiChat(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return next(new AppError('User session not found', 401));
      }

      const { docIds, question } = req.body;

      if (!docIds || !Array.isArray(docIds) || docIds.length === 0) {
        return next(new AppError('docIds array is required and must not be empty', 400));
      }

      if (!question || !question.trim()) {
        return next(new AppError('Question is required', 400));
      }

      const { answer, sources } = await DocumentService.chatWithMultipleDocuments(req.user.id, docIds, question.trim());

      return res.status(200).json({
        success: true,
        answer,
        sources,
      });
    } catch (error) {
      return next(error);
    }
  }

  // Cross-document Comparatives
  static async compare(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return next(new AppError('User session not found', 401));
      }

      const { docIds } = req.body;

      if (!docIds || !Array.isArray(docIds) || docIds.length === 0) {
        return next(new AppError('docIds array is required', 400));
      }

      const result = await DocumentService.compareDocuments(req.user.id, docIds);

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      return next(error);
    }
  }

  // Update OCR layout blocks text
  static async updateOcr(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return next(new AppError('User session not found', 401));
      }

      const { id } = req.params;
      const { blocks } = req.body;

      if (!blocks || !Array.isArray(blocks)) {
        return next(new AppError('blocks array is required', 400));
      }

      await DocumentService.updateOcrLayout(req.user.id, id, blocks);

      return res.status(200).json({
        success: true,
        message: 'OCR layout updated and re-indexed successfully',
      });
    } catch (error) {
      return next(error);
    }
  }

  // Translate document layout blocks
  static async translate(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return next(new AppError('User session not found', 401));
      }

      const { id } = req.params;
      const { targetLang } = req.body;

      if (!targetLang) {
        return next(new AppError('targetLang is required', 400));
      }

      const result = await DocumentService.translateDocumentLayout(req.user.id, id, targetLang);

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      return next(error);
    }
  }

  // Assign a document to a folder
  static async assignFolder(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return next(new AppError('User session not found', 401));
      }

      const { id } = req.params;
      const { folderId } = req.body;

      const document = await prisma.document.findFirst({
        where: { id, userId: req.user.id },
      });

      if (!document) {
        return next(new AppError('Document not found or access denied', 404));
      }

      if (folderId) {
        const folder = await prisma.folder.findFirst({
          where: { id: folderId, userId: req.user.id },
        });
        if (!folder) {
          return next(new AppError('Target folder not found or access denied', 404));
        }
      }

      const updated = await prisma.document.update({
        where: { id },
        data: { folderId: folderId || null },
      });

      return res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (error) {
      return next(error);
    }
  }

  // Multi-agent AI Debate
  static async debate(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return next(new AppError('User session not found', 401));
      }

      const { id } = req.params;
      const { question } = req.body;

      if (!question || !question.trim()) {
        return next(new AppError('Question topic is required for debate', 400));
      }

      const result = await DocumentService.debateDocument(req.user.id, id, question.trim());

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      return next(error);
    }
  }

  // NPR podcast dialogue script generator
  static async podcast(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return next(new AppError('User session not found', 401));
      }

      const { id } = req.params;

      const result = await DocumentService.podcastDocument(req.user.id, id);

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      return next(error);
    }
  }
}
