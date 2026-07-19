import { Request, Response, NextFunction } from 'express';
import { ChatService } from '../services/chat.service';
import { AppError } from '../middleware/errorHandler';

export class ChatController {
  // List all chat sessions
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return next(new AppError('User session not found', 401));
      }

      const sessions = await ChatService.listChatSessions(req.user.id);

      return res.status(200).json({
        success: true,
        data: sessions,
      });
    } catch (error) {
      return next(error);
    }
  }

  // Create a new session
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return next(new AppError('User session not found', 401));
      }

      const { documentId, title } = req.body;

      if (!documentId) {
        return next(new AppError('documentId is required', 400));
      }

      const session = await ChatService.createChatSession(req.user.id, documentId, title);

      return res.status(201).json({
        success: true,
        data: session,
      });
    } catch (error) {
      return next(error);
    }
  }

  // Get message history for a session
  static async getHistory(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return next(new AppError('User session not found', 401));
      }

      const { id } = req.params;
      const messages = await ChatService.getChatMessageHistory(req.user.id, id);

      return res.status(200).json({
        success: true,
        data: messages,
      });
    } catch (error) {
      return next(error);
    }
  }

  // Send message inside a session
  static async sendMessage(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return next(new AppError('User session not found', 401));
      }

      const { id } = req.params;
      const { question } = req.body;

      if (!question || !question.trim()) {
        return next(new AppError('Question is required', 400));
      }

      const result = await ChatService.postMessageToSession(req.user.id, id, question.trim());

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      return next(error);
    }
  }
}
