# Scalability, operating costs and commercial feasibility

The local MVP uses one FastAPI process, SQLite WAL, local Qdrant and synchronous provider calls. A production target of 100,000 registered users requires measured concurrency and throughput. As an illustrative scenario, if 10 percent are active daily and each active user sends five turns, that is 50,000 turns/day or about 0.58 turns/s averaged over a day. A 10× peak would be about 6 turns/s. At five seconds per turn, that peak implies about 30 concurrent in-flight turns before retry traffic. These are sizing assumptions, with no load-test result implied.

Serve the console behind HTTPS and place FastAPI replicas behind a load balancer. Migrate structured state to PostgreSQL and vectors to Qdrant server with tenant indexes. Add object storage and queue-backed ingestion, Redis-backed shared limits, tenant identity with role-based access, retention controls and encrypted backups. Use PostgreSQL transactions and unique indexes for booking concurrency. Add tracing from the API down to provider calls, alert on errors, queue age and latency, and verify recovery with backup-restore drills. Deploy via versioned images to managed compute and roll out schema changes before dependent API code. Production infrastructure has not been provisioned.

## Cost worksheet

Use rates from your provider contract and hosting quotes. The following are formulas, with fictional rate inputs shown only to demonstrate arithmetic.

| Meter | Monthly calculation |
|---|---|
| LLM input | Input tokens ÷ 1,000,000 × input rate |
| LLM output | Output tokens ÷ 1,000,000 × output rate |
| Embeddings | Indexed and query tokens ÷ 1,000,000 × embedding rate |
| Transcription | Recorded minutes × transcription rate |
| Speech | Generated minutes × speech rate, or equivalent provider billing unit |
| Hosting | API compute + database + vector service + storage + networking + monitoring |

Example using hypothetical rates of $1/M input tokens, $4/M output tokens, $0.10/M embedding tokens, $0.01/recorded minute and $0.02/generated minute. A conversation with 4,000 input tokens, 600 output tokens, 500 embedding tokens and one minute in each audio direction costs $0.03645 in modeled AI usage. The audio increment alone is $0.03 in this scenario for one minute recorded plus one minute generated. At 1,000 such conversations per business, modeled AI usage is $36.45 per month. At 100 equally active businesses it is $3,645 before hosting, taxes and retries. Replace both usage and rates with measurements. The graph bounds retrieved context and turn history, and content hashes avoid repeated indexing. Smaller suitable models and deterministic actions can reduce cost.

## Commercial feasibility

Education, property, IT services and professional services teams could use VoxTroop for repetitive sales questions, consistent intake and appointment requests. Subscription, metered voice and paid integrations are plausible pricing options. Validate onboarding effort, staff time saved, booking completion and factual-answer rates in a pilot before making commercial claims.

The MVP uses random bearer credentials and an optional hashed tenant token, tenant-scoped data access, signed widget sessions, limited uploads and a process-local widget rate limit. Production would also need identity lifecycle, audit events, consent and retention policies, secrets rotation, distributed limits, incident response and provider data-processing review.
