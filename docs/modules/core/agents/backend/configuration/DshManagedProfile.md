# DshManagedProfile

源码：`src/core/agents/backend/configuration/DshManagedProfile.ts`

属于 `core.backend`。集中拥有 Native 与配置过的 ACP launch 的 vault 身份、机器本地 profile 定位、schema 准入以及临时桥接文件生命周期，避免两条传输各自实现持久目录边界。

- `resolveDshManagedProfile` 对 `vaultPath ?? cwd` 取 realpath 并计算 SHA-256；调用方应传原始 vaultPath，cwd 只控制子进程工作目录。通过已有 diagnostics root helper 复用 Electron userData / 平台本地路径选择，实际 root 为 `<userData>/OpenCodian/dsh/profiles/<hash>/<sdk|acp>`。测试可显式传允许的 profiles 父目录；拒绝与 vault 重叠，canonicalize 已存在祖先。
- `prepareDshManagedLaunch` 先严格校验 nativeConfig，再取得 declarative entries 和 revision。使用已有 CLI/Electron 载体，在 0700 随机临时目录写 0600 service、launcher 和 Native bridge patch。SDK bridge config 注入 nativeAnchor、canonical managedProfileRoot、nativeConfigRevision；ACP 不插入 Native bridge。headerCredentialRefs 与原生 entries 分开传递，解析值不落盘。
- `releaseDshLaunchScope` 只接受准备阶段分配的私有 launch scope，只清理已知桥接/overlay 文件和空目录；绝不接收持久 profile root。client 必须等待进程退出及未完成的 prepare，再释放临时 scope。

`assets/dsh/launcher.mjs` 负责子进程侧持久边界：allowlisted parent + hash/profile 后缀、canonical location、UID、不可 group/world 写、非 symlink 文件与真实 node_modules，以及 `.opencodian-dsh-profile.json` 所有权 marker。新 profile 必须为空；现有非本插件目录、被替换 marker、源 profile/installation 重叠、被重定向 package/lock/patch 均失败。

持久 package.json 只声明自有 `@opencodian/dsh-inherited-profile` file dependency 与扩展管理新增依赖，绝不复制共享 SDK dependency manifest 或链接共享 node_modules。继承 bundle 保留原文件解析的 `!!js` AST、相对插件/include URL、安装内 package name 和 name assertions。官方 createRuntimeResolution 提供安装依赖；ConfigEditor 与 PluginManager 重载仍读取同一持久 profile。library sparse overlay 最后合并于当前实际配置，随后加载受保护 bridge。缺失/歧义 namespace、任意输入表达式或继承 expression 与对象合并冲突失败。

ACP 默认模型有一层额外原生覆盖：`dsh-acp-app` 的 `acp` 行显式配置 provider/model，`dsh-acp` 的 `agentOptions` 会把它们传给新 Agent，因此单独覆盖 `agent-default-model` 不足以改变 ACP 新会话。launcher 仅在 `profile === 'acp'` 时把已保存的 `agent-default-model.provider/model` 映射为固定生成的 `acp` config patch，并深合并当前继承行，保留 `sessionListPageSize` 等其他配置。省略某字段就保留 ACP 行的该字段；重置后不生成 ACP patch，恢复实际 profile 的默认值，不从基础 agent 行推测。`reasoningEffort` 不写入 ACP config，交由 adapter 的新会话准入步骤处理；Native composition 不做此映射。

`DshManagedProfile.test.ts` 覆盖身份、配置准入、ACP restart/cancel、临时文件清理与持久 root 保留；`DshManagedLauncher.test.mjs` 覆盖 marker/symlink/权限、重启持久化、patch 顺序、相对路径与 credential bridge。设置 `DSH_PUBLIC_INSTALL` 可运行公开安装源码集成，直接验证 runProfile、ConfigEditor.edit、真实 resolver 和 provider dependency ordering；这些离线夹具不调用模型、不读取用户凭据。ACP 集成覆盖继承/完整保存/单字段保存/重置后的真实 `session/new` 配置回读，沿用同一持久目录并验证单会话修改不改变下次新建默认值。`RUN_DSH_ACP_DEFAULTS_LIVE=1` 配合 `DSH_PUBLIC_INSTALL` 启用 `DshAcpDefaults.live.test.ts`，使用真实 DshAdapter/DshAcpClient 与 synthetic low/high 模型目录，验证新会话 high、生效后显式 low 跨重连恢复、reset 恢复 ACP provider/model；任何模型 stream 调用都会导致测试失败。测试直接导入 launcher 源码，不构建或部署插件。

`DshTerminalBundle.installed.test.mjs` / `.ts` 与 `DshTerminalBundle.fixture.mjs` 通过三个独立 Node 进程验证已安装官方可选终端 bundle 的持久开关：普通 `config/extensions enable-bundle` 写入 managed manifest，下一进程直接读取并启用；disable 后第三进程确认停用。测试使用真实 dsh-base 提供的 agents、sandboxPolicy、subprocess、workingDirectory、tools 和 pluginManager/HMR，无需包安装。`optional-persistent-terminals` 的 `isolate.terminals: true` 保持不变，root context 不可见 terminals；桥必须只解析实际加载且类身份匹配的 `optional-terminal-registry` entry.context。实际 Loader 的 `group.subgroup === registry.parent` 成立，`registry.fiber.runtime.callback` 与 moduleNamespace.default 都等于官方 TerminalSessionService；不能假设代理 fiber 对象引用相等。两个已启用进程均在 owned workspace-write sandbox 中运行真实 PTY spawn/read/send/SIGINT/kill，验证跨 Agent 拒绝、子进程结束及零模型调用。连续 `control/capabilities` 读取要求 revision 不变；普通 disable/re-enable 后断言官方 registry 的 underlying identity 已替换、全部 capability flags 相同而 revision 增加，不依赖中间停用 flags 才发现变化。测试根保留于 OS 临时目录，不读取用户 profile/凭据，也不写共享安装 node_modules。未提供 `DSH_PUBLIC_INSTALL` / 官方 bundle 时显式跳过安装验收。
