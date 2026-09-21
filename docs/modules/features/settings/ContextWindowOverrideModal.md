# ContextWindowOverrideModal

> **源码**: `src/features/settings/ContextWindowOverrideModal.ts`
> **状态**: [REVIEW]

## 概述

R-F8（advantage-parity）模型上下文窗口声明编辑器：为目录中缺权威元数据的模型（典型：自定义 OpenAI 兼容条目）声明 `provider/model → token 上限`。表单校验 ref 形态与正整数窗口；列表逐条移除；经常规设置保存路径持久化。窄 port（`ContextWindowOverrideModalHost`：app/settings/saveSettings），不 import 应用层。

## 不变量

- 声明只**填补缺失**（catalog 边界的 `applyContextWindowOverrides` 保证不覆盖真实元数据——见 modelConfigCatalog.md）。
- 非法输入如实 Notice（ref 无斜杠/空段、窗口非正整数）。
- 消费链零改动：resolveModelSelection → ContextRing 百分比 / 压缩阈值照常读 `contextWindow`。

## 关联模块

- `src/core/config/modelConfigCatalog.ts`：`applyContextWindowOverrides`（纯装饰）。
- `src/core/config/ModelConfigService.ts`：`getCatalogs` 四个 catalog 面统一施加。
- `src/features/settings/SettingsModelSection.ts`：通用 tab 的「管理声明」入口。
