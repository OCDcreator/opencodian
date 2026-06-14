# Checkpoint 13E: Copy-Paste Prompt For OpenCode

```text
在 /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/.worktrees/codex-sdk-capability 继续 Codex SDK 能力产品化接入，执行 Checkpoint 13E：Codex settings-side backend session browser resume（仅 in-memory sessions）。

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
- docs/status/checkpoint-12a-codex-backend-session-browser-audit.md
- docs/status/checkpoint-12b-codex-persisted-conversation-resume-audit.md
- docs/status/checkpoint-13a-codex-settings-session-browser-launcher.md
- docs/status/checkpoint-13e-codex-settings-resume-execution-pack.md

重点代码先看：
- src/features/chat/ui/BackendSessionBrowserModal.ts
- src/features/chat/OpenCodianView.ts
- src/features/settings/SettingsCodexSection.ts
- src/main.ts
- tests/unit/features/settings/SettingsCodexSection.test.ts

当前已知真相：
- settings-side Codex launcher 已 pass，但只是 browse-only
- chat-side backend session browser resume 对 Codex in-memory sessions 已 pass
- persisted discovery / transcript preview / external CLI thread enumeration 仍未接入

本批目标：
- 只把 settings-side Codex launcher 从 browse-only 提升到 **in-memory-only resume**
- 必须保持 truth honesty：
  - 仅对 live adapter memory 中可见的 sessions 成立
  - 不顺手把 persisted discovery 写成 pass
  - 不顺手把 preview transcript 写成 pass

明确不在范围内：
- 不做 persisted backend session discovery
- 不做 app-server migration
- 不做 transcript preview implementation
- 不做 approvalPolicy UI
- 不做 broader session browser refactor

实现方向建议：
- 优先复用 chat-side `BackendSessionBrowserModal` 的 resume host contract
- settings surface 需要最小桥接能力：
  - create conversation from backend session
  - ensure chat view exists
  - load that conversation into the chat view
- 如果必须加 bridge，做成最小 public seam，不要复制大块 chat runtime 逻辑

验证要求：
- targeted tests
- bare `npm run verify`
- `npm run check:module-docs`
- 如需要，再跑 `OWNER_GUARD_APPROVED='...' npm run verify`
- `npm run build`
- deploy + BUILD_ID

运行时证据要求：
1. active backend = codex
2. settings-side launcher opens modal
3. modal 对 in-memory Codex session 显示 Resume
4. 点击 Resume 后能打开/加载一个 Codex conversation 到 chat view
5. 对该 conversation 发送 follow-up 成功

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
  - settings-side resume 新增了什么
  - 哪些仍是 readback
  - 哪些仍未接入
  - resume seam 是否仍然只限 in-memory sessions

预期诚实结果示例：
- settings-side Codex session browser resume（in-memory only）：只有在完整端到端恢复成功时才能写已 pass
- persisted discovery：仍未接入
- preview transcript：仍未接入
- external CLI thread enumeration：仍未接入
```
