# OpenCodian 与 oh-my-opencode 兼容性需求整理

> **状态说明（2026-03-29）**
>
> 这份文档最初记录的是“实现前需求与问题基线”。当前仓库已经完成了其中一大半，尤其是聊天侧兼容。为了方便新会话继续推进，下面会同时保留原始需求分析，并补充“已完成 / 未完成”的现状结论。

## 0. 当前实现进度（2026-03-29）

### 0.1 已完成

#### 聊天侧 OMO 注入可见

1. 已新增 OMO 识别层，可识别：
   - `[search-mode] ... --- 原始输入`
   - `<system-reminder>...</system-reminder>`
   - `<!-- OMO_INTERNAL_INITIATOR -->`
2. 用户发送后，会在 `message_start` 阶段立即用服务端最终 user message 回写当前 user bubble，而不是继续停留在本地乐观文本。
3. 当前会话中已支持：
   - 用户原始输入正文
   - `search-mode / analyze-mode / custom` 模式标签
   - 注入提示词摘要
   - 原始注入 prompt 折叠查看

#### 后台任务提醒自动出现

1. 已增加当前可见会话的空闲期自动同步机制。
2. 主回复结束后，如果后台任务回写父会话，当前会话会自动吸收新增消息。
3. 已支持：
   - `[BACKGROUND TASK COMPLETED]`
   - `[ALL BACKGROUND TASKS COMPLETE]`
4. 系统提醒会渲染成专门的 notice card，而不是把 `<system-reminder>` 标签原样暴露。

#### 中文化与视觉区分已落地

1. 中文界面下，OMO 注入提示词和系统提醒都有中文标题或摘要。
2. 原始英文 prompt / reminder 可折叠查看。
3. 样式上已经能区分：
   - 用户原始输入
   - OMO 注入提示词
   - OMO 系统提醒
   - 后台任务运行中提示卡片
   - 后台任务完成通知

#### 后台任务“还在运行”可见性已补齐

1. 当 `search-mode` 触发子任务或流中出现 `task` 工具时，界面会显示“后台任务运行中”卡片。
2. 主回复结束但后台子任务仍在跑时，卡片会继续保留，避免用户误以为卡住。
3. 后台回写的新 assistant 文本不再整段直接跳出，而会以轻量“伪流式”方式渐进显示，改善观感。

#### 项目级 OMO 配置入口已具备基础能力

1. 设置页插件分区已提供 `.opencode/oh-my-opencode.jsonc` 创建 / 打开入口。
2. `PluginManagementService` 已能返回 OMO 配置路径与存在状态。
3. 项目 `.opencode/plugins/` 目录与项目 `plugin` 数组也已有基础治理能力。

### 0.2 仍未完成

#### 项目级 OMO 配置仍是“入口级”，不是完整产品化

1. 目前更多是“创建并打开 `.opencode/oh-my-opencode.jsonc` 文件”，而不是前端直接读取、解析、编辑 OMO 配置内容。
2. 还没有“确保项目级 npm/Bun 插件已正确安装并被 OpenCode 识别”的安装流程。
3. “未安装全局 OMO，但仅靠项目级插件即可稳定生效”的完整闭环，当前仍依赖用户自己满足 OpenCode 侧约定。

#### 远程服务模式提示还不够明确

1. 目前插件区对 remote mode 只有通用提示，不算 OMO 区域内的明确只读说明。
2. 文档要求的“远程服务模式下明确提示项目级 OMO 功能可能不可用”，还需要在 OMO 设置区直接落文案。

#### 会话后续消息接收机制仍是轮询兜底，不是常驻事件订阅

1. 当前实现是“当前可见会话空闲期轮询同步”，而不是独立的常驻 `/event` 订阅。
2. 这已经满足“无需刷新/切换即可看到提醒”，但如果要追求更强实时性与更低延迟，仍可继续升级为事件驱动方案。

#### OMO 显示策略还不可配置

