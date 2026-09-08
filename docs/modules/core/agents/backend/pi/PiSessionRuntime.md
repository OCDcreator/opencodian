# PiSessionRuntime

> 源码: src/core/agents/backend/pi/PiSessionRuntime.ts

## 职责

每会话惰性服务池和目录服务，校验协议/全部能力。握手允许启动扩展等待交互；按会话分发事件，按请求ID取消对应UI。关闭/故障时取消全部对话框并释放连接。

不解释模型内容，不改写原生历史，不接触其他后端。PiSessionRuntime.test.ts验证精确取消与关闭；SDK脚本验证启动对话框往返。

2026-09-09：configuration句柄启动只读/保存配置的专用服务模式；握手只要求4项配置能力。普通服务要求全部命令。stop/dispose统一清理。
