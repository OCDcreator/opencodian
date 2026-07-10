# OpenCode SDK 1.17.18 Capability Inventory

**Created:** 2026-07-10
**Purpose:** Immutable execution-time evidence for the SDK full-productization goal. This document records the exact pinned SDK, upstream reference, the post-`1.15.3` API diff, and a classification for every added capability.

---

## 1. Pin Facts (resolved at execution start)

| Fact | Value | Command |
|---|---|---|
| `npm view @opencode-ai/sdk dist-tags --json` `latest` | `1.17.18` | excludes `beta`/`next`/`dev`/`snapshot` (all are `0.0.0-*` prereleases) |
| Exact version | `1.17.18` | semver, non-prerelease |
| npm tarball | `https://registry.npmjs.org/@opencode-ai/sdk/-/sdk-1.17.18.tgz` | `npm view @opencode-ai/sdk@1.17.18 dist.tarball` |
| npm integrity | `sha512-c/C9PhY8PrbcxDY+JIYtOZsrmMD0KzoVvxq+RGUrZ6LQp57SuVBbT4lfwA2G8Se5RNC1N5JtYjiuaXeECnF2SQ==` | `npm view @opencode-ai/sdk@1.17.18 dist.integrity` |
| Package file count | 79 (unchanged from 1.15.3) | `npm pack` — no file additions/deletions |
| Upstream reference commit | `08096b5e61c9227a6b52aacc745a1a51c6385284` | `git -C reference-projects/opencode rev-parse HEAD` |
| Upstream reference date | `2026-07-09 15:03:10 +0000` | `git log -1 --format='%ci'` |
| Upstream nearest describe | `08096b5e6` (no version tag reachable) | `git describe --tags --always` |
| Upstream `packages/sdk/js/package.json` | `1.17.17` | reference tree is one patch behind the published npm tarball `1.17.18`; API comparison uses the npm tarball as the source of truth |

### Pin acceptance

- `latest` is a clean semver `1.17.18`; no prerelease tag. **Accepted.**
- The npm tarball integrity is recorded for `--save-exact` pinning. **Accepted.**
- The upstream reference is newer than `1.17.17` and the published SDK is `1.17.18`; the generated client surface in the npm tarball is the comparison source of truth. **Accepted.**

---

## 2. SDK Surface Comparison Method

The diff compares the generated client declarations shipped in the npm tarballs of `1.15.3` and `1.17.18` (package path `dist/v2/gen/sdk.gen.d.ts` and `dist/v2/gen/types.gen.d.ts`). The plugin consumes `@opencode-ai/sdk/v2/client`, so the `dist/v2/gen/**` surface is the contract that matters.

- **File structure:** identical 79 files across both versions. No files added or removed. All changes are within existing generated declaration files (new methods on existing classes + new types).
- **Top-level `OpencodeClient` namespaces:** identical set (`auth`, `app`, `config`, `event`, `experimental`, `file`, `find`, `formatter`, `global`, `instance`, `lsp`, `mcp`, `part`, `path`, `permission`, `project`, `provider`, `pty`, `question`, `session`, `sync`, `tool`, `tui`, `v2`, `vcs`, `worktree`). Order differs but membership is unchanged.
- **`client.v2` aggregator:** this is where almost all growth happened.

### `client.v2` aggregator subnamespace growth

| `client.v2.*` subnamespace | 1.15.3 | 1.17.18 |
|---|:---:|:---:|
| `v2.session` | ✅ | ✅ |
| `v2.model` | ✅ | ✅ |
| `v2.provider` | ✅ | ✅ |
| `v2.health` | — | ✅ NEW |
| `v2.location` | — | ✅ NEW |
| `v2.agent` | — | ✅ NEW |
| `v2.integration` | — | ✅ NEW |
| `v2.credential` | — | ✅ NEW |
| `v2.permission` | — | ✅ NEW |
| `v2.fs` | — | ✅ NEW |
| `v2.command` | — | ✅ NEW |
| `v2.skill` | — | ✅ NEW |
| `v2.event` | — | ✅ NEW |
| `v2.pty` | — | ✅ NEW |
| `v2.question` | — | ✅ NEW |
| `v2.reference` | — | ✅ NEW |
| `v2.projectCopy` | — | ✅ NEW |

