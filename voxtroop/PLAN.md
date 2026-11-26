# VoxTroop development plan and verification

| Phase | Status | Acceptance evidence |
|---|---|---|
| 0. Workspace and scope | Verified | Inspected the empty workspace, recorded project rules and initialized local Git. |
| 1. FastAPI and SQLite | Verified | Uvicorn started, health and Swagger responded, and tests observed database creation. |
| 2. Business configuration | Verified | Both fictional workspaces loaded. Business settings and scoped authorization were exercised. |
| 3. Qdrant retrieval | Verified | Persistent local mock store, text upload, cited retrieval, deletion and tenant isolation exercised. PDF text ingestion is implemented. |
| 4. LangGraph and memory | Verified | Independent CLI ran the real graph with mock providers. API tests covered persisted messages and accumulated profile. |
| 5. Lead qualification and CRM | Verified | API workflow created a persistent lead with an explainable score. Status editing and deduplication are implemented. |
| 6. Appointments | Verified | Upcoming slot suggestions, proposal, explicit confirmation, approval/rejection and slot conflicts exercised. Widget booking was confirmed in the browser. |
| 7. Conversation intelligence | Verified | Mock summary and sentiment stored. Browser displayed database-backed overview counts. Live output accuracy is unverified. |
| 8. Voice | Implemented | Mock-mode errors exercised. SDK interfaces checked locally. Credentialed audio transcription, synthesis, and microphone playback are unverified. |
| 9. Console | Verified | React dev server, TypeScript and Vite build, browser sign-in, Playground, settings and Overview exercised. |
| 10. Widget | Verified | Loaded on standalone HTML, returned cited text, and completed a fictional booking. API tests covered token scope and appointment controls. Live widget voice is unverified. |
| 11. Differentiators | Verified | Approval, turn trace, score breakdown and widget customization paths are connected. |
| 12. Verification | Verified | Five backend tests passed. Standalone CLI, dependency consistency, both widget scripts' syntax and production bundle checked. |
| 13. Documentation | Implemented | Usage guide, actual and proposed architecture, cost model, project report and standalone notebook provided. CLI verified. Notebook kernel execution is unverified. |

## Remaining acceptance work

- **Blocked for live verification.** Run small credentialed text, embeddings, multilingual and voice smoke tests using configured OpenAI models. Mock mode exercised English, a limited Hindi/Hinglish fallback, and deterministic demo retrieval. PDF ingestion and UI variations have less verification than the core text workflow.
- **Optional.** Add external CRM, calendar and telephony integrations. The MVP stores leads and appointments locally.
- **Planned for production.** Streaming/full-duplex audio, organization identity and account lifecycle, migrations, distributed controls, deeper analytics and load testing. The 100,000-user target is a capacity model. Advanced discount approvals and automated website onboarding are future enhancements.
- **Build notes.** Vite reported a large JavaScript bundle and library `use client` directive warnings. It produced the bundle successfully.
