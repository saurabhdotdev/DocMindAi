import { prisma } from '../config/prisma';
import { ChatRole } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { DocumentService } from './document.service';

export class ChatService {
  // List all chat sessions for a user
  static async listChatSessions(userId: string) {
    return prisma.chatSession.findMany({
      where: { userId },
      include: {
        document: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }

  // Create a new chat session
  static async createChatSession(userId: string, documentId: string, title?: string) {
    // Verify document ownership
    const doc = await prisma.document.findFirst({
      where: { id: documentId, userId },
    });

    if (!doc) {
      throw new AppError('Document not found or access denied', 404);
    }

    const defaultTitle = title || `Chat with ${doc.name}`;

    return prisma.chatSession.create({
      data: {
        userId,
        documentId,
        title: defaultTitle,
      },
      include: {
        document: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });
  }

  // Fetch message history for a session
  static async getChatMessageHistory(userId: string, sessionId: string) {
    const session = await prisma.chatSession.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new AppError('Chat session not found or access denied', 404);
    }

    return prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Send a message inside a session and get assistant response
  static async postMessageToSession(userId: string, sessionId: string, question: string) {
    const session = await prisma.chatSession.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new AppError('Chat session not found or access denied', 404);
    }

    // 1. Save user's question
    const userMsg = await prisma.chatMessage.create({
      data: {
        sessionId,
        role: ChatRole.USER,
        content: question,
      },
    });

    // 2. Query AI Service through DocumentService
    const { answer, sources } = await DocumentService.chatWithDocument(userId, session.documentId, question);

    // 3. Save assistant's answer and citations
    const assistantMsg = await prisma.chatMessage.create({
      data: {
        sessionId,
        role: ChatRole.ASSISTANT,
        content: answer,
        citations: sources,
      },
    });

    // 4. Update session updatedAt timestamp
    await prisma.chatSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });

    return {
      userMsg,
      assistantMsg,
      answer,
      sources,
    };
  }
}
