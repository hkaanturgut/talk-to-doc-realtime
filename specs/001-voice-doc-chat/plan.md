# Implementation Plan: Voice Chat with a Document or YouTube Video

**Branch**: `001-voice-doc-chat` | **Date**: 2026-10-16 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-voice-doc-chat/spec.md`

## Summary

A single Next.js 16 app (App Router, TypeScript, Node runtime) on Azure Container Apps.

- **Ingestion**: server routes turn a PDF (`unpdf`), a YouTube URL (caption provider chain), or pasted
  text into a normalized, budget-truncated document. The document is held in an in-memory store and
  previewed in a collapsible panel.
- **Voice**: `/api/session` builds the instructions from the stored document on the server and mints a
  short-lived Realtime client secret with Managed Identity (`DefaultAzureCredential`, no API keys). The
  browser then connects **directly** to Microsoft Foundry `gpt-realtime-2.1` over WebRTC: audio over
  media tracks, events and transcript over the `oai-events` data channel.
- **Text fallback**: the same session in text-only mode.
- **Resilience**: a client state machine handles status, barge-in marking, mute, the 15-minute cap,
  and reconnect with a fresh token.
- **Infrastructure**: all of it is Bicep (AVM) deployed with `azd`, with CI/CD in GitHub Actions over
  OIDC.

Research details: [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 6.0 (strict), Node.js 24 LTS; Python 3.12 only for the diagram script.

**Primary Dependencies**:
- App: Next.js 16.4, React 19.3, Tailwind CSS 4.3, zod 4.
- Ingestion: `unpdf` 1.9, `youtube-transcript-plus` 2.x.
- Azure: `@azure/identity` 4.x, `@azure/monitor-opentelemetry` 1.x.

**Storage**: In-memory `DocumentStore` (60-minute idle TTL, LRU cap). No database.

**Testing**:
- Vitest 5 for unit and route integration tests.
- Playwright 1.64 with iPhone 15 (WebKit) and Pixel 7 (Chromium) profiles.
- A manual real-device checklist.

**Target Platform**:
- Browsers: iOS Safari 17+ and Android Chrome (primary), desktop Chrome, Safari and Edge.
- Server: Linux container (`node:24-slim`) on Azure Container Apps.

**Project Type**: Web application, a single Next.js project with separate server, client and UI
modules.

**Performance Goals**:
- First spoken reply within 1.5 s of the end of user speech (SC-003).
- Barge-in stop within 500 ms (SC-004).
- 10 MB PDF previewed in under 10 s (SC-002).

**Constraints**:
- No secrets on the client.
- 25 MB upload limit.
- 32k-token model context on Azure, of which 20k tokens are budgeted for the document.
- Mobile-first at 390px.
- Session cap of 15 minutes.

**Scale/Scope**:
- A few concurrent reviewers; 1 to 3 replicas with sticky sessions.
- About 8 screens/states, 5 API routes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | How the plan complies | Status |
|---|---|---|
| I. Security First | Ephemeral token minted server-side with MI; `disableLocalAuth` on Foundry and App Insights; Key Vault for optional third-party keys; instructions built server-side; CSP; gitleaks in CI | PASS |
| II. Mobile-First | 390px-first layout; gesture-gated `getUserMedia` + `audio.play()`; mic-denied → text mode; Playwright iPhone profile; real-iPhone spike is the first story task | PASS |
| III. Strict TS + validated boundaries | `strict`, zod for route bodies, env, upstream responses and data-channel events ([contracts/](contracts/)) | PASS |
| IV. Small testable modules | `server/ingestion`, `server/realtime`, `server/documents`, `client/realtime` with interfaces and fakes; unit + integration + e2e layers | PASS |
| V. Fail visibly | Error code catalog ([contracts/api.md](contracts/api.md#error-codes)) maps every spec edge case to a message; OTel events | PASS |
| VI. IaC | Bicep + azd for every resource including model deployments and role assignments; OIDC CI | PASS |
| VII. Always shippable | Tasks sized for short sessions; deploy pipeline exists before features; each story phase ends deployable | PASS |
| VIII. README-driven, English | README tasks per story; diagram + trade-offs + AI-use notes | PASS |
| IX. YAGNI | One provider abstraction (azure/openai); OCR deferred; no DB, no state library | PASS |

**Analysis re-check**: the first `/speckit-analyze` pass found five constitution gaps (telemetry
credential, CI arriving after the first PRs, missing README tasks for US3/US4, no server-error logging,
no token-expiry path). All five were fixed in the artifacts before approval; see
[analysis.md](analysis.md).

**Post-design re-check (after Phase 1)**: PASS. Two new interfaces (`TranscriptProvider`,
`DocumentStore`) are not provider-abstraction creep: each one isolates an external dependency for tests
(Principle IV) and has a concrete second implementation (Supadata, Redis-ready). Recorded below.

## Project Structure

### Documentation (this feature)

```text
specs/001-voice-doc-chat/
├── spec.md              # /speckit-specify + /speckit-clarify
├── plan.md              # this file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── api.md           # HTTP routes, schemas, error codes
│   └── realtime-events.md  # session config + data-channel events used
├── checklists/requirements.md
├── tasks.md             # /speckit-tasks
└── analysis.md          # /speckit-analyze report + remediation log
```

### Source Code (repository root)

```text
src/
├── app/                          # Next.js App Router (UI shell + route handlers only)
│   ├── layout.tsx
│   ├── page.tsx                  # single-screen app: source input → preview → conversation
│   ├── spike/page.tsx            # TEMPORARY voice spike (T028), gated by SPIKE_ENABLED, deleted in T038
│   ├── globals.css
│   └── api/
│       ├── ingest/pdf/route.ts
│       ├── ingest/youtube/route.ts
│       ├── ingest/text/route.ts
│       ├── session/route.ts
│       └── health/route.ts
├── server/                       # server-only modules ("server-only" import guard)
│   ├── config/env.ts             # zod-validated env
│   ├── http/                     # error → response mapping, client IP, rate limiter
│   ├── documents/                # DocumentStore interface + in-memory impl
│   ├── ingestion/
│   │   ├── pdf.ts                # unpdf extraction + edge-case detection
│   │   ├── normalize.ts          # whitespace / hyphenation cleanup
│   │   ├── budget.ts             # token estimate + truncation
│   │   └── youtube/
│   │       ├── url.ts            # URL → video id
│   │       ├── metadata.ts       # oEmbed
│   │       ├── providers/direct.ts
│   │       ├── providers/supadata.ts
│   │       └── index.ts          # provider chain
│   ├── realtime/
│   │   ├── provider.ts           # RealtimeProvider interface + factory (REALTIME_PROVIDER)
│   │   ├── azure.ts
│   │   ├── openai.ts
│   │   ├── session-config.ts     # VAD, voice, transcription, modalities
│   │   └── instructions.ts       # system prompt + delimited document + history
│   └── telemetry.ts
├── client/                       # browser-only logic (no React)
│   └── realtime/
│       ├── connection.ts         # RTCPeerConnection + SDP exchange + data channel
│       ├── events.ts             # zod schemas for consumed server events
│       ├── reducer.ts            # session state + transcript (pure)
│       └── reconnect.ts          # backoff schedule + triggers
├── components/                   # React UI (mobile-first)
│   ├── source/{SourcePicker,PdfUpload,YouTubeForm,PasteTranscript}.tsx
│   ├── preview/{DocumentPreview,TruncationNotice}.tsx
│   └── conversation/{SessionControls,StatusBadge,Transcript,TextComposer,SessionTimer}.tsx
├── hooks/useVoiceSession.ts      # glues client/realtime to React
├── instrumentation.ts            # OTel bootstrap (Node runtime only; must live in src/ with this layout)
└── shared/                       # isomorphic: types, zod schemas, error codes, messages
    ├── schemas.ts
    ├── errors.ts
    └── messages.ts

