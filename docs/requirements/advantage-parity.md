# Copilot / Claudian 优势继承需求文档

- 状态：**待审查（Draft v0）**
- 日期：2026-09-20
- 基线：`main@8cb0e8696`（`feature/flowtext-parity` 已于本日快进合并，R-A1…R-C6 全部在库）
- 对标来源：两个开源 Obsidian 插件的**实盘代码盘点**（2026-09-20）：
  - **Copilot** `logancyang/obsidian-copilot` v4.0.9（克隆于 `/tmp/plugin-compare/copilot`，临时目录，盘点结论已固化进本文档）
  - **Claudian** `YishenTu/claudian` v2.3.1（克隆于 `/tmp/plugin-compare/claudian`，同上）
- 定位：**能力驱动的需求清单**。只继承「适合本插件架构」的优势：凡与既有硬约束（只读辅助契约、唯一写路径、fail-closed、不自动注入）冲突，或需要引入第三方云依赖的一律改造或放弃，**不复制对标插件的实现路径**。
- 前置文档：`docs/requirements/flowtext-parity.md`（批次 A/B/C 编号已占用，本文档从 R-D 起）

> **维护方式**：每条需求带唯一编号（`R-D1`…）。实现落地后回填「状态」列（`TODO` → `DONE` / `PARTIAL` / `WONTFIX`）并附证据来源。不重写结构。

---

## 1. 目标与判定基线

### 1.1 目标

在 flowtext-parity 合并后的能力面之上，吸收两个对标插件中**OpenCodian 仍缺**的高价值能力，保持既有架构优势（四后端 + ACP、多标签并发、后台任务、MCP 托管、记忆系统、诊断工作台）不回退。

### 1.2 判定基线（已覆盖项，登记防重复劳动）

以下能力经盘点确认**已有对等物或本插件占优**，本计划不再做：

| 对标能力 | OpenCodian 对等物 |
|---|---|
| Copilot Quick Ask 行内问答 / Quick Command | inline-edit v2（三形态 + 文档模式 + `@`/`#` + 流式 + 贴图） |
| Copilot 自定义命令库（16 默认命令） | 斜杠命令（builtin + project/user `.md` + skills）+ 行内 `#` 预设 |
| Copilot diff 应用视图（ApplyView） | Modified Files 侧栏 + R-B3 文件级回退 |
| Copilot 技能管理 / 项目指令 | Skills 设置分区（project/external）+ Agents workspace + AGENTS.md 消费 |
| Copilot 记忆笔记 | 持久记忆系统（提取/反思/git 同步，占优） |
| Copilot Plan 模式 | Claude `setPermissionMode` 含 plan；无专属提案卡（差距小，暂不做） |
| Copilot 内置技能库（obsidian-markdown 等 4 个） | R-B4 官方 CLI 原生工具 + Skills 机制可承载，暂不内置 |
| Copilot 移动端 Quick Chat | 裁决项 R-G2（架构性） |
| Claudian fork / 子代理管理 / 上下文环 / inline edit | 均已有（fork、ChildSessionTree、ContextRing、inline-edit） |
| Claudian 会话历史恢复 | 后端会话浏览器 + 权威重同步 |
| Claudian 回退（claude/grok 专属） | R-B3 后端无关文件回退（覆盖面更广） |
| 双方 Canvas / PDF / 文生图 / 检索注入 / 自动内链 | flowtext-parity 批次 B/C 已交付 |

### 1.3 范围外

见 §9 非目标。

---

## 2. 批次总表

优先级判据：**先补「对话资产与高频小件」（低改动高体感），再补「上下文与检索」，再补「会话交互与运行时」；架构级大工程单独裁决。**

| 批次 | 编号 | 需求 | 来源 | 优先级 | 状态 |
|---|---|---|---|---|---|
| D | R-D1 | 对话导出 / 另存为 Markdown 笔记 | Copilot | P0 | DONE |
| D | R-D2 | API 密钥入 Obsidian Keychain | Copilot | P1 | DONE |
| D | R-D3 | 轮次完成通知音效 | 双方 | P3 | DONE |
| E | R-E1 | URL / 网页内容上下文（本地抓取） | Copilot | P1 | DONE |
| E | R-E2 | Web Viewer 标签页上下文 | Copilot | P2 | DONE |
| E | R-E3 | 相关笔记面板（图谱 + 检索双通道） | Copilot | P1 | DONE |
| E | R-E4 | 语义检索增强层（embedding on R-C1） | Copilot/Miyo | P2 | DONE |
| E | R-E5 | Dataview / Bases 上下文支持 | Copilot | P2 | DONE |
| E | R-E6 | 选区 / 全库 token 计数命令 | Copilot | P2 | DONE |
| F | R-F1 | Turn steering + 流式中消息排队 | Claudian | P1 | DONE |
| F | R-F2 | 会话-笔记绑定草稿（linked content） | Claudian | P2 | TODO |
| F | R-F3 | 回退预览 + 冲突检测 UI | Claudian | P2 | TODO |
| F | R-F4 | 暖进程池（聊天侧预热） | Claudian | P2 | TODO |
| F | R-F5 | 双栏会话管理器 | Claudian | P3 | TODO |
| F | R-F6 | Vim 风格聊天导航键 | Claudian | P3 | TODO |
| F | R-F7 | 每供应商环境变量分域 + 环境哈希失效 | Claudian | P2 | TODO |
| F | R-F8 | 自定义模型自定义上下文窗口 | Claudian | P2 | DONE |
| F | R-F9 | 文件管理器右键「附加到上下文」 | 双方 | P1 | DONE |
| F | R-F10 | Grok 后端（ACP 一等接入） | Claudian | P2 | TODO |
| F | R-F11 | i18n 扩语种 | Claudian | P2 | TODO |
| F | R-F12 | `$` 技能触发符 / 可复用指令（评估） | Claudian | P3 | TODO |
| G | R-G1 | Collab 团队协作模式 | Claudian | 裁决 | TODO |
| G | R-G2 | 移动端轻量直连聊天 | Copilot | 裁决 | TODO |
| G | R-G3 | 多 agent fan-out 只读研究 | Copilot | 裁决 | TODO |
| G | R-G4 | 插件级 web 搜索供应商层 | Copilot | 裁决 | TODO |

