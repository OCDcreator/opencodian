# DshAdapter

源码：`src/core/agents/backend/dsh/DshAdapter.ts`

`core.backend` 内的 Harness 本地连接、会话、发送/取消、原生目录和交互 owner。默认使用 `DshNativeClient` 的原生扩展；显式 `transport: acp` 保留兼容模式。不连接桌面私有 Web host，不借用其他后端目录或斜杠 resolver。

## 能力与配置

- Chat、Sessions、Permissions、Thinking、Models、Context 为基础能力。原生模式还提供 AuxQuery、InlineCompletion、Questions、Fork、TurnSteering、Tools；断开时逻辑行内能力允许安全重连，但每次辅助构造必须证明只读。Images 由当前握手开放，原生再按所选模型确认 modality。
- 模型/effort 来自原生 configOptions，opaque ID 原样保存和回传。发送前等待完整原生配置确认，失败不提交 prompt；会话选择只修改原生 agent selection，不覆盖全局默认。
- ACP 0.2.2-rc.1 的 `agentOptions(config)` 仅传 provider/model，不读取 `agent-default-model.reasoningEffort`。`materializeNewSession` 在真实新会话（包括目录预留草稿）发布前，捕获已保存的 ACP 默认 effort、校验实际 config_option choices、按需 set 并确认读回，再记为该会话初始 baseline。已确认相同值不重复 set；Native 模式、缺省 effort、显式/惰性 resume 不应用此补偿。未知选项或未确认响应安全失败，仅释放未发布的空闲会话，不发送 prompt、不重启其他工作；旧 generation 迟到结果不能清除替代会话。会话发送的 variant override 仍走现有独立路径。
- MCP 声明整批校验后传入新建/恢复。原生模式可显式应用至全部空闲会话；单会话替换失败恢复旧声明。未实现通用 Mcp/OAuth 管理合同，不声明该通用 capability。
- 原生模式授予 Compaction：`compactSession` 走原生 compaction seam（官方 `/compact` 同源），返回即表示摘要已提交；手动压缩失败（busy/changed/summary/commit/persistence，含"压不出更小摘要"）按 harness 消息抛错，运行回合拒绝，ACP 传输直接抛"requires the native transport"。请求超时 180s，超时后尽力 `client.cancel(sessionId)`——service 侧把压缩的 AbortController 存入 `record.admission`，该取消因此会真正中止仍在进行的摘要，而不是 UI 已失败、服务端仍忙。聊天视图的压缩入口按 `AgentCapability.Compaction` 门控，ACP 会话不展示随后必败的按钮。
- 用量只消费 native aggregate used/size；真实回合后 meter 锚定模型上报 usage 时，`usage_update` 附带 input/output/cacheRead/cacheWrite 明细并置 `tokenBreakdownAvailable:true`，费用经 ModelPricingService 按 deepseek 模型 id 估算（快照 providerId 置 null——harness 配置组只是显示名，opaque 选择解码出真实模型 id）。分类缺失保持未知，`tokenBreakdownAvailable:false` 防止虚构零费用。最后已知占用快照跨断连/恢复保留：原生只在下一条助手消息刷新占用，恢复清零会把聊天占用显示错误地归零。

## Native 设置与会话控制（2026-11-09）

`DshNativeControls` 负责公开 DTO、逐方法握手门控、响应校验、脱敏和控制事件；adapter 保留当前 client、连接代际与会话激活所有权。`getNativeControlCapabilities()` 同步返回当前连接的 `configuration` 和 `controls` 快照；`refreshNativeControlCapabilities()` 在同一 client 上异步读取新能力，lease 与扩展 mutation 后也刷新。不存在的方法为 false，缺失 service presence 为 null，安装/启用 terminal 后不必重新连接才能看见真实能力。Todos 在连接前允许启动 Native，握手后必须同时证明 list/updates 才保留通用 Todos capability。ACP 不提供这些 Native 控制；不声明会打开 OpenCode 专属界面的 Subagents/Mcp/Config capability。