文档原本建议的以下开关目前还没有做成设置项：

1. 是否显示 OMO 注入提示词
2. 原文显示 / 摘要显示切换
3. 是否显示后台任务系统消息

### 0.3 给新会话的建议优先级

如果要继续推进，建议按下面顺序做：

1. 完成 OMO 设置区的 remote-mode 明确提示
2. 把 `.opencode/oh-my-opencode.jsonc` 从“打开文件”升级为“读取/预览/编辑入口”
3. 评估是否把空闲期轮询升级为常驻 `/event` 订阅
4. 再考虑做 OMO 显示策略的设置开关

## 1. 目标

为 OpenCodian 补齐与 `oh-my-opencode` 的兼容能力，解决以下三个问题：

1. 用户发送消息后，`oh-my-opencode` 在 `chat.message` 阶段注入的提示词没有及时显示在当前会话气泡中。
2. `oh-my-opencode` 的后台任务完成提醒在当前会话流结束后无法实时出现在界面中，通常要重新加载或稍后同步才看到。
3. 希望在中文环境下，把这些注入提示词 / 系统提醒做成可理解、可区分、样式更好的界面表现。

这份文档用于交给另一个大模型继续做实现设计或直接编码。

## 2. 当前现象

> 以下内容描述的是开始实现前的原始问题基线，方便理解为什么需要这些改动；不代表当前仓库仍然完全处于该状态。

### 2.1 提示词注入不可见

用户实际输入可能只有一句简短中文，例如：

`使用工具搜索一下史料`

但 `oh-my-opencode` 会在发送前把它改写成类似：

```text
[search-mode]
MAXIMIZE SEARCH EFFORT...

---

使用工具搜索一下史料
```

在 OpenCodian 当前实现里：

1. 用户气泡先用本地原始输入做乐观渲染。
2. 服务端实际收到的却是被 `oh-my-opencode` 改写后的 message parts。
3. 当前发送期间，界面通常看不到这段被注入的前置提示词。
4. 只有在稍后从服务端重新拉取消息时，或者重新打开会话后，才有机会看到最终落库的内容。

### 2.2 后台任务提醒无法在流结束后实时出现

`oh-my-opencode` 的后台任务完成后，会向父会话发送类似：

```html
<system-reminder>
[BACKGROUND TASK COMPLETED]
...
</system-reminder>
<!-- OMO_INTERNAL_INITIATOR -->
```

或：

```html
<system-reminder>
[ALL BACKGROUND TASKS COMPLETE]
...
</system-reminder>
<!-- OMO_INTERNAL_INITIATOR -->
```

但 OpenCodian 当前只在“本次发送正在流式返回”的阶段临时订阅 SSE，流结束后不会继续常驻监听 `/event`。因此：

1. 如果后台任务在主回复结束后才完成，当前界面收不到新提醒。
2. 这些提醒只会在之后重新加载会话、切换会话、或手动触发同步时出现。

## 3. 已验证事实与代码依据

### 3.1 oh-my-opencode 确实会改写用户消息

- `reference-projects/oh-my-openagent/src/plugin/chat-message.ts`
  - `chat.message` 阶段串行调用多个 hook。
- `reference-projects/oh-my-openagent/src/hooks/keyword-detector/hook.ts`
  - 会把 `[search-mode] ... --- 原始输入` 直接写回 `output.parts[textPartIndex].text`。
- `reference-projects/oh-my-openagent/src/hooks/keyword-detector/search/default.ts`
  - 定义了你示例里的 `[search-mode] MAXIMIZE SEARCH EFFORT...` 文本。

### 3.2 oh-my-opencode 支持项目级配置

- `reference-projects/oh-my-openagent/src/plugin-config.ts`
  - 配置优先级是：项目 `.opencode/oh-my-opencode.jsonc` 覆盖用户级 `~/.config/opencode/oh-my-opencode.jsonc`。
