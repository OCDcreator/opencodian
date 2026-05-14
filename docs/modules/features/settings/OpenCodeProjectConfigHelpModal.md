# OpenCodeProjectConfigHelpModal

> **源码**: `src/features/settings/OpenCodeProjectConfigHelpModal.ts`
> **状态**: [REVIEW]

## 概述

`OpenCodeProjectConfigHelpModal` 是项目级 OpenCode 配置的通用解释弹窗。它服务于设置页里容易被误解的能力开关，用用户可理解的语言说明该配置真正会影响什么，并在底部放置对应 OpenCode 官方文档链接。

当前 topic：

- `share`：解释会话分享不是 Markdown 导出，而是公开链接与会话数据同步；说明 `manual` / `auto` / `disabled` 的差异与隐私风险
- `bashPermission`：解释 blocked commands 会写入 `permission.bash` deny patterns；强调它是 OpenCode 权限检查，不是操作系统沙箱

## 公开接口

```typescript
export type OpenCodeProjectConfigHelpTopic = 'share' | 'bashPermission';

export class OpenCodeProjectConfigHelpModal extends Modal {
  constructor(app: App, topic: OpenCodeProjectConfigHelpTopic)
}
```

## 核心逻辑

- 根据 topic 选择 i18n base key：
  - `settings.conversation.share.help.*`
  - `settings.security.blockedCommands.help.*`
- 固定渲染标题、intro、三条要点和官方链接区
- 官方链接在源码中集中维护，避免设置项各自硬编码 URL
- 链接使用 `target="_blank"` 与 `rel="noopener"`

## 与其他模块的交互

- `SettingsConversationSection.ts`：在 share mode setting 上挂 help button，并以 `share` topic 打开本 modal
- `SettingsSecuritySection.ts`：在 blocked commands setting 上挂 help button，并以 `bashPermission` topic 打开本 modal
- `src/i18n/locales/en.ts` / `src/i18n/locales/zh.ts`：提供所有用户可见说明和链接标签
- `src/style/modals/config-editor-modal.css`：提供宽度、列表和官方链接样式

## 注意事项

- 本 modal 只解释配置，不读写 `.opencode/opencode.json`，也不触发服务重启
- 新增 topic 时需要同步 i18n、测试和官方链接列表
