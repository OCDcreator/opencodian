# DSH configuration and capability inventory

Updated 2026-11-09 against installed/public `@deepseek-ai/dsh@0.2.2-rc.1`. This replaces the earlier connection-only inventory; readonly model rows are no longer the whole settings surface.

Canonical contracts: `src/core/types/dshConfiguration.ts`, `src/core/agents/backend/configuration/DshNativeConfiguration.ts`, `DshManagedProfile.ts`, `src/core/agents/backend/dsh/DshNativeControls.ts` and `assets/dsh/control.mjs`. The immutable descriptor registry enumerates exact public field paths, nested map/array entries, types, constraints, units and plugin-owned credential references. Do not maintain a divergent free-form field allowlist in UI.

## Configuration loop and sources

| Source | Scope | Application | Evidence |
|---|---|---|---|
| `backendSettings.dsh.nativeConfig` `{version:1,overrides}` | Current vault, non-secret sparse overrides | Validated, merged with actual inherited entry config, then controlled startup patch | Saved revision; process applied revision; independently redacted native effective observations |
| Existing connection fields and `mcpServers` | Current vault | Connection launch / new or resumed session; explicit Native idle MCP apply | Existing connection/catalog response and actual mounted declarations; online status remains unknown without an API |
| Native credential service | Machine-local, shared credential references | DSH native resolver; header references rematerialize on mount/reconnect | Configured/source/writable metadata only, no secret value |
| Plugin-owned managed profile | Machine-local, canonical-vault hash, SDK/ACP isolated | Extension selection/packages and loaded-extension volatile fields through native schema/CAS | Native saved/application/readback outcomes; actual reboot probes |
| Per-conversation overrides | Current session | Actual native selection, preset or Plan boundary | Same-session native readback/events; never rewrites vault defaults |
| `backendSettings.dsh.defaultPlanMode` | Current vault, optional plugin policy | Native fresh-session publication, including reserved catalog sessions; resume/fork retain their state | Independent Plan set/readback; ACP has no dedicated equivalent |

Missing means inherit. Reset removes an override rather than stamping an old release's numeric default. Native patches replace whole configs, so launcher merges against the composed inherited entry first. Original module identity, name assertions, relative plugin/include bases and protected runtime dependencies remain intact. User SDK profiles/installations/shared dependency directories are not package-manager write targets.

Configuration revision participates in the secret-free connection identity. Changing saved defaults never silently terminates an active turn or owned background work. Explicit reconnect requires actual quiescence evidence; idle child display alone is insufficient. A matching applied revision is process-level evidence, not confirmation of every field.

## Connection and MCP

| Field | Default / validation | When applied |
|---|---|---|
| `executablePath` | Empty discovers installed CLI; explicit path validated by launch resolution | Reconnect / plugin reload for executable changes |
| `workingDirectory` | Empty uses vault | Reconnect; never changes managed-profile vault identity |
| `args` | String array | Reconnect; high-impact advanced disclosure |
| `env` | Valid environment names, no NUL | Reconnect; values masked; excluded from connection snapshots |
| `profile` | Immutable historical `acp` marker | Compatibility only, not a selectable native profile |
| `transport` | Native default, ACP explicit compatibility mode | Reconnect; no silent Native failure fallback |
| `mcpServers` | Stdio absolute command/args/env or HTTP URL/headers | New/resumed sessions; explicit Native idle apply |
| MCP advanced options | Stdio absolute cwd; tool timeout, failOnStartupError, maxInstructionBytes, reconnect enabled/initialDelayMs/maxDelayMs/maxAttempts | Same declaration validation/draft/recovery transaction |

MCP declarations remain in `SettingsDshMcpWorkspace`; masked server controls are shared by `SettingsDshMcpServerControls`. Empty numeric/choice overrides inherit actual DSH defaults. Advanced MCP options are Native-only in installed 0.2.2-rc.1: ACP `resolveMcpConfigs` constructs a fresh allowlisted basic config, fixes stdio cwd to the session directory and forces startup errors to fail; it does not consume the advanced wire fields. Retained Native overrides must not be presented as applied in ACP. Successful mounting does not prove a live remote connection. Connection-only backup remains exactly executablePath/workingDirectory/profile/transport; it does not become a full-configuration backup.

## Native configuration groups

All editable groups use the typed public-schema registry. Provider/model IDs remain opaque identifiers; labels are localized separately. Numbers representing model capability fallbacks cannot enlarge the real model's capacity.

| Namespace | Covered fields / semantics | Settings task |
|---|---|---|
| `agent-default-model` | provider/model/reasoningEffort; default versus current session | Model |
| `llm-deepseek` | endpoint, thinking/effort, output cap, context fallback, models/cache/listing, stream/Files API/retry/image/file budgets | Model / advanced fields |
| `llm-pi-ai` | provider route CRUD; API/baseURL; models/modelOverrides, compat; context/output/input capability fallback; reasoning/effort/budgets/cache/transport/timeouts/retries; harmless headers and credential refs | Model |
| `permission` | preset dictionary and default preset; native rules and defaults | Permissions |
| `sandbox-policy` | mode, workspace root and additional writable roots | Permissions |
| `approval` | native approval policy | Permissions |
| `compaction-basic` | auto, ratio/headroom/retention, paired summary route, maxTokens, retries and modelPolicies | Context |
| `skill-filesystem` | default/custom roots, watch, polling and symlink behavior | Context |
| `tool-web` / `web` | search/fetch capabilities, counts/output/timeout and underlying public Web config | Tools |
| `tool-fs` | read/image/write/edit/applyPatch and public read limits | Tools |
| `subagent` | max active children and depth | Advanced |
| `tool-todo` | parallel in-progress policy | Advanced |
| `tool-jobs` / `jobs` | wait/output/completion delivery/wake limits and public native Jobs retention | Advanced |
| `shell-env` | public shell environment policy | Advanced |
| `fs-observation-policy`, `timeout-policy`, `llm-retry`, `image-offload` | No public Config fields in this installed version; no invented mutable controls. Retry/image limits belong to the provider namespaces above. | Explicit diagnostic state |

