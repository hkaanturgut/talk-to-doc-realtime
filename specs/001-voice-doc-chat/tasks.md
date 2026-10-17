---
description: "Task list for 001-voice-doc-chat"
---

# Tasks: Voice Chat with a Document or YouTube Video

**Input**: Design documents from `/specs/001-voice-doc-chat/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Included. Constitution Principle IV requires unit tests for logic, integration tests for API
routes, and Playwright mobile tests for critical flows. Write each test first and see it fail.

**Sizing**: Every task fits a 30 to 90 minute session and ends with `main` green and deployable
(Principle VII). Commit per task; open one PR per checkpoint.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1 to US4 from [spec.md](spec.md)
- Paths follow the single-project layout in [plan.md](plan.md#project-structure)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Runnable, linted, tested empty app.

- [X] T001 Scaffold the Next.js 16.4 App Router app with TypeScript 6.0 (`strict: true`,
  `noUncheckedIndexedAccess: true`), Tailwind CSS 4.3, `output: "standalone"`, and Node 24 `engines`.
  Files: `package.json`, `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`,
  `src/app/globals.css`. Add `.nvmrc` (24).
- [X] T002 [P] Configure ESLint flat config, including `no-restricted-imports`: `src/client`,
  `src/components` and `src/hooks` may not import `src/server`. Add Prettier and `npm run lint`,
  `npm run typecheck`, `npm run format`. Files: `eslint.config.mjs`, `.prettierrc`.
- [X] T003 [P] Configure Vitest 5 (node environment for `tests/unit` and `tests/integration`, jsdom for
  component tests) with a smoke test. Files: `vitest.config.ts`, `tests/unit/smoke.test.ts`.
- [X] T004 [P] Configure Playwright 1.64 with `iPhone 15` (WebKit) and `Pixel 7` (Chromium) projects
  and a `webServer` that runs `next start`. Add a smoke test that loads `/` at 390px with no horizontal
  scroll. Files: `playwright.config.ts`, `tests/e2e/smoke.spec.ts`.
- [X] T005 [P] Add `GET /api/health` returning `{status:"ok", version}` (version from `GIT_SHA` env)
  in `src/app/api/health/route.ts`, plus an integration test in `tests/integration/health.test.ts`.

- [X] T006 Commit `.github/workflows/ci.yml` (on PR and push to `main`): `npm ci`, lint, typecheck,
  `npm test`, `next build`. Then add these four as required status checks on `main`, so from here on
  every change lands through a PR with passing checks (Constitution VII).

**Checkpoint**: CI is green on the first PR. PR #1 of the build.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Deployed HTTPS URL, CI/CD, config, error catalog, shared schemas. The iPhone voice spike
(US1) needs HTTPS, so deployment comes before any feature.

**⚠️ CRITICAL**: No user story work begins until this phase is complete.

### Container and infrastructure

- [X] T007 Write a multi-stage `Dockerfile` (`node:24-slim`, `npm ci`, `next build`, standalone
  runtime, non-root user, port 3000, `HEALTHCHECK` on `/api/health`) and `.dockerignore`.
- [X] T008 Write `infra/main.bicep` (subscription scope: resource group `rg-${environmentName}`, tags
  incl. `azd-env-name`) and `infra/main.parameters.json` (`environmentName`, `location` default
  `canadacentral`, `principalId`, `realtimeModelName` default `gpt-realtime-2.1`,
  `realtimeModelVersion` default `2026-07-07`, `realtimeCapacity` default 10, `foundryLocation`
  default `location`, `enableSupadata` and `enableOpenAi` flags default `false`). Add
  `infra/abbreviations.json`.
- [X] T009 Write `infra/resources.bicep` with AVM modules:
  - observability: Log Analytics `operational-insights/workspace:0.16.1` and App Insights
    `insights/component:0.8.0` (`disableLocalAuth: true`);
  - identity and registry: user-assigned identity `managed-identity/user-assigned-identity:0.6.0` and
    ACR Basic `container-registry/registry:0.13.1`;
  - Key Vault `key-vault/vault:0.14.2` (RBAC mode);
  - Foundry `cognitive-services/account:0.19.1` (kind `AIServices`, `customSubDomainName`,
    `disableLocalAuth: true`, deployments for the realtime model and `gpt-4o-mini-transcribe`
    `2025-12-15` capacity 50, GlobalStandard);
  - outputs.
- [X] T010 Add the Container Apps environment `app/managed-environment:0.16.0` (Consumption, logs to
  Log Analytics) and container app `app/container-app:0.23.0` to `infra/resources.bicep`:
  - identity and registry: tag `azd-service-name: web`, UAMI attached, registry via UAMI;
  - ingress: external, port 3000, `stickySessions.affinity: sticky`, single revision mode;
  - scaling: min 1, max 3, HTTP rule 30 concurrent;
  - env: `AZURE_CLIENT_ID`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_REALTIME_DEPLOYMENT`,
    `AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT`, `APPLICATIONINSIGHTS_CONNECTION_STRING`,
    `REALTIME_PROVIDER=azure`.
