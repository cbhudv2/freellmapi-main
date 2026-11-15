import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { anthropicRouter } from './routes/anthropic.js';
import { docsRouter } from './routes/docs.js';
import { geminiRouter } from './routes/gemini.js';
import { ollamaRouter } from './routes/ollama.js';
import { proxyRouter } from './routes/proxy.js';
import { responsesRouter } from './routes/responses.js';
import { providersRouter, statusRouter } from './routes/status.js';
import { createHostGuard } from './middleware/allowed-hosts.js';
import { createProxyRateLimiter } from './middleware/rateLimit.js';
import { errorHandler } from './middleware/errorHandler.js';
import { clientContextMiddleware } from './lib/client-context.js';
import { loadConfig, type Config } from './lib/config.js';
import { getUnifiedApiKey } from './db/index.js';
import { getAppVersion } from './lib/app-version.js';

const OLLAMA_PATHS = new Set([
  '/api/tags',
  '/api/version',
  '/api/show',
  '/api/chat',
  '/api/generate',
  '/api/embed',
  '/api/embeddings',
]);

const OPENAI_POST_PATHS = new Set([
  '/chat/completions',
  '/completions',
  '/responses',
  '/embeddings',
  '/messages',
  '/messages/count_tokens',
]);

const OPENAI_GET_PATHS = new Set([
  '/models',
  '/codex/models',
  '/usage',
  '/providers',
  '/quota-forecast',
  '/openapi.json',
]);

function isAllowedV1Path(req: Request): boolean {
  if (req.method === 'POST') return OPENAI_POST_PATHS.has(req.path);
  if (req.method !== 'GET') return false;
  return OPENAI_GET_PATHS.has(req.path) || req.path.startsWith('/models/');
}

function notFound(res: Response): void {
  res.status(404).json({
    error: {
      message: 'Endpoint not available in the headless llmapi build',
      type: 'invalid_request_error',
    },
  });
}

/**
 * The production deployment is intentionally network-authenticated: only
 * containers on the private Docker network and host-loopback callers can
 * reach it. Existing protocol routers still use their constant-time unified
 * key checks, so inject that internal key without exposing it to clients.
 */
function networkAuthentication(req: Request, _res: Response, next: NextFunction): void {
  req.headers.authorization = `Bearer ${getUnifiedApiKey()}`;
  next();
}

export function createApp(config?: Config) {
  const cfg = config ?? loadConfig();
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', cfg.trustProxy);
  app.use(createHostGuard(cfg.allowedHosts));
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: cfg.requestBodyLimitBytes }));
  app.use((req, _res, next) => {
    // The headless build never stores prompt or completion bodies. Override
    // client opt-in cache headers and disable response-body idempotency.
    req.headers['x-freellm-cache'] = 'off';
    req.headers['cache-control'] = 'no-store';
    delete req.headers['idempotency-key'];
    next();
  });
  app.use(clientContextMiddleware);

  app.get('/', (_req, res) => {
    res.json({
      name: 'llmapi',
      version: getAppVersion(),
      status: 'ok',
      liveness: '/livez',
      readiness: '/readyz',
      openapi: '/v1/openapi.json',
    });
  });

  app.use(statusRouter);

  const limiter = createProxyRateLimiter(cfg.proxyRateLimitRpm);

  app.use((req, res, next) => {
    if (!OLLAMA_PATHS.has(req.path)) return next();
    limiter(req, res, () => networkAuthentication(req, res, next));
  });
  app.use(ollamaRouter);

  app.use('/v1', (req, res, next) => {
    if (!isAllowedV1Path(req)) {
      notFound(res);
      return;
    }
    limiter(req, res, () => networkAuthentication(req, res, next));
  });
  app.use('/v1', docsRouter);
  app.use('/v1', providersRouter);
  app.use('/v1', anthropicRouter);
  app.use('/v1', proxyRouter);
  app.use('/v1', responsesRouter);

  app.use('/v1beta', limiter, networkAuthentication, geminiRouter);

  app.use((_req, res) => notFound(res));
  app.use(errorHandler);
  return app;
}
