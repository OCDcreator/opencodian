# OpenCode Latest SDK Full Productization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade OpenCodian's plugin-only OpenCode SDK to the execution-time latest stable release, then safely productize every post-1.15.3 capability through existing Chat and Settings owners.

**Architecture:** Keep `OpenCodeSdkFacade` as the only raw SDK boundary and preserve the existing service coordinators plus legacy HTTP/SSE fallbacks. Build a typed capability registry that combines SDK shape, live server support, user gates, and risk class; `OpenCodeService` exposes semantic operations while existing Chat and Settings owners render their normal, disabled, or experimental states from that registry.

**Tech Stack:** TypeScript, `@opencode-ai/sdk`, Jest, Obsidian APIs, existing OpenCode service/coordinator architecture, npm, Git, and Obsidian Plugin Autodebug.

## Global Constraints

- Work only in `/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian`.
- At execution start, resolve `npm view @opencode-ai/sdk dist-tags --json`; use only its `latest` stable value, never beta/next/dev/snapshot tags.
- Upgrade only plugin dependency files. Do not upgrade user OpenCode CLI, remote service, or managed sidecar binary.
- Preserve sessions and settings before maximizing coverage: existing Chat regression blocks later phases.
- Keep `OpenCodeSdkFacade` as the sole raw SDK namespace/request/unwrap/error boundary. Chat and Settings may not call new raw SDK endpoints directly.
- Preserve current HTTP/SSE fallback behavior and ServerManager ownership unless separately approved after runtime evidence.
- Settings must display unsupported capability rows with reason and re-check action. Do not hide a known capability merely because the connected server cannot serve it.
- New experimental gates are default-off. A state-changing, PTY, control-plane, background, or project-copy UI action requires both server support and user opt-in, then an explicit confirmation at action time.
- Auto-migrate only behaviorally equivalent configuration. Preserve raw backups and explain every impossible mapping instead of deleting/reinterpreting it.
- Never persist or log secrets, tokens, raw credentials, or unredacted server errors.
- Every `src/` change requires matching `docs/modules/**` updates and `npm run graphify:update:src` before `npm run check:graphify`.
- `npm run verify` is the local completion gate. Lint warnings are failures for this work.
- Every product-facing phase requires Test Vault proof through `obsidian-plugin-autodebug`; test-only changes do not require deployment.
- The existing worktree `codex/opencode-sdk-117-capability-registry` may be inspected or selectively transplanted only after its API assumptions match the execution-time SDK inventory.

---

## File Structure

- Modify `package.json`, `package-lock.json`: pin the exact latest stable SDK selected in Task 1.
- Create `docs/status/opencode-sdk-<version>-capability-inventory.md`: immutable execution evidence with source tag/commit, type diff, endpoint classification, min-server evidence, and ownership map.
- Create or update `src/core/opencode/OpenCodeSdkCapabilityRegistry.ts`: static capability metadata and stable ids.
- Create `src/core/opencode/OpenCodeSdkCapabilityState.ts`: pure availability resolution for SDK/server/gate/risk combinations.
- Create `src/core/opencode/OpenCodeSdkCapabilityDiscoveryCoordinator.ts`: live server discovery and redacted evidence capture, owned by `OpenCodeService`.
- Create `src/core/opencode/OpenCodeSdkExperimentalActionCoordinator.ts`: confirmed PTY/control-plane/project-copy/background actions and cleanup lifecycle.
- Modify `src/core/opencode/OpenCodeSdkFacade.ts`, `src/core/opencode/sdkTypes.ts`, and `src/core/opencode/OpenCodeService.ts`: exact SDK compatibility, semantic capability access, typed unsupported result, and fallback route.
- Modify `src/core/types/settings.ts`, `src/core/storage/StorageService.ts`, and `src/main.ts`: versioned settings envelope, normalization, idempotent migration report, raw backup retention, and startup notice.
- Modify existing Settings owners: `SettingsServerSection.ts`, `SettingsConversationSection.ts`, `SettingsAgentsSection.ts`, `SettingsCommandsSection.ts`, `SettingsSkillSection.ts`, `SettingsToolSection.ts`, `SettingsSecuritySection.ts`, `SettingsMcpSection.ts`, and `SettingsCapabilityLabSection.ts` only for their mapped capability families.
- Modify existing Chat owners selected by the inventory: `OpenCodianView.ts`, `OpenCodeSessionControlOrchestrator.ts`, `SlashCommandMenuCatalogCache.ts`, `SlashCommandExecutionHostFactory.ts`, context-picker services, and existing session/action renderers. Do not create a new generic Chat capability dashboard.
- Update `src/i18n/locales/en.ts`, `src/i18n/locales/zh.ts`, matching module docs, `docs/status/sdk-v2-rollout.md`, and `docs/status/sdk-v2-manual-checklist.md`.
- Add focused tests beside every new owner; extend existing SDK facade, OpenCode service compatibility, settings, and Chat tests rather than duplicating fixtures.