**14 new `client.v2.*` subnamespaces.** The legacy top-level namespaces (`client.session`, `client.provider`, etc.) are unchanged.

---

## 3. Added Method Inventory (1.15.3 → 1.17.18)

**57 methods added, 0 removed, 0 signature breaks at the file/class level.** All additions are listed below, grouped by namespace, with the SDK path the facade must resolve and a provisional classification.

> Classification legend (one per capability, refined during productization):
> - `productize` — safe to wire into an existing Chat/Settings owner.
> - `diagnostic-only` — exposed only via Capability Lab readback.
> - `unsupported-with-reason` — kept visible/disabled when server lacks the endpoint.
> - `deferred-by-safety` — needs explicit gate + confirmation; not auto-enabled.
> - `obsolete` — no longer relevant; documented as dropped.

### 3.1 `client.v2.health` (NEW subnamespace)

| Method | SDK path | Risk | Provisional class |
|---|---|---|---|
| `Health.get` | `v2.health.get` | read-only | `productize` (Settings server diagnostics) |

### 3.2 `client.v2.location` (NEW subnamespace)

| Method | SDK path | Risk | Provisional class |
|---|---|---|---|
| `Location.get` | `v2.location.get` | read-only | `productize` (Settings server diagnostics) |

### 3.3 `client.v2.agent` (NEW subnamespace)

| Method | SDK path | Risk | Provisional class |
|---|---|---|---|
| `Agent.list` | `v2.agent.list` | read-only | `productize` (Settings agents disclosure) |

### 3.4 `client.v2.session` (existing subnamespace, new methods)

| Method | SDK path | Risk | Provisional class |
|---|---|---|---|
| `Session3.active` | `v2.session.active` | read-only | `productize` (Chat session status) |
| `Session3.create` | `v2.session.create` | state-changing | `deferred-by-safety` (confirm before new session via v2) |
| `Session3.get` | `v2.session.get` | read-only | `productize` (Chat session hydration) |
| `Session3.history` | `v2.session.history` | read-only | `productize` (Chat history/events) |
| `Session3.events` | `v2.session.events` | stream | `productize` (sync freshness; preserve authoritative hydration) |
| `Session3.interrupt` | `v2.session.interrupt` | state-changing | `deferred-by-safety` (confirm; preserve abort semantics) |
| `Session3.message` | `v2.session.message` | read-only | `productize` (single message read) |
| `Session3.switchAgent` | `v2.session.switchAgent` | state-changing | `deferred-by-safety` (confirm agent switch) |
| `Session3.switchModel` | `v2.session.switchModel` | state-changing | `deferred-by-safety` (confirm model switch) |

### 3.5 `client.v2.model` / `client.v2.provider` (existing, unchanged method set)

No new methods on `Model`/`Provider2` classes (the diff shows no `Model.*`/`Provider2.*` additions). The new `V2ProviderGetError`/`V2ModelListError` types are error-shape additions only.

### 3.6 `client.v2.integration` (NEW subnamespace)

| Method | SDK path | Risk | Provisional class |
|---|---|---|---|
| `Integration.list` | `v2.integration.list` | read-only | `productize` (Settings integrations disclosure) |
| `Integration.get` | `v2.integration.get` | read-only | `productize` (Settings integrations disclosure) |
| `Attempt.status` | `v2.integration.attempt.status` | read-only | `productize` (OAuth attempt readback) |
| `Attempt.cancel` | `v2.integration.attempt.cancel` | state-changing | `deferred-by-safety` (confirm credential/OAuth cancel) |
| `Attempt.complete` | `v2.integration.attempt.complete` | state-changing | `deferred-by-safety` (confirm OAuth completion) |
| `Connect.key` | `v2.integration.connect.key` | state-changing + secret | `deferred-by-safety` (no secret in logs/UI; confirm) |
| `Connect.oauth` | `v2.integration.connect.oauth` | state-changing | `deferred-by-safety` (confirm OAuth start) |

### 3.7 `client.v2.credential` (NEW subnamespace)

| Method | SDK path | Risk | Provisional class |
|---|---|---|---|
| `Credential.remove` | `v2.credential.remove` | state-changing | `deferred-by-safety` (confirm removal; no secret in logs) |
| `Credential.update` | `v2.credential.update` | state-changing + secret | `deferred-by-safety` (confirm; no secret in logs/UI) |

