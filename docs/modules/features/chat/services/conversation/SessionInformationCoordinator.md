# SessionInformationCoordinator

> 源码：`src/features/chat/services/conversation/SessionInformationCoordinator.ts`
> Owner：feature.chat-services

## 职责与边界

会话信息的独立读回 owner。以 backend + 原生 session ID 缓存额度、MCP、子智能体及后端资源；UI 身份另包含 conversation/tab。每个读取检查原服务实例、会话身份和返回 sessionId，迟到结果不能写入已复用的标签。并发请求合并；信息最多每十秒刷新，子会话最多每三秒刷新，常规轮询只在面板可见时运行。关闭/销毁后不应用异步结果。

`project` 从已发送消息的附件、稳定引用和会话引用提取来源；草稿资源只供工具页使用。轮次是用户消息数，消息和工具数来自当前会话记录。上下文复用 ContextUsageDisplayService 的当前窗口口径；原生累计 session usage 独立保留。

智能体来自原生列表或明确的工具 metadata 子会话 ID；普通后台任务、shell、模糊工具名不能生成智能体。终态与未知状态保留区别。子会话使用 readChildSessionMessages(parentId, childId) 读取实际消息，不发送模型请求，不切换或重建主会话。返回删除子视图，保留主会话的草稿和聊天 DOM；面板自行恢复滚动与折叠。

## 原生任务生命周期（2026-11-09）

从 SessionWorkbenchCoordinator 接管完整原生后台任务 read/cache/subscription/output/stop 生命周期，保留既有其他后端 `getBackgroundTasks` 与子历史路径。DSH 的可选 Jobs 接口独立 list/read/kill，并监听 jobs_update；初始读、五秒对账与事件刷新使用 backend/session/request version/service identity，invalidated 清空任务证据。结果只写仍存在的所属会话，跨标签的停止请求被拒绝。Jobs 采用 `job:` UI identity 与原生 ID 分离，不覆盖 Todos。输出经共享脱敏并限制 65,536 字符，失败不伪造完成。

Jobs 的完整成功列表同时通过可选 `onNativeJobs` 传给既有 background timeline/notice owners，不再只有工作台内存列表。callback lease 捕获 adapter 实例、native invalidation epoch、conversationId、tabId、sessionId；每次权威读使用 request version 拒绝乱序。失效通知发送 null 并清空展示证据，不推断停止；读取失败保留最后已观察状态且不产生完成事件。`DshBackgroundCompletion.test.ts` 验证完整逐回合显示与延迟持久化链路。

## DSH 原生工作台投影（2026-11-10）

本协调器持有 `DshNativeWorkbenchControls`（来自 `selection/DshNativeSessionControls.ts`）实例并只负责集成其读取与投影，不复制其状态：`project()` 把 `nativePlan` / `nativeTerminals` 加入共享工作台 DTO；`refreshTasks` 对 DSH job 行经 `jobTask` 附加原生 job 操作（details/wait/readAt）。结构化服务判别用 `isDshNativeWorkbenchService`；owner lease 覆盖 disposed、backend epoch、service 实例、tab/conversation/sessionId。五秒限频与 request version 沿用既有任务链路；读取失败保留最后证据，不推断终态。Plan 的 set→read 确认、终端/子会话行投影与 per-row+operation 重入 fence 由该 owner 持有（见其模块文档）；composer 侧 preset 状态归 `ChatSelectionControlsCoordinator` 的非渲染 preset owner，二者不共享可变状态。

## 子会话续接回修勘误（2026-11-10 独立 review 后）

`sessionIdentity` 增含 tab（`backend:conversationId@tabId`）：同一会话多 tab 各持独立子会话 slot，草稿/探测/回执不跨 tab。`childReads` 与 `childTimes` 的键同时包含该身份、原生父会话和子会话 ID；A 标签的读取挂起时，B 标签打开同一子会话仍可独立读取并更新自己的 slot。`canContinue` 绑定产生探测的 owner service（`canContinueOwner`）；registry 替换在 `projectChild` 即时失效旧探测，`continueChild` 写前对当前 owner 重验（probe false 拒绝并可读报错，unknown 不可写）。异步能力探测返回后（包括 cached-true 的 microtask 间隙）与投递回执返回后，分别重验 disposed、当前 tab/conversation/native parent、child slot 对象和 registry 服务实例；旧 owner 的回执不清草稿、不写 sendNote。receipt 只有在完整 lease 仍有效时才落为 `child.sendNote` 协调器状态（仅更新 receipt 覆盖，历史读取失败不降级不抹除），并即刻 `onChange` 重建清除陈旧输入。集成覆盖见 DshChildContinuationSurface.test.ts（真实 coordinator+surface DOM）与 DshChildModeChain.test.ts（真实 service.mjs 子进程 → 真实 adapter → 真实 coordinator）。

## 集成与验证

SessionWorkbenchCoordinator 组装和转发此 owner；OpenCodianView 仅提供当前 tab 的上下文快照。单测：SessionInformationCoordinator.test.ts、SessionWorkbenchCoordinator.test.ts。需要类型、lint、模块文档、架构、图刷新和真实 Test Vault 验证。

优先投影后端显式 context；只对已有可证明当前窗口口径的 Pi/DSH 使用严格 sessionId 匹配的 Tab 测量。OpenCode 2、Codex 和 Claude 的累计/探针数据不回填为当前上下文；ZCode 当前窗口口径待运行时证明。后端服务实例替换后，旧实例账户数据立即不可见。
