# OpenCodian 开发日志

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

## 🎯 下一步建议

1. **消息历史持久化** - 在插件端缓存消息历史，减少对服务器的依赖
2. **错误重试机制** - 网络错误时自动重试
3. **消息编辑/删除** - 添加消息管理功能
4. **文件附件** - 支持上传文件到对话
5. **代码块高亮** - 优化消息中代码的显示

---

## 📋 2026-03-19 开发进度更新

### 🚧 当前开发状态

#### 已完成的基础功能
1. **核心聊天功能** - 会话创建、消息发送、流式响应
2. **国际化支持** - 中英双语界面
3. **模型管理** - 动态加载供应商/模型，会话内切换
4. **服务器管理** - 状态检测、外部服务器识别
5. **历史会话** - 下拉菜单切换、删除管理
6. **Markdown 渲染** - 代码块、图片、链接、表格
7. **流式渲染模块** - 基础架构搭建完成

#### 正在开发的功能
**流式渲染模块集成**
- ✅ 模块架构：`StreamController`, `ThinkingBlockRenderer`, `ToolCallRenderer`
- ✅ TypeScript 类型定义
- ✅ CSS 样式（thinking 块、tool call、error 块）
- ✅ 基础渲染逻辑
- 🔄 **进行中**：OpenCode API 数据解析与转换

### 🐛 当前存在问题

#### 问题 1：工具调用和 Thinking 块显示异常
**现象**：
- 能收到 `thinking` chunk 并渲染
- 工具调用 chunk 能收到但没有正确显示
- 第二轮对话时内容截断

**根本原因**：
```
OpenCode API 返回的数据结构：
- part.type = 'text' | 'reasoning' | 'thinking' | 'tool'
- tool part 包含 callID, tool, state 字段
- 但工具执行后消息数不变（3条），说明是异步后台执行
```

**已尝试的解决方案**：
1. ✅ 扩展 chunk 类型支持（thinking, tool_use, tool_result）
2. ✅ 添加轮询时消息数量变化检测
3. ✅ 增加工具待完成时的等待逻辑
4. 🔄 **待验证**：工具 part 的解析逻辑

**调试状态**：
- 添加了详细的 `Processing part` 日志
- 需要验证工具 part 是否被正确识别

#### 问题 2：流式效果不自然
**现象**：
- 内容不是逐字出现，而是段落式更新
- OpenCode API 返回的是完整消息，不是 SSE 流

**根本原因**：
```
OpenCode /session/:id/message 端点返回完整消息数组
不是逐 token 的流式响应
需要模拟流式效果（分词 + 延迟）
```

**计划方案**：
1. 收到完整消息后，按字符/词组分割
2. 使用 `setTimeout` 模拟逐字输出效果
3. 保持 thinking 和 tool 的原子性（不拆分）

### 📁 已修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/core/opencode/OpenCodeService.ts` | 添加 thinking/tool 检测，轮询逻辑优化 |
| `src/features/chat/OpenCodianView.ts` | 集成 StreamController |
| `src/utils/streaming/*.ts` | 流式渲染模块实现 |
| `styles.css` | 添加流式内容样式 |

### 🔍 待验证问题

1. **工具 part 结构** - 通过添加的调试日志确认
2. **消息数量变化** - 工具执行后是否真的创建新消息
3. **异步执行流程** - AI 说"等待结果"后的实际行为

### 📝 下一步计划

1. **验证工具 part 解析**
   - 查看 `Processing part type: tool` 日志
   - 确认 callID、tool、state 字段存在

2. **优化流式效果**
   - 添加文本分割和延迟输出
   - 保持 thinking/tool 的原子性

3. **修复第二轮对话截断**
   - 延长工具等待时间
   - 检测最终回复消息

4. **UI 优化**
   - thinking 块折叠/展开动画
   - tool 调用状态图标旋转动画

---

**会话日期**: 2026-03-19  
**开发时长**: ~4 小时（基础）+ ~2 小时（流式渲染）  
**主要贡献**: 核心功能实现、Bug 修复、国际化支持、流式渲染模块架构

**当前状态**: 🔧 流式渲染模块开发中，待解决工具调用显示问题