- `reference-projects/oh-my-openagent/docs/reference/configuration.md`
  - 明确支持 `prompt_append`、`prompt`、分类配置等。

### 3.3 oh-my-opencode 的后台提醒本质上也是消息注入

- `reference-projects/oh-my-openagent/src/features/background-agent/background-task-notification-template.ts`
  - 生成 `<system-reminder>...</system-reminder>` 文本。
- `reference-projects/oh-my-openagent/src/shared/internal-initiator-marker.ts`
  - 会在文本末尾追加 `<!-- OMO_INTERNAL_INITIATOR -->`。
- `reference-projects/oh-my-openagent/src/features/background-agent/manager.ts`
  - 后台任务完成时会用 `client.session.promptAsync(...)` 把提醒发回父会话。

### 3.4 OpenCodian 当前只在发送时临时监听 SSE

- `src/core/opencode/OpenCodeService.ts`
  - `sendMessage()` 里先调 `/session/:id/prompt_async`，然后才连接 `/event`。
  - 处理的实时事件主要是 `message.part.delta`、`message.part.updated`、`permission.asked`、`session.idle`。
  - `session.idle` 后直接结束本次 SSE 循环。
- `src/features/chat/OpenCodianView.ts`
  - 发送时先把用户原始文本直接 push 到本地会话消息里并渲染。
  - 流结束后仍会通过 `syncConversationMessagesFromServer()` 与 2 秒后台轮询兜底会话历史。
  - 现在已经会消费 `global.syncEvent.subscribe()` 里的 `message.updated` / `message.part.updated` / `session.diff`，并提前触发当前会话或后台 tab 的消息同步；但它还不是像参考应用那样直接在本地维护一整套实时 message/part store。

### 3.5 OpenCodian 已经具备“通知卡片”和中文 i18n 基础

- `src/features/chat/OpenCodianView.ts`
  - 已有 `displayStyle: 'notice'` 的卡片渲染。
- `styles.css`
  - 已有 `.opencodian-chat-notice-card` 等样式。
- `src/i18n/locales/zh.ts`
  - 已有完整中文 locale 体系。

## 4. 根因判断

这是两个兼容问题叠加，而不是单一渲染 bug：

### 4.1 当前用户气泡是“本地乐观消息”，不是“服务端最终消息”

OpenCodian 发送时，先展示用户原文；而 `oh-my-opencode` 的提示词注入发生在 OpenCode 插件链里，属于服务端改写后的最终消息。两边没有在“发送后立即”做一次面向当前 user message 的精确回写，所以注入文本不会立刻出现在当前气泡。

### 4.2 当前没有常驻会话事件订阅

后台任务提醒可能在主回复结束后才写入父会话。OpenCodian 当前 SSE 生命周期只覆盖“本次 assistant 回复流”，不覆盖“会话后续新增消息”，所以这些系统提醒不会实时出现在界面。

## 5. 可行性结论

## 5.1 如果用户没有全局安装 oh-my-opencode，能否在项目级别安装和配置？

结论：`可行，但当前 OpenCodian 只具备部分基础，尚未做完产品化。`

### 已具备的基础

1. OpenCodian 启动本地 OpenCode 服务时，会把 vault 路径设为工作目录。
2. OpenCodian 已经在使用 vault 级 `.opencode` 目录来管理 OpenCode 本地配置。
3. OpenCode 文档本身支持项目级插件与项目级配置。

### 可行方式

可选落点至少有两种：

1. 在项目配置里声明 npm 插件，例如让 OpenCode 从项目配置加载 `oh-my-opencode`。
2. 在项目目录下放置 `.opencode/plugins/` 与 `.opencode/oh-my-opencode.jsonc` 这类项目级插件/配置文件。

### 当前缺口

OpenCodian 目前只有 `.opencode/opencode.json` 的管理能力，没有下面这些能力：

