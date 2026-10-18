# Tasks: Caption Relay for YouTube on the Hosted App

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/relay-api.md](contracts/relay-api.md)

**Tests**: included (constitution Principle IV). Write each test before its implementation.

## Phase 1: Setup

- [X] T001 Add `tsx` dev dependency and `relay` npm script (`tsx --conditions=react-server tools/caption-relay/main.ts`) in package.json
- [X] T002 [P] Add `CAPTION_RELAY_SECRET` (optional, min 32 chars) to src/server/config/env.ts and .env.example
- [X] T003 [P] Add `UNAUTHORIZED` (401) and `RELAY_JOB_NOT_FOUND` (404) to src/shared/errors.ts and src/shared/messages.ts

## Phase 2: Foundational

- [X] T004 [P] Add `RelayJobSchema` and `RelayResultSchema` (data-model.md) to src/shared/schemas.ts
- [X] T005 [P] Unit tests for RelayQueue in tests/unit/relay-queue.test.ts: dedupe, cap 20, lease order, expiry rejects waiters, single-use result, late result rejected, presence online/offline, long-poll wakeup and timeout
- [X] T006 Implement RelayQueue in src/server/ingestion/youtube/relay/queue.ts (injectable clock) and singleton in src/server/ingestion/youtube/relay/index.ts
- [X] T007 [P] Unit tests for relay auth in tests/unit/relay-auth.test.ts: correct, wrong, missing, wrong scheme, different length
- [X] T008 Implement constant-time Bearer check in src/server/ingestion/youtube/relay/auth.ts and `relayAuthLimiter` in src/server/http/rate-limit.ts

## Phase 3: User Story 1 + 2 - Hosted YouTube via relay, graceful fallback (P1)

**Goal**: YouTube links load on the hosted app when the relay is online; fast paste fallback when not.

- [X] T009 [P] [US1] Unit tests for RelayProvider in tests/unit/relay-provider.test.ts: offline fails fast as BLOCKED, online success maps transcript with source "relay", failure kinds pass through, timeout → TRANSIENT
- [X] T010 [US1] Implement RelayProvider in src/server/ingestion/youtube/providers/relay.ts; add "relay" to types.ts; insert into chain after direct in src/server/ingestion/youtube/index.ts when the secret is set
- [X] T011 [US1] Implement GET src/app/api/relay/next/route.ts (404 when disabled, auth, rate limit, 25 s long poll, 200/204, no-store)
- [X] T012 [US1] Implement POST src/app/api/relay/result/route.ts (404 when disabled, auth, 2 MB cap, zod, 204/400/404)
- [X] T013 [US1] Integration tests in tests/integration/relay.test.ts: 404 disabled, 401 wrong secret, 429 after 10 failures, 204 empty poll, full flow ingest youtube → poll → result → 200 preview, NO_CAPTIONS → 422, late result → 404, duplicate → 404, oversized → 400, offline relay → 502 fast
- [X] T014 [US2] Verify offline behavior keeps existing paste UI (existing YouTube e2e still passes; no client change)

## Phase 4: User Story 3 - Owner runs and monitors the relay (P2)

- [X] T015 [P] [US3] Unit tests for the worker loop in tests/unit/relay-worker.test.ts: handles a job and posts ok result, maps provider errors to kinds, 204 polls again, network error backs off (1, 2, 4 … 30 s) and recovers, invalid job ignored, logs never contain transcript text or secret
- [X] T016 [US3] Implement tools/caption-relay/worker.ts (pure loop, injected fetch/provider/sleep/log)
- [X] T017 [US3] Implement tools/caption-relay/main.ts (flags --app/--vault/--subscription, env fallbacks, secret via `az keyvault secret show` with execFile, SIGINT stop)
- [X] T018 [US3] Health: add `relay {online, lastSeenSeconds}` when enabled in src/app/api/health/route.ts; extend tests/integration/health.test.ts

## Phase 5: Infrastructure

- [X] T019 Add `enableCaptionRelay` param to infra/main.bicep and infra/resources.bicep (Key Vault reference secret `caption-relay-secret` → env `CAPTION_RELAY_SECRET`), infra/main.parameters.json, and `ENABLE_CAPTION_RELAY` in .github/workflows/deploy.yml
- [X] T020 Create the Key Vault secret (owner sub), set repo variable `ENABLE_CAPTION_RELAY=true`

## Phase 6: User Story 4 - Docs and architecture (P2)

- [X] T021 [P] [US4] Update docs/architecture/diagram.py with the relay outside Azure (outbound-only arrow), regenerate png/svg
- [X] T022 [P] [US4] README: YouTube section (evidence table, flow, security model, offline behavior, replica limit, production replacements, how to run), Mermaid diagram, config table, trade-offs
- [X] T023 [US4] Update specs/001-voice-doc-chat/spec.md clarification and README links to reference feature 002

## Phase 7: Ship and validate

- [X] T024 Lint, typecheck, format, unit/integration, build, e2e locally
- [ ] T025 PR, CI green, merge, deploy
- [ ] T026 Run quickstart V1–V8 against production with the relay running on the owner's machine

## Dependencies

T001–T003 → T004–T008 → T009–T014 → T015–T018 → T019–T020 → T021–T023 → T024–T026.
[P] tasks in the same phase touch different files and can run together.
