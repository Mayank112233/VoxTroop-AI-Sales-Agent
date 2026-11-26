# VoxTroop

**Autonomous Multilingual AI Sales Agent & Revenue Intelligence Platform**

Sales teams repeatedly answer common questions, collect customer details and coordinate appointments across channels. VoxTroop brings these activities into a business-configurable sales console and an embeddable chat widget.

The local MVP uses FastAPI, LangGraph, SQLite, local Qdrant, React and optional OpenAI providers. The graph classifies each message, retrieves tenant-filtered knowledge when needed, scores qualification with explicit rules and generates a response. SQLite preserves transcripts, leads and booking state. Staff can require approval before finalizing an appointment. The console exposes sources, graph steps, sentiment, summaries and actual record counts.

The demonstration asks a fictional academy pricing question, verifies its citation, submits a fictional lead and books a weekday appointment. A second fictional tenant demonstrates configuration and retrieval isolation. A generic HTML page independently embeds the assistant.

The proposed commercial model is a subscription with metered voice and integration tiers. The main hypothesis is that teams can handle routine questions and qualification faster while retaining control over bookings. Provider usage and tenancy infrastructure drive operating costs.

The local workflow was verified with mock providers. Live multilingual output and turn-based voice need configured models and credentialed verification. Native CRM and appointment storage are local. External CRM, telephony, streaming voice and production deployment remain future work. A production target of 100,000 registered users requires measured load, persistent server databases, stateless API replicas, queued ingestion and tenant-level access controls.
