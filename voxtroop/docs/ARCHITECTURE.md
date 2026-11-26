# VoxTroop architecture

One FastAPI process owns the local database and Qdrant client. The console calls FastAPI through Vite's development proxy. The browser never receives model credentials.

```mermaid
flowchart LR
  Console[Console and Playground] --> API[FastAPI]
  API --> Graph[LangGraph]
  Graph --> Knowledge[Knowledge retrieval]
  Knowledge --> Qdrant[(Local Qdrant)]
  Graph --> Model[Configured model or mock]
  Graph --> Persist[Turn and CRM persistence]
  Persist --> DB[(SQLite)]
  API --> Booking[Booking and approval service]
  Booking --> DB
  API --> Voice[Transcription and speech]
```

## Agent turns

```mermaid
flowchart LR
  Start --> Assess
  Assess -->|Knowledge intent with enough customer context| Retrieve
  Assess -->|Validated appointment request| SuggestSlots
  SuggestSlots --> Qualify
  Assess -->|Clarification, confirmation or conversation| Qualify
  Retrieve --> Qualify
  Qualify --> Respond
  Respond --> End
```

FastAPI supplies recent turns, the current message, tenant configuration and accumulated profile. The assessment distinguishes purchase, pricing, recommendation, qualification, objection, language preference, and appointment actions. It returns sentiment, a summary, customer-stated facts and a standalone retrieval query. The business configuration defines consultation fields. The profile persists those facts and explicit language preferences. Incomplete recommendations ask up to two questions. The deterministic qualification node records weights. The backend stores the full turn and upserts by tenant and normalized email. The booking branch reads available slots. In the Playground and widget, customers choose a slot and explicitly confirm it. Only the appointment API can create an appointment, after checking timezone, business hours, slot uniqueness and policy. SQLite serializes booking writes. The graph is reconstructed from persisted conversation state on each request.

## Retrieval

```mermaid
flowchart LR
  Upload[UTF-8 text or text PDF] --> Parse
  Parse --> Chunk[Recursive splitting]
  Chunk --> Embed[Embedding provider]
  Embed --> Store[(Qdrant with business and source metadata)]
  Query[Question and recent context] --> Search[Tenant-filtered similarity search]
  Store --> Search
  Search --> Reply[Reply with citation metadata]
```

Text content hashes deduplicate equivalent input per tenant. Gemini and OpenAI fallback have separate indexes. Retrieval records matching chunk scores using the existing 0.35 live and 0.15 mock thresholds. Similarity measures relevance and can return evidence that does not answer a question. The response prompt requires support for every business claim. The vector payload stores the file name, chunk number, content hash and business ID. Deletion applies both business and document filters. Mock and live Qdrant directories are separate.

## Voice turn

```mermaid
sequenceDiagram
  participant Browser
  participant FastAPI
  participant Speech as OpenAI audio
  participant Agent as LangGraph
  Browser->>FastAPI: Recorded audio
  FastAPI->>Speech: Transcription request
  Speech-->>Browser: Transcript via FastAPI
  Browser->>FastAPI: Reviewed customer message
  FastAPI->>Agent: Run turn
  Agent-->>Browser: Reply via FastAPI
  Browser->>FastAPI: Request playback
  FastAPI->>Speech: Speech generation
  Speech-->>Browser: MP3 via FastAPI
```

## Data model

```mermaid
erDiagram
  BUSINESS ||--o{ CONVERSATION : owns
  BUSINESS ||--o{ LEAD : owns
  BUSINESS ||--o{ APPOINTMENT : owns
  CONVERSATION ||--o| APPOINTMENT : schedules
```

## Client website

```mermaid
flowchart LR
  Host[Client website] --> Loader[Widget loader]
  Loader --> Frame[VoxTroop iframe]
  Frame -->|Tenant and conversation token| Widget[Widget chat endpoints]
  Widget --> Graph[Shared sales workflow]
```

## Proposed production topology

```mermaid
flowchart LR
  Browser --> Edge[HTTPS edge and load balancer]
  Edge --> API[Stateless API replicas]
  API --> DB[(PostgreSQL)]
  API --> Vectors[(Qdrant server)]
  API --> Queue[(Redis and background jobs)]
  Jobs[Ingestion workers] --> Queue
  Jobs --> Vectors
  Jobs --> Objects[(Object storage)]
  API --> Models[AI provider]
```
