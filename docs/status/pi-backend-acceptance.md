# Pi 完整业务接入验收

本轮按完整业务能力实现，不沿用最初基础聊天子集的验收结论。基线为官方 `@mariozechner/pi-coding-agent 0.73.1`；本地进程服务协议 1。

## 接入范围与结果

29/29 官方 RPC 命令有业务映射，23/23 补充 SDK 管理操作有入口，9/9 标准扩展 UI 有双向桥接。29 RPC 与22补充操作使用真实SDK进程验证；OAuth登录使用可控回调验证，未把它计作真实账号登录。全部52项在Pi工作台分组可达。

| 操作 | 功能 | 来源 | 证据 |
| --- | --- | --- | --- |
| `get_state` | 运行状态 / State | 官方 RPC | 真实 SDK 0.73.1 通过 |
| `get_messages` | 读取历史 / Transcript | 官方 RPC | 真实 SDK 0.73.1 通过 |
| `get_last_assistant_text` | 最近回复 / Last reply | 官方 RPC | 真实 SDK 0.73.1 通过 |
| `new_session` | 新建会话 / New session | 官方 RPC | 真实 SDK 0.73.1 通过 |
| `set_session_name` | 重命名 / Rename | 官方 RPC | 真实 SDK 0.73.1 通过 |
| `list_sessions` | 发现原生会话 / Discover sessions | SDK 补充 | 真实 SDK 0.73.1 通过 |
| `import_session` | 导入副本 / Import copy | SDK 补充 | 真实 SDK 0.73.1 通过 |
| `switch_session` | 打开原生会话 / Open native session | 官方 RPC | 真实 SDK 0.73.1 通过 |
| `get_tree` | 分支树 / Tree | SDK 补充 | 真实 SDK 0.73.1 通过 |
| `get_fork_messages` | 可分叉消息 / Fork points | 官方 RPC | 真实 SDK 0.73.1 通过 |
| `fork` | 从节点分叉 / Fork before entry | 官方 RPC | 真实 SDK 0.73.1 通过 |
| `clone` | 克隆当前分支 / Clone branch | 官方 RPC | 真实 SDK 0.73.1 通过 |
| `navigate_tree` | 切换历史节点 / Navigate tree | SDK 补充 | 真实 SDK 0.73.1 通过 |
| `label_entry` | 标记历史节点 / Label entry | SDK 补充 | 真实 SDK 0.73.1 通过 |
| `prompt` | 发送消息 / Send | 官方 RPC | 真实 SDK 0.73.1 通过 |
| `steer` | 运行中纠偏 / Steer | 官方 RPC | 真实 SDK 0.73.1 通过 |
| `follow_up` | 排队后续消息 / Follow up | 官方 RPC | 真实 SDK 0.73.1 通过 |
| `get_queue` | 查看队列 / Queue | SDK 补充 | 真实 SDK 0.73.1 通过 |
| `clear_queue` | 清空队列 / Clear queue | SDK 补充 | 真实 SDK 0.73.1 通过 |
| `set_steering_mode` | 纠偏投递方式 / Steering mode | 官方 RPC | 真实 SDK 0.73.1 通过 |
| `set_follow_up_mode` | 后续消息投递方式 / Follow-up mode | 官方 RPC | 真实 SDK 0.73.1 通过 |
| `abort` | 停止生成 / Stop | 官方 RPC | 真实 SDK 0.73.1 通过 |
| `bash` | 执行 Shell / Run shell | 官方 RPC | 真实 SDK 0.73.1 通过 |
| `abort_bash` | 停止 Shell / Stop shell | 官方 RPC | 真实 SDK 0.73.1 通过 |
| `get_available_models` | 模型目录 / Models | 官方 RPC | 真实 SDK 0.73.1 通过 |
| `set_model` | 选择模型 / Select model | 官方 RPC | 真实 SDK 0.73.1 通过 |
| `cycle_model` | 下一个限定模型 / Cycle model | 官方 RPC | 真实 SDK 0.73.1 通过 |
| `set_scoped_models` | 限定模型循环 / Scoped models | SDK 补充 | 真实 SDK 0.73.1 通过 |
| `set_thinking_level` | 思考等级 / Thinking | 官方 RPC | 真实 SDK 0.73.1 通过 |
| `cycle_thinking_level` | 下一个思考等级 / Cycle thinking | 官方 RPC | 真实 SDK 0.73.1 通过 |
| `get_session_stats` | 实际费用和上下文 / Usage and cost | 官方 RPC | 真实 SDK 0.73.1 通过 |
| `compact` | 压缩上下文 / Compact | 官方 RPC | 真实 SDK 0.73.1 通过 |
| `abort_compaction` | 取消压缩 / Cancel compaction | SDK 补充 | 真实 SDK 0.73.1 通过 |
| `abort_branch_summary` | 取消分支摘要 / Cancel summary | SDK 补充 | 真实 SDK 0.73.1 通过 |
| `set_auto_compaction` | 自动压缩 / Auto-compaction | 官方 RPC | 真实 SDK 0.73.1 通过 |
| `set_auto_retry` | 自动重试 / Auto-retry | 官方 RPC | 真实 SDK 0.73.1 通过 |
| `abort_retry` | 停止重试 / Stop retry | 官方 RPC | 真实 SDK 0.73.1 通过 |
| `get_tools` | 工具和参数 / Tools | SDK 补充 | 真实 SDK 0.73.1 通过 |
| `set_tools` | 选择启用工具 / Enable tools | SDK 补充 | 真实 SDK 0.73.1 通过 |
| `get_commands` | 命令与技能 / Commands | 官方 RPC | 真实 SDK 0.73.1 通过 |
| `get_resources` | 扩展与上下文文件 / Resources | SDK 补充 | 真实 SDK 0.73.1 通过 |
| `reload` | 重新加载扩展 / Reload resources | SDK 补充 | 真实 SDK 0.73.1 通过 |
| `get_packages` | 已配置扩展包 / Packages | SDK 补充 | 真实 SDK 0.73.1 通过 |
| `install_package` | 安装扩展包 / Install package | SDK 补充 | 真实 SDK 0.73.1 通过 |
| `remove_package` | 移除扩展包 / Remove package | SDK 补充 | 真实 SDK 0.73.1 通过 |
| `update_package` | 升级扩展包 / Update package | SDK 补充 | 真实 SDK 0.73.1 通过 |
| `get_auth` | 认证状态 / Auth status | SDK 补充 | 真实 SDK 0.73.1 通过 |
| `login` | 登录 OAuth / Sign in | SDK 补充 | 回调/选择器/取消已接线；真实账号授权未验 |
| `set_api_key` | 保存 API key / Save API key | SDK 补充 | 真实 SDK 0.73.1 通过 |
| `logout` | 退出登录 / Sign out | SDK 补充 | 真实 SDK 0.73.1 通过 |
| `export_html` | 导出 HTML / Export HTML | 官方 RPC | 真实 SDK 0.73.1 通过 |
| `export_jsonl` | 导出原生会话 / Export JSONL | SDK 补充 | 真实 SDK 0.73.1 通过 |