---

### Task 1: Pin the Execution-Time SDK and Produce the Capability Inventory

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `docs/status/opencode-sdk-<resolved-version>-capability-inventory.md`
- Test: existing `tests/unit/core/opencode/createSdkClient.test.ts` and `tests/unit/core/opencode/OpenCodeSdkFacade.test.ts`

**Interfaces:**
- Consumes: installed `1.15.3` package, local `reference-projects/opencode`, npm registry, upstream OpenCode source, and `OpenCodeSdkFacade` namespace list.
- Produces: exact package version, upstream source commit/tag, a machine-checkable endpoint inventory, and one classification for every added endpoint: `productize`, `diagnostic-only`, `unsupported-with-reason`, `deferred-by-safety`, or `obsolete`.

- [ ] **Step 1: Capture package and upstream facts before changing dependencies**

Run:

```bash
npm view @opencode-ai/sdk dist-tags --json
npm view @opencode-ai/sdk version dist.tarball dist.integrity --json
git -C reference-projects/opencode fetch --tags origin
git -C reference-projects/opencode rev-parse HEAD
git -C reference-projects/opencode describe --tags --always
```

Expected: record the `latest` semver, npm tarball integrity, upstream commit, and nearest tag in the inventory document. If `latest` is missing, non-semver, prerelease, or conflicts with the tarball metadata, stop before editing.

- [ ] **Step 2: Generate a baseline-to-latest SDK namespace/method diff**

Run the exact package inspection through a temporary directory outside the repository, then compare the exported generated client classes/methods with `1.15.3`:

```bash
mkdir -p /tmp/opencodian-sdk-audit
cd /tmp/opencodian-sdk-audit
npm pack @opencode-ai/sdk@1.15.3
npm pack @opencode-ai/sdk@<resolved-version>
tar -tf sdk-1.15.3.tgz | sort > sdk-1.15.3.files.txt
tar -tf sdk-<resolved-version>.tgz | sort > sdk-latest.files.txt
diff -u sdk-1.15.3.files.txt sdk-latest.files.txt
```

Then inspect the package's generated SDK declaration/source files and record every added or signature-changed namespace/method. The inventory must cover capabilities/health/location, session, agent/model/provider, integration/credential, permission/question, fs/command/skill/reference/event, PTY, project/worktree/VCS, and all experimental namespaces present in the actual package.

- [ ] **Step 3: Write a failing facade inventory test before changing facade types**

Extend `tests/unit/core/opencode/OpenCodeSdkFacade.test.ts` so its mock contains every actual new namespace needed by the inventory. Add a table-driven test asserting each registry `sdkPath` resolves or yields a typed unsupported result, never a raw proxy `TypeError`.

```typescript
for (const entry of getOpenCodeSdkCapabilityRegistry()) {
  expect(resolveSdkCapabilityMethod(facade, entry.sdkPath)).toEqual(
    entry.sdkPresence === 'available' ? expect.any(Function) : null,
  );
}
```

- [ ] **Step 4: Install the exact discovered stable version and update SDK boundary code minimally**

Run:

```bash
npm install --save-exact @opencode-ai/sdk@<resolved-version>
npm ls @opencode-ai/sdk --depth=0
```

