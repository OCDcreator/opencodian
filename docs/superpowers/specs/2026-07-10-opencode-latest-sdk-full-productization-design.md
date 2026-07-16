# OpenCode Latest SDK Full Productization Design

**Date:** 2026-07-10

**Status:** READY-FOR-IMPLEMENTATION-PLANNING

## Goal

Upgrade OpenCodian's in-plugin `@opencode-ai/sdk` from the currently installed
`1.15.3` to the latest stable release available when execution begins. Inventory
every SDK surface added since `1.15.3`, then productize each supported user-facing
capability through the existing Chat and Settings surfaces.

This is not a request to upgrade the user's OpenCode CLI, local server, remote
server, or managed sidecar binary. The plugin must instead negotiate what the
connected server supports and represent unsupported capabilities honestly.

The work runs as one autonomous, multi-round goal. Its non-negotiable priority
order is:

1. Do not lose user data or session state.
2. Preserve the existing OpenCode Chat chain.
3. Preserve or migrate configuration compatibility.
4. Maximize new capability coverage.

## Evidence Base

| Fact | Evidence at design time | Execution requirement |
|---|---|---|
| Main branch SDK | `package.json` and `package-lock.json` pin/resolve `@opencode-ai/sdk@1.15.3`. | Re-check before editing. |
| npm stable SDK | `npm view @opencode-ai/sdk dist-tags --json` reports `latest: 1.17.18`. | Re-run and pin the exact stable `latest` version plus tarball integrity. |
| Local upstream reference | `reference-projects/opencode/packages/sdk/js/package.json` is `1.17.17`. | Fetch/pull upstream and record the exact commit/tag used for API comparison. |
| Existing upgrade worktree | `codex/opencode-sdk-117-capability-registry` upgrades to `1.17.18` and adds Capability Lab probes. | Reuse only verified, compatible slices; do not blindly merge the worktree. |
| Existing SDK boundary | `OpenCodeSdkFacade` centralizes namespace resolution, request options, response unwrapping, and error normalization. | Keep this as the sole raw SDK boundary. |
| Existing product shell | `OpenCodeService`, Chat services, and Settings sections already own ordinary OpenCode UI. | Extend the existing owners; do not create an end-user capability-center page. |

## Decisions

| Question | Decision |
|---|---|
| Version target | Discover the latest stable SDK at the beginning of execution, pin the exact version, and record upstream commit/tag and generated type diff. Never hard-code `1.17.18` as an eternal target. |
| Server upgrade | Out of scope. The plugin SDK upgrade must work against user-managed local and remote OpenCode servers. |
| Capability availability | Resolve from both SDK presence and live server support. A TypeScript method existing in the package is not proof that a server endpoint is callable. |
| Stable UX | Integrate into the established Chat and Settings sections according to capability ownership. Do not add a separate ordinary-user capability dashboard. |
| Diagnostic UX | Keep Capability Lab as developer/diagnostic-only evidence, not as the primary user workflow. |
| Experimental APIs | Attempt integration behind explicit, default-off Settings gates. Only an enabled gate plus verified server support may reveal the corresponding Chat control. |
| Unsupported server API | Show a disabled Settings row with the required server version or capability, exact failure reason, and re-check action. Never silently hide it. |
| Configuration migration | Auto-migrate safe, equivalent mappings; keep reading legacy fields whenever they remain meaningful. For impossible mappings, preserve the raw source backup and show a migration/deprecation explanation and alternative. |
| Fallbacks | Retain current legacy HTTP/SSE fallback paths until a later deliberate removal decision. Do not remove them as part of this upgrade. |

## Capability Contract

Every newly relevant SDK capability has a typed registry record. The registry is
the source of truth for UI visibility, disabled state, feature gates, diagnostics,
and compatibility reporting. At minimum each record contains:

- stable capability id and category;
- SDK namespace and method or method family;
- minimum SDK version and discovered server compatibility evidence;
- lifecycle class: read-only, reversible action, state-changing, or external
  process/control-plane action;
- product owner and user surface;
- default gate state and whether explicit confirmation is required;
- availability state: available, disabled-by-user, unsupported-by-server,
  unsupported-by-sdk, failed, or unknown;
- structured reason, upgrade hint, last checked time, and runtime evidence id;
- legacy fallback policy and configuration migration mapping where relevant.

The registry must distinguish `present in SDK`, `advertised by server`,
`successfully probed`, and `safe for ordinary UI`. No status may be promoted from
one of those states to another without supporting evidence.

## Product Surface Matrix

The final matrix is generated from the execution-time SDK type and release diff.
The following describes the required product destinations for the known post-1.15
families; it is a floor, not a frozen endpoint list.

