# Using llmapi from another application

`llmapi` is a private infrastructure service. It must not be exposed directly
to the internet. Applications on the same VPS can reach it through Docker or
the host loopback interface.

## Application running in Docker

Run the application with the same rootless Docker daemon and attach it to the
external `llm-internal` network:

```yaml
services:
  my-app:
    image: ghcr.io/example/my-app:latest
    environment:
      LLM_BASE_URL: http://llmapi:3001/v1
      LLM_API_KEY: internal-dummy-value
    networks:
      - llm-internal

networks:
  llm-internal:
    external: true
    name: llm-internal
```

The application and router must be managed by the same VPS Unix user and the
same rootless Docker socket. A container started by rootful Docker or another
user's rootless daemon cannot join this `llm-internal` network.

## Application running directly on the VPS

Use `http://127.0.0.1:3001/v1`. Port 3001 is bound only to host loopback, so it
is not reachable from another machine.

## OpenAI-compatible request

Use model `auto` to let the router select an upstream, or choose an ID returned
by `GET /v1/models`.

```js
const response = await fetch(`${process.env.LLM_BASE_URL}/chat/completions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    model: 'auto',
    messages: [{ role: 'user', content: 'Summarize this text.' }],
  }),
  signal: AbortSignal.timeout(120_000),
});

if (!response.ok) {
  throw new Error(`llmapi returned ${response.status}: ${await response.text()}`);
}

const result = await response.json();
console.log(result.choices[0].message.content);
```

The router trusts its private network boundary and replaces incoming API
authorization internally. SDKs that require an API key may use any non-empty
dummy value; applications must never receive provider API keys.

## Other compatible APIs

- Anthropic: base URL `http://llmapi:3001/v1`, endpoint `/messages`
- Gemini: base URL `http://llmapi:3001/v1beta`
- Ollama: base URL `http://llmapi:3001`, endpoints under `/api`
- OpenAPI description: `GET /v1/openapi.json`

Use `GET /livez` to check the process and database. Use `GET /readyz` before
sending inference traffic; it returns success only when at least one provider
is configured and serviceable. Treat `429` and `502` as retryable with bounded
exponential backoff. Set an application-level timeout and preserve streaming
responses rather than buffering them when `stream: true` is requested.

Do not publish port 3001, add a public Caddy route to it, or store provider keys
inside an application repository.
