# Copy review — backend-refresh new locale strings (2026-11-08)

Scope: the 184 newly inserted locale keys per locale (first ~220 lines of the `en.ts`/`zh.ts` diff vs
base `7ba229538`) plus the new-key copy consumed by the reworked `SettingsClaudeCodeSection` /
`SettingsCodexSection`. Read-only review; deliverables are
`.tmp/backend-refresh-ui/humanized-copy.json` (proposed replacements only) and this mapping.
Method rules: `my-skills/custom/humanize/SKILL.md` (routing, fidelity red lines) +
`my-skills/external/shuorenhua/shuorenhua/SKILL.md` (说人话: keep facts/judgment/responsibility/numbers/
conditions/modality; never invent sources or capabilities; minimal edits; interface names, commands and
placeholders verbatim). Baseline for fidelity tests: `.tmp/backend-refresh-ui/copy-original.json`
(184 en + 184 zh keys, extracted verbatim from current locale files).

## Replacement table (every row = one key in humanized-copy.json)

| # | Key (locale) | Problem | Rule violated | Proposed (summary) | Evidence of actual behavior |
|---|---|---|---|---|---|
| 1 | `settings.opencode2.workspace.modeLocalDesc` (zh) | 「为本仓库启动」 reads as git repo; the object is the Obsidian vault. Same-diff keys already use 当前库 (`settings.backend.workspace.scope`, `meta.scope.vault`) | 中文语境内"仓库"歧义；同族术语不一致 | 为**当前库**启动并托管… | OpenCode2Adapter cwd = `getVaultBasePath` (main.ts wiring); consistency target inside same key set |
| 2 | `settings.agent.dsh.workingDirectory.vault` (zh) | 「当前仓库」 same ambiguity; EN says "Current vault" | 同上 | 当前库 | `settings.workingDirectory \|\| this.options.workingDirectory` (DshAdapter.ts:169); options.workingDirectory = vault |
| 3 | `settings.agent.dsh.workingDirectory.vaultDesc` (zh) | 「当前仓库内的文件」 | 同上 | 会话读取与编辑当前库内的文件 | same as #2 |
| 4 | `settings.pi.history.help` (en+zh) | "Pi keeps no archive of this file" / 「Pi 不会为该文件保留归档」 is a claim about Pi's own behavior the plugin cannot know; only plugin-side session history is proven | 不编造无源断言（shuorenhua 来源不明条款；任务规则: no arbitrary claim 'Pi keeps no archive'） | State only plugin facts: versions captured this session, memory-only, never written to vault, gone on reload, revision-checked restore | `SettingsPiProvidersSection.ts:12` ("history is never persisted"), `:174-176` (in-memory `documentHistory` Map, capped list) |
| 5 | `settings.pi.status.legacyDefaults` (en+zh) | Exposes internal identifier `backendSettings.pi` in a normal-explanation source chip | 任务规则: hide technical internals from normal explanation; identifiers only in technical labels | "Plugin settings in this vault" / 「当前库的插件设置」 (matches `settings.backendRefresh.source.pluginVaultSetting`) | settings persist in plugin `data.json` under `backendSettings`; chip semantics unchanged |
| 6 | `settings.zcode.permissions.source` (en+zh) | Same identifier leak (`backendSettings.zcode`) | 同上 | same as #5 | same |
| 7 | `settings.zcode.ui.accountScope` (zh) | 「所有仓库共享」 | 仓库→库 ambiguity | 当前电脑上的所有库共享 | ADR-0003 shared login; `~/.opencodian/zcode/account/` machine-scoped credentials (ZCodeAccountService.ts:55) |
| 8 | `settings.zcode.ui.history.help` (zh) | 「不进入仓库」 | 同上 | 不进入当前库 | Archive behavior VERIFIED TRUE and kept: `ConfigurationArchiveService` archive-before-replace + revision gate (ZCodePersonalConfigService.ts:124-143) |
| 9 | `settings.backend.workspace.application` (zh) | EN has the honesty clause "A saved value is not confirmation from the running backend"; zh drops it and only says wait | 保存/回读诚实性规则: saved ≠ runtime-confirmed | Add the clause back while keeping the wait guidance | ADR-0001 axis model: persistence ≠ runtime readback |
| 10 | `settings.backendRefresh.source.readbackOnly` (en+zh) | Imperative "Read the running value again to confirm it" reads as an instruction, not a source-state label; as a chip it should state the pending status | 5s-test clarity; same honesty rule | "Saved — the backend has not confirmed it yet" / 「已保存，后端尚未确认」 | chip rendered by `attachProofChip(..., source)` in reworked sections |
| 11 | `settings.agent.dsh.executable.autoDesc` (en+zh) | "(or the bundled launcher)" is wrong: the fallback after PATH is the **installed DeepSeek Harness desktop app** (macOS only); the bundled `assets/dsh/service.mjs` is the native-extension host, not a CLI discovery target; Windows errors when PATH lookup fails | 不编造能力；取值范围与行为一致 | "finds `dsh` on PATH automatically (on macOS it can also launch the installed DeepSeek Harness app)" | `resolveDshLaunch` (DshAcpClient.ts:80-124): PATH probe → `/Applications/DeepSeek Harness.app` + `~/Applications` (darwin) → win32 hard error → bare `dsh` |
| 12 | `settings.zcode.permissions.planQuirk` (en+zh) | Accurate but ~40-word single sentence; fails the 5-second scan while carrying four load-bearing facts | 任务: simplify for 5s test WITHOUT losing facts | Tightened two-clause version keeping: relies on native confirmation · some builds accept Plan but keep base mode · unconfirmed switch errors in conversation · not silent | ZCodeModelCatalog.ts:23 (0.16.9 projection quirk), ZCodeAdapter.ts:633 ("Plan mode was not confirmed by native readback" terminal chunk), getEffectiveMode plan-state projection (1526-1556) |
| 13 | `settings.backend.choice.unlisted` (en) | "Saved choice is not in this list {{value}}" — value lands at sentence end, awkward scan; placeholder token itself must not change | 5s-test readability; placeholder preservation (token kept exactly `{{value}}`, position moved) | "Saved choice {{value}} is not in this list" | pure copy reorder; key and token unchanged |

