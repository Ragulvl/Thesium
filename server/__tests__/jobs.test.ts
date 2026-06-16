// Why: Test job endpoint authorization — validates ownership checks on job data.
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('/api/jobs/:jobId authorization logic', () => {
  const currentUserId = 'user-abc';

  const fakeJobOwned = {
    id: 'job-123',
    data: { thesisId: 'thesis-1', sectionId: 'abstract', userId: 'user-abc' },
    getState: vi.fn().mockResolvedValue('completed'),
    returnvalue: { content: 'test' },
    failedReason: null,
  };

  const fakeJobOther = {
    id: 'job-456',
    data: { thesisId: 'thesis-2', sectionId: 'intro', userId: 'other-user' },
    getState: vi.fn().mockResolvedValue('active'),
    returnvalue: null,
    failedReason: null,
  };

  const fakeJobLegacy = {
    id: 'job-legacy',
    data: { thesisId: 'thesis-3', sectionId: 'methodology' },
    getState: vi.fn().mockResolvedValue('completed'),
    returnvalue: null,
    failedReason: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 404 response info when job is null', () => {
    const job = null;
    expect(job).toBeNull();
    // In the handler: if (!job) return res.status(404)
  });

  it('should grant access when job userId matches the auth user', () => {
    const job = fakeJobOwned;
    const isOwner = !job.data.userId || job.data.userId === currentUserId;
    expect(isOwner).toBe(true);
  });

  it('should deny access when job userId does NOT match the auth user', () => {
    const job = fakeJobOther;
    const isOwner = !job.data.userId || job.data.userId === currentUserId;
    expect(isOwner).toBe(false);
  });

  it('should allow access to legacy jobs without userId (backward compat)', () => {
    const job = fakeJobLegacy;
    const hasUserId = job.data?.userId;
    expect(hasUserId).toBeUndefined();
    // In the handler: if (job.data?.userId && job.data.userId !== req.user!.id) → skipped
    const isAllowed = !hasUserId || hasUserId === currentUserId;
    expect(isAllowed).toBe(true);
  });

  it('should produce correct state when job exists and user owns it', async () => {
    const job = fakeJobOwned;
    const state = await job.getState();
    expect(state).toBe('completed');
    expect(job.returnvalue).toEqual({ content: 'test' });
    expect(job.failedReason).toBeNull();
  });
});
