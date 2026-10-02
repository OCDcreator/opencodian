# PiMcpConfigService

> 源码: src/core/agents/backend/pi/PiMcpConfigService.ts

## 职责

只读读取 Pi 自己声明的 MCP 服务器清单。Pi 的 MCP 能力来自扩展（`pi-mcp-adapter` 一类），RPC 协议里没有任何 MCP 命令、也没有通用命令执行，所以宿主机只能按扩展的合并顺序读配置文件：

`~/.config/mcp/mcp.json` → `~/.agents/mcp.json` → `~/.agents/mcp/mcp.json` → Pi 全局（`$PI_CODING_AGENT_DIR` 或 `~/.pi/agent`）的 `mcp.json` → 库内 `.mcp.json` → 库内 `.pi/mcp.json`。同名条目以后读取的文件为准，`PI_MCP_CONFIG_MODE=exclusive` 时只读 Pi 全局文件。

每条声明给出：名称、传输方式（`url` 存在即 http，否则 stdio）、端点、`disabled === true`、认证方式（`auth: 'oauth' | 'bearer'`，或存在 `bearerToken`/`bearerTokenEnv` 即视为 bearer）、以及胜出的来源文件。

## 安全约束

- **不写任何文件**：Pi 拥有这份配置，插件只读。
- stdio 端点按 argv 顺序脱敏：敏感 flag 名称命中 `token|key|secret|password|credential|auth`（不区分大小写）时，遮盖其下一项，无论值本身是否含关键词、是否为空或看起来像 flag。`--flag=value` 显示为 `--flag=***`，不会继续遮盖下一项；缺少值的裸 flag 保留名称。无 flag 的敏感文字仍按关键词遮盖。
- http URL 清除 username/password（包括编码过的 userinfo）、query 与 fragment；stdio 中独立或 `--endpoint=URL` 一类参数的 HTTP(S) URL 使用同一清洗。合法 URL 保留 scheme、host、port、path；解析失败统一返回 `[invalid URL]`，不回显原 URL 或异常内容。
- 保留普通命令、flag 名称、非敏感参数、传输方式、禁用/认证模式与来源，供设置页诊断；headers、env 和 bearer 凭据值不会进入声明快照。文件读取失败与 JSONC 解析错误不回显原始内容。
- 解析用 `jsonc-parser`（与 Pi 自己的 JSONC 解析一致），并检查 `errors`：`parse` 不抛异常，只看返回值的话畸形文件会被当成半成品对象混进清单；有解析错误时按不可读处理。

## 刻意不复刻

祖先目录发现、`imports`/Claude 插件配置展开、以及被改名发行版（`piConfig.name` / `configDir`）的路径。这些要么需要 Pi 内部状态，要么会扩大读取范围，超出"给设置页展示"所需。

## 验证

- `tests/unit/core/agents/backend/pi/PiMcpConfigService.test.ts`：合并优先级、JSONC、禁用标记、exclusive、缺失/畸形文件；独立 token 回归使用不含敏感关键词的合成值。
- `tests/unit/core/agents/backend/pi/PiMcpConfigService.redaction.test.ts`：T04 / F-PI-01 / S08 专属回归，每个 case 生成不含敏感关键词的随机十六进制假凭据；覆盖独立/等号值、空值/缺值/形似 flag 的值、URL userinfo/编码/query/hash、畸形 URL、读取异常、JSONC 失败和非敏感诊断保留。用真实 `SettingsPiSection` 与 service 验证设置描述、端点文本和序列化快照不含凭据；文件内容通过受控 fs fixture 提供，断言原始声明仍保留输入。该测试属于 L0，不能替代真实 Obsidian UI/native 验收。

## 关联

设置页 Pi → MCP 子标签用它渲染声明清单（`SettingsPiSection`）；运行时状态不在这里，来自 `PiAdapter` 捕获的扩展上报文本。
