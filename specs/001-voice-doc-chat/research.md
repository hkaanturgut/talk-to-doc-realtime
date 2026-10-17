# Phase 0 Research: Voice Chat with a Document or YouTube Video

**Date**: 2026-10-16 | **Plan**: [plan.md](plan.md) | **Spec**: [spec.md](spec.md)

Each entry: Decision, Rationale, Alternatives considered. Facts were checked against current docs on
2026-10-16; items still unverified are marked **VERIFY IN SPIKE** and have a task that proves them.

## R1. Realtime model and deployment

- **Decision**: Deploy `gpt-realtime-2.1` (version 2026-07-07, GA, Global Standard, 10 capacity units)
  in canadacentral. The model name is a Bicep parameter, so falling back to `gpt-realtime`
  (2025-08-28) is a one-line change.
- **Rationale**: 2.1 is the newest GA full realtime model and specifically improves interruption and
  background-noise handling, which the reviewer script tests ("interrupt, follow up naturally").
  It has its own quota pool (10 of 10 free). Both models are GA in canadacentral.
- **Alternatives**: `gpt-realtime` (what the brief names; older, less natural barge-in);
  `gpt-realtime-2.1-mini` (cheaper and faster, weaker answers on long documents);
  `gpt-realtime-2` (Preview only on Azure).
- **Context limit**: Azure lists 32,000 input / 4,096 output tokens for all realtime models (OpenAI
  lists 128k for 2.1). Plan for **32k** on Azure; the budget is per-provider config (see R6).
  **VERIFY IN SPIKE**: send a ~25k-token instruction and confirm no error.

## R2. Ephemeral token and WebRTC handshake (Azure GA API)

- **Decision**:
  1. Browser calls our `POST /api/session` with a document id.
  2. Server gets an Entra token (`DefaultAzureCredential`, scope `https://ai.azure.com/.default`)
     and calls `POST https://<resource>.openai.azure.com/openai/v1/realtime/client_secrets` with the
     full session config (model = deployment name, instructions with the document, voice, VAD,
     transcription). No `api-version`, no API key.
  3. Server returns `{ value: "ek_...", expires_at }` plus the calls URL to the browser.
  4. Browser creates an `RTCPeerConnection`, mic track, and `oai-events` data channel, and posts its
     SDP offer to `POST .../openai/v1/realtime/calls` (`Content-Type: application/sdp`,
     `Authorization: Bearer ek_...`). The SDP answer comes back as text.
- **Rationale**: This is the documented GA flow (Microsoft Learn "Realtime audio WebRTC", updated
  2026-09-23) and matches OpenAI's shape, so one client works for both providers. Audio goes directly
  browser to model, so our server is not in the audio path (lower latency, cheaper, scales). Building
  instructions on the server means the token is bound to our prompt: a caller cannot mint tokens
  with arbitrary instructions.
- **Token lifetime**: default 600 s (configurable 10 to 7200 via `expires_after`). Expiry only blocks
  *new* connections; a live session continues up to the 60-minute service cap. We use 120 s, since
  the token is used immediately, and our own 15-minute session cap (spec FR-030).
- **Role**: `Cognitive Services OpenAI User` on the Foundry account. Keyless auth breaks if
  `AZURE_OPENAI_API_KEY` is set, so the app never reads that variable.
- **Alternatives**: preview `/realtimeapi/sessions` + regional `realtimeapi-preview` URL (deprecated
  2026-04-30); WebSocket relay through our server (adds latency and server load, needed only for
  server-side tools); OpenAI "unified" multipart flow (Azure support unverified).
- **`?webrtcfilter=on`**: not used. It hides `error`, `response.done`, `session.*` and
  `output_audio_buffer.cleared`, which we need for status, interruption marking, and error handling.
  The only data it protects is the user's own document.
- **VERIFY IN SPIKE**: Learn's WebRTC page names East US 2 / Sweden Central while the region table
  lists canadacentral for all realtime models. The first spike task proves canadacentral works from an
  iPhone; fallback is to redeploy the Foundry account in eastus2 (parameter change).

## R3. Provider toggle (`REALTIME_PROVIDER=azure|openai`)

