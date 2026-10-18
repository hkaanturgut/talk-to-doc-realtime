# Implementation Plan: Access Code and Conversation Guardrails

**Branch**: `003-access-guardrails` | **Date**: 2026-10-18 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-access-guardrails/spec.md`

## Summary

Four guardrails before the app is shared: (1) an **access code gate** in `src/proxy.ts` with a
stateless HMAC-signed cookie, code in Key Vault; (2) **scope and safety rules** in the server-built
instructions, plus the Azure default content filter pinned in Bicep; (3) **voice leases** that cap
concurrent voice conversations, renewed by heartbeat and refused after 15 minutes; (4) an **origin
check** on state-changing API calls. Options compared in [research.md](research.md).

```text
 Browser ──▶ proxy.ts ── origin check (POST /api/*, not relay) ──▶ 403 FORBIDDEN
                │
                ├─ ACCESS_CODE set and no valid ttd_access cookie?
                │     page → 307 /access?next=…      API → 401 UNAUTHORIZED
                ▼
           route handlers
             POST /api/access            code check (constant time, 5/min/IP) → cookie, 303
             POST /api/session (voice)   VoiceLeases.acquire/renew → 503 VOICE_BUSY | 409 SESSION_CAP
             POST /api/session/heartbeat VoiceLeases.heartbeat     → 204 | 404 | 409 SESSION_CAP
             POST /api/session/release   VoiceLeases.release       → 204
```

## Technical Context

**Language/Version**: TypeScript 6 (strict), Node 24

**Primary Dependencies**: Next.js 16 (`proxy.ts`, route handlers), zod 4, Web Crypto. No new
dependencies.

**Storage**: in memory (`VoiceLeases`), stateless cookie

**Testing**: Vitest unit (cookie sign/verify, proxy decisions, leases, instructions, controller
lease handling), integration (access, session lease routes), Playwright (access screen at 390 px with
a dedicated server config), live guardrail eval script

**Target Platform**: Azure Container Apps

**Project Type**: web application

**Performance Goals**: proxy adds < 1 ms per request (one HMAC verify)

**Constraints**: no secret in the browser, URL or logs; gate off when not configured; existing
tests unchanged

**Scale/Scope**: demo scale, one instance

## Constitution Check

| Principle | Check | Status |
| --- | --- | --- |
| I. Security First | Code in Key Vault via KV reference; cookie holds no code; constant-time compare; rate limit; origin check | PASS |
| II. Mobile-First | Access screen designed at 390 px, no JS needed; VOICE_BUSY offers text chat | PASS |
| III. Validated Boundaries | zod for access form, lease ids, env (`ACCESS_CODE` min 12, `MAX_VOICE_SESSIONS` int) | PASS |
| IV. Small, Testable Modules | `access/cookie.ts` (pure), `access/gate.ts` (pure decision), `VoiceLeases` (injectable clock), routes with integration tests | PASS |
| V. Fail Visibly | VOICE_BUSY, SESSION_CAP, UNAUTHORIZED, FORBIDDEN mapped to messages | PASS |
| VI. Infrastructure as Code | `enableAccessCode` param, KV reference, `raiPolicyName` pinned, deploy variable | PASS |
| VII. Always Shippable | Flag off by default; one PR | PASS |
| VIII. README | Security model, guardrails, trade-offs, config updated | PASS |
| IX. Simplicity | No identity provider, no session store, no classifier | PASS |

**Post-design re-check**: PASS.

## Project Structure

```text
src/
├── proxy.ts                               # origin check + access gate (Next.js 16 proxy)
├── app/
│   ├── access/page.tsx                    # access screen (server component, plain form)
│   └── api/
│       ├── access/route.ts                # POST: verify code, set cookie, 303
│       └── session/
│           ├── route.ts                   # + lease acquire/renew in voice mode
│           ├── heartbeat/route.ts         # POST {leaseId}
│           └── release/route.ts           # POST {leaseId} (sendBeacon)
├── server/
│   ├── access/cookie.ts                   # sign/verify (Web Crypto)
│   ├── access/gate.ts                     # pure request decision for proxy.ts
│   ├── realtime/leases.ts                 # VoiceLeases + singleton
│   ├── realtime/instructions.ts           # scope and safety rules
│   ├── config/env.ts                      # + ACCESS_CODE, MAX_VOICE_SESSIONS
│   └── http/rate-limit.ts                 # + accessLimiter
├── shared/{errors,messages,schemas}.ts    # VOICE_BUSY, FORBIDDEN, SESSION_CAP 409; leaseId
├── client/api.ts                          # heartbeat, releaseLease
└── client/realtime/controller.ts          # lease lifecycle
tools/eval/guardrails.ts                   # live text-mode guardrail eval
infra/                                     # enableAccessCode, raiPolicyName
```

## Complexity Tracking

| Addition | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| Heartbeat + release routes | Accurate live-slot count and server-side 15-minute refusal | Counting minted tokens over-counts and cannot detect early stops |
