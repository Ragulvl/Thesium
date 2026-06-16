// Why: Added Zod validation, removed duplicate DEFAULT_SECTIONS, use shared constants.
import { Response } from 'express';
import { prisma } from '../config/prisma.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { DEFAULT_SECTIONS } from '../shared/constants.js';
import { createThesisSchema } from '../validators/thesis.js';

export const getUserTheses = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    // Always use the authenticated user's ID — ignore URL param for security
    const theses = await prisma.thesis.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' }
    });

    req.log?.info({ userId, count: theses.length }, 'Fetched theses for user');
    return res.json(theses);
  } catch (error) {
    req.log?.error({ err: error }, 'Failed to fetch theses');
    return res.status(500).json({ error: 'Failed to fetch theses' });
  }
};

export const createThesis = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = createThesisSchema.parse(req.body);
    const userId = req.user!.id;

    const defaultOutline = DEFAULT_SECTIONS.map((s, idx) => `${idx + 1}. ${s.label}`).join('\n');

    const newThesis = await prisma.thesis.create({
      data: {
        userId,
        title: body.title,
        field: body.field,
        targetPages: body.targetPages,
        researchQuestion: body.researchQuestion,
        status: body.status,
        progress: body.progress,
        outline: defaultOutline,
      }
    });

    req.log?.info({ thesisId: newThesis.id, userId }, 'Created new thesis');
    return res.status(201).json(newThesis);
  } catch (error: any) {
    if (error.name === 'ZodError') throw error; // Let global handler format it
    req.log?.error({ err: error }, 'Failed to create thesis');
    return res.status(500).json({ error: 'Failed to create thesis' });
  }
};

export const deleteThesis = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const userId = req.user!.id;

    const thesis = await prisma.thesis.findUnique({ where: { id } });

    if (!thesis) {
      return res.status(404).json({ error: 'Thesis not found' });
    }

    if (thesis.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden: Cannot delete another user\'s thesis' });
    }

    await prisma.thesis.delete({ where: { id } });

    req.log?.info({ thesisId: id, userId }, 'Deleted thesis');
    return res.status(200).json({ success: true });
  } catch (error) {
    req.log?.error({ err: error }, 'Failed to delete thesis');
    return res.status(500).json({ error: 'Failed to delete thesis' });
  }
};
