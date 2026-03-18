import { useState } from 'react';
import DOMPurify from 'dompurify';
import SearchUI from './SearchUI';
import Progress from './Progress';
import ReportView from './ReportView';
import type { DueDiligence } from '../types/contracts';

const clean = (s: string) => DOMPurify.sanitize(s, { ALLOWED_TAGS: [] });

type AppState = 'idle' | 'researching' | 'done' | 'error';

export default function App() {
  const [state,       setState]       = useState<AppState>('idle');
  const [jobId,       setJobId]       = useState('');
  const [startupName, setStartupName] = useState('');
  const [report,      setReport]      = useState<DueDiligence | null>(null);
  const [errMsg,      setErrMsg]      = useState('');

  const handleJobStarted = (id: string, name: string) => {
    setJobId(id);
    setStartupName(name);
    setState('researching');
  };

  const handleComplete = (r: DueDiligence) => {
    setReport(r);
    setState('done');
  };

  const reset = () => {
    setState('idle');
    setJobId('');
    setStartupName('');
    setReport(null);
    setErrMsg('');
  };

  return (
    <div style={{ minHeight: '100dvh', background: '#0a0a0f', color: '#c8c8e0', display: 'flex', flexDirection: 'column' }}>

      {/* Top nav — only shown outside the search hero */}
      {state !== 'idle' && (
        <header style={{
          borderBottom: '1px solid #1e1e2e',
          background: '#0f0f1a',
          padding: '0 24px',
        }}>
          <div style={{ maxWidth: 960, margin: '0 auto', padding: '14px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="button"
              onClick={reset}
              aria-label="Back to search"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 10 }}
            >
              <span style={{
                background: 'linear-gradient(135deg, #7c3aed, #2563eb)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em',
              }}>
                TinyFish
              </span>
            </button>
            <span style={{ fontSize: 13, color: '#6b6b8a' }}>VC Research Agent</span>
          </div>
        </header>
      )}

      {/* Main */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: state === 'idle' ? undefined : 'flex-start', padding: state === 'idle' ? 0 : '48px 16px', gap: 32 }}>

        {/* SCREEN 1 — Search hero */}
        {state === 'idle' && (
          <SearchUI onJobStarted={handleJobStarted} />
        )}

        {/* SCREEN 2 — Progress */}
        {state === 'researching' && jobId && (
          <Progress
            jobId={jobId}
            startupName={startupName}
            onComplete={handleComplete}
          />
        )}

        {/* Fallback: researching but no jobId */}
        {state === 'researching' && !jobId && (
          <p role="alert" style={{ color: '#fca5a5', fontSize: 14 }}>
            Invalid job state.{' '}
            <button
              type="button"
              onClick={reset}
              aria-label="Try again"
              style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', textDecoration: 'underline', fontSize: 14 }}
            >
              Try again
            </button>
          </p>
        )}

        {/* SCREEN 3 — Report */}
        {state === 'done' && report && (
          <div style={{ width: '100%', maxWidth: 960, display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={reset}
                aria-label="Research another startup"
                style={{
                  background: '#0f0f1a',
                  border: '1px solid #1e1e2e',
                  borderRadius: 8,
                  color: '#6b6b8a',
                  fontSize: 13,
                  padding: '7px 16px',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s',
                }}
              >
                ← Research another
              </button>
            </div>
            <ReportView report={report} />
          </div>
        )}

        {/* Error screen */}
        {state === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <p role="alert" style={{ color: '#fca5a5', fontSize: 14 }}>
              {clean(errMsg)}
            </p>
            <button
              type="button"
              onClick={reset}
              aria-label="Try again"
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #2563eb)',
                border: 'none', borderRadius: 8,
                color: '#fff', fontWeight: 700, fontSize: 14,
                padding: '10px 24px', cursor: 'pointer',
              }}
            >
              Try again
            </button>
          </div>
        )}

      </main>
    </div>
  );
}