### 3.8 `client.v2.permission` (NEW subnamespace)

| Method | SDK path | Risk | Provisional class |
|---|---|---|---|
| `Request.list` | `v2.permission.request.list` | read-only | `productize` (Settings/Chat permission disclosure) |
| `Saved.list` | `v2.permission.saved.list` | read-only | `productize` (Settings permission disclosure) |
| `Saved.remove` | `v2.permission.saved.remove` | state-changing | `deferred-by-safety` (confirm saved-permission removal) |
| `Permission2.create` | `v2.session.permission.create` | state-changing | `deferred-by-safety` (confirm) |
| `Permission2.get` | `v2.session.permission.get` | read-only | `productize` (Chat permission card hydration) |
| `Permission2.list` | `v2.session.permission.list` | read-only | `productize` (Chat permission card hydration) |
| `Permission2.reply` | `v2.session.permission.reply` | state-changing | `deferred-by-safety` (confirm permission reply) |

### 3.9 `client.v2.fs` (NEW subnamespace)

| Method | SDK path | Risk | Provisional class |
|---|---|---|---|
| `Fs.list` | `v2.fs.list` | read-only | `productize` (context picker; directory scope) |
| `Fs.read` | `v2.fs.read` | read-only | `productize` (context picker; directory scope) |
| `Fs.find` | `v2.fs.find` | read-only | `productize` (context picker / search; directory scope) |

### 3.10 `client.v2.command` / `client.v2.skill` (NEW subnamespaces)

| Method | SDK path | Risk | Provisional class |
|---|---|---|---|
| `Command2.list` | `v2.command.list` | read-only | `productize` (slash-command catalog) |
| `Skill.list` | `v2.skill.list` | read-only | `productize` (skill catalog) |

### 3.11 `client.v2.event` (NEW subnamespace)

| Method | SDK path | Risk | Provisional class |
|---|---|---|---|
| `Event2.subscribe` | `v2.event.subscribe` | stream | `productize` (sync freshness; preserve legacy polling fallback) |

### 3.12 `client.v2.pty` (NEW subnamespace)

| Method | SDK path | Risk | Provisional class |
|---|---|---|---|
| `Pty2.list` | `v2.pty.list` | read-only | `diagnostic-only` |
| `Pty2.get` | `v2.pty.get` | read-only | `diagnostic-only` |
| `Pty2.create` | `v2.pty.create` | external process | `deferred-by-safety` (gate + confirm + cleanup; never auto-spawn) |
| `Pty2.update` | `v2.pty.update` | external process | `deferred-by-safety` |
| `Pty2.remove` | `v2.pty.remove` | external process | `deferred-by-safety` (cleanup) |
| `Pty2.connect` | `v2.pty.connect` | external process / stream | `deferred-by-safety` |
| `Pty2.connectToken` | `v2.pty.connectToken` | external process | `deferred-by-safety` |

### 3.13 `client.v2.question` (NEW subnamespace)

| Method | SDK path | Risk | Provisional class |
|---|---|---|---|
| `Question2.list` (request) | `v2.question.request.list` | read-only | `productize` (Chat question card hydration) |
| `Question2.list` (session) | `v2.session.question.list` | read-only | `productize` (session-scoped Chat question-card hydration) |
| `Question2.reply` (session) | `v2.session.question.reply` | state-changing | `deferred-by-safety` (confirm question reply) |
| `Question2.reject` (session) | `v2.session.question.reject` | state-changing | `deferred-by-safety` (confirm question reject) |

### 3.14 `client.v2.reference` (NEW subnamespace)

| Method | SDK path | Risk | Provisional class |
|---|---|---|---|
| `Reference.list` | `v2.reference.list` | read-only | `productize` (reference result cards) |

### 3.15 `client.v2.projectCopy` (NEW subnamespace)

| Method | SDK path | Risk | Provisional class |
|---|---|---|---|
| `ProjectCopy2.create` | `v2.projectCopy.create` | state-changing (copy) | `deferred-by-safety` (preview + confirm; preserve source) |
| `ProjectCopy2.refresh` | `v2.projectCopy.refresh` | state-changing | `deferred-by-safety` |
| `ProjectCopy2.remove` | `v2.projectCopy.remove` | state-changing | `deferred-by-safety` (cleanup) |

