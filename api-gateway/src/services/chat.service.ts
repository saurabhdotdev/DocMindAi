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
  static async postMessageToSession(userId: string, sessionId: string, question: string, agentProfileId?: string) {
    const session = await prisma.chatSession.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new AppError('Chat session not found or access denied', 404);
    }

    // Fetch recent messages for history (up to last 10)
    const pastMessages = await prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // Reverse history to keep chronological order
    const history = pastMessages.reverse().map((m: any) => ({
      role: m.role.toLowerCase(),
      content: m.content
    }));

    // 1. Save user's question
    const userMsg = await prisma.chatMessage.create({
      data: {
        sessionId,
        role: ChatRole.USER,
        content: question,
      },
    });

    // Automatically generate chat title if it's the first message of this session
    if (pastMessages.length === 0) {
      try {
        const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
        fetch(`${AI_SERVICE_URL}/v1/chat/generate-title`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question }),
        })
          .then((titleRes) => {
            if (titleRes.ok) {
              return titleRes.json();
            }
            throw new Error('Title generation failed');
          })
          .then((titleData) => {
            if (titleData.success && titleData.title) {
              prisma.chatSession.update({
                where: { id: sessionId },
                data: { title: titleData.title }
              }).catch((e) => console.error('Failed to update generated title:', e));
            }
          })
          .catch((err) => console.error('Dynamic title generation request failed:', err));
      } catch (err) {
        console.error('Failed to trigger generated chat title:', err);
      }
    }

    // Lookup custom agent profile if provided
    let systemPrompt: string | undefined = undefined;
    if (agentProfileId) {
      const profile = await prisma.agentProfile.findFirst({
        where: { id: agentProfileId, userId },
      });
      if (profile) {
        systemPrompt = profile.systemPrompt;
      }
    }

    // 2. Query AI Service through DocumentService (with history)
    const { answer, sources } = await DocumentService.chatWithDocument(userId, session.documentId, question, systemPrompt, history);

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

  // Delete a chat session
  static async deleteChatSession(userId: string, sessionId: string) {
    const session = await prisma.chatSession.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new AppError('Chat session not found or access denied', 404);
    }

    return prisma.chatSession.delete({
      where: { id: sessionId },
    });
  }

  // Rename a chat session
  static async renameChatSession(userId: string, sessionId: string, newTitle: string) {
    const session = await prisma.chatSession.findFirst({
      where: { id: sessionId, userId }
    });

    if (!session) {
      throw new AppError('Chat session not found or access denied', 404);
    }

    return prisma.chatSession.update({
      where: { id: sessionId },
      data: { title: newTitle }
    });
  }
}
