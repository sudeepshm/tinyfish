import type { ResearchJob, OrchestratorResult, DueDiligence } from '../types/contracts';
import type { SSESender } from './sse';

import {
  checkRateLimit,
  checkBudget,
  checkCostAlert,
  createInitialBudget,
  updateBudget,
  safeCountJobs,
} from '../guards/budget';

import { scrapeMultiple }              from '../agents/scraper';
import { validateBundles }             from '../validators/signals';
import { analyseStartup, verifyReport } from '../agents/analyst';
import Redis                            from 'ioredis';

// ─── Redis cache (optional) ───────────────────────────────────────────────────

const redis: Redis | null = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL)
  : null;

const CACHE_TTL_SECONDS = 3600;

// ─── Integration test note ────────────────────────────────────────────────────
// Integration tests live in src/__tests__/integration.test.ts
// Unit-test each module independently. Orchestrator is tested end-to-end only.

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Lowercases and hyphenates a display name for use in platform URLs.
 * "Acme Corp" → "acme-corp"  |  "A.I. Startup" → "ai-startup"
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')   // strip non-alphanumeric except space/hyphen
    .replace(/\s+/g, '-')            // spaces → hyphens
    .replace(/-+/g, '-')             // collapse consecutive hyphens
    .replace(/^-|-$/g, '');          // trim leading/trailing hyphens
}

/** Returns a promise that rejects after `ms` milliseconds. */
function timeout(ms: number): Promise<never> {
  return new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Global pipeline timeout after ${ms}ms`)), ms),
  );
}

/**
 * Stub: returns how many jobs this user has started in the last 60 minutes.
 * In production this queries the jobs database.
 * Returns 0 so rate limiting passes during development.
 */
async function queryJobsInLastHour(_userId: string): Promise<number> {
  return 0;
}

/**
 * Stub: returns the total cost spent today across all jobs (in cents).
 * In production this queries the billing database.
 */
async function queryTotalDailyCostCents(): Promise<number> {
  return 0;
}

/** Build the candidate URL list for a given job. */
function buildUrlList(job: ResearchJob): string[] {
  const slug = slugify(job.startupName);
  const encoded = encodeURIComponent(job.startupName);

  const urls: string[] = [
    `https://www.linkedin.com/company/${slug}`,
    `https://github.com/${slug}`,
    `https://www.producthunt.com/search?q=${encoded}`,
    `https://crunchbase.com/organization/${slug}`,
  ];

  if (job.url) urls.push(job.url);
  return urls;
}

