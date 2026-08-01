# Checkpoint 6A: Codex `mcp_tool_call` Transcript Runtime Proof

## 1. Files Changed

No repo source files changed.

Runtime artifact captured:
- `/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/.worktrees/codex-sdk-capability/.obsidian-debug/checkpoint-6a-mcp-tool-call-runtime.png`

## 2. Capability Diagnosed

- Ordinary Codex chat transcript visibility for real `mcp_tool_call` items

## 3. Strongest Evidence

### Setup
- Active backend in Test Vault: `codex`
- Enabled backends included `codex`
- Prompt used in a fresh conversation:
  - `Use the node_repl MCP tool to evaluate: Math.sqrt(1764)`
- User Codex config already contained a single explicit MCP server:
  - `mcp_servers.node_repl`

### Runtime proof
- The ordinary chat transcript rendered:
  - one visible `command_execution` tool block
  - one separate visible `js Evaluate square root` tool block
  - final visible assistant text: ``Math.sqrt(1764) evaluates to 42.``
- `document.body.innerText` probes returned:
  - `hasEvaluateSquareRoot: true`
  - `has42: true`
  - `hasNodeRepl: true`
- `obsidian dev:errors` returned `No errors captured.`

### Why this is `mcp_tool_call`, not a built-in tool
- In the current Codex normalizer, built-in shell work is always labeled `command_execution`.
- The only Codex path that can produce an arbitrary tool label like `js` is `onMcpToolCall()`:
  - `item.started(mcp_tool_call)` → `tool_use` with `kind: 'mcp'`
  - `name: item.tool`
- Captured console evidence showed a rendered stream event with:
  - `toolName":"js"`
  - `contentBlocks.types:["text","tool_use","text","tool_use","text"]`
- Given the explicit `node_repl` MCP server in `~/.codex/config.toml`, the explicit user prompt asking for the `node_repl MCP tool`, and the non-built-in `js` tool label, this is strong runtime evidence of a real Codex `mcp_tool_call` ordinary-chat render path.

## 4. Remaining Gaps

- This does **not** prove full MCP productization for Codex
- This does **not** prove Codex-as-MCP-server (`codex` / `codex-reply`) integration
- This does **not** prove dedicated MCP settings UI, MCP server management UI, or MCP-specific capability chrome
- The visible tool block label was `js Evaluate square root`; server metadata such as `node_repl` was not separately proven as visible inside the tool block chrome itself

## 5. Current Blockers

- `AgentCapability.Mcp` is still not declared on `CodexAdapter`
- No reviewed stable settings surface exists for Codex MCP configuration inside OpenCodian
- Current OpenCode MCP workflow tools remain unreliable, so this checkpoint relied on OpenCode CLI fallback for the audit guidance and Codex/Obsidian runtime for proof

## 6. Honest Verdict

- The **ordinary transcript-visible `mcp_tool_call` path is now runtime proven** for Codex
- The broader **Codex MCP capability** should still remain **not fully productized**
- The honest split is:
  - `mcp_tool_call` transcript seam: **已 pass**
  - full MCP capability / MCP server mode / MCP settings surface: **未接入** or otherwise unproven

## 7. Next Smallest Recommendation

- Stop for review.
- If approved, the next smallest seam should be chosen explicitly:
  - either a narrow capability declaration / product-surface follow-up for Codex MCP
  - or a different near-product seam that is more valuable than broadening MCP controls right now