---

## 3. 批次 D：对话资产

### R-D1 对话导出 / 另存为 Markdown 笔记（P0）

**目标**：Copilot 把对话保存为库内 Markdown 笔记（frontmatter + 正文，可同步、可搜索、可内链），OpenCodian 目前只有插件本地存储 + OpenCode `/share` 链接，**没有任何 Markdown 出口**。

**需求**

1. 命令 `export-conversation-markdown` + 会话历史菜单项：把当前（或指定）对话导出为 vault 内 Markdown 笔记。
2. 导出格式：frontmatter（backend、model、标题、起止时间、消息数）+ 正文（用户/助手轮次，保留 markdown 原文；工具调用与图片以折叠块或引用形式保留；图片导出为附件引用）。
3. 设置项：导出目录（默认 `opencodian-conversations/`）、文件名模板（`{$date}_{$topic}` 类）、自动导出开关（默认关）。
4. 导出为**纯新增文件**，不得触碰对话存储本身；失败时明确报错，不留半个文件。

**技术约束**

- 写入走 `vault.create`，纳入既有命名冲突策略（追加序号，不覆盖）。
- 消息序列化必须复用既有存储的消息结构（`StorageService` 全量消息），不得重新实现渲染管线；导出的是**原始 markdown**，不是渲染后的 HTML。
- i18n 双语文案；命令注册挂 `main.ts` 命令区，不进 `OpenCodianView`。

**验收**：导出后笔记可被 Obsidian 搜索/链接；重开对话导出幂等（同名追加序号）；四后端对话各导出一次结构合法。

**落地证据（2026-09-20，提交 `d2441942`）**：

- **实现**：`src/core/storage/ConversationMarkdownExporter.ts`（纯序列化：frontmatter 元数据 + 分轮标题 + 折叠工具调用 callout + 图片占位符）+ `ConversationMarkdownExportService.ts`（vault 编排：手动导出纯新增 `vault.create` + `-2/-3…` 冲突序号绝不覆盖；自动导出默认关、只刷新本功能创建的笔记、mtime 守卫检测用户编辑后诚实停用并提示；附件内容寻址去重；笔记写失败回收本次附件）。命令 `export-conversation-markdown` + 历史菜单每条会话导出按钮（可选 host 缝）；`saveConversation` 后自动导出钩子在设置关或无新回复时零成本。设置 `conversationExport`（目录/模板/自动导出）含 load 归一化 + 「会话 → 导出」二级 tab + zh/en 双语。
- **测试**：`ConversationMarkdownExporter.test.ts` 14 例（序列化结构、冲突序号幂等、附件去重、失败回收、自动导出创建→原地刷新、用户编辑停用+回调、删除后重建、设置归一化含不安全目录拒绝）+ 设置三件套断言更新（settingsLayoutRegistry / SettingsTabbedRenderer / SettingsConversationSection）。`npm run verify` 15/15 PASS（lint 零警告）。
- **实机（Test Vault，BUILD_ID `zcode-advantage-parity.202609202228`，四文件 cmp 逐字节一致，plugin reload 后运行时确认新服务/设置/命令在场）**：直连与 byId 双路径导出成功，同名重复导出实测追加 `-2`/`-3` 序号；导出笔记被 Obsidian 索引并渲染为属性面板（截图 `exported-note-reading.png`：frontmatter → 笔记属性、`## User/Assistant · 时间` 轮次标题、`> [!example]- Tool calls (1)` 折叠 callout）。**四后端各导出一次全部成功**（opencode/claude-code/codex/pi 各生成独立结构合法笔记，`2026-09-20_R-D1_四后端结构验证_<backend>.md`）。
- **视觉验收门（有界两轮）**：设置「导出」tab 截图 `settings-export-tab.png`（+2x 裁剪 `strip-crop2.png`）——标题/名称对比度 **12.32:1**、描述 **9.75:1**（≥4.5:1）；名称 13px/18.2 w700、描述 12px/18.6 与全设置面一致；无文本溢出（`scrollWidth == clientWidth` 实测）；8 个二级 pill 全渲染、「导出」激活（描边高亮，DOM 命中测试 + 2x 裁剪双确认）。历史菜单截图 `history-dropdown-export.png`——导出按钮 **26×26** 与重命名按钮同尺寸同行对齐（视觉子代理 PASS）。修复轮：路径类输入接 `opencodian-wide-text-setting`（152px→**253px**，值 159px 完整显示）+ title 悬停；序列化缺陷修复：callout 续行补 `> ` 前缀（实机发现的回归，含单测断言）。截图存 worktree `.visual-evidence/rd1/`。
- **偏差登记**：Q1 建议照办（自动导出默认关）；自动导出对**自己创建且未被用户修改**的笔记做原地 `vault.modify` 刷新（Copilot autosave 同型行为），手动导出仍纯新增——这是对「纯新增」约束在自动路径上的显式放宽，已在本节与技术注释双处声明。

