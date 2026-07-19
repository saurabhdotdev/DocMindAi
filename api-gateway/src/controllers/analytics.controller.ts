import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';

export class AnalyticsController {
  // GET /v1/analytics/overview
  static async overview(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401));
      const userId = req.user.id;

      const [totalDocs, totalChats, totalEntities, docsByStatus, docsByClassification] = await Promise.all([
        prisma.document.count({ where: { userId } }),
        prisma.chatSession.count({ where: { userId } }),
        prisma.entity.count({ where: { document: { userId } } }),
        prisma.document.groupBy({ by: ['status'], where: { userId }, _count: true }),
        prisma.documentClassification.groupBy({
          by: ['label'],
          where: { document: { userId } },
          _count: true,
        }),
      ]);

      return res.status(200).json({
        success: true,
        data: {
          totalDocs,
          totalChats,
          totalEntities,
          docsByStatus: docsByStatus.map((d: any) => ({ status: d.status, count: d._count })),
          docsByClassification: docsByClassification.map((d: any) => ({
            label: d.label,
            count: d._count,
          })),
        },
      });
    } catch (error) {
      return next(error);
    }
  }

  // GET /v1/analytics/timeline  (docs created per day, last 30 days)
  static async timeline(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401));
      const userId = req.user.id;

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const docs = await prisma.document.findMany({
        where: { userId, createdAt: { gte: thirtyDaysAgo } },
        select: { createdAt: true, status: true },
        orderBy: { createdAt: 'asc' },
      });

      // Group by date
      const byDate: Record<string, number> = {};
      docs.forEach((doc) => {
        const date = doc.createdAt.toISOString().split('T')[0];
        byDate[date] = (byDate[date] || 0) + 1;
      });

      // Build 30-day array
      const timeline = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        timeline.push({ date: dateStr, count: byDate[dateStr] || 0 });
      }

      return res.status(200).json({ success: true, data: timeline });
    } catch (error) {
      return next(error);
    }
  }

  // GET /v1/analytics/entities  (entity category breakdown)
  static async entities(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401));
      const userId = req.user.id;

      const entityGroups = await prisma.entity.groupBy({
        by: ['category'],
        where: { document: { userId } },
        _count: true,
        orderBy: { _count: { category: 'desc' } },
      });

      return res.status(200).json({
        success: true,
        data: entityGroups.map((g: any) => ({ category: g.category, count: g._count })),
      });
    } catch (error) {
      return next(error);
    }
  }
}
