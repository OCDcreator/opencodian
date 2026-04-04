# Core Security Barrel

> **源码**: `src/core/security/index.ts`
> **状态**: [DRAFT]

## 概述

安全辅助模块的最小公开入口。目前它只重新导出 `BlocklistChecker` 中的 `isCommandBlocked()`，让调用方可以通过更短路径使用命令黑名单检查能力。

## 导入关系

```text
上游: ./BlocklistChecker
下游: OpenCodeService、权限相关逻辑、测试
```

## 核心类型 / 接口

```typescript
export { isCommandBlocked } from './BlocklistChecker';
```

## 核心逻辑

### 单一公开能力

当前 barrel 只暴露“判断命令是否命中黑名单”这一项能力，没有额外封装。

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `isCommandBlocked()` | 检查命令是否被安全黑名单阻止 |

## 数据流

典型消费链路为：工具调用准备执行 -> 调用 `isCommandBlocked()` -> 命中时拦截并返回风险信息。

## 与其他模块的交互

- 真实实现位于 [BlocklistChecker.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/core/security/BlocklistChecker.md)
- 上层通过该 barrel 可以避免深路径 import

## 配置项

无。黑名单来源和配置解释由 `BlocklistChecker` 负责。

## 注意事项

- 如果未来安全模块暴露更多 API，需要重新审视是否继续保持“单函数 barrel”

## 待补充

- [ ] 记录当前有哪些调用方走的是 barrel 而不是直接导入实现文件

