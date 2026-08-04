# Owner: shared.i18n

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

- **Layer:** `shared` (may import layers: shared)
- **Risk:** low
- **Include:** `src/i18n/**`

## Responsibilities
- locale catalog and i18n message table
- translation key surface consumed by chat and settings

## Canonical state (truth home)
- i18n message catalog

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/i18n/index.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`
- **Forbidden dependencies:** `core`, `feature`, `app`
- **Adjacent owners** (prefer editing these when out of scope): `shared.foundation`

## Focused tests
- `tests/unit/i18n/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.

## Recent change notes

- **Turn-change record preference:** added English and Chinese labels explaining that the Conversation setting hides or restores historical file-change cards without stopping their collection or retention.

- **Turn-diff compact card copy:** added `chat.diffNotice.fileCount` / `expandRemaining` / `collapse` / `statusAdded` / `statusDeleted` (en + zh) for the structured turn-diff card; `chat.diffNotice.description` stays for persisted Markdown compatibility but is no longer rendered by the dedicated branch.

- **Obsidian 1.13.4 compatibility (Phase B):** added `settings.searchDesc` (en + zh) — the description consumed by `OpenCodianSettingTab.getSettingDefinitions()`'s declarative `SettingDefinitionPage`, so the plugin is discoverable by name and description in global Settings search on Obsidian 1.13+. Module-doc changelog entries added to `docs/modules/i18n/locales/{en,zh}.md`.
