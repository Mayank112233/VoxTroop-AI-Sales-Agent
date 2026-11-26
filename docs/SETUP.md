# Local setup

## Requirements

Use Python 3.12 and Node.js 24. Git, npm, and a browser are also needed. Commands below use PowerShell. On macOS and Linux use `python3.12`, `./.venv/bin/python`, and `npm` in place of their Windows equivalents.

## Start the backend

From the repository root, set up an isolated environment and the server configuration.

```powershell
Set-Location voxtroop
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.lock.txt
Copy-Item .env.example .env
```

Generate two distinct local secrets with the command below. Set the first as `ADMIN_TOKEN` and the second as `WIDGET_SECRET` inside `voxtroop/.env`. Use the admin token to sign in to the Console. Keep both secrets on the server.

```powershell
.\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(32)); print(secrets.token_urlsafe(32))"
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

The first mock startup creates demo businesses and indexes their seed material in local runtime storage. Check [health](http://127.0.0.1:8000/health). Run one backend process per local Qdrant data directory.

## Start the Console and Academy

From the repository root in a second terminal:

```powershell
Set-Location voxtroop/frontend
npm.cmd ci
npm.cmd run dev -- --host localhost
```

In a third terminal at the repository root:

```powershell
npm.cmd ci
npm.cmd run dev
```

Open [the Console](http://localhost:5173/) and [the Academy](http://localhost:5174/). With the backend running, add the Academy knowledge, course links, and widget origin from another root terminal:

```powershell
node --env-file=voxtroop/.env scripts/knowledge.mjs --sync
```

Append `--catalogue-only` in place of `--sync` to refresh verified course URLs and appointment labels only. Set `ACADEMY_PUBLIC_URL` if the public Academy address changes. Set `VITE_VOXTROOP_URL` before building the Academy if the public backend address changes. Only this public backend origin belongs in the frontend configuration.

## Server environment variables

| Setting | Purpose |
| --- | --- |
| `MOCK_AI_MODE` | Use deterministic assessment, embeddings, and demo responses by default. Set to `false` for live mode. |
| `DATA_DIR` | Root for SQLite and local Qdrant storage. Defaults to `runtime` relative to the backend working directory. |
| `ADMIN_TOKEN` | Operator API and Console bearer credential. |
| `WIDGET_SECRET` | Distinct server-side signing secret, at least 32 characters. |
| `TENANT_TOKEN_HASHES` | Optional JSON object mapping tenant IDs to SHA-256 token digests. |
| `FRONTEND_ORIGIN` | Exact Console CORS origin. Widget frame origins are configured per business. |
| `AI_PROVIDER` | `openai` or `gemini` when live. |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_EMBEDDING_MODEL` | Gemini credentials and model IDs. Set valid model IDs for your account. |
| `OPENAI_API_KEY`, `OPENAI_CHAT_MODEL`, `OPENAI_EMBEDDING_MODEL` | OpenAI credentials and model IDs. All three are needed to enable OpenAI chat fallback in Gemini mode. |
| `OPENAI_TRANSCRIPTION_MODEL`, `OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE` | Optional voice provider settings. |

Live provider requests may incur usage charges. Run knowledge sync against the provider whose index you intend to populate. When using Gemini with OpenAI fallback, index the same documents in OpenAI mode separately if both providers need equivalent retrieval. If the active workspace contains superseded demo material, review it in Knowledge Base.

## Demonstrate the workflow

1. Use a test workspace and a disposable data directory. Configure live mode to see model-ranked recommendations and natural-language replies.
2. Open the Academy widget and give the example background and goal from the README. Follow a recommended link and return to the chat.
3. Ask to book counselling. Select a current slot, review the contact fields, and confirm with fictional contact details.
4. Match the receipt to Console **Appointments**, **Leads**, and **Conversations**. Ask a product question in Agent Playground and inspect the evidence in **Turn Inspection**.
5. To smoke-test offline, use mock mode. Ask about the demo Foundation program or request a counselling appointment. Mock text retrieval and deterministic routing differ from live recommendations.

## Verification commands

Run from the repository root after installing dependencies:

```powershell
npm.cmd run build
npm.cmd --prefix voxtroop/frontend run build
Set-Location voxtroop
.\.venv\Scripts\python.exe -m pytest -q
```
