// Tests for auth.controller.ts — createSession, getMe, destroySession
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks declared BEFORE any imports that trigger module init ──────

// OAuth2Client must be mocked before auth.controller.ts imports it,
// because `new OAuth2Client()` runs at module top-level.
// vi.hoisted() ensures the mock fn exists before vi.mock() factory is evaluated.
const mockVerifyIdToken = vi.hoisted(() => vi.fn());
vi.mock('google-auth-library', () => ({
  OAuth2Client: class MockOAuth2Client {
    verifyIdToken = mockVerifyIdToken;
  },
}));


vi.mock('../config/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('../config/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── Actual imports (after mocks are in place) ──────────────────────
import { createSession, getMe, destroySession, SESSION_COOKIE, sessionCookieOptions } from '../controllers/auth.controller.js';
import { prisma } from '../config/prisma.js';

// ── Helpers ──────────────────────────────────────────────────────

const mockReq = (body: any = {}, userOverride?: any) => ({
  body,
  cookies: {},
  user: userOverride,
  headers: {},
} as any);

const mockRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.cookie = vi.fn().mockReturnValue(res);
  res.clearCookie = vi.fn().mockReturnValue(res);
  return res;
};

const FAKE_USER = {
  id: 'user-123',
  email: 'test@example.com',
  name: 'Test User',
  picture: 'https://example.com/pic.jpg',
  role: 'USER',
  tier: 'free',
  googleSub: 'google-sub-abc',
};

const FAKE_PAYLOAD = {
  sub: 'google-sub-abc',
  email: 'test@example.com',
  name: 'Test User',
  picture: 'https://example.com/pic.jpg',
  exp: Math.floor(Date.now() / 1000) + 3600,
};

// ── createSession ─────────────────────────────────────────────────

describe('createSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VITE_GOOGLE_CLIENT_ID = 'test-client-id';
  });

  it('returns 400 when credential is missing', async () => {
    const req = mockReq({});
    const res = mockRes();
    await createSession(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('credential') })
    );
  });

  it('returns 400 when credential is not a string', async () => {
    const req = mockReq({ credential: 12345 });
    const res = mockRes();
    await createSession(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 403 when Google token verification throws', async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error('Token invalid'));
    const req = mockReq({ credential: 'bad-token' });
    const res = mockRes();
    await createSession(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Token verification failed' })
    );
  });

  it('returns 401 when payload is missing sub or email', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({ sub: null, email: null }),
    });
    const req = mockReq({ credential: 'token-no-payload' });
    const res = mockRes();
    await createSession(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('sets httpOnly cookie and returns user profile on success (existing user)', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      getPayload: () => FAKE_PAYLOAD,
    });
    (prisma.user.findUnique as any).mockResolvedValueOnce(FAKE_USER);

    const req = mockReq({ credential: 'valid-google-token' });
    const res = mockRes();
    await createSession(req, res);

    expect(res.cookie).toHaveBeenCalledWith(
      SESSION_COOKIE,
      'valid-google-token',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax' })
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ email: FAKE_USER.email, name: FAKE_USER.name })
    );
    // Should NOT expose token or googleSub in response
    const responseBody = (res.json as any).mock.calls[0][0];
    expect(responseBody).not.toHaveProperty('googleSub');
  });

  it('creates a new user when not found by googleSub or email', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ getPayload: () => FAKE_PAYLOAD });
    (prisma.user.findUnique as any)
      .mockResolvedValueOnce(null)  // not found by googleSub
      .mockResolvedValueOnce(null); // not found by email
    (prisma.user.create as any).mockResolvedValueOnce(FAKE_USER);

    const req = mockReq({ credential: 'new-user-token' });
    const res = mockRes();
    await createSession(req, res);

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: FAKE_PAYLOAD.email,
          googleSub: FAKE_PAYLOAD.sub,
        }),
      })
    );
    expect(res.cookie).toHaveBeenCalledWith(SESSION_COOKIE, 'new-user-token', expect.any(Object));
  });

  it('links googleSub to existing email-only user', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ getPayload: () => FAKE_PAYLOAD });
    const emailOnlyUser = { ...FAKE_USER, googleSub: null };
    (prisma.user.findUnique as any)
      .mockResolvedValueOnce(null)          // not found by googleSub
      .mockResolvedValueOnce(emailOnlyUser); // found by email (legacy user)
    (prisma.user.update as any).mockResolvedValueOnce(FAKE_USER);

    const req = mockReq({ credential: 'legacy-user-token' });
    const res = mockRes();
    await createSession(req, res);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ googleSub: FAKE_PAYLOAD.sub }),
      })
    );
  });
});

// ── getMe ──────────────────────────────────────────────────────────

describe('getMe', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when user is not attached to request', async () => {
    const req = mockReq({}, undefined);
    const res = mockRes();
    await getMe(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Not authenticated' }));
  });

  it('returns user profile from DB when authenticated', async () => {
    const dbUser = { ...FAKE_USER, thesisQuota: 2 };
    (prisma.user.findUnique as any).mockResolvedValueOnce(dbUser);

    const req = mockReq({}, { id: FAKE_USER.id });
    const res = mockRes();
    await getMe(req, res);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: FAKE_USER.id },
      select: expect.objectContaining({ email: true, name: true }),
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ email: FAKE_USER.email }));
  });

  it('returns 404 when user not found in DB', async () => {
    (prisma.user.findUnique as any).mockResolvedValueOnce(null);
    const req = mockReq({}, { id: 'nonexistent-id' });
    const res = mockRes();
    await getMe(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'User not found' }));
  });
});

// ── destroySession ─────────────────────────────────────────────────

describe('destroySession', () => {
  it('clears the session cookie and returns { ok: true }', () => {
    const req = mockReq();
    const res = mockRes();
    destroySession(req, res);

    expect(res.clearCookie).toHaveBeenCalledWith(
      SESSION_COOKIE,
      expect.objectContaining({ httpOnly: true, path: '/' })
    );
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });
});

// ── SESSION_COOKIE ─────────────────────────────────────────────────

describe('SESSION_COOKIE', () => {
  it('exports a non-empty string constant', () => {
    expect(typeof SESSION_COOKIE).toBe('string');
    expect(SESSION_COOKIE.length).toBeGreaterThan(0);
  });
});

// ── sessionCookieOptions ───────────────────────────────────────────

describe('sessionCookieOptions', () => {
  it('always sets httpOnly:true and sameSite:lax', () => {
    const opts = sessionCookieOptions(3_600_000);
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe('lax');
    expect(opts.path).toBe('/');
  });

  it('sets maxAge to the provided value', () => {
    const maxAgeMs = 1_800_000;
    const opts = sessionCookieOptions(maxAgeMs);
    expect(opts.maxAge).toBe(maxAgeMs);
  });

  it('sets secure:false in test/dev environment', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const opts = sessionCookieOptions(3_600_000);
    expect(opts.secure).toBe(false);
    process.env.NODE_ENV = originalEnv;
  });

  it('returns an object with all required cookie fields', () => {
    const opts = sessionCookieOptions(60_000);
    expect(opts).toHaveProperty('httpOnly');
    expect(opts).toHaveProperty('secure');
    expect(opts).toHaveProperty('sameSite');
    expect(opts).toHaveProperty('maxAge');
    expect(opts).toHaveProperty('path');
  });
});