### 3.16 `client.experimental.*` (existing namespace, new methods/types)

| Method | SDK path | Risk | Provisional class |
|---|---|---|---|
| `Capabilities.get` | `experimental.capabilities.get` | read-only | `productize` (server capability negotiation probe) |
| `ControlPlane.moveSession` | `experimental.controlPlane.moveSession` | state-changing (session relocate) | `deferred-by-safety` (danger copy + confirm) |
| `ProjectCopy.generateName` | `experimental.projectCopy.generateName` | read-only | `diagnostic-only` |
| `Session.background` | `experimental.session.background` | state-changing (background) | `deferred-by-safety` (default-off; never overwrite foreground runner) |

### 3.17 `client.project` (existing namespace, new method)

| Method | SDK path | Risk | Provisional class |
|---|---|---|---|
| `Project.directories` | `project.directories` | read-only | `productize` (project directories disclosure) |

### 3.18 `client.session.revert` (NEW nested class on existing Session2)

| Method | SDK path | Risk | Provisional class |
|---|---|---|---|
| `Revert.stage` | `session.revert.stage` | state-changing | `deferred-by-safety` (scoped preview + confirm) |
| `Revert.clear` | `session.revert.clear` | state-changing | `deferred-by-safety` (cleanup) |
| `Revert.commit` | `session.revert.commit` | state-changing | `deferred-by-safety` (scoped preview + confirm) |

---

## 4. Removed Methods

**None.** Zero methods were removed between 1.15.3 and 1.17.18 at the class/method level. No `obsolete` classification is required from a removed-method standpoint.

A small number of internal type aliases were renamed/removed (e.g. `SessionInfo` → `SessionV2Info`, `EventCatalogModelUpdated` → `EventCatalogUpdated`, `ModelV2Info1`, `V2SessionsResponse`), but these are internal generated type names. The plugin's `sdkTypes.ts` only re-exports a narrow, stable subset (`Message`, `Session`, `Part`, `Event`, etc.), so these renames are checked during Task 1's typecheck after the pin.

---

## 5. Ownership Map (provisional — refined in Tasks 4–7)

| Capability family | Chat owner | Settings owner | Phase |
|---|---|---|---|
| `v2.health`, `v2.location` | server/status indicators | Server diagnostics | Task 4 |
| `v2.agent`, `v2.model`, `v2.provider` | agent/model picker | Agents/Models disclosure | Task 4 |
| `v2.session` (active/get/message/history/events) | session menu, inline status | Conversation defaults | Task 5 |
| `v2.session` (create/switch/interrupt/revert) | confirm actions | Conversation gate | Task 6 |
| `v2.integration`, `v2.credential`, connect/OAuth | action result only | Integrations (secrets redacted) | Tasks 4/6 |
| `v2.permission`, `v2.question` | inline approval/question cards | Permission defaults/disclosure | Tasks 4/5 |
| `v2.fs`, `v2.reference` | context picker / result cards | read-access disclosure | Task 5 |
| `v2.command`, `v2.skill` | slash-command / skill catalog | Commands/Skills authoring | Tasks 4/5 |
| `v2.event` | sync freshness | diagnostic last-sync | Task 5 |
| `v2.pty` | experimental terminal (opt-in) | default-off gate + cleanup | Task 6 |
| `v2.projectCopy`, `experimental.controlPlane`, `experimental.session.background` | experimental affordance (opt-in) | default-off gate | Task 6 |
| `experimental.capabilities.get` | n/a | capability negotiation probe | Task 2/4 |
| `project.directories` | project disclosure | project section | Task 4/5 |
| Capability Lab | diagnostic-only | diagnostic matrix | Task 7 |

---

## 6. Existing Worktree Reuse Assessment

The worktree `codex/opencode-sdk-117-capability-registry` (at commit `b3ed2edd`) already:
- pins `@opencode-ai/sdk@1.17.18`;
- defines `OpenCodeSdkCapabilityRegistry.ts` (188 entries) and `OpenCodeSdkCapabilityProbeRunner.ts`.

**Reuse verdict:** The worktree's API assumptions match this inventory — its `sdkNamespace`/`method` entries align with the verified 1.17.18 generated client (same 14 new v2 subnamespaces, same method names). It is therefore a valid **selective transplant source**, not a blind merge. Concretely:

