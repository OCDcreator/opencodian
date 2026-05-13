# SettingsSkillSection

> **源码**: `src/features/settings/SettingsSkillSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsSkillSection` 是设置页 `Skills` 一级标签的 section owner。它在设置 UI 中读取 OpenCode `GET /skill` 目录，按来源分组展示技能，并提供项目技能文件 CRUD、Markdown 预览/编辑、格式校验、全局 `skill` 权限与单技能 pattern 权限写入入口。

## 核心逻辑

### 技能目录加载

- 直接通过 Obsidian `requestUrl` 请求当前设置解析出的 OpenCode server `/skill` endpoint。
- 支持数组响应和 `{ skills: [...] }` 响应两种形态。
- 请求失败时显示 `settings.skills.empty`，不阻塞设置页其他内容。

### 来源分组

技能按 `location` 归类为 project / global / builtin / claude / agents。归类规则与 `SkillCatalogService` 保持一致，方便后续改回共享 service seam。

### 工具栏与来源分组

顶部控制集中在 `opencodian-skill-toolbar` 中：全局权限 dropdown、新建技能按钮与刷新按钮并列。技能列表会先显示 `opencodian-skill-loading`，加载完成后按来源渲染 `opencodian-skill-source-section`，每个来源 header 显示来源名和数量。

### 内容渲染

技能列表项现在是紧凑行，只显示技能名、描述、来源路径和操作，不在卡片里塞完整 `SKILL.md`。路径被收在内容列并截断，避免长路径挤压描述；描述保持两行以内，供快速扫描。点击 `Open` 会打开 `SkillDetailModal`：顶部是全宽格式校验条，中间是会吃掉 modal 剩余高度的双栏工作区，左侧为 Markdown 源文本编辑区，右侧使用 Obsidian `MarkdownRenderer.renderMarkdown()` 渲染完整预览；源码与预览面板本身各自滚动，因此底部操作区不会再被长内容或较矮窗口挤出 modal 可视区。弹窗宽度作用在 Obsidian 外层 modal 上，保证宽屏双栏真正居中可见，而不是让内容从默认窄 modal 中向右溢出。若服务器只返回正文而非完整 frontmatter 文件，弹窗会用目录元数据补齐 `name` / `description` frontmatter，避免把只读技能误判为缺少 frontmatter。外部/global/plugin 技能在这里只读；当前 vault 内 `.opencode/skills/`、`.claude/skills/`、`.agents/skills/` 下的技能允许保存或删除。

### 技能文件与格式校验

- 新建技能写入 `.opencode/skills/<name>/SKILL.md`，模板包含 `name` / `description` frontmatter 和正文。
- 保存前校验 frontmatter `---` 边界、允许字段集合（`name`、`description`、`license`、`allowed-tools`、`metadata`、`compatibility`）、`name`、`description`、`compatibility` 和正文内容。规则对齐快速校验脚本：`name` 必须是 1-64 个小写字母或数字并用单个连字符分隔，编辑已有技能时还必须和父目录名一致；`description` 必须是 1-1024 个字符且不能包含尖括号；`compatibility` 若存在则必须在 500 字符以内。
- 删除只对当前 vault 内可解析的技能路径开放，避免误删全局或插件缓存技能。

### 权限写入

顶部权限 dropdown 读取 `opencodeConfigManager.read().permission` 中的 `skill` 配置，并通过 `OpencodeConfigManager.setToolPermission('skill', action)` 写回项目 OpenCode 配置。
每个技能行也提供单独权限 dropdown，通过 `OpencodeConfigManager.setSkillPermissionPattern(skillName, action)` 写入 `permission.skill.<skillName>`，用于对某个技能覆盖全局默认值。

## 与其他模块的交互

- `src/features/settings/SettingsTabbedRenderer.ts`: 路由 `skills` 一级标签并调用 `attachTabbed()`。
- `src/core/config/OpencodeConfigManager.ts`: 读取和写入 `skill` 工具权限，以及 `permission.skill` pattern 权限。
- `src/features/chat/services/SkillCatalogService.ts`: 复用其 `SkillInfo` / `SkillSourceGroups` 类型与来源语义。
- `src/core/types/settings.ts`: 提供 server base URL 解析。

## 注意事项

- 该 section 当前自包含技能 fetch 逻辑，不依赖 plugin 级 `skillCatalogService` 属性。
- 若未来把技能文件操作复用于 chat/slash surface，再考虑抽出共享 service；当前只服务设置页，保持 section-local 即可。
