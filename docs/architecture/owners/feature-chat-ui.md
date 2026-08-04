# Owner: feature.chat-ui

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** medium
- **Include:** `src/features/chat/ui/**`

## Responsibilities
- chat UI components: modals, docks, overlays, model selector, navigation sidebar, lsp indicator

## Entrypoints
- `src/features/chat/ui/modelSelector/ModelSelectorRenderer.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `shared.utils-streaming`, `core.types`
- **Forbidden dependencies:** `app`
- **Adjacent owners** (prefer editing these when out of scope): `feature.chat-shell`, `feature.chat-rendering`

## Focused tests
- `tests/unit/features/chat/ui/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Recent change notes
- **Modified-files sidebar:** the sidebar is an explicit, keyboard-accessible current-OpenCode-session `session.diff` viewer. It does not query or imply Git working-tree state.
- **Shared vault path delegation:** `ModifiedFilesSidebar.formatPath()` now delegates to the shared `toVaultRelativePath()` pure function (directory-boundary stripping, traversal rejection, fail-closed `null` for unprovable absolute paths) while keeping its own adapter `getBasePath()` acquisition. Unresolved entries show only a non-interactive basename and never expose/open the raw absolute path.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.
