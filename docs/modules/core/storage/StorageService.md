# StorageService

> **源码**: `src/core/storage/StorageService.ts`
> **状态**: [DRAFT]

## 概述

OpenCodian 的持久化层，负责会话数据、插件设置、运行时状态和主题背景图片的读写。使用 Obsidian 的 `FileSystemAdapter` 进行文件操作。采用 local-first 策略：完整会话（含全部消息、上下文附件、本地通知）保存在 vault 侧插件存储中，而非仅保留元数据。

## 导入关系

上游:
- `obsidian`（`App`, `normalizePath`）
- `src/main.ts`（`OpenCodianPlugin`）
- `src/core/opencode/types.ts`（`ManagedServerState`）
- `src/core/types/index.ts`（`ChatMessage`, `Conversation`, `ConversationMeta`, `OpenCodianSettings`）

下游:
- `src/main.ts`（插件初始化时创建实例）
- `src/features/chat/OpenCodianView.ts`（读写会话）
- `src/features/settings/OpenCodianSettings.ts`（读写设置）
- `src/features/settings/ProviderIconCacheModal.ts`（图标缓存）

## 核心类型 / 接口

| 类型 | 说明 |
|------|------|
| `StoredThemeBackgroundAsset` | 已存储的主题背景图片元数据（path, mimeType, displayName） |
| `RuntimeState` | 运行时持久状态（managedServer 进程信息） |

## 核心逻辑

### 存储目录布局

```
.obsidian/plugins/opencodian/.opencodian/
├── settings.json              # 插件设置
├── runtime.json               # 运行时状态（托管服务器 PID 等）
├── provider-icons/            # 缓存的 provider 图标（mapped / custom）
├── theme-backgrounds/         # 上传的聊天主题背景图片
│   └── theme-bg-{timestamp}-{random}.{ext}
└── sessions/                  # 完整本地会话存储
    └── {conversationId}.json
```

### 会话持久化
- `saveConversation()` 保存完整 `Conversation` 对象，含 `messages[]`、`contentBlocks`、上下文附件等
- `loadFullConversation()` 加载含消息的完整会话
- `loadConversation()` 仅加载元数据（`ConversationMeta`）
- `listConversations()` 列出所有会话，按 `lastResponseAt` 降序排列

### 主题背景图片管理
- `saveThemeBackgroundAsset()` — 二进制写入 + MIME 检测 + 大小校验（≤64 MB）
- `removeThemeBackground()` — 删除已存储的背景文件
- `readThemeBackgroundDataUrl()` — 读取为 base64 data URL
- 支持格式：SVG, PNG, JPEG, WEBP, GIF

### MIME 检测策略
1. 优先使用 `hintedMimeType`
2. 检查文件头部魔术字节（SVG `<svg`, PNG `89 50 4E 47`, JPEG `FF D8 FF`, GIF `GIF87a/GIF89a`, WEBP `RIFF...WEBP`）
3. 回退到文件扩展名匹配

## 关键方法

| 方法 | 说明 |
|------|------|
| `initialize()` | 创建 `.opencodian/`, `sessions/`, `theme-backgrounds/` 目录 |
| `saveConversation(conversation)` | 保存完整会话（含消息数组） |
| `loadFullConversation(id)` | 加载完整会话（含消息） |
| `loadConversation(id)` | 仅加载会话元数据 |
| `listConversations()` | 列出所有会话元数据，按最新响应时间排序 |
| `deleteConversation(id)` | 删除会话文件 |
| `saveSettings(settings)` | 持久化插件设置到 `settings.json` |
| `loadSettings()` | 加载插件设置 |
| `saveManagedServerState(state)` | 保存托管服务器进程状态 |
| `loadManagedServerState()` | 加载托管服务器进程状态 |
| `saveThemeBackgroundAsset(data, name, mime?)` | 存储主题背景图片（≤64MB） |
| `removeThemeBackground(path)` | 删除主题背景文件 |
| `readThemeBackgroundDataUrl(path, mime?)` | 读取背景图片为 data URL |

## 数据流

1. 插件 `onload()` → `storage.initialize()` 创建目录结构
2. 用户发送消息 → `OpenCodianView` → `storage.saveConversation()` 持久化
3. 插件重载 → `loadConversations()` → `storage.listConversations()` 恢复会话列表
4. 用户切换会话 → `storage.loadFullConversation()` 加载消息
5. 设置变更 → `storage.saveSettings()` 持久化

## 与其他模块的交互

- **OpenCodianView**: 读写会话、保存/删除会话
- **OpenCodianSettings**: 读写设置
- **ServerManager**: 通过 `saveManagedServerState()` / `loadManagedServerState()` 持久化进程 PID
- **chatAppearance**: 主题背景图片的上传/删除/读取

## 配置项

无直接配置，受 `OpenCodianSettings` 中的路径和存储相关设置影响。

## 注意事项

- 会话文件使用 JSON 格式（带缩进），文件名格式为 `{conversationId}.json`
- `readBinary` 和 `writeBinary` 为可选 API，通过 `?.` 安全访问
- `vaultPath` 通过 `(adapter as any).basePath` 获取，非 Obsidian 官方 API
- 删除操作静默忽略文件不存在的错误

## 待补充
- [ ] 补充 provider-icons 目录的使用文档
- [ ] 记录会话数据迁移/兼容性策略
- [ ] 补充存储空间占用的监控建议
