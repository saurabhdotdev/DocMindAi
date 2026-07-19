import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';

export class WorkflowController {
  // List workflows
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return next(new AppError('User session not found', 401));
      }

      const workflows = await prisma.workflow.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
      });

      return res.status(200).json({
        success: true,
        data: workflows,
      });
    } catch (error) {
      return next(error);
    }
  }

  // Create workflow
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return next(new AppError('User session not found', 401));
      }

      const { name, trigger, conditions, actions } = req.body;

      if (!name || !name.trim()) {
        return next(new AppError('Workflow name is required', 400));
      }

      if (!conditions || !actions) {
        return next(new AppError('Conditions and Actions are required', 400));
      }

      const workflow = await prisma.workflow.create({
        data: {
          userId: req.user.id,
          name: name.trim(),
          trigger: trigger || 'DOCUMENT_PROCESSED',
          conditions: conditions as any,
          actions: actions as any,
          isActive: true,
        },
      });

      return res.status(201).json({
        success: true,
        data: workflow,
      });
    } catch (error) {
      return next(error);
    }
  }

  // Toggle active status
  static async toggle(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return next(new AppError('User session not found', 401));
      }

      const { id } = req.params;

      const workflow = await prisma.workflow.findFirst({
        where: { id, userId: req.user.id },
      });

      if (!workflow) {
        return next(new AppError('Workflow not found or access denied', 404));
      }

      const updated = await prisma.workflow.update({
        where: { id },
        data: { isActive: !workflow.isActive },
      });

      return res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (error) {
      return next(error);
    }
  }

  // Delete workflow
  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return next(new AppError('User session not found', 401));
      }

      const { id } = req.params;

      const workflow = await prisma.workflow.findFirst({
        where: { id, userId: req.user.id },
      });

      if (!workflow) {
        return next(new AppError('Workflow not found or access denied', 404));
      }

      await prisma.workflow.delete({
        where: { id },
      });

      return res.status(200).json({
        success: true,
        message: 'Workflow deleted successfully',
      });
    } catch (error) {
      return next(error);
    }
  }
}
