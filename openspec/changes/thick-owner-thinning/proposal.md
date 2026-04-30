# Proposal: Maintenance-Phase Thick Owner Thinning

## Problem

OpenCodian is in a maintenance-first phase. The project does not need general net-new feature work; it needs safer ownership boundaries inside a large single-repo Obsidian plugin codebase.

Several high-connection files remain thick enough that unattended maintenance runs can drift into two failure modes:

- they add more coordination responsibility to existing facade owners
- they split code into small helper files that move complexity sideways without creating durable ownership

`npm run verify` is necessary, but it is not sufficient. A round is successful only when the ownership shape is improved or explicitly preserved.

## Governing Baseline

This change must follow `docs/requirements/maintenance-development-baseline.md` and the active guardrails in `docs/status/development-maintainability-rules.md`.

The executor must treat these as hard constraints:

- OpenCodian is a large single-repo plugin codebase, not a small plugin.
- Optimize for domain ownership and safe edit surfaces, not line-count minimalism.
- Prefer one cohesive owner over several blurred thin files.
- Allow high-connection facade owners to remain large when they are stable shells.
- Do not use file line count as the primary definition of modularity.
- Do not reorganize the repository into generic `core/services`, `shared/hooks`, or broad template structures.
- Graphify communities are diagnostic signals, not directory prescriptions.

## Proposed Solution

Run the work through the literal Full Auto Pipeline:

1. OpenSpec defines this maintenance contract.
2. Task Master decomposes it into ordered, single-owner tasks.
3. `opencode-loop execute` consumes the canonical `.opencode-loop/queue.json` one task at a time.

Each task must begin by naming a primary owner type:

- high-connection facade owner
- domain runtime owner
- domain UI owner
- state owner
- config owner
- storage owner
- test owner
- documentation owner

If the owner cannot be named clearly, the task is not ready to execute.

## Scope

### In Scope

- Reduce responsibility density in thick files by moving complete behavior slices into existing adjacent owners when possible.
- Prefer fewer but stronger owners.
- Strengthen module docs and focused tests when a boundary changes.
- Keep `src/core/`, `src/features/`, `src/shared/`, `src/utils/`, and `docs/modules/**` as the canonical structure.
- Use `npm run verify` plus focused tests and module-doc/graphify checks as verification.

### Priority Thick Owners

Pay special attention to these files without mechanically tearing them apart:

- `src/features/chat/OpenCodianView.ts`
- `src/core/opencode/OpenCodeService.ts`
- `src/main.ts`
- `src/core/opencode/ServerManager.ts`

`OpenCodianView.ts` and `OpenCodeService.ts` may remain large only as shell/facade/lifecycle composition owners. When touching either file, do not add new runtime ownership.

### Out of Scope

- General net-new end-user features.
- Cosmetic directory churn.
- Splitting code just to reduce line count.
- Creating one-off helper, adapter, provider, factory, or bridge files that are called once.
- Broad refactors that cannot be verified incrementally.
- Moving complexity from one thick file into several thin files.

## Task Selection Rules

Each execute task must select exactly one primary owner.

Allowed module creation is limited to cases where the new module:

- owns a complete behavior slice
- is reused in three or more places
- isolates a high-risk dependency or protocol boundary
- removes duplicate truth or duplicate orchestration and leaves a durable owner

Otherwise, extend an existing adjacent owner.

## Acceptance Criteria

- Every code task names its primary owner type before changing files.
- Every task keeps a narrow `scope_paths` / `forbidden_paths` contract.
- No task grows `OpenCodianView.ts` or `OpenCodeService.ts` runtime ownership.
- Any extraction removes ownership ambiguity, import surface, duplicate state, duplicate orchestration, or verification uncertainty.
- Added modules, if any, are durable owners rather than thin wrappers.
- Matching `docs/modules/**` files are updated when a module boundary changes.
- `npm run verify` passes after source changes.
- Green verification is not counted as success unless the ownership shape improves or is explicitly preserved.

## Suggested First Slices

Prefer lower-risk owner-first slices before touching the deepest runtime surfaces:

1. `ServerManager.ts` domain runtime owner: identify a complete local-server lifecycle or endpoint-resolution slice that can move into an existing adjacent owner or one durable protocol-boundary owner without changing behavior.
2. `OpenCodeService.ts` high-connection facade owner: move only compatibility/facade-adjacent logic into existing opencode owners such as lifecycle, prompt, session-control, query, state, or streaming coordinators.
3. `OpenCodianView.ts` high-connection facade owner: reduce shell assembly or callback-surface density by extending existing chat services/coordinators, not by creating one-off helpers.
4. `main.ts` lifecycle composition owner: preserve plugin lifecycle ownership while moving only complete config/bootstrap slices into existing config/storage/theme owners.

The executor should pick the first slice that can be made behavior-preserving, independently verifiable, and anti-fragmentation compliant.

## Verification

Default verification:

```bash
npm run verify
```

Focused verification should be added when relevant:

```bash
npm run check:module-docs
npm run check:graphify
npm run check:devlog-order
```

Use focused Jest targets for changed runtime owners when available.

## References

- `docs/requirements/maintenance-development-baseline.md`
- `docs/status/development-maintainability-rules.md`
- `docs/requirements/agent-maintainability.md`
- `docs/modules/**`
- `graphify-out/GRAPH_REPORT.md`
