# PermissionInlineCardRenderer

> **源码**: `src/features/chat/runtime/PermissionInlineCardRenderer.ts`
> **状态**: [REVIEW]

## 概述

`PermissionInlineCardRenderer` 是 permission request 的 inline card helper。它复用 `StreamingInlineCardRenderer` 完成 placement 与 shell reveal，并把 permission 卡片的内容构造、按钮渲染和用户选择等待，从 `OpenCodianView.showPermissionDialog()` 中抽离出来。

## 公开接口

- `collectResponse()`：创建 permission inline card，渲染 tool/pattern/command/buttons，并等待 `once` / `always` / `reject`
- `PermissionInlineCardResult`：对 view 暴露的最小结果枚举

## 设计目的

- 让 `OpenCodianView` 不再同时承担 permission 卡片 DOM 构造、点击等待和服务回传三类职责
- 继续复用 `StreamingInlineCardRenderer` 已有的 post-tool-call placement 与 reveal 规则
- 让 permission inline card 的交互逻辑可以独立于大视图类做小范围单测

## 注意事项

- 这个模块不负责调用 `respondToPermission()`；最终结果回传仍由 `OpenCodianView` 桥接到 service
- `patterns === ['*']` 时仍保持不渲染 pattern 区块的旧行为
- 不要在这里重复实现 streaming shell 查询或 reveal 逻辑，统一继续走 `StreamingInlineCardRenderer`
