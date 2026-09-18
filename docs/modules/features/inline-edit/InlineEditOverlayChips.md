# InlineEditOverlayChips

> **源码**: `src/features/inline-edit/InlineEditOverlayChips.ts`
> **状态**: [REVIEW]

## 概述

行内编辑悬浮条的**模型/努力 chip 与下拉菜单**渲染层，外加 chip 状态计算与选择持久化。从 `InlineEditInputOverlay` 抽出（同一 max-lines 预算规则，见 `InlineEditOverlayPrimitives` 概述）：overlay 保留菜单容器、定位与 Escape 顺序，把 chip 的构建/同步/行渲染委托给本模块；`InlineEditController` 的 chip 状态计算（`modelChipState` / `effortChipState` / `pickModel` / `pickEffort`）也在此，控制器只做委托。

## 职责

- `buildInlineEditConfigChip(bar, kind, onToggle)`：chip 按钮骨架（图标前缀槽 + 值 + chevron），图标由 sync 阶段按提供商填充
- `syncInlineEditConfigChip(panel, kind, state, callbacks)`：一次渲染同步 label / 提供商图标（`dataset.iconKey` 去重重建）/ disabled / tooltip；`null` 态隐藏 chip
- `renderInlineEditConfigMenu(render, callbacks)`：下拉行渲染——清除覆盖行 + 分隔 + 选项行（13px 统一图标槽：品牌图标 / 信号格 / 清除行字形），菜单锚在 chip 下方并夹在面板内；行点击先 `onClose()`（overlay 统一关菜单）再回选择
- `inlineEditModelChipState(host)` / `inlineEditEffortChipState(host)`（纯）：chip 状态计算（label 来源、loading、disabled=会话已启动、菜单项带提供商图标映射）
- `inferInlineEditModelProvider(ref, kind)`（纯）：`provider/model` 切前缀；claude-code → anthropic、codex → openai
- `pickInlineEditModel(host, callbacks, id)` / `pickInlineEditEffort(...)`：持久化覆盖并 rerender；异常经 `notify` 上报

## 依赖

- `obsidian`（`setIcon`）、`../../i18n`
- `./InlineEditOverlayPrimitives`（`choicesToMenuItems`、`effortMenuIcon`、`InlineEditOverlayMenuItem`）
- `./InlineEditTypes`（`InlineEditHostAdapter`、`InlineEditChoice`）、`../../core/types/chat`（`AgentBackendKind`）
- 反向：`./InlineEditInputOverlay` 仅类型（`InlineEditOverlayChipState`），无运行时环

> 2026-09-18 (A3)：新增按编辑的编排助手 `runInlineEditModelPick` / `runInlineEditEffortPick` / `loadInlineEditModelChoices`（控制器以 `pickEdit`/`pickDeps` 适配视图委托，保持控制器行数上限）。

## 维护约束

- 菜单行点击必须走 `callbacks.onClose()` 而不是自行 `menu.remove()`：overlay 的 `closeMenu()` 统一维护 `menuKind` / preset 菜单 reset / picker 刷新引用，绕过会留下过期状态
- chip 的 `disabled` 语义 = 会话已启动（模型/努力只影响下一次唤起），与 controller 的 `hasSession` 一致
- 新增 chip 种类时同步 overlay 的 `menuKind` 联合类型与 `closeMenu` 清理路径
