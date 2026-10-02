# PiSessionRuntime
> 2026-09-21 (advantage-parity R-F7)：options 新增 `getExtraEnv`；构造 PiLaunchOptions 时透传给每次 spawn。

> 源码: src/core/agents/backend/pi/PiSessionRuntime.ts

## 职责

每会话惰性服务池和目录服务，校验协议及既有必需能力。握手允许启动扩展等待交互；按会话分发事件，按请求ID取消对应UI。关闭/故障时取消全部对话框并释放连接。

不解释模型内容，不改写原生历史，不接触其他后端。PiSessionRuntime.test.ts验证精确取消与关闭；SDK脚本验证启动对话框往返。

2026-09-09：configuration句柄启动只读/保存配置的专用服务模式；握手只要求4项配置能力。普通服务要求既有29 RPC + 23 SDK + 4配置命令。stop/dispose统一清理。

2026-10-02（T07最小协议slice）：两个新增读取位于独立 `PI_OPTIONAL_RPC_COMMANDS`，未扩大 `get()` 的必需握手集合，旧SDK缺少可选方法时仍可启动。`PiSessionRuntime.test.ts` 新增可选目录存在/缺失均通过握手、缺少必需操作仍拒绝的离线检查。源码继续使用既有必需握手集合，无需扩大 `get()` 的能力要求。支持目录及unavailable由独立SDK服务根据实际方法返回，运行时不自行宣称旧SDK支持。首批验证仅覆盖协议/服务。2026-10-02 用户明确允许 reviewed continuation 后，PiCommandName 与 PiAdapter 公共 allowlist 已接通两项可选读取，公共 typed dispatch 通过真实 commands.mjs handler 的离线回归。PiSessionRuntime 源码及 mandatory handshake 保持原样；公共接线、实装 SDK 内存读、完整服务握手和真实模型/UI 是独立证据，后两者仍待验收。
