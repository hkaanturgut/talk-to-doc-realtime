# Feature Specification: Custom Domain

**Feature Branch**: `004-custom-domain`

**Created**: 2026-10-18

**Status**: Implemented

**Input**: User description: "Can we have a free domain on the Container Apps app instead of that
URL?"

## Clarifications

### Session 2026-10-18

- Q: Which free domain? → A: A subdomain of the owner's existing domain `hkaanturgut.com` (already
  registered, DNS hosted in Azure DNS in the owner's own subscription), so no purchase and no
  third-party sign-up. Options compared in [research.md](research.md).
- Q: Which name? → A: `talk-to-doc.hkaanturgut.com` (owner's choice; matches the repo name).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reviewer opens a readable link (Priority: P1)

A reviewer gets `https://talk-to-doc.hkaanturgut.com` in the submission email, opens it on a phone,
sees a valid HTTPS padlock, enters the access code and uses the app exactly as on the default
address.

**Why this priority**: The default address (`ca-web-czb5frz44vkv6.thankfuldune-9c54b32a…`) is hard
to read, type, or trust in an email.

**Independent Test**: Open the custom address in a fresh browser: valid certificate, access screen,
the app works after the code, voice starts.

**Acceptance Scenarios**:

1. **Given** the custom address, **When** opened over HTTPS, **Then** the certificate is valid for
   that name and issued by a public CA.
2. **Given** the custom address, **When** the reviewer enters the code, **Then** the access cookie is
   set for that host and every flow (upload, YouTube, voice, text) works.
3. **Given** the default address, **Then** it keeps working (relay worker, existing links).
4. **Given** an infrastructure re-provision, **Then** the hostname and certificate binding remain.

### Edge Cases

- The certificate renews automatically (Azure managed certificate); nothing to do for the owner.
- An access cookie set on one address does not apply on the other (different host): the reviewer
  enters the code once per address. Acceptable.
- DNS records live in the owner's personal-site DNS zone, outside this repo's infrastructure code.
  Deleting them breaks validation and renewal; documented.
- A fresh environment needs two provisions (hostname first, then certificate), documented.

## Requirements *(mandatory)*

- **FR-001**: The app MUST be reachable at `https://talk-to-doc.hkaanturgut.com` with a valid,
  automatically renewed certificate at no extra cost.
- **FR-002**: The hostname and certificate binding MUST be defined in infrastructure code so a
  re-provision keeps them; the domain MUST be optional (empty = default address only).
- **FR-003**: The default address MUST keep working.
- **FR-004**: No application code change: same-origin checks, cookies and the relay MUST work on
  both hosts.
- **FR-005**: README, design docs and the decision log MUST show the new address and the setup steps.

## Success Criteria *(mandatory)*

- **SC-001**: `curl -I https://talk-to-doc.hkaanturgut.com/api/health` returns 200 with a
  certificate valid for that name.
- **SC-002**: Access flow and a POST API call pass the origin check on the custom host.
- **SC-003**: `azd provision` (deploy workflow) leaves the binding `SniEnabled`.

## Assumptions

- The owner keeps `hkaanturgut.com` registered and its DNS in Azure DNS (`rg-personal-site`).
- Two DNS records are added to that zone: CNAME `talk-to-doc` and TXT `asuid.talk-to-doc`.
