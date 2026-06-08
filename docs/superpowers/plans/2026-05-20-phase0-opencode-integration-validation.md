# Phase 0 OpenCode Integration Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that the recent multi-agent decoupling and Phase 0/1 UX changes did not regress OpenCodian's runtime integration with OpenCode.

**Architecture:** This is a validation-only plan: it adds no production code and treats failures as evidence to report before any fix plan is written. The work combines source-boundary inspection, focused existing Jest suites, full repository gates, a built Test Vault deployment, and real Obsidian smoke checks that exercise backend enablement, OpenCode availability, composer gating, session/history/tab preservation, slash preload behavior, console cleanliness, and runtime freshness.

**Tech Stack:** Obsidian plugin, TypeScript/Jest, OpenCodian `npm run verify`, esbuild `BUILD_ID`, Test Vault deployment, Obsidian developer CLI, runtime DOM/eval smoke checks, DevTools console/error capture.

---

## Validation Constraints

- Do not implement production code while executing this plan.
- Do not edit `src/**`, `styles.css`, `manifest.json`, `package.json`, or module docs as part of this validation pass.
- If any validation step fails, stop the task, record the exact failure in the evidence doc, and escalate a separate fix plan.
- Treat `opencode` as the only implemented backend for Phase 0. Any future backend appearing as selectable runtime UI is a regression unless `IMPLEMENTED_AGENT_BACKENDS` has intentionally changed.
- Distinguish three states in evidence: no enabled backend, backend enabled but OpenCode offline, and OpenCode ready/running or external.
- Build and Test Vault copy must be separate sequential steps. Do not chain build/copy/verification commands.

## File Structure

- Create: `docs/status/phase0-opencode-integration-validation-2026-05-20.md`
  - Evidence report for all commands, Test Vault build/deploy proof, Obsidian runtime smoke results, console/error status, screenshots, and unresolved risks.
- Runtime-only: `.obsidian-debug/phase0-opencode-integration-validation/`
  - Eval snippets, JSON results, console captures, and screenshots. Do not commit this directory.
- Read-only source owners:
  - `src/core/agents/backend/AgentServiceRegistry.ts`
  - `src/core/agents/backend/OpenCodeAdapter.ts`
  - `src/core/runtime/PluginRuntimeCoordinator.ts`
  - `src/core/types/settingsLoadNormalization.ts`
  - `src/main.ts`
  - `src/features/chat/OpenCodianView.ts`
  - `src/features/chat/services/ComposerInputShellCoordinator.ts`
  - `src/features/chat/services/ConversationNoticeCoordinator.ts`
  - `src/features/settings/SettingsBackendSection.ts`
- Read-only tests:
  - `tests/unit/core/agents/backend/AgentServiceRegistry.test.ts`
  - `tests/unit/core/types/settingsLoadNormalization.test.ts`
  - `tests/unit/features/settings/SettingsBackendSection.test.ts`
  - `tests/unit/features/chat/composerAvailabilityState.test.ts`
  - `tests/unit/features/chat/slashCommandPreloadAvailability.test.ts`
  - `tests/unit/features/chat/ConversationNoticeCoordinator.test.ts`
  - `tests/unit/main.test.ts`

## Task 1: Establish Source Boundary Inventory

**Files:**
- Create: `docs/status/phase0-opencode-integration-validation-2026-05-20.md`
- Read: files listed in `File Structure`

- [ ] **Step 1: Confirm worktree and dirty-state baseline**

Run:

```bash
pwd
git status --short
```

Expected: `pwd` prints `/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/.worktrees/phase0-capability`. `git status --short` may show existing Phase 0 changes, but this validation pass must only add `docs/status/phase0-opencode-integration-validation-2026-05-20.md` and runtime-only `.obsidian-debug/phase0-opencode-integration-validation/*`.

- [ ] **Step 2: Create the evidence document skeleton**

Create `docs/status/phase0-opencode-integration-validation-2026-05-20.md` with exactly these headings:

```md
# Phase 0 OpenCode Integration Validation - 2026-05-20

## Scope

Validate that Phase 0 multi-agent backend decoupling and Phase 0/1 UX changes preserve OpenCode integration.

## Source Boundary Inventory

## Focused Unit Verification

## Full Repository Gates

## Build And Deployment Freshness

## Obsidian Runtime Smoke Matrix

## Console And Error Cleanliness

## Findings

## Residual Risks
```

- [ ] **Step 3: Inspect backend and runtime seams**

Run:

```bash
rg -n "IMPLEMENTED_AGENT_BACKENDS|AgentServiceRegistry|OpenCodeAdapter|enabledBackends|activeBackend|hasEnabledBackend|ensureRuntimeWarmupReadyForSessionBootstrap|invalidateSlashCommandMenuCatalogs|handleOpenCodeServerStatusChange|createConversation" src/core src/features src/main.ts
```

Expected: output includes the active owner seams in `src/core/agents/backend/*`, `src/core/runtime/PluginRuntimeCoordinator.ts`, `src/core/types/settingsLoadNormalization.ts`, `src/main.ts`, `src/features/chat/OpenCodianView.ts`, and `src/features/settings/SettingsBackendSection.ts`. Record the exact files and note that no direct future-backend runtime path should be exercised in Phase 0.

- [ ] **Step 4: Inspect UI availability seams**

Run:

```bash
rg -n "getComposerAvailabilityState|hasAnyEnabledBackend|hasBackendConnection|noBackend|backendOffline|shouldRenderEmptyConversationNotice|isOpenCodeBackendActive|getServerAvailability" src/features src/i18n tests/unit/features
```

Expected: output shows separate host seams for no-enabled-backend and backend-offline states in `OpenCodianView`, `ComposerInputShellCoordinator`, `ConversationNoticeCoordinator`, locale keys, and focused unit tests. Record whether the evidence covers both disabled composer controls and empty conversation notices.

## Task 2: Validate Backend Capability And UI State Contracts

**Files:**
- Create: `docs/status/phase0-opencode-integration-validation-2026-05-20.md`
- Read: focused tests listed below

- [ ] **Step 1: Run registry, settings, composer, notice, and startup focused tests**

Run:

```bash
npm test -- --runInBand \
  tests/unit/core/agents/backend/AgentServiceRegistry.test.ts \
  tests/unit/core/types/settingsLoadNormalization.test.ts \
  tests/unit/features/settings/SettingsBackendSection.test.ts \
  tests/unit/features/chat/composerAvailabilityState.test.ts \
  tests/unit/features/chat/slashCommandPreloadAvailability.test.ts \
  tests/unit/features/chat/ConversationNoticeCoordinator.test.ts \
  tests/unit/main.test.ts
```

Expected: PASS. Record the suite/test counts. If this fails, record the first failing test name and stop before Obsidian smoke checks.

- [ ] **Step 2: Verify Phase 0 exposes only implemented backends**

Run:

```bash
npm test -- --runInBand tests/unit/features/settings/SettingsBackendSection.test.ts tests/unit/core/types/settingsLoadNormalization.test.ts
```

Expected: PASS with coverage for `BACKEND_OPTIONS` exposing only `opencode`, saved unknown backends being filtered, and `activeBackend` falling back to an enabled implemented backend. Record this as the guard against Phase 1 UX exposing unimplemented backends.

- [ ] **Step 3: Verify no-enabled-backend and backend-offline are separate UI states**

Run:

```bash
npm test -- --runInBand tests/unit/features/chat/composerAvailabilityState.test.ts tests/unit/features/chat/ConversationNoticeCoordinator.test.ts
```

Expected: PASS. Record the tested behavior: no enabled backend yields `no-backend` composer/empty-state copy, while enabled OpenCode with offline availability yields `backend-offline` copy.

## Task 3: Validate Slash Runtime Preload And Session Bootstrap Gates

**Files:**
- Create: `docs/status/phase0-opencode-integration-validation-2026-05-20.md`
- Read: `src/core/runtime/PluginRuntimeCoordinator.ts`, `src/main.ts`, `src/features/chat/OpenCodianView.ts`

- [ ] **Step 1: Run slash preload and startup warmup tests**

Run:

```bash
npm test -- --runInBand tests/unit/features/chat/slashCommandPreloadAvailability.test.ts tests/unit/main.test.ts
```

Expected: PASS. Record that slash catalog warm preload does not run when OpenCode backend is disabled, and `handleOpenCodeServerStatusChange('running')` still preloads when OpenCode becomes running.

- [ ] **Step 2: Verify direct source guard for session creation**

Run:

```bash
rg -n "Cannot create conversation: opencode backend is not enabled|ensureRuntimeWarmupReadyForSessionBootstrap|openCodeService.createSession|backend: this.settings.activeBackend" src/main.ts tests/unit/main.test.ts
```

Expected: output shows `createConversation()` refusing session creation when `opencode` is disabled, waiting for runtime warmup before session bootstrap when enabled, calling `openCodeService.createSession()`, and persisting `backend: this.settings.activeBackend`.

