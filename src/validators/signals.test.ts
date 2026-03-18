import { describe, it, expect } from 'vitest';
import {
  extractSignals,
  computeBundle,
  validateBundles,
  median,
  stdDev,
} from './signals';
import type { RawPageData, SignalSource } from '../types/contracts';
import { SignalPlatform } from '../types/contracts';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const NOW_ISO = new Date().toISOString();          // fresh — within all windows
const OLD_ISO = new Date(Date.now() - 60 * 86_400_000).toISOString(); // 60 days ago

function makePage(overrides: Partial<RawPageData> = {}): RawPageData {
  return {
    url: 'https://github.com/acme/repo',
    textContent: '',
    fetchedAt: NOW_ISO,
    flaggedInstructions: [],
    wordCount: 0,
    ...overrides,
  };
}

function makeSource(overrides: Partial<SignalSource> = {}): SignalSource {
  return {
    url: 'https://github.com/acme/repo',
    platform: SignalPlatform.GITHUB,
    value: 100,
    fetchedAt: NOW_ISO,
    reliable: true,
    ...overrides,
  };
}

// ─── extractSignals ───────────────────────────────────────────────────────────

describe('extractSignals', () => {
  it('1. finds GitHub stars from page text', () => {
    const page = makePage({ textContent: 'This project has 4200 stars on GitHub.' });
    const signals = extractSignals([page]);
    expect(signals.length).toBeGreaterThan(0);
    const star = signals.find((s) => s.value === 4200);
    expect(star).toBeDefined();
  });

  it('2. handles comma-separated numbers (12,500 stars)', () => {
    const page = makePage({ textContent: 'We hit 12,500 stars last week!' });
    const signals = extractSignals([page]);
    const star = signals.find((s) => s.value === 12500);
    expect(star).toBeDefined();
  });

  it('3. handles M/K suffixes', () => {
    const pageM = makePage({
      url: 'https://twitter.com/acme',
      textContent: '1.2M followers on Twitter.',
    });
    const pageK = makePage({
      url: 'https://twitter.com/acme',
      textContent: '500K followers joined us.',
    });
    const sigM = extractSignals([pageM]);
    const sigK = extractSignals([pageK]);

    expect(sigM.find((s) => s.value === 1_200_000)).toBeDefined();
    expect(sigK.find((s) => s.value === 500_000)).toBeDefined();
  });

  it('4. returns empty array for pages with no signals', () => {
    const page = makePage({ textContent: 'We are building something great.' });
    const signals = extractSignals([page]);
    expect(signals).toEqual([]);
  });
});

// ─── computeBundle ────────────────────────────────────────────────────────────

describe('computeBundle', () => {
  it('5. returns spikeFlag=true for a value >3σ spike fetched recently', () => {
    // 4 normal values of 100, one extreme outlier of 1_000_000.
    // median=100, mean≈200080, σ≈399920, median+3σ≈1_200_060 — but the
    // outlier absolute distance from median (999_900) also triggers.
    // Simpler: use only 3 baseline + 1 extreme so σ is small.
    // With [100, 100, 100, 1_000_000]: mean=250075, σ≈433012 — still masked.
    // Best approach: 1 baseline + 1 spike so σ is half the gap.
    // [100, 999_900]: median=549_950 (between values for even array)... use odd.
    // Use [100, 100, 100_000]: median=100, σ≈47,001, median+3σ≈141,103; 100_000 > 141,103? No.
    // Correct approach: very tight baseline + large spike.
    // [10, 10, 10, 10, 10, 1_000_000]: mean≈166,676, σ≈408,239; 10+3*408,239≈1,224,727 > 1M? No.
    // The 3σ rule works best with 2-source: [10, 10_000]: 
    //   median(even)=(10+10000)/2=5005, mean=5005, σ=4995, threshold=5005+3*4995=19990 < 10000? No.
    // CORRECT: use a tight cluster + outlier where n is large enough that the outlier
    // dominates σ. With [100]*20 + [500_000]: mean≈23,828, σ≈103,571, threshold=100+3*103571=310,813 < 500,000 ✓
    const baselineCount = 20;
    const sources = [
      ...Array.from({ length: baselineCount }, () => makeSource({ value: 100, fetchedAt: NOW_ISO })),
      makeSource({ value: 500_000, fetchedAt: NOW_ISO }),
    ];
    const bundle = computeBundle('github_stars', sources);
    expect(bundle.spikeFlag).toBe(true);
  });

  it('6. returns spikeFlag=false for normal variation', () => {
    const sources = [95, 100, 105, 98, 102].map((value) => makeSource({ value }));
    const bundle = computeBundle('github_stars', sources);
    expect(bundle.spikeFlag).toBe(false);
  });

  it('7. confidence=1.0 for 3+ reliable sources', () => {
    const sources = [1, 2, 3].map((value) => makeSource({ value }));
    const bundle = computeBundle('github_stars', sources);
    expect(bundle.confidence).toBe(1.0);
  });

  it('8. confidence=0.3 for exactly 1 source', () => {
    const sources = [makeSource({ value: 500 })];
    const bundle = computeBundle('github_stars', sources);
    expect(bundle.confidence).toBe(0.3);
  });
});

// ─── median ───────────────────────────────────────────────────────────────────

describe('median', () => {
  it('9. median of [1,2,3,4,5] = 3', () => {
    expect(median([1, 2, 3, 4, 5])).toBe(3);
  });

  it('returns 0 for empty array', () => {
    expect(median([])).toBe(0);
  });

  it('returns correct median for even-length arrays', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

// ─── stdDev ───────────────────────────────────────────────────────────────────

describe('stdDev', () => {
  it('10. stdDev of identical values = 0', () => {
    expect(stdDev([7, 7, 7, 7])).toBe(0);
  });

  it('returns 0 for single-element array', () => {
    expect(stdDev([42])).toBe(0);
  });

  it('returns 0 for empty array', () => {
    expect(stdDev([])).toBe(0);
  });
});

// ─── validateBundles ──────────────────────────────────────────────────────────

describe('validateBundles', () => {
  it('11. returns empty array for empty input', () => {
    expect(validateBundles([])).toEqual([]);
  });

  it('returns bundles for valid pages', () => {
    const page = makePage({ textContent: '8500 stars on GitHub!' });
    const bundles = validateBundles([page]);
    expect(bundles.length).toBeGreaterThan(0);
  });

  it('excludes bundles where all sources are unreliable (stale volatile signals)', () => {
    // A github stars signal fetched 60 days ago is stale (>7 days) → unreliable
    const page = makePage({
      url: 'https://github.com/acme/repo',
      textContent: '9000 stars right here!',
      fetchedAt: OLD_ISO,
    });
    const bundles = validateBundles([page]);
    // All sources unreliable → bundle filtered out
    expect(bundles).toEqual([]);
  });
});

// ─── Security: value range guard ─────────────────────────────────────────────

describe('Value range validation', () => {
  it('12. values > 1 billion are rejected', () => {
    const page = makePage({
      textContent: '2000000000 stars total.',  // 2 billion — over limit
    });
    const signals = extractSignals([page]);
    const oversized = signals.find((s) => s.value >= 1_000_000_000);
    expect(oversized).toBeUndefined();
  });
});
