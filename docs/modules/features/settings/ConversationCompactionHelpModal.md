# ConversationCompactionHelpModal

> **源码**: `src/features/settings/ConversationCompactionHelpModal.ts`
> **状态**: [REVIEW]

## 概述

`ConversationCompactionHelpModal` 是会话设置里“上下文压缩（项目级）”分组的专用帮助弹窗。它复用现有设置页 `help-circle` 交互，在用户点击某个压缩字段旁边的 `?` 按钮时，用 topic-driven 方式解释：

- 这项是什么
- OpenCode 默认怎么处理
- 调大 / 调小会怎样
- 使用提示与补充说明

当前采用宽桌面卡片式布局：顶部是标题+一句摘要，主体是 2×2 信息卡，不再沿用默认的窄 help 容器和内部滚动条。

当前覆盖的 topic：

- `auto`
- `prune`
- `tailTurns`
- `preserveRecentTokens`
- `reserved`

## 公开接口

```typescript
export type ConversationCompactionHelpTopic =
  | 'auto'
  | 'prune'
  | 'tailTurns'
  | 'preserveRecentTokens'
  | 'reserved';

export class ConversationCompactionHelpModal extends Modal {
  constructor(app: App, topic: ConversationCompactionHelpTopic)
}
```

## 关键行为

- 标题走 `settings.conversation.compaction.help.{topic}.title`
- 主体固定渲染 4 张信息卡：
  - `whatItMeans`
  - `opencodeDefault`
  - `adjustmentEffect`
  - `tipsLabel`（并在同一卡内承接可选 `moreNotes`）
- 所有正文都来自 i18n，不在源码里硬编码业务说明
- `extra` / `tip1` / `tip2` 缺失时会自动省略对应内容

## 与其他模块的交互

- `SettingsConversationSection.ts`：为 compaction setting 注入帮助按钮并打开本 modal
- `OpenCodianSettings.ts`：提供共享 `addSettingHelpButton()` seam
- `src/i18n/locales/en.ts` / `src/i18n/locales/zh.ts`：提供 topic 文案

## 注意事项

- 这个 modal 只解释压缩配置，不负责保存配置，也不直接触发压缩
- “立即生效 / deferred 生效” 只是帮助说明的一部分；真正的保存与热重载仍由 `SettingsConversationSection` + `OpenCodeService.reapplyCompactionConfigFromProjectConfig()` 处理

## 2026-06-16 Shared modal layout adoption

- 根元素在保留原 `.opencodian-conversation-compaction-help` 的基础上，新增 `.opencodian-help-modal-shell`，纳入共享 help modal 布局系统。
- 纵向节奏改由 `.opencodian-help-modal-shell` 的 section gap 统一控制，移除原先的零散 margin。
- 视觉与现有 2×2 信息卡布局保持一致，未改变行为。
