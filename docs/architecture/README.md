# Architecture diagram

`diagram.py` is the source of truth (diagrams as code, reviewable in PRs). Rendered outputs:
[`architecture.svg`](architecture.svg), [`architecture.png`](architecture.png).

```bash
python -m venv .venv && .venv/bin/pip install -r docs/architecture/requirements.txt
cd docs/architecture && ../../.venv/bin/python diagram.py   # needs Graphviz (brew install graphviz)
```

What it shows:

- **Trust boundaries**: the phone (untrusted), the Azure resource group, GitHub, and YouTube.
- **Data paths**:
  - ingestion and session minting over HTTPS to Container Apps;
  - the secret mint (`client_secrets`) from the app to Foundry with an Entra token;
  - the direct WebRTC media and event path from the phone to Foundry, which never passes through
    the app.
- **Where secrets live**: nowhere in the client or GitHub. The app runs as a user-assigned managed
  identity (red dashed edges are its RBAC roles). Key Vault holds the access code, the caption relay secret and optional third-party keys.
  CI authenticates with an OIDC federated credential.

Icons: the Azure, GitHub and Next.js icons come from the
[`diagrams`](https://diagrams.mingrammer.com/) package (0.25), which bundles Microsoft's Azure
architecture icons. Per Microsoft's terms, they are used unmodified, next to the product name, in
architecture documentation. YouTube is drawn as a generic external-service node instead of a brand
logo.
