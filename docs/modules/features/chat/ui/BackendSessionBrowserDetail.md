# BackendSessionBrowserDetail

> **源码**: `src/features/chat/ui/BackendSessionBrowserDetail.ts`
> **最近更新**: 2026-06-13

## 概述

`BackendSessionBrowserModal` 的 detail 视图渲染辅助模块。负责从 active backend 读取 session metadata 和完整 transcript，并渲染成 metadata card + 完整 transcript。

## 职责

- 调用 `AgentBackendRouting.getBackendSessionDetail()` 读取 session metadata
- 调用 `AgentBackendRouting.getBackendSessionPreview()` 读取完整 transcript
- 将 metadata 归一化字段渲染为 label/value 列表（id、backend、title、customTitle、createdAt、updatedAt、gitBranch、cwd、tag、fileSize）
- 将 transcript 消息按 role 分组展示：text part 直接展示，非 text part 以 collapsed `<details>` 展示
- 跳过空白/仅空白字符的 text part，避免空白行

## 公共导出

| 导出 | 说明 |
|------|------|
| `renderBackendSessionDetail(previewEl, sessionId, registry)` | 异步渲染 detail 视图到指定容器 |

## 集成

- `BackendSessionBrowserModal.renderDetailView()` 在 detail 模式下调用本模块

## 维护约束

- 本模块只负责渲染，不持有状态；所有 backend 读取通过 `AgentBackendRouting`
- 日期/文件大小格式化是局部实现，不暴露给外部
- 非 text part 的 summary 使用 `[type]` label，保持与 preview 模式一致
