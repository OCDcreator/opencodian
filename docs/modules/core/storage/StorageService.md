# StorageService

> **源码**: `src/core/storage/StorageService.ts`
> **状态**: [REVIEW]

## 概述

`StorageService` 是 OpenCodian 的本地持久化层。它直接通过 `app.vault.adapter` 在当前 vault 根目录下维护一个 `.opencodian/` 目录，用来保存：

- 会话 JSON
- 会话元数据 sidecar JSON
- 分层插件设置 JSON
- 运行时状态 JSON
- 主题背景图片资产（通过内部 `ThemeBackgroundStorage` owner）

源码里没有把这些数据写到 `.obsidian/plugins/opencodian/`；实际相对路径都是以 vault 根目录为基准。为了排查冷启动和首个 tab 打开过慢的问题，模块现在还会同时承担两件事：

- `listConversations()` 输出本次会话元数据扫描耗时，并维护最近一次会话列表扫描诊断快照
- 当历史会话还没有轻量 metadata sidecar 时，自动从完整 session JSON 回退读取并回填 sidecar，减少后续冷启动的读盘量

## 导入关系

```text
上游: obsidian App/normalizePath, src/main.ts, src/core/opencode/types.ts, src/core/storage/ThemeBackgroundStorage.ts, src/core/types/index.ts
下游: src/main.ts, src/features/chat/OpenCodianView.ts
```

## 对外 API

```typescript
class StorageService {
  initialize(): Promise<void>;
  saveConversation(conversation: Conversation): Promise<void>;
  loadFullConversation(id: string): Promise<Conversation | null>;
  loadConversation(id: string): Promise<ConversationMeta | null>;
  listConversations(): Promise<ConversationMeta[]>;
  getConversationListDiagnosticsSnapshot(): ConversationListDiagnostics | null;
  deleteConversation(id: string): Promise<void>;
  saveCoreSettings(settings: PersistedCoreSettings): Promise<void>;
  saveUiSettings(settings: PersistedUiSettings): Promise<void>;
  loadPersistedSettings(): Promise<SettingsLoadResult>;
  saveManagedServerState(state: ManagedServerState | null): Promise<void>;
  loadManagedServerState(): Promise<ManagedServerState | null>;
  saveThemeBackgroundAsset(data: ArrayBuffer, sourceName: string, hintedMimeType?: string): Promise<{
    path: string;
    mimeType: string;
    displayName: string;
  }>;
  removeThemeBackground(storedPath: string | null | undefined): Promise<void>;
  readThemeBackgroundDataUrl(storedPath: string, hintedMimeType?: string): Promise<string | null>;
}
```

## 核心逻辑

### 存储目录布局

源码定义的路径常量如下：

```text
.opencodian/
  settings.core.json
  settings.core.json.bak
  settings.ui.json
  settings.ui.json.bak
  settings.json
  runtime.json
  sessions/
    {conversationId}.json
  session-metas/
    {conversationId}.json
  theme-backgrounds/
    theme-bg-{timestamp}-{random}.{ext}
```

`initialize()` 只会确保 4 个目录存在：

- `.opencodian`
- `.opencodian/sessions`
- `.opencodian/session-metas`
- `.opencodian/theme-backgrounds`

`settings.core.json` / `settings.ui.json` / `runtime.json` 都是按需首次写入时创建。

### 会话持久化

`saveConversation()` 会把完整 `Conversation` 序列化到单独文件，写入字段包括：

- 基本元数据：`id/title/createdAt/updatedAt/lastResponseAt`
- `titleGenerationStatus`
- `messageCount`
- `openCodeSessionId`
- `currentNote`
- `externalContextPaths`
- `sessionSettings`
- `backgroundTaskMetadata`
- `messages`

也就是说，保存时不是只存摘要，而是把完整消息数组一起落盘；同时还会额外写一份轻量 sidecar metadata，里面只保留历史列表需要的字段（`title/updatedAt/messageCount/openCodeSessionId` 等）。

`backgroundTaskMetadata` 只作为会话级 background-task lifecycle 恢复缓存随完整 session JSON 保存和读取；它不进入 conversation list sidecar，也不承载 assistant 正文、工具输出、结构化 payload 或 `contentBlocks` 真值。

保存完整 conversation 前，`StorageService` 会对已有 `sessions/{id}.json` 做一个窄范围 stale-overwrite guard：如果待保存对象的 message 列表为空或只是磁盘中完整 message 列表的前缀，则保存新的 metadata 字段但保留磁盘中的完整 messages。这个保护只防止旧 full-message 快照覆盖新消息，不做任意历史分叉合并；如果 message id 序列已经分叉，会记录诊断并按调用方传入对象保存。

