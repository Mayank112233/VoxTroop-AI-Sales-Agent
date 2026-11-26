# VoxTroop AI Sales Agent Project Report

[Project README](../README.md) · [Run the demo](SETUP.md#demonstrate-the-workflow) · [Architecture](ARCHITECTURE.md) · [API reference](API_REFERENCE.md)

## Project at a glance

VoxTroop helps businesses turn enquiries into grounded recommendations, qualified leads, and confirmed appointments. **Learn Anything Academy** is the demo client. A visitor can describe a career goal, open a recommended course, and book counselling from the same chat widget. Staff can inspect the conversation, retrieved evidence, and booking in the VoxTroop Console.

## From enquiry to appointment

```mermaid
flowchart LR
    A["Academy chat widget"] --> B["FastAPI verifies tenant and session"]
    B --> C{"LangGraph assesses intent"}
    C -->|"Product question"| D["Qdrant retrieves tenant knowledge"]
    C -->|"Booking request"| E["Booking service returns available slots"]
    C -->|"Other intent"| Q["Score lead and compose reply"]
    D --> Q
    E --> Q
    Q --> R["Reply with verified links or time choices"]
    R -->|"Customer selects and confirms"| K["Recheck slot and apply booking policy"]
    K --> P["SQLite records booking or pending approval"]
    Q --> T["SQLite records conversation and lead"]
    T --> M["VoxTroop Console"]
    P --> M
```

<details>
<summary>How recommendations stay grounded</summary>

LangGraph uses the customer's context to select a workflow. Qdrant retrieval is scoped to the tenant. The backend validates returned catalogue IDs and supplies their stored URLs. Staff can inspect document names, chunk identifiers, and similarity scores in Turn Inspection.

[Explore the agent workflow](AGENT_WORKFLOW.md)

</details>

<details>
<summary>How booking avoids accidental or duplicate writes</summary>

The customer must pick a server-provided time and explicitly confirm it. The API rechecks availability and applies the tenant's booking policy. SQLite enforces a unique business-and-slot pair. A repeated confirmation of the same booking returns the existing reference.

[Explore the booking flow](BOOKING_FLOW.md)

</details>

## Verification

**10 backend tests passed** after a clean Python install, and both frontend builds passed. An isolated live-provider demo also verified that the Academy widget produced a confirmed booking whose reference, conversation, and lead could be found in the Console.

**Current scope:** Single-process local deployment. Production scaling would require shared storage and rate limiting. Provider behavior depends on the configured model and indexed knowledge.
