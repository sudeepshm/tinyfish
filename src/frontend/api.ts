import type { SSEEvent } from '../types/contracts';

// ─── Error class ──────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

// ─── API functions ────────────────────────────────────────────────────────────

/**
 * Starts a new research job. Returns the jobId from the orchestrator.
 */
export async function startResearch(startupName: string, url?: string): Promise<string> {
  const res = await fetch('/api/research', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startupName, url: url ?? null }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new ApiError(res.status, text);
  }

  const data = (await res.json()) as { jobId: string };
  return data.jobId;
}

/**
 * Subscribes to live SSE progress for a job.
 * Returns a cleanup function — call it on component unmount.
 */
export function subscribeToJob(
  jobId: string,
  onEvent: (e: SSEEvent) => void,
  onError: (e: Error) => void,
): () => void {
  const source = new EventSource(`/api/research/${jobId}/stream`);

  source.onmessage = (msg: MessageEvent<string>) => {
    try {
      const parsed = JSON.parse(msg.data) as SSEEvent;
      onEvent(parsed);
    } catch {
      onError(new Error(`Failed to parse SSE payload: ${msg.data}`));
    }
  };

  source.addEventListener('status',   (e: MessageEvent<string>) => {
    try { onEvent({ event: 'status', data: JSON.parse(e.data) } as SSEEvent); } catch { /* ignore */ }
  });
  source.addEventListener('progress', (e: MessageEvent<string>) => {
    try { onEvent({ event: 'progress', data: JSON.parse(e.data) } as SSEEvent); } catch { /* ignore */ }
  });
  source.addEventListener('done',     (e: MessageEvent<string>) => {
    source.close();
    try { onEvent({ event: 'done', data: JSON.parse(e.data) } as SSEEvent); } catch { /* ignore */ }
  });
  source.addEventListener('pipeline_error', (e: MessageEvent<string>) => {
    source.close();
    try { onEvent({ event: 'pipeline_error', data: JSON.parse(e.data) } as SSEEvent); } catch { /* ignore */ }
  });

  source.onerror = () => {
    source.close();
    onError(new Error('SSE connection error'));
  };

  return () => source.close();
}
