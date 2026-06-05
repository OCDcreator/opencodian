# SlashCommandExecutionHostFactory

> **源码**: `src/features/chat/services/SlashCommandExecutionHostFactory.ts`
> **状态**: [REVIEW]

## 概述

`SlashCommandExecutionHostFactory` 是 `SlashCommandExecutionService` 的配套工厂文件，负责把 `OpenCodianView` 的扁平依赖装配成 `SlashCommandExecutionHost` 回调接口，使 `SlashCommandExecutionService` 本身不直接持有 view 层引用。

提取到独立文件后，`SlashCommandExecutionService` 只保留命令解析、识别与执行调度逻辑，而 host 装配与 `executeCompactSession` 独立出来，降低 `SlashCommandExecutionService.ts` 的文件体积并保持单一职责。

## 公开接口

```ts
export function createSlashCommandExecutionHost(
  deps: SlashCommandExecutionHostDependencies,
): SlashCommandExecutionHost;

export function executeCompactSession(
  sessionId: string,
  service: CompactSessionOpenCodeService,
  getModel: () => ModelSelectorSelection | null,
  getModelResolution: () => ResolvedModelSelection,
): Promise<boolean>;
```

## 关键行为

### `createSlashCommandExecutionHost`

- 从 `SlashCommandExecutionHostDependencies` 扁平结构映射到 `SlashCommandExecutionHost` 接口
- 所有方法都是 thin delegation，不做额外业务判断
- `getCurrentConversation` 也作为 thin delegation 暴露为 `() => deps.getCurrentConversation()`，供 execution service 做 backend-aware passthrough 判定
- `runCompactSession` 直接委托 `deps.runCompactSession`，实际 compact 逻辑在 `executeCompactSession` 中
- `shareSession` / `unshareSession` 做简单的异常吞掉与 boolean 转换，保持与原来一致的容错行为
- `revertSession`、`unrevertSession` 直接委托 `deps.openCodeService`，维持 OpenCode-only 语义（`SlashCommandExecutionService.handleUndoCommand` / `handleRedoCommand` 负责 backend gate）

### `executeCompactSession`

- 读取当前 session 的 context usage snapshot，提取 provider/model
- 若 snapshot 缺失，回退到当前 tab 选中的 model 与 model resolution
- 无有效 provider/model 时弹出 notice 并返回 `false`
- 调用 `service.summarizeSession(sessionId, providerID, modelID, false)` 执行 compaction
- 弹出 starting / success / failure notice

## 与相邻 owner 的边界

- 本文件不依赖 `OpenCodianView`，只依赖 `SlashCommandExecutionService` 中定义的类型接口
- `SlashCommandExecutionService` 不再导出 `createSlashCommandExecutionHost` 和 `executeCompactSession`
- `OpenCodianView` 从本文件导入这两个函数