Expected: `package.json` and lockfile contain the exact version and npm integrity. Update `sdkTypes.ts`, `OpenCodeSdkFacade.ts`, or `createSdkClient.ts` only where typechecking or the failing facade test proves an SDK shape changed.

- [ ] **Step 5: Verify the upgrade boundary**

Run:

```bash
npm test -- tests/unit/core/opencode/createSdkClient.test.ts tests/unit/core/opencode/OpenCodeSdkFacade.test.ts
npm run typecheck
```

Expected: both commands pass. Record changed request/response contract details in the inventory.

- [ ] **Step 6: Commit the pin and inventory evidence**

```bash
git add package.json package-lock.json src/core/opencode/sdkTypes.ts src/core/opencode/OpenCodeSdkFacade.ts src/core/opencode/createSdkClient.ts tests/unit/core/opencode/createSdkClient.test.ts tests/unit/core/opencode/OpenCodeSdkFacade.test.ts docs/status/opencode-sdk-<resolved-version>-capability-inventory.md
git commit -m "Upgrade OpenCode SDK boundary"
```

Only stage files actually changed by this task.

---

### Task 2: Establish Typed Capability Availability and Server Negotiation

**Files:**
- Create: `src/core/opencode/OpenCodeSdkCapabilityRegistry.ts`
- Create: `src/core/opencode/OpenCodeSdkCapabilityState.ts`
- Create: `src/core/opencode/OpenCodeSdkCapabilityDiscoveryCoordinator.ts`
- Modify: `src/core/opencode/OpenCodeService.ts`, `src/core/opencode/sdkFeatureFlags.ts`
- Test: `tests/unit/core/opencode/OpenCodeSdkCapabilityRegistry.test.ts`, `tests/unit/core/opencode/OpenCodeSdkCapabilityState.test.ts`, `tests/unit/core/opencode/OpenCodeSdkCapabilityDiscoveryCoordinator.test.ts`, `tests/unit/core/opencode/OpenCodeService.sdkCompat.test.ts`

**Interfaces:**
- Produces `OpenCodeSdkCapabilityDefinition`, `OpenCodeSdkCapabilityState`, `OpenCodeSdkCapabilityAvailability`, `OpenCodeSdkCapabilitySnapshot`, and `OpenCodeUnsupportedCapabilityResult`.
- `OpenCodeService.getSdkCapabilitySnapshot(): OpenCodeSdkCapabilitySnapshot` returns immutable state.
- `OpenCodeService.refreshSdkCapabilities(): Promise<OpenCodeSdkCapabilitySnapshot>` re-checks server support without changing user gates.
- `OpenCodeService.requireSdkCapability(id)` returns availability or a typed, redacted unsupported result that callers can display.

- [ ] **Step 1: Write failing pure-state tests**

Cover the cross-product below in `OpenCodeSdkCapabilityState.test.ts`:

```typescript
expect(resolveCapabilityAvailability({ sdk: true, server: true, gate: true, safety: 'read' }))
  .toMatchObject({ kind: 'available' });
expect(resolveCapabilityAvailability({ sdk: true, server: false, gate: true, safety: 'read' }))
  .toMatchObject({ kind: 'unsupported-by-server' });
expect(resolveCapabilityAvailability({ sdk: true, server: true, gate: false, safety: 'experimental-action' }))
  .toMatchObject({ kind: 'disabled-by-user' });
expect(resolveCapabilityAvailability({ sdk: false, server: true, gate: true, safety: 'read' }))
  .toMatchObject({ kind: 'unsupported-by-sdk' });
```

- [ ] **Step 2: Implement the registry and pure resolver**

Define stable ids that map directly to the inventory's real SDK paths. Each definition must include `id`, `sdkPath`, `category`, `surface`, `risk`, `defaultGate`, `serverProbe`, `fallbackPolicy`, and `minimumServerHint`. Keep registry metadata static and typed; do not infer UI labels from raw SDK names.

- [ ] **Step 3: Write failing discovery-coordinator tests with a fake facade**

Test that `capabilities`/health/location are queried first where the actual SDK exposes them, endpoint-not-found responses become `unsupported-by-server`, transport failures become `unknown` with a redacted reason, and state-changing entries do not invoke their action as a probe.

