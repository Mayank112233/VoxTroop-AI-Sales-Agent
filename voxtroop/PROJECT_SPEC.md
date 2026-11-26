# VoxTroop product specification

VoxTroop is a standalone AI sales agent and revenue intelligence platform for businesses with repetitive sales inquiries. It answers questions using each business's knowledge and collects customer-stated intent and contact information. It can propose local appointments for confirmation and staff approval when the business requires it.

| Recruitment capability | MVP status |
|---|---|
| Speech-to-text and text-to-speech | Configurable live HTTP providers and browser turn-based recording. Credentialed execution pending. |
| Contextual memory | Persistent transcripts and qualification profile. Verified in mock mode. |
| Multilingual communication | Structured language detection and prompt-guided live replies. English and limited Hindi/Hinglish mock behavior exercised. |
| Lead qualification and CRM | Explainable weights, email-based tenant deduplication and native CRM persistence. Verified central workflow in mock mode. |
| Sentiment and summaries | Persisted turn assessment and running summary. Live quality unverified. |
| Retrieval-augmented generation | Tenant-filtered local Qdrant with citations and configurable live embeddings. Verified with mock embeddings. |
| Appointment automation | Availability suggestions, explicit confirmation, local booking, and optional staff approval. Verified. |
| Business insights | Actual conversation, lead and appointment counts, recent activity and sentiment. Verified locally. |

Differentiators include the standalone Playground, graph trace, tenant-scoped operators, approval flow, document administration and reusable widget. The fictional configurations support education and real estate on the same engine. The independent EduNext website, external CRM and calendar integrations, paid infrastructure, streaming telephony and public deployment are outside this release.

See [PLAN.md](PLAN.md) for verification evidence and [README.md](README.md) for startup and demo steps.
