# Versions & upstream — pinned vs latest, changelog deltas, bump constraints

Researched 2026-11-07 against registry.npmjs.org (`npm view`) and GitHub release notes
(openai/codex, anthropics/claude-code). Local machine: macOS arm64.

## 1. Claude Code

| Item | Pinned | Latest | Local |
|---|---|---|---|
| `@anthropic-ai/claude-agent-sdk` (package.json dep, exact) | 0.3.312 (2026-10-27) | **0.3.319** (2026-11-06) | CLI 2.1.312 |
| bundled CLI (`manifest.json` claudeCodeVersion) | 2.1.312 | 2.1.319 | external `claude` CLI 2.1.312 |
| standalone CLI npm `@anthropic-ai/claude-code` | — | 2.1.319 | — |

Version releases in window: 0.3.314 (10-30), 0.3.315 (10-30), 0.3.316 (10-31), 0.3.317 (11-03),
0.3.318 (11-03), 0.3.319 (11-06). (No 0.3.313.)

### Actual diff 0.3.312 → 0.3.319 (measured, package tarballs)

- **`Options` type**: exactly ONE field added — `resumeDropsTurn?` (guard naming the user turn dropped by
  `resumeSessionAt`). The plugin's `ClaudeCodeOptionsBuilder` already supports passing it.
