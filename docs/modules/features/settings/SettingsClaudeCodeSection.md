# SettingsClaudeCodeSection

> **源码**: `src/features/settings/SettingsClaudeCodeSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsClaudeCodeSection` 负责 Claude Code backend 的 Phase A/Phase 2 设置面板。它通过 Claude Code 二级标签路由不同配置分组，暴露当前已有 adapter wiring 与测试覆盖的 runtime、模型思考、权限、上下文来源、MCP/Advanced 入口；backend 启用仍由 `SettingsBackendSection` 负责，本 section 不注册 runtime，也不导入官方 Claude SDK。

## 职责

- 在 Runtime 标签渲染 Claude Code executable path、认证/环境提示和 runtime diagnostics
- 在 Model & Thinking 标签渲染 model、fallback model、thinking dropdown、thinking budget 和 effort dropdown
- adaptive / disabled thinking 下不渲染 thinking budget，避免显示不会生效的空编辑控件；fixed thinking 下保留用户已有 budget
- 在 Permissions 标签渲染 permission mode dropdown
- 在 Context & Sources 标签渲染 setting sources toggles（user/project/local）和 additional directories textarea
- 在 MCP / Advanced 标签渲染 allowed tools、disallowed tools、max turns、max budget USD 和 env variables 输入，这些字段只进入 SDK options，不宣称 MCP tool execution 已完成 runtime proof
- 将多标签设置输入写入 `settings.backendSettings.claudeCode`
- 通过 `ClaudeCodeProcessResolver` 做本地进程解析诊断，帮助检查 bundled/default resolution 与外部 CLI path
- 保持 hooks、skills authoring、agent authoring、external SessionStore、JSONL import 等未完成能力不在 UI 中暴露，直到对应 phase 有端到端 runtime proof

## 公共导出

- `SettingsClaudeCodeSection`: 构造参数包含 `plugin`、`createSectionHeading()`，以及测试/诊断可注入的 `resolveProcess()`。`attach()` 用于 classic 设置页，`attachTabbed()` 用于 tabbed 设置页。

## 集成

- `OpenCodianSettings`: classic 设置页在 General 后挂载本 section
- `OpenCodianSettingsView`: editor-area classic 设置页复用本 section
- `SettingsTabbedRenderer`: `claude-code/runtime`、`claude-code/model-thinking`、`claude-code/permissions`、`claude-code/context-sources`、`claude-code/mcp-advanced` 标签路由到本 section
- `settingsLayoutRegistry`: 声明 `claude-code` 配置标签，但不设置 `backendRequired`
- `ClaudeCodeProcessResolver`: runtime diagnostics 按当前 Claude settings 解析 process mode

## 维护约束

- 该 section 是 Phase A 多标签设置 surface；不要把 SDK option builder 支持的字段等同于已经可以给用户操作的产品能力
- 新增或调整 Claude Code 二级标签时，同步 `renderTabContent()` 路由、classic `attach()` 分组、settings layout registry、locale 文案、稳定 `data-settings-target` / `data-claude-code-section` 属性和测试覆盖
- 该 section 不应直接依赖 `@anthropic-ai/claude-agent-sdk`；真实 SDK runtime 由 `ClaudeCodeAdapter` / `ClaudeCodeSdkLoader` 负责
- 所有文案必须通过 locale key 获取
- 修改字段时同步 `src/core/types/settings.ts` 的默认值/normalizer 和 `SettingsClaudeCodeSection.test.ts`
