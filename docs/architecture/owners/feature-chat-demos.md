# Owner: feature.chat-demos

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** low
- **Include:** `src/features/chat/glassOctahedronDemo.ts`, `src/features/chat/glassOctahedronDemoRefraction.ts`, `src/features/chat/glassOctahedronDemoThree.ts`, `src/features/chat/liquidDiamondDemo.ts`, `src/features/chat/liquidDiamondDemoWebgl.ts`

## Responsibilities
- experimental visual demos (glass octahedron, liquid diamond)
- kept opt-in, never exposed in stable UI paths

## Entrypoints
- `src/features/chat/liquidDiamondDemo.ts`
- `src/features/chat/glassOctahedronDemo.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `shared.vendor`, `shared.utils-glass`
- **Forbidden dependencies:** `app`
- **Adjacent owners** (prefer editing these when out of scope): `feature.chat-shell`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.
