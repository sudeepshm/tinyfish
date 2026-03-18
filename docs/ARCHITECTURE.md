# Architecture & Pipeline Design

TinyFish is built around a secure, multi-stage pipeline designed for reliable data extraction and high-confidence AI analysis.

## 1. Request Handling & SSE Context
- **Endpoint**: `POST /api/research` starts a job and returns a `jobId`.
- **Streaming**: `GET /api/research/:jobId/stream` opens a Server-Sent Events (SSE) connection. All progress updates and the final report are streamed over this single connection.

## 2. The Research Pipeline (`runResearchJob`)

### Stage 1: Rate Limiting & Capacity
Before any activity, the orchestrator checks:
- **User Rate Limits**: Prevents abuse by limiting jobs per hour.
- **Global Cost Ceiling**: Monitors total API spend (Gemini/Scraper) in real-time.

### Stage 2: URL Discovery
Using the `startupName`, the system generates candidate URLs:
- **Slugification**: Converts "Acme Corp" → `acme-corp`.
- **Platform Mapping**: Constructs LinkedIn, GitHub, and Crunchbase URLs based on patterns.

### Stage 3: Scraper Agent (`scrapeMultiple`)
- **Concurrency**: Fetches multiple candidate URLs in parallel for speed.
- **TinyFish API**: Primary scraper using a headless browser service.
- **Direct Fallback**: If the primary scraper fails, the system attempts a direct HTTP fetch to ensure maximum uptime.

### Stage 4: Signal Extraction (`validateBundles`)
Scraped HTML content is parsed into structured **Signal Bundles**.
- **Normalization**: Metrics like "GitHub Stars" are extracted and normalized.
- **Confidence Scoring**: Signals are assigned confidence scores based on source reliability.

### Stage 5: AI Analyst Agent (`analyseStartup`)
The core intelligence stage.
- **Context Injection**: Structured signal data (no raw HTML) is fed to `gemini-2.5-flash`.
- **System Guardrails**: Hard instructions for source attribution and "PII first" processing.
- **Streaming Response**: Gemini's output is streamed token-by-token directly to the frontend via SSE.

### Stage 6: Security & Post-Processing
- **PII Scrubbing**: Regex-based redactor strips emails, phone numbers, and physical addresses from the report.
- **HMAC Signing**: The entire report payload is signed with a deterministic SHA256 digest to prevent metadata tampering.

---

## 🔒 Security Summary (OWASP LLM Top 10)
- **Prompt Injection (LLM01)**: Hard-coded system prompt enforces strict rules on output format and behavior.
- **Excessive Agency (LLM08)**: Scrapers only read; no write access. Pipelines have global hard timeouts.
- **PII Leakage (LLM06)**: Recursive scrubbing on all user-visible fields before returning data.
