# SettingsSectionCoordinator

> **源码**: `src/features/settings/SettingsSectionCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`SettingsSectionCoordinator.ts` 收拢了 settings panel 的壳层生命周期：section heading 注册、quick-nav 按钮构建、post-render setup，以及 scroll restoration / persistence。它的目标是让 `OpenCodianSettings.ts` 回到“组合业务分区”的角色，而不是继续持有一整套滚动恢复与导航 DOM 细节。

## 核心职责

- 在 `beginDisplay()` / `finishDisplay()` 之间管理 settings panel 的顶层重建流程
- 通过 `createSectionHeading()` 记录 section heading，并在完成渲染后按需生成 quick-nav
- 维护 `prepareRestoreScrollOnNextOpen()` / `prepareScrollToSectionOnNextOpen()` 的打开意图
- 在 post-render 阶段绑定 scroll persistence，并用 `MutationObserver` + retry timers 恢复滚动位置
- 在 `hide()` 时收尾 restore work、capture 当前 scrollTop，并清理监听器

## 关键方法

| 方法 | 说明 |
|------|------|
| `beginDisplay()` | 清空 panel chrome、按需准备 quick-nav host，并保留本次 display 的 pending scroll intent；tabbed 布局可以关闭 quick-nav。调用方现在还可以传入自定义 panel title renderer，用品牌标题替代默认纯文本 `h2` |
| `createSectionHeading()` | 创建 section heading，同时把该分区注册到 quick-nav 数据集 |
| `finishDisplay()` | 构建 quick-nav、安排 post-render setup，并在初次打开时清理 quick-nav 焦点 |
| `restoreScrollPosition()` | 执行带 settle/retry 的滚动恢复 |
| `hide()` | 捕获当前 scrollTop 并清理 restore / persistence 监听器 |

## 与其他模块的交互

- `OpenCodianSettings.ts`: 负责调用 `beginDisplay()` / `createSectionHeading()` / `finishDisplay()`，以及暴露 scroll intent 的公开方法
- `shared/logger.ts`: 继续沿用 `OpenCodianSettings` logger 前缀记录 scroll restore 成功日志，保持现有诊断输出不变

## 注意事项

- 这个 coordinator 只管理 settings panel scaffolding，不应混入 model/provider/appearance 业务逻辑
- 若后续要继续瘦身 `OpenCodianSettings.ts`，优先沿着“完整 lifecycle owner”扩展，而不是再新增薄 `*Adapter` / `*Provider`
