# ZCodeAdapter

> 2026-09-26（原生斜杠发送边界）：`sendMessage` 将 `/goal`、`/compact`、`/plan` 的控制请求与普通模型发送分开。目标写入经同会话 `session/read.projection.target` 确认；有 `targetId` 的目标执行只消费对应真实回合，跳过无正文控制回合。压缩仅在原生终态及会话读回确认后返回成功；Plan 通过独立原生计划状态读回确认，空任务不发送空模型提示。控制分支和事件流拆成 adapter 内部方法，以保持发送入口的复杂度门禁，不增加跨模块转发层。
> 2026-09-26（原生斜杠执行）：普通 ZCode 斜杠输入不再被 OpenCode 命令执行器消费。适配器把 `/goal` 映射到官方 `session/goal` 并按同会话 target ID/目标文本读回；目标的空 `controlOnly` 回合不作为响应结束，等待同 targetId 的真实执行轮。`/compact` 使用已有原生操作终态验证；`/plan` 使用独立计划状态读回。`/init` 及自定义命令继续交由 ZCode 自己的原生 prompt resolver。详情见 `.visual-evidence/zcode-continued/final-aggregate-2026-09-26.md`。
> 2026-09-26（源码 CLI 与桌面索引组合）：本地源码 `zcode.cjs` 覆盖仅用于 app-server 的新增原生接口；会话列表软删除筛选及删除仍通过单独定位的已安装官方桌面包 `TaskIndexRepo` 执行。此前把 CLI 覆盖路径交给桌面索引桥，导致 `listSessions()` 报“requires the official bundled runtime”，可见后端会话浏览器为空。现分别解析两个入口，维持索引包身份与双 ID 读回门禁；缺官方桌面索引时不伪造删除。
> 2026-09-26（开源 ZCode 原生终态读回）：官方 `zai-org/ZCode` v3.14.3 源码的独立本地分支新增执行者写入的 `(sessionId, taskId)` 持久记录和 `session/backgroundTaskRead` 原生查询。适配器对 `unknown` 或可能过时的 `running` 投影查询，严格核对返回的会话和任务 ID；原生返回 `unknown` 时撤去旧 `running` 的取消按钮，只有原生确定终态才更新卡片。旧版运行时不支持该方法时维持原有安全读回。最终 `fe49…` CLI bundle 与 OpenCodian `main.202609260045` 已在 macOS 和 FA880 Windows 两座隔离 Test Vault 的真实聊天任务上完成强杀、重连、同 ID 原生读回、失败和取消路径；官方安装包尚不含此方法，票 05 仍按总交付范围保持 `in-progress`。详见 `.visual-evidence/zcode-continued/durable-open-source-readback-2026-09-26.md`。
> 2026-09-26 续验：ZCode CLI 原子终态修复后的最终 bundle `f28cde6b…` 兼容 Windows 模型生成的 `Bash:0` 工具调用 ID，FA880 Test Vault 完成同 ID 强杀恢复读回；macOS 原子 bundle 完成同场景，最终 bundle 继续读回该终态。OpenCodian 适配器及已部署 `main.202609260217` 字节未变化。票 05 对本地开源构建路径已标 `done`，总票 09 仍待九票逐项审计，官方安装包仍未包含新增接口。详见同一证据文件。
> 2026-09-25（官方软删除）：目标会话先以 `session/list({sessionIds:[id]})` 校验原生 ID、`interactive` 类型与当前 vault workspace，再通过安装包中的官方 `TaskIndexRepo` 建索引行（若缺失）并 `updateTaskState({deleted:true})`。删除前后 `listDeletedTaskIds` 必须证明只新增目标 ID。`listSessions` 使用同一 tombstone 过滤，供产品浏览器读回。原生 session store 并未清除；本地会话只有在原生软删除读回后才移除。无官方桌面包、索引 API 变化或读回不匹配均安全失败。
> 2026-09-25（官方会话重命名复核）：ZCode 桌面实际使用 V4 `renameSession`，其内部更新原生 session store 标题并标记 `titleSource:custom`。适配器现先恢复目标会话，再发 `v4/command`，仅在 ACK 为 `accepted|noop` 且同 ID `session/list` 与 `session/read` 均返回新标题后完成。V4 `deleteSession` 的 accepted ACK 只关闭活动句柄；同 ID 持久会话仍在 `session/list`。桌面“删除任务”另设 task-index `deleted` tombstone；适配器通过官方桌面 `TaskIndexRepo` 完成同等软删除，仍拒绝把 V4 ACK 当原生历史清除证明。见 `.visual-evidence/zcode-continued/official-session-lifecycle-2026-09-25.md`。
> 2026-09-25（压缩闭环）：`compactSession` 先以同会话 `session/events` 序号作为基线，调用 `session/compact`，仅把 `compact.state:accepted` 当请求 ACK。之后按会话与 `cmp_` operationId 配对 `session.updated` 原生事件；`completed` 后再读 `session/read` 与 `session/usage`，要求会话身份正确且用量比请求前增加才标记 tokenUsageObserved。`skipped/failed/cancelled` 为已读回的非成功终态，事件缺失/重连/超时保持受理但未验证。真实 Test Vault 先观察到 `started→completed` 和用量 0→20811；紧接着第二次原生请求出现 `skipped`，因此必须区分这两种终态。
> 2026-09-25 (background task recovery): `getBackgroundTasks` merges live `session/read.projection.backgroundJobs` with the same native read's persisted `messages`. A completed background Bash tool part supplies a stable launch ID; only a same-session synthetic `background_task` / `task_notification` with matching `originMeta.workId` and `<task-id>` confirms `completed`, `failed`, or native `killed` (shown as neutral `stopped`). A launch without a native ending remains `unknown` and cannot be canceled after reconnect. The live projection wins when present. Neither raw notification text nor output paths enter the card. `cancelBackgroundTask` still requires native `cancelled` readback.
> 2026-09-25 (official live state path): ZCode's desktop host combines live `session.updated` / projection updates with persisted message notifications. The adapter now retains validated same-session terminal Bash events even when they arrive after the foreground iterator closes; `getBackgroundTasks` uses them only when no live projection or persisted terminal notification supersedes them. This cache is in-process evidence, not a cross-process task registry. Force-stopped app-server 3.14.3 suppressed its terminal notification and delivered no terminal `session/event`; V4 `backgroundBashOutput` returned `unavailable` after restart. That case remains unknown in the card.
> 2026-09-25 (FA880): `readSessionMode` pairs `session/read`'s base mode with the latest same-session native `session_mode_changed` payload from `session/events`. A `planEnabled:true` event whose base mode matches the fresh read confirms Plan; absent/mismatched event keeps the conservative base projection. FA880 native event sequence 11 returned `mode:build, planEnabled:true` after a visible Plan click.

