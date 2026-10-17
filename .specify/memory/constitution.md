# Talk to a Document Constitution

## Core Principles

### I. Security First (NON-NEGOTIABLE)

- API keys and long-lived secrets MUST NOT reach the browser, the client bundle, logs, or git history.
- The browser MUST only receive short-lived ephemeral Realtime tokens, minted by a server route.
- Server-side Azure auth MUST use `DefaultAzureCredential`: Managed Identity in Azure, `az login`
  locally. No Azure OpenAI API keys.
- Any other secret (e.g. YouTube proxy credentials) MUST live in Azure Key Vault and reach the app
  through Managed Identity or a Key Vault reference.
- Only `.env.example` with placeholder values is committed. A gitleaks scan of the full history MUST
  pass before the repository is made public.

Rationale: secret management is an explicit review criterion, and the repo becomes public.

### II. Mobile-First

- Every screen MUST be designed and verified at a 390px viewport, with iOS Safari as the primary
  target browser.
- Microphone capture and audio playback MUST start only from a user gesture.
- Every capability MUST have a usable fallback: no microphone or denied permission switches to text
  chat; ingestion failures show a recoverable state.
- Controls (start, stop, mute) and connection status MUST stay visible and reachable one-handed.

Rationale: reviewers test on a phone, under poor network conditions.

### III. Strict TypeScript and Validated Boundaries

- TypeScript `strict` mode MUST be on. `any` is allowed only with an inline comment explaining why.
- Every external boundary (API route input, upstream API response, Realtime data channel event,
  environment variables) MUST be validated with a runtime schema (e.g. zod).

Rationale: typed, validated boundaries make the code reviewable and failures predictable.

### IV. Small, Testable Modules

- Ingestion (PDF, YouTube), session/token issuance, and the Realtime client MUST be separate
  modules with explicit interfaces and no UI imports in server logic.
- Pure logic (URL parsing, text normalization, truncation, token handling) MUST have Vitest unit
  tests. API routes MUST have integration tests. Critical user flows MUST have Playwright tests at a
  mobile viewport.
- External services MUST be behind an interface so tests can substitute fakes.

Rationale: modularity and tests are scored under Code Quality and System Design.

### V. Fail Visibly

- Every known edge case MUST map to a clear user-facing state: invalid or unsupported URL, video
  without captions, scanned or empty PDF, password-protected PDF, file over 25 MB, context
  truncation, microphone denied, network loss, reconnecting, token expiry.
- Errors MUST NOT be swallowed. Server errors MUST be logged with context (no secrets, no document
  content) to Application Insights.

Rationale: ingestion edge cases and poor-network behavior are explicitly tested by reviewers.

### VI. Infrastructure as Code

- All Azure resources MUST be defined in Bicep and deployed with `azd`. Manual portal changes are
  not allowed; drift is fixed in code.
- CI/CD MUST use GitHub Actions with OIDC federation. No stored cloud credentials in GitHub.
- Role assignments use least privilege (e.g. `Cognitive Services OpenAI User` for the app identity).

Rationale: one-command, reproducible deployment is part of the System Design story.

### VII. Always Shippable

- Each task MUST be small enough for a short work session and MUST leave `main` building, tested,
  and deployable.
- All changes reach `main` through pull requests with passing checks.

Rationale: work happens in short async sessions while travelling.

### VIII. README-Driven, English-Only

- Code, comments, docs, commit messages, and Azure resource names MUST be in English.
- The README MUST cover setup, environment configuration, architecture, trade-offs, and how AI
  tools were used, and MUST be updated in the same pull request as the behavior it describes.

Rationale: the README and walkthrough are graded deliverables.

### IX. Simplicity (YAGNI)

- Build only what the brief requires plus explicitly agreed bonus items.
- No speculative abstractions. The `REALTIME_PROVIDER` toggle (azure | openai) is the only planned
  provider abstraction.
- Storage stays in-memory or lightweight (e.g. SQLite). No user auth.

Rationale: a focused, polished scope scores better than a broad, rough one.

## Technology and Platform Constraints

- Frontend and backend: Next.js App Router, React, TypeScript, Node runtime for API routes.
- Voice: Realtime API over WebRTC. The browser connects directly to the model with an ephemeral
  token; the server never proxies audio.
- Model: Microsoft Foundry (Azure OpenAI API) gpt-realtime, Global Standard, by default; OpenAI
  direct only behind `REALTIME_PROVIDER=openai`.
- Hosting: Azure Container Apps, image in Azure Container Registry, observability in Application
  Insights, secrets in Key Vault.
- Azure resources live only in the personal sponsor subscription. No employer or client resources.

## Development Workflow and Quality Gates

- Spec-driven: constitution, spec, plan, and tasks are approved by the owner before implementation
  starts. Implementation follows the approved tasks.
- Every pull request MUST pass: type-check, lint, unit and integration tests, and build.
- Before submission: gitleaks history scan, Playwright mobile run, deployed smoke test, README and
  architecture diagram current.
- Questions for the client (Genius) are raised in Slack with context, options, a recommendation, and
  the assumed default, rather than guessed silently.

## Governance

- This constitution overrides other practices in this repository. Specs, plans, tasks, and reviews
  MUST check compliance with it; any deviation MUST be justified in the plan.
- Amendments require a pull request that updates this document and its version.
- Versioning follows semver: MAJOR for removing or redefining a principle, MINOR for adding or
  materially expanding one, PATCH for wording fixes.

**Version**: 1.0.0 | **Ratified**: 2026-10-16 | **Last Amended**: 2026-10-16
