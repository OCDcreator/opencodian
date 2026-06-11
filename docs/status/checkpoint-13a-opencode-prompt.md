# Checkpoint 13A: Copy-Paste Prompt For OpenCode

```text
在 /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/.worktrees/codex-sdk-capability 继续 Codex SDK 能力产品化接入，执行 Checkpoint 13A：Codex settings-side backend session browser launcher。

硬性约束：
- 只在这个 worktree 工作，不要碰主工作区。
- 固定使用 providerID="Kimi-for-coding"、modelID="k2p6"。
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
- docs/status/checkpoint-12a-codex-backend-session-browser-audit.md
- docs/status/checkpoint-12c-codex-provisional-warning.md
- docs/status/checkpoint-13a-codex-settings-session-browser-launcher-execution-pack.md

重点代码先看：
- src/features/settings/SettingsClaudeCodeSection.ts
- src/features/settings/SettingsCodexSection.ts
- src/features/chat/ui/BackendSessionBrowserModal.ts
- tests/unit/features/settings/SettingsClaudeCodeSection.test.ts
- tests/unit/features/settings/SettingsCodexSection.test.ts

当前已知真相：
- Codex chat-side history dropdown 的 session browser entry 已 pass。
- Codex settings-side launcher 仍未接入。
- BackendSessionBrowserModal 已支持 forcedBackendKind。
- Codex browser 真实边界仍然很窄：
  - 只对 live adapter memory 有意义
  - persisted discovery / transcript preview 仍未接入
  - settings 这批不能偷换成“可恢复任意 Codex 会话”
- Claude Code settings 已有稳定 launcher 模式，可作为现成产品面参考。

本批目标：
- 只给 Codex settings surface 增加一个 browse-only backend session browser launcher。
- 行为要尽量复用 Claude Code settings 现有模式：
  - launcher row
  - browse-only explanatory notice
  - forcedBackendKind: 'codex'
  - supportsResume: false
- 必须保持 truth honesty：
  - 只新增 settings-side browse entry
  - 不新增 persisted discovery claim
  - 不新增 transcript preview claim
  - 不新增 settings-side resume claim

明确不在范围内：
- 不做 app-server migration
- 不做 approvalPolicy UI
- 不做 Codex browser deeper metadata/transcript work
- 不做 settings-side resume
- 不改 chat-side session browser flow
- 不扩到 image input、warning dismiss、model catalog 或其他 Codex seam

实现要求：
- 有代码改动先补/改测试，再实现。
- 优先在 SettingsCodexSection.test.ts 增加 focused failing tests。
- 改动尽量小，不要为了复用过度重构。
- docs/status 只做这批需要的最小 truth-sync。

验证要求：
- 先跑 targeted tests
- 再跑 npm run verify
- 因为这是用户可见的 settings 变化，跑 npm run build
- 部署到 /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/
- 核对最新 BUILD_ID
- reload 后做 Obsidian 运行时验证
- fresh runtime evidence 至少要包含：
  1. active backend = codex
  2. settings 中能看到 launcher row
  3. 点击后能打开 Codex-scoped browser modal
  4. footer / modal 状态证明 settings-side 是 browse-only（无 resume）
  5. console/errors、hydration 无新回归

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
- Codex settings-side session browser launcher（browse-only）：已 pass
- persisted discovery / transcript preview：仍未接入或 readback，取决于原状态，不因 launcher 提升
- settings-side resume：仍未接入
- app-server rich history / approvals：仍未接入
```
