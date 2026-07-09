# OpenCode SDK 1.17 Capability Registry Goal Design

## Purpose

Create a paste-ready `/goal` prompt for a future multi-round Codex/OpenCode run. The run should upgrade OpenCodian from the currently installed `@opencode-ai/sdk@1.15.3` to `1.17.17`, then add a full new-capability probe layer backed by Obsidian Plugin Autodebug validation.

The goal is not to productize new SDK features in ordinary Chat or Settings UI yet. The goal is to prove the new SDK/server capability surface inside Capability Lab with enough structure that later work can safely turn selected probes into product features.

## Chosen Approach

Use a capability registry design.

Each new SDK capability is represented by a registry entry with stable fields:

- `id`
- `category`
- `sdkNamespace`
- `method`
- `probeKind`
- `status`
- `evidence`
- `error`
- `futureFeatureGate`
- `lastCheckedAt`

Capability Lab renders the registry and runs probes. Main Chat and regular Settings flows must not consume the new capabilities in this phase.

## Capability Scope

The target prompt requires full new-capability coverage for SDK 1.17.x, including:

- `capabilities`
- `v2.health`
- `v2.location`
- `v2.agent`
- `v2.session`
- `v2.model` and `v2.provider`
- `v2.integration` and `v2.credential`
- `v2.permission` and `v2.question`
- `v2.fs`
- `v2.command`, `v2.skill`, and `v2.reference`
- `v2.event`
- `v2.pty`
- `v2.projectCopy`
- `experimental.controlPlane`
- `experimental.projectCopy`
- `experimental.session.background`

Each capability starts as a presence/readback/shape probe. Destructive or state-changing APIs must default to dry-run, read-only, mocked input, or skipped-with-reason until a safe Test Vault scenario is explicitly defined.

## Validation Requirements

The future implementation must use `obsidian-plugin-autodebug` as a runtime gate:

- build the plugin;
- deploy `dist/main.js`, `dist/manifest.json`, and `dist/styles.css` to the Test Vault plugin directory;
- verify deployed `main.js` contains the newest `BUILD_ID`;
- reload the plugin in Obsidian;
- open Capability Lab;
- trigger the probe suite from the real Obsidian UI or an `obsidian eval` assertion;
- capture console/errors, DOM evidence, and probe output;
- fail the run if Capability Lab claims a probe passed without runtime evidence.

Normal repo gates also apply: targeted SDK tests, `npm run typecheck`, `npm run build`, relevant module docs, graphify freshness when `src/` changes, and any focused tests around the touched SDK boundary.

## Paste-Ready Goal Prompt

