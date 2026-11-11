# Externally managed config — inventory per backend

Config that lives OUTSIDE plugin settings (`data.json`). Plugin authority follows ADR-0001: global roots
are writable ONLY through explicit allowlisted-root confinement (`ProjectResourceSecureWrite` +
`PathConfinement` + `ConfigurationArchiveService.confinedPath`); managed sources are never writable.

## Claude Code

Files (merge precedence, `CLAUDE_SETTINGS_PRIORITY`, `ClaudeSettingsSourceService.ts:54`):
managed 400 > cliArgs 300 > local 200 > project 100 > user 0.

| Scope | Path | Plugin role | Writable in-plugin? |
|---|---|---|---|
| user (global) | `~/.claude/settings.json` | editable source when `settingSources` includes 'user' | YES — narrow allowlist `{scope:'global', rootPath: ~/.claude}` (ClaudeSettingsSourceService slots 477) |
| project | `<vault>/.claude/settings.json` | editable source ('project') | YES — confined to vault `.claude` (slot 478) |
| local | `<vault>/.claude/settings.local.json` | editable source ('local') | YES — confined (slot 479) |
| managed | managed-settings.d drop-ins + MDM (discovered by `ClaudeManagedSettingsDiscovery`) | read-only priority 400 | NEVER |
| MCP | `.mcp.json` / settings-file mcpServers | read via `ClaudeCodeMcpConfigAdapter` / `readClaudeMcpServers()` | plugin passes `mcpServers` option; strictMcpConfig flag only |
| output styles | `.claude/output-styles/*.md`, `~/.claude/output-styles/*.md` | referenced by `outputStyle` setting | external authoring |
| providers | `.claude/settings.json` env projection from `ClaudeProviderSettings` presets (ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN / ANTHROPIC_DEFAULT_HAIKU_MODEL + extraEnv; `CLAUDE_PROVIDER_MANAGED_ENV_KEYS`) | plugin-managed keys, revision-guarded apply | YES via preset apply |

## Codex

| Scope | Path | Plugin role | Writable in-plugin? |
|---|---|---|---|
| global config | `~/.codex/config.toml` (`$CODEX_HOME` honored) | read-only summary (`CodexGlobalConfigSummaryReader`: model, provider base URL w/ credential redaction) | NO in this surface |
| auth | `~/.codex/auth.json` | ChatGPT login fallback; never written by plugin | NO |
| project config | `<vault>/.codex/config.toml` | plugin-edited with strict allowlist (`CodexProjectConfigFormModel`: model / model_reasoning_effort / sandbox_mode / approval_policy / network_access / web_search / additional_directories; forbidden: model_provider, model_providers.*, auth, notification, telemetry, env_key, headers, query_params, unknown keys) | YES (surgical TOML edit, comments preserved) |
| global agents | `~/.codex/agents/*.toml` | discovery, P0 read-only | NO |
| global skills | `~/.agents/skills/<name>/SKILL.md` | discovery, P0 read-only | NO |
| project skills | `<vault>/.agents/skills/<name>/SKILL.md` | discovery + plugin-authored mutation via secure-write | YES |
| legacy prompts | `~/.codex/prompts` | intentionally NOT discovered/shown | — |

## Pi

| Scope | Path | Plugin role |
|---|---|---|
| MCP (global chain) | `~/.config/mcp/mcp.json` → `~/.agents/mcp.json` → `~/.agents/mcp/mcp.json` → `~/.pi/agent/mcp.json` (`$PI_CODING_AGENT_DIR` override) | read-only merged view (`PiMcpConfigService`), lowest→highest |
| MCP (project) | `<vault>/.mcp.json` → `<vault>/.pi/mcp.json` | read-only merged view |
| provider/models config | Pi SDK-owned models.json (global + project scopes); path returned by `get_config` RPC, never hard-coded | edited THROUGH Pi SDK RPC (structured editor + lossless native JSON pane); plugin never writes the file directly |
| session store | `<vault>/.pi/opencodian-sessions/` | plugin-owned |

## ZCode

| Scope | Path | Plugin role |
|---|---|---|
| official login credentials | `~/.opencodian/zcode/account/.zcode/v2/credentials.json` (ZCODE_DATA_BASE_DIR; ZCODE_CREDENTIAL_SECRET) | plugin-owned login lifecycle (sign-in/sign-out via native `zcode-login-*` RPC; families bigmodel/zai only) |
| shared personal API config | revision-guarded document shared with ZCode desktop (`ZCodePersonalConfigService`: providerConfigRules/modelConfigRules/providerOrder/defaultModelSelection; schemaVersion 1 gate) | edited in-plugin; affects BOTH OpenCodian and ZCode desktop |
| desktop bundle | `/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs` (+ platform variants) | resolved read-only as runtime |
| desktop task index | official desktop DB via bundle-derived path | read-only (`ZCodeDesktopTaskIndex`) |

## OpenCode 2

| Scope | Path | Plugin role |
|---|---|---|
| server config overlay | `OPENCODE_CONFIG_CONTENT` env → owned local process (from `backendSettings.opencode2.configContent`) | plugin-owned string; schema validated server-side only |
| on-disk OpenCode 2 config | upstream-defined config files (`~/.opencode` etc.) | NOT touched by plugin in local-serve mode (overlay env wins); remote mode reads server's own config |
| OpenCode 1 project config (`opencode.json` at repo root, legacy) | retired path | NOT read by the opencode2 backend (separate surface kept dormant with OpenCode 1) |

## DSH

| Scope | Path | Plugin role |
|---|---|---|
| harness profile | per-launch private temp profile (`opencodian-dsh-*`): launcher.mjs / service.mjs / native.patch.yml / package.json / compatibility.json / cordia.yml / node_modules | plugin-owned; only explicit files in this profile may be removed |
| installed application / user profiles | untouched ("Owns a per-launch Harness extension; the installed application and user profiles stay intact", DshNativeClient.ts:10) | never read or written |
