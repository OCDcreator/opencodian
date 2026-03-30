# OpenCodian 开发日志

> **📋 日志记录原则**
> 
> 本日志采用**倒序排列**，最新的开发进度写在**最前面**。
> 
> 新的日期型日志必须插入到最上方第一个 `## YYYY-MM-DD ...` 条目前，禁止追加到文件末尾。
> 
> 每次更新后必须运行：`npm run check:devlog-order`
> 
> 如需查看最新进展，请直接阅读最上方的条目。

---

## 2026-03-30 工具摘要全量补齐与 Bash 失败状态修正

### 🎯 改动目标

- 修复 `bash` 工具在命令实际失败、输出明确错误时，工具卡片先显示红 `×`、消息结束后又错误翻成绿 `√` 的状态误判。
- 让 `skill` 工具在调用一开始就直接显示所加载的 skill 名称，不再只出现一个空白或信息不足的工具项。
- 将工具栏摘要补齐到更多 OpenCode 常见工具，按工具类型展示更直观的关键信息，减少只看到原始工具名却不知道它在做什么的情况。

### ✅ 本轮调整

- `src/shared/toolExecution.ts`
  - 扩充 `bash` 失败输出识别规则
  - 新增对 `rm: cannot remove ... No such file or directory`、`curl: (35) ... SSL/TLS connection failed`、握手失败等典型失败输出的识别
  - 让这类已完成但实际失败的 `bash` 结果稳定归类为 `error`，不再被后续状态收敛逻辑误判成 `completed`

- `src/utils/streaming/ToolCallRenderer.ts`
  - 补全更多工具的显示名与图标映射
  - 将工具摘要逻辑扩展为按类型生成：
    - `read`：文件名 + 读取范围
    - `write` / `edit`：文件名
    - `multiedit`：文件名 + 编辑次数
    - `apply_patch` / `patch`：补丁涉及文件数或文件名
    - `list`：目录名
    - `glob` / `grep`：模式、包含规则、目录摘要
    - `lsp`：操作名 + 文件位置
    - `websearch` / `webfetch` / `codesearch`：查询或 URL
    - `task`：子代理类型 + 描述
    - `question`：问题标题或问题数
    - `skill`：skill 名称，生成时立即可见
    - `todoread` / `todowrite`：当前任务或任务进度摘要
    - `plan_enter` / `plan_exit`：模式切换提示

- `tests/unit/core/opencode/OpenCodeService.test.ts`
  - 新增 `rm` 缺失文件报错输出识别测试
  - 新增 `curl` TLS 握手失败输出识别测试

- `tests/unit/utils/streaming/ToolCallRenderer.test.ts`
  - 新增 `skill` 工具即时显示 skill 名称测试
  - 新增多类工具摘要渲染测试，覆盖 `read`、`multiedit`、`apply_patch`、`list`、`glob`、`grep`、`lsp`、`websearch`、`webfetch`、`task`、`question`、`todoread`

### 🧪 验证结果

- 通过：`npm test -- tests/unit/utils/streaming/ToolCallRenderer.test.ts tests/unit/core/opencode/OpenCodeService.test.ts`
- 通过：`npm run check:devlog-order`
- 通过：`npm run build`
- 已部署到测试库并确认 `BUILD_ID`：`main.202603301655`

### 📝 结论

- 这轮改动把工具卡片的可读性从“只显示工具名”提升为“按工具类型直接显示关键上下文”，同时修正了 `bash` 工具在明显失败场景下的状态反转问题；像 `skill` 这类工具也能在生成时立刻看出它具体调用了什么。

## 2026-03-30 用户消息原始标记代码化显示与会话开关

### 🎯 改动目标

- 解决用户消息中直接包含 `CSS` / `HTML` / `JS` / `XML` / `SVG` 等原始标记时，被 Obsidian Markdown 渲染链当作真实内容参与渲染的问题。
- 在不破坏现有用户消息 Markdown 展示能力的前提下，让这类原始标记优先以代码格式安全显示。
- 增加一个会话设置开关，允许在“原始标记代码化显示”和“沿用原始 Markdown 渲染”之间切换。

### ✅ 本轮调整

- `src/features/chat/userMessageDisplay.ts`
  - 新增用户消息显示预处理层，专门处理原始标记内容
  - 将 `<style>...</style>` 转成 `css` fenced code block
  - 将 `<script>...</script>` 转成 `javascript` fenced code block
  - 将独立的 `HTML` / `SVG` / `XML` 声明 / `MathML` / `DOCTYPE` / `comment` / `CDATA` 等统一归入 `html` fenced code block
  - 对未成块、残缺或 inline 的原始标记片段做转义，避免被 Markdown 渲染链继续解析

- `src/features/chat/OpenCodianView.ts`
  - 用户消息显示改为先走 `prepareUserMessageMarkdownForDisplay()`，再进入现有 Markdown 渲染流程
  - 新增当前会话重渲染入口，供设置开关切换后立即刷新聊天区
  - 保持 assistant 消息与其它现有渲染逻辑不变，只对用户消息显示链路做最小改动

- `src/core/types/settings.ts` / `src/main.ts`
  - 新增设置项 `renderUserMarkupAsCodeBlocks`
  - 默认值设为 `true`，保持当前安全显示行为
  - 加入设置加载与兼容归一化逻辑，旧配置缺失该字段时自动回退到默认值
  - 新增插件级 `refreshConversationRendering()`，用于统一刷新已打开的聊天视图

- `src/features/settings/OpenCodianSettings.ts`
  - 在“会话”设置分区新增开关
  - 切换后保存设置，并立即触发当前聊天视图重渲染，无需手动关闭重开

- `src/i18n/locales/en.ts` / `src/i18n/locales/zh.ts`
  - 补充会话设置开关的中英文文案

- `tests/unit/features/chat/userMessageDisplay.test.ts`
  - 新增并扩展用户消息预处理单测
  - 覆盖 `CSS`、`JS`、`HTML`、`SVG`、`XML`、`MathML`、`DOCTYPE`、`comment`、`CDATA`、inline / dangling 标记等场景

- `tests/unit/core/types/settings.test.ts`
  - 新增默认设置断言，确保 `renderUserMarkupAsCodeBlocks` 默认开启

### 🧪 验证结果

- 通过：`npm run test -- tests/unit/core/types/settings.test.ts tests/unit/features/chat/userMessageDisplay.test.ts tests/unit/features/settings/OpenCodianSettings.test.ts`
- 通过：`npx eslint src/core/types/settings.ts src/main.ts src/features/chat/OpenCodianView.ts src/features/settings/OpenCodianSettings.ts src/i18n/locales/en.ts src/i18n/locales/zh.ts tests/unit/core/types/settings.test.ts tests/unit/features/chat/userMessageDisplay.test.ts tests/unit/features/settings/OpenCodianSettings.test.ts`
- 通过：`npm run check:devlog-order`
- 通过：`npm run build`
- 已部署到测试库并确认 `BUILD_ID`：`main.202603301613`

### 📝 结论

- 这轮改动把“用户消息里的原始标记被直接渲染”的问题收敛到了一个专门的显示预处理层里，默认以安全、可读的代码格式呈现，同时又保留了会话级设置开关，便于后续在安全性与原始渲染体验之间切换。

## 2026-03-30 后台任务陈旧运行态判定与失联提示卡补强

### 🎯 改动目标

- 解决 OpenCodian 在本地 OpenCode 服务被终止、停止后重启，或后台任务未再回写时，聊天区仍长期显示“后台任务仍在运行”的误判。
- 让后台任务面板不再只依赖历史 `task` launch / OMO completion reminder，而是结合 OpenCode 当前会话 live 状态判断是否真的还在运行。
- 当面板被判定为陈旧并移除时，补一个明确的 warning 提示卡，向用户解释为什么“运行中”面板消失了。

### ✅ 本轮调整

- `src/core/opencode/OpenCodeService.ts` / `src/core/opencode/index.ts`
  - 新增 `getSessionStatuses()`，接入 SDK `session.status()` 与 legacy `/session/status` fallback
  - 新增 `session.status` 全局 sync event 订阅与归一化，和原有 `todo.updated` 共用同一条 sync 订阅链路
  - 对外导出 `SessionActivityStatus`，供聊天视图按 `idle` / `busy` / `retry` 区分当前会话是否仍然 live

- `src/features/chat/OpenCodianView.ts`
  - 为每个 tab runtime 增加会话状态缓存与请求序号，避免异步刷新串台
  - 在打开会话、切换标签、后台同步轮询时，同时刷新 session todo 和 session status
  - 将后台任务面板显示条件改为“历史 launch 记录 + 当前会话 live 状态 + 未完成 todo + 短暂宽限期”联合判定
  - 当会话已经 `idle`、没有未完成 todo、也没有新的 live 信号时，自动清理陈旧的“后台任务仍在运行”面板
  - 清理时追加 warning notice，解释当前无法再确认这些后台任务仍在运行，并列出被停止跟踪的任务

- `src/i18n/locales/en.ts` / `src/i18n/locales/zh.ts`
  - 新增后台任务陈旧状态提示卡标题、正文与“已停止跟踪”任务状态文案

- `tests/unit/core/opencode/OpenCodeService.test.ts`
  - 新增 `session.status()` 归一化测试
  - 新增 `session.status` sync event 分发测试

- `docs/opencode-service-sdk-v2-mapping.md`
  - 同步记录 `session.status` 与 `todo.updated` 已纳入当前 sync/live 判断链路

### 🧪 验证结果

- 通过：`npm test -- OpenCodeService.test.ts`
- 通过：`npm run build`
- 已部署到测试库并确认 `BUILD_ID`：`main.202603301519`

### 📝 结论

- 这轮修复把后台任务面板从“历史消息推断”升级为“历史 launch + 当前 live 状态”联合判断，能更稳地处理服务停止、重启、掉线、未回写等场景，避免把已经失联的后台任务继续误显示为运行中。

## 2026-03-30 聊天待办面板与工具摘要显示修复

### 🎯 改动目标

- 解决聊天底部待办面板偶发需要“切换标签再切回来”才出现的问题，尽量让 `todowrite` 一到达就驱动 UI 更新。
- 修复重载 Obsidian 后，明明没有后台任务却仍然出现“后台任务准备中”提示的误判。
- 优化工具块摘要显示，让 `read` / `write` / `edit` 直接显示文件名，`todo` 工具直接显示任务进度和任务名预览。

### ✅ 本轮调整

- `src/features/chat/OpenCodianView.ts`
  - 为会话 todo 增加视图层归一化与去重，避免同内容/同状态的重复 todo 在 dock 中重复显示
  - 新增流式 `todowrite` 快照应用逻辑，在工具流过程中就把最新待办写入对应标签页的 todo dock
  - 在 `todowrite` / `todoread` 结束后立即补拉一次服务端 session todo，减少 UI 只在切标签后才同步的概率
  - 调整后台任务恢复判断：若只是历史 `search-mode` 注入、后续已存在消息且没有真实 task launch，则不再显示“后台任务准备中”
  - 顺手收敛输入框 placeholder 获取逻辑，并避免在无消息且无 rewind 恢复场景下额外渲染空对话提示

- `src/utils/streaming/ToolCallRenderer.ts`
  - `read` / `write` / `edit` 支持从 `file_path`、`filePath`、`path`、`notebook_path` 等字段提取文件名摘要
  - `todowrite` / `todoread` 摘要改为显示“完成数/总数 + 任务名预览”，减少必须点开工具块才能知道内容的情况
  - 为工具摘要补上 `title`，鼠标悬停时可查看完整文本

- `src/i18n/locales/en.ts` / `src/i18n/locales/zh.ts` / `styles.css`
  - 调整聊天输入框占位文案，并为 placeholder 补充更稳定的弱化样式

- `tests/unit/utils/streaming/ToolCallRenderer.test.ts`
  - 新增工具摘要单测，覆盖文件名提取与 todo 任务名预览显示

### 🧪 验证结果

- 通过：`node scripts/run-jest.js tests/unit/utils/streaming/ToolCallRenderer.test.ts --runInBand`
- 通过：`npm run build`
- 已部署到测试库并确认 `BUILD_ID`：`main.202603301433`

### 📝 结论

- 这轮改动把 todo dock 的可见性更新从“主要依赖后续刷新/切标签触发”前移到了工具流本身，同时收紧了后台任务恢复条件，减少重载后残留提示和重复 todo 的概率。

## 2026-03-30 设置面板滚动记忆防漂移修复

### 🎯 改动目标

- 解决 OpenCodian 设置页在反复切换 Obsidian 原生设置入口与插件设置入口时，滚动位置有时能记住、有时又会自动向下滑动的问题。
- 尽量避免依赖 reflow 方案，优先从滚动锚点与错误状态写回的根因上修复。

### ✅ 本轮调整

- `src/features/settings/OpenCodianSettings.ts`
  - 为设置面板根节点增加 `overflow-anchor: none`，降低内容异步变化导致的自动滚动锚定漂移
  - 将滚动恢复改为“短暂稳态恢复”流程：恢复命中目标后不会立刻结束，而是等待一个很短的稳定窗口
  - 在恢复窗口内暂停 `settingsPanelScrollTop` 的持久化写回，避免切页或面板内部补渲染时把错误位置保存成新的记忆位置
  - 新增恢复期滚动监听；如果打开后又被外部布局变化带偏，会自动拉回目标位置后再完成恢复
  - 保留现有 `animation-frame` / `timeout` / `mutation` 多通道恢复机制，但减少无意义重复确认，避免把“稳定完成”不断向后推迟

- `tests/unit/features/settings/OpenCodianSettings.test.ts`
  - 更新原有恢复日志测试，适配新的稳态完成时序
  - 新增“恢复后发生滚动漂移时会重新拉回目标位置”的单测，覆盖本次问题的核心场景

### 🧪 验证结果

- 通过：`npm run test -- OpenCodianSettings.test.ts`
- 通过：`npm run build`
- 已部署到测试库并确认 `BUILD_ID`：`main.202603301408`

### 📝 结论

- 这次修复的重点不再是“多做几次 reflow”，而是阻止设置页在打开初期被滚动锚点或异步布局变化带偏，同时避免错误滚动值反写进持久化状态。

## 2026-03-30 Provider Icon Cache Modal 批量添加与滚动位置优化

### 🎯 改动目标

- 解决提供商图标缓存窗口在每次添加一个图标来源后自动滚回顶部的问题，减少连续维护多个 provider 时的操作打断。
- 支持一次粘贴多个图标链接批量导入，兼容空格、逗号、换行分隔，降低手动重复添加成本。

### ✅ 本轮调整

- `src/features/settings/ProviderIconCacheModal.ts`
  - 将单行输入改为多行输入，支持批量粘贴多个图标来源
  - 回车逻辑调整为 `Ctrl/Cmd + Enter` 提交，避免换行输入时误触发
  - 添加后保留弹窗滚动位置；删除、自定义图标置顶、拖拽排序后也保持当前位置
  - 批量导入时支持部分成功，成功后刷新列表并提示首个失败原因

- `src/utils/icons/ProviderIconService.ts`
  - 新增批量来源拆分逻辑
  - 支持按空格、逗号、换行拆分多个 URL
  - 保留包含空格的本地绝对路径，避免误拆
  - 避免把单个包含逗号的 URL 错误拆成多个来源

- `styles.css`
  - 调整图标来源输入区布局，适配多行文本框与批量导入提示

- `src/i18n/locales/en.ts` / `src/i18n/locales/zh.ts`
  - 更新占位文案与帮助提示，明确支持批量粘贴

- `tests/unit/utils/icons/ProviderIconService.test.ts`
  - 新增批量拆分规则测试，覆盖空格、逗号、换行、本地路径空格、URL 含逗号等场景

### 🧪 验证结果

- 通过：`npx jest tests/unit/utils/icons/ProviderIconService.test.ts --runInBand`
- 通过：`npm run typecheck`
- 通过：`npm run build`
- 已部署到测试库并确认 `BUILD_ID`：`main.202603301345`

### 📝 结论

- 这次改动把“连续添加图标来源时的滚动打断”和“多个来源必须逐条粘贴”的两个高频操作痛点一起解决了，图标缓存弹窗现在更适合批量维护。

## 2026-03-30 会话 Todo Dock（正统方案接入）

### 🎯 改动目标

- 按 OpenCode 官方数据流接入会话级 Todo，而不是只把 `todowrite` 当普通工具卡渲染。
- 让 OpenCodian 能通过 SDK 获取 `session.todo()` 快照，并通过 `global.syncEvent.subscribe()` 持续接收 `todo.updated` 增量事件。

### ✅ 本轮调整

- `src/core/opencode/OpenCodeService.ts`
  - 新增 `getSessionTodos(sessionId)`，优先走 SDK `session.todo()`，失败时回退 `/session/:id/todo`
  - 新增 `subscribeToSessionTodoUpdates()`，通过 `global.syncEvent.subscribe()` 消费 `todo.updated`
  - 增加 todo 数据归一化与 sync loop 生命周期管理

- `src/features/chat/OpenCodianView.ts`
  - 为每个 tab 增加独立的 todo 运行时状态，避免多会话串数据
  - 会话切换、加载、流结束、后台同步后都会刷新当前会话 todo
  - 将 todo 面板挂载到输入区上方，作为会话级 UI，而非工具消息的一部分

- `src/features/chat/ui/SessionTodoDock.ts`（新增）
  - 新增会话 todo dock，显示进度、当前进行项、折叠/展开列表

- `src/utils/streaming/ToolCallRenderer.ts`
  - 仍保留 `todowrite` / `todoread` 的工具卡摘要，但不再承担主 todo 展示职责

- `styles.css` / `src/i18n/locales/*.ts`
  - 补齐 dock 样式与中英文文案

### 🧪 验证结果

- 通过：`npm run typecheck`
- 通过：`node scripts/run-jest.js tests/unit/core/opencode/OpenCodeService.test.ts`

### 📝 结论

- 之前“只出现 Todo 卡片、不出现真正待办列表”的根因并不在前端渲染本身，而在于未按 OpenCode 官方方案接 `session.todo()` + `global.syncEvent.subscribe()` 这条会话级数据链路。

## 2026-03-30 AGENTS.md 文档同步（设置分组 / 图标缓存 / 重载约束）

### 🎯 改动目标

- 让 `AGENTS.md` 与当前代码实现保持一致，避免后续开发或代理工作继续参考过期文档。

### ✅ 本轮调整

- 更新 `src/features/settings/` 目录说明，补充 `ProviderIconCacheModal.ts`
- 更新存储结构说明，补充 `.opencodian/provider-icons/` 本地图标缓存目录
- 更新设置分类说明：
  - 将原来的 **Title Generation** 改为一级分组 **Conversation**
  - 将 provider 图标缓存 / 自定义图标库管理归入 **Model**
- 补充热重载恢复约束，说明 `main.ts` 必须先完成 `loadConversations()` 再注册/恢复视图

### 📝 备注

- 本次仅同步开发文档，不涉及运行时逻辑改动

## 2026-03-30 Provider Icon Cache（提供商图标缓存）功能

### 🎯 改动目标

- 为模型选择器添加可扩展的提供商图标系统，支持从 Lobehub CDN、本地文件和自定义 URL 加载图标。
- 提供图标缓存机制，避免重复下载，支持离线使用已缓存图标。
- 允许用户管理每个提供商的图标源（映射图标、自定义 URL、本地文件），并可设置默认图标。
- 保持向后兼容，现有行为不受影响。

### ✅ 本轮调整

#### 1. 核心类型定义

- `src/core/types/settings.ts`
  - 新增 `ProviderIconEntryType` 类型：`'mapped' | 'url' | 'file'`
  - 新增 `ProviderIconEntry` 接口：定义图标条目结构（id, type, source, mimeType, cacheFileName, addedAt, updatedAt）
  - 新增 `ProviderIconLibrary` 类型：`Record<string, ProviderIconEntry[]>`
  - 新增 `normalizeProviderIconLibrary()` 函数：安全地规范化用户配置的图标库数据
  - `OpenCodianSettings` 接口新增 `providerIconLibrary` 字段
  - `DEFAULT_SETTINGS` 添加 `providerIconLibrary: {}`

- `src/core/types/index.ts`
  - 导出新增的类型定义

#### 2. Provider Icon Service 重构与扩展

- `src/utils/icons/ProviderIconService.ts`
  - 新增缓存目录常量 `ICON_CACHE_DIR = '.opencodian/provider-icons'`
  - 新增缓存限制：最大 1MB 文件大小，支持 SVG/PNG/JPEG/WebP/GIF 格式
  - 新增状态管理 Map：resolvedIconUrls, inFlightIconLoads, failedIconIds
  - 新增接口定义：ProviderIconCacheEntry, ProviderIconProviderState, ProviderIconCacheSummary 等
  - 新增 `resolveIconUrl()` 方法：异步解析图标 URL，优先从缓存读取，支持重试失败项
  - 新增 `loadIconAsset()` 方法：从 URL 或本地路径加载图标数据
  - 新增 `saveIconToCache()` / `readIconFromCache()`：缓存管理
  - 新增 `addIconToLibrary()` / `removeIconFromLibrary()`：图标库增删
  - 新增 `setDefaultIconForProvider()`：设置提供商的默认图标
  - 新增 `getProviderCacheState()`：获取完整的缓存状态概览
  - 新增 `refreshIconCache()` / `warmIconCache()`：缓存刷新与预热
  - 新增 `getCacheDirectory()` / `ensureCacheDirectory()`：缓存目录管理
  - 新增 `parseCustomSource()`：解析用户输入的图标源（本地路径、file:// URL、https:// URL）

#### 3. 图标缓存管理弹窗

- `src/features/settings/ProviderIconCacheModal.ts`（新增文件）
  - 实现 `ProviderIconCacheModal` 类，继承 Obsidian 的 Modal
  - 功能：
    - 显示所有提供商的图标缓存状态概览（缓存数/总数/当前提供商数）
    - 快速跳转栏：点击提供商名称滚动到对应区域
    - 每个提供商独立区域：显示当前/仅保存状态徽章
    - 图标条目列表：显示映射图标和自定义图标
    - 支持设置默认图标、删除图标、添加新图标源
    - 支持从 URL 或本地文件路径添加图标

#### 4. 设置界面集成

- `src/features/settings/OpenCodianSettings.ts`
  - 在"模型"设置标签页新增"Provider icon cache"设置项
    - 显示当前缓存状态（加载中/状态概览/加载失败）
    - "Manage cached icons"按钮：打开 ProviderIconCacheModal
    - "Clear / refresh icon cache"按钮：刷新缓存
    - "Cache current provider icons"按钮：预热当前可用提供商图标
  - 新增 `renderProviderIconCacheSetting()` 方法渲染图标缓存设置
  - 新增 `refreshIconCacheWithNotice()` / `warmIconCacheWithNotice()` 方法
  - 调整"快速跳转"描述文案，反映模型设置的新职责

- `src/features/chat/OpenCodianView.ts`
  - 重构 `updateModelSelectorIcon()` 方法：
    - 使用 `ProviderIconService.resolveIconUrl()` 异步解析图标
    - 添加请求 ID 机制防止竞态条件
    - 加载完成后更新模型选择器触发按钮的图标
  - 新增 `modelSelectorIconRequestId` 字段追踪图标请求
  - `onOpen()` 中加载会话前确保已加载对话列表
  - `loadConversation()` 中增加重试逻辑：如果找不到会话则刷新列表再试一次

#### 5. 主程序扩展

- `src/main.ts`
  - 新增 `saveProviderIconLibrary()` 方法：保存图标库配置到 settings
  - 新增 `getProviderIconLibrary()` 方法：获取当前图标库配置
  - 新增 `deleteProviderIconCache()` 方法：删除所有图标缓存文件

#### 6. 国际化

- `src/i18n/locales/en.ts` / `src/i18n/locales/zh.ts`
  - 新增大量图标缓存相关翻译键：
    - `settings.conversation.title` - 设置分类标题（从 titleGeneration 重命名）
    - `settings.quickNav.conversationDesc` - 快速跳转描述更新
    - `settings.model.iconCache.*` - 图标缓存设置文案（20+ 个键）
    - `settings.debug.iconCache.*` - 调试区域图标缓存文案

#### 7. 样式

- `styles.css`
  - 新增 Provider Icon Cache Modal 完整样式（200+ 行）：
    - `.opencodian-icon-cache-modal-summary` - 概览文本
    - `.opencodian-icon-cache-quick-jump` - 快速跳转栏（sticky 定位）
    - `.opencodian-icon-cache-quick-jump-buttons` - 跳转按钮容器
    - `.opencodian-icon-cache-quick-jump-button` - 跳转按钮（支持 `.is-current` 高亮）
    - `.opencodian-icon-cache-provider-section` - 提供商区域
    - `.opencodian-icon-cache-provider-header` - 区域头部
    - `.opencodian-icon-cache-provider-badges` - 状态徽章容器
    - `.opencodian-icon-cache-provider-badge` - 徽章（`.is-current`/`.is-saved`）
    - `.opencodian-icon-cache-entry-list` - 图标条目列表
    - `.opencodian-icon-cache-entry` - 单个图标条目
    - `.opencodian-icon-cache-entry-preview` - 图标预览区域
    - `.opencodian-icon-cache-entry-actions` - 操作按钮区域
    - `.opencodian-icon-cache-entry-action` - 操作按钮
    - `.opencodian-icon-cache-entry-default-badge` - 默认图标徽章
    - `.opencodian-icon-cache-add-section` - 添加新图标区域
    - `.opencodian-icon-cache-add-input` - 图标源输入框
    - `.opencodian-icon-cache-add-button` - 添加按钮
    - `.opencodian-icon-cache-add-error` - 错误提示

#### 8. 测试

- `tests/unit/main.test.ts`
  - 新增测试用例覆盖 `saveProviderIconLibrary`、`getProviderIconLibrary`、`deleteProviderIconCache` 方法
- `tests/unit/utils/icons/`（新增目录）
  - `ProviderIconService.test.ts`：ProviderIconService 的单元测试

#### 9. 其他

- `.gitignore`
  - 新增 `.claude/` 目录忽略

### 🧪 验证

- `npm run test` 通过
- `npm run typecheck` 通过
- `npm run lint` 通过
- `npm run build` 成功
- `npm run check:devlog-order` 通过

### 📁 涉及文件

- 新增：
  - `src/features/settings/ProviderIconCacheModal.ts`
  - `tests/unit/utils/icons/ProviderIconService.test.ts`
- 修改：
  - `src/core/types/settings.ts`
  - `src/core/types/index.ts`
  - `src/utils/icons/ProviderIconService.ts`
  - `src/features/settings/OpenCodianSettings.ts`
  - `src/features/chat/OpenCodianView.ts`
  - `src/main.ts`
  - `src/i18n/locales/en.ts`
  - `src/i18n/locales/zh.ts`
  - `styles.css`
  - `tests/unit/main.test.ts`
  - `.gitignore`

---

## 2026-03-29 Reasoning 时长精确化、消息元数据同步与尾部渲染优化

### 🎯 改动目标

- 让 Thinking Block 的显示时长优先采用服务端计算值（SDK `part.time.start/end`），而非前端本地粗略计时。
- 支持服务端在流结束时推送准确的 message metadata（messageId、timestamp、modelId），替代本地生成的临时值。
- 优化服务端同步后的重渲染策略，仅替换变化的尾部消息而非全量重渲，减少视觉闪烁。
- 补充相关测试与文档同步。

### ✅ 本轮调整

#### 1. Reasoning/Thinking Block 时长计算优化

- `src/core/opencode/OpenCodeService.ts`
  - 新增 `resolveReasoningDurationSeconds()`，优先从 `part.time.start/end` 计算耗时，其次回退到 `part.duration`
  - 新增 `formatModelIdentifier()`，统一格式化 provider/model 标识
  - `openCodeMessageToChatMessage()` 现在返回 `modelId`（从 `providerID/modelID` 构造）
  - SDK 流事件处理：
    - `message.part.updated` 新增处理 `reasoning`/`thinking` 类型 part，推送 `durationSeconds` 到 UI
    - `message.part.delta` 的 thinking chunk 新增 `partId` 字段
  - `requestAssistantResponse()` 结束时推送 `message_metadata` chunk 包含准确的 messageId、timestamp、modelId

- `src/utils/streaming/types.ts`
  - `ThinkingChunk` 新增 `partId` 和 `durationSeconds` 字段
  - `ThinkingContentBlock` 新增 `partId` 字段
  - `ThinkingBlockState` 新增 `partId` 和 `resolvedDurationSeconds` 字段
  - `StreamState` 新增 `thinkingBlocksByPartId` 和 `thinkingBlockElements` Map，用于按 partId 索引和更新已完成的 thinking block

- `src/utils/streaming/StreamController.ts`
  - `handleThinkingChunk()` 重构：
    - 支持按 `partId` 区分不同的 thinking block
    - 如果收到带 `durationSeconds` 的 chunk 但还没有对应 thinking state，尝试更新已完成的 block
    - 空内容但有 `partId` 的 chunk 用于更新时长而不触发新 block 创建
  - `finalizeThinkingBlock()` 将完成的 thinking block 存入 `thinkingBlocksByPartId` 和 `thinkingBlockElements`
  - 新增 `updateStoredThinkingDuration()`，用于服务端推送最终时长时更新已渲染的 thinking block 标签

- `src/utils/streaming/ThinkingBlockRenderer.ts`
  - 新增 `normalizeDurationSeconds()` 和 `formatDurationSeconds()`，优化时长显示格式：
    - 小于 10 秒显示 1 位小数（如 "Thought for 5.2s"）
    - 大于等于 10 秒显示整数（如 "Thought for 15s"）
    - 小于 1 秒显示 "Thought (<1s)"
  - 新增 `updateDuration()` 方法，更新进行中的 thinking block 时长
  - 新增 `updateStoredDuration()` 方法，更新已完成的 thinking block 时长标签
  - `finalize()` 优先使用 `resolvedDurationSeconds` 而非本地计时
  - `createStoredBlock()` 使用新的格式化函数

#### 2. 消息元数据同步