- **Decision**: A `RealtimeProvider` interface with `createClientSecret(sessionConfig)` and
  `callsUrl`. `azure` uses Entra auth and the resource endpoint; `openai` uses `OPENAI_API_KEY` (server
  only, from Key Vault in Azure) against `api.openai.com/v1/realtime/...`. Default `azure`.
- **Rationale**: The GA request and response shapes are identical, so the toggle is about 40 lines.
  It answers a likely reviewer question ("why not OpenAI directly?") without forking the code.
- **Alternatives**: Azure only (simpler, but Genius may prefer OpenAI); OpenAI only (gives up Managed
  Identity and the "zero keys" story).

## R4. Session behavior (VAD, interruption, transcripts, text mode)

- **Turn detection**: `semantic_vad` with `eagerness: "auto"`, `interrupt_response: true`,
  `create_response: true`. Semantic VAD waits for the user to finish a thought instead of cutting in on
  short pauses, which matters for follow-up questions. `server_vad` stays as a config fallback if
  latency feels too high in testing.
- **Noise**: `audio.input.noise_reduction: { type: "near_field" }` (phone held close).
- **Interruption**: On WebRTC the server truncates unplayed audio automatically when the user speaks
  and emits `output_audio_buffer.cleared`. The client marks the in-progress assistant transcript entry
  as `interrupted` on `input_audio_buffer.speech_started` while the assistant is speaking. No manual
  truncation needed. The Stop button sends `response.cancel` + `output_audio_buffer.clear`.
- **User transcript**: `audio.input.transcription.model` = a `gpt-4o-mini-transcribe` deployment
  (Azure requires a deployment name; quota 600 free). Events:
  `conversation.item.input_audio_transcription.delta` / `.completed` (they can arrive after the
  assistant starts answering, so entries are ordered by `item_id`, not arrival time).
- **Assistant transcript**: `response.output_audio_transcript.delta` / `.done`.
- **Text fallback**: Same realtime session with `output_modalities: ["text"]`, an `oai-events` data
  channel and a receive-only audio transceiver (no microphone needed). Typed turns are sent as
  `conversation.item.create` (`input_text`) + `response.create`; answers stream as
  `response.output_text.delta`. One integration, one model, one security path.
  **VERIFY IN SPIKE**: WebRTC connection with no local audio track on iOS Safari.
- **Alternatives for text**: a separate chat-completions route with another model deployment (second
  integration and prompt to keep in sync; rejected per YAGNI).

## R5. Reconnect and poor network

- **Decision**: Watch `pc.connectionState` and `iceConnectionState`. `disconnected` → 2 s grace period,
  then reconnect; `failed` or data channel `close` → reconnect now. Backoff 1, 2, 4, 8 s, then 8 s
  repeating, until 30 s after the first drop (spec FR-020). `offline` events and data channel `close`
  usually fire before ICE `disconnected`, which keeps "Reconnecting" within the 5 s target. Every attempt fetches a **new** ephemeral token and builds a new peer connection.
  Also react to `window` `online`/`offline` and `visibilitychange`.
- **Context restore**: The client sends the last N finalized transcript turns (capped at ~2,000
  tokens) to `/api/session`, and the server appends them to the instructions as "conversation so far".
  - History is data from the client, so it is escaped and delimited and the prompt marks it as a
    record, not instructions (contract template). The model has no tools, so the worst case is an
    off-topic answer.
  - **Rationale**: Re-injecting assistant turns as `conversation.item.create` with `output_text` is
    unverified in audio sessions; instructions are a documented, predictable path.
- **Alternatives**: ICE restart on the same peer connection (does not survive ephemeral-key expiry or
  server-side session loss); keeping one session alive across drops (not possible once the peer
  connection fails).

## R6. Context budget and truncation

- **Decision**: Token estimate = `ceil(chars / 4)` (good enough for English; conservative for code).
  Document budget per provider: Azure 20,000 tokens (~80,000 chars) of the 32k window. That leaves
  room for instructions (~500), conversation history (≤ 2,000 tokens), and output. The model allows up
  to 4,096 output tokens; we set `max_output_tokens: 1024` because spoken answers are short. OpenAI uses a 90,000-token
  budget. Text beyond the budget is cut at the last paragraph or sentence boundary before the limit. The
  UI shows "Using 42% of this document (pages 1 to 37)". Session `truncation: "auto"` lets the service
  drop old conversation turns, never instructions.
