# ImagePreviewOverlay

> **源码**: `src/features/chat/ui/ImagePreviewOverlay.ts`
> **状态**: [ACTIVE]

## 概述

为 composer 缩略图与已发送消息图片提供同一份轻量预览浮层。它不管理附件数据或持久化，只负责展示已经存在的 data-URI。

## 公开接口

| 导出 | 说明 |
|---|---|
| `openImagePreview({ src, alt })` | 在 document body 打开单实例、可访问的图片预览。 |

## 交互约定

- 新预览会关闭已有预览，避免叠层。
- 关闭按钮、点击 backdrop 和 Escape 都会关闭；关闭后尝试恢复打开前的焦点。
- 使用 `role="dialog"`、`aria-modal="true"` 与本地化 aria label；close button 在打开后立即获得焦点。
- 样式归 `src/style/features/chat-assistant.css`，调用方为 `ComposerInputShellCoordinator` 和 `UserMessageContentRenderer`。
