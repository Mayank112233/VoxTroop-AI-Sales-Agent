# Agent workflow

The graph in [agent.py](../voxtroop/backend/agent.py) turns a customer message into an assessed intent, a possible business tool result, a qualification score, and a reply.

| Node | Inputs and decisions | Output |
| --- | --- | --- |
| Assess | Current message, recent history, known customer facts, and configurable consultation fields | Pydantic-validated intent, query, language, sentiment, summary, and updated profile |
| Retrieve | Knowledge intent and contextual or rewritten query | Tenant-filtered evidence with source metadata |
| Suggest slots | Valid booking intent plus pending and prior-turn state | Available times from the shared read-only booking service |
| Qualify | Profile and known contact data | Deterministic score and field-level reasons |
| Respond | Assessment, sources, eligible catalogue and booking state | Customer reply, ranked product IDs, localized follow-up and trace |

Assess routes through retrieval, slot suggestions, or qualification directly. Retrieval and slot suggestions both feed qualification. Qualify goes to Respond, which completes the graph. [The API service](../voxtroop/backend/api.py) invokes it with up to 12 recent messages, then persists the turn and any lead update.

Availability is read-only. Appointment creation requires a separate authenticated confirmation request. The graph uses context for short acceptance and refusal. Server rules control known actions and prevent premature booking instructions.

Retrieval indexes overlapping chunks with filename and chunk number. The model can rank options based on stated skills, goals, budget, and timing. The server filters recommendations against the tenant catalogue, removes unsupported link targets, and caps structured recommendations at four. Product URLs are resolved on the server. Customer text is cleaned, and source provenance stays in Turn Inspection.

In mock mode, assessment and embeddings are deterministic to support offline tests. Gemini can fall back to the separately configured OpenAI graph for supported provider or parsing errors. Each provider needs the relevant indexed knowledge for equivalent RAG.