- **Rationale**: Brief excludes chunking and summarization; the beginning of a document usually carries
  the most context; a visible percentage is honest and testable.
- **Alternatives**: a real tokenizer (`tiktoken` WASM, +1 MB and an extra dependency, for an estimate
  that only drives a warning); middle or end truncation (less useful for most documents).

## R7. PDF extraction

- **Decision**: `unpdf` 1.9.x (serverless PDF.js build, worker inlined, typed, gives `totalPages`).
  - **Validation order**: client size check, then server `content-length` check, then `file.size`
    ≤ 25 MB, then magic bytes `%PDF-`.
  - **Password-protected**: catch PDF.js `PasswordException` (code 1 or 2) and return
    `PDF_PASSWORD_PROTECTED`.
  - **Scanned**: fewer than 20 non-whitespace characters per page, averaged over all pages, returns
    `PDF_NO_TEXT`.
  - **Corrupt**: any other parse error returns `PDF_INVALID`.
  - **Timeout and cleanup**: extraction races a 20 s timeout, and `pdf.destroy()` is always called.
  - **Normalization**: collapse whitespace, de-hyphenate line ends, keep page breaks as blank lines.
- **Body limits**: The `content-length` precheck allows 25 MB plus 64 KiB of multipart overhead; the
  exact 25 MB check is on `file.size`. Do **not** add `proxy.ts` (Next 16 middleware). Its `proxyClientMaxBodySize`
  (10 MB default) silently truncates larger bodies. Route handlers have no framework limit, so we
  enforce our own. **VERIFY IN SPIKE**: a 24 MB upload passes ACA ingress.
- **Alternatives**: `pdf-parse` 2.x (pulls a native canvas binary into Docker, no release in a year);
  raw `pdfjs-dist` (worker and bundling work in Next); `mupdf` (AGPL).
- **Scanned-PDF OCR (Azure Document Intelligence `prebuilt-read`)**: deferred, optional stretch.
  The F0 tier reads only the first 2 pages and accepts 4 MB, so a real demo needs S0
  (~$1.50 per 1,000 pages). The brief marks scanned PDFs as an edge case, not a requirement. The
  `PDF_NO_TEXT` message is the required behavior.

## R8. YouTube transcripts

- **Decision**: `TranscriptProvider` interface with a chain:
  1. `direct`: `youtube-transcript-plus` 2.x (innertube player API, language list with
     auto-generated flag, typed errors, overridable fetch).
  2. `supadata` (optional): HTTP API, enabled when `SUPADATA_API_KEY` exists. The key lives in Key
     Vault and reaches the app as an ACA secret reference via managed identity. Free tier is 100
     transcripts/month, enough for review.
  3. **Paste transcript** fallback in the UI (always available).
- **Language choice**: English, then the video's original track, then the first available track; the UI
  shows which language was used. Manual captions are preferred over auto-generated ones.
- **Metadata**: zod-validated title and channel from oEmbed (`https://www.youtube.com/oembed?url=...&format=json`, no
  key); duration from the last caption segment's end time.
- **URL parsing**: `new URL()`. Accepted hosts: `youtube.com`, `www.`, `m.`, `music.`, `youtu.be`,
  `youtube-nocookie.com`. Accepted paths: `/watch?v=`, `youtu.be/ID`, `/shorts/ID`, `/embed/ID`,
  `/live/ID`, `/v/ID`. The ID must match `^[A-Za-z0-9_-]{11}$`. Extra parameters (`t`, `list`, `si`)
  are ignored.
