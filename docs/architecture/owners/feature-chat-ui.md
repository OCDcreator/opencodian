# Owner: feature.chat-ui

Pricing readiness (2026-09-10): ContextDetailModal accepts scoped readiness and pricing callbacks, prices its captured token snapshot instead of copying a newer snapshot's cost, and releases the subscription on close without resetting raw messages or compaction state.

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.
- 2026-09-13 (universal memory backend): owner manifest gained `core.memory` and `app.memory-runtime`; this owner's boundary itself is unchanged (no source touched, allowlist untouched).

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
- **Single tooltip ownership:** an `EffortSelector` custom tooltip trigger must not sit beneath an ancestor `aria-label` or `title` that Obsidian can also adopt as a native hover tooltip. Keep the visible value and custom `data-tooltip` on the concrete control, and preserve its accessible name through `aria-labelledby` plus a visually hidden carrier.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Do not combine a custom tooltip trigger with a native-tooltip-owning `aria-label` or `title` on that trigger or its component-owned ancestor.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.
- 2026-09-08：会话设置 UI 暴露 Codex SDK 0.153.4 新推理档位，不改变其“下一线程生效”语义。

## Pi owner boundary review (2026-09-08)

The new core.backend-pi owner isolates the external Pi process service. feature.chat-ui retains its existing responsibilities; Pi process lifecycle, RPC compatibility and native history must not be added to this owner.

## Model selector provider header icons (2026-09-11)

`RenderModelListOptions` gained a required `app: App`, and provider group headers now call `ProviderIconService.createIconElement(app, provider.id, 14)`. This removed the divergence where `hasIcon()` was true but `getIconUrl()` returned null, and lets local bundled icons render in the dropdown headers. Keep provider icon resolution in `shared.utils-icons`.