- The registry's v2 entries (`v2.health.get`, `v2.location.get`, `v2.agent.list`, `v2.session.*`, `v2.integration.*`, `v2.credential.*`, `v2.permission.*`, `v2.fs.*`, `v2.command.list`, `v2.skill.list`, `v2.event.subscribe`, `v2.pty.*`, `v2.question.*`, `v2.reference.list`, `v2.projectCopy.*`) map 1:1 onto Section 3.
- The probe runner must be re-validated against the **production** capability-state resolver added in Task 2 and may only power Capability Lab (Task 7), never production gating.

The worktree will be transplanted incrementally per task, each slice re-validated by a failing test first.

---

## 7. Type-Shape Notes for the SDK Boundary

The plugin's `src/core/opencode/sdkTypes.ts` re-exports a narrow subset of types. The pin (Task 1, Step 4) must confirm these still resolve in 1.17.18:

- `OpencodeClient`, `OpencodeClientConfig` — present (the client class is unchanged in membership).
- `Message`, `Session`, `Part`, `Event`, `PermissionRequest` — present (some gained fields, none removed from the public shape the plugin reads).
- `AgentPartInput`, `FilePartInput`, `TextPartInput`, `SubtaskPartInput`, `OutputFormat` — present.

The `SessionInfo` → `SessionV2Info` rename is internal to the generated types; the plugin does not reference `SessionInfo` directly and uses `Session` from the v2 export. Confirmed during Step 5 typecheck.

---

## 8. Provisional Classification Note

The first-pass provisional count table was not a release decision and contained
both a transcription omission (`v2.session.question.list`) and arithmetic
drift. The method-level entries above are the Phase-0 evidence; the corrected
57-item reconciliation and the only authoritative final classifications are in
Section 9. No endpoint is promoted merely because it is present in the SDK or
appears in Capability Lab.

---

## 9. Final Reconciliation And Capability Matrix (Task 10)

### 9.1 Reconciliation method and status rule

The final comparison re-extracted methods from the published `1.15.3` and
`1.17.18` npm declaration tarballs. It found **57 added methods**. The missing
Phase-0 row was `Question2.list` under `v2.session.question`; it is now listed
in Section 3.13. No prior row was removed or renamed. The generated
`Question2` declaration accepts `{ sessionID }` and the v2 aggregator exposes
it at `client.v2.session.question.list`.

Each row below has exactly one final status:

| Final status | Count | Meaning |
|---|:---:|---|
| `productized` | 1 | Used by the production capability-discovery path, with no state-changing UI action. |
| `diagnostic-only` | 28 | Visible through the existing Settings/Chat owner or Capability Lab as a guarded diagnostic/readback; not promoted to a new raw-endpoint product path. |
| `deferred-by-safety` | 28 | State-changing, streaming, secret-bearing, process, session, or copy operation kept default-off or unexposed until a dedicated product path has stronger runtime proof. |
| `unsupported-with-reason` | 0 | No SDK method is intrinsically unsupported; a connected older server is represented at runtime by the existing typed visible unsupported row. |
| `obsolete` | 0 | The SDK diff removed no methods. |

**Evidence codes used in the matrix**

- `S` — the published npm declaration diff and `OpenCodeSdkFacade` path-resolution tests prove that the SDK method exists. This is not a server claim.
- `R` — `OpenCodeSdkCapabilityDiscoveryCoordinator` is allowed to run a safe read probe. It records only `advertised`, redacted `unsupported`, or redacted transient failure; it never turns a failure into support.
- `P` — no action probe is permitted. The production snapshot records presence/gate state only, so this code deliberately makes no claim that an arbitrary server supports or executed the method.
- `T` — Test Vault proof: OpenCode `1.17.15` at `127.0.0.1:4196`, Test Vault build `codex-opencode-sdk-full-productization.202607110305`, with the Task 9 artifacts named below. This proof applies only to the PTY create/cancel/remove scenario, not to sibling endpoints.

**Policy codes used in the matrix**

