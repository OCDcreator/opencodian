# DshAdapter

源码：`src/core/agents/backend/dsh/DshAdapter.ts`

`DshAdapter` 是 DeepSeek Harness 的 first-class backend 适配器。首期只使
用本地 DSH CLI 的 ACP stdio profile；它不连接桌面端的内部 Web host，也不
猜测未公开的 localhost 或 WebSocket 接口。

适配器负责：

- 启动和停止由它自己创建的 DSH ACP 子进程；
- 创建、列举、恢复 DSH 原生 session，停止时关闭自己激活的句柄而保留持久历史；
- 将 ACP `session/update` 映射为 OpenCodian 的文本、思考、工具结果和权限
  请求流；
- 按 session 保存取消代际；新发送等待原生 prompt 收敛，取消超时则关闭自有连接；
- 将文本附件、显式 synthetic parts、笔记上下文、memory 和 Obsidian tooling 注入合并到原生文本提示；
- 将 ACP 权限请求接入现有聊天权限卡片。

能力集合声明首期实现的 Chat、Sessions、Permissions 和 Thinking。
模型目录、MCP、图片、辅助查询、inline completion 和 transcript replay 仍
保持不可用，调用方必须按能力检查处理。确定性协议测试不代表真实模型聊天验收；
会话浏览器明确说明 DSH 续接不会导入此前的消息。

设置来源是 `backendSettings.dsh`，工作目录默认为当前 vault；空的可执行文件
路径优先使用 PATH 中的 `dsh`，macOS 上则可使用已安装的 DeepSeek Harness
桌面包作为 Electron-as-Node 的 ACP 运行时载体。

安装版 DSH 的 `session/list` 只返回持久化且未被激活的可恢复会话；当前连接
持有的会话不会重复列出。launcher 设置改变时，存在活动句柄的连接必须先停止
再重连；异常断线后的新连接按原 session ID 恢复，不复用过期句柄状态。

## 目录定位（2026-10-23）

- 源码位置：`src/core/agents/backend/dsh/DshAdapter.ts`。
- 原位置：`src/core/agents/backend/DshAdapter.ts`；文件名、导出接口与业务职责保持不变。
