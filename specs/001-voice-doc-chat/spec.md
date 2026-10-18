# Feature Specification: Voice Chat with a Document or YouTube Video

**Feature Branch**: `001-voice-doc-chat`

**Created**: 2026-10-16

**Status**: Draft

**Input**: User description: "Mobile-first web app where users interact with a PDF or YouTube video through
live voice conversation. Ingest a PDF (up to 25 MB) or a YouTube URL (via its captions), show the
extracted text in a collapsible preview, use it as context for a live spoken conversation with
interruptions and a live transcript, fall back to text chat without a microphone, and keep all
credentials off the client."

## Clarifications

### Session 2026-10-16

Answered by the owner's delegate using best-practice defaults (owner asked for assumptions instead of
questions). Items that are really the client's call are also raised with Genius in Slack.

- Q: How long is a loaded document kept, and does it survive a page reload? → A: Kept in server
  memory for 60 minutes after last use; a page reload starts fresh (no persistence).
- Q: Is there a maximum length for one voice session? → A: Yes, 15 minutes per session, with a
  warning at 13 minutes; the user can start a new session on the same document.
- Q: How long does the app keep retrying after a connection drop? → A: Up to 30 seconds with
  backoff (about 1, 2, 4, 8 seconds), then show "Disconnected" with a manual "Reconnect".
- Q: How many voice sessions can one visitor start in a short time? → A: At most 10 session
  starts per minute per client; more returns "Too many attempts, wait a moment".
- Q: In the hosted app, where do YouTube captions come from if direct fetching is blocked? → A: Try
  direct fetch first, then an optional configured caption provider, then offer paste-transcript.
  Update 2026-10-17: Azure is fully blocked, so feature
  [002-caption-relay](../002-caption-relay/spec.md) adds an outbound-only owner-run relay to the chain.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Talk to a PDF by voice on a phone (Priority: P1)

A user opens the app on their phone, uploads a PDF, sees that its text was extracted, taps
"Start Voice Chat", asks questions out loud, and hears spoken answers grounded in the document. They
can interrupt the assistant mid-answer and ask a follow-up, and they see a live text transcript of
both sides.

**Why this priority**: This is the core value of the product and the riskiest flow (live audio on a
mobile browser). Without it, nothing else matters.

**Independent Test**: On a phone at ~390px width, upload a known PDF, start a voice chat, ask a
question whose answer is only in the PDF, interrupt the answer, ask a follow-up. Delivers a complete
"talk to my document" experience.

**Acceptance Scenarios**:

1. **Given** a text-based PDF under 25 MB, **When** the user uploads it, **Then** the app shows the
   document name, page count, a character/word count, and a collapsed preview of the extracted text
   that can be expanded.
2. **Given** a document is loaded, **When** the user taps "Start Voice Chat" and grants microphone
   access, **Then** the status changes to "Connecting" then "Live", and the assistant greets the
   user with spoken audio that references the loaded document.
3. **Given** a live session, **When** the user asks a question answered in the document, **Then** the
   assistant answers aloud using document content, and both the user's words and the assistant's
   words appear in the on-screen transcript as they are spoken.
4. **Given** the assistant is speaking, **When** the user starts talking, **Then** the assistant stops
   speaking promptly, the cut-off answer is marked as interrupted in the transcript, and the
   assistant responds to the new question.
5. **Given** a live session, **When** the user taps "Mute", **Then** no user audio is sent until they
   tap "Unmute", and the mute state is clearly visible.
