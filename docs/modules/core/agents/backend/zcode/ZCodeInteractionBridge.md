# ZCodeInteractionBridge
> 2026-09-25 (FA880 follow-up): A pure pending permission now expires after 60 seconds with native `{decision:"deny"}`. The expired request ID rejects late UI approvals and retransmits; teardown clears its tombstone. Other sessions' pending asks remain separate. This timeout applies to `interaction/requestPermission`, not AskUserQuestion.

Identical concurrent native permission retries with the same request ID share
one pending user decision and one card. A changed payload under that ID is
denied. This closes a real Windows app-server replay in which the second ask
previously received an immediate fail-closed denial before the user could
approve the first.

The session approval action records an `allow` for the native session and
tool. Later matching asks in that session receive the same local approval
without writing ZCode global or project permission rules; other sessions and
tools still require their own decision.

> 2026-09-24：真机发现 ZCode 对同一 `requestId` 重发完全相同的问答 ask。待决重发共享原答复 Promise；已回答后的短时重发复用同一答复。不同会话、工具调用、回合或题目内容的同 ID 请求仍 fail-closed；单次用户动作仍只结算一次。

> 2026-09-24 (票 06 收敛)：新增 `registerAskForAdapter(kind, params, emitChunk)`——注册 + fail-closed + 由调用方发射 surface chunk 的一体式入口；adapter 的 ask 处理器收敛为桥调用 + 回合 chunk 发射闭包。

> 源码: src/core/agents/backend/zcode/ZCodeInteractionBridge.ts

> 2026-09-22 (票 04)：权限/问答交互环的唯一桥接面。原生 ask 为服务端发起请求，其应答为**严格 schema**（真机实证）：`interaction/requestPermission` → `JL = {decision: allow|deny|escalate|modify, reason?, modifiedInput?, permissionUpdates?}`；`interaction/requestUserInput` → `CYe = {action: accept|decline|cancel, content?, reason?}`，`content.answers: Record<问题文本, string[]>`（另有 `answer_<i>`/单题 `answer` 简写，真机验证 accept 后 `permission.resolved decision:"modify"` 将答案并入工具输入）。

## 职责

把两类 ask 归一为既有 `PermissionRequest` / `QuestionRequest` 面对象（保留选项顺序与稳定 requestId/sessionId/toolCallId 身份），恰一次应答（settle 闭包独占置位/移除/resolve，重复与过期应答抛错且绝不二次回包）；未知请求形状直接 deny/decline **fail-closed**（绝不意外批准）；teardown（会话停止/进程退出/后端切换）把待决项以 deny/cancel 落定。`'always'` 优先采用运行时随 ask 下发的 allow_always 选项响应，缺失才走 `permissionUpdates: addRules` 受理通道；`'session'` 仅插件侧 SessionPermissionTracker 记账（**不写任何原生规则/配置**）；`'once'` → `{decision:"allow", reason:"Approved once"}`（镜像官方 `allowOnce` 语义）。

## 验证

tests/unit/core/agents/backend/ZCodeAdapter.interactions.test.ts：批准/拒绝/问答应答（选项顺序与问题键保留）/会话与 always 映射（无原生写）/未知形状 fail-closed/过期与错配应答/重复应答恰一次/stop 落定（deny/cancel）。