- Control-protocol additions (not Options fields): `pending_elicitation_requests` on initialize replies
  (both pending-permission and pending-elicitation sibling frames); `SDKSessionWritesLostMessage` message
  type; hook matcher `onFailure?: 'continue' | 'block'` + initialize capability
  `hook_on_failure_supported` (TS SDK refuses sessions that set 'block' without the flag);
  `mcp_call.check_permissions?: boolean` (capability `mcp_call_check_permissions_v1`; only honored on the
  spawning host's pipes); `setMcpServers` doc change — `.mcp.json`/local-scope servers of the session's
  current folder stay up when omitted (ownership transfers once named); `deleteSession` semantics doc
  (deletes local/sessionStore data only; throws after transcript deletion if subdir removal fails).
- `agentSdkTypes.d.ts` unchanged. Vendored CLI binaries: 2.1.312 → 2.1.319 (~276MB→~322MB per platform entry).
- Manifest `sdkCompat.testedWrapperVersions` expanded through 0.3.318; `harnessSchema` stays 1.

### CLI release highlights 2.1.313→2.1.319 (behavior-relevant to plugin seams)

2.1.319: auto mode behind LLM gateways changes (calls that cannot be server-checked are asked/denied;
`CLAUDE_CODE_AUTO_MODE_SERVER` env toggles); MCP tasks backgrounding + `CLAUDE_CODE_DISABLE_MCP_TASK_BACKGROUND`;
`permissions.denyInsteadOfPrompting` setting (deny instead of prompt — relevant to permission bridge UX);
`CLAUDE_CODE_DISABLE_FEATURE_FLAGS`; fixes for stdio MCP legacy handshake pinning, `--continue` losing
conversation (regression in 2.1.314, fixed 2.1.318), permission prompt key races, idle compaction replacing
conversation with non-summary, config write failures on shared network home.
2.1.318: `effort` option on mod `$.model.fork`; login expiry surfacing (`loginExpiresAt`,
`credential_expires_at`); `claude mcp add/remove` config lock; plugin validate marketplace filename fix.

### Bump constraints

- Type-surface risk low: only additive Options field, already in the plugin's OptionsBuilder shape.
- Live verification needed (cannot be proven from types): permission-bridge behavior under
  `denyInsteadOfPrompting`; elicitation bridge vs `pending_elicitation_requests`; hook onFailure default
  remains 'continue' (plugin sends hooks without onFailure → unchanged); auto-mode gateway changes only
  apply behind gateways — plugin passes `ANTHROPIC_BASE_URL` provider presets, so preset users may see
  the new ask/deny behavior (flag `CLAUDE_CODE_AUTO_MODE_SERVER=0` restores old behavior).
- SDK-internal stream/message types the normalizer consumes: `agentSdkTypes.d.ts` byte-identical →
  `ClaudeCodeStreamNormalizer` risk minimal, still verify a smoke turn.

## 2. Codex

| Item | Pinned | Latest | Local |
|---|---|---|---|
| `@openai/codex-sdk` (exact) | 0.165.0 (2026-10-27) | **0.167.0** (2026-11-06) | — |
| vendored CLI inside SDK (`package.json` devDep pin) | 0.165.0 | 0.167.0 | — |
| `@openai/codex` CLI npm | — | 0.167.0 | codex-cli 0.167.0 |
| alpha channel | 0.169.0-alpha.2 (2026-11-06) | | |

### Actual diff 0.165.0 → 0.167.0 (measured)

- SDK `dist/` **byte-identical**; only `package.json` version + vendored `@openai/codex` pin changed.
  The wrapper exposes no new API the plugin could adopt.
- CLI bin wrapper: replaced async-spawn signal forwarding with `process.execve` replacement on POSIX
  (signals flow directly to native binary; SIGXFSZ handler pre-execve); Windows/older-Node keeps spawn path.
- rust-v0.166.0 (2026-10-29): app-server thread startup/shutdown race fixes + prompt runtime release
  (#57787/57788); approval/permission settings preserved on resume/fork (#57227); reasoning-token
  accounting across resume/fork (#57839); GPT-6.1 Terra added to catalogs; `codex queue --resume`.
- rust-v0.167.0 (2026-11-06): `[permissions.network]` managed network constraints documented for
  app-server; managed command checkpoints requiring fresh human approval (#58045); network approval
  prompts close when requests end; concurrent same-endpoint prompts serialize; auto compaction counts
  failed-response output; `codex agents --no-daemon`.

### Bump constraints

- Wrapper risk ~nil (bytes unchanged) but CLI behavior still needs live verification: approval-policy
  wiring (plugin wire union 'untrusted'|'on-request'|'never', 'untrusted' retired upstream 2026-08 —
  plugin never emits it), sandbox_policy turn options, execpolicy amendment approvals, deprecation-notice
  surface.
- Plugin-side compatibility gate: `CodexCliResolver` resolution; 'missing' fails start() with honest error.
- app-server primary transport benefits directly from 0.166 race fixes (reconnect integration
  `onReconnect`/`onReconnectFailed` exists plugin-side).

## 3. OpenCode 2

| Item | Pinned | Latest | Local |
|---|---|---|---|
| `@opencode/client` (exact) | 2.2.0 (2026-10-27) | **2.2.6** (2026-11-06) | opencode v2.2.6 (`@opencode/cli`) |
| CLI npm `@opencode/cli` | — | 2.2.6 | 2.2.6 |

### Actual diff 2.2.0 → 2.2.6 (measured)

- `dist/chunks` reshuffled (content-hash churn); `contract.d.ts` adds one export `clientNamespace`
  (from `@opencode/protocol/client`); event-name extraction across chunks shows exactly one added event
  `session.metadata.updated`. No removed/renamed endpoints detected by extraction (54→55 event/method names).
- Runtime gate plugin-side: `info.version.startsWith('2.')` — patch-line drift tolerated.

### Bump constraints

- Low risk; verify: `server.info`, `session.prompt/switchAgent/switchModel/command/instructions.entry.put`,
  `skill.list({location:{directory}})` shapes unchanged (extraction suggests unchanged), SSE event
  transformation in `OpenCodeStreamEventTransformer` unaffected by `session.metadata.updated` (unknown
  event → verify transformer tolerates).
- `@opencode-ai/sdk` 1.19.5 (retired OpenCode 1 path): latest unchanged since 2026-10-28; NO action —
  dormant, must stay out of `IMPLEMENTED_AGENT_BACKENDS`.

## 4. Pi

| Item | Latest | Local |
|---|---|---|
| `@earendil-works/pi-coding-agent` | 1.5.0 (2026-11-02) | pi 1.5.0 (match) |
| `@mariozechner/pi-coding-agent` (legacy, still accepted) | 0.73.1 (2026-05-07) | 0.73.1 installed |
| `@oh-my-pi/pi-coding-agent` | 18.17.0 installed locally | NOT accepted by resolver (not official) |
| `@narumitw/pi-goal` (goal extension driver) | 0.54.17 (2026-11-06) | availability probed live |

- No SDK pinned in package.json; the plugin spawns the CLI and speaks its RPC (`PiRpcClient`).
- Resolver constraint: executable must belong to `@earendil-works/pi-coding-agent` or
  `@mariozechner/pi-coding-agent` (shim content inspected on Windows; `realpathSync` on POSIX).
- Action: none required; keep the two-package allowlist.

## 5. DSH

| Item | Latest | Local |
|---|---|---|
| `@deepseek-ai/dsh` | 0.2.2-rc.1 = dist-tags latest & next (2026-11-05); alpha 0.2.2-alpha.3 | 0.2.2-rc.1 (match) |

- No SDK; ACP (`--profile acp`) or native extension protocol (`opencodian.dsh-native/1`, plugin-defined).
- Action: none; watch alpha channel for native-protocol changes (UNKNOWN cadence).

## 6. ZCode

- No npm distribution. Runtime resolved from official desktop bundle: macOS
  `/Applications/ZCode.app/Contents/Resources/glm/{zcode-agent,zcode.cjs}` (+ `~/Applications`),
  Windows `%LOCALAPPDATA%\Programs\ZCode\resources\glm`, Linux `/opt/ZCode/resources/glm` etc.
  `GLM_BINARY_PATH` env override honored. Installed desktop on this machine: 3.17.2.
- Handshake `runtime/capabilities` is the compatibility contract; code comments reference tolerance
  around runtime 0.16.x (0.16.9 plan-mode projection quirk handled) and 0.17.1 strings seen in bundle.
- Action: none possible via package bump; runtime updates ride the desktop app.

## 7. Shared utility deps (aux)

| Package | Pinned (lock) | Latest | Note |
|---|---|---|---|
| `smol-toml` | ^1.3.1 → lock-resolved | 1.9.1 | caret range; refresh lock opportunistically |
| `ws` | ^8.20.0 | 8.22.1 | caret range |
| `jsonc-parser` | ^3.3.1 | (latest) | caret range |
| `pdfjs-dist` | 6.3.289 | (not backend-related) | — |
| `@xterm/xterm` | 6.0.0 | (not backend-related) | — |

## Recommended bump set (implementation-ready)

1. `@openai/codex-sdk` 0.165.0 → **0.167.0** (aligns vendored CLI with local/registry latest; dist unchanged).
2. `@opencode/client` 2.2.0 → **2.2.6** (matches local CLI; additive contract).
3. `@anthropic-ai/claude-agent-sdk` 0.3.312 → **0.3.319** (additive types; schedule live smoke for
   permission bridge + elicitation + preset-gateway auto-mode behavior).
4. Optionally refresh caret locks (`smol-toml`, `ws`) in the same change.
5. NO bump for pi/dsh/zcode (already at latest or runtime-resolved).
6. OpenCode 1 `@opencode-ai/sdk` stays 1.19.5, stays retired.
