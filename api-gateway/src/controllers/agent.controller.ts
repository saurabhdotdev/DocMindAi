import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';

export class AgentController {
  // List custom agent profiles
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return next(new AppError('User session not found', 401));
      }

      const agents = await prisma.agentProfile.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
      });

      return res.status(200).json({
        success: true,
        data: agents,
      });
    } catch (error) {
      return next(error);
    }
  }

  // Create custom agent profile
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return next(new AppError('User session not found', 401));
      }

      const { name, systemPrompt, avatar } = req.body;

      if (!name || !name.trim()) {
        return next(new AppError('Agent name is required', 400));
      }

      if (!systemPrompt || !systemPrompt.trim()) {
        return next(new AppError('System prompt instructions are required', 400));
      }

      const agent = await prisma.agentProfile.create({
        data: {
          userId: req.user.id,
          name: name.trim(),
          systemPrompt: systemPrompt.trim(),
          avatar: avatar || '🤖',
        },
      });

      return res.status(201).json({
        success: true,
        data: agent,
      });
    } catch (error) {
      return next(error);
    }
  }

  // Delete custom agent profile
  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return next(new AppError('User session not found', 401));
      }

      const { id } = req.params;

      const agent = await prisma.agentProfile.findFirst({
        where: { id, userId: req.user.id },
      });

      if (!agent) {
        return next(new AppError('Agent profile not found or access denied', 404));
      }

      await prisma.agentProfile.delete({
        where: { id },
      });

      return res.status(200).json({
        success: true,
        message: 'Agent profile deleted successfully',
      });
    } catch (error) {
      return next(error);
    }
  }

  // AI Optimize System Prompt
  static async optimizePrompt(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return next(new AppError('User session not found', 401));
      }

      const { description } = req.body;

      if (!description || !description.trim()) {
        return next(new AppError('Description is required for optimization', 400));
      }

      const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

      const response = await fetch(`${AI_SERVICE_URL}/v1/agents/optimize-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim() }),
      });

      if (!response.ok) {
        throw new Error(`AI Service /optimize-prompt returned status ${response.status}`);
      }

      const body: any = await response.json();
      if (!body.success) {
        throw new Error(body.message || 'AI Service optimize prompt returned failure');
      }

      return res.status(200).json({
        success: true,
        optimizedPrompt: body.optimizedPrompt,
      });
    } catch (error) {
      return next(error);
    }
  }
}
