# Decision Log

Lightweight ADRs for the decisions that shape the system. Each entry has the context, the options
compared, the decision, its consequences, and a link to the full research section, which has the
evidence. Status is **Accepted** unless noted.

Overview: [HLD.md](HLD.md). Implementation: [LLD.md](LLD.md).

## D-01. Realtime model

- **Context**: The core flow is a spoken conversation with natural interruptions on a phone. The
  brief names `gpt-realtime`.
- **Options**:
  - `gpt-realtime` (2025-08-28): what the brief names; older barge-in behavior.
  - `gpt-realtime-2.1` (GA 2026-07-07): better interruption and background-noise handling; its own
    quota pool.
  - `gpt-realtime-2.1-mini`: cheaper and faster, weaker answers on long documents.
  - `gpt-realtime-2`: Preview only on Azure.
- **Decision**: `gpt-realtime-2.1` on Azure AI Foundry (GlobalStandard, 10 units, canadacentral),
  with `gpt-4o-mini-transcribe` for the user transcript. The model is a Bicep parameter, and
  `REALTIME_PROVIDER=openai` switches to OpenAI direct with the same GA API shape.
- **Consequences**:
  - Keyless auth with Managed Identity.
  - Azure lists a 32k input window, so the document budget is 20k tokens (D-05).
  - The OpenAI path needs an API key, kept server-side in Key Vault.
