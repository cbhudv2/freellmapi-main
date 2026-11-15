import '../env.js';
import { getDb, initDb } from '../db/index.js';
import { createEncryptedSnapshot } from '../services/backup-snapshots.js';

async function main(): Promise<void> {
  initDb(process.env.FREEAPI_DB_PATH?.trim() || undefined);
  try {
    const target = await createEncryptedSnapshot(getDb(), 'predeploy');
    if (!target) throw new Error('LLMAPI_BACKUP_DIR is not configured');
    console.log(`[backup] created ${target}`);
  } finally {
    getDb().close?.();
  }
}

main().catch(error => {
  console.error(`[backup] failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
