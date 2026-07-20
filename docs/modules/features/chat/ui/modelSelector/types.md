# modelSelector/types

> **源码**: `src/features/chat/ui/modelSelector/types.ts`
> **状态**: [REVIEW]

## 概述

这个类型模块为 model selector 子目录提供共享结构，替代 `OpenCodianView` 里原本分散的匿名对象类型。

## 关键类型

- `ModelSelectorSelection`：当前 provider/model 选择
- `ModelSelectorModel` / `ModelSelectorProvider`：下拉列表渲染输入
- `ModelSelectorModelAvailability`：`runtime | configured-only`；轻量 backend 未提供时按 runtime 兼容处理
- `ModelSelectorAvailableModelInfo`：`availableModels` 缓存项
- `ModelSelectorOptionValue`：`provider::model` DOM value 形状
- `ModelSelectorDisplayResolution` / `ModelSelectorDisplayState`：trigger 展示推导输入与输出
- `ModelSelectorRenderTexts`：列表渲染所需文案集合

## 注意事项

- 这些类型是聊天 UI 内部契约，不是插件对外 API
- 新的 model selector helper 应优先复用这里的类型，而不是重新写匿名结构