- `src/core/types/chat.ts`
  - `StreamChunk` 新增 `message_metadata` 类型

- `src/features/chat/OpenCodianView.ts`
  - 流处理循环中捕获 `message_metadata` chunk，用于最终确定 assistant 消息的准确元数据
  - 使用服务端的 `messageId`、`timestamp`、`modelId` 替代本地生成的值
  - 最终化的消息包含准确的 `sourceMessageId`，便于后续追踪

#### 3. 尾部消息增量渲染优化

- `src/features/chat/OpenCodianView.ts`
  - 新增 `getMessagesForRender()`，统一处理消息分组合并逻辑
  - 新增 `patchTrailingAssistantRender()`，实现尾部 assistant 消息的增量替换：
    - 比较前后两次消息列表，检查是否只有最后一条 assistant 消息变化
    - 如果是，仅移除并重新渲染该消息元素，而非清空整个容器
    - 保留原有的滚动位置（如果在底部则保持贴底）
    - 新渲染的消息禁用进入动画（`animation: none`）
  - 服务端同步后优先尝试 `patchTrailingAssistantRender()`，失败才回退到全量 `rerenderConversationMessages()`
  - `applySyncedConversationUpdate()` 使用 `getMessagesForRender()` 简化循环逻辑

#### 4. 折叠用户消息 Markdown 渲染

- `src/features/chat/OpenCodianView.ts`
  - 长用户消息的可见文本现在使用 `renderMarkdownInto()` 渲染，支持 Markdown 格式显示

#### 5. 缓存优化

- `src/features/chat/OpenCodianView.ts`
  - 标题生成、会话重命名等场景的 `getConversationById()` 调用添加 `{ preferCache: true }` 选项，避免不必要的网络同步

#### 6. 测试与文档

- `tests/unit/core/opencode/OpenCodeService.test.ts`
  - 新增测试用例覆盖 `resolveReasoningDurationSeconds` 和 `formatModelIdentifier` 逻辑
- `tests/__mocks__/obsidian.ts`
  - 补充 mock 数据支持
- `tests/setup.ts`
  - 测试环境初始化调整
- `AGENTS.md`
  - 补充 `devlog.md` 更新约束说明
- `docs/opencode-service-sdk-v2-mapping.md`
  - 更新流式主链文档，说明 reasoning 时长计算优化

#### 7. 配置与样式

- `package.json`
  - 添加 `check:devlog-order` 脚本
- `styles.css`
  - 优化 thinking block 和消息样式
- `src/main.ts`
  - 调整初始化逻辑

### 🧪 验证

- `npm run test` 通过（新增测试用例）
- `npm run typecheck` 通过
- `npm run lint` 通过
- `npm run build` 成功
- `npm run check:devlog-order` 通过
- 已部署到 Test Vault

### 📁 涉及文件

- `src/core/opencode/OpenCodeService.ts`
- `src/core/types/chat.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/utils/streaming/StreamController.ts`
- `src/utils/streaming/ThinkingBlockRenderer.ts`
- `src/utils/streaming/types.ts`
- `src/main.ts`
- `styles.css`
- `tests/unit/core/opencode/OpenCodeService.test.ts`
- `tests/__mocks__/obsidian.ts`
- `tests/setup.ts`
- `AGENTS.md`
- `docs/opencode-service-sdk-v2-mapping.md`
- `package.json`
- `devlog.md`

---

## 2026-03-29 历史记录下拉布局抖动修复与滚动优化

### 🎯 改动目标

- 解决点击历史记录按钮后下拉菜单位置计算导致的布局抖动（layout thrash）问题。
- 避免强制同步布局（forced synchronous layout），提升渲染性能。
- 优化加载会话后的滚动时机，减少视觉跳动。

### ✅ 本轮调整

- `src/features/chat/OpenCodianView.ts`
  - 新增 `scheduleHistoryDropdownPosition()`，使用 `requestAnimationFrame` 将菜单位置计算推迟到下一帧
  - 下拉菜单初始状态设为 `visibility: hidden`，位置计算完成后再显示，避免用户看到位置调整过程
  - 提取 `clearScheduledHistoryDropdownPosition()` 用于清理待执行的动画帧
  - 点击历史项加载会话时，使用 `requestAnimationFrame` 延迟加载，避免与菜单关闭动画冲突
  - 将 `loadConversation()` 和 `switchToTabById()` 中的同步滚动改为 `scheduleSettledScrollToBottom()`，确保内容稳定后再滚动

### 🧪 验证

- `npm run lint` 通过
- `npm run typecheck` 通过
- `npm run build` 成功
- 已部署到 Test Vault
- 本轮最终验证使用的 `BUILD_ID`：`main.202603291740`

### 📁 涉及文件

- `src/features/chat/OpenCodianView.ts`
- `devlog.md`

---

## 2026-03-29 回退会话空状态修复与恢复功能

### 🎯 改动目标

- 解决会话被回退（rewind）到起点后，界面显示空白且无明确提示的问题。
- 让用户能够理解当前会话处于回退状态，并提供恢复之前内容的操作入口。
- 在服务端支持获取回退状态和取消回退（unrevert）操作。

### ✅ 本轮调整

- `src/core/opencode/OpenCodeService.ts`
  - 新增 `Session.revert` 类型定义，包含 `messageID` 和可选的 `partID`
  - 新增 `applySessionRevertState()`，在加载消息时根据会话回退状态过滤消息
  - 新增 `filterMessagesByRevertState()`，按消息 ID 和 part ID 精确过滤应显示的消息范围
  - 新增 `unrevertSession()`，支持调用 SDK 或 HTTP API 取消回退状态
  - 新增 `getSessionRevertState()`，获取当前会话的回退状态
  - `getSessionMessages()` 现在会自动应用回退状态过滤

- `src/core/types/chat.ts`
  - 新增 `restore_rewind` 到 `ChatNoticeActionType`

- `src/features/chat/OpenCodianView.ts`
  - 新增 `currentConversationRevertState` 记录当前会话的回退状态
  - 新增 `createEmptyConversationNoticeMessage()`，根据是否处于回退状态显示不同的空会话提示
  - 新增 `handleRestoreRewindRequest()`，处理用户点击"恢复回退前内容"的操作
  - `renderMessages()` 在消息为空时显示提示消息而非空白
  - `syncConversationMessagesFromServer()` 现在返回 `revertState`，用于 UI 状态同步
  - `getNoticeActionLabel()` 和 `handleNoticeAction()` 支持 `restore_rewind` 操作类型

- `src/i18n/locales/en.ts` / `src/i18n/locales/zh.ts`
  - 新增回退相关文案：
    - `chat.rewind.empty.title` / `chat.rewind.empty.description`
    - `chat.rewind.empty.restore`
    - `chat.rewind.restoreSuccess` / `chat.rewind.restoreFailed`

- `tests/__mocks__/opencode-sdk.ts`
  - SDK mock 新增 `session.unrevert` 方法

- `tests/unit/core/opencode/OpenCodeService.test.ts`
  - 新增测试用例覆盖：
    - HTTP API 加载消息时应用回退状态
    - HTTP API 获取会话回退状态
    - HTTP API 恢复回退会话
    - SDK 加载消息时应用回退状态
    - SDK 获取会话回退状态
    - SDK 恢复回退会话

### 🧪 验证

- `npm run test -- OpenCodeService.test.ts` 通过（新增 6 个测试用例）
- `npm run typecheck` 通过
- `npm run lint` 通过
- `npm run build` 成功
- 已部署到 Test Vault
- 本轮最终验证使用的 `BUILD_ID`：`main.202603291737`

### 📁 涉及文件

- `src/core/opencode/OpenCodeService.ts`
- `src/core/types/chat.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
- `tests/__mocks__/opencode-sdk.ts`
- `tests/unit/core/opencode/OpenCodeService.test.ts`
- `devlog.md`

---

## 2026-03-29 历史会话多选删除与批量清理

### 🎯 改动目标

- 让历史会话支持复选框多选，避免必须一条条删除。
- 保持现有删除确认弹框、倒计时和“删除所有会话”行为不变，只在有选中项时把“删除当前会话”切换为“删除选中会话”。
- 确保批量删除后，多 Tab 关联状态和会话面板不会残留脏数据。

### ✅ 本轮调整

- `src/features/chat/OpenCodianView.ts`
  - 在历史会话下拉列表中为每条会话增加复选框与选中态
  - 底部删除动作改为根据选中状态动态显示“删除当前会话”或“删除选中会话”
  - 新增批量删除选中会话逻辑
  - 抽出通用删除确认弹框 helper，复用现有样式与倒计时体验
  - 删除后同步清理关联 tab，并在需要时激活下一个可用 tab 或创建新会话
- `src/features/chat/tabs/TabManager.ts`
  - 新增 `closeTabs()`，支持按 tab 顺序批量关闭并返回后续激活目标
- `src/features/chat/tabs/types.ts`
  - 新增 `CloseTabsResult` 类型
- `src/i18n/locales/en.ts`
  - 补充历史多选与“删除选中会话”确认文案
- `src/i18n/locales/zh.ts`
  - 补充历史多选与“删除选中会话”确认文案
- `styles.css`
  - 增加历史会话复选框与选中态样式
- `tests/unit/features/chat/tabs/TabManager.test.ts`
  - 新增批量关闭 tab 的定向单测

### 🧪 验证

- 已通过：
  - `npm run test -- TabManager.test.ts`
  - `npm run typecheck`
  - `npx eslint src/features/chat/OpenCodianView.ts src/features/chat/tabs/TabManager.ts tests/unit/features/chat/tabs/TabManager.test.ts src/i18n/locales/en.ts src/i18n/locales/zh.ts`
  - `npm run build`
  - `npm run check:devlog-order`
- 已部署到 Test Vault。
- 本轮最终验证使用的 `BUILD_ID`：`main.202603291852`

### 📁 涉及文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/tabs/TabManager.ts`
- `src/features/chat/tabs/types.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
- `styles.css`
- `tests/unit/features/chat/tabs/TabManager.test.ts`
- `devlog.md`

---

## 2026-03-29 devlog 顺序约束与自动检查落地

### 🎯 改动目标

- 防止后续开发日志再次被追加到文件末尾，破坏“最新在前”的倒序结构。
- 把这件事从“靠记忆”改成“文档明确要求 + 脚本自动拦截”。

### ✅ 本轮调整

- `AGENTS.md`
  - 新增 `devlog.md` 更新约束
  - 明确要求新日志必须插入到首个日期型二级标题之前
  - 明确要求交付前运行 `npm run check:devlog-order`
- `devlog.md`
  - 在文件开头的“日志记录原则”中补充插入位置与校验命令
- `package.json`
  - 新增脚本：`npm run check:devlog-order`
- `scripts/check-devlog-order.mjs`
  - 扫描 `devlog.md` 中所有日期型二级标题
  - 如果顺序不是倒序，直接报错并输出错位行号

### 🧪 验证

- `npm run check:devlog-order`
- `npm run build`
- 已部署到 Test Vault
- 本轮最终验证使用的 `BUILD_ID`：`main.202603291833`

### 📁 涉及文件

- `AGENTS.md`
- `devlog.md`
- `package.json`
- `scripts/check-devlog-order.mjs`

---

## 2026-03-29 Settings 滚动恢复日志优化

### 🔇 问题现象

- 每次打开 Settings 页面时，滚动恢复逻辑会因为 `animation-frame`、`mutation` 和多轮递增 `timeout` 连续输出多条几乎相同的调试日志。
- `Settings scroll restore attempt`、`Captured settings scroll position`、`Resolved settings scroll container` 叠加后，单次打开设置页可产生 10+ 条日志，影响问题排查。

### 🎯 优化目标

- 在首次成功恢复滚动位置后，静默后续重复触发。
- 保留一条足够详细的成功日志，继续支持线上排查。

### ✅ 本轮调整

- 为设置页滚动恢复流程增加“已成功恢复”标记，成功后后续触发直接返回。
- 只有在 `scrollTop` 实际到达目标值后才判定恢复成功，避免内容尚未撑开时过早结束恢复流程。
- 首次恢复成功后立即：
  - 清理剩余的重试 `timeout`
  - 断开 `MutationObserver`
  - 停止后续重复日志输出
- 将原先多条 `Settings scroll restore attempt` 调试日志收敛为单条 `Settings scroll restored`，包含：
  - `reason`
  - `attempts`
  - `elapsedMs`
  - `targetScrollTop`
  - `restoredScrollTop`
- 移除常态下噪声较高的 `Captured settings scroll position` 与滚动容器解析调试日志。

### 🧪 验证

- 新增定向单测，覆盖：
  - 首轮恢复未成功时不应提前记录成功日志
  - 内容高度变化后由 `mutation` 触发二次恢复成功
  - 成功后 observer 和 timeout 均被清理
  - 最终只输出 1 条恢复成功日志
- 已通过：
  - `npm run test -- OpenCodianSettings.test.ts`
  - `npm run lint -- src/features/settings/OpenCodianSettings.ts tests/unit/features/settings/OpenCodianSettings.test.ts`
  - `npm run build`
- 已部署到 Test Vault。
- 本轮最终验证使用的 `BUILD_ID`：`main.202603291806`

### 📁 涉及文件

- `src/features/settings/OpenCodianSettings.ts`
- `tests/unit/features/settings/OpenCodianSettings.test.ts`
- `devlog.md`

---

## 2026-03-29 流式表格样式补齐、滚动稳定性修复与 Fork 快照 helper 抽离

### ✨ 改动目标

- 让 Markdown 表格在流式渲染阶段就显示完整边框与更清晰的层次。
- 修复消息完成、会话重渲染、标签切换时打断阅读位置的问题。
- 消除流结束和会话重绘瞬间的跳动感。
- 顺手整理 fork 快照逻辑，确保 fork 时不把被点击的目标消息一并带进新会话。

### 🏗️ 实现内容

#### 1. 流式 Markdown 与最终态样式统一

- 将 `.streaming-text-block` 纳入与 `.opencodian-message-text` 相同的 Markdown 样式作用域：
  - 标题
  - 列表
  - 引用
  - 链接
  - 行内代码
  - 表格
- 这样表格在流式过程中就能直接使用最终边框样式，不再等消息结束后才“突然补全”。

#### 2. 表格视觉增强

- 为表格新增更明显的边框色。
- 增强表头背景与字重。
- 增加隔行底色，提升行阅读辨识度。
- 补充表格容器背景与圆角，让表格块在消息中更容易被识别。

#### 3. 切换标签时保留原滚动位置

- `loadConversation()` 新增 `preserveScrollPosition` 选项。
- tab 切换回已有会话时，不再默认跳到底部，而是恢复离开该 tab 时的阅读位置。
- 仅当用户原本就在底部附近时，才继续贴底显示最新消息。

#### 4. 减少流结束后的无意义重绘与布局抖动

- 新增 `getConversationVisualFingerprint()`：
  - 若流结束后服务端同步回来的内容在视觉上没有变化，则跳过整段消息重渲染。
- 对必须重渲的场景：
  - 在 pane 上增加 `is-rehydrating` 标记
  - 临时关闭消息进入动画
  - 渲染后恢复原滚动位置或底部贴齐
- 从而减少“结束瞬间跳到顶部 / 抖一下 / 闪一下”的问题。

#### 5. Fork 快照 helper 抽离与行为修正

- 新增 `src/features/chat/forkMessages.ts`，抽离 fork 前的消息切片逻辑。
- `cloneMessagesBeforeForkTarget()` 会：
  - 默认排除被点击的目标消息本身
  - 在本地 `id` 不一致时回退用 `sourceMessageId` 定位
- 新增定向单测覆盖上述两种行为，便于后续继续维护 fork/rewind 相关逻辑。

### 🧪 验证

- `npx eslint src/features/chat/OpenCodianView.ts src/features/chat/forkMessages.ts tests/unit/features/chat/forkMessages.test.ts --max-warnings=0`
- `node scripts/run-jest.js tests/unit/features/chat/forkMessages.test.ts`
- `npm run build`
- 已部署到 Test Vault
- 本轮最终验证使用的 `BUILD_ID`：`main.202603291755`

### 📁 涉及文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/forkMessages.ts`
- `styles.css`
- `tests/unit/features/chat/forkMessages.test.ts`

---

## 2026-03-29 多 Tab 真并发发送落地、流状态去全局化与接力文档补强

### ✨ 改动目标

- 解决“一个 tab 在跑时，另一个 tab 仍不能真正发送”的问题。
- 让 tab 不只是“可切换”，而是“会话状态、流状态、后台任务状态都真正独立”。
- 将这轮并发能力落地同步回 `devlog.md`、`AGENTS.md` 与 SDK v2 mapping，方便后续会话继续接力。

### 🏗️ 实现内容

#### 1. OpenCodeService 流状态改为按 session 独立

- `OpenCodeService` 不再使用单一全局：
  - `currentAbortController`
  - `currentAbortSessionId`
  - `partTypeMap`
- 新增按 `sessionId` 维护的 `activeStreams`：
  - 每个会话各自拥有 `AbortController`
  - 每个会话各自拥有 `partTypeMap`
- `cancelStream()` 升级为按 session 定位取消；UI 现在会取消当前 tab 对应 session，而不会误伤别的 tab 流。

#### 2. OpenCodianView 改为每个 tab 一份 runtime

- 新增 `TabRuntimeState`，把以下状态从“全局单份”拆到“每个 tab 一份”：
  - `isStreaming`
  - `streamController`
  - `streamingMessageEl`
  - `streamingContentEl`
  - `currentTurnBodyEl`
  - `lastConversationSyncFingerprint`
  - `isConversationSyncInFlight`
  - 后台任务 indicator / 启动时间 / task 列表 / waiting 状态
- 每个 tab 现在都有自己的消息 pane 与自己的 `StreamController`，因此：
  - Tab A 可继续流式输出
  - Tab B 可同时发起新请求
  - 两边不会再争抢同一套 UI streaming 引用

#### 3. 后台任务与隐藏 tab 同步也改为按 tab 处理

- 后台任务卡片、完成任务列表、waiting 状态全部绑定到对应 tab runtime。
- 新增后台同步扫描逻辑：
  - 当前可见 tab 继续做普通同步
  - 非当前 tab 但仍有后台任务的会话，也会单独同步
- 因此后台任务不再依赖“唯一 stream owner tab”的旧假设。

#### 4. 交互细节修正

- 权限卡片现在会插入到发起请求的那个 tab 的流消息中。
- `processingBlocked` 文案改为“当前标签仍在处理”，不再误导成“另一个标签阻塞了你”。
- 关闭 tab 时，如果该 tab 仍在 streaming 或仍有后台任务，仍会阻止关闭，避免丢失跟踪状态。

#### 5. 文档同步

- `AGENTS.md`
  - 补充多 tab 真并发与 per-tab runtime 说明
  - 补充 `OpenCodeService` 的 per-session active stream 现状
- `docs/opencode-service-sdk-v2-mapping.md`
  - 同步“流式主链 / 取消模块”当前已落地的并发能力
  - 标明多 tab 并发依赖于 service per-session stream context + view per-tab runtime

### 🧪 验证

- `npm run typecheck` 通过
- 定向测试通过：
  - `tests/unit/core/opencode/OpenCodeService.test.ts`
  - `tests/unit/features/chat/tabs/TabManager.test.ts`
  - `tests/unit/features/chat/tabs/TabBar.test.ts`
- 全量测试通过：`npm run test`（145/145）
- `npm run build` 成功
- 已部署到 Test Vault
- 本轮最终验证使用的 `BUILD_ID`：`main.202603291519`

### 📁 涉及文件

- `src/core/opencode/OpenCodeService.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/tabs/Tab.ts`
- `src/features/chat/tabs/TabManager.ts`
- `src/features/chat/tabs/TabBar.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
- `tests/unit/core/opencode/OpenCodeService.test.ts`
- `tests/unit/features/chat/tabs/TabManager.test.ts`
- `tests/unit/features/chat/tabs/TabBar.test.ts`
- `devlog.md`
- `AGENTS.md`
- `docs/opencode-service-sdk-v2-mapping.md`

### 📌 当前结论

- OpenCodian 现在已支持“多 tab 多任务并发发送”，前提是它们属于不同 session/tab。
- SDK v2 主链的流式接入不再被单全局流状态卡死，这为后续 `question.*`、`syncEvent` 与更完整事件消费打下了更稳的底座。
- 后续如果继续迭代，应优先补自动化测试覆盖“多 tab 同时 streaming + 后台任务回写”的组合场景。

---

## 2026-03-29 OpenCodeService → SDK v2 渐进迁移主链落地与接力文档同步

### ✨ 改动目标

- 将 `OpenCodeService` 的核心 API / prompt / streaming 主链逐步切到 OpenCode JS SDK v2。
- 保持 `ServerManager`、`OpenCodeService` facade、`ChatMessage` / `StreamChunk` / OMO 兼容层不变。
- 补齐新会话接力所需的迁移状态文档、手工验收清单与 AGENTS 说明。

### 🏗️ 实现内容

#### 1. SDK v2 依赖、类型桥接与开关护栏

- 精确锁定 `@opencode-ai/sdk@1.3.3`
- 新增：
  - `src/core/opencode/sdkFeatureFlags.ts`
  - `src/core/opencode/sdkTypes.ts`
- 引入内部 feature flags：
  - `sdkCrud`
  - `sdkPrompt`
  - `sdkStream`
  - `sdkAbort`
  - `sdkQuestions`
  - `sdkSync`
- 默认全关；插件组合根在 `src/main.ts` 里显式启用 rollout defaults，单元测试仍可保守使用 legacy 默认值

#### 2. SDK client factory 与 hybrid transport

- 新增：
  - `src/core/opencode/createSdkClient.ts`
  - `src/core/opencode/sdkFetch.ts`
- 统一注入：
  - `baseUrl`
  - 认证头
  - `directory`
- JSON 请求继续复用 Obsidian `requestUrl()` 并包装成标准 `Response`
- SSE 请求继续使用原生 `fetch()`
- SDK client 固定：
  - `responseStyle: "data"`
  - `throwOnError: true`

#### 3. OpenCodeService 主链迁移

- 已切 SDK 的能力：
  - `checkHealth()`
  - `createSession()`
  - `listSessions()`
  - `getSessionMessages()`
  - `deleteSession()`
  - `updateSessionTitle()`
  - `forkSession()`
  - `revertSession()`
  - `getAvailableModels()`
  - `getPendingPermissions()`
  - `respondToPermission()`
  - `requestAssistantResponse()`
  - `sendMessage()`
  - `cancelStream()` 的服务端 abort 补全
- 读链路保留 fallback：
  - SDK 失败时回退 legacy HTTP / legacy SSE
- 写链路不做自动重试，只保留模块级回滚能力

#### 4. 当前已完成与未完成边界

- 已完成：
  - CRUD 迁移
  - 非流式 prompt 迁移
  - 流式主链迁移
  - 双通道取消（本地 abort + 服务端 abort）
  - 路径说明与 handoff 文档同步
- 仍待补齐：
  - `format` / `agent` / `noReply`
  - `thinkingBudget` 真正映射
  - `externalContextPaths` / 真实 file parts
  - 图片 file part
  - `question.*`
  - `global.syncEvent.subscribe()`
  - `session.summarize()` / `session.diff()`
  - 旧链路收敛

#### 5. 文档同步

- `docs/opencode-service-sdk-v2-mapping.md`
  - 补齐精确 SDK 参考路径
  - 同步当前模块进度
  - 标明已实现 / 未实现 / 接力注意事项
- 新增 `docs/opencode-sdk-v2-manual-checklist.md`
  - 供 Test Vault 手工回归 SDK v2 主链
- `AGENTS.md`
  - 补充 SDK v2 混合架构、关键文件、当前模块状态与接力规则

### 🧪 验证

- `npm run typecheck` 通过
- `npm run lint` 通过
- `npm run test` 通过（140/140）
- `npm run build` 成功
- 已部署到 Test Vault
- 本轮最终验证使用的 `BUILD_ID`：`main.202603291252`

### 📁 涉及文件

- `package.json`
- `package-lock.json`
- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/createSdkClient.ts`
- `src/core/opencode/sdkFeatureFlags.ts`
- `src/core/opencode/sdkFetch.ts`
- `src/core/opencode/sdkTypes.ts`
- `src/core/opencode/index.ts`
- `src/core/opencode/types.ts`
- `src/main.ts`
- `tests/unit/core/opencode/OpenCodeService.test.ts`
- `tests/unit/core/opencode/createSdkClient.test.ts`
- `tests/unit/core/opencode/sdkFetch.test.ts`
- `docs/opencode-service-sdk-v2-mapping.md`
- `docs/opencode-sdk-v2-manual-checklist.md`
- `AGENTS.md`

### 📌 当前结论

- `OpenCodeService` 已进入“SDK v2 主链 + legacy 回滚链路并存”的稳定过渡态。
- 新会话继续开发时，应优先补齐 prompt/file/question/sync 的剩余缺口，而不是提前删除 legacy fallback。
- 当前最重要的文档入口是：
  - `docs/opencode-service-sdk-v2-mapping.md`
  - `docs/opencode-sdk-v2-manual-checklist.md`
  - `AGENTS.md`

---

## 2026-03-29 OMO 兼容主链落地、后台任务可见性补强与文档同步

### ✨ 改动目标

- 为 `oh-my-opencode` 兼容补齐聊天侧主链，而不是只停留在“项目配置入口”阶段。
- 让 OMO 注入提示词、系统提醒、后台任务进度在当前会话里可见、可理解、可区分。
- 解决后台任务完成后消息整段跳出、提示卡片 markdown 未渲染、notice 样式留白不协调等体验问题。
- 将当前已完成与未完成内容同步回需求文档和项目说明，方便新会话继续推进。

### 🏗️ 实现内容

#### 1. OMO 消息识别层

- 新增 `src/core/opencode/omoCompat.ts`
- 统一识别：
  - `[search-mode] ... --- 原始输入`
  - `<system-reminder>...</system-reminder>`
  - `<!-- OMO_INTERNAL_INITIATOR -->`
- `OpenCodeService.openCodeMessageToChatMessage()` 现在会产出 OMO 元数据，而不是把这类文本全当普通消息处理。

#### 2. 当前 user bubble 及时回写

- 发送后在 `message_start` 阶段立即拉取当前 session 的最新 user message
- 用服务端最终文本回写本地乐观消息
- 因此注入后的 `search-mode` 信息不再需要重新打开会话才能看到

#### 3. OMO 专用 UI 与中文化

- 用户消息支持：
  - 原始用户输入正文
  - 模式标签（如 `搜索模式`）
  - 注入摘要
  - 原始英文 prompt 折叠查看
- 系统提醒支持：
  - notice card 中文标题 / 摘要
  - 原始 reminder 折叠查看
- 相关 UI 已统一接入 markdown 渲染，而不是纯文本硬塞

#### 4. 后台任务运行中状态可见

- 聊天界面会根据 `search-mode` 与 `task` 工具调用显示“后台任务运行中”卡片
- 主回复结束后，如果子任务仍在执行，卡片会继续保留
- 用户不再只能盯着一个已结束的主回复发懵

#### 5. 后台任务完成后的追加消息体验优化

- 当前可见会话增加空闲期自动同步机制
- 后台任务完成回写父会话后，界面会自动吸收新增消息
- 新增的 assistant 纯文本消息会做轻量“伪流式”渐进显示，避免整段瞬间砸出

#### 6. 工具展示与样式细节收尾

- `task` 工具改成更易理解的命名与摘要
- 修复：
  - notice markdown 段落 / 列表大空白
  - 原始提醒折叠按钮过小过挤
  - 系统提醒摘要里 `ID / Description` 被挤成一行的问题

#### 7. 文档同步

- `docs/omo-compatibility-requirement.md`
  - 新增“截至 2026-03-29 的当前实现进度”
  - 明确区分已完成、未完成与建议优先级
- `AGENTS.md`
  - 补充 OMO 兼容层、renderGroups、聊天侧 OMO / 后台任务能力说明
  - 更新开发注意事项与最后更新时间

### 🧪 验证

- `npm run typecheck` 通过
- `npm test` 通过（131/131）
- 多轮 `npm run build` 成功
- 已部署到 Test Vault
- 本轮最终验证与部署过程中使用过的 `BUILD_ID`：
  - `main.202603290020`
  - `main.202603290025`
  - `main.202603290027`

### 📁 涉及文件