### R-D2 API 密钥入 Obsidian Keychain（P1）

**目标**：Copilot 用 Obsidian 1.11.4+ 的 Keychain API 存 API key（不落 `data.json`）。OpenCodian 的 Pi 供应商密钥、自定义供应商密钥目前明文在设置数据里。

**需求**

1. 密钥写入 Keychain（`app.keychain` 可用时），`data.json` 只存占位引用。
2. 迁移：首次加载发现明文密钥 → 写入 Keychain → 明文字段清除（一次性、可回滚）。
3. Keychain 不可用（旧版宿主）→ 如实降级为现状存储并提示，不静默。

**验收**：迁移后 `data.json` 中 grep 不到任何密钥值；宿主降级场景行为一致；四后端连接不受影响。

**落地证据（2026-09-20/21，提交 `0412405c`）**：

- **实现**：`SettingsSecretsKeychain`（core.storage）挂在持久化边界——保存侧把真实密钥换成 `opencodian-keychain:v1:<key>` 占位符（先写入 `app.secretStorage`），加载侧还原 + 明文一次性迁移；**运行时设置对象始终持真实值**（auth 装配、远程控制脱敏、诊断等既有消费方零改动）。密钥面覆盖 7 处：server.auth.password/token、codex/pi 后端 apiKey、自定义供应商 `providers[].apiKey`（按稳定 id 定键）、图片生成模型 `imageGenerationModels[].apiKey`、remoteControlToken。**API 事实修正**：`app.keychain` 不存在，1.11.4+ 唯一面是 `app.secretStorage`（经参考插件源码核实；id 约束 `^[a-z0-9-]+$` ≤64，本实现按 `oc<vaultHash8>-<slug>` 分域，不同库互不可读）。回滚 = `secretsKeychainEnabled` 开关（通用设置区，两个设置面共用行）；降级路径全部经 load report → main.ts 本地化 Notice（不静默）；钥匙串写失败保留明文继续落盘（凭证永不因钥匙串故障丢失）。
- **测试**：`SettingsSecretsKeychain.test.ts` 12 例（占位符/id 合规与 vault 分域、scrub 全字段 + 输入不可变、禁用/不可用/写失败保留明文、冗余写跳过、占位符还原、明文一次性迁移不重复、条目缺失/无存储诚实降级、StorageService 集成：盘上无密钥字节/回滚写回明文/保存-加载往返）+ main/themeSettingsMigration 测试桩同步。verify 15/15 PASS（lint 零警告）。
- **实机（Test Vault，BUILD_ID `zcode-advantage-parity.202609210001`）**：设 codex 密钥 + 供应商密钥 → 保存 → `settings.core.json` 仅剩占位符（`plaintextOnDisk: false`）且 `app.secretStorage.getSecret` 按计算出的 vault 分域 id 读回真实值（两处 `Ok: true`）；插件重载后运行时设置还原为真实密钥；**回滚实测**：开关关 → 盘上回到明文，开关重开 → 盘上回到占位符；测试密钥已清理（secretStorage `listSecrets` 为空）。验收项「grep 不到密钥值」以 `plaintextOnDisk: false` + 磁盘逐字检查达成。
- **视觉验收**：通用 → 基础区开关行（截图 `.visual-evidence/rd2/secrets-toggle.png`）视觉子代理一轮 PASS：名称/描述字号、左对齐、右侧控件右对齐、toggle 44×20 可用态与相邻行完全一致，描述 4 行无截断不重叠；主代理实测名称 13px/18.2 w700、描述 12px/18.6。

### R-D3 轮次完成通知音效（P3）

设置项（默认关）+ 完成时播放短音（内置一个资源 + 可选自定义文件路径）；仅后台任务与非聚焦窗口触发，避免前台打扰。小件，随手做。

**落地证据（2026-09-21，提交 `aed5e1c9`）**：`TurnCompletionSoundService`（feature.chat-services，全注入缝）——内置双音提示（C6→E6 正弦 0.28s，构建期合成的 base64 WAV，零外部资产）或库内自定义音频（`vault.getResourcePath` 解析；不可解析→本地化 Notice + 回退内置）；触发门 = 默认关 且（后台任务会话 或 窗口未聚焦）；`main.ts saveConversation` 以 `lastResponseAt` 前进为轮次完成信号；播放拒绝只记日志。测试 `TurnCompletionSoundService.test.ts` 7 例 + verify 15/15。实机（BUILD_ID `202609210011`）：服务在场、默认值 off/空、禁用门与播放门结果正确，且内置 WAV 在真实 Obsidian 中 `play()` resolve、duration 0.28s、readyState 4、currentTime 前进（真实解码播放）；视觉门两轮 PASS（截图 `.visual-evidence/rd3/rd3-sound-settings.png`：两行与同块字号/对齐/行距一致，宽输入 289px+、占位符完整、toggle 可用态）。

---

## 4. 批次 E：上下文与检索

### R-E1 URL / 网页内容上下文（P1）

**目标**：Copilot 支持 URL/YouTube/Twitter 提及（云端解析）。OpenCodian 上下文目前完全限于 vault 内 + 图片。

**需求**

