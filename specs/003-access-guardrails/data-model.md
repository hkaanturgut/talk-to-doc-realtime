# Data Model: Access Code and Conversation Guardrails

## Access cookie (browser, HttpOnly)

`ttd_access = "v1." + expiresAtSeconds + "." + base64url(HMAC-SHA256(key, "v1." + expiresAtSeconds))`

- `key = SHA-256("ttd-access-cookie:" + ACCESS_CODE)`
- valid when the signature verifies and `expiresAtSeconds > now`
- Max-Age 604 800 s (7 days); HttpOnly; Secure in production; SameSite=Lax; Path=/

## VoiceLease (server, in memory)

| Field | Type | Rules |
| --- | --- | --- |
| `id` | uuid v4 | opaque, returned to the browser as `leaseId` |
| `startedAt` | epoch ms | set on acquire; never changes on renew |
| `lastSeenAt` | epoch ms | set on acquire, renew, heartbeat |

- Live when `now - lastSeenAt ≤ 90 000`. Idle leases move to `retired` (id → `startedAt`) on every
  call, and so do leases that hit the cap; `retired` entries are dropped after 2 × 915 s.
- A renew or heartbeat for a retired id brings it back **with its original `startedAt`** if there is
  room (so a long network drop can't restart the 15-minute clock), or answers `SESSION_CAP` / `cap`
  when it is over the cap.
- `acquire()`: count live leases; `≥ MAX_VOICE_SESSIONS` → `VOICE_BUSY`; else a new lease.
- `renew(id)` (token refresh / reconnect): unknown id → `acquire()`; `now - startedAt > 915 000` →
  `SESSION_CAP` (lease removed); else `lastSeenAt = now`.
- `heartbeat(id)`: unknown → `not_found`; over cap → `cap` (lease removed); else `ok`.
- `release(id)`: remove from both maps (a late heartbeat can't revive it); idempotent.

## Schemas (zod, `src/shared/schemas.ts`)

- `SessionRequest` + `leaseId?: uuid`
- `SessionResponse` + `leaseId?: uuid` (voice only)
- `LeaseRequestSchema = { leaseId: uuid }`
- Access form: `code: string(1..200)`, `next: string(≤ 2048)` (sanitized to a same-site path)
