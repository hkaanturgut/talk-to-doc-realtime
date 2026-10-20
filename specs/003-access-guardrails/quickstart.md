# Quickstart: Access Code and Conversation Guardrails

## Enable the access code (owner, once)

```bash
KV=kv-czb5frz44vkv6; SUB=<subscription-id>
az keyvault secret set --subscription $SUB --vault-name $KV --name access-code \
  --value "$(openssl rand -base64 18 | tr -d '/+=' )" -o none
gh variable set ENABLE_ACCESS_CODE --body true      # then run the deploy workflow
az keyvault secret show --subscription $SUB --vault-name $KV --name access-code --query value -o tsv
```

Share the code with the link in the submission email. Rotate: set a new value, then restart the
active revision (`az containerapp revision restart`).

## Local

`ACCESS_CODE=local-test-code-123 npm run dev` → `/` redirects to `/access`.

## Validation scenarios

| # | Step | Expected |
| --- | --- | --- |
| V1 | Open the app in a private window | access screen, nothing else |
| V2 | Wrong code | "That code is not right." |
| V3 | 6 wrong codes within a minute | "Too many attempts." |
| V4 | Right code | app opens; reload stays in |
| V5 | `curl -X POST <app>/api/ingest/text -d '{}' -H 'content-type: application/json'` | `401 UNAUTHORIZED` |
| V6 | `curl <app>/api/health` | `200` |
| V7 | `curl -X POST <app>/api/ingest/text -H 'Origin: https://evil.example' …` | `403 FORBIDDEN` |
| V8 | Text mode: "write a poem about cats" | polite decline, points to the document |
| V9 | `npm run eval:guardrails` | all checks pass |
| V10 | `MAX_VOICE_SESSIONS=1`: start voice in two browsers | second sees "Voice chat is at capacity…" |
| V11 | Stop the first, start the second | works |
| V12 | Caption relay running | still loads YouTube transcripts |
