# SettingsSectionCoordinator

> **源码**: `src/features/settings/SettingsSectionCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`SettingsSectionCoordinator.ts` 收拢了 settings panel 的壳层生命周期：section heading 注册、quick-nav 按钮构建、post-render setup，以及 scroll restoration / persistence。它的目标是让 `OpenCodianSettings.ts` 回到“组合业务分区”的角色，而不是继续持有一整套滚动恢复与导航 DOM 细节。

## 核心职责

- 在 `beginDisplay()` / `finishDisplay()` 之间管理 settings panel 的顶层重建流程
- 通过 `createSectionHeading()` 记录顶层 section heading，并在完成渲染后按需生成 quick-nav
- 在 quick-nav 点击跳转或外部 `scrollToSectionByTitle()` 导航时，根据真实滚动容器与当前 sticky quick-nav 可见高度计算目标 `scrollTop`，避免按钮换行后标题被滚过头；外部导航还可以按文本命中未注册进 quick-nav 的二级 block heading
- 支持调用方显式提供 settings 滚动容器；标准设置页仍自动发现 Obsidian 的 vertical-tab 容器，editor-area settings view 则锁定自己的 `contentEl`
- 在 classic quick-nav 上管理 body-level tooltip overlay，让提示可以越过 settings 滚动容器而不被裁切。quick-nav tooltip 使用独立的 CSS 类命名空间（`.opencodian-settings-quick-nav-tooltip-*`），z-index 为 2260，低于 settings popover (2280) 和 settings tooltip (2300)，保持在设置页 overlay 层级梯度的最底层
- 维护 `prepareRestoreScrollOnNextOpen()` / `prepareScrollToSectionOnNextOpen()` 的打开意图
- 在已显示的设置页被整页重建前捕获当前 `scrollTop`，再在 post-render 阶段绑定 scroll persistence，并用 `MutationObserver` + retry timers 恢复滚动位置
- 对仍然必须整页重建的路径，`beginDisplay()` 会在清空面板前临时锁定当前 panel 高度，`finishDisplay()` 下一帧恢复原始 `min-height`，避免可见设置内容瞬间坍塌导致跳顶或闪动
- 在 `hide()` 时收尾 restore work、capture 当前 scrollTop，并清理监听器

## 关键方法

| 方法 | 说明 |
|------|------|
| `beginDisplay()` | 对已绑定滚动监听的可见设置页先捕获当前 `scrollTop`，再清空 panel chrome、按需准备 quick-nav host，并保留本次 display 的 pending scroll intent；tabbed 布局可以关闭 quick-nav。调用方现在还可以传入自定义 panel title renderer，用品牌标题替代默认纯文本 `h2` |
| `createSectionHeading()` | 创建 section heading，同时把该分区注册到 quick-nav 数据集 |
| `finishDisplay()` | 构建 quick-nav、安排 post-render setup，并在初次打开时清理 quick-nav 焦点 |
| `scrollToSectionByTitle()` / quick-nav click handler | 统一走容器级滚动定位，扣除当前 sticky quick-nav 的实际可见高度，而不是单纯依赖 `scrollIntoView()` 与固定 `scroll-margin-top`；`scrollToSectionByTitle()` 会先匹配 `data-section-title`，再按 heading 文本匹配二级 block 标题 |
| quick-nav tooltip overlay helpers | 在 hover/focus 时把 tooltip layer 挂到 `document.body`，并随滚动/窗口变化重定位 |
| `restoreScrollPosition()` | 执行带 settle/retry 的滚动恢复 |
| `hide()` | 捕获当前 scrollTop 并清理 restore / persistence 监听器 |

## 与其他模块的交互

- `OpenCodianSettings.ts`: 负责调用 `beginDisplay()` / `createSectionHeading()` / `finishDisplay()`，以及暴露 scroll intent 的公开方法
- `OpenCodianSettingsView.ts`: 复用 classic quick-nav，但通过显式 scroll container 让跳转只滚动 `ItemView.contentEl`，避免平铺模式下误滚外层 leaf
- `shared/logger.ts`: 继续沿用 `OpenCodianSettings` logger 前缀记录 scroll restore 成功日志，保持现有诊断输出不变

## 注意事项

- 这个 coordinator 只管理 settings panel scaffolding，不应混入 model/provider/appearance 业务逻辑
- 若后续要继续瘦身 `OpenCodianSettings.ts`，优先沿着“完整 lifecycle owner”扩展，而不是再新增薄 `*Adapter` / `*Provider`
