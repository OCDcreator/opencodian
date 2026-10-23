# ServerReferenceContextService

> **源码**: `src/features/chat/services/context/ServerReferenceContextService.ts`
> **状态**: [REVIEW]

## 概述

Read-only service that resolves whether the connected OpenCode server supports `v2.reference.list` / `v2.fs.list`, allowing the context picker to show a server-side read-only hint. Never throws; absorbs capability lookup failures as "unsupported".

## 核心逻辑

- `resolveServerReferenceAvailability(plugin)` 返回 `{ references: boolean; filesystem: boolean }`。
- 通过 `plugin.openCodeService.requireSdkCapability('v2.reference.list')` 与 `requireSdkCapability('v2.fs.list')` 判断可用性。
- 任何异常都被吸收为 unsupported，绝不阻断 Chat 主链。

## 与其他模块的交互

- 被 `ContextFilePickerModal` 与 context picker 链路消费，用于显示只读 server hint banner。
- 不创建独立的 filesystem 浏览器；vault 文件选择行为不变。

## 目录定位（2026-10-23）

- 源码位置：`src/features/chat/services/context/ServerReferenceContextService.ts`。
- 原位置：`src/features/chat/services/ServerReferenceContextService.ts`；文件名、导出接口与业务职责保持不变。
