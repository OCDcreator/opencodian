# ClaudeCodeProcessResolver

> **源码**: `src/core/agents/backend/ClaudeCodeProcessResolver.ts`
> **状态**: [REVIEW]

## 概述

`ClaudeCodeProcessResolver.ts` 负责 Claude Code SDK 进程环境的前置解析。默认使用 SDK bundled executable；只有用户配置 `backendSettings.claudeCode.executablePath` 时，才解析 external executable 并输出 `pathToClaudeCodeExecutable`。

## 职责

- 解析用户配置的外部 Claude executable，支持 `~` 展开、绝对路径和 PATH 查找
- configured path 必须真实存在（或能在增强 PATH 中解析到真实文件）才会进入 `external` mode；不存在的绝对路径或命令会回落到 SDK bundled mode，并在 diagnostics 中保留 configured path
- 为 Electron / Obsidian 场景生成增强 PATH，补充 macOS GUI 常缺失的 Homebrew/npm/nvm 路径和 Windows npm/bin 候选路径
- 在 Windows `.cmd` / `.bat` executable 时标记 `shell: true`
- 输出诊断信息：configured path、resolved external path、PATH 是否被增强

## 维护约束

- `resolveExecutableCandidate` 已导出，可用于其他需要 PATH 解析可执行文件的场景（如 MCP stdio server 的 `command` 字段解析）。支持 `~` 展开、绝对路径保留、PATH 条目遍历和平台扩展名（Windows `.cmd`/`.exe`/`.bat`）。解析失败时返回 `null`，调用方自行决定回退策略。
- 不负责 spawn 进程；后续 Claude adapter 或 SDK integration owner 使用本模块输出。
- 默认不要寻找或强制要求本机 `claude` CLI，因为官方 SDK bundled binary 是主路径；external path 只作为用户配置 fallback/diagnostic。
- PATH 增强只能影响 resolver 返回的 env，不要直接修改 `process.env`。
