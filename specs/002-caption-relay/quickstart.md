# Quickstart: Caption Relay

## Prerequisites

- Node 24, `npm ci` done, Azure CLI signed in to the sponsor subscription on the owner's machine.
- The app deployed with `ENABLE_CAPTION_RELAY=true` and the Key Vault secret `caption-relay-secret`.

## One-time setup

```bash
KV=$(azd env get-value AZURE_KEY_VAULT_NAME)        # or: az keyvault list -g rg-talk-to-doc-dev
az keyvault secret set --vault-name "$KV" --name caption-relay-secret \
  --value "$(openssl rand -base64 32)" -o none
gh variable set ENABLE_CAPTION_RELAY --body true    # then re-run the deploy workflow
```

## Run the relay

```bash
npm run relay -- --app https://<app-fqdn> --vault "$KV" --subscription <sub-id>
```

Expected log: `relay: polling https://<app-fqdn>`; one line per job, e.g.
`relay: jNQXAC9IVRw ok 1.4s`.

## Validation scenarios

| # | Step | Expected |
| --- | --- | --- |
| V1 | `curl -s https://<app>/api/health` with the relay running | `"relay":{"online":true,...}` |
| V2 | Paste `https://www.youtube.com/watch?v=jNQXAC9IVRw` in the hosted app | preview mentions elephants and long trunks, within 15 s |
| V3 | Ask "What animals is he standing in front of?" | "elephants" |
| V4 | Stop the relay, wait 35 s, check health | `"online":false` |
| V5 | Paste the same link again | paste tab with explanation in < 5 s |
| V6 | `curl -s -o /dev/null -w '%{http_code}' https://<app>/api/relay/next` | `401` |
| V7 | `lsof -nP -iTCP -sTCP:LISTEN` on the owner's machine while the relay runs | no node listener |
| V8 | 10 public captioned videos with the relay online | ≥ 9 load (SC-001) |

## Automated

```bash
npm test                 # relay queue, auth, provider, worker, routes
```
