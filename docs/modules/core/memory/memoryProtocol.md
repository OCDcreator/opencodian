# Memory Protocol

> **源码**: `src/core/memory/memoryProtocol.ts`
> **状态**: [REVIEW]

## 概述**

注入给模型的 `# Memory` 协议原文（zmem D10/D17 孪生）：教模型用文件写工具按 frontmatter 格式写记忆、维护 `MEMORY.md` 索引行、按类型分区与归档规则、合并去重规则，以及 lane-split（本目录 vs AGENTS.md/CLAUDE.md）。本仓适配（D-O8）：维护入口是插件记忆命令而非 `/zmem`。

## 关键导出

| 导出 | 说明 |
|------|------|
| `buildMemoryProtocol(memoryRootDisplay)` | 协议全文；目录路径带尾分隔符运行时替换 |
| `MEMORY_INJECTION_OPEN/CLOSE_MARKER` | 注入块的开/闭标记，epoch 检测按开标记 grep |

## 边界与约束

- 协议文本无产品名（branding 中性）；引用的归档尾标常量来自 `memoryIndexFormat.ARCHIVED_SECTION_MARKER`。

2026-10-28：索引预算文案改为 25,000 字符；新增从当前 opencode-zmem 移植的 buildAgentMemoryProtocol（user scope、独立代理目录、长版记忆分类/正文结构/读取与陈旧校验规则）。项目协议继续使用既有 Lane Split。
