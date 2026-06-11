# Checkpoint 8B: Codex Model Surface Audit

## 1. Scope

This was a read-only truth audit only.

No source code changed.
No tests were modified.
No build/deploy/runtime cycle was run in this round.

Goal:

- determine whether "Codex model surface" is the next-best implementation checkpoint
- separate already-productized model entry points from missing product surfaces
- avoid inventing a fake catalog/model-picker product that the official Codex surface does not clearly support

## 2. Official Codex Surface Relevant to Models

Current official Codex documentation points to a configuration-first model story:

- Codex supports explicit model selection through config and CLI flags
  - `model` in `config.toml`
  - `--model` / `-m` on the CLI
- Codex also supports `model_reasoning_effort`
- If you do **not** pin a model, Codex may choose a model/setup automatically for the task
- The docs emphasize defaults, config precedence, profiles, and explicit `--model`, not a stable universal "remote model catalog picker" contract

Implication for OpenCodian:

- a freeform model string surface is well aligned with official Codex
- a strong "shared remote model catalog / picker" product claim is much weaker unless independently proven in Codex

## 3. Current Product Surfaces Already Present

### 3.1 Ordinary settings surface

`SettingsCodexSection` already exposes a stable ordinary settings surface:

- `apiKey`
- `model`
- authentication info

Files:

- `src/features/settings/SettingsCodexSection.ts`
- `tests/unit/features/settings/SettingsCodexSection.test.ts`
- `docs/modules/features/settings/SettingsCodexSection.md`

Current truth:

- this surface already exists
- the contracted stable part is already accepted as `已 pass`
- broader Codex ThreadOptions are intentionally not shown here

### 3.2 Session / thread entry surface

Codex already has a per-conversation model override in session settings modal:

- `codexModelOverride`

Files:

- `src/features/chat/services/ConversationSessionSettingsCoordinator.ts`
- `src/features/chat/ui/ConversationSessionSettingsModal.ts`
- `tests/unit/features/chat/ConversationSessionSettingsModal.codex.test.ts`
- `tests/unit/features/chat/ConversationSessionSettingsCoordinator.codex.test.ts`

Current truth:

- this surface already exists
- it belongs to the conversation/session entry path, not the shared toolbar model picker
- it is already part of the accepted Codex session-modal seams

## 4. What Is Actually Missing

The only obvious missing "model surface" is the shared chat toolbar model selector.

That path is explicitly capability-gated:

- `OpenCodianView` only mounts it when `hasCapability(this.caps, AgentCapability.Models)` is true
- `CodexAdapter` explicitly does **not** declare `AgentCapability.Models`
- `CodexAdapter.test.ts` asserts that `Models` remains false

Relevant files:

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/ChatSelectionControlsCoordinator.ts`
- `src/core/agents/backend/CodexAdapter.ts`
- `tests/unit/core/agents/backend/CodexAdapter.test.ts`

This means Codex is not "one small bug away" from the shared model selector.
It is intentionally outside that product surface right now.

## 5. Why 8B Is Weak As A Coding Batch

If Checkpoint 8B were opened as an implementation batch, it would need to choose one of two paths:

### Path A: expose Codex in the shared model selector

Risk:

- implies a stronger "model catalog / picker" product meaning than current official Codex docs clearly guarantee
- would likely require declaring `AgentCapability.Models`
- that would be a product decision, not a narrow truthy seam
- likely needs new runtime proof for:
  - selector visibility
  - writeback
  - session/thread behavior
  - fallback when no catalog exists

### Path B: refine existing settings/session model surfaces

Risk:

- low product value
- mostly copy/truth convergence
- duplicates model surfaces that already exist instead of unlocking a new seam

Conclusion:

- 8B is not the strongest next implementation batch
- it is better treated as an audit conclusion than as the next OpenCode coding round

## 6. Better Next Candidate

The stronger next checkpoint remains:

- `8C`: Codex MCP transcript seam truth productization

Why it is better:

- official Codex surface clearly includes MCP-related concepts
- OpenCodian already has real runtime proof for ordinary transcript-visible `mcp_tool_call`
- the gap is now product truth placement, not speculative UI invention
- it can stay narrow:
  - no MCP settings authoring
  - no Codex-as-MCP-server integration
  - no broad MCP management UI

## 7. Honest Verdict

Checkpoint 8B should **not** be the next coding batch.

Accepted audit result:

- Codex already has two real model entry surfaces:
  - ordinary settings `apiKey + model`
  - session modal `codexModelOverride`
- the missing shared model selector path is intentionally capability-gated off
- implementing it now would be a larger product decision, not the smallest truthful seam

## 8. Recommended Next Step

Do not open 8B as implementation.

If the next checkpoint is approved, prefer:

- `8C`: Codex MCP transcript seam truth productization

Keep 8B as a recorded audit conclusion unless future evidence shows a stable official Codex model-picker surface worth productizing.
