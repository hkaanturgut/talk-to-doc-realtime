# Research: Caption Relay

## R1. Can the cloud app fetch captions any other way?

- **Decision**: No. Use a relay on a residential connection.
- **Evidence** (2026-10-17, short-lived Azure Container Instance in canadacentral vs the owner's
  home connection; videos `jNQXAC9IVRw`, `9bZkp7q19f0`, `aircAruvnKk`):
  - Innertube `player` with WEB, MWEB, ANDROID, IOS, TVHTML5, TV embedded, WEB embedded clients:
    all `LOGIN_REQUIRED` "Sign in to confirm you're not a bot" (or "no longer supported") from
    Azure; ANDROID and IOS return caption tracks from home.
  - Watch page: `LOGIN_REQUIRED` from Azure.
  - Legacy `api/timedtext`: 200 with an empty body.
  - `get_transcript` (the "Show transcript" panel): `400 Precondition check failed` even from home
    with parameters taken from the watch page; it needs a BotGuard proof token (PoToken).
  - Data API v3 `captions.download`: requires OAuth and edit permission on the video (403 otherwise).
  - Browser-side fetch from our origin: the caption file (`timedtext`) allows our origin, but the
    `player` call that yields its signed URL returns 403 cross-origin, and the watch page sends no
    CORS headers. The phone can't discover the caption URL.
- **Alternatives considered**: hosted caption API (Supadata; declined by owner), residential proxy
  (third party, about $3.50/GB, still hit by PoToken checks), minting PoTokens server-side with
  BotGuard emulation (fragile, terms-of-service grey area, and the IP block hits first), cookies of
  a signed-in account (terms-of-service violation, account ban risk), other clouds or regions (same
  datacenter block).

## R2. Inbound tunnel vs outbound polling

- **Decision**: outbound long polling from the relay to the app.
- **Rationale**: nothing listens on the owner's machine and no public URL points at it, so its attack
  surface does not change. Works behind any NAT or firewall, survives IP changes, and needs no
  tunnel account. The app is already public HTTPS, so the relay only needs outbound 443.
- **Alternatives considered**: Cloudflare quick tunnel to a relay HTTP server (public URL into the
  home machine, URL changes on restart; rejected by policy and owner); WebSocket from the relay
  (persistent socket through ACA ingress works but adds reconnect and heartbeat code; long polling
  gives the same latency at this scale with plain fetch).

## R3. Queue: in memory vs a queue service

- **Decision**: in-memory `RelayQueue` in the app process.
- **Rationale**: the app already keeps documents in memory with sticky sessions (001 R10). A job only
  lives for 15 s while a viewer request is waiting on the same process, so durability buys nothing.
- **Known limit**: with more than one replica, the relay's polls (sticky cookie) reach one replica;
  a viewer on another replica sees "relay offline" and gets the paste fallback. At demo load ACA runs
  one replica (`minReplicas: 1`, HTTP scale rule at 30 concurrent requests).
- **Upgrade path**: Azure Service Bus (request queue plus session-based replies) or Storage Queues,
  with the relay authenticating by Entra ID instead of a shared secret. That removes both the replica
  limit and the shared secret, at the cost of a new resource and more code. Recorded, not built
  (Principle IX).

## R4. Relay authentication

- **Decision**: 256-bit random shared secret (`openssl rand -base64 32`) in Key Vault secret
  `caption-relay-secret`; app gets it as a Container Apps Key Vault reference (user-assigned
  identity already has `Key Vault Secrets User`); the relay reads it at start with
  `az keyvault secret show` using the owner's login (owner has `Key Vault Secrets Officer`). Sent as
  `Authorization: Bearer`. The app compares SHA-256 digests with `crypto.timingSafeEqual` (equal
  lengths, no early exit).
- **Hardening**: uniform `401` for missing or wrong secrets, `relayAuthLimiter` (10 failures/min per
  client IP) → `429`; routes return `404` when the secret is not configured (feature off).
- **Rotation**: set a new secret version in Key Vault, restart the relay, and restart the app revision
  (Key Vault references refresh on restart).
- **Alternatives considered**: Entra client credentials for the relay (needs an app registration
  plus a client secret on the home machine: same trust, more moving parts); HMAC-signed requests
  (protects against replay on a non-TLS hop, which doesn't exist here: TLS end to end).

## R5. Job lifecycle and timing

- **Decision**: viewer wait 15 s; relay long poll 25 s (ACA ingress timeout is 240 s); presence
  "online" = a poll is waiting now, or the last poll ended within 30 s. A job is leased to the first
  poll that takes it; the result is accepted once, only while the job has not expired. Same-video
  requests join the in-flight job. Cap 20 pending jobs.
- **Rationale**: 15 s covers a home round trip (caption fetch measured at 1–3 s locally) with margin;
  30 s presence tolerates one missed poll plus a slow round trip.

## R6. Running TypeScript for the relay

- **Decision**: `tsx` dev dependency; `npm run relay` runs
  `tsx --conditions=react-server tools/caption-relay/main.ts`.
- **Rationale**: the worker reuses `DirectProvider` and shared zod schemas, which import
  `server-only` (allowed under the `react-server` condition) and use extensionless relative imports
  (Node's built-in type stripping requires extensions). `tsx` handles both, and the `@/` path
  alias from `tsconfig.json`.
- **Alternatives considered**: duplicating the provider in a plain `.mjs` (drift); bundling the
  worker (extra build step for a dev tool).

## R7. Secret on the command line

- **Decision**: the relay calls `az` with `execFile` (no shell) and keeps the secret in memory only.
  Flags carry the vault name, subscription, and app URL, never the secret. An environment variable
  `CAPTION_RELAY_SECRET` is accepted as an override for CI-like runs, but not documented as the
  default path.
