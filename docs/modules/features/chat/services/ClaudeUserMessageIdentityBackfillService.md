# `src/features/chat/services/ClaudeUserMessageIdentityBackfillService.ts`

## Responsibility

- Resolves Claude top-level user message UUIDs through the backend session service exposed by `ClaudeCodeAdapter.resolveClaudeUserMessageIdentities()`.
- Applies those UUIDs onto local chat user messages as `sourceMessageId`, skipping compaction dividers and leaving existing identities untouched.
- Persists the updated conversation through either:
  - an explicit instance host supplied by the caller, or
  - the module-level fallback persistence host registered by `MessageFinalizationHost`.

## Runtime Inputs

- `getAgentServiceRegistry()` from `src/core/agents/AgentCapability.ts` provides the module-level backend registry lookup.
- `ClaudeUserMessageIdentityBackfillHost` provides write-ticket serialization when the caller wants an explicit persistence owner.

## Integration Points

- `MessageFinalizationService.finalizeAfterStream()` calls the service through `MessageFinalizationHost.backfillClaudeUserMessageIdentities()` for fresh Claude sends.
- `ConversationLoadRecoveryCoordinator.loadConversation()` calls the service after hydration so reopened Claude conversations can recover missing fork identities.

## Maintainability Boundary

- Keep Claude history lookup and positional UUID-to-message alignment here instead of reimplementing it in `OpenCodianView`, load recovery, or finalization owners.
- If another owner needs the same behavior, reuse this service rather than threading fresh registry/write dependencies back through guarded shell files.
