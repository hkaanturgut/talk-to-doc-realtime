# Tasks: Access Code and Conversation Guardrails

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/access-api.md](contracts/access-api.md)

**Tests**: included (constitution Principle IV). Write each test before its implementation.

## Phase 1: Setup

- [X] T001 [P] Add `ACCESS_CODE` (optional, min 12) and `MAX_VOICE_SESSIONS` (int 1–50, default 3) to src/server/config/env.ts and .env.example
- [X] T002 [P] Add `VOICE_BUSY` (503, retryable) and `FORBIDDEN` (403); make `SESSION_CAP` a server code (409); update UNAUTHORIZED message in src/shared/errors.ts and src/shared/messages.ts
- [X] T003 [P] Add `leaseId` to SessionRequest/SessionResponse and `LeaseRequestSchema` in src/shared/schemas.ts

## Phase 2: User Story 1 - Access code (P1)

- [X] T004 [P] [US1] Unit tests tests/unit/access-cookie.test.ts: sign/verify round trip, expired, tampered signature, other code, malformed
- [X] T005 [US1] Implement src/server/access/cookie.ts (Web Crypto HMAC)
- [X] T006 [P] [US1] Unit tests tests/unit/access-gate.test.ts: public paths, page redirect with next, API 401, valid cookie passes, gate off when no code, cross-site POST 403, same-origin POST passes, relay exempt, GET exempt from origin check
- [X] T007 [US1] Implement src/server/access/gate.ts (pure decision) and src/proxy.ts (matcher skips static assets)
- [X] T008 [US1] Implement POST src/app/api/access/route.ts (rate limit `accessLimiter` 5/min, constant-time compare, safe `next`, cookie, 303) and integration tests tests/integration/access.test.ts
- [X] T009 [US1] Implement src/app/access/page.tsx (390 px, plain form, error states, no JS needed)
- [X] T010 [US1] Playwright tests/e2e/access.spec.ts with a gated server (separate Playwright project/port, `ACCESS_CODE` set): redirect, wrong code, right code, reload, axe

## Phase 3: User Story 2 - Stay on the document (P1)

- [X] T011 [P] [US2] Extend tests/unit/instructions.test.ts: scope rule, decline rule, harmful rule, instruction-secrecy rule, existing injection rules kept
- [X] T012 [US2] Update src/server/realtime/instructions.ts
- [X] T013 [US2] Pin `raiPolicyName: 'Microsoft.DefaultV2'` on both deployments in infra/resources.bicep
- [X] T014 [US2] Live eval tools/eval/guardrails.ts + `npm run eval:guardrails` (text mode via the provider, unrelated/harmful/injection/on-topic prompts); record results in README

## Phase 4: User Story 3 - Voice capacity (P2)

- [X] T015 [P] [US3] Unit tests tests/unit/voice-leases.test.ts: cap, release frees, idle expiry 90 s, renew keeps slot, unknown renew acquires, 15-minute cap on renew and heartbeat
- [X] T016 [US3] Implement src/server/realtime/leases.ts (injectable clock) + singleton
- [X] T017 [US3] Session route: acquire/renew in voice mode, return leaseId; heartbeat and release routes; extend tests/integration/session.test.ts
- [X] T018 [US3] Client: `heartbeatLease`, `releaseLease` (sendBeacon) in src/client/api.ts; controller lease lifecycle (keep across refresh/reconnect, heartbeat 30 s, release on teardown, SESSION_CAP → endForCap); VOICE_BUSY offers text chat; tests in tests/unit/controller.test.ts

## Phase 5: User Story 4 - Cross-site protection (P2)

- [X] T019 [US4] Covered by T006/T007; add integration-level check that existing e2e flows still pass with the proxy active

## Phase 6: Infrastructure and docs

- [X] T020 Bicep `enableAccessCode` → KV reference `access-code` → env `ACCESS_CODE`; `maxVoiceSessions` param → env; deploy.yml `ENABLE_ACCESS_CODE` variable; `az bicep build` passes
- [X] T021 README: guardrails section, security model, trade-offs, config table, sharing and rotating the code, eval results; architecture diagram note
- [X] T022 Full gates: typecheck, lint, format, unit/integration, e2e, build
- [X] T023 PR, CI green, merge, deploy; create the Key Vault secret; enable the variable; production validation V1–V12

## Review notes

An independent review pass of the diff (before the PR) found and fixed:

- `safeNext` accepted `/\t/evil.example` (browsers drop tabs, giving `//evil.example`): control
  characters and backslashes are now rejected anywhere.
- A renewal after the slot idled out or hit the cap took a fresh slot and restarted the 15-minute
  clock: retired leases now keep their original start (data-model.md).
- A session minted while the user pressed Stop kept its slot until it idled out: the controller
  now releases it.
- The proxy matcher's exclusions were unanchored prefixes: only `_next/static/` and `_next/image/`
  are skipped now.
- Body size caps on `/api/access` (8 KB) and `/api/session/release` (1 KB).
- Per-replica cap multiplier documented in the README (accepted trade-off, research R5).

## Production validation (2026-10-18, `92d25b8`)

Deploy run succeeded; `/api/health` reports the new version and the relay online.

| # | Check | Result |
| --- | --- | --- |
| V1 | `GET /` without the cookie | `307 /access?next=%2F` |
| V2 | wrong code | `303 /access?error=code` |
| V3 | 6 wrong codes from one IP | 5 × `error=code`, then `error=rate` |
| V4 | right code | `303 /`, cookie `ttd_access` HttpOnly + Secure; `GET /` → 200 |
| V5 | `POST /api/ingest/text` without the cookie | `401 UNAUTHORIZED` |
| V6 | `GET /api/health` | 200 |
| V7 | `POST` with `Origin: https://evil.example` | `403 FORBIDDEN` |
| V8–V9 | `npm run eval:guardrails` against production | 13 / 13 ([docs/eval/guardrails.md](../../docs/eval/guardrails.md)) |
| V10 | 4 voice session mints | 3 leases, 4th `503 VOICE_BUSY` |
| V11 | release, then mint again; heartbeat; renew with the same lease; heartbeat after release | 204; new lease; 204; same lease; 404 |
| V12 | YouTube `jNQXAC9IVRw` with the cookie, relay running | 200 in 2.9 s, `captionSource: relay` |
| - | `/access?next=/%09/evil.example` | hidden field `next="/"` (open redirect closed) |
| - | Deployment content filter | both deployments `Microsoft.DefaultV2` |
| - | Container env | `ACCESS_CODE` from Key Vault reference `access-code`; `MAX_VOICE_SESSIONS=3` |

Owner to-do: real-iPhone pass of the access screen and a voice conversation (quickstart V1, V4,
V10 with two phones), and the guardrail prompts by voice.
