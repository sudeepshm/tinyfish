import Redis from 'ioredis';
import { randomUUID } from 'crypto';

const redis = new Redis();

const dummyReport = {
  reportId: randomUUID(),
  jobId: randomUUID(),
  startupName: 'Vercel',
  generatedAt: new Date().toISOString(),
  teamScore: { raw: 85, confidence: 0.9, signals: ['Strong engineering history'] },
  techScore: { raw: 92, confidence: 0.95, signals: ['Next.js ecosystem dominance'] },
  marketScore: { raw: 75, confidence: 0.8, signals: ['Highly competitive PaaS space'] },
  overallScore: { raw: 84, confidence: 0.88, signals: ['Solid growth trajectory'] },
  signals: [
    { metric: 'github_stars', sources: [{}], median: 120000, stdDev: 0, spikeFlag: false, confidence: 0.99, excludedFromScore: false },
    { metric: 'linkedin_headcount', sources: [{}], median: 1400, stdDev: 0, spikeFlag: true, confidence: 0.9, excludedFromScore: true },
  ],
  hallucFlags: [
    { claim: 'Vercel acquired Acme Corp', reason: 'No news sources confirm this', severity: 'medium' }
  ],
  sourceCitations: [
    { url: 'https://github.com/vercel', platform: 'github', retrievedAt: new Date().toISOString(), snippet: 'We develop Next.js.' },
    { url: 'https://linkedin.com/company/vercel', platform: 'linkedin', retrievedAt: new Date().toISOString(), snippet: 'The platform for frontend developers.' }
  ],
  hmacSignature: 'dummy_sig',
  piiRedacted: true
};

async function seed() {
  await redis.set('report:vercel', JSON.stringify(dummyReport), 'EX', 3600);
  console.log('Successfully seeded Redis with dummy report for Vercel');
  process.exit(0);
}

seed().catch(console.error);
