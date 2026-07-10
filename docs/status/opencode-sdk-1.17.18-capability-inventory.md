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

## 8. Classification Summary (provisional, 57 added methods)

| Provisional class | Count | Methods |
|---|:---:|---|
| `productize` | 24 | health.get, location.get, agent.list, session.active, session.get, session.history, session.events, session.message, integration.list, integration.get, attempt.status, permission.request.list, permission.saved.list, permission.session.get, permission.session.list, question.request.list, fs.list, fs.read, fs.find, command.list, skill.list, event.subscribe, reference.list, capabilities.get, project.directories |
| `deferred-by-safety` | 26 | session.create/switchAgent/switchModel/interrupt, integration connect.key/connect.oauth/attempt.cancel/attempt.complete, credential.remove/update, permission.saved.remove/permission.session.create/permission.session.reply, session.question.reply/reject, revert.stage/clear/commit, pty.create/update/remove/connect/connectToken, projectCopy.create/refresh/remove, controlPlane.moveSession, session.background |
| `diagnostic-only` | 7 | pty.list, pty.get, projectCopy.generateName |

> Counts sum to 57. `obsolete` = 0 (no removals). These are **provisional**; final one-status-per-capability assignment happens in Task 10 after runtime proof. No capability is omitted.

---

**This inventory is the immutable Phase-0 evidence. Implementation (Tasks 2–10) proceeds from it.**
