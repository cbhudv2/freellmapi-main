import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { initDb } from '../db/index.js';

describe('headless llmapi smoke test', () => {
  let server: Server | undefined;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    server = createApp().listen(0, '127.0.0.1');
    if (!server.listening) {
      await new Promise<void>(resolve => server.once('listening', resolve));
    }
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (!server) return;
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve())),
    );
  });

  it('serves health, OpenAPI, and only the headless surface', async () => {
    const root = await fetch(`${baseUrl}/`);
    expect(root.status).toBe(200);
    expect(await root.json()).toMatchObject({ name: 'llmapi', status: 'ok' });

    const live = await fetch(`${baseUrl}/livez`);
    expect(live.status).toBe(200);

    const spec = await fetch(`${baseUrl}/v1/openapi.json`);
    expect(spec.status).toBe(200);
    expect(await spec.json()).toMatchObject({ info: { title: 'llmapi' } });

    const providers = await fetch(`${baseUrl}/v1/providers`);
    expect(providers.status).toBe(200);

    const removedAdminRoute = await fetch(`${baseUrl}/api/settings`);
    expect(removedAdminRoute.status).toBe(404);
  });
});
