# Feature Specification: Caption Relay for YouTube on the Hosted App

**Feature Branch**: `002-caption-relay`

**Created**: 2026-10-17

**Status**: Draft

**Input**: User description: "Caption relay for YouTube on the hosted app. YouTube blocks all cloud
datacenter IPs, so the hosted app cannot fetch captions; the same requests work from a home
connection. The official YouTube Data API only returns captions for videos the caller can edit, and
the owner does not want a third-party caption API. Add an owner-run caption relay on a home machine
that connects outbound only to the hosted app (no inbound tunnel, no listening port), picks up
pending caption requests, fetches the captions from the home connection, and returns them. The app
waits a bounded time for the relay, then falls back to the existing paste-transcript flow. Secret in
the vault, validated inputs and results, jobs expire, relay status visible, graceful fallback when
the relay is offline, architecture diagram and README explain the design. Interim solution."

## Clarifications

### Session 2026-10-17

Answered by the owner in chat, or decided with best-practice defaults the owner asked for ("whatever
is the best practice and secure").

- Q: Why not use a hosted caption API (e.g. Supadata)? → A: The owner prefers no third-party caption
  dependency; the relay keeps everything inside the owner's own infrastructure.
- Q: Should the relay accept inbound connections (tunnel) or only make outbound calls? → A: Outbound
  only. Nothing on the owner's machine listens for connections or is reachable from the internet.
- Q: How long does a viewer wait for the relay before the paste fallback? → A: At most 15 seconds,
  and no wait at all when the relay has not checked in recently.
- Q: Is this the long-term production design? → A: No. It is an interim solution until a hosted
  relay on a non-datacenter network or a licensed caption source exists; the README says so.

### Evidence (why this feature exists)

Probed on 2026-10-17 from a short-lived container in the same Azure region as the app, and from the
owner's home connection, for three public videos:

| Request                                         | Home connection                    | Azure                                    |
| ----------------------------------------------- | ---------------------------------- | ---------------------------------------- |
| Player metadata, 7 client types                 | captions returned (2 client types) | "Sign in to confirm you're not a bot"    |
| Watch page                                      | OK                                 | LOGIN_REQUIRED                           |
| Legacy caption endpoint                         | -                                  | empty response                           |
| Transcript panel endpoint (`get_transcript`)    | 400, needs a browser proof token   | blocked one step earlier (watch page)    |
| Official Data API `captions.download`           | 403 unless caller can edit video   | same                                     |
| Browser-side fetch from the app's own page      | caption file readable, but its address is not (player call is rejected cross-site) | - |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Load a YouTube video on the hosted app (Priority: P1)

A viewer opens the hosted app on their phone, pastes a YouTube link, and within a few seconds sees
the video's transcript preview, exactly as it works when running the app locally. They then start a
voice or text chat about the video.

**Why this priority**: This is the broken flow the owner hit during phone testing. YouTube support is
part of the brief and currently always ends in "paste the transcript" on the hosted app.

**Independent Test**: With the relay running on the owner's machine, paste
`https://www.youtube.com/watch?v=jNQXAC9IVRw` into the hosted app; the preview shows the transcript
("...the cool thing about these guys is that they have really really really long trunks...") and a
question about the video is answered from it.

**Acceptance Scenarios**:

1. **Given** the relay is running and has checked in within the last 30 seconds, **When** a viewer
   submits a public YouTube link with captions, **Then** the transcript preview appears within 15
   seconds, labelled with the video title, and the chat works as for any other document.
2. **Given** the relay is running, **When** a viewer submits a video without captions, **Then** the
   viewer sees the existing "this video has no captions" message, not the paste fallback.
3. **Given** the relay is running, **When** a viewer submits a private, removed, or invalid video,
   **Then** the viewer sees the existing "video unavailable" message.
4. **Given** two viewers submit the same video at the same time, **Then** both receive the transcript
   and the relay fetches it once.

---

### User Story 2 - Graceful fallback when the relay is offline (Priority: P1)

The owner's machine is asleep or the relay is stopped. A viewer pastes a YouTube link and gets the
paste-transcript fallback quickly, with the same guidance as today. Nothing hangs or errors.

**Why this priority**: The relay runs on a personal machine and will often be offline (reviewers may
test at any hour). The experience without it must stay exactly as good as today.

**Independent Test**: Stop the relay, wait 30 seconds, submit a YouTube link on the hosted app; the
paste tab opens with the explanation in under 5 seconds.

**Acceptance Scenarios**:

1. **Given** the relay has not checked in for more than 30 seconds, **When** a viewer submits a
   YouTube link, **Then** the app does not wait for the relay and shows the paste fallback as fast as
   it does today.
2. **Given** the relay checked in recently but does not return a result within 15 seconds (e.g. the
   machine went to sleep mid-request), **When** the wait ends, **Then** the viewer sees the paste
   fallback and the pending request is discarded.
3. **Given** the relay returns a temporary failure, **Then** the viewer sees the paste fallback.

---

### User Story 3 - Owner runs and monitors the relay (Priority: P2)

The owner starts the relay with one command on their own computer, sees each request it handles in
its terminal, and can check from anywhere whether the hosted app currently has a relay connected.

**Why this priority**: The relay only helps if it is easy to start before a demo and easy to verify.

**Independent Test**: Run the documented start command; within 30 seconds the app's health check
reports the relay as online; stop it and within 60 seconds health reports it as offline.

**Acceptance Scenarios**:

1. **Given** the owner is signed in to their cloud account on their machine, **When** they run the
   start command, **Then** the relay reads its secret from the vault (never from a file in the repo or
   a command-line argument) and starts checking in with the hosted app.
2. **Given** the relay is running, **When** it handles a request, **Then** its terminal logs the video
   ID, the outcome, and the time taken, but not the transcript text.
3. **Given** anyone requests the app's public health check, **Then** it reports whether a relay is
   online and how long since it last checked in, and nothing else about the relay.
4. **Given** the relay loses its network connection, **Then** it keeps retrying with growing delays
   and resumes on its own when the network returns.

---

### User Story 4 - Understand the design (Priority: P2)

A reviewer reading the README and the architecture diagram understands why YouTube captions need a
relay, how the relay connects, why it is secure, what it costs, and what would replace it in
production.

**Why this priority**: System design and trade-off reasoning are graded; an undocumented workaround
reads as a hack, a documented one reads as engineering judgment.

**Independent Test**: Read the README YouTube section and the diagram only; answer "why can't the
cloud app fetch captions", "what is exposed on the owner's machine" (nothing), and "what happens when
the relay is off".

**Acceptance Scenarios**:

1. **Given** the README, **Then** it shows the evidence table, the request flow, the security model,
   the offline behavior, and the production replacement options.
2. **Given** the architecture diagram, **Then** it shows the relay outside Azure with an outbound-only
   arrow to the app and an arrow to YouTube.

### Edge Cases

- Relay answers after the viewer's wait has ended: the late result is rejected and not stored.
- Relay sends a result for a request that never existed, or sends the same result twice: rejected.
- Relay sends an oversized or malformed result: rejected; the viewer gets the paste fallback.
- Wrong or missing relay secret: rejected without saying whether a relay exists, and repeated
  attempts are rate limited.
- More pending requests than the queue allows (e.g. a burst of links): extra requests skip the relay
  and go straight to the paste fallback.
- The app restarts while requests are pending: they are lost, and the viewer gets the paste fallback
  after the wait.
- The app scales to more than one instance: a relay connected to one instance cannot serve another.
  Documented as a known limit; the app runs as one instance.
- Direct fetching starts working from the cloud (e.g. YouTube changes its policy): the relay is not
  used at all.
- The relay secret is rotated in the vault: the app and the relay pick up the new value on their
  next restart.
- The relay is offline and the secret is not configured: the app behaves exactly as today.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When the existing direct caption fetch is blocked, the hosted app MUST hand the request
  to the relay if, and only if, a relay checked in within the last 30 seconds.
- **FR-002**: The app MUST wait at most 15 seconds for a relay result, then fall back to the existing
  paste-transcript flow.
- **FR-003**: The relay MUST only make outbound connections to the hosted app and to YouTube. It MUST
  NOT open a listening port or require any inbound network path to the owner's machine.
- **FR-004**: Every call from the relay to the app MUST carry a shared secret, compared in constant
  time. Missing or wrong secrets MUST be rejected with the same response, and repeated failures MUST
  be rate limited.
- **FR-005**: The shared secret MUST be stored in the vault. The app MUST receive it through its
  managed identity, and the relay MUST read it with the owner's own sign-in at start-up. It MUST NOT
  appear in the repository, in logs, in the browser, or in command-line arguments.
- **FR-006**: The app MUST hand the relay only the video ID (validated as an 11-character YouTube ID)
  and an opaque request ID. No viewer data (IP address, document content, other text) goes to the
  relay.
- **FR-007**: The app MUST accept a relay result only for a request that is currently pending, only
  once, and only within its wait window. Results MUST be schema-validated and size-capped (same
  transcript limits as other ingestion paths).
- **FR-008**: Relay outcomes MUST map to the existing viewer-facing states: transcript loaded, no
  captions, video unavailable, or paste fallback for blocked or temporary failures.
- **FR-009**: Concurrent requests for the same video MUST share one relay request.
- **FR-010**: The number of pending relay requests MUST be capped; requests over the cap MUST skip
  the relay.
- **FR-011**: The public health check MUST report the relay as online or offline and the seconds since
  its last check-in, and nothing else about it.
- **FR-012**: The relay MUST start with one documented command, retry with backoff when the app is
  unreachable, process requests one at a time, and log the video ID, outcome, and duration, but never
  the transcript text or the secret.
- **FR-013**: The feature MUST be off unless the secret is configured. With it off, the app MUST
  behave exactly as before this feature.
- **FR-014**: The README and architecture diagram MUST explain the problem (with the evidence), the
  outbound-only design, the security model, the offline behavior, the single-instance limit, and
  the production replacements.
- **FR-015**: The browser MUST NOT learn anything new: no relay secret, no relay address, no new
  client-side calls. The viewer's only change is that YouTube links work when the relay is online.

### Key Entities

- **Caption request**: one pending ask for a video's captions. Has an opaque ID, the video ID, the
  time it was created, and its expiry (15 seconds). Viewers waiting on the same video share it.
- **Relay result**: the relay's answer to one caption request: either a transcript (text, language,
  whether auto-generated, duration, title) or a failure kind (no captions, unavailable, blocked,
  temporary).