## 功能验证

- `node scripts/pi-sdk-acceptance.mjs`：真实SDK、独立服务进程、本地OpenAI兼容模型fixture、临时工作目录和测试凭据；每次从安装包RpcCommand union对照29项全集。
- 自动重试明确观察auto_retry_start/end；自动压缩明确观察threshold compaction_start/end；延迟agent_end扩展钩子在prompt回复前完成。
- 启动扩展对话框收到回复；九种扩展UI往返；取消按请求ID关闭；运行时编辑器/文本widget与会话隔离。
- 原生entry ID、指定节点fork、clone/切回、tree/label/navigate、导入/导出、真实费用与上下文、可见custom_message、恢复保存模型通过。
- 两个会话进程之间新增认证/退出状态同步；本地包安装后真实命令和工具出现，移除后消失。OAuth回调测试明确区别于真实账号登录。
- `node scripts/pi-rpc-smoke.mjs`：真实opencode-go/deepseek-v4-flash，49模型目录、读取工具/流式回复、重构适配器后的恢复、分叉及删除隔离通过。全局settings.json前后字节一致。
- 定向单元测试覆盖停止/取消准备时序、原生历史/图片/工具details、严格模型选择、协议/UI取消与管理目录；完整门禁见下方最终构建记录。

## Test Vault 界面验收

macOS Test Vault 实测通过设置/工作台新建、真实SDK状态读取、工作台打开聊天；DOM操作验证select、confirm、input、editor、notify、setStatus、setWidget、setTitle、set_editor_text和取消关闭。

真实输入框+发送按钮请求回复PI_FULL_UI_OK；两条消息保存原生ID。SDK费用与上下文读数可获取；插件重载后历史恢复，下一轮在未重复提供token的情况下再次回复PI_FULL_UI_OK。

UI主机DOM验证与真实SDK桥接测试分别执行，不把合成请求当作真实OAuth授权。

## 后端隔离与架构检查

`git diff HEAD` 确认 OpenCodeAdapter、ClaudeCodeAdapter、CodexAdapter、整个src/core/opencode、package.json及package-lock.json均无差异。共享注册保留原三后端顺序，Pi追加；模型严格选择为Pi opt-in。无新增反向层依赖、runtime SCC或类型耦合成员。

CodeGraph修改前已查询callers/impact，深度均为1。只计function/method直接调用者：PiAdapter.sendMessage 0/影响2；cancelStream 0/2；command 13/15；consumeRequest 1/2；PiSessionRuntime.get 7/8；receive 1/2；startPiService 0/2；executeCommand 1/4；createExtensionUi 1/3；PiWorkbenchModal.load 1/2；renderAction 1/2；toPiChatMessages 1/4。map的泛化同名解析返回20条直接调用及39影响符号，含静态误匹配；不把这些当运行时依赖或风险评级。共享入口沿用用户已授权的经审查继续范围，其余后端不修改。修改后执行CodeGraph sync/affected。