1. Composer 粘贴或输入 URL（http/https）→ 出现「网页」上下文 chip；发送前本地抓取（`requestUrl`）转 Markdown 存为该条目的快照。
2. 抓取成功后内容进入 `<attached_context>` 同一等通道（四后端可用）；失败（超时/非 HTML/robots 拒绝）→ 条目如实标注「抓取失败」，不静默剔除。
3. 每条 URL 内容截断上限（沿用上下文字符预算）；YouTube 链接仅当可取得字幕文本时作为文本上下文，取不到则如实标注。
4. **默认开箱可用但仅限用户显式粘贴的 URL**——不自动抓取消息正文里出现的链接（与「不自动注入」原则一致）。

**技术约束**：不走任何第三方云解析服务（与 Copilot 的 Brevilabs 路线刻意不同）；HTML→MD 的转换需选型（零依赖正则降级可接受，但不渲染脚本/样式）；SSRF 防护：拒绝解析结果指回 `127.0.0.1`/内网段的重定向（插件自身就有本地端口，必须防回环）。

**验收**：粘贴文章 URL → chip → 模型能引用其中内容；内网重定向被拒；失败路径如实标注。

**落地证据（2026-09-21，提交 `a49809db`）**：

- **实现**：`UrlContextFetchService`（feature.chat-services）——`node:http(s)` 传输**手控重定向**（Obsidian `requestUrl` 不透明自动跟随，弃用）逐跳跟随 + 每跳守卫 + 15s 超时 + 2MB 上限；零依赖正则 HTML→MD 降级（script/style/head 等剔除、结构保留、实体解码、按 UTF-8 字节截断到共享 60KiB 预算并标 truncated）。**SSRF 三层**：前置拒（非 http(s) 方案/私有回环保留 IP 字面量含 IPv6 方括号/localhost·`.local`·`.internal` 族）→ DNS 预解析拒内网 → 每个重定向跳重跑守卫。序列化走既有 `<obsidian_context>` 合成 text part（PDF 先例，本地/远程一致，四后端同通道）；`partitionExistingContextItems` 豁免 url 条目。composer 粘贴：整个粘贴为一条 URL 才拦截成 chip（嵌在长文本里的链接永不抓取，与「不自动注入」一致）。YouTube：watch 页转换后正文 < 300 字符 → `youtube-transcript-unavailable` 如实失败，不伪造。失败路径：条目保留 + `failureReason`、注入标签带显式失败头、发送时本地化 Notice、已发消息 chip 带「抓取失败」徽标并外链打开。
- **测试**：`UrlContextFetchService.test.ts` 12 例（IPv4/IPv6 私有段、localhost 族与非 http 方案前置拒、转换器结构/剔除/实体、抓取 ok/首跳 DNS 拒/**重定向回环拒**/非 HTML/HTTP 错/超时、YouTube 无字幕、字节预算截断、按 id 回填不串 chip）；verify 15/15。
- **实机（Test Vault，BUILD_ID `202609210040`）**：①SSRF 守卫活体验——真实 renderer 中 `127.0.0.1:4196`/`localhost:4096`/`10.0.0.1` 全部 `refused: blocked-private-target`；②手控重定向活体验——`http://github.com` 首跳 301 + Location 可读、跟随 `https://github.com` 200、`example.com` 200 返回 HTML（node 内建在构建中为 external、渲染器运行时解析）；③粘贴→chip 实证——合成 paste 事件被拦截（`defaultPrevented: true`）、URL chip 出现、URL 文本未落入输入框。
- **视觉验收**：composer URL chip（截图 `.visual-evidence/re1/re1-url-chip.png`）视觉子代理像素级 PASS——与相邻笔记 chip 共享胶囊几何（高 28px/圆角 10px/12px 字号/同填充），状态差异（实线已附加 vs 虚线预览斜体）为既有设计态；截断机制（ellipsis）CSS 在位；与 +/图片按钮行左缘精确对齐、行间距 ~7.5px≈gap 6px。

### R-E2 Web Viewer 标签页上下文（P2）

Obsidian 核心 Web Viewer 插件的活动标签页（URL + 选区）作为上下文来源；未启用 Web Viewer 时入口不出现。依赖 R-E1 的网页上下文条目类型。

**落地证据（2026-09-21，提交 `8aee3c30`）**：

- **实现**：`WebViewerContextService`（feature.chat-services）——可用性门 = 核心 Web Viewer 插件启用（`internalPlugins.plugins.webviewer.enabled`，1.13.7 实测 API 面）且活动叶 viewType `'webviewer'` 且 state.url 为 http(s)；附加 = R-E1 pending url 条目（标签页标题进 label 与 `url.title`），发送时本地抓取与 SSRF 守卫逐字复用。入口两处：composer globe 按钮（双 host 缝 + 当前标签页可解析才渲染，点击时重验、失效自移除）、命令 `attach-webviewer-tab-to-context`（checkCallback 在核心插件未启用时返回 false 即命令不存在；活动页非 webviewer 如实 Notice）。
- **测试**：`WebViewerContextService.test.ts` 5 例（可用性门、活动叶/webviewer/URL/state 异常全拒、条目构造含标题回退）+ verify 15/15。
- **实机（BUILD_ID `202609210137`）**：webviewer 开 example.com → 命令附加出 chip「Example Domain」（title=标签页标题、tooltip=URL）；globe 按钮在场 42×30、与星标同级、四按钮同轴（像素级）。截图 `.visual-evidence/re2/re2-globe.png`。
- **偏差登记**：原文「URL + 选区」收敛为 URL——R-E1 发送时抓取整页，选区文本已完整覆盖，单独附加不增信息量；选区专属条目（新 kind + composer 引用缝）待真实需求再立项。`<webview>` 的 executeJavaScript 可达性已探明（选区技术上可取），记录备查。

