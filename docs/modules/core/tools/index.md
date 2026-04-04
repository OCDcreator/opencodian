# Core Tools Barrel

> **源码**: `src/core/tools/index.ts`
> **状态**: [REVIEW]

## 概述

`src/core/tools/index.ts` 聚合了两类导出：

- 运行时工具名常量 `TOOL_NAMES`
- 工具调用信息类型 `ToolCallInfo`

其中 `ToolCallInfo` 来自 `src/core/types/tools.ts`，而 `TOOL_NAMES` 来自当前目录下的 `toolNames.ts`。

## 导入关系

```text
上游: ./toolNames, ../types/tools
下游: 当前仓库内未检索到通过该 barrel 的直接导入
```

## 公开导出

```typescript
export type { ToolCallInfo } from '../types/tools';
export { TOOL_NAMES } from './toolNames';
```

## 聚合规则

### 混合导出类型与常量

这个 barrel 把“类型定义”和“常量表”放到同一导入面，但没有导出：

- `ToolCallStatus`
- `ToolName`

需要这两个类型时，仍然要直接从各自定义文件导入。

### 与 `src/core/types/tools.ts` 保持同步

当前仓库里存在两份工具常量定义：

- `src/core/tools/toolNames.ts`
- `src/core/types/tools.ts`

barrel 只选择了前者作为常量来源，因此维护时需要留意两份定义是否继续一致。

## 注意事项

- 如果后续要把工具相关 API 收拢到统一入口，当前 barrel 的导出面可能需要扩展 `ToolName` 等类型。
- 现有仓库里工具渲染主链更多直接使用 `src/utils/streaming/types.ts` 与 `src/core/types/chat.ts` 中的工具结构，而不是这里的 barrel。
