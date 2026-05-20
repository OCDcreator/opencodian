# SettingsClaudeCodeSection

> **源码**: `src/features/settings/SettingsClaudeCodeSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsClaudeCodeSection` 负责 Claude Code backend 的 Phase 1 配置基础面板。它保存 Claude Code SDK adapter 需要的本地设置和诊断提示；backend 启用仍由 `SettingsBackendSection` 负责，本 section 不注册 runtime，也不导入官方 Claude SDK。

## 职责

- 渲染 Claude Code executable path、setting sources、permission mode、model/fallback model、thinking/effort、additional directories 和 runtime diagnostics
- 将 UI 输入写入 `settings.backendSettings.claudeCode`
- 通过 `ClaudeCodeProcessResolver` 做本地进程解析诊断，帮助检查 bundled/default resolution 与外部 CLI path
- 保持 hooks、skills authoring、agent authoring、external SessionStore、JSONL import 等高级能力不在 Phase 1 UI 中暴露

## 公共导出

- `SettingsClaudeCodeSection`: 构造参数包含 `plugin`、`createSectionHeading()`，以及测试/诊断可注入的 `resolveProcess()`。`attach()` 用于 classic 设置页，`attachTabbed()` 用于 tabbed 设置页。

## 集成

- `OpenCodianSettings`: classic 设置页在 General 后挂载本 section
- `OpenCodianSettingsView`: editor-area classic 设置页复用本 section
- `SettingsTabbedRenderer`: `claude-code/runtime` 标签路由到本 section
- `settingsLayoutRegistry`: 声明 `claude-code` 配置标签，但不设置 `backendRequired`
- `ClaudeCodeProcessResolver`: runtime diagnostics 按当前 Claude settings 解析 process mode

## 维护约束

- 该 section 是配置基础，不得把 `claude-code` 加入 `IMPLEMENTED_AGENT_BACKENDS`
- 该 section 不应直接依赖 `@anthropic-ai/claude-agent-sdk`；真实 SDK runtime 由 `ClaudeCodeAdapter` / `ClaudeCodeSdkLoader` 负责
- 所有文案必须通过 locale key 获取
- 修改字段时同步 `src/core/types/settings.ts` 的默认值/normalizer 和 `SettingsClaudeCodeSection.test.ts`