- `src/core/opencode/omoCompat.ts`
- `src/core/opencode/OpenCodeService.ts`
- `src/core/types/chat.ts`
- `src/core/types/index.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/ContextUsageService.ts`
- `src/features/settings/OpenCodianSettings.ts`
- `src/utils/streaming/ToolCallRenderer.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
- `styles.css`
- `tests/unit/core/opencode/OpenCodeService.test.ts`
- `docs/omo-compatibility-requirement.md`
- `AGENTS.md`

### 📌 当前结论

- 聊天侧 OMO 兼容主线已经基本闭环：
  - 注入 prompt 可见
  - 后台提醒自动出现
  - 中文化 UI 已成型
  - 后台任务“正在运行”对用户可见
- 仍未完全做完的部分主要在“项目级 OMO 配置产品化”：
  - OMO 配置目前还是创建 / 打开入口
  - 远程模式提示还可以更直接
  - 后续若追求更强实时性，可继续评估从轮询升级到常驻事件订阅

---

## 2026-03-28 OpenCode 插件管理接入与设置页收尾

### ✨ 改动目标

- 为 OpenCodian 补齐 OpenCode 插件治理的一期能力，而不是继续把插件来源当成黑盒。
- 让当前 vault 能看见“全局插件 + 项目插件”分别从哪里来。
- 支持项目级 `plugin` 配置、项目 `.opencode/plugins/` 目录与 OMO 配置入口。
- 为本地托管 OpenCode 提供“纯净模式”，用于一次性禁用所有外部插件排障。
- 顺手修整插件设置区的界面结构、快捷跳转顺序，以及设置页中反引号文案的实际渲染效果。

### 🏗️ 实现内容

#### 1. 新增插件管理服务层
- 新增 `PluginManagementService`，负责统一读取：
  - 全局 `~/.config/opencode/opencode.json` 中的 `plugin`
  - 全局 `~/.config/opencode/plugin(s)/`
  - 项目 `.opencode/opencode.json` 中的 `plugin`
  - 项目 `.opencode/plugin(s)/`
- 能区分：
  - `npm` 插件
  - 本地路径插件
  - 配置声明来源
  - 目录扫描来源
- 补充项目级 `oh-my-opencode.jsonc` 创建入口，作为后续 OMO 兼容基础设施。

#### 2. 项目级插件配置写回能力
- `OpencodeConfigManager` 新增项目 `plugin` 数组的读取与写入能力。
- 保持现有 permission / model 配置逻辑不受影响，插件配置作为同一份 `.opencode/opencode.json` 的新管理维度。
- 新增 `.opencode/plugins/` 目录辅助方法，便于设置页创建项目本地插件目录。

#### 3. 插件隔离模式（纯净模式）
- `OpenCodianSettings` / `ServerManager` / `OpenCodeService` 串起新的 `pluginIsolationMode` 设置。
- 本地托管模式下可切换：
  - `default`
  - `pure`
- `pure` 模式通过 `OPENCODE_PURE=true` 启动本地 OpenCode，禁用所有外部插件：
  - 全局插件失效
  - 项目插件也失效
- 远程模式下仅做状态提示，不承诺强制控制远端插件环境。

#### 4. 设置页新增插件分区
- 设置页新增 `Plugins / 插件` 分区，并接入快捷跳转。
- 首版包含：
  - 插件环境概览
  - 全局来源只读展示
  - 项目 `plugin` 数组编辑
  - 项目本地插件目录创建与文件列表
  - OMO 项目配置入口
  - 插件隔离模式切换
- 快捷跳转顺序已修正为：会话标题在前，插件分区在后。

#### 5. 设置页视觉与文案渲染收尾
- 插件区改成更接近现有设置页的卡片化结构，避免裸文本堆叠。
- 为设置页新增通用的 inline-code 渲染，把带反引号的描述转成真正的 `code` 元素。
- 单独补了设置页 `code` 样式，使其更接近 Obsidian 原生行内代码，而不是仅仅“显示了反引号内容”。

### 🧪 验证

- 新增单测：
  - `tests/unit/core/config/PluginManagementService.test.ts`
- 更新单测：
  - `tests/unit/core/config/OpencodeConfigManager.test.ts`
  - `tests/unit/core/opencode/ServerManager.test.ts`
  - `tests/unit/core/types/settings.test.ts`
- 全量测试通过：`npm test`（129/129）
- 构建成功并已部署到 Test Vault
- 本轮最新验证使用的 `BUILD_ID`：`main.202603282250`

### 📁 涉及文件

- `src/core/config/PluginManagementService.ts`
- `src/core/config/OpencodeConfigManager.ts`
- `src/core/config/index.ts`
- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/ServerManager.ts`
- `src/core/opencode/types.ts`
- `src/core/types/opencodeConfig.ts`
- `src/core/types/settings.ts`
- `src/core/types/index.ts`
- `src/features/settings/OpenCodianSettings.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
- `src/main.ts`
- `styles.css`
- `tests/unit/core/config/PluginManagementService.test.ts`
- `tests/unit/core/config/OpencodeConfigManager.test.ts`
- `tests/unit/core/opencode/ServerManager.test.ts`
- `tests/unit/core/types/settings.test.ts`

### 📌 当前收益

- 用户终于可以明确判断当前 vault 是否受全局插件影响。
- 项目级插件能力开始成型，为 OMO 兼容准备好了配置治理入口。
- 排查“是不是插件导致当前项目异常”时，有了明确的纯净模式。
- 设置页插件区不再是原型状态，文案里的路径 / 配置项也能按真正的行内代码样式显示。

---

## 2026-03-28 会话标题语言感知改造

### ✨ 改动目标

- AI 自动生成会话标题时，不再固定输出英文。
- 改为根据插件当前界面语言决定标题输出语言：
  - `zh`：输出中文标题
  - `en`：输出英文标题

### 🏗️ 实现方式

- 将 `src/core/prompts/titleGeneration.ts` 从静态提示词常量改为可按语言构建的提示词工具：
  - `normalizeTitleGenerationLocale()`
  - `buildTitleGenerationSystemPrompt()`
  - `buildTitleGenerationPrompt()`
- 在 `TitleGenerationService` 内读取 `plugin.settings.locale`，并在请求标题生成时同时注入：
  - 与语言匹配的 system prompt
  - 与语言匹配的 user prompt
- 保持现有标题清洗逻辑不变，只调整模型输出语言约束。

### 🌐 行为结果

- 用户界面语言为中文时，新会话 AI 标题会明确要求模型输出简体中文。
- 用户界面语言为英文时，新会话 AI 标题会明确要求模型输出英文。
- 不支持的语言值会安全回退到英文。

### 🧪 验证

- 新增定向单测：`tests/unit/features/chat/TitleGenerationPrompt.test.ts`
- 测试通过：`npm test -- tests/unit/features/chat/TitleGenerationPrompt.test.ts`
- 构建成功：`npm run build`
- 已部署到 Test Vault
- 本轮验证使用的 `BUILD_ID`：`main.202603281319`

### 📁 涉及文件

- `src/core/prompts/titleGeneration.ts`
- `src/features/chat/services/TitleGenerationService.ts`
- `tests/unit/features/chat/TitleGenerationPrompt.test.ts`

---

## 2026-03-28 同一轮 Assistant 消息自动合并渲染

### 📋 本次开发目标

解决 OpenCode / OpenCodian 在一次回答中先输出“思考 / 工具调用说明”，再输出最终正文时，界面上被拆成两条连续 assistant 气泡的问题，让同一轮回复在视觉上保持为一条完整消息。

### ✅ 实现内容

#### 1. 连续 assistant 消息按渲染分组自动合并
- 新增 `renderGroups` 渲染辅助模块
- 对连续的默认 assistant 消息进行分组
- 渲染时将同组消息合成为一个 assistant 气泡，而不是逐条单独渲染

#### 2. 保留原始存储结构，仅调整显示层
- 没有改动会话落盘格式，也没有篡改服务端同步回来的原始消息边界
- 合并仅发生在 UI 渲染阶段，降低对回退、分叉、同步逻辑的影响范围
- `notice` 类型消息不会参与合并，避免把提示卡片和正文粘在一起

#### 3. 合并后保留内容块顺序
- 合并时会按原顺序拼接 `thinking`、`tool_use`、`text` 等 `contentBlocks`
- 这样同一轮回答里的“思考 -> 工具 -> 正文”仍能完整展示，只是落在同一个气泡内
- 合并消息优先继承最后一条 assistant 的时间戳与模型信息，保证底部信息更符合用户直觉

### 🧪 测试

- 新增 `renderGroups` 单测，覆盖：
  - 连续 assistant 消息会被归为同一渲染组
  - `notice` 消息不会跨越合并边界
  - 合并后的 `contentBlocks` 顺序、文本内容与元数据符合预期
- 已通过：
  - `npm run test`
  - `npm run lint`
  - `npm run typecheck`

### 📁 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/features/chat/OpenCodianView.ts` | 首次加载与重渲染时改为按消息组渲染 |
| `src/features/chat/renderGroups.ts` | 新增 assistant 消息分组与合并辅助逻辑 |
| `tests/unit/features/chat/renderGroups.test.ts` | 新增分组与合并渲染回归测试 |

### 📌 当前收益

- 同一轮回答不再因为工具调用阶段被拆成多个 assistant 气泡
- 对用户来说，一次回答的阅读流更连贯，视觉负担更小
- 方案只作用于渲染层，风险相对可控，便于后续继续细化“同轮消息”的定义

---

## 2026-03-28 标签栏数字徽标底色调整

### 📋 本次开发目标

将标签栏数字徽标的底色从纯背景色改为主题色，使其更有层次感但不至于过于耀眼。

### ✅ 实现内容

#### 数字徽标底色改为 `--background-modifier-hover`
- `.opencodian-tab-bar-badge`：底色从 `--background-primary` 改为 `--background-modifier-hover`，文字色保持 `--text-normal`
- `.opencodian-tab-overflow-menu-badge`：底色从 `--background-secondary` 改为 `--background-modifier-hover`，文字色保持 `--text-normal`
- 效果：低调但有区分度，不会像强调色（`--interactive-accent`）那样抢眼

### 🔄 变更过程

1. 最初尝试使用 `--interactive-accent` 作为底色，文字用 `--text-on-accent`
2. 用户反馈强调色过于耀眼，与整体界面不协调
3. 改用 `--background-modifier-hover`，既有层次感又不喧宾夺主

---

## 2026-03-28 助手消息流结束抖动修复

### 🐛 问题现象

- 助手消息在流式输出完成后，会出现一次明显的“向下跳”或“闪一下”的视觉抖动。
- 开启自动滚动时，滚动位置也会在结束瞬间被再次推到底部，放大这种不稳定感。

### 🔍 原因定位

- 时间戳行原本在流结束后才插入，导致消息高度在最后一刻突然增加。
- `done` 阶段仍会触发一次额外的 `scrollToBottom()`，与时间戳插入叠加，形成末尾跳动。
- 流式助手消息结构中还存在一层多余的预创建文本容器，不必要地增加了收尾阶段 DOM 调整的复杂度。

### ✅ 本轮修复

- 助手流式消息创建时就预留 `.opencodian-message-time-row` 占位，结束时只填充时间、模型和复制按钮，不再新增一整行 DOM。
- 为时间戳行增加稳定高度与隐藏占位态，避免结束瞬间撑高消息。
- `StreamController` 在处理 `done` chunk 时不再立即触发额外滚动。
- `OpenCodianView` 改为在流结束后的双 `requestAnimationFrame` 中补一次稳定滚动，等待布局完成后再校正位置。
- 清理流式助手消息里多余的空文本节点，保持实时 Markdown 渲染路径不变。

### 🎯 结果

- 保留实时 Markdown 渲染效果，不牺牲流式过程中的格式反馈。
- 显著减轻消息结束瞬间的“蹦一下”感，尤其是在自动滚动开启时更稳定。

### 🧪 验证

- 定向 ESLint 校验通过：
  - `src/features/chat/OpenCodianView.ts`
  - `src/utils/streaming/StreamController.ts`
- 构建成功并部署到 Test Vault。
- 本轮验证使用的 `BUILD_ID`：`main.202603280851`

### 📁 涉及文件

- `src/features/chat/OpenCodianView.ts`
- `src/utils/streaming/StreamController.ts`
- `styles.css`

---

## 2026-03-28 会话标题机制改造与历史重命名修复

### ✨ 新增能力

- 新会话不再默认使用时间戳标题，改为在首条用户消息发送后，立即生成“消息截取回退标题”。
- 新增标题生成模式设置：
  - `default`：仅使用首条消息回退标题
  - `ai`：先使用回退标题，再异步生成 AI 精炼标题
- 新增 AI 标题模型设置 `aiTitleModel`，留空时自动跟随当前会话模型。
- 历史会话列表新增重命名按钮，支持用户手动修改标题。

### 🏗️ 数据与服务层改造

- `OpenCodianSettings` 新增：
  - `titleMode`
  - `aiTitleModel`
- `Conversation` / `ConversationMeta` 新增：
  - `titleGenerationStatus?: 'pending' | 'success' | 'failed'`
- `StorageService` 持久化并读取标题生成状态，保证重启后历史状态不丢失。
- `OpenCodeService` 新增：
  - `updateSessionTitle()`：封装 `PATCH /session/:id`
  - `requestAssistantResponse()`：用于同步获取标题生成结果

### 🤖 AI 标题生成流程

- 新增 `src/core/prompts/titleGeneration.ts`，定义标题生成系统提示词。
- 新增 `src/features/chat/services/TitleGenerationService.ts`：
  - 使用临时 session 异步请求标题
  - 支持取消
  - 清洗 AI 返回内容（去引号、去尾标点、限制 50 字）
- 在首条用户消息发送后：
  1. 立即写入回退标题
  2. 若设置为 `ai`，则异步生成精炼标题
  3. 生成成功后同步更新本地会话、Tab 标题和服务端 session 标题
- 若用户在 AI 生成期间手动改名，则取消生成并保留用户标题。

### 🖊️ 历史会话重命名修复

- 历史会话项右侧新增铅笔按钮。
- 初版实现使用了 `window.prompt()`，但 Obsidian / Electron 渲染环境不支持原生 `prompt()`。
- 后续改为插件内部自定义重命名弹窗，支持：
  - 输入框自动聚焦
  - Enter 保存
  - Escape 取消
  - 点击遮罩关闭

### 🌐 设置、文案与样式

- 设置面板新增 “Title Settings / 标题设置” 区块。
- 中英文文案补充：
  - 标题模式
  - AI 标题模型
  - 重命名按钮
  - 标题生成状态
  - 重命名弹窗按钮
- 历史会话列表新增状态徽标与重命名按钮样式。
- 新增重命名弹窗样式。

### 🧪 验证

- `npm run lint` 通过
- `npm run typecheck` 通过
- `node scripts/run-jest.js tests/unit/core/opencode/OpenCodeService.test.ts` 通过
- `npm run build` 成功
- 已部署到 Test Vault
- 本轮最终验证使用的 `BUILD_ID`：`main.202603281012`

### 📁 涉及文件

- `src/main.ts`
- `src/core/types/settings.ts`
- `src/core/types/chat.ts`
- `src/core/types/index.ts`
- `src/core/storage/StorageService.ts`
- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/ServerManager.ts`
- `src/core/prompts/titleGeneration.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/TitleGenerationService.ts`
- `src/features/chat/tabs/TabManager.ts`
- `src/features/settings/OpenCodianSettings.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
- `styles.css`
- `tests/unit/core/opencode/OpenCodeService.test.ts`

---

## 2026-03-27 标签栏 Streaming 动画重构与多语言切换支持

### 📋 本次开发目标

1. 重构标签栏 streaming 状态动画，从 loader 图标改为 CSS conic-gradient 轨道光晕效果
2. 支持语言切换时动态更新界面中的 tooltip 文本

### ✅ 实现内容

#### 1. Streaming 状态改为纯 CSS 轨道动画
- 原实现：在 `.opencodian-tab-bar-state` 中放置 `loader-circle` 图标并旋转
- 新实现：
  - 新增 `.opencodian-tab-bar-badge-wrap` 包装器，包裹 badge 和 state
  - streaming 时通过 `::before` 和 `::after` 伪元素渲染 `conic-gradient` 轨道
  - 使用 `opencodian-tab-badge-orbit` 动画实现旋转光晕效果
- 效果更柔和，与玻璃拟态风格更契合

#### 2. 多语言切换时动态更新 Tooltip
- `OpenCodianView` 新增成员变量引用：
  - `newConversationBtnEl`
  - `historyBtnEl`
  - `settingsBtnEl`
- 新增 `applyLocaleTexts()` 方法，在语言切换时更新所有按钮的 tooltip
- 重构 `attachTooltipLabel` 为 `setTooltipLabel`，支持更新已有 tooltip 文本
- `main.ts` 中 `onLocaleChange` 回调增加 `view.applyLocaleTexts()` 调用

#### 3. 无障碍访问优化
- 为 tooltip label span 添加 `data-tooltip-label="true"` 属性，便于查找和更新
- 更新时复用已有 label 元素，避免重复创建

#### 4. 样式微调
- 调整 tab 阴影为内阴影风格，更符合当前玻璃拟态设计
- 增加 tab bar 容器 padding，改善视觉边距
- 优化 active tab 在 input 布局下的最大宽度限制
- 移除 streaming 时的 loader 图标，改用纯 CSS 动画

### 🧪 测试

- 新增 `TabBar` 单测：验证 streaming 状态下 badge wrap 和 state 的渲染结构

### 📁 涉及文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/tabs/TabBar.ts`
- `src/main.ts`
- `styles.css`
- `tests/unit/features/chat/tabs/TabBar.test.ts`

---

## 2026-03-27 设置面板滚动记忆修复与首次打开回流优化

### 📋 本次开发目标
围绕 OpenCodian 设置面板补一轮稳定性修复，解决两个直接可见的问题：

1. 启动后首次打开设置面板时出现 `Forced reflow while executing JavaScript` 性能警告
2. 设置面板关闭后再次打开，滚动位置记忆不稳定，偶发从顶部开始或被后续内容顶偏

### ✅ 实现内容

#### 1. 去掉首次打开时的祖先链同步布局探测
- 原实现会从 `containerEl` 开始逐层向上遍历 DOM
- 遍历过程中读取 `getComputedStyle()`、`scrollHeight`、`clientHeight`
- 这会在设置面板刚渲染完时强制浏览器立即做样式与布局计算，容易触发首开回流告警
- 现改为优先通过 Obsidian 已知结构选择器直接定位滚动容器：`.vertical-tab-content-container`、`.vertical-tab-content`、`.modal-content`
- 若选择器失效，再回退到 class 名轻量识别，避免重新引入首帧布局测量

#### 2. 修复滚动容器误判导致的记忆失效
- 之前按选择器顺序逐个匹配时，可能先拿到更外层容器，而不是最近的真实滚动层
- 结果是滚动监听、关闭时保存、重新打开时恢复都绑定到了错误元素
- 现改为合并选择器后统一 `closest()`，优先拿最近的匹配祖先，保证保存和恢复对着同一个滚动层执行

#### 3. 恢复滚动位置改为多时机补偿
- 仅做一次 `requestAnimationFrame` 恢复，在 Obsidian 自身滚动或异步内容插入后仍可能被覆盖
- 现增加一组有界补偿时机：
  - 首帧恢复一次
  - `24 / 80 / 160 / 320ms` 再补几次
  - 设置内容在打开初期发生 DOM 变化时再补一次
- 同时在重新渲染设置页或关闭设置页时，会统一清理这些恢复任务，避免和后续交互打架

#### 4. 恢复逻辑改成“只写 scrollTop，不测量布局”
- 为了压低打开设置按钮时的 forced reflow 风险，恢复滚动时不再读取 `scrollHeight`、`clientHeight` 来推算最大滚动范围
- 关闭设置时保存位置也不再依赖 `clientHeight > 0` 之类的布局判断
- 改为优先直接写入目标 `scrollTop`，把布局读取压缩到最低

#### 5. 增加设置页滚动调试日志
- 在解析滚动容器时输出容器 class 信息
- 在恢复滚动时输出恢复时机与目标位置
- 在关闭设置页保存位置时输出最终保存值
- 后续如果再出现偶发偏移，可以直接根据 `[OpenCodianSettings]` 日志区分是“容器识别错误”还是“打开后被宿主/异步内容再次滚动”

### 📁 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/features/settings/OpenCodianSettings.ts` | 设置页滚动容器定位、滚动恢复补偿、恢复任务清理、调试日志 |

### 📌 当前收益

- 首次打开设置面板时，不再依赖祖先链同步布局探测
- 设置滚动位置记忆恢复更稳，不容易被打开期的异步内容顶掉
- 点击设置按钮触发的 forced reflow 警告已明显收敛
- 后续若仍有偶发问题，已经具备足够的日志信息继续定位

---

## 2026-03-27 标签栏折叠、`+N` 溢出菜单、标签恢复与交互细节收尾

### 📋 本次开发目标
围绕会话标签栏与顶部交互做一轮可用性打磨，并把这批改动沉淀为首个正式大版本的发布基础：

1. 标签默认折叠，仅在悬浮 / 聚焦 / 激活时展开标题
2. 标签过多时引入 `+N` 溢出菜单，并根据标签栏位置智能决定弹出方向
3. 修复重启 Obsidian 后只恢复当前标签、丢失其它标签的问题
4. 统一顶部按钮、标签按钮、思考预算等区域的 tooltip 与下拉交互
5. 调整新建标签图标与若干视觉细节，完成 1.0.0 前的交互收尾

### ✅ 实现内容

#### 1. 标签默认折叠，悬浮展开
- 标签默认以紧凑胶囊展示，主要保留数字徽章
- 在悬浮、键盘聚焦、当前激活时再平滑展开标题
- 状态图标在无内容时不再占宽度，避免数字标签显得松散

#### 2. 超过 5 个标签时使用 `+N` 溢出菜单
- 标签数超过 5 个后，只保留可见槽位，剩余标签汇总进 `+N`
- 当前激活标签始终优先留在可见区域
- 最终将 `+N` 从 Obsidian 原生菜单改为插件自定义浮层，便于完全控制样式与方向
- 当标签栏位于底部输入区时，`+N` 菜单优先向上弹出；位于顶部时则优先向下弹出

#### 3. 持久化整组标签状态
- 新增隐藏的 `tabState` 设置结构，记录：
  - 标签顺序
  - 当前激活标签索引
  - 每个标签关联的会话 ID
  - 每个标签的模型覆盖设置
- 视图关闭时落盘，重新打开插件或重启 Obsidian 后按保存状态恢复
- 若某些旧标签关联的会话已不存在，会自动跳过无效项，避免恢复失败

#### 4. 统一 tooltip 体系
- 标签、顶部状态按钮、历史按钮、设置按钮等统一改为项目内自定义 tooltip
- 去掉会触发 Obsidian / 浏览器原生提示的重复属性，解决双提示问题
- 顶部四个按钮的 tooltip 改为向下显示，避免在顶部区域被宿主裁切
- `+N` 按钮悬浮时取消 tooltip，避免被裁切后出现不自然的深色横线阴影

#### 5. 思考预算与 Effort 交互修复
- 思考预算选项的 token 提示改为自定义 tooltip
- 预算下拉改为点击展开，不再悬浮即弹出，降低误触和“悬浮后不知道怎么继续”的停滞感
- 菜单支持点外部关闭与 `Esc` 关闭，鼠标离开触发按钮后仍可稳定点击 `4K / 8K / 16K`
- 当预算栏位于输入区顶部时，菜单优先向上展开，避免被底部区域遮挡

#### 6. 新建标签按钮文案与图标
- “新对话”按钮提示改为“新建标签并在新标签中对话”
- 为新建标签按钮接入自定义圆圈加号图标，并统一右上角按钮图标尺寸，修复图标显示过小问题

#### 7. 部署流程约束写入 AGENTS
- 在 `AGENTS.md` 中补充强约束：
  - 必须先构建，再部署
  - 禁止并行执行构建与部署
  - 部署后必须校验测试库中的最终 `BUILD_ID`
- 这样可以避免“测试库不是最新构建”的误部署情况再次发生

### 📁 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/features/chat/tabs/TabBar.ts` | 标签折叠渲染、`+N` 溢出菜单、自定义浮层、弹出方向控制 |
| `src/features/chat/tabs/TabManager.ts` | 新增整组标签恢复逻辑 |
| `src/features/chat/tabs/types.ts` | 新增标签恢复数据结构 |
| `src/features/chat/OpenCodianView.ts` | 顶部按钮 tooltip、标签状态持久化、新建标签按钮图标与提示 |
| `src/features/chat/ui/EffortSelector.ts` | 预算菜单点击展开、关闭逻辑、自定义 tooltip |
| `src/core/types/settings.ts` | 新增 `tabState` 持久化结构与归一化逻辑 |
| `src/core/types/index.ts` | 导出新增的标签状态类型与工具函数 |
| `src/main.ts` | 读取并归一化持久化标签状态 |
| `src/i18n/locales/en.ts` | 新增标签 / 历史 / 设置 / 预算相关英文文案 |
| `src/i18n/locales/zh.ts` | 新增标签 / 历史 / 设置 / 预算相关中文文案 |
| `styles.css` | 标签栏、溢出菜单、tooltip、右上角按钮图标、思考预算菜单样式 |
| `AGENTS.md` | 补充构建与部署的顺序性约束 |

### 📌 当前收益

- 标签栏在多会话场景下更紧凑，也更适合长期使用
- 多标签状态终于能跨重启恢复，不再只剩最后一个标签
- `+N` 的行为与标签栏位置保持一致，用户预期更稳定
- tooltip 不再重复，不再出现顶部看不见、底部挡住、悬浮异常阴影等问题
- 思考预算交互从“悬浮即弹”改为“点击展开”，更加明确、稳健
- 构建与部署流程被正式写入仓库规范，为 1.0.0 发布提供了稳定基础

---

## 2026-03-27 助手消息模型 ID 持久化与外层导航浮层修复

### 📋 本次开发目标
围绕聊天界面补两项直接影响可用性的细节：

1. 在助手消息底部时间戳与复制按钮之间直接显示生成该回复的模型 ID
2. 彻底解决左侧导航按钮被宿主裁切、或为了防裁切而挤压消息正文宽度的问题

### ✅ 实现内容

#### 1. 助手消息新增 `modelId` 持久化字段
- 在 `ChatMessage` 中新增 `modelId?: string`
- 发送消息时根据当前会话模型写入 `provider/model`
- 助手流式完成、错误消息、重新加载后的历史消息都统一走该字段显示模型 ID

#### 2. 助手消息 footer 直接显示模型 ID
- 助手消息底部改为：
  - 时间戳
  - `· provider/model`
  - 复制按钮
- 历史旧消息若没有 `modelId`，则保持兼容，不显示该字段
- 模型 ID 文本支持单行省略，避免长模型名破坏底部布局

#### 3. 服务端消息同步时保留本地 `modelId`
- 现有会话重载 / 同步时会用服务端消息覆盖本地消息
- 为避免本地新增的 `modelId` 被覆盖，新增了同步合并逻辑：
  - 优先按 `sourceMessageId` 回填
  - 对没有 `sourceMessageId` 的本地助手消息做末尾兜底匹配
- 这样刷新会话、重新打开 Obsidian 后，模型 ID 仍可见

#### 4. 导航按钮改为宿主外层独立浮层
- 放弃“向左溢出消息容器”与“内部预留 gutter”的方案
- 导航按钮现在不再挂在消息区内部，而是挂到 `workspace-leaf-content` 级别的独立 host 浮层
- 浮层仅负责承载导航按钮：
  - 不参与消息区布局
  - 不压缩助手消息宽度
  - 不依赖消息区 overflow 是否可见
- 导航按钮位置改为根据消息区 anchor 动态计算纵向中心点，滚动、内容变更、窗口变化时都重新校正

### 📁 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/core/types/chat.ts` | 为 `ChatMessage` 新增 `modelId?: string` |
| `src/features/chat/OpenCodianView.ts` | 发送时记录模型 ID、渲染助手 footer、同步回填 `modelId`、导航栏挂载改到宿主外层 |
| `src/features/chat/ui/NavigationSidebar.ts` | 新增外层 host 挂载、位置同步、宿主级浮层销毁逻辑 |
| `styles.css` | 新增助手消息模型 ID 样式，导航浮层宿主样式改为外层 absolute host |

### 🧪 验证结果

- ✅ 多次 `npm run build`
- ✅ 已多次部署到测试库：`C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`
- ✅ 最终部署版本 BUILD_ID：`fix-revert-model-toggle.202603271716`

### 📌 当前收益

- 助手消息现在能直接看出是哪一个模型生成的
- 模型信息会跟随会话持久化，不会因刷新 / 重载丢失
- 左侧导航按钮不再压缩聊天正文
- 导航按钮从消息区布局中完全抽离，后续只需要微调浮层定位和视觉样式，不必再和消息宽度互相牵连

---

## 2026-03-27 样式设置重置交互去抖与强制回流修复

### 📋 本次开发目标
修复设置页“样式”分组在点击“全部重置”或分组“重置”时的两个问题：

1. 重置后调用 `display()` 重建整页设置面板，导致界面闪动、抖动和轻微滑动
2. 设置页刚重建就同步读取滚动容器布局属性，控制台出现 `Forced reflow while executing JavaScript` 警告

### ✅ 实现内容

#### 1. 样式重置改为原地刷新控件，不再重建整页
- 为样式数值控件建立分组绑定注册表
- “全部重置”与分组“重置”只更新 `chatAppearance` 设置值
- 随后直接把 slider / number input / 高级 CSS 文本框同步到最新值
- 移除重置链路中的 `this.display()`，避免销毁并重建整个设置面板 DOM

#### 2. 高级 CSS 文本框同步校验状态
- 为 `advanced.customCssDeclarations` 单独补充绑定刷新逻辑
- 重置时除文本值外，也同步清理或恢复非法输入提示状态
- 避免出现设置值已经回到默认，但文本框红框或提示仍停留在旧状态

#### 3. 设置页滚动绑定延后到渲染后执行
- 将滚动容器探测、滚动监听绑定、滚动位置恢复收敛到渲染后的 `requestAnimationFrame`
- 不再在 `display()` 刚重建 DOM 后立刻走 `scrollHeight / clientHeight` 判断
- 继续保留设置页滚动记忆能力，同时降低重置后的布局抖动和强制回流概率

### 📁 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/features/settings/OpenCodianSettings.ts` | 样式控件绑定注册、重置原地刷新、advanced 文本框同步、设置页滚动绑定延后 |

### 🧪 验证结果

- ✅ `npm run build`
- ✅ 已部署到测试库：`C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`

### 📌 当前收益

- 点击“全部重置”或分组“重置”时，设置面板不再整页闪烁重建
- 样式控件会原地回到默认值，滚动位置更稳定
- `Forced reflow` 警告触发路径被拆开，设置页交互更顺滑

---

## 2026-03-27 用户消息操作区与导航按钮交互统一

### 📋 本次开发目标
围绕聊天界面的“用户消息操作区”和“左侧导航按钮”做一轮可用性与一致性整理，重点解决：

1. 用户消息复制 / 回退 / 分叉的布局、图标化和 hover 行为不统一
2. 自定义黑色提示与 Obsidian/浏览器原生提示重叠
3. 左侧四个导航按钮默认过于显眼，且在某些消息边距配置下容易遮挡内容
4. 导航提示文案未接入中文

### ✅ 实现内容

#### 1. 用户消息 footer 重构为单行操作区
- 将用户消息原本独立定位的复制按钮收拢进 footer
- 统一为“复制 / 回退 / 分叉 + 时间戳”同一行布局
- 时间戳默认显示，操作按钮仅在 hover / focus 用户消息时显示
- 用户消息气泡内容改为按文本自身宽度收缩，避免短消息被底部按钮区域视觉拉长

