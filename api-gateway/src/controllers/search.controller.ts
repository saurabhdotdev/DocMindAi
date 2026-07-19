import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://ai-service:8000';

export class SearchController {
  // GET /v1/search?q=query
  static async semanticSearch(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401));
      const { q } = req.query;
      if (!q || typeof q !== 'string' || !q.trim()) {
        return next(new AppError('Query parameter q is required', 400));
      }

      // Get all user document IDs
      const userDocs = await prisma.document.findMany({
        where: { userId: req.user.id, status: 'COMPLETED' },
        select: { id: true, name: true, classification: true },
      });

      if (userDocs.length === 0) {
        return res.status(200).json({ success: true, data: [] });
      }

      const docIds = userDocs.map((d) => d.id);

      // Call AI service semantic search endpoint
      const aiRes = await fetch(`${AI_SERVICE_URL}/v1/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q.trim(), doc_ids: docIds, limit: 10 }),
      });

      if (!aiRes.ok) {
        // Fallback: do simple text search across OCR text
        const textResults = await prisma.oCRResult.findMany({
          where: {
            document: { userId: req.user.id },
            text: { contains: q.trim(), mode: 'insensitive' },
          },
          select: {
            documentId: true,
            document: { select: { id: true, name: true } },
            text: true,
          },
          take: 10,
        });

        return res.status(200).json({
          success: true,
          data: textResults.map((r) => ({
            documentId: r.documentId,
            documentName: r.document.name,
            snippet: extractSnippet(r.text, q.trim()),
            score: 1.0,
          })),
        });
      }

      const aiData = await aiRes.json() as any;
      const hits = aiData.results || [];

      // Enrich with document metadata
      const enriched = hits.map((hit: any) => {
        const doc = userDocs.find((d) => d.id === hit.doc_id);
        return {
          documentId: hit.doc_id,
          documentName: doc?.name || 'Unknown',
          snippet: hit.text || '',
          score: hit.score || 0,
        };
      });

      return res.status(200).json({ success: true, data: enriched });
    } catch (error) {
      return next(error);
    }
  }
}

function extractSnippet(text: string, query: string, contextLength = 150): string {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx === -1) return text.substring(0, contextLength) + '...';
  const start = Math.max(0, idx - 60);
  const end = Math.min(text.length, idx + query.length + 90);
  return (start > 0 ? '...' : '') + text.substring(start, end) + (end < text.length ? '...' : '');
}
