# PiMcpConfigService

> 源码: src/core/agents/backend/pi/PiMcpConfigService.ts

## 职责

只读读取 Pi 自己声明的 MCP 服务器清单。Pi 的 MCP 能力来自扩展（`pi-mcp-adapter` 一类），RPC 协议里没有任何 MCP 命令、也没有通用命令执行，所以宿主机只能按扩展的合并顺序读配置文件：

`~/.config/mcp/mcp.json` → `~/.agents/mcp.json` → `~/.agents/mcp/mcp.json` → Pi 全局（`$PI_CODING_AGENT_DIR` 或 `~/.pi/agent`）的 `mcp.json` → 库内 `.mcp.json` → 库内 `.pi/mcp.json`。同名条目以后读取的文件为准，`PI_MCP_CONFIG_MODE=exclusive` 时只读 Pi 全局文件。

每条声明给出：名称、传输方式（`url` 存在即 http，否则 stdio）、端点、`disabled === true`、认证方式（`auth: 'oauth' | 'bearer'`，或存在 `bearerToken`/`bearerTokenEnv` 即视为 bearer）、以及胜出的来源文件。

## 安全约束

- **不写任何文件**：Pi 拥有这份配置，插件只读。
- 端点做过脱敏：http URL 去掉 query 与 fragment（令牌常写在 query 里），stdio 参数命中 `token|key|secret|password|credential|auth` 时替换为 `***`，但单独的 flag（`--token`）保留以便命令行可读。
- 解析用 `jsonc-parser`（与 Pi 自己的 JSONC 解析一致），并检查 `errors`：`parse` 不抛异常，只看返回值的话畸形文件会被当成半成品对象混进清单；有解析错误时按不可读处理。

## 刻意不复刻

祖先目录发现、`imports`/Claude 插件配置展开、以及被改名发行版（`piConfig.name` / `configDir`）的路径。这些要么需要 Pi 内部状态，要么会扩大读取范围，超出"给设置页展示"所需。

## 验证

tests/unit/core/agents/backend/pi/PiMcpConfigService.test.ts（合并优先级、JSONC、禁用标记、脱敏、exclusive、缺失/畸形文件）。

## 关联

设置页 Pi → MCP 子标签用它渲染声明清单（`SettingsPiSection`）；运行时状态不在这里，来自 `PiAdapter` 捕获的扩展上报文本。