#### 2. 回退 / 分叉改为图标按钮
- 将“回退到此处”和“分叉对话”从文字按钮改为图标按钮
- 复用当前玻璃拟态视觉语言，尺寸收敛到与复制按钮一致的 30x30 图标按钮
- 保留对应操作语义，但通过 hover 提示解释含义，减少底部操作区宽度占用

#### 3. Tooltip 统一为自定义黑色提示
- 为用户消息操作区按钮和左侧四个导航按钮统一接入 `data-tooltip` 驱动的黑色 tooltip
- 去掉这些按钮上的原生 tooltip 来源，不再依赖 `title`
- 进一步移除会触发宿主额外提示的 `aria-label` 方案
- 改为 `aria-labelledby + visually-hidden label`，既保留可访问性，又避免双 tooltip 叠加

#### 4. 导航按钮中文化与样式弱化
- 将 `Scroll to top / bottom`、`Previous / Next message` 接入 i18n
- 新增中英文导航提示文案
- 导航侧栏改为：
  - 可滚动时默认半透明显示
  - hover / focus 时恢复完全不透明
- 将侧栏进一步贴近左边框，减少在助手消息靠左布局下的遮挡

### 📁 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/features/chat/OpenCodianView.ts` | 用户消息 footer 重构、复制行为复用、图标按钮与可访问性标签整理 |
| `src/features/chat/ui/NavigationSidebar.ts` | 四个导航按钮 tooltip 接入、自定义提示、中文化文案接入 |
| `src/i18n/locales/zh.ts` | 新增导航按钮中文提示 |
| `src/i18n/locales/en.ts` | 新增导航按钮英文提示 |
| `styles.css` | 用户消息底部操作区布局、图标按钮、黑色 tooltip、导航侧栏透明度与左侧定位调整 |

### 🧪 验证结果

- ✅ 多轮 `npm run build`
- ✅ 已部署到测试库：`C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`

### 📌 当前收益

- 用户消息底部操作区更紧凑，短消息不再被底部按钮区域拉宽
- 回退 / 分叉 / 复制的视觉和交互语义统一
- 自定义黑色 tooltip 不再与宿主原生提示叠加
- 左侧导航按钮默认存在感更低，但悬停时仍然清晰可点击
- 导航提示在中文界面下不再出现英文残留

---

## 2026-03-27 Sticky 滚动模式下 Previous Message 导航定位修复

### 📋 本次开发目标
修复聊天界面在以下两种滚动模式下的历史导航定位问题：

1. `sticky-basic`
2. `sticky-mask`

具体是 `Previous Message` 按钮跳转到上一条用户消息时，只能看到吸顶后的用户消息本身，看不到该回合对应的助手回复；而 `Next Message` 的体感基本正常。

### ✅ 实现内容

#### 1. 导航判断与滚动目标拆分
- 保留“用当前可见位置判断上一条/下一条消息”的逻辑
- 但不再直接使用 `.opencodian-message--user` 的视觉 `top` 作为最终滚动目标
- 避免在 sticky 模式下被 `position: sticky` 改写后的 `getBoundingClientRect()` 误导

#### 2. Sticky 模式改为按 turn 锚点滚动
- 为 `sticky-basic` / `sticky-mask` 新增滚动模式识别
- 当命中 sticky 模式时：
  - 导航选择仍参考用户消息当前视觉位置
  - 实际滚动目标改为对应 `.opencodian-turn` 的文档流起点
- 这样点击 `Previous Message` 时，会回到该回合的真实开头，而不是停在已经吸顶后的 header 位置

#### 3. Natural 模式保持原行为
- 非 sticky 模式仍然沿用用户消息锚点
- 继续保留原有 `10px` 的滚动留白，避免改动自然滚动模式的观感

#### 4. 补充针对性单元测试
- 新增 `NavigationSidebar` 单元测试
- 覆盖两个关键场景：
  - sticky 模式下 `Previous` 应滚动到 turn 锚点
  - natural 模式下仍保留现有 padding 行为

### 📁 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/features/chat/ui/NavigationSidebar.ts` | 导航坐标计算改为“视觉定位 + turn 锚点滚动”双轨逻辑 |
| `tests/unit/features/chat/NavigationSidebar.test.ts` | 新增 sticky / natural 导航定位测试 |

### 🧪 验证结果

- ✅ `npx eslint src/features/chat/ui/NavigationSidebar.ts tests/unit/features/chat/NavigationSidebar.test.ts`
- ✅ `npm run test -- NavigationSidebar.test.ts`
- ✅ `npm run build`
- ✅ 已部署到测试库：`C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`

### 📌 当前收益

- `Previous Message` 在吸顶模式下不再只把用户消息顶到视口顶部
- 上一回合对应的助手消息可以随着导航一起回到可见区域
- `sticky-basic`、`sticky-mask` 与 `natural` 三种滚动模式的导航语义更一致

---

## 2026-03-27 本地 OpenCode 托管认领、端口切换与设置页性能优化

### 📋 本次开发目标
围绕本地 OpenCode 服务的实际使用问题做一轮稳定性与可观测性修复，重点解决：

1. 本地服务在 Obsidian 重载后被误判为“外部服务”
2. 切换模型来源、切换端口时的状态不清晰、失败提示不明确
3. 设置页记忆滚动位置与模型刷新导致的 UI 抖动、强制回流和日志噪音

### ✅ 实现内容

#### 1. 本地服务状态语义重构
- 将本地运行态明确区分为：
  - `运行中（插件托管）`
  - `运行中（外部接管）`
- 聊天视图状态徽标同步细化为：
  - `本地托管`
  - `本地外部`
  - `远程已连接`
- 避免本地 `127.0.0.1` 上已有服务时仍然被笼统显示为普通“运行中”

#### 2. 重载 Obsidian 后认领旧的本地托管进程
- 新增运行态持久化文件 `.opencodian/runtime.json`
- 记录插件托管 OpenCode 的 PID、host、port
- 插件重载后如果检测到同一 PID 仍然存活，且命令行仍匹配当前 `opencode serve --port --hostname`，则自动认领为当前托管实例
- 认领成功后，停止/重启按钮仍可继续管理该服务，而不是退化为“本地外部”

#### 3. Windows 停服逻辑增强
- 本地托管服务停止时，Windows 下改为使用 `taskkill /PID ... /T /F`
- 终止完整 OpenCode 进程树，减少重载 Obsidian 后旧服务残留
- 对已认领但当前实例没有 `ChildProcess` 句柄的 PID，也支持按 PID 停止

#### 4. 端口切换行为收紧
- 修复 `OpenCodeService` 与插件设置对象共享引用导致的“旧端口/新端口比较失效”问题
- 切换本地主机或端口前，先检测目标端口是否可绑定
- 如果目标端口已被占用：
  - 明确抛错并提示
  - 不再静默接管该端口上的健康 OpenCode 实例
- 如果切换失败：
  - 回滚内部设置快照
  - 尝试恢复原本的本地服务
- 设置页的 host/port 输入框改为“提交时生效”，不再每输入一个字符就触发保存与重启

#### 5. 设置页服务状态与模型面板优化
- 设置页服务状态文案按本地托管 / 本地外部 / 远程连接正常重新整理
- 模型来源与服务状态切换时，提示信息更贴近真实状态
- 模型面板刷新做单帧合并，减少短时间重复重建 DOM

#### 6. 设置页记忆滚动位置的性能优化
- 设置页打开时，滚动恢复逻辑由多次 `scrollTop` 重写收敛为“主恢复 + 轻量兜底”
- 缓存设置页滚动容器，避免在打开设置按钮时沿父节点链反复 `getComputedStyle`
- 保留“记忆上次滚动位置”的功能，同时降低 `Forced reflow` 出现概率

#### 7. 模型刷新与图标日志去重
- `onModelsLoaded` 不再直接走整套重型 `saveSettings() + syncOpencodeConfig() + 全视图重刷` 链路
- 服务启动后，只在默认模型实际变化时做轻量持久化
- 聊天视图模型按钮图标在 URL 未变化时不再重复重建 DOM
- `ProviderIconService` 增加日志去重缓存：
  - 同一个 provider 的 icon URL 不变时，不再重复输出 `Icon for xxx: ...`

#### 8. 用户消息底部操作区样式整理
- 调整用户消息底部的复制、回退、分叉按钮布局
- 将复制按钮逻辑抽离为可复用的行为方法
- 统一用户消息 footer 与时间戳样式，减少消息 hover 时的布局跳动

### 📁 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/core/opencode/OpenCodeService.ts` | 设置快照隔离、端口切换预检查、失败回滚 |
| `src/core/opencode/ServerManager.ts` | 托管 PID 认领、Windows 进程树终止、端口占用判断增强 |
| `src/core/opencode/types.ts` | 新增 `ManagedServerState` |
| `src/core/storage/StorageService.ts` | 新增运行态文件读写 |
| `src/features/settings/OpenCodianSettings.ts` | 服务状态文案、host/port 提交流程、模型刷新合并、滚动恢复优化 |
| `src/features/chat/OpenCodianView.ts` | 模型选择器图标去重更新、用户消息 footer 与复制逻辑整理 |
| `src/main.ts` | `onModelsLoaded` 轻量化、视图刷新拆分、设置保存流程调整 |
| `src/utils/icons/ProviderIconService.ts` | icon URL debug 日志去重 |
| `src/i18n/locales/en.ts` | 新增服务状态与端口提示文案 |
| `src/i18n/locales/zh.ts` | 新增服务状态与端口提示文案 |
| `styles.css` | 用户消息底部操作区与复制按钮样式调整 |
| `tests/unit/core/storage/StorageService.test.ts` | 运行态托管 PID 存储测试 |

### 🧪 验证结果

- ✅ `npm run build`
- ✅ `npm run test -- OpenCodeService.test.ts StorageService.test.ts`
- ✅ 已多次部署到测试库：`C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`

### 📌 当前收益

- 本地 OpenCode 服务在重载后更容易继续保持“托管”语义
- 端口切换失败时不再悄悄失效，错误提示更明确
- 设置页打开与模型刷新时的重复重绘和日志噪音明显减少
- 控制台输出更容易区分“插件重复加载”与“同一 UI 重复请求图标”

---

## 2026-03-27 Logger 控制台输出增加时间戳

### 📋 本次开发目标
继续打磨日志可读性，让控制台输出在不打开诊断报告的情况下也能快速判断事件发生顺序。

### ✅ 实现内容

#### 1. 为 logger 控制台输出统一添加本地时间戳
- 在 `src/shared/logger.ts` 中新增 `getTimestamp()`
- `formatArgs()` 统一改为输出：
  - `[HH:mm:ss] [scope] message`
- 适用于：
  - `logger.info()`
  - `logger.debug()`
  - `logger.warn()`
  - `logger.error()`

#### 2. 保持最近诊断日志结构不变
- 本次仅调整控制台展示格式
- `recentLogEntries` 仍保留原有 ISO 时间戳与消息结构
- 避免影响现有诊断报告拼装逻辑

### 📁 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/shared/logger.ts` | 为控制台日志前缀增加 `HH:mm:ss` 时间戳 |

### 🧪 验证结果

- ✅ `npm run lint -- src/shared/logger.ts`
- ✅ `npm run build`
- ✅ 已重新部署到测试库：`C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`

---

## 2026-03-27 BUILD_ID 系统与发布流程完善

### 📋 本次开发目标
本轮主要建立版本可追溯机制和标准化发布流程：

1. **建立 BUILD_ID 生成机制**
   - 每次构建自动生成包含分支信息和时间戳的唯一标识
   - 格式：`{branch}.{YYYYMMDDHHmm}`，例如 `fix-revert-model-toggle.202603271430`

2. **Logger 增强**
   - 添加 `info` 方法用于无条件输出（不受调试开关控制）
   - 用于在插件加载时输出 BUILD_ID

3. **标准化版本发布流程**
   - 添加 npm scripts 支持自动更新版本号
   - 支持 patch / minor / major 三种升级类型

### ✅ BUILD_ID 生成与注入系统

#### 1. 构建工具模块 (`scripts/build-utils.mjs`)
新增专用的构建工具模块，提供：
- `getGitBranch()` - 获取当前 git 分支名称
- `sanitizeBranchName(branch)` - 清洗分支名（将 `/` 替换为 `-`，移除非法字符）
- `getLocalTimeStamp()` - 获取本地时间戳（格式 `YYYYMMDDHHmm`）
- `generateBuildId()` - 组合分支和时间戳生成 BUILD_ID

#### 2. 开发模式 BUILD_ID 注入 (`esbuild.config.mjs`)
- 在开发监听模式下自动生成 BUILD_ID
- 通过 esbuild 的 `define` 选项将 BUILD_ID 注入为全局变量
- 构建时在控制台输出 `[dev] BUILD_ID: xxx`

#### 3. 生产构建 BUILD_ID 注入 (`scripts/build.mjs`)
- 生产模式下同样生成并注入 BUILD_ID
- 构建时在控制台输出 `[build] BUILD_ID: xxx`
- BUILD_ID 会被打包进最终的 `dist/main.js`

### ✅ Logger info 方法添加 (`src/shared/logger.ts`)

#### 方法特性
- `logger.info()` - 无条件输出，不受调试开关控制
- `logger.debug()` - 受调试开关控制（保持不变）
- `logger.warn()` / `logger.error()` - 无条件输出（保持不变）

#### 使用场景
`info` 方法专门用于输出重要但非错误的信息，如：
- 插件加载时输出 BUILD_ID
- 服务器启动/停止通知
- 其他需要总是可见的运行日志

### ✅ 插件加载时输出 BUILD_ID (`src/main.ts`)

在 `onload()` 方法中添加：
```typescript
logger.info(`OpenCodian BUILD_ID: ${BUILD_ID}`);
```

效果：
- 每次插件加载时，在 Obsidian 开发者控制台输出 BUILD_ID
- 方便调试时确认当前运行的是哪个版本
- 不受调试开关影响，总是可见

### ✅ 版本发布脚本 (`scripts/release.mjs`)

#### 支持的命令
```bash
npm run release:patch  # 修复版：0.1.0 → 0.1.1
npm run release:minor  # 次版本：0.1.0 → 0.2.0
npm run release:major  # 主版本：0.1.0 → 1.0.0
```

#### 自动更新的文件
- `package.json` - 更新 `version` 字段
- `package-lock.json` - 同步版本号
- `manifest.json` - 通过 `version` 生命周期钩子同步

#### 实现细节
- 使用 `npm version` 命令进行版本升级
- `--no-git-tag-version` 避免自动创建 git 标签
- 通过现有的 `sync-version.js` 保持 manifest.json 同步

### ✅ 文档更新 (`AGENTS.md`)

#### 新增内容
- **Version Release Rules** 版本发布规则说明
- **BUILD_ID** 格式和用途说明
- **Typical Release Workflow** 典型发布流程示例

### 📁 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `scripts/build-utils.mjs` | 新增 BUILD_ID 生成工具函数 |
| `scripts/build.mjs` | 集成 BUILD_ID 生成与注入 |
| `scripts/release.mjs` | 新增版本发布脚本 |
| `esbuild.config.mjs` | 开发模式下注入 BUILD_ID |
| `src/shared/logger.ts` | 添加 `info` 方法 |
| `src/main.ts` | 插件加载时输出 BUILD_ID |
| `package.json` | 添加 `release:*` scripts |
| `AGENTS.md` | 更新发布流程和 BUILD_ID 文档 |

### 🧪 验证结果

- ✅ `npm run build` 正确输出 BUILD_ID
- ✅ `npm run dev` 正确输出 BUILD_ID
- ✅ 插件加载时控制台显示 BUILD_ID
- ✅ `npm run release:patch` 正确更新版本号

---

## 2026-03-27 设置页模型开关回退与稳定支线切换

### 📋 问题背景

- 在后续加入“模型 / 提供商开关”后，Obsidian 设置页出现严重渲染回归：
  - 切换开关后下半屏变黑 / 变空
  - 有时整个设置页直接发黑
- 多轮排查后确认：
  - 设置内容本身没有丢失
  - `scrollHeight` / `contentHeight` 等高度指标保持正常
  - 问题更接近 Obsidian 设置弹窗内部滚动 / 重绘层回归

### ✅ 今日处理结果

#### 1. 识别问题引入点

- 以 `27631b4` 为稳定参考点确认：
  - 当时模型列表为只读展示，没有开关
  - 设置页滚动与渲染正常
- 继续排查后定位到引入开关的提交：
  - `ca3274a` `feat: add model/provider toggle switches in settings`

#### 2. 保护当前排查现场

- 创建备份分支：
  - `backup/settings-black-screen`
- 将黑屏排查中的未提交改动保存到 stash：
  - `stash@{0}` → `wip: settings black-screen debug`

#### 3. 建立稳定工作支线

- 基于当前工作线新建修复分支：
  - `fix/revert-model-toggle`
- 在该分支上回退模型开关功能提交：
  - 新提交：`73ab805`
  - 作用：撤回 `ca3274a`

#### 4. 当前开发决策

- 后续开发暂时以 **无模型开关** 的稳定支线继续
- 保留：
  - 模型来源模式
  - 默认 provider / model 选择
  - 模型可视化配置面板
  - 模型 JSON 编辑器
- 暂时不恢复：
  - 设置页中的 provider / model enable/disable 开关

### 🧭 当前分支状态

- `feature/fork-conversation`
  - 原主工作线，仍包含模型开关引入后的历史
- `backup/settings-black-screen`
  - 用于保留排查现场与 stash
- `fix/revert-model-toggle`
  - 当前继续开发的稳定支线

### 📌 结论

- 这次不是放弃后续提交，而是**只回退已确认导致设置页回归的那条功能线**
- 其余已完成功能仍保留在当前稳定支线中继续使用

---

**会话日期**: 2026-03-26
**开发时间**: ~3-4 小时
**主要贡献**: 模型来源模式、模型目录可视化、provider/model 配置面板、模型 JSON 编辑器、聊天页模型可用性校验
**当前状态**: 已部署测试库，可继续在真实 vault 中验证本地 / 服务器 / 合并三种模型来源行为

---

## 2026-03-27 标签栏位置与布局重构

### ✅ 新增能力

- 在设置中新增 `标题栏下方 (below-header)` 标签栏位置。
- 为 `below-header` 新增两种布局：
  - `grid`：横向单行紧凑布局，最多显示 5 个标签，超出折叠为 `+N`
  - `vertical`：左侧悬浮竖排布局，最多显示 5 个按钮，超出折叠为 `+N`
- 新增 `belowHeaderTabBarLayout` 设置项，并将默认标签栏位置切换为 `below-header`。

### 🎨 交互与样式调整

- `header` 位置的标签默认不展开标题，仅在悬浮时让非焦点标签恢复实体感。
- `below-header/grid` 改为默认单行紧凑显示，非焦点标签默认虚化且不展开，只在悬浮时横向展开。
- `below-header/vertical` 改为与导航按钮同尺寸的悬浮玻璃按钮，文字在悬浮时横向展开，不挤压正文内容。
- 增强非焦点标签和 `+N` 的虚化程度。
- 修复输入框附近首个标签在悬浮时出现明显长方形阴影棱角的问题，hover/focus/active 时允许阴影溢出显示。

### 🏗️ 结构调整

- `OpenCodianView` 增加第三个标签挂载点 `below-header`，并根据设置在 `header / below-header / input` 之间切换。
- 竖排标签进一步移动到外层 `host`，与导航按钮使用同级的绝对定位覆盖层，而不是继续挂在聊天容器内部。
- `TabBar` 渲染逻辑按布局模式区分可见标签数和 `+N` 溢出规则。

### 🌐 国际化与设置

- 中英文设置文案新增：
  - `标题栏下方 / Below header`
  - `下方标签布局 / Below-header tab layout`
  - `横向多行 / Horizontal multi-row`
  - `左侧竖排悬浮 / Floating vertical rail`

### 🧪 验证

- 补充 `TabBar` 单测，覆盖：
  - `header` 布局最多 4 个可见标签
  - `below-header/grid` 最多 5 个可见标签
  - `below-header/vertical` 最多 5 个可见标签
- 更新测试环境中的 DOM helper，补齐 `createEl / createDiv / createSpan / addClass / toggleClass / empty`。
- 调整 `NavigationSidebar` 测试以匹配当前构造参数。
- 本轮改动已通过多次 `npm run test` 与 `npm run build` 验证，并已同步部署到 Test Vault。

### 📁 涉及文件

- `src/core/types/settings.ts`
- `src/core/types/index.ts`
- `src/main.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/tabs/TabBar.ts`
- `src/features/chat/tabs/types.ts`
- `src/features/chat/tabs/index.ts`
- `src/features/settings/OpenCodianSettings.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
- `styles.css`
- `tests/setup.ts`
- `tests/unit/core/types/settings.test.ts`
- `tests/unit/features/chat/NavigationSidebar.test.ts`
- `tests/unit/features/chat/tabs/TabBar.test.ts`

---

## 2026-03-26 助手消息对齐修复与代码块复制入口收敛

### 📋 本次开发目标
本轮主要处理两个聊天界面细节问题，并补充代理默认交付流程：

1. **统一助手消息内部内容的左对齐基线**
   - 让思考块、正文、工具调用块与底部时间戳共享同一左边界
   - 消除助手消息中由多层 padding 造成的视觉错位

2. **移除代码块右下角冗余复制按钮**
   - 保留现有右上角复制入口
   - 去掉 Obsidian 默认注入、在当前界面里显得突兀的代码块复制按钮

3. **补充默认测试库部署约定**
   - 约定在本仓库中完成代码/样式修改后默认构建并同步到 Test Vault

### ✅ 助手消息左对齐修复

#### 1. 抽出助手消息共享间距变量
- 在 `styles.css` 容器变量区新增：
  - `--opencodian-assistant-pad-y`
  - `--opencodian-assistant-pad-x`
  - `--opencodian-assistant-content-pad-y`
  - `--opencodian-assistant-content-pad-x`
- 避免助手消息外层、内容层、时间行各自写死横向间距

#### 2. 统一正文区与时间戳的左边界
- `opencodian-message--assistant` 继续负责外层横向留白
- `opencodian-message-content` 与 `opencodian-message-time-row` 统一使用相同的内容层横向内边距
- 修复思考块、正文、工具调用块和时间戳左边界不一致的问题

#### 3. 折叠/展开行为保持不变
- 未改动：
  - `.streaming-thinking-block.is-expanded`
  - `.streaming-tool-call.is-expanded`
  - 内容区现有的展开动画与内部缩进逻辑

### ✅ 代码块复制入口收敛

#### 1. 渲染阶段移除 Obsidian 默认复制按钮
- 在 `src/utils/markdown/MarkdownRenderer.ts` 中检测到 `.copy-code-button` 后直接移除
- 不再把默认复制按钮保留在代码块包装层中

#### 2. 样式层增加兜底隐藏
- 在 `styles.css` 中新增：
  - `.markdown-code-wrapper .copy-code-button { display: none !important; }`
- 避免在渲染时序变化或宿主行为调整时按钮重新显现

#### 3. 保留现有顶部复制入口
- 代码块右上角已有复制入口继续保留
- 最终收敛为单一复制交互，减少视觉噪音

### ✅ 代理默认部署流程补充

#### 1. 仓库级默认规则
- 在 `AGENTS.md` 中新增 `Agent Default Deploy Workflow`
- 约定在本仓库中完成代码、样式、manifest 或构建相关修改后，默认执行：
  - `npm run build`
  - 同步 `dist/main.js`、`dist/manifest.json`、`dist/styles.css` 到 Test Vault

#### 2. 本轮执行结果
- 已完成 `npm run build`
- 已同步到测试库：
  - `C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`

### 📁 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `styles.css` | 修复助手消息内容与时间戳左对齐，并隐藏代码块默认复制按钮 |
| `src/utils/markdown/MarkdownRenderer.ts` | 移除 Obsidian 默认注入的代码块复制按钮 |
| `AGENTS.md` | 新增默认构建并部署到 Test Vault 的仓库规则 |

### 🧪 验证结果

- ✅ `npm run build`
- ✅ 已部署到 Test Vault

## 2026-03-26 会话样式系统落地与设置面板交互打磨

### 📋 本次开发目标
本轮围绕「会话界面可定制化」与「设置页使用体验」两条主线推进：

1. **为聊天界面建立可持久化的样式系统**
   - 在设置中新增独立 `样式 / Style` 大项
   - 支持对消息区、吸顶遮盖、用户消息、助手消息、输入区进行结构化调节
   - 保留高级 CSS 声明兜底，满足实验性微调需求

2. **完善设置页的视觉层级与交互体验**
   - 优化子分组层级、滑块控件排布、快速导航与关闭按钮关系
   - 为聊天相关滚动条增加主题安全的美化配置
   - 修复设置页从插件入口打开时的滚动记忆、定位跳转与初始焦点问题

### ✅ 会话样式配置系统（V1）

#### 1. 新增 `chatAppearance` 设置模型
- 在 `src/core/types/settings.ts` 中新增 `chatAppearance` 结构
- 拆分为：
  - `layout`
  - `sticky`
  - `user`
  - `assistant`
  - `input`
  - `scrollbar`
  - `advanced`
- 增加默认值工厂与 normalize 逻辑，确保老用户设置缺失时自动补齐

#### 2. 建立“即时预览 + 延迟持久化”链路
- 在 `src/main.ts` 中新增独立的样式应用与防抖保存流程
- 样式修改后可立即推送到已打开聊天视图
- 样式持久化不再触发模型刷新、服务重载、权限同步等无关副作用

#### 3. 聊天视图接入样式变量映射
- 新增 `src/features/chat/chatAppearance.ts`
- 将 `chatAppearance` 映射为容器级 CSS 变量
- 在 `src/features/chat/OpenCodianView.ts` 中统一应用变量，并注入高级声明模式的自定义样式：
  - 结构化参数先应用
  - `customCssDeclarations` 后应用，允许高级区覆盖前者

### ✅ 设置页新增“样式 / Style”大项

#### 1. 新增样式子分组
- 在 `src/features/settings/OpenCodianSettings.ts` 中新增独立 `Style` section
- 子分组包括：
  - `布局与吸顶`
  - `用户消息`
  - `助手消息`
  - `输入区`
  - `滚动条`
  - `高级样式`
- 同步加入 quick nav 快捷导航

#### 2. 抽象统一的数值调节控件
- 所有数值项统一采用：
  - 左减按钮
  - 固定宽度滑块
  - 数字输入框
  - 右加按钮
  - 单项重置按钮
- 支持 clamp、步长控制、即时预览、失焦/停止操作后延迟保存
- 补充子分组重置与整组“全部恢复默认”

#### 3. 强化设置页层级与主题安全
- 子分组标题改为更弱的视觉层级，明确低于主标题
- 子分组描述、标题、具体设置项统一左对齐基准线
- 为子分组增加更明确的容器包裹感
- 所有容器背景、分割线、按钮、说明文本全面改用 Obsidian 主题变量，避免硬编码颜色

### ✅ 滚动条样式配置（聊天界面）

#### 1. 新增滚动条结构化配置
- 在 `chatAppearance.scrollbar` 中新增：
  - `width`
  - `radius`
  - `trackOpacity`
  - `thumbOpacity`
  - `thumbHoverOpacity`
  - `edgePadding`
  - `shadowOpacity`

#### 2. 聊天区域滚动条主题化渲染
- `styles.css` 中为以下区域接入统一滚动条变量：
  - `.opencodian-messages-scroll`
  - `.opencodian-messages`
  - `.opencodian-history-scroll`
- WebKit 侧使用 `::-webkit-scrollbar*`
- Firefox 侧使用 `scrollbar-width` / `scrollbar-color` 做降级兼容
- 颜色继续基于主题变量，通过透明度与阴影强度控制质感，不开放自由配色输入

#### 3. 设置页滚动条额外美化
- 同时对 `.opencodian-settings` 的滚动条做了独立主题适配优化
- 让其在深浅主题下保持更柔和的可见度与悬停反馈
- 该部分属于设置面板视觉优化，不纳入聊天 `chatAppearance.scrollbar` 持久化配置

### ✅ 会话与设置界面样式细节收敛

#### 1. 助手消息视觉回调
- 收敛助手消息样式方向，弱化侵入文字区域的边缘高光
- 改为以圆角、阴影与轻量玻璃质感为主，拒绝明显渐变边缘

#### 2. 本地服务按钮与吸顶遮盖细节修复
- 缩小本地服务按钮阴影范围，避免悬浮层过重
- 修复主题切换时吸顶柔和遮盖未同步刷新背景的问题

#### 3. 快捷导航与关闭按钮布局修复
- 调整 `.opencodian-settings-quick-nav` 与 `.modal-close-button` 的相对关系
- 最终收敛为：快捷跳转维持原有长度与吸顶位置，关闭按钮移动到其右上角附近，避免重叠与错位

### ✅ 设置页滚动位置记忆与入口修复

#### 1. 设置页滚动位置记忆
- 在 `OpenCodianSettings` 中新增设置面板滚动容器绑定、恢复与捕获逻辑
- 支持记忆用户上次离开 `OpenCodian` 设置页时的滚动位置
- 原生 Obsidian 设置入口与插件内部入口均纳入兼容处理

#### 2. 插件入口定向打开修复
- 修复聊天界面右上角设置按钮打开后总是回到开头的问题
- 修复“本地服务”入口应跳转到服务项却落回页首的问题
- 对手动 restore 与定向滚动逻辑进行拆分，减少互相覆盖

#### 3. 初始焦点与闪动细节修复
- 清理 quick nav 初始焦点，避免从原生设置入口进入时出现语言说明 tooltip 被错误激活
- 继续收敛由多阶段滚动恢复造成的闪动感

### 📁 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/core/types/settings.ts` | 新增 `chatAppearance` 类型、默认值与 normalize 逻辑 |
| `src/core/types/index.ts` | 导出新的样式设置相关类型 |
| `src/features/chat/chatAppearance.ts` | 新增聊天样式变量映射与高级 CSS 声明构建工具 |
| `src/features/chat/OpenCodianView.ts` | 聊天视图接入样式应用、设置入口与服务跳转修复 |
| `src/features/settings/OpenCodianSettings.ts` | 新增样式大项、滑块控件、滚动记忆、quick nav 焦点修复 |
| `src/main.ts` | 新增样式即时应用与防抖持久化链路 |
| `src/i18n/locales/en.ts` | 补充样式与滚动条设置英文文案 |
| `src/i18n/locales/zh.ts` | 补充样式与滚动条设置中文文案 |
| `styles.css` | 新增聊天样式变量、滚动条样式、设置页层级与控件视觉优化 |
| `tests/unit/core/types/settings.test.ts` | 补充 `chatAppearance` 默认值与 normalize 测试 |
| `tests/unit/features/chat/chatAppearance.test.ts` | 新增聊天样式变量映射与高级声明测试 |