- [ ] **Step 4: Implement live discovery through the existing SDK facade**

Use only safe presence/readback/shape calls. Preserve server `directory` scoping and current `config.providers` truth rules. Cache the last complete snapshot, expose a refresh method, and retain `unknown` rather than treating transient connectivity loss as unsupported.

- [ ] **Step 5: Wire OpenCodeService and feature flags**

Keep existing six SDK migration flags intact. Add capability gates independently so turning off an experimental user preference cannot disable the stable prompt/stream/abort/questions/sync main chain.

- [ ] **Step 6: Run focused tests and commit**

Run:

```bash
npm test -- tests/unit/core/opencode/OpenCodeSdkCapabilityRegistry.test.ts tests/unit/core/opencode/OpenCodeSdkCapabilityState.test.ts tests/unit/core/opencode/OpenCodeSdkCapabilityDiscoveryCoordinator.test.ts tests/unit/core/opencode/OpenCodeService.sdkCompat.test.ts
```

Expected: all pass, including no-action probe assertions.

```bash
git add src/core/opencode/OpenCodeSdkCapabilityRegistry.ts src/core/opencode/OpenCodeSdkCapabilityState.ts src/core/opencode/OpenCodeSdkCapabilityDiscoveryCoordinator.ts src/core/opencode/OpenCodeService.ts src/core/opencode/sdkFeatureFlags.ts tests/unit/core/opencode/OpenCodeSdkCapabilityRegistry.test.ts tests/unit/core/opencode/OpenCodeSdkCapabilityState.test.ts tests/unit/core/opencode/OpenCodeSdkCapabilityDiscoveryCoordinator.test.ts tests/unit/core/opencode/OpenCodeService.sdkCompat.test.ts
git commit -m "Add OpenCode capability negotiation"
```

---

### Task 3: Add Settings Envelope, Safe Migration, and Compatibility Reporting

**Files:**
- Modify: `src/core/types/settings.ts`, `src/core/storage/StorageService.ts`, `src/main.ts`
- Create: `src/core/opencode/OpenCodeCapabilitySettingsMigration.ts`
- Test: `tests/unit/core/opencode/OpenCodeCapabilitySettingsMigration.test.ts`, `tests/unit/core/storage/StorageService.test.ts`, `tests/unit/main/themeSettingsMigration.test.ts` or the existing settings-load suite that owns normalization

**Interfaces:**
- Adds `OpenCodeCapabilitySettings` with `schemaVersion`, stable preferences, `experimentalGates`, and `migrationReport`.
- Adds `normalizeOpenCodeCapabilitySettings(value: unknown): OpenCodeCapabilitySettings`.
- Adds `migrateOpenCodeCapabilitySettings(raw, now): OpenCodeCapabilityMigrationResult` with `normalized`, `report`, and `requiresBackup`.

- [ ] **Step 1: Write migration tests before adding fields**

Use real legacy-shaped fixtures. Assert four outcomes: safe mapping preserves behavior; valid legacy field remains readable; impossible mapping retains raw backup and produces an actionable report item; repeated migration is idempotent.

```typescript
expect(migrateOpenCodeCapabilitySettings(legacyFixture, fixedNow)).toMatchObject({
  normalized: { schemaVersion: 1 },
  report: { entries: [expect.objectContaining({ outcome: 'migrated' })] },
  requiresBackup: true,
});
```

- [ ] **Step 2: Implement typed envelope and normalizer**

Put defaults in `DEFAULT_SETTINGS`, normalize only at the settings boundary, and keep experimental gates false by default. Do not store live server availability, secrets, or raw server payloads in settings.

- [ ] **Step 3: Implement migration with StorageService backup semantics**

Reuse existing primary/backup/legacy persistence paths. Snapshot the unmodified settings envelope before any non-trivial migration, validate normalized settings before persistence, and report migration status through `main.ts` without exposing raw backup content.

- [ ] **Step 4: Verify settings regression and commit**

Run:

```bash
npm test -- tests/unit/core/opencode/OpenCodeCapabilitySettingsMigration.test.ts tests/unit/core/storage/StorageService.test.ts tests/unit/main/themeSettingsMigration.test.ts
npm run typecheck
```

