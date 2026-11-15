const jsonResponse = {
  '200': { description: 'Successful response' },
  '400': { description: 'Invalid request' },
  '429': { description: 'Router or provider rate limit reached' },
  '502': { description: 'No provider could serve the request' },
};

const post = (summary: string) => ({
  post: {
    summary,
    requestBody: {
      required: true,
      content: { 'application/json': { schema: { type: 'object' } } },
    },
    responses: jsonResponse,
  },
});

const get = (summary: string) => ({
  get: { summary, responses: { '200': { description: 'Successful response' } } },
});

export const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'llmapi',
    version: '1.0.0',
    description:
      'Private, network-authenticated LLM router with OpenAI, Anthropic, Gemini, and Ollama-compatible APIs.',
    license: { name: 'MIT' },
  },
  servers: [{ url: '/', description: 'This router instance' }],
  paths: {
    '/v1/models': get('List available models'),
    '/v1/models/{id}': get('Retrieve a model'),
    '/v1/codex/models': get('List Codex-compatible models'),
    '/v1/chat/completions': post('Create an OpenAI-compatible chat completion'),
    '/v1/completions': post('Create a legacy OpenAI text completion'),
    '/v1/responses': post('Create an OpenAI Responses API response'),
    '/v1/embeddings': post('Create embeddings'),
    '/v1/messages': post('Create an Anthropic-compatible message'),
    '/v1/messages/count_tokens': post('Count Anthropic message tokens'),
    '/v1/providers': get('Inspect provider health'),
    '/v1/quota-forecast': get('Inspect provider quota forecasts'),
    '/v1/usage': get('Inspect aggregate router usage'),
    '/v1beta/models': get('List Gemini-compatible models'),
    '/api/tags': get('List Ollama-compatible models'),
    '/api/version': get('Return Ollama compatibility version'),
    '/api/show': post('Show an Ollama-compatible model'),
    '/api/chat': post('Create an Ollama-compatible chat response'),
    '/api/generate': post('Create an Ollama-compatible generation'),
    '/api/embed': post('Create Ollama-compatible embeddings'),
    '/api/embeddings': post('Create legacy Ollama embeddings'),
    '/livez': get('Liveness probe'),
    '/readyz': get('Readiness probe'),
  },
} as const;

export type OpenApiSpec = typeof openapiSpec;
