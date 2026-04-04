# StorageService

> **源码**: `src/core/storage/StorageService.ts`
> **状态**: [REVIEW]

## 概述

`StorageService` 是 OpenCodian 的本地持久化层。它直接通过 `app.vault.adapter` 在当前 vault 根目录下维护一个 `.opencodian/` 目录，用来保存：

- 会话 JSON
- 插件设置 JSON
- 运行时状态 JSON
- 主题背景图片资产

源码里没有把这些数据写到 `.obsidian/plugins/opencodian/`；实际相对路径都是以 vault 根目录为基准。

## 导入关系

```text
上游: obsidian App/normalizePath, path, src/main.ts, src/core/opencode/types.ts, src/core/types/index.ts
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
  deleteConversation(id: string): Promise<void>;
  saveSettings(settings: OpenCodianSettings): Promise<void>;
  loadSettings(): Promise<Partial<OpenCodianSettings> | null>;
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
  settings.json
  runtime.json
  sessions/
    {conversationId}.json
  theme-backgrounds/
    theme-bg-{timestamp}-{random}.{ext}
```

`initialize()` 只会确保 3 个目录存在：

- `.opencodian`
- `.opencodian/sessions`
- `.opencodian/theme-backgrounds`

`settings.json` 和 `runtime.json` 都是按需首次写入时创建。

### 会话持久化

`saveConversation()` 会把完整 `Conversation` 序列化到单独文件，写入字段包括：

- 基本元数据：`id/title/createdAt/updatedAt/lastResponseAt`
- `titleGenerationStatus`
- `messageCount`
- `openCodeSessionId`
- `currentNote`
- `externalContextPaths`
- `messages`

也就是说，保存时不是只存摘要，而是把完整消息数组一起落盘。

读取分成两条路径：

- `loadFullConversation(id)` 返回完整 `Conversation`
- `loadConversation(id)` 只返回 `ConversationMeta`

`loadFullConversation()` 在旧文件缺少 `messages` 时会自动补成空数组；`loadConversation()` 的 `messageCount` 则优先取 `messages.length`，没有时才回退到文件里的 `messageCount`。

### 会话列表与删除

`listConversations()` 会遍历 `sessions/` 下的所有 `.json` 文件，逐个调用 `loadConversation()`，最后按以下键排序：

- 优先 `lastResponseAt`
- 否则 `updatedAt`

排序方向是从新到旧。

`deleteConversation()` 会尝试删除单个文件；文件不存在时静默忽略。

### 设置与运行时状态

`saveSettings()` / `loadSettings()` 直接读写 `.opencodian/settings.json`。

`saveManagedServerState()` / `loadManagedServerState()` 则读写 `.opencodian/runtime.json` 中的：

```json
{
  "managedServer": {
    "pid": 1234,
    "host": "127.0.0.1",
    "port": 4096
  }
}
```

运行时文件内部通过 `loadRuntimeState()` 做兜底，缺失或解析失败时会回到 `{ managedServer: null }`。

### 主题背景资产

`saveThemeBackgroundAsset()` 负责把用户上传的背景图写入 `theme-backgrounds/`：

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

`detectThemeBackgroundMimeType()` 的顺序是：

1. 优先接受合法的 `hintedMimeType`
2. 检测二进制或文本签名
3. 最后按源文件扩展名判断

其中 SVG 既支持直接 `<svg ...>` 文本，也支持 XML 头配合 `.svg` 后缀的判断。

## 数据流

```text
src/main.ts onload
  -> storage.initialize()
  -> storage.loadSettings()
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

- `src/main.ts` 是 `StorageService` 的创建者，也是设置、运行时状态、背景图资源读写的协调者。
- `src/features/chat/OpenCodianView.ts` 通过 `plugin.saveConversation()` 和部分直接调用 `plugin.storage.saveConversation()` 持久化会话。
- 主题背景图的写入、移除和读取都由 `src/main.ts` 调用这个服务，再把结果回填到设置项中。

## 注意事项

- 存储根目录是 vault 根下的 `.opencodian/`，不是插件安装目录。
- `writeBinary` / `readBinary` 都是可选 adapter API；缺失时分别表现为抛错或返回 `null`。
- `initialize()` 不会创建 `runtime.json` 与 `settings.json`，因此依赖它们存在的逻辑必须允许首次为空。
- 模块里声明了 `vaultPath`，但当前公开 API 并不直接使用这个字段。
