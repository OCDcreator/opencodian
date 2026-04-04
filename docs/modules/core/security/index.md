# Core Security Barrel

> **源码**: `src/core/security/index.ts`
> **状态**: [REVIEW]

## 概述

`src/core/security/index.ts` 是一个单导出 barrel，目前只转发命令黑名单检查函数 `isCommandBlocked()`。它没有附带类型、常量或额外安全策略。

## 导入关系

```text
上游: ./BlocklistChecker
下游: 当前仓库内未检索到通过该 barrel 的直接导入
```

## 公开导出

```typescript
export { isCommandBlocked } from './BlocklistChecker';
```

## 聚合规则

### 只转发函数本身

barrel 不转发：

- `MAX_PATTERN_LENGTH`
- 任何 settings 类型
- 任何平台默认黑名单

这些内容分别仍然定义在 `BlocklistChecker.ts` 或 `src/core/types/settings.ts`。

## 注意事项

- 如果后续新增更多安全辅助函数，这个 barrel 需要和 `docs/modules/core/security/index.md` 一起同步。
- 当前仓库没有通过 `core/security` 入口消费该函数，因此它更像是对外 API 面，而不是现有主链路的一部分。
