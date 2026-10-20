# Tasks: Custom Domain

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md)

- [X] T001 DNS records CNAME `talk-to-doc` and TXT `asuid.talk-to-doc` in zone `hkaanturgut.com`
- [X] T002 Add hostname to the app, issue managed certificate `mc-talk-to-doc`, bind with SNI
- [X] T003 Bicep: params `customDomainName`, `customDomainCertificateName`; managed certificate resource; `customDomains` on the app; output `SERVICE_WEB_CUSTOM_URI`; `az bicep build` passes
- [X] T004 deploy.yml + main.parameters.json: `CUSTOM_DOMAIN_NAME`, `CUSTOM_DOMAIN_CERTIFICATE_NAME`; set repo variables
- [X] T005 README and docs: new address, decision, setup steps
- [ ] T006 PR, CI green, merge, deploy; quickstart validation V1–V6
