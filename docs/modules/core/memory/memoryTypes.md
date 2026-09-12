# Memory Types

> **源码**: `src/core/memory/memoryTypes.ts`
> **状态**: [REVIEW]

## 概述

记忆核心的共享类型与原语：设置快照（`MemorySettingsSnapshot`）、结构化转录切片（`MemoryTranscriptMessage`）、文件系统端口（`MemoryFileSystem`）、模型调用端口（`MemoryModelInvoker`）、度量事件（`MemoryMetricEvent`）与 UTF-8 字节长度助手 `byteLength`。它是整个 owner 自包含的关键：用结构化类型替代对 `core/types/chat.ts` 的依赖。

## 关键导出

| 导出 | 说明 |
|------|------|
| `MemorySettingsSnapshot` | 4 个设置字段的只读快照；`DEFAULT_MEMORY_SETTINGS` 提供默认值（总开关默认 false） |
| `MemoryTranscriptMessage` | 对持久化 `ChatMessage` 的结构化子集：role/content/summary/compactionDivider/toolCalls/parts |
| `MemoryFileSystem` | vault 相对 posix 路径的 FS 端口；`mtimeMs` 可为 null（dotfile 不被 Obsidian 索引） |
| `MemoryModelInvoker` | 一次性 JSON 蒸馏调用端口（system/user/modelRef/title），实现可抛错 |
| `MemoryMetricEvent` | 追加到 `metrics.jsonl` 的一条度量（kind/conversationId/detail/bytes） |
| `byteLength()` | UTF-8 字节数；TextEncoder 优先、Buffer 兜底（jsdom 测试环境） |

## 边界与约束

- 任何字节预算判断必须用 `byteLength()`，禁止 `String.length`（CJK 3 字节/字符）。