Keys reviewed and deliberately NOT changed (verified accurate; over-claim check passed):

- `settings.opencode2.workspace.executableAutoDesc` — coordinator asked to verify "opencode2 on PATH"
  is not a false hardcode. VERIFIED TRUE: `@opencode/cli@2.2.6` `package.json` bin = `{"opencode":
  "./bin/opencode.exe","opencode2":"./bin/opencode.exe"}` (same binary, two aliases; checked in the
  installed global package), and `OpenCode2Adapter.ts:145` spawns `settings.executablePath.trim() ||
  'opencode2'`. The copy states exactly what the resolver does. No change.
- `settings.agent.dsh.transport.nativeDesc` — images/history/commands/compaction/inline all proven
  native-only: Images capability gate (DshAdapter.ts:141), `session/commands` (DshAdapter.ts:501),
  `session/history` + `session/compact` + aux-requires-native (DshAdapter.ts:334-438).
- `settings.agent.dsh.launch.advanced.warn` — "never appear in recovery snapshots" TRUE: recovery
  allowlist for dsh = `['executablePath','workingDirectory','profile','transport']` (BackendSettingsWorkspace.ts:40), args/env excluded.
- `settings.agent.dsh.mcp.name.desc` / `command.desc` / `url.desc` — validator regex
  `/^[A-Za-z0-9_-]{1,32}$/`, `path.isAbsolute`, http(s)-only URL (DshProtocolCodec.ts:24-56). Copy matches.