Each chat send resumes its native session before subscribing to events. A new
app-server process cannot subscribe to an earlier session ID until the runtime
materializes it with `session/resume`; this ordering allows a stopped or lost
owned process to reconnect and continue the same conversation.

> 2026-09-24 Windows 取消验收：UI 取消可能丢弃仍悬停在 `yield` 的旧 async generator。`cancelStream` 立即解除该会话的旧 run 占用，同时把 `session/stop` ACK 作为下一次 send 的边界；旧迭代器迟到的 finally 只能清理自己的 run，不能删除新回合。取消后同会话可立即重发并独立完成。

> 2026-09-24（最终接线复核）：文本 `InlineCompletion` 能力已接通无会话 `workspace/generateText` 路径；每回合显式 `tools: []`、4 秒取消预算，短请求原生输出上限至少 64 token。通用 `AuxQuery` 已在私有 app-server/storage 路径完成真实图片、续问、恶意写提示、取消、原生空工具表、vault 哈希及退出清理审计，能力位现已开放。以下票 07/08 的早期“协议无图片路径”“只有安全拒绝”段落为历史记录，不能作为当前状态。

> 2026-09-24: 公开 `Images` 能力后聊天 composer 才显示附图按钮与粘贴入口。真实 ZCode 发送仍按当前原生模型 `supportsImage` 和目标会话读回做逐次门控；不支持图片的模型会在发送前拒绝，不会把内容静默降成文字。

