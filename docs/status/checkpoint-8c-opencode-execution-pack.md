# Checkpoint 8C: OpenCode Execution Pack

## 1. Intent

This file is a repo-local execution pack for the next approved checkpoint:

- `8C`: Codex MCP transcript seam truth productization

It exists so the next round can resume from the worktree itself instead of
depending on prior chat context.

## 2. Non-Negotiable Constraints

- Work only in:
  - `/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/.worktrees/codex-sdk-capability`
- Do not touch the main workspace
- Use OpenCode with:
  - `providerID="Kimi-for-coding"`
  - `modelID="k2p6"`
- Run `opencode_setup` first
- Keep scope narrow
- Stop after this checkpoint

## 3. Truth Sources To Read First

- `docs/status/checkpoint-6a-mcp-tool-call-runtime-audit.md`
- `docs/status/checkpoint-8c-mcp-transcript-seam-audit.md`
- `docs/status/codex-sdk-current-state-2026-06-09.md`
- `/Volumes/SDD2T/obsidian-vault-write/testvault/Opencodian的chat面板-结构梳理.md`

## 4. Current Accepted Truth

### Already proven

- Codex ordinary chat can visibly render a real `mcp_tool_call`
- Current normalizer maps:
  - `item.started(mcp_tool_call)` → `tool_use`
  - `kind: 'mcp'`
  - `toolMetadata.server = item.server`

### Not yet proven / not yet productized

- `AgentCapability.Mcp`
- Codex MCP management/settings UI
- Codex-as-MCP-server integration (`codex mcp-server`, `codex-reply`)
- broader MCP capability contract in `AgentMcpCapability`

## 5. Checkpoint Goal

Do the smallest truthful follow-up around the already-proven transcript seam.

Target outcome:

- transcript-visible `mcp_tool_call` seam is more clearly and honestly placed in
  docs/status/product truth
- no broader MCP claim is made unless implementation and runtime proof actually
  justify it

## 6. In Scope

- narrow docs/status/truth-sync around the Codex MCP transcript seam
- minimal code/test changes only if needed to support a narrow, honest
  product-surface or capability-status placement
- fresh latest-build runtime repro of the transcript seam in Test Vault

## 7. Explicitly Out Of Scope

- no `SettingsMcpSection` for Codex
- no MCP add/edit/delete/auth UI for Codex
- no Codex MCP server management flows
- no `codex mcp-server` integration
- no `codex-reply` integration
- no broad capability declaration just to make the matrix look complete
- no spillover into model surface, settings convergence, structured output, or
  image input work

## 8. Capability Boundary To Respect

Do not silently equate:

- visible transcript `mcp_tool_call`

with:

- `AgentCapability.Mcp`

In this codebase, `AgentMcpCapability` implies a much stronger management
contract, including:

- server snapshot/status
- connect/disconnect
- auth flows
- refresh
- catalog subscriptions

Unless that stronger contract is truly implemented and proven, do not declare
`AgentCapability.Mcp`.

## 9. Preferred Implementation Shape

Preferred outcome order:

1. docs/status truth-sync only
2. very small capability/status wording or product-surface adjustments
3. only if strictly necessary, a tiny code/test change that still does not
   expand into full MCP capability

## 10. Verification Requirements

If code or user-visible behavior changes:

1. update/add focused tests first
2. run `npm run verify`
3. run `npm run build`
4. deploy:
   - `dist/main.js`
   - `dist/manifest.json`
   - `dist/styles.css`
   to:
   - `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`
5. verify latest `BUILD_ID`
6. reload plugin
7. run real Obsidian runtime proof

## 11. Runtime Proof Requirements

Active backend:

- `codex`

Suggested prompt:

- `Use the node_repl MCP tool to evaluate: Math.sqrt(1764)`

Need to prove:

- ordinary transcript still shows a visible MCP tool block
- latest loaded runtime `BUILD_ID` matches deployed build
- `dev:errors` is clean
- console/errors/hydration/session continuity are checked to the extent relevant
  to this seam

Save screenshot evidence under:

- `.obsidian-debug/`

## 12. Required Final Report Shape

- files changed
- what capability was productized or diagnosed
- remaining gaps
- current blockers
- next smallest suggestion
- verify/build/deploy result
- `BUILD_ID`
- Obsidian runtime evidence, including screenshot path
- explicit truth buckets:
  - `已 pass`
  - `readback`
  - `未接入`
  - `blocked`

## 13. Honest Result Examples

Acceptable:

- transcript seam remains `已 pass`
- broader MCP capability remains `未接入`
- docs/status become clearer

Not acceptable:

- "Codex MCP is fully supported"
- "AgentCapability.Mcp is pass" without implementing the stronger MCP contract
- adding broad MCP UI/settings just to make the surface look complete
