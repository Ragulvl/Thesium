// Why: Simplified — auth middleware now handles user creation/lookup, this just returns the user.
import { Response } from 'express';
import { prisma } from '../config/prisma.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

export const syncUser = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Auth middleware already resolved the full user from DB.
    // Just fetch the latest version and return it.
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });

    if (!user) {
      return res.status(404).json({ error: 'User not found in database' });
    }

    // Update name/picture if they've changed on the Google side
    const needsUpdate = user.name !== req.user!.name || user.picture !== req.user!.picture;
    if (needsUpdate) {
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: {
          name: req.user!.name || user.name,
          picture: req.user!.picture || user.picture,
        },
      });
      req.log?.info({ userId: updated.id }, 'User synced — profile updated');
      return res.status(200).json(updated);
    }

    req.log?.info({ userId: user.id }, 'User synced — no changes');
    return res.status(200).json(user);
  } catch (error) {
    req.log?.error({ err: error }, 'Failed to sync user');
    return res.status(500).json({ error: 'Failed to sync user to database' });
  }
};
