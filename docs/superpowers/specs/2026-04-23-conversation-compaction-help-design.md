# Conversation Compaction Help Design

## Goal

在设置页“会话 → 上下文压缩（项目级）”分组里，为每个压缩项增加可复用的 `?` 帮助按钮，让用户能直接看懂每个字段是什么意思、OpenCode 默认怎么处理、调大调小会带来什么影响。

## Chosen Approach

采用与现有服务器设置一致的 help-button 交互：在每个设置项右侧复用现有 `help-circle` 按钮，点击后打开一个 topic-driven modal。  
本轮只覆盖压缩分组的五个字段：`auto`、`prune`、`tail_turns`、`preserve_recent_tokens`、`reserved`。

## Why This Approach

- 与当前设置页交互风格一致，不引入新的视觉模式
- 每个字段都能单独解释，用户不需要在一大段帮助文案里自己对照
- topic-driven modal 便于后续继续扩展到会话分组里的其它设置项

## Scope

### In Scope

- `SettingsConversationSection` 增加 help-button seam
- 新增 `ConversationCompactionHelpModal`
- 中英文 i18n 文案
- 单测覆盖帮助按钮接线和 modal 基本文案
- 对应模块文档同步

### Out of Scope

- 非压缩分组的 help 按钮
- 改动 compaction 实际保存/热重载逻辑
- 新增外部文档链接或联网获取帮助内容

## UX Details

- 按钮样式沿用现有 `help-circle`
- tooltip 走新文案命名空间，但风格保持与已有设置帮助一致
- modal 内容使用通俗语言，优先解释：
  1. 这项是什么
  2. OpenCode 默认怎么处理
  3. 调大/调小会怎样
  4. 使用建议

## Content Rules

- `保留轮次`：明确说明默认是 `2`，按最近 user turn 计，不是简单的“2 条消息”
- `保留最近 Token`：明确说明留空时不是固定值，而是按 OpenCode 默认策略动态计算
- `预留 Token`：明确说明留空时不是固定值；改小通常会让自动压缩更晚触发
- 对“是否立即生效”统一说明：保存后会尝试项目级 reload，成功时影响后续请求，不会立即执行一次手动压缩

## Files Expected

- Modify: `src/features/settings/SettingsConversationSection.ts`
- Create: `src/features/settings/ConversationCompactionHelpModal.ts`
- Modify: `src/features/settings/OpenCodianSettings.ts`
- Modify: `src/i18n/locales/zh.ts`
- Modify: `src/i18n/locales/en.ts`
- Modify: `tests/unit/features/settings/SettingsConversationSection.test.ts`
- Create: `tests/unit/features/settings/ConversationCompactionHelpModal.test.ts`
- Modify: `docs/modules/features/settings/SettingsConversationSection.md`
- Create: `docs/modules/features/settings/ConversationCompactionHelpModal.md`
- Modify: `docs/modules/features/settings/OpenCodianSettings.md`

## Verification

- 先写 failing test，确认压缩项当前没有帮助按钮
- 补 modal 文案渲染测试
- 跑针对性 Jest
- 最后跑 `npm run verify`
