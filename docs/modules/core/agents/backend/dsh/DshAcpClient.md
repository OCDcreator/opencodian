# DshAcpClient

> 2026-10-24：现同时承载 ACP 兼容通道和 DshNativeClient 的原生扩展。反向请求接受数字或字符串 JSON-RPC ID，保留原 ID 及子进程归属；新增问题请求、原始 slash 文本和辅助 protected request 接缝。原生启动 profile 和私有文件归子类所有，父类不负责原生 profile 写入。

源码：`src/core/agents/backend/dsh/DshAcpClient.ts`

`DshAcpClient` 拥有 DSH ACP newline-delimited JSON-RPC 2.0 stdio 传输：自有子进程、请求 ID、增量分帧、pending/超时、会话句柄、session/update 通知和权限服务端请求。

启动只在 ACP v1 握手校验成功后报告 ready，并保留原生 handshake 供 adapter 进行动态图片能力判定。协议版本与握手校验来自 `DshProtocolCodec`。未知服务端方法返回 method-not-found；权限回包绑定原子进程，不能写入替代连接。

`newSession` / `resumeSession` 先对整个 stdio/HTTP MCP 声明数组校验，再发送原生请求；不在验证中启动任何 MCP 子进程。`prompt` 接受文本或有序 ACP 内容块数组，保留图片与资源链接的 wire 结构。stdout 默认上限为 32 MiB，pending 上限和单请求超时仍有界；调用方可以覆盖测试上限。

prompt 超时是空闲间隔而非回合总时长：`session/prompt` 的 pending 请求按 sessionId 标记，任何该会话的 `session/update` 通知都会重置其计时，因此持续产出事件的超长回合不会被判为 transport 不确定，只有静默卡死的回合才触发恢复路径。stderr 以 8 KiB 有界环形缓冲保留，凭据形态的串先脱敏再暴露：`recentStderr` getter 提供诊断读取，进程退出/协议失败错误附带最近约 1.5 KiB 尾部，启动失败不再只剩裸退出码。

停止关闭本 client 激活的会话、结清 pending 请求，并等待自有子进程实际退出。close/flush/进程退出失败向上传播；不删除持久历史。无效帧、EPIPE、进程退出和协议错误走同一故障/清理路径，旧子进程的迟到回调不能影响新连接。

`resolveDshLaunch` 继续支持显式 CLI、PATH `dsh`、macOS DeepSeek Harness.app 的 Electron-as-Node 载体。固定使用 ACP profile；Windows 仅接受原生 dsh.exe，不通过 shell 执行 .cmd/.bat。未连接桌面私有 Web host。
