# ImageGenerationModal

> **源码**: `src/features/chat/ui/ImageGenerationModal.ts`
> **状态**: [REVIEW]

## 概述

`ImageGenerationModal` 是 R-C2 聊天入口的生成卡片（设计 §3.5）：提示词 + 模型选择 → 生成中态 → 结果态（缩略图 + 模型/耗时 + 插入形态选择 + 插入/复制图片/重新生成）。卡片自身**不做任何 vault 写**；唯一的写入路径是"插入"按钮委托 `ImageGenerationChatController.insertIntoActiveNote`（W-asset → 登记 → W-ref）。

与设计 §3.5.2 的偏差说明：设计原文期望结果以"消息卡片"呈现于会话流内。实现采用 Modal 卡片，因为会话流卡片需要扩展会话消息模型与渲染管线（`ConversationRenderService`/持久化），横切 `feature.chat-rendering` 与后台同步的既有不变量；Modal 保留了设计要求的全部行为要素（显式插入、缩略图、模型/耗时、重新生成、复制、不自动写笔记）。该偏差已在实施报告中向维护者声明。

## 行为要点

- 提示词可由 `/image <提示词>` 预填；无配置模型时显示"未配置"提示且 Generate 禁用。
- 生成失败在卡内显示（含 kind），无任何副作用。
- 关闭卡片 = 丢弃候选（字节只在内存中）；`imageGenerationAssetCleanup` 只约束已落盘资产（聊天路径只有插入成功才落盘）。
- 缩略图用 `URL.createObjectURL`，`onClose` 回收。

## 关联模块

- `../services/ImageGenerationChatController.ts`：全部生成/插入动作。
- `src/main.ts`：`openImageGenerationCard(prefill)` 构造并打开。
- `src/style/modals/image-generation-modal.css`：结果布局与错误条样式。
