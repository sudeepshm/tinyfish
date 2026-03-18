import { describe, it, expect } from 'vitest';
import {
  checkBudget,
  updateBudget,
  isUrlVisited,
  createInitialBudget,
  getDefaultConfig,
  checkRateLimit,
  checkCostAlert,
  RateLimitInputError,
} from './budget';
import type { ResearchJob, BudgetState } from '../types/contracts';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<ResearchJob['config']> = {}): ResearchJob {
  return {
    jobId: 'test-job-id',
    startupName: 'Acme Corp',
    url: null,
    userId: 'user-1',
    createdAt: '2026-03-15T00:00:00Z',
    config: {
      maxDepth: 2,
      maxPages: 20,
      tokenBudget: 40000,
      costCeilingCents: 500,
      timeoutMs: 30000,
      ...overrides,
    },
  };
}

function makeState(overrides: Partial<BudgetState> = {}): BudgetState {
  return {
    tokensUsed: 0,
    pagesVisited: 0,
    costCents: 0,
    visitedUrls: [],
    ...overrides,
  };
}

// ─── checkBudget ──────────────────────────────────────────────────────────────

describe('checkBudget', () => {
  it('1. returns allowed=true when all limits are under threshold', () => {
    const result = checkBudget(makeJob(), makeState({ tokensUsed: 100, pagesVisited: 1, costCents: 10 }));
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeNull();
  });

  it('2. returns allowed=false when tokensUsed >= tokenBudget', () => {
    const result = checkBudget(makeJob(), makeState({ tokensUsed: 40000 }));
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Token budget exceeded/);
    expect(result.reason).toMatch(/40000/);
  });

  it('3. returns allowed=false when pagesVisited >= maxPages', () => {
    const result = checkBudget(makeJob(), makeState({ pagesVisited: 20 }));
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Page limit exceeded/);
    expect(result.reason).toMatch(/20/);
  });

  it('4. returns allowed=false when costCents >= costCeilingCents', () => {
    const result = checkBudget(makeJob(), makeState({ costCents: 500 }));
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Cost ceiling exceeded/);
    expect(result.reason).toMatch(/500/);
  });
});

// ─── updateBudget ─────────────────────────────────────────────────────────────

describe('updateBudget', () => {
  it('5. returns a new object (not the same reference)', () => {
    const state = makeState();
    const result = updateBudget(state, { tokensUsed: 100 });
    expect(result).not.toBe(state);
  });

  it('6. deduplicates URLs correctly', () => {
    const state = makeState({ visitedUrls: ['https://example.com'] });
    const result = updateBudget(state, { visitedUrls: ['https://example.com', 'https://other.com'] });
    expect(result.visitedUrls).toHaveLength(2);
    expect(result.visitedUrls).toContain('https://other.com');
  });

  it('7. clamps negative delta values to 0 (no negative deltas allowed)', () => {
    const state = makeState({ tokensUsed: 100, pagesVisited: 5, costCents: 50 });
    const result = updateBudget(state, { tokensUsed: -999, pagesVisited: -1, costCents: -500 });
    expect(result.tokensUsed).toBe(100);
    expect(result.pagesVisited).toBe(5);
    expect(result.costCents).toBe(50);
  });
});

// ─── isUrlVisited ─────────────────────────────────────────────────────────────

describe('isUrlVisited', () => {
  it('8. is case-insensitive', () => {
    const state = makeState({ visitedUrls: ['https://Example.COM/page'] });
    expect(isUrlVisited(state, 'https://example.com/page')).toBe(true);
    expect(isUrlVisited(state, 'HTTPS://EXAMPLE.COM/PAGE')).toBe(true);
  });

  it('9. strips trailing slash before comparing', () => {
    const state = makeState({ visitedUrls: ['https://example.com/page/'] });
    expect(isUrlVisited(state, 'https://example.com/page')).toBe(true);
    expect(isUrlVisited(state, 'https://example.com/page/')).toBe(true);
  });
});

// ─── createInitialBudget ──────────────────────────────────────────────────────

describe('createInitialBudget', () => {
  it('10. returns all zeros and an empty visitedUrls array', () => {
    const budget = createInitialBudget();
    expect(budget.tokensUsed).toBe(0);
    expect(budget.pagesVisited).toBe(0);
    expect(budget.costCents).toBe(0);
    expect(budget.visitedUrls).toEqual([]);
  });
});

// ─── checkRateLimit ───────────────────────────────────────────────────────────

describe('checkRateLimit', () => {
  it('11. returns allowed=false when jobsInLastHour >= 5', () => {
    const result = checkRateLimit('user-1', 5);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/Rate limit exceeded/);
  });

  it('12. returns allowed=true when jobsInLastHour = 4', () => {
    const result = checkRateLimit('user-1', 4);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeNull();
  });

  it('13. throws RateLimitInputError for negative input', () => {
    expect(() => checkRateLimit('user-1', -1)).toThrow(RateLimitInputError);
    expect(() => checkRateLimit('user-1', -1)).toThrow(
      'jobsInLastHour must be a non-negative integer',
    );
  });
});

// ─── checkCostAlert ───────────────────────────────────────────────────────────

describe('checkCostAlert', () => {
  it('14. returns true when daily cost >= threshold', () => {
    expect(checkCostAlert(1000, 1000)).toBe(true);
    expect(checkCostAlert(1500, 1000)).toBe(true);
  });

  it('15. returns false for invalid (negative) input without throwing', () => {
    expect(() => checkCostAlert(-1, 1000)).not.toThrow();
    expect(checkCostAlert(-1, 1000)).toBe(false);
    expect(checkCostAlert(100, -50)).toBe(false);
  });
});

// ─── getDefaultConfig ─────────────────────────────────────────────────────────

describe('getDefaultConfig', () => {
  it('returns canonical defaults', () => {
    const cfg = getDefaultConfig();
    expect(cfg.maxDepth).toBe(2);
    expect(cfg.maxPages).toBe(10);
    expect(cfg.tokenBudget).toBe(40000);
    expect(cfg.costCeilingCents).toBe(500);
    expect(cfg.timeoutMs).toBe(10000);
  });
});