tests/
├── unit/
├── integration/
├── e2e/
└── fixtures/make-fixtures.ts
infra/
├── main.bicep                    # subscription scope: rg + modules
├── main.parameters.json
├── resources.bicep               # AVM modules: identity, ACR, logs, appi, kv, foundry, aca env, app
└── abbreviations.json
azure.yaml
Dockerfile
.github/workflows/{ci.yml,deploy.yml}
docs/architecture/{diagram.py,requirements.txt,README.md,icons/,architecture.svg,architecture.png}
```

**Structure Decision**: One Next.js project, organized by layer instead of split into separate
frontend and backend packages.

- **Server code**: `src/server` holds everything that touches secrets, Azure, or upstream services. It
  is guarded with `import "server-only"`, so a client import fails the build.
- **Browser code**: `src/client` holds browser logic with no React, so it is unit-testable.
- **UI**: `src/components` and `src/hooks` hold React only.
- **Shared code**: `src/shared` holds the only code both sides import (schemas, error codes, messages).
- **Route handlers**: `src/app/api/*` handlers are thin: validate, call a server module, map errors.

This meets the brief's "modular frontend + backend" requirement with one deployable. The separation is
enforced by the import guard and an ESLint `no-restricted-imports` rule.

## Key Flows

### Ingestion
1. Client validates size and type, then uploads to `/api/ingest/*`.
2. Server validates (zod and limits), extracts text, and normalizes it.
3. Server applies the document budget and truncates if needed.
4. Server stores the document as `{documentId, text, meta}` with a 60-minute TTL and returns the
   preview DTO.

### Session start
1. User taps Start, which calls `getUserMedia` and unlocks `audio.play()` in the same gesture.
2. Client calls `POST /api/session {documentId, mode, history?}`.
3. Server applies the rate limit, loads the document, and builds the instructions and session config.
4. `provider.createClientSecret()` gets an Entra token via MI and calls `client_secrets`.
5. Server returns `{clientSecret, expiresAt, callsUrl, model}`.
6. Client creates the `RTCPeerConnection` (mic track, `oai-events` channel), posts the SDP offer to
   `callsUrl` with the bearer secret, and sets the answer as the remote description.
7. When the data channel opens, the status becomes `live`. The client sends a greeting
   `response.create`.

### Barge-in
1. Server VAD sends `input_audio_buffer.speech_started` while the assistant is speaking.
2. The reducer marks the current assistant entry `interrupted`.
3. The server truncates audio on its own (`output_audio_buffer.cleared`).
4. A new response follows when the user stops speaking.

### Reconnect
1. A connection state of `disconnected` (after a 2 s grace period) or `failed` sets the status to
   `reconnecting`.
2. Retries follow the backoff schedule. Each one gets a new token and a new peer connection, and sends
   the last turns as `history`.
3. Success restores `live`. After 30 s the status becomes `disconnected` and a manual Reconnect appears.

## Delivery Order (risk first)

1. **Foundation**: scaffold, env, error catalog, Bicep, `azd up` with a hello page on HTTPS, and CI.
   An iPhone can't use the microphone without HTTPS, so the voice spike needs this first.
2. **US1 voice spike**: `/api/session` and the WebRTC connection, tested by talking on a real iPhone.
   This is the riskiest assumption (R2 canadacentral WebRTC, iOS audio).
3. **US1 PDF ingestion and preview**, then the full voice UI (controls, status, transcript, barge-in,
   timer).
4. **US3 text fallback**: small, and it protects the demo.
5. **US2 YouTube**: local direct first, then paste, then the timeboxed Supadata bonus.
6. **US4 reconnect / poor network.**
7. **Polish**: diagram, README, tests to target, security headers, accessibility, gitleaks, making the
   repo public, and the video.

## Complexity Tracking

| Item | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| `TranscriptProvider` chain (direct, Supadata, paste) | YouTube blocks cloud IPs; the hosted bonus needs a second source | A direct-only fetch fails in the deployed app and can't be tested without the network |
| `DocumentStore` interface | Fake in tests; documents the Redis path for scaling | A bare module-level Map can't be swapped or reset cleanly in tests |
| Sticky sessions + in-memory store | Brief allows in-memory; keeps a visitor's document on one replica | A single replica only is a scaling dead end; Redis exceeds the brief |
