# BlocklistChecker

> **源码**: `src/core/security/BlocklistChecker.ts`
> **状态**: [REVIEW]

## 概述

`BlocklistChecker.ts` 目前只导出一个纯函数 `isCommandBlocked()`，用于把待执行命令与用户配置的黑名单模式逐条匹配，并返回布尔结果。它不负责读取设置，也不返回命中的具体模式。

## 导入关系

```text
上游: 无模块级依赖
下游: 当前仓库内未检索到函数调用点
```

## 核心类型 / 接口

```typescript
export function isCommandBlocked(
  command: string,
  patterns: string[],
  enableBlocklist: boolean
): boolean;
```

## 核心逻辑

### 总开关短路

当 `enableBlocklist` 为 `false` 时，函数立即返回 `false`，不会检查任何模式。

### 匹配顺序

当开关开启后，函数对 `patterns` 使用 `Array.prototype.some()`，任意一条命中就返回 `true`。

每条 pattern 的处理规则是：

1. 长度大于 `500` 时，不尝试构建正则，直接做大小写不敏感的子串匹配
2. 否则尝试 `new RegExp(pattern, 'i')`
3. 如果正则构造失败，再回退到大小写不敏感的子串匹配

### 大小写处理

正则路径始终使用 `i` 标志。

子串回退路径则把 `command` 和 `pattern` 都转成小写后做 `includes()`。

## 关键常量 / 方法

| 项目 | 说明 |
|------|------|
| `MAX_PATTERN_LENGTH` | 500，超过时一律走子串匹配 |
| `isCommandBlocked()` | 返回命令是否应被阻止 |

## 与其他模块的交互

- 平台默认黑名单模式并不在这里定义，而是在 `src/core/types/settings.ts` 的 `getDefaultBlockedCommands()` / `getBashToolBlockedCommands()`。
- 这个模块只消费调用方传入的 `patterns` 和布尔开关，不知道这些模式是来自用户设置、权限卡片还是其他来源。

## 注意事项

- 函数不会过滤空字符串 pattern；如果调用方传入 `''`，正则分支会把所有命令都判定为命中。
- 函数不会返回“哪一条规则命中”，因此如果 UI 需要展示命中原因，必须在调用侧再做一遍解释。
- 长模式回退到子串匹配是出于安全和稳定性考虑，不是严格的正则语义。
- 当前单测已覆盖：总开关短路、大小写无关 regex、非法 regex 回退、超长 pattern 回退、正常不命中。
