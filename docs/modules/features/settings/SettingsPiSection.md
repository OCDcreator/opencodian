# SettingsPiSection

> 源码: src/features/settings/SettingsPiSection.ts

## 职责

Pi路径、默认模型/提供商、思考和连接检查，以及独立工作台入口。toPiChatMessages保留原生ID/工具/思考，已有loadBackendSessionConversation回调负责激活聊天视图。

Pi设置归一化不修改其他后端字段。宿主回调保持可选；非桌面宿主不构造进程。

## 验证

SettingsBackendSection.test.ts、PiWorkbenchActions.test.ts、Test Vault。

## 2026-09-09 独立后端页面

Pi主标签与ClaudeCode/Codex采用同一注册/section shell契约；二级页为连接、提供商、模型与思考、执行与上下文、资源、账户、会话、高级。原通用设置内联Pi配置已移除。经典布局仍提供本地二级导航。原生配置管理交给SettingsPiConfigurationSection/SettingsPiProvidersSection；会话瞬时控制仍留在工作台。
