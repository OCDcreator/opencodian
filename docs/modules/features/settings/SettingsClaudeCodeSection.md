# SettingsClaudeCodeSection

> **源码**: `src/features/settings/SettingsClaudeCodeSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsClaudeCodeSection` 负责 Claude Code backend 的 Phase A/Phase 2 设置面板。它通过 Claude Code 二级标签路由不同配置分组，暴露当前已有 adapter wiring 与测试覆盖的 runtime、模型思考、权限、上下文来源、工具策略和 SDK foundation 入口；backend 启用仍由 `SettingsBackendSection` 负责，本 section 不注册 runtime，也不导入官方 Claude SDK。

## 职责

- 在 Runtime 标签渲染 restart-sensitive runtime boundary notice、Claude Code executable path、带只读状态标记的认证/环境提示、runtime diagnostics、env variables 的 runtime readback verified proof-status notice 和 env variables 输入
- 在 Model & Thinking 标签渲染 model、fallback model、thinking dropdown、thinking budget 和 effort dropdown；effort 选项与官方 Claude Code CLI/SDK 对齐为 low / medium / high / xhigh / max。该标签同时承载 max turns 和 max budget USD 限制控件，并在这些控件前渲染 limits proof-status notice（runtime readback verified）和 limits boundary notice，提示这些设置只在下一次 query 生效并提供 restart 操作。fallback model 控件后渲染 `renderFallbackModelBoundaryNotice()`，提示 fallbackModel 需要重启/下一次查询才能生效，无法像主 model 一样在活跃流中实时更新，且自动 fallback 行为在当前 SDK 下尚未验证
- model 保存时会通过当前注册的 Claude adapter 调用 `setModel()`，让活跃持久 query 尽量 live 更新；没有活跃 query 或 adapter 不可用时仍只保存设置，下一次 query 会读取新值
- Model & Thinking 标签在 model / fallbackModel 文本输入下方各渲染一个 `renderModelQuickSelect()` / `renderFallbackModelQuickSelect()` 下拉框。下拉框在标签渲染时自动通过当前 Claude adapter 异步调用 `supportedModels()` 加载可用模型目录；用户从下拉框选择模型后，会自动更新上方的文本输入值并保存设置（主模型还会尝试 live apply）。该设计将目录发现与字段输入收敛为统一的 quick-select 体验，既保留文本输入的自由度（支持自定义模型名），又让用户不必仅靠 placeholder 猜测合法模型 ID。目录结果在实例级别缓存，避免重复请求
- adaptive / disabled thinking 下不渲染 thinking budget，避免显示不会生效的空编辑控件；fixed thinking 下保留用户已有 budget
- 在 Permissions 标签渲染 permission mode dropdown；保存时会通过 Claude adapter 调用 `setPermissionMode()` 尝试更新活跃 query
- 在 Context & Sources 标签渲染 setting sources toggles（user/project/local）、项目来源文件可见性（`CLAUDE.md`、`.claude/settings.json`、`.claude/settings.local.json`）、restart-sensitive runtime boundary notice 和 additional directories textarea
- Runtime 与 Context & Sources 标签都提供 “Restart sessions” 操作，调用 Claude adapter 的 `restartPersistentQueries('settings-change')`，只关闭活跃持久 query，不删除 session；下一次发送会用最新 source/directory/env/tool/limit options 重新启动并在可能时 resume
- 在 Tools 标签渲染 restart-sensitive runtime boundary notice、MCP runtime 只读状态与刷新按钮、allowed/disallowed tools 的 runtime readback verified proof-status notice，以及 allowed/disallowed tools 输入；MCP 控制只调用当前 Claude adapter 的 `getMcpServerCount()` / `reloadMcpServers()`，不写入 `.claude/mcp.json`，刷新失败会保留明确错误状态
- Max turns 和 max budget USD 输入必须是完整正数，`12abc` / `5usd` 这类部分数字会归一化为 unlimited/null，空白仍保持 unlimited/null
- Environment variables 输入通过 `parseEnv()` 解析，只接受标准 POSIX 键名（`[A-Za-z_][A-Za-z0-9_]*`），含空格、连字符或以数字开头的键会被静默丢弃；值部分保留trim后的原始内容
- Allowed/disallowed tools 输入通过 `parseToolList()` 解析，只接受 PascalCase 字母数字工具名（`[A-Za-z][A-Za-z0-9]*`），含空格、连字符或以数字开头的名称会被静默丢弃；UI 描述中明确标注此路径已连接但尚未经过运行时验证
- 在 SDK Foundations 标签渲染 runtime-only plugin / skill / agent definition 只读摘要，以及 file checkpoint、hook event stream、subagent transcript/progress 开关；hook/subagent 控件前会显示可见的 diagnostic stream boundary notice。agent definition 摘要与 plugin/skill 摘要并排显示在 runtime ecosystem 块中，通过 `adapter.getAgentDefinitionCount()` 与 `adapter.getAgentDefinitionsList()` 读取配置状态。这些字段只进入 SDK options / diagnostic/experimental stream，不宣称 MCP authoring、skills/plugins authoring、agent authoring、hook authoring、stable rewind、structured-output UI 或 full subagent transcript UI 已完成
- 将多标签设置输入写入 `settings.backendSettings.claudeCode`
- 通过 `ClaudeCodeProcessResolver` 做本地进程解析诊断，帮助检查 bundled/default resolution 与外部 CLI path
- 新增 `renderToolsProofStatusNotice()`、`renderLimitsProofStatusNotice()` 和 `renderEnvProofStatusNotice()` 三个 compact proof-status notice 方法，在对应标签中渲染 runtime readback verified 状态；样式位于 `src/style/components/settings-claude-code.css`，使用 `data-proof-state="readback"` 和 `data-claude-code-proof-status` 选择器
- 保持 hook authoring、skills authoring、agent authoring、external SessionStore、JSONL import/browser 等未完成能力不在 UI 中暴露，直到对应 phase 有端到端 runtime proof