- `Read` — no user gate or capability-settings migration is needed; existing Settings disclosure remains visible on an older server and the existing HTTP/SSE or owner fallback is retained.
- `Hold` — no new raw endpoint is exposed and no migration mapping is created; any pre-existing owner behavior remains unchanged.
- `Gate` — the named capability setting is default-off, persisted through the versioned envelope/migration, requires server support and a final confirmation. Settings can show the disabled reason; Chat cannot show the action until all gates pass.

### 9.2 Final 57-method matrix

| SDK path | Final status | Owner and ordinary UI proof path | Server evidence | Gate, migration, fallback | Residual risk |
|---|---|---|---|---|---|
| `v2.health.get` | diagnostic-only | `SettingsServerSection` capability disclosure and Re-check; Capability Lab snapshot | S+R | Read; legacy health path retained | Snapshot can be stale between refreshes. |
| `v2.location.get` | diagnostic-only | `SettingsServerSection` disclosure and Re-check | S+R | Read; directory-scoped legacy behavior retained | Wrong directory scope can mislead a readback. |
| `v2.agent.list` | diagnostic-only | `SettingsAgentsSection` disclosure | S+R | Read; existing catalog owner remains canonical | Catalog content is not a full agent-action proof. |
| `v2.session.active` | diagnostic-only | Chat session/status guard; Capability Lab evidence | S+R | Read; existing session lifecycle fallback remains | No dedicated v2 active-session UI proof. |
| `v2.session.create` | deferred-by-safety | Existing session lifecycle remains owner; no raw v2 launcher | S+P | Hold; current create flow/fallback unchanged | New v2 create parameters have no product-path proof. |
| `v2.session.get` | diagnostic-only | Chat hydration guard and Capability Lab evidence | S+P | Read; authoritative existing hydration remains | Fixture-dependent request is not a general read proof. |
| `v2.session.history` | diagnostic-only | Chat history/sync guard | S+P | Read; authoritative hydration and legacy fallback remain | Event/history ordering has no dedicated v2 runtime proof. |
| `v2.session.events` | diagnostic-only | Chat sync-freshness guard | S+P | Read; existing global event/polling fallback remains | A v2 event stream is not promoted from presence alone. |
| `v2.session.interrupt` | deferred-by-safety | Existing abort owner remains authoritative | S+P | Hold; existing abort semantics/fallback retained | New interrupt path could alter foreground-runner semantics. |
| `v2.session.message` | diagnostic-only | Chat message hydration guard | S+P | Read; canonical message sync remains | Session/message fixture scope is not runtime-proven. |
| `v2.session.switchAgent` | deferred-by-safety | No raw v2 Chat action | S+P | Hold; current model/agent flows unchanged | Could change active session behavior unexpectedly. |
| `v2.session.switchModel` | deferred-by-safety | No raw v2 Chat action | S+P | Hold; existing selector path unchanged | Could change active session/model consistency. |
| `v2.integration.list` | diagnostic-only | Capability Lab production snapshot; Settings has no credential action | S+R | Read; no new integration UI | Integration catalog is not credential-flow proof. |
| `v2.integration.get` | diagnostic-only | Capability Lab production snapshot | S+P | Read; no new integration UI | Requires a fixture; no secret-bearing response is rendered. |
| `v2.integration.attempt.status` | diagnostic-only | Capability Lab production snapshot | S+P | Read; no OAuth action surfaced | Requires an OAuth attempt fixture. |
| `v2.integration.attempt.cancel` | deferred-by-safety | No raw Settings action | S+P | Hold; no migration or invocation | Cancelling an OAuth attempt is state-changing. |
| `v2.integration.attempt.complete` | deferred-by-safety | No raw Settings action | S+P | Hold; no migration or invocation | Completion can bind an account/credential. |
| `v2.integration.connect.key` | deferred-by-safety | No raw Settings action | S+P | Hold; no credential is persisted/logged by this path | Secret-bearing input requires dedicated secure UX. |
| `v2.integration.connect.oauth` | deferred-by-safety | No raw Settings action | S+P | Hold; no migration or invocation | OAuth start needs callback and consent lifecycle proof. |
| `v2.credential.remove` | deferred-by-safety | No raw Settings action | S+P | Hold; no migration or invocation | Credential removal is irreversible. |
| `v2.credential.update` | deferred-by-safety | No raw Settings action | S+P | Hold; no credential/raw error exposure | Credential metadata semantics are not product-proven. |
| `v2.permission.request.list` | diagnostic-only | `SettingsSecuritySection` disclosure; Chat permission guard | S+R | Read; existing permission hub/fallback remains | Listing does not prove reply semantics. |
| `v2.permission.saved.list` | diagnostic-only | `SettingsSecuritySection` disclosure and Re-check | S+R | Read; unsupported row stays visible | Saved-rule scope may differ by server directory. |
| `v2.permission.saved.remove` | deferred-by-safety | No raw Settings delete action | S+P | Hold; existing permission behavior unchanged | Removing a saved rule changes future execution. |
| `v2.session.permission.create` | deferred-by-safety | Existing permission hub remains owner | S+P | Hold; no raw v2 action | Creates execution-affecting permission state. |
| `v2.session.permission.get` | diagnostic-only | Chat permission-card hydration guard | S+P | Read; existing permission hub/fallback remains | Fixture-specific data is not product proof. |
| `v2.session.permission.list` | diagnostic-only | Chat permission-card hydration guard | S+P | Read; existing permission hub/fallback remains | Listing is not a response-flow proof. |
| `v2.session.permission.reply` | deferred-by-safety | Existing permission response flow remains owner | S+P | Hold; no raw v2 action | A reply can authorize a tool action. |
| `v2.fs.list` | diagnostic-only | `ServerReferenceContextService` Chat guard | S+R | Read; vault picker and old context flow remain | Server filesystem scope can differ from vault scope. |
| `v2.fs.read` | diagnostic-only | Context/read guard; no raw file viewer | S+P | Read; no payload is exposed by Lab | File-content disclosure needs per-path policy proof. |
| `v2.fs.find` | diagnostic-only | Context/search guard; no raw finder UI | S+P | Read; existing picker/search remains | Search query scope and result privacy are unproven. |
| `v2.command.list` | diagnostic-only | `SettingsCommandsSection` disclosure; slash-cache capability key | S+R | Read; existing command catalog fallback remains | New v2 catalog data is not directly rendered. |
| `v2.skill.list` | diagnostic-only | `SettingsSkillSection` disclosure; slash-cache capability key | S+R | Read; existing skill catalog fallback remains | New v2 catalog data is not directly rendered. |
| `v2.event.subscribe` | diagnostic-only | Chat sync-freshness guard | S+P | Read; global event/polling fallback remains | Stream ordering and reconnect behavior lack v2 runtime proof. |
| `v2.pty.list` | diagnostic-only | Capability Lab production snapshot only | S+R | Read; no terminal list UI | A list may expose process metadata, so payload stays out of UI. |
| `v2.pty.get` | diagnostic-only | Capability Lab production snapshot only | S+P | Read; no terminal details UI | Requires a PTY fixture and may expose process metadata. |
| `v2.pty.create` | deferred-by-safety | `SettingsServerSection` gate; Chat experimental modal | S+P+T | Gate `v2.pty.create`; default-off, final confirmation, coordinator-owned cleanup | Runtime proof covers `pwd` only; arbitrary commands remain dangerous. |
| `v2.pty.update` | deferred-by-safety | No raw terminal-control UI | S+P | Hold; never auto-start/modify a PTY | Can mutate external-process state. |
| `v2.pty.remove` | deferred-by-safety | Chat modal exposes removal only for coordinator-owned PTYs | S+P+T | Gate cleanup exception for owned PTY; no external PTY removal; migration uses the PTY gate | Proof is limited to the PTY created in the scenario. |
| `v2.pty.connect` | deferred-by-safety | No raw terminal stream UI | S+P | Hold; no websocket stream exposure | Terminal I/O is an execution surface. |
| `v2.pty.connectToken` | deferred-by-safety | No raw token UI | S+P | Hold; token never rendered/logged | Token lifecycle has no secure product UX. |
| `v2.question.request.list` | diagnostic-only | Chat question-card guard and Capability Lab evidence | S+R | Read; existing question hub/fallback remains | Global request list is not response-flow proof. |
| `v2.session.question.list` | diagnostic-only | Session-scoped question-card hydration guard | S+P | Read; existing question hub/fallback remains | Session fixture required; no raw payload shown. |
| `v2.session.question.reply` | deferred-by-safety | Existing question reply flow remains owner | S+P | Hold; no raw v2 reply action | Reply changes an agent's execution path. |
| `v2.session.question.reject` | deferred-by-safety | Existing question rejection flow remains owner | S+P | Hold; no raw v2 reject action | Rejection changes an agent's execution path. |
| `v2.reference.list` | diagnostic-only | `ServerReferenceContextService` Chat guard | S+R | Read; existing context picker remains | Reference scope/content has no direct product-path proof. |
| `v2.projectCopy.create` | deferred-by-safety | `SettingsServerSection` gate; Chat experimental modal preview | S+P | Gate `v2.projectCopy.create`; default-off and final confirmation | Copy target/source preservation is not live-proven. |
| `v2.projectCopy.refresh` | deferred-by-safety | No raw Settings/Chat action | S+P | Hold; no invocation | Refresh can mutate an existing copy. |
| `v2.projectCopy.remove` | deferred-by-safety | No raw Settings/Chat action | S+P | Hold; no invocation | Removal is destructive. |
| `experimental.capabilities.get` | productized | `OpenCodeSdkCapabilityDiscoveryCoordinator` -> `OpenCodeService` -> Settings/Capability Lab snapshot | S+R | Read; no migration; every later action still checks its own availability and gate | Advertisement alone cannot authorize an action. |
| `experimental.controlPlane.moveSession` | deferred-by-safety | `SettingsServerSection` gate; Chat experimental modal | S+P | Gate `experimental.controlPlane.moveSession`; default-off and final confirmation | Moving a session can alter location/ownership. |
| `experimental.projectCopy.generateName` | diagnostic-only | Capability Lab production snapshot only | S+P | Read; no name-generation action surfaced | Generated output is not a copy-safety proof. |
| `experimental.session.background` | deferred-by-safety | `SettingsConversationSection` gate; Chat modal and per-turn inline status | S+P | Gate `experimental.session.background`; default-off and final confirmation | Must not overwrite foreground stream status. |
| `project.directories` | diagnostic-only | Capability Lab/Settings project disclosure | S+R | Read; existing project scope remains canonical | Directory list may be stale or differently scoped. |
| `session.revert.stage` | deferred-by-safety | Existing session lifecycle remains owner; no new raw v2 UI | S+P | Hold; legacy revert behavior remains unchanged | Staging can affect user-visible history. |
| `session.revert.clear` | deferred-by-safety | Existing session lifecycle remains owner; no new raw v2 UI | S+P | Hold; legacy revert behavior remains unchanged | Clearing staged work can lose intent. |
| `session.revert.commit` | deferred-by-safety | Existing session lifecycle remains owner; no new raw v2 UI | S+P | Hold; legacy revert behavior remains unchanged | Commit can destructively rewrite session state. |

