# SlashCommandMenuCoordinator

2026-10-29：非空 `/` 搜索会自动展开所有含匹配项的分类，再进行高亮与键盘选择；未匹配分类及空查询保持当前折叠状态。展开只发生在搜索刷新时，同一结果中仍可手动折叠；专用 `$` 技能浏览不修改 `/` 的折叠状态。

2026-10-29：`/` 候选先按命令、技能分组，组内保留匹配排序，各组可独立折叠且由当前聊天面板记忆。方向键和插入只访问展开项；全部收起时 Tab 可聚焦分类按钮，Enter 不插入隐藏项。`$` 专用技能浏览器不受 `/` 的技能收起状态影响，原生 insertText 不变。

> 2026-10-29：`$` 技能查询不再限定 Codex；query 带前端 trigger 交给过滤器。`/` 使用命令+技能目录，`$` 使用纯技能目录，选中后写入当前后端原生 insertText。目录为空或无匹配时显示状态行，不向 `$` 菜单混入 `/skills` 命令。

> 2026-10-29：目录刷新期间保留 loading 状态，禁止 render/key handling 用上个后端的 catalog 覆盖它。慢响应切换时旧技能不可被 Tab/Enter 选中；新目录完成后才恢复筛选与键盘选择。

> **源码**: `src/features/chat/services/commands/SlashCommandMenuCoordinator.ts`
> **状态**: [REVIEW]

> **新增（Codex）**: host 可选 `isCodexSkillMode?()` 与 `onCodexSkillsEmpty?()`；`refresh()` 在 Codex 模式优先用 `getCodexSkillMenuQuery`（`$` 触发），`filterItems` 透传 `codexSkillMode`。选中 `/skills` capability 项时若 Codex 且 catalog 无 `codex-skill` 项 → 调 `onCodexSkillsEmpty`(可操作空态) 并 `clear()`，绝不留空白菜单。

## 概述

`SlashCommandMenuCoordinator` 承接 chat composer slash autocomplete 的状态机。它拥有当前 query、加载状态、可见候选、键盘选中项、hover/click selection，以及 `/skills` 顶层入口选中后的 nested skill 列表刷新。这样 `ComposerInputShellCoordinator` 继续负责输入 shell / textarea / submit lifecycle，而 slash menu 的可变状态不再留在 shell owner 内膨胀。

## 公开接口

```typescript
export interface SlashCommandMenuCoordinatorHost {
  getTextarea(): HTMLTextAreaElement | null;
  getMenuElement(): HTMLElement | null;
  getCatalogItems(): SlashCommandMenuItem[] | null;
  setCatalogItems(items: SlashCommandMenuItem[] | null): void;
  loadItems(): Promise<SlashCommandMenuItem[]>;
  getSkillMode(): SlashCommandSkillMode;
  onMenuLoadFailed(error: unknown): void;
  onCatalogStateChanged(): void;
  onMenuItemApplied(): void;
  scheduleLayoutSync(): void;
}

export class SlashCommandMenuCoordinator {
  reset(): void;
  tryHandleKeydown(event: KeyboardEvent): boolean;
  refresh(): Promise<void>;
  clear(options?: { resetCatalog?: boolean }): void;
}
```

## 关键行为

- `refresh()` 通过 `getSlashCommandMenuQuery()` 读取 textarea 光标前的 slash query 与 `isMidText` 位置标记；query 消失时关闭菜单
- 每次刷新 slash query 时都通过 host 拉取 shared catalog，再使用 `slashCommandMenuFilter.ts` 本地过滤；host 背后仍是 `SlashCommandMenuCatalogCache`，所以重复输入通常命中 view 层缓存，但 settings 隐藏命令 / 切换 skill 模式触发的 cache invalidation 不会被 composer 层旧数组挡住
- direct mode 在句首展示 command + skill；`skills-command` mode 在句首展示 command + `/skills` 顶层入口，并在 `/skills <query>` 下展示 nested skill items；句中 slash 会把 `isMidText` 传给 filter，使弹框只保留 skill candidates，同时 suppress hint 文案（避免与 mid-text skill 用法产生误导）
- `tryHandleKeydown()` 拦截 `ArrowUp` / `ArrowDown` / `Enter` / `Tab` / `Escape`，并保持 selected item scroll into view
- `applySelectedItem()` 使用 `replaceSlashTokenAtCursor()` 做局部替换，保留 slash token 前后的正文；如果选中的是顶层 `/skills` 入口，会立即刷新为 nested skill 候选而不是关闭菜单
- 载入失败只通过 `onMenuLoadFailed()` 交给 host 记录 debug log，UI 只展示 `loadFailed` 状态行

## 边界

- 不创建 composer DOM，也不直接拥有 textarea / menu element；DOM refs 由 `ComposerInputShellCoordinator` 提供
- 不处理 `@agent` query；agent mention 状态仍由 `AgentMentionComposerController` 拥有
- 不执行 slash command；真正执行仍属于 send pipeline 和 `SlashCommandExecutionService`
- 不持久化 catalog；composer 层只保存最近一次成功加载的 items 供高亮使用，刷新时仍以 view host seam 返回的 `SlashCommandMenuCatalogCache` 结果为准

## 目录定位（2026-10-23）

- 源码位置：`src/features/chat/services/commands/SlashCommandMenuCoordinator.ts`。
- 原位置：`src/features/chat/services/SlashCommandMenuCoordinator.ts`；文件名、导出接口与业务职责保持不变。
- 随目录调整更新的依赖：`src/features/chat/services/composer/composerInputParsing.ts`、`src/features/chat/services/commands/slashCommandMenuFilter.ts`、`src/features/chat/services/commands/slashCommandMenuRenderer.ts`。