```text
/goal
Work in /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian.

Objective: upgrade OpenCodian's OpenCode SDK integration from the currently installed @opencode-ai/sdk 1.15.3 to @opencode-ai/sdk 1.17.17, then add a full Capability Lab probe layer for all newly available OpenCode SDK/server capability surfaces. Do not productize these new capabilities into ordinary Chat or Settings flows yet; this run is compatibility + capability registry + real Obsidian proof.

Hard constraints:
- Preserve all existing user/worktree changes. Do not revert unrelated dirty files.
- Do not edit reference-projects/ except to refresh/read the upstream OpenCode source if needed.
- Keep existing SDK v2 + legacy HTTP/SSE fallback behavior intact.
- Do not remove legacy fallbacks unless a focused runtime proof shows they are impossible or obsolete and the change is explicitly documented.
- Do not expose experimental/new v2 capabilities to ordinary users outside Capability Lab in this phase.
- For state-changing SDK APIs, use read-only/presence/shape probes, dry-run-safe calls, or mark skipped with a precise safety reason. Do not create/delete user projects, worktrees, credentials, sessions, or PTYs just to prove an endpoint exists.
- Follow repo docs/module-doc/graphify rules from AGENTS.md.

Context already known:
- npm latest for @opencode-ai/sdk is 1.17.17.
- The local opencode CLI was observed at 1.17.15.
- Upstream OpenCode source was refreshed under reference-projects/opencode at commit 08096b5e61c9227a6b52aacc745a1a51c6385284.
- SDK 1.17.x adds or expands surfaces such as ./v2/types, capabilities, v2.health, v2.location, v2.agent, v2.session, v2.model/provider, v2.integration/credential, v2.permission/question, v2.fs, v2.command/skill/reference, v2.event, v2.pty, v2.projectCopy, experimental.controlPlane, experimental.projectCopy, and experimental.session.background.

Implementation shape:
1. Upgrade @opencode-ai/sdk to 1.17.17 and refresh the lockfile.
2. Fix SDK compatibility at the existing narrow boundaries first:
   - src/core/opencode/createSdkClient.ts
   - src/core/opencode/OpenCodeSdkFacade.ts
   - src/core/opencode/sdkTypes.ts
   - src/core/opencode/sdkFeatureFlags.ts
   - src/core/opencode/OpenCodeService.ts
   - src/core/opencode/OpenCodeCatalogQueryCoordinator.ts
   - src/core/opencode/OpenCodeSessionLifecycleCoordinator.ts
   - src/core/opencode/OpenCodeSessionControlOrchestrator.ts
   - src/core/opencode/OpenCodeQuestionPermissionHub.ts
3. Add a capability/probe registry for new SDK 1.17.x surfaces. Every entry must have stable fields:
   - id
   - category
   - sdkNamespace
   - method
   - probeKind
   - status
   - evidence
   - error
   - futureFeatureGate
   - lastCheckedAt
4. Cover the full new-capability scope:
   - capabilities
   - v2.health
   - v2.location
   - v2.agent
   - v2.session
   - v2.model and v2.provider
   - v2.integration and v2.credential
   - v2.permission and v2.question
   - v2.fs
   - v2.command, v2.skill, and v2.reference
   - v2.event
   - v2.pty
   - v2.projectCopy
   - experimental.controlPlane
   - experimental.projectCopy
   - experimental.session.background
5. Add Capability Lab UI/readout for running and inspecting the registry probes. It should show grouped status, evidence summaries, skipped reasons, errors, and future feature gate ids. Keep it diagnostic and developer-facing.
6. Add tests for:
   - SDK client creation config shape;
   - facade namespace/proxy behavior and missing-method behavior;
   - response unwrap/error normalization if 1.17.x changes generated response shapes;
   - capability registry entry normalization;
   - probe runner handling for pass/fail/skipped/error;
   - Capability Lab rendering of grouped probe results.
7. Update matching docs/modules/** pages and docs/status/sdk-v2-rollout.md. If src/ changes require graph freshness, run npm run graphify:update:src.

Autodebug runtime gate:
- Use the obsidian-plugin-autodebug skill/workflow before claiming done.
- Build first with npm run build.
- Deploy generated runtime artifacts to the Test Vault plugin directory per AGENTS.md.
- Verify deployed main.js contains the newest BUILD_ID from the build.
- Reload the plugin in Obsidian using the available CLI/CDP/autodebug path.
- Open the OpenCodian settings Capability Lab surface.
- Trigger the new SDK 1.17 capability probe suite from the real Obsidian runtime, either by UI action or by a stable obsidian eval assertion that invokes the same runtime path.
- Capture console/errors, DOM evidence, and probe output under .obsidian-debug/ or another repo-local debug folder.
- The final report must include exact autodebug commands/artifacts and a pass/fail/skipped capability matrix. A probe may only be marked pass when there is runtime evidence from Obsidian/Test Vault, not just TypeScript compilation.

Verification commands:
- npm test -- tests/unit/core/opencode/createSdkClient.test.ts tests/unit/core/opencode/OpenCodeSdkFacade.test.ts tests/unit/core/opencode/OpenCodeService.sdkCompat.test.ts tests/unit/core/opencode/OpenCodeSessionLifecycleCoordinator.test.ts tests/unit/core/opencode/OpenCodeSessionControlOrchestrator.test.ts tests/unit/core/opencode/OpenCodeQuestionPermissionHub.test.ts
- npm run typecheck
- npm run build
- npm run check:module-docs
- npm run check:graphify after graphify:update:src when src changed
- Run any new focused tests added for the capability registry/probe runner/Capability Lab UI.

Final deliverables:
- SDK upgraded to @opencode-ai/sdk 1.17.17 with lockfile refreshed.
- Capability registry and probe runner implemented.
- Capability Lab shows full SDK 1.17.x probe matrix.
- Tests/docs/graphify updated as required.
- Obsidian Plugin Autodebug evidence proving the plugin reloads and the probe suite runs in Test Vault.
- Final summary lists changed files, verification commands, autodebug artifacts, and a capability matrix with pass/fail/skipped and reasons.
```

## Out Of Scope

- Productizing the new capabilities in ordinary Chat or Settings flows.
- Removing legacy HTTP/SSE fallback paths.
- Creating, deleting, or mutating real user workspaces, credentials, projects, PTYs, or sessions solely for probe coverage.
- Redesigning Capability Lab beyond the minimum grouped diagnostic surface needed for the probe matrix.
