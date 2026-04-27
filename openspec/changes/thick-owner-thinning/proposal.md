## Why

`src/features/chat/OpenCodianView.ts` and `src/core/opencode/OpenCodeService.ts` remain the repo's highest-connection thick files, which makes long-running autonomous maintainability work prone to either stalled ownership moves or low-value file fragmentation. We need a spec-backed execution contract now so automated rounds can keep thinning these owners without regressing into many thin helper files.

## What Changes

- Define a maintainability capability for thinning high-connection owners through durable ownership moves rather than line-count-only splits.
- Require the refactor program to run as two alternating lanes: one lane for `OpenCodianView.ts`, one lane for `OpenCodeService.ts`.
- Require each automated round to move exactly one complete behavior slice into a small number of durable adjacent owners, keeping the main owner thinner and clearer.
- Require every round to preserve repo guardrails: focused tests, module docs, graphify freshness, and `npm run verify`.
- Require execution planning artifacts that can be consumed by Task Master and `opencode-loop` execute mode.

## Capabilities

### New Capabilities
- `high-connection-owner-thinning`: Defines how autonomous maintainability work must thin `OpenCodianView.ts` and `OpenCodeService.ts` without creating fragmented ownership.

### Modified Capabilities
- None.

## Impact

- Affected code: `src/features/chat/OpenCodianView.ts`, `src/core/opencode/OpenCodeService.ts`, and adjacent owner modules they already depend on.
- Affected docs: `AGENTS.md`, `docs/status/development-maintainability-rules.md`, `docs/modules/**`, `graphify-out/**`, and the new OpenSpec artifacts for this change.
- Affected automation: `.taskmaster/**` and `.opencode-loop/queue.json` once the change is imported into execute mode.
