# Feature Agents / Commands Phase 2

> Date: 2026-04-17
> Status: completed
> Slice: ordered plan item 2 — project config helpers for compaction, default agent, agents, and commands

## Completed slice

- Added `OpencodeConfigManager` read/write helpers for `compaction`, `default_agent`, `agent`, and `command`.
- Added merge-preserving entry upserts so helper writes keep adjacent unknown fields instead of rewriting whole config blobs.
- Added deprecated legacy-agent import compatibility by reading `mode` entries alongside native `agent` config, while keeping top-level `tools` and unrelated config fields intact.

## Scope and boundaries

- Stayed inside existing config/type owners: `src/core/config/OpencodeConfigManager.ts` and `src/core/types/*`.
- Kept the slice focused on project `.opencode/opencode.json` helpers only; did not start session context-path runtime, settings UI, agent UI, or slash execution work.
- Touched only the directly related module docs under `docs/modules/core/**`.

## Files changed

- `src/core/config/OpencodeConfigManager.ts`
- `src/core/types/opencodeConfig.ts`
- `src/core/types/index.ts`
- `tests/unit/core/config/OpencodeConfigManager.test.ts`
- `docs/modules/core/config/OpencodeConfigManager.md`
- `docs/modules/core/types/opencodeConfig.md`
- `docs/modules/core/types/index.md`

## Validation

- Targeted: `npm test -- --runInBand tests/unit/core/config/OpencodeConfigManager.test.ts`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Full tests: `npm test`
- Build: `npm run build`

## Next recommended slice

- Ordered plan item 3: implement persistent session context paths by persisting `Conversation.externalContextPaths`, resolving them into `PromptContextItem[]` before send, and merging them with one-off composer context without reviving raw `QueryOptions.externalContextPaths` transport.
