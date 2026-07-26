# ClaudeSettingsContextSourcesPresenter

> **源码**: `src/features/settings/ClaudeSettingsContextSourcesPresenter.ts`
> **状态**: [ACTIVE]

## 概述

配置 workbench 的 “Context & Sources” 头部 presenter。它拥有 scope 选择器、目标路径展示、Global 警告、未保存草稿切换决策、current-editing 摘要条和 source inventory disclosure 的 DOM 投影；section 仍拥有 draft、selection/read tokens 与读写生命周期，presenter 只通过 host 接口读取状态并把用户意图回报给 section，从不触碰 canonical raw draft。

## 核心行为

- scope `<select>` 的 change 只调用 `host.onScopeSelected(next)`；dirty 判定、select 回退与切换由 section 决定。`showSwitchDecision()` 渲染带标签的 `role=group` 和内联 Save & switch / Discard & switch / Cancel；三个原生语义 button 只回报 `onSwitchDecision(decision, next)`，并把焦点放到第一个可用决策 button（Save 不可用时为 Discard）。Save 是否真能切换取决于 section 的保存结果；该焦点路径依赖原生控件的可见 `:focus-visible`，不聚焦结构性 `div`。
- `refreshSummary()` 重建首屏摘要条：scope、target path、复制按钮、present/absent、editable/read-only、dirty/saved 以及 persistence/application/runtime 三轴独立摘要。路径通过 slash/backslash 分段节点自然换行，长 segment ellipsis；完整路径仍在 `title`、`aria-label` 和 Copy 操作中可得。
- `renderTargetPath()` 同步 scope 行路径与 Global 警告（仅 Global 选中时可见，含完整目标路径），并刷新摘要条。
- `refreshInventory()` 加载 source inventory：`aria-busy` 标记加载期、按 “已检查 N 个来源” 更新 disclosure 计数、渲染每行 scope/origin/presence/read-only/三轴人类可读证据；canonical path、revision、priority 等原始 token 收进每行 `<details>` 技术详情。失败留下可见 `role=alert`。行渲染完成后回调 `host.onSourcesLoaded(sources)`，由 section 更新 candidates/revision；保存期间该 read 采用 metadata-only，不能覆盖提交后的新草稿。
- 同时导出 workbench 共享 DOM helper（`appendText`、`clearChildren`、`createDisclosureToggle`、`bindDisclosure`、`createActionButton`）与 scope/origin/evidence 的本地化格式化函数；`createDisclosureToggle` + `bindDisclosure` 保证所有 disclosure 只有 aria-expanded/aria-controls 与 hidden 切换，折叠不销毁 region DOM。

## Durable owner 关系

`SettingsClaudeConfigurationSection` 拥有唯一 draft、selection 与 save/read 生命周期；本 presenter 拥有头部与 inventory 的 DOM；`ClaudeSettingsSourceService` 拥有 discovery、filesystem 安全与 persistence。切换 scope 的最终决定权（含保存失败/CAS 冲突时中止）永远在 section。