- [X] T011 Add role assignments to `infra/resources.bicep`:
  - UAMI gets AcrPull (ACR), Cognitive Services OpenAI User (Foundry), Key Vault Secrets User (KV)
    and Monitoring Metrics Publisher (App Insights);
  - `principalId` (the deploying user) gets Cognitive Services OpenAI User (Foundry) for local dev;
  - outputs `SERVICE_WEB_URI`, `AZURE_OPENAI_ENDPOINT`, deployment names, `AZURE_KEY_VAULT_NAME`.
- [X] T012 Write `azure.yaml` (service `web`, `project: .`, `language: ts`, `host: containerapp`,
  `docker.remoteBuild: true`). Run `azd up` into the sponsor subscription
  (chosen with `azd env new --subscription`, never committed; canadacentral) and verify quickstart §1: health 200 over
  HTTPS, both model deployments present, local auth disabled.
- [X] T013 Run `azd pipeline config` (GitHub Actions, OIDC federated credential, no client secret)
  against `hkaanturgut/talk-to-doc-realtime`. Commit `.github/workflows/deploy.yml`: on push to `main`
  and on `workflow_dispatch`; `permissions: id-token: write, contents: read`; `Azure/setup-azd@v2`;
  `azd provision --no-prompt`; `azd deploy --no-prompt`; `GIT_SHA` passed to the build.
- [X] T014 [P] Extend `.github/workflows/ci.yml` with a Playwright job (install WebKit + Chromium)
  and a gitleaks job (binary, full history, `fetch-depth: 0`). After the first green run, add both as
  required checks on `main`.

### Shared application foundation

- [X] T015 [P] Implement zod-validated env in `src/server/config/env.ts`:
  - fields: `REALTIME_PROVIDER` (`azure|openai`, default `azure`), Azure endpoint and deployment names,
    optional `OPENAI_API_KEY`, `OPENAI_REALTIME_MODEL`, optional `SUPADATA_API_KEY`,
    `APPLICATIONINSIGHTS_CONNECTION_STRING`;
  - fail fast with a clear message; never log values; refuse to start if `AZURE_OPENAI_API_KEY` is
    set (research R2);
  - unit test in `tests/unit/env.test.ts`; update `.env.example` to match.
