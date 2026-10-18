# Implementation Plan: Caption Relay for YouTube on the Hosted App

**Branch**: `002-caption-relay` | **Date**: 2026-10-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-caption-relay/spec.md`

## Summary

The hosted app cannot fetch YouTube captions because YouTube bot-checks every cloud IP (evidence in
the spec). We add an **outbound-only caption relay**: a small worker the owner runs on a home
machine. It long-polls the app for caption jobs over HTTPS, fetches captions with the existing
`DirectProvider` from the home IP, and posts the result back. Inside the app, a new `RelayProvider`
sits in the provider chain after `direct`: when a relay is online it queues a job in an in-memory
`RelayQueue` and waits up to 15 s; otherwise it fails fast to the paste fallback. Auth is a 256-bit
shared secret in Key Vault (Managed Identity on the app side, the owner's `az login` on the relay
side), compared in constant time. Nothing listens on the owner's machine.

```text
 Viewer phone ──POST /api/ingest/youtube──▶ App (Azure Container Apps)
                                             │ 1. direct → BLOCKED (cloud IP)
                                             │ 2. relay online? → enqueue job, wait ≤ 15 s
                                             ▼
                                         RelayQueue (in memory)
                                             ▲            │
             GET /api/relay/next (long poll) │            │ {jobId, videoId}
             POST /api/relay/result          │            ▼
                                     Caption relay (owner's machine, outbound HTTPS only)
                                             │
                                             └──▶ YouTube (home IP, not blocked)
```

## Technical Context

**Language/Version**: TypeScript 6 (strict), Node 24

**Primary Dependencies**: Next.js 16 route handlers, zod 4, `youtube-transcript-plus` (via the
existing `DirectProvider`), `tsx` (new dev dependency, runs the relay script with TS path handling)

**Storage**: in memory (`RelayQueue`), same pattern and limits as `DocumentStore`

**Testing**: Vitest unit (queue, auth, provider, worker loop) and integration (relay routes plus
YouTube ingest end to end with a fake direct provider)

**Target Platform**: app on Azure Container Apps (Linux); relay on the owner's macOS machine with
Node 24 and Azure CLI

**Project Type**: web service + owner-run CLI worker

**Performance Goals**: transcript visible within 15 s with the relay online (target < 5 s); no added
latency when the relay is offline

**Constraints**: outbound-only relay; no secret in the browser, repo, logs, or argv; feature off by
default; one relay request per video at a time

**Scale/Scope**: demo scale: one relay, ≤ 20 pending jobs, the app's existing 1–3 replicas

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
| --- | --- | --- |
| I. Security First | Relay secret in Key Vault, reaches the app through a Key Vault reference with the user-assigned identity, and the relay through the owner's `az login`. Never in browser, repo, logs, argv. Constant-time compare, auth-failure rate limit, routes 404 when disabled. | PASS |
| II. Mobile-First | No UI change. Offline relay keeps the existing paste fallback, so the mobile fallback rule holds. | PASS |
| III. Validated Boundaries | Both relay routes validate with zod (job id uuid, video id regex, transcript ≤ `MAX_TEXT_CHARS`, body size cap). The worker validates the job it receives. Env var validated in `env.ts`. | PASS |
| IV. Small, Testable Modules | `RelayQueue` (pure, injectable clock), `relay-auth`, `RelayProvider` (implements existing `TranscriptProvider`), worker loop with injected fetch and provider. Routes have integration tests. | PASS |
| V. Fail Visibly | Every relay outcome maps to an existing viewer state; relay failures are logged with video id and kind, never transcript text. | PASS |
| VI. Infrastructure as Code | `enableCaptionRelay` Bicep param, Key Vault reference, deploy variable. The only manual step is creating the secret value (like the Supadata key). | PASS |
| VII. Always Shippable | One PR, feature flag off by default, CI unchanged. | PASS |
| VIII. README | README YouTube section, security model, trade-offs, diagram updated in the same PR. | PASS |
| IX. Simplicity | The relay is an explicitly agreed bonus (owner request). No new provider abstraction: it is another `TranscriptProvider`. No queue service. | PASS (justified below) |

**Post-design re-check (after Phase 1)**: PASS. The one new moving part outside Azure (the owner's
machine) is accepted by the owner as interim and is documented as such.

## Project Structure

### Documentation (this feature)

```text
specs/002-caption-relay/
├── spec.md
├── plan.md              # this file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/relay-api.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── app/api/
│   ├── health/route.ts             # + relay {online, lastSeenSeconds} when enabled
│   └── relay/
│       ├── next/route.ts           # GET long poll: next job or 204
│       └── result/route.ts         # POST job result
├── server/
│   ├── config/env.ts               # + CAPTION_RELAY_SECRET
│   ├── http/rate-limit.ts          # + relayAuthLimiter
│   └── ingestion/youtube/
│       ├── relay/
│       │   ├── queue.ts            # RelayQueue: jobs, dedupe, cap, expiry, waiters, presence
│       │   ├── auth.ts             # Bearer parse + constant-time compare
│       │   └── index.ts            # singleton (global, like the document store)
│       ├── providers/relay.ts      # RelayProvider (TranscriptProvider)
│       ├── types.ts                # + "relay" source/name
│       └── index.ts                # chain: direct → relay → supadata
└── shared/schemas.ts               # + RelayJob, RelayResult schemas (shared with the worker)

tools/caption-relay/
├── worker.ts                       # pure poll loop (injected fetch, provider, sleep)
└── main.ts                         # CLI: args, secret from Key Vault via az, start loop

infra/ main.bicep, resources.bicep, main.parameters.json   # enableCaptionRelay
.github/workflows/deploy.yml                                # ENABLE_CAPTION_RELAY var
docs/architecture/diagram.py (+ png/svg)                    # relay node outside Azure
tests/unit/{relay-queue,relay-auth,relay-provider,relay-worker}.test.ts
tests/integration/relay.test.ts
```

**Structure Decision**: the relay lives under `src/server/ingestion/youtube/relay/` because it is part
of YouTube ingestion; the worker is under `tools/` because it never runs in the app image (the
Dockerfile copies only the Next.js standalone output, so `tools/` is not shipped).

## Complexity Tracking

| Addition | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| Long-poll job queue + 2 routes | Outbound-only relay (owner security requirement) | Inbound tunnel exposes the owner's machine (blocked by policy, rejected by owner) |
| Shared secret | Authenticates the relay without new identity infrastructure | Entra app registration for the relay: heavier, and still needs a client secret or cert on the home machine |
| Owner machine outside Azure | Only residential IPs pass YouTube's bot check | Every in-cloud option is blocked (spec evidence); third-party caption API declined by owner |