完整消息的磁盘真值仍是 `sessions/{id}.json`。内存层现在可以通过 `ConversationFullMessageCache` 把未 pin 的 `Conversation.messages` 裁剪为空数组；下一次打开该 conversation 时会再走 `loadFullConversation(id)` 从磁盘恢复完整消息。

读取分成两条路径：

- `loadFullConversation(id)` 返回完整 `Conversation`
- `loadConversation(id)` 只返回 `ConversationMeta`

`loadFullConversation()` 在旧文件缺少 `messages` 时会自动补成空数组，并会顺手归一化 `sessionSettings`；`loadConversation()` 的 `messageCount` 则优先取 `messages.length`，没有时才回退到文件里的 `messageCount`。

为了区分“是 metadata 扫描慢”还是“单个大对话读盘慢”，`loadFullConversation()` 现在会在读取明显偏慢时记录一条 debug 日志，包含：

- `conversationId`
- `messageCount`
- 读取与 JSON 解析总耗时

### 会话列表与删除

`listConversations()` 仍然以 `sessions/` 下的 `.json` 文件为真值来源，但读取顺序变成了：

1. 先看对应的 `session-metas/{id}.json` 是否存在且可读
2. sidecar 命中时直接返回 metadata
3. sidecar 缺失或无效时，才回退读取完整 `sessions/{id}.json`
4. 回退成功后异步补写新的 sidecar，供后续冷启动复用

最后仍按以下键排序：

- 优先 `lastResponseAt`
- 否则 `updatedAt`

排序方向是从新到旧。

`listConversations()` 现在还会输出一条 startup debug 汇总日志，带上：

- `sessions/` 目录总文件数
- 实际扫描的 session `.json` 文件数
- 命中的 sidecar metadata 数
- 回退到完整 session JSON 的次数
- 成功载入的 conversation 数
- 总耗时

同时，模块会缓存最近一次扫描的结构化诊断快照，供 `main.ts` 的 startup analysis / diagnostic report 直接读取：

- `sessionFileCount`
- `metadataFileCount`
- `metadataHitCount`
- `fullSessionFallbackCount`
- `metadataBackfillScheduledCount`
- `totalFallbackBytes`
- `slowestFallbacks`
- `largestFallbackSessions`

`deleteConversation()` 会尝试删除单个文件；文件不存在时静默忽略。

删除 conversation 时，插件层还会同步调用 `ConversationFullMessageCache.forget(id)` 与 `OpenCodeService.deleteSession()`；后者会在服务端删除尝试结束后清理本地 canonical session graph。

### 设置与运行时状态

设置不再整份覆盖写到单个文件，而是拆成两个 envelope 文件：

- `settings.core.json`: 关键用户设置（模型、权限、主题外观、语言、`providerIconLibrary`、`disabledModelRefs` 等）
- `settings.ui.json`: 临时 UI 状态（`tabState`、设置页滚动位置、模型设置展开状态）

每个文件都保存为：

```json
{
  "schemaVersion": 1,
  "updatedAt": 1710000000000,
  "source": "settings.core",
  "data": {
    "...": "..."
  }
}
```

`saveCoreSettings()` / `saveUiSettings()` 共享同一个串行写队列，写主文件前会尽量把旧内容复制到对应 `.bak`。

`loadPersistedSettings()` 的恢复顺序是：

1. 读主文件
2. 主文件无效时读 `.bak`
3. 仍失败时尝试旧 `settings.json`
4. 只有真正无文件时才返回 `missing`

如果主文件、备份和旧文件都不可恢复，则返回 `blocked`，由上层停止自动覆盖写回。

`saveManagedServerState()` / `loadManagedServerState()` 则读写 `.opencodian/runtime.json` 中的：

```json
{
  "managedServer": {
    "pid": 2345,
    "launcherPid": 1234,
    "listenerPid": 2345,
    "host": "127.0.0.1",
    "port": 4196
  }
}
```

其中：

- `pid` 现在优先表示真实 listener pid，供旧调用点继续把它当成“主 pid”读取
- `launcherPid` 记录最初 `spawn()` 到的 wrapper / shell / direct child pid
- `listenerPid` 记录当前监听本地端口的真实进程 pid

