"""Architecture diagram for talk-to-doc-realtime.

Render (needs Graphviz):
    python -m venv .venv && .venv/bin/pip install -r docs/architecture/requirements.txt
    cd docs/architecture && ../../.venv/bin/python diagram.py
Outputs architecture.png and architecture.svg next to this file.
"""

from diagrams import Cluster, Diagram, Edge
from diagrams.azure.aimachinelearning import AIStudio
from diagrams.azure.compute import ContainerApps, ContainerRegistries
from diagrams.azure.identity import ManagedIdentities
from diagrams.azure.monitor import ApplicationInsights, LogAnalyticsWorkspaces
from diagrams.azure.security import KeyVaults
from diagrams.azure.general import Mobile
from diagrams.onprem.ci import GithubActions
from diagrams.onprem.vcs import Github
from diagrams.generic.network import Firewall
from diagrams.onprem.client import Client
from diagrams.programming.framework import Nextjs

GRAPH = {"pad": "0.4", "nodesep": "0.8", "ranksep": "1.4", "fontname": "Helvetica", "fontsize": "15", "splines": "spline"}
NODE = {"fontname": "Helvetica", "fontsize": "12"}

WEBRTC = Edge(color="#16a34a", style="bold", label="WebRTC audio + oai-events\n(Bearer ek_… 120 s)")
HTTPS = Edge(color="#2563eb", label="HTTPS")


def rbac(label: str) -> Edge:
    return Edge(color="#dc2626", style="dashed", label=label, fontcolor="#dc2626")


def deploy(label: str = "") -> Edge:
    return Edge(color="#6b7280", style="dotted", label=label)


def render(fmt: str) -> None:
    with Diagram(
        "Talk to a Document — architecture",
        filename="architecture",
        outformat=fmt,
        show=False,
        direction="LR",
        graph_attr=GRAPH,
        node_attr=NODE,
    ):
        phone = Mobile("Phone browser\n(React UI, WebRTC)")

        with Cluster("GitHub"):
            repo = Github("hkaanturgut/\ntalk-to-doc-realtime")
            actions = GithubActions("CI + deploy\n(OIDC, no secrets)")
            repo >> deploy() >> actions

        youtube = Firewall("YouTube\n(captions; blocks cloud IPs)")

        with Cluster("Owner's machine (home IP, no listening port)"):
            relay = Client("caption relay\nnpm run relay\n(outbound only)")

        with Cluster("Azure resource group rg-talk-to-doc-dev (canadacentral)"):
            with Cluster("Container Apps environment"):
                app = ContainerApps("web: Next.js 16\n/api/ingest/*, /api/session, /api/relay/*\nin-memory docs + relay queue")
                Nextjs("App Router\n+ route handlers") - Edge(style="invis") - app
            uami = ManagedIdentities("User-assigned\nmanaged identity")
            foundry = AIStudio("Foundry (AI Services)\ngpt-realtime-2.1\ngpt-4o-mini-transcribe\nlocal auth OFF")
            kv = KeyVaults("Key Vault (RBAC)\ncaption-relay-secret\noptional 3rd-party keys")
            acr = ContainerRegistries("Container Registry")
            appi = ApplicationInsights("App Insights\n(Entra auth)")
            logs = LogAnalyticsWorkspaces("Log Analytics")

        phone >> HTTPS >> app
        app >> Edge(color="#2563eb", label="client_secrets\n(Entra token via MI)") >> foundry
        phone >> WEBRTC >> foundry
        app >> Edge(color="#9333ea", label="captions (direct; blocked from Azure)") >> youtube
        relay >> Edge(color="#9333ea", style="bold", label="long poll /api/relay/next\nPOST /api/relay/result\n(Bearer secret)") >> app
        relay >> Edge(color="#9333ea", label="captions (home IP)") >> youtube

        app - Edge(color="#dc2626", style="dashed", label="runs as") - uami
        uami >> rbac("OpenAI User") >> foundry
        uami >> rbac("AcrPull") >> acr
        uami >> rbac("Secrets User") >> kv
        uami >> rbac("Metrics Publisher") >> appi
        app >> Edge(color="#6b7280", label="OTel") >> appi >> logs

        actions >> deploy("azd provision") >> app
        actions >> deploy("remote build") >> acr


if __name__ == "__main__":
    for fmt in ("png", "svg"):
        render(fmt)
