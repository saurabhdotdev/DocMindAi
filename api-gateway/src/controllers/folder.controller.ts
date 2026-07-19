import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';

export class FolderController {
  // List folders belonging to user or shared with user
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return next(new AppError('User session not found', 401));
      }

      // Fetch user's email first
      const dbUser = await prisma.user.findUnique({
        where: { id: req.user.id },
      });

      if (!dbUser) {
        return next(new AppError('User not found', 404));
      }

      // Query folders
      const folders = await prisma.folder.findMany({
        where: {
          OR: [
            { userId: req.user.id },
            {
              sharedWith: {
                array_contains: dbUser.email,
              },
            },
          ],
        },
        include: {
          documents: {
            select: { id: true, name: true, size: true, type: true, status: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.status(200).json({
        success: true,
        data: folders,
      });
    } catch (error) {
      return next(error);
    }
  }

  // Create folder
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return next(new AppError('User session not found', 401));
      }

      const { name } = req.body;
      if (!name || !name.trim()) {
        return next(new AppError('Folder name is required', 400));
      }

      const folder = await prisma.folder.create({
        data: {
          userId: req.user.id,
          name: name.trim(),
          sharedWith: [],
        },
        include: { documents: true },
      });

      return res.status(201).json({
        success: true,
        data: folder,
      });
    } catch (error) {
      return next(error);
    }
  }

  // Share folder with another user by email
  static async share(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return next(new AppError('User session not found', 401));
      }

      const { id } = req.params;
      const { email } = req.body;

      if (!email || !email.trim()) {
        return next(new AppError('Email is required to share folder', 400));
      }

      const folder = await prisma.folder.findFirst({
        where: { id, userId: req.user.id },
      });

      if (!folder) {
        return next(new AppError('Folder not found or access denied', 404));
      }

      const sharedList = Array.isArray(folder.sharedWith) ? [...folder.sharedWith] : [];
      const targetEmail = email.trim().toLowerCase();

      if (!sharedList.includes(targetEmail)) {
        sharedList.push(targetEmail);
      }

      const updated = await prisma.folder.update({
        where: { id },
        data: { sharedWith: sharedList },
      });

      return res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (error) {
      return next(error);
    }
  }
}
