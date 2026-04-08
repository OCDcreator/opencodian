# OpenCodeService → SDK v2 手工验收 Checklist

> 适用范围：验证当前 `OpenCodeService` 的 SDK v2 混合主链是否正常。
>
> 当前迁移状态说明见：`docs/status/sdk-v2-rollout.md`
>
> 本文档只描述建议验收项，不代表这些步骤已在本次 docs 更新中重新执行。

## 1. 验收前准备

- 确认插件已部署到 Test Vault：`C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`
- 打开 Obsidian Test Vault，并在开发者控制台确认当前插件 `BUILD_ID`
- 确认本地或远程 OpenCode 服务可用，并且模型 provider 已配置完成
- 若测试本地模式，建议先在 OpenCodian 设置里确保：
  - Server mode = `local`
  - 默认 provider / model 可正常响应
  - 权限模式不是完全禁用弹窗的异常配置
- 若这次改动涉及 provider 目录 / 模型列表 / SDK transport，再额外做 1 次“目录真值”预检：
  - 在 vault 根目录执行 `opencode models`
  - 再对插件本地 `4096` 执行 directory-scoped `config.providers()`
  - 两者的 provider 集合必须一致；设置页 `服务器目录` 应等于这组结果再减去服务端硬禁用 provider
  - 如果插件结果明显更少，优先怀疑旧 `4096` managed server 被继续接管，而不是先改 UI 过滤逻辑

## 2. 推荐验收顺序

按下面顺序执行，不建议跳步：

1. 会话 CRUD
2. 标题生成
3. 普通流式对话
4. Obsidian 上下文发送
5. 工具调用
6. 权限卡片
7. 问题卡片
8. 文件变更 notice / diff
9. 中途取消
10. 多次连续对话
11. 服务重启后恢复
12. provider 目录真值对照

## 3. Checklist 详情

### 3.1 会话 CRUD

- 新建一个空会话
  - 预期：成功创建，历史会话列表出现新条目，没有报错 toast
- 在该会话发送一条普通消息
  - 预期：消息正常发送并返回 assistant 回复
- 打开历史会话列表，切换到另一个旧会话，再切回当前会话
  - 预期：当前会话消息完整保留，没有串会话
- 触发 fork / rewind
  - 预期：fork 后生成新会话；rewind 后会话退回指定节点，没有重复消息
- 删除一个无关测试会话
  - 预期：列表移除成功；如果删除的是当前会话，当前选中状态被安全清空

**建议测试提示词**

- `请简单回复：CRUD smoke test`

### 3.2 标题生成

- 新建一个会话，发送一条容易概括主题的首条消息
- 如果标题模式为 `default`
  - 预期：会话标题被更新为首条消息摘要
- 如果标题模式为 `ai`
  - 预期：先出现回退标题，随后异步变成更短、更自然的 AI 标题
- 手动重命名会话后，再观察数秒
  - 预期：不会被后台 AI 标题再次覆盖

**建议测试提示词**

- `帮我写一个 Obsidian 插件设置页的需求清单`

### 3.3 普通流式对话

- 在一个正常会话里发送 2~3 条连续普通消息
- 观察首包、增量输出、停止时机、最终消息内容
  - 预期：有 `message_start -> text/thinking/tool/usage -> message_stop` 的正常体验
  - 预期：不会出现首段重复、整段丢失、消息突然串到别的会话
- 观察对话完成后最新 assistant 消息
  - 预期：最终内容与流式过程一致，收口后没有再额外重复一遍

**建议测试提示词**

- `请分三点说明 TypeScript interface 和 type 的区别。`

### 3.4 Obsidian 上下文发送

- 在当前 tab 分别加入：
  - 当前笔记
  - 当前选区
  - 文件选择器里的一个文本文件
- 发送一条会引用这些上下文的消息
  - 预期：用户消息在聊天里能看到上下文附件
  - 预期：reload 或切走再切回后，上下文附件仍能恢复
- 若测试本地模式
  - 预期：上下文走真实 file part，不是纯文本拼接
- 若测试远程模式
  - 预期：文本上下文仍能工作，但不会暴露本地 `file://` 路径

**建议测试提示词**

- `请结合我附带的上下文，总结这些文件在 SDK 集成里分别负责什么。`

### 3.5 工具调用

- 发起一个明确需要工具的请求
- 观察工具调用卡片、工具结果、最终 assistant 总结
  - 预期：工具调用开始时出现 tool 卡片
  - 预期：工具结束后出现 tool result
  - 预期：不会出现同一个工具结果重复插入多次
- 如果工具涉及读文件或搜索
  - 预期：最终回答引用当前 vault / 项目上下文，而不是空答

**建议测试提示词**

- `请先搜索当前项目里和 OMO 兼容相关的实现，再总结涉及的主要文件。`

### 3.6 权限卡片

- 发起一个会触发权限审批的请求
- 观察权限卡片是否在聊天流里出现
  - 预期：出现权限请求卡片，而不是直接静默失败
- 分别测试：
  - 允许一次
  - 拒绝一次
- 观察 assistant 后续行为
  - 预期：允许后流程继续；拒绝后流程停止或给出合理说明
- 打开待处理权限列表
  - 预期：列表与聊天中的权限状态一致

