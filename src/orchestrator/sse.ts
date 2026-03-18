import type { ServerResponse } from 'http';
import type { SSEEvent } from '../types/contracts';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SSESender = {
  send:  (event: SSEEvent) => void;
  close: () => void;
};

// ─── SSE headers ──────────────────────────────────────────────────────────────

const SSE_HEADERS: Record<string, string> = {
  'Content-Type':      'text/event-stream',
  'Cache-Control':     'no-cache',
  'Connection':        'keep-alive',
  'X-Accel-Buffering': 'no',
};

// ─── Internal write helper ────────────────────────────────────────────────────

/**
 * Writes raw text to either a Node.js ServerResponse or a WHATWG Response
 * controller. The dual-type here lets the orchestrator run in both Express (Node)
 * and edge-runtime (Web Streams) contexts without forking logic.
 */
function writeToStream(
  res: Response | ServerResponse,
  str: string,
): void {
  if (typeof (res as ServerResponse).write === 'function') {
    // Node.js http.ServerResponse (Express / Next.js API routes)
    (res as ServerResponse).write(str);
  }
  // Web Streams variant: callers enqueue via a TransformStream controller
  // passed alongside the Response; this module handles the Node path only.
}

function setHeaders(res: Response | ServerResponse): void {
  if (typeof (res as ServerResponse).writeHead === 'function') {
    (res as ServerResponse).writeHead(200, SSE_HEADERS);
  }
}

// ─── Exported factory ─────────────────────────────────────────────────────────

/**
 * Wraps an HTTP response as an SSE sender.
 * Sets required streaming headers and provides typed send/close helpers.
 */
export function createSSEStream(res: Response | ServerResponse): SSESender {
  setHeaders(res);

  const send = (event: SSEEvent): void => {
    const line = `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
    writeToStream(res, line);
  };

  const close = (): void => {
    if (typeof (res as ServerResponse).end === 'function') {
      (res as ServerResponse).end();
    }
  };

  return { send, close };
}