Expected: migration is idempotent, backup survives, and existing split persistence tests pass.

```bash
git add src/core/types/settings.ts src/core/storage/StorageService.ts src/main.ts src/core/opencode/OpenCodeCapabilitySettingsMigration.ts tests/unit/core/opencode/OpenCodeCapabilitySettingsMigration.test.ts tests/unit/core/storage/StorageService.test.ts tests/unit/main/themeSettingsMigration.test.ts
git commit -m "Add OpenCode capability settings migration"
```

---

### Task 4: Productize Stable Server, Catalog, Config, and Discovery Surfaces

**Files:**
- Modify only mapped existing owners: `src/features/settings/SettingsServerSection.ts`, `SettingsAgentsSection.ts`, `SettingsCommandsSection.ts`, `SettingsSkillSection.ts`, `SettingsToolSection.ts`, `SettingsSecuritySection.ts`, `SettingsMcpSection.ts`
- Modify: `src/i18n/locales/en.ts`, `src/i18n/locales/zh.ts`
- Test: corresponding `tests/unit/features/settings/*.test.ts`

**Interfaces:**
- Each owner reads `OpenCodeService.getSdkCapabilitySnapshot()` and uses `requireSdkCapability(id)` before actions.
- Settings row contract: capability name, status, redacted reason/minimum server hint, re-check button, optional stable preference, and optional experimental gate.

- [ ] **Step 1: Write failing Settings tests for status rows and re-check**

For every owner touched by the actual inventory, add fixtures for `available`, `unsupported-by-server`, `disabled-by-user`, and `unknown`. Assert unsupported rows remain visible, action buttons are disabled, reason text is rendered, and re-check calls `refreshSdkCapabilities()`.

- [ ] **Step 2: Implement read-only stable capability rows first**

Map health/location, agent/model/provider, command/skill/tool, integration/credential, permission/question, and MCP/config APIs to their existing Settings owners. Do not add a generic capability page. Do not introduce a second config editor where an existing section owns the data.

- [ ] **Step 3: Add stable configuration actions with confirmation and redaction**

For any inventory endpoint that mutates integration, credential, provider, config, project, or auth state, use the current modal/confirmation pattern, typed service result, refresh after success, and an inline failure reason. Never persist credentials in the plugin setting envelope.

- [ ] **Step 4: Run scoped Settings tests and commit**

Run the exact test files changed in this task, then:

```bash
npm run lint -- --max-warnings=0
npm run typecheck
```

Expected: focused tests, lint, and typecheck pass without warnings.

```bash
git add src/features/settings src/i18n/locales/en.ts src/i18n/locales/zh.ts tests/unit/features/settings
git commit -m "Expose OpenCode stable capability settings"
```

Stage only the files touched by this task.

---

### Task 5: Productize Stable Chat and Session Capabilities Through Existing Owners

**Files:**
- Modify only mapped existing owners: `src/core/opencode/OpenCodeSessionControlOrchestrator.ts`, `src/features/chat/OpenCodianView.ts`, `src/features/chat/services/SlashCommandMenuCatalogCache.ts`, `src/features/chat/services/SlashCommandExecutionHostFactory.ts`, existing context-picker services, and existing session-action renderers
- Test: matching `tests/unit/core/opencode/OpenCodeSessionControlOrchestrator.test.ts`, `tests/unit/features/chat/**`, and slash-command/session test suites

**Interfaces:**
- Stable service methods return semantic success or `OpenCodeUnsupportedCapabilityResult`; they do not expose raw generated SDK response shapes.
- Chat controls ask the service whether a capability is available before render and again before action.

- [ ] **Step 1: Write failing tests for stable Chat availability behavior**

Cover session summarize/history/events/async/command/shell only where the Phase 0 inventory marks them stable. Test available action dispatch, unsupported action suppression with a user-readable hint, and legacy fallback where already present.

- [ ] **Step 2: Implement session and command actions without collapsing runtime ownership**