/** Construct a base OrchestratorResult skeleton. */
function baseResult(job: ResearchJob): OrchestratorResult {
  return {
    reportId: '',
    jobId:    job.jobId,
    status:   'queued',
    report:   null,
    error:    null,
  };
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

/**
 * Runs the full research pipeline for a submitted job.
 * Emits SSE progress events at every stage transition.
 * Never throws — all errors are caught, emitted as SSE "error" events, and
 * returned as a failed OrchestratorResult.
 */
export async function runResearchJob(
  job: ResearchJob,
  sse: SSESender,
): Promise<OrchestratorResult> {
  const result = baseResult(job);

  // OWASP LLM10 — wrap entire pipeline in a global timeout
  const globalTimeoutMs = job.config.timeoutMs * job.config.maxPages;

  const pipeline = async (): Promise<OrchestratorResult> => {
    // ── CACHE CHECK — Before STEP 1 ──────────────────────────────────────────
    if (redis) {
      try {
        const cacheKey = `report:${slugify(job.startupName)}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
          const cachedReport = JSON.parse(cached) as DueDiligence;
          const doneResult: OrchestratorResult = {
            reportId: cachedReport.reportId,
            jobId:    job.jobId,
            status:   'done',
            report:   cachedReport,
            error:    null,
          };
          sse.send({ event: 'done', data: doneResult });
          return doneResult;
        }
      } catch (cacheErr) {
        console.warn(`[orchestrator] Redis cache read error: ${cacheErr instanceof Error ? cacheErr.message : String(cacheErr)}`);
      }
    }

    // ── STEP 1 — Rate limit check ─────────────────────────────────────────────
    const jobsInLastHour = await safeCountJobs(() => queryJobsInLastHour(job.userId));
    const rateLimitResult = checkRateLimit(job.userId, jobsInLastHour);

    if (!rateLimitResult.allowed) {
      const error = rateLimitResult.reason ?? 'Rate limit exceeded';
      sse.send({ event: 'pipeline_error', data: { ...result, status: 'failed', error, report: null } });
      return { ...result, status: 'failed', error };
    }

    // ── STEP 2 — Budget initialisation ───────────────────────────────────────
    let budget = createInitialBudget();

    sse.send({ event: 'status', data: { ...result, status: 'queued', report: null } });

    // ── STEP 2b — URL resolution ──────────────────────────────────────────────
    const urls = buildUrlList(job);

    sse.send({ event: 'status', data: { ...result, status: 'scraping', report: null } });

    // ── STEP 3 — Budget pre-check ─────────────────────────────────────────────
    const budgetCheck = checkBudget(job, budget);
    if (!budgetCheck.allowed) {
      const error = budgetCheck.reason ?? 'Budget limit exceeded before scraping';
      sse.send({ event: 'pipeline_error', data: { ...result, status: 'failed', error, report: null } });
      return { ...result, status: 'failed', error };
    }

    // ── STEP 4 — Scrape ───────────────────────────────────────────────────────
    const pages = await scrapeMultiple(urls, job, budget);

    if (pages.length === 0) {
      const error = 'Scraping returned no pages — cannot proceed with analysis';
      sse.send({ event: 'pipeline_error', data: { ...result, status: 'failed', error, report: null } });
      return { ...result, status: 'failed', error };
    }

    // Update budget with pages visited
    budget = updateBudget(budget, {
      pagesVisited: pages.length,
      visitedUrls:  pages.map((p) => p.url),
    });

    // ── STEP 5 — Validate signals ─────────────────────────────────────────────
    sse.send({ event: 'status', data: { ...result, status: 'validating', report: null } });

    const bundles = validateBundles(pages);

    if (bundles.length === 0) {
      // Warning only — analysis continues with empty bundle set
      console.warn(
        `[orchestrator] jobId=${job.jobId} no signal bundles extracted — analysis may be low-confidence`,
      );
    }

    // ── STEP 6 — Analyse ──────────────────────────────────────────────────────
    sse.send({ event: 'status', data: { ...result, status: 'analysing', report: null } });

    const report: DueDiligence = await analyseStartup(bundles, job, sse);

    // OWASP LLM08 — integrity check: reject tampered reports
    const hmacSecret = process.env.REPORT_HMAC_SECRET ?? '';
    if (!verifyReport(report, hmacSecret)) {
      const error = 'HMAC verification failed — report integrity compromised';
      console.error(`[SECURITY] ${error} jobId=${job.jobId}`);
      sse.send({
        event: 'pipeline_error',
        data:  { ...result, reportId: report.reportId, status: 'failed', error, report: null },
      });
      return { ...result, reportId: report.reportId, status: 'failed', error };
    }

    // ── STEP 8 — Cost alert (OWASP LLM10) ────────────────────────────────────
    const totalDailyCostCents = await queryTotalDailyCostCents();
    if (checkCostAlert(totalDailyCostCents, 1000)) {
      console.warn(
        `[COST ALERT] Daily cost threshold reached: ${totalDailyCostCents} cents. userId: ${job.userId}`,
      );
      // In production: send webhook/email alert here
    }

    // ── STEP 9 — Done ─────────────────────────────────────────────────────────
    const doneResult: OrchestratorResult = {
      reportId: report.reportId,
      jobId:    job.jobId,
      status:   'done',
      report,
      error:    null,
    };

    // Cache the result if Redis is available
    if (redis) {
      try {
        const cacheKey = `report:${slugify(job.startupName)}`;
        await redis.set(cacheKey, JSON.stringify(report), 'EX', CACHE_TTL_SECONDS);
      } catch (cacheErr) {
        console.warn(`[orchestrator] Redis cache write error: ${cacheErr instanceof Error ? cacheErr.message : String(cacheErr)}`);
      }
    }

    sse.send({ event: 'done', data: doneResult });
    return doneResult;
  };

  try {
    return await Promise.race([pipeline(), timeout(globalTimeoutMs)]);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[orchestrator] jobId=${job.jobId} unhandled error: ${error}`);
    sse.send({
      event: 'pipeline_error',
      data:  { ...result, status: 'failed', error, report: null },
    });
    return { ...result, status: 'failed', error };
  }
}