- `getNativeConfiguration`、凭据描述/设置/取消、扩展管理与 `mutateNativeExtensionSettings` 返回实际桥接读回。扩展字段编辑使用数字 `expectedRevision` 和路径数组 CAS；仅服务端确认的已安装扩展公开可写字段可进入受管 profile。凭据只返回 ref/configured/source/writable，不保留值。`appliedRevision` 缺失时为 null，绝不用请求 revision 填充运行证据。
- 启动把验证后的 `settings.nativeConfig` 交给 transport；`vaultPath` 始终是原始 Vault 目录，独立于 DSH cwd override。连接 key 包含配置 revision 和启动信息摘要，不存放环境密钥原文。已驻留会话或活动回合不会因配置改变静默重启。
- `reconnectNativeConfiguration()` 是显式操作，要求没有 turn、取消、resume、catalog、辅助会话或 Native 控制请求；通过同一旧 client lease 的实时 capability presence 和逐会话 Goal、Jobs、terminal、child 读回证明静止，前后复查 Goal 和服务 composition 后才更换进程。任何 armed/不可确认 Goal、running/stopping Job、运行终端、未知 child activity（包括 idle + unknown）都阻止重连。无 terminal profile 只有实时 `present:false` 才跳过；未提供证明的旧握手缺失方法保持 unavailable。保存新配置不影响诊断读取旧进程的实际 revision，发送/新建仍要求配置应用边界。它不发送 kill/cancel，不删除持久会话；成功后旧驻留句柄失效，历史会话在下一次控制请求中按 ID 恢复。在任何空闲断言、静止探测、stop 或 start 之前先做传输护栏：配置 transport 为 ACP（omitted 与 `connectionDescriptor` 一致按 Native 默认，不拒绝），或当前已启动 client 的握手（经 `dshNativeControlCapabilities` 判定）证明非 Native 时，立即抛 `unavailable`——即使设置刚切到 Native 也不停靠运行中的 ACP client，因为旧握手是唯一传输证据，此时换进程会丢失会话且拿不到 Native 读回；ACP 启动覆盖本来就支持在下一次进程启动时生效。
- `defaultPlanMode?:boolean` 是插件新 Native 聊天默认策略，undefined 继承、true/false 请求开/关，独立于 upstream nativeConfig 与进程 connection key。`createSession` 在首次发布 direct-new 或目录预留草稿时捕获当前策略，通过原生 Plan set 和独立 get 确认；草稿在创建后改策略会使用发布时最新值。queued/pending/取消/未确认安全失败，仅释放未发布空闲会话，不终止其他回合；inherit 不发 mutation，resume/fork/ACP 不重放此默认。
- `get/setSessionPermissionPreset` 与 `get/setSessionPlanState` 是独立合同；Plan 的 queued/pending/disposition 原样反映 native，不能用权限预设模拟。Todos、Jobs、terminal、subagents、MCP 状态方法都绑定当前连接代际和实际激活的 owner session。
- `subscribeToNativeControlUpdates` 提供 session/configuration/extension/busy/invalidated 事件；`subscribeToSessionTodoUpdates` 适配现有通用 Todo 合同。空闲会话也接受实际所属事件，过期 client/generation 和外来 Job owner 被丢弃。订阅跨重连收到 invalidated，dispose 清除观察者；观察者异常不会中断聊天。
- `applyMcpConfiguration` 通过同一 Native 控制边界逐会话校验代际和实际 mounted 读回；请求超时只报告安全错误，不隐式终止进程中的 Jobs/children。`getSessionMcpStatus(sessionId?)` 返回真实挂载/工具元数据，缺省 ID 仅预留配置草稿、不发送 prompt。`readSessionInformation` 保留不恢复历史父会话的读取路径；未提供连接状态时显示 unknown，挂载事实不等同于 connected。子会话历史仍由既有精确父子授权路径读取。

## 内容与历史

`prepareDshPromptBlocks` 在既有 codec 内读取 Vault 选择器的本地图片字节，复用 PathConfinement，拒绝越界、符号链接逃逸、空文件、超限或变化中的文件；保留有序文本/图片/资源内容，memory 与 Obsidian context 各注入一次。取消期间不提交迟到 prompt。

