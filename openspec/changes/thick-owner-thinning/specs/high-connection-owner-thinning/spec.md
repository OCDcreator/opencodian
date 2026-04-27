## ADDED Requirements

### Requirement: Thick-file thinning SHALL move durable ownership instead of fragmenting files
The maintainability program SHALL thin `src/features/chat/OpenCodianView.ts` and `src/core/opencode/OpenCodeService.ts` by moving complete behavior slices into durable adjacent owners. It MUST NOT treat line-count reduction alone as success, and it MUST prefer extending existing adjacent owners before creating new modules.

#### Scenario: Existing adjacent owner can absorb the slice
- **WHEN** an automated round selects a behavior slice that fits an existing adjacent coordinator, service, renderer, runtime, lifecycle, query, or state owner
- **THEN** the implementation MUST extend that existing owner instead of creating a new thin helper file

#### Scenario: New file is truly required
- **WHEN** no existing adjacent owner can hold a complete behavior slice without regrowing another thick file
- **THEN** the round MAY create a new owner file only if it owns a coherent behavior slice and does not reduce to a thin wrapper or single-call-site fragment

### Requirement: Execute-mode rounds SHALL operate as alternating single-slice lanes
The autonomous refactor queue SHALL run as two alternating lanes: one lane for `OpenCodeService.ts`, one lane for `OpenCodianView.ts`. Each queue task MUST target exactly one stable ownership slice within its selected lane.

#### Scenario: Queue selects the next round
- **WHEN** the queue advances after completing a service-lane task
- **THEN** the next eligible task MUST come from the view lane unless the queue explicitly records a blocker for that lane

#### Scenario: Task scope is too broad
- **WHEN** a proposed task would move multiple independent ownership slices in the same round
- **THEN** the task definition MUST be split into smaller single-slice tasks before promotion

### Requirement: Each thinning round SHALL preserve repository guardrails
Every execute-mode task in this program SHALL include repository verification, documentation synchronization, and graph freshness expectations. A task is not complete unless the moved ownership slice, touched docs, and required checks all succeed together.

#### Scenario: Source files changed in a round
- **WHEN** a task modifies `src/` files
- **THEN** the round MUST update the matching `docs/modules/**` documentation, refresh graphify artifacts when required, and finish with `npm run verify`

#### Scenario: A round adds files without reducing ownership ambiguity
- **WHEN** the result introduces additional files but leaves ownership ambiguous or duplicates runtime truth
- **THEN** the acceptance gate MUST fail the task and return it for revision