- **Cloud IP blocking**: YouTube blocks most datacenter IPs (`LOGIN_REQUIRED`, "confirm you're not a
  bot", 429, or empty 200s needing a PoToken). Azure egress is almost certainly affected, so the
  hosted app relies on step 2 or 3, and the README explains this.
- **Alternatives**: a residential proxy (Webshare about $3.50/GB, extra secret and moving part, still
  hit by PoToken checks); `youtubei.js` (heavy, transcript API broke in 2025); `youtube-transcript`
  (open "blocked in production" issues); YouTube Data API (captions only for videos you own).
- **Timebox**: deployed bonus is limited to one session (about 2 h). If Supadata fails, ship paste-only and document it.

## R9. Web stack

- **Decision**: Next.js 16.4 (App Router, `output: "standalone"`, Turbopack default), React 19.3,
  TypeScript **6.0.x** pinned (TS 7 native compiler compatibility with Next unverified), Tailwind CSS 4.3,
  zod 4.x, Node **24 LTS** (`node:24-slim` image, glibc).
- **Next 16 notes**: `params`/`headers()` are async; `next lint` removed (ESLint flat config directly);
  no `middleware.ts`/`proxy.ts` (see R7); route handlers use `export const runtime = "nodejs"`.
- **State**: Plain React state + a small reducer in the `useVoiceSession` hook. No global store library.
- **Alternatives**: Remix / Vite + Express (brief recommends Next; one deployable is simpler); Edge
  runtime (no Managed Identity, no PDF.js).

## R10. Server-side state and scaling

- **Decision**: In-memory `DocumentStore` (Map + 60-minute idle TTL + LRU cap 200 documents / 300 MB
  text). The ACA ingress uses **sticky sessions** (cookie affinity, single revision mode).
  `minReplicas: 1` (no cold start during review), `maxReplicas: 3`. Rate limiter is per replica
  (in-memory token bucket keyed by client IP from `x-forwarded-for`).
- **Rationale**: The brief allows in-memory storage. Sticky sessions keep a visitor on the replica
  that holds their document, and a lost document (replica restart) shows "Please load the document
  again". The `DocumentStore` interface lets Redis replace the Map later without touching routes.
  This is the scaling story for the walkthrough.
- **Alternatives**: SQLite on an ACA volume (no benefit for 60-minute data); Azure Cache for Redis
  (cost and setup beyond the brief); sending the full text from the client on every session request
  (larger payloads on mobile, and lets a client put arbitrary text into the instructions).

## R11. Infrastructure, identity and CI/CD

- **Decision**: `azd` 1.36 + Bicep using Azure Verified Modules. Resources, all in `rg-<env>`,
  canadacentral:
  - Log Analytics workspace and Application Insights (`disableLocalAuth`; ingestion via Entra with the
    managed identity and **Monitoring Metrics Publisher**).
  - User-assigned managed identity, with roles **AcrPull** (ACR), **Cognitive Services OpenAI User**
    (Foundry account), **Key Vault Secrets User** (Key Vault) and **Monitoring Metrics Publisher**
    (App Insights).
  - Container Registry (Basic).
  - Container Apps environment (Consumption) and container app `web`: port 3000, `AZURE_CLIENT_ID` set
    to the identity's client id, sticky sessions, min 1 / max 3 replicas, HTTP scale rule.
  - Foundry account (`AIServices`, custom subdomain, `disableLocalAuth: true`, own `foundryLocation`
    parameter defaulting to `location`, so it can move to eastus2 alone) with deployments
    `gpt-realtime-2.1` (capacity 10) and `gpt-4o-mini-transcribe` (capacity 50).
  - Key Vault (RBAC mode), holding optional `supadata-api-key` and `openai-api-key`. Each is wired to
    the container app as a Key Vault secret reference only when its parameter flag is on.
  - The deploying user also gets **Cognitive Services OpenAI User** so local `az login` dev works.
- **CI**: `ci.yml` on PRs runs lint, typecheck, Vitest, `next build`, Playwright (WebKit iPhone and
  Chromium Pixel profiles), and gitleaks via the binary. No license is needed on a personal repo.
  `deploy.yml` runs on push to `main` (and manual dispatch): `Azure/setup-azd@v2`,
  `azd auth login --federated-credential-provider github`, `azd provision`, `azd deploy`.
  Federated credentials and repo variables come from `azd pipeline config` (OIDC, no secrets in
  GitHub). Subject uses the environment claim.
- **Observability**: `@azure/monitor-opentelemetry` via `src/instrumentation.ts` (Next requires it
  inside `src/` with this layout; Node runtime only). Credential is `DefaultAzureCredential`, which
  picks the user-assigned identity from `AZURE_CLIENT_ID` in Azure and `az login` locally. Custom events: `document_ingested` (type, size, truncated), `session_created`,
  `session_failed` (error code). Unexpected server errors are recorded as exceptions with route and
  error code. Never log document text, history, or tokens.
  Microsoft now also offers `@microsoft/opentelemetry`; we chose the long-standing distro with more
  Next.js community examples. **VERIFY IN SPIKE**: Next 16 bundling with `serverExternalPackages`.
- **Alternatives**: Terraform (azd OIDC pipeline config not supported for Terraform); Static Web Apps
  (managed functions are limited for long uploads and MI token minting; owner chose ACA); App Service
  (fine, but ACA gives scale rules and revisions, and owner chose it).

## R12. Security controls

- **Headers**:
  - CSP `default-src 'self'`.
  - `connect-src 'self' https://*.openai.azure.com https://api.openai.com`. This is a static
    allowlist because `next.config.ts` headers are fixed at build time and the remote Docker build has
    no endpoint env. A wildcard on the provider's own domain is an acceptable trade-off; a nonce-based
    runtime CSP would need `proxy.ts`.
  - `media-src 'self' blob:`.
  - `Permissions-Policy: microphone=(self)`.
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
- **Inputs**: every route validates with zod. Uploads are limited to 25 MB and checked for the PDF
  type. Pasted text is capped at 400,000 chars. YouTube URLs are host-allowlisted, which prevents SSRF:
  the server only calls fixed YouTube and Supadata hosts, never a user-supplied host.
- **Prompt injection**: document text is wrapped in clear delimiters and the instructions tell the model
  to treat it as reference data, not commands. The model has no tools, so injected text cannot trigger
  actions; the residual risk is off-topic answers, which is documented.
- **Abuse**: session starts are limited to 10 per minute per IP, and ingest to 20 per minute per IP.
  The client IP is the **last** `x-forwarded-for` entry (appended by the ACA ingress), not the first,
  which a client can spoof. Limits are per replica (≤ 3), so the effective cap is at most 3x; this is
  documented, and a shared store (Redis) is the fix if needed.
  The 15-minute session cap bounds cost per session. It is enforced in the client (not reset by
  reconnects); a modified client could hold a session up to the service's 60-minute cap. This is
  documented as a known limitation, since a server-side cap would require relaying the session.
- **Secrets**: none in the client, none in git; `.env.example` only; gitleaks in CI and before the
  repo goes public.

## R13. Testing strategy

- **Unit (Vitest)**: URL parser (table of formats), text normalizer, budget/truncation, error mapping,
  rate limiter, document store TTL, instruction builder, realtime event reducer (transcript ordering,
  interruption marking), reconnect backoff schedule.
- **Integration (Vitest, real route handlers with `Request` objects)**: `/api/ingest/pdf` with fixture
  PDFs (normal, encrypted, scanned, corrupt, oversize), `/api/ingest/youtube` with a fake provider,
  `/api/session` with a fake `RealtimeProvider` (asserts no key leaks and instructions contain the doc).
- **E2E (Playwright, iPhone 15 WebKit + Pixel 7 Chromium)**: upload, preview, start session with a
  mocked realtime transport (fake data-channel events), mute/stop, mic-denied fallback, reconnect
  banner. Real audio is not automated, so a manual checklist covers it (quickstart.md).
- **Fixtures**: generated by a script (`tests/fixtures/make-fixtures.ts`), no binary blobs of unknown
  origin.

## R14. Architecture diagram

- **Decision**: Diagrams as code with Python `diagrams` 0.25 (Graphviz) in `docs/architecture/diagram.py`,
  using `Custom` nodes with icons from the official **Azure Architecture Icons V24** set (includes
  Foundry) and official brand assets for Next.js, OpenAI, YouTube and GitHub. Rendered to SVG and PNG
  in the same folder. Plus a Mermaid sequence diagram of the session handshake in the README.
- **Rationale**: reviewable in PRs, reproducible, explainable in the walkthrough. Icon terms allow use
  in architecture docs, with no cropping or distortion and the product name next to each icon.
- **Alternatives**: draw.io (better manual layout, poor diffs).
