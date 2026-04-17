# trailingAssistantPatchTypes

> **源码**: `src/features/chat/services/trailingAssistantPatchTypes.ts`
> **状态**: [REVIEW]

## 概述

`trailingAssistantPatchTypes` 是 trailing-assistant patch defragmentation 后的共享 contract 模块。它集中声明 planning / execution / debug 三个 bundle 共用的 plan、context、payload 与 runtime state 类型，避免 bundle 之间重新定义重复 shape。

## 覆盖范围

- execution 相关：`TrailingAssistantPatchExecutionPlan`、execution-tail context、footer decision contract
- planning 相关：tail-outcome / tail-state / completion-debug 的 context 与 plan types
- success path：`TrailingAssistantPatchSuccessPlan`、turn-body scope plan、shared source contracts
- debug path：logging context、payload plan、log emitter contract

## 与其他模块的关系

- `trailingAssistantPatchPlanning.ts`、`trailingAssistantPatchExecution.ts`、`trailingAssistantPatchDebug.ts` 都从这里共享同一套 contract
- 相关单测直接从 coarse bundle 导入函数，但 bundle 自身继续依赖这里保持类型一致

## 注意事项

- 这里只承载类型；不要把新的运行时逻辑塞进来
- 如果一个新类型只服务于 trailing-assistant patch bundle，优先放在这里而不是回到新的薄 type helper 文件
