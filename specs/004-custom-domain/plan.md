# Implementation Plan: Custom Domain

**Branch**: `004-custom-domain` | **Date**: 2026-10-18 | **Spec**: [spec.md](spec.md)

## Summary

Serve the app at `https://talk-to-doc.hkaanturgut.com` with a free Container Apps managed
certificate. Infrastructure only, no application code. Options in [research.md](research.md).

```text
 talk-to-doc.hkaanturgut.com ──CNAME──▶ ca-web-….azurecontainerapps.io ──▶ Container Apps ingress
 asuid.talk-to-doc  TXT = environment customDomainVerificationId (ownership proof)
 ingress customDomains: [{ talk-to-doc.hkaanturgut.com, SniEnabled, managedCertificates/mc-talk-to-doc }]
```

## Technical Context

**Infra**: Bicep (AVM `container-app` 0.23.0 `customDomains`), `Microsoft.App/managedEnvironments/
managedCertificates@2025-01-01` (CNAME validation). Params `customDomainName`,
`customDomainCertificateName` (`CUSTOM_DOMAIN_NAME`, `CUSTOM_DOMAIN_CERTIFICATE_NAME` azd env / repo
variables). Output `SERVICE_WEB_CUSTOM_URI`.

**DNS**: Azure DNS zone `hkaanturgut.com` in `rg-personal-site` (owner's subscription).

**Testing**: `az bicep build`, deployment via the deploy workflow, curl checks (quickstart).

## Constitution Check

- Secrets: none involved. Least privilege: the deploy identity gets no DNS rights (research R3).
- Infrastructure as code: hostname and certificate in Bicep; DNS records documented (owned by
  another project's zone).
- Cost: USD 0.

## Project Structure

```text
infra/main.bicep, infra/resources.bicep, infra/main.parameters.json   params, cert, binding, output
.github/workflows/deploy.yml                                          repo variables → azd env
README.md, docs/design/*                                              address, steps, decision
```
