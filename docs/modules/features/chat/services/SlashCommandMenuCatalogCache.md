# SlashCommandMenuCatalogCache

> **源码**: `src/features/chat/services/SlashCommandMenuCatalogCache.ts`
> **状态**: [REVIEW]

## 概述

`SlashCommandMenuCatalogCache` 是 chat slash menu 的 catalog 加载缓存。它把较慢的 runtime `sdk.command.list()`、`sdk.app.skills()`、project command 配置和 command-owned hidden agent 配置合并成 `SlashCommandMenuItem[]`，保留普通 command 与 skill 的 `source` 信息，并避免第一次用户输入 `/` 时重复等待同一批加载。

## 核心行为

- `load()` 返回当前 hidden-command key 下的缓存结果；缓存仍新鲜时不再触发 runtime 请求。
- 如果后台预热仍在进行，用户触发的 `load()` 会复用同一个 pending promise，不会再发第二次 `sdk.command.list()`。
- hidden command 列表会进入 cache key；设置里隐藏/显示命令后，下一次加载会重新合并 catalog。
- runtime `source === 'skill'` 会进入缓存；后续由 `slashCommandMenuFilter.ts` 按 `slashCommandSkillMode` 决定直显或 `/skills` 前缀。
- `sdk.app.skills()` 失败时不会让整个 slash menu 失败；cache 会回退到“只有 command/source 没有 provenance”的 catalog，保证 `/` 菜单仍可用。
- runtime skill 的 `location` 会在 cache 内转换成 `skillSource`，供 UI 按当前语言显示“项目 / OpenCode 项目 / 插件：xxx / 全局 / 自定义路径”等来源说明。
- `warm()` 只做后台预热；失败时通过 `onWarmLoadFailed()` 交给调用方 debug log，不把错误固化到缓存里。
- `invalidate()` 清理缓存与 pending 引用，用于 view close 或需要强制刷新时。

## 关联模块

- `OpenCodianView.ts`: 创建本 cache，view 打开后延迟预热，并把 `load()` 暴露给 `ComposerInputShellCoordinator` host seam。
- `ComposerInputShellCoordinator.ts`: 只负责 slash menu 状态与 DOM 渲染；不直接知道 runtime/project catalog 如何加载。
- `core/config/slashCommandCatalog.ts`: 提供 runtime/project command 合并与 visible menu projection。

## 注意事项

- 不要在输入每个字符时绕过 cache 直接调用 `sdk.command.list()`；这会重新引入首次 slash menu 长时间 loading。
- 如果后续 project command editor 需要即时刷新 chat menu，可调用 view 侧的 cache invalidation seam，而不是复制 catalog 合并逻辑。