### R-E3 相关笔记面板（P1）

**目标**：Copilot 的 Relevant Notes 是高频入口：按当前活动笔记给出「链接图谱相关 + 检索相关」双通道笔记列表，实时更新。

**需求**

1. 独立侧栏视图 `opencodian-relevant-notes`：当前活动笔记的相关笔记列表（出链/入链邻居 + R-C1 检索索引按相似度取 TopN），两通道分组展示、可折叠。
2. 随活动笔记切换实时刷新（防抖）；点击条目打开笔记；每条提供「附加到聊天上下文」按钮（复用 `add-current-note-to-context` 的通道）。
3. 检索通道复用 R-C1 的 `.opencodian/vault-index/`，**不建第二套索引**。

**验收**：切笔记后列表更新；图谱通道与 Obsidian 反链面板结论一致；附加按钮产生与手选一致的上下文条目。

**落地证据（2026-09-21，提交 `5651232f`）**：

- **实现**：`opencodian-relevant-notes` ItemView（feature.chat-shell 归属、port 化不 import main）——图谱通道读 `metadataCache.resolvedLinks`（与反链面板同源同结论），检索通道**复用** R-C1 `VaultIndexService.select`（查询=活动笔记清洗文本，零第二索引）；500ms 防抖跟随 active-leaf-change 与 resolved 变化，异步刷新带序号守卫；诚实状态（检索未启用→明示提示、非 md/无笔记→空态、失败→可见错误行）；条目点击开笔记、附加按钮走 main.ts 共享 `ContextAttachmentBuilder` 通道。纯计算（邻居合并排序/查询构造/折叠去重）在 `RelevantNotesModel.ts`；样式 `relevant-notes.css` 全取主题变量。命令 `open-relevant-notes`。
- **测试**：`RelevantNotesModel.test.ts` 7 例（图谱出入链合并/自环排除/排序平分、查询剥离 frontmatter/代码块/限长、折叠去重取最高分/排除活动笔记/确定性排序）+ verify 15/15。
- **实机（Test Vault，BUILD_ID `202609210116`）**：构造 hub↔a↔b 链接簇 + 词汇相关 c.md——图谱通道列出 a/b（各 2 条链接，与反链结论一致）；临时启用 R-C1 后检索通道 Top 命中 c.md（相似度 11）并含 a/b，切到 a.md 后双通道即时更新（hub 图谱 2 条 + 检索 hub 12 分等）；附加按钮点击实证产出 chip `re3-test/a.md`（与手选逐字段一致）；测试笔记已 vault.trash 清理。视觉门 PASS（截图 `.visual-evidence/re3/re3-panel.png`：条目行 45×430、附加按钮 24×24 垂直居中、标题 13px/16.9 **对比度 12.2:1**、meta **9.7:1**，与宿主主题完全协调，无裸元素）。

### R-E4 语义检索增强层（P2）

**目标**：R-C1 目前只有词面检索；Copilot 靠外部 Miyo 提供语义通道。OpenCodian 的补齐方式必须**插件内自洽**。

**需求**

1. 在 R-C1 索引之上加可选 embedding 通道：向量生成走「已配置的模型供应商 embedding 端点或 OpenCode 服务端 embedding」，本地向量存储（插件数据目录，内容寻址）。
2. 默认关闭；开启后检索注入 = 词面 ∪ 语义 TopK 合并去重；UI 如实标注每条命中来自哪个通道。
3. 无可用 embedding 端点时如实提示降级为纯词面，不伪造。

**技术约束**：先出独立设计文档（存储规模、增量更新、包体积零新增——不引入向量库依赖，用平铺余弦即可，万篇级内存可控性需测算）；§8 Q3 的「先词面」裁决本条为后续增强层，不推翻。

**落地证据（2026-09-21，提交 `41b7c70f`，设计文档 `advantage-parity-re4-design.md`）**：

- **实现**：`VaultEmbeddingIndexService`（core.memory）——**笔记级向量**（规模测算入设计文档：10k×1536 维 float32 ≈ 61MB 上界，chunk 级被规模数学否决）、内容哈希增量（未变跳过/已删移除/150ms 串行节流）、分片 base64-float32 存储于 `.opencodian/vault-embeddings/`、平铺余弦 TopK。端点 = 用户所选自定义供应商的 OpenAI 兼容 `/embeddings`（**Q3 裁决落地**：OpenCode 服务端无公开 embedding 面——设计文档核实后放弃该候选；本地 Ollama 合法故不做回环拦截，与 R-E1 语义差异已在文档明示）。注入合并：词面优先 ∪ 语义补位去重，条目带 `retrievalChannel`，composer 与已发消息 chip 徽标「检索·词面/检索·语义」如实分标；语义失败诚实降级为纯词面不破坏刷新。设置：开关默认 **false**（关时行为与特性存在前逐字节一致，Q3「先词面」不推翻）+ 供应商下拉 + 模型宽输入，未配置/供应商缺失如实 Notice。
- **测试**：`VaultEmbeddingIndexService.test.ts` 6 例（float32 编解码往返、余弦、嵌入文本清洗/哈希、索引+排序+增量跳过+删除、三类降级原因与零伪造命中）+ `vaultRetrievalComposerSemantic.test.ts` 3 例（合并去重+通道标注、语义异常回退纯词面、开关关时永不查询语义）+ verify 15/15。
- **实机（BUILD_ID `202609210934`）**：默认值 false；开启但未配置 → `query` 实测返回 `{ hits: [], degradation: 'not-configured' }`（诚实降级路径活体）；设置三行实测（toggle 44×20 可用、供应商下拉正常形态、模型宽输入 289px + 占位符可见）。视觉门有界两轮 PASS（第一轮截图滚动未覆盖后两行——测量已证在场；第二轮完整证据：字号/对齐/间距与同块一致、描述完整、宽输入占位符可见）。截图 `.visual-evidence/re4/re4-settings.png`。
- **偏差登记**：无。语义命中为笔记级条目（无行区间），与词面条目（带行区间片段）形态不同但通道标注诚实区分。

