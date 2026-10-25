# DshQuestionBridge

源码：`src/core/agents/backend/dsh/DshQuestionBridge.ts`

拥有原生 DSH 问题批次到共享 QuestionRequest 的验证、pending 状态和一次性回答/取消结算。问题与选项 ID/标签必须有效且去重，问题 ID 同时绑定 native session 和 request，避免跨会话结算。

原生 multiSelect 映射为共享 multiple，自定义答案按原问题 ID 返回 selected/custom。非法回答批次数或单选多答会被拒绝；原生关闭通知、回合取消和后端停止会结清对应 pending。没有当前运行回合接收的问题立即取消，避免悬挂反向请求。

`DshAcpClient` 支持数字及字符串 JSON-RPC 请求 ID，始终向原子进程回包。`DshQuestionBridge.test.ts` 覆盖验证与结算，`DshNative.live.test.ts` 用真实原生命令验收回答及取消，不调用模型。
