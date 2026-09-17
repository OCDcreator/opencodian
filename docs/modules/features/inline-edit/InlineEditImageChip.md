# InlineEditImageChip

> **源码**: `src/features/inline-edit/InlineEditImageChip.ts`
> **状态**: [REVIEW]

## 概述

R-A4「行内面板贴图」的输入界面层：校验、chip 渲染、粘贴/拖拽 glue，与 `attachInlineEditImageSurface()` 一次性装配。从 `InlineEditInputOverlay` 抽出（同一 max-lines 预算规则）：overlay 保持悬浮条骨架，图片机制全在本模块。图片只读进内存（base64），经 `AuxQueryImageAttachment` 随 turn 请求走，**不落盘 vault**。

## 职责

- `INLINE_EDIT_MAX_IMAGES = 1`（本期上限）、`INLINE_EDIT_IMAGE_MAX_BYTES = 4MB`、`INLINE_EDIT_IMAGE_MEDIA_TYPES`（png/jpeg/webp/gif，与聊天 composer 同白名单同预算）。均为模块内常量——R-A3/R-A4 按需求决定不新增用户设置项
- `validateInlineEditImage(file, hasImage)`（纯）：先查张数上限 → 类型白名单 → 大小上限（`File.size` 即解码前字节数）；fail-closed，返回 i18n key 形态的拒绝原因，绝不静默丢弃
- `readInlineEditImage(file)`：校验 + `FileReader.readAsDataURL` → 剥掉 `data:` 前缀得到纯 base64（契约要求不含 data-URL 前缀）
- `filterInlineEditImageFiles(files)`（纯）：只留白名单图片，其余文件类型交还原生粘贴/拖拽行为
- `syncInlineEditImageChip(row, image, onRemove)`：缩略图（data URL）+ 媒体类型 label + 移除按钮；空时整行隐藏
- `installInlineEditImageInput({ field, panel, enabled, onFiles })`：字段粘贴 + 面板 dragover/drop；`enabled()` 为假（生成中 / 后端不支持图片）时两块都失能；返回 teardown
- `attachInlineEditImageSurface({ field, panel, anchor, ... })`：chip 行（插在配置行之前、空时隐藏）+ 粘贴/拖拽 glue 的一次性装配，overlay 侧一行调用

## 依赖

- `obsidian`（`setIcon`）、`../../i18n`
- `../../core/agents/backend/AgentAuxQueryCapability`（`AuxQueryImageAttachment` 类型）

## 维护约束

- 超限/超类型/超张数一律**拒绝并提示**（controller 侧 `notify`），不得静默丢弃或静默降级为无图请求
- 图片数据只存在于内存（base64）；任何写文件系统的冲动都违反 R-A4 与 vault 快照审计（Codex 的 `local_image` 临时文件属于后端会话内部，见 `CodexAuxQuerySession`）
- chip 行复用 `-chip` 骨架样式；缩略图是 `<img>` 内联 data URL，不引外部资源
- `enabled()` 必须同时反映 busy（生成中不可换图）与 `imageSupported`（后端无图片能力时不给死界面）
