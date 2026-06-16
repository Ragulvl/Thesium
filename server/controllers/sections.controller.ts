// Why: Added Zod validation, removed duplicate DEFAULT_SECTIONS, uses shared constants.
import { Response } from 'express';
import { prisma } from '../config/prisma.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { generationQueue } from '../services/queue.js';
import { DEFAULT_SECTIONS } from '../shared/constants.js';
import { updateSectionSchema } from '../validators/thesis.js';

export const getSections = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const thesisId = Array.isArray(req.params.thesisId) ? req.params.thesisId[0] : req.params.thesisId;

    // Auth: ensure user owns the thesis
    const thesis = await prisma.thesis.findUnique({ where: { id: thesisId } });
    if (!thesis) return res.status(404).json({ error: 'Thesis not found' });
    if (thesis.userId !== req.user!.id) return res.status(403).json({ error: 'Forbidden' });

    let sections = await prisma.section.findMany({
      where: { thesisId },
      orderBy: { order: 'asc' }
    });

    if (sections.length === 0) {
      req.log?.info({ thesisId }, 'Seeding default sections for thesis');
      await prisma.$transaction(
        DEFAULT_SECTIONS.map((sec, idx) =>
          prisma.section.create({
            data: {
              thesisId,
              id: sec.id,
              label: sec.label,
              order: idx,
              content: '',
              wordCount: 0
            }
          })
        )
      );
      sections = await prisma.section.findMany({
        where: { thesisId },
        orderBy: { order: 'asc' }
      });
    }

    return res.json(sections);
  } catch (error) {
    req.log?.error({ err: error }, 'Failed to fetch/seed sections');
    return res.status(500).json({ error: 'Failed to load sections' });
  }
};

export const updateSectionContent = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const thesisId = req.params.thesisId as string;
    const sectionId = req.params.sectionId as string;
    const body = updateSectionSchema.parse(req.body);

    const thesis = await prisma.thesis.findUnique({ where: { id: thesisId } });
    if (!thesis || thesis.userId !== req.user!.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const updated = await prisma.section.update({
      where: { thesisId_id: { thesisId, id: sectionId } },
      data: { content: body.content, wordCount: body.wordCount }
    });

    return res.json(updated);
  } catch (error: any) {
    if (error.name === 'ZodError') throw error;
    req.log?.error({ err: error }, 'Failed to auto-save section');
    return res.status(500).json({ error: 'Failed to save section' });
  }
};

export const queueSectionGeneration = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const thesisId = req.params.thesisId as string;
    const sectionId = req.params.sectionId as string;

    const thesis = await prisma.thesis.findUnique({ where: { id: thesisId } });
    if (!thesis) return res.status(404).json({ error: 'Thesis not found' });
    if (thesis.userId !== req.user!.id) return res.status(403).json({ error: 'Forbidden' });

    const jobId = `${thesisId}-${sectionId}-${Date.now()}`;
    await generationQueue.add('generate-section', {
      thesisId,
      sectionId,
      userId: req.user!.id,
    }, {
      jobId,
      attempts: 2,
      removeOnComplete: true,
      removeOnFail: false
    });

    req.log?.info({ thesisId, sectionId, jobId }, 'Pushed generation job to queue');
    return res.status(202).json({ message: 'Generation queued successfully', jobId });
  } catch (error) {
    req.log?.error({ err: error }, 'Failed to queue generation job');
    return res.status(500).json({ error: 'Failed to queue job' });
  }
};

// Generate ALL sections in correct order (title → abstract → toc → ... → appendices)
export const queueAllSections = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const thesisId = req.params.thesisId as string;

    const thesis = await prisma.thesis.findUnique({ where: { id: thesisId } });
    if (!thesis) return res.status(404).json({ error: 'Thesis not found' });
    if (thesis.userId !== req.user!.id) return res.status(403).json({ error: 'Forbidden' });

    // Fetch sections in correct order
    let sections = await prisma.section.findMany({
      where: { thesisId },
      orderBy: { order: 'asc' }
    });

    // Seed sections if none exist
    if (sections.length === 0) {
      await prisma.$transaction(
        DEFAULT_SECTIONS.map((sec, idx) =>
          prisma.section.create({
            data: { thesisId, id: sec.id, label: sec.label, order: idx, content: '', wordCount: 0 }
          })
        )
      );
      sections = await prisma.section.findMany({ where: { thesisId }, orderBy: { order: 'asc' } });
    }

    // Queue only empty sections, in order
    const emptySections = sections.filter(s => (s.wordCount ?? 0) === 0);
    const now = Date.now();

    for (let i = 0; i < emptySections.length; i++) {
      const sec = emptySections[i];
      const jobId = `${thesisId}-${sec.id}-${now + i}`; // Incrementing ensures FIFO order
      await generationQueue.add('generate-section', {
        thesisId,
        sectionId: sec.id,
        userId: req.user!.id,
      }, {
        jobId,
        attempts: 2,
        removeOnComplete: true,
        removeOnFail: false,
      });
    }

    req.log?.info({ thesisId, count: emptySections.length }, 'Queued all sections in order');
    return res.status(202).json({
      message: `Queued ${emptySections.length} sections for generation`,
      sections: emptySections.map(s => s.id),
    });
  } catch (error) {
    req.log?.error({ err: error }, 'Failed to queue all sections');
    return res.status(500).json({ error: 'Failed to queue sections' });
  }
};