- [ ] **Step 3: Verify slash catalog cache still remains runtime-backed**

Run:

```bash
rg -n "SlashCommandMenuCatalogCache|loadSlashCommandMenuItems|invalidateSlashCommandMenuCatalog|warm\\(|app\\.skills|app\\.agents" src/features src/core tests/unit
```

Expected: output shows slash menu items are loaded through `SlashCommandMenuCatalogCache`, invalidated through `OpenCodianView.invalidateSlashCommandMenuCatalog()`, and warmed only through the runtime preload path. Record whether `app.skills()` sidecar agent data remains the catalog source for composer agent mentions.

## Task 4: Run Full Repository Gates

**Files:**
- Create: `docs/status/phase0-opencode-integration-validation-2026-05-20.md`

- [ ] **Step 1: Run full verification**

Run:

```bash
npm run verify
```

Expected: PASS with lint, typecheck, tests, production build, module-doc checks, graphify freshness checks, devlog order checks, and owner guard checks passing. Record the final suite/test counts and any non-failing graphify "graph too large" warning separately from blockers.

- [ ] **Step 2: Run diff hygiene after verification**

Run:

```bash
git diff --check
git status --short
```

Expected: `git diff --check` prints no whitespace errors. `git status --short` should not show source changes created by this validation pass; generated or pre-existing Phase 0 changes must be identified as pre-existing in the evidence doc.

## Task 5: Build, Deploy, And Prove Runtime Freshness

