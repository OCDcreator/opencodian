# ModifiedFilesSidebarHelpModal

> **源码**: `src/features/settings/ModifiedFilesSidebarHelpModal.ts`
> **状态**: [REVIEW]

## 概述

`ModifiedFilesSidebarHelpModal` 是设置界面中"修改文件侧边栏"功能的专用帮助弹窗。用户点击该设置项旁边的 `?` 按钮时打开，以卡片式布局解释该功能的用途和配置方式。

采用与 `ConversationCompactionHelpModal` 相同的桌面卡片式布局：顶部标题+摘要，主体为信息卡片。

## 公开接口

```typescript
export class ModifiedFilesSidebarHelpModal extends Modal {
  constructor(app: App)
}
```

## 关键行为

- 标题和正文全部走 i18n（`settings.ui.modifiedFilesSidebar.help.*`），不在源码里硬编码业务说明
- 主体渲染信息卡，覆盖侧边栏功能的说明要点
- 复用 `opencodian-conversation-compaction-help-modal` 样式类以保持视觉一致

## 与其他模块的交互

- `SettingsUiSection.ts`：为修改文件侧边栏 setting 注入帮助按钮并打开本 modal
- `src/i18n/locales/en.ts` / `src/i18n/locales/zh.ts`：提供帮助文案

## 注意事项

- 这个 modal 只解释功能配置，不负责保存或修改设置

## 2026-06-16 Shared modal layout adoption

- 根元素在保留原 compaction-help 类的基础上新增 `.opencodian-help-modal-shell`，纳入共享 help modal 布局系统。
- 纵向节奏由 `.opencodian-help-modal-shell` 的 section gap 统一控制，移除零散 margin；视觉与信息卡片布局保持一致。
