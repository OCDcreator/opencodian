# Settings Load Normalization

> **源码**: `src/core/types/settingsLoadNormalization.ts`
> **状态**: [REVIEW]

## 概述

`settingsLoadNormalization.ts` 收束插件启动时的 persisted-settings bootstrap seam。它把 `main.ts` 里原本混杂的 core/ui snapshot merge、历史 server 结构迁移、theme/chat appearance 恢复、input panel legacy reset，以及“本次启动后是否要立刻回写归一化设置”的判定集中到单一 owner。

这个模块不负责真正读写文件，也不负责 Obsidian 插件装配；它只把 `StorageService.loadPersistedSettings()` 的结果变成 `OpenCodianPlugin.loadSettings()` 可直接消费的 bootstrap state。

## 导入关系

```text
上游:
- `src/core/storage/index.ts` (`SettingsLoadResult`)
- `src/core/theme/*`
- `src/core/types/settings.ts`

下游:
- `src/main.ts`
```

## 核心类型 / 状态

- `LoadedSettingsSnapshot`: 合并 `settings.core.json` / `settings.ui.json` 后的临时快照，同时兼容 legacy flat server 与废弃字段。
- `LoadSettingsNormalizationContext`: 聚合 server/theme/chat appearance/tab/input-panel 的归一化结果，供最终 settings 装配复用。
- `LoadSettingsBootstrapState`: `prepareLoadedSettingsBootstrapState()` 的返回值，包含 `settings`、原始 `persistedSettings` 以及 `shouldPersistNormalizedSettings` 判定。

## 核心逻辑

### `prepareLoadedSettingsBootstrapState()`

唯一公开入口，完成：

1. 合并分层持久化快照；
2. 归一化 server/theme/chat appearance/input-panel/question/debug 等启动设置；
3. 计算 legacy local port 与 glass defaults migration 是否命中；
4. 生成最终 `OpenCodianSettings`；
5. 决定本次启动是否需要把归一化结果立即写回磁盘。

### server / theme / input-panel 迁移

- `normalizeServerSettingsOnLoad()` 兼容旧的扁平 `server.{host,port,autoStart}` 结构，并保留 legacy `4096` → local sidecar 默认端口迁移信号。
- `normalizeThemeAndChatAppearanceOnLoad()` 保持 preset-backed theme 与生效 `chatAppearance` 的恢复顺序，并保留背景图字段。
- `normalizeInputPanelSettingsOnLoad()` 继续处理 glass/card/pill 默认层级 reset，以及 legacy `nikdelvin` 默认档案回填。

## 与其他模块的交互

- 依赖 `settings.ts` 的 `normalize*` / `getDefault*` 工具函数，但不把这些纯函数重新包装成新的 facade。
- 依赖 `core/theme` 的 preset 解析与 appearance override 计算，确保 theme startup 顺序与原逻辑一致。
- 被 `main.ts` 调用后，`loadSettings()` 只负责状态落位、可写性标记与必要的持久化回写。

## 注意事项

- 这里只处理启动期 bootstrap normalization；保存路径、UI refresh、locale/theme side effects 仍在 `main.ts`。
- 不能改变 conversation preload、plugin load order、provider/model disable layering 或 locale keys。
