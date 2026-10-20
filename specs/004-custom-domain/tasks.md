# Tasks: Custom Domain

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md)

- [X] T001 DNS records CNAME `talk-to-doc` and TXT `asuid.talk-to-doc` in zone `hkaanturgut.com`
- [X] T002 Add hostname to the app, issue managed certificate `mc-talk-to-doc`, bind with SNI
- [X] T003 Bicep: params `customDomainName`, `customDomainCertificateName`; managed certificate resource; `customDomains` on the app; output `SERVICE_WEB_CUSTOM_URI`; `az bicep build` passes
- [X] T004 deploy.yml + main.parameters.json: `CUSTOM_DOMAIN_NAME`, `CUSTOM_DOMAIN_CERTIFICATE_NAME`; set repo variables
- [X] T005 README and docs: new address, decision, setup steps
- [X] T006 PR, CI green, merge, deploy; quickstart validation V1–V6

## Production validation (2026-10-19, `38c99db`)

| # | Check | Result |
| --- | --- | --- |
| V1 | `GET https://talk-to-doc.hkaanturgut.com/api/health` | 200, version `38c99db`, relay online |
| V2 | Certificate | CN `talk-to-doc.hkaanturgut.com`, GeoTrust TLS RSA CA G1, valid to 2027-04-18 |
| V3 | `GET /` without the cookie | `307 /access?next=%2F` |
| V4 | Access code POST with same-host `Origin` | `303 /` + `ttd_access`; app 200; `POST /api/ingest/text` 200 |
| V5 | Deploy workflow (`azd provision` with `CUSTOM_DOMAIN_*` set) | success; binding still `SniEnabled` (Bicep re-PUT of the CLI-created certificate is idempotent) |
| V6 | Default FQDN `/api/health` | 200 |
| - | 15 MB upload (PR #15) / 3 MB JSON on `/api/ingest/text` | `415 PDF_NOT_PDF` (body arrived whole) / `400 INVALID_REQUEST` |
| - | `npm run eval:guardrails` on the custom domain (390 px, access code, text mode) | 13 / 13 |