### R-E5 Dataview / Bases 上下文支持（P2）

上下文构建时：dataview 代码块执行结果内联（宿主 Dataview 插件 API 可用时）；`.base` 文件以文本形态进上下文。不可用时如实标注，不静默跳过。

**落地证据（2026-09-21，提交 `8a71e700`）**：`DataviewContextInliner`（feature.chat-services）——插件物化文本快照时（远程模式读取路径，`ContextAttachmentBuilder` 接入）```dataview/```dataviewjs 块经宿主 `dataview.api.queryMarkdown` 执行内联渲染结果；插件缺失或单块失败 → 原文保留 + 显式 `[dataview blocks present but …]` 标记行（逐块降级、重复块去重）；**本地服务器模式给后端文件 URL（agent 读原文），该模式不做变换**（调用点文档化）。`.base` 进 mime 映射 `text/plain` 以纯文本附加。测试 `DataviewContextInliner.test.ts` 5 例（内联成功/缺失标记/逐块降级/去重/纯文直通）+ verify 15/15。实机：`.base` 附加实证（chip=`re5-test.base`，已清理）；测试库未装 Dataview（恰为文档化的如实降级态，`getDataviewApi` 返回 null 路径与单测一致）。无新 UI 面，视觉门不适用。

### R-E6 选区 / 全库 token 计数命令（P2）

命令：选区词数/token 估算；全库（R-C1 索引范围）token 估算。估算复用既有 tokenizer 常量；结果 Notice + 复制。小件。

**落地证据（2026-09-21，提交 `c488853b`）**：`shared/tokenEstimate.ts`（启发式：拉丁 ~4 字符/token、CJK ~1.2 token/字符、ceil；**定位数字非计费数字**——权威用量仍是后端 ContextRing 快照；既有 `tokenize()` 是词面匹配器非估算器，故新写并文档化）+ 命令 `count-selection-tokens`（空选区如实 Notice）与 `count-vault-tokens`（R-C1 范围 = `isIndexablePath` 共享匹配器过滤 markdown 后逐篇 cachedRead 汇总），Notice + 剪贴板。测试 `tokenEstimate.test.ts` 5 例 + verify 15/15。实机（BUILD_ID `202609210906`）：全库命令对测试库 63 篇输出「404844 字符 / 约 168460 token」且剪贴板完整落盘。owner manifest 因新 shared 文件刷新 63 页概览注记（边界未变）。无 UI 面（命令 + Notice），视觉门不适用。

---

## 5. 批次 F：会话交互与运行时

### R-F1 Turn steering + 流式中消息排队（P1）

**目标**：Claudian 在 agent 运行中允许注入新输入（codex/grok/pi 原生支持），并把流式期间的排队消息合并而非丢弃。OpenCodian 目前流式中只能取消。

**需求**

1. 流式期间输入框允许「排队发送」：消息进入本 tab 队列，轮次结束后自动作为下一轮发出；队列可见、可逐条撤回。
2. 后端原生支持轮内注入时（先做 codex/pi 的能力探测），提供「立即注入」模式：排队消息即时进入当前轮（steering）；不支持的后端如实显示「将在本轮结束后发送」。
3. 排队不改变多 tab 并发语义；每 tab 独立队列。

**技术约束**：能力探测挂 `AgentCapability`（新增 `TurnSteering`）；注入走各后端既有会话缝（codex app-server / pi RPC），不新起会话；默认行为保持「排队」模式，steering 由用户显式选择。

**验收**：codex/pi 上注入的补充指令改变当轮输出方向；claude 上排队消息轮后自动发出；取消轮次时队列保留且可撤回。

**落地证据（2026-09-21，提交 `bf18c4aa`）**：