## 明确边界

- 这是本地进程型微服务，无常驻HTTP端口或容器部署。
- 标准业务接口已接入；SDK底层类型/工具函数、终端组件布局、替换终端编辑器、终端页眉页脚/主题/快捷键，不作为Obsidian业务操作宣称。终端自定义组件需要Pi TUI。
- Pi没有提供的MCP/子代理管理能力不虚构。
- 本轮真实运行平台为macOS；Windows npm shim有实现但未在Windows实机验收。
- 真实OAuth浏览器授权是剩余人工验收项。当前结论为业务接口实现与可自动验证场景通过，不声称跨平台/所有真实账号100%验收。

## 原始证据

仓库本地 `.obsidian-debug/pi-full/`：sdk-acceptance.json、sdk-run.log、real-smoke.log、verify-final.log、deployment.json、ui-setup.json、ui-exercise.json、ui-resume.json、ui-chat.png、最终ui-final.json。机器路径和凭据不写进产品设置。

## 最终门禁与部署记录

- npm run verify：全部门禁通过；750 suites / 7222 tests，lint 0 errors / 0 warnings，typecheck、架构、模块文档、Graphify、生产构建全部通过。运行于已有Node24.16.0；默认Node24.18.0的Jest worker曾SIGSEGV，不修改系统默认或项目依赖。
- BUILD_ID：main.202609082351。三个主插件文件及三个Pi服务资源按顺序部署到Test Vault，并逐字节/hash核验。
- main.js SHA-256：1282e09cdbed4c1976531c69c7c7f5a2c1a03a3c2f98c0799ffd95a37dbbfca3。
- 最终构建第三轮真实消息保持PI_FULL_UI_OK，6条消息均有原生ID；dev:errors无错误。
- 已恢复原enabledBackends/activeBackend及原会话，仅删除本次新建Pi测试会话；Pi服务进程数为0，全局Pi设置字节一致。
- Standards和Spec复审发现的问题全部修复；最终Spec无未闭合P1/P2。未提交或推送Git。

## 2026-09-09 前端配置修正

此前通用设置+工作台不是完整前端设计，已替换为Pi独立主标签和八个二级页。官方0.73.1的36顶层/51叶项settings全部有schema/表单，31项SDK运行设置，其余标明终端、导出或CLI历史目录。新增4项独立持久配置API；models.json完整结构可编辑并由官方SDK校验。

配置修改在临时目录验证：项目/全局继承、全局不被项目改写、冲突拒绝、负值拒绝、备份、models加载/校验、enabledModels与enableSkillCommands实际生效。最终UI/构建结果待本轮收尾记录。

### 前端修正验收结果

- 独立Pi主标签及八个二级页通过真实Test Vault DOM导航，通用智能体页不再出现内联Pi配置。
- 51字段实际分布：模型与思考8、执行与上下文17、资源7、高级19。内部lastChangelogVersion只读；终端专用字段明确标明不会改变插件界面。提供商结构化配置和完整models.json另页管理。
- 项目retry.maxRetries表单保存实测成功，全局settings/models字节一致；重名新提供商被拒绝。测试写入及备份已恢复。
- 宽页面与522px内容面板都无横向溢出；截图pi-settings-model.png、pi-settings-providers.png、pi-settings-narrow.png。
- 原生配置服务新增4项API；51字段与SDK类型逐项对照，模型校验期间外部写入被保留；错误模型默认值不影响配置修复入口。
- 全量门禁751 suites / 7226 tests通过。此前一次Jest worker SIGSEGV，单独重跑受影响套件通过；使用已有Node24.16.0并为该轮设置8GiB堆预算后全量通过，未改项目依赖或系统默认。
- 复审发现的JSON与表单快照不一致、增删模型丢草稿、同名provider覆盖和校验期间外部写入覆盖均已修复。
- 原始证据：.obsidian-debug/pi-settings-{verify,sdk}.log、pi-settings-ui.json、pi-settings-cleanup.json、pi-settings-deployment.json。

### 最终 SVG 与卡片间距复验

用户指定的P/i SVG形状已单处注册并用于Pi主标签、后端切换及聊天状态。卡片间距使用现有12px变量；真实DOM模型/执行/资源/提供商页测得最小间距均为12px，未以外层section gap代替卡片间距。

最终BUILD_ID：main.202609090041；7项部署文件含4个Pi服务资源逐字节相同。最终完整verify：751 suites / 7226 tests、lint 0 errors / 0 warnings，其余门禁全部通过。最终表面证据pi-settings-final-surface.json，截图pi-settings-final.png；全局settings/models和项目测试写入均已恢复。

## 1.1.13发行准备

发布检查发现标准三文件包未包含Pi服务资源，已改为构建嵌入4个包装脚本并在首次启动时按哈希自动展开。官方SDK继续外置。专项验收从不存在assets的安装目录验证完整真实SDK；发布版另做Test Vault验证。此前“必须手工复制所有服务资源”的说明仅描述开发部署，用户标准安装无需额外资源。