6. **Given** a live session, **When** the user taps "Stop", **Then** the session ends, the microphone
   is released (the browser's recording indicator turns off), and the transcript stays on screen.

---

### User Story 2 - Talk to a YouTube video (Priority: P2)

A user pastes a YouTube link, the app fetches the video's captions, shows the video title and the
transcript preview, and the user holds the same voice conversation about the video.

**Why this priority**: Required by the brief and part of the reviewer script, but it reuses the whole
conversation flow from Story 1. The only new part is ingestion.

**Independent Test**: Paste a URL of a public video known to have captions, confirm the transcript
preview, start a voice chat, and ask about something said in the video.

**Acceptance Scenarios**:

1. **Given** a valid YouTube URL in any common format (standard watch link, short link, Shorts link,
   embed link, link with timestamp or playlist parameters), **When** the user submits it, **Then**
   the app shows the video title, its duration if available, and a collapsible transcript preview.
2. **Given** a video with captions only in a non-English language, **When** the user submits it,
   **Then** the app uses the available captions and states which language was used.
3. **Given** the transcript is loaded, **When** the user starts a voice chat, **Then** the assistant
   answers questions about the video's content the same way as for a PDF.
4. **Given** the deployed environment cannot fetch captions for a video, **When** the user submits the
   URL, **Then** the app explains why and offers to paste the transcript text manually, which then
   works the same as fetched captions.

---

### User Story 3 - Text chat when voice is not available (Priority: P3)

A user without a microphone, who denies microphone permission, or who is in a quiet place, chats
with the document by typing instead, and reads the answers.

**Why this priority**: Required fallback. It keeps the product usable for everyone and protects the
demo if voice fails.

**Independent Test**: Deny microphone permission (or choose text mode), type a question about the
loaded document, and receive a text answer grounded in it.

**Acceptance Scenarios**:

1. **Given** the user denies microphone permission or no microphone exists, **When** they try to start
   voice chat, **Then** the app explains what happened, how to re-enable the microphone, and switches
   to text chat without losing the loaded document.
2. **Given** text chat mode, **When** the user sends a typed question, **Then** the answer streams in
   as text in the same conversation view.
3. **Given** a live voice session, **When** the user types a message instead of speaking, **Then** the
   assistant responds to it within the same conversation.

---

### User Story 4 - Stay connected on a poor network (Priority: P4)

A user on a weak mobile connection keeps their conversation going: the app shows when the connection
is degraded or lost, tries to reconnect on its own, and keeps the transcript and document context.

**Why this priority**: Explicitly tested by reviewers, but it builds on a working Story 1.

**Independent Test**: During a live session, throttle or cut the network for 10 to 30 seconds, then
restore it.

**Acceptance Scenarios**:

1. **Given** a live session, **When** the connection drops, **Then** the status shows "Reconnecting"
   within 5 seconds and the app retries automatically with increasing delays.
2. **Given** the connection comes back within the retry window, **When** reconnection succeeds,
   **Then** the session resumes with the same document context, the prior transcript is kept, and
   the assistant is made aware of the conversation so far.
3. **Given** reconnection keeps failing, **When** the retry window ends, **Then** the app stops
   retrying, shows "Disconnected" with a "Reconnect" button, and offers text chat.
4. **Given** a long session, **When** the session's access credential expires, **Then** the app gets a
   new one without asking the user to do anything beyond a possible brief "Reconnecting" state.

---

### Edge Cases

- **PDF over 25 MB**: rejected before upload where possible, otherwise by the server, with a message
  stating the limit and the file's size.
- **Not a PDF** (wrong type or renamed file): rejected with "This file is not a valid PDF".
- **Password-protected PDF**: rejected with a message asking for an unprotected copy.
- **Scanned or image-only PDF** (no extractable text): the user is told no text was found and that
  scanned documents are not supported (or are processed with text recognition if that option is
  enabled).
- **Corrupt PDF**: rejected with a clear message, no crash.
- **Very large text** (more than the conversation can hold): the text is truncated, the preview shows
  exactly where it was cut, and a visible warning states the percentage of the document used.
- **Invalid YouTube URL** or a non-YouTube URL: rejected with an example of a valid link.
- **Video without captions**, private, age-restricted, removed, or a live stream: specific message per
  case where it can be told apart (removed/private vs no captions vs fetch blocked; live streams and
  age-restricted videos fall into the closest of these), plus the paste-transcript option.
- **Very long video transcript**: same truncation rule as large PDFs.
- **Replacing content**: loading a new document while a session is live ends the current session
  after the user confirms, then uses the new document.
- **Double taps / rapid start-stop**: only one session can exist at a time; controls are disabled while
  connecting or stopping.
- **App goes to background or screen locks on mobile**: the session either continues or ends cleanly
  and shows what happened when the user returns, never a silent broken state.
- **Audio blocked until user interaction (mobile browsers)**: audio playback only begins from the
  user's tap on "Start Voice Chat".
- **Bluetooth headset or speaker switch mid-session**: conversation keeps working with the new device
  or shows how to recover.
- **Upstream service unavailable or rate limited**: user sees "Voice service is busy, try again in a
  moment" and can retry. (Text chat uses the same service, so it is not offered as the fix here.)

## Requirements *(mandatory)*

### Functional Requirements

**Ingestion**

- **FR-001**: Users MUST be able to upload a PDF up to 25 MB from their device, including from a
  phone's file picker.
- **FR-002**: The system MUST extract the PDF's text on the server and return it to the user.
- **FR-003**: Users MUST be able to submit a YouTube URL; the system MUST fetch the video's captions
  on the server and use them as the transcript.
- **FR-004**: The system MUST accept YouTube URLs in standard, short, Shorts, embed, and mobile
  formats, with or without extra parameters.
- **FR-005**: Caption fetching MUST try a direct fetch first, then an optional configured caption
  provider. When both fail, users MUST be able to paste a transcript manually and continue.
- **FR-006**: The system MUST show the extracted text in a collapsible preview, collapsed by default,
  with source name, size (pages or duration), and character or word count.
- **FR-007**: The system MUST validate inputs and show a specific, actionable message for each edge
  case listed above.
- **FR-008**: The system MUST indicate progress during upload and extraction.

**Conversation context**

- **FR-009**: The system MUST use the extracted text as the knowledge context of the conversation,
  without requiring chunking, summarization, or citations.
- **FR-010**: When the text exceeds what the conversation can hold, the system MUST truncate it, keep
  the beginning of the document, and show a visible warning with the share of the document used.
- **FR-011**: The assistant MUST prefer answers from the loaded content and MUST say when the content
  does not contain the answer.

**Voice conversation**

- **FR-012**: Users MUST be able to start a live voice session with a single "Start Voice Chat" action.
- **FR-013**: Users MUST hear spoken answers with low enough delay to feel conversational (see
  SC-003).
- **FR-014**: Users MUST be able to interrupt the assistant by speaking; the assistant MUST stop and
  respond to the new input.
- **FR-015**: The system MUST show a live text transcript of both the user's and the assistant's
  speech, updated as speech happens, with clear speaker labels.
- **FR-016**: Users MUST be able to mute and unmute their microphone and stop the session at any time.
- **FR-017**: The system MUST show the session state at all times: idle, requesting microphone,
  connecting, live (with sub-states listening, thinking, assistant speaking), reconnecting,
  disconnected, error. Muted is shown as a separate indicator alongside the state.
- **FR-018**: The system MUST release the microphone when the session stops or the page is closed.
- **FR-030** *(added in clarification)*: A voice session MUST end after 15 minutes, with a visible warning at 13 minutes; the
  user can start a new session on the same document.

**Fallback and resilience**

- **FR-019**: The system MUST offer text chat when the microphone is unavailable or denied, and as a
  user choice at any time.
- **FR-020**: The system MUST detect connection loss, show it, and retry automatically with backoff
  for up to 30 seconds, then let the user reconnect manually.
- **FR-021**: After reconnecting, the system MUST keep the document context and the transcript.
- **FR-022**: The system MUST renew session credentials when they expire without exposing any
  long-lived credential to the user's device.

**Security and data**

- **FR-023**: No long-lived credential or secret MUST ever be sent to or stored on the user's device;
  the device only receives short-lived, single-session access.
- **FR-024**: The system MUST limit session starts to 10 per minute per client and MUST show a
  "Too many attempts" message beyond that. (The limit is counted per server instance; with up to 3
  instances the worst case is 30 per minute, an accepted trade-off.)
- **FR-025**: Uploaded files MUST NOT be stored after extraction. Extracted text MUST be kept only in
  server memory and discarded 60 minutes after last use. Nothing persists across a page reload.
- **FR-026**: The system MUST NOT require user accounts or sign-in.

**Interface**

- **FR-027**: The interface MUST be designed for a ~390px wide phone screen first and remain usable
  on larger screens.
- **FR-028**: Primary controls MUST be reachable with one thumb and have touch targets of at least
  44x44 points.
- **FR-029**: The interface MUST meet basic accessibility: readable contrast, labels on all controls,
  and state changes announced to screen readers.

### Key Entities

- **Source Document**: content the user loaded. Attributes: type (PDF, YouTube, pasted), title or
  file name, size (pages or duration), extracted text, character count, truncated flag and share
  used, caption language (YouTube), load time.
- **Conversation Session**: one live voice or text exchange about a Source Document. Attributes:
  mode (voice or text), state (see FR-017), start time, number of reconnects.
- **Transcript Entry**: one turn in a session. Attributes: speaker (user, assistant, or system notice
  such as "Reconnected"), text, status (in progress, final, interrupted), time.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time user on a phone goes from opening the app to hearing the first spoken answer
  about their PDF in under 60 seconds (excluding upload time on slow networks).
- **SC-002**: A 10 MB text PDF is extracted and previewed in under 10 seconds on a typical connection.
- **SC-003**: The assistant's spoken reply starts within 1.5 seconds of the user finishing a question
  in at least 90% of turns on a normal connection.
- **SC-004**: When the user interrupts, assistant audio stops within 500 ms in at least 90% of cases.
- **SC-005**: For 10 test questions answerable from a loaded document, at least 9 answers are
  correct and grounded in the content.
- **SC-006**: After a network drop of up to 15 seconds, the session recovers without a page reload in
  at least 4 of 5 attempts, with the transcript intact.
- **SC-007**: 100% of the listed edge cases produce a specific, readable message; none produce a
  blank screen, a frozen state, or a raw error.
- **SC-008**: All primary flows work on current iOS Safari and Android Chrome at a 390px viewport with
  no horizontal scrolling.
- **SC-009**: A full security review of the delivered app and its source history finds zero
  long-lived credentials on the client or in the repository.
- **SC-010**: PDF ingestion and voice chat work in the publicly hosted app; YouTube ingestion works in
  at least the local environment, with the deployed behavior documented.

## Assumptions

- Users are anonymous visitors; one person uses one session at a time. No accounts, history, or
  sharing are needed.
- One source document is active per session. Loading a new one replaces it. Multi-document chat is
  out of scope.
- Conversation language follows the user: the assistant replies in the language the user speaks,
  defaulting to English.
- The full conversation-ready text is the beginning of the document when truncation is needed; smarter
  selection (search, summaries) is out of scope per the brief.
- Scanned PDFs are not required; supporting them with text recognition is an optional enhancement.
- YouTube captions from the deployed (cloud) environment may be blocked by YouTube; a local demo plus
  a documented paste-transcript fallback meets the requirement, and working deployed fetching is a
  bonus.
- Documents live in server memory for 60 minutes after last use; nothing is retained after.
- Expected load is a small number of reviewers at once, not public-scale traffic, but the design must
  not prevent scaling out.
- Reviewers use recent iOS Safari and Android Chrome; older browsers without live audio support get
  text chat.
- "Normal" or "typical" connection in the success criteria means Wi-Fi or 4G/LTE with at least
  10 Mbps down and under 100 ms round-trip time. "Poor network" means 3G-like or intermittent loss.
- "MB" means 1,048,576 bytes throughout (so 25 MB = 26,214,400 bytes).