- **实现**：一槽 `queuedFollowUpSend` 升级为每 tab **多条 FIFO** `queuedFollowUpSends`（流式中多条排队、turn 结束逐条经既有 `sendQueuedFollowUp` 链自动发出、队列在 tab 运行时态——取消轮次天然保留且可撤回）；`QueuedFollowUpBarCoordinator` 在 composer chips 行上方渲染可见队列条（每条预览 + 撤回按钮；状态行按后端如实分流：可注入→每条 ⚡ 实底强调钮；否则明示「将在本轮结束后自动发送」；空闲→每条 ➤ 立即发送钮）；`AgentCapability.TurnSteering` + `AgentTurnSteeringCapability.steerTurn`（注入活动轮，绝不新起会话）。**pi 原生缝实证**（探针脚本直连 RPC）：忙时无 `streamingBehavior` 的 prompt 被明确拒绝且报错指名 `'steer'|'followUp'` 参数——`PiAdapter.steerTurn` 即发 `{type:'prompt', streamingBehavior:'steer'}`；codex/claude-code **不声明**该能力（诚实队列文案）。
- **测试**：`QueuedFollowUp.test.ts` 5 例（FIFO 多条、按下标撤回、流结束队列存活、steer ACK/拒绝/无活动 run 三态）+ 既有 follow-up 三套件按 FIFO 语义更新 + capability 清单补 turn-steering + verify 15/15。
- **实机（BUILD_ID `202609211032`）**：队列条 2 条目渲染（388×121）、⚡/✕ 均 22×22、撤回正确移除目标条、`steerTurn('nonexistent')`→false（无活动 run 诚实降级）、空闲切换 ➤ 发送钮、空队列隐藏；⚡ 实底 rgb(24,24,27)+图标 rgb(250,250,250) vs ✕ 幽灵态实测可区分。视觉门两轮 PASS（首轮截图程序问题 + 按钮区分缺陷；根因两条均已修：`button:not(.clickable-icon)` 特异性压单类→选择器提权；聊天容器 accent 重映射单色系→改结构性实底区分，CSS 内注释留档）。截图 `.visual-evidence/rf1/rf1-queue-bar.png`。
- **偏差登记**：pi 上「注入改变当轮输出方向」以 RPC 契约实证（streamingBehavior:'steer' ACK + continue）为准，未跑完整端到端对话（测试库 pi CLI 路径未配置）；codex 侧 SDK Thread 无轮内输入 API（0.155.1 类型面核实），按能力探测结果走队列模式——与需求「先做能力探测」一致。

### R-F2 会话-笔记绑定草稿（P2）

Claudian 的 linked content：会话可绑定一篇笔记作为产出草稿（auto-draft/explicit-draft/submitting/locked 四态，重命名跟随）。OpenCodian 适配：会话设置里可选「绑定笔记」，绑定的笔记变更纳入 R-B3 快照与 Modified Files 侧栏联动；不做自动写回（写路径仍归 agent 工具 + 唯一写路径约束）。

### R-F3 回退预览 + 冲突检测 UI（P2）

R-B3 回退前显示预览：将恢复的文件清单 + 每文件 before/after 行数统计；生成后文件内容若已被用户后续修改（快照后又有新变更）→ 冲突标记并要求二选一。纯 UI 层，回退语义不动。

### R-F4 暖进程池（P2）

Claudian 预热最多 N 个 agent 运行时降低起会话延迟。OpenCodian 适配：仅对「最近使用的默认后端」维持 1 个预热空会话（可关，默认关）；必须复用 R-C3 已落地的暖会话基础设施，不另建池；预热会话不产生任何计费轮次。

### R-F5 双栏会话管理器（P3）

主区聊天 + 常驻侧栏会话浏览并排（设置项，默认关）。UI 布局件，价值中等。

### R-F6 Vim 风格聊天导航键（P3）

聊天区 `w`/`s`/`i`（可配置）滚动/聚焦输入。小件。

### R-F7 每供应商环境变量分域 + 环境哈希失效（P2）

Claudian 把环境变量按 `shared` / `provider:*` 分域，环境指纹变化即失效旧会话。OpenCodian 已有 Claude env 与 additional directories；本条统一为分域模型 + 会话失效信号，防止「改了 key 旧会话还在用旧环境」。

### R-F8 自定义模型自定义上下文窗口（P2）

自定义 OpenAI 兼容模型缺权威 context window 元数据时，允许用户为模型声明上限（ContextRing 与压缩阈值消费）。落点：模型目录条目加可选 `contextWindowOverride`。

**落地证据（2026-09-21，提交 `0a9455bf`）**：

- **实现**：设置 `modelContextWindowOverrides`（`provider/model → 正整数 token` 映射，load 边界归一化：ref 形态/正整数校验、数字字符串可 coercion）+ `applyContextWindowOverrides`（**纯目录装饰：只填无 contextWindow 的条目，绝不覆盖真实元数据**），在 `ModelConfigService.getCatalogs` 对 local/server/baseEffective/effective **四个 catalog 面统一施加**——选择器、ContextRing 百分比、压缩阈值经既有 contextWindow 流消费，**零消费方改动**。`ContextWindowOverrideModal`（feature 层窄 port，不 import 应用层）：校验表单 + 逐条移除；模型区通用 tab「管理声明」入口。
- **测试**：`contextWindowOverride.test.ts` 6 例（只填缺失/绝不覆盖、空映射原样返回、无匹配 ref 无操作、纯函数不 mutate、归一化弃垃圾、非 record 输入空对象）+ verify 15/15。
- **实机（BUILD_ID `202609211137`）**：设置默认 `{}`；模型通用 tab 行实测（名称 13px/18.2、描述 12px/18.6、行 497×126、管理按钮与相邻行右缘同列）；modal 三输入表单 + 诚实空态渲染正常。视觉门两图 PASS（`.visual-evidence/rf8/rf8-row.png`、`rf8-modal.png`；对比度 1.65/2.09 与同 tab 全部行同色同处理——主题整体风格，非本行回归）。注：测试库无 opencode 模型目录（pi 活动后端），catalog 填充路径以单测覆盖为准，UI 走临时启用 opencode 后端验证并已恢复。

### R-F9 文件管理器右键「附加到上下文」（P1）