### 🧪 验证结果

- ✅ `npm run typecheck`
- ✅ `npm run lint`
- ✅ `npm run test`
- ✅ `npm run build`

## 2026-03-26 全主题适配修复与双环境构建稳定性优化

### 📋 本次开发目标
本轮主要完成两类问题收敛：

1. **聊天与设置界面全主题适配**
   - 避免在 Minimal、Things、Catppuccin、AnuPpuccin 等第三方主题下出现“贴补丁感”
   - 清除样式中的固定亮色/暗色假设
   - 统一改为基于 Obsidian 语义变量与 `color-mix()` 的主题感知写法

2. **Windows / macOS 双环境开发稳定性**
   - 修复因 Syncthing 同步 `node_modules/` 导致的 `esbuild` 平台二进制错配
   - 为仓库增加可重复执行的检测/修复命令
   - 补充仓库内说明，降低后续切系统时的维护成本

### ✅ 主题适配修复内容

#### 1. 建立统一的 Theme-Aware 变量层
- 在 `styles.css` 顶部新增一组 `--opencodian-*` 语义变量
- 覆盖表面层级、玻璃背景、边框、阴影、悬浮态、强调色、成功/警告/错误状态
- 所有变量都基于：
  - `--background-primary`
  - `--background-secondary`
  - `--background-modifier-*`
  - `--interactive-accent`
  - `--text-normal`

#### 2. 移除样式中的硬编码颜色
- 清除了 `styles.css` 中所有：
  - 十六进制颜色
  - `rgba(255,255,255,...)`
  - `rgba(0,0,0,...)`
  - 其他固定色值混合写法
- 改为统一使用 `color-mix(in srgb, var(--xxx), transparent)` 或 Obsidian 标准变量

#### 3. 重点重做的界面组件
- **用户消息气泡**：改为主题感知玻璃态背景、边框和阴影
- **助手消息悬浮态**：改为基于 `--background-modifier-hover`
- **notice 卡片**：warning / error / info 改为语义状态色
- **复制按钮**：从固定亮面按钮改为主题融入式悬浮操作按钮
- **模型下拉框**：重做弹层背景、搜索框、选中/悬浮态
- **设置页快速导航**：重做 sticky 面板、chip、tooltip、箭头
- **权限模式下拉 / 历史下拉 / 删除确认弹窗 / 权限弹窗**：统一改为主题感知玻璃层
- **内联权限卡片与状态标记**：改为语义成功/错误状态色

#### 4. 结果
- `styles.css` 中已不再包含硬编码颜色
- 插件界面在深色、浅色及第三方主题下都能更自然地融入宿主环境

### ✅ 双环境构建问题修复

#### 1. 发现的问题
- 在 macOS 上执行 `npm run build` 时，`esbuild` 报错：
  - 当前平台需要 `@esbuild/darwin-arm64`
  - 但工作目录里实际存在的是 `@esbuild/win32-x64`
- 根因是 **Syncthing 同步了 `node_modules/`**，导致 Windows 安装出的原生依赖覆盖了 macOS 本地依赖

#### 2. 新增 `esbuild` 检查/修复脚本
- 新增 `scripts/doctor-esbuild.mjs`
- 功能：
  - 检测当前平台与已安装 `@esbuild/*` 包是否匹配
  - 直接验证 `esbuild` 是否可运行
  - 在需要时自动触发 `npm ci` / `npm install` 修复当前平台依赖

#### 3. 新增 npm 命令
- `npm run doctor:esbuild`
- `npm run doctor:esbuild:fix`

#### 4. 构建脚本增强
- `scripts/build.mjs` 中增加了更友好的错误提示
- 当再次遇到平台错配时，会明确提示先运行 `npm run doctor:esbuild:fix`

### ✅ Syncthing 同步策略调整

#### 1. 新增 `.stignore`
新增 Syncthing 忽略文件，避免继续同步跨平台或本地构建产物：

- `node_modules/`
- `dist/`
- `coverage/`
- `.tmp-tsc-out/`
- `.DS_Store`
- `Thumbs.db`

#### 2. 后续工作流
- 切换系统后通常**不需要**每次都跑 `doctor`
- 只有在以下情况才需要执行：
  - 依赖变更
  - 手动重装/删除过依赖
  - `build` / `dev` 再次出现 `esbuild` 平台不匹配报错

### 📁 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `styles.css` | 全面清除硬编码颜色并重构为主题感知变量体系 |
| `scripts/doctor-esbuild.mjs` | 新增 esbuild 平台检测与修复脚本 |
| `scripts/build.mjs` | 构建脚本增加平台错配提示 |
| `package.json` | 新增 `doctor:esbuild` / `doctor:esbuild:fix` 命令 |
| `.stignore` | 新增 Syncthing 忽略规则，排除 `node_modules` 等本地目录 |
| `README.md` | 补充双环境开发与 doctor 命令说明 |
| `AGENTS.md` | 补充 Syncthing / esbuild 简短开发说明 |

### 🧪 验证结果

- ✅ 已确认 `styles.css` 中不再包含十六进制颜色或 `rgba(...)` 硬编码色值
- ✅ `npm run doctor:esbuild`
- ✅ `npm run doctor:esbuild:fix`
- ✅ `npm run build`

## 2026-03-26 无模型提示卡片新增“前往模型设置”快捷按钮

### 📋 功能补充
在“无模型可用”的会话内 notice 卡片基础上，继续补充一个更直接的操作入口：
- 卡片内新增 **前往模型设置** 按钮
- 点击后直接打开 OpenCodian 设置页
- 自动滚动定位到 **模型** 设置区

### ✅ 实现说明
- notice 卡片的动作不是临时 DOM，而是作为会话消息元数据一起持久化保存
- 因此即使：
  - 切换会话
  - 关闭后重新打开
  - 重启 Obsidian
- 这张卡片和它的按钮都会继续存在，并保持可点击

### 📁 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/core/types/chat.ts` | 新增 notice action 持久化类型 |
| `src/features/chat/OpenCodianView.ts` | 渲染 notice 按钮并处理“前往模型设置”动作 |
| `src/features/settings/OpenCodianSettings.ts` | 新增滚动到模型设置区的方法 |
| `styles.css` | 新增 notice 操作按钮样式 |
| `src/i18n/locales/zh.ts` | 新增中文按钮文案 |
| `src/i18n/locales/en.ts` | 新增英文按钮文案 |
| `tests/unit/core/storage/StorageService.test.ts` | 校验 notice action 能随会话持久化保存 |

### 🧪 验证结果

- ✅ `npm run typecheck`
- ✅ `npm run test`
- ✅ `npm run lint`
- ✅ `npm run build`

## 2026-03-26 无模型发送失败提示改为会话内持久卡片

### 📋 问题描述
当当前来源模式下没有可用模型时，用户在聊天页发送消息会出现两个体验问题：
- 会话区插入一整块非常突兀的红色错误块
- 同时右上角还会弹出 `Notice` 提示，视觉上重复且打断感很强

另外，这类提示如果只是临时浮层，也无法在重新打开会话或重启 Obsidian 后保留下来。

### ✅ 修复内容

#### 1. 无模型提示改为会话内 notice 卡片
- 不再为该场景使用红色 `streaming-error-block`
- 改为在聊天流中插入一张样式更温和的 **notice 卡片**
- 卡片根据当前来源模式给出更具体的说明：
  - 仅本地：提示本地 `.opencode/opencode.json` 尚无模型
  - 仅服务器：提示服务器未暴露模型
  - 合并模式：提示当前来源模式下没有可用模型
  - 已选模型失效：提示当前会话模型已不可用

#### 2. 去掉右上角重复弹窗
- `modelUnavailable` 这条发送前校验链路不再调用右上角 `Notice`
- 避免在会话中已经给出提示卡片时，界面顶部再重复提示一次

#### 3. 提示卡片持久化到会话
- 新增 assistant message 的 notice 展示元数据并直接保存进会话 JSON
- 这样在以下情况下都能保持原位显示：
  - 切换会话
  - 关闭后重新打开会话
  - 重启 Obsidian

### 📁 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/core/types/chat.ts` | 为消息新增 notice 展示元数据字段 |
| `src/features/chat/OpenCodianView.ts` | 将无模型错误改为会话内持久卡片，并移除右上角重复提示 |
| `styles.css` | 新增聊天 notice 卡片样式 |
| `src/i18n/locales/zh.ts` | 新增中文 notice 文案 |
| `src/i18n/locales/en.ts` | 新增英文 notice 文案 |
| `tests/unit/core/storage/StorageService.test.ts` | 补充 notice 消息持久化回归测试 |

### 🧪 验证结果

- ✅ `npm run typecheck`
- ✅ `npm run test`
- ✅ `npm run lint`
- ✅ `npm run build`

## 2026-03-26 模型来源列表设置页布局优化

### 📋 问题描述
模型来源区此前采用 **本地配置 / 服务器配置 / 当前生效列表** 三张卡片并排展示：
- provider / model 很多时，页面会被拉得很长
- 三卡片布局在不同宽度下容易出现大块留白
- “默认合并模式”说明单独占据一行，信息密度偏低

### ✅ 优化内容

#### 1. 三卡片改为单面板标签切换
- 将三份模型目录改为单个面板展示
- 通过标签切换查看：
  - 本地配置
  - 服务器配置
  - 当前生效列表
- 默认根据当前来源模式自动选中最相关视图：
  - `仅本地` → 本地配置
  - `仅服务器` → 服务器配置
  - `合并模式` → 当前生效列表

#### 2. 列表区域固定高度并支持滚动
- 模型目录面板改为固定高度滚动区
- provider 数量较多时不会继续无限拉长整个设置页
- 去掉原先三列卡片造成的视觉割裂和底部空白

#### 3. 合并模式说明并入来源选项
- 删除来源模式下方单独说明文案
- 将“默认使用合并模式，本地优先覆盖”直接并入 **合并模式** 选项文本
- 让用户在切换来源时直接看到关键规则

### 📁 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/features/settings/OpenCodianSettings.ts` | 将三卡片目录重构为单面板标签切换视图 |
| `styles.css` | 新增模型目录标签页与滚动面板样式，移除旧三卡片布局样式 |
| `src/i18n/locales/zh.ts` | 调整模型来源模式与目录摘要文案 |
| `src/i18n/locales/en.ts` | 同步英文文案 |

### 🧪 验证结果

- ✅ `npm run typecheck`
- ✅ `npm run lint`
- ✅ `npm run build`

## 2026-03-26 仅本地模式空模型仍可发送问题修复

### 📋 问题描述
在设置中把模型来源切换为 **仅本地** 后，如果本地 `.opencode/opencode.json` 里没有任何 provider / model：
- 会话页模型选择器仍会显示之前残留的服务器模型名
- 下拉展开后列表为空，显示与实际状态不一致
- 用户继续发送消息时，OpenCode 仍可能沿用服务器侧可用模型完成回复

### 🔍 原因分析
- `src/features/chat/OpenCodianView.ts` 中，会话模型显示和发送逻辑此前没有在 **“模型目录已经加载，但当前模型已失效 / 不存在”** 的场景下彻底清空旧值
- 设置页中的默认 provider / model 在有效模型列表为空时，也没有及时重置为空字符串
- `src/core/opencode/ServerManager.ts` 在 **仅本地** 模式下，如果本地没有 provider，之前不会显式把 `enabled_providers` 约束为空集合，导致受管 OpenCode 进程仍可能继续使用服务端/全局配置

### ✅ 修复内容

#### 1. 聊天页模型选择器严格跟随当前有效目录
- `getCurrentSessionModel()` 现在会在模型目录已加载后校验：
  - 当前会话覆盖模型是否仍存在
  - 默认 provider / model 是否仍存在
- 若两者都无效，则回退到首个可用模型；如果根本没有模型，则返回 `null`
- 模型选择器触发按钮在无模型时显示 **No models available**

#### 2. 无模型时阻止发送
- 发送消息前会再次校验当前 provider / model：
  - 未选择模型时直接阻止发送
  - 当前模型不在有效目录中时直接阻止发送
  - 当前模型不在服务端实际可用模型中时直接阻止发送

#### 3. 设置页同步清空失效默认值
- 在 `src/features/settings/OpenCodianSettings.ts` 中：
  - 若当前有效 provider 列表为空，则自动将 `defaultProvider` 置空
  - 若当前 provider 下已无模型，则自动将 `defaultModel` 置空
- provider / model 下拉框在空状态下明确显示无模型提示

#### 4. 仅本地模式显式禁用非本地 provider
- `src/core/opencode/ServerManager.ts` 在 `modelSourceMode === 'local'` 时：
  - 强制设置 `OPENCODE_DISABLE_PROJECT_CONFIG=true`
  - 指向 vault 内 `.opencode` 目录
  - 无论本地 provider 是否为空，都写入：
    - `OPENCODE_CONFIG_CONTENT={"enabled_providers":[]}`
- 这样即使本地没有模型，也不会再隐式回退到服务器/全局 provider

### 📁 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/features/chat/OpenCodianView.ts` | 修复会话模型选择器旧值残留，并在无模型时阻止发送 |
| `src/features/settings/OpenCodianSettings.ts` | 有效模型为空时清空默认 provider / model |
| `src/core/opencode/ServerManager.ts` | 仅本地模式下显式写入空 `enabled_providers` |
| `tests/unit/core/opencode/ServerManager.test.ts` | 补充仅本地空 provider 场景测试 |

### 🎯 修复效果
- ✅ 仅本地模式且本地无模型时，聊天页不再显示旧服务器模型
- ✅ 模型下拉框和实际可发送状态保持一致
- ✅ 无模型时发送会被拦截，不会再意外走到服务器模型
- ✅ 受管本地 OpenCode 服务严格遵循本地模型来源模式

### 🧪 验证结果

- ✅ `npm run typecheck`
- ✅ `npm run test`
- ✅ `npm run lint`
- ✅ `npm run build`

## 2026-03-26 设置页重复配置项渲染修复

### 📋 问题描述
设置界面在首次打开时通常正常，但在修改服务器相关配置并触发设置页重新渲染后，**用户 / 调试 / 界面** 等后半段配置区会重复追加到页面中，形成重复的设置项。

### 🔍 原因分析
- `src/features/settings/OpenCodianSettings.ts` 中的 `display()` 之前是异步方法
- `display()` 在渲染过程中会等待异步的 `addSecuritySettings()`
- 旧实现里 `addSecuritySettings()` 又会在中途 `await updateConfigStatus()`
- 一旦服务器配置变化再次触发 `display()`，前一次渲染可能尚未完成，导致前一次渲染恢复后又把后续的 **UI / Debug / User** 分区再次插入 DOM

本质上，这是一个由**设置页中途让出执行权**引发的重渲染竞态问题。

### ✅ 修复内容

#### 1. 将安全设置区恢复为同步渲染链路
- `addSecuritySettings()` 保持为同步方法
- 不再阻塞整个设置页主渲染流程

#### 2. 配置状态检查改为非阻塞执行
- 初始配置状态刷新从阻塞式等待改为：
  - `void updateConfigStatus().catch(...)`
- 这样配置状态仍会异步更新，但不会打断整页顺序渲染

#### 3. 将设置页 `display()` 明确改为同步方法
- 把 `display()` 从 `async display(): Promise<void>` 改为 `display(): void`
- 使设置页的渲染语义与当前实现保持一致
- 降低后续再次引入中途 `await` 导致竞态的风险

### 📁 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/features/settings/OpenCodianSettings.ts` | 将设置页主渲染方法改为同步，并保持安全设置区状态检查为非阻塞调用 |

### 🎯 修复效果
- ✅ 修改服务器配置后，不再重复出现 **用户 / 调试 / 界面** 配置项
- ✅ 配置状态仍可异步刷新显示
- ✅ 设置页渲染顺序更加稳定，避免后半段分区被重复插入

### 🧪 验证结果

- ✅ `npm run build`

## 2026-03-26 模型来源模式、可视化模型配置面板与模型 JSON 编辑器

### 📋 功能描述
本轮围绕 **“模型配置来源不清晰”**、**“手写 `.opencode/opencode.json` 门槛高”**、以及 **“高级用户仍需要可控的 JSON 编辑入口”** 三个问题，对 OpenCodian 的模型配置链路做了一次完整增强。

目标包括：
- 让用户明确选择模型列表来自 **本地配置 / 服务器配置 / 合并模式**
- 在设置页直接看到 **本地模型列表、服务器模型列表、当前生效列表**
- 提供 **可视化模型配置面板**，无需手改 JSON 即可添加提供商和模型
- 提供 **只编辑 provider/model 相关字段** 的 JSON 编辑器，满足高级用户需求
- 让本地受管 OpenCode 服务在不同来源模式下按预期加载配置

### ✅ 实现细节

#### 1. 新增模型来源模式
- 在设置中新增 **模型来源模式**：
  - **仅本地**
  - **仅服务器**
  - **合并模式**（默认）
- 默认行为遵循 OpenCode 合并思路：
  - 服务器模型作为基础
  - 本地 `.opencode/opencode.json` 中的同名 provider / model 字段覆盖服务器同名字段
- 来源模式会保存到插件设置中，并在设置页切换后自动刷新模型目录

#### 2. 设置页显示三组模型目录
- 模型设置区现在会展示三组卡片：
  - **本地配置**
  - **服务器配置**
  - **当前生效列表**
- 每张卡片按 provider 聚合展示模型列表，方便快速对比：
  - 哪些模型只在本地
  - 哪些模型只在服务器
  - 合并后最终会在选择器里出现哪些模型

#### 3. 新增模型配置解析与合并服务
- 新增独立的模型配置处理模块，负责：
  - 读取 `.opencode/opencode.json`
  - 提取 provider / model / enabled_providers / disabled_providers 等相关字段
  - 生成本地模型目录
  - 拉取服务器模型目录
  - 产出生效后的合并目录
- 同时补充了对 **JSONC 注释** 的兼容解析，避免用户配置里带注释时直接读失败

#### 4. 可视化模型配置面板
- 新增 **Visual Model Configuration** 弹窗
- 支持直接配置：
  - 默认模型
  - small model
  - 提供商 ID / 名称
  - SDK 包名
  - API Base URL
  - API Key
  - 模型列表
  - context / output limit
- 支持：
  - 添加提供商
  - 删除提供商
  - 添加模型
  - 删除模型
- 保存后自动写回当前 vault 的 `.opencode/opencode.json`

#### 5. 模型 JSON 编辑器
- 新增 **模型 JSON 编辑器** 弹窗
- 该编辑器只显示与模型有关的子集字段，不暴露完整 OpenCode 配置
- 支持：
  - JSON 格式化
  - 基本结构校验
  - provider 对象校验
  - enabled / disabled providers 数组校验
- 保存时仅替换模型相关字段，保留原文件中其他配置（如 permission）不被覆盖

#### 6. 本地受管 OpenCode 服务按来源模式加载配置
- 对 `ServerManager` 增加来源模式感知：
  - **server**：禁用项目配置加载
  - **merge**：保持 OpenCode 默认行为
  - **local**：禁用项目配置，再通过环境变量限制到本地 provider 范围
- 这样在本地受管服务模式下，来源模式不再只是 UI 展示，而是真正影响服务启动时的配置来源

#### 7. 聊天面板模型选择器同步升级
- 聊天区模型下拉不再只依赖服务器原始列表
- 现在会读取当前来源模式下的 **生效模型目录**
- 发送消息前增加校验：
  - 如果当前选中的 provider/model 并不在已连接的 OpenCode 服务可用列表里
  - 直接提示用户切换来源模式、刷新模型或重启本地服务
- 避免出现“设置里能选，但实际发送时报模型不存在”的迷惑体验

#### 8. 中英文文案与样式同步补齐
- 为模型来源模式、三组模型卡片、可视化配置、JSON 编辑器、模型不可用提示等新增中英文文案
- 为模型来源卡片、provider/model 表单、配置弹窗补充样式
- 保持与现有设置页视觉风格一致

### 📁 本轮涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/core/types/settings.ts` | 新增 `modelSourceMode` 设置及默认值 |
| `src/core/types/opencodeConfig.ts` | 新增 OpenCode 模型配置相关类型 |
| `src/core/types/permission.ts` | 复用统一的 `OpencodeConfig` 类型 |
| `src/core/types/index.ts` | 导出新增模型配置类型 |
| `src/core/config/modelConfig.ts` | 模型配置提取、合并、JSONC 注释解析 |
| `src/core/config/ModelConfigService.ts` | 本地/服务器/生效模型目录服务 |
| `src/core/config/OpencodeConfigManager.ts` | 配置读写兼容模型字段与 JSONC |
| `src/core/config/index.ts` | 导出新配置服务 |
| `src/core/opencode/types.ts` | 服务配置增加 `modelSourceMode` |
| `src/core/opencode/OpenCodeService.ts` | 来源模式变化时支持重启受管服务 |
| `src/core/opencode/ServerManager.ts` | 启动时按来源模式设置环境变量 |
| `src/features/settings/OpenCodianSettings.ts` | 模型来源设置、目录卡片、配置入口 |
| `src/features/settings/ModelConfigModal.ts` | 新增可视化模型配置面板 |
| `src/features/settings/ModelConfigJsonModal.ts` | 新增模型 JSON 编辑器 |
| `src/features/chat/OpenCodianView.ts` | 聊天页模型目录刷新与模型可用性校验 |
| `src/main.ts` | 初始化并注入模型配置服务，刷新聊天页目录 |
| `src/i18n/locales/zh.ts` | 新增模型来源/编辑器/错误提示文案 |
| `src/i18n/locales/en.ts` | 新增模型来源/编辑器/错误提示文案 |
| `styles.css` | 新增模型来源卡片与模型配置弹窗样式 |
| `tests/unit/core/config/OpencodeConfigManager.test.ts` | 补充模型配置保留与 JSONC 解析测试 |
| `tests/unit/core/types/settings.test.ts` | 补充 `modelSourceMode` 默认值测试 |

### 🐛 本轮重点修复的问题

1. **模型到底来自哪里不清楚**：用户无法区分本地配置、服务器配置和最终生效列表
2. **本地自定义提供商配置门槛高**：必须手动编辑 JSON，不利于普通用户
3. **高级用户只能编辑完整配置**：缺少只针对 provider/model 字段的安全编辑入口
4. **来源模式只是概念，没有真正影响服务加载**：现在本地受管服务会按模式切换配置来源
5. **聊天页可能选到不可用模型**：发送前新增可用性检查与明确提示

### 🎯 验证结果

- ✅ `npm run typecheck`
- ✅ `npm run test`
- ✅ `npm run lint`
- ✅ `npm run build`
- ✅ 已重新部署到测试库：`C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`

### 当前状态

- ✅ 模型来源模式已可在设置中切换
- ✅ 设置页可同时查看本地、服务器和生效模型目录
- ✅ 已具备可视化模型配置面板
- ✅ 已具备模型 JSON 编辑器
- ✅ 本地受管 OpenCode 服务会按来源模式调整配置加载方式
- ✅ 聊天页已能拦截不可用模型并给出明确提示

---

## 2026-03-26 远程服务器帮助文案完善与聊天面板状态显示修正

### 📋 功能描述
本轮主要围绕 **“远程服务器模式对新手不够直观”** 和 **“聊天面板状态文案与用户选择不一致”** 两个问题做补充完善。

目标包括：
- 让“远程服务器 URL”帮助说明更贴近真实使用场景，明确说明它也可以填写本地地址
- 将远程模式默认值设置为本地地址，降低第一次使用门槛
- 明确告知用户这些设置是**自动保存**的，避免担心重启后丢失
- 修复聊天面板中“外部服务”文案不合理的问题，使其跟随当前本地/远程模式显示

### ✅ 实现细节

#### 1. 远程服务器 URL 默认值改为本地地址
- 将 `server.remote.baseUrl` 默认值改为：
  - `http://127.0.0.1:4096`
- 这样即使用户切换到“远程服务器”模式，也可以先直接复用本地 OpenCode 地址测试连接
- 降低了“远程 URL 一定只能填公网地址”的认知门槛

#### 2. 切换到远程模式时自动补本地 URL
- 在用户从本地模式切换到远程模式时：
  - 如果远程 URL 还是空值
  - 自动填入当前本地配置拼出的地址
- 行为示例：
  - 本地 host = `127.0.0.1`
  - 本地 port = `4096`
  - 切到远程模式后，自动带出 `http://127.0.0.1:4096`

#### 3. 远程 URL 帮助文案补充
- 在帮助弹窗中新增更明确的说明：
  - 这个字段虽然叫“远程服务器 URL”，**也可以填写本机地址**
  - 适用于：
    - 本地地址
    - 局域网 IP
    - 域名
    - HTTPS
    - 反向代理子路径
- 示例更新为：
  - `http://127.0.0.1:4096`
  - `http://192.168.1.20:4096`
  - `https://ai.example.com`
  - `https://ai.example.com/opencode`

#### 4. 明确说明“设置会自动保存”
- 在远程 URL 帮助弹窗中增加提示：
  - 用户填写后会**自动保存**
  - 重启 Obsidian 后不会丢失
- 同时确认设置项输入逻辑继续保持：
  - 每次修改时立即调用 `saveSettings()`

#### 5. 聊天面板状态文案按模式显示
- 修复聊天面板中原来只显示“外部服务”的问题
- 现在当服务可用时，状态会根据当前选择模式显示为：
  - **本地服务**
  - **远程服务**
- 不再把用户已经主动选择的模式错误显示成“外部服务”

#### 6. 中英文文案同步修正
- 更新中文 `zh.ts` 和英文 `en.ts`
- 保证设置页帮助弹窗、聊天状态文本、默认值说明在中英文下都一致

### 📁 本轮涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/core/types/settings.ts` | 将远程 URL 默认值改为本地地址 |
| `src/features/settings/OpenCodianSettings.ts` | 切换远程模式时自动补全本地 URL；保持修改即保存 |
| `src/features/chat/OpenCodianView.ts` | 聊天面板状态文案改为按本地/远程模式显示 |
| `src/i18n/locales/zh.ts` | 补充远程 URL 可填写本地地址、自动保存说明与聊天状态文案 |
| `src/i18n/locales/en.ts` | 补充远程 URL 可填写本地地址、自动保存说明与聊天状态文案 |

### 🐛 本轮重点修复的问题

1. **远程 URL 名称容易误导**：用户以为这里只能填写公网或别的机器地址
2. **第一次切换远程模式时没有可参考值**：不利于本地快速测试
3. **用户担心设置不持久**：不清楚输入后是否会自动保存
4. **聊天面板状态文案不合理**：用户选择了本地/远程模式，却只看到“外部服务”

### 🎯 验证结果

- ✅ `npm run build`
- ✅ 已重新部署到测试库：`C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`

### 当前状态

- ✅ 远程服务器 URL 帮助说明已明确支持填写本地地址
- ✅ 远程模式默认值已改为本地地址，方便快速试用
- ✅ 设置项保持自动保存，重启后不会丢失
- ✅ 聊天面板服务状态已能根据本地 / 远程模式正确显示

---

**会话日期**: 2026-03-26
**开发时间**: ~0.5 小时
**主要贡献**: 远程 URL 帮助文案完善、默认值优化、自动保存说明补充、聊天状态文案修正
**当前状态**: 已部署测试库，可继续观察实际使用反馈

---

## 2026-03-26 服务器可用性引导、调试诊断导出与跨平台日志路径完善

### 📋 功能描述
本轮主要围绕 **“服务未启动时用户不知道发生了什么”** 和 **“排障信息不够集中、导出不方便”** 两类问题做了一次完整收敛，同时继续打磨设置页交互体验。

目标包括：
- 在聊天窗口与设置面板中更明确地反映 OpenCode 服务真实状态
- 当服务离线时，给用户可操作的启动/重试/打开设置入口，而不是只看到抽象报错块
- 将调试日志、最近诊断信息、日志文件导出整合到独立调试分组
- 让日志默认路径支持 Windows 与 macOS/Linux 分别保存，避免跨设备同步后互相污染
- 修复选择日志路径后设置页闪烁并跳回顶部的问题

### ✅ 实现细节

#### 1. 服务器设置升级为本地 / 远程双模式
- 重构 `server` 设置结构，区分：
  - **local**：插件管理本机 OpenCode 进程
  - **remote**：连接远程 OpenCode 服务
- 新增远程地址与鉴权配置，支持：
  - 无认证
  - Basic Auth
  - Bearer Token
- 本地模式下保留 host / port / auto-start
- 远程模式下改为连接测试，不再显示无意义的“启动本地服务”操作

#### 2. 设置页新增服务器帮助弹窗
- 新增 `ServerSettingHelpModal`
- 为服务器模式、自动启动、地址、端口、远程 URL、认证方式、用户名、密码、Token、状态等字段增加帮助入口
- 帮助弹窗统一说明：
  - 这个字段是什么意思
  - 应该怎么填写
  - 示例值与注意事项

#### 3. 聊天窗口增加服务离线引导卡片
- 当 OpenCode 服务未就绪时，在会话区域直接显示状态卡片
- 卡片提供以下操作：
  - **启动服务**
  - **重试连接**
  - **打开设置**
  - **暂不启动**
- 会话顶部状态也补充了 `checking / running / starting / offline / external` 五种可视状态
- 用户在卡片中执行操作后，设置页中的服务器状态会同步刷新，不再出现“会话与设置显示不一致”

