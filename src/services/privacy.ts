import { getDb } from '../db/index.js';

function tableExists(name: string): boolean {
  return Boolean(getDb().prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

/** Remove legacy stores that may contain prompt or completion bodies. */
export function purgePersistedMessageBodies(): void {
  for (const table of ['response_cache', 'idempotency_claims', 'playground_conversations']) {
    if (tableExists(table)) getDb().prepare(`DELETE FROM ${table}`).run();
  }
  getDb().prepare("DELETE FROM settings WHERE key = 'response_cache_enabled'").run();
}
