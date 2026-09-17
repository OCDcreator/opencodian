# PiProtocol

> 源码: src/core/agents/backend/pi/PiProtocol.ts

## 职责

服务协议 TypeScript 边界：29官方RPC、23SDK补充命令、模型元数据和UI类型。只允许声明的业务操作，不允许任意反射。

## 验证

运行时握手核验协议1和52操作；SDK脚本对照安装版本的RpcCommand union；PiWorkbenchActions.test.ts校验管理入口完整。

2026-09-09：新增4个配置操作get/save_configuration、get/save_model_configuration，独立PiSettingField/PiConfigurationDocument类型。配置操作有专用页面，不算会话工作台动作。

2026-09-17：新增 `PiExtensionStatusSnapshot`（`setStatus` 各键文本 + 最后一条 `notify` + 时间戳）。注意协议本身没有任何 MCP 命令、也没有通用命令执行入口：扩展的 MCP 状态只能以 UI 通道的文本形式被宿主机观测，这份快照就是那个观测点。