#### 4. 服务器状态检测与日志输出收敛
- 插件加载时会主动记录一次服务器状态快照
- 在设置里打开调试日志后，会额外输出当前服务器健康状态、内部状态、是否存在受管进程等信息
- 清理了部分误导性常驻日志：
  - 像“server already running on port 4096”这类信息改为 `debug` 级别
  - 未开启调试日志时不再默认刷屏
- 服务管理、健康检查、状态刷新与 UI 提示之间的联动更一致

#### 5. 调试配置拆分为独立分组
- 设置页将调试相关能力单独收纳到 **Debug / 调试** 分组
- 顶部快捷跳转新增调试入口
- 调试分组中明确说明：
  - 调试日志输出在 Obsidian 开发者工具 **Console**
  - Windows / Linux 如何打开控制台
  - macOS 如何打开控制台
  - 打开后应切换到 `Console` 标签查看与复制日志

#### 6. 增加“一键复制最近诊断信息”
- logger 新增最近日志缓冲区
- 支持将最近捕获的关键信息与当前环境拼装成诊断文本
- 点击设置页按钮后，可直接复制最近诊断结果到剪贴板，方便用户发给开发者排查

#### 7. 增加“一键生成调试日志文件”
- 新增诊断报告构建与写盘导出能力
- 日志文件中包含：
  - 插件版本
  - 当前平台
  - vault 路径
  - 服务器模式、地址、认证方式、健康状态
  - 调试开关状态
  - 最近日志缓冲内容
- 用户可直接生成 `.log` 文件发送给开发者

#### 8. 日志默认路径改为按平台分别保存
- 原先只有单一 `debugLogPath`
- 现改为平台独立的 `debugLogPaths`：
  - `windows`
  - `unix`
- Windows 与 macOS/Linux 使用各自默认路径，不会因设置同步互相覆盖
- 兼容旧设置：如果用户原本只有旧版单路径，会自动迁移到当前平台对应槽位

#### 9. 修复路径选择后的设置页闪烁与跳顶
- 去掉选择路径、生成日志后对整个设置页的 `display()` 重绘
- 改为只更新当前输入框值并保存设置
- 修复选择路径后界面闪一下、滚动位置瞬间回到顶部的体验问题

#### 10. 路径选择器补齐跨平台兜底
- 文件夹选择器默认路径会优先使用：
  1. 当前平台已保存的默认日志路径
  2. `allowedExportPaths` 中存在的本地目录
  3. 桌面目录
  4. 用户主目录
- 同时支持展开 `~`，兼容 Windows 与 macOS/Linux 常见写法

### 📁 本轮涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/core/types/settings.ts` | 重构 server 配置结构；新增平台化 debug 日志路径类型与默认值 |
| `src/core/types/index.ts` | 导出新的 server / debug path helpers |
| `src/core/opencode/types.ts` | 扩展 OpenCode server 配置类型，支持 mode / auth |
| `src/core/opencode/ServerManager.ts` | 完善本地/远程模式、健康检查、认证头与日志级别 |
| `src/core/opencode/OpenCodeService.ts` | 根据新 server 配置更新请求逻辑与设置变更处理 |
| `src/features/chat/OpenCodianView.ts` | 新增服务离线提示卡片与更细的状态显示 |
| `src/features/settings/OpenCodianSettings.ts` | 服务器设置重构、帮助按钮、调试分组、诊断导出、平台路径与无跳动更新 |
| `src/features/settings/ServerSettingHelpModal.ts` | 新增服务器字段帮助弹窗 |
| `src/features/settings/OpencodeConfigModal.ts` | 适配设置结构调整 |
| `src/main.ts` | 设置迁移、服务器状态快照、诊断报告生成、日志文件写出 |
| `src/i18n/locales/zh.ts` | 新增服务器帮助、调试、诊断、状态文案 |
| `src/i18n/locales/en.ts` | 新增服务器帮助、调试、诊断、状态文案 |
| `src/shared/logger.ts` | 增加最近日志缓冲与诊断辅助能力 |
| `src/shared/index.ts` | 导出 logger 新接口 |
| `styles.css` | 补充调试区、状态卡片与帮助弹窗相关样式 |
| `tests/unit/core/opencode/OpenCodeService.test.ts` | 更新服务配置与状态相关测试 |
| `tests/unit/core/opencode/ServerManager.test.ts` | 更新本地/远程与认证逻辑测试 |
| `tests/unit/core/types/settings.test.ts` | 更新 debugLogPaths 与平台 helper 测试 |
| `tests/__mocks__/obsidian.ts` | 补充测试环境 mock |

### 🐛 本轮重点修复的问题

1. **服务没启动时提示过于抽象**：用户只能看到错误块，不知道该启动服务还是检查设置
2. **聊天窗口与设置状态不同步**：用户在会话里感知到离线，但设置页没有实时反映
3. **调试日志开关开启后信息仍不完整**：缺少服务器健康状态与当前运行快照
4. **未开启调试日志也会出现部分服务日志**：影响普通用户使用体验
5. **日志导出能力不足**：用户难以快速提供可复现的诊断信息
6. **日志默认路径不适合跨平台同步**：同一份设置在 Windows 与 macOS/Linux 下会互相覆盖
7. **选择路径后设置页闪烁并回顶**：影响连续配置体验

### 🎯 验证结果

- ✅ `npm run typecheck`
- ✅ `npm test -- --runTestsByPath tests/unit/core/types/settings.test.ts`
- ✅ `npm run build`
- ✅ 已构建并同步到测试库：`C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`

### 当前状态

- ✅ 服务器未启动时，聊天窗口已能给出明确可操作引导
- ✅ 设置页已支持本地 / 远程 OpenCode 连接模式
- ✅ 调试能力已形成独立分组，支持复制诊断与导出日志文件
- ✅ 默认日志路径已支持 Windows 与 macOS/Linux 分别保存
- ✅ 路径选择后的闪烁与跳顶体验问题已修复
- ✅ 服务器状态日志、离线引导与设置页刷新链路已基本打通

---

**会话日期**: 2026-03-26
**开发时间**: ~4-5 小时
**主要贡献**: 服务器离线引导、调试诊断导出、服务器设置重构、跨平台日志路径与设置页体验修复
**当前状态**: 已部署测试库，等待进一步联调与真实使用反馈

---

## 2026-03-25 聊天气泡复制按钮与设置页快捷导航体验优化

### 📋 功能描述
本轮主要围绕两块 UI 体验做连续打磨：
- 聊天区复制按钮的玻璃质感、形状与相对气泡的位置关系
- 设置页顶部快捷跳转条、毛玻璃提示、分类说明与弹层视觉统一

目标是让聊天区复制按钮更贴合气泡角、更像系统悬浮控件，同时为设置页新增可快速定位分类的顶部导航，降低设置项增多后的查找成本。

### ✅ 实现细节

#### 1. 用户/助手复制按钮样式多轮收敛
- 将复制按钮统一为更清晰的玻璃风格，补齐半透明底、边框高光、模糊与阴影
- 从椭圆胶囊样式回退到更协调的圆角方形按钮
- 多次微调用户消息复制按钮与气泡左下角的相对位置，使其视觉上对角呼应但不遮挡气泡
- 为用户消息容器补足底部留白，避免按钮压住消息气泡

#### 2. 聊天区相关弹出层改为透明毛玻璃面板
- 将模型选择弹出框、权限控制弹出框、历史会话弹出框统一为 frosted glass 面板
- 将历史会话中的删除确认弹窗与遮罩层也统一为透明玻璃风格
- 后续又对模型选择面板单独降噪，减少内部多层渐变，避免看起来过于花哨

#### 3. 设置页新增顶部快捷跳转条
- 在设置页最顶部新增快捷跳转区，可快速滚动到语言、服务器、模型、安全、界面、用户等分类
- 为每个分类标题补充锚点与平滑滚动逻辑
- 将快捷跳转条调整到设置内容最上边，并修正容器顶部留白，确保真正贴顶显示

#### 4. 快捷跳转条视觉与交互打磨
- 顶部导航改为正文宽度内的圆角长方形玻璃条，而非整行全宽
- 去掉背景渐变，改为更纯净、更透明的模糊玻璃底
- 为快捷按钮新增玻璃提示框，并将提示内容从"跳转到某分类"改成"该分类主要设置什么"
- 解决提示框与系统黑色 tooltip 重叠的问题，移除额外 tooltip 来源
- 将提示框改到按钮下方显示，并处理左右边缘溢出与背景文字可读性问题

### 📁 本轮涉及文件

| 文件 | 修改内容 |
|------|----------|
| `styles.css` | 复制按钮样式与位置微调、模型/权限/历史/删除弹层毛玻璃化、设置页快捷导航与提示框样式 |
| `src/features/settings/OpenCodianSettings.ts` | 新增设置页顶部快捷跳转、按钮提示文案与滚动逻辑 |
| `src/i18n/locales/zh.ts` | 新增快捷跳转标题与分类说明文案 |
| `src/i18n/locales/en.ts` | 新增快捷跳转标题与分类说明文案 |

### 🎯 验证结果

- ✅ 多轮执行 `npm run build`
- ✅ 多轮部署到测试库：`C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian`
- ✅ 聊天区复制按钮位置与质感已在测试库中反复微调验证
- ✅ 设置页快捷跳转条、玻璃提示与弹层样式已在测试库中联调

### 当前状态

- ✅ 复制按钮已从早期"几乎无感"的样式收敛到更协调的玻璃悬浮按钮
- ✅ 主要聊天弹出层已统一为透明毛玻璃面板
- ✅ 设置页已具备顶部快捷跳转能力
- ✅ 快捷按钮提示框已改为功能说明型文案，并处理了遮挡、越界与可读性问题

---

**会话日期**: 2026-03-25
**开发时间**: ~2 小时
**主要贡献**: 复制按钮玻璃样式迭代、聊天弹层毛玻璃统一、设置页快捷跳转与提示交互
**当前状态**: 已部署测试库，UI 细节持续打磨中

---

---

## 2026-03-25 TypeScript 报错清零与配置兼容修复

### 📋 功能描述
在完成轻量 logger 与 ESLint 收敛后，继续清理仓库内剩余的 TypeScript 报错；重点修复聊天流式渲染、权限请求事件、OpenCode 配置权限类型、vault 路径访问兼容，以及 provider icon 映射中的重复 key 问题，最终将仓库恢复到 `tsc / lint / build` 全绿状态。

### ✅ 实现细节

#### 1. 修复 `OpenCodianView` 的 7 个 TypeScript 问题
- 修正 `permission_request` 流式事件与权限弹窗参数类型不匹配
- 使用包装状态对象替代直接闭包引用的 `pendingEl`，避免 TS 将其收窄为 `never`
- 补齐流式工具结果的可选 `isError`
- 补齐工具状态 `blocked` 的持久化类型

#### 2. 补齐 OpenCode 权限配置类型
- 在 `PermissionConfig` 中补充 `write` 字段
- 清理 `src/core/types/index.ts` 中重复导出的 `PermissionMode`
- 让计划模式 / 普通模式生成的 `.opencode` 权限配置与类型定义保持一致

#### 3. 修复 vault 路径访问兼容性
- 新增 `src/shared/vault.ts`
- 统一通过 `getVaultBasePath()` 读取 Obsidian vault 根路径
- 替换设置页和主插件中对旧 `adapter.getBasePath()` 的直接调用
- 在路径不可用时增加安全降级，避免初始化或同步配置时报错

#### 4. 清理其他编译问题
- 修正 `OpenCodeService` 中 `permission.asked` 事件字段类型
- 修正 `main.ts` 中旧版 `chatScrollMode: 'sticky'` 的兼容判断
- 修正 `checkHealth()` 返回 Promise 后的判断逻辑
- 移除 `ProviderIconService` 中重复的对象 key，消除 TS1117

### 📁 本轮涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/features/chat/OpenCodianView.ts` | 修复流式 UI 的 7 个 TS 报错 |
| `src/core/types/chat.ts` | 补充 `blocked` 状态与 `tool_result.isError` |
| `src/core/types/permission.ts` | 补充 `write` 权限类型 |
| `src/core/types/index.ts` | 移除重复导出的 `PermissionMode` |
| `src/core/opencode/OpenCodeService.ts` | 补齐权限事件字段类型 |
| `src/shared/vault.ts` | 新增 vault 路径访问 helper |
| `src/shared/index.ts` | 导出 vault helper |
| `src/main.ts` | 替换旧路径访问并修复异步判断 |
| `src/features/settings/OpenCodianSettings.ts` | 设置页改用兼容路径 helper |
| `src/utils/icons/ProviderIconService.ts` | 清理重复 key |

### 🎯 验证结果

- ✅ `npx tsc --noEmit --pretty false`
- ✅ `npm run lint`
- ✅ `npm run build`

### 当前状态

- ✅ 仓库 TypeScript 报错清零
- ✅ ESLint 继续保持 `0 errors / 0 warnings`
- ✅ 生产构建通过
- ✅ logger、debug 开关、类型系统与配置同步机制现已一致

---

**会话日期**: 2026-03-25
**开发时间**: ~1 小时
**主要贡献**: TypeScript 报错清零、vault 路径兼容、权限配置类型补齐
**当前状态**: 已通过 tsc / lint / build，待提交

---

---

## 2026-03-25 轻量 Logger 与 ESLint 清零收敛

### 📋 功能描述
为项目引入统一的轻量 logger，并把原本分散在各模块中的 `console.*` 调用收敛到统一接口；同时通过忽略规则、自动修复和小规模代码清理，将仓库本体的 ESLint 结果收敛到 `0 errors / 0 warnings`。

### ✅ 实现细节

#### 1. 统一轻量 logger
- 新增 `src/shared/logger.ts`
- 提供统一接口：
  - `logger.debug(...)`
  - `logger.warn(...)`
  - `logger.error(...)`
- 日志会自动带上模块作用域前缀，避免不同模块日志混杂

#### 2. Debug 日志开关
- `debug` 日志默认关闭
- 新增设置项 **调试日志 / Debug logging**
- 支持在设置中实时切换，保存后立即影响当前会话中的日志输出
- 运行时状态会同步到：
  - 全局标记 `__OPENCODIAN_DEBUG__`
  - `localStorage['opencodian:debug']`

#### 3. 替换散落的 console 调用
- 将 `src/main.ts`、`OpenCodeService`、`ServerManager`、`OpenCodianView` 等核心模块中的 `console.log / warn / error` 统一替换为 logger
- 测试 mock 中的 `Notice` 输出也移除了直接 `console.log`

#### 4. ESLint 收敛
- 新增 `.eslintignore`，忽略：
  - `reference-projects/**`
  - `dist/**`
  - `coverage/**`
  - `node_modules/**`
- 执行 `lint:fix` 自动清理 import/export 排序
- 手动修复：
  - 未使用变量
  - `require()` 风格导入
  - `@ts-ignore` / 类型访问问题

### 📁 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/shared/logger.ts` | 新增轻量 logger 与 debug 开关 |
| `src/shared/index.ts` | 导出 logger 相关接口 |
| `src/core/types/settings.ts` | 新增 `enableDebugLogging` 设置项 |
| `src/features/settings/OpenCodianSettings.ts` | 增加调试日志开关 UI |
| `src/i18n/locales/en.ts` | 新增 debug logging 英文文案 |
| `src/i18n/locales/zh.ts` | 新增 debug logging 中文文案 |
| `src/main.ts` | 加载/保存设置时同步 logger 开关 |
| `.eslintignore` | 忽略参考项目与构建产物，减少 lint 噪音 |

### 🐛 修复的问题

1. **调试日志分散**：各模块直接使用 `console.*`，难以统一管理
2. **无法按需开启调试日志**：排查问题时缺少运行时开关
3. **ESLint 噪音过大**：既有错误与警告较多，且容易被参考项目目录干扰

### 🎯 当前状态

**logger 与 lint 当前为：**
- ✅ 已接入统一轻量 logger
- ✅ 设置页支持切换调试日志
- ✅ 保存设置后 debug 开关立即生效
- ✅ 项目本体 ESLint 结果收敛到 `0 errors / 0 warnings`
- ✅ 构建通过，功能可继续迭代

---

**会话日期**: 2026-03-25
**开发时间**: ~1.5 小时
**主要贡献**: 统一轻量 logger、调试日志设置开关、ESLint 全量清零
**当前状态**: 功能完成，已通过 lint 与 build

---

---

## 2026-03-25 会话滚动模式与工具状态持久化修复

### 📋 功能描述
围绕聊天会话界面完成了一轮交互打磨，并修复历史会话中工具调用失败状态被错误显示为成功的问题。

### ✅ 实现细节

#### 1. 三档会话滚动模式
- 新增聊天滚动模式设置，支持三种可切换效果：
  - **自然滚动**：用户消息与助手消息正常随滚动移动
  - **用户消息吸顶**：每轮对话的用户消息作为 section header 吸顶
  - **吸顶 + 柔和遮盖**：在吸顶基础上增加边界遮盖与柔和过渡
- 现有旧配置中的 `sticky` 自动迁移为新的 `sticky-mask`

#### 2. 会话 DOM 结构重构
- 将原来的平铺消息结构改为按 turn 分组
- 每个 turn 拆分为：
  - `opencodian-turn-header`：承载用户消息
  - `opencodian-turn-body`：承载对应的助手内容
- 这样可以稳定实现"用户消息吸顶、下一条用户消息将上一条顶走"的滚动行为

#### 3. 吸顶模式视觉优化
- 为吸顶模式增加可选遮盖层，避免助手消息穿透到上一条用户消息区域
- 吸顶遮盖层跟随实际面板背景色，减少主题不一致带来的色块感
- 助手消息悬浮底纹改为圆角，避免 hover 时出现生硬直角

#### 4. 工具调用失败状态持久化修复
- 新增 `toolStatus` 持久化字段，保存工具调用的真实状态
- 流式渲染结束后，工具块会把 `completed / error` 状态一并写入消息内容块
- 从 OpenCode 历史消息恢复为本地消息时，也会推导并保留工具状态
- 历史渲染增加兼容逻辑：旧数据若没有 `toolStatus`，但结果文本以 `Error:` 开头，则仍显示为失败

### 📁 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/features/chat/OpenCodianView.ts` | 聊天视图改为 turn 分组结构；增加滚动模式类切换；渲染历史工具调用时恢复真实状态 |
| `src/features/settings/OpenCodianSettings.ts` | 新增三档会话滚动模式设置项 |
| `src/core/types/settings.ts` | 扩展 `ChatScrollMode` 类型与默认值 |
| `src/main.ts` | 保存设置时刷新打开中的聊天视图；兼容旧 `sticky` 配置迁移 |
| `src/core/types/chat.ts` | 为持久化消息块新增 `toolStatus` 字段 |
| `src/core/opencode/OpenCodeService.ts` | 从历史工具结果构建本地内容块时补齐工具状态 |
| `src/i18n/locales/en.ts` | 添加滚动模式英文文案 |
| `src/i18n/locales/zh.ts` | 添加滚动模式中文文案 |

### 🐛 修复的问题

1. **历史失败工具调用显示错误**：重载 Obsidian 后，失败工具调用会错误显示为绿色勾
2. **吸顶效果不可配置**：用户无法在自然滚动与吸顶滚动之间自由切换
3. **旧配置兼容性**：旧版 `sticky` 配置需要迁移到新的三档滚动模式体系

### 🎯 当前状态

**聊天滚动与状态恢复功能当前为：**
- ✅ 三档会话滚动模式可在设置中切换
- ✅ 打开的聊天视图会在保存设置后立即刷新滚动模式
- ✅ 失败工具调用状态会正确写入历史会话
- ✅ 旧历史消息在可推断失败状态时能正确显示红色 `×`
- ✅ 已构建并部署到测试库验证

---

**会话日期**: 2026-03-25
**开发时间**: ~3 小时
**主要贡献**: 会话滚动模式系统、吸顶交互优化、工具调用失败状态持久化修复
**当前状态**: 功能完成，已部署测试

---

---

## 2026-03-24 消息复制按钮功能

### 📋 功能描述
为聊天消息添加复制按钮，方便用户快速复制消息内容。

### ✅ 实现细节

#### 1. 用户消息复制按钮
- **位置**：气泡外左下角，与气泡底部对齐
- **触发方式**：鼠标悬浮在消息区域（包括气泡周围 28px 热区）
- **交互**：
  - 默认隐藏，悬浮显示
  - 点击后显示 "copied!" 反馈
  - 1.5 秒后恢复图标

#### 2. 助手消息复制按钮
- **位置**：时间戳旁边（同一行）
- **触发方式**：鼠标悬浮在整个助手消息区域
- **功能**：收集所有 text blocks 内容，点击后复制完整内容

#### 3. DOM 结构调整
```typescript
// 助手消息时间戳行结构
.opencodian-message-time-row
├── .opencodian-message-time-text  // 时间文本
└── .opencodian-copy-btn-inline     // 复制按钮
```

#### 4. 样式规格
| 属性 | 值 |
|------|-----|
| 图标大小 | 18x18px |
| 默认透明度 | 0（隐藏） |
| 悬浮透明度 | 1（显示） |
| 过渡动画 | 0.15s ease |
| 反馈文字颜色 | var(--text-accent) |

### 📁 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/features/chat/OpenCodianView.ts` | 新增 `addTextCopyButton` 方法、新增 `addTimestampWithCopyButton` 方法、修改消息渲染逻辑 |
| `styles.css` | 新增 `.opencodian-copy-btn`、`.opencodian-copy-btn--user`、`.opencodian-copy-btn-inline`、`.opencodian-message-time-row` 等样式 |

### 🐛 修复的问题

1. **变量名错误**：`OpenCodianView.COPY_ICON` → `COPY_ICON`
2. **未定义变量**：`content` → `contentEl` in `createAssistantMessageElement`
3. **时间戳位置错误**：流式消息时间戳在内容之前 → 改为流结束后添加到末尾
4. **助手消息定位问题**：添加 `position: relative` 确保按钮正确相对定位
5. **用户时间戳丢失**：恢复用户消息的时间戳显示

### 🎯 当前状态

**复制按钮功能完整：**
- ✅ 用户消息：气泡外左下角复制按钮
- ✅ 助手消息：时间戳旁内联复制按钮
- ✅ 悬浮热区：消息周围 28px 范围可触发
- ✅ 点击反馈：显示 "copied!" 1.5 秒
- ✅ 大小一致：统一 18x18px 图标

---

**会话日期**: 2026-03-24
**开发时间**: ~1 小时
**主要贡献**: 消息复制按钮完整功能
**当前状态**: 功能完整，已部署测试

---

---

## 2026-03-24 权限系统完善与 UI 优化

### 📋 背景
OpenCode 的权限系统通过 `.opencode/opencode.json` 配置文件控制。本次开发将权限管理完全集成到插件中，实现从配置管理到权限请求处理的完整闭环。

---

### ✅ 1. OpenCode 配置管理器

**实现内容：**
- 创建 `OpencodeConfigManager` 类管理项目级配置
- 支持自动创建、读取、更新配置文件
- 三种权限模式：YOLO/Normal/Plan

```typescript
export class OpencodeConfigManager {
  async setYoloMode(): Promise<void> {
    await this.updatePermission('allow');
  }
  
  async setNormalMode(): Promise<void> {
    await this.updatePermission({ '*': 'ask' });
  }
  
  async setPlanMode(): Promise<void> {
    await this.updatePermission({
      '*': 'ask',
      edit: 'deny',
      write: 'deny',
      bash: 'deny',
    });
  }
}
```

**文件位置：**
- `src/core/config/OpencodeConfigManager.ts`

---

### ✅ 2. 跨平台工作目录支持

**问题：**
OpenCode 服务器需要在 vault 目录启动才能读取项目配置。

**解决方案：**
```typescript
// Windows 支持
if (process.platform === 'win32') {
  candidates.push('opencode.cmd', `${process.env.APPDATA}\\npm\\opencode.cmd`);
}

// macOS 支持
if (process.platform === 'darwin') {
  candidates.push('/opt/homebrew/bin/opencode', '/usr/local/bin/opencode');
}

// 启动时设置工作目录
this.process = spawn(opencodePath, ['serve', ...], {
  cwd: this.workingDirectory,  // Vault 路径
});
```

**调试输出：**
```
[ServerManager] Working directory set to: C:\Users\lt\Desktop\Write\testvault
[ServerManager] Starting OpenCode in directory: C:\Users\lt\Desktop\Write\testvault
```

---

### ✅ 3. 内联权限请求对话框

**设计改进：**
- 从全局弹窗改为消息流内嵌卡片
- 不阻塞用户操作其他界面
- 选择后自动消失，不占用空间

**实现代码：**
```typescript
private async showPermissionDialog(request: PermissionRequest): Promise<void> {
  // 在消息流中创建权限卡片
  const permissionCard = permissionContainer.createDiv({ 
    cls: 'opencodian-permission-inline' 
  });
  
  // 显示工具信息和按钮
  // ...
  
  // 用户选择后移除卡片
  const result = await new Promise<...>((resolve) => { ... });
  permissionCard.remove();  // 完全消失，不占用空间
}
```

**UI 样式：**
```css
.opencodian-permission-inline {
  background: var(--background-primary);
  border: 2px solid var(--interactive-accent);
  border-radius: 8px;
  padding: 16px;
  margin: 12px 0;
}
```

**文件位置：**
- `src/features/chat/OpenCodianView.ts`
- `styles.css`

---

### ✅ 4. 输入栏权限模式切换

**实现内容：**
在输入框下方工具栏添加权限模式下拉框：

```
┌─────────────────────────────────────────────────────────┐
│  [🤖 模型选择器]              [🛡️ YOLO ▼]              │
└─────────────────────────────────────────────────────────┘
```

**代码实现：**
```typescript
private initializePermissionSelector(containerEl: HTMLElement): void {
  const trigger = containerEl.createDiv({ cls: 'opencodian-permission-trigger' });
  
  // 根据当前模式显示不同颜色
  trigger.addClass(`mode-${mode}`);  // yolo=green, ask=blue, plan=red
  
  // 点击切换模式并自动重启服务
  trigger.addEventListener('click', async () => {
    await this.switchPermissionMode(newMode);
  });
}
```

**自动重启逻辑：**
```typescript
private async switchPermissionMode(mode: 'yolo' | 'normal' | 'plan'): Promise<void> {
  // 1. 更新配置
  this.plugin.settings.permissionMode = mode;
  await this.plugin.saveSettings();
  
  // 2. 重启 OpenCode 服务
  await this.plugin.openCodeService.stop();
  await new Promise(resolve => setTimeout(resolve, 1000));
  await this.plugin.openCodeService.start();
}
```

**显示格式：**
- YOLO 模式：`🛡️ YOLO`（绿色）
- 询问模式：`🛡️ ASK`（蓝色）
- 计划模式：`🛡️ PLAN`（红色）

---

### ✅ 5. 中文翻译完善

**新增翻译键：**
```typescript
// 权限对话框
'permissionDialog.title': '权限请求',
'permissionDialog.description': 'AI 想要使用工具：',
'permissionDialog.toolDescription': '此工具的作用：',
'permissionDialog.allowOnce': '允许一次',
'permissionDialog.allowAlways': '始终允许',
'permissionDialog.reject': '拒绝',

// 工具描述
'permissionDialog.tools.websearch': '搜索网络获取最新信息',
'permissionDialog.tools.bash': '执行终端命令（谨慎使用）',
'permissionDialog.tools.read': '读取文件内容',
'permissionDialog.tools.edit': '编辑/修改文件内容',

// 设置按钮
'settings.security.configFile.editBtn': '编辑配置',
'settings.security.configFile.applyBtn': '应用并重启',
```

**文件位置：**
- `src/i18n/locales/zh.ts`
- `src/i18n/locales/en.ts`

---

### ✅ 6. 计划模式检测修复

**问题：**
计划模式（有 `deny` 权限）被错误显示为询问模式。

**修复代码：**
```typescript
if (typeof permission === 'object' && permission?.['*'] === 'ask') {
  // 检查是否有 deny - 那是计划模式
  const hasDeny = Object.values(permission).some(v => v === 'deny');
  if (hasDeny) {
    statusText = t('settings.security.configStatus.plan');
    statusClass = 'opencodian-status-plan';
  } else {
    statusText = t('settings.security.configStatus.normal');
    statusClass = 'opencodian-status-normal';
  }
}
```

**状态显示：**
- ✅ YOLO 模式（自动批准全部）- 绿色
- ✅ 询问模式（提示批准）- 蓝色
- ✅ 计划模式（禁止修改）- 红色
- ✅ 自定义模式 - 灰色

---

### ✅ 7. 权限对话框超时修复

**问题：**
权限对话框显示时，流超时仍在计时，导致用户未响应就中断。

**修复：**
```typescript
// 显示对话框前暂停超时
if (timeoutId) {
  window.clearTimeout(timeoutId);
  timeoutId = null;
}

await this.showPermissionDialog(chunk);

// 用户响应后重新开始超时
if (this.isStreaming) {
  timeoutId = window.setTimeout(() => { ... }, STREAM_TIMEOUT_MS);
}
```

---

### 📁 修改文件列表

| 文件 | 修改内容 |
|------|----------|
| `src/core/config/OpencodeConfigManager.ts` | 新增配置管理器 |
| `src/core/opencode/ServerManager.ts` | 跨平台工作目录支持 |
| `src/core/opencode/OpenCodeService.ts` | 权限事件处理 |
| `src/features/chat/OpenCodianView.ts` | 内联权限对话框、输入栏权限切换 |
| `src/features/settings/OpenCodianSettings.ts` | 设置页面权限检测修复 |
| `src/i18n/locales/zh.ts` | 中文翻译 |
| `src/i18n/locales/en.ts` | 英文翻译 |
| `styles.css` | 权限卡片样式、权限选择器样式 |

---

### 🎯 当前状态

**权限系统功能完整：**
- ✅ 三种权限模式（YOLO/ASK/PLAN）
- ✅ 配置文件自动管理
- ✅ 内联权限请求对话框
- ✅ 输入栏快速切换权限模式
- ✅ 切换后自动重启服务
- ✅ 中英文双语支持

