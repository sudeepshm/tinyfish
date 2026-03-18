import type { RawPageData, SignalBundle, SignalSource, SignalPlatform } from '../types/contracts';
import { SignalPlatform as SP } from '../types/contracts';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_VALUE = 1_000_000_000;
const STALE_DAYS_VOLATILE = 7;   // OWASP LLM08: reject volatile signals older than 7 days
const SPIKE_DAYS_WINDOW   = 30;  // spike detection window
const SPIKE_SIGMA         = 3;   // spike threshold in standard deviations

// ─── Pre-compiled regex patterns ──────────────────────────────────────────────

const RE_GITHUB_STARS     = /([\d,]+(?:\.\d+)?[MBKmb]?)\s*stars?/gi;
const RE_GITHUB_FORKS     = /([\d,]+(?:\.\d+)?[MBKmb]?)\s*forks?/gi;
const RE_LINKEDIN_EMP     = /([\d,]+(?:\.\d+)?[MBKmb]?)\s*(?:employees?|team members?)/gi;
const RE_TWITTER_FOLLOW   = /([\d,]+(?:\.\d+)?[MBKmb]?)\s*followers?/gi;
const RE_FUNDING          = /\$([\d,]+(?:\.\d+)?[MBKmb]?)\s*(?:raised|funding|round)/gi;
const RE_FOUNDED          = /founded\s+(?:in\s+)?(\d{4})/gi;

// ─── Platform inference patterns ──────────────────────────────────────────────

const PLATFORM_MAP: Array<[RegExp, SignalPlatform]> = [
  [/github\.com/i,       SP.GITHUB],
  [/linkedin\.com/i,     SP.LINKEDIN],
  [/twitter\.com/i,      SP.TWITTER],
  [/x\.com/i,            SP.TWITTER],
  [/crunchbase\.com/i,   SP.CRUNCHBASE],
  [/producthunt\.com/i,  SP.PRODUCTHUNT],
];

// Volatile metric names — subject to staleness check (OWASP LLM08)
const VOLATILE_METRICS = new Set(['github_stars', 'github_forks', 'twitter_followers']);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function inferPlatform(url: string): SignalPlatform {
  for (const [pattern, platform] of PLATFORM_MAP) {
    if (pattern.test(url)) return platform;
  }
  return SP.OTHER;
}

/**
 * Parse a raw match string, stripping commas and expanding K/M/B suffixes.
 * Returns null if string is out of valid range or zero.
 */
function parseNumericValue(raw: string): number | null {
  const stripped = raw.replace(/,/g, '').trim();
  const suffix = stripped.slice(-1).toUpperCase();
  let base: number;

  if (suffix === 'M') {
    base = parseFloat(stripped.slice(0, -1)) * 1_000_000;
  } else if (suffix === 'B') {
    base = parseFloat(stripped.slice(0, -1)) * 1_000_000_000;
  } else if (suffix === 'K') {
    base = parseFloat(stripped.slice(0, -1)) * 1_000;
  } else {
    base = parseFloat(stripped);
  }

  if (!Number.isFinite(base) || base <= 0 || base >= MAX_VALUE) return null;
  return base;
}

function nowMs(): number {
  return Date.now();
}

function daysBetween(isoA: string, isoB: number): number {
  return (isoB - new Date(isoA).getTime()) / (1000 * 60 * 60 * 24);
}

function makeSource(
  url: string,
  platform: SignalPlatform,
  value: number,
  fetchedAt: string,
): SignalSource {
  return { url, platform, value, fetchedAt, reliable: true };
}

// ─── Exported Utilities ───────────────────────────────────────────────────────

/**
 * Returns the median of a numeric array. Returns 0 for empty input.
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Returns population standard deviation. Returns 0 for arrays with length <= 1.
 */
export function stdDev(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// ─── Core Functions ───────────────────────────────────────────────────────────

type SignalHit = { signalType: string; value: number };

function extractFromText(text: string): SignalHit[] {
  const hits: SignalHit[] = [];

  const run = (re: RegExp, type: string, groupIndex = 1) => {
    // Reset lastIndex since we share compiled regexes
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const val = parseNumericValue(m[groupIndex]);
      if (val !== null) hits.push({ signalType: type, value: val });
    }
  };

  run(RE_GITHUB_STARS,   'stars');
  run(RE_GITHUB_FORKS,   'forks');
  run(RE_LINKEDIN_EMP,   'employees');
  run(RE_TWITTER_FOLLOW, 'followers');
  run(RE_FUNDING,        'funding_raised');
  run(RE_FOUNDED,        'founded_year');

  return hits;
}

