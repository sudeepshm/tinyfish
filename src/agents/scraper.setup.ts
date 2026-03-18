// Test setup: inject env vars before any module is loaded by the test runner.
// This file is referenced by vitest.config.ts setupFiles for scraper tests.
process.env.TINYFISH_API_KEY = 'test-api-key-for-vitest';
