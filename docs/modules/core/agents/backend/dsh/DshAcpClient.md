# DshAcpClient

> 2026-10-24：现同时承载 ACP 兼容通道和 DshNativeClient 的原生扩展。反向请求接受数字或字符串 JSON-RPC ID，保留原 ID 及子进程归属；新增问题请求、原始 slash 文本和辅助 protected request 接缝。原生启动 profile 和私有文件归子类所有，父类不负责原生 profile 写入。

源码：`src/core/agents/backend/dsh/DshAcpClient.ts`

`DshAcpClient` 拥有 DSH ACP newline-delimited JSON-RPC 2.0 stdio 传输：自有子进程、请求 ID、增量分帧、pending/超时、会话句柄、session/update 通知和权限服务端请求。

启动只在 ACP v1 握手校验成功后报告 ready，并保留原生 handshake 供 adapter 进行动态图片能力判定。协议版本与握手校验来自 `DshProtocolCodec`。未知服务端方法返回 method-not-found；权限回包绑定原子进程，不能写入替代连接。

`newSession` / `resumeSession` 先对整个 stdio/HTTP MCP 声明数组校验，再发送原生请求；不在验证中启动任何 MCP 子进程。`prompt` 接受文本或有序 ACP 内容块数组，保留图片与资源链接的 wire 结构。stdout 默认上限为 32 MiB，pending 上限和单请求超时仍有界；调用方可以覆盖测试上限。

prompt 超时是空闲间隔而非回合总时长：`session/prompt` 的 pending 请求按 sessionId 标记，任何该会话的 `session/update` 通知都会重置其计时，因此持续产出事件的超长回合不会被判为 transport 不确定，只有静默卡死的回合才触发恢复路径。stderr 以 8 KiB 有界环形缓冲保留（data 回调带子进程身份检查，重启复用路径不收养旧进程迟到输出），凭据形态的串先脱敏再暴露：Bearer 大小写无关（RFC 7235）、sk- 形态密钥、三段 base64url 的 JWT（头段不做长度高门槛）以及缓冲头部疑似截断残端；`recentStderr` getter 提供诊断读取，进程退出/协议失败错误与 pending 拒绝（含启动 initialize 失败）都附带最近约 1.5 KiB 尾部——后缀追加不破坏前缀锚定的 transport-uncertain 分类。

停止关闭本 client 激活的会话、结清 pending 请求，并等待自有子进程实际退出。close/flush/进程退出失败向上传播；不删除持久历史。无效帧、EPIPE、进程退出和协议错误走同一故障/清理路径，旧子进程的迟到回调不能影响新连接。

2026-11-09：`DshAcpClientOptions` 增加 `nativeConfig`、原始 `vaultPath`、受允许的持久目录父路径 `managedProfileRoot`，以及进程级 `onControlUpdate`。当 ACP 传入 default configuration 时，共享 `DshManagedProfile` helper 准备受控 `--patch` composition 并保持 `acp` profile；不插入 Native bridge，不伪造 Native 配置管理 capability。未传配置的旧 ACP 直接 launch 维持原行为。Native 子类已有独立准备，不二次包裹 ACP。准备期间 stop 带 generation 取消，重启创建新桥接文件，持久 profile 不参与清理。

ACP launcher 将保存的 `agent-default-model.provider/model` 同步映射到实际 `acp` profile 行，因为上游 `agentOptions` 显式传入该行的 provider/model；只映射这两个字段，保留其他继承配置，reset 后恢复实际 ACP 默认。ACP 原生 `agentOptions` 不支持 reasoningEffort；新会话默认 effort 由 adapter 创建会话后通过原生 config option 设定与回读，恢复会话不能重放默认值。独立安装集成 `DshAcpDefaults.live.test.ts` 使用真实客户端/adapter 和无模型调用的 synthetic provider 验证这些边界。

`config/extensions/update` 通知只接收 object params，经当前 child 身份检查转发 `onControlUpdate`，不添加伪 sessionId，不进入 session/update 路径。旧进程通知不能污染新连接；adapter 仍负责上层连接 generation fence。

2026-11-10（wire trace 注入缝——实施机制已冻结，独立复核/宿主验收待完成）：`DshAcpClientOptions.trace?: DshClientTraceHook`（observer + transport 标签）为可选项，缺省时每个 hook 是零行为变化的 no-op。`observe()` 把白名单 wire 记录转发给注入的 observer，observer 异常在此吸收，trace 永不影响聊天传输。`extractDshSessionUpdateDetail` 是字段级元数据白名单：sessionUpdate 名、截断并擦除凭据形态的 toolCallId/messageId、仅枚举集合内的 kind/status、数值 token 用量与 backendTimeMs；`rawInput`/`content`/`arguments` 等载荷与 title/reason 等自由文本不在白名单内。每个 client 实例持有一个 `sourceId`（UUID），每次 start 递增 generation，`observe()` 转发的记录带该身份；错误记录只含固定分类 + 数值 `errorCode` + 严格 `stopReason` 枚举，不含 raw error 文本。wire 记录/observer/hook 类型真值在 `../diagnostics/types.ts`，本文件仅 re-export 保持传输公共表面兼容；本轮 trace 不采集 stderr（client 自有的 stderrTail 错误包装路径与 trace 无关）。

`resolveDshLaunch` 继续支持显式 CLI、PATH `dsh`、macOS DeepSeek Harness.app 的 Electron-as-Node 载体。固定使用 ACP profile；Windows 仅接受原生 dsh.exe，不通过 shell 执行 .cmd/.bat。未连接桌面私有 Web host。