Sensitive provider headers use plugin-owned `headerCredentialRefs`; the launcher resolves them through a fixed trusted plugin dependency before mounting the provider. Raw secrets do not enter vault settings, generated patches, history or diagnostics. Header credential changes require reconnect; plain native header dictionaries are not advertised as per-request secret rotation.

Compaction retainRatio/retainTokens alternatives and summary provider/model pairing are validated. Provider catalog replacement versus model overrides follow the real upstream schema. Unsupported saved intent is retained for an explicit validation error instead of being silently removed by normalization.

## Runtime controls

Chat presentation correction (2026-11-10): the user rejected the extra DSH composer strip and separate tools modal. Build `202611100051` restores the shared chat layout; wide and narrow product checks and independent visual review pass that restoration scope. The DSH-only strip/modal are unwired. Permission, Plan, terminal and remaining actions are being adapted to the existing generic selector and shared session workbench. The contracts below remain implemented, but final accessibility and visual acceptance of the adapted entry points must be established on their shipping build. The already accepted Settings surface remains unchanged.

| Domain | Implemented contract and entry | Boundary |
|---|---|---|
| Permission presets | catalog/current/set in composer | Session-owned; derived custom is display-only; upstream rejection retained |
| Plan | Independent get/set, pending and disposition | Native queued/committed/cancelled/noop, separate from permission preset |
| Todo | Native snapshot, first refresh, whole-list notifications and restore/reconnect | Existing per-tab Todo owner; synthetic row IDs are projection IDs |
| Jobs | list/get/read/readAt/wait/kill/events in task workbench and session tools | Exact native owner; source-byte pagination, bounded output, redact before splitting; request acknowledgement is not completion |
| Subagents | Existing catalog/history plus status and owned interruption | No blanket OpenCode-specific Subagents flag; paired release event proves inactivity |
| Terminal | Availability/backends, spawn/list/read/send/signal/kill in session tools | Exact owned Agent and native PTY identity; optional bundle/platform dependencies explicit |
| Extensions | Inventory/inspect/versions/enable/install/update/remove/cancel/version exemption and progress | Managed profile only; native management and bridge dependencies protected; explicit acceptance for compatibility exemption |
| Loaded extension / Hook fields | Actual serialized native form schema; set/unset with numeric CAS and native validation | Machine-local managed profile; core vault namespaces, secret fields/ancestors, nonvolatile/overlay-owned entries rejected |
| Model/effort, manual compact, Goal, fork, steer, skills, history, inline edit/completion | Existing contracts preserved | Aux/inline read-only proof stays fail-closed |
| Usage | Native token/context breakdown | No monetary/currency/quota evidence in probed TokenUsage/ResolvedModelInfo schemas; do not derive money from tokenMeter's token pricing |

## Native versus ACP

Native advertises per-method configuration/control flags based on actual services. Its additive `control/capabilities` reader reports current service presence and a process-local composition revision; reconnect uses fresh same-client evidence rather than interpreting absent method flags as absence of work. ACP retains its existing model/effort wire, permission asks, session history/list/resume and basic MCP startup declarations. Supported default patches are applied at ACP startup; Native control/observation RPCs are not promised over ACP. ACP application's explicit provider/model defaults receive a separate generated mapping from explicit saved overrides; missing fields inherit the ACP application's own defaults. Saved effort is validated and applied once through the actual option catalog before a new session is published. The installed `DshAcpDefaults.live.test.ts` probe confirms high on new sessions, explicit low retained after resume, another new session high, and reset inheritance with the original session unchanged, without model dispatch. This proof is independent of Native acceptance.

## UI and verification

Eight horizontal subtabs preserve original IDs/deep links. NativeWorkspace owns sparse vault drafts, group CAS, rollback and metadata-only history. NativeFields provides guided scalar and structured entry controls; advanced JSON is supplemental. Dirty raw JSON locks guided/reset/history mutation until explicit save/discard, so mixed editing cannot erase an unsaved draft. The section/renderer/hosts dispose live subscriptions on remount/close. Runtime forms distinguish effective and inherited sources; missing or partial evidence stays unavailable.

Focused behavior suites cover schema validation, launch/ACP/aux admission, actual installed native profile persistence/reboot, session ownership/generation, Jobs output and secrets, UI transactions/recovery and Todo/Plan/workbench actions. `DshNativeControlRuntime.test.ts` runs Node bridge tests through the default gate; installed probes explicitly skip on hosts without the matching public installation. Real-model and native GUI evidence is separate from fixtures.

Current integration evidence: `.impeccable/review/dsh-complete-integration-20261109/`. `field-inventory.json` is the generated registry snapshot; its count is not per-field runtime proof. Historical full-gate and deployed-running records are preserved as `verify-2032.json` and `deployment-2032.json`; later repairs need fresh verification/deployment. Build 2032's first compaction change persisted and applied, but repeat reconnect failed and Native runtime restoration remained pending. Its narrow composer toolbar intercepted Send, so no actual model request occurred. `acceptance-summary.json`, `final-coverage-audit.md` and `implementation-ledger.md` record the specific repairs, support boundaries and open proof. Real installed official-terminal bundle/PTY tests independently cover enable, isolated service resolution, read/write/signal/kill, owner rejection and reboot/disable persistence without model dispatch. UI/real-model acceptance and final custom/Kimi review must be read with their exact build and scope, not inferred from this inventory.
