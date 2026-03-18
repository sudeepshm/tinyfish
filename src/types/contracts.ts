// ─── VC Deal-Flow Research Agent — Shared Data Contracts ────────────────────
// Single source of truth for all modules. No classes, functions, or imports.

/** Platforms from which market/social signals are sourced. */
export enum SignalPlatform {
  GITHUB = "github",
  LINKEDIN = "linkedin",
  TWITTER = "twitter",
  CRUNCHBASE = "crunchbase",
  NEWS = "news",
  PRODUCTHUNT = "producthunt",
  OTHER = "other",
}

/** High-trust actions that require explicit human approval before execution. */
export enum ApprovalAction {
  CRM_WRITE = "crm_write",
  CRM_UPDATE = "crm_update",
  EXPORT_REPORT = "export_report",
}

/** Lifecycle states for an ApprovalTask. */
export enum ApprovalStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
}

/** Top-level job descriptor submitted by the user to kick off research. */
export interface ResearchJob {
  jobId: string;          // UUID v4
  startupName: string;    // user-provided, max 200 chars
  url: string | null;     // optional seed URL
  userId: string;         // authenticated user ID
  createdAt: string;      // ISO 8601 timestamp
  config: AgentConfig;
}

/** Tuneable parameters controlling crawler depth, cost, and time limits. */
export interface AgentConfig {
  maxDepth: number;           // max crawler depth, default 2, hard max 3
  maxPages: number;           // max pages per job, default 20, hard max 50
  tokenBudget: number;        // max tokens for analyst LLM, default 40000
  costCeilingCents: number;   // max spend in USD cents, default 500
  timeoutMs: number;          // per-request timeout, default 30000
}

/** Mutable snapshot of resource consumption for an in-flight job. */
export interface BudgetState {
  tokensUsed: number;
  pagesVisited: number;
  costCents: number;
  visitedUrls: string[];  // dedup set serialised as an array
}

/** Gate-check result returned before each new page fetch or LLM call. */
export interface BudgetResult {
  allowed: boolean;
  reason: string | null;  // null if allowed, descriptive message if denied
  budget: BudgetState;
}

/** Sanitised text extracted from a single crawled page. */
export interface RawPageData {
  url: string;
  textContent: string;           // plain text only, NO HTML
  fetchedAt: string;             // ISO 8601
  flaggedInstructions: string[]; // injection attempts found, quoted verbatim
  wordCount: number;
}

/** A single data point fetched from one external platform. */
export interface SignalSource {
  url: string;
  platform: SignalPlatform;
  value: number;
  fetchedAt: string;
  reliable: boolean;  // false if fetch failed or returned no data
}

/** Aggregated statistics for one metric across multiple sources. */
export interface SignalBundle {
  metric: string;              // e.g. "github_stars", "linkedin_headcount"
  sources: SignalSource[];
  median: number;
  stdDev: number;
  spikeFlag: boolean;          // true if velocity > 3σ in 30 days
  confidence: number;          // 0.0 to 1.0
  excludedFromScore: boolean;  // true if spikeFlag is true
}

/** Traceable reference to a specific page used as evidence in the report. */
export interface SourceCitation {
  url: string;
  platform: SignalPlatform;
  retrievedAt: string;
  snippet: string;  // max 280 chars, plain text
}

/** A single potential hallucination flagged by the validation layer. */
export interface HallucFlag {
  claim: string;
  reason: string;
  severity: "low" | "medium" | "high";
}

/** Scored contribution of one dimension (team/tech/market) to the overall verdict. */
export interface ScoreBreakdown {
  raw: number;        // 0–100
  confidence: number; // 0.0–1.0
  signals: string[];  // which signals contributed
}

/** Final due-diligence report produced by the analyst LLM and validated. */
export interface DueDiligence {
  reportId: string;              // UUID v4
  jobId: string;
  startupName: string;
  generatedAt: string;           // ISO 8601
  teamScore: ScoreBreakdown;
  techScore: ScoreBreakdown;
  marketScore: ScoreBreakdown;
  overallScore: ScoreBreakdown;
  signals: SignalBundle[];
  hallucFlags: HallucFlag[];
  sourceCitations: SourceCitation[];
  hmacSignature: string;         // HMAC-SHA256, verified by orchestrator
  piiRedacted: boolean;          // true = PII scrub pass was run
}

/** Human-in-the-loop task queued before any write/export side-effect. */
export interface ApprovalTask {
  taskId: string;                    // UUID v4
  jobId: string;
  userId: string;
  action: ApprovalAction;
  payload: Record<string, unknown>;
  requestedAt: string;
  status: ApprovalStatus;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

/** Top-level result envelope returned by the orchestrator to the API layer. */
export interface OrchestratorResult {
  reportId: string;
  jobId: string;
  status: "queued" | "scraping" | "validating" | "analysing" | "done" | "failed";
  report: DueDiligence | null;
  error: string | null;
}

/** Server-Sent Event payload streamed to the client during job execution. */
export interface SSEEvent {
  event: 'status' | 'progress' | 'pipeline_error' | 'done';
  data: OrchestratorResult | Record<string, unknown>;
}