## 公共导出

- `SettingsClaudeCodeSection`: 构造参数包含 `plugin`、`createSectionHeading()`，以及测试/诊断可注入的 `resolveProcess()`。`attach()` 用于 classic 设置页，`attachTabbed()` 用于 tabbed 设置页。

## 集成

- `OpenCodianSettings`: classic 设置页在 General 后挂载本 section
- `OpenCodianSettingsView`: editor-area classic 设置页复用本 section
- `SettingsTabbedRenderer`: `claude-code/runtime`、`claude-code/model-thinking`、`claude-code/permissions`、`claude-code/context-sources`、`claude-code/tools`、`claude-code/sdk-foundations` 标签路由到本 section
- `settingsLayoutRegistry`: 声明 `claude-code` 配置标签，但不设置 `backendRequired`
- `ClaudeCodeProcessResolver`: runtime diagnostics 按当前 Claude settings 解析 process mode

## 维护约束

- 该 section 是 Phase A 多标签设置 surface；不要把 SDK option builder 支持的字段等同于已经可以给用户操作的产品能力
- SDK Foundations 中 hook/subagent stream 开关虽可配置，但必须伴随 diagnostic/experimental 边界提示；除非有新的稳定 E2E proof，不得把它们写成 hook authoring 或完整 transcript/progress 产品能力
- 新增或调整 Claude Code 二级标签时，同步 `renderTabContent()` 路由、classic `attach()` 分组、settings layout registry、locale 文案、稳定 `data-settings-target` / `data-claude-code-section` 属性和测试覆盖
- 该 section 不应直接依赖 `@anthropic-ai/claude-agent-sdk`；真实 SDK runtime 由 `ClaudeCodeAdapter` / `ClaudeCodeSdkLoader` 负责
- 所有文案必须通过 locale key 获取
- 修改字段时同步 `src/core/types/settings.ts` 的默认值/normalizer 和 `SettingsClaudeCodeSection.test.ts`
