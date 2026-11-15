# llmapi

Private, headless LLM router derived from FreeLLMAPI. It keeps multi-provider
fallback routing and OpenAI, Anthropic, Gemini, and Ollama-compatible inference
APIs while removing the dashboard, desktop app, CLI, MCP, media, search, and
public administration surfaces.

## API

- OpenAI: `/v1/chat/completions`, `/v1/completions`, `/v1/responses`,
  `/v1/embeddings`, `/v1/models`
- Anthropic: `/v1/messages`, `/v1/messages/count_tokens`
- Gemini: `/v1beta/models/...`
- Ollama: `/api/chat`, `/api/generate`, `/api/embed`, `/api/tags`
- Operations: `/livez`, `/readyz`, `/v1/providers`, `/v1/quota-forecast`

The service is intentionally network-authenticated. SDK API-key fields may be
empty or contain a dummy value. Never expose this router through Caddy or a
public Docker port.

## Provider configuration

Copy `config/providers.example.json` and supply it through
`PROVIDER_KEYS_FILE` or `PROVIDER_KEYS_JSON`. The document is authoritative:
startup validates it completely, updates listed keys, and revokes previously
managed keys that were removed. Provider keys are encrypted in SQLite with
`ENCRYPTION_KEY`.

Production stores the JSON in the GitHub Environment secret
`PROVIDER_KEYS_JSON`. No provider credential is used during image builds or
stored in an image layer.

## Local validation

Docker is not required for the chosen local workflow:

```powershell
npm.cmd ci
npm.cmd run lint
npm.cmd test
npm.cmd run build
$env:ENCRYPTION_KEY = "<64 hex characters>"
$env:PROVIDER_KEYS_FILE = "config/providers.local.json"
npm.cmd start
```

The GitHub deployment workflow intentionally does not run tests. It performs a
locked production image build, deploys the immutable commit tag, checks
`/livez` and `/readyz`, and restores the previous image and configuration if
health checks fail.

## GitHub deployment

Create a private repository named `llmapi` and a `production` Environment with
these secrets:

- `VPS_SSH_PRIVATE_KEY`
- `PROVIDER_KEYS_JSON`
- `ENCRYPTION_KEY`
- `DB_BACKUP_KEY`

Add Environment variables `VPS_HOST`, `VPS_USER`, and `VPS_KNOWN_HOSTS`.
Verify the VPS ED25519 host-key fingerprint directly on the server before
setting `VPS_KNOWN_HOSTS`; never use an unverified `ssh-keyscan` result.

Pushes to `main` build and deploy `ghcr.io/<owner>/llmapi:sha-<commit>`. After
editing provider secrets, run the **Deploy configuration** workflow to restart
without rebuilding the image.

The Compose stack publishes only `127.0.0.1:3001` and joins the external
`llm-internal` network. Application containers should join that network and use
`http://llmapi:3001`.

## Persistence

SQLite lives in the `llmapi-data` volume. Encrypted daily backups are retained
for seven days and the latest three pre-deployment backups are retained under
`/srv/apps/llmapi/backups`. Copy backups off the VPS separately when the data
becomes important.

Request metadata is retained for 30 days, capped at 100,000 rows. Client IPs,
user agents, prompts, completions, response caches, and response-body
idempotency records are not persisted.

## License and origin

This is an independent private derivative of
[FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi). The original and
derived code are distributed under the MIT License in `LICENSE`.