**Files:**
- Create: `docs/status/phase0-opencode-integration-validation-2026-05-20.md`
- Runtime target: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`

- [ ] **Step 1: Build production artifacts**

Run:

```bash
npm run build
```

Expected: exits `0`, produces `dist/main.js`, `dist/manifest.json`, and `dist/styles.css`, and prints one `BUILD_ID` line such as `[build] BUILD_ID: phase0-capability.YYYYMMDDHHMM`. Record the exact `BUILD_ID`.

- [ ] **Step 2: Copy `main.js` to Test Vault**

Run:

```bash
cp dist/main.js /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js
```

Expected: exits `0`.

- [ ] **Step 3: Copy `manifest.json` to Test Vault**

Run:

```bash
cp dist/manifest.json /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/manifest.json
```

Expected: exits `0`.

- [ ] **Step 4: Copy `styles.css` to Test Vault**

Run:

```bash
cp dist/styles.css /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/styles.css
```

Expected: exits `0`.

- [ ] **Step 5: Verify deployed `BUILD_ID`**

Run:

```bash
BUILD_ID=$(node -e "const fs=require('fs'); const text=fs.readFileSync('dist/main.js','utf8'); const match=text.match(/[A-Za-z0-9._-]+\\.[0-9]{12}/); if (!match) process.exit(1); console.log(match[0]);")
printf '%s\n' "$BUILD_ID"
rg -F "$BUILD_ID" /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js
```

Expected: prints a non-empty `BUILD_ID`, and `rg` finds that exact value in the deployed Test Vault `main.js`.

## Task 6: Run Obsidian/Test Vault Smoke Matrix

**Files:**
- Create: `docs/status/phase0-opencode-integration-validation-2026-05-20.md`
- Runtime-only: `.obsidian-debug/phase0-opencode-integration-validation/*`

- [ ] **Step 1: Prepare debug capture directory**

Run:

```bash
mkdir -p .obsidian-debug/phase0-opencode-integration-validation
```

Expected: directory exists.

- [ ] **Step 2: Clear Obsidian console and reload deployed plugin**

Run:

```bash
obsidian dev:debug on vault=testvault
obsidian dev:console clear vault=testvault
obsidian dev:errors clear vault=testvault
obsidian plugin:reload id=opencodian vault=testvault
```

Expected: commands exit `0`. If plugin reload reports stale plugin files or missing plugin id, stop and record the reload failure.

- [ ] **Step 3: Smoke no-enabled-backend UI**

Run:

```bash
obsidian eval vault=testvault code="(() => { const plugin = app.plugins.plugins.opencodian; const prev = { enabledBackends: [...plugin.settings.enabledBackends], activeBackend: plugin.settings.activeBackend }; plugin.settings.enabledBackends = []; plugin.settings.activeBackend = 'opencode'; return plugin.saveSettings().then(async () => { await plugin.activateView?.(); const leaves = app.workspace.getLeavesOfType('opencodian'); const root = leaves[0]?.view?.contentEl; const composerDisabled = !!root?.querySelector('.opencodian-composer-disabled-state'); const sendDisabled = !!root?.querySelector('.opencodian-send-button[disabled], button[aria-label=\"Send message\"][disabled]'); const text = root?.textContent || ''; plugin.settings.enabledBackends = prev.enabledBackends; plugin.settings.activeBackend = prev.activeBackend; await plugin.saveSettings(); return { leaves: leaves.length, composerDisabled, sendDisabled, hasNoBackendCopy: /backend|agent|enable|启用|后端/.test(text), restored: plugin.settings.enabledBackends }; }); })()"
```

Expected: JSON reports at least one OpenCodian leaf, `composerDisabled: true`, `sendDisabled: true`, and `hasNoBackendCopy: true`. Record the JSON output.

- [ ] **Step 4: Smoke backend-offline UI**

Run:

```bash
obsidian eval vault=testvault code="(() => { const plugin = app.plugins.plugins.opencodian; const prev = { enabledBackends: [...plugin.settings.enabledBackends], activeBackend: plugin.settings.activeBackend, server: JSON.parse(JSON.stringify(plugin.settings.server)) }; plugin.settings.enabledBackends = ['opencode']; plugin.settings.activeBackend = 'opencode'; plugin.settings.server = { mode: 'remote', remote: { baseUrl: 'http://127.0.0.1:9' } }; return plugin.saveSettings().then(async () => { await plugin.activateView?.(); const leaves = app.workspace.getLeavesOfType('opencodian'); const root = leaves[0]?.view?.contentEl; const statusText = root?.textContent || ''; const composerDisabled = !!root?.querySelector('.opencodian-composer-disabled-state'); plugin.settings.enabledBackends = prev.enabledBackends; plugin.settings.activeBackend = prev.activeBackend; plugin.settings.server = prev.server; await plugin.saveSettings(); return { leaves: leaves.length, composerDisabled, hasOfflineCopy: /offline|server|connection|连接|离线|服务器/.test(statusText) }; }); })()"
```

Expected: JSON reports at least one OpenCodian leaf, `composerDisabled: true`, and `hasOfflineCopy: true`. This proves offline OpenCode is distinct from no enabled backend.

- [ ] **Step 5: Smoke OpenCode ready surface, composer, and slash preload**

Run:

```bash
obsidian eval vault=testvault code="(() => { const plugin = app.plugins.plugins.opencodian; plugin.settings.enabledBackends = ['opencode']; plugin.settings.activeBackend = 'opencode'; return plugin.saveSettings().then(async () => { await plugin.startConfiguredLocalServerIfNeeded?.(); await plugin.activateView?.(); const leaves = app.workspace.getLeavesOfType('opencodian'); const view = leaves[0]?.view; await view?.reloadModelCatalog?.(); view?.invalidateSlashCommandMenuCatalog?.({ preload: true }); await new Promise(resolve => setTimeout(resolve, 1500)); const root = view?.contentEl; const disabled = !!root?.querySelector('.opencodian-composer-disabled-state'); const textarea = root?.querySelector('textarea'); const slashMenu = root?.querySelector('.opencodian-slash-command-menu, .opencodian-slash-menu'); return { leaves: leaves.length, serverStatus: plugin.openCodeService?.getServerStatus?.(), serviceReady: plugin.openCodeService?.isReady?.(), composerDisabled: disabled, hasTextarea: !!textarea, slashMenuMounted: !!slashMenu }; }); })()"
```

Expected: JSON reports at least one leaf, `hasTextarea: true`, `composerDisabled: false`, and either `serviceReady: true` or an OpenCode server status consistent with ready/running/external. If the local server cannot start in the environment, record that as an environment blocker and keep the offline evidence from Step 4.

- [ ] **Step 6: Smoke session, history, and tab preservation**

Run:

```bash
obsidian eval vault=testvault code="(() => { const plugin = app.plugins.plugins.opencodian; return (async () => { plugin.settings.enabledBackends = ['opencode']; plugin.settings.activeBackend = 'opencode'; await plugin.saveSettings(); const beforeTabs = plugin.settings.tabs ? JSON.stringify(plugin.settings.tabs) : null; const beforeCount = plugin.conversations?.length || 0; const conversation = await plugin.createConversation(); await plugin.loadConversations?.(); await plugin.activateView?.(); const leaves = app.workspace.getLeavesOfType('opencodian'); const afterTabs = plugin.settings.tabs ? JSON.stringify(plugin.settings.tabs) : null; const found = (plugin.conversations || []).some(c => c.id === conversation.id && c.backend === 'opencode' && !!c.openCodeSessionId); return { beforeCount, afterCount: plugin.conversations?.length || 0, createdId: conversation.id, backend: conversation.backend, hasOpenCodeSessionId: !!conversation.openCodeSessionId, found, tabsPreserved: beforeTabs === afterTabs || beforeTabs === null }; })(); })()"
```

Expected: JSON reports `backend: "opencode"`, `hasOpenCodeSessionId: true`, `found: true`, and `tabsPreserved: true`. If session creation is blocked because OpenCode is unavailable, record this as the primary integration risk.

- [ ] **Step 7: Capture smoke screenshot**

Run:

```bash
obsidian dev:screenshot vault=testvault path=/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/.worktrees/phase0-capability/.obsidian-debug/phase0-opencode-integration-validation/chat-ready.png
```

Expected: screenshot file exists and shows the OpenCodian chat surface after the ready-state smoke.

## Task 7: Verify Console And Error Cleanliness

**Files:**
- Create: `docs/status/phase0-opencode-integration-validation-2026-05-20.md`

- [ ] **Step 1: Check captured Obsidian errors**

Run:

```bash
obsidian dev:errors vault=testvault
```

Expected: `No errors captured.` If errors are present, record the first OpenCodian-related stack and classify whether it belongs to backend gating, OpenCode service availability, composer rendering, session preservation, slash preload, or deployment freshness.

- [ ] **Step 2: Check error-level console messages**

Run:

```bash
obsidian dev:console vault=testvault level=error limit=80
```

Expected: `No console messages captured.` If messages are present, record the first OpenCodian-related message and stop before claiming Phase 0 validation complete.

- [ ] **Step 3: Check startup freshness log**

Run:

```bash
obsidian dev:console vault=testvault limit=120 | rg -n "OpenCodian .*BUILD_ID=|deferred runtime warmup|Server status changed|slash"
```

Expected: output includes the deployed `BUILD_ID` startup line or another runtime-visible build identity matching Task 5. Record any warmup or slash preload log lines that prove the deployed runtime, not a stale Obsidian process, handled the smoke.

## Task 8: Finalize Evidence And Handoff

**Files:**
- Create: `docs/status/phase0-opencode-integration-validation-2026-05-20.md`

- [ ] **Step 1: Complete the evidence doc**

Update `docs/status/phase0-opencode-integration-validation-2026-05-20.md` so it contains:

```md
## Findings

- PASS/FAIL: backend registry and implemented backend exposure
- PASS/FAIL: no-enabled-backend UI
- PASS/FAIL: backend-offline UI
- PASS/FAIL: OpenCode service availability and composer ready state
- PASS/FAIL: session/history/tab preservation
- PASS/FAIL: slash runtime preload
- PASS/FAIL: Test Vault BUILD_ID freshness
- PASS/FAIL: console and errors cleanliness

## Residual Risks

- Environment-dependent OpenCode startup failures, if any, with exact command output
- Any smoke check that could not run in the current Obsidian/Test Vault session
- Any pre-existing dirty worktree files that were not produced by this validation pass
```

- [ ] **Step 2: Inspect validation-only diff**

Run:

```bash
git diff --stat
git diff --check
git diff -- docs/status/phase0-opencode-integration-validation-2026-05-20.md docs/superpowers/plans/2026-05-20-phase0-opencode-integration-validation.md | sed -n '1,260p'
```

Expected: diff contains the evidence doc and this plan only. Whitespace check prints no errors.

- [ ] **Step 3: Commit validation artifacts only after all required checks pass**

Run:

```bash
git add docs/status/phase0-opencode-integration-validation-2026-05-20.md docs/superpowers/plans/2026-05-20-phase0-opencode-integration-validation.md
git commit -m "docs: add phase0 opencode integration validation plan"
```

Expected: commit succeeds. Do not add `.obsidian-debug/phase0-opencode-integration-validation/*` unless a later human explicitly asks to preserve runtime evidence in git.

## Self-Review

- Spec coverage: The plan covers runtime/backend capability boundaries, no-enabled-backend versus backend-offline UI, OpenCode service availability, composer availability, session/history/tab preservation, slash/runtime preload behavior, Test Vault smoke checks, console/errors cleanliness, and BUILD_ID/runtime freshness.
- Red-flag scan: No empty fill-in markers are present; each command has an expected result and failure handling.
- Type consistency: Backend kind names use `opencode` and the UI states use the current `ready`, `no-backend`, and `backend-offline` vocabulary from the source seams.
