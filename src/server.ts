console.log('Starting server.ts script...');
import 'dotenv/config';
import express from 'express';
import { randomUUID } from 'crypto';
import { runResearchJob } from './orchestrator/index';
import { createSSEStream } from './orchestrator/sse';
import type { ResearchJob } from './types/contracts';
import { getDefaultConfig } from './guards/budget';

const app = express();
app.use(express.json());

// In-memory jobs store for the active session
const jobs = new Map<string, ResearchJob>();

app.post('/api/research', (req, res) => {
  const { startupName, url } = req.body;
  if (!startupName) {
    return res.status(400).send('Startup name is required');
  }

  const jobId = randomUUID();
  const job: ResearchJob = {
    jobId,
    startupName,
    url: url || null,
    userId: 'local-dev-user',
    createdAt: new Date().toISOString(),
    config: getDefaultConfig(),
  };

  jobs.set(jobId, job);
  res.json({ jobId });
});

app.get('/api/research/:jobId/stream', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).send('Job not found');
  }

  // Orchestrator helper configures all SSE headers and write methods
  const sse = createSSEStream(res);

  // Fire-and-forget the pipeline. The orchestrator emits its own status
  // events and returns when done or failed.
  runResearchJob(job, sse)
    .then(() => {
      // Stream is closed manually when pipeline finishes
      sse.close();
    })
    .catch((err) => {
      console.error(`[server] Pipeline threw unexpected error for job ${jobId}`, err);
      sse.send({
        event: 'pipeline_error',
        data: {
          jobId,
          reportId: '',
          status: 'failed',
          error: String(err),
          report: null,
        },
      });
      sse.close();
    });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Live backend listening on port ${PORT} with real AI orchestrator enabled`);
});
