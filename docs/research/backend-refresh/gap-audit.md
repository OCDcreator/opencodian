# Gap audit — native-schema expansion pass (2026-11-07, second pass)

Scope of this pass: expand the per-backend field tables with the ACTUAL native editor / dynamic schemas
(Pi RPC-served settings fields + models.json nested fields; OpenCode 2 upstream Config schema; Claude
external settings-file editor structured fields; UI control enumeration for codex/zcode/dsh). No source
files modified. No credentials emitted (apiKey rows documented as password-typed controls only).

## What was added

| Artifact | Addition |
|---|---|
| `backend-fields-pi.md` §G/§H | Full 51-field `SETTINGS_FIELDS` dynamic schema (bundled `assets/pi/configuration.mjs`: 4 groups model/execution/resources/advanced, with kinds, enums, min/max, scope tags, readOnly) + models.json provider-level (9 fields) and model-level (13 fields) nested schema + wildcard raw editors + revision/lock/atomic-save evidence + 0.73.1-vs-1.5.0 schema lag caveat |
| `backend-fields-opencode2.md` §C | Upstream `@opencode/schema@2.2.6` Config contract: 29 top-level keys + nested families (agent, permissions[], policies[], compaction, mcp, media, tool_output, watcher, warming, experimental, commands, worktree, enterprise), plugin UI documented as raw-JSON wildcard with server-side validation; provider/formatter/lsp leaves documented as families + wildcard |
| `backend-fields-claude-code.md` §E/§F | External editor structured fields: 9 common fields (SDK line-anchored), hooks schema (30 events, matcher kinds, 5 handler types with per-type required/optional fields, `once` documented absent), provider preset editor (7 fields), resources markdown editors, advanced JSON wildcard, coverage statement |
| `backend-fields-codex.md` §F | Control enumeration: plugins browser (app-server plugin/* routes), resources skill/agent editors, MCP detail modal = read + OAuth trigger (NOT a config editor), account surface, legacy credential control, readback modal |
| `backend-fields-zcode.md` §F | Accounts surface controls (desktop info row, bigmodel/zai login actions, status rows) + shared personal API provider form (5 fields, protocol enum, revision conflict handling) |
| `backend-fields-dsh.md` §E | Correction: configuration rows are READ-ONLY (`readSessionConfiguration()` display); editable controls = transport/executablePath/workingDirectory/test/mcpServers JSON; args/env remain hidden settings-file-only |
| `coverage-map.md` (new) | Field families → source types → UI grouping for all six backends; wildcards explicit; §Gaps lists the 5 honest remaining gaps |
| `README.md` | (index unchanged; this file added to index) |

## Overstatements corrected

1. DSH: earlier artifact could be read as "configuration" area being configurable — corrected to
   read-only rows with file/line evidence (`SettingsDshSection.ts:243-268`).
2. "Every UI control accounted": now asserted only with the coverage map + explicit wildcard rows;
   prior absolute phrasing replaced by mapped accounting.
3. Claude `systemPrompt`/append semantics and outputStyle boundaries were already flagged readback-only;
   no new overstatement found in that file.
4. Codex MCP modal previously implied config editing capability ambiguity — now stated: it does NOT edit
   `mcp_servers` in config.toml; no structured MCP authoring UI exists in this build.

## Runtime read-only probes

- Pi `get_configuration` was inspected via the plugin's OWN bundled service code
  (`assets/pi/configuration.mjs` + `assets/pi/service.mjs` agentDir resolution = `$PI_CODING_AGENT_DIR` or
  SDK `getAgentDir()`, usually `~/.pi/agent`) and the consuming UI (`SettingsPiConfigurationSection`) —
  equivalent to a live `get_config` read without spawning a process; no credentials involved.
- OpenCode 2 schema read from published `@opencode/schema@2.2.6` typings (same version as local CLI
  2.2.6) — static contract, no process spawned.
- No live backend process was started; no config file was read beyond plugin source; no creds surfaced.

## Method note

UI source files were inspected read-only (`src/features/settings/backends/**`, `src/core/agents/**`,
`assets/pi/**`); upstream typings extracted from npm tarballs under /tmp (outside the repo). No existing
source changed; only `docs/research/backend-refresh/**` artifacts written/extended.
