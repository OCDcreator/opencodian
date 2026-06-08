# Claude Code Capability Productization Specification

## ADDED Requirements

### Requirement: Capability exposure must be evidence-gated

OpenCodian MUST classify every Claude Code capability surface as stable, diagnostic, or hidden/gated based on current proof.

#### Scenario: Unproven Claude capability appears in settings

- **GIVEN** a Claude SDK option is wired but lacks ordinary user-path runtime proof
- **WHEN** the settings or Capability Lab UI renders it
- **THEN** the surface is labelled diagnostic or untested
- **AND** the UI does not describe it as stable, complete, or fully supported

#### Scenario: Capability receives ordinary user-path proof

- **GIVEN** a Claude capability has focused tests, runtime proof, and review-gate approval
- **WHEN** the capability is promoted from diagnostic to stable
- **THEN** the status docs, module docs, devlog, and runtime artifact paths are updated in the same slice

### Requirement: Resume and checkpoint controls must not be conflated

OpenCodian MUST keep ordinary Claude SDK session resume separate from checkpoint `resume-at` or rewind-style controls.

#### Scenario: Ordinary Claude conversation resumes after reload

- **GIVEN** a persisted Claude SDK session id is restored
- **WHEN** ordinary chat sends a follow-up message
- **THEN** the SDK catalog identity is validated before query start
- **AND** a different returned SDK session id fails closed rather than rebinding silently

#### Scenario: Checkpoint resume-at remains unproven

- **GIVEN** a checkpoint or resume-at control lacks fresh end-to-end proof
- **WHEN** the user views stable chat controls
- **THEN** the control is hidden, gated, or labelled diagnostic
- **AND** OpenCode-only rewind/revert/diff controls remain backend-gated

### Requirement: Unattended implementation must be review-gated

The Claude Code capability productization queue MUST run through opencode-loop execute mode with verification and review gates.

#### Scenario: A queue task changes source behavior

- **GIVEN** a queue task modifies `src/`
- **WHEN** the task completes
- **THEN** focused tests pass
- **AND** `npm run graphify:update:src` has refreshed the graph
- **AND** `npm run check:graphify`, `npm run check:module-docs`, `npm run check:devlog-order`, and `git diff --check` pass

#### Scenario: A queue task changes deploy-relevant runtime files

- **GIVEN** a task changes deploy-relevant runtime files
- **WHEN** the task completes
- **THEN** `npm run build` passes
- **AND** Test Vault deployment is refreshed
- **AND** `BUILD_ID` freshness and runtime proof artifacts are recorded

### Requirement: Full capability completion claims must be blocked

OpenCodian MUST NOT claim Claude Code full capability completion while any gap-ledger item lacks stable end-to-end proof or documented external-blocker evidence.

#### Scenario: Some ledger items remain diagnostic

- **GIVEN** one or more ledger items remain diagnostic, hidden, gated, or externally blocked
- **WHEN** docs, UI, or devlog text is updated
- **THEN** the text avoids full-capability completion claims
- **AND** the remaining limitations are stated with evidence.
