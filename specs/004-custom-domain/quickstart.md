# Quickstart: Custom Domain

## One-time setup (already done for `talk-to-doc-dev`)

```bash
S=<subscription-id>
APP=ca-web-czb5frz44vkv6; ENV=cae-czb5frz44vkv6; RG=rg-talk-to-doc-dev
H=talk-to-doc.hkaanturgut.com

# 1. DNS (owner's zone)
VID=$(az containerapp env show --subscription $S -g $RG -n $ENV --query properties.customDomainConfiguration.customDomainVerificationId -o tsv)
FQDN=$(az containerapp show --subscription $S -g $RG -n $APP --query properties.configuration.ingress.fqdn -o tsv)
az network dns record-set cname set-record --subscription $S -g rg-personal-site -z hkaanturgut.com -n talk-to-doc -c $FQDN
az network dns record-set txt add-record --subscription $S -g rg-personal-site -z hkaanturgut.com -n asuid.talk-to-doc -v $VID

# 2. Hostname (unbound), then the free managed certificate, then bind
az containerapp hostname add --subscription $S -g $RG -n $APP --hostname $H
az containerapp env certificate create --subscription $S -g $RG -n $ENV --hostname $H --validation-method CNAME --certificate-name mc-talk-to-doc
az containerapp hostname bind --subscription $S -g $RG -n $APP --hostname $H --environment $ENV --certificate mc-talk-to-doc

# 3. Keep it in IaC: repo variables read by deploy.yml
gh variable set CUSTOM_DOMAIN_NAME --body $H
gh variable set CUSTOM_DOMAIN_CERTIFICATE_NAME --body mc-talk-to-doc
```

A fresh environment can instead do it all through Bicep in two provisions: set
`CUSTOM_DOMAIN_NAME` only and provision (hostname added, unbound), then set
`CUSTOM_DOMAIN_CERTIFICATE_NAME` and provision again (certificate issued and bound).

## Validation

| # | Check | Expected |
| --- | --- | --- |
| V1 | `curl -sI https://talk-to-doc.hkaanturgut.com/api/health` | 200 |
| V2 | `openssl s_client -connect talk-to-doc.hkaanturgut.com:443 -servername talk-to-doc.hkaanturgut.com` | subject CN = the hostname, chain verifies |
| V3 | `curl -sI https://talk-to-doc.hkaanturgut.com/` | 307 to `/access` |
| V4 | POST `/api/access` with the right code, `Origin: https://talk-to-doc.hkaanturgut.com` | 303 + `ttd_access` cookie |
| V5 | deploy workflow run after merge | succeeds; binding still `SniEnabled` |
| V6 | default FQDN `/api/health` | 200 |
