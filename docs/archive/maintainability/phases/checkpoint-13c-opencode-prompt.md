# Checkpoint 13C: Copy-Paste Prompt For OpenCode

```text
在 /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/.worktrees/codex-sdk-capability 继续 Codex SDK 能力产品化接入，执行 Checkpoint 13C：Codex per-conversation networkAccessEnabled override。

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
- docs/status/checkpoint-13b-codex-session-additional-directories.md
- docs/status/checkpoint-13c-codex-session-network-access-execution-pack.md

重点代码先看：
- src/core/types/chat.ts
- src/features/chat/services/ConversationSessionSettingsCoordinator.ts
- src/features/chat/ui/ConversationSessionSettingsModal.ts
- src/features/chat/OpenCodianView.ts
- src/features/settings/SettingsCodexSection.ts
- src/core/agents/backend/CodexAdapter.ts
- tests/unit/core/types/chat.test.ts
- tests/unit/features/chat/ConversationSessionSettingsCoordinator.codex.test.ts
- tests/unit/features/chat/ConversationSessionSettingsModal.codex.test.ts
- node_modules/@openai/codex-sdk/dist/index.d.ts

当前已知真相：
- Codex ordinary chat path 已 pass。
- Codex ordinary session settings modal 已 pass 的会话级 override 有：sandbox、reasoning effort、model override、additionalDirectories。
- Global settings surface 上的 networkAccessEnabled 已 pass，但只是全局 settings 面，不是 per-conversation seam。
- CodexAdapter 已支持 updateNetworkAccessEnabled()，且会把 networkAccessEnabled 传到 ThreadOptions.networkAccessEnabled。
- 官方 SDK surface 真实支持这个字段；官方手册也明确 agent internet access 默认关闭，可按环境启用。
- 但当前普通 session modal 还没暴露它。

本批目标：
- 只给 Codex conversation session settings modal 增加一个 per-conversation networkAccessEnabled override。
- 这必须是 Codex-only ordinary chat/settings stable surface，不是 diagnostic-only。
- 必须保持 truth honesty：
  - 这是 next-thread boundary，不是当前 live thread 原地重配
  - 这是 per-conversation override，不是全局 settings 写回
  - 需要真正区分 enabled 和 disabled 的 runtime 行为，不能只做 adapter writeback 就写 pass

明确不在范围内：
- 不做 webSearchMode
- 不做 app-server migration
- 不做 approvalPolicy UI
- 不做 session browser / history seam
- 不做 model catalog
- 不做 Codex MCP settings / management
- 不做 broader sandbox policy editor
- 不做 live thread in-place mutation claim

推荐实现方向：
- 在 ConversationSessionSettings 里增加 Codex 的 session-scoped networkAccessEnabled 字段，建议是 `boolean | null`
- 在 ConversationSessionSettingsModal 的现有 Codex section 里加一个三态控件：
  - Inherit
  - Enabled
  - Disabled
- 不要用普通 toggle，因为这批必须诚实表达继承语义
- coordinator 要能 resolve / save / apply 这个 override，并在无 override 时继承全局 `backendSettings.codex.networkAccessEnabled`
- OpenCodianView host 要把会话级 effective 值推到 CodexAdapter.updateNetworkAccessEnabled()
- 文案必须明确：
  - 仅在 effective sandbox = workspace-write 时有意义
  - next-thread boundary

实现要求：
- 有代码改动先补/改测试，再实现。
- 先在这些测试里加 focused failing tests：
  - tests/unit/core/types/chat.test.ts
  - tests/unit/features/chat/ConversationSessionSettingsCoordinator.codex.test.ts
  - tests/unit/features/chat/ConversationSessionSettingsModal.codex.test.ts
- docs/status 只做这批需要的最小 truth-sync。

验证要求：
- 至少跑：
  - targeted tests
  - 裸 `npm run verify`
  - `npm run check:module-docs`
  - 如需要，再跑 `OWNER_GUARD_APPROVED='...' npm run verify`
  - `npm run build`
- 结果必须分开诚实汇报，不要把 approval-assisted verify 混写成裸 verify
- 因为这是用户可见的 session settings 变化，build 后部署到 /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/
- 核对最新 BUILD_ID
- reload 后做 Obsidian 运行时验证

运行时证据要求比 13B 更严格：

要想把 13C 写成 `已 pass`，必须有 enabled/disabled 的**可见分歧**。

最小可接受证明：
1. 两个 fresh Codex conversations
2. effective sandbox 都是 `workspace-write`
3. 一个会话 network access enabled
4. 一个会话 network access disabled
5. 对同一类 trusted public GET 任务做对照
6. enabled case 成功返回确定性结果
7. disabled case 出现真实失败 / blocked / refusal，并且这个差异在普通 chat 运行时证据里可见

推荐 runtime proof 方式：
- 使用小而稳定的公开 GET-only 目标，例如 `https://example.com`
- enabled case：让 Codex 取回页面并只返回一个确定性结果（如标题或状态）
- disabled case：同样任务，但应出现真实失败/阻止
- 如果做不到这个分歧，不要写 pass，改写成 readback/partial 并诚实解释原因

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
  - 这批新增 pass 的是什么
  - 哪些仍是 readback
  - 哪些仍未接入
  - 如果 enabled/disabled 没有真实分歧，就不要把 13C 写成 pass

预期诚实结果示例：
- Codex per-conversation networkAccessEnabled（ordinary session settings modal）：只有在 enabled/disabled runtime 分歧真实成立时才能写已 pass
- global settings networkAccessEnabled：仍已 pass，但不要和 per-conversation pass 混写
- webSearchMode：仍 readback
- live-thread in-place mutation：不要写成 pass
- app-server rich history / approvals：仍未接入
```
