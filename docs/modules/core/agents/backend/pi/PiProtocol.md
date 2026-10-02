# PiProtocol

> 源码: src/core/agents/backend/pi/PiProtocol.ts

## 职责

服务协议 TypeScript 边界：保留29项必需RPC、23项SDK补充命令及4项配置操作，另外声明2项可选RPC读取、模型元数据和UI类型。只允许声明的业务操作，不允许任意反射。

## 验证

运行时握手核验协议1和既有必需操作（普通服务56项、configuration服务4项）；可选RPC不加入旧SDK的必需握手集合。SDK脚本的0.73.1对照属于历史基线，不能代表当前安装版本。PiWorkbenchActions.test.ts校验既有管理入口，可选读取尚未加入产品UI。

2026-10-02（T07最小协议slice，reviewed continuation）：`PI_OPTIONAL_RPC_COMMANDS` 和独立 `PiOptionalCommandName` 声明 `get_available_thinking_levels`、`get_entries`。人类明确授权审查续做后，`PiCommandName` 公共union包含二者，PiAdapter内联allowlist允许 typed command 调用。optional声明只限定可调用操作，不代表安装SDK可用性；29项必需RPC目录和原有mandatory handshake未变。`PiCommandCapabilities`/`PiUnavailableCommandResult` 表达实际SDK方法可用或缺失；`PiEntriesRequest.since` 是原生entry ID，`PiEntriesResult` 保留原生entry对象和当前 `leafId`。

`assets/pi/commands.mjs` 的 `get_state.commands` 只在实际session/manager公开方法存在时加入可选读取，并通过 `capabilities` 明确返回unavailable原因。不能从SDK版本号、模型reasoning布尔值或静态思考档位推测支持。`PiSdkReadCommands.test.ts/.mjs` 覆盖 typed公共dispatch到真实服务handler的成功读取、方法缺失时unavailable、原生entry/parent/leaf/since、未知since拒绝、未声明操作拒绝及配置客户端隔离。外部Node只加载命令模块和离线SDK fixture；可选安装SDK检查仅使用内存SessionManager/公开读方法，不运行真实CLI、模型或凭据流程。本slice接通公共命令入口，产品UI与完整服务握手仍待验收，整T07不标完成。

2026-09-09：新增4个配置操作get/save_configuration、get/save_model_configuration，独立PiSettingField/PiConfigurationDocument类型。配置操作有专用页面，不算会话工作台动作。

2026-09-17：新增 `PiExtensionStatusSnapshot`（`setStatus` 各键文本 + 最后一条 `notify` + 时间戳）。注意协议本身没有任何 MCP 命令、也没有通用命令执行入口：扩展的 MCP 状态只能以 UI 通道的文本形式被宿主机观测，这份快照就是那个观测点。
