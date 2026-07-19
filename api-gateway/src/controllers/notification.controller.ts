import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';

export class NotificationController {
  // GET /v1/notifications
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401));

      const notifications = await prisma.notification.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
        take: 30,
      });

      const unreadCount = notifications.filter((n) => !n.isRead).length;

      return res.status(200).json({ success: true, data: { notifications, unreadCount } });
    } catch (error) {
      return next(error);
    }
  }

  // PUT /v1/notifications/read-all
  static async markAllRead(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401));

      await prisma.notification.updateMany({
        where: { userId: req.user.id, isRead: false },
        data: { isRead: true },
      });

      return res.status(200).json({ success: true, message: 'All notifications marked as read' });
    } catch (error) {
      return next(error);
    }
  }

  // PUT /v1/notifications/:id/read
  static async markRead(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401));
      const { id } = req.params;

      await prisma.notification.updateMany({
        where: { id, userId: req.user.id },
        data: { isRead: true },
      });

      return res.status(200).json({ success: true });
    } catch (error) {
      return next(error);
    }
  }
}

// Helper to create notifications from anywhere in the codebase
export async function createNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
  data?: object
) {
  try {
    await prisma.notification.create({
      data: { userId, type, title, message, data: data ?? {} },
    });
  } catch (err) {
    // Non-critical, swallow errors
    console.error('[Notification] Failed to create:', err);
  }
}
