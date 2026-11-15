# Security

`llmapi` is a private, network-authenticated service. It deliberately has no
inbound API-key check in the production configuration. Never publish port 3001,
add a Caddy route, or attach untrusted containers to `llm-internal`.

Provider credentials belong only in the GitHub `production` Environment secret
`PROVIDER_KEYS_JSON`. `ENCRYPTION_KEY`, `DB_BACKUP_KEY`, and
`VPS_SSH_PRIVATE_KEY` are separate Environment secrets. Never commit runtime
`.env` files, provider JSON, databases, backups, or private SSH keys.

Report vulnerabilities privately to the repository owner. Include the affected
commit, reproduction steps, impact, and whether the issue is reachable from the
private Docker network or host loopback only.
