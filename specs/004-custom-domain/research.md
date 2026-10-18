# Research: Custom Domain

## R1. Which domain

| Option | Cost | Owner effort | Looks | Verdict |
| --- | --- | --- | --- | --- |
| Keep `*.azurecontainerapps.io` | free | none | long, random | rejected: hard to read in an email |
| **Subdomain of the owner's `hkaanturgut.com`** | free (domain already owned) | none (DNS in Azure, same subscription) | professional, personal brand | **chosen** |
| Buy a new domain (e.g. Cloudflare Registrar) | ~USD 12/year | purchase | professional | rejected: an existing domain fits |
| `is-a.dev` subdomain | free | public pull request, review takes days | hobby | rejected |
| `eu.org` / FreeDNS | free | manual approval (weeks) / spammy shared domains | poor | rejected |
| Azure Front Door (`*.azurefd.net`) | ~USD 35/month base | new resource | still random | rejected: cost, no gain |

Name: `talk-to-doc.hkaanturgut.com` (owner's choice).

## R2. Certificate

| Option | Cost | Renewal | Verdict |
| --- | --- | --- | --- |
| **Container Apps managed certificate (CNAME validation)** | free | automatic | **chosen** |
| Bring-your-own certificate (e.g. Let's Encrypt via a job, Key Vault) | free | our job | rejected: moving parts |
| App Service certificate | ~USD 70/year | automatic | rejected: cost |

Constraint: a managed certificate validates a hostname that is already on the app, so a fresh
environment needs two provisions: (1) hostname added with binding `Disabled`, (2) certificate issued
and bound with SNI. Bicep params `customDomainName` and `customDomainCertificateName` model the two
steps (certificate name empty = step 1).

## R3. Where the DNS records live

| Option | Verdict |
| --- | --- |
| **Created once with `az network dns record-set …` in the owner's zone; documented here** | **chosen**: the zone belongs to the personal-site project; incremental deployments there do not remove record sets they do not declare |
| Cross-resource-group module in this repo's Bicep | rejected: the deploy identity would need DNS rights on the personal-site zone (wider blast radius) |
| Declare them in the personal-site repo's Bicep | good follow-up; optional |

Records: CNAME `talk-to-doc` → the app's default FQDN; TXT `asuid.talk-to-doc` → the environment's
`customDomainVerificationId`.

## R4. App impact

None: the origin check compares `Origin` with the request `Host` (both the custom name), cookies are
host-only, the relay worker can keep using either address. The access cookie is per host, so a
browser enters the code once per address.
