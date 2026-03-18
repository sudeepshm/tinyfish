// analyst.setup.ts is analogous to scraper.setup.ts — sets env vars before module load.
// Referenced by vitest.config.ts setupFiles.
process.env.GEMINI_API_KEY  = 'test-gemini-key-for-vitest';
process.env.REPORT_HMAC_SECRET = 'test-hmac-secret-for-vitest';
process.env.TINYFISH_API_KEY   = 'test-tinyfish-key-for-vitest'; // kept so scraper tests don't break
