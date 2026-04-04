# Tool Execution 工具函数

> **源码**: `src/shared/toolExecution.ts`
> **状态**: [DRAFT]

## 概述

共享的工具调用执行状态解析逻辑。根据工具执行状态、结果文本和元数据判断工具调用的最终状态（pending/running/completed/error/blocked）。包含 bash 工具特有的失败模式检测和权限拒绝模式识别。

## 导入关系
上游: 无（纯工具模块）
下游: `OpenCodianView` (tool call 状态解析), `ToolCallRenderer` 间接使用

## 核心类型 / 接口

### ToolExecutionStatus
```typescript
type ToolExecutionStatus = 'pending' | 'running' | 'completed' | 'error' | 'blocked';
```

### ToolExecutionStateLike
```typescript
interface ToolExecutionStateLike {
  status?: string;
  output?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}
```

### ResolveToolExecutionStatusOptions
```typescript
{
  toolName?: string;
  state?: ToolExecutionStateLike | null;
  storedStatus?: ToolExecutionStatus | null;
  result?: string | null;
}
```

## 核心逻辑

### 状态解析优先级

`resolveToolExecutionStatus(options)` 按以下顺序判断：

1. **blocked**: `storedStatus === 'blocked'` 或 `state.status === 'blocked'` 或结果匹配拒绝模式
2. **pending/running**: `state.status` 或 `storedStatus` 直接值
3. **error**: 显式错误标记或 bash 失败模式
4. **completed**: `storedStatus === 'completed'` 或有结果文本
5. **running**: 默认回退

### 权限拒绝检测

`isToolExecutionBlocked()` 检查三种拒绝模式：
- `"the user dismissed this question"`
- `"the user rejected permission to use this specific tool call"`
- `"the user has specified a rule which prevents you from using this specific tool call"`

### 错误检测

`isToolExecutionError()` 多层检测：
1. `toolName === 'invalid'`
2. `state.status === 'error'`
3. `state.error` 非空
4. 结果以 `"Error:"` 开头
5. 元数据中 `success=false`, `ok=false`, `failed=true`, `failed>0`, `exitCode!==0`
6. bash 工具特有：超时、中止、命令失败模式

### Bash 失败模式

`hasBashFailureMarkers()` 检测两类模式：
- **元数据模式**: `"bash tool terminated command after exceeding timeout"`, `"user aborted the command"`
- **输出模式**: `fatal:`, `curl:(N)`, `rm: cannot`, `command not found`, `permission denied`, `SSL/TLS connection failed` 等

### Bash 元数据剥离

`stripBashMetadata()` 移除 `<bash_metadata>...</bash_metadata>` 标签后再检查输出模式。

## 关键方法

| 方法 | 说明 |
|------|------|
| `resolveToolExecutionStatus(options)` | 解析最终工具执行状态 |
| `isToolExecutionError(options)` | 判断是否为错误状态 |
| `isToolExecutionBlocked(options)` | 判断是否被阻止 |
| `resolveToolResultText(state, result)` | 统一获取结果文本 |

## 数据流

```
OpenCodianView (显示 tool call)
  → resolveToolExecutionStatus({
      toolName: 'bash',
      state: serverState,
      storedStatus: savedStatus,
      result: toolResult
    })
  → 'completed' | 'error' | 'blocked' | ...
  → 传递给 ToolCallRenderer 渲染
```

## 与其他模块的交互

- **OpenCodianView**: 解析工具调用的显示状态
- **StreamController**: 通过 `ToolCallInfo.status` 间接使用状态类型

## 配置项

无

## 注意事项

- 检测逻辑使用大小写不敏感的正则匹配
- bash 工具有专门的失败检测路径，其他工具使用通用逻辑
- `resolveToolResultText()` 优先返回 `state.error`（带 "Error:" 前缀），其次 `state.output`，最后原始 `result`
- 元数据中的数字支持 string 和 number 两种类型

## 待补充
- [ ] 更多工具类型的特定失败模式
- [ ] 自定义失败模式注册机制
