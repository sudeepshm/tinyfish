import { useState } from 'react';
import DOMPurify from 'dompurify';
import { startResearch, ApiError } from './api';

const clean = (s: string) => DOMPurify.sanitize(s, { ALLOWED_TAGS: [] });

const SUGGESTIONS = ['Stripe', 'Notion', 'Linear', 'Vercel', 'Figma'];

interface SearchUIProps {
  onJobStarted: (jobId: string, startupName: string) => void;
}

export default function SearchUI({ onJobStarted }: SearchUIProps) {
  const [name, setName]       = useState('');
  const [url, setUrl]         = useState('');
  const [loading, setLoading] = useState(false);
  const [nameErr, setNameErr] = useState('');
  const [apiErr,  setApiErr]  = useState('');

  const handleSubmit = async () => {
    setApiErr('');
    const trimmedName = name.trim();
    if (!trimmedName) { setNameErr('Startup name is required.'); return; }
    setNameErr('');
    setLoading(true);
    try {
      const jobId = await startResearch(trimmedName, url.trim() || undefined);
      onJobStarted(jobId, trimmedName);
    } catch (err) {
      if (err instanceof ApiError) setApiErr(`API error ${err.status}: ${clean(err.message)}`);
      else setApiErr('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void handleSubmit();
  };

  return (
    <div
      style={{ minHeight: '100dvh', background: '#0a0a0f' }}
      className="flex flex-col items-center justify-center px-4 py-16 gap-10"
    >
      {/* Badge */}
      <div
        style={{
          background: '#0f0f1a',
          border: '1px solid #1e1e2e',
          borderRadius: 20,
          padding: '6px 16px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          color: '#c8c8e0',
        }}
      >
        <span
          style={{
            width: 8, height: 8, borderRadius: '50%',
            background: 'linear-gradient(135deg, #7c3aed, #2563eb)',
            display: 'inline-block',
            flexShrink: 0,
          }}
        />
        Powered by TinyFish + Ai
      </div>

      {/* Hero heading */}
      <div className="text-center flex flex-col gap-3" style={{ maxWidth: 560 }}>
        <h1
          style={{ fontSize: 'clamp(2rem, 5vw, 3.25rem)', fontWeight: 800, lineHeight: 1.1, color: '#c8c8e0', margin: 0 }}
        >
          Research any startup{' '}
          <span className="grad-text">in under 20 seconds</span>
        </h1>
        <p style={{ color: '#6b6b8a', fontSize: 16, margin: 0 }}>
          Live web intelligence. Scored signals. Hallucination-flagged reports.
        </p>
      </div>

      {/* Search box */}
      <div style={{ width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Startup name + Research button row */}
        <div
          className="grad-border"
          style={{
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 0,
            overflow: 'hidden',
          }}
        >
          {/* Search icon */}
          <span style={{ paddingLeft: 16, color: '#6b6b8a', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </span>
          <input
            id="startup-name"
            type="text"
            aria-label="Startup name"
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKey}
            placeholder="e.g. Acme Corp"
            disabled={loading}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#c8c8e0',
              fontSize: 15,
              padding: '14px 12px',
              caretColor: '#7c3aed',
            }}
          />
          <button
            type="button"
            onClick={() => { void handleSubmit(); }}
            disabled={loading}
            aria-label={loading ? 'Research in progress…' : 'Research startup'}
            style={{
              flexShrink: 0,
              background: loading ? '#1e1e2e' : 'linear-gradient(135deg, #7c3aed, #2563eb)',
              border: 'none',
              borderRadius: '0 10px 10px 0',
              color: '#fff',
              fontWeight: 700,
              fontSize: 14,
              padding: '0 22px',
              height: 50,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              transition: 'opacity 0.2s',
              whiteSpace: 'nowrap',
            }}
          >
            {loading ? 'Starting…' : 'Research →'}
          </button>
        </div>

        {/* Optional URL input */}
        <input
          id="seed-url"
          type="url"
          aria-label="Seed URL (optional)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Seed URL (optional) — https://example.com"
          disabled={loading}
          style={{
            background: '#0f0f1a',
            border: '1px solid #1e1e2e',
            borderRadius: 8,
            color: '#c8c8e0',
            fontSize: 14,
            padding: '10px 14px',
            outline: 'none',
            width: '100%',
          }}
        />

        {/* Validation / API errors */}
        {nameErr && (
          <p role="alert" style={{ color: '#fca5a5', fontSize: 13, margin: 0 }}>{nameErr}</p>
        )}
        {apiErr && (
          <p role="alert" style={{ color: '#fca5a5', fontSize: 13, margin: 0, textAlign: 'center' }}>{apiErr}</p>
        )}
      </div>

      {/* Suggestion pills */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setName(s)}
            style={{
              background: '#0f0f1a',
              border: '1px solid #1e1e2e',
              borderRadius: 20,
              color: '#6b6b8a',
              fontSize: 13,
              padding: '5px 14px',
              cursor: 'pointer',
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#7c3aed';
              (e.currentTarget as HTMLButtonElement).style.color = '#a78bfa';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#1e1e2e';
              (e.currentTarget as HTMLButtonElement).style.color = '#6b6b8a';
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