- **Relay presence**: when the relay last checked in. Drives "online" (checked in within 30 seconds)
  in the health check and in FR-001.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With the relay online, at least 9 of 10 public captioned YouTube videos load their
  transcript on the hosted app, each within 15 seconds (target: under 5 seconds).
- **SC-002**: With the relay offline, the paste fallback appears within 5 seconds, the same as before
  this feature.
- **SC-003**: A network scan of the owner's machine while the relay runs shows no new listening port.
- **SC-004**: Requests with a wrong secret, an unknown or expired request ID, a duplicate result, or an
  oversized result are rejected in 100% of automated test cases.
- **SC-005**: The health check reflects relay start and stop within 60 seconds.
- **SC-006**: A reviewer can answer "why a relay", "what is exposed", and "what if it is off" from the
  README alone.

## Assumptions

- The owner's home machine has a residential connection that YouTube does not block (verified on
  2026-10-17).
- The owner has a cloud sign-in with read access to the vault on that machine; no new accounts are
  needed.
- The hosted app runs as a single instance (already true for the in-memory document store), so a
  relay connected to it sees every pending request.
- The relay is an owner-operated tool for demos and evaluation, not a supported production
  component. Fetching captions for public videos from a home connection uses the same requests as
  running the app locally.
- One relay at a time is enough; a second relay with the same secret works but is not required.
- Existing limits (transcript size, ingest rate limit per viewer) apply unchanged to relay results.
