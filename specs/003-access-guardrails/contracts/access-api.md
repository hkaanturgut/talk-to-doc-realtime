# Contracts: Access and Voice Lease APIs

All error bodies use the existing shape `{ "error": { "code", "message", "retryable" } }`.

## Proxy (every request except static assets)

| Condition | Result |
| --- | --- |
| Method not GET/HEAD/OPTIONS, path `/api/*` but not `/api/relay/*`, and `Sec-Fetch-Site: cross-site` or `Origin` host ≠ `Host` | `403 FORBIDDEN` |
| `ACCESS_CODE` set, path not public, no valid cookie, path `/api/*` | `401 UNAUTHORIZED` |
| same, page path | `307 /access?next=<path+query>` |
| otherwise | pass through |

Public paths: `/access`, `/api/access`, `/api/health`, `/api/relay/*`, `/_next/*`, `/favicon.ico`,
`/icon*`, `/robots.txt`.

## POST /api/access

Form (`application/x-www-form-urlencoded`) or JSON: `code`, optional `next`.

| Case | Response |
| --- | --- |
| Gate disabled | `404` |
| Rate limited (5/min/IP, counts every attempt) | `303 /access?error=rate&next=…` |
| Wrong code | `303 /access?error=code&next=…` |
| Right code | `303 <next or />` + `Set-Cookie: ttd_access=…` |

`next` must start with `/` and not `//` or `/\`; otherwise `/`.

## POST /api/session (changed)

Request adds `leaseId?: uuid`. Voice mode: acquire or renew a lease.

| Case | Response |
| --- | --- |
| Cap reached | `503 VOICE_BUSY` (retryable) |
| Lease over 15 minutes | `409 SESSION_CAP` |
| OK | `200` + existing body + `leaseId` (voice) |

## POST /api/session/heartbeat

Body `{ leaseId }`. `204` ok · `404` unknown lease (client keeps going) · `409 SESSION_CAP` ·
`400 INVALID_REQUEST`.

## POST /api/session/release

Body `{ leaseId }` (JSON or `text/plain` from `sendBeacon`). Always `204` for a valid id; `400` for
an invalid body.
