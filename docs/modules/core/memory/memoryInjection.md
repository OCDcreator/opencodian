# Memory Injection

> **源码**: `src/core/memory/memoryInjection.ts`
> **状态**: [REVIEW]

## 概述

注入计划（D-O2/D-O3/D-O4 契约的核心）：把协议文本 + 索引块 +（可选）召回正文 + 卫生提示合并为一个带 `NOT a request` 框架的注入块。epoch 检测 `transcriptHasInjectionThisEpoch()` 从持久化转录扫描注入开标记（压缩 Divider 之后重置）——插件重载后对持久化注入部件的后端依然稳健。

## 关键导出

| 导出 | 说明 |
|------|------|
| `planMemoryInjection()` | 纯函数：全部输入显式传入 → `MemoryInjectionPlan`（text/skipReason/indexBytes/protocolBytes/召回与守卫信息） |
| `transcriptHasInjectionThisEpoch()` | 标记扫描（user content 与 parts 双探测） |
| `MemoryInjectionRequest` | 回合传给记忆运行时的结构形状 |

## 边界与约束

- 偏离 zmem 的 per-request system.transform：本仓接缝在消息层且服务端转录会累积，故每 context epoch 注入一次（首回合 + 压缩后重注入）。
