# Memory Backend Service

> **源码**: `src/core/memory/MemoryBackendService.ts`
> **状态**: [REVIEW]

## 概述

面向单一工作区的记忆编排服务（core.memory owner 的入口类）：构造时以 FS 端口 + 工作区路径解析桶，之后提供注入计划、每轮抽取、压缩反思与维护（status/lint/forget）四组能力。所有模型接触经调用方传入的 `MemoryModelInvoker` 端口；全部公开方法 fail-soft（错误进 outcome / 度量，绝不抛进用户回合）。度量以 JSONL 追加到 `.opencodian/memory/metrics.jsonl`，注入成功另写 `.last-injection.json` sidecar。

## 关键方法

| 方法 | 说明 |
|------|------|
| `ensureRoot()` | 只建桶目录，从不自动创建 MEMORY.md（D22） |
| `planInjection()` | 读索引+清单 → epoch 检测（标记扫描 ‖ 调用方覆盖位）→ `MemoryInjectionOutcome` + 度量 |
| `runExtraction()` | 闸门 → 提示词 → invoker → 解析 → 写计划 → 落盘；返回 written/skipped/error + modelCalls（成本指标） |
| `runReflection()` | 压缩后蒸馏 ≤3 条（compacted 来源 + reflection 标记） |
| `lint()` / `status()` / `forget()` | 密钥命中/缺重要度/游离行体检；索引统计与最近注入；遗忘（删文件+索引行） |
| `readMetrics()` | 读回全部度量事件（测试与 loop 验证用） |

## 数据流

```text
发送准备 → planInjection() ──text──> AgentChatSendRequest.options.memoryInjection ──> 各后端接缝
回合结束 → runExtraction() ─闸门─> invoker(临时会话) ─解析─> writeMemoryWrites() ─> 桶/*.md + MEMORY.md + metrics.jsonl
压缩信号 → runReflection()（同上，≤3 条，compacted 盖章）
```

## 边界与约束

- 本类不 import 任何后端；MemoryRecallSelector 优先直接提及，再可选向量、词法+模型筛选，失败降级词法；每轮最多 3 条正文、纪元内共享预算。
- 构造器可选覆盖 `{ projectDir, metricsFs }`：共享存储模式下 `projectDir` 指向外部绝对桶目录（zmem/ZCode 布局），`metricsFs` 让 metrics 日志留在 vault 内的文件系统上。

2026-10-28：runExtraction 改用 memoryAgentExtraction 的受限 Read/Edit/Write 循环，可读改已有记忆及创建多文件；提取只处理水位后的消息，压缩标记不计入有效消息数。模型失败返回实际已尝试调用数。索引注入按实际目录检测持久化标记，切换共享桶不被旧桶标记阻止；runReflection 写前密钥和路径校验，模型调用经相同后端端口。可选 agentKey 选择独立代理协议。