- `settings.zcode.status.discoverySource`, `settings.pi.status.packageGuard` (per-spawn official-package
  check, PiRpcClient `resolvePiSdkCli`), `settings.pi.legacyDefaults.help` (native-default write clears
  legacy keys, SettingsPiSection.ts:84), `settings.backend.recovery.restored/.scope` (paths consumed at
  adapter construction → plugin reload; non-secret allowlist only), `settings.codex.*` retired-approval
  strings ({value}/{key}/{allowed} placeholders intact), `settings.claudeCode.groups.models.*`,
  `settings.claudeCode.permissionMode.bypassPermissions.desc`, `settings.backendRefresh.source.verifiedRuntime`
  (time-scoped "latest response" — honest as written), `settings.backend.meta.*` chips, tab labels,
  `settings.backendRefresh.default.*`.

## Flagged source issues (NOT patched — report only)

1. **DSH secrets render as plain text.** MCP HTTP header values and launch-env values use
   `input type: 'text'` (`SettingsDshSection.ts:717`, `:699`, `:390`; no `type: 'password'` anywhere in
   the file). Header copy correctly says tokens "stay in plugin settings only" (storage), but values are
   fully visible while typing — shoulder-surfing / screen-share leak. Recommend password-type inputs or
   masked display with reveal toggle for header/env value fields, matching the plugin's own
   password-input convention (Claude authToken, ZCode apiKey rows). Copy intentionally NOT changed to
   compensate.
2. **Locale loader robustness note**: `settings.agent.dsh.launch.args.placeholder` contains a literal
   newline (`--flag\n--other value`) inside a single-quoted TS string — valid TS, but any future
   extraction script must keep `\n` escapes intact; preserved verbatim in the baseline snapshot.

## Version/table currency note

- `package.json` in the worktree has ALREADY applied the research recommendations
  (claude-agent-sdk 0.3.319, codex-sdk 0.167.0, @opencode/client 2.2.6 — diff vs base confirmed), so
  `docs/research/backend-refresh/versions-and-upstream.md` "recommended bump set" is now implemented,
  not stale.
- DSH package re-checked today: `@deepseek-ai/dsh` dist-tags unchanged (latest/next 0.2.2-rc.1,
  alpha 0.2.2-alpha.3) — research tables remain current; no update note needed beyond this line.

## Placeholder fidelity

