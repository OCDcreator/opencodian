# 工具能力块（注入的"技能"文本）

> **源码**: `src/core/obsidianTooling/obsidianToolingPrompt.ts`
> **状态**: [REVIEW]

## 概述

模型可见的能力块（路线 A 的"可用命令写进系统提示词/技能"）。`available` 变体：标记框定，声明唯一的调用路径（门脚本绝对路径）、MVP 命令面（themes/plugins/bookmarks/daily/tags/properties/orphans/search…）、确认门语义（exit 3/4/5、非零即如实上报并停止、禁止绕过门直接调用裸 CLI——此行为约束属提示层引导，机制由门脚本承担）与写类操作的 R-B3 可见性。`unavailable` 变体：三行诚实声明（能力已开启但未检测到 CLI），防止模型静默失败或即兴发挥。

## 关键导出

| 导出 | 说明 |
|------|------|
| `buildObsidianToolingBlock({availability, gatePath, cliCommand, unavailableReason?})` | 纯、确定性；两种可用性变体 |