原生历史保留真实用户/助手消息、图片、native message ID 和工具结果，过滤原生规则/技能目录/runtime context 等内部 user-role 注入。共享预览将 native ID 保留为 sourceMessageId；工具结果通过 activity 文本导入，避免空占位。`forkSession` 使用原生事件边界与 buildForkSeed，不复制插件文本伪造原生分支。删除原生持久历史仍不可用，close 仅释放句柄。`getSession` 复用目录分页读取单会话元数据（官方标题/createdAt/updatedAt），路由层据此把 dsh 纳入官方标题读取映射。历史图片投影合同见下方 2026-11-10 小节。

历史助手消息按其自身记录的模型路由打标签（2026-11-10）：桥接 `session/history` 只为 source kind 为 `model` 的助手消息转发两个字符串身份字段 `sourceProvider`/`sourceModel`（绝不转发 adapter 私有的 replayState 或 source blob）；`getSessionMessages` 在 `sourceKind==='model'` 且 provider/model 非空白时以 `encodeDshRecordedModelId` 编码为 `recordedModelId = ${provider}/${JSON.stringify([provider, model])}`——与实时回合经 `formatModelId` 记录的 `${provider}/${opaque 选择}` 完全同合同（会话目录的 opaque 选择本身就是 `JSON.stringify([provider.id, item.id])`），因此水合标签能解析显示名并与实时元数据在合并中保持一致。无记录来源的消息不产生该字段（键整体缺席），权威合并展开投影时保留本地已知的 modelId；绝不用当前会话选择或上一条消息回填。投影侧合同见 `BackendSessionMessages`。

命令读取并执行于 native commands；原始 slash 文本不受 memory 前缀干扰。工具目录来自当前 agent schemas。问题交给 `DshQuestionBridge` 一次性回答/取消，聊天视图的问题应答路由将 dsh 指回本 adapter；权限回包绑定原 client/进程，未提供的持久允许不能被伪造——`always` 应答按偏好顺序先选运行时提供的 `allow_always` 选项、再回退 `allow_once`（不依赖选项数组顺序），`always`/`session` 的插件会话内记忆由权限卡渲染器的客户端 tracker 承担（与 zcode 回复映射一致），权限卡 chunk 的 patterns 为空数组而非选项名噪声。目录行在 adapter 边界把 ISO 时间戳归一为毫秒，供 extractTimestamp 类消费方与目录归一化直接使用。

## 辅助查询与生命周期

`DshAuxQuerySession` 直接调用原生 LLM，不创建 Agent、工具调度器或持久会话；空工具、无持久化/dispatcher、系统提示词 hash 和每次结果的安全证明均须通过。图片仅用内存 store。补全复用共享 WarmInlineCompletionSession 与既有池的超时、TTL 和代际规则。

各聊天会话独立拥有 turn/native settlement、取消和连接代际。超时导致状态不确定时关闭自有连接；旧 generator、resume/config 响应不能影响替代 client。dispose 为终态。目录读取所需的预留草稿供下一次匹配工作目录/MCP 的新聊天复用，不每次刷新创建一个会话。

## 验证

`DshAdapter.acpDefaults.test.ts` 验证新 ACP 默认 effort、目录草稿复用、会话 override、resume 保留、未知/缺失/未确认默认失败、请求快照和迟到 generation；ACP fixture 保留生命周期和兼容路径回归。`DshNative.live.test.ts` 验证真实模型/工具/命令目录、stdio/HTTP MCP、反向问题、私有启动及用户 profile 不变；`DshAdapter.live.test.ts` 单独验证 ACP。真实模型只读审计、图片与 Obsidian 产品路径分别记账，详见 `docs/status/dsh-integration-2026-10-24.md`。Windows 与真实权限卡片 UI 闭环不能由源码测试替代。

## 2026-10-28：原生命令与技能弹框

getRuntimeCommands 保留原生服务返回的 source: skill；目录包含 commands 注册表与当前 agent scope 下允许用户调用的技能，命令重名优先。ACP 兼容传输没有 nativeRequest 时不伪造目录。
## 2026-10-29：可选原生会话引用

