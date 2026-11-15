import fs from 'node:fs';
import path from 'node:path';
import type { Db } from '../db/types.js';
import { getDefaultDbPath } from '../db/index.js';
import { backupDbNow } from '../lib/db-backup.js';
import type { Scheduler } from '../lib/scheduler.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function backupDirectory(): string | null {
  return process.env.LLMAPI_BACKUP_DIR?.trim() || null;
}

function timestamp(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function prune(directory: string, kind: 'daily' | 'predeploy', keep: number): void {
  const files = fs.readdirSync(directory)
    .filter(name => name.startsWith(`${kind}-`) && name.endsWith('.db.backup'))
    .map(name => ({ name, modified: fs.statSync(path.join(directory, name)).mtimeMs }))
    .sort((left, right) => right.modified - left.modified);
  for (const file of files.slice(keep)) fs.rmSync(path.join(directory, file.name));
}

export async function createEncryptedSnapshot(
  db: Db,
  kind: 'daily' | 'predeploy',
  dbPath = getDefaultDbPath(),
): Promise<string | null> {
  const directory = backupDirectory();
  if (!directory) return null;
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const target = path.join(directory, `${kind}-${timestamp()}.db.backup`);
  const result = await backupDbNow(db, dbPath, target);
  if (!result.ok) throw new Error(result.skipped ?? 'database snapshot failed');
  prune(directory, kind, kind === 'daily' ? 7 : 3);
  return target;
}

export function startSnapshotScheduler(
  db: Db,
  scheduler: Scheduler,
  dbPath = getDefaultDbPath(),
): (() => void) | null {
  if (!backupDirectory()) return null;
  return scheduler.every(DAY_MS, () => {
    void createEncryptedSnapshot(db, 'daily', dbPath).catch(error => {
      console.warn(`[backup] daily snapshot failed: ${error instanceof Error ? error.message : error}`);
    });
  });
}
