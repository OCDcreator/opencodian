# SettingsPiSection

账户和原生会话动态列表使用共享opencodian-settings-form-stack，异步结果与后续重绘保持12px卡片间距。经典/标签布局都通过attachTabbed沿用同一section-body布局。

> 源码: src/features/settings/backends/pi/SettingsPiSection.ts

## 职责

Pi路径、默认模型/提供商、思考和连接检查，以及独立工作台入口。toPiChatMessages保留原生ID/工具/思考，已有loadBackendSessionConversation回调负责激活聊天视图。

Pi设置归一化不修改其他后端字段。宿主回调保持可选；非桌面宿主不构造进程。

## 验证

SettingsBackendSection.test.ts、PiWorkbenchActions.test.ts、Test Vault。

## 2026-09-09 独立后端页面

Pi主标签与ClaudeCode/Codex采用同一注册/section shell契约；二级页为连接、提供商、模型与思考、执行与上下文、资源、账户、会话、高级。原通用设置内联Pi配置已移除。经典布局仍提供本地二级导航。原生配置管理交给SettingsPiConfigurationSection/SettingsPiProvidersSection；会话瞬时控制仍留在工作台。

## 2026-09-17 MCP 子标签（只读）

二级页新增 `mcp`（排在“执行与上下文”之后）：列出 Pi 自己声明的 MCP 服务器（名称 / 传输方式 / 端点 / 禁用 / 认证方式 / 来源文件 + 合并过的配置文件），再显示 Pi 扩展最近一次上报的状态文本。声明来自 `PiMcpConfigService`（只读），状态来自 `PiAdapter.getExtensionStatus()`。

约束与理由：

- **只读**：没有 connect / auth / enable 等按钮。Pi 拥有这份配置与运行时，改配置请改文件；Pi 的 `/mcp` 子命令只能通过往会话里发提示词执行，代价与副作用都不适合放在设置页。
- **状态是文本不是结构**：扩展走 RPC UI 通道上报，插件只保留原文（`setStatus` 各键 + 最后一条 `notify`），不做正则解析——解析人类可读文本会随扩展措辞变化而悄悄失效。
- 该页在**没有适配器实例时也可渲染**（与其它子页不同）：声明清单只依赖文件，不需要 Pi 进程。`attachTabbed` 因此把 mcp 分支放在 `if (!adapter)` 之前。
- 测试通过构造器第二参数注入 `PiMcpConfigService` 替身；测试环境里 `Setting.setName/setDesc` 是 no-op，所以行内容用 spy 捕获断言。

## 2026-10-13 MCP 状态显示脱敏

`mcpStatus` 对每条非空 `statuses` 文本及 `message` 在写入 DOM 时调用共享 sanitizer 的 `urlPolicy: 'strict'`。完整 URL userinfo/fragment 和有限敏感 flag 值隐藏，正常状态文本、host/path/安全 query、时间、role 和布局保持。PiAdapter 缓存及 RPC/receive/protocol 对象保持原字节；没有新增 Copy 控件，也不把状态解释为结构化连接结果。

MATRIX008 typed status → 实际 mcpStatus → JSDOM 控制及新增多条状态/缓存不变回归属于 source/mock 证据；不是 Pi native、真实 UI 或 Pi-to-generic-report provenance。严格消费者不再要求 url-password fixture 的 `safe-user` 保留，host/path/mode=safe 与所有敏感值缺失断言仍保留。

## 目录定位（2026-10-23）

- 源码位置：`src/features/settings/backends/pi/SettingsPiSection.ts`。
- 原位置：`src/features/settings/SettingsPiSection.ts`；文件名、导出接口与业务职责保持不变。
- 随目录调整更新的依赖：`src/features/settings/backends/pi/PiWorkbenchModal.ts`、`src/features/settings/backends/pi/SettingsPiConfigurationSection.ts`、`src/features/settings/backends/pi/SettingsPiProvidersSection.ts`。

> 2026-10-27：Pi 模型页追加 Pi 专属的行内编辑/补全模型覆盖；原有连接、执行、MCP、资源与高级分类不变。

## 2026-11-08 后端设置刷新（7 任务页）

二级页收敛为 `[connection, providers, model, execution, account, mcp, sessions]`（默认 connection）；attachTabbed 别名 advanced→execution、resources→sessions，旧 9 页 id 全部可达。connection 页的运行时状态改为真实探测：异步 `adapter.start()`（resolvePiSdkCli 真实解析），失败按分类渲染（missing/incompatible/permission/unknown，`classifyPiInstallFailure`），不把原始 CLI 错误文本带入 DOM；注册了 adapter 不等于安装可用。executablePath 保留文本输入（自由路径）+ vault/new-session/medium 徽章。model 页 = 插件旧默认（thinkingLevel 原生 radio choice + provider/model 文本）+ 原生 model 组字段（global/project 作用域选择器保留）；写原生默认时自动清空旧默认的迁移行为不变。execution 页 = 原生 execution 组字段 + **独立高风险 disclosure**（`attachAdvanced`：advanced 组字段 + 原始 settings.json 编辑器，data-backend-risk=high），不并入普通模型页。account 页对 `get_auth` 空 providers 列表如实显示“未记录认证提供方”，不伪造认证缺失。attachTabbed append-only，共享 workspace bar 不受影响。

## 2026-11-08b 模型页重排 + 本地化思考级别

model 页改为原生 model 组字段在前（实时权威），旧版 provider/model/thinkingLevel 降级到显式标注的「旧版插件默认值（高级）」disclosure 内，不再是首屏普通行；thinking 的 inherit 选项描述缩为一句行为说明，旧默认迁移说明移出选项列表放在 disclosure 末尾；级别选项全部经 `settings.pi.thinking.level.*` 本地化（关/最低/低/中/高/极高/最大），不再出现未翻译枚举。原生枚举字段保持 radio choice 语义。
