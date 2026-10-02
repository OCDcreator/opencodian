# BackendSessionBrowserDetail

> **源码**: `src/features/chat/ui/BackendSessionBrowserDetail.ts`
> **最近更新**: 2026-09-30

## 概述

`BackendSessionBrowserModal` 的 detail 视图渲染辅助模块。负责从 active backend 读取 session metadata 和完整 transcript，并渲染成 metadata card + 完整 transcript。支持两条 transcript 路径：backend 实现分页 turns seam 时走 cursor 分页加载（"load more" 增量追加），否则保持历史 flat-preview 行为。

## 职责

- 调用 `AgentBackendRouting.getBackendSessionDetail()` 读取 session metadata
- 通过 `AgentBackendRouting.hasBackendSessionTurnsPage()` 选择 transcript 路径：
  - **分页路径**：调用 `getBackendSessionTurnsPage()` 拉取第一页（`limit: 20, sortDirection: 'asc'`，最旧在前），页面底部渲染 "load more" 按钮；点击后用上一页的 `nextCursor` 继续拉取并增量追加消息，直到 `nextCursor` 为 null 后移除按钮。下一页加载失败时按钮恢复可点击并切换为 retry 文案
  - **legacy 路径**：调用 `AgentBackendRouting.getBackendSessionPreview()` 读取完整 transcript（其他 backend 行为不变）
- thread 缺失/已删除（第一页返回 `null`，如 app-server 404）时渲染 transcript-unavailable 占位文案，metadata card 仍照常渲染
- 将 metadata 归一化字段渲染为 label/value 列表（id、backend、title、customTitle、createdAt、updatedAt、gitBranch、cwd、tag、fileSize）
- 将 transcript 消息按 role 分组展示：text part 直接展示，非 text part 以 collapsed `<details>` 展示；activity 消息渲染为 activity 行
- 跳过空白/仅空白字符的 text part，避免空白行

## 公共导出

| 导出 | 说明 |
|------|------|
| `renderBackendSessionDetail(previewEl, sessionId, registry)` | 异步渲染 detail 视图到指定容器 |

## 集成

- `BackendSessionBrowserModal.renderDetailView()` 在 detail 模式下调用本模块

## 维护约束

- 本模块只负责渲染，不持有状态；所有 backend 读取通过 `AgentBackendRouting`
- 分页状态（nextCursor/loading/count）是 render 闭包内的局部状态，不导出
- 日期/文件大小格式化是局部实现，不暴露给外部
- 非 text part 的 summary 使用 `[type]` label，保持与 preview 模式一致
- 新增 transcript 消费路径时优先复用 `renderTranscriptMessage()`，保持与 legacy 渲染一致

## 2026-10-02 Codex local forget / complete catalog UI

新增同 owner 的 readBackendSessionCatalog 与 renderBackendSessionCatalogStatus，集中 Codex catalog evidence 消费及列表状态展示；partial/failed/unavailable 提示通过 typed `chat.backendSessions.catalogPartial` / `catalogFailed` / `catalogUnavailable` 本地化，loading 复用既有 key。英中正式 UI 测试断言提示、partial 重试与 native ID 保留；不持有 runtime state，不新增文件。既有 detail/transcript turns 分页保留原行为；非 Codex 或旧 injected adapter 继续 legacy session list。
