import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { uploadToStorage, getPublicUrl } from '../config/storage';
import { addDocumentJob } from '../jobs/queue';

export class PublicController {
  static async convert(req: Request, res: Response, next: NextFunction) {
    try {
      const file = req.file;
      const { targetFormat } = req.body;

      if (!file) {
        return next(new AppError('No file uploaded', 400));
      }

      if (!targetFormat || !targetFormat.trim()) {
        return next(new AppError('targetFormat is required', 400));
      }

      // 1. IP-based limit check
      const ip = String(req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress);
      let limit = await prisma.publicLimit.findUnique({ where: { ipAddress: ip } });
      
      if (limit && limit.count >= 2) {
        return res.status(403).json({
          success: false,
          code: 'LIMIT_EXCEEDED',
          message: 'Free conversion limit reached. Please register or log in to continue.',
        });
      }

      // 2. Ensure default system guest user
      let guestUser = await prisma.user.findUnique({ where: { email: 'guest@docmind.ai' } });
      if (!guestUser) {
        const passwordHash = await bcrypt.hash('GuestPass123!', 10);
        guestUser = await prisma.user.create({
          data: {
            email: 'guest@docmind.ai',
            passwordHash,
            firstName: 'Guest',
            lastName: 'User',
            isEmailVerified: true,
          },
        });
      }

      // 3. Upload raw file to S3
      const key = `documents/public/${Date.now()}_${file.originalname}`;
      await uploadToStorage(key, file.buffer, file.mimetype);

      // 4. Create document entry associated with guest user
      const document = await prisma.document.create({
        data: {
          userId: guestUser.id,
          name: file.originalname,
          type: file.originalname.split('.').pop()?.toUpperCase() || 'PDF',
          size: file.size,
          storageKey: key,
          mimeType: file.mimetype,
          status: 'PENDING',
        },
      });

      // 5. Enqueue conversion background job
      await addDocumentJob(document.id, guestUser.id, 'CONVERSION' as any, {
        targetFormat: String(targetFormat).toUpperCase(),
      });

      // 6. Synchronously poll/await conversion completion
      let completedJob = null;
      for (let i = 0; i < 30; i++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const job = await prisma.jobLog.findFirst({
          where: { documentId: document.id, jobType: 'CONVERSION' },
        });
        if (job && (job.status === 'COMPLETED' || job.status === 'FAILED')) {
          completedJob = job;
          break;
        }
      }

      // 7. Increment limit counter
      if (limit) {
        limit = await prisma.publicLimit.update({
          where: { ipAddress: ip },
          data: { count: limit.count + 1 },
        });
      } else {
        limit = await prisma.publicLimit.create({
          data: { ipAddress: ip, count: 1 },
        });
      }

      // 8. Return result URL or fail
      if (completedJob && completedJob.status === 'COMPLETED') {
        const downloadUrl = getPublicUrl(completedJob.resultKey!);
        return res.status(200).json({
          success: true,
          downloadUrl,
          remainingAttempts: 2 - limit.count,
        });
      } else {
        return next(new AppError('Conversion job failed or timed out. Please try again.', 500));
      }
    } catch (error) {
      return next(error);
    }
  }
}
