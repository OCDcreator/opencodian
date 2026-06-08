# SettingsToolDetailModal

> **源码**: `src/features/settings/SettingsToolDetailModal.ts`
> **状态**: [REVIEW]

## 概述

`SettingsToolDetailModal` 是 Tools settings 自定义工具文件的源码编辑弹窗。它从 `SettingsToolSection` 拆出，专门负责项目 `.opencode/tools/*.{ts,js,mjs,cjs}` 文件的打开、轻量校验、保存和删除；全局 `~/.config/opencode/tools` 文件只读展示。

## 关键导出

- `ToolDetailModal`: 自定义工具源码 modal。
- `ToolFileInfo`: 工具定义文件的名称、路径、来源和可选内容。
- `ToolFileSource`: `project` / `global` 来源枚举。
- `VaultAdapterLike`: modal 与 section 共用的 Obsidian vault adapter 最小接口。

## 核心逻辑

- `onOpen()` 构建源码 textarea、校验区域和 footer actions。
- 项目工具文件可编辑并显示 Save / Delete / Close；全局工具文件 textarea 禁用，只显示 Close。
- `validateToolSource()` 执行轻量校验：文件名必须是小写字母/数字加连字符或下划线，内容不能为空，并且包含 `tool(...)` 或 `execute` 函数。
- `save()` 通过 `plugin.app.vault.adapter.write()` 写回项目相对路径，并触发 `onSaved()` 刷新父 section。
- `delete()` 先弹出确认，再通过 `adapter.remove()` 删除项目工具文件，并触发父 section 刷新。
- `save()` / `delete()` 是 OpenCode-owned 项目工具写操作，会在执行前重新检查 active backend。若 modal 打开后切到 Claude Code，stale Save/Delete 只显示 Tools OpenCode-only Notice，不写入或删除 `.opencode/tools`，也不触发父 section 的 refresh/restart callback。

## 依赖

- `obsidian`: `Modal` / `Notice`。
- `src/i18n`: Tools 自定义工具相关翻译键。
- `src/main`: `OpenCodianPlugin` 类型。

## 注意事项

- 该 modal 不执行、加载或解析工具 schema；OpenCode runtime 仍是工具发现和执行的真相源。
- 校验只做用户友好的基本防呆，不尝试完整 TypeScript/JavaScript 解析。
- 全局工具文件保持只读，避免一个 vault 的设置页意外修改用户级 OpenCode tools。
