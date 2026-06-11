在 `/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/.worktrees/codex-sdk-capability` 继续 Codex SDK lane，执行 **Checkpoint 14I：Codex persisted session row runtime proof**。

固定模型要求：

- `providerID="kimi-for-coding"`
- `modelID="k2p6"`

先跑 `opencode_setup` 健康检查。

只做这一个最小批次，不要扩 scope，不要自动开下一批。

## 本批次唯一目标

只验证 **Layer 1**：

- persisted Codex backend session 是否真的作为 row 出现在 backend session browser UI 中

## 必读基线

- `/Volumes/SDD2T/obsidian-vault-write/testvault/Opencodian的chat面板-结构梳理.md`
- `docs/status/codex-sdk-current-state-2026-06-09.md`
- `docs/status/checkpoint-14h-codex-persisted-session-browser-truth-closure.md`
- `docs/status/checkpoint-14i-codex-persisted-session-row-runtime-proof-execution-pack.md`

## 当前真相

- Layer 1 persisted discovery/list row：`readback`
- Layer 2 persisted preview/detail：`readback`
- Layer 3 persisted resume into chat：`readback`
- settings-side session browser copy 已经和该 truth 对齐

## 范围约束

只允许：

- runtime verification of Layer 1
- 极小测试/状态文档更新（仅当 truth 变化）

禁止：

- Layer 2 preview/detail promotion
- Layer 3 resume promotion
- approval UX
- account/model/profile readback
- 新 settings surface
- broad refactor
- silent scope creep

## 成功标准

只有在以下都成立时，Layer 1 才能从 `readback` 升到 `已 pass`：

1. active backend = `codex`
2. 存在一个真实 persisted Codex thread，不只是当前 adapter memory 中的会话
3. 打开现有 backend session browser 后，能在 UI 中看到该 persisted row
4. 有真实截图/DOM/console 证据

如果做不到：

- 保持 Layer 1 = `readback`
- 记录具体 blocker

## 必须验证

- 相关 focused tests（如果你改了测试/文档相关代码）
- `npm run verify`
  - 如果仍被 pre-existing owner-guard 卡住，必须如实报告
- `npm run build`
- 部署到 Test Vault
- 校验最新 BUILD_ID
- reload plugin
- `obsidian dev:errors`
- `obsidian dev:console level=error`
- 截图/DOM 证据

## 最终回报格式

必须包含：

- 改了哪些文件
- Layer 1 最终状态：`未接入 / readback / 已 pass / blocked / hidden`
- Layer 2 和 Layer 3 明确保持不变
- 最强运行时证据路径
- BUILD_ID
- `npm run verify` 真实状态
- 当前阻塞点
- 下一批最小建议

做完就停，不要继续做 Layer 2 或 Layer 3。
