# Owner: core.pdf

> The manifest (`architecture-owners.config.json`) is the canonical truth source; this page narrates the model and records hard-to-automate rationale.

- **Layer:** `core` (may import layers: shared, core)
- **Risk:** medium
- **Include:** `src/core/pdf/**`

## Responsibilities
- R-C4 phase 1: pure PDF text-layer layout rules (line rebuild from `getTextContent()` items), the textless fail-closed verdict and the one-shot attach limits
- lazy pdf.js engine artifact contract and loader — `pdf-engine.js` is the SECOND esbuild entry point, `require`d on first PDF attach/index; plugin startup never parses it
- R-C4 phase 2: page-anchored local PDF index (format, storage service, retrieval selection) reusing the R-C1 retrieval primitives from `core.memory` — `tokenize`, `scoreChunk`, the selection gate, `truncateNoteSnippet`; NOT a second retrieval stack (flowtext §11.4)
- R-C4 phase 3: the pure A/B/C degradation-ladder decision and the markdown sidecar annotation formatting

## Canonical state (truth home)
- PDF index chunk tables under `.opencodian/pdf-index/` (fingerprint-named `sha1(path+mtime+size)`, `ready`-gated, atomic tmp→rename writes)
- lazy `pdf-engine.js` loader residency (never resident at startup; failed loads are not cached)
- per-leaf viewer probe decisions feeding the A/B/C ladder

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/core/pdf/index.ts`
- `src/core/pdf/PdfIndexService.ts` (phase 2, `PdfIndexFs` port injected; the Obsidian adapter lives in `app.pdf-runtime` as `PdfIndexFileSystem`)
- `src/core/pdf/pdfTextEngine.ts` (phase 1 lazy loader)

## Dependency surface
- **Allowed owner dependencies:** `core.types`, `core.memory` (R-C1 retrieval primitives), `shared.foundation`, `shared.diagnostics`
- **Forbidden dependencies:** `core.opencode`, `core.opencode-diagnostics`, `core.agents`, `core.backend`, `core.backend-pi`, `core.backend-diagnostics`, `feature`, `app`
- **Adjacent owners** (prefer editing these when out of scope): `app.pdf-runtime`, `app.composition`, `feature.chat-services`

## Focused tests
- `tests/unit/core/pdf/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- **pdf.js is quarantined here.** Only `pdfEngineEntry.ts` may import `pdfjs-dist`, and it must stay out of `main.js` — the engine artifact is required lazily through `PdfEngineLoader`, never at startup (flowtext-c4-design §3.1/D3).
- **Fail-closed throughout** (§4): encrypted (`PasswordException`), unreadable, textless (scan) or over-limit documents produce an honest refusal — never an empty or partially truncated context.
- **No second retrieval stack** (§11.4): scoring, the selection gate and truncation are the `core.memory` R-C1 primitives; this owner only adds PDF-side chunk anchoring and storage.
- A half built index is never queryable: the `ready` flag rides the same atomic write as the complete chunk table, and a cancelled generation leaves nothing behind.
- The only write path of the whole feature is the markdown sidecar annotation through the vault API, pre-snapshotted by the R-B3 revert system; the PDF binary is never modified.

## Registration rationale (2026-09-18, R-C4)
A new owner was registered because the candidate hosts genuinely cannot take the subsystem: `core.memory` hosts note-token indexes (grafting pdf.js extraction, viewer probing and sidecar formatting there would mix an already-medium-risk owner with a version-sensitive dependency); `core.storage` owns revert snapshots, not PDF extraction; `feature.chat-services` is a feature-layer consumer and must not own a core engine loader. The design (flowtext-c4-design §3.0) sanctioned `core.pdf` for exactly this isolation: a real subsystem (extraction, caching, probing) wrapping a high-risk, version-sensitive dependency — the sanctioned exception to the "no new layers" rule, not a thin adapter.
