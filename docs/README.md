# Documentation

Start with the HLD for the big picture, then read the decision log for the reasoning behind each
choice. The LLD is the reference while reading the code.

| Document                                   | What it covers                                                                                                                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [design/HLD.md](design/HLD.md)             | High-level design: scope, context and container diagrams, components, key flows, NFRs, security, cost, topology, scaling limits                                                                  |
| [design/LLD.md](design/LLD.md)             | Low-level design: module map, request lifecycle, API reference, sequence diagrams, data model, client state machine, instructions, configuration, infrastructure, telemetry, tests, known issues |
| [design/DECISIONS.md](design/DECISIONS.md) | Decision log (ADR-lite): the options compared for each decision, what was chosen, and the trade-offs                                                                                             |
| [architecture/](architecture/)             | Architecture diagram (diagrams as code) and how to re-render it                                                                                                                                  |
| [eval/questions.md](eval/questions.md)     | Grounding eval: 10 questions, 10/10 on the deployed app                                                                                                                                          |
| [eval/guardrails.md](eval/guardrails.md)   | Guardrail eval: on-topic, unrelated, harmful, injection and instruction-leak prompts, 13/13                                                                                                      |
| [screenshots/](screenshots/)               | UI screenshots in light and dark mode                                                                                                                                                            |

Specs (GitHub Spec Kit). Each folder has the spec, plan, research (options compared), data model,
contracts, quickstart (manual checks) and tasks:

| Spec                                                     | Feature                                                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [001-voice-doc-chat](../specs/001-voice-doc-chat/)       | The core app: PDF, YouTube and text ingestion; voice and text conversation; reconnect; deployment |
| [002-caption-relay](../specs/002-caption-relay/)         | Outbound-only caption relay for YouTube on the hosted app                                         |
| [003-access-guardrails](../specs/003-access-guardrails/) | Access code, conversation guardrails, voice capacity cap, cross-site protection                   |
| [004-custom-domain](../specs/004-custom-domain/)         | `talk-to-doc.hkaanturgut.com` with a managed certificate                                          |
