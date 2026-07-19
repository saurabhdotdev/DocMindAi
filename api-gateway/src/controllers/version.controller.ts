import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { uploadToStorage, getPublicUrl } from '../config/storage';
import { uploadMiddleware } from '../middleware/upload.middleware';

export class VersionController {
  // GET /v1/documents/:id/versions
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401));
      const { id } = req.params;

      // Verify ownership
      const doc = await prisma.document.findFirst({ where: { id, userId: req.user.id } });
      if (!doc) return next(new AppError('Document not found', 404));

      const versions = await prisma.documentVersion.findMany({
        where: { documentId: id },
        orderBy: { versionNumber: 'desc' },
      });

      const result = versions.map((v) => ({
        ...v,
        downloadUrl: getPublicUrl(v.storageKey),
      }));

      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      return next(error);
    }
  }

  // POST /v1/documents/:id/versions
  static async upload(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401));
      const { id } = req.params;
      const file = req.file;

      if (!file) return next(new AppError('No file uploaded', 400));

      // Verify ownership
      const doc = await prisma.document.findFirst({ where: { id, userId: req.user.id } });
      if (!doc) return next(new AppError('Document not found', 404));

      // Get next version number
      const latestVersion = await prisma.documentVersion.findFirst({
        where: { documentId: id },
        orderBy: { versionNumber: 'desc' },
      });
      const nextVersion = (latestVersion?.versionNumber ?? 0) + 1;

      // Store original as v1 if no versions exist yet
      if (nextVersion === 1) {
        await prisma.documentVersion.create({
          data: {
            documentId: id,
            versionNumber: 1,
            storageKey: doc.storageKey,
            size: doc.size,
            mimeType: doc.mimeType,
            uploadedBy: req.user.id,
          },
        });
      }

      // Upload new version file
      const key = `documents/${req.user.id}/v${nextVersion + (nextVersion === 1 ? 1 : 0)}_${Date.now()}_${file.originalname}`;
      await uploadToStorage(key, file.buffer, file.mimetype);

      const version = await prisma.documentVersion.create({
        data: {
          documentId: id,
          versionNumber: nextVersion + (nextVersion === 1 ? 1 : 0),
          storageKey: key,
          size: file.size,
          mimeType: file.mimetype,
          uploadedBy: req.user.id,
        },
      });

      // Update the document's main storageKey to the latest version
      await prisma.document.update({
        where: { id },
        data: { storageKey: key, size: file.size, mimeType: file.mimetype, status: 'PENDING' },
      });

      return res.status(201).json({
        success: true,
        data: { ...version, downloadUrl: getPublicUrl(key) },
      });
    } catch (error) {
      return next(error);
    }
  }
}
