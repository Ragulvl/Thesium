// Why: Auth now resolves full DB user (with role), fixing Google sub vs Prisma id mismatch
// and enabling role-based access control.
// Fix: Use GOOGLE_CLIENT_ID (server-side) with fallback to VITE_GOOGLE_CLIENT_ID.
//      Removed 'dummy_client_id' fallback — a missing CLIENT_ID now fails fast.
import { Request, Response, NextFunction } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../config/prisma.js';
import { Role } from '@prisma/client';

// Prefer the server-side GOOGLE_CLIENT_ID env var; fall back to the VITE_ variant
// for projects that share a single variable. If neither is set, fail loudly.
const CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  process.env.VITE_GOOGLE_CLIENT_ID;

if (!CLIENT_ID) {
  process.stderr.write(
    '❌ FATAL: Neither GOOGLE_CLIENT_ID nor VITE_GOOGLE_CLIENT_ID is set. ' +
    'Google token verification will reject all requests.\n'
  );
  // Do not exit — allow server to start so health checks still respond,
  // but every auth request will return 403.
}

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
  if (!CLIENT_ID) {
    return res.status(503).json({ error: 'Authentication service misconfigured' });
  }

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
    // Don't log the raw error object — it may contain token data
    return res.status(403).json({ error: 'Forbidden: Token verification failed' });
  }
};
