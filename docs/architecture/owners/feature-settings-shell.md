# Owner: feature.settings-shell

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** high
- **Include:** `src/features/settings/**`

## Responsibilities
- settings tab shell, router, coordinator and shared controls
- settings normalization and view registration

## Canonical state (truth home)
- OpenCodianSettings normalized state
- settings section coordinator state

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/features/settings/OpenCodianSettings.ts`
- `src/features/settings/OpenCodianSettingsView.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `core.types`, `core.config`
- **Forbidden dependencies:** `app`
- **Adjacent owners** (prefer editing these when out of scope): `app.composition`, `feature.settings-debug`, `feature.settings-model-catalog`
- **Delegates to:** `feature.settings-debug`, `feature.settings-model-catalog`, `feature.settings-claude`, `feature.settings-codex`, `feature.settings-opencode`, `feature.settings-style`, `feature.settings-mcp`, `feature.settings-agents`, `feature.settings-plugin`

## Focused tests
- `tests/unit/features/settings/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`, `npm run build`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.

## Recent change notes

- **Obsidian 1.13.4 compatibility (Phase A):** `SettingsDropdownControl.enhanceSettingsDropdowns` now filters Obsidian 1.13's transient `select.dropdown.is-measuring` width probes (one per `DropdownComponent`) via the exported `isEnhanceableRealSelect()` predicate, applied to both the initial container scan and the MutationObserver increment. Without this, every settings row rendered two visible dropdowns. The filter is explicit and timing-independent, and must not be replaced by blanket `aria-hidden` hiding of real selects. Regression coverage lives in `tests/unit/features/settings/SettingsDropdownControl.test.ts` (`host measuring-probe regression`). Full host-coupling audit: `docs/status/obsidian-1.13-host-coupling-inventory.md`.
- **Obsidian 1.13.4 detached Settings window:** every `SettingsDropdownControl` instance is scoped to its backing select's `ownerDocument` and `defaultView`. Its custom root/menu nodes, portal destination, viewport positioning, RAF, `MutationObserver`, change event, and pointer/scroll/resize cleanup must stay in that same renderer window. Do not use lexical global `document` / `window`: doing so portals an open Settings dropdown into the main vault window, leaving only its trigger chevron visible in the detached Settings window. Conversely, do not require the select to be an instance of only the owner-window constructor: Obsidian's detached document retains main-renderer select prototypes, and rejecting them exposes the host-native dropdown. The foreign-document and split-realm regression cases live beside the measuring-probe coverage in `tests/unit/features/settings/SettingsDropdownControl.test.ts`; runtime evidence is recorded in `docs/status/obsidian-1.13-host-coupling-inventory.md` item 1.1.
