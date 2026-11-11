# Backend API refresh — implementation results (2026-11-08)

> Companion to `README.md` / `versions-and-upstream.md` (research) and `acceptance-plan.md`.
> Scope: the API/compatibility half of the backend version refresh, worktree `backend-settings-refresh` @ baseline `7ba229538`.
> Owner of this file: the core API agent. UI/settings-surface results live with the UI agent.

## Version changes landed (package.json / package-lock.json, exact pins)

| Package | Before | After | Notes |
|---|---|---|---|
| `@anthropic-ai/claude-agent-sdk` | 0.3.312 | **0.3.319** | Types additive-only vs 0.3.312 (`tsc --noEmit` green). Raw d.ts diff: `.tmp/backend-refresh-api/claude-sdk.d.ts.diff` |
| `@openai/codex-sdk` | 0.165.0 | **0.167.0** | SDK `dist/index.d.ts` and `dist/index.js` byte-identical 0.165.0→0.167.0 (verified by npm-pack diff); only the vendored `@openai/codex` binary changed. Raw diff: `.tmp/backend-refresh-api/codex-sdk.d.ts.diff` (empty), `codex-sdk.index.js.diff` (empty) |
| `@opencode/client` | 2.2.0 | **2.2.6** | Top-level d.ts identical except added `clientNamespace` re-export; `@opencode/protocol` 2.2.0→2.2.6 diff is additive (new errors, `claudeAgent` provider brand, optional `busy`/`source` fields) |
| `@opencode-ai/sdk` | 1.19.5 | 1.19.5 (unchanged) | OpenCode 1 stays retired per 2026-10-21 decision; `IMPLEMENTED_AGENT_BACKENDS` untouched |

## Genuine incompatibility fixes (source changes)

### 1. Claude `session_writes_lost` — silently dropped before (`src/core/agents/backend/claude/ClaudeCodeStreamNormalizer.ts`)
SDK 0.3.313+ emits `SDKSessionWritesLostMessage` (`system`/`session_writes_lost`, ENOSPC/EDQUOT transcript + `~/.claude.json` loss, at most once before CLI exit). The normalizer had no branch, so the event vanished. Now surfaced as an honest `backend_event` (`event: 'informational'`, `status: 'error'`) with `errorCode`/`lost`/`transcriptSessionIds` metadata. Fixture tests added (with/without `transcript_session_ids`).

Pre-edit checks (baseline CodeGraph index, labeled): `transformSDKMessage` — 5 distinct function/method direct callers (`streamCheckpointPhase1`, `streamCheckpointPhase2Rewind`, `runDiagnosticPrompt`, `streamNativeMessage`, `pumpRuntimeOutput`), depth-1 blast 10 symbols, depth-2 blast 12 symbols (adds `runCommandExecutionProof` + adapter test file). Edit contained in `appendSdkSignalChunk` (1 direct caller: `appendLifecycleChunks`).

### 2. DSH `PROFILE_TEMPLATES` relocation — broke native boot on dsh 0.2.2-rc.1 (`assets/dsh/launcher.mjs`)
`@deepseek-ai/dsh-app-boot` 0.2.2-rc.1 no longer exports `PROFILE_TEMPLATES`; it moved to `@deepseek-ai/dsh-official-bundles` (`sdk` template key still present, plus new `sdk-minimal`). The old launcher destructured it from dsh-app-boot → `TypeError: Cannot read properties of undefined (reading 'sdk')` at first boot, killing the whole DSH backend. Fix: resolve from the new package first, fall back to the old export. CodeGraph impact for `launchNativeRuntime`: 2 affected symbols (contained).

### 3. SDK baseline pin test (`tests/unit/core/agents/backend/ClaudeCodeQueue.controlContracts.test.ts`)
Pinned installed SDK version assertion moved 0.3.312 → 0.3.319.

