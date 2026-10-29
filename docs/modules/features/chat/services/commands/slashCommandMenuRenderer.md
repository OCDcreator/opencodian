# slashCommandMenuRenderer

2026-10-29：`/` 菜单增加本地化命令／技能分类与数量，独立 disclosure 复用 `@` 的原生按钮、箭头、焦点和 hidden 内容规则。`getSlashCommandMenuGroup` 按真实 source 分类；渲染分组保留原候选索引，避免 pointer 回调选错原生条目。`$` 入口保持纯技能列表。

2026-10-29：`@` 分类标题使用原生 disclosure button，带 Lucide 箭头、匹配数量、`aria-expanded` 和 `aria-controls`，折叠内容不渲染可选项。`getAgentMentionMenuGroup` 与控制器共用文件／会话／插件／资源／代理分组映射；键盘切换后恢复标题焦点，指针操作保留 composer 焦点。

2026-09-25 ZCode 原生目录在可见菜单出现 `//goal`：目录项 `displayId` 已带 `/`，渲染器再加前缀。现对已带 `/` 的 displayId 原样显示；未带前缀的普通命令仍补一个 `/`，Codex `$skill` 规则保持不变。

> **源码**: `src/features/chat/services/commands/slashCommandMenuRenderer.ts`
> **状态**: [REVIEW]

> **更新**: `renderSlashCommandMenuItem` 标题为源感知——直接 Codex skill 候选(`source:'codex-skill'` 且 `displayId` 以 `$` 开头)原样显示 `$skill-name`(不再误加 `/` 前缀);经 `/skills` 前缀到达的 codex skill 仍显示 `/skills <name>`;普通 slash 命令不变。`buildSourceBadge` 将 `codex-skill` 归类为 Skill 徽章(非 Command)。

## 概述

`slashCommandMenuRenderer.ts` 是聊天输入区 autocomplete overlay 的纯渲染 helper。它把 slash menu 的状态行、badge、skill 来源文案、menu item DOM，以及 `@agent` 候选 item DOM 从 `ComposerInputShellCoordinator` 中抽离，避免输入区 shell owner 因菜单展示细节继续膨胀。

## 公开接口

```typescript
export type SlashCommandMenuStatus =
  | 'idle'
  | 'loading'
  | 'emptyCatalog'
  | 'noMatches'
  | 'loadFailed';

export function renderSlashCommandMenu(options: RenderSlashCommandMenuOptions): void;
export function renderAgentMentionMenu(options: RenderAgentMentionMenuOptions): void;
```

## 行为

- 空列表时根据 `status` 渲染 loading / empty / noMatches / loadFailed 状态行；slash menu 使用 `slashCommand.menu.*` locale 键，agent mention menu 使用独立的 `agentMention.menu.*` locale 键（通过 `getAgentMentionMenuStateText()` 渲染）
- 有命令时，菜单顶部先渲染一条 `slashCommand.menu.hint` 提示文案（斜杠命令仅在输入框开头生效），随后输出 title、source badge、skill provenance 文案和 description；mid-text 模式下（用户在文本中间触发 slash 补全）不显示该 hint，避免与 `/skills <skill>` 等可在中间输入的技能命令产生误导
- runtime 返回的普通 slash command badge 显示为 `command`，不再把 command 来源展示成更含糊的“runtime”；skill / override / project 继续使用各自来源文案
- 内置命令（白名单内如 `init`、`review`、`help` 等）额外显示 `built-in` badge，并支持 i18n 翻译 description；非内置命令保持原始 description
- 有 agent 候选时输出 `@id` 标题、可选 displayName badge 和 description
- 统一引用模式使用 `referenceMention.menu.*` 状态文案，并按文件/文件夹、Vault 会话、插件/应用、MCP 资源和 agent 输出本地化分组。引用项使用真实 label、类型图标、完整 title 与可选会话日期，日期显示本地格式并保留完整 tooltip
- `mouseenter` 与 `click` 只通过回调把 index 交还给调用方，不直接持有 coordinator 状态
- skill provenance 文案基于 catalog 的 `skillSource` 做多语言映射，不重新推断路径来源

## 边界

- 不负责 slash / `@agent` query 解析、catalog 加载、fuzzy 过滤或真正执行命令
- 不调度 layout sync，也不直接操作 textarea
- 选择状态仍由调用方持有；本模块只消费当前 `selectedIndex`
- hint 元素带有 `aria-hidden="true"`，避免被 screen reader 误读为 listbox option

## 目录定位（2026-10-23）

- 源码位置：`src/features/chat/services/commands/slashCommandMenuRenderer.ts`。
- 原位置：`src/features/chat/services/slashCommandMenuRenderer.ts`；文件名、导出接口与业务职责保持不变。
