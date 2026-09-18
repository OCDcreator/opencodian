# Obsidian 工具注入（选项袋接缝）

> **源码**: `src/core/obsidianTooling/obsidianToolingInjection.ts`
> **状态**: [REVIEW]

## 概述

镜像 D-O2 记忆注入契约的后端无关注入（R-B4）：块文本经发送选项袋键 `obsidianToolingInjection` 到达各适配器接缝——opencode 翻译为合成 text part，claude/codex/pi 前缀到消息文本；不消费该键的后端不受影响。与记忆接缝相同，每 context epoch 注入一次：内存中的压缩水位（适配不持久化注入文本的后端）+ 转录标记扫描（对持久化注入的后端跨插件重载稳健）。

## 关键导出

| 导出 | 说明 |
|------|------|
| `planToolingInjection()` | 纯计划：blockText 为 null 即 disabled（模式关闭时不产生任何注入） |
| `transcriptHasToolingInjection()` / `toolingEpochMarkerCount()` | epoch 检测（content 与 parts 双探测；summary/compactionDivider 重置） |
| `extractObsidianToolingInjection()` / `prependObsidianToolingInjection()` | 四适配器共用的选项袋读取/前缀帮助器 |
