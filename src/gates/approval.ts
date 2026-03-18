import { randomUUID } from 'crypto';
import type { ApprovalTask, ApprovalAction, ApprovalStatus } from '../types/contracts';
import { ApprovalStatus as AS, ApprovalAction as AA } from '../types/contracts';

// ─── DbAdapter interface ───────────────────────────────────────────────────────

/** Pluggable persistence interface — swap for Postgres, DynamoDB, etc. */
export interface DbAdapter {
  save(task: ApprovalTask): Promise<void>;
  findById(taskId: string): Promise<ApprovalTask | null>;
  findByUserId(userId: string, status?: ApprovalStatus): Promise<ApprovalTask[]>;
}

// ─── InMemoryDbAdapter ────────────────────────────────────────────────────────

/**
 * In-memory implementation of DbAdapter for tests and local development.
 * Do NOT use in production — data is lost on process restart.
 */
export class InMemoryDbAdapter implements DbAdapter {
  private store = new Map<string, ApprovalTask>();

  async save(task: ApprovalTask): Promise<void> {
    this.store.set(task.taskId, { ...task });
  }

  async findById(taskId: string): Promise<ApprovalTask | null> {
    return this.store.get(taskId) ?? null;
  }

  async findByUserId(userId: string, status?: ApprovalStatus): Promise<ApprovalTask[]> {
    const results: ApprovalTask[] = [];
    for (const task of this.store.values()) {
      if (task.userId !== userId) continue;
      if (status !== undefined && task.status !== status) continue;
      results.push({ ...task });
    }
    // Ascending by requestedAt (oldest first)
    results.sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
    return results;
  }
}

// ─── Error Classes ────────────────────────────────────────────────────────────

export class ApprovalNotFoundError extends Error {
  constructor(taskId: string) {
    super(`Approval task not found: ${taskId}`);
    this.name = 'ApprovalNotFoundError';
  }
}

export class ApprovalAlreadyResolvedError extends Error {
  constructor(taskId: string, status: ApprovalStatus) {
    super(`Task ${taskId} already resolved with status: ${status}`);
    this.name = 'ApprovalAlreadyResolvedError';
  }
}

// ─── Module-level DB adapter (injectable) ────────────────────────────────────

let _db: DbAdapter = new InMemoryDbAdapter();

/**
 * Dependency injection point for the database adapter.
 * Call this in your application bootstrap to swap in a real persistence layer.
 */
export function setDbAdapter(adapter: DbAdapter): void {
  _db = adapter;
}

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Creates a new ApprovalTask with PENDING status and persists it.
 * The task must be explicitly approved by a human before any write occurs.
 */
export async function createTask(
  jobId: string,
  userId: string,
  action: ApprovalAction,
  payload: Record<string, unknown>,
): Promise<ApprovalTask> {
  const task: ApprovalTask = {
    taskId:      randomUUID(),
    jobId,
    userId,
    action,
    payload,
    requestedAt: new Date().toISOString(),
    status:      AS.PENDING,
    resolvedAt:  null,
    resolvedBy:  null,
  };

  await _db.save(task);

  // Log without payload to avoid sensitive data in logs (OWASP LLM06)
  console.info(
    `[approval] task created taskId=${task.taskId} userId=${userId} action=${action} jobId=${jobId}`,
  );

  return task;
}

/**
 * Marks a task APPROVED (by an explicit human action) and executes the
 * approved write operation. Throws if the task is unknown or already resolved.
 */
export async function approveTask(taskId: string, resolvedBy: string): Promise<ApprovalTask> {
  const task = await _db.findById(taskId);
  if (!task) throw new ApprovalNotFoundError(taskId);
  if (task.status !== AS.PENDING) throw new ApprovalAlreadyResolvedError(taskId, task.status);

  const updated: ApprovalTask = {
    ...task,
    status:     AS.APPROVED,
    resolvedAt: new Date().toISOString(),
    resolvedBy,
  };

  await executeApprovedAction(updated);
  await _db.save(updated);

  console.info(
    `[approval] APPROVED taskId=${taskId} resolvedBy=${resolvedBy} action=${updated.action} jobId=${updated.jobId}`,
  );

  return updated;
}

/**
 * Marks a task REJECTED. The write operation is never executed.
 */
export async function rejectTask(taskId: string, resolvedBy: string): Promise<ApprovalTask> {
  const task = await _db.findById(taskId);
  if (!task) throw new ApprovalNotFoundError(taskId);
  if (task.status !== AS.PENDING) throw new ApprovalAlreadyResolvedError(taskId, task.status);

  const updated: ApprovalTask = {
    ...task,
    status:     AS.REJECTED,
    resolvedAt: new Date().toISOString(),
    resolvedBy,
  };

  await _db.save(updated);

  console.info(
    `[approval] REJECTED taskId=${taskId} resolvedBy=${resolvedBy} action=${updated.action} jobId=${updated.jobId}`,
  );

  return updated;
}

/**
 * Returns all PENDING tasks for a given user, oldest first.
 */
export async function getPendingTasks(userId: string): Promise<ApprovalTask[]> {
  return _db.findByUserId(userId, AS.PENDING);
}

/**
 * OWASP LLM06 — ONLY write path to external systems.
 * Stubs are safe for MVP; replace with real CRM SDK calls in production.
 *
 * NOTE: Any CRM API key used here must be READ-ONLY in config — this module
 * only appends/exports data and must never delete or overwrite existing records.
 */
export async function executeApprovedAction(task: ApprovalTask): Promise<void> {
  // Double-check approval status even though approveTask already checked —
  // defensive guard against accidental direct calls (OWASP LLM06)
  if (task.status !== AS.APPROVED) {
    console.warn(
      `[approval] executeApprovedAction called with non-APPROVED task ${task.taskId} (status=${task.status}) — aborting`,
    );
    return;
  }

  switch (task.action) {
    case AA.CRM_WRITE:
      // STUB — replace with real CRM SDK call (e.g. HubSpot, Salesforce)
      console.info(`[approval] CRM write approved for job ${task.jobId}`);
      break;

    case AA.CRM_UPDATE:
      // STUB — replace with real CRM SDK call
      console.info(`[approval] CRM write approved for job ${task.jobId}`);
      break;

    case AA.EXPORT_REPORT:
      // STUB — replace with real export pipeline (S3 upload, PDF generation, etc.)
      console.info(`[approval] Report export approved for job ${task.jobId}`);
      break;

    default: {
      // Exhaustiveness: TypeScript will error here if a new ApprovalAction is
      // added to the enum but not handled in this switch.
      const _exhaustive: never = task.action;
      console.error(`[approval] Unknown action: ${String(_exhaustive)}`);
    }
  }
}
