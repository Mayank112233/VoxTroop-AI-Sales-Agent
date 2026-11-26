# FastAPI reference

Base URL for local development is `http://127.0.0.1:8000`. [OpenAPI UI](http://127.0.0.1:8000/docs) describes the active instance's input models. Operator endpoints use `Authorization: Bearer <admin-or-scoped-token>`.

## Operator API

| Method | Path | Input and result |
| --- | --- | --- |
| GET | `/health` | Public health and mode. |
| GET | `/api/businesses` | Businesses visible to the authenticated operator. |
| POST | `/api/businesses` | Business configuration JSON. Global administrator required to create a tenant. |
| PUT | `/api/businesses/{business}` | Full business configuration JSON. |
| POST | `/api/{business}/chat` | Message and optional conversation session ID. Returns reply, structured recommendations, scoring, slots, and inspection metadata. |
| GET | `/api/{business}/knowledge` | Indexed document IDs, names, and chunk counts. |
| POST | `/api/{business}/knowledge` | Multipart field `file` with UTF-8 text or a text PDF. Returns document ID. |
| DELETE | `/api/{business}/knowledge/{document}` | Removes chunks for that tenant and document ID. |
| GET | `/api/{business}/records` | Conversations, leads, appointments, and metrics. |
| PATCH | `/api/{business}/leads/{identifier}` | Status JSON with `new`, `contacted`, `qualified`, `converted`, or `lost`. |
| POST | `/api/{business}/appointments/{session}/propose` | JSON `slot` with an ISO 8601 datetime and timezone offset. |
| POST | `/api/{business}/appointments/{session}/confirm` | Same selected slot. Returns a persisted appointment or pending approval. |
| POST | `/api/{business}/appointments/{session}/decision/{action}` | Staff action `approve` or `reject`. |
| POST | `/api/{business}/voice/transcribe` | Multipart audio field `file`. Returns transcript. |
| POST | `/api/{business}/voice/speak` | JSON `text`. Returns MP3 when configured. |

Example operator chat body:

```json
{
  "message": "Which data science course fits my Python experience?",
  "session": null
}
```

## Widget API

| Method | Path | Input and result |
| --- | --- | --- |
| GET | `/widget.js` | Public embed loader. |
| GET | `/widget-frame.js` | Customer frame script. |
| GET | `/widget/{business}` | HTML frame with a tenant-specific frame-ancestors policy. |
| GET | `/widget/{business}/info` | Business display name, mode, welcome message, theme, timezone, and appointment labels. |
| POST | `/widget/{business}/session` | Started from the backend-origin iframe. Returns the signed session token. |
| POST | `/widget/{business}/chat` | JSON `message` and signed bearer session. Returns `reply`, `recommendations`, `follow_up`, `slots`, `language`, and `intent`. |
| POST | `/widget/{business}/appointment/{action}` | Signed session. `propose` takes `slot`. `confirm` takes the same slot plus any missing `name` and `email`. `cancel` accepts an empty object. |
| POST | `/widget/{business}/voice/transcribe` | Signed session and multipart audio. |
| POST | `/widget/{business}/voice/speak` | Signed session and JSON `text`. |

Submit the slot string returned by the service. A booked widget response includes `slot`, `status`, `name`, and the stored `reference`. A pending approval has no confirmed reference. An availability conflict can return updated slots in the error detail. Invalid or expired sessions return an authorization error. Public responses omit retrieval provenance.

Use examples with fictional contact data and credentials supplied from your environment.
