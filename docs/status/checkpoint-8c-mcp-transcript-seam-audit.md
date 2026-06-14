# Checkpoint 8C: Codex MCP Transcript Seam Audit

## 1. Scope

This was a read-only truth audit only.

No source code changed.
No tests were modified.
No build/deploy/runtime cycle was run in this round.

Goal:

- determine whether the next smallest Codex checkpoint should be MCP-related
- separate the already-proven transcript seam from broader MCP product claims
- avoid accidentally promoting "visible MCP tool block" into "full MCP capability"

## 2. Official Codex Surface Relevant to MCP

Current official Codex documentation clearly includes MCP-related surface area:

- Codex can run with MCP servers configured in `config.toml`
- Codex can serve as an MCP server itself via `codex mcp-server`
- the documented server-mode/tool surface includes:
  - `codex`
  - `codex-reply`
- documented MCP-server parameters include:
  - `prompt`
  - `approval-policy`
  - `cwd`
  - `include-plan-tool`
  - `model`
  - `profile`
  - `sandbox`

Implication for OpenCodian:

- MCP is definitely a real official Codex surface area
- but "Codex supports MCP somewhere" is still broader than "OpenCodian has a stable Codex MCP product surface"

## 3. What Is Already Proven

Checkpoint 6A already proved the narrowest valuable seam:

- ordinary Codex chat can visibly render a real `mcp_tool_call`

Reviewed artifact:

- `docs/status/checkpoint-6a-mcp-tool-call-runtime-audit.md`

Runtime proof from that checkpoint:

- prompt:
  - `Use the node_repl MCP tool to evaluate: Math.sqrt(1764)`
- visible transcript rendered:
  - one `command_execution` block
  - one separate `js Evaluate square root` tool block
  - final answer `42`

Current normalizer mapping:

- `item.started(mcp_tool_call)` → `tool_use`
  - `kind: 'mcp'`
  - `name: item.tool`
  - `toolMetadata.server: item.server`
- `item.completed(mcp_tool_call)` → `tool_result`

Files:

- `src/core/agents/backend/CodexStreamNormalizer.ts`
- `tests/unit/core/agents/backend/CodexStreamNormalizer.test.ts`

## 4. What Is Not Yet Productized

The proven transcript seam does **not** yet imply any of the following:

- `AgentCapability.Mcp`
- Codex MCP management UI
- Codex MCP server list / status / connect / disconnect / auth flows
- Codex settings entry comparable to OpenCode `SettingsMcpSection`
- Codex-as-MCP-server integration (`codex mcp-server`)

That boundary is important because `AgentCapability.Mcp` in this codebase is not just "tool blocks can appear".

`AgentMcpCapability` currently implies a management surface:

- `getMcpServerSnapshot()`
- `getMcpStatus()`
- `addMcpServer(...)`
- `connectMcpServer(...)`
- `disconnectMcpServer(...)`
- `refreshMcpServerStatus()`
- `removeMcpAuth(...)`
- `authenticateMcp(...)`
- `subscribeToCatalogUpdates(...)`

This is much stronger than the currently proven Codex seam.

## 5. Why 8C Is Better Than 8B

Compared with the rejected 8B model-surface implementation idea, 8C is better because:

- it builds on an already-proven real runtime seam
- it does not require inventing a speculative picker/catalog product
- it can stay honest by productizing only transcript/capability-status truth
- it can avoid broad MCP authoring or management UI scope

## 6. Smallest Safe 8C Boundary

If 8C is approved, the safest smallest checkpoint should be:

### In scope

- truth-sync the Codex MCP seam into the reviewed status/docs surface
- decide whether Codex needs a narrow MCP-related product label beyond transcript visibility
- if any capability/UI code changes are made, keep them minimal and evidence-backed
- latest-build Obsidian runtime repro for the transcript seam

### Out of scope

- no `SettingsMcpSection` for Codex
- no MCP server add/edit/delete/auth UI for Codex
- no Codex-as-MCP-server implementation
- no `AgentCapability.Mcp` declaration unless the implementation actually satisfies the stronger management contract

## 7. Most Likely Accepted Outcome

The most likely honest result of 8C is **not** "Codex MCP is fully productized".

The most likely accepted outcome is one of:

1. transcript seam remains `已 pass`, broader MCP remains `未接入`
2. docs/status/capability wording becomes clearer, without changing adapter capabilities
3. a very narrow read-only/discovery truth surface is accepted, while full MCP management remains out of scope

## 8. Honest Verdict

Checkpoint 8C is a stronger next candidate than 8A or 8B.

Reason:

- 8A is mostly truth/copy convergence
- 8B would push toward a model-picker/catalog product meaning that official Codex surface does not clearly guarantee
- 8C extends an already-proven real Codex runtime seam with the smallest product-truth follow-up

## 9. Recommended Next Step

If the next checkpoint is approved, prefer:

- `8C`: Codex MCP transcript seam truth productization

Recommended acceptance bar:

- latest-build runtime proof of visible Codex `mcp_tool_call`
- no overclaim beyond what the implementation actually supports
- no broad MCP settings/management scope creep
