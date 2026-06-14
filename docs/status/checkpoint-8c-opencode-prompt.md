# Checkpoint 8C: Copy-Paste Prompt For OpenCode

```text
在 /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/.worktrees/codex-sdk-capability 继续 Codex SDK 能力产品化接入，执行 Checkpoint 8C：Codex MCP transcript seam truth productization。

硬性约束：
- 只在这个 worktree 工作，不要碰主工作区。
- 固定使用 providerID="Kimi-for-coding"、modelID="k2p6"。
- 先跑 opencode_setup 健康检查。
- 这是一批最小 checkpoint，不要扩 scope。
- Codex 只会在你返回后审查 diff 和运行时证据。
- 任何 claim 都必须有对应代码、测试、build、部署、Obsidian 运行时证据。
- 不要把 hidden / readback / diagnostic-only / supporting evidence 写成 pass。
- 不要把 visible transcript mcp_tool_call seam 偷换成 full MCP capability。

先读这些文档：
- docs/status/checkpoint-6a-mcp-tool-call-runtime-audit.md
- docs/status/checkpoint-8c-mcp-transcript-seam-audit.md
- docs/status/checkpoint-8c-opencode-execution-pack.md
- docs/status/codex-sdk-current-state-2026-06-09.md
- /Volumes/SDD2T/obsidian-vault-write/testvault/Opencodian的chat面板-结构梳理.md

当前已知真相：
- Codex ordinary chat 中真实 mcp_tool_call transcript seam 已 pass。
- 当前 normalizer 已将 item.started(mcp_tool_call) 映射为 tool_use(kind='mcp', toolMetadata.server=...)。
- broader MCP capability 仍未产品化：
  - CodexAdapter 仍未声明 AgentCapability.Mcp
  - 没有 Codex MCP settings / management UI
  - 没有 codex mcp-server / codex-reply integration
- AgentCapability.Mcp 在本项目里代表更强的 MCP server management contract，不等于“工具块可见”。

本批目标：
- 只围绕已经被 runtime 证明的 ordinary transcript-visible mcp_tool_call seam，做最小的 truth / status / product-surface 落位。
- 明确区分：
  - transcript seam 已 pass
  - broader MCP capability 仍未接入
  - codex mcp-server integration 仍未接入
- 如果需要代码改动，必须非常窄，优先 docs/status/capability truth-sync；不要为了“看起来更完整”而引入 broad MCP UI 或 capability contract。

明确不在范围内：
- 不做 SettingsMcpSection for Codex
- 不做 MCP server add/edit/delete/auth UI for Codex
- 不做 codex mcp-server / codex-reply integration
- 不声明 AgentCapability.Mcp，除非你真的补齐了 AgentMcpCapability 的更强 contract（正常预期是不声明）
- 不扩到 model surface、settings convergence、structured output 或 image input

建议先做的判断：
1. 当前最小正确结果是否只是 docs/status/truth-sync，不需要 capability code changes。
2. 如果需要代码 changes，是否只应补 narrow discovery/status/readback product wording，而不是 MCP capability declaration。
3. 如果发现某处状态文档或 UI 文案仍把 transcript-visible mcp_tool_call 写成 broader MCP pass，要修正它。

实现要求：
- 有代码改动先补/改测试，再实现。
- 完成后跑 npm run verify。
- 如果有任何用户可见或 runtime 变化，跑 npm run build，并部署到 /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/
- 核对最新 BUILD_ID。
- reload 后做 Obsidian 运行时验证。
- 用真实 Codex ordinary chat 再证明一次 mcp_tool_call seam，而不是只复用旧证据。

运行时验证要求：
- active backend = codex
- 使用真实 ordinary chat prompt，例如：
  Use the node_repl MCP tool to evaluate: Math.sqrt(1764)
- 证明 ordinary transcript 中仍然可见 mcp tool block
- 检查 console/errors、hydration、session continuity
- 截图保存到 .obsidian-debug/
- latest BUILD_ID 必须和 loaded runtime 对得上

输出格式必须包含：
- 改了哪些文件
- 产品化/诊断了哪些能力
- 仍剩哪些缺口
- 当前阻塞点
- 下一批最小建议
- verify/build/deploy 结果
- BUILD_ID
- Obsidian runtime 证据（含截图路径）
- 明确写出：
  - 哪些是 已 pass
  - 哪些仍是 readback
  - 哪些仍未接入
  - 哪些是 blocked

预期的诚实结果示例：
- ordinary transcript-visible mcp_tool_call seam：已 pass
- broader Codex MCP capability / MCP settings surface / codex mcp-server integration：仍未接入
- 如有新增，只能是最小的 product-truth 落位，不能夸张成 full MCP support
```