### 9.3 Runtime and migration evidence retained with the handoff

- **Runtime deployment:** Test Vault received build
  `codex-opencode-sdk-full-productization.202607110323`; the latest full local
  `npm run verify` build was
  `codex-opencode-sdk-full-productization.202607110347`.
- **Test Vault scenario:** the live service was OpenCode `1.17.15` at
  `127.0.0.1:4196`. PTY was hidden while its gate was off; after the Settings
  gate was enabled and server support was available, cancellation made zero
  action calls, `pwd` created a coordinator-owned PTY, and removal completed.
  The gate was reset off afterwards.
- **Autodebug artifacts:** `.obsidian-debug/task9-summary-0305.json`,
  `.obsidian-debug/task9-diagnosis-0305.json`,
  `.obsidian-debug/task9-visual-review-0305.json`,
  `.obsidian-debug/task9-settings-pty-default-off-final-0305.png`, and
  `.obsidian-debug/task9-chat-pty-created-0305.png`. The diagnosis is `pass`;
  visual review remains `needs-human-review` by tool contract, with the
  screenshot and DOM manually checked during Task 9.
- **Migration:** `schemaVersion=1` capability settings normalize idempotently.
  Behaviorally equivalent legacy gates map to the four default-off experimental
  gate ids; impossible mappings retain a raw backup but disclose only a
  redacted field/outcome/reason report. No token, credential, raw backup, or
  raw server error is persisted or emitted.

**This inventory now contains the immutable package/upstream facts plus the
corrected final product decision for every post-1.15.3 method.**
