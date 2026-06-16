// Auth Controller — httpOnly cookie session management
//
// Flow:
//   1. Frontend receives Google credential from One Tap
//   2. POST /api/auth/session  — backend verifies, sets httpOnly cookie
//   3. All subsequent API requests carry the cookie automatically
//   4. GET  /api/auth/me       — frontend reads user info from backend (since JS can't read httpOnly cookies)
//   5. POST /api/auth/logout   — clears the cookie server-side
//
// The requireAuth middleware accepts EITHER the cookie OR a Bearer header
// so existing API clients (mobile, Postman, etc.) continue working unchanged.

import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../config/prisma.js';
import { logger } from '../config/logger.js';

const CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  process.env.VITE_GOOGLE_CLIENT_ID;

const client = new OAuth2Client(CLIENT_ID);

const IS_PROD = process.env.NODE_ENV === 'production';

/** Cookie name used for the session token */
export const SESSION_COOKIE = '__thesium_session';

/** Cookie options — HttpOnly, Secure in production, SameSite Lax */
export function sessionCookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax' as const,
    maxAge: maxAgeMs,   // in milliseconds (express sets Max-Age as seconds internally)
    path: '/',
  };
}

/**
 * POST /api/auth/session
 * Receives a Google credential (ID token), verifies it, upserts the user,
 * and sets an httpOnly cookie containing the verified token.
 */
export const createSession = async (req: Request, res: Response) => {
  const { credential } = req.body ?? {};

  if (!credential || typeof credential !== 'string') {
    return res.status(400).json({ error: 'credential is required' });
  }
  if (!CLIENT_ID) {
    return res.status(503).json({ error: 'Auth service misconfigured' });
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: CLIENT_ID,
    });
    const payload = ticket.getPayload();

    if (!payload || !payload.sub || !payload.email) {
      return res.status(401).json({ error: 'Invalid Google token' });
    }

    // Token expiry — align cookie maxAge to the remaining token lifetime
    const expMs = payload.exp ? payload.exp * 1000 - Date.now() : 3600_000;
    const maxAgeMs = Math.max(expMs, 60_000); // at least 1 minute

    // Upsert user in DB
    let user = await prisma.user.findUnique({ where: { googleSub: payload.sub } });

    if (!user) {
      user = await prisma.user.findUnique({ where: { email: payload.email } });
      if (user && !user.googleSub) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { googleSub: payload.sub, name: payload.name || user.name, picture: payload.picture || user.picture },
        });
      } else if (!user) {
        user = await prisma.user.create({
          data: { googleSub: payload.sub, email: payload.email, name: payload.name || 'User', picture: payload.picture },
        });
      }
    }

    // Set httpOnly cookie
    res.cookie(SESSION_COOKIE, credential, sessionCookieOptions(maxAgeMs));

    // Return user info (client-safe, no token)
    return res.json({
      id: user!.id,
      email: user!.email,
      name: user!.name,
      picture: user!.picture,
      role: user!.role,
      tier: (user as any).tier,
    });
  } catch (err) {
    logger.warn({ err }, 'createSession: token verification failed');
    return res.status(403).json({ error: 'Token verification failed' });
  }
};

/**
 * GET /api/auth/me
 * Returns the authenticated user's profile from the DB.
 * Used by the frontend on page load to restore session state without
 * reading the token from JavaScript (since it's in an httpOnly cookie).
 */
export const getMe = async (req: Request, res: Response) => {
  // requireAuth already ran and attached req.user
  const authReq = req as any;
  if (!authReq.user) return res.status(401).json({ error: 'Not authenticated' });

  const user = await prisma.user.findUnique({
    where: { id: authReq.user.id },
    select: { id: true, email: true, name: true, picture: true, role: true, tier: true, thesisQuota: true },
  });

  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json(user);
};

/**
 * POST /api/auth/logout
 * Clears the session cookie.
 */
export const destroySession = (_req: Request, res: Response) => {
  res.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, secure: IS_PROD, sameSite: 'lax' });
  return res.json({ ok: true });
};