Extend `OpenCodeSessionControlOrchestrator` for session API additions. Preserve concurrent tab/session streaming, foreground `session.status` semantics, authoritative hydration, and current abort behavior. Use existing slash-command cache invalidation after settings or server capability changes.

- [ ] **Step 3: Implement contextual file/search/reference results inside existing context flow**

Where the inventory supports `fs`, `find`, `file`, or `reference`, add results as context-picker or message-result affordances. Respect directory scope, default to read-only, and do not create a duplicate filesystem browser.

- [ ] **Step 4: Add project/VCS/diff affordances only where current Chat owns them**

Use existing project/session diff notices and action menus. Any worktree or VCS mutation must show scoped preview and confirmation; absent server support remains a visible disabled Settings status rather than an unsafe Chat button.

- [ ] **Step 5: Run Chat/session regression suite and commit**

Run all exact focused suites changed in this task plus:

```bash
npm test -- tests/unit/core/opencode/OpenCodeSessionControlOrchestrator.test.ts tests/unit/features/chat/OpenCodianView.test.ts
```

Expected: no session, streaming, cancellation, question, permission, or slash-command regression.

```bash
git add src/core/opencode/OpenCodeSessionControlOrchestrator.ts src/features/chat tests/unit/core/opencode tests/unit/features/chat
git commit -m "Expose OpenCode stable chat capabilities"
```

---

### Task 6: Add Experimental Actions Behind Default-Off Gates

**Files:**
- Create: `src/core/opencode/OpenCodeSdkExperimentalActionCoordinator.ts`
- Modify: `src/core/opencode/OpenCodeService.ts`, `src/features/settings/SettingsConversationSection.ts`, `src/features/settings/SettingsServerSection.ts`, `src/features/chat/OpenCodianView.ts`, existing action/modal renderers, locales
- Test: `tests/unit/core/opencode/OpenCodeSdkExperimentalActionCoordinator.test.ts`, matching Settings and Chat tests

**Interfaces:**
- `runExperimentalAction(request)` requires `capabilityId`, explicit user confirmation, server availability, and enabled experimental gate.
- `OpenCodeExperimentalActionResult` includes `kind: 'completed' | 'cancelled' | 'unsupported' | 'failed'`, redacted detail, and optional cleanup operation.

- [x] **Step 1: Write failing gate and cleanup tests**

Test that PTY, control-plane, project-copy, and background/session actions do not call the facade when their gate is false, the server is unsupported, or confirmation is absent. Test cancellation/cleanup after a created PTY or failed background action.

- [x] **Step 2: Implement one coordinator with explicit risk classifications**

Keep all state-changing experimental SDK actions in `OpenCodeSdkExperimentalActionCoordinator`; do not distribute raw calls across Settings and Chat. Use typed confirmation payloads containing scope, target, and cleanup expectation.

- [x] **Step 3: Render experimental Settings gates and disabled state**

Place gates in the existing Server/Conversation sections according to ownership. The row must explain experimental status, server incompatibility, required version/capability, and whether enabling requires restart or a next-action confirmation.

- [x] **Step 4: Render Chat actions only after the two gates are true**

Chat action is visible only when the user gate is true and availability is `available`. PTY shows shell/scope before create and a stop/remove control after create. Control-plane/project-copy actions show preview plus confirmation. Background actions remain inline per-turn and never overwrite foreground runner state.

- [x] **Step 5: Run experimental tests and commit**

Run:

```bash
npm test -- tests/unit/core/opencode/OpenCodeSdkExperimentalActionCoordinator.test.ts tests/unit/features/settings/SettingsConversationSection.test.ts tests/unit/features/settings/SettingsServerSection.test.ts tests/unit/features/chat/OpenCodianView.test.ts
```

Expected: all guarded-action, confirmation, cancellation, and cleanup cases pass.

```bash
git add src/core/opencode/OpenCodeSdkExperimentalActionCoordinator.ts src/core/opencode/OpenCodeService.ts src/features/settings/SettingsConversationSection.ts src/features/settings/SettingsServerSection.ts src/features/chat/OpenCodianView.ts src/i18n/locales/en.ts src/i18n/locales/zh.ts tests/unit/core/opencode/OpenCodeSdkExperimentalActionCoordinator.test.ts tests/unit/features/settings tests/unit/features/chat
git commit -m "Gate OpenCode experimental capabilities"
```

