# Checkpoint 13D: Copy-Paste Prompt For OpenCode

```text
在 /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/.worktrees/codex-sdk-capability 继续 Codex SDK 能力产品化接入，执行 Checkpoint 13D：Codex `webSearchMode` truth resolution。

硬性约束：
- 只在这个 worktree 工作，不要碰主工作区。
- 固定使用 providerID="kimi-for-coding"、modelID="k2p6"。
- 先跑 opencode_setup 健康检查。
- 这是一批最小 checkpoint，不要扩 scope。
- Codex 只会在你返回后审查 diff 和运行时证据。
- 任何 claim 都必须有对应代码、测试、build、部署、Obsidian 运行时证据。
- 不要把 hidden / readback / diagnostic-only / supporting evidence 写成 pass。
- 严格遵守多后端产品规则：
  - 可以同时 enabled 多个 backend
  - 默认只连接/启动当前 active backend
  - settings 只显示当前 active backend 的后端设置项
  - 想设置另一个 backend，用户需要先切换 backend

先读这些文档：
- /Volumes/SDD2T/obsidian-vault-write/testvault/Opencodian的chat面板-结构梳理.md
- docs/status/codex-sdk-current-state-2026-06-09.md
- docs/status/checkpoint-10a-codex-runtime-settings-truth-split.md
- docs/status/checkpoint-10b-websearchmode-cached-vs-live-audit.md
- docs/status/checkpoint-10c-websearchmode-sdk-cli-semantics-audit.md
- docs/status/checkpoint-13d-codex-websearchmode-truth-execution-pack.md

重点代码先看：
- src/core/agents/backend/CodexAdapter.ts
- src/features/settings/SettingsCodexSection.ts
- src/features/chat/services/ConversationSessionSettingsCoordinator.ts
- src/features/chat/ui/ConversationSessionSettingsModal.ts
- node_modules/@openai/codex-sdk/dist/index.d.ts

当前已知真相：
- `webSearchMode` 官方 surface 存在，SDK wiring 真实存在。
- `disabled` suppression evidence 已有。
- `cached` vs `live` 的官方语义差异已确认真实存在。
- 但当前 ordinary chat surface 里，`cached` vs `live` 还没有被证明存在稳定、用户可理解的可见差异。
- 所以当前 truth bucket 仍是 `readback`。

本批目标：
- 先做 truth resolution，再决定要不要改代码。
- 你要回答的问题不是“加不加 UI”本身，而是：
  - `webSearchMode` 现在有没有任何**最小且诚实**的稳定产品面？
  - 如果有，只接那一小块。
  - 如果没有，就保持 `readback/hidden`，只更新 truth docs。

明确不在范围内：
- 不做 approvalPolicy UI
- 不做 app-server migration
- 不做 session browser work
- 不做 MCP management UI
- 不做未经证明的三态稳定 dropdown
- 不做 diagnostic-only 开关冒充 stable UI

推荐决策顺序：
1. 重查官方 docs + SDK types
2. 重查 current adapter wiring
3. 重新跑最相关的 runtime probes
4. 判断有没有稳定用户可见差异
5. 只有在证据支持时，才做最小产品代码变更

如果最后证据仍然说明：
- `disabled` 是用户可见的
- 但 `cached` vs `live` 仍然对 ordinary chat 不可见

那也不要硬加三态 UI。最多只允许一个真正诚实的最小面；如果连这个都站不住，就不要改代码。

验证要求：
- 如果改代码：
  - targeted tests
  - bare `npm run verify`
  - `npm run check:module-docs`
  - 如需要，再跑 `OWNER_GUARD_APPROVED='...' npm run verify`
  - `npm run build`
  - deploy + BUILD_ID
- 如果只做 audit/docs：
  - 不要为了凑流程无意义 build
  - 但要给出 fresh runtime evidence 路径

输出格式必须包含：
- 改了哪些文件
- 这批到底是诊断还是产品化，还是两者都有
- strongest evidence
- 仍剩哪些 gap
- 当前阻塞点
- 下一批最小建议
- 如果改了代码，再给 verify/build/deploy 结果
- 明确写出：
  - `webSearchMode` 最终 truth bucket 是什么
  - 为什么
  - 有没有任何 stable ordinary surface 被新增

预期诚实结果示例：
- `webSearchMode` 仍然 `readback`，因为 `cached/live` 对 ordinary chat 不可见，且没有更诚实的最小 surface
- 或者：仅新增一个极窄的 truthful surface（如果证据真支持），但绝不能把整个三态 seam 写成 pass
```
