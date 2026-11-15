import { Router, type Request, type Response } from 'express';
import { openapiSpec } from '../docs/openapi.js';

export const docsRouter = Router();

docsRouter.get('/openapi.json', (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json(openapiSpec);
});
