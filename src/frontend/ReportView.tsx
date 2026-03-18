import type { CSSProperties } from 'react';
import DOMPurify from 'dompurify';
import type { DueDiligence, ScoreBreakdown, SignalBundle, HallucFlag } from '../types/contracts';

interface ReportViewProps { report: DueDiligence }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const clean = (s: string): string => DOMPurify.sanitize(s, { ALLOWED_TAGS: [] });

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function severityStyle(s: HallucFlag['severity']): CSSProperties {
  if (s === 'high')   return { background: '#4a1515', color: '#fca5a5' };
  if (s === 'medium') return { background: '#422006', color: '#fcd34d' };
  return { background: '#1e1e2e', color: '#6b6b8a' };
}

// ─── Score card configs ───────────────────────────────────────────────────────

type ScoreVariant = 'overall' | 'team' | 'tech' | 'market';

const SCORE_STYLE: Record<ScoreVariant, { label: string; color: string; accent: string }> = {
  overall: { label: 'Overall', color: 'grad-text', accent: '' },
  team:    { label: 'Team',    color: '',           accent: '#6ee7b7' },
  tech:    { label: 'Tech',    color: '',           accent: '#60a5fa' },
  market:  { label: 'Market',  color: '',           accent: '#fcd34d' },
};

function ScoreCard({ variant, score }: { variant: ScoreVariant; score: ScoreBreakdown }) {
  const cfg = SCORE_STYLE[variant];
  let bg = '#0f0f1a';
  let border = '1px solid #1e1e2e';
  
  if (score.raw >= 70) {
    bg = 'linear-gradient(#0f0f1a, #0f0f1a) padding-box, linear-gradient(135deg, rgba(34, 197, 94, 0.4), rgba(34, 197, 94, 0.1)) border-box';
    border = '1px solid transparent';
  } else if (score.raw < 40) {
    bg = 'linear-gradient(#0f0f1a, #0f0f1a) padding-box, linear-gradient(135deg, rgba(239, 68, 68, 0.4), rgba(239, 68, 68, 0.1)) border-box';
    border = '1px solid transparent';
  }

  return (
    <div
      style={{
        flex: '1 1 140px',
        minWidth: 130,
        background: bg,
        border: border,
        borderRadius: 12,
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        alignItems: 'center',
        transition: 'border-color 0.3s, background 0.3s'
      }}
      aria-label={`${cfg.label}: ${score.raw} out of 100`}
    >
      <span style={{ fontSize: 11, fontWeight: 600, color: '#6b6b8a', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {cfg.label}
      </span>
      
      <span
        style={{ 
          background: 'linear-gradient(135deg, #7c3aed, #3b82f6)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          fontSize: 36, fontWeight: 800, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' 
        } as CSSProperties}
      >
        {score.raw}<span style={{ fontSize: 16, fontWeight: 400, opacity: 0.6 }}>/100</span>
      </span>

      <div style={{ width: '100%', height: 3, background: '#1e1e2e', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.round(score.confidence * 100)}%`, background: 'linear-gradient(90deg, #7c3aed, #3b82f6)' }} />
      </div>

      <span style={{ fontSize: 12, color: '#6b6b8a', marginTop: 2 }}>
        {Math.round(score.confidence * 100)}% conf
      </span>
    </div>
  );
}

// ─── Signal row ───────────────────────────────────────────────────────────────

function SignalRow({ bundle }: { bundle: SignalBundle }) {
  const spiked  = bundle.spikeFlag;
  const muted   = bundle.excludedFromScore;
  return (
    <tr style={{ opacity: muted ? 0.45 : 1 }}>
      <td style={{ padding: '10px 16px', fontSize: 14, color: '#c8c8e0', borderBottom: '1px solid #1e1e2e' }}>
        <span style={{ textDecoration: muted ? 'line-through' : 'none' }}>
          {clean(bundle.metric)}
        </span>
      </td>
      <td style={{ padding: '10px 16px', fontSize: 14, color: '#c8c8e0', borderBottom: '1px solid #1e1e2e', fontVariantNumeric: 'tabular-nums' }}>
        {bundle.median.toLocaleString()}
      </td>
      <td style={{ padding: '10px 16px', fontSize: 14, color: '#6b6b8a', borderBottom: '1px solid #1e1e2e' }}>
        {bundle.sources.length}
      </td>
      <td style={{ padding: '10px 16px', fontSize: 14, color: '#6b6b8a', borderBottom: '1px solid #1e1e2e' }}>
        {Math.round(bundle.confidence * 100)}%
      </td>
      <td style={{ padding: '10px 16px', fontSize: 13, borderBottom: '1px solid #1e1e2e' }}>
        {spiked ? (
          <span style={{
            background: '#422006', color: '#fcd34d',
            borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 600,
          }}>
            ⚑ spike
          </span>
        ) : (
          <span style={{ color: '#3a3a5a' }}>—</span>
        )}
      </td>
    </tr>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ReportView({ report }: ReportViewProps) {
  const initial = report.startupName ? report.startupName[0].toUpperCase() : '?';

  const handleExportPDF = () => {
    window.print();
  };

  return (
    <article 
      style={{ 
        width: '100%', maxWidth: 900, margin: '0 auto', 
        display: 'flex', flexDirection: 'column', gap: 32, 
        paddingBottom: 80, position: 'relative', zIndex: 1 
      }}
    >
      <style>{`
        .score-num {
          font-family: 'DM Mono', monospace;
          font-size: 52px; font-weight: 700;
          background: linear-gradient(135deg, #A78BFA, #60A5FA);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .score-card-good {
          box-shadow: 0 0 0 1px rgba(34,197,94,0.3), 0 0 16px rgba(34,197,94,0.08) !important;
        }
        .score-card-avg {
          box-shadow: 0 0 0 1px rgba(245,158,11,0.3) !important;
        }
        .score-card-poor {
          box-shadow: 0 0 0 1px rgba(239,68,68,0.3) !important;
        }
        .signal-row:nth-child(odd) {
          background: rgba(255,255,255,0.02);
        }
        .signal-header {
          font-family: 'DM Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.08em;
          color: rgba(255,255,255,0.4);
          text-transform: uppercase;
        }
        .citation-pill {
          background: rgba(124,58,237,0.12);
          border: 1px solid rgba(124,58,237,0.25);
          border-radius: 20px; padding: 4px 12px;
          font-size: 12px; color: #A78BFA;
          transition: background 0.2s;
        }
        .citation-pill:hover {
          background: rgba(124,58,237,0.2);
        }
        .header-title {
          font-family: 'DM Sans', sans-serif;
          font-size: 28px; font-weight: 700;
          color: #E2E8F0;
        }
        .badge-pill {
          border-radius: 20px; padding: 2px 12px; font-size: 12px; fontWeight: 600;
        }
      `}</style>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header style={{
        background: '#0E1117',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 12,
        padding: '24px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 20,
      }}>
        {/* Avatar */}
        <div style={{
          width: 56, height: 56, borderRadius: 12, flexShrink: 0,
          background: 'linear-gradient(135deg, #7C3AED, #3B82F6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 24, color: '#fff',
        }}>
          {initial}
        </div>

        {/* Name + meta */}
        <div style={{ flex: 1, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 className="header-title" style={{ margin: 0 }}>
            {clean(report.startupName)}
          </h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <span className="badge-pill" style={{ background: 'linear-gradient(135deg, #7C3AED, #3B82F6)', color: '#fff' }}>
              Score {report.overallScore.raw}/100
            </span>
            {report.piiRedacted && (
              <span className="badge-pill" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#22C55E' }}>
                PII Redacted
              </span>
            )}
            <span style={{ fontSize: 12, color: '#64748B', fontFamily: "'DM Mono', monospace" }}>
              {formatDate(report.generatedAt)}
            </span>
          </div>
        </div>

        {/* Export PDF */}
        <button
          type="button"
          onClick={handleExportPDF}
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
            color: '#E2E8F0', fontWeight: 600, fontSize: 13,
            padding: '10px 20px', cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
        >
          Export PDF ↗
        </button>
      </header>

      {/* ── Score cards ──────────────────────────────────────────────────── */}
      <section aria-labelledby="scores-heading">
        <h2 id="scores-heading" className="signal-header" style={{ marginBottom: 12 }}>
          Core Performance
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          {[
            { v: 'overall' as const, s: report.overallScore },
            { v: 'team' as const,    s: report.teamScore },
            { v: 'tech' as const,    s: report.techScore },
            { v: 'market' as const,  s: report.marketScore },
          ].map(({ v, s }) => {
            const label = v.charAt(0).toUpperCase() + v.slice(1);
            let glowClass = 'score-card-avg';
            if (s.raw >= 70) glowClass = 'score-card-good';
            if (s.raw < 40)  glowClass = 'score-card-poor';

            return (
              <div
                key={v}
                className={glowClass}
                style={{
                  flex: '1 1 180px', minWidth: 160,
                  background: '#0E1117', border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 16, padding: '24px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                }}
              >
                <span className="signal-header">{label}</span>
                <span className="score-num">{s.raw}</span>
                <div style={{ width: '100%', marginTop: 8 }}>
                   <div style={{ width: '100%', height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                     <div style={{ height: '100%', width: `${Math.round(s.confidence * 100)}%`, background: 'linear-gradient(90deg, #7C3AED, #3B82F6)', borderRadius: 2 }} />
                   </div>
                   <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                     <span style={{ fontSize: 10, color: '#64748B', fontFamily: 'DM Mono' }}>CONFIDENCE</span>
                     <span style={{ fontSize: 10, color: '#E2E8F0', fontFamily: 'DM Mono' }}>{Math.round(s.confidence * 100)}%</span>
                   </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Signals table ────────────────────────────────────────────────── */}
      <section aria-labelledby="signals-heading">
        <h2 id="signals-heading" className="signal-header" style={{ marginBottom: 12 }}>
          Signal Breakdown
        </h2>
        <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', background: '#0E1117' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                {['Metric', 'Value', 'Sources', 'Confidence', 'Status'].map((h) => (
                  <th key={h} className="signal-header" style={{ padding: '14px 16px', textAlign: 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.signals.map((b, i) => (
                <tr key={i} className="signal-row" style={{ opacity: b.excludedFromScore ? 0.4 : 1 }}>
                  <td style={{ padding: '14px 16px', fontSize: 14, color: '#E2E8F0', textDecoration: b.spikeFlag ? 'line-through' : 'none' }}>
                    {clean(b.metric)}
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 14, color: '#A78BFA', fontFamily: 'DM Mono' }}>
                    {b.median.toLocaleString()}
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: 14, color: '#64748B' }}>{b.sources.length}</td>
                  <td style={{ padding: '14px 16px', fontSize: 14, color: '#64748B' }}>{Math.round(b.confidence * 100)}%</td>
                  <td style={{ padding: '14px 16px', fontSize: 12 }}>
                    {b.spikeFlag ? (
                      <span style={{ color: '#F59E0B', fontWeight: 600 }}>⚠ SPIKE</span>
                    ) : (
                      <span style={{ color: '#22C55E' }}>STABLE</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Source citations ─────────────────────────────────────────────── */}
      <section aria-labelledby="sources-heading">
        <h2 id="sources-heading" className="signal-header" style={{ marginBottom: 12 }}>
          Verification Sources
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {report.sourceCitations.map((c, i) => (
            <div
              key={i}
              style={{
                background: '#0E1117',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 12,
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span className="citation-pill">{clean(c.platform)}</span>
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 12, color: '#64748B', textDecoration: 'none', fontFamily: 'DM Mono', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 400 }}
                >
                  {c.url}
                </a>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(255,255,255,0.2)', fontFamily: 'DM Mono' }}>
                  {formatDate(c.retrievedAt)}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 14, color: '#94A3B8', lineHeight: 1.6 }}>
                {clean(c.snippet)}
              </p>
            </div>
          ))}
        </div>
      </section>

    </article>
  );
}
