// Why: Auth now resolves full DB user (with role), fixing Google sub vs Prisma id mismatch and enabling role-based access control.
import { Request, Response, NextFunction } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../config/prisma.js';
import { Role } from '@prisma/client';

const CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID || 'dummy_client_id';
const client = new OAuth2Client(CLIENT_ID);

export interface AuthenticatedUser {
  id: string;        // Prisma UUID
  googleSub: string; // Google subject ID
  email: string;
  name?: string | null;
  picture?: string | null;
  role: Role;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export const requireAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload || !payload.sub || !payload.email) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token payload' });
    }

    const googleSub = payload.sub;

    // Resolve or create user in the database
    let user = await prisma.user.findUnique({ where: { googleSub } });

    if (!user) {
      // Check if user exists by email (legacy migration path)
      user = await prisma.user.findUnique({ where: { email: payload.email } });

      if (user && !user.googleSub) {
        // Link existing email-based user to their Google account
        user = await prisma.user.update({
          where: { id: user.id },
          data: { googleSub, name: payload.name || user.name, picture: payload.picture || user.picture },
        });
      } else if (!user) {
        // Create brand new user
        user = await prisma.user.create({
          data: {
            googleSub,
            email: payload.email,
            name: payload.name || 'User',
            picture: payload.picture,
          },
        });
      }
    }

    // Attach full user from DB to request
    req.user = {
      id: user!.id,
      googleSub: user!.googleSub!,
      email: user!.email!,
      name: user!.name,
      picture: user!.picture,
      role: user!.role,
    };

    next();
  } catch (error) {
    req.log?.error({ err: error }, 'Token verification failed');
    return res.status(403).json({ error: 'Forbidden: Token verification failed' });
  }
};
