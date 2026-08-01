# Checkpoint 13B: Copy-Paste Prompt For OpenCode

```text
在 /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/.worktrees/codex-sdk-capability 继续 Codex SDK 能力产品化接入，执行 Checkpoint 13B：Codex per-conversation additionalDirectories override。

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
- docs/status/checkpoint-12b-codex-persisted-conversation-resume-audit.md
- docs/status/checkpoint-13b-codex-session-additional-directories-execution-pack.md

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

当前已知真相：
- Codex ordinary chat path 已 pass。
- Codex ordinary session settings modal 已 pass 的会话级 override 只有：
  - sandbox
  - reasoning effort
  - model override
- Global settings surface 上的 additionalDirectories 已 pass，但只是全局 settings 面，不是 per-conversation seam。
- CodexAdapter 已支持 updateAdditionalDirectories()，且会把 additionalDirectories 传到 ThreadOptions.additionalDirectories。
- 官方 SDK surface 真实支持这个字段，但当前普通 session modal 还没暴露它。

本批目标：
- 只给 Codex conversation session settings modal 增加一个 per-conversation additionalDirectories override。
- 这必须是 Codex-only ordinary chat/settings stable surface，不是 diagnostic-only。
- 必须保持 truth honesty：
  - 这是 next-thread boundary，不是当前 live thread 原地重配
  - 这是 per-conversation override，不是全局 settings 写回
  - 不顺手把 networkAccessEnabled 一起做掉

明确不在范围内：
- 不做 networkAccessEnabled per-conversation override
- 不做 app-server migration
- 不做 approvalPolicy UI
- 不做 session browser / history seam
- 不做 webSearchMode
- 不做 model catalog
- 不做 Codex MCP settings / management
- 不做 live thread in-place mutation claim

推荐实现方向：
- 在 ConversationSessionSettings 里增加 Codex 的 session-scoped additionalDirectories 字段
- 在 ConversationSessionSettingsModal 的现有 Codex section 里加 multiline control
- 文案必须明确 absolute path / newline-separated / next-thread boundary
- coordinator 要能 resolve / save / apply 这个 override
- OpenCodianView host 要把会话级 effective 值推到 CodexAdapter.updateAdditionalDirectories()
- 尽量复用现有模式，不要为这批引入大抽象

实现要求：
- 有代码改动先补/改测试，再实现。
- 先在这些测试里加 focused failing tests：
  - tests/unit/core/types/chat.test.ts
  - tests/unit/features/chat/ConversationSessionSettingsCoordinator.codex.test.ts
  - tests/unit/features/chat/ConversationSessionSettingsModal.codex.test.ts
- 如果 modal 需要 textarea 样式，只加最小 CSS。
- docs/status 只做这批需要的最小 truth-sync。

验证要求：
- 先跑 targeted tests
- 再跑 npm run verify
- 因为这是用户可见的 session settings 变化，跑 npm run build
- 部署到 /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/
- 核对最新 BUILD_ID
- reload 后做 Obsidian 运行时验证

运行时证据必须至少覆盖：
1. active backend = codex
2. 新建一个 fresh Codex conversation
3. 在 first send 之前打开 session settings modal
4. 设置 conversation-scoped additionalDirectories 指向 vault 外的 probe 目录
5. 发送 prompt，让 Codex 读取该目录中的 probe file，并只返回唯一 token
6. 返回 token 精确匹配
7. 明确说明这个 proof 是“会话启动第一条 thread 时生效”或“next-thread boundary 生效”
8. console/errors、hydration 无新回归

推荐 runtime proof 方式：
- 用 vault 外的临时目录和一个唯一 token 文件做 deterministic probe
- 不要只用 adapter eval 或 options readback 充当 pass
- 如果能补一个不带 override 的 negative control 更好；如果做不到，也不要硬编 negative 结论

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
  - 哪些不应被这批顺手提升

预期诚实结果示例：
- Codex per-conversation additionalDirectories（ordinary session settings modal）：已 pass
- global settings additionalDirectories：仍已 pass，但不要和 per-conversation pass 混写
- networkAccessEnabled per-conversation：仍未接入
- live-thread in-place mutation：不要写成 pass
- app-server rich history / approvals：仍未接入
```