---

### Task 7: Keep Capability Lab Diagnostic and Evidence-Bound

**Files:**
- Modify: `src/features/settings/SettingsCapabilityLabSection.ts`
- Modify: `tests/unit/features/settings/SettingsCapabilityLabSection.test.ts`
- Modify: `src/i18n/locales/en.ts`, `src/i18n/locales/zh.ts`
- Reuse only compatible pieces of `.worktrees/opencode-sdk-117-capability-registry/src/core/opencode/OpenCodeSdkCapabilityRegistry.ts` and `OpenCodeSdkCapabilityProbeRunner.ts`

**Interfaces:**
- Capability Lab reads the production `OpenCodeSdkCapabilitySnapshot`; it does not manufacture independent capability truth.
- Probe output has `present`, `advertised`, `runtime-proven`, `skipped`, `unsupported`, and `failed` evidence states.

- [ ] **Step 1: Write failing diagnostic separation tests**

Assert the Lab can render registry results and trigger safe probes, but cannot enable an experimental gate, invoke a state-changing endpoint, or make an ordinary Chat action visible.

- [ ] **Step 2: Implement safe probe display and evidence export**

Adapt the existing worktree runner only after comparing every SDK path to Task 1 inventory. State-changing probes use dry-run, fixture, or `skipped` with a reason. Runtime proof status can only be set by retained evidence metadata from the Test Vault scenario.

- [ ] **Step 3: Run Capability Lab tests and commit**

Run:

```bash
npm test -- tests/unit/features/settings/SettingsCapabilityLabSection.test.ts tests/unit/core/opencode/OpenCodeSdkCapabilityRegistry.test.ts tests/unit/core/opencode/OpenCodeSdkCapabilityDiscoveryCoordinator.test.ts
```

Expected: diagnostic UI uses the same registry as production and never bypasses safety gates.

```bash
git add src/features/settings/SettingsCapabilityLabSection.ts src/i18n/locales/en.ts src/i18n/locales/zh.ts tests/unit/features/settings/SettingsCapabilityLabSection.test.ts src/core/opencode/OpenCodeSdkCapabilityRegistry.ts tests/unit/core/opencode/OpenCodeSdkCapabilityRegistry.test.ts
git commit -m "Align OpenCode capability diagnostics"
```

---

### Task 8: Update Docs, Graph, and Full Local Verification

**Files:**
- Modify/create exact matching `docs/modules/**` pages for every changed/created `src` module
- Modify: `docs/status/sdk-v2-rollout.md`, `docs/status/sdk-v2-manual-checklist.md`
- Modify: `graphify-out/GRAPH_REPORT.md`, `graphify-out/graph.json` via script

- [ ] **Step 1: Update module docs and operational checklist**

Document the capability-state contract, Settings gate rules, migration outcomes, legacy fallback boundaries, and manual server-version behavior. The checklist must include one supported and one unsupported scenario for each productized capability family.

- [ ] **Step 2: Refresh source graph and doc guards**

Run:

```bash
npm run graphify:update:src
npm run check:module-docs
npm run check:graphify
npm run check:devlog-order
```

Expected: all pass before final verification.

- [ ] **Step 3: Run the full local gate**

Run:

```bash
npm run verify
```

Expected: zero lint warnings, all tests, typecheck, and production build pass.

- [ ] **Step 4: Commit documentation and generated graph artifacts**

```bash
git add docs/modules docs/status/sdk-v2-rollout.md docs/status/sdk-v2-manual-checklist.md graphify-out
git commit -m "Document OpenCode capability productization"
```

---

### Task 9: Execute Obsidian Plugin Autodebug Product-Surface Gates [completed]

**Files:**
- Create: `.obsidian-debug/opencode-sdk-productization-job.json` and scenario/assertion files only if the repository does not already provide equivalent reusable job artifacts
- Output: `.obsidian-debug/<timestamp>/` run evidence, not committed unless explicitly requested

- [x] **Step 1: Preflight Test Vault and control surface**