1. 没有管理 `.opencode/oh-my-opencode.jsonc` 的 UI 或读写器。
2. 没有管理 `.opencode/plugins/` 的 UI 或自动生成逻辑。
3. 没有负责“确保 npm/Bun 插件已被项目安装并能被 OpenCode 识别”的安装流程。
4. 远程 OpenCode 服务模式下，vault 本地项目目录未必就是服务端实际项目目录，项目级插件可能失效。

### 需求结论

项目级安装/配置应定义为：

1. 仅在“本地托管 OpenCode 服务 + 当前 vault 目录就是 OpenCode 工作目录”时保证可用。
2. 远程服务模式下最多提供只读提示或禁用开关，不承诺自动生效。
3. 需要新增专门的 OMO 项目配置管理能力，不能只复用当前 `OpencodeConfigManager`。

## 5.2 是否可以在会话消息中显示 oh-my-opencode 注入提示词？

结论：`可行，而且应当做成可配置功能。`

### 技术上可行的原因

1. 注入后的文本最终会进入服务端 message parts。
2. OpenCodian 已经有服务端消息同步能力。
3. OpenCodian 已有富渲染消息结构和 notice 卡片结构。

### 推荐显示策略

不要只把它当普通用户纯文本原样展示，建议分层显示：

1. 用户原始输入继续作为主气泡主体。
2. 检测到 OMO 注入内容时，在同一条消息内额外显示“系统注入提示词”区域。
3. 原始注入全文可折叠展开，默认展示摘要版。

### 至少要识别的 OMO 特征

1. `<!-- OMO_INTERNAL_INITIATOR -->`
2. `<system-reminder>...</system-reminder>`
3. `[search-mode]`
4. 未来其他 OMO mode 前缀，如 `[analyze-mode]` 等
5. `---` 分隔的“注入提示词 + 用户原文”结构

### 兼容性要求

1. 用户没装 OMO 时，不应该误判普通消息。
2. 识别失败时，最差也要退化成显示服务端完整文本，而不是吞掉内容。

## 5.3 是否可以在会话结束后实时显示后台任务完成提醒？

结论：`可行，但必须新增常驻同步机制。`

### 推荐方案

优先级从高到低：

1. 为当前激活会话建立常驻 `/event` 订阅，在非流式阶段也继续监听与当前 session 相关的消息变化。
2. 若实现成本过高，可增加“空闲期轻量轮询”作为兜底，例如在当前会话可见时定期拉取 `GET /session/:id/message`。
3. 当前实现已经满足这个最低配：收到 `session.diff` / `message.updated` / `message.part.updated` 时会触发会话自动同步；后续如果要继续提升兼容性，重点应转向“直接消费实时 message/part store”，而不是继续堆轮询。

### 预期行为

1. 主回复结束后，只要后台任务仍可能回写父会话，当前会话应保持“可接收后续系统消息”的状态。
2. 当 OMO 回写 `<system-reminder>` 消息时，界面应自动追加新卡片或刷新当前会话。
3. 用户无需重载会话就能看到 `[BACKGROUND TASK COMPLETED]` / `[ALL BACKGROUND TASKS COMPLETE]`。

## 5.4 在中文环境下，汉化并美化显示出的提示词样式是否可行？

结论：`可行，且适合放在 OpenCodian 前端层实现。`

### 为什么可行

1. OpenCodian 已有中文 i18n。
2. OpenCodian 已有 notice 卡片样式。
3. OMO 的原始文本模式比较稳定，足以做规则化提取和再展示。

### 推荐表现

对不同类型的 OMO 注入内容使用不同 UI：

1. `search-mode` / `analyze-mode`
   - 渲染成“模式标签 + 中文摘要 + 可展开原文”的提示条。
2. `<system-reminder>`
   - 渲染成 notice card，而不是把 HTML 标签原样暴露给用户。
3. 后台任务完成通知
   - 渲染成带状态色的系统卡片，例如“后台任务已完成 / 全部后台任务已完成”。

### 汉化策略

