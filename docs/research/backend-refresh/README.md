# Backend Settings Refresh — Research Index

2026-11-09 follow-up: [DSH A actual preview](dsh-style-a-preview.md) records current build `zcode-backend-settings-refresh.202611091642`. The repeated Working configuration footer is redesigned as a purpose-named Connection backup and restore disclosure on DSH Connection only, with empty/saved state, exact scope and compact actions. Five suites/59 focused tests, zero-warning lint, typecheck, docs and native save/restore/placement checks pass; five actual component capture states are recorded. Existing1611 control centering,1557 typography,1537 responsive width and1523 navigation refinements remain. HTML and withdrawn column experiments remain stopped. The six-backend closeout below remains historical.

> Research and acceptance index, reconciled 2026-11-08. Worktree
> `/Users/dht/zcode-worktrees/opencodian/backend-settings-refresh`, branch
> `zcode/backend-settings-refresh`, baseline `7ba229538`.
> Final reviewed UI: OpenCodian 2.1.5, BUILD_ID `zcode-backend-settings-refresh.202611080229`.
> Independent finish verdict: **SHIP**, F1/F2/F3 **Resolved**. Subsequent native Kimi review:
> **PASS**, zero material UI findings; the one low documentation finding is **Resolved** after
> same-reviewer recheck, with **0 open findings**. Final OC2 **2.2.6 native-runtime proof passed 10/10**
> with matching CLI/server version; it supersedes the earlier server-2.2.5 outcome for final-version acceptance.
> This records the delivered evidence, not publication or exhaustive-runtime authorization.
> Scope: ALL implemented/selectable agent backends. OpenCode 1 (`opencode`) is retired and stays retired
> (`IMPLEMENTED_AGENT_BACKENDS = ['opencode2','claude-code','codex','pi','zcode','dsh']`,
> `src/core/agents/backend/index.ts:13`); the dormant `opencode` kind/adapter/settings remain only for
> stored-conversation routing and rollback. Nothing in this research proposes re-adding it.

## Files

| File | Content |
|---|---|
| `README.md` | This index: baseline → implemented versions, effective-scope model and final evidence boundaries |
| `acceptance-plan.md` | Original acceptance contract with current, bounded dispositions |
| `evidence-index.md` | Exact audit/build/capture/review artifacts and remaining limits |
| `completion-audit.md` | Requirement-by-requirement closeout, review sequence and carry-forward boundaries |
| `api-refresh-implementation-results.md` | API compatibility narrative; six named backend outcomes pass, including the final exact-version OC2 2.2.6 10/10 supplement and complete 0229 verify evidence |
| `implementation-safety-note.md` | Parent-owned incident record — preserved verbatim, listed here for index completeness only |
| `claude-model-alias-evidence.md` | Claude `--model` CLI alias capture (2.1.319) feeding the model dropdown choices |
| `codex-approval-policy-cli-evidence.md` | Codex 0.167.0 `approval_policy` CLI acceptance probes (untrusted hard-rejected) |
| `backend-fields-claude-code.md` | Claude Code full field table (plugin + SDK + external sources) |
| `backend-fields-codex.md` | Codex full field table (plugin + app-server + config.toml) |
| `backend-fields-pi.md` | Pi full field table (plugin + Pi SDK config files) |
| `backend-fields-zcode.md` | ZCode full field table (plugin + native runtime + account) |
| `backend-fields-dsh.md` | DSH (DeepSeek Harness) full field table |
| `backend-fields-opencode2.md` | OpenCode 2 full field table |
| `external-config-inventory.md` | Config managed OUTSIDE the plugin per backend (files, scopes, precedence) |
| `coverage-map.md` | Field families → source types → UI grouping (every UI-visible control accounted) |
| `field-to-task-map.md` | Field families → backend task groups (navigation registry used to derive subtabs) |
| `copy-review.md` | Copy review + applied locale replacement record with machine-check results |
| `gap-audit.md` | Second-pass expansion audit: native/dynamic schemas added, overstatements corrected, remaining gaps |
| `versions-and-upstream.md` | Pinned vs latest SDK/CLI versions, upstream changelog deltas, bump constraints |