资源管理器文件/文件夹右键菜单项：附加到当前 tab 聊天上下文（走 R-A7 的多选/文件夹条目通道）。小件、高频。

**落地证据（2026-09-21，提交 `a26b1d10`）**：main.ts 注册 `file-menu` 事件——菜单项「附加到 OpenCodian 聊天上下文」（plus-circle 图标，zh/en 双语）；点击经 `attachVaultEntryToActiveChatContext` 委托到共享 `ContextAttachmentBuilder.buildEntryContextItem`（与 `+` picker **同一入口**：文件保持 file 路径、文件夹为 path-only 目录条目、PDF 走文本层提取路径——chip 与手选逐字段一致，四后端同通道）。测试：main.test.ts 新增委托契约 1 例（真实 builder：TFolder → kind `folder`、mime `application/x-directory`、无快照）+ 既有 entry builder 覆盖（folder/file/PDF）+ verify 15/15。实机（BUILD_ID `202609210953`）：以探针 Menu 直接触发 workspace `file-menu` 事件——文件与文件夹目标均出现本菜单项，点击文件夹变体实证捕获 `{kind: 'folder'}` chip 落入活动 tab。原生菜单铬 + 既有 chip 组件，无自绘面（视觉门不适用，同 R-E5 惯例登记）。

### R-F10 Grok 后端（P2）

经既有 ACP 机制一等接入 grok（Claudian 的 Grok 走 ACP native connection）：预置 ACP agent 配置 + 模型发现 + 能力矩阵行。先做可行性验证（grok CLI 的 ACP 兼容面），验证失败如实登记。

### R-F11 i18n 扩语种（P2）

zh-TW/ja/ko/de/fr/es/ru/pt 八语种（Claudian 同款清单）。i18n 框架已就绪（en/zh 键完备），需要翻译流水线与缺键回退策略；分批做，每批跑 `obsidian-plugin-i18n` 技能流程。

### R-F12 `$` 技能触发符 / 可复用指令（P3，评估）

Claudian 用 `$` 调技能、`/instruction` 保存可复用指令。OpenCodian 斜杠命令已含 skills-as-commands 与 project/user 命令，功能面基本等价——**建议 WONTFIX**，除非用户指出具体缺口。

---

## 6. 批次 G：裁决项（默认不动）

| # | 需求 | 内容 | 建议 |
|---|---|---|---|
| R-G1 | Collab 团队协作 | Claudian 的工单/变更评审/冲突解决/LAN+云同步子系统（60+ 文件 + 独立云服务器仓库） | 独立产品决策，不作为「对齐项」自动启动；若立项需单独立项文档与安全设计（网络面大） |
| R-G2 | 移动端轻量聊天 | Copilot 的 BYOK 直连 Quick Chat 可上移动端（agent 桌面限定） | 架构性：需独立轻量会话栈 + 移动端构建验证，先出可行性文档 |
| R-G3 | 多 agent fan-out | 一次只读研究任务同时派多个后端 agent | 依赖多 tab 基建，可复用后台任务面板；价值待用户确认 |
| R-G4 | 插件级 web 搜索供应商层 | Firecrawl/Perplexity/Exa 等可切换搜索 + 引用 UI | 四后端 agent 已自带 web search；除非「非 agent 直连模式」立项，否则倾向 WONTFIX |

---

## 7. 跨批次硬约束

1. 沿用 `flowtext-parity.md` §6 全部约束（只读辅助契约、唯一写路径、脏检查、fail-closed、后端无关验收、自动注入显式可见、能力缺失如实呈现）。
2. **不引入第三方云服务依赖**：对标插件中走云端的能力（Copilot 的 Brevilabs 解析、Plus 门控、OpenArtifacts）一律以本地实现或放弃的方式继承。
3. **不新建平行系统**：检索复用 R-C1 索引、上下文复用 R-A7/obsidianContext 通道、回退复用 R-B3 快照、暖会话复用 R-C3 池。
4. 每条新设置同步 `settings.ts` 默认值/迁移 + 设置 UI + `zh.ts`/`en.ts`。
5. UI 能力四后端一致；某后端不支持的如实标注，不静默降级。

---

## 8. 开放问题

| # | 问题 | 建议 |
|---|---|---|
| Q1 | R-D1 自动导出是否默认开 | 默认关；手动命令先行，自动导出观察需求 |
| Q2 | R-E1 是否需要白名单域限制 | 首版不做域白名单，仅回环/内网防护；如需再加 |
| Q3 | R-E4 embedding 供应商选型（OpenCode 服务端 vs 各供应商 API vs 本地模型） | 先出设计文档测算成本与规模，倾向复用 OpenCode 服务端能力 |
| Q4 | R-F10 Grok 的 ACP 兼容性未验证 | 先可行性 spike，失败则登记 WONTFIX |
| Q5 | R-F11 翻译的维护策略（机翻 vs 人工校对） | 机翻底稿 + 用户常用语种优先人工校对 |
| Q6 | 批次顺序 D→E→F 是否固定 | D 批次最小可先行；E/F 可按用户反馈并行插队 |

---

## 9. 明确非目标

1. 不做 Copilot 的 Plus/云门控商业模式类能力。
2. 不做 Claudian 的 Collab 云服务器与 LAN 组网（除非 R-G1 立项裁决通过）。
3. 不复制两个插件的 React 组件栈/实现路径。
4. 不为对齐引入向量库、第二套检索栈、第二套上下文序列化。
5. 不改动既有只读辅助契约、唯一写路径、脏检查。