运行时文件内部通过 `loadRuntimeState()` 做兜底，缺失或解析失败时会回到 `{ managedServer: null }`。旧格式只有单个 `pid` 的快照仍然允许读取，但新的生命周期逻辑会在下次成功 adopt / start 后把它升级成带 listener / launcher 的新结构。

### 主题背景资产

`saveThemeBackgroundAsset()` / `removeThemeBackground()` / `readThemeBackgroundDataUrl()` 现在委托给 `ThemeBackgroundStorage`，但对外 API 与调用时机保持不变。

背景图 owner 仍负责把用户上传的背景图写入 `theme-backgrounds/`：

1. 先校验大小不能超过 64 MB
2. 检测 MIME 类型
3. 映射扩展名
4. 调用 adapter 的 `writeBinary()` 写文件
5. 返回 `{ path, mimeType, displayName }`

支持的格式只有：

- SVG
- PNG
- JPEG
- WEBP
- GIF

`removeThemeBackground()` 删除已存储的背景图文件。

`readThemeBackgroundDataUrl()` 会：

1. 先检查文件是否存在
2. 调用 adapter 的 `readBinary()`
3. 重新判断 MIME
4. 转成 `data:${mimeType};base64,...`

如果文件不存在，或者 adapter 不支持 `readBinary()`，返回 `null`。

### MIME 检测顺序

`ThemeBackgroundStorage.detectMimeType()` 的顺序是：

1. 优先接受合法的 `hintedMimeType`
2. 检测二进制或文本签名
3. 最后按源文件扩展名判断

其中 SVG 既支持直接 `<svg ...>` 文本，也支持 XML 头配合 `.svg` 后缀的判断。

## 数据流

```text
src/main.ts onload
  -> storage.initialize()
  -> storage.loadPersistedSettings()
  -> storage.loadManagedServerState()
  -> storage.listConversations()

OpenCodianView 会话变更
  -> plugin.saveConversation()
  -> storage.saveConversation()

主题背景上传 / 删除
  -> src/main.ts
  -> storage.saveThemeBackgroundAsset() / removeThemeBackground()
```

## 与其他模块的交互

- `src/main.ts` 是 `StorageService` 的创建者，也是设置恢复、分层保存、运行时状态、背景图资源读写的协调者。
- `src/features/chat/OpenCodianView.ts` 通过 `plugin.saveConversation()` 持久化会话；UI 状态写盘也要先回到插件层。
- 会话 metadata sidecar、fallback 统计和 sidecar 回填细节已经从 `StorageService` 主类收束到 `src/core/storage/ConversationMetadataCache.ts`。
- 主题背景图的写入、移除和读取都由 `src/main.ts` 调用这个服务，再把结果回填到设置项中。
- 背景图二进制细节已经从 `StorageService` 主类收束到 `src/core/storage/ThemeBackgroundStorage.ts`。

## 注意事项

- 存储根目录是 vault 根下的 `.opencodian/`，不是插件安装目录。
- `writeBinary` / `readBinary` 都是可选 adapter API；缺失时分别表现为抛错或返回 `null`。
- `initialize()` 不会创建 `runtime.json`、`settings.core.json` 与 `settings.ui.json`，因此依赖它们存在的逻辑必须允许首次为空。
- 会话 metadata sidecar 是性能缓存，不是唯一真值；即使 sidecar 缺失或写入失败，也必须允许回退到完整 session JSON。
- 第一次升级到这套 sidecar 方案的冷启动，可能仍会看到若干 full-session fallback；完成一次启动后，后续冷启动应该更多命中 `session-metas/`。
- 设置恢复把“损坏/不可解析”与“文件不存在”区分开处理，避免把损坏文件误当首次安装再写默认值覆盖。
- 模块里声明了 `vaultPath`，但当前公开 API 并不直接使用这个字段。

## 2026-04-24 Dual-layout settings persistence

Settings UI now supports dual-layout mode (classic flat / tabbed primary+secondary tabs). `PersistedUiSettings` gained three new keys:

- `settingsLayoutMode` — user's preferred layout mode (`'classic'` or `'tabbed'`)
- `settingsTabbedPrimaryTab` — active primary tab in tabbed mode (e.g. `'server'`, `'model'`)
- `settingsTabbedSecondaryTabByPrimary` — saved secondary tab IDs keyed by primary tab ID

These are persisted in `settings.ui.json` alongside existing UI state (tab state, scroll position, model section open states). The split persists — core settings go to `settings.core.json`, UI-only state (including layout preferences) to `settings.ui.json`.