## Version matrix (research snapshot → implemented result)

Registry/release provenance is the 2026-11-06/07 snapshot in `versions-and-upstream.md`; it is not a
new registry check at closeout. Exact landed pins are recorded in `api-refresh-implementation-results.md`.

| Backend | Baseline → final package | External runtime / bounded audit result |
|---|---|---|
| claude-code | `@anthropic-ai/claude-agent-sdk` **0.3.312 → 0.3.319** | Final complete audit: **8/8**, explicit local CLI **2.1.319** via `AUDIT_CLAUDE_BIN`. Earlier global CLI 2.1.312 run is provenance only; the user's global installation is not claimed upgraded. |
| codex | `@openai/codex-sdk` **0.165.0 → 0.167.0** | Local CLI 0.167.0, final **8/8**. Wrapper `dist/` bytes are unchanged; app-server/CLI compatibility has sampled live evidence, not all-option coverage. |
| opencode2 | `@opencode/client` **2.2.0 → 2.2.6** | **Final 10/10 on CLI and native server 2.2.6**, `aux-audit-final-opencode2-226.json`; text and image models ran, native policies/readback and zero active auxiliary-directory residue passed. Earlier server-2.2.5 outcome remains historical. |
| pi | No package pin; spawned official CLI RPC | Local official CLI **1.5.0**, final **8/8**; no bump needed at the research snapshot. Dynamic/native fields remain bounded by SDK validation and documented form coverage. |
| zcode | No npm pin; official desktop bundle | Desktop **3.17.2**, final **12/12** after the proof-gate/verifier repairs. Runtime compatibility is handshake-based; its exact internal version floor remains unknown. |
| dsh | No package pin; spawned CLI | **0.2.2-rc.1**, final **8/8** after fixing the `PROFILE_TEMPLATES` package relocation. No CLI bump needed at the snapshot. |
| opencode (retired) | `@opencode-ai/sdk` **1.19.5 → 1.19.5** | Dormant; excluded from selectable backends and this six-backend acceptance. |

The green matrix is assembled from each backend's named final outcome, not from a claim that every
historical aggregate report passed. Exact model selections, reports and audit limits are in
`evidence-index.md` §1. A successful auxiliary/model audit does not verify every setting or model.

## Final evidence navigation

- [Completion audit](completion-audit.md) maps user requirements to the final artifacts and remaining limits.
- [Delivery navigation](../../../.impeccable/review/round2/DELIVERY.md) links the field tables, reports and individual images.
- Final **0229** UI evidence is **18 normal + 23 special = 41 individual PNGs**; three galleries are convenience composites, not extra independent states.
- The scenario directory has **10 PNGs + 6 JSONs**. Common recovery and Claude choice evidence is **0150**; native OC2 history is **0158**. These are carried forward with their original identities, not relabeled 0229.
- `repaired/verify-summary.json`: **15 gates PASS**, **1041 suites / 11423 tests passed**, two suites/six tests skipped. `repaired/final-state-check.json` records 951 runtime-file fingerprints matching 0229; `repaired/final-deployment-check.json` records four main artifacts + 127 assets matching the Test Vault. These checks are not new GUI/test runs.
- Original `custom-subagent-review.md` (**FIX**) is preserved. `custom-subagent-verdict.md` (**SHIP**) resolves F1/F2/F3. `kimi-adversarial-review.md` subsequently records **PASS**, material UI findings 0; the original low documentation finding is **Resolved**, open findings **0**. The same native reviewer confirms actual viewing of **18 normal + 23 special + 10 scenario images**; OC2 history pixels remain context-only.

## Effective-scope model used in the field tables

Every field row in the per-backend files carries:

- **字段名** — the exact plugin settings key (settings.ts field name) or the external contract key.
- **作用** — one-sentence behavior.
- **默认值** — value after `getDefault*BackendSettings()` / normalizers (all in `src/core/types/settings.ts`).
- **取值范围** — enforced by normalizers at load (`settingsLoadNormalization.ts`) and/or UI validation.
- **生效方式** — honest application boundary, using this vocabulary:
  - **热（下一 turn 即生效）** — read at the next query build, such as Claude options consumed by the next query spawn; the current stream is not rewritten.
  - **下一 session（重连/新会话）** — consumed when a session/thread materializes (Codex next thread/start/resume options, Pi process spawn, ZCode session apply, DSH connection key, opencode2 permission apply).
  - **重启（插件重载）** — consumed only at adapter construction (`main.ts` + `AgentAdapterWiring.ts`), i.e. plugin reload / backend re-enable. SDK client, CLI path resolution, and app-server spawn live here.
- **风险等级** — PRODUCT risk of changing the field (security/data-loss/cost/account impact), on a
  低/中/高 scale. These are product judgments, not CodeGraph outputs.
- **scope/source** — plugin settings (current `.opencodian/settings.core.json` data envelope; legacy `data.json` is not the current save target) vs external config file vs upstream-only; plus
  **supported / external / unsupported** classification:
  - *supported*: actual plugin wiring / plugin-owned surface exists (the field is read, persisted and
    passed through by plugin code). This is NOT a claim that the full ADR-0001 loop is proven — runtime
    readback may still be `unavailable`/readback-only for a given field; per-field proof state is noted
    in the 备注 column where the code documents it, and unknowns are never labeled verified.
  - *external*: exists in upstream CLI/config files; plugin reads or edits through the source files, not plugin settings.
  - *unsupported*: upstream field deliberately NOT exposed (reason documented, e.g. managed-only sandbox fields).

## Adapter wiring map (where each backend reads settings)

| Backend | Adapter | Settings access | Construction site |
|---|---|---|---|
| claude-code | `ClaudeCodeAdapter` | live object ref `settings.backendSettings.claudeCode` read at every query build | `src/main.ts:634` |
| codex | `CodexAdapter` | snapshot options at construction + `updateXxx()` runtime mutators (next thread boundary) | `src/core/agents/backend/AgentAdapterWiring.ts:85` |
| pi | `PiAdapter` | `getSettings()` live getter, read at each process spawn / aux session create | `AgentAdapterWiring.ts:110` |
| zcode | `ZCodeAdapter` | `getSettings()` live getter, applied via `applyPersistedDefaults` at session materialization | `AgentAdapterWiring.ts:114` |
| dsh | `DshAdapter` | `getSettings()` live getter + connection-key comparison (transport/cwd/command/args/env) → restart when changed | `AgentAdapterWiring.ts:128` |
| opencode2 | `OpenCode2Adapter` | `getSettings()` live getter + connection key `[mode, executablePath, baseUrl, password, configContent]` → reconnect; `permissionMode` per turn | `AgentAdapterWiring.ts:79` |
| opencode (retired) | `OpenCodeAdapter` | not registered anywhere | — |

## Known unknowns (explicit)

- ZCode native runtime (`zcode-agent`) exact version floor: plugin validates by handshake, not version
  number; the bundled `zcode.cjs` version string could not be extracted reliably from the minified bundle
  (grep shows internal version strings 0.11–0.17.1; UNKNOWN which is the runtime's own).
- DSH native protocol version is `opencodian.dsh-native/1` (plugin-defined), not a dsh-CLI version; the
  upstream dsh CLI does not publish a protocol compatibility matrix (UNKNOWN).
- Pi `models.json` global path: resolved by the Pi SDK itself at runtime (`get_config` RPC returns the
  path); plugin-side code never hard-codes it (see `PiMcpConfigService.ts` for the MCP subset it does
  hard-code). Exact SDK search order for non-MCP config is upstream-defined (see external-config file).
- Whether the settings tab's Claude mutations always mutate the adapter's live object in place vs replace
  it was only spot-checked (normalizers re-create objects on load; section code mostly mutates fields in
  place). A refresh path exists for backend re-selection; treat as "next query" with a plugin reload
  fallback if a stale-reference bug is suspected.
