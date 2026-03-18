import { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import { subscribeToJob } from './api';
import type { DueDiligence, OrchestratorResult } from '../types/contracts';

interface ProgressProps {
  jobId: string;
  startupName: string;
  onComplete: (report: DueDiligence) => void;
}

type StageId = 'queued' | 'scraping' | 'validating' | 'analysing' | 'done';
type StageStatus = 'waiting' | 'active' | 'done' | 'error';

interface StageConfig {
  id: StageId;
  label: string;
  subtitle: string;
}

const STAGE_CONFIG: StageConfig[] = [
  { id: 'queued',     label: 'Rate limit check',  subtitle: 'Verifying request quotas' },
  { id: 'scraping',   label: 'Parallel scraping',  subtitle: 'Fetching live web signals' },
  { id: 'validating', label: 'Signal validation',  subtitle: 'Filtering & deduplicating data' },
  { id: 'analysing',  label: 'Gemini analysis',    subtitle: 'Streaming AI due diligence' },
  { id: 'done',       label: 'Report ready',       subtitle: 'All done — building view' },
];

const STAGE_IDS = STAGE_CONFIG.map((s) => s.id);

function stageStatus(stageId: StageId, current: StageId, failed: boolean): StageStatus {
  const iCurrent = STAGE_IDS.indexOf(current);
  const iStage   = STAGE_IDS.indexOf(stageId);
  if (failed && iStage === iCurrent) return 'error';
  if (iStage < iCurrent) return 'done';
  if (iStage === iCurrent) return 'active';
  return 'waiting';
}

export default function Progress({ jobId, startupName, onComplete }: ProgressProps) {
  const [current,   setCurrent]   = useState<StageId>('queued');
  const [failed,    setFailed]    = useState(false);
  const [errMsg,    setErrMsg]    = useState('');
  const [elapsed,   setElapsed]   = useState(0);

  // Elapsed timer
  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const cleanup = subscribeToJob(
      jobId,
      (evt) => {
        const data = evt.data as OrchestratorResult;
        if (evt.event === 'pipeline_error' || data.status === 'failed') {
          setFailed(true);
          setErrMsg(
            DOMPurify.sanitize(data.error ?? 'An unknown error occurred', { ALLOWED_TAGS: [] }),
          );
          return;
        }
        const status = data.status as StageId;
        if (STAGE_IDS.includes(status)) setCurrent(status);
        if (evt.event === 'done' && data.report) {
          setCurrent('done');
          onComplete(data.report);
        }
      },
      (err) => {
        setFailed(true);
        setErrMsg(DOMPurify.sanitize(err.message, { ALLOWED_TAGS: [] }));
      },
    );
    return cleanup;
  }, [jobId, onComplete]);

  const initial = startupName ? startupName[0].toUpperCase() : '?';

  return (
    <div
      style={{ width: '100%', maxWidth: 520, position: 'relative', zIndex: 1 }}
      className="mx-auto flex flex-col gap-5"
      aria-live="polite"
    >
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(124, 58, 237, 0.6); }
          50%      { opacity: 0.8; box-shadow: 0 0 0 6px rgba(124, 58, 237, 0); }
        }
        .active-dot {
          width: 10px; height: 10px;
          background: #7C3AED;
          border-radius: 50%;
          animation: pulse 1.4s ease-in-out infinite;
        }
        .active-stage-card {
          background: #0E1117 !important;
          border: 1px solid transparent !important;
          background-clip: padding-box !important;
          box-shadow: 0 0 0 1px rgba(124, 58, 237, 0.6), 0 0 20px rgba(124, 58, 237, 0.15) !important;
        }
        .active-text {
          background: linear-gradient(90deg, #A78BFA, #60A5FA);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
      `}</style>

      {/* Header row: avatar + name + elapsed + ETA */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Gradient avatar */}
        <div
          style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: 'linear-gradient(135deg, #7C3AED, #3B82F6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 20, color: '#fff',
          }}
        >
          {initial}
        </div>

        {/* Name + subtitle */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#E2E8F0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {DOMPurify.sanitize(startupName, { ALLOWED_TAGS: [] })}
          </div>
          <div style={{ fontSize: 13, color: '#64748B' }}>
            Research started · {elapsed}s ago
          </div>
        </div>

        {/* ETA right */}
        <div style={{ fontSize: 13, color: '#64748B', flexShrink: 0, textAlign: 'right' }}>
          ~20s est.
        </div>
      </div>

      {/* Stage list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {STAGE_CONFIG.map(({ id, label, subtitle }) => {
          const s = stageStatus(id, current, failed);
          const isActive = s === 'active';
          return (
            <div
              key={id}
              className={isActive ? 'active-stage-card' : ''}
              style={{
                background: '#0E1117',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 12,
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                transition: 'all 0.3s ease',
                opacity: s === 'waiting' ? 0.4 : 1,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* Dot indicator */}
                <span style={{ flexShrink: 0, width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {s === 'done' && (
                    <span style={{ 
                      display: 'flex', alignItems: 'center', justifyContent: 'center', 
                      width: 14, height: 14, borderRadius: '50%', background: '#22C55E', 
                      color: '#fff', fontSize: 7, fontWeight: 'bold' 
                    }}>✓</span>
                  )}
                  {s === 'error' && (
                    <span style={{ color: '#EF4444', fontSize: 16, lineHeight: 1 }}>✕</span>
                  )}
                  {isActive && (
                    <div className="active-dot" />
                  )}
                  {s === 'waiting' && (
                    <span style={{ display: 'block', width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
                  )}
                </span>

                {/* Label */}
                <span 
                  className={isActive ? 'active-text' : ''}
                  style={{
                    fontSize: 14,
                    fontWeight: isActive ? 700 : 500,
                    color: s === 'done' ? '#22C55E' : s === 'error' ? '#EF4444' : '#E2E8F0',
                    flex: 1,
                  }}
                >
                  {label}
                </span>

                {/* Subtitle */}
                <span style={{ fontSize: 12, color: '#64748B' }}>
                  {subtitle}
                </span>
              </div>

              {/* Progress bar for active stage */}
              {isActive && (
                <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1, overflow: 'hidden' }}>
                  <div
                    className="bar-fill"
                    style={{ height: '100%', background: 'linear-gradient(90deg, #7C3AED, #3B82F6)', borderRadius: 1 }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Error message */}
      {failed && errMsg && (
        <p role="alert" style={{ color: '#EF4444', fontSize: 13, textAlign: 'center', margin: 0 }}>
          {errMsg}
        </p>
      )}
    </div>
  );
}
