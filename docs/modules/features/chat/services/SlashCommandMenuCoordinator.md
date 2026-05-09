# SlashCommandMenuCoordinator

> **源码**: `src/features/chat/services/SlashCommandMenuCoordinator.ts`
> **状态**: [REVIEW]

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
- 首次打开菜单时通过 host 拉取 shared catalog，后续同一 session 使用 `slashCommandMenuFilter.ts` 本地过滤
- direct mode 在句首展示 command + skill；`skills-command` mode 在句首展示 command + `/skills` 顶层入口，并在 `/skills <query>` 下展示 nested skill items；句中 slash 会把 `isMidText` 传给 filter，使弹框只保留 skill candidates，同时 suppress hint 文案（避免与 mid-text skill 用法产生误导）
- `tryHandleKeydown()` 拦截 `ArrowUp` / `ArrowDown` / `Enter` / `Tab` / `Escape`，并保持 selected item scroll into view
- `applySelectedItem()` 使用 `replaceSlashTokenAtCursor()` 做局部替换，保留 slash token 前后的正文；如果选中的是顶层 `/skills` 入口，会立即刷新为 nested skill 候选而不是关闭菜单
- 载入失败只通过 `onMenuLoadFailed()` 交给 host 记录 debug log，UI 只展示 `loadFailed` 状态行

## 边界

- 不创建 composer DOM，也不直接拥有 textarea / menu element；DOM refs 由 `ComposerInputShellCoordinator` 提供
- 不处理 `@agent` query；agent mention 状态仍由 `AgentMentionComposerController` 拥有
- 不执行 slash command；真正执行仍属于 send pipeline 和 `SlashCommandExecutionService`
- 不持久化 catalog；catalog cache 仍由 `SlashCommandMenuCatalogCache` 和 view host seam 提供
