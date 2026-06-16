# ClaudeCodeProcessResolver

> **源码**: `src/core/agents/backend/ClaudeCodeProcessResolver.ts`
> **状态**: [REVIEW]

## 概述

`ClaudeCodeProcessResolver.ts` 负责 Claude Code SDK 进程环境的前置解析。它默认优先使用用户本机安装的 external Claude Code CLI：先解析 `backendSettings.claudeCode.executablePath`，没有配置时再从增强 PATH 中查找 `claude` / `claude.exe` / npm wrapper，并输出 `pathToClaudeCodeExecutable`、增强后的 env 和 Windows shell 标志。

## 职责

- 解析用户配置的外部 Claude executable，支持 `~` 展开、绝对路径和 PATH 查找
- 没有配置 executablePath 时，自动从增强 PATH 中查找默认 Claude CLI 候选（macOS/Linux: `claude`；Windows: `claude` / `claude.exe`，并覆盖 `.cmd` / `.exe` / `.bat` wrapper）
- configured path 或默认 CLI 候选必须真实存在（或能在增强 PATH 中解析到真实文件）才会进入 `external` mode；解析失败时返回 `missing` mode，并在 diagnostics 中保留 configured path
- 为 Electron / Obsidian 场景生成增强 PATH，补充 macOS GUI 常缺失的 Homebrew/npm/nvm 路径和 Windows npm/bin 候选路径
- 在 Windows `.cmd` / `.bat` executable 时标记 `shell: true`
- 输出诊断信息：configured path、resolved external path、PATH 是否被增强

## 维护约束

- `resolveExecutableCandidate` 已导出，可用于其他需要 PATH 解析可执行文件的场景（如 MCP stdio server 的 `command` 字段解析）。支持 `~` 展开、绝对路径保留、PATH 条目遍历和平台扩展名（Windows `.cmd`/`.exe`/`.bat`）。解析失败时返回 `null`，调用方自行决定回退策略。
- 不负责 spawn 进程；后续 Claude adapter 或 SDK integration owner 使用本模块输出。
- 不再依赖官方 SDK optional platform binary package 作为 bundled fallback；找不到 external CLI 时调用方应提示用户安装 Claude Code CLI 或配置 executable path。
- PATH 增强只能影响 resolver 返回的 env，不要直接修改 `process.env`。
