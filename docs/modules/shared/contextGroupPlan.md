# ContextGroupAttachPlan

> **源码**: `src/shared/contextGroupPlan.ts`
> **状态**: [REVIEW]

## 概述

上下文组一键附加的**纯规划器**（docs/requirements/flowtext-parity.md R-B2）。上下文组是可以大于单次附加上限的有序路径列表；行内编辑面板与聊天 composer 两个附加面共享同一套确定性规则，收在这里以便单测：

- 按组内顺序附加；已附加（或组内重复）的路径静默跳过，与手工重复附加语义一致；
- 达到上限后剩余的条目计入 `omittedCount`——由调用方明确提示，**绝不静默截断**；超限条目不再做存在性解析；
- 解析失败（笔记被移动/删除）的条目计入 `missingPaths`，跳过并报告，附加本身不报错；
- `cap` 传 `Infinity` 表示该表面无单次上限（聊天 composer）。

## 公开接口

```typescript
interface ContextGroupAttachCandidate { readonly path: string }
interface ContextGroupResolvedEntry<T> { readonly path: string; readonly entry: T }
interface ContextGroupAttachPlan<T> {
  readonly toAttach: readonly ContextGroupResolvedEntry<T>[];
  readonly omittedCount: number;
  readonly missingPaths: readonly string[];
}
planContextGroupAttach<T>(options: {
  entries: readonly ContextGroupAttachCandidate[];
  resolve: (path: string) => T | null;      // null = 缺失
  existingPaths?: ReadonlySet<string>;       // 已附加集合（去重用）
  cap: number;                               // Infinity = 无上限
}): ContextGroupAttachPlan<T>

interface ContextGroupSummary { readonly id: string; readonly name: string; readonly entryCount: number }
summarizeContextGroup(group: { id; name; entries: readonly unknown[] }): ContextGroupSummary
```

## 核心逻辑

单次顺序扫描：`existingPaths` 初始化 seen 集合；逐条判断——已见跳过 → 已满计 omitted → 解析失败计 missing（同路径只报一次）→ 成功加入 `toAttach`。上限按**实际附加数**计（缺失条目不消耗名额），与 R-A7「每个条目（文件或目录）各计 1」的已附加语义一致。

## 依赖

```text
上游: 无（零依赖纯函数）
下游: features/inline-edit/InlineEditAttachments.ts, features/chat/services/ComposerContextPickerActionService.ts
```

## 维护约束

- 只放确定性纯逻辑；vault 存在性校验由调用方注入 `resolve`；
- 省略/缺失的计数语义是 R-B2 验收的一部分，改动需同步测试（tests/unit/shared/contextGroupPlan.test.ts）。