| Capability family | Chat product surface | Settings product surface | Safety and fallback |
|---|---|---|---|
| `capabilities`, `v2.health`, `v2.location` | Existing server/status indicators and action failure explanations. | Server diagnostics with supported/unsupported reason and re-check. | Read-only; use existing health fallback. |
| `v2.session` additions including background, summarize, async, command, shell, history/events | Session menu, inline turn status, background task state, summary/compact controls, and existing session lifecycle controls when supported. | Defaults for background/summary behavior and capability disclosure. | Keep foreground status semantics intact; background is default-off when experimental. |
| `v2.agent`, `v2.model`, `v2.provider` | Existing agent/model picker and command completion only. | Existing Agents and Models areas show discovered capabilities and unsupported reason. | Do not replace directory-scoped provider truth with `provider.list()`. |
| `v2.integration`, `v2.credential`, connect/OAuth | No raw credential editing in Chat; show action result only. | Integrations and credentials configuration with secrets redacted and explicit restart/reauth outcomes. | State-changing confirmation; no secret in logs or UI persistence. |
| `v2.permission`, `v2.question`, request/control | Existing inline approval and question card owners. | Permission defaults and availability readout. | Preserve current question/permission fallback and response semantics. |
| `v2.fs`, `v2.find`, `v2.file`, `v2.reference` | Context picker, search/reference result cards, and file detail actions where user intent requires them. | Capability/read-access disclosure, no duplicate filesystem browser. | Directory scope validation; read-only by default. |
| `v2.command`, `v2.skill`, `v2.tool` | Slash-command catalog, skill mentions, and tool/result rendering. | Existing Commands, Skills, and Tools sections retain authoring ownership. | Invalidate cached catalogs after relevant config/server changes. |
| `v2.project`, workspace/worktree, VCS/diff | Existing project/session diff affordances and explicit project actions. | Project configuration and repository status sections. | Destructive worktree/VCS actions require confirmation and scoped preview. |
| `v2.event`/sync | No new generic event UI; use events to improve Chat freshness and state recovery. | Diagnostic last-sync/readback only. | Preserve authoritative message sync and legacy polling fallback. |
| `v2.pty` | Experimental terminal panel/action only after opt-in. | Default-off experimental gate, shell allowlist, scope warning, creation/cleanup controls. | Explicit per-action confirmation; never auto-spawn or retain an orphan PTY. |
| `experimental.controlPlane` | Experimental session-move/action controls only after opt-in. | Default-off gate, incompatibility explanation, and danger copy. | Explicit confirmation, audit record, and no implicit session relocation. |
| `experimental.projectCopy` | Experimental clone/copy progress and result link only after opt-in. | Default-off gate and destination/scope configuration. | Preview target, reject collisions, preserve source; no hidden writes. |
| experimental background/session APIs | Inline background turn status and resume/stop controls after opt-in. | Default-off gate and lifecycle behavior setting. | Never overwrite foreground runner state or downgrade tasks before authoritative hydration. |
| Capability Lab probes | Diagnostic-only. | Diagnostic-only, grouped matrix and exported evidence. | State-changing probes are dry-run, fixture-backed, or skipped with reason. |

## Architecture And Data Flow

1. `OpenCodeSdkFacade` remains the sole owner of raw SDK namespaces, request
   option injection, response unwrapping, and normalized error conversion.
2. A capability discovery coordinator queries SDK presence and server-side
   capabilities/health/location, normalizes version and error evidence, and
   stores the typed registry snapshot.
3. `OpenCodeService` and its existing coordinators expose semantic operations
   that first consult the registry. They either execute through the facade,
   follow the documented legacy fallback, or return an actionable unsupported
   result. Chat and Settings never call raw SDK namespaces for newly introduced
   functionality.
4. Settings renders stable configuration and availability rows under their
   existing owners. It can enable an experimental gate but never marks an
   unsupported server capability as enabled.
5. Chat asks the service for available actions. It renders stable actions when
   supported and experimental actions only after both the user gate and server
   capability are true.
6. Capability Lab consumes the same registry and service operations to prove
   presence/readback/runtime behavior. It cannot be a separate, more powerful
   production path.

## Settings And Migration Design

Introduce a versioned OpenCode-capability settings envelope rather than adding
unrelated booleans across the root settings type. It holds stable behavior
preferences, experimental gates, acknowledged risk state where needed, and the
latest migration report. Secrets and raw credential material do not belong in
this envelope.

Migration processing must be idempotent and ordered:

1. Load current split persistence plus legacy inputs using `StorageService`.
2. Snapshot the unmodified source before a non-trivial mutation.
3. Normalize safe fields to the new representation.
4. Preserve legacy reads when they still produce equivalent behavior.
5. Record every transformed, retained, skipped, or impossible field in a
   structured migration report.
6. Persist only after the normalized result passes validation.

