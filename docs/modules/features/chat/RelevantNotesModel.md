# RelevantNotesModel

> **源码**: `src/features/chat/RelevantNotesModel.ts`
> **状态**: [REVIEW]

## 概述

R-E3 相关笔记面板的纯计算半边：图谱邻居（出链+入链合并去重排序）、检索查询构造（frontmatter/代码块剔除、标记清洗、长度上限）、snippet 折叠（按笔记去重取最高分、排除活动笔记、排序截断）。无 Obsidian 依赖，全部可单测。

## 对外 API

```typescript
computeGraphNeighbours(resolvedLinks, activePath): GraphNeighbour[];
buildRetrievalQuery(noteContent, maxChars?): string;
foldRetrievalMatches(snippets, activePath, limit): RetrievalMatch[];
noteDisplayName(path): string;
```

## 不变量

- 活动笔记与自环永不入邻居表；排序 = 链接数降序 + 路径字典序平分处理。
- 查询构造剥 frontmatter（id/日期噪声）与代码块（语法噪声），标记字符折空格，默认 2000 字符上限。
- 折叠去重保最高分；平分按路径字典序（确定性）。

## 关联模块

- `src/features/chat/RelevantNotesView.ts`：渲染消费方。
