import type { ResearchJob, AgentConfig, BudgetState, BudgetResult } from '../types/contracts';

// ─── Error Classes ────────────────────────────────────────────────────────────

export class RateLimitInputError extends Error {
  constructor() {
    super('jobsInLastHour must be a non-negative integer');
    this.name = 'RateLimitInputError';
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Normalise a URL for dedup comparison: lowercase + strip trailing slash. */
function normaliseUrl(url: string): string {
  return url.toLowerCase().replace(/\/$/, '');
}

/** Clamp a number to >= 0 to block negative-delta attacks. */
function clampPositive(n: number | undefined): number {
  return Math.max(0, n ?? 0);
}

// ─── Exported Functions ───────────────────────────────────────────────────────

/**
 * Returns a fresh, zero-valued BudgetState suitable for the start of a job.
 */
export function createInitialBudget(): BudgetState {
  return {
    tokensUsed: 0,
    pagesVisited: 0,
    costCents: 0,
    visitedUrls: [],
  };
}

/**
 * Returns the canonical default AgentConfig values.
 */
export function getDefaultConfig(): AgentConfig {
  return {
    maxDepth: 2,
    maxPages: 10,
    tokenBudget: 40000,
    costCeilingCents: 500,
    timeoutMs: 10000,
  };
}

/**
 * Pure gate-check: returns allowed=false with a descriptive reason if any
 * budget limit is exceeded, or allowed=true if everything is within bounds.
 *
 * Checks in order: tokens → pages → cost → visitedUrls ceiling.
 * The visitedUrls hard ceiling is maxPages * 3 (OWASP LLM10 loop guard).
 */
export function checkBudget(job: ResearchJob, state: BudgetState): BudgetResult {
  const { tokenBudget, maxPages, costCeilingCents } = job.config;

  if (state.tokensUsed >= tokenBudget) {
    return {
      allowed: false,
      reason: `Token budget exceeded: ${state.tokensUsed} used of ${tokenBudget} allowed`,
      budget: state,
    };
  }

  if (state.pagesVisited >= maxPages) {
    return {
      allowed: false,
      reason: `Page limit exceeded: ${state.pagesVisited} visited of ${maxPages} allowed`,
      budget: state,
    };
  }

  if (state.costCents >= costCeilingCents) {
    return {
      allowed: false,
      reason: `Cost ceiling exceeded: ${state.costCents} cents used of ${costCeilingCents} cents allowed`,
      budget: state,
    };
  }

  const urlCeiling = maxPages * 3;
  if (state.visitedUrls.length >= urlCeiling) {
    return {
      allowed: false,
      reason: `Visited-URL ceiling exceeded: ${state.visitedUrls.length} URLs recorded (hard limit ${urlCeiling})`,
      budget: state,
    };
  }

  return { allowed: true, reason: null, budget: state };
}

/**
 * Returns a NEW BudgetState by applying a delta. Numeric fields are summed,
 * visitedUrls are appended with deduplication. Negative deltas are clamped to 0.
 */
export function updateBudget(state: BudgetState, delta: Partial<BudgetState>): BudgetState {
  const existingNormalised = new Set(state.visitedUrls.map(normaliseUrl));

  const newUrls: string[] = [];
  for (const url of delta.visitedUrls ?? []) {
    const norm = normaliseUrl(url);
    if (!existingNormalised.has(norm)) {
      existingNormalised.add(norm);
      newUrls.push(url);
    }
  }

  return {
    tokensUsed: state.tokensUsed + clampPositive(delta.tokensUsed),
    pagesVisited: state.pagesVisited + clampPositive(delta.pagesVisited),
    costCents: state.costCents + clampPositive(delta.costCents),
    visitedUrls: [...state.visitedUrls, ...newUrls],
  };
}

/**
 * Case-insensitive, trailing-slash-insensitive check for a URL in state.
 */
export function isUrlVisited(state: BudgetState, url: string): boolean {
  const target = normaliseUrl(url);
  return state.visitedUrls.some((u) => normaliseUrl(u) === target);
}

/**
 * Per-user rate limiter gate. Caller must supply the correct jobsInLastHour
 * count — this function is pure and cannot query any store itself.
 *
 * Throws RateLimitInputError if jobsInLastHour is negative.
 */
export function checkRateLimit(userId: string, jobsInLastHour: number): BudgetResult {
  void userId; // consumed by orchestrator for logging; validated externally
  if (jobsInLastHour < 0) {
    throw new RateLimitInputError();
  }

  if (jobsInLastHour >= 5) {
    return {
      allowed: false,
      reason: 'Rate limit exceeded: max 5 research jobs per hour per user',
      budget: createInitialBudget(),
    };
  }

  return { allowed: true, reason: null, budget: createInitialBudget() };
}

/**
 * Returns true when daily cost has reached or exceeded the alert threshold.
 * Returns false (never throws) for invalid negative inputs — caller handles alerting.
 *
 * Default threshold: 1000 cents = $10/day.
 */
export function checkCostAlert(
  totalDailyCostCents: number,
  alertThresholdCents: number = 1000,
): boolean {
  if (totalDailyCostCents < 0 || alertThresholdCents < 0) {
    return false;
  }
  return totalDailyCostCents >= alertThresholdCents;
}

/**
 * Races a DB count query against a timeout (default 2000ms).
 * Fails open (returns 0) if the query throws or times out.
 */
export async function safeCountJobs(
  queryFn: () => Promise<number>,
  timeoutMs = 2000,
): Promise<number> {
  try {
    const result = await Promise.race([
      queryFn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
    return result;
  } catch (err) {
    console.warn(`[budget] safeCountJobs failed or timed out: ${err instanceof Error ? err.message : String(err)}`);
    return 0; // fail open
  }
}
