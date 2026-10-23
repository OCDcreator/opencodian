# DshAcpClient

源码：`src/core/agents/backend/dsh/DshAcpClient.ts`

`DshAcpClient` 是 DSH ACP stdio 的窄传输层。它负责 newline-delimited
JSON-RPC 2.0 的请求 ID 关联、stdout 增量分帧、`session/update` 通知、
`session/request_permission` 服务端请求，以及只清理自己启动的子进程。

启动时先发送 ACP `initialize`（protocol version 1），之后才把 adapter 状态
标记为 connected。无效 JSON/帧、进程早退、请求超时有明确错误；未知服务端
请求返回 JSON-RPC method-not-found。stdout 缓冲与 pending 请求数设有上界。
权限回包绑定发起它的子进程，旧连接的迟到回复不能写入新进程。
stdin 的断管错误也进入同一失败/清理路径，拒绝未完成请求；旧子进程迟到的
流错误不能影响替换后的连接。

停止会关闭本 client 激活的 session 句柄、结清 pending 请求并等待自有子进程
退出；强制终止后仍等待实际退出。session close/flush 或进程退出失败会向上传播，
不能报告干净断开；不会删除原生持久会话。

`resolveDshLaunch()` 支持显式 CLI 路径、PATH 中的 `dsh`，以及 macOS
DeepSeek Harness.app 的 Electron-as-Node 载体。桌面 attach 仍不属于这个
传输层的协议范围。

Windows 仅接受原生 `dsh.exe`，显式拒绝不能由无 shell spawn 启动的 `.cmd` /
`.bat` shim；Windows 运行时仍需单独验证。
