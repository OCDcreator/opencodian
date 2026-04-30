# Spec: Remaining Thick Owner Batch

## Requirements

### Requirement: Dedicated execute worktree

The remaining thick-owner batch MUST run in a dedicated worktree with new queue state.

#### Scenario: stale history exists elsewhere
- **WHEN** a previous `.opencode-loop` state exists in another worktree
- **THEN** it is archived as history
- **AND** the new batch does not resume it implicitly

### Requirement: owner-first queue tasks

Every execute task MUST name one primary owner and one narrow behavior slice.

#### Scenario: a code task starts
- **WHEN** the queue promotes a code-bearing task
- **THEN** that task names one primary owner
- **AND** its scope points to one cohesive boundary move
- **AND** it does not permit broad opportunistic refactors

### Requirement: blocking Codex review gate

Every code-bearing task MUST pass a blocking Codex review gate before completion.

#### Scenario: a code iteration finishes
- **WHEN** verification and acceptance checks have run
- **THEN** the gate-review hook runs Codex against the diff
- **AND** the queue does not mark the task complete unless the gate returns pass

### Requirement: checkpointed batch completion

The batch MUST continue beyond one small split and stop only at a justified checkpoint, blocker, or full queue completion.

#### Scenario: the `main.ts` and `OpenCodeService.ts` slices finish
- **WHEN** the queued code tasks complete
- **THEN** the queue records a checkpoint with last commit and next focus
- **AND** it explicitly states whether `OpenCodianView.ts` is ready for the next unattended batch
