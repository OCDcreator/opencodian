# SettingsDshSection

> 2026-10-24：增加原生/ACP 接入选择；默认原生通道支持图片、历史和行内能力。MCP 保存后可显式应用到已打开的空闲原生会话，返回应用计数；运行回合拒绝变更。ACP 模式仍只在新建/恢复时接收声明。页面不把已保存声明等同在线状态，不声称支持 OAuth、历史删除或独立终端。

源码：`src/features/settings/backends/dsh/SettingsDshSection.ts`

DSH 的连接、MCP 声明和原生默认值读取区。由现有 SettingsBackendSection 注入窄 `DshSettingsHost`，设置区仅依赖 core.types 与 i18n，不直接引入 main.ts、后端运行时或新的服务 owner。

- 启用 DSH 时显示 CLI/Desktop 路径、工作目录和连接测试。
- MCP JSON 编辑器整批校验后保存；失败回滚原声明，编辑器旁的 aria-live 状态直接显示成功或错误，避免独立设置窗口依赖主窗口 Notice。明确说明只对新建/恢复会话生效，不声称热连接或 OAuth 已完成。
- 读取配置准备一个供下一次新聊天复用的草稿，仅显示原生 configOptions 返回的名称与当前值；设置页不提供会被会话继承策略覆盖的临时编辑控件。
- 聊天工具栏是模型与推理强度的唯一编辑入口，按 conversation 持久化，并在发送边界等待原生确认。
- 图片说明只报告当前连接是否提供输入能力；原生仍需校验模型。历史回放、删除、分支、命令、终端与行内限制明确可见。

沿用原生 Obsidian Setting、现有全宽编辑器和 disclosure 样式；没有新增 CSS、模态或视觉 token。
