## ADDED Requirements

### Requirement: OpenCodianView thinning SHALL continue through source-level ownership slices
The unattended queue SHALL continue reducing `src/features/chat/OpenCodianView.ts` ownership through source-level changes. It MUST NOT complete with analysis-only, checkpoint-only, or documentation-only output unless a blocking test, review, or runtime failure is recorded with evidence.

#### Scenario: A safe adjacent owner exists
- **WHEN** a behavior slice in `OpenCodianView.ts` already belongs to an adjacent chat service, runtime, renderer, or UI owner
- **THEN** the queue MUST move that complete behavior slice into the adjacent owner and leave `OpenCodianView.ts` as a narrower composition shell

#### Scenario: No safe adjacent owner exists
- **WHEN** no existing owner can hold the selected behavior slice without becoming incoherent
- **THEN** the queue MAY create one durable owner only if it owns a complete responsibility and is covered by matching tests and module docs

### Requirement: The queue SHALL avoid thin-helper fragmentation
Every extraction SHALL reduce ownership ambiguity, import/callback surface, duplicate state, or test responsibility spread. It MUST NOT create one-off helper, adapter, provider, bridge, or factory files merely to lower line count.

#### Scenario: Extraction moves complexity sideways
- **WHEN** the result leaves `OpenCodianView.ts` with the same conceptual burden while adding another file
- **THEN** the review gate MUST reject the task as fragmentation

#### Scenario: Existing owner can be extended
- **WHEN** a current owner such as `ConversationTabRuntimeCoordinator`, `ChildSessionGraphCoordinator`, `ActiveTabContextUsageCoordinator`, `ConversationRenderService`, `QuestionDockCoordinator`, `SessionTodoCoordinator`, or background-task runtime/service owners can absorb the behavior
- **THEN** the queue MUST prefer extending that owner over adding a new module

### Requirement: Each source task SHALL be review-gated and fully verified
Each source task SHALL include focused verification, module-doc synchronization, graphify freshness, and a blocking Codex review gate before the queue advances.

#### Scenario: Source files change
- **WHEN** a task modifies files under `src/`
- **THEN** it MUST update matching `docs/modules/**`, run `npm run graphify:update:src`, pass `npm run check:module-docs`, pass `npm run check:graphify`, and pass `npm run verify`

#### Scenario: Review gate reports a real blocker
- **WHEN** the blocking review gate returns a substantive concern
- **THEN** the queue MUST repair the implementation or task contract before continuing, rather than marking the task done

### Requirement: The long run SHALL remain durable and resumable
The execute run SHALL start from a dedicated worktree and SHALL be launched through a `tmux`-backed supervisor with a long stale window. Runtime state SHALL identify the current task, process liveness, and blocker category.

#### Scenario: Parent terminal disconnects
- **WHEN** the Codex Desktop session or parent shell disconnects
- **THEN** the `tmux` supervisor MUST keep the execute loop alive

#### Scenario: A status check is requested
- **WHEN** an operator asks where the run is
- **THEN** status MUST be answered from `opencode-loop status --json`, process liveness, and current logs rather than from `tmux` existence alone
