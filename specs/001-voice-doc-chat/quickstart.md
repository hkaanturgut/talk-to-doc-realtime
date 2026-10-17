# Quickstart and Validation Guide

These are runnable checks that prove the feature end to end. Contracts:
[contracts/api.md](contracts/api.md), [contracts/realtime-events.md](contracts/realtime-events.md).

## Prerequisites

- Node.js 24, npm 11; Azure CLI and azd 1.36+; Docker (only if `remoteBuild` falls back to a local build)
- An Azure subscription where you can create resources and role assignments
- iPhone with iOS Safari 17+ (the voice checks need HTTPS, so use the deployed URL)

## 1. Provision and deploy

```bash
az login --tenant <tenant-id>
azd auth login --tenant-id <tenant-id>
azd env new talk-to-doc-dev --subscription <sub-id> --location canadacentral
azd up                                   # provisions infra/ and deploys the container
azd env get-value SERVICE_WEB_URI        # → https://ca-web-xxxx.canadacentral.azurecontainerapps.io
```

Expected:
- `GET <uri>/api/health` returns `{"status":"ok"}`.
- The Foundry account shows deployments `gpt-realtime-2.1` and `gpt-4o-mini-transcribe`.
- Local auth is disabled on the Foundry account.

## 2. Run locally

```bash
cp .env.example .env.local
azd env get-values | grep -E 'AZURE_OPENAI_(ENDPOINT|REALTIME_DEPLOYMENT|TRANSCRIBE_DEPLOYMENT)' >> .env.local
npm ci
npm run dev                              # http://localhost:3000 (mic works on localhost)
```

Your `az login` identity was granted `Cognitive Services OpenAI User` by `azd provision`, so no keys
are needed.

## 3. Automated checks

```bash
npm run typecheck && npm run lint
npm test                 # Vitest unit + integration
npm run test:e2e         # Playwright: iPhone 15 (WebKit) + Pixel 7 (Chromium), mocked realtime
gitleaks git -v .        # full-history secret scan, must report 0 leaks
```

## 4. Manual validation on a real phone (deployed URL)

| # | Scenario | Expected |
|---|---|---|
| M1 | Upload a 2 to 10 MB text PDF | preview within 10 s, collapsed, shows pages and char count |
| M2 | Start Voice Chat, allow mic | Connecting → Live within ~3 s; spoken greeting naming the document |
| M3 | Ask a question answered on page 3 | correct spoken answer; both sides appear in transcript live |
| M4 | Interrupt mid-answer and ask a follow-up | audio stops in under 0.5 s; entry marked interrupted; new answer follows |
| M5 | Mute, speak, unmute | nothing transcribed while muted; badge shows Muted |
| M6 | Stop | mic indicator off; transcript kept |
| M7 | Paste a YouTube URL with captions (local first, then deployed) | title + transcript preview; voice works the same |
| M8 | youtu.be, Shorts, `&t=` and `&list=` links | all accepted |
| M9 | Deny mic permission | explanation + text mode; typed question answered |
| M10 | Airplane mode for 15 s during Live, then back; repeat 5 times | Reconnecting within 5 s → Live in at least 4 of 5; transcript intact (SC-006) |
| M11 | Airplane mode for 40 s | Disconnected + Reconnect button + text option |
| M12 | Password PDF, scanned PDF, 30 MB file, .docx renamed to .pdf | specific messages, no crash |
| M13 | 300-page PDF | truncation warning with percentage and page range |
| M14 | Safari Web Inspector → Network | no API key or Entra token anywhere; only `ek_` secret on `/api/session` |
| M15 | Disconnect a Bluetooth headset during Live | conversation continues on the phone mic/speaker, or a clear "microphone changed" notice |
| M16 | Grounding eval: 10 prepared questions on the sample PDF (`docs/eval/questions.md`) | at least 9 correct and grounded (SC-005) |
| M17 | Latency: open `?debug=1`, ask 10 questions, interrupt 10 times | panel shows p90 reply start ≤ 1.5 s (SC-003) and p90 interrupt stop ≤ 500 ms (SC-004) |

Record results (device, iOS version, network) in the PR that closes the story.

## 5. Security spot checks

```bash
DOC=00000000-0000-4000-8000-000000000000   # valid uuid that is not in the store
curl -s -X POST <uri>/api/session -H 'content-type: application/json' -d "{\"documentId\":\"$DOC\",\"mode\":\"voice\"}"
# → 404 DOCUMENT_NOT_FOUND, no secret

for i in $(seq 1 12); do curl -s -o /dev/null -w '%{http_code}\n' -X POST <uri>/api/session \
  -H 'content-type: application/json' -d "{\"documentId\":\"$DOC\",\"mode\":\"voice\"}"; done
# → 429 after the 10th request (limit is per replica; run with 1 replica or expect up to 3x)

curl -sI <uri> | grep -iE 'content-security-policy|permissions-policy'
```
