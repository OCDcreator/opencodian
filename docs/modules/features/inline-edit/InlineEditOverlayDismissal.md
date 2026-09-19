# InlineEditOverlayDismissal

> **源码**: `src/features/inline-edit/InlineEditOverlayDismissal.ts`
> **状态**: [REVIEW]

## 概述

悬浮指令条**文档级取消路径的接线层**（Escape / 面板外 pointerdown / focusout），自 `InlineEditInputOverlay` 抽出（该文件顶在 max-lines 预算上）。归属裁决的数学在 `InlineEditOverlayPrimitives.resolveDismissOwner`（纯函数、有单测）；本模块只负责三件事：把每个事件的**锚**（escape=事件进入时持有 `activeElement` 的面板、pointerdown=目标所在面板、focusout=焦点离开的面板）找出来、把同编辑器全部开放条组装成一次候选快照、把裁决结果按条回放。

## 职责

- `InlineEditDismissalHost`：单条开放条的事实接口——`editId` / `panel()` / `menu()` / `pristine()` / `closeMenu()` / `reject()`。overlay 是唯一实现方；兄弟条经同一接口进入快照，接线层不感知 overlay 内部
- `InlineEditDismissalHandlers` + `bindInlineEditOverlayDismissal(doc, host, bars)`：构造三个 handler 供 overlay 绑定/解绑（keydown 挂 document 捕获态、pointerdown 挂 document 捕获态、focusout 挂 `view.dom`——绑定位置与旧实现一致）
- **per-event Escape 快照**（A1 修复核心）：`escapeAnchors`（`WeakMap<KeyboardEvent, HTMLElement | null>`）让同一 keydown 的第一个 handler 记录锚面板，后续 handler 复用。旧实现逐条重读 live `activeElement`：锚条先取消并拆除 DOM，焦点跌回 body，其余条的守卫随即失真而自毁——顺序依赖即缺陷。快照使裁决与监听顺序、事件中途拆除解耦
- **被动路径数据保护**（A3 修复）：面板外 pointerdown 与焦点移出只拒绝**原始条**（`pristine()`）；非原始条（已输入指令 / busy / 有 reply·error）存活，但存活条的开菜单会关闭（否则外部点击再也关不掉菜单）。`focusout` 落点为 `null`（窗口切换）维持不取消；落点在任何条内时源条不取消（条间移动两存）；focusout 的锚是 `event.target` 所在面板，因此兄弟条的 focusout 事件不会波及本条
- pointerdown 在任何条内：不取消任何条（A2 修复）；锚条「面板内、菜单外」的点击仍只关自己的菜单（原语义，本模块回放）

## 依赖

- `./InlineEditOverlayPrimitives`（`resolveDismissOwner` + 三个类型）

## 维护约束

- 本模块**不做裁决**：任何新的取消语义先改 `resolveDismissOwner`（纯函数 + 单测），这里只换锚的采集方式
- `escapeAnchors` 必须按事件对象记忆；任何"再次读取 activeElement"的改动都会重新引入 A1 的顺序依赖
- 被动路径的 pristine 判定在 overlay 侧（`isPristine`：指令空 ∧ 非 busy ∧ 无 reply/error）；改动其定义即改动"误唤起自愈 vs 数据保护"的分界，必须同步 `docs/requirements/inline-edit.md` 取消路径段与 `InlineEditInputOverlay.test.ts` / `InlineEditOverlayDismissal.test.ts`
- 单条旧语义（忙碌期 Esc 取消、外部点击清理原始条、窗口切换不取消）是回归关键路径，测试末组专门钉住