Run the project-aware doctor and confirm developer commands before reload:

```bash
node /Volumes/SDD2T/obsidian-vault-write/custom-project/my-skills/custom/obsidian-plugin-autodebug/scripts/obsidian_debug_doctor.mjs --repo-dir /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian --plugin-id opencodian --test-vault-plugin-dir /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian --output .obsidian-debug/doctor.json --quiet --fix
obsidian help
```

Expected: the doctor report exists and `obsidian help` includes `Developer:` commands.

- [x] **Step 2: Build and deploy sequentially**

Run `npm run build`, then separately copy `dist/main.js`, `dist/manifest.json`, and `dist/styles.css` to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`. Copy `dist/assets/` only if this work changes bundled assets. Verify the deployed `main.js` contains the build's `BUILD_ID` before reload.

- [x] **Step 3: Prove Settings surface and Chat surface activation before capture**

```bash
obsidian dev:debug on
obsidian dev:console clear
obsidian dev:errors clear
obsidian plugin:reload id=opencodian
obsidian eval vault=testvault code="JSON.stringify({modal:!!document.querySelector('.modal-container'), errors:'capture-ready'})"
```

Open the actual Settings owner tab or Chat view using its registered command/selector. Verify its active-tab marker and durable content selector before screenshots or DOM assertions.

- [x] **Step 4: Run stable and unsupported scenarios**

For every productized family, run one safe supported interaction and one unsupported/disabled interaction against the actual connected server. Capture DOM text/state, redacted service result, console, and errors. Verify unsupported Settings rows remain visible and that Chat does not expose unsafe actions.

- [x] **Step 5: Run experimental opt-in scenarios**

For each experimental family supported by the live server: prove default-off visibility; enable through Settings; verify explicit confirmation; execute a non-destructive or reversible action; verify stop/remove/cancel cleanup; disable again. If server support is absent, record a disabled row with exact reason rather than treating it as a failure.

- [x] **Step 6: Analyze and preserve evidence**

Run the Autodebug analysis chain using the actual created artifact paths:

```bash
node /Volumes/SDD2T/obsidian-vault-write/custom-project/my-skills/custom/obsidian-plugin-autodebug/scripts/obsidian_debug_analyze.mjs --summary .obsidian-debug/summary.json --doctor .obsidian-debug/doctor.json --agent-tools-output .obsidian-debug/agent-tools.json --output .obsidian-debug/diagnosis.json
node /Volumes/SDD2T/obsidian-vault-write/custom-project/my-skills/custom/obsidian-plugin-autodebug/scripts/obsidian_debug_visual_review.mjs --diagnosis .obsidian-debug/diagnosis.json --output .obsidian-debug/visual-review.json --html-output .obsidian-debug/visual-review.html
```

Expected: no unexplained console/error residue; all claimed product paths have a DOM/action evidence reference; visual review is nonblank and correctly routed.

---

### Task 10: Final Capability Matrix and Handoff [completed]

**Files:**
- Modify: `docs/status/opencode-sdk-<resolved-version>-capability-inventory.md`
- Modify if needed: `devlog.md` using repository ordering rules

- [x] **Step 1: Reconcile every actual SDK diff entry**

For every post-1.15.3 endpoint, record exactly one final status: `productized`, `diagnostic-only`, `unsupported-with-reason`, `deferred-by-safety`, or `obsolete`. Include owner, server support evidence, Settings gate state, ordinary UI proof path, migration impact, fallback policy, and residual risk.

- [x] **Step 2: Re-run final evidence commands**

Run:

```bash
git diff --check
npm run verify
obsidian dev:errors
obsidian dev:console limit=200
git status --short
```

Expected: verify passes, Test Vault evidence is clean or every pre-existing issue is named, and the final working tree contains only intended artifacts.

- [x] **Step 3: Report truthfully**

The final report must state the resolved SDK version/upstream commit, all commits, migration summary, capability matrix, test commands, Test Vault `BUILD_ID`, Autodebug artifact paths, unsupported server capabilities, intentionally deferred risky actions, and remaining non-blocking risks. Do not claim an endpoint is productized from SDK presence or Capability Lab readback alone.
