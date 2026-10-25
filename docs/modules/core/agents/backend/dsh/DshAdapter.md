# DshAdapter

源码：`src/core/agents/backend/dsh/DshAdapter.ts`

`core.backend` 内的 Harness 本地连接、会话、发送/取消、原生目录和交互 owner。默认使用 `DshNativeClient` 的原生扩展；显式 `transport: acp` 保留兼容模式。不连接桌面私有 Web host，不借用其他后端目录或斜杠 resolver。

## 能力与配置

- Chat、Sessions、Permissions、Thinking、Models、Context 为基础能力。原生模式还提供 AuxQuery、InlineCompletion、Questions、Fork、TurnSteering、Tools；断开时逻辑行内能力允许安全重连，但每次辅助构造必须证明只读。Images 由当前握手开放，原生再按所选模型确认 modality。
- 模型/effort 来自原生 configOptions，opaque ID 原样保存和回传。发送前等待完整原生配置确认，失败不提交 prompt；会话选择只修改原生 agent selection，不覆盖全局默认。
- MCP 声明整批校验后传入新建/恢复。原生模式可显式应用至全部空闲会话；单会话替换失败恢复旧声明。未实现通用 Mcp/OAuth 管理合同，不声明该通用 capability。
- 原生模式授予 Compaction：`compactSession` 走原生 compaction seam（官方 `/compact` 同源），返回即表示摘要已提交；手动压缩失败（busy/changed/summary/commit/persistence，含"压不出更小摘要"）按 harness 消息抛错，运行回合拒绝，ACP 传输直接抛"requires the native transport"。请求超时 180s，超时后尽力 `client.cancel(sessionId)`——service 侧把压缩的 AbortController 存入 `record.admission`，该取消因此会真正中止仍在进行的摘要，而不是 UI 已失败、服务端仍忙。聊天视图的压缩入口按 `AgentCapability.Compaction` 门控，ACP 会话不展示随后必败的按钮。
- 用量只消费 native aggregate used/size；真实回合后 meter 锚定模型上报 usage 时，`usage_update` 附带 input/output/cacheRead/cacheWrite 明细并置 `tokenBreakdownAvailable:true`，费用经 ModelPricingService 按 deepseek 模型 id 估算（快照 providerId 置 null——harness 配置组只是显示名，opaque 选择解码出真实模型 id）。分类缺失保持未知，`tokenBreakdownAvailable:false` 防止虚构零费用。最后已知占用快照跨断连/恢复保留：原生只在下一条助手消息刷新占用，恢复清零会把聊天占用显示错误地归零。

## 内容与历史

`prepareDshPromptBlocks` 在既有 codec 内读取 Vault 选择器的本地图片字节，复用 PathConfinement，拒绝越界、符号链接逃逸、空文件、超限或变化中的文件；保留有序文本/图片/资源内容，memory 与 Obsidian context 各注入一次。取消期间不提交迟到 prompt。

原生历史保留真实用户/助手消息、图片、native message ID 和工具结果，过滤原生规则/技能目录/runtime context 等内部 user-role 注入。共享预览将 native ID 保留为 sourceMessageId；工具结果通过 activity 文本导入，避免空占位。`forkSession` 使用原生事件边界与 buildForkSeed，不复制插件文本伪造原生分支。删除原生持久历史仍不可用，close 仅释放句柄。`getSession` 复用目录分页读取单会话元数据（官方标题/createdAt/updatedAt），路由层据此把 dsh 纳入官方标题读取映射。

命令读取并执行于 native commands；原始 slash 文本不受 memory 前缀干扰。工具目录来自当前 agent schemas。问题交给 `DshQuestionBridge` 一次性回答/取消，聊天视图的问题应答路由将 dsh 指回本 adapter；权限回包绑定原 client/进程，未提供的持久允许不能被伪造——`always` 应答按偏好顺序先选运行时提供的 `allow_always` 选项、再回退 `allow_once`（不依赖选项数组顺序），`always`/`session` 的插件会话内记忆由权限卡渲染器的客户端 tracker 承担（与 zcode 回复映射一致），权限卡 chunk 的 patterns 为空数组而非选项名噪声。目录行在 adapter 边界把 ISO 时间戳归一为毫秒，供 extractTimestamp 类消费方与目录归一化直接使用。

## 辅助查询与生命周期

`DshAuxQuerySession` 直接调用原生 LLM，不创建 Agent、工具调度器或持久会话；空工具、无持久化/dispatcher、系统提示词 hash 和每次结果的安全证明均须通过。图片仅用内存 store。补全复用共享 WarmInlineCompletionSession 与既有池的超时、TTL 和代际规则。

各聊天会话独立拥有 turn/native settlement、取消和连接代际。超时导致状态不确定时关闭自有连接；旧 generator、resume/config 响应不能影响替代 client。dispose 为终态。目录读取所需的预留草稿供下一次匹配工作目录/MCP 的新聊天复用，不每次刷新创建一个会话。

## 验证

ACP fixture 保留生命周期和兼容路径回归。`DshNative.live.test.ts` 验证真实模型/工具/命令目录、stdio/HTTP MCP、反向问题、私有启动及用户 profile 不变；`DshAdapter.live.test.ts` 单独验证 ACP。真实模型只读审计、图片与 Obsidian 产品路径分别记账，详见 `docs/status/dsh-integration-2026-10-24.md`。Windows 与真实权限卡片 UI 闭环不能由源码测试替代。
