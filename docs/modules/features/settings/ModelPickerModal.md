# ModelPickerModal

> **源码**: `src/features/settings/ModelPickerModal.ts`
> **状态**: [REVIEW]

## 概述

`ModelPickerModal` 是设置侧复用的模型选择弹层。它把模型列表按 provider 分组展示，支持 provider 下拉筛选、名称/ID 搜索、键盘上下选择、回车确认，以及一个可选的“空值”入口。provider 筛选的原生 select 会交给 `SettingsDropdownControl` 渲染成跨平台一致的设置下拉。

当前主要被两处消费：

- 设置里的“默认聊天模型”
- 会话标题设置里的 “AI 标题模型”

## 核心行为

- 可先通过 provider 下拉缩小范围，再按 provider / model 名称和 ID 过滤
- 保留 provider 分组结构，而不是退化成扁平列表
- 支持一个顶部的空值选项，例如“未配置”或“跟随当前会话模型”
- 选中后通过回调把 `ModelPickerOption | null` 交回调用方，再由调用方决定写回哪个设置字段
- 搜索框带常驻清空按钮和本地最近搜索历史，历史候选层使用插件自绘浮层，避免原生 `datalist` 在 Obsidian 滚动容器里出现定位漂移
- provider 筛选继续以 select 保存状态和触发 change，但视觉菜单由 `SettingsDropdownControl` 接管，避免 macOS / Windows 原生菜单差异

## 关键输入

```typescript
interface ModelPickerModalOptions {
  title: string;
  description: string;
  groups: ModelPickerGroup[];
  selectedRef?: string;
  emptySelectionLabel?: string;
  onChoose: (option: ModelPickerOption | null) => void | Promise<void>;
}
```

## 与其他模块的交互

- `modelPicker.ts`: 提供 `ModelPickerGroup` / `ModelPickerOption` 和 provider + 搜索过滤 helper
- `OpenCodianSettings.ts`: 打开默认模型 picker
- `OpenCodianSettings.ts` 的会话分区：打开 AI 标题模型 picker

## 注意事项

- 这个 modal 不直接读写插件设置；它只负责 UI 和选择结果回调
- 搜索高亮状态仍然是弹层会话内状态，但搜索框会提供清空按钮和本地最近搜索历史
- 最近搜索历史只存在本地 `localStorage`，并按当前输入做前端过滤
