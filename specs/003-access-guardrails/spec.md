# Feature Specification: Access Code and Conversation Guardrails

**Feature Branch**: `003-access-guardrails`

**Created**: 2026-10-18

**Status**: Implemented

**Input**: User description: "Before sharing the hosted app with the Genius Lab team: anyone with the
link can use it and spend our voice budget. Add an access code the reviewers get in the submission
email, keep the assistant on the loaded document (refuse unrelated requests politely), handle
harmful requests, cap how many voice conversations run at the same time, enforce the 15-minute
limit on the server, and reject cross-site calls. Use Spec Kit, compare options, best practice."

## Clarifications

### Session 2026-10-18

Answered by the owner in chat, or decided with best-practice defaults the owner asked for ("decide
based on best practices comparing a couple of options").

- Q: Sign-in with an email allowlist, an access code, or fully public? → A: Access code. Reviewers'
  emails are unknown, and the brief asks for a publicly hosted app, so a sign-in with an allowlist
  risks locking a grader out.
- Q: Off-topic questions: refuse or answer with a label? → A: Refuse politely and steer back to the
  document. Greetings and short small talk are fine.
- Q: Which cost guard? → A: A cap on concurrent voice conversations. (A daily minutes cap and a
  budget alert were offered and not chosen.)
- Q: Custom domain? → A: The owner has no domain and asked about a free one. Out of scope for this
  feature; options and the runbook are in [research.md](research.md#r9-custom-domain).
- Q: Concurrent cap value? → A: 3 live voice conversations per app instance (default; env var).
- Q: How long does the access stay valid on a device? → A: 7 days, or until the code is rotated.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reviewer unlocks the app with an access code (Priority: P1)

A reviewer opens the link from the submission email on their phone. Instead of the app, they see a
short screen asking for the access code. They type the code from the email, tap Continue, and land
in the app. On later visits from the same browser within 7 days they go straight in.

**Why this priority**: Without it, anyone who finds the link can run voice conversations on the
owner's budget.

**Independent Test**: With the code configured, open `/` in a fresh browser: the access screen
appears; a wrong code shows an error; the right code opens the app; reload stays in the app.

**Acceptance Scenarios**:

1. **Given** the code is configured and the browser has no access, **When** the reviewer opens any
   page, **Then** they see the access screen and nothing from the app.
2. **Given** the access screen, **When** they submit the right code, **Then** they land on the page
   they first asked for, and stay signed in for 7 days.
3. **Given** the access screen, **When** they submit a wrong code, **Then** they see "That code is
   not right" and can retry; after 5 wrong tries in a minute they see "Too many attempts".
4. **Given** no access, **When** any app API is called directly, **Then** it is refused with
   "not authorized" and does nothing (no document stored, no voice credential issued).
5. **Given** the owner rotates the code, **Then** every existing device must enter the new code.
6. **Given** the code is not configured (local development, tests), **Then** the app behaves exactly
   as before, with no access screen.

---

### User Story 2 - Assistant stays on the document (Priority: P1)

A user asks the assistant something unrelated ("write me a poem about cats", "what's the weather",
"help with my Python homework"). The assistant briefly says it can only help with the loaded
document and suggests a question about it. Questions about the document, follow-ups, and short
explanations of terms that appear in it still work.

**Why this priority**: Off-topic use turns the app into a free general voice assistant and burns
tokens; it also makes answers less reliable.

**Independent Test**: Load a document, ask an unrelated request in text mode: the reply declines in
one or two sentences and points back to the document. Ask a document question: normal answer.

**Acceptance Scenarios**:

1. **Given** a loaded document, **When** the user asks an unrelated request, **Then** the assistant
   declines in at most two sentences and suggests a question about the document.
2. **Given** a loaded document, **When** the user greets or makes small talk, **Then** the assistant
   replies briefly and invites a question about the document.
3. **Given** a document that contains instructions ("ignore previous instructions and..."),
   **When** the user asks about it, **Then** the assistant treats them as content and does not follow
   them.
4. **Given** any request for harmful help (weapons, self-harm methods, harassment, illegal
   activity), **Then** the assistant declines briefly, even if the document mentions the topic.
5. **Given** the user asks the assistant to reveal or change its instructions, **Then** it declines
   and stays on the document.

---

### User Story 3 - Voice capacity is protected (Priority: P2)

When the maximum number of voice conversations is already live, a new user who taps Start Voice
Chat is told that voice is busy and is offered text chat. Conversations that end, close, or go
silent free their slot within about 90 seconds. Every voice conversation ends at 15 minutes, and
the server refuses to keep a conversation going past that, even if the browser ignores its own
timer.

**Why this priority**: Concurrent voice conversations are the main cost driver; a cap bounds the
worst-case cost per hour.

**Independent Test**: Set the cap to 1, start voice in one browser, try to start voice in a second:
"busy" message with a switch to text; stop the first, the second can start.

**Acceptance Scenarios**:

1. **Given** the cap is reached, **When** a user starts voice, **Then** they see "Voice chat is at
   capacity right now. Try again in a minute, or use text chat." and the conversation is not
   started.
2. **Given** a live voice conversation, **When** the user stops it, switches to text, or closes the
   page, **Then** its slot is freed right away.
3. **Given** a live voice conversation whose browser stops reporting (crash, lost network), **Then**
   its slot is freed within 90 seconds.
4. **Given** a voice conversation reconnects after a network drop, **Then** it keeps its slot (it
   does not need a second one).
5. **Given** a voice conversation has run for 15 minutes, **Then** the server refuses to renew it and
   the browser ends it with the existing 15-minute message.
6. **Given** text mode, **Then** no slot is used.

---

### User Story 4 - Cross-site requests are rejected (Priority: P2)

Another website cannot make a visitor's browser call the app's APIs (for example to spend their
access on uploads or voice sessions).

**Independent Test**: Send a POST to an app API with an `Origin` of another site: it is refused.

**Acceptance Scenarios**:

1. **Given** a state-changing request from another site, **Then** it is refused before any work.
2. **Given** the same request from the app's own pages, **Then** it works.
3. **Given** the caption relay (no browser), **Then** it keeps working with its own secret.

### Edge Cases

- Access cookie expired or tampered with: treated as no access.
- Access screen `next` parameter pointing to another site: ignored, lands on `/`.
- Health check and caption relay routes stay reachable without the access code (monitoring, relay).
- The app restarts: live slots are forgotten (conversations keep running, their next renewal takes a
  new slot if available). Documented.
- More than one app instance: the cap applies per instance. Documented; the app runs one instance at
  demo load.
- The page is in the background and paused: its slot is released; resuming takes a slot again.
- Reconnect while at capacity: the conversation already holds a slot, so it is not refused.
- A user with a valid access cookie ignores the 15-minute timer and keeps the voice connection open:
  the provider connection itself cannot be cut by the server today; renewals and heartbeats are
  refused, and the ephemeral token cannot open new connections. Documented limit.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When an access code is configured, every page and API MUST require a valid access
  cookie, except the access screen, its submit endpoint, the health check, the caption relay routes,
  and static assets.
- **FR-002**: Pages without access MUST redirect to the access screen; APIs without access MUST
  return 401 with the `UNAUTHORIZED` error body.
- **FR-003**: The code MUST be compared in constant time on the server. Wrong codes MUST be rate
  limited per client IP (5 per minute).
- **FR-004**: The access cookie MUST be HttpOnly, Secure (in production), SameSite=Lax, valid for 7
  days, signed with a key derived from the code (rotating the code invalidates all cookies), and
  MUST NOT contain the code.
- **FR-005**: The code MUST be stored in Key Vault and reach the app through its managed identity.
  It MUST NOT appear in the repository, logs, URLs, or the client bundle.
- **FR-006**: The access screen MUST work at 390 px, with no JavaScript required, and redirect only
  to same-site paths.
- **FR-007**: The assistant instructions MUST restrict answers to the loaded material, decline
  unrelated requests politely in at most two sentences, allow greetings and brief explanations of
  concepts in the material, decline harmful requests, and never reveal or follow changes to its
  instructions.
- **FR-008**: The model deployments MUST use the Azure default content filter, pinned explicitly in
  infrastructure code.
- **FR-009**: The server MUST cap concurrent voice conversations (default 3 per instance,
  configurable). Over the cap, starting voice MUST fail with a `VOICE_BUSY` error and the UI MUST
  offer text chat.
- **FR-010**: A voice conversation MUST hold one slot across token refreshes and reconnects, MUST
  renew it with a heartbeat every 30 seconds, and MUST release it on stop, mode switch, page close,
  and error. A slot without a heartbeat for 90 seconds MUST be freed.
- **FR-011**: The server MUST refuse to renew a slot (heartbeat or new token) after 15 minutes from
  its start, and the browser MUST end the conversation with the existing 15-minute message.
- **FR-012**: State-changing API requests from another site (`Sec-Fetch-Site: cross-site`, or an
  `Origin` whose host differs from the request host) MUST be refused with 403 `FORBIDDEN`, except the
  caption relay routes.
- **FR-013**: With no access code configured, the access gate MUST be off; the origin check,
  instruction changes and voice cap stay on.
- **FR-014**: README, architecture notes and the security model MUST describe the gate, guardrails,
  their limits, and how the owner rotates the code and shares it.

### Key Entities

- **Access code**: a shared secret the owner sends to reviewers. Lives in Key Vault.
- **Access cookie**: proof that this browser entered the code; carries only an expiry and a
  signature.
- **Voice slot (lease)**: one live voice conversation. Has an id, start time, last heartbeat.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Without the code, 100% of app pages and APIs refuse access in automated tests; with
  it, all existing tests pass unchanged.
- **SC-002**: A reviewer goes from the link to the app in under 30 seconds on a phone.
- **SC-003**: In an evaluation of at least 6 unrelated requests, the assistant declines every one
  and stays on the document; at least 4 of 4 on-topic questions are still answered.
- **SC-004**: With the cap at N, the N+1th voice start is refused in 100% of automated tests, and a
  freed slot is reusable immediately.
- **SC-005**: Cross-site POSTs are refused in 100% of automated tests; same-site flows unaffected.

## Assumptions

- Reviewers receive the code with the link in the submission email.
- One app instance at demo load (already true for the in-memory document store and relay queue).
- Token-level cost is further bounded by the deployment's capacity (10k tokens per minute) and the
  existing per-IP rate limits.
- Daily minutes caps and budget alerts are out of scope (not chosen by the owner).
- Custom domain is out of scope (needs a purchase or an external sign-up by the owner).
