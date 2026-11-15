import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let cached: string | null | undefined;

function packageVersion(): string | null {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const parsed = JSON.parse(readFileSync(path.resolve(here, '../../package.json'), 'utf8')) as {
      version?: unknown;
    };
    return typeof parsed.version === 'string' && parsed.version.trim() ? parsed.version.trim() : null;
  } catch {
    return null;
  }
}

export function getAppVersion(): string | null {
  if (cached !== undefined) return cached;
  cached = process.env.LLMAPI_VERSION?.trim() || packageVersion();
  return cached;
}

export function resetAppVersionCache(): void {
  cached = undefined;
}