`prepareNativeSessionReference(sourceSessionId, targetSessionId)` 调用 native bridge `session/reference`。桥接只在 `sessionReferenceResolver.prepare` 实际挂载时返回可用，并通过不恢复来源的 `sessionQuery.readSurface` 校验两端身份与真实路径都在当前 Vault 内，防止符号链接逃逸；返回 `dsh-session:` 的 JSON session ID base64url 编码。adapter 再次核对精确 URI。ACP、旧桥接、缺失 resolver 或身份／路径不明时返回 null，交给所属历史快照路径。

## Goal 与会话工作台（2026-10-30）

通过 native session/goal 提供 durable Goal + activation 的权威投影和控制。goalObjective 直接进入目标协议，原生服务等待跨自动轮 activity；自动轮 history 使用稳定 native ID。ACP 无此契约时显示不可用，不伪造目标。

## 会话信息面板（2026-10-31）

native session/information 查询只读取已驻留 session 的实际 MCP 挂载 Map，不调用 idle 或修改配置，执行期间同样可读。ACP 或旧服务未提供该能力时保持不可用；不从 MCP 声明推断已加载状态。

原生父子目录使用 subagents.listChildren 和 subagentTiming 精确观察（active/lastTurnCompleted），不将闲置当作完成。读回释放 observation lease。历史父会话不必驻留即可读取目录，但冷会话的 MCP 未知。子会话历史由 session/child-history 验证父子关系后复用正常转录规范化，不启动 Agent。

当前占用只来自本会话已观察的 native context meter（used / size）；没有该测量时不以模型容量或累计值填零。

子会话续接转发（2026-11-10）：`canContinueChildSession`/`continueChildSession` 经既有 lease-fenced `DshNativeControls` 转发到原生续接合同；排队/steer 回执为 text-only 通知，不代表续接已完成。`session/information` 的子会话行从 bridge 到 `readSessionInformation` 保留 `mode`：只接受 `one-shot`、`continuable`、`external`，其他值投影为 `unknown`，不从可读、闲置或已有历史推断可续接。工作台仍须独立核实当前服务的 prompt 能力和精确直属父子关系。

`getSessionMessages` 恢复历史图片块时按角色分流（review P2 admission 修复后合同）：**user** 角色的 image 块先经 `dshVerifiedImage` admission——复用 codec `dshImageBlock`（canonical base64 + ≤28MiB 尺寸）再加有界前 18 字节 magic 与声明 MIME 一致性——通过才原样透传（`{type:'image', mimeType, data, name?}` 由桥接经公开 `ctx.attachments.readImage` 还原的块本就 store 验证过，admission 复核覆盖 ACP/回放等非 store-owned 输入），共享投影 `consumeImage` 填充 `ChatMessage.images`，既有用户消息图库渲染并可点击预览；`name` 透传为 `filename`。未过 admission 的 payload 降级为 codec 诚实占位 `[DeepSeek Harness returned an invalid or unsupported image]`（超大块不进文本），假图/巨量数据不进 images 或 data URI。**assistant** 角色经 `dshImageProjectionText` 使用同一 `dshVerifiedImage` admission，通过后才生成 Markdown data URI，与 live 流一致；校验失败只产生占位文字，不再回退到能绕过 magic 校验的 codec data URI 路径。**tool** 单块图片经同一 `dshVerifiedImage` 通过才产 `dshImageDataUri` 裸 `data:image/…;base64,…`（命中共享 ToolCallRenderer `data:image/`→`<img>` 分支），混合/未过 admission 内容按块文本投影，不可用引用映射为诚实占位 `[DeepSeek Harness image is no longer available (<reason>)]`。桥接侧（`assets/dsh/service.mjs` 的 `resolveImageBlock`，history 与 live 转发共用）只信 store 归属内容：持久 ref（不透明 `attachmentId`，非路径/URL）缺失、过期、损坏或读取失败时，单块降级为 `{type:'image', unavailable:true, reason:<稳定AttachmentErrorCode|'unavailable'>}`，不再让整段 history 投影或 live turn 失败。绝不伪造图片数据、不用当前发送图片回填历史；service store 之外不接受 paths/URLs。assistant `recordedModelId` 稀疏字段语义不受影响。图片来源全部限定为请求会话自身的持久化 ref，由 store 按 attachmentId 内容寻址校验，不存在跨会话或路径面。

当前占用只来自本会话已观察的 native context meter（used / size）；没有该测量时不以模型容量或累计值填零。
