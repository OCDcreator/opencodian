# Owner: core.memory

> The manifest (`architecture-owners.config.json`) is the canonical truth source; this page narrates the model and records hard-to-automate rationale.

- **Layer:** `core` (may import layers: shared, core)
- **Risk:** medium
- **Include:** `src/core/memory/**`

## Responsibilities
- backend-neutral workspace memory core: path identity, Markdown topic store, `MEMORY.md` index formatting and injection planning
- per-turn extraction and compaction reflection gates, prompts, parsers and provenance-stamped write plans
- credential scan guard, hygiene notices and index-only recall assembly with lexical semantic fallback
- vault-wide lexical retrieval index (R-C1): pure chunking/scoring/truncation core plus the fs-injected background index service over `.opencodian/vault-index` — lexical only by the §10 Q3 decision (no embedding, no vector store, no new dependency)

## Canonical state (truth home)
- workspace memory store layout rules and index budget caps (200 lines / 25KB, archived tail marker)
- injection/extraction/reflection planning contracts (option shapes, epoch markers, provenance tags)
- vault retrieval index layout rules (`.opencodian/vault-index` manifest + shards, 512KB shard / 100MB manifest caps, SOFT_CHUNK_CHARS bisection, ≥2-distinct-token selection gate, per-note truncation cap)

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/core/memory/index.ts`
- `src/core/memory/MemoryBackendService.ts`
- `src/core/memory/VaultIndexService.ts` (R-C1, fs port injected; the Obsidian adapter lives in `app.memory-runtime` as `VaultIndexFileSystem`)

## Dependency surface
- **Allowed owner dependencies:** none — the owner is deliberately self-contained (structural transcript types only, injected filesystem port, injected model-invoker port)
- **Forbidden dependencies:** `core.opencode`, `core.opencode-diagnostics`, `core.agents`, `core.backend`, `core.backend-pi`, `core.backend-diagnostics`, `feature`, `app`
- **Adjacent owners** (prefer editing these when out of scope): `app.memory-runtime`, `feature.chat-runtime`, `feature.chat-services`

## Focused tests
- `tests/unit/core/memory/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- **Backend neutrality is the reason this owner exists**: no module under `src/core/memory/**` may import an agent backend adapter, the OpenCode service, or any feature/app module. All backend contact happens through ports (`MemoryFileSystem`, `MemoryModelInvoker`) injected by `app.memory-runtime`.
- All byte math uses the shared `byteLength()` helper (UTF-8 code-point safe, CJK correct) — never `String.length`.
- The store is pure Markdown on the filesystem port; no vector store, no SQLite, no dedicated memory CRUD tool.
- Injection-side secret guard only withholds content from injection; it never edits files on disk.
- **R-C1 retrieval shares the lexical-only stance**: the index stores tokens + line numbers, never note bodies; snippet text is re-read at injection time and passes the same `scanForSecrets` guard. The service is dormant unless `vaultRetrievalEnabled` turns on — off means no listeners, no indexing and byte-identical outgoing requests (contract-tested).
- Behavior is the frozen decision set of the reference implementation `opencode-zmem` (D1–D29); deviations are recorded as D-O decisions in the devlog and this page.

## Deliberate deviations from the reference implementation (D-O series)

| ID | Deviation | Reason |
|----|-----------|--------|
| D-O3 | protocol+index injected once per context epoch (marker-detected from the persisted transcript), not on every LLM request | the plugin-side seam is message-layer (`AgentChatSendRequest.options.memoryInjection`), and the server-side transcript accumulates user messages — per-request injection would duplicate |
| D-O7 | semantic recall ships lexical + lite-model selection only; the embedding channel is intentionally not ported | the product constraints explicitly reject embedding/vector retrieval; storage must stay pure Markdown |
| D-O1 | store root is `<vault>/.opencodian/memory/projects/<slug>-<hash16>/` | opencodian anchors every backend cwd to the vault; keeping the bucket inside the vault keeps model file-writes permission-free for all backends |
| D-O2 | opt-in shared-store mode: `memoryExternalRoot` maps buckets to `<root>/projects/<slug>-<hash16>/memory` (zmem / ZCode layout), metrics stay in the vault | lets opencode-zmem, OpenCodian and ZCode workspace memory operate on one physical tree without format migration; `~` expansion keeps one synced settings value valid on every host |

- 2026-09-15: Owner 模型新增 `feature.inline-edit`（行内编辑：CM6 内嵌输入框 + 原位词级 diff + 单次 `replaceRange` 落盘），owner 表已更新；本 owner 的边界与职责未变。

- 2026-09-18 (FlowText 批次 B)：owner manifest 随 R-B1/R-B2 更新——新增 `src/shared/contextGroupPlan.ts` 归属 `shared.foundation`；本 owner 的边界与职责未变。
