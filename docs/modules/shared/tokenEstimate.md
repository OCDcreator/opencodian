# tokenEstimate

> **源码**: `src/shared/tokenEstimate.ts`
> **状态**: [REVIEW]

## 概述

R-E6（advantage-parity）token 估算启发式：拉丁/数字/标点按 ~4 字符/token、CJK 按 ~1.2 token/字符（~0.85 字符/token），混排求和向上取整。**定位数字，不是计费/预算执行数字**——聊天路径的权威上下文用量仍是后端 ContextRing 快照。

## 对外 API

```typescript
estimateTokensFromText(text): number;            // 启发式 token 数（ceil）
describeTextForTokenCount(text): { chars, words, tokens };  // 词数=CJK 逐字 + 拉丁词
```

## 关联模块

- `src/main.ts`：`count-selection-tokens`（选区，空选区如实 Notice）与 `count-vault-tokens`（R-C1 范围 = `isIndexablePath` 过滤 markdown）两命令，Notice + 剪贴板。