- [X] T016 [P] Implement the error catalog in `src/shared/errors.ts`:
  - `ErrorCode` union exactly as in [contracts/api.md](contracts/api.md#error-codes);
  - `AppError` class with `code`, `status`, `retryable`;
  - user messages in `src/shared/messages.ts`;
  - unit test that every code has a message in `tests/unit/errors.test.ts`.
- [X] T017 [P] Implement shared zod schemas in `src/shared/schemas.ts`: `PreviewDTO`,
  `SessionRequest` (history ≤ 40 items, ≤ 8,000 chars total), `SessionResponse`, `ErrorBody`, `kind`
  enum `"pdf" | "youtube" | "text"`.
- [X] T018 Implement HTTP helpers in `src/server/http/`:
  - `respond.ts` maps `AppError` and zod errors (`INVALID_REQUEST`) and unknown errors to `ErrorBody`,
    never leaking stack traces; unknown and 5xx errors are recorded with `trackException(err, {route,
    code})` from T020 (Constitution V);
  - `client-ip.ts` reads the **last** `x-forwarded-for` entry (appended by the ACA ingress; the first
    entry is client-controlled);
  - `rate-limit.ts` is an in-memory token bucket;
  - unit tests in `tests/unit/http.test.ts`, including bucket refill and 429 after the limit.
- [X] T019 [P] Implement `DocumentStore` in `src/server/documents/store.ts`:
  - interface plus in-memory implementation: 60-minute idle TTL refreshed on read, LRU eviction above
    200 documents or 300 MB, injectable clock;
  - export a singleton via `src/server/documents/index.ts`;
  - unit tests in `tests/unit/document-store.test.ts`.
- [X] T020 [P] Add OpenTelemetry bootstrap:
  - `src/instrumentation.ts` imports `src/server/telemetry.ts` only when `NEXT_RUNTIME === "nodejs"`;
  - `@azure/monitor-opentelemetry` uses `DefaultAzureCredential` (picks the UAMI from
    `AZURE_CLIENT_ID` in Azure, `az login` locally) and is a no-op without a connection string;
  - add the package to `serverExternalPackages`;
  - helpers `trackEvent(name, props)` and `trackException(err, props)` with an allowlist of property
    keys (no document text, history, or tokens).
- [X] T021 Add security headers in `next.config.ts` `headers()`:
  - CSP `default-src 'self'`, static `connect-src 'self' https://*.openai.azure.com
    https://api.openai.com` (headers are fixed at build time; research R12), and
    `media-src 'self' blob:`;
  - `Permissions-Policy: microphone=(self)`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
    `X-Frame-Options: DENY`;
  - e2e assertion in `tests/e2e/smoke.spec.ts`.

**Checkpoint**: The deployed URL serves the empty app over HTTPS. CI runs on PRs and deploys on merge.
Foundation is ready.

---

## Phase 3: User Story 1 - Talk to a PDF by voice on a phone (Priority: P1) 🎯 MVP

**Goal**: Upload a PDF, see the preview, hold a voice conversation with barge-in, live transcript,
mute and stop.

**Independent Test**: quickstart M1 to M6 and M12 to M14 on a real iPhone against the deployed URL.

### 3a. Voice spike (riskiest first)

- [X] T022 [US1] Implement the `RealtimeProvider` interface and factory in
  `src/server/realtime/provider.ts`, and the Azure provider in `src/server/realtime/azure.ts`:
  - get the token with `DefaultAzureCredential` and scope `https://ai.azure.com/.default`;
  - call `POST {endpoint}/openai/v1/realtime/client_secrets` with
    `expires_after.seconds: 120`;
  - zod-parse `{value, expires_at}`;
  - map upstream 401/403 to `REALTIME_AUTH` and 429/5xx to `REALTIME_UNAVAILABLE`.
- [X] T023 [P] [US1] Implement `src/server/realtime/session-config.ts`, which builds the session
  object per [contracts/realtime-events.md](contracts/realtime-events.md):
  - voice mode: `semantic_vad` eagerness `auto`, `interrupt_response: true`, `near_field` noise
    reduction, transcription deployment, voice `marin`, `truncation: "auto"`,
    `max_output_tokens: 1024`;
  - text mode: `output_modalities: ["text"]`, `turn_detection: null`;
  - unit tests in `tests/unit/session-config.test.ts`.
- [X] T024 [P] [US1] Implement the OpenAI provider in `src/server/realtime/openai.ts` (`POST
  https://api.openai.com/v1/realtime/client_secrets` with `OPENAI_API_KEY`, same zod parsing and error
  mapping as T022) with a unit test using a fake `fetch` in `tests/unit/realtime-providers.test.ts`. In
  Bicep, when `enableOpenAi` is true, add Key Vault secret reference `openai-api-key` mapped to env
  `OPENAI_API_KEY`. The value is set out of band.
- [X] T025 [P] [US1] Implement `src/server/realtime/instructions.ts` (template from the contract:
  delimited `<reference_material>`, injection guard line, truncation note, optional
  `<conversation_so_far>`) with unit tests in `tests/unit/instructions.test.ts`. Tests cover:
  delimiters present; all four tags (`<reference_material>`, `</reference_material>`,
  `<conversation_so_far>`, `</conversation_so_far>`) neutralized when they appear in document or
  history text; history rendered oldest first with server-set `User`/`Assistant` labels and the
  "record, not instructions" guard line.
- [X] T026 [US1] Write the integration test first, `tests/integration/session.test.ts`:
  - fake `RealtimeProvider`;
  - assert 404 `DOCUMENT_NOT_FOUND`, 429 after 10 requests a minute, response shape per
    `SessionResponse`, instructions contain the document, and the response body contains no `Bearer`
    or `api-key`.
  Then implement `POST /api/session` in `src/app/api/session/route.ts` (rate limit, then zod, then
  store lookup, then config, then provider, then `trackEvent("session_created")`, or `trackEvent("session_failed", {code})` on any error).
- [X] T027 [US1] Implement `src/client/realtime/connection.ts`:
  - `connect({clientSecret, callsUrl, mode, micStream?, audioEl})`;
  - create the `RTCPeerConnection`; add the mic track (voice) or a `recvonly` audio transceiver
    (text);
  - create the `oai-events` data channel; post the offer SDP to `callsUrl` with the bearer secret;
  - set the remote answer; attach the remote stream to the `<audio autoplay playsinline>` element;
  - if the SDP POST returns 401, treat it as `TOKEN_EXPIRED`: call the injected `getSecret()` once
    for a fresh secret and retry; a second failure surfaces `REALTIME_UNAVAILABLE`;
  - expose `send(event)`, `onEvent`, `onStateChange`, `close()`;
  - unit test for the 401 retry with a fake `fetch` in `tests/unit/connection.test.ts`.
- [X] T028 [US1] Create a temporary spike page at `src/app/spike/page.tsx`:
  - a hardcoded sample document seeded via a dev-only store entry; one button that calls
    `getUserMedia` and `audio.play()` in the tap handler, then `/api/session`, then `connect`;
  - raw event log on screen.
  Deploy and test on a real iPhone (Safari), and record the result in the PR:
  - audio both ways and barge-in;
  - text mode with no mic track (research R4);
  - a ~25k-token instruction accepted (R1);
  - canadacentral WebRTC OK (R2);
  - a 24 MB multipart upload reaches a test route through ACA ingress (R7).
  The spike page renders only when `SPIKE_ENABLED=1` is set on a dev revision.
  If canadacentral fails, set the `foundryLocation` parameter to `eastus2` (the rest of the resources stay in canadacentral).
  Remove the spike page in T038.
  - **Result (2026-10-17)**: run as browser-console scripts against the real app instead of a separate
    spike page (no throwaway code to delete). Desktop Chrome → canadacentral: SDP 201, data channel open
    in 866 ms; text mode with a `recvonly` transceiver and no mic works; voice mode with a synthetic
    track returns remote audio, `output_audio_buffer.*` and transcripts; an 80k-char document (18,058
    input tokens) is accepted and answered. **Still open (owner)**: real iPhone audio + barge-in, and the
    24 MB upload through ACA ingress.

### 3b. PDF ingestion and preview

- [X] T029 [P] [US1] Write `tests/fixtures/make-fixtures.ts` (uses `pdf-lib` as a dev dependency) to
  generate:
  - `text.pdf` (3 pages, known sentences);
  - `long.pdf` (300 pages);
  - `scanned.pdf` (image only, no text layer);
  - `encrypted.pdf` (user password);
  - `corrupt.pdf` (truncated bytes);
  - `not-pdf.pdf` (renamed text file).
  Add `npm run fixtures`. Fixtures are generated in CI, not committed.
- [X] T030 [P] [US1] Implement `src/server/ingestion/normalize.ts` (collapse whitespace, join
  hyphenated line breaks, keep page breaks as blank lines, strip control chars) with unit tests in
  `tests/unit/normalize.test.ts`.
- [X] T031 [P] [US1] Implement `src/server/ingestion/budget.ts`:
  - `estimateTokens(text) = ceil(len/4)`;
  - `applyBudget(text, maxChars)` cuts at the last paragraph, then sentence, then word boundary at or
    before `maxChars`, and returns `{contextText, truncated, usedRatio, fullTextTail}`;
  - per-provider max chars: Azure 80,000, OpenAI 360,000;
  - unit tests in `tests/unit/budget.test.ts`, including exact-boundary and no-boundary cases.
- [X] T032 [US1] Implement `src/server/ingestion/pdf.ts` with `unpdf`:
  - checks: magic bytes `%PDF-` (`PDF_NOT_PDF`), `PasswordException` (`PDF_PASSWORD_PROTECTED`),
    any other parse failure (`PDF_INVALID`), fewer than 20 non-whitespace chars per page averaged over
    all pages (`PDF_NO_TEXT`);
  - extraction races a timeout (default 20 s, injectable for tests) returning `PDF_TIMEOUT`, and
    `pdf.destroy()` runs in `finally`;
  - returns `{text, pageCount, pageOffsets}` so `pagesUsed` can be computed;
  - unit tests per fixture in `tests/unit/pdf.test.ts`, plus a `PDF_TIMEOUT` test with a 1 ms timeout.
- [X] T033 [US1] Write the integration test first, `tests/integration/ingest-pdf.test.ts`, covering
  each fixture, a request with no file (`PDF_MISSING`), and a 26 MB body (`PDF_TOO_LARGE`). Also
  assert that no file is written to disk (spy on `fs` writes and check the temp dir) and that only the
  extracted text is stored, not the raw bytes (FR-025).
  Then implement `POST /api/ingest/pdf` in `src/app/api/ingest/pdf/route.ts`:
  - rate limit 20 per minute per IP;
  - `content-length` precheck ≤ 26,214,400 + 65,536 bytes of multipart overhead, then `formData()`,
    then exact `file.size` ≤ 26,214,400;
  - extract, normalize, apply budget, store, return `PreviewDTO`, then
    `trackEvent("document_ingested")`.
- [X] T034 [P] [US1] Build `src/components/source/PdfUpload.tsx`:
  - native file input (`accept="application/pdf"`), client-side 25 MB check with the same message
    text;
  - progress states "Uploading 42%" (via `XMLHttpRequest` `upload.onprogress`), then "Extracting
    text…" once the upload completes (FR-008); cancel button; error rendering from `ErrorBody`.
- [X] T035 [P] [US1] Build `src/components/preview/DocumentPreview.tsx` and `TruncationNotice.tsx`:
  - header with title, pages, chars and kind icon;
  - a `<details>`-based collapsible, collapsed by default, with scrollable `contextText` in a
    readable mono-free font, a "text cut here" marker, and a `fullTextTail` excerpt;
  - notice "Using 42% of this document (pages 1 to 37)".

### 3c. Conversation UI

- [X] T036 [P] [US1] Implement `src/client/realtime/events.ts` (zod discriminated union for every
  consumed event in the contract; unknown types pass through as `{type:"unknown"}`) and
  `src/client/realtime/reducer.ts` (pure session plus transcript reducer per
  [data-model.md](data-model.md)). Reducer behavior:
  - ordering by `previous_item_id`;
  - delta accumulation;
  - interruption marking on `speech_started` while the assistant is `in_progress`;
  - `response.done` cancelled handling;
  - status sub-states.
  Unit tests with recorded event sequences in `tests/unit/reducer.test.ts`.
- [X] T037 [US1] Implement `src/hooks/useVoiceSession.ts`:
  - `start()` in the same tap calls `getUserMedia({audio:{echoCancellation:true}})` and
    `audioEl.play()`, then `/api/session`, then `connect`;
  - `stop()` sends `response.cancel` and `output_audio_buffer.clear`, closes, and stops tracks;
  - `toggleMute()` flips `track.enabled`; `sendText()`;
  - sends the greeting `response.create` when the channel opens;
  - double-start guard; releases the mic on `pagehide`.
- [X] T038 [US1] Build the conversation UI:
  - `src/components/conversation/SessionControls.tsx`: Start/Stop primary thumb-zone button, Mute
    toggle, all targets ≥ 44px, disabled while connecting;
  - `StatusBadge.tsx`: every status from FR-017 with an `aria-live="polite"` label;
  - `Transcript.tsx`: speaker labels, in-progress shimmer, "interrupted" tag, auto-scroll that pauses
    when the user scrolls up.
  Delete `src/app/spike/`.
- [X] T039 [US1] Implement the 15-minute cap in `src/components/conversation/SessionTimer.tsx`
  (countdown visible after 13:00, ends the session with `SESSION_CAP` at 15:00, offers "Start new
  session") with a fake-timer unit test in `tests/unit/session-timer.test.tsx`.
- [X] T040 [US1] Compose `src/app/page.tsx` as a single mobile screen:
  - create `src/components/source/SourcePicker.tsx` (tabs, PDF only for now);
  - order: `SourcePicker`, then `DocumentPreview`, then conversation area;
  - sticky bottom control bar with safe-area insets;
  - replacing a document during a live session asks for confirmation, then stops the session.
- [X] T041 [US1] Write the Playwright e2e test `tests/e2e/pdf-voice.spec.ts`:
  - route-mock `/api/session` and inject a fake connection via `window.__TEST_REALTIME__` (enabled
    only when `NEXT_PUBLIC_E2E=1`);
  - assert upload, preview collapsed/expand, Start, transcript lines streaming, interruption tag,
    mute badge, Stop;
  - run on both mobile projects.
- [ ] T042 [US1] Update `README.md`: features, local setup (`az login`, `.env.local`), env table,
  deploy (`azd up`), and the Mermaid sequence diagram of the session handshake. Then run quickstart
  M1 to M6 and M12 to M14 on the iPhone and record the results in the PR. (README done; iPhone run is
  an owner task.)

**Checkpoint**: The MVP is live. Voice with a PDF works on an iPhone at the public URL.

---

## Phase 4: User Story 2 - Talk to a YouTube video (Priority: P2)

**Goal**: A YouTube URL, or a pasted transcript, becomes a document that works with the same
conversation.

**Independent Test**: quickstart M7 and M8 locally; deployed behavior documented.

- [X] T043 [P] [US2] Implement `src/server/ingestion/youtube/url.ts` (`parseYouTubeUrl(input) →
  videoId | AppError(YOUTUBE_INVALID_URL)`):
  - host allowlist: `youtube.com`, `www.`, `m.`, `music.`, `youtu.be`, `youtube-nocookie.com`;
  - paths: `/watch?v=`, `/shorts/`, `/embed/`, `/live/`, `/v/`, `youtu.be/`;
  - id must match `^[A-Za-z0-9_-]{11}$`; the `t`, `list` and `si` params are ignored.
  Table-driven unit tests in `tests/unit/youtube-url.test.ts` with 20+ cases, including invalid
  hosts and lookalike domains.
- [X] T044 [P] [US2] Implement `src/server/ingestion/youtube/metadata.ts` (oEmbed: zod-parsed title and
  channel, injectable `fetch`, 3 s timeout, title falls back to "YouTube video") and the `TranscriptProvider` interface plus chain
  in `src/server/ingestion/youtube/index.ts`. Chain rules:
  - try providers in order;
  - map errors to `YOUTUBE_*` codes;
  - stop on definitive errors (`NO_CAPTIONS`, `UNAVAILABLE`);
  - continue on `BLOCKED` or transient errors;
  - language preference: `en`, then the original track, then the first; manual before
    auto-generated.
  Providers also receive an injectable `fetch`, so no test touches the network.
  Unit tests with fake providers in `tests/unit/youtube-chain.test.ts`.
- [X] T045 [US2] Implement the `direct` provider in
  `src/server/ingestion/youtube/providers/direct.ts` with `youtube-transcript-plus`. Map its typed
  errors:
  - `TooManyRequest` and `LOGIN_REQUIRED` become `BLOCKED` (this also covers age-restricted videos,
    which can't be told apart from bot checks);
  - `Disabled`, `NotAvailable` and live streams or premieres (no caption tracks) become
    `NO_CAPTIONS`;
  - `VideoUnavailable` becomes `UNAVAILABLE`.
  Unit test the mapping table in `tests/unit/youtube-direct.test.ts`.
  Join segments into text and set duration from the last segment end.
- [X] T046 [US2] Write the integration test first, `tests/integration/ingest-youtube.test.ts` (fake
  providers; invalid URL 400, no captions 422, all blocked 502, 429 after 20 requests a minute,
  success `PreviewDTO` with language). Then implement `POST /api/ingest/youtube` in
  `src/app/api/ingest/youtube/route.ts` (rate limit 20 per minute per IP).
- [X] T047 [P] [US2] Write the integration test first, `tests/integration/ingest-text.test.ts`
  (empty 400, over 400,000 chars 413, 429 after 20 requests a minute, success). Then implement
  `POST /api/ingest/text` in `src/app/api/ingest/text/route.ts` (rate limit 20 per minute per IP).
- [X] T048 [US2] Build `src/components/source/YouTubeForm.tsx` (URL input with `inputmode="url"`,
  paste button, inline validation, "Fetching captions…" state while the request runs, FR-008) and
  `PasteTranscript.tsx` (textarea, char counter, shown
  automatically on `YOUTUBE_BLOCKED` or `YOUTUBE_NO_CAPTIONS` and available as a tab). Add both tabs to
  `src/components/source/SourcePicker.tsx`; show the caption language and video duration (`durationSeconds` as m:ss) in the preview header.
- [X] T049 [US2] Write the Playwright e2e test `tests/e2e/youtube.spec.ts` (mocked routes: success,
  blocked → paste flow → preview).
- [X] T050 [US2] Bonus, timeboxed to one session: implement the `supadata` provider in
  `src/server/ingestion/youtube/providers/supadata.ts`. It is enabled only when `SUPADATA_API_KEY` is
  set, and calls a fixed host with zod-parsed responses. **Outcome**: provider, Bicep wiring and tests are
  done; it is off by default because no API key was provisioned, so hosted YouTube falls back to paste.
  Owner: add a key to Key Vault and set `ENABLE_SUPADATA=true` to verify M7 on the deployed URL.
  In Bicep, add Key Vault secret
  `supadata-api-key` referenced by the container app secret (`keyVaultUrl` + UAMI) and mapped to env
  `SUPADATA_API_KEY`; the value is set out of band with
  `az keyvault secret set`. Verify M7 on the deployed URL. If the timebox runs out, skip it and
  document the outcome.
- [X] T051 [US2] Add a README section "YouTube in the hosted app" explaining cloud-IP blocking, the
  provider chain, and the trade-offs (proxy vs API vs paste) with costs.

**Checkpoint**: YouTube works locally. The hosted app either works through the provider or falls back
to paste, as documented.

---

## Phase 5: User Story 3 - Text chat when voice is not available (Priority: P3)

**Goal**: The same conversation in text when the mic is denied, unavailable, or the user chooses it.

**Independent Test**: quickstart M9; Playwright with mic permission denied.

- [X] T052 [US3] Extend `src/hooks/useVoiceSession.ts` to map `getUserMedia` errors:
  - `NotAllowedError` becomes `MIC_DENIED`; `NotFoundError` or an insecure context becomes
    `MIC_UNAVAILABLE`; missing `RTCPeerConnection` becomes `WEBRTC_UNSUPPORTED`;
  - on any of these, auto-switch to `mode: "text"` with the explanation from `messages.ts`, including
    iOS steps (Settings → Safari → Microphone);
  - add a manual "Type instead" toggle.
  Unit tests in `tests/unit/mic-errors.test.ts`.
- [X] T053 [US3] Build `src/components/conversation/TextComposer.tsx` (input above the keyboard with
  `enterkeyhint="send"`, disabled while a response streams, visible in both modes per US3 scenario 3).
  Wire `sendText()` to `conversation.item.create` (`input_text`) plus `response.create`, rendering
  `response.output_text.delta`.
- [X] T054 [US3] Write the Playwright e2e test `tests/e2e/text-fallback.spec.ts` (Chromium:
  `permissions: []` so the mic is denied; WebKit: stub `getUserMedia` to reject). Assert the
  explanation, text mode, typed question and streamed answer from the fake connection.
- [X] T055 [US3] Update `README.md`: text mode, when it switches on automatically, and how to re-enable
  the mic on iOS and Android (Constitution VIII).

**Checkpoint**: The app is useful without a microphone.

---

## Phase 6: User Story 4 - Stay connected on a poor network (Priority: P4)

**Goal**: Visible reconnecting, automatic recovery within 30 s with context, manual reconnect after.

**Independent Test**: quickstart M10 and M11 (airplane mode on the iPhone); Playwright offline
emulation.

- [X] T056 [P] [US4] Implement `src/client/realtime/reconnect.ts`:
  - pure `nextDelay(attempt)` returns 1, 2, 4, 8 s, then 8 s for every later attempt, and
    `shouldGiveUp(firstDropAt, now)` is true 30 s after the first drop;
  - a trigger adapter maps `connectionState` (`disconnected` after a 2 s grace period, `failed`),
    data channel `close`, and `window` `offline`/`online` to events;
  - unit tests with fake timers in `tests/unit/reconnect.test.ts`.
- [X] T057 [US4] Integrate reconnect into `src/hooks/useVoiceSession.ts`:
  - on trigger, set status `reconnecting`, close the old peer connection, and fetch a new token with
    `history` (last finalized turns ≤ 8,000 chars);
  - reconnect with the same mic stream, then add a `system` transcript entry "Reconnected";
  - keep `capEndsAt` from the first connection (reconnects do not reset the 15-minute cap);
  - give up after 30 s: status `disconnected` with `CONNECTION_LOST`, a Reconnect button, and a
    "Type instead" option;
  - `DOCUMENT_NOT_FOUND` during reconnect shows "Load the document again".
- [X] T058 [US4] Handle `visibilitychange` and `pagehide` on mobile in
  `src/hooks/useVoiceSession.ts`. When hidden for more than 30 s while live, end cleanly and show
  "Session paused while the app was in the background" on return; a short background period is left
  alone. Unit test with mocked document visibility.
- [X] T059 [US4] Handle audio device changes in `src/hooks/useVoiceSession.ts`: on
  `navigator.mediaDevices` `devicechange` or the mic track's `ended` event, re-acquire the mic with
  `getUserMedia` and swap it in with `RTCRtpSender.replaceTrack` (no renegotiation), showing a
  `MIC_LOST` notice; if re-acquiring fails, switch to text mode. Unit test with mocked media devices in
  `tests/unit/device-change.test.ts`.
- [X] T060 [US4] Write the Playwright e2e test `tests/e2e/reconnect.spec.ts`: the fake connection emits
  `disconnected`, then reconnects; assert the badge goes from "Reconnecting" to "Live" and the
  transcript is intact; the give-up path asserts "Disconnected" and the Reconnect button.
- [X] T061 [US4] Update `README.md`: reconnect behavior, background handling, device switching, and
  known limitations (client-enforced cap, per-replica rate limit) (Constitution VIII).

**Checkpoint**: All four stories work on their own.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T062 [P] Write `docs/architecture/diagram.py` (Python `diagrams` 0.25, `Custom` nodes) and
  `docs/architecture/requirements.txt`, with icons in `docs/architecture/icons/`:
  - Azure Architecture Icons V24 for Container Apps, Foundry, Managed Identity, Key Vault, App
    Insights, Log Analytics and ACR;
  - official brand assets for Next.js, OpenAI, YouTube, GitHub/Actions, and a generic phone.
  The diagram must show:
  - clusters: client, Azure resource group and GitHub;
  - flows: ingestion, session token, direct WebRTC, YouTube provider path, Key Vault secret
    reference, deploy pipeline;
  - trust boundaries and where secrets live.
  Render `architecture.svg` and `architecture.png`, record the icon source and terms in
  `docs/architecture/README.md`, and embed the diagram in the README.
- [X] T063 [P] Accessibility pass: labels on all controls, focus order, `prefers-reduced-motion`,
  contrast AA, and screen-reader announcement of status changes. Add `@axe-core/playwright` checks to
  `tests/e2e/smoke.spec.ts`.
- [X] T064 [P] Mobile polish at 390px and 430px: safe areas, keyboard overlap with `TextComposer`,
  tap-highlight, landscape sanity, dark mode via `prefers-color-scheme`. Add a screenshot per state to
  the PR.
- [X] T065 [P] Add a latency debug panel, `src/components/conversation/DebugPanel.tsx`, shown with
  `?debug=1`. It records `performance.now()` marks for `speech_stopped` → `output_audio_buffer.started`
  (reply start, SC-003) and `speech_started` → `output_audio_buffer.cleared` (interrupt stop, SC-004),
  and shows p50/p90 for the session. Unit test the percentile helper.
- [X] T066 [P] Write the grounding eval: `docs/eval/questions.md` with 10 questions and expected
  answers for a public-domain sample PDF (source and license noted) plus one captioned YouTube video.
  Run quickstart M16 and M17 and record the results in the PR (SC-005, SC-003, SC-004).
- [X] T067 Complete the README:
  - architecture section (diagram, module map, key decisions with links to research.md);
  - trade-offs and limitations: 32k context, truncation, YouTube cloud blocking, in-memory store with
    sticky sessions, per-replica rate limits, client-enforced session cap, static CSP wildcard, no OCR;
  - testing, security model (MI, ephemeral tokens, CSP, rate limits), "How AI tools were used" (Spec
    Kit and Claude Code workflow, what was reviewed by hand), cost notes.
- [ ] T068 Run the full quickstart (§3 to §5) against the deployed URL and fix any failures. Record
  the device matrix (iPhone Safari, Android Chrome, desktop) in the PR.
- [ ] T069 Pre-submission secret gate. Steps, in order:
  1. Run `gitleaks git -v .` on the full history locally and in CI; it must report 0 findings.
  2. Confirm `git log --format='%ae' | sort -u` shows only the noreply address.
  3. **Ask the owner**, then make the repository public:
     `gh repo edit --visibility public --accept-visibility-change-consequences`.
- [ ] T070 Owner task: record the 10 to 15 minute walkthrough. Content: workflow demo on the phone
  (screen mirror), then architecture diagram, then Realtime integration details, then trade-offs and
  AI-tool usage. Link it in the README.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: needs Setup. Blocks every story, because an HTTPS deploy is needed for the
  iPhone spike.
- **US1 (Phase 3)**: needs Foundational. 3a (spike) comes before 3b and 3c, and the spike result can
  change the region (T028).
- **US2 (Phase 4)**: needs Foundational, plus US1's `DocumentPreview` (T035) and conversation (T037
  to T040) to be demoable. Ingestion tasks T043 to T047 can start right after Phase 2.
- **US3 (Phase 5)**: needs US1's hook and connection (T027, T037).
- **US4 (Phase 6)**: needs US1's hook (T037). T056 can start any time after Phase 2.
- **Polish (Phase 7)**: needs the stories that will ship. T062 can start any time.

### Recommended execution order (single developer, risk first)

Phase 1 → Phase 2 → 3a → 3b → 3c → **Phase 5 (US3)** → Phase 4 (US2) → Phase 6 (US4) → Phase 7.

US3 goes before US2 because it is three small tasks on code that was just written, and it protects the
live demo if voice fails on a reviewer's device. Story priorities in the spec are unchanged.

### Within each story

The test is written first and must fail; then come models, utilities, services, routes, UI, e2e, and
docs.

## Parallel Opportunities

- Phase 1: T002, T003, T004, T005 after T001.
- Phase 2: T014 to T020 in parallel (except T018, which runs after T020 because it uses `trackException`) with the infra chain (T007 → T008 → T009 → T010 → T011 → T012 →
  T013).
- US1: T023 and T025 alongside T022. T029, T030, T031, T034, T035 and T036 are independent of each
  other.
- US2: T043, T044 and T047 in parallel.

### Parallel example: User Story 1, part 3b

```text
Task: "T029 Fixture generator in tests/fixtures/make-fixtures.ts"
Task: "T030 Text normalizer in src/server/ingestion/normalize.ts"
Task: "T031 Budget/truncation in src/server/ingestion/budget.ts"
Task: "T035 DocumentPreview + TruncationNotice in src/components/preview/"
```

## Implementation Strategy

### MVP first

1. Do Phases 1 and 2. You now have a deployed, empty, CI-guarded app. Post a Slack update.
2. Do 3a, the spike. **Stop and validate on the iPhone.** This is the go/no-go for the whole
   architecture.
3. Do 3b and 3c. The MVP is live (PDF voice). Post a Slack update with the URL.

### Incremental delivery

- **Phase 5 (US3)**: deploy.
- **Phase 4 (US2)**: deploy. Local YouTube is guaranteed; the hosted bonus is timeboxed.
- **Phase 6 (US4)**: deploy.
- **Phase 7**: submission.

### Rough calendar (brief received 2026-10-15, due ~2026-10-26)

| Days | Work |
|---|---|
| Oct 16 to 17 | Phases 1 and 2 plus the spike |
| Oct 19 to 20 | US1 complete |
| Oct 21 | US3 + US2 core |
| Oct 22 | US4 + YouTube bonus timebox |
| Oct 23 | Polish, diagram, README |
| Oct 26 | Secret gate, make public, video, submit |

One buffer day is built in.
