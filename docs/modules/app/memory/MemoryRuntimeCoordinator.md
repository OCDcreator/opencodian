# Memory Runtime Coordinator

> **源码**: `src/app/memory/MemoryRuntimeCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`app.memory-runtime` owner 的实现（镜像 `DiagnosticsRuntimeCoordinator` 组合模式）：构造 vault FS 适配器 + `MemoryBackendService` + OpenCode invoker，维护每会话的注入纪元 / 抽取水位 / 压缩标记计数，防抖后触发每轮抽取与压缩反思，并注册记忆维护命令（状态 / 体检 / 遗忘）。全部入口 fail-soft。

## 关键方法

| 方法 | 说明 |
|------|------|
| `planInjection()` | 纪元去重后委托 service；返回 `{text} \| null`，绝不抛错 |
| `onTurnSettled()` | 防抖（默认 1500ms，可注入覆盖）→ 读会话消息 → 压缩标记增加则先反思再抽取 |
| `registerCommands()` | 命令面板注册 status / lint / forget（forget 走输入模态，确认制） |
| `invokeModel()` | 临时 OpenCode 会话（`setCurrent:false`，finally 删除）+ `provider/model` 解析 |

## 数据流

```text
MessageSendPreparationService ──planMemoryInjection──> 本类 ──> service.planInjection
SendPipelineRuntime(finally) ──onTurnSettled──> 防抖 ──> runExtraction / runReflection ──> OpenCodeService 临时会话
```

## 边界与约束

- 禁止 import 任何 feature 层与后端适配器；聊天接线反向经宿主端口流入。
- `VaultMemoryFileSystem.mtimeMs` 经 node fs stat（dotfile 不被 Obsidian 索引），失败返回 null。