不要强行翻译整段原始注入 prompt，再把翻译结果送给模型。建议区分：

1. `发送给模型的原始文本`
   - 保持 OMO 注入后的英文原文，避免改变上游行为。
2. `显示给用户的界面文案`
   - 由 OpenCodian 在前端做中文标签、摘要、状态说明。
3. `原始注入全文`
   - 保留在折叠面板里，供高级用户查看。

## 6. 建议实现范围

建议拆成三个层级，避免一次性做过大：

### Phase 1: 最小兼容闭环

1. 当前消息发送后，尽快用服务端最终消息回写当前 user bubble。
2. 流结束后自动同步当前会话并重新渲染。
3. 对 OMO 注入内容先做“原文可见”，哪怕先不美化。

### Phase 2: 后台任务实时可见

1. 增加当前会话的常驻事件监听或空闲期轮询。
2. 在当前会话空闲时，也能自动吸收 OMO 新增消息。
3. 后台任务完成提醒自动追加到 UI。

### Phase 3: 中文化与视觉优化

1. 识别 `search-mode`、`system-reminder`、后台任务完成通知。
2. 转成专门的 UI block / notice card。
3. 提供中文标签、摘要、状态色、展开原文。
4. 提供设置项，例如：
   - 显示 OMO 注入提示词
   - 以原文显示 / 以摘要显示
   - 显示后台任务系统消息

## 7. 非目标

以下内容不应作为本需求的必要部分：

1. 改动 `oh-my-opencode` 上游实现逻辑。
2. 改写 OMO 发送给模型的原始 prompt 内容。
3. 要求所有用户必须全局安装 OMO。
4. 在远程 OpenCode 服务模式下强行保证项目级插件安装成功。

## 8. 验收标准

### 8.1 项目级配置

1. 在本地托管 OpenCode 服务模式下，可以为当前 vault 放置并读取 OMO 项目级配置。
2. 未安装全局 OMO 的情况下，只要项目级插件配置满足 OpenCode 约定，就能在当前 vault 生效。
3. 远程服务模式下，界面会明确提示项目级 OMO 功能可能不可用。

### 8.2 注入提示词可见

1. 用户发送 `使用工具搜索一下史料` 后，界面可在当前会话中看到 OMO 注入的 `search-mode` 信息。
2. 不需要重新加载会话。
3. 普通未注入消息保持原有显示，不出现误判。

### 8.3 后台任务提醒实时出现

1. 主回复结束后，如果后台任务完成，当前会话会自动显示完成提醒。
2. 至少支持 `[BACKGROUND TASK COMPLETED]` 与 `[ALL BACKGROUND TASKS COMPLETE]` 两类提醒。
3. 用户不必刷新或切换会话才能看到提醒。

### 8.4 中文化与美化

1. 中文界面下，提示词/系统提醒有中文标题或摘要。
2. 原始英文注入 prompt 可折叠查看。
3. 样式上能区分：
   - 用户原始输入
   - OMO 注入提示词
   - OMO 系统提醒
   - 后台任务完成通知

## 9. 对实现模型的附加建议

如果由另一个大模型直接实现，建议优先检查这些文件：

- `src/features/chat/OpenCodianView.ts`
- `src/core/opencode/OpenCodeService.ts`
- `src/core/config/OpencodeConfigManager.ts`
- `styles.css`
- `src/i18n/locales/zh.ts`
- `reference-projects/oh-my-openagent/src/plugin/chat-message.ts`
- `reference-projects/oh-my-openagent/src/hooks/keyword-detector/hook.ts`
- `reference-projects/oh-my-openagent/src/features/background-agent/manager.ts`
- `reference-projects/oh-my-openagent/src/shared/internal-initiator-marker.ts`

推荐优先解决顺序：

1. 用户消息回写与实时同步机制
2. 后台任务提醒接收机制
3. OMO 内容识别与专用 UI
4. 项目级 OMO 配置管理