### 4. ZCode personal-config history/rollback API (`src/core/agents/backend/zcode/ZCodePersonalConfigService.ts`)
New public methods (coordinator-approved): `listPersonalConfigHistory(): Promise<readonly ArchiveHistoryEntrySummary[] | null>` and `restorePersonalConfigEntry(identity, expectedRevision): Promise<SafeFileMutationResult>`. Both delegate to the canonical `listConfigurationArchiveHistory` / `safeRestoreArchivedEntry`; allowlist narrowed to `dirname(targetPath)`; `null` only for out-of-allowlist targets, archive failures throw. Allowlist/archive construction shared with `mutate` via private helpers. UI consumes through the existing `ZCodeAdapter.getPersonalConfigService()` accessor. Regression tests: restore round-trip (blind conflict / stale conflict / success + re-archive growth), foreign-identity rejection, original target untouched.

## Probes: what changed vs what did not

| Backend | Contract finding | Source change needed |
|---|---|---|
| claude-code 0.3.319 | Additive: `SDKSessionWritesLostMessage`, 3 new startup-failure reasons, `pending_elicitation_requests`, hooks `onFailure`, `check_permissions` on mcp_call, `credential_expires_at` on results. Error-text paths flow through existing generic handling. SDK facade is feature-detected (`sdk.X ? ...`) in `ClaudeCodeSdkLoader`. | Only fix #1 |
| codex 0.167.0 | SDK byte-identical; app-server protocol changes are additive (0.166 lifecycle timestamps optional on items, new notifications; 0.167 managed checkpoints, `permissions.network`, MCP approval metadata). Client tolerates unknown notifications (handler-map + observer). `approval_policy` enum: **`untrusted` hard-rejected at config load** ("no longer supported; remove this setting"); `on-failure` / `on-request` / `never` accepted through config validation (verified by `-c` overrides on real turns). | None |
| opencode2 2.2.6 | Additive protocol only; adapter dispatches events selectively (unknown events ignored); runtime gate `startsWith('2.')` passes. | None |
| pi 1.5.0 | All four plugin SDK anchors intact: main export (157 keys) loads; `sdk.ModelRuntime` function; `@earendil-works/pi-ai` `./models` → `getSupportedThinkingLevels` function; `dist/core/output-guard.js` `takeOverStdout` function; `dist/core/settings-manager.js` `FileSettingsStorage` function. Evidence: `.tmp/backend-refresh-api/pi-15-schema-anchors.json`. The "0.73.1 anchor" caveat in the research tables concerns `SETTINGS_FIELDS` docs comments (form currency), not runtime RPC — no runtime drift found. Pi history implementation is delegated (agent_6dcbcedf) — not touched here. | None (runtime); history API owned elsewhere |
| zcode 3.17.2 native | Handshake-driven, no SDK pin. Isolated-storage semantics verified: `ZCODE_STORAGE_DIR` redirect drops account-linked providers from the registry (catalog 71 refs, 0 account:*); `session/setModel` requires `options.reasoningLevel` for reasoning-capable models; unknown model → "Provider Registry 中不存在 Model". Capability keys: sessionLifecycleWorkspace, sessionWorkspaceRouting, independentPlanState, historyFirst, sessionDirectorySource, residentRowsRange, genUiContext. | None (probe only) |
| dsh 0.2.2-rc.1 | Native catalog model values are opaque `JSON.stringify([group, modelId])` (e.g. `["deepseek-official","deepseek-flash"]` = DeepSeek-V4.1-Flash); `sdk` profile template still exists but moved packages (fix #2). ACP `session/new` → config options → `session/set_config_option` flow unchanged. | Fix #2 |

## Real-model turn evidence (all six implemented backends)

**Status summary (2026-11-08, superseding earlier per-run notes below):** the **six-backend real-model audit
matrix is verified for its selected-model scope** — opencode2 (**10/10 on actual CLI/server 2.2.6**,
`aux-audit-final-opencode2-226.json`, exit 0; supersedes the early server-2.2.5 outcome), dsh (8/8),
codex (8/8), pi (8/8), claude-code (8/8 **on the
explicit local CLI 2.1.319** via the `AUDIT_CLAUDE_BIN` resolver override; `aux-audit-final-claude-319.json`
supersedes the earlier global-CLI 2.1.312 run), **zcode (12/12, `aux-audit-final-zcode-verifier-fix.json`,
`passed`)** — after the scripts owner fixed the audit verifier's native event envelope (27 focused tests) and
the plugin-side synthetic-user attribution gate fix below. The earlier ZCode partial result (8/12, post-gate-fix,
`aux-audit-final-zcode-after-fix.json`) is **SUPERSEDED** by this complete 12-check report.

Runner: repo audit `node scripts/audit/run-aux-query-audit.mjs` (real-model execution, temp vaults, residue probes, fail-closed preflight) plus isolated contract probes. Raw evidence: `.tmp/backend-refresh-api/`.

### Final fresh audits (2026-11-08, after the scripts/audit positive-control repair by agent_0f21f041)

Commands (exact, no secrets in logs; `DEEPSEEK_API_KEY` only ever passed via env):

```sh
# claude-code + codex + pi in one run (fixed OC2 control, zero blocked):
AUDIT_AUX_MODEL_CLAUDE_CODE='claude-haiku-4-5' \
AUDIT_AUX_VISION_MODEL_CLAUDE_CODE='claude-haiku-4-5' \
AUDIT_AUX_MODEL_CODEX='krill/gpt-6.1-sol' AUDIT_AUX_VISION_MODEL_CODEX='krill/gpt-6.1-sol' \
AUDIT_AUX_MODEL_PI='deepseek/deepseek-flash' AUDIT_AUX_VISION_MODEL_PI='deepseek/deepseek-flash' \
AUDIT_AUX_CONTROL_MODEL='magpie/opencode-go-gw/deepseek-v4.1-flash' \
PI_BIN="$(command -v pi)" CODEX_BIN="$(command -v codex)" OPENCODE2_BIN="$(command -v opencode)" \
AUDIT_REPORT_PATH=.tmp/backend-refresh-api/aux-audit-final-cpi.json \
  node scripts/audit/run-aux-query-audit.mjs claude-code codex pi

# zcode (isolated-storage catalog model + required reasoning level):
AUDIT_AUX_MODEL_ZCODE='kimi-for-coding/kimi-for-coding-highspeed' \
AUDIT_AUX_VISION_MODEL_ZCODE='kimi-for-coding/kimi-for-coding-highspeed' \
AUDIT_AUX_REASONING_LEVEL_ZCODE='enabled' \
AUDIT_AUX_CONTROL_MODEL='magpie/opencode-go-gw/deepseek-v4.1-flash' \
OPENCODE2_BIN="$(command -v opencode)" \
AUDIT_REPORT_PATH=.tmp/backend-refresh-api/aux-audit-final-zcode.json \
  node scripts/audit/run-aux-query-audit.mjs zcode
```

| Backend | Final result | Evidence |
|---|---|---|
| claude-code | **Full audit PASS 8/8, zero blocked — on explicit local CLI 2.1.319** via `AUDIT_CLAUDE_BIN` (resolver override added by the scripts owner; verified in `scripts/audit/aux-query-audit.entry.ts:375-382`). This complete report **supersedes** the earlier 2.1.312 run. Control: induced write with sentinel; aux write denied with proof readback matching native; image turn OK; dispose clean; zero residue | `aux-audit-final-claude-319.json` (`passed:true`, 8/8 checks OK, `execution:"real-model"`, capturedAt 2026-11-07T16:18:05Z); earlier 2.1.312 report `aux-audit-final-cpi.json` kept for provenance |
| codex | **Full audit PASS 8/8, zero blocked** — same control proof; safety readback `[sandbox:readOnly, approval:never, network:false]` matches native; no rollout files written | `aux-audit-final-cpi.json` (codex outcome) |
| pi | **Full audit PASS 8/8, zero blocked** — readback `[read, grep, find, ls]` matches native; `~/.pi` unchanged (116 files); temp scope removed | `aux-audit-final-cpi.json` (pi outcome) |
| zcode | **Full audit PASS 12/12** (`status:"passed"`, `execution:"real-model"`, capturedAt 2026-11-07T17:08:00Z). Exact induced-write control: `observedTools:["Write"]`, `fileCreated:true`, `bytesEqual:true` 27/27 bytes, `hookExecuted:true`, `hookTrustGrantAccepted:true`. Aux turns prove empty tools on current turn, follow-up and image readback (`observedToolCount:0`, `writeClassHits:[none]`, `toolCallCount:0`); final vault residue `[]`. Supersedes the earlier post-gate-fix partial (8/12). Security note: the runtime owns `~/.zcode/security/workspace-hook-trust-v1.json` and adds one grant per scratch-owned audit run — no hand-editing, no broad trust; aux hooks remain false/zero-exec (hooks fire only for the audit's positive control). | `aux-audit-final-zcode-verifier-fix.json`; superseded partial kept for provenance: `aux-audit-final-zcode-after-fix.json` |

Zcode audit failure — baseline vs current side-by-side (2026-11-08, distinguishes pre-existing limit from refresh regression):

Focused baseline rerun at the ORIGINAL checkout `/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian` @ `7ba229538` (verified HEAD + clean status; old SDKs 0.3.312/0.165.0/2.2.0; pre-refresh audit script), identical model/reasoning params, all outputs redirected into the task worktree (`.tmp/backend-refresh-api/baseline-zcode-audit/`, `AUDIT_SCRATCH_ROOT`), no source or config edits anywhere:

| Check | Baseline 7ba229538 | Current worktree |
|---|---|---|
| 0. induced-write positive control | FAIL | FAIL |
| 1. effective tool catalogue readback | OK | OK |
| 2. induced write tool audit | FAIL ("query failed; runtime details withheld") | FAIL (identical text) |
| 3. vault filesystem snapshot unchanged | OK | OK |
| 1c. current turn native safety readback | FAIL (`nativeToolsObjectPresent:false`) | FAIL (identical) |
| 2b. generic auxiliary follow-up | FAIL (`success:false`) | FAIL (identical) |
| 1d. follow-up native safety readback | FAIL | FAIL |
| 3b. follow-up bytes unchanged | OK | OK |
| 5b. image turn native safety readback | FAIL | FAIL |
| 5. image attachment turn (R-A4) | FAIL | FAIL |
| 4. dispose residue cleanup | OK | OK |
| final audit vault bytes/residue | FAIL | FAIL |

Control-detail field comparison (baseline vs current): `observedTools:["Write"]` SAME, `fileCreated:true` SAME, `bytesEqual:true` SAME, `expectedBytes/actualBytes 27/27` SAME, `hookExecuted:false` SAME, `effectiveModel` SAME (kimi-for-coding/kimi-for-coding-highspeed); only run-specific paths and session ids differ. Static identity: `src/core/agents/backend/zcode/**` is byte-identical between baseline and worktree except `ZCodePersonalConfigService.ts` (the new history API — not in the audit execution path); `ZCodeAdapter.ts` and `ZCodeAuxQuerySession.ts` identical. Evidence: `baseline-zcode-audit/aux-audit-baseline-zcode.json` vs `aux-audit-final-zcode.json`.

Actual sanitized failure root (focused probe, both isolation modes): reproducing the harness aux path through `ZCodeAdapter.startAuxQuerySession` returns the adapter's own fail-closed error verbatim — **"ZCode auxiliary session could not prove an empty native tool set."** The gate (`ZCodeAuxQuerySession.waitForEffectiveTools`) polls `session/messages` for the user message's `info.tools` object; under the current native runtime (ZCode 3.17.2) that field is absent (`nativeToolsObjectPresent:false` — exactly what audit checks 1c/1d/5b observe), so the gate times out and correctly refuses to certify a read-only turn it cannot see. The probe reproduces this at the real `~/.zcode` fixed root as well (`zcode-aux-fixedroot.json`) and under redirected storage (`zcode-aux-isolated.json`) — i.e. the aux-gate failure was a pre-existing runtime readback-contract drift at this ZCode version, independent of this refresh. The plain-session path (no proof gate) streams real turns successfully at fixed root (`zcode-turn-real.json`). ~~Fixing the gate to a new readback shape is a separate coordinated task~~ — **superseded: the gate fix was subsequently authorized and landed; see the next section.**

### Zcode aux proof gate — fixed for the current runtime (2026-11-08, authorized API-compat scope)

Root cause (raw protocol probe `zcode-raw-shape.json`, sanitized dumps): ZCode 3.17.2 persists **four user-role rows per turn** — the real prompt (carrying the authoritative `info.tools` echo, `{}` when empty) plus three runtime-written synthetic `system_reminder` rows (`synthetic: true`, `visibility: 'model-only'`, no `tools`). The gate's old single-new-user assumption (`newUsers.length > 1 → null`) therefore failed everywhere, at any storage root.

Fix (src/core/agents/backend/zcode/ZCodeAuxQuerySession.ts, same owner file, fail-closed preserved): `waitForEffectiveTools` now attributes the authoritative proof to the real prompt row — among new user rows, exactly one may carry `info.tools` (two → fail closed); runtime-marked synthetic rows (`synthetic: true` — a host cannot forge the marker; `visibility` alone is not trusted) are tolerated only while the prompt readback has not landed; any new user row that is neither the prompt nor runtime-synthetic fails closed; the proof itself is still exclusively the empty `info.tools` object, plus the unchanged tool-event / `toolCallCount` / empty-`toolAllowlist`-create gates.

Validation: unit fixtures 27/27 (synthetic coexistence, synthetic-only page then prompt lands, two prompts fail closed, unexplained row fails closed, late-widened echo after synthetic pages fails closed); full backend suite 2704 passed / 0 failed; real CLI + real model probes pass at both the harness-isolated storage (`zcode-aux-isolated-after-fix.json`) and the real `~/.zcode` fixed root (`zcode-aux-fixedroot-after-fix.json`) with `success:true`.

Post-fix zcode audit (`aux-audit-final-zcode-after-fix.json`, **superseded**): passed its backend-owned checks (2, 2b, 1d, 5, 3/3b, 4) while the audit-harness side still had reds owned by the scripts agent (agent_0f21f041): `verifyZCodeNativeReadback` assumed exactly one new user row per turn (checks 1c/5b), check 0 `hookExecuted:false` under isolated storage (hook-model path decision), and control escape-file residue. **Final resolution:** the scripts owner fixed the verifier's native event envelope (27 focused tests) and produced the complete report `aux-audit-final-zcode-verifier-fix.json` — 12/12 checks OK including the previously failing 0/1c/5b, exact 27-byte Write control with `hookExecuted:true` / `hookTrustGrantAccepted:true`, empty-tool proof on current/follow-up/image turns, and empty final residue.

Claude CLI note (superseded): ~~the audit harness resolved the Claude CLI from fixed paths with no env override~~ — the scripts owner has since added the `AUDIT_CLAUDE_BIN` / `CLAUDE_BIN` resolver override (`aux-query-audit.entry.ts`, with 25 resolver tests), and the fresh complete audit now runs on the explicit local CLI 2.1.319: `aux-audit-final-claude-319.json` (8/8, `passed`). The earlier global-CLI 2.1.312 report and the standalone SDK 0.3.319 + CLI 2.1.319 turn (`claude-sdk-319-cli-319-turn.json`) remain as provenance only.

### Earlier run (pre-repair, kept for provenance)

| Backend | Result | Evidence file(s) |
|---|---|---|
| opencode2 | **Historical PASS 10/10 on server 2.2.5**; final 2.2.6 version acceptance uses the later separate 10/10 report | `aux-audit-six-real.json` (opencode2 outcome); superseded for version acceptance by `aux-audit-final-opencode2-226.json` |
| dsh | **Full audit PASS** (8/8 checks: write control, aux write denial, native readback, vision, cancellation, disposal, zero residue) — after fix #2 | `aux-audit-dsh-real.json` |
| claude-code | 7/8 (shared v1 control failed; now repaired above) | `aux-audit-six-real.json`; standalone SDK turns `claude-sdk-319-cli-312-turn.json`, `claude-sdk-319-cli-319-turn.json` |
| codex | 7/8 with catalog model `krill/gpt-6.1-sol`; app-server probe OK | `aux-audit-codex-real.json`; `codex-appserver-catalog.json` |
| pi | 7/8 | `aux-audit-six-real.json` (pi outcome) |
| zcode | Native probe (see below) | `zcode-contract.json`, `zcode-turn-real.json` |

Zcode native probe (separate evidence, real `~/.zcode` storage, isolated vault cwd): runtime/capabilities handshake → draft `session/setModel` readback → real session create → setModel `kimi-for-coding/kimi-for-coding-highspeed` (reasoningLevel `enabled`) → session/send → events `[session.titleUpdated, turn.started, session.updated, model.streaming, turn.completed]` in 21.5s → session/read 9 messages → close. Side effect: one native session created and closed in the user's session history; no config or credential change. Isolation facts verified: under redirected `ZCODE_STORAGE_DIR` the runtime catalog drops `account:*` providers (71 refs, 0 account); `session/setModel` requires `options.reasoningLevel` for reasoning-capable models; `opencode-go` provider 403 `auth_failed` upstream in this environment.

## Tests

- `tests/unit/core/agents/backend/ClaudeCodeStreamNormalizer.test.ts`: +2 fixtures (36/36 in file pass)
- `tests/unit/core/agents/backend/ZCodePersonalConfigService.test.ts`: +2 suites (6/6 in file pass)
- `tests/unit/core/agents/backend/ClaudeCodeQueue.controlContracts.test.ts`: pin moved to 0.3.319 (9/9)
- Full `tests/unit/core/agents/backend`: **2699 passed / 0 failed** (6 skipped), after all changes
- `npx tsc --noEmit`: clean for all API-owned files (remaining two errors are concurrent UI/audit agents' in-flight files: `SettingsDshSection.ts`, `aux-query-audit.entry.ts`)
- ESLint: clean on all files owned by this task (including `--fix` import sort on `ZCodePersonalConfigService.ts` and `assets/dsh/launcher.mjs`)
- **Focused regression rerun after the DSH-save/OC2-mock-DOM corrections (2026-11-08): 33/33 passed** across `SettingsDshSection.test.ts` + `SettingsOpenCode2Workspace.test.ts` + `BackendSettingsWorkspace.test.ts` (raw log: `/var/folders/kr/gbgh00qn3m70ff_fjsh7d55h0000gn/T/zcode-bash-WXnmEl/sess_249052a9-f04a-4d1d-ba92-a809cfafffcb/call_c256ce9488cc48bcbe335e013af323bd-stdout.log` — "Tests: 33 passed, 33 total")
- **`tsc --noEmit`: 0 errors** on the final source (raw log: `/var/folders/kr/gbgh00qn3m70ff_fjsh7d55h0000gn/T/zcode-bash-WXnmEl/sess_249052a9-f04a-4d1d-ba92-a809cfafffcb/call_d318c84c90514ce8b074656df6856eec-stdout.log`)
- Final full `npm run verify`: **exit 0**, **1041 suites / 11423 tests passed**, 2 suites / 6 tests skipped, **all 15 gates PASS** including lint, typecheck, full tests and production build. This supersedes the earlier in-flight/focused status above. Stable evidence: `.impeccable/review/round2/repaired/verify-summary.json`, final BUILD_ID `zcode-backend-settings-refresh.202611080229`.

### Final OC2 2.2.6 supplement

The parent ran the unchanged OpenCode 2 audit entry/adapter/assertions against the exact installed binary
(SHA-256 `90e4d03597b03d2051b65b4d793467764e55bacd8e22bf4824479c7233ea0e15`). CLI and native
server both report **2.2.6**; **10/10** real-model checks passed with exit **0** and active auxiliary
directory residue `[]`. Text: `magpie/opencode-go-gw/deepseek-v4.1-flash`; image:
`magpie/kimi-code/k3.1-pro`. A task-local wrapper paused direct Node deletion calls for five explicit
`zcode-safe-delete` commands; each directory was realpath-verified, and the final vault was confirmed
empty before quarantine, preserving original rmdir behavior. No gate/model response was replaced.
Bundle, identity and cleanup ledger remain in the worktree. Stable copies are
`.impeccable/review/round2/repaired/opencode2-226-audit.json` and `opencode2-226-runtime-proof.json`.
The early aggregate's passing OC2 outcome records **2.2.5** and is retained as history, not relabeled.
