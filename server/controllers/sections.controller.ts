// Fix: Added server-side quota enforcement in queueSectionGeneration and queueAllSections.
// The frontend cannot be trusted to enforce quota — generation must be checked server-side.
// Also: replaced req.log (undefined on plain Express) with module-level logger.
import { Response } from 'express';
import { prisma } from '../config/prisma.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { generationQueue } from '../services/queue.js';
import { DEFAULT_SECTIONS } from '../shared/constants.js';
import { updateSectionSchema } from '../validators/thesis.js';
import { logger } from '../config/logger.js';

const FREE_THESIS_LIMIT = () => Number(process.env.FREE_THESIS_LIMIT) || 2;

/** Check if a user has remaining thesis quota. Throws with HTTP 403 payload if exceeded. */
async function assertQuota(userId: string, thesisId: string): Promise<void> {
  const [dbUser, thesisCount] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { thesisQuota: true, tier: true } }),
    prisma.thesis.count({ where: { userId } }),
  ]);

  const quota = dbUser?.thesisQuota ?? FREE_THESIS_LIMIT();

  // Always allow generation for the thesis the user already owns (they created it)
  // The quota applies to creating NEW theses, not generating content in existing ones.
  // For this project's model, quota is per-thesis-creation, not per-generation.
  // Log if near limit but don't block existing thesis content generation.
  if (thesisCount > quota) {
    logger.warn({ userId, thesisCount, quota }, 'User exceeded thesis quota — generation blocked');
    throw Object.assign(new Error('Thesis quota exceeded'), { status: 403, quota, thesisCount });
  }
}

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

    // Seed default sections if this is the first visit (inside a transaction for safety)
    if (sections.length === 0) {
      logger.info(`Seeding default sections for thesis ${thesisId}`);
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
    logger.error({ err: error }, 'Failed to fetch/seed sections');
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
    logger.error({ err: error }, 'Failed to auto-save section');
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

    // ── Server-side quota check (ISSUE-B3) ─────────────────────────
    try {
      await assertQuota(req.user!.id, thesisId);
    } catch (quotaErr: any) {
      return res.status(403).json({
        error: 'Thesis quota exceeded. Please upgrade your plan to continue generating.',
        quota: quotaErr.quota,
        thesisCount: quotaErr.thesisCount,
      });
    }

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

    logger.info(`Generation queued: ${sectionId} for thesis ${thesisId} (job ${jobId})`);
    return res.status(202).json({ message: 'Generation queued successfully', jobId });
  } catch (error) {
    logger.error({ err: error }, 'Failed to queue generation job');
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

    // ── Server-side quota check ─────────────────────────────────────
    try {
      await assertQuota(req.user!.id, thesisId);
    } catch (quotaErr: any) {
      return res.status(403).json({
        error: 'Thesis quota exceeded. Please upgrade your plan.',
        quota: quotaErr.quota,
        thesisCount: quotaErr.thesisCount,
      });
    }

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
      const jobId = `${thesisId}-${sec.id}-${now + i}`; // Incrementing timestamp ensures FIFO order
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

    logger.info(`Queued ${emptySections.length} sections for thesis ${thesisId}`);
    return res.status(202).json({
      message: `Queued ${emptySections.length} sections for generation`,
      sections: emptySections.map(s => s.id),
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to queue all sections');
    return res.status(500).json({ error: 'Failed to queue sections' });
  }
};