- **Source**: [001 R1](../../specs/001-voice-doc-chat/research.md#r1-realtime-model-and-deployment),
  [001 R3](../../specs/001-voice-doc-chat/research.md#r3-provider-toggle-realtime_providerazureopenai).

## D-02. WebRTC from the browser, not a WebSocket relay

- **Context**: Latency and barge-in matter most. Phones are on variable networks.
- **Options**:
  - Browser ⇄ model over WebRTC.
  - A WebSocket relay through our server.
  - The deprecated preview `/realtimeapi/sessions` flow.
- **Decision**: The browser posts its SDP offer directly to `…/openai/v1/realtime/calls` and talks
  to the model over WebRTC: audio tracks plus the `oai-events` data channel. The server is not in
  the media path.
- **Consequences**:
  - Lowest latency.
  - The service truncates audio on barge-in by itself.
  - The app scales on HTTP requests only.
  - Trade-off: the server can't see or cut a live conversation, so the 15-minute cap is enforced
    on renewals, not on the open connection (D-15).
  - Server-side tools would need a sideband or relay later. None are needed today.
- **Source**: [001 R2](../../specs/001-voice-doc-chat/research.md#r2-ephemeral-token-and-webrtc-handshake-azure-ga-api).

## D-03. Server-minted ephemeral secrets

- **Context**: No API keys may reach the client (SC-009).
- **Options**:
  - An API key in the client: rejected outright.
  - A server proxy for all traffic: see D-02.
  - A server that mints a short-lived client secret bound to a session config.
- **Decision**:
  - `POST /api/session` gets an Entra token with `DefaultAzureCredential` (the user-assigned
    identity in Azure, `az login` locally), scope `https://ai.azure.com/.default`.
  - It then calls `client_secrets` with the **server-built** session: instructions, VAD, voice.
  - The secret expires in 120 s.
  - The app refuses to start if `AZURE_OPENAI_API_KEY` is set.
- **Consequences**:
  - A caller can't mint secrets with their own prompt.
  - An expired secret is re-minted once automatically.
  - Every reconnect mints a new one.
- **Source**: [001 R2](../../specs/001-voice-doc-chat/research.md#r2-ephemeral-token-and-webrtc-handshake-azure-ga-api),
  [001 R12](../../specs/001-voice-doc-chat/research.md#r12-security-controls).

## D-04. Text mode on the same Realtime session

- **Context**: Users without a microphone (denied, missing, non-HTTPS) still need to chat.
- **Options**:
  - A separate chat-completions route with another deployment.
  - The same Realtime session with text output.
- **Decision**: `output_modalities: ["text"]`, `turn_detection: null`, and a receive-only audio
  transceiver, so the SDP has an audio m-line without a mic. Typed turns are sent as
  `conversation.item.create`.
- **Consequences**:
  - One model, one prompt, one security path.
  - Text mode also needs WebRTC, so very old browsers get a message instead.
- **Source**: [001 R4](../../specs/001-voice-doc-chat/research.md#r4-session-behavior-vad-interruption-transcripts-text-mode).

## D-05. Whole document in the prompt, with a visible budget

- **Context**: The brief excludes chunking and summarization. Azure's realtime window is 32k input
  tokens.
- **Options**:
  - A real tokenizer (+1 MB of WASM).
  - A `chars / 4` estimate.
  - Truncating the middle or the end.
- **Decision**:
  - Budget: 20,000 tokens (80,000 chars) on Azure and 90,000 tokens on OpenAI.
  - The cut is at the last paragraph or sentence boundary that keeps at least 80% of the budget.
  - The UI shows "Using N% of this document (pages 1 to M)".
  - `truncation: "auto"` lets the service drop old turns, never the instructions.
- **Consequences**: Honest, testable behavior. Very long documents use only their beginning: a
  300-page PDF uses about 10%.
- **Source**: [001 R6](../../specs/001-voice-doc-chat/research.md#r6-context-budget-and-truncation).

## D-06. In-memory state with sticky sessions

- **Context**: Documents live for minutes, not days. The brief allows in-memory storage.
- **Options**:
  - SQLite on a volume.
  - Azure Cache for Redis.
  - The client re-sends the text on every session.
  - An in-memory `Map` behind a `DocumentStore` interface.
- **Decision**:
  - An in-memory store with a 60-minute idle TTL and LRU caps (200 documents, 300 MB).
  - Container Apps sticky sessions; 1 to 3 replicas.
  - Rate limiters, voice slots and the relay queue follow the same pattern.
- **Consequences**:
  - A restart loses documents: the user sees "load it again".
  - Limits are per replica (HLD §9).
  - Redis is a drop-in upgrade behind the same interfaces.
  - Re-sending text from the client was rejected because it would let a client put arbitrary text
    into the instructions.
- **Source**: [001 R10](../../specs/001-voice-doc-chat/research.md#r10-server-side-state-and-scaling),
  [002 R3](../../specs/002-caption-relay/research.md#r3-queue-in-memory-vs-a-queue-service).

## D-07. Azure Container Apps

- **Context**: One deployable Next.js server that needs Managed Identity, long uploads (25 MB) and
  PDF.js on Node.
- **Options**:
  - Static Web Apps: managed functions are limited for long uploads and minting tokens with Managed
    Identity.
  - App Service: fine, but fewer scale and revision features.
  - Edge runtime: no Managed Identity and no PDF.js.
  - Container Apps.
- **Decision**: Container Apps (Consumption) with a `node:24-slim` standalone image, ACR with a
  remote build, a user-assigned identity, sticky sessions, an HTTP scale rule, and health probes.
- **Consequences**:
  - Scale rules and revisions are available.
  - One always-on replica avoids cold starts during the review.
- **Source**: [001 R9](../../specs/001-voice-doc-chat/research.md#r9-web-stack),
  [001 R11](../../specs/001-voice-doc-chat/research.md#r11-infrastructure-identity-and-cicd).

## D-08. Bicep (AVM), `azd` and OIDC

- **Context**: Reproducible infrastructure, and no secrets in CI.
- **Options**:
  - Terraform: `azd pipeline config` doesn't set up OIDC for Terraform.
  - Bicep with Azure Verified Modules.
- **Decision**:
  - Bicep (AVM) deployed with `azd`.
  - GitHub Actions authenticates with a federated credential (OIDC).
  - Feature flags are repository variables that become Bicep parameters.
  - Secrets live only in Key Vault and reach the app as Key Vault references.
- **Consequences**:
  - `azd up` recreates everything.
  - There is no client secret in GitHub.
  - Anything configured outside Bicep would be reverted on the next provision. That is why the
    custom domain lives in Bicep too (D-17).
- **Source**: [001 R11](../../specs/001-voice-doc-chat/research.md#r11-infrastructure-identity-and-cicd).

## D-09. PDF extraction with `unpdf`

- **Context**: Text PDFs up to 25 MB, with clear errors for encrypted, scanned, corrupt and non-PDF
  files.
- **Options**:
  - `pdf-parse` 2.x: a native canvas binary in Docker, unmaintained.
  - Raw `pdfjs-dist`: worker bundling work.
  - `mupdf`: AGPL.
  - `unpdf`: a serverless PDF.js build.
- **Decision**:
  - `unpdf` 1.9, with validation in this order: size, then magic bytes, then parse.
  - A password exception maps to `PDF_PASSWORD_PROTECTED`.
  - Fewer than 20 non-whitespace chars per page means `PDF_NO_TEXT`.
  - Extraction has a 20 s timeout, and `destroy()` always runs.
- **Consequences**: There is no OCR; scanned PDFs get a clear message. Azure Document Intelligence
  is the documented add-on.
- **Source**: [001 R7](../../specs/001-voice-doc-chat/research.md#r7-pdf-extraction).

## D-10. YouTube provider chain with a paste fallback

- **Context**: Captions are the document. YouTube blocks datacenter IPs.
- **Options**:
  - `youtube-transcript-plus` (Innertube).
  - `youtubei.js`: heavy, its transcript API broke.
  - The Data API: captions only for videos you own.
  - A residential proxy: a third party, and still hit by proof-token checks.
  - A caption API (Supadata).
- **Decision**: A `TranscriptProvider` chain:
  1. `direct`;
  2. `relay` (D-11), only when a relay is online;
  3. `supadata`, only when a key is set (off);
  4. the **Paste transcript** UI.

  Definitive answers (no captions, unavailable) stop the chain; blocked or transient failures move
  on.

- **Consequences**: YouTube always ends in a usable path. When everything is blocked, the UI
  explains what happened and switches to the paste tab.
- **Source**: [001 R8](../../specs/001-voice-doc-chat/research.md#r8-youtube-transcripts).

## D-11. Outbound-only caption relay

- **Context**: Probes from Azure (seven Innertube clients, the watch page, `timedtext`,
  `get_transcript`) all failed with bot checks. The same calls work from a home IP. The owner
  declined third-party caption APIs.
- **Options**:
  - An inbound tunnel to a relay server (a public URL into the home machine).
  - A residential proxy.
  - Minting proof tokens on the server (fragile, against YouTube's terms).
  - A signed-in account's cookies (against the terms, ban risk).
  - Outbound long polling from a worker on a residential connection.
- **Decision**:
  - The owner runs `npm run relay`.
  - The worker long-polls `GET /api/relay/next` (≤ 25 s) with a Bearer secret, fetches the
    captions from the home IP with the same `DirectProvider`, and posts them to
    `/api/relay/result`.
  - The app waits up to 15 s per job.
  - The relay counts as online if it polled in the last 30 s.
  - The secret is in Key Vault, compared in constant time, and `/api/relay/*` returns `404` when
    the feature is off.
- **Consequences**:
  - Nothing is exposed at home.
  - It depends on the owner's machine being on. When it's off, visitors get the paste fallback
    with no extra wait.
  - Production replacement: the same worker on an always-on residential or mobile connection with
    Service Bus and Entra ID, or a licensed caption source.
- **Source**: [002 R1](../../specs/002-caption-relay/research.md#r1-can-the-cloud-app-fetch-captions-any-other-way),
  [002 R2](../../specs/002-caption-relay/research.md#r2-inbound-tunnel-vs-outbound-polling),
  [002 R4](../../specs/002-caption-relay/research.md#r4-relay-authentication).

## D-12. Access code, not sign-in

- **Context**: Anyone with the link could spend the voice budget. The reviewers' accounts aren't
  known in advance, and the brief asks for a publicly hosted app.
- **Options**:

  | Option                                         | Reviewer friction              | Needs emails | Verdict                                   |
  | ---------------------------------------------- | ------------------------------ | ------------ | ----------------------------------------- |
  | Fully public with rate limits                  | none                           | no           | rejected: no budget protection            |
  | **Shared access code + signed cookie**         | one code, once per device      | no           | **chosen**                                |
  | Container Apps built-in auth + email allowlist | sign in with the exact account | yes          | rejected: lockout risk, unknown emails    |
  | HTTP Basic auth                                | native prompt, poor on iOS     | no           | rejected: bad mobile UX                   |
  | Magic-link email                               | open email on the phone        | yes          | rejected: new third party, unknown emails |

- **Decision**:
  - The code is in Key Vault (`access-code`) and reaches the app as env `ACCESS_CODE` through a
    Key Vault reference.
  - The Bicep flag is `enableAccessCode`.
  - The cookie is `v1.<exp>.<HMAC-SHA256>`, with key = SHA-256 of a prefix plus the code. It is
    HttpOnly, SameSite=Lax and Secure, and lasts 7 days.
  - Code checks are constant-time, with 5 tries per minute per IP.
- **Consequences**:
  - No lockout risk.
  - Rotating the code signs out every device.
  - A forwarded code works until rotated.
  - Upgrade path: Entra External ID with invited guests, once the reviewers are known.
- **Source**: [003 R1](../../specs/003-access-guardrails/research.md#r1-how-to-restrict-who-can-use-the-hosted-app),
  [003 R2](../../specs/003-access-guardrails/research.md#r2-access-cookie-format).

## D-13. Gate in `src/proxy.ts`

- **Context**: Every page and API must be gated, and a per-route check is easy to forget.
- **Options**:
  - Per-route checks.
  - Container Apps IP restrictions (reviewers' IPs unknown).
  - The Next.js 16 proxy (formerly middleware).
- **Decision**:
  - A pure `decide()` function (`src/server/access/gate.ts`) runs in `src/proxy.ts` for every path
    except `_next/static/` and `_next/image/`: the origin check first (D-16), then the access gate.
  - The routes that spend money (session, ingest) check the cookie again with `requireAccess()`, as
    defense in depth.
  - The access screen is a server-rendered plain form, so it works without JavaScript.
- **Consequences**: This reverses 001 R7's "no `proxy.ts`" rule. That rule existed because Next's
  `proxyClientMaxBodySize` (10 MB by default) truncates request bodies that pass through the proxy.
  `next.config.ts` must therefore raise that limit above 25 MB plus multipart overhead; see
  [LLD §13](LLD.md#13-known-limitations-and-open-issues).
- **Source**: [003 R3](../../specs/003-access-guardrails/research.md#r3-where-to-enforce-the-gate).

## D-14. Guardrails in the prompt plus the default content filter

- **Context**: Off-topic chats burn tokens, and harmful requests must be declined. Voice turns go
  straight from the mic to the model and never pass through our server.
- **Options**:

  | Option                                           | Latency            | Works for voice | Verdict                      |
  | ------------------------------------------------ | ------------------ | --------------- | ---------------------------- |
  | **Scope rules in the server-built instructions** | none               | yes             | **chosen**                   |
  | Classifier call before each turn                 | +300–800 ms a turn | no              | rejected                     |
  | Azure AI Content Safety on transcripts           | after the fact     | after the fact  | rejected for now             |
  | **Azure default content filter (`DefaultV2`)**   | built in           | yes             | **kept and pinned in Bicep** |

- **Decision**: The instructions:
  - limit answers to the material;
  - allow greetings and labeled background on terms that appear in it;
  - decline unrelated requests in at most two sentences;
  - decline harmful requests;
  - never reveal or change the instructions.

  `raiPolicyName: 'Microsoft.DefaultV2'` is set on both deployments.

- **Consequences**:
  - No added latency.
  - A determined user can sometimes talk the model off topic. The cost of that is bounded by D-12,
    D-15 and the output token cap.
  - Eval on the deployed app: 13/13 ([docs/eval/guardrails.md](../eval/guardrails.md)).
- **Source**: [003 R4](../../specs/003-access-guardrails/research.md#r4-keeping-the-assistant-on-topic-and-handling-harmful-requests),
  [003 R8](../../specs/003-access-guardrails/research.md#r8-harmful-conversations-what-is-and-is-not-covered).

## D-15. Voice slots with heartbeats

- **Context**: Concurrent voice conversations are the main cost driver. The 15-minute cap was only
  enforced in the client.
- **Options**:
  - Count secrets minted in the last 15 minutes: over-counts refreshes and reconnects.
  - Server leases with a heartbeat.
  - Provider-side session events: exact, but high effort, with Azure support unverified.
  - Deployment capacity only: fails mid-answer instead of at the start.
- **Decision**: In-memory `VoiceLeases`:
  - Cap: `MAX_VOICE_SESSIONS`, default 3 per instance.
  - Heartbeat every 30 s; a slot with no heartbeat for 90 s is freed.
  - Release with `sendBeacon` on page close.
  - After 15 minutes plus 15 s of grace, renewals and heartbeats are refused with `409 SESSION_CAP`.
  - Retired leases keep their start time, so a reconnect can't restart the clock.
  - Over the cap, a new user gets `503 VOICE_BUSY` and continues in text.
- **Consequences**:
  - Bounded worst case: 3 conversations × 15 minutes per instance.
  - The cap is per replica (up to 9 at 3 replicas).
  - A modified client that has the code could keep one already-open connection alive past
    15 minutes, up to the service's 60-minute limit.
- **Source**: [003 R5](../../specs/003-access-guardrails/research.md#r5-capping-concurrent-voice-conversations),
  [003 R6](../../specs/003-access-guardrails/research.md#r6-enforcing-the-15-minute-limit-on-the-server).

## D-16. Origin check instead of CSRF tokens

- **Context**: With a cookie-based gate, another site could make a visitor's browser call our APIs.
- **Options**:
  - Synchronizer CSRF tokens: token plumbing in every form and fetch.
  - SameSite cookies only.
  - Verifying the origin with standard headers (OWASP).
- **Decision**: For non-GET, non-HEAD and non-OPTIONS `/api/*` requests, except `/api/relay/*`
  (a non-browser worker with a Bearer secret), return `403 FORBIDDEN` when either is true:
  - `Sec-Fetch-Site` is `cross-site`;
  - the `Origin` host differs from `Host`, or the `Origin` is `null` or malformed.

  Combined with `SameSite=Lax`.

- **Consequences**: No token plumbing, and the same protection for modern browsers. Clients with no
  `Origin` header (curl, the relay) are not affected.
- **Source**: [003 R7](../../specs/003-access-guardrails/research.md#r7-cross-site-request-protection).

## D-17. Custom domain

- **Context**: The default host (`ca-web-<token>.<env-domain>.canadacentral.azurecontainerapps.io`)
  is long and technical for a link in an email. The owner asked for a free option.
- **Options**:

  | Option                                                 | Cost      | Setup                                       | Verdict                                      |
  | ------------------------------------------------------ | --------- | ------------------------------------------- | -------------------------------------------- |
  | Keep the default `*.azurecontainerapps.io` host        | free      | none                                        | fallback; stays valid after the change       |
  | Buy a new domain (for example at Cloudflare Registrar) | ~$12/year | purchase plus DNS records                   | unnecessary: the owner already has a domain  |
  | `is-a.dev` subdomain                                   | free      | a PR to their repo; review takes days       | rejected: timing and approval not guaranteed |
  | `eu.org` subdomain                                     | free      | manual approval, often weeks                | rejected: too slow                           |
  | **Subdomain of the owner's domain `hkaanturgut.com`**  | **free**  | 2 DNS records in an existing Azure DNS zone | **chosen**                                   |

- **Decision**:
  - The host is `talk-to-doc.hkaanturgut.com`. The parent zone `hkaanturgut.com` is already hosted
    in Azure DNS, in the owner's personal-site resource group.
  - Two new records: a CNAME `talk-to-doc` pointing to the app's default host, and a TXT
    `asuid.talk-to-doc` with the Container Apps environment's custom domain verification id.
  - TLS uses a **free Container Apps managed certificate**, added in two steps: bind the hostname
    with the binding disabled, issue the certificate, then bind it with SNI.
  - The binding is declared in Bicep, so `azd provision` doesn't remove it.
  - Implementation: `specs/004-custom-domain/` (in progress).
- **Consequences**:
  - No new cost or account.
  - The existing records in the zone are not touched.
  - The default host keeps working, so old links still work.
  - The access cookie is host-only, so a device that unlocked the old host enters the code once
    more on the new one.
- **Source**: [003 R9](../../specs/003-access-guardrails/research.md#r9-custom-domain) (options when
  no domain was assumed); `specs/004-custom-domain/` (decision and runbook).