**建议测试提示词**

- `请读取项目中的 AGENTS.md 并总结 OpenCodeService 的职责。`

### 3.7 问题卡片

- 发起一个会触发 question 流程的请求
- 观察问题卡片是否在聊天内联出现，或出现在 input 上方 dock
  - 预期：可以单选、多选、填写自定义答案
  - 预期：可以 reply，也可以 reject
- 提交回答后观察当前会话
  - 预期：问题请求从 pending 状态移除
  - 预期：如果设置允许显示 recap，会看到 answered/rejected 总结卡片

### 3.8 文件变更 notice / diff

- 发起一个会修改文件的请求
- 流中如果出现 `file.edited`
  - 预期：assistant 完成后会追加本轮 diff notice
- 重开会话或 reload 后再次查看
  - 预期：这个 notice 仍然存在，不是只在当前流里短暂出现

### 3.9 中途取消

- 发起一个明显会持续输出较久的请求
- 在输出进行中点击停止 / 取消
  - 预期：UI 立刻停止继续吐字
  - 预期：不会在几秒后又继续往当前消息补内容
  - 预期：不会生成两条 assistant 消息
- 再次发送一条新消息
  - 预期：新消息仍可正常发出，服务没有卡死

**建议测试提示词**

- `请详细生成一个长篇的 TypeScript 学习路线，并给出分阶段示例。`

### 3.10 多次连续对话

- 在同一会话连续发送 5~8 轮消息
- 中间至少包含：
  - 一次普通纯文本回复
  - 一次工具调用
  - 一次问题或权限交互
  - 一次取消
- 观察整轮交互
  - 预期：每轮都能正常开始和结束
  - 预期：不会出现 chunk 串轮次、上一轮工具结果跑到下一轮、会话进入永久 busy

### 3.11 服务重启后恢复

- 在已有历史会话的情况下重启：
  - OpenCodian 本地服务
  - 或整个 Obsidian Test Vault
- 重开插件视图，进入原会话
  - 预期：历史消息可正常加载
  - 预期：仍可继续发送新消息
  - 预期：模型列表、标题、权限、问题、diff notice 等基础功能不受影响

### 3.12 provider 目录真值对照

- 在 Test Vault 根目录执行 `opencode models`
- 记录 provider 集合（不是模型总数，而是 provider ID 集合）
- 对插件当前本地服务执行 directory-scoped `config.providers()`
  - 预期：provider 集合与 `opencode models` 一致
- 打开 OpenCodian 设置页，观察三张卡
  - 预期：`服务器目录` = 上面这组 provider，再减去服务端硬禁用 provider
  - 预期：`当前生效列表` = `服务器目录` 再叠加项目本地 provider 开关 / source mode 过滤
  - 预期：`当前禁用列表` 保留服务端禁用占位
- 如果插件只剩 1 个或 3 个 provider，而 CLI 明显更多
  - 先检查本地 `4096` 是否还是旧 pid
  - 先检查是否被旧 managed server / 错误 `directory` 作用域污染
  - 不要直接改 `provider.list()` / UI 过滤逻辑

## 4. 建议重点观察的异常信号

- 首条流式文本重复两次
- 取消后服务仍在继续生成，稍后把内容补回来
- 工具调用卡片出现，但没有 tool result 或 tool result 重复
- 权限卡片不出现，只有控制台报错
- 问题卡片没有显示，或提交后 pending 状态不消失
- 切换会话后消息串到错误会话
- 文件修改后没有 diff notice，或 notice reload 后消失
- 服务重启后当前会话无法继续发送
- 标题生成报错后导致首轮对话异常
- `opencode models` 明明有很多 provider，但设置页 `服务器目录` 只剩 1 个或 3 个

## 5. 当前已知“有意未完成”的范围

下面这些现象若出现，不一定算本轮缺陷，而是当前迁移范围外：

- `thinkingBudget` 对 SDK prompt 仍未真正生效
- `format` / `agent` / `noReply` 还没有接到 `OpenCodeService` facade
- `externalContextPaths` 仍是兼容字段，当前发送链路会忽略，新的上下文流程应使用 `contextItems`
- `sdkQuestions` 代码已支持，但 runtime rollout 默认未打开，所以 question 的 list/reply/reject 默认仍可能走 legacy `/question`
- `global.syncEvent.subscribe()` 当前只覆盖 `todo.updated` 与 `session.status`
- 更丰富的 stream 事件类型，如 `message.part.removed` / `message.updated`，还没有完全接入 UI
- `session.summarize()` / `session.unrevert()` / `find.*` / `file.status()` / `vcs.get()` 尚未接入

## 6. 失败时建议立即记录的信息

- 当前 `BUILD_ID`
- 当前会话标题或 `sessionId`
- 触发问题的提示词
- 是否本地模式 / 远程模式
- `opencode models` 的 provider 集合
- 插件本地 `4096` 上 `config.providers(directory)` 的 provider 集合
- 是否涉及工具、权限、问题、取消、文件修改
- Obsidian 开发者控制台中以下前缀的日志：
  - `[OpenCodian]`
  - `[OpenCodeService]`
  - `[ServerManager]`
  - `[OpenCodianView]`
  - `[OpenCode]`