An impossible migration keeps the original value in the backup and compatibility
read path when safe, disables only the affected new control, and shows the user
the old field, why it cannot map, and the replacement action. It may not delete
or silently reinterpret user intent.

## Execution Phases And Gates

| Phase | Deliverable | Gate before continuing |
|---|---|---|
| 0. Evidence and pin | Exact npm stable version, upstream commit/tag, generated SDK API diff from `1.15.3`, and capability classification. | No implementation until the diff, server compatibility strategy, and risk classes are recorded. |
| 1. Compatibility foundation | Dependency upgrade, facade typing/normalization changes, capability registry/discovery, typed unsupported result, migrations with backups. | Existing OpenCode Chat/session/config tests plus focused compatibility tests are green. |
| 2. Stable productization | Read-only and stable session/model/provider/skill/command/fs/integration surfaces integrated into existing Chat/Settings owners. | Every user-visible capability has unit coverage, registry state, fallback/disabled UX, and module docs. |
| 3. Experimental productization | PTY, control-plane, project-copy, and background/session features behind default-off gates and confirmations. | No experimental action appears before opt-in; cleanup/cancel/error paths are covered. |
| 4. Runtime proof | Test Vault build/deploy/reload and real capability scenarios through Obsidian Plugin Autodebug. | DOM, console/error, BUILD_ID, and action-result evidence exist for every claimed ordinary product feature. |
| 5. Closure | Full compatibility matrix and migration report, docs/graph freshness, final regression and residual-risk summary. | `npm run verify` and requested manual QA pass; unsupported capabilities remain explicitly represented. |

## Test And Runtime Proof

For every implementation slice, add focused tests at the semantic boundary:

- capability state resolution for SDK/server/gate combinations;
- service mapping, fallback, and typed failure behavior;
- settings migration equivalence, backup preservation, and impossible mapping;
- Chat visibility/action guards and confirmation paths;
- cleanup/cancel behavior for PTY, background, and state-changing operations;
- existing OpenCode session, streaming, question, permission, model/provider,
  config, and reload regressions.

When `src/` changes, update module docs and refresh the committed source graph.
The required repository gate is `npm run verify`; lint warnings are blockers.

For every product-facing phase, use Obsidian Plugin Autodebug:

1. build;
2. sequentially deploy generated artifacts to Test Vault;
3. verify the deployed `BUILD_ID`;
4. reload `opencodian`;
5. prove the target Settings tab or Chat control is active before capture;
6. execute at least one safe happy path and one unsupported/disabled path;
7. capture console/errors, DOM assertions, and screenshots where visual state
   matters;
8. store run artifacts under `.obsidian-debug/` and report them.

Test-only changes do not require Test Vault deployment. A feature is not called
complete from TypeScript or Capability Lab evidence alone: its ordinary Chat or
Settings surface must be driven in Obsidian when that surface exists.

## Stop Rules

- Stop and report before any implementation if the latest SDK API diff is not
  reproducible or the package/server contract is ambiguous.
- Do not enable an action solely because the SDK type exists.
- Do not change server-manager ownership or remove legacy HTTP/SSE fallback as
  incidental cleanup.
- Do not write credentials, tokens, raw server responses containing secrets, or
  raw migration backup contents to logs, diagnostics, screenshots, or docs.
- Do not progress past a phase whose required existing Chat regression or data
  preservation check fails.
- Mark an unsupported or unsafe endpoint as disabled/skipped with a reason;
  never emulate it with an incompatible configuration mapping.

## Acceptance Criteria

- The package and lockfile use the execution-time latest stable SDK, with the
  exact version and upstream reference documented.
- The complete post-`1.15.3` capability diff has one status: productized,
  diagnostic-only, unsupported-with-reason, deferred-by-safety, or obsolete.
- Every stable supported capability is exposed through an existing Chat or
  Settings owner rather than a generic end-user dashboard.
- Every experimental capability is attempted behind a default-off Settings gate
  and explicit runtime guard.
- Settings shows unsupported capabilities and migration outcomes honestly.
- User settings and conversations survive migration and plugin reload.
- Existing OpenCode workflows remain functional with the new SDK installed.
- Unit tests, docs, graph freshness, typecheck, lint, production build, and
  `npm run verify` pass.
- Obsidian/Test Vault artifacts prove each claimed ordinary product path.

## Resolved Assumptions

- Latest stable means npm's `latest` dist-tag at the start of Phase 0, not a
  beta, next, snapshot, dev, or locally cached version.
- A connected server may be older than the SDK. The plugin degrades through
  explicit state and retained fallbacks rather than forcing server upgrades.
- "Full capability" means each added API is inventoried and intentionally
  classified. It does not mean every raw endpoint receives an unguarded button.
- Existing Settings authoring owners for agents, commands, skills, tools, MCP,
  and project configuration are extended instead of duplicated.