**待优化：**
- 设置页面 `display()` 改为 async 后需验证 Obsidian 兼容性

---

**会话日期**: 2026-03-24
**开发时间**: ~4 小时
**主要贡献**: 权限系统完整集成、跨平台支持、内联权限对话框、中文汉化
**当前状态**: 权限系统功能完整，可正常使用

---

---

## 2026-03-24 模型选择器 UI 重构与图标集成

本次会话完成了模型选择器的全面升级，从原生 `<select>` 元素迁移到自定义下拉组件，并集成了 200+ 个 AI 供应商品牌图标。

---

### ✅ 1. 模型选择器 UI 重构

**问题背景：**
- 原生 `<select>` 下拉框样式受限，无法分组显示
- 无法显示供应商图标，视觉层次不清晰
- 参考 opencode 的 UI 设计，需要更现代化的选择器

**实现内容：**

#### 自定义下拉组件架构
```
┌─────────────────────────────────────┐
│ 🤖 anthropic/claude-3-5-sonnet   ▼ │  ← Trigger 按钮（显示当前选择）
└─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────┐
│ 🔍 Search models...                 │  ← 搜索输入框
├─────────────────────────────────────┤
│ 🅰️  ANTHROPIC      ← sticky header   │
│    claude-3-opus-20240229           │
│  ✓ claude-3-5-sonnet-20241022       │  ← 当前选中
│    claude-3-5-haiku-20241022        │
├─────────────────────────────────────┤
│ 🇨🇳 DEEPSEEK       ← sticky header   │
│    deepseek-chat                    │
│    deepseek-reasoner                │
└─────────────────────────────────────┘
```

**关键实现：**

1. **Trigger 按钮设计**
   ```typescript
   // Ghost 样式按钮，显示当前选择的模型
   createEl('button', { cls: 'opencodian-model-trigger' }, (btn) => {
     btn.createSpan({ cls: 'model-trigger-icon', text: '🤖' });
     btn.createSpan({ cls: 'model-trigger-text', text: modelName });
     btn.createSpan({ cls: 'model-trigger-chevron', text: '▼' });
   });
   ```

2. **下拉面板结构**
   ```typescript
   createDiv({ cls: 'opencodian-model-dropdown' }, (dropdown) => {
     // 搜索输入
     dropdown.createDiv({ cls: 'opencodian-model-search' }, ...);
     // 可滚动列表
     dropdown.createDiv({ cls: 'opencodian-model-dropdown-scroll' }, ...);
   });
   ```

3. **定位策略**
   ```css
   .opencodian-model-dropdown {
     position: absolute;
     bottom: calc(100% + 8px);  /* 位于输入框上方 */
     left: 0;
     z-index: 1000;
   }
   ```

**涉及文件：**
- `src/features/chat/OpenCodianView.ts`
- `styles.css`

---

### ✅ 2. 粘性分组头部 (Sticky Headers)

**设计目标：**
- 提供商名称在滚动时固定在顶部
- 清晰区分不同提供商的模型
- 提供视觉反馈表示当前所在分组

**技术实现：**

1. **CSS 粘性定位**
   ```css
   .opencodian-model-provider-header {
     position: sticky;
     top: 0;
     z-index: 10;
     background: var(--background-secondary);
   }
   ```

2. **IntersectionObserver 检测粘性状态**
   ```typescript
   private handleProviderHeaderScroll(): void {
     const observer = new IntersectionObserver((entries) => {
       entries.forEach(entry => {
         const header = entry.target as HTMLElement;
         const rect = header.getBoundingClientRect();
         const containerRect = container.getBoundingClientRect();
         // 检测是否被粘住
         header.dataset.stuck = (rect.top <= containerRect.top + 1) ? 'true' : 'false';
       });
     }, { root: container, threshold: [0, 1] });
   }
   ```

3. **粘性状态视觉反馈**
   ```css
   .opencodian-model-provider-header[data-stuck="true"] {
     box-shadow: 0 8px 8px -4px rgba(0, 0, 0, 0.1);
   }
   ```

---

### ✅ 3. Lobehub 图标集成

**图标来源：**
- 使用 Lobehub Icons Static SVG 包
- 1425+ 个 AI/LLM 品牌图标
- CDN 加载：`https://unpkg.com/@lobehub/icons-static-svg@latest/icons/{name}.svg`

**ProviderIconService 实现：**

1. **图标映射表 (200+ 供应商)**
   ```typescript
   private static readonly PROVIDER_ICON_MAP: Record<string, string> = {
     // 国际主流
     'openai': 'openai',
     'anthropic': 'anthropic',
     'claude': 'claude',
     'google': 'google',
     'gemini': 'gemini',
     // 中国厂商
     'deepseek': 'deepseek',
     'aihubmix': 'aihubmix',
     'zhipu': 'zhipu',
     'glm': 'chatglm',
     'moonshot': 'moonshot',
     'kimi': 'moonshot',  // kimi = moonshot
     'qwen': 'qwen',
     '通义千问': 'qwen',
     // ... 200+ 更多映射
   };
   ```

2. **模糊匹配算法**
   ```typescript
   private static normalizeProviderId(providerId: string): string {
     return providerId
       .toLowerCase()
       .replace(/[\s\-_.]+/g, '')           // 移除分隔符
       .replace(/[\(\（].*?[\)\）]/g, '');  // 移除括号内容
   }
   
   static getIconUrl(providerId: string): string | undefined {
     const normalized = this.normalizeProviderId(providerId);
     
     // 1. 直接匹配
     if (this.PROVIDER_ICON_MAP[normalized]) {
       return this.buildUrl(this.PROVIDER_ICON_MAP[normalized]);
     }
     
     // 2. 包含匹配 (aihub-mix → aihubmix)
     for (const [key, iconName] of Object.entries(this.PROVIDER_ICON_MAP)) {
       if (normalized.includes(key) || key.includes(normalized)) {
         return this.buildUrl(iconName);
       }
     }
     
     // 3. 尝试直接使用
     return this.buildUrl(normalized);
   }
   ```

3. **SVG 图标渲染**
   ```typescript
   static getProviderIconHTML(providerId: string, size: number = 16): string {
     const iconUrl = this.getIconUrl(providerId);
     return `<img src="${iconUrl}" 
                  width="${size}" height="${size}" 
                  class="opencodian-provider-icon"
                  style="display: inline-block; vertical-align: middle;">`;
   }
   ```

**匹配示例：**
| 输入 | 归一化 | 匹配结果 |
|------|--------|----------|
| `AiHubMix (推理时代)` | `aihubmix` | ✅ `aihubmix` |
| `aihub-mix` | `aihubmix` | ✅ `aihubmix` |
| `zhipu-external` | `zhipexternal` | ✅ 包含 `zhipu` |
| `通义千问` | `通义千问` | ✅ `qwen` |
| `Kimi (Moonshot)` | `kimi` | ✅ `moonshot` |

---

### ✅ 4. 搜索与键盘导航

**搜索功能：**
```typescript
private modelFilterQuery = '';

// 过滤逻辑
const filtered = providers.filter(({ provider, models }) => {
  const providerMatch = provider.providerID.toLowerCase().includes(query);
  const modelMatch = models.some(m => m.toLowerCase().includes(query));
  return providerMatch || modelMatch;
});
```

**键盘导航：**
- `↑/↓` - 在选项间移动
- `Enter` - 选择高亮项
- `Escape` - 关闭下拉
- `Home/End` - 跳到首/尾

---

### ✅ 5. Flexbox 滚动修复

**问题：**
flex 容器内的子元素使用 `overflow-y: auto` 时滚动条不显示。

**解决方案：**
```css
/* 使用 max-height 而非 flex: 1 */
.opencodian-model-dropdown-scroll {
  max-height: 260px;        /* 固定最大高度 */
  overflow-y: scroll !important;  /* 强制显示滚动条 */
}

/* 父容器 */
.opencodian-model-dropdown {
  display: flex;
  flex-direction: column;
  max-height: 320px;        /* 整体最大高度 */
  overflow: hidden;         /* 防止整体溢出 */
}
```

---

### 📁 新增/修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/utils/icons/ProviderIconService.ts` | 新增：图标映射与加载服务 |
| `src/features/chat/OpenCodianView.ts` | 重构：模型选择器 UI 实现 |
| `styles.css` | 新增：下拉组件、粘性头部、图标样式 |

---

### 🎨 视觉层次设计

```
提供商头部 (14px, bold, accent color)
  └── 模型选项 (12px, normal)
  └── 模型选项 (12px, normal)

颜色规范：
- 提供商名：var(--text-accent) - 强调色
- 模型名：var(--text-normal) - 正文色
- 选中项：var(--background-modifier-hover) - 悬停背景
- 图标：16x16px，flex-shrink: 0 防止压缩
```

---

### 🔧 已知问题

1. **重复 key 警告**
   - `spark` 和 `jamba` 在映射表中重复定义（非致命）
   - 不影响功能，可后续清理

2. **图标加载延迟**
   - CDN 图标首次加载有短暂延迟
   - 浏览器缓存后快速加载

---

**会话日期**: 2026-03-24
**开发时间**: ~3 小时
**主要贡献**: 自定义模型选择器、Lobehub 图标集成、粘性分组头部、搜索功能
**当前状态**: ✅ 模型选择器 UI 完整，支持 200+ 供应商图标

---

---

## 2026-03-24 UI 改进与功能完善

本次会话完成了多项 UI 改进和 Bug 修复。

---

### ✅ 1. 时间戳移出消息气泡

**问题现象：**
- 用户消息的时间戳显示在深色气泡内部，影响美观
- 与 Claudian 的样式不一致

**解决方案：**
- 将时间戳从 `content` 容器移到 `messageEl` 级别
- 调整 CSS，让时间戳显示在气泡下方

```typescript
// 修改前：在 content 内部创建时间戳
content.createEl('div', { cls: 'opencodian-message-time', text: time });

// 修改后：在 messageEl 级别创建时间戳
messageEl.createEl('div', { cls: 'opencodian-message-time', text: time });
```

**涉及文件：**
- `src/features/chat/OpenCodianView.ts`
- `styles.css`

---

### ✅ 2. Thinking 块与工具调用样式优化（Claudian 风格）

**实现内容：**
- Thinking 块显示 "Thought for Xs" 或 "Thought (<1s)"
- 工具调用显示工具名和参数摘要
- 工具状态图标：✓ 绿色（成功）、✕ 红色（失败）
- 展开后显示左侧边框线

**样式变更：**
```css
/* Thinking 块 */
.streaming-thinking-label {
  color: var(--text-accent);  /* 橙色/红色 */
}

/* 工具调用状态 */
.streaming-tool-status.status-completed {
  color: var(--color-green);
}
.streaming-tool-status.status-error {
  color: var(--color-red);
}
```

**涉及文件：**
- `src/utils/streaming/ThinkingBlockRenderer.ts`
- `src/utils/streaming/ToolCallRenderer.ts`
- `styles.css`

---

### ✅ 3. 消息持久化存储

**问题现象：**
- 重新加载 Obsidian 后用户消息消失
- 工具调用消息跑到最下面
- Thinking duration 丢失

**解决方案：**
1. **保存完整消息**：`saveConversation` 现在保存 `messages` 数组
2. **独立 thinking 块**：每个 reasoning part 创建独立的 thinking block
3. **保持顺序**：工具调用在收到结果时立即保存到 contentBlocks

```typescript
// StorageService.ts
async saveConversation(conversation: Conversation): Promise<void> {
  const data = {
    // ... 元数据
    messages: conversation.messages,  // 保存完整消息
  };
}
```

**涉及文件：**
- `src/core/storage/StorageService.ts`
- `src/main.ts`
- `src/utils/streaming/StreamController.ts`

---

### ✅ 4. 等待提示功能

**实现内容：**
- AI 响应超过 1 秒时显示 "Getting to work..."
- 实时显示等待时间
- 提示 "(esc to interrupt)"
- 收到实际内容后自动消失

```typescript
const pendingTimeout = window.setTimeout(() => {
  pendingEl = messageContentEl.createDiv({ cls: 'opencodian-pending' });
  pendingEl.createSpan({ text: 'Getting to work...', cls: 'opencodian-pending-text' });
  // ... 计时器更新
}, 1000);
```

**CSS 样式：**
```css
.opencodian-pending {
  font-size: 13px;
  color: var(--text-accent);
  font-style: italic;
}
```

**涉及文件：**
- `src/features/chat/OpenCodianView.ts`
- `styles.css`

---

### ✅ 5. 流超时处理

**问题现象：**
- 某些工具调用长时间卡住
- 流无法正常退出

**解决方案：**
- 添加 2 分钟超时机制
- 超时后将运行中的工具标记为错误

```typescript
private timeoutStream(): void {
  for (const [toolId, toolCall] of this.state.toolCalls) {
    if (toolCall.status === 'running' || toolCall.status === 'pending') {
      toolCall.status = 'error';
      toolCall.result = 'Request timeout';
      // ... 更新 UI
    }
  }
}
```

**涉及文件：**
- `src/utils/streaming/StreamController.ts`
- `src/features/chat/OpenCodianView.ts`

---

### 🐛 遇到的问题与修复

#### 问题 1：TypeScript 类型错误

**现象：**
编译时出现 9 处类型错误，涉及：
- `ContentBlock` 未导入
- `ToolCallInfo` 类型不匹配
- `setLocale` 参数类型错误

**修复：**
```typescript
// 统一 ToolCallStatus 类型
export type ToolCallStatus = 'pending' | 'running' | 'completed' | 'error' | 'blocked';

// 修复 setLocale 调用
setLocale(this.settings.locale as 'en' | 'zh');
```

#### 问题 2：工具调用状态显示错误

**现象：**
- 工具调用失败仍显示绿色勾
- CSS 中有重复定义覆盖了错误状态颜色

**修复：**
删除 CSS 中重复的状态颜色定义。

#### 问题 3：等待提示不显示

**现象：**
- 等待提示逻辑存在但不显示
- 原因是第一帧数据到达过快，清除了等待提示

**修复：**
```typescript
// 只在有实际内容时才清除等待提示
const hasContent = (streamingChunk.type === 'text' && streamingChunk.content?.trim()) ||
                  (streamingChunk.type === 'thinking' && streamingChunk.content?.trim());
```

---

### 📁 修改文件汇总

| 文件 | 修改内容 |
|------|----------|
| `src/features/chat/OpenCodianView.ts` | 时间戳位置、等待提示、消息持久化 |
| `src/utils/streaming/ThinkingBlockRenderer.ts` | Thinking 块渲染逻辑 |
| `src/utils/streaming/ToolCallRenderer.ts` | 工具调用渲染、状态图标 |
| `src/utils/streaming/StreamController.ts` | 工具调用保存顺序、超时处理 |
| `src/core/storage/StorageService.ts` | 保存完整消息数组 |
| `src/core/opencode/OpenCodeService.ts` | 独立 thinking 块处理 |
| `src/core/types/chat.ts` | 添加 `durationSeconds` 字段 |
| `src/core/types/tools.ts` | 统一 `ToolCallStatus` 类型 |
| `src/main.ts` | 异步加载完整会话 |
| `styles.css` | 样式优化、等待提示样式 |

---

### 📝 下一步计划

1. **测试覆盖** - 添加单元测试覆盖新功能
2. **性能优化** - 大型消息历史的加载优化
3. **国际化** - 完善中英文切换

---

## 2026-03-24 UI 布局优化与玻璃拟态设计

### 📋 背景
优化聊天界面布局，改进用户消息气泡视觉效果，添加流畅的动画交互。

### ✅ 已完成功能

#### 1. 发送按钮位置调整
**改动前：**
- 发送按钮位于输入框内部右侧

**改动后：**
- 发送按钮移到输入栏下方工具栏右侧
- 布局结构：`[权限模式] [模型选择器]        [发送按钮]`

**代码变更：**
```typescript
// OpenCodianView.ts - buildInputArea()
// 将 sendBtn 从 inputWrapper 移到 toolbar
this.sendBtn = toolbar.createDiv({ cls: 'opencodian-send-btn' });
```

---

#### 2. 权限模式位置调整
**改动：**
- 权限模式从右侧移到左侧
- 与模型选择器挨着，保持视觉连贯性
- 统一字体大小为 `13px`（原来是 `12px`）

**布局结构：**
```
┌─────────────────────────────────────────────────┐
│  [PLAN] [GLM-4.5]                        [🚀]  │
└─────────────────────────────────────────────────┘
```

---

#### 3. 去掉下拉箭头
**改动：**
- 移除模型选择器的 chevron-down 图标
- 移除权限模式的 chevron-down 图标

**代码变更：**
```typescript
// OpenCodianView.ts - initializeModelSelector()
// 删除：const chevron = triggerContent.createSpan(...)
// 删除：setIcon(chevron, 'chevron-down');

// OpenCodianView.ts - initializePermissionSelector()
// 删除：const chevronEl = trigger.createSpan(...)
// 删除：setIcon(chevronEl, 'chevron-down');
```

---

#### 4. 用户消息玻璃拟态气泡
**设计效果：**
- 半透明渐变背景
- backdrop-filter 毛玻璃模糊效果
- 高光边框和多层阴影
- 圆角气泡，右下尖角

**CSS 实现：**
```css
.opencodian-message--user .opencodian-message-content {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05));
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 16px;
  border-end-end-radius: 4px;
  box-shadow: 
    0 4px 24px rgba(0, 0, 0, 0.15),
    0 1px 2px rgba(255, 255, 255, 0.1) inset;
}
```

**悬停闪光效果：**
```css
.opencodian-message--user .opencodian-message-content::before {
  content: '';
  position: absolute;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
  transition: left 0.5s ease;
}

.opencodian-message--user:hover .opencodian-message-content::before {
  left: 100%;  /* 悬停时闪光扫过 */
}
```

---

#### 5. 动画效果
**消息滑入动画：**
```css
@keyframes messageSlideIn {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.opencodian-message--user,
.opencodian-message--assistant {
  animation: messageSlideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

**发送按钮动画：**
```css
/* 悬停放大+旋转 */
.opencodian-send-btn:hover {
  transform: scale(1.1) rotate(-5deg);
  box-shadow: 0 4px 16px rgba(var(--interactive-accent-rgb), 0.4);
}

/* 停止按钮脉冲动画 */
.opencodian-stop-btn {
  animation: pulseRed 2s ease-in-out infinite;
}

@keyframes pulseRed {
  0%, 100% { box-shadow: 0 0 0 0 rgba(var(--background-modifier-error-rgb), 0.4); }
  50% { box-shadow: 0 0 0 8px rgba(var(--background-modifier-error-rgb), 0); }
}

/* 点击波纹效果 */
.opencodian-send-btn::after {
  content: '';
  position: absolute;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  transition: width 0.4s ease, height 0.4s ease;
}
```

**气泡悬停效果：**
```css
.opencodian-message--user:hover .opencodian-message-content {
  transform: translateY(-2px) scale(1.01);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  border-color: rgba(255, 255, 255, 0.25);
}
```

---

### 📁 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/features/chat/OpenCodianView.ts` | 发送按钮移到底部工具栏、移除下拉箭头、调整元素顺序 |
| `styles.css` | 玻璃拟态气泡样式、动画效果、工具栏布局调整 |

---

### 🎯 当前状态

**布局优化：**
- ✅ 发送按钮在输入栏下方右侧
- ✅ 权限模式在左侧与模型选择器挨着
- ✅ 无下拉箭头，界面更简洁

**视觉效果：**
- ✅ 用户消息玻璃拟态气泡
- ✅ 悬停闪光扫过效果
- ✅ 悬停上浮放大效果

**动画效果：**
- ✅ 消息滑入动画（带弹性效果）
- ✅ 发送按钮悬停旋转放大
- ✅ 停止按钮红色脉冲呼吸
- ✅ 点击波纹效果

---

**会话日期**: 2026-03-24
**开发时间**: ~1 小时
**主要贡献**: UI布局优化、玻璃拟态设计、动画效果增强
**当前状态**: 已部署测试，效果良好

---

---

## 2026-03-24 Bug 修复：权限卡片位置与工具错误状态

### 🐛 Bug 1：权限卡片位置错误

**问题描述：**
权限请求卡片显示在消息顶部，而不是对应的工具调用下方。

**期望效果：**
```
[思考块]
[文本内容]
🔧 websearch_web_search_exa ⏳  ← 工具调用
🔐 权限请求  ← 应该在工具卡片下方
```

**问题根源：**
- `streamingContentEl` 指向 `textEl`（文本元素）
- 工具调用直接渲染到 `messageEl`（消息元素）
- 权限卡片被插入到 `textEl`，导致顺序错误

**修复方案：**
```typescript
// 使用 messageEl 查找工具调用
const messageEl = this.streamingMessageEl;
const lastToolCall = messageEl.querySelector('.streaming-tool-call:last-of-type');

// 将权限卡片插入到工具调用之后
if (lastToolCall && lastToolCall.parentNode) {
  lastToolCall.parentNode.insertBefore(permissionCard, lastToolCall.nextSibling);
}
```

---

### 🐛 Bug 2：工具错误状态不显示红色×

**问题描述：**
工具调用返回错误时（如 timeout、权限被拒绝），状态图标显示绿色勾而不是红色×。

**问题根源：**
1. OpenCodeService 发送 `tool_result` 时没有包含 `isError` 字段
2. `convertToStreamingChunk` 转换时没有传递 `isError` 字段
3. StreamController 默认将没有 `isError` 的结果视为 `completed`

**修复方案：**

**1. OpenCodeService.ts - SSE 流处理**
```typescript
yield {
  type: 'tool_result',
  toolUseId: toolId,
  content: part.state.error ? `Error: ${part.state.error}` : (part.state.output ?? ''),
  isError: !!part.state.error,  // ← 添加错误标记
};
```

**2. OpenCodeService.ts - 历史消息加载**
```typescript
} else if (state.status === 'completed') {
  chunks.push({
    type: 'tool_result',
    toolUseId: toolPart.callID ?? '',
    content: state.output ?? '',
    isError: false,  // ← 明确标记成功
  });
} else if (state.status === 'error') {
  chunks.push({
    type: 'tool_result',
    toolUseId: toolPart.callID ?? '',
    content: `Error: ${state.error}`,
    isError: true,  // ← 明确标记错误
  });
}
```

**3. OpenCodianView.ts - 类型转换**
```typescript
case 'tool_result':
  return {
    type: 'tool_result',
    id: chunk.toolUseId,
    content: chunk.content,
    isError: chunk.isError,  // ← 传递错误标记
  };
```

**状态图标映射：**
| 状态 | 图标 | 颜色 |
|------|------|------|
| `completed` | ✓ check | 绿色 |
| `error` | ✗ x | 红色 |
| `running` | ⟳ loader | 橙色（旋转） |

---

### 📁 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/features/chat/OpenCodianView.ts` | 权限卡片插入位置修复、添加 `isError` 传递 |
| `src/core/opencode/OpenCodeService.ts` | SSE 流和历史消息加载添加 `isError` 字段 |

---

### 🎯 当前状态

**Bug 修复：**
- ✅ 权限卡片显示在对应工具调用下方
- ✅ 工具错误状态正确显示红色×图标
- ✅ 工具成功状态显示绿色勾图标

---

**会话日期**: 2026-03-24
**开发时间**: ~1 小时
**主要贡献**: Bug 修复：权限卡片位置、工具错误状态图标
**当前状态**: 已部署测试

---

---

## 2026-03-23 UI 优化与功能完善

### 🧹 代码清理：移除不必要的控制台日志

#### 清理范围
移除了约 70 处调试日志，保留错误和警告日志：

**保留的日志（有用信息）：**
- `console.error` - 错误处理日志
- `console.warn` - 警告日志

**移除的日志文件：**
- `src/main.ts` - 4 条
- `src/features/settings/OpenCodianSettings.ts` - 6 条
- `src/core/opencode/ServerManager.ts` - 7 条
- `src/utils/streaming/StreamController.ts` - 5 条
- `src/core/opencode/OpenCodeService.ts` - 38 条
- `src/features/chat/OpenCodianView.ts` - 7 条

### 🐛 修复历史会话显示问题

#### 问题描述
重新启动 Obsidian 后，以前会话的 thinking 和工具调用显示消失，只剩下一个空白框。

#### 根本原因
历史消息加载时只提取了 `type === 'text'` 的部分，没有处理 thinking 和 tool 部分。

#### 解决方案

**1. 更新 `openCodeMessageToChatMessage()` 方法**
- 添加对 `type === 'reasoning'` 部分的提取（thinking 内容）
- 构建 `contentBlocks` 数组，包含 thinking、tool_use、tool_result、text 块

**2. 新增 `renderContentBlock()` 方法**
使用与实时会话相同的渲染器：
- `ThinkingBlockRenderer.renderStored()` - 渲染可折叠的 thinking 块
- `ToolCallRenderer.render()` - 渲染工具调用卡片

**3. 更新 `renderMessage()` 方法**
- 支持完整的 `ChatMessage` 类型
- 如果存在 `contentBlocks`，按顺序渲染每个块

### 🎨 Header 样式更新

#### 新增功能
- 浅色主题显示深色 logo，深色主题显示浅色 logo
- 根据 `.theme-dark` 类自动切换
- 监听 `css-change` 事件，主题切换时自动更新

#### 修改内容
- 添加 `LOGO_SVG_LIGHT` 和 `LOGO_SVG_DARK` 常量
- 添加 `getLogoSvg()` 方法检测当前主题
- 更新 CSS 样式适配新的 logo 尺寸

### 💬 消息界面优化

#### 1. 移除头像
用户和 AI 消息都不再显示头像图标，界面更简洁。

#### 2. 融合背景样式
- 用户消息：深色半透明气泡 (`rgba(0, 0, 0, 0.3)`)，右对齐
- AI 消息：透明背景，与 Obsidian 背景融合

#### 3. 文本选择支持
- 添加 `user-select: text` 支持鼠标选择文本
- 用户消息中选中文本有白色半透明高亮

#### 4. 整体界面融合
- 容器背景改为透明
- Header 移除边框和背景色
- 输入区域移除顶部边框

### ⏹️ 停止按钮功能

#### 功能描述
发送消息后，按钮自动变为红色停止按钮，点击可中止流式响应。

#### 实现细节

**1. OpenCodeService 修改**
- 添加 `currentAbortController` 跟踪当前流
- 添加 `cancelStream()` 公共方法中止 SSE 连接
- 在生成器循环中检查 `signal.aborted` 状态

**2. OpenCodianView 修改**
- 存储 `sendBtn` 和 `inputTextarea` 引用
- 添加 `updateSendButtonState()` 方法切换按钮状态
- `cancelStreaming()` 调用服务取消方法

**3. 按钮状态切换**
- 空闲时：蓝色背景 + 发送图标
- 流式中：红色背景 + 方块图标（停止）

#### 调试日志
添加详细日志用于验证功能：
```
[OpenCodianView] cancelStreaming called, isStreaming: true
[OpenCodeService] Cancelling stream...
[OpenCodeService] Abort signal sent
[OpenCodianView] Streaming cancelled, breaking loop
```

### 📊 测试结果
- ✅ 历史会话 thinking 正确显示
- ✅ 历史会话工具调用正确显示
- ✅ Logo 随主题自动切换
- ✅ 消息文本可选择复制
- ✅ 停止按钮可中止流式响应

### 📝 涉及文件
- `src/core/opencode/OpenCodeService.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/utils/streaming/ThinkingBlockRenderer.ts`
- `src/utils/streaming/ToolCallRenderer.ts`
- `styles.css`

---

**会话日期**: 2026-03-23
**开发时间**: ~3 小时
**主要贡献**: UI 优化、功能完善、代码清理
**当前状态**: ✅ 所有功能正常工作

---

---

## 2026-03-23 工具调用显示修复

### 🐛 问题描述
用户报告工具调用在会话中不显示。虽然 AI 实际调用了工具（如 web_search、bash、read 等），但前端界面中没有呈现工具调用的卡片。

### 🔍 根因分析
通过分析日志文件 `obsidian.md-1774267116377.log`，发现问题出在 `OpenCodeService.ts` 的 SSE 事件处理逻辑中：

1. **代码逻辑错误**: `message.part.updated` 事件有两个处理块
   - 第一个处理块（第 467 行）跟踪 part 类型后使用 `continue` 跳过循环
   - 第二个处理块（原第 513 行）包含工具调用处理逻辑，但**永远不会被执行**

```typescript
// 第一个处理块 - 执行后会 continue 跳过
if (eventData.type === 'message.part.updated') {
  // ... 跟踪 part 类型
  continue;  // ← 这里直接跳过了！
}

// 第二个处理块 - 永远不会执行
if (eventData.type === 'message.part.updated') {
  // 处理 tool 的逻辑在这里...
}
```

2. **数据结构确认**: OpenCode Server 发送的工具调用事件格式如下：
```json
{
  "type": "message.part.updated",
  "properties": {
    "part": {
      "id": "prt_xxx",
      "type": "tool",
      "callID": "call_xxx",
      "tool": "web_search",
      "state": {
        "status": "running",
        "input": { "query": "today's date" }
      }
    }
  }
}
```

### ✅ 修复方案

#### 1. 合并工具处理逻辑
将工具调用处理逻辑合并到第一个 `message.part.updated` 处理块中：

```typescript
if (eventData.type === 'message.part.updated') {
  const part = eventData.properties?.part;
  if (part?.id && part?.type) {
    this.partTypeMap.set(part.id, part.type);
    
    // 处理工具调用
    if (part.type === 'tool') {
      const toolId = part.callID || part.id;
      const toolName = part.tool || 'unknown';
      if (toolId) {
        // 新工具调用
        if (!processedToolIds.has(toolId)) {
          processedToolIds.add(toolId);
          yield { 
            type: 'tool_use', 
            id: toolId, 
            name: toolName, 
            input: part.state?.input || {}
          };
        }
        
        // 工具结果
        if (part.state?.output || part.state?.error) {
          // yield tool_result...
        }
      }
    }
  }
  continue;
}
```

