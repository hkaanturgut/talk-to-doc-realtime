# Analysis Report: 001-voice-doc-chat

`/speckit-analyze` checks spec, plan, tasks and constitution against each other. It is read-only, so
fixes were applied afterwards and are logged here. Task IDs in the Fix column refer to the
**renumbered** tasks.md (70 tasks).

## Pass 1 (2026-10-16): 34 findings, all addressed

| ID | Sev | Finding | Fix applied |
|---|---|---|---|
| C1 | CRITICAL | Telemetry used `ManagedIdentityCredential`; constitution requires `DefaultAzureCredential` | T020, research R11: `DefaultAzureCredential` (UAMI via `AZURE_CLIENT_ID`) |
| C2 | CRITICAL | CI arrived in Phase 2, so the first PRs had no checks | New T006: basic CI + required checks in Phase 1; T014 adds e2e + gitleaks |
| C3 | CRITICAL | No README tasks for US3/US4 | New T055 (text mode), T061 (reconnect, limits) |
| C4 | CRITICAL | No server-error logging; `session_failed` missing | T018 `trackException` in `respond.ts`; T026 `session_failed` |
| C5 | CRITICAL | No token-expiry path | `TOKEN_EXPIRED` code; T027 re-mint + retry once on 401; contract updated |
| H1 | HIGH | Client `history` injected into instructions unescaped | Contract: escaped, delimited, guard line; T025 tests all four tags |
| H2 | HIGH | Rate limiter trusted spoofable first `x-forwarded-for` hop | T018 uses last hop; per-replica limit documented (R12, T061) |
| H3 | HIGH | "Use text" offered when the shared Realtime service is down | Spec edge case + `REALTIME_UNAVAILABLE` message changed |
| H4 | HIGH | `PDF_MISSING` and validation code missing; quickstart uuid invalid | `PDF_MISSING`, `INVALID_REQUEST` added; quickstart uses a valid uuid |
| H5 | HIGH | CSP built from env at build time would block SDP POST | Static `connect-src https://*.openai.azure.com https://api.openai.com` (R12, T021) |
| H6 | HIGH | `YOUTUBE_LIVE` never produced; age-restricted mis-mapped | Code removed: live → `NO_CAPTIONS`, sign-in/age → `BLOCKED`; T045 mapping test |
| H7 | HIGH | oEmbed unvalidated and not injectable | T044 zod + injectable `fetch` for metadata and providers |
| H8 | HIGH | No task for the OpenAI provider or its Key Vault secret | New T024 |
| M1 | MED | Backoff schedule vs 30 s window undefined | 1, 2, 4, 8, then 8 s repeating until the deadline (R5, data model, T056) |
| M2 | MED | State names drift between FR-017 and data model | FR-017 aligned; muted is an indicator |
| M3 | MED | Bluetooth/device switch not covered | New T059 + quickstart M15 |
| M4 | MED | No extraction progress | T034 "Extracting text…" |
| M5 | MED | SC-003/004/005 not measured; SC-006 weakly tested | New T065 debug latency panel, T066 grounding eval; M10 repeated 5 times |
| M6 | MED | Scanned threshold "average" vs "per page" | Averaged over all pages everywhere |
| M7 | MED | `content-length` precheck rejects valid 25 MB uploads; 24 MB ingress check missing | 64 KiB slack (T033); spike checks ingress (T028) |
| M8 | MED | `instrumentation.ts` must be in `src/` | Plan + T020 use `src/instrumentation.ts` |
| M9 | MED | `SourcePicker` used before creation | Created in T040 |
| M10 | MED | `PDF_TIMEOUT` untested; rate limits missing on two routes | T032 injectable timeout test; T046/T047 rate limits |
| M11 | MED | History order and cap inconsistent | Chronological, 40 items / 8,000 chars everywhere |
| M12 | MED | "Reconnecting within 3 s" unrealistic with ICE timers | 5 s target; `offline` + data channel close as fast triggers |
| M13 | MED | Session cap client-only; reconnect reset undefined | `capEndsAt` not reset; limitation documented (R12, T057, T061) |
| M14 | MED | No separate Foundry location for the eastus2 fallback | `foundryLocation` parameter (T008, R11) |
| M15 | MED | YouTube duration missing from preview | T048 |
| L1 | LOW | 4,096 vs 1,024 output tokens | R6 explains model cap vs our setting |
| L2 | LOW | Spike page and diagram README missing from structure | Added to plan; spike gated by `SPIKE_ENABLED` |
| L3 | LOW | `system` speaker not in spec | Spec entity updated |
| L4 | LOW | "normal connection" undefined | Defined in spec Assumptions |
| L5 | LOW | Subscription ID in a repo that will be public | Removed from T013 |
| L6 | LOW | MB vs MiB | "MB = 1,048,576 bytes" stated in spec and data model |

## Pass 2 (2026-10-16): verification

32 of 34 pass-1 fixes were verified as correct. Two were incomplete and are now fixed: H6 (a leftover
`LIVE` in T044) and M14 (T028 now uses `foundryLocation`). 13 new findings came up: 0 critical,
0 high, 2 medium, 11 low. All are fixed:

| ID | Sev | Finding | Fix applied |
|---|---|---|---|
| N1 | MED | T018 marked parallel but depends on T020 | `[P]` removed; ordering note in Parallel Opportunities |
| N2 | MED | Fast reconnect triggers missing from the state machine and plan flow | `offline` and data channel `close` added to both |
| N3 | LOW | `thinking` sub-state missing in the data model | Added |
| N4 | LOW | `TOKEN_EXPIRED` message vs surfaced code unclear | Marked internal; a failed retry shows `REALTIME_UNAVAILABLE` |
| N5 | LOW | `<document>` vs `<reference_material>` | Contract example fixed |
| N6 | LOW | `DebugPanel`, `docs/eval` missing from the plan tree | Added |
| N7 | LOW | Plan session response missing `provider`, `sessionMaxSeconds` | Matches the contract |
| N8 | LOW | FR-024 silent on per-replica counting | Trade-off stated in FR-024 |
| N9 | LOW | FR-030 out of order | Marked "added in clarification" |
| N10 | LOW | `X-Frame-Options` missing from R12 | Added |
| N11 | LOW | No YouTube fetch progress state | "Fetching captions…" in T048 |
| G1 | LOW | SC-001 not measured | Quickstart M2 times it |
| G2 | LOW | "Files not stored" (FR-025) untested | Assertion added to T033 |

**Result**: 0 open findings, 0 constitution violations. FR coverage 30/30, SC coverage 10/10, 70
tasks numbered T001 to T070 with no gaps. Ready for owner approval, then `/speckit-implement`.