> 2026-09-24（续做）：会话恢复的 `session/resume` 快照用于刷新完整模型目录；`session/read` 的单模型投影不会覆盖它。图像发送使用官方 `{kind:"image", filename, mimeType, sizeBytes, dataBase64}`，并在目标会话原生读回当前模型且目录确认 `supportsImage` 后才发送。Test Vault composer 已发送合成红图，原生 user message 读回 `file/image/png`，助手回答 `RED`。

> 2026-09-24（空会话恢复）：ZCode 的 deferred `session/create` id 在首轮 send 前可不落盘。官方 bundle 定义 `sessionUnavailable: -32004`，且 `session/resume` 对无持久记录的 id 返回这个结构化错误（当前无额外 data code）；adapter 仅在 method=`session/resume` 且 code=`-32004` 时创建 replacement id，绝不匹配报错正文。调用方还必须证明本地 conversation 没有消息才会重绑，避免伪造有历史会话。replacement 复用 `createSession()`，故模型、thinkingLevel、mode 的已配置默认在相同物化边界重应用；未配置值遵循原生默认并由 readback 反映。

> 2026-09-24（辅助查询）：`startAuxQuerySession` 为每个辅助会话启动独立 app-server 与专属临时 `ZCODE_STORAGE_DIR`，引用现有 provider 配置而不写入；空 `toolAllowlist`、无 MCP/动态工作流，并在每回合从 `session/messages[].info.tools` 原生读回验证空工具集。官方图片附件形状、工具事件、取消/超时与拥有根清理由辅助会话模块负责；实机审计见 `.visual-evidence/zcode-continued/zcode-aux-native-audit-2026-09-24.md`。

> 2026-09-24（辅助查询原生审计）：真实 Test Vault 回合使用 32×32 红色 PNG，当前回合 `info.tools:{}`、`toolCallCount:0` 与模型 `RED` 同时成立；主 `session/list` 数、用户 provider-config 哈希和专属 OS 临时根列表均未变化。脱敏原始边界记录见 `.visual-evidence/zcode-continued/zcode-aux-native-audit-2026-09-24.md`。

> 2026-09-24 (票 08 调查)：`session/create` 的工具允许/拒绝列表由原生运行时执行；辅助会话当前用自有私有存储与逐轮 `session/messages[].info.tools` 空表读回审计。文本补全的 `workspace/generateText` 不创建会话，显式传 `tools:[]`，按 operationId 取消；不同提供商的速度不同，4 秒超时保持安全失败。上述协议结论替代早期“绝对不可用”推测。

> 2026-09-22（核查修复）：不再把宿主 `process.execPath` 注入解析器（那是插件启动阻断根因之一）；provider 发现改传解析入口 `entryPath` 作锚点，启动注入经官方成对 env 契约完成。

> 2026-09-22 (票 02)：实现 `AgentChatCapability` + `AgentSessionCapability`——`sendMessage` 把 `session/send` 的异步受理 + `session/event` 流经 `ZCodeStreamMapper` 映射到 StreamChunk，收尾恒发 `message_stop`（终结边界）；`cancelStream` 只停本会话原生回合（`session/stop`）并关流，会话随后可继续发；并发会话按 `sessionId` 分拣互不串扰；镜像 prompt-prefix 适配器消费 memory/obsidianTooling 注入缝。`createSession` 映射 `session/create`（含宿主 ask 的诚实应答：`session/requestRuntimePreferences` → 无原生搜索增强，`interaction/requestOfficialMcpAuthHeaders` → 空 headers，防物化死锁）；删除/重命名暂为诚实不可用（票 03 映射）。能力集更新为 Chat + Sessions。

> 2026-09-25（分叉返回值纠错）：官方 `session/fork` 返回 `forkedSessionId`、`parentSessionId` 和 `snapshot`。先前仅解析 `sessionId/id` 会在原生分叉已成功并留下子会话后让可见按钮误报失败；现以 `forkedSessionId` 为首选身份，从 `snapshot.session.title` 读标题，保留旧形状兼容。实机证据和留存测试子会话记在 `.visual-evidence/zcode-continued/final-readback-2026-09-25.md`。