All placeholder tokens in replaced strings preserved exactly: `{{value}}` (#13). Untouched keys holding
placeholders (`{{time}}`, `{{date}}`, `{{size}}`, `{value}`, `{key}`, `{allowed}`, `{{count}}`) are in
the baseline snapshot unmodified. No key renamed, none collapsed.

## Late-arriving keys (added by a parallel agent during this review)

`settings.pi.status.runtimeMissing.{missing,incompatible,permission,unknown}` (en+zh) appeared in the
diff after the initial 184-key extraction; baseline snapshot extended to 188+188. Review result: clean —
each states the failure, one next action, and retry; no overclaim (matches `resolvePiSdkCli`/probe
failure modes: not-found, wrong package, unreadable permissions, probe error), no placeholders, no
technical identifiers exposed. No replacement proposed.

---

# Application record (2026-11-08, write pass)

Authorized write applied to `src/i18n/locales/en.ts` / `zh.ts` ONLY. Pre-edit snapshots:
`.tmp/backend-refresh-ui/{en,zh}.ts.pre-edit`. Applied: 10 en + 17 zh value replacements + 1 new key
`settings.pi.history.failed` (en+zh, coordinator-supplied exact text). Source frozen at handoff.

## Coordinator corrections incorporated (superseding the proposal table above)

| Key | Superseded proposal | Final applied | Reason |
|---|---|---|---|
| `settings.backendRefresh.source.readbackOnly` | "Saved — the backend has not confirmed it yet" | EN "Runtime readback is required" / zh "以运行时回读为准" | the key is a static SOURCE label, not a saved-state claim |
| `settings.zcode.permissions.planQuirk` (en+zh) | two-clause version with "instead of failing silently" | EN "Plan takes effect after the ZCode runtime confirms it. Some builds accept Plan while keeping the base mode, so an unconfirmed switch reports an error in the conversation." / zh "Plan 需要 ZCode 运行时确认后才会生效。部分版本会接受 Plan 但保持基础模式运行，未确认的切换会在对话中报错。" | human-writing ban on 翻案句; positive direct text for Plan |
| `settings.pi.history.help` (en+zh) | (kept) | memory-fallback wording stays explicitly current-session; nativeHelp remains the separate persistent-archive key | Pi persistent native history landing; two-tier structure |

## Additional applied changes this pass

- `settings.pi.fieldsUnavailable` reword (en+zh, "has no editable fields for this group" phrasing).
- `settings.claudeCode.thinking.desc` + `settings.claudeCode.effort.desc` rewritten (en+zh) into one
  behavior sentence each; machine reference "SDK options builder" removed; enum option labels
  (adaptive/disabled/fixed, low..max), placeholder `4096`, defaults, security semantics untouched.
- `settings.pi.history.nativeHelp` zh: 仓库→当前库 machine-term swap only (location claims kept as
  authored — Pi native-history backend probe (`supportsConfigurationHistory`) has no core implementation
  yet, so the location detail is the parent's landing contract, flagged unverified, not rewritten).
- 仓库 sweep: zero occurrences remain in new-key zh corpus (verified programmatically).

## Machine checks (scripts: my-skills/scripts/de-ai-fidelity, python3 -I, profile technical)

| Check | EN | ZH |
|---|---|---|
| duplicate keys | 0 (6783 keys total) | 0 (6783 keys total) |
| en/zh key parity | full | full |
| placeholder drift (changed keys) | none | none |
| pattern_audit after (hard-residue) | 1 [HR-001] | 1 [HR-001] (+1 strong-contextual SC-005) |
| pattern_audit before (baseline) | 1 [HR-001] same key | 1 [HR-001] same key |
| fidelity_guard | 13/13 pass, 0 fail, 0 warn | 0 fail, 5 warnings (justified below) |
| change_report | -0.6% length, protected spans 0 | protected spans 0 |

Hard-residue 1→1 (not increased) — humanize rule satisfied.

## False-positive / warning annotations (no bypass)

1. **[HR-001] EN** on `settings.agent.dsh.executable.autoDesc`: flags backtick `` `dsh` `` as a template
   placeholder. It is a real CLI command name (bin of `@deepseek-ai/dsh`, local 0.2.2-rc.1). shuorenhua
   mandates commands/interface names verbatim; backticks are the sibling-key convention (`--profile acp`
   in `settings.agent.dsh.launch.args.desc`). Identical hit on the before-corpus → pre-existing, 1→1.
2. **[HR-001] ZH** on `settings.backend.choice.unlisted`: flags `{{value}}`. This is the mandatory i18n
   interpolation token (engine contract); the task explicitly requires placeholders preserved EXACT.
   Identical hit on before-corpus → 1→1.
3. **[SC-005] ZH** on dsh autoDesc: "推荐：" structural clustering across sibling dropdown-option keys.
   Corpus artifact: the three 推荐：-prefixed option descriptions are adjacent in the corpus file but are
   separate dropdown options in the UI; the shared prefix is the established convention of the new key
   set across all six backends.
4. **ZH fidelity_guard warnings (5)** — all justified redistributions, per-key semantics preserved:
   "不是" ADDED in `settings.backend.workspace.application` (restores the honesty clause zh was missing);
   "可能"→"部分版本" in planQuirk (uncertainty kept via partial quantifier); "当…时"→"取决于…是否" in
   thinking.desc (condition kept, made explicit); remaining 不/不会 deltas from the planQuirk
   positive-rewrite (failure fact kept as "未确认的切换会在对话中报错") and history.help restructure.

## Artifacts

- `.tmp/backend-refresh-ui/copy-original.json` — 210 en + 210 zh keys (complete corpus incl. +19 native
  keys, +1 failed key, +2 existing Claude keys), stable
- `.tmp/backend-refresh-ui/copy-before-after.json` — keyed before/after for all 27 changed + 1 added key
- `.tmp/backend-refresh-ui/humanized-copy.json` — final applied replacement set (10 en / 17 zh)
- `.tmp/backend-refresh-ui/corpus-{en,zh}-{before,after}.txt` — machine-check corpora, stable key order
- `.tmp/backend-refresh-ui/{en,zh}.ts.pre-edit` — pre-edit locale snapshots

---

# Final copy audit (2026-11-08, freeze pass)

Scope: the post-review merged additions audited on the CURRENT locale files (no edits made by this pass —
parent owns locale drops while verify runs). Full-file state: **6821 keys per locale, 0 duplicates,
en/zh parity full, no placeholder drift** on all audited keys.

## Audited additions (all verified merged, values match reviewed artifacts exactly)

| Set | Keys | Machine-check result |
|---|---|---|
| `claude-numeric-locales.json` (numeric preset dropdown + custom positive value) | 3 | pattern_audit en+zh: **0 hard residue, PASS** |
| `final-status-locales.json` (`recovery.unavailable`, `permissionMode.applyFailed`) | 2 | pattern_audit en+zh: **PASS** |
| `recovery-locales.json` (author draft) → `recovery-locales-reviewed.json` (parent final) | 22 + 22 | see below |
| earlier common-missing 4 keys (`pi-install-locales.json`) + model aliases 2 (`modelId.cliAliasOption/Desc`) | 6 | merged, present (parity check) |

## Recovery 22-key rewrite (author → parent-reviewed)

- Artifacts: `.tmp/backend-refresh-ui/copy-recovery-before-after.json` (keyed before/after, en+zh 22/22),
  `corpus-{en,zh}-recovery-{before,after}.txt`, `corpus-{en,zh}-newkeys-after.txt`.
- pattern_audit (after): en **0/0/0 PASS**, zh **0/0/0 PASS**.
- fidelity_guard: en **13/13 pass, 0 warn**; zh **0 fail**, 2 `[number] "5"` fails + 3 warnings —
  **justified, not drift**: the "5" is the real retention depth (`RECOVERY_LIMIT = 5`,
  `src/core/agents/backend/configuration/BackendConfigRecoveryStore.ts:14`) newly stated by the reviewed
  copy; the author draft simply lacked the fact. 不/未/当 deltas are redistributions preserving per-key
  semantics (failure fact kept: "Restoring replaces this vault's saved tool configuration",
  "Your saved configuration is unchanged").
- change_report: protected spans **0** both locales; length within thresholds.
- Placeholder contract: `{date}` / `{bytes}` tokens preserved exactly in merged locale files (values match
  the reviewed artifacts byte-for-byte; verified programmatically).

## Full corpus state at freeze

`copy-original.json` (210/210 earlier baseline) + `copy-before-after.json` (27+1 applied set) +
`copy-recovery-before-after.json` (22/22) + the three new-addition artifacts together cover every
user-visible string family of the refresh. No further copy edits pending; new UI copy beyond this scope
arrives with the parent's final artifacts for the final index.

---

# Pi review-locales repair (2026-11-08, bounded)

Input: `.tmp/backend-refresh-ui/pi-review-locales.json` (55 keys, en/zh parity). Output: **`.tmp/backend-refresh-ui/pi-review-locales-reviewed.json`** (55/55 parity, placeholders exact — `{{path}}` preserved in `unknown`). 24 one-sentence consequence fixes applied; parent merges. Label keys (51) pending from agent_b66 — will be reviewed on the final artifact, single read.

## Semantic fixes applied (evidence-backed)

| Keys | Issue | Fix |
|---|---|---|
| `defaultModel` / `defaultProvider` / `defaultThinkingLevel` / `enabledModels` | "clearing returns to the Pi built-in default" overclaims: clearing a PROJECT field reveals the GLOBAL value first (project inherits global) | EN "clearing follows the upper scope, then the Pi default" / zh 「清空后继承上层或 Pi 默认配置」— proven by `SettingsPiConfigurationSection.ts:415,424` (project scope reads `scopes.global` as inherited default) |
| `steeringMode` | "all queued turns or only the next one" wrong: steering batches delivery of queued steering messages to the ACTIVE turn | EN "how queued steering messages reach the active turn: all at once, or one at a time" / zh 「排队的纠偏消息…一次性全部投递，或逐条投递」— proven by `PiAdapter.ts:416-431` (`streamingBehavior:'steer'` injects into the ACTIVE turn, live-proven) |
| `followUpMode` | same wrong frame | EN "delivered after a turn ends: all at once, or one at a time" / zh 「轮次结束后…投递」— `streamingBehavior:'followUp'` is post-turn |
| `thinkingBudgets.{minimal,low,medium,high}` ×4 | "larger values cost more but reason longer" claims guaranteed cost/quality | EN "larger values allow more thinking tokens" / zh 「允许的思考 token 越多」 |
| `enableInstallTelemetry` | "minimal install telemetry" — upstream support for the 'minimal' qualifier unverified | conservative: "shares install telemetry with Pi" / 「共享安装遥测」 |
| `themes` | export-only appearance claim — conservative | "changes affect how Pi resolves themes" / 「影响 Pi 解析主题的方式」(`theme` key kept: upstream label itself states terminal+HTML export) |

## Short machine check (python3 -I, technical)

- pattern_audit (after): EN 1 hard-residue [HR-001] — **pre-existing, 1→1**, unchanged key `autocompleteMaxVisible` ("(3-20)" factual enforced range, min3/max20 in `SETTINGS_FIELDS`); detector's template-placeholder pattern misreads a numeric range. ZH 0 hard + 1 advisory ([AO-002] 先…再… — intended two-stage inheritance order).
- fidelity_guard: EN **13/13 pass, 0 warn**; ZH **0 fail**, 2 corpus-count warnings (不/当 deltas from the 12 rewrites; per-key polarity/conditions preserved).
- change_report: protected spans **0** both locales; zh length 1.018 (within threshold); en flagged "deleted sentence" is a diff-alignment artifact next to the `defaultProvider` period fix.
- Corpora: `corpus-{en,zh}-pireview-{before,after}.txt`.

**Pi review-locales final merge (2026-11-08, bounded):** `pi-review-locales-reviewed.json` now 107/107 parity — corrected 55 consequences preserved verbatim (source artifact's own revisions to those 12 keys intentionally NOT taken; production already carries the corrected texts) + 51 new `settings.pi.label.*` keys (all plain, upstream-aligned with `assets/pi/configuration.mjs` labels, zero raw paths) + 1 new consequence (`hideThinkingBlock`, display-only framing accurate). pattern_audit en+zh **PASS (0 hard residue)** on the new-key corpus; parity/dupes/placeholder checks clean; corpora `corpus-{en,zh}-pilabels-after.txt`. Ready for parent merge of the 52 new keys.

**Pi merge closure (2026-11-08):** the 107 reviewed keys are merged in actual production; labels verified 5/5 against real DOM tests; OC2 native project steering + compaction clear-inherit wrapper proof 10/10; `unknown` fallback retained with the honest empty-fallback source fix (the earlier "merge-gated" report was a test-spy reading attributes too early — corrected; fix triggered a fresh graphify rebuild). Computed locale count after the merge: **6928 keys per locale** (en/zh equal). No further copy edits pending.
