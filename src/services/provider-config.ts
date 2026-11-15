import fs from 'node:fs';
import { z } from 'zod';
import { getDb, getSetting, setSetting } from '../db/index.js';
import { resolveProvider } from '../providers/index.js';
import { applyDeclarativeConfig } from './declarative-config.js';

const MANAGED_IDS_SETTING = 'llmapi_provider_config_managed_ids';

const customModelSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1).optional(),
  intelligenceRank: z.number().int().min(1).max(1000).optional(),
  speedRank: z.number().int().min(1).max(1000).optional(),
  contextWindow: z.number().int().positive().nullable().optional(),
  supportsVision: z.boolean().optional(),
  supportsTools: z.boolean().optional(),
  fallbackEnabled: z.boolean().optional(),
}).strict();

const providerCredentialSchema = z.object({
  platform: z.string().min(1),
  label: z.string().min(1),
  key: z.string().min(1).optional(),
  baseUrl: z.string().url().optional(),
  enabled: z.boolean().optional(),
  models: z.array(customModelSchema).optional(),
}).strict().superRefine((entry, context) => {
  const platform = entry.platform.trim();
  if (platform === 'custom') {
    if (!entry.baseUrl) {
      context.addIssue({ code: 'custom', path: ['baseUrl'], message: 'custom providers require baseUrl' });
    }
    if (!entry.models || entry.models.length === 0) {
      context.addIssue({ code: 'custom', path: ['models'], message: 'custom providers require at least one model' });
    }
    return;
  }

  const provider = resolveProvider(platform as never);
  if (!provider) {
    context.addIssue({ code: 'custom', path: ['platform'], message: `unknown provider: ${platform}` });
  } else if (!provider.keyless && !entry.key) {
    context.addIssue({ code: 'custom', path: ['key'], message: `${platform} requires a key` });
  }
  if (entry.baseUrl || entry.models) {
    context.addIssue({ code: 'custom', message: 'baseUrl and models are only valid for custom providers' });
  }
});

const providerConfigSchema = z.array(providerCredentialSchema);
export type ProviderCredential = z.infer<typeof providerCredentialSchema>;

function loadProviderConfig(): { source: string; entries: ProviderCredential[] } | null {
  const inline = process.env.PROVIDER_KEYS_JSON?.trim();
  const file = process.env.PROVIDER_KEYS_FILE?.trim();
  if (inline && file) throw new Error('set only one of PROVIDER_KEYS_JSON or PROVIDER_KEYS_FILE');
  if (!inline && !file) return null;

  const source = inline ? 'PROVIDER_KEYS_JSON' : file!;
  const raw = inline ?? fs.readFileSync(file!, 'utf8');
  const parsedJson: unknown = JSON.parse(raw);
  const parsed = providerConfigSchema.safeParse(parsedJson);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map(issue => `${issue.path.join('.') || 'root'}: ${issue.message}`)
      .join(', ');
    throw new Error(`invalid provider configuration: ${details}`);
  }
  return { source, entries: parsed.data };
}

function managedIds(): number[] {
  const raw = getSetting(MANAGED_IDS_SETTING);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is number => Number.isInteger(value) && value > 0)
      : [];
  } catch {
    return [];
  }
}

function configuredKeyId(entry: ProviderCredential): number {
  const db = getDb();
  const platform = entry.platform.trim();
  const label = entry.label.trim();
  const row = platform === 'custom'
    ? db.prepare(
        "SELECT id FROM api_keys WHERE platform = 'custom' AND label = ? AND base_url = ? LIMIT 1",
      ).get(label, entry.baseUrl!.trim().replace(/\/+$/, '')) as { id: number } | undefined
    : db.prepare(
        'SELECT id FROM api_keys WHERE platform = ? AND label = ? AND base_url IS NULL LIMIT 1',
      ).get(platform, label) as { id: number } | undefined;
  if (!row) throw new Error(`provider configuration did not create ${platform}/${label}`);
  return row.id;
}

function tableExists(name: string): boolean {
  return Boolean(getDb().prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

function removeManagedKey(id: number): void {
  const db = getDb();
  const key = db.prepare('SELECT platform FROM api_keys WHERE id = ?').get(id) as
    | { platform: string }
    | undefined;
  if (!key) return;

  if (tableExists('requests')) db.prepare('UPDATE requests SET key_id = NULL WHERE key_id = ?').run(id);
  for (const table of [
    'rate_limit_usage',
    'rate_limit_cooldowns',
    'key_monthly_usage',
    'provider_quota_observations',
    'model_probe_status',
  ]) {
    if (tableExists(table)) db.prepare(`DELETE FROM ${table} WHERE key_id = ?`).run(id);
  }

  for (const modelTable of ['models', 'embedding_models', 'media_models']) {
    if (!tableExists(modelTable)) continue;
    if (modelTable === 'models' && tableExists('fallback_config')) {
      db.prepare('DELETE FROM fallback_config WHERE model_db_id IN (SELECT id FROM models WHERE key_id = ?)').run(id);
    }
    db.prepare(`DELETE FROM ${modelTable} WHERE key_id = ?`).run(id);
  }
  db.prepare('DELETE FROM api_keys WHERE id = ?').run(id);
}

export function applyProviderConfigFromEnv(): { applied: boolean; source?: string; keys: number; revoked: number } {
  const loaded = loadProviderConfig();
  if (!loaded) {
    if ((process.env.NODE_ENV ?? '').toLowerCase() === 'production') {
      throw new Error('PROVIDER_KEYS_FILE is required in production');
    }
    return { applied: false, keys: 0, revoked: 0 };
  }

  const builtInKeys = loaded.entries
    .filter(entry => entry.platform !== 'custom')
    .map(entry => ({
      platform: entry.platform.trim(),
      key: entry.key,
      label: entry.label.trim(),
      enabled: entry.enabled,
    }));
  const customProviders = loaded.entries
    .filter(entry => entry.platform === 'custom')
    .map(entry => ({
      baseUrl: entry.baseUrl!,
      apiKey: entry.key,
      label: entry.label.trim(),
      models: entry.models!.map(model => ({
        model: model.id,
        displayName: model.displayName,
        intelligenceRank: model.intelligenceRank,
        speedRank: model.speedRank,
        contextWindow: model.contextWindow,
        supportsVision: model.supportsVision,
        supportsTools: model.supportsTools,
        fallbackEnabled: model.fallbackEnabled,
      })),
    }));

  const db = getDb();
  const previousIds = managedIds();
  let currentIds: number[] = [];
  let revoked = 0;
  const reconcile = db.transaction(() => {
    applyDeclarativeConfig({ keys: builtInKeys, customProviders }, loaded.source);
    currentIds = loaded.entries.map(configuredKeyId);
    const current = new Set(currentIds);
    for (const id of previousIds) {
      if (current.has(id)) continue;
      removeManagedKey(id);
      revoked += 1;
    }
    setSetting(MANAGED_IDS_SETTING, JSON.stringify(currentIds));
  });
  reconcile();

  console.log(`[config] reconciled ${currentIds.length} provider credentials from ${loaded.source}; revoked ${revoked}`);
  return { applied: true, source: loaded.source, keys: currentIds.length, revoked };
}
