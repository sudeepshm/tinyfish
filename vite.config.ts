import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001'
    }
  },
  test: {
    // analyst.setup.ts sets ALL three env vars (ANTHROPIC_API_KEY, REPORT_HMAC_SECRET,
    // TINYFISH_API_KEY) so it supersedes scraper.setup.ts for all suites.
    setupFiles: ['./src/agents/analyst.setup.ts'],
    environment: 'node',
  },
});