> 2026-09-22 (票 03)：实现原生生命周期面——`listSessions`（`session/list` 原始记录交路由归一）、`getSession`/`getSessionMessages`（`session/resume` 激活后 `session/read`/`session/messages`，resume 实证幂等；messages 支持 `limit`/`afterMessageId` 页参数）、`deleteSession` 诚实不可用（实证：`session/close` 仅为句柄分离——close 后历史可 resume 全量回读、会话仍在列表，方法表无删除/归档入口；映射即伪造删除）、`forkSession` → `session/fork`（返回原生分叉 ID；无身份即抛错；「No workspace checkpoint」等原生失败原样透传）、`compactSession` → `session/compact`（`{response, snapshot}`，可选 `instructions`）。`updateSessionTitle` 为诚实不可用（证据：方法表无 rename；`session/create` 严格拒绝 `title` 键）。能力集 + Fork + Compaction。注意：`session/read|messages|close|fork|compact` 均要求会话在本进程 active，故各操作先 `session/resume`。

> 2026-09-22 (票 04)：接通 `AgentQuestionCapability` + `AgentPermissionCapability`——`interaction/requestPermission` / `interaction/requestUserInput` 服务端 ask 经 ZCodeInteractionBridge 归一后以 `permission_request` / `question_request` StreamChunk 注入回合流（稳定身份进既有权限/问答面），应答恰一次且严格按原生 schema（JL / action-content）；未知形状 fail-closed；cancelStream/stop/dispose/进程退出均落定待决项（deny/cancel）。能力集 + Questions + Permissions。

> 2026-09-24 (票 05)：新增 `getSessionSubagents(sessionId)`（`session/subagents` 原生链路 `{revision, childSessionIds, running, ended}` 原样直通，id 稳定不合成）。

> 2026-09-24 (票 06)：实时目录接线——快照/state.updated 双通道保持目录热；getAvailableModels/getDefaultModel/getSlashCommands；setSessionModel/setSessionThoughtLevel/setSessionMode 发送前校验拒绝；会话覆盖经 request.options.provider/model/variant 在回合边界生效，持久化默认仅在物化边界应用一次，两者永不在回合中突变。

> 2026-09-24 (票 07 历史)：早期测试的五种附件形状并非官方 `dataBase64` 图片形状；“合法图片零 dispatch”的旧结论已由官方协议与 Test Vault 图片回合推翻。非法图片仍在发送前安全拒绝。

> 2026-09-24 (票 09)：诊断快照新增 `protocolVersion`；`lastError` 现在使用固定安全分类，不回显远端正文或结构化错误数据。

> 2026-09-24（续做）：诊断 lastError 改为固定安全分类文案，远端错误不再回显；模型与模式设置在 `session/read` 原生读回不匹配时失败；能力集声明 Models/Context/Thinking，并提供按会话的 `session/usage` 上下文读回与 `session/compact`。

> 源码: src/core/agents/backend/zcode/ZCodeAdapter.ts

## 职责

ZCode 后端的 AgentService 门面（票 01 范围：注册、探测、能力握手）。负责解析本地 ZCode 运行时、发现并注入官方运行时所需的 provider 配置（只读），启动 OpenCodian 自有的 app-server 子进程，完成 `runtime/capabilities` 能力协商，并以诚实的 ready / unavailable / failed 状态暴露 `getRuntimeDiagnostics()`。

绝不操控已打开的 ZCode 桌面 UI、绝不解析终端文本、绝不改写用户 ZCode 配置。start() 失败路径（运行时缺失、握手超时、进程早退、spawn 失败）全部 dispose 自有进程并进入 error 状态，不留孤儿进程，不影响其他后端会话。

## 验证

tests/unit/core/agents/backend/ZCodeAdapter.test.ts、ZCodeAdapterWiring.test.ts、ZCodeAdapter.models.test.ts、ZCodeAdapter.sessions.test.ts。能力集按运行时可证功能声明 Chat/Sessions/Fork/Compaction/Questions/Permissions/Models/Context/Thinking；模型、模式、上下文操作均以原生读回作为闭环门槛。
