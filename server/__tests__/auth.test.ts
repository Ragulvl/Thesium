// Why: Test auth middleware — validates 401/403/200 paths for token verification and DB user binding.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response, NextFunction } from 'express';

// Use vi.hoisted so mock fns are available in the hoisted vi.mock factories
const { mockVerifyIdToken, mockFindUnique, mockCreate, mockUpdate } = vi.hoisted(() => ({
  mockVerifyIdToken: vi.fn(),
  mockFindUnique: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
}));

// Mock google-auth-library
vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    verifyIdToken = mockVerifyIdToken;
  },
}));

// Mock Prisma
vi.mock('../config/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: mockFindUnique,
      create: mockCreate,
      update: mockUpdate,
    },
  },
}));

// Now import the module under test
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';

function createMockReqResNext() {
  const req = {
    headers: {} as Record<string, string>,
    log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  } as unknown as AuthenticatedRequest;

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;

  const next = vi.fn() as unknown as NextFunction;

  return { req, res, next };
}

describe('requireAuth middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when no Authorization header is present', async () => {
    const { req, res, next } = createMockReqResNext();
    req.headers = {};

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Missing token') })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header has no Bearer prefix', async () => {
    const { req, res, next } = createMockReqResNext();
    req.headers = { authorization: 'Basic some-token' };

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when token verification fails', async () => {
    const { req, res, next } = createMockReqResNext();
    req.headers = { authorization: 'Bearer invalid-token' };
    mockVerifyIdToken.mockRejectedValueOnce(new Error('Invalid token'));

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Token verification failed') })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when payload has no sub or email', async () => {
    const { req, res, next } = createMockReqResNext();
    req.headers = { authorization: 'Bearer valid-token' };
    mockVerifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({ sub: null, email: null }),
    });

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('creates a new user and calls next() when valid token and user not in DB', async () => {
    const { req, res, next } = createMockReqResNext();
    req.headers = { authorization: 'Bearer valid-token' };

    mockVerifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({
        sub: 'google-123',
        email: 'test@example.com',
        name: 'Test User',
        picture: 'https://pic.jpg',
      }),
    });

    // Not found by googleSub, not found by email
    mockFindUnique.mockResolvedValueOnce(null);
    mockFindUnique.mockResolvedValueOnce(null);

    const createdUser = {
      id: 'uuid-abc-123',
      googleSub: 'google-123',
      email: 'test@example.com',
      name: 'Test User',
      picture: 'https://pic.jpg',
      role: 'USER',
    };
    mockCreate.mockResolvedValueOnce(createdUser);

    await requireAuth(req, res, next);

    expect(mockCreate).toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual(
      expect.objectContaining({
        id: 'uuid-abc-123',
        googleSub: 'google-123',
        email: 'test@example.com',
        role: 'USER',
      })
    );
  });

  it('binds existing user to request when found by googleSub', async () => {
    const { req, res, next } = createMockReqResNext();
    req.headers = { authorization: 'Bearer valid-token' };

    mockVerifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({
        sub: 'google-456',
        email: 'existing@example.com',
        name: 'Existing User',
        picture: null,
      }),
    });

    const existingUser = {
      id: 'uuid-existing',
      googleSub: 'google-456',
      email: 'existing@example.com',
      name: 'Existing User',
      picture: null,
      role: 'SUPER_ADMIN',
    };
    mockFindUnique.mockResolvedValueOnce(existingUser);

    await requireAuth(req, res, next);

    expect(mockCreate).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual(
      expect.objectContaining({
        id: 'uuid-existing',
        role: 'SUPER_ADMIN',
      })
    );
  });
});