/**
 * Extracts numeric SignalSource items from an array of sanitised RawPageData.
 * Never throws — returns empty array on any bad input.
 */
export function extractSignals(pages: RawPageData[]): SignalSource[] {
  const sources: SignalSource[] = [];

  for (const page of pages) {
    const platform = inferPlatform(page.url);
    const hits = extractFromText(page.textContent);

    for (const { signalType, value } of hits) {
      sources.push(makeSource(page.url, platform, value, page.fetchedAt));
      // Attach signalType as a property for grouping (kept internal via type assertion)
      // We tag via a parallel structure: return enriched sources labeled by type
      // The metric key is built in groupByMetric using a separate map
      void signalType; // resolved below via groupByMetric
    }
  }

  // Re-implement cleanly: return typed envelopes for groupByMetric
  return extractRichSignals(pages);
}

// Internal enriched type — not exported
type RichSignalSource = SignalSource & { _metricKey: string };

function extractRichSignals(pages: RawPageData[]): RichSignalSource[] {
  const sources: RichSignalSource[] = [];

  for (const page of pages) {
    const platform = inferPlatform(page.url);
    const hits = extractFromText(page.textContent);

    for (const { signalType, value } of hits) {
      const metricKey = `${platform}_${signalType}`;
      sources.push({
        url: page.url,
        platform,
        value,
        fetchedAt: page.fetchedAt,
        reliable: true,
        _metricKey: metricKey,
      });
    }
  }

  return sources;
}

/**
 * Groups an array of SignalSources by metric key (platform_signalType).
 */
export function groupByMetric(sources: SignalSource[]): Map<string, SignalSource[]> {
  const map = new Map<string, SignalSource[]>();

  for (const src of sources) {
    // Recover metricKey: if _metricKey is present (internal use), use it;
    // otherwise fall back to platform_OTHER
    const key = (src as RichSignalSource)._metricKey ?? `${src.platform}_signal`;
    const existing = map.get(key);
    if (existing) {
      existing.push(src);
    } else {
      map.set(key, [src]);
    }
  }

  return map;
}

/**
 * Computes a SignalBundle for a given metric from its sources.
 * Handles spike detection (OWASP LLM04) and confidence scoring.
 */
export function computeBundle(metric: string, sources: SignalSource[]): SignalBundle {
  const now = nowMs();
  const reliableSources = sources.filter((s) => s.reliable);
  const values = reliableSources.map((s) => s.value);

  const med = median(values);
  const sd = stdDev(values);

  // Spike: any source value > median + 3σ AND fetched within last 30 days
  const spikeFlag = reliableSources.some((s) => {
    const isSpike = s.value > med + SPIKE_SIGMA * sd;
    const isRecent = daysBetween(s.fetchedAt, now) <= SPIKE_DAYS_WINDOW;
    return isSpike && isRecent;
  });

  // Confidence
  let confidence: number;
  if (reliableSources.length >= 3) confidence = 1.0;
  else if (reliableSources.length === 2) confidence = 0.6;
  else if (reliableSources.length === 1) confidence = 0.3;
  else confidence = 0.0;

  const excludedFromScore = spikeFlag || confidence < 0.3;

  return {
    metric,
    sources,
    median: med,
    stdDev: sd,
    spikeFlag,
    confidence,
    excludedFromScore,
  };
}

/**
 * Orchestration entry point: scraper output → validated SignalBundles.
 * Filters out bundles where every source is unreliable.
 * This is the only function other modules should call.
 */
export function validateBundles(pages: RawPageData[]): SignalBundle[] {
  if (pages.length === 0) return [];

  const now = nowMs();
  const richSources = extractRichSignals(pages);

  // OWASP LLM08: mark volatile signals older than 7 days as unreliable
  const markedSources: RichSignalSource[] = richSources.map((s) => {
    if (
      VOLATILE_METRICS.has(s._metricKey) &&
      daysBetween(s.fetchedAt, now) > STALE_DAYS_VOLATILE
    ) {
      return { ...s, reliable: false };
    }
    return s;
  });

  const grouped = groupByMetric(markedSources);
  const bundles: SignalBundle[] = [];

  for (const [metric, sources] of grouped) {
    // Filter out groups where all sources are unreliable
    const hasReliable = sources.some((s) => s.reliable);
    if (!hasReliable) continue;

    bundles.push(computeBundle(metric, sources));
  }

  return bundles;
}