#### 2. 删除冗余代码块
移除永远不会执行的第二个 `message.part.updated` 处理块。

### 🧪 调试过程
为确认修复效果，添加了详细的调试日志：
- `[OpenCodeService] message.part.updated - part:` - 显示 part 对象结构
- `[OpenCodeService] Tool part detected!` - 确认检测到工具类型
- `[StreamController] Rendering tool:` - 确认渲染执行

通过日志验证，工具调用已正确 yield 并传递给 `StreamController`，`ToolCallRenderer` 成功渲染了工具卡片。

### 📊 测试结果
修复后，工具调用正常显示：
- ✅ `task` 工具 - 显示任务进度
- ✅ `glob` 工具 - 显示文件搜索
- ✅ `grep` 工具 - 显示文本搜索
- ✅ `ast_grep_search` 工具 - 显示代码搜索

工具卡片显示为可折叠的 UI 组件：
```
┌─────────────────────────────────────┐
│ 🔧 web_search │ "query" │ ⏳ │
├─────────────────────────────────────┤
│ Waiting for result...               │
└─────────────────────────────────────┘
```

### 📝 代码清理
修复验证完成后，清理了所有调试日志：
- 删除了 `OpenCodeService.ts` 中的 5 处调试日志
- 删除了 `StreamController.ts` 中的 3 处调试日志

### 🎯 技术要点
1. **SSE 事件处理**: OpenCode Server 使用 `message.part.updated` 事件通知工具状态变化
2. **工具生命周期**: 工具调用经历 `pending` → `running` → `completed/error` 状态
3. **渲染流程**: 
   - `OpenCodeService` 解析 SSE 事件 → yield `tool_use` chunk
   - `StreamController` 接收 chunk → 调用 `ToolCallRenderer.render()`
   - `ToolCallRenderer` 创建 DOM 元素 → 显示工具卡片

---

**会话日期**: 2026-03-23
**开发时间**: ~2 小时
**主要贡献**: 修复工具调用显示问题，清理调试日志
**涉及文件**: 
- `src/core/opencode/OpenCodeService.ts`
- `src/utils/streaming/StreamController.ts`

**当前状态**: ✅ 工具调用显示功能完整，支持 task/glob/grep/ast_grep_search 等多种工具

---

---

## 2026-03-23 Bug修复：SSE流结束后无法发送新消息

### 🔧 问题分析

**现象：**
- 第一条消息流式输出正常
- 回复完成后，无法再发送新消息
- `isStreaming` 状态保持为 `true`，阻止了新消息发送

**根本原因：**
1. `fetch` 请求没有使用 `signal` 参数，导致 `abortController.abort()` 无法真正取消连接
2. `reader.read()` 在某些情况下可能挂起，导致 `for await...of` 循环无法退出
3. `finally` 块无法执行，`isStreaming` 状态无法重置

### ✅ 修复方案

**1. OpenCodianView.ts - 添加超时保护机制**
```typescript
// Set up timeout as safety net to reset isStreaming
const STREAM_TIMEOUT_MS = 120000; // 2 minutes timeout
let timeoutId: number | null = null;
const resetStreamingState = () => {
  if (timeoutId) {
    window.clearTimeout(timeoutId);
    timeoutId = null;
  }
  this.isStreaming = false;
};

timeoutId = window.setTimeout(() => {
  console.warn('[OpenCodianView] Stream timeout, forcing state reset');
  resetStreamingState();
  // ...
}, STREAM_TIMEOUT_MS);
```

**2. OpenCodeService.ts - 修复 SSE 连接取消逻辑**
```typescript
// 将 signal 传递给 fetch
const response = await fetch(url, {
  method: 'GET',
  headers: { 'Accept': 'text/event-stream' },
  signal, // 允许通过 abortController 取消请求
});

// 改进错误处理
try {
  readResult = await reader.read();
} catch (readError) {
  if (signal?.aborted || aborted) {
    break; // 优雅地处理取消
  }
  throw readError;
}
```

### 📝 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/features/chat/OpenCodianView.ts` | 添加超时机制，确保 `isStreaming` 总能被重置 |
| `src/core/opencode/OpenCodeService.ts` | 修复 `fetch` 信号传递，改进 `reader.read()` 错误处理 |

---

## 🎯 下一步建议

1. ~~**修复 SSE 流状态问题**~~ ✅ 已完成
2. **消息历史持久化** - 在插件端缓存消息历史，减少对服务器的依赖
2. **消息历史持久化** - 在插件端缓存消息历史，减少对服务器的依赖
3. **错误重试机制** - 网络错误时自动重试
4. **消息编辑/删除** - 添加消息管理功能
5. **文件附件** - 支持上传文件到对话
6. **代码块高亮** - 优化消息中代码的显示

---

**会话日期**: 2026-03-23
**开发时长**: ~4 小时
**主要贡献**: SSE 流式响应架构实现、CORS 配置、事件解析、流状态管理修复

**当前状态**: ✅ SSE 流式传输功能完整，支持连续发送多条消息

---

---

## 2026-03-23 SSE 流式响应重构（进行中）

### 🚧 重构目标
将原有的轮询式消息获取改为真正的 Server-Sent Events (SSE) 流式响应，实现逐字输出的真实流式效果。

### ✅ 已完成工作

#### 1. SSE 连接建立
**实现内容：**
- 使用原生 `fetch` + `ReadableStream` 实现 SSE 连接
- 连接 OpenCode `/event` 端点获取实时事件流
- 支持手动中断连接（`reader.cancel()`）

**代码变更：**
```typescript
// src/core/opencode/OpenCodeService.ts
private async *connectSSE(url: string, signal?: AbortSignal): AsyncGenerator<SSEEvent> {
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'text/event-stream' },
  });
  
  const reader = response.body!.getReader();
  // ... 读取和处理 SSE 数据
}
```

#### 2. SSE 数据解析
**实现内容：**
- 实现 `parseSSEEvents()` 方法解析 SSE 格式
- 处理 OpenCode 的特殊格式（只有 `data:` 行，无 `event:` 行）
- 从 JSON `type` 字段提取事件类型

**关键发现：**
```
OpenCode SSE 格式：
data: {"type":"message.part.delta","properties":{...}}

标准 SSE 格式：
event: message.part.delta
data: {"properties":{...}}
```

**修复：**
```typescript
// 当没有 event 类型时，从 JSON 中提取
if (!currentEvent.event && currentEvent.data) {
  try {
    const parsed = JSON.parse(currentEvent.data);
    currentEvent.event = parsed.type || 'unknown';
  } catch {
    currentEvent.event = 'unknown';
  }
}
```

#### 3. 事件类型处理
**支持的事件类型：**
| 事件类型 | 处理方式 | 说明 |
|---------|---------|------|
| `message.part.updated` | 跟踪 part 类型 | 记录 partID → 类型的映射 |
| `message.part.delta` | 流式输出 | 根据 part 类型输出 thinking/text |
| `session.idle` | 终止连接 | 消息完成信号 |
| `server.heartbeat` | 忽略 | 保持连接的心跳 |
| `server.connected` | 忽略 | 初始连接确认 |

**关键逻辑：**
```typescript
// 跟踪 part 类型
if (eventData.type === 'message.part.updated') {
  const part = eventData.properties?.part;
  if (part?.id && part?.type) {
    this.partTypeMap.set(part.id, part.type);
  }
}

// 处理流式内容
if (eventData.type === 'message.part.delta') {
  const partType = this.partTypeMap.get(props.partID);
  if (partType === 'reasoning') {
    yield { type: 'thinking', content: props.delta };
  } else {
    yield { type: 'text', content: props.delta };
  }
}
```

#### 4. CORS 配置
**问题：**
- Obsidian 使用 `app://obsidian.md` 和 `app://obsidian` 协议
- 浏览器拒绝跨域请求

**解决方案：**
```typescript
// src/core/opencode/ServerManager.ts
this.process = spawn(opencodePath, [
  'serve',
  '--port', String(this.config.port),
  '--hostname', this.config.host,
  '--cors', 'app://obsidian.md',
  '--cors', 'app://obsidian',
], {
  detached: false,
  stdio: ['ignore', 'pipe', 'pipe'],
});
```

#### 5. 连接中断机制
**实现内容：**
- 使用 `AbortSignal` 传递中断信号
- 检测到 `session.idle` 时主动中断连接
- 使用 `reader.cancel()` 中断阻塞的 `read()` 调用

**代码：**
```typescript
// 检测到消息完成
if (eventData.type === 'session.idle') {
  console.log('[OpenCodeService] Session idle, message complete');
  abortController.abort();
  break; // 退出 SSE 循环
}

// 中断处理
const abortHandler = () => {
  aborted = true;
  void reader.cancel();
};
signal?.addEventListener('abort', abortHandler);
```

### ✅ 已修复：流结束后无法发送新消息

**问题现象：**
- 第一条消息流式输出正常
- 回复完成后，点击发送按钮无反应
- 控制台无错误日志

**排查过程：**
1. ✅ 确认 `isStreaming` 状态重置逻辑存在（`finally` 块）
2. ✅ 确认 `session.idle` 事件正确处理并 break
3. ✅ 确认 `abortController.abort()` 正确中断 SSE 连接

**根因分析：**
- 通过添加详细调试日志，确认 `session.idle` 事件被正确接收和处理
- SSE 循环正确 break，`finally` 块正确执行
- `isStreaming` 状态正确重置

**验证日志：**
```
[OpenCodeService] SSE event: session.idle
[OpenCodeService] session.idle event passed filter, properties: {"sessionID":"..."}
[OpenCodeService] Session idle detected, breaking loop...
[OpenCodeService] Session idle, message complete
[OpenCodeService] Abort signal received, cancelling reader...
[OpenCodeService] SSE reader released
[OpenCodianView] Converting chunk: message_stop
[StreamController] handleChunk: done
[OpenCodianView] Streaming state reset  ← 状态正确重置
```

**添加的调试日志：**
```typescript
// OpenCodeService.ts - session 过滤器
if (eventData.properties?.sessionID && eventData.properties.sessionID !== sessionId) {
  console.log('[OpenCodeService] Skipping event for different session...');
  continue;
}

// session.idle 处理
if (eventData.type === 'session.idle') {
  console.log('[OpenCodeService] Session idle detected, breaking loop...');
  console.log('[OpenCodeService] Session idle, message complete');
  abortController.abort();
  break;
}
```

### 📁 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/core/opencode/OpenCodeService.ts` | 实现 SSE 连接、数据解析、事件处理 |
| `src/core/opencode/ServerManager.ts` | 添加 CORS 配置参数 |
| `src/features/chat/OpenCodianView.ts` | 添加异常处理，确保流结束 |

### 📝 下一步计划

1. ~~**验证连接中断**~~ ✅ 已验证，SSE 流正常工作
2. **清理调试日志** - 移除不必要的详细日志（保留关键日志）
3. **完善功能**
   - 添加连接状态指示器
   - 实现取消按钮（中断当前流）
   - 消息历史持久化到本地

---

## 2026-03-23 SDK 依赖评估与移除

### 📋 背景
项目中声明了 `@opencode-ai/sdk` 作为依赖，但实际代码完全没有使用它。项目自己实现了 HTTP 请求层和 SSE 流解析。本次评估决定是否使用官方 SDK 替代手动实现。

### 🔍 调研过程

#### 1. 对比参考项目与安装版本
- **参考项目** (`reference-projects/opencode-sdk-js`): v0.1.0-alpha.21
  - 使用 `Opencode` 类
  - 方法返回直接的 Promise，如 `await client.session.create()` 返回 `Session`
  - 支持流式事件 `client.event.list()`

- **npm 安装版本**: v1.2.27
  - 使用 `createOpencodeClient()` 或 `OpencodeClient`
  - 所有方法返回 `{ data, error, request, response }` 包装对象
  - API 结构完全不同

#### 2. API 差异示例
```typescript
// 参考项目 (v0.1.0-alpha.21)
const session = await client.session.create();
// session 直接是 Session 对象

// 安装版本 (v1.2.27)
const result = await client.session.create();
// result = { data: Session | undefined, error: APIError | undefined, request, response }
// 需要检查 result.data 或 result.error
```

#### 3. 评估结论
- 官方 SDK 版本差异过大，无法直接迁移
- 当前手动实现已经稳定工作，没有迁移的必要
- 移除未使用的依赖可以减少包体积

### ✅ 执行操作

#### 移除 SDK 依赖
```bash
npm uninstall @opencode-ai/sdk
```

#### 修复 TypeScript 类型错误
在 `OpenCodeService.ts` 中补充缺失的类型定义：
```typescript
interface OpenCodeEvent {
  type: string;
  properties: {
    // ... 已有属性
    delta?: string;
    field?: string;      // 新增
    partID?: string;     // 新增
    toolID?: string;
    result?: string;
    error?: string;
  };
}
```

#### 修复空值处理
```typescript
// partID 可能为 undefined 时的 Map 操作
if (partID && !this.partTypeMap.has(partID)) {
  const partType = eventData.properties?.part?.type;
  this.partTypeMap.set(partID, partType || 'text');
}
const partType = partID ? (this.partTypeMap.get(partID) || 'text') : 'text';

// tool output 可能为 undefined
content: part.state.error
  ? `Error: ${part.state.error}`
  : (part.state.output ?? ''),
```

#### 更新 tsconfig.json
排除 `reference-projects` 目录避免编译错误：
```json
{
  "exclude": [
    "node_modules",
    "tests",
    "reference-projects"
  ]
}
```

### 📁 修改文件

| 文件 | 修改内容 |
|------|----------|
| `package.json` | 移除 `@opencode-ai/sdk` 依赖 |
| `package-lock.json` | 更新锁定文件 |
| `src/core/opencode/OpenCodeService.ts` | 修复类型定义和空值处理 |
| `tsconfig.json` | 排除 reference-projects |

### 🏁 结果
- Git 分支 `refactor/use-sdk` 已合并到 `main`
- 构建成功，已部署到测试环境
- 项目继续使用自定义 HTTP 实现，代码更简洁

---

## 2026-03-19 Bug修复：消息显示与工具调用超时

### 🔧 修复消息无法正常显示的问题

**问题现象：**
- AI 回复的消息在 UI 中无法正常显示
- 日志显示消息已获取，但流提前退出
- 控制台显示 `[OpenCodeService] Exiting - content stable`，但内容为空

**根本原因：**
```typescript
// 原代码中的退出条件过于严格
const hasSubstantialContent = lastContent.length > 100;  // 需要超过100字符
const requiredStableCount = 8;  // 需要稳定8次轮询
```
- 如果 AI 回复短（少于100字符），`hasSubstantialContent` 永远为 false
- 轮询会持续到 `maxAttempts`（300次），用户长时间看不到内容

**解决方案：**
1. 放宽退出条件：只要有任何内容（`> 0` 字符）即可退出
2. 降低稳定计数要求：从 8 次降低到 5 次
3. 添加兜底条件：50次轮询后无论是否有内容都退出

```typescript
const hasAnyContent = lastContent.length > 0 || lastThinkingContent.length > 0;
const requiredStableCount = toolsPending ? 15 : 5;

if (stableCount >= requiredStableCount && (hasAnyContent || attempts > 50) && !toolsPending) {
  console.log('[OpenCodeService] Exiting - content stable');
  break;
}
```

**涉及文件：**
- `src/core/opencode/OpenCodeService.ts`

---

### ⏱️ 添加工具调用超时机制

**问题现象：**
- 某些工具（如 `websearch_web_search_exa`）长时间处于 `running` 状态
- 工具一直不返回结果，导致流永远无法退出
- 用户界面显示转圈，但永远无法收到最终回复

**根本原因：**
- OpenCode 的工具调用是异步的
- 某些工具可能因为网络问题或 API 错误永远卡住
- 没有超时机制导致无限等待

**解决方案：**
添加工具调用超时检测（60秒）：

```typescript
// Track tool start times for timeout detection
const toolStartTimes = new Map<string, number>();
const TOOL_TIMEOUT_MS = 60000; // 60 seconds timeout

// 记录工具开始时间
if (!processedToolIds.has(toolId)) {
  toolStartTimes.set(toolId, Date.now());
  // ...
}

// 检测超时工具
const timedOutTools: string[] = [];
for (const toolId of pendingToolIds) {
  const startTime = toolStartTimes.get(toolId);
  if (startTime && (now - startTime) > TOOL_TIMEOUT_MS) {
    console.log(`[OpenCodeService] Tool ${toolId} timed out`);
    timedOutTools.push(toolId);
  }
}

// 将超时工具标记为完成（带错误信息）
for (const toolId of timedOutTools) {
  yield {
    type: 'tool_result',
    toolUseId: toolId,
    content: 'Error: Tool execution timed out after 60 seconds',
  };
}
```

**超时处理流程：**
1. 新工具调用时记录开始时间
2. 每次轮询检查是否有工具超过 60 秒
3. 超时工具自动标记为完成，返回超时错误
4. 流可以继续退出，显示已获取的内容

**涉及文件：**
- `src/core/opencode/OpenCodeService.ts`

---

### ✅ 修复验证

**测试场景：**
- 发送消息"搜索今日时事新闻"
- AI 调用多个搜索工具
- 其中一个工具卡住（websearch_web_search_exa）

**修复前：**
- 工具一直显示 running，无法退出
- 用户看不到任何回复内容

**修复后：**
- 60秒后超时工具自动标记为错误
- 流正常退出，显示 AI 的完整回复
- 控制台显示：`Tool xxx timed out after 60000ms`

---

## 2026-03-19 功能实现与改进

本次会话完成了 OpenCodian 插件的核心功能实现和多项重要改进。

---

## ✅ 已完成的功能 (补充)

### 7. 历史会话菜单功能

**实现内容：**
- 点击历史会话按钮（history icon）弹出下拉菜单
- 显示所有历史会话列表，按更新时间排序
- 当前会话标记为 `(current)` 并显示勾选图标
- 点击任意会话即可切换到该会话
- 支持删除当前会话或删除所有会话（带确认对话框）
- 鼠标悬停显示会话创建日期

**涉及文件：**
- `src/features/chat/OpenCodianView.ts` - 菜单实现和会话切换逻辑

**技术细节：**
- 使用 Obsidian 的 `Menu` 组件创建下拉菜单
- 菜单项包含：
  - 会话列表（带图标和当前状态标记）
  - 分隔线
  - 删除当前会话
  - 删除所有会话（当会话数 > 1 时显示）
- 删除会话后自动加载剩余会话或创建新会话
- 使用 `confirm()` 对话框防止误删除

**示例交互：**
```
┌─────────────────────────┐
│ 🗨️ 会话 1               │
│ ✓ 会话 2 (current)      │
│ 🗨️ 会话 3               │
│ ─────────────────────── │
│ 🗑️ Delete current       │
│ 🗑️ Delete all           │
└─────────────────────────┘
```

### 8. Markdown 渲染支持

**实现内容：**
- 集成 `MarkdownRenderService` 到聊天界面
- AI 助手消息使用完整的 Markdown 渲染
- 支持代码块高亮（含语言标签和复制按钮）
- 支持图片嵌入 `![[image.png]]`
- 支持文件链接 `[[note]]`
- 支持表格、列表、引用等标准 Markdown 语法
- 流式响应实时 Markdown 渲染

**涉及文件：**
- `src/features/chat/OpenCodianView.ts` - 集成 Markdown 渲染服务
- `styles.css` - 添加 Markdown 渲染样式

**技术细节：**
- 使用 Obsidian 原生 `MarkdownRenderer` API
- 三阶段渲染流程：
  1. 预处理：`replaceImageEmbedsWithHtml` 处理图片嵌入
  2. 核心渲染：`MarkdownRenderer.renderMarkdown()`
  3. 后处理：`processFileLinks` 处理文件链接 + `enhanceCodeBlocks` 增强代码块
- 用户消息保持纯文本显示
- 创建独立的 `Component` 管理生命周期，避免内存泄漏

**渲染功能：**
| 功能 | 状态 |
|------|------|
| 代码块 + 语法高亮 | ✅ |
| 行内代码 | ✅ |
| 图片嵌入 `![[]]` | ✅ |
| 文件链接 `[[ ]]` | ✅ |
| 表格 | ✅ |
| 列表（有序/无序） | ✅ |
| 引用块 | ✅ |
| 标题 H1-H6 | ✅ |
| 水平分割线 | ✅ |
| 链接 | ✅ |

### 9. 流式内容渲染模块

**实现内容：**
- 创建通用流式渲染模块，支持思考块、文本、工具调用三种内容类型
- 思考块（thinking）：可折叠 + 实时计时器，默认收起
- 文本块（text）：支持 Markdown 实时渲染
- 工具调用（tool_call）：状态图标 + 可展开结果
- 支持流式数据块的增量处理和渲染
- 支持历史消息的内容块恢复渲染

**涉及文件：**
- `src/utils/streaming/` - 流式渲染模块目录
  - `types.ts` - 类型定义
  - `StreamController.ts` - 核心流式控制器
  - `ThinkingBlockRenderer.ts` - 思考块渲染器
  - `ToolCallRenderer.ts` - 工具调用渲染器
  - `index.ts` - 导出入口
  - `README.md` - 使用文档
- `styles.css` - 流式内容样式

**技术细节：**
- 三阶段内容块处理流程：
  1. `startStream()` - 创建消息容器，初始化状态
  2. `handleChunk()` - 处理各种类型的数据块
     - `thinking` → 创建/更新思考块，实时计时
     - `text` → Markdown 渲染
     - `tool_use/tool_result` → 工具调用渲染和结果更新
  3. `finalize()` - 保存 contentBlocks，触发回调
- 使用 `ContentBlock[]` 数组持久化消息内容
- 支持自定义工具图标、名称、摘要和结果渲染

**API 示例：**
```typescript
import { StreamController } from '@/utils/streaming';

const streamController = new StreamController({
  containerEl: messagesContainer,
  markdownService,
  onStreamComplete: (blocks) => saveMessage(blocks),
  scrollToBottom: () => scrollToBottom(),
});

// 开始流
streamController.startStream(contentEl);

// 处理数据块
for await (const chunk of stream) {
  await streamController.handleChunk(chunk);
}

// 恢复历史
streamController.renderStoredContentBlocks(parentEl, savedBlocks);
```

**内容块类型：**
| 类型 | 特性 |
|------|------|
| thinking | 可折叠，实时计时，默认收起 |
| text | Markdown 渲染 |
| tool_call | 状态图标（pending/running/completed/error），可展开结果 |

### 10. 会话内模型切换

**实现内容：**
- 移除 "Model: " 文本标签，仅保留下拉框
- 下拉框直接显示当前使用的模型名称（格式：Provider/Model）
- 鼠标悬停1秒后显示完整模型信息提示
- 支持下拉选择其他模型，仅影响当前会话
- 切换模型后发送的消息使用新模型
- 每个会话独立保存模型覆盖设置

**涉及文件：**
- `src/features/chat/OpenCodianView.ts` - 模型选择器实现
- `styles.css` - 选择器样式优化

**技术细节：**
- 使用 `Map<string, {provider, model}>` 存储每个会话的模型覆盖
- 模型选择优先级：会话覆盖 > 默认设置
- 从 OpenCode 服务动态加载可用模型列表
- 切换会话时自动更新选择器显示当前会话的模型

**示例交互：**
```
┌────────────────────────────┐
│ anthropic/claude-3-5-...  ▼│  <- 下拉框显示当前模型
└────────────────────────────┘
鼠标悬停1秒后显示：Using: anthropic/claude-3-5-sonnet-20241022
```

---

## ✅ 已完成的功能

### 1. 国际化支持 (i18n)

**实现内容：**
- 创建了完整的双语翻译系统
- 支持英文 (`en`) 和简体中文 (`zh`)
- 所有设置界面文本已翻译
- 新增语言选择设置项

**涉及文件：**
- `src/i18n/index.ts` - 国际化核心模块
- `src/i18n/locales/en.ts` - 英文翻译
- `src/i18n/locales/zh.ts` - 中文翻译
- `src/features/settings/OpenCodianSettings.ts` - 集成翻译
- `src/main.ts` - 初始化语言设置

### 2. 动态供应商/模型选择

**实现内容：**
- 从 OpenCode 服务器动态获取可用供应商列表
- 根据选择的供应商动态加载可用模型
- 修复模型数据格式兼容性（支持字符串数组和对象两种格式）
- 模型选择后正确保存到设置

**涉及文件：**
- `src/core/opencode/OpenCodeService.ts` - `getAvailableModels()` 方法
- `src/features/settings/OpenCodianSettings.ts` - 动态下拉菜单实现

**技术细节：**
- API 端点：`GET /config/providers`
- 处理两种 models 格式：
  - 格式1: `models: ["gpt-4", "gpt-3.5-turbo"]` (字符串数组)
  - 格式2: `models: { "model-id": { name: "..." } }` (对象)

### 3. 服务器状态检测与外部服务器识别

**实现内容：**
- 实时检测服务器运行状态（每2秒自动刷新）
- 区分插件启动的服务器和外部独立运行的服务器
- 添加 🟢/🔴 状态指示灯
- 外部服务器显示特殊标记并禁用停止按钮

**涉及文件：**
- `src/features/settings/OpenCodianSettings.ts` - 状态显示逻辑
- `src/core/opencode/ServerManager.ts` - 健康检查端点修复

**技术细节：**
- 修复健康检查端点：`/global/health`（原 `/health` 错误）
- 状态检测逻辑：
  - 健康检查通过 + 内部进程存在 = 运行中（可停止）
  - 健康检查通过 + 无内部进程 = 外部服务器（不可停止）

### 4. 会话功能修复

**问题修复：**

#### 问题1：会话ID错误导致500错误
**原因：**
- 保存会话时未存储 `openCodeSessionId`
- 加载会话时错误地使用对话ID作为 session ID
- 导致调用 `/session/{wrong-id}/message` 返回500

**解决方案：**
- 更新 `ConversationMeta` 类型，添加 `openCodeSessionId` 字段
- 修复 `StorageService.saveConversation()` 保存正确的 session ID
- 修复 `loadConversations()` 正确读取 `openCodeSessionId`

**涉及文件：**
- `src/core/types/chat.ts`
- `src/core/storage/StorageService.ts`
- `src/main.ts`

#### 问题2：消息获取端点错误
**修复内容：**
- 端点从 `/session/:id/messages` 改为 `/session/:id/message`（单数形式）
- 修复 `sendMessage()` 使用 `/prompt_async` 异步端点

**涉及文件：**
- `src/core/opencode/OpenCodeService.ts`

### 5. 消息流式响应优化

**实现内容：**
- 修复轮询逻辑，持续轮询直到获取完整回复
- 支持增量更新，实时显示AI回复
- 改进超时处理（120秒超时）
- 添加详细调试日志

**涉及文件：**
- `src/core/opencode/OpenCodeService.ts` - `sendMessage()` 方法
- `src/features/chat/OpenCodianView.ts` - 消息渲染

**技术细节：**
- 轮询间隔：1秒
- 最大尝试次数：120次（2分钟）
- 检测到助手消息后，持续轮询直到内容不再变化

### 6. 模型切换生效修复

**问题：**
- 设置中选择 glm-4.6，实际使用 glm-5
- 请求体格式错误导致模型参数未生效

**修复内容：**
- 修正请求体格式为嵌套结构：
```json
{
  "parts": [...],
  "model": {
    "providerID": "zhipu-external",
    "modelID": "glm-4.6"
  }
}
```

**涉及文件：**
- `src/core/opencode/OpenCodeService.ts`

---

## 🔧 API 端点修正记录

| 功能 | 错误端点 | 正确端点 |
|------|----------|----------|
| 健康检查 | `/health` | `/global/health` |
| 获取消息 | `/session/:id/messages` | `/session/:id/message` |
| 发送消息 | `/session/:id/prompt` | `/session/:id/prompt_async` |
| 获取模型 | `/config/providers` | `/config/providers` ✅ |

---

## 📝 调试日志添加

为以下模块添加了详细控制台日志：

1. **OpenCodeService**
   - 会话创建：`[OpenCodeService] Creating session`, `Created session ID`
   - 消息发送：`[OpenCodeService] Sending message`, `Message sent successfully`
   - 消息获取：`[OpenCodeService] Getting messages`, `Messages response`
   - 模型获取：`[OpenCodeService] Raw providers data`

2. **OpenCodianView**
   - 消息流：`[OpenCodianView] Message stream started/stopped`
   - 内容接收：`[OpenCodianView] Received chunk`
   - 最终消息：`[OpenCodianView] Final message`

3. **Settings**
   - 模型加载：`[Settings] Current defaultModel`
   - 模型切换：`[Settings] Model changed to`, `Saved settings`

---

## 🐛 已知问题与解决方案

### 已修复的问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 消息加载 500 错误 | 使用了错误的会话ID | 正确存储和读取 `openCodeSessionId` |
| 端点 404 错误 | 端点路径错误（复数形式） | 改为单数形式 `/message` |
| 模型切换不生效 | 请求体格式错误 | 改为嵌套 `model` 对象格式 |
| 服务器状态显示错误 | 未检测外部服务器 | 添加外部服务器识别逻辑 |
| 模型列表为空 | 数据结构解析错误 | 支持两种 models 数据格式 |
| 历史会话按钮无效 | `showConversationHistory()` 为空实现 | 使用 `Menu` 组件实现完整下拉菜单 |

---

## 📊 当前功能状态

### ✅ 完全可用
- [x] 中文界面
- [x] 动态供应商/模型选择
- [x] 模型切换生效
- [x] 会话创建和管理
- [x] 发送消息
- [x] 实时流式响应
- [x] 服务器状态检测
- [x] 历史会话切换（点击 history 按钮弹出菜单）
- [x] Markdown 渲染（代码块、图片、链接、表格等）
- [x] 流式内容渲染（思考块、文本、工具调用）
- [x] 会话内模型切换（下拉框选择，悬停提示）

### 🚧 已知限制
- 外部服务器无法通过插件停止（需要手动在终端停止）
- 首次加载设置时需要手动刷新模型列表
- 消息历史依赖 OpenCode 服务器存储

---
