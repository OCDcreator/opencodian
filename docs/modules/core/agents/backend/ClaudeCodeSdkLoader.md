# ClaudeCodeSdkLoader

> **源码**: `src/core/agents/backend/ClaudeCodeSdkLoader.ts`
> **状态**: [REVIEW]

## 概述

`ClaudeCodeSdkLoader` 把官方 `@anthropic-ai/claude-agent-sdk` 动态加载为 OpenCodian 内部的 `ClaudeCodeSdkFacade`。它是生产 runtime 从 mock facade 过渡到官方 SDK 的唯一入口。生产构建会保留 literal dynamic import，让 esbuild 把 SDK 主包收进 `main.js`；平台 Claude Code binary 仍由构建脚本复制到 `dist/node_modules/@anthropic-ai/claude-agent-sdk-<platform>/`。

## 职责

- 通过 literal dynamic `import('@anthropic-ai/claude-agent-sdk')` 加载官方 SDK，让生产 bundle 能解析并打包 SDK 主包
- 暴露 `query({ prompt, options })`，并在当前 SDK 提供时透传 `listSessions()`、`getSessionInfo()`、`forkSession()`、`renameSession()`
- 避免 `ClaudeCodeAdapter` 直接依赖第三方 SDK 模块形状，保留测试注入 seam

## 公共导出

- `loadClaudeCodeSdk()`: 返回实现 `ClaudeCodeSdkFacade` 的对象。

## 集成

- `ClaudeCodeAdapter` 仍通过构造参数接收 facade；生产注册时调用本 loader，单测继续注入 fake SDK。
- `backend/index.ts` 从 barrel 导出本 loader，供 `main.ts` 或 runtime smoke 使用。

## 维护约束

- 不在本模块中保存 session 状态或做 OpenCodian stream normalizing；session API 只做 facade 透传，身份映射责任属于 `ClaudeCodeAdapter`
- 官方 SDK API 变动时优先在本 loader 与 `ClaudeCodeOptionsBuilder` 收口兼容
- 不要把 SDK import specifier 改成变量拼接；那会让 esbuild 失去静态解析能力，Obsidian/Test Vault 产物可能再次出现 SDK 找不到或 `import.meta.url` 运行时错误。
