# SettingsToolFileService

> **源码**: `src/features/settings/SettingsToolFileService.ts`
> **状态**: [REVIEW]

## 概述

`SettingsToolFileService` 是 Tools settings 自定义工具文件的文件系统 helper。它把 `.opencode/tools` 项目工具发现、默认工具模板创建、全局 tools 只读发现，以及工具源码读取从 `SettingsToolSection` 中拆出，让 settings owner 只负责 UI 和权限交互。

## 关键导出

- `SettingsToolFileService`: 读取 / 创建 / 删除 OpenCode custom tool 文件的 class。

## 核心逻辑

- `getCustomToolFiles()` 并行读取项目工具与全局工具，排序时项目来源优先，然后按工具名排序。
- `createProjectTool()` 选择第一个可用的 `new-tool*.ts` 路径，逐级确保 `.opencode/tools` 目录存在，再写入 OpenCode 文档推荐的 `export default tool({ ... })` 模板。
- `deleteProjectTool()` 只删除项目工具文件，调用方负责确认与只读来源判断。
- `readToolFileContent()` 对项目文件走 Obsidian vault adapter，对全局文件走 Node `fs` 只读读取。
- `listVaultToolFiles()` 递归读取 `.ts` / `.js` / `.mjs` / `.cjs` 文件，并吞掉目录不存在或 adapter 失败的错误，让设置页保持可打开。

## 依赖

- `obsidian.normalizePath`: 规范 vault-relative 目录创建路径。
- `fs` / `os` / `path`: 发现和读取 `~/.config/opencode/tools` 全局工具。
- `src/main`: `OpenCodianPlugin` 类型。
- `SettingsToolDetailModal`: 复用 `ToolFileInfo` 与 `VaultAdapterLike` 类型。

## 注意事项

- 该 service 不解析工具 schema，也不调用 OpenCode runtime；runtime catalog 仍由 `OpenCodeCatalogStateStore` 提供。
- 全局工具只读发现，写入路径只限当前 vault 的 `.opencode/tools`。
- 如果后续支持重命名或 named export 级权限，优先扩展这个 service 的文件读取/命名 helper，避免把文件系统细节重新塞回 UI owner。
