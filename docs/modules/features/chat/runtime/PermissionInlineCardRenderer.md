# PermissionInlineCardRenderer

> **源码**: `src/features/chat/runtime/PermissionInlineCardRenderer.ts`
> **状态**: [REVIEW]

## 概述

`PermissionInlineCardRenderer` 是 permission request 的 inline card lifecycle helper。它复用 `StreamingInlineCardRenderer` 完成 placement 与 shell reveal，并把 permission 卡片的内容构造、按钮渲染、用户选择等待、session-scoped approval tracking 和 response dispatch seam，从 `OpenCodianView.showPermissionDialog()` 中抽离出来。

## 公开接口

- `collectResponse()`：创建 permission inline card，渲染 tool/pattern/command/buttons，并等待 `once` / `always` / `session` / `reject`
- `collectAndRespond()`：先检查 session approval cache；未命中时收集用户选择，并通过注入的 responder 回传 `always` / `once` / `reject`
- `clearSessionApprovals()`：清空当前插件运行期的 session approval cache
- `PermissionInlineCardResult`：对 view 暴露的最小结果枚举

## 设计目的

- 让 `OpenCodianView` 不再同时承担 permission 卡片 DOM 构造、点击等待、session approval scope 判断和服务回传职责
- 继续复用 `StreamingInlineCardRenderer` 已有的 post-tool-call placement 与 reveal 规则
- 让 permission inline card 的交互逻辑可以独立于大视图类做小范围单测

## 注意事项

- 这个模块不直接依赖 `OpenCodeService`；最终结果通过 `collectAndRespond()` 的 responder seam 回传
- `session` 是 UI 返回值；renderer 在本地按 tool + action + 完整 pattern set 记录 session-scoped approval，并把实际 wire reply 交给 responder 的 `always` 路径
- `patterns === ['*']` 时仍保持不渲染 pattern 区块的旧行为
- 不要在这里重复实现 streaming shell 查询或 reveal 逻辑，统一继续走 `StreamingInlineCardRenderer`
