# Owner: shared.utils-icons

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.
- 2026-09-13 (universal memory backend): owner manifest gained `core.memory` and `app.memory-runtime`; this owner's boundary itself is unchanged (no source touched, allowlist untouched).

- **Layer:** `shared` (may import layers: shared)
- **Risk:** medium
- **Include:** `src/utils/icons/**`

## Responsibilities
- provider icon resolution spanning LobeHub, builtin and custom sources
- icon asset cache lifecycle

## Canonical state (truth home)
- provider icon registry
- provider icon asset cache

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/utils/icons/index.ts`
- `src/utils/icons/ProviderIconService.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`
- **Forbidden dependencies:** `core`, `feature`, `app`
- **Adjacent owners** (prefer editing these when out of scope): `shared.foundation`, `feature.settings-model-catalog`

## Focused tests
- `tests/unit/utils/icons/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.

## Pi owner boundary review (2026-09-08)

The new core.backend-pi owner isolates the external Pi process service. shared.utils-icons retains its existing responsibilities; Pi process lifecycle, RPC compatibility and native history must not be added to this owner.

## Provider icon source expansion (2026-09-11)

- `@lobehub/icons` bumped 5.4.0 → 5.18.0 and `sync:lobehub-icons` regenerated the manifest from 296 to 322 icons. In 5.18 `es/toc.js` became `import data from "./toc.json"`, which Node 22 rejects without an import attribute, so the script now reads `es/toc.json` directly and falls back to a module import only for the older inline-array layout.
- models.dev becomes the third icon source next to LobeHub and bundled icons: `sync:modelsdev-icons` turns `api.json` into the 213-id `modelsDevIconManifest.ts` vocabulary, and the runtime references `https://models.dev/logos/<id>.svg` instead of bundling those images. The provider icon asset cache gained the remote download/cache branch, and the builtin picker gained a models.dev library filter.
- Provider-id resolution is staged: alias table / bundled → LobeHub → models.dev exact id → suffix-strip retry → identity-token collision match. models.dev ids only take part in exact matching unless `includeModelsDev` is set, because their long ids contain generic words that would otherwise match unrelated brands.
- `ProviderIconService.createIconElement` now takes the Obsidian `App` so bundled local resource paths resolve through the same route as the async cache; this is what removed the divergence where `hasIcon()` was true while `getIconUrl()` returned null.
