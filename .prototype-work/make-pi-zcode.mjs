import { writeFileSync } from 'node:fs';
const field = (key, label, description, type, value, extra = {}) => ({ key, label, description, type, value, origin: extra.origin || 'native', store: extra.store, scope: extra.scope, effect: extra.effect, risk: extra.risk, source: extra.source || 'docs/research/backend-refresh/backend-fields-pi.md', ...extra });
const group = (title, description, fields, extra = {}) => ({ title, description, fields, ...extra });
const tab = (id, label, title, description, groups, extra = {}) => ({ id, label, title, description, groups, ...extra });
const choices = (values) => values.map(([value, label]) => ({ value, label }));
const native = (key, label, description, type, value, extra = {}) => field(key, label, description, type, value, { origin: 'native', store: extra.store || '原生 Pi 配置文件（版本校验）', ...extra });
const plugin = (key, label, description, type, value, extra = {}) => field(key, label, description, type, value, { origin: 'plugin', store: extra.store || `插件数据 → ${key}`, ...extra });
const action = (key, label, description, button, extra = {}) => field(key, label, description, 'action', '', { origin: 'action', button, ...extra });
const readback = (key, label, description, value, extra = {}) => field(key, label, description, 'readback', value, { origin: 'readback', readonly: true, ...extra });
const pi = {
  id: 'pi', mark: 'π', name: 'Pi',
  description: '配置 Pi 的原生 settings.json、models.json、认证和只读资源状态。原生文件仍由 Pi 自己管理，插件设置只保存安装覆盖和少量兼容旧值。',
  source: 'src/features/settings/backends/pi/SettingsPiSection.ts · assets/pi/configuration.mjs',
  tabs: [
    tab('connection', '连接', '连接与配置文件', '选择 Pi 可执行文件，并查看原生配置文件的作用域与版本边界。', [
      group('运行时连接', '插件拥有的安装覆盖，以及下一次 Pi 会话的生效时间。', [
        plugin('settings.backendSettings.pi.executablePath', 'Pi 可执行文件', '留空时自动解析官方 @earendil-works 或 @mariozechner 安装。', 'text', '', { placeholder: 'pi 或 /opt/homebrew/bin/pi', scope: '当前库', effect: '新会话', risk: 'medium', source: 'src/features/settings/backends/pi/SettingsPiSection.ts:154-176' }),
        action('pi.testConnection', '连接状态', '读取当前 CLI 的版本和 RPC 可用性。', '测试连接', { source: 'src/features/settings/backends/pi/SettingsPiSection.ts:178-205' }),
      ]),
      group('原生配置范围', 'settings.json 和 models.json 使用版本校验保存；插件不把原生配置复制成库默认值。', [
        native('configurationScope', '编辑范围', '选择 Pi 原生配置的全局或项目文件。', 'select', 'project', { options: choices([['global', '全局 ~/.pi/agent/settings.json'], ['project', '当前库 .pi/settings.json']]), scope: '全局 / 项目', effect: '立即', source: 'src/features/settings/backends/pi/SettingsPiConfigurationSection.ts:222-247' }),
        readback('configurationPath', '当前配置文件', '显示已解析的文件路径和版本号。', '当前库 .pi/settings.json', { source: 'src/features/settings/backends/pi/SettingsPiConfigurationSection.ts:247-268' }),
        action('pi.saveConfiguration', '配置保存', '保存前检查 revision，冲突时先重新载入或查看差异。', '保存并校验', { source: 'src/features/settings/backends/pi/SettingsPiConfigurationSection.ts:247-370' }),
        action('pi.configurationHistory', '配置历史', '在 Pi 提供历史接口时恢复原生配置。', '查看历史', { source: 'src/features/settings/backends/pi/SettingsPiConfigurationSection.ts:268-370' }),
      ]),
    ]),
    tab('providers', '提供商', '提供商与模型目录', '编辑 Pi 原生 models.json 中的提供商和模型覆盖；API 密钥属于原生配置，不复制到插件库设置。', [
      group('提供商条目', '每个提供商保存自己的协议、地址、认证表达式和兼容性覆盖。', [
        native('providers[].providerId', '提供商 ID', '稳定键；编辑已有条目时不可随意改变。', 'text', '', { placeholder: '例如 personal', source: 'src/features/settings/backends/pi/SettingsPiProvidersSection.ts:91-141' }),
        native('providers[].name', '显示名称', '提供商在目录和选择器中的名称。', 'text', '', { source: 'src/features/settings/backends/pi/SettingsPiProvidersSection.ts:91-141' }),
        native('providers[].baseUrl', 'Base URL', '提供商的 API 根地址。', 'text', '', { placeholder: 'https://api.example.com', source: 'src/features/settings/backends/pi/SettingsPiProvidersSection.ts:91-141' }),
        native('providers[].api', 'API 协议', '选择 Pi 已知协议；自定义值保留为原生 passthrough。', 'select', 'openai-completions', { options: choices([['openai-completions', 'OpenAI Completions'], ['openai-responses', 'OpenAI Responses'], ['anthropic-messages', 'Anthropic Messages'], ['google-generative-ai', 'Google Generative AI'], ['custom', '自定义协议']]), source: 'src/features/settings/backends/pi/SettingsPiProvidersSection.ts:175-182' }),
        native('providers[].apiKey', 'API Key 表达式', '密码型原生字段；母本只展示输入位置，不显示真实值。', 'password', '', { placeholder: '保持现有值不变', source: 'src/features/settings/backends/pi/SettingsPiProvidersSection.ts:103-123' }),
        native('providers[].authHeader', '认证请求头', '可继承、启用或关闭自定义认证头。', 'select', '', { options: choices([['', '继承'], ['true', '启用'], ['false', '关闭']]), source: 'src/features/settings/backends/pi/SettingsPiProvidersSection.ts:175-182' }),
        native('providers[].headers', '提供商请求头', 'JSON 对象；用于非标准请求头。', 'json', '{}', { source: 'src/features/settings/backends/pi/SettingsPiProvidersSection.ts:103-123' }),
        native('providers[].compat', '兼容性覆盖', 'JSON 对象；保存 Pi 原生兼容性选项。', 'json', '{}', { source: 'src/features/settings/backends/pi/SettingsPiProvidersSection.ts:103-123' }),
        native('providers[].modelOverrides', '模型覆盖映射', 'JSON 对象；仅覆盖该提供商的模型行为。', 'json', '{}', { source: 'src/features/settings/backends/pi/SettingsPiProvidersSection.ts:103-123' }),
      ]),
      group('模型条目', '模型目录的实际字段；成本、上下文和图像输入与提供商绑定。', [
        native('providers[].models[].id', '模型 ID', '提供商内的精确模型标识。', 'text', '', { source: 'src/features/settings/backends/pi/SettingsPiProvidersSection.ts:143-157' }),
        native('providers[].models[].name', '模型名称', '目录中的可读模型名称。', 'text', '', { source: 'src/features/settings/backends/pi/SettingsPiProvidersSection.ts:143-157' }),
        native('providers[].models[].baseUrl', '模型 Base URL', '可选的模型级地址覆盖。', 'text', '', { source: 'src/features/settings/backends/pi/SettingsPiProvidersSection.ts:143-157' }),
        native('providers[].models[].api', '模型 API', '模型级协议覆盖。', 'select', 'openai-completions', { options: choices([['openai-completions', 'OpenAI Completions'], ['openai-responses', 'OpenAI Responses'], ['anthropic-messages', 'Anthropic Messages'], ['google-generative-ai', 'Google Generative AI']]), source: 'src/features/settings/backends/pi/SettingsPiProvidersSection.ts:143-157' }),
        native('providers[].models[].reasoning', '支持推理', '三态值允许继承提供商能力。', 'select', '', { options: choices([['', '继承'], ['true', '支持'], ['false', '不支持']]), source: 'src/features/settings/backends/pi/SettingsPiProvidersSection.ts:143-157' }),
        native('providers[].models[].input', '输入类型', '支持 text 或 image；数组保存为原生字段。', 'list', ['text'], { source: 'src/features/settings/backends/pi/SettingsPiProvidersSection.ts:143-157' }),
        native('providers[].models[].contextWindow', '上下文窗口', '模型上下文 token 上限。', 'number', 0, { min: 0, source: 'src/features/settings/backends/pi/SettingsPiProvidersSection.ts:143-157' }),
        native('providers[].models[].maxTokens', '最大输出 token', '模型单次输出上限。', 'number', 0, { min: 0, source: 'src/features/settings/backends/pi/SettingsPiProvidersSection.ts:143-157' }),
        native('providers[].models[].cost.input', '输入成本', '原生成本元数据，不影响请求。', 'number', 0, { min: 0, step: 0.000001, source: 'src/features/settings/backends/pi/SettingsPiProvidersSection.ts:143-157' }),
        native('providers[].models[].cost.output', '输出成本', '原生成本元数据，不影响请求。', 'number', 0, { min: 0, step: 0.000001, source: 'src/features/settings/backends/pi/SettingsPiProvidersSection.ts:143-157' }),
        native('providers[].models[].cost.cacheRead', '缓存读取成本', '原生成本元数据。', 'number', 0, { min: 0, step: 0.000001, source: 'src/features/settings/backends/pi/SettingsPiProvidersSection.ts:143-157' }),
        native('providers[].models[].cost.cacheWrite', '缓存写入成本', '原生成本元数据。', 'number', 0, { min: 0, step: 0.000001, source: 'src/features/settings/backends/pi/SettingsPiProvidersSection.ts:143-157' }),
        native('providers[].models[].thinkingLevelMap', '思考等级映射', 'JSON 对象；把插件思考等级映射到提供商字段。', 'json', '{}', { source: 'src/features/settings/backends/pi/SettingsPiProvidersSection.ts:143-157' }),
        native('providers[].models[].headers', '模型请求头', '模型级 JSON 请求头覆盖。', 'json', '{}', { source: 'src/features/settings/backends/pi/SettingsPiProvidersSection.ts:143-157' }),
        native('providers[].models[].compat', '模型兼容性', '模型级 JSON 兼容性覆盖。', 'json', '{}', { source: 'src/features/settings/backends/pi/SettingsPiProvidersSection.ts:143-157' }),
        action('pi.saveModels', '模型目录保存', 'revision 校验后写回 Pi models.json。', '保存模型目录', { source: 'src/features/settings/backends/pi/SettingsPiProvidersSection.ts:192-198' }),
      ]),
    ]),
    tab('model', '模型与思考', '模型与思考默认值', 'Pi 的模型默认值以原生 settings.json 为准；插件旧版三字段仅作为可清理的兼容入口保留。', [
      group('原生模型默认值', '这些字段写入 Pi settings.json 的 model 组。', [
        native('model.defaultProvider', '默认提供商', '新会话继承的 provider ID。', 'text', '', { source: 'assets/pi/configuration.mjs:12-61' }),
        native('model.defaultModel', '默认模型', '新会话继承的模型 ID。', 'text', '', { source: 'assets/pi/configuration.mjs:12-61' }),
        native('model.defaultThinkingLevel', '默认思考等级', '新会话默认思考方式。', 'select', '', { options: choices([['', '继承'], ['off', '关闭'], ['minimal', '最低'], ['low', '低'], ['medium', '中'], ['high', '高'], ['xhigh', '极高'], ['max', '最大']]), source: 'assets/pi/configuration.mjs:12-61' }),
        native('model.enabledModels', '启用模型列表', '限制选择器可见模型；空列表遵循 Pi 默认目录。', 'list', [], { source: 'assets/pi/configuration.mjs:12-61' }),
        native('model.thinkingBudgets.minimal', '最低思考预算', '最小等级的 token 预算。', 'number', 0, { min: 0, source: 'assets/pi/configuration.mjs:12-61' }),
        native('model.thinkingBudgets.low', '低思考预算', '低等级的 token 预算。', 'number', 0, { min: 0, source: 'assets/pi/configuration.mjs:12-61' }),
        native('model.thinkingBudgets.medium', '中思考预算', '中等级的 token 预算。', 'number', 0, { min: 0, source: 'assets/pi/configuration.mjs:12-61' }),
        native('model.thinkingBudgets.high', '高思考预算', '高等级的 token 预算。', 'number', 0, { min: 0, source: 'assets/pi/configuration.mjs:12-61' }),
      ]),
      group('兼容旧设置', '旧版插件三字段不再覆盖原生默认值；清理后由 Pi 原生配置接管。', [
        plugin('settings.backendSettings.pi.thinkingLevel', '旧版思考等级', '仅用于迁移旧配置；留空表示交给 Pi 原生默认。', 'select', '', { options: choices([['', '继承'], ['off', '关闭'], ['minimal', '最低'], ['low', '低'], ['medium', '中'], ['high', '高'], ['xhigh', '极高'], ['max', '最大']]), effect: '新会话', source: 'src/features/settings/backends/pi/SettingsPiSection.ts:216-245' }),
        plugin('settings.backendSettings.pi.provider', '旧版提供商', '兼容旧值；建议改用原生 model.defaultProvider。', 'text', '', { source: 'src/features/settings/backends/pi/SettingsPiSection.ts:216-245' }),
        plugin('settings.backendSettings.pi.model', '旧版模型', '兼容旧值；建议改用原生 model.defaultModel。', 'text', '', { source: 'src/features/settings/backends/pi/SettingsPiSection.ts:216-245' }),
        action('pi.clearLegacyDefaults', '使用原生默认值', '清除三项旧版插件默认值。', '清除旧版值', { source: 'src/features/settings/backends/pi/SettingsPiSection.ts:107-112' }),
      ]),
    ]),
    tab('execution', '执行与上下文', '执行、压缩与上下文', '把 Pi 的传输、跟随输入、压缩、重试、Shell 和图像行为按原生 execution 组展开。', [
      group('执行行为', '保存到 settings.json 的 execution 组。', [
        native('execution.transport', '传输方式', 'Pi 与模型服务的传输方式。', 'select', 'auto', { options: choices([['auto', '自动'], ['sse', 'SSE'], ['websocket', 'WebSocket']]), source: 'assets/pi/configuration.mjs:12-61' }),
        native('execution.steeringMode', '插入模式', '处理中收到新输入时的处理方式。', 'select', 'all', { options: choices([['all', '全部接收'], ['one-at-a-time', '逐条处理']]), source: 'assets/pi/configuration.mjs:12-61' }),
        native('execution.followUpMode', '后续输入模式', '当前 turn 结束后的后续输入策略。', 'select', 'all', { options: choices([['all', '全部接收'], ['one-at-a-time', '逐条处理']]), source: 'assets/pi/configuration.mjs:12-61' }),
        native('execution.compaction.enabled', '启用压缩', '达到上下文阈值时自动压缩。', 'toggle', true, { source: 'assets/pi/configuration.mjs:12-61' }),
        native('execution.compaction.reserveTokens', '压缩预留 token', '为压缩和后续回答预留的 token。', 'number', 0, { min: 0, source: 'assets/pi/configuration.mjs:12-61' }),
        native('execution.compaction.keepRecentTokens', '保留最近 token', '压缩时保留的最近上下文量。', 'number', 0, { min: 0, source: 'assets/pi/configuration.mjs:12-61' }),
        native('execution.branchSummary.reserveTokens', '分支摘要预留 token', '分支摘要的预算。', 'number', 0, { min: 0, source: 'assets/pi/configuration.mjs:12-61' }),
        native('execution.branchSummary.skipPrompt', '跳过分支摘要提示', '高级字段；不再询问摘要提示。', 'toggle', false, { source: 'assets/pi/configuration.mjs:12-61' }),
      ]),
      group('重试与进程', '模型重试和本地命令的原生执行参数。', [
        native('execution.retry.enabled', '启用重试', '请求失败时自动重试。', 'toggle', true, { source: 'assets/pi/configuration.mjs:12-61' }),
        native('execution.retry.maxRetries', '最大重试次数', '单次请求可重试次数。', 'number', 0, { min: 0, source: 'assets/pi/configuration.mjs:12-61' }),
        native('execution.retry.baseDelayMs', '基础重试延迟', '重试退避的基础毫秒数。', 'number', 0, { min: 0, source: 'assets/pi/configuration.mjs:12-61' }),
        native('execution.retry.provider.timeoutMs', '提供商超时', '请求超时毫秒数。', 'number', 0, { min: 0, source: 'assets/pi/configuration.mjs:12-61' }),
        native('execution.retry.provider.maxRetries', '提供商最大重试', '提供商层重试次数。', 'number', 0, { min: 0, source: 'assets/pi/configuration.mjs:12-61' }),
        native('execution.retry.provider.maxRetryDelayMs', '提供商最大延迟', '单次重试最大延迟。', 'number', 0, { min: 0, source: 'assets/pi/configuration.mjs:12-61' }),
        native('execution.shellPath', 'Shell 路径', '执行本地命令时使用的 Shell。', 'text', '', { source: 'assets/pi/configuration.mjs:12-61' }),
        native('execution.shellCommandPrefix', 'Shell 前缀', '在每条 Shell 命令前追加的前缀。', 'text', '', { source: 'assets/pi/configuration.mjs:12-61' }),
        native('execution.npmCommand', 'npm 命令', '用于资源安装的命令字符串。', 'text', '', { source: 'assets/pi/configuration.mjs:12-61' }),
        native('execution.images.autoResize', '自动缩放图像', '超过限制时自动调整图像尺寸。', 'toggle', true, { source: 'assets/pi/configuration.mjs:12-61' }),
        native('execution.images.blockImages', '阻止图像输入', '禁用图像输入。', 'toggle', false, { source: 'assets/pi/configuration.mjs:12-61' }),
      ]),
    ]),
    tab('resources', '资源', '资源与扩展', 'Pi 的资源组包含扩展、技能、提示词、主题和包路径；当前设置页仅通过高级原始 JSON 编辑器触达。', [
      group('原始 JSON 编辑器', '以下字段是 schema 支持的资源键，当前没有独立的逐项引导表单；母本明确标出这一边界。', [
        native('resources.packages', '包路径', 'JSON 对象；包来源与安装位置。', 'json', '{}', { source: 'assets/pi/configuration.mjs:12-61', hint: '仅高级原始编辑器' }),
        native('resources.extensions', '扩展', '扩展路径列表。', 'list', [], { source: 'assets/pi/configuration.mjs:12-61', hint: '仅高级原始编辑器' }),
        native('resources.skills', '技能', '技能路径列表。', 'list', [], { source: 'assets/pi/configuration.mjs:12-61', hint: '仅高级原始编辑器' }),
        native('resources.prompts', '提示词', '提示词路径列表。', 'list', [], { source: 'assets/pi/configuration.mjs:12-61', hint: '仅高级原始编辑器' }),
        native('resources.themes', '主题', '主题路径列表。', 'list', [], { source: 'assets/pi/configuration.mjs:12-61', hint: '仅高级原始编辑器' }),
        native('resources.enableSkillCommands', '启用技能命令', '是否把技能注册为命令。', 'toggle', true, { source: 'assets/pi/configuration.mjs:12-61', hint: '仅高级原始编辑器' }),
        native('resources.npmCommand', '资源 npm 参数', '资源安装使用的 argv 列表。', 'list', [], { source: 'assets/pi/configuration.mjs:12-61', hint: '仅高级原始编辑器' }),
        action('pi.openResourceEditor', '资源编辑入口', '打开原生 settings.json 高级编辑器。', '打开原始编辑器', { source: 'src/features/settings/backends/pi/SettingsPiConfigurationSection.ts:513-531' }),
      ]),
    ]),
    tab('account', '账户', '账户与认证', '认证由 Pi 原生 RPC 管理；插件只呈现状态和安全操作，不把凭据变成库字段。', [
      group('当前认证', '按 provider 显示是否已配置。', [
        readback('auth.providers', '提供商认证状态', '读取 Pi get_auth 返回的 provider 与 configured 状态。', '未加载机器认证信息', { source: 'src/features/settings/backends/pi/SettingsPiSection.ts:278-315' }),
        action('pi.login', '登录提供商', '启动原生 OAuth 或 API Key 配置流程。', '登录', { source: 'src/features/settings/backends/pi/SettingsPiSection.ts:278-315' }),
        action('pi.logout', '退出提供商', '清除 Pi 原生认证条目；操作前确认。', '退出登录', { source: 'src/features/settings/backends/pi/SettingsPiSection.ts:278-315' }),
      ]),
    ]),
    tab('mcp', 'MCP', 'MCP 与扩展状态', 'MCP 声明来自多处原生文件；本页只展示合并后的来源、传输和认证状态。', [
      group('只读声明', 'Pi MCP 配置由原生文件和项目文件共同决定，当前插件不在此处添加或编辑服务器。', [
        readback('mcp.servers', 'MCP 服务器', '合并 ~/.config/mcp、~/.agents、~/.pi 和项目 .mcp.json / .pi/mcp.json 的声明。', '仅展示脱敏端点、来源和状态', { source: 'src/core/agents/backend/pi/PiMcpConfigService.ts:50-101' }),
        readback('mcp.auth', '认证状态', '显示 oauth、bearer 或 none；端点和凭据保持脱敏。', '只读', { source: 'src/features/settings/backends/pi/SettingsPiSection.ts:317-361' }),
        action('pi.refreshMcp', '刷新 MCP', '重新读取并合并 Pi MCP 声明。', '刷新状态', { source: 'src/features/settings/backends/pi/SettingsPiSection.ts:317-361' }),
      ]),
    ]),
    tab('sessions', '会话', '会话与工作台', '查看 Pi 会话并打开工作台；会话动作不属于插件设置字段。', [
      group('会话浏览', '只读列表和原生工作台入口。', [
        readback('sessions.list', 'Pi 会话', '显示可恢复的原生会话。', '未加载会话列表', { source: 'src/features/settings/backends/pi/SettingsPiSection.ts:363-371' }),
        action('pi.openWorkbench', 'Pi 工作台', '打开会话、运行、模型、资源和账户动作集合。', '打开工作台', { source: 'src/features/settings/backends/pi/PiWorkbenchActions.ts:11-69' }),
      ]),
    ]),
    tab('advanced', '高级', '高级原生配置', '将 Pi 完整原生 schema 保留在一个明确的高级边界内；原始文件、历史和未知字段都不伪装成插件字段。', [
      group('高级原生字段', '以下字段属于 Pi settings.json advanced 组。', [
        native('advanced.sessionDir', '会话目录', '原生会话数据目录。', 'text', '', { source: 'assets/pi/configuration.mjs:12-61' }),
        native('advanced.theme', '主题', 'Pi 原生终端主题。', 'text', '', { source: 'assets/pi/configuration.mjs:12-61' }),
        native('advanced.quietStartup', '静默启动', '启动时隐藏欢迎信息。', 'toggle', false, { source: 'assets/pi/configuration.mjs:12-61' }),
        native('advanced.collapseChangelog', '折叠更新日志', '启动时折叠更新日志。', 'toggle', false, { source: 'assets/pi/configuration.mjs:12-61' }),
        native('advanced.enableInstallTelemetry', '启用安装遥测', '允许原生安装遥测。', 'toggle', false, { source: 'assets/pi/configuration.mjs:12-61' }),
        native('advanced.terminal.showImages', '终端显示图像', '允许终端显示图像。', 'toggle', true, { source: 'assets/pi/configuration.mjs:12-61' }),
        native('advanced.terminal.imageWidthCells', '图像宽度单元格', '终端图像宽度。', 'number', 0, { min: 0, source: 'assets/pi/configuration.mjs:12-61' }),
        native('advanced.terminal.clearOnShrink', '缩小时清屏', '图像缩小时清理终端。', 'toggle', false, { source: 'assets/pi/configuration.mjs:12-61' }),
        native('advanced.terminal.showTerminalProgress', '终端显示进度', '显示原生执行进度。', 'toggle', true, { source: 'assets/pi/configuration.mjs:12-61' }),
        native('advanced.doubleEscapeAction', '双击 Escape 动作', '控制双击 Escape 的会话操作。', 'select', 'fork', { options: choices([['fork', '分叉'], ['tree', '树状分支'], ['none', '无操作']]), source: 'assets/pi/configuration.mjs:12-61' }),
        native('advanced.treeFilterMode', '树过滤模式', '控制树中显示的内容。', 'select', 'default', { options: choices([['default', '默认'], ['no-tools', '隐藏工具'], ['user-only', '仅用户'], ['labeled-only', '仅有标签'], ['all', '全部']]), source: 'assets/pi/configuration.mjs:12-61' }),
        native('advanced.editorPaddingX', '编辑器水平边距', '原生编辑器左右边距。', 'number', 0, { min: 0, max: 3, source: 'assets/pi/configuration.mjs:12-61' }),
        native('advanced.autocompleteMaxVisible', '自动补全最大条数', '自动补全列表的可见条数。', 'number', 10, { min: 3, max: 20, source: 'assets/pi/configuration.mjs:12-61' }),
        native('advanced.showHardwareCursor', '显示硬件光标', '终端使用硬件光标。', 'toggle', false, { source: 'assets/pi/configuration.mjs:12-61' }),
        native('advanced.markdown.codeBlockIndent', 'Markdown 代码缩进', '代码块的原生缩进。', 'number', 0, { min: 0, source: 'assets/pi/configuration.mjs:12-61' }),
        native('advanced.warnings.anthropicExtraUsage', 'Anthropic 额外用量警告', '显示 Anthropic 额外用量警告。', 'toggle', true, { source: 'assets/pi/configuration.mjs:12-61' }),
        native('advanced.hideThinkingBlock', '隐藏思考块', '折叠原生思考块。', 'toggle', false, { source: 'assets/pi/configuration.mjs:12-61' }),
        readback('advanced.lastChangelogVersion', '最后更新日志版本', '原生记录，只读。', '未读取', { source: 'assets/pi/configuration.mjs:12-61' }),
      ]),
      group('原始 JSON 与历史', '直接编辑完整 settings.json；保存、比较、恢复受 revision 和历史能力保护。', [
        native('settings.json', '原始 settings.json', '用于尚未有结构化表单的字段；未知字段会保留。', 'json', '{}', { source: 'src/features/settings/backends/pi/SettingsPiConfigurationSection.ts:513-531', hint: '高级原始编辑器' }),
        action('pi.saveRawConfiguration', '保存原始配置', '解析 JSON、检查 revision 并保存。', '保存原始 JSON', { source: 'src/features/settings/backends/pi/SettingsPiConfigurationSection.ts:513-531' }),
        action('pi.restoreConfiguration', '恢复版本', '从原生归档恢复；不执行自动覆盖。', '查看并恢复', { source: 'src/features/settings/backends/pi/SettingsPiConfigurationSection.ts:268-370' }),
      ], { collapsible: true, open: false }),
    ]),
  ],
};
const zcode = {
  id: 'zcode', mark: 'Z', name: 'ZCode',
  description: '区分 OpenCodian 官方登录、共享个人 API 服务、模型默认值和插件管理目录。账号与个人服务的作用域不同，母本将两条路径分开。',
  source: 'src/features/settings/backends/zcode/SettingsZCodeSection.ts · docs/adr/0003-zcode-isolated-login-shared-api.md',
  tabs: [
    tab('installation', '连接', '安装与连接', '查看 ZCode 运行时解析、握手、共享 provider 配置和可执行文件覆盖。', [
      group('运行时连接', '可执行文件覆盖属于插件库设置，诊断来自运行时只读回读。', [
        plugin('settings.backendSettings.zcode.executablePath', 'ZCode 可执行文件', '留空时自动解析当前桌面安装；仅覆盖本库启动路径。', 'text', '', { placeholder: '自动查找 ZCode', scope: '当前库', effect: '新会话', risk: 'medium', source: 'src/features/settings/backends/zcode/SettingsZCodeSection.ts:149-178' }),
        readback('installation.resolution', '运行时解析', '显示 entryPath、来源和 not-installed / incompatible / ready 状态。', '等待握手', { source: 'src/features/settings/backends/zcode/SettingsZCodeSection.ts:402-451' }),
        readback('installation.providerConfig', '个人服务配置状态', '显示 provider 数量、路径和 validated / missing / unreadable / malformed。', '等待读取', { source: 'src/features/settings/backends/zcode/SettingsZCodeSection.ts:402-451' }),
        readback('installation.handshake', '握手状态', '显示 runtime/capabilities 结果和最后错误。', '等待连接', { source: 'src/features/settings/backends/zcode/SettingsZCodeSection.ts:402-451' }),
        action('zcode.reconnect', '重新连接', '重新解析运行时并启动握手。', '重新连接', { source: 'src/features/settings/backends/zcode/SettingsZCodeSection.ts:402-451' }),
      ]),
    ]),
    tab('chat', '对话', '对话默认值', '模型和思考等级来自运行时目录；未知保存值在目录加载完成前保留，不会静默替换。', [
      group('模型选择', '插件保存对话默认值；provider/model 目录来自 ZCode 原生工作区。', [
        plugin('settings.backendSettings.zcode.model', '模型', '使用 providerId/modelId 格式；空值继承 ZCode 默认。', 'text', '', { placeholder: 'provider/model', scope: '当前库', effect: '下一轮', source: 'src/features/settings/backends/zcode/SettingsZCodeModelControls.ts:100-162' }),
        plugin('settings.backendSettings.zcode.thinkingLevel', '思考强度', '从运行时目录读取实际 thoughtLevels；空值继承。', 'select', '', { options: choices([['', '继承 ZCode 默认'], ['low', '低'], ['medium', '中'], ['high', '高'], ['max', '最大']]), scope: '当前库', effect: '下一轮', source: 'src/features/settings/backends/zcode/SettingsZCodeSection.ts:229-263' }),
        plugin('settings.inlineCompletionModelOverrides.zcode', '行内补全模型覆盖', '留空时跟随对话模型；开关位于插件补全设置。', 'text', '', { placeholder: '跟随对话模型', scope: '插件设置', effect: '下一次补全', source: 'src/features/settings/general/SettingsInlineEditSection.ts:90-97' }),
      ]),
    ]),
    tab('providers', '服务', '个人 API 服务', '这些 provider 与 ZCode 桌面端共享；只编辑允许的 standard-personal + api-key 条目，保存后会有应用和 readback 状态。', [
      group('共享服务编辑器', '配置文件由 ZCodePersonalConfigService 管理，revision 冲突时保留草稿并要求重载或覆盖确认。', [
        native('providerRules[].providerName', '服务名称', '共享服务目录中的显示名称。', 'text', '', { store: 'ZCode Personal Provider Config → providerConfigRules.providerRules[]', scope: '共享个人配置', effect: '重新连接', source: 'src/features/settings/backends/zcode/SettingsZCodeAccounts.ts:369-425' }),
        native('providerRules[].protocol', '协议', '当前编辑器允许三种个人 API 协议。', 'select', 'openai-chat-completions', { options: choices([['openai-chat-completions', 'OpenAI Chat Completions'], ['openai-responses', 'OpenAI Responses'], ['anthropic-messages', 'Anthropic Messages']]), store: 'ZCode Personal Provider Config → providerConfigRules.providerRules[]', scope: '共享个人配置', effect: '重新连接', source: 'src/core/agents/backend/zcode/ZCodePersonalConfigService.ts:20-63' }),
        native('providerRules[].baseUrl', '服务地址', '个人 API 服务的 Base URL。', 'text', '', { placeholder: 'https://api.example.com', store: 'ZCode Personal Provider Config → providerConfigRules.providerRules[]', scope: '共享个人配置', effect: '重新连接', source: 'src/features/settings/backends/zcode/SettingsZCodeAccounts.ts:369-425' }),
        native('providerRules[].apiKey', 'API Key', '密码字段；留空可表示显式清除，未触碰时保持现有值。', 'password', '', { placeholder: '保持现有值不变', store: 'ZCode Personal Provider Config → providerConfigRules.providerRules[]', scope: '共享个人配置', effect: '重新连接', risk: 'high', source: 'src/features/settings/backends/zcode/SettingsZCodeAccounts.ts:369-425' }),
        native('providerRules[].models', '模型列表', '每行一个模型 ID；完整 ID 在这里保存并展示。', 'textarea', [], { store: 'ZCode Personal Provider Config → providerConfigRules.providerRules[]', scope: '共享个人配置', effect: '重新连接', source: 'src/features/settings/backends/zcode/SettingsZCodeAccounts.ts:369-425' }),
        action('zcode.saveProvider', '保存服务', 'revision 校验后刷新配置并报告 applied / reconnect / readback-failed。', '保存并应用', { source: 'src/features/settings/backends/zcode/SettingsZCodeAccounts.ts:427-486' }),
        action('zcode.providerHistory', '服务历史', '查看共享配置归档并按三步确认恢复。', '查看历史', { source: 'src/features/settings/backends/zcode/SettingsZCodeAccounts.ts:114-204' }),
      ]),
      group('不可编辑服务', '账户绑定或未知协议的服务仅用于阅读，避免把只读目录误导为可编辑配置。', [
        readback('providerRules.readonly', '只读服务目录', '显示 name、protocol、Base URL、模型数和 editable 状态。', '未加载服务目录', { source: 'src/features/settings/backends/zcode/SettingsZCodeAccounts.ts:307-317' }),
      ]),
    ]),
    tab('account', '账户', '官方账户', '官方 ZCode 登录是本机 OpenCodian 独立作用域；它与共享个人 API 服务互不替代。', [
      group('机器本地登录', '凭据由 ZCode 原生账户服务保存，插件不把 token 写入库设置。', [
        readback('account.state', '登录状态', 'signed-out / signed-in / signing-in / unreadable。', '未读取', { source: 'src/core/agents/backend/zcode/ZCodeAccountService.ts:15-19' }),
        plugin('account.family', '账户类型', '显示当前操作的账户族，不保存凭据内容。', 'select', 'bigmodel', { options: choices([['bigmodel', '智谱 / BigModel'], ['zai', 'Z.AI']]), origin: 'action', store: 'ZCode 本机账户服务', scope: '机器本地', effect: '立即', source: 'src/features/settings/backends/zcode/SettingsZCodeAccounts.ts:56-79' }),
        action('zcode.login', '登录官方账户', '打开授权 URL、复制或取消授权。', '登录', { source: 'src/features/settings/backends/zcode/SettingsZCodeAccounts.ts:206-286' }),
        action('zcode.logout', '退出官方账户', '清除当前机器的官方 ZCode 登录会话。', '退出登录', { source: 'src/features/settings/backends/zcode/SettingsZCodeAccounts.ts:206-286' }),
        action('zcode.openDesktop', '打开 ZCode 桌面端', '跳转到同一官方账户的桌面工作区。', '打开桌面端', { source: 'src/features/settings/backends/zcode/SettingsZCodeAccounts.ts:56-79' }),
      ]),
    ]),
    tab('tools', '工具', '工具与插件', '插件目录支持启用或停用；MCP 和 hooks 在此只显示运行时状态，声明和执行能力不被伪装成可编辑。', [
      group('插件管理', '管理目录条目带 persistence / application / runtime 证据；缺包或目录不可用时控件会禁用。', [
        plugin('management.plugins[].enabled', '插件启用状态', '按 user / workspace 来源显示启用状态。', 'toggle', false, { store: 'ZCode 管理目录 → plugins[]', scope: '项目 / 工作区', effect: '新会话', source: 'src/features/settings/backends/zcode/SettingsZCodeSection.ts:274-381' }),
        readback('management.plugins[]', '插件目录', '显示 id、enabledSource、packageMissing、MCP 数量和 hooks 数量。', '未加载插件目录', { source: 'src/core/agents/backend/zcode/ZCodeManagementService.ts:21-50' }),
        action('zcode.refreshManagement', '刷新目录', '重新读取插件、MCP 和 hooks 的运行时目录。', '刷新目录', { source: 'src/features/settings/backends/zcode/SettingsZCodeSection.ts:338-381' }),
      ]),
      group('运行时只读', '这些项目目前没有本设置页的 authoring mutation。', [
        readback('management.mcp', 'MCP 状态', 'connecting / connected / disabled / disconnected / failed / untrusted / unknown，以及 toolCount 和 authentication。', '只读', { source: 'src/features/settings/backends/zcode/SettingsZCodeSection.ts:371-379' }),
        readback('management.hooks', 'Hooks 状态', '声明数量不等于执行已验证；当前 mutation 不可用。', '不可用（只读说明）', { source: 'src/features/settings/backends/zcode/SettingsZCodeSection.ts:371-379' }),
      ]),
    ]),
    tab('permissions-safety', '权限', '权限与模式', 'ZCode 的 mode 是插件保存的默认工作模式；它与账户和个人服务分开显示。', [
      group('工作模式', '高风险模式以明确的选项文案说明影响。', [
        plugin('settings.backendSettings.zcode.mode', '默认工作模式', '空值继承；计划、编辑和 yolo 模式会改变后端的操作边界。', 'segment', '', { options: choices([['', '继承'], ['plan', '计划'], ['build', '构建'], ['edit', '编辑'], ['yolo', '完全自动']]), scope: '当前库', effect: '新会话', risk: 'high', source: 'src/features/settings/backends/zcode/SettingsZCodeSection.ts:211-243' }),
      ]),
    ]),
    tab('resources', '资源', '资源与会话', '本页呈现工作区资源和会话入口；资源内容由原生 ZCode 管理，不被错误归入插件字段。', [
      group('工作区只读入口', '当前设置页不直接编辑资源正文。', [
        readback('resources.catalog', '资源目录', '显示工作区可用的资源、会话和加载状态。', '未加载资源目录', { source: 'src/features/settings/backends/zcode/SettingsZCodeSection.ts:381-401' }),
        action('zcode.openResourceWorkspace', '打开资源工作区', '进入原生资源和会话管理入口。', '打开资源工作区', { source: 'src/features/settings/backends/zcode/SettingsZCodeSection.ts:381-401' }),
      ]),
    ]),
    tab('debug', '诊断', '诊断与会话追踪', '诊断字段属于插件调试设置；它们控制捕获范围，不改变 ZCode 的模型或账户配置。', [
      group('会话追踪', '追踪开关和存储位置只保存在插件调试设置中。', [
        plugin('settings.debug.zcode.sessionTrace.enabled', '启用会话追踪', '收集诊断事件；默认开启。', 'toggle', true, { scope: '插件设置', effect: '立即', source: 'src/features/settings/debug/CodexDebugPanel.ts' }),
        plugin('settings.debug.zcode.sessionTrace.consolePreset', '控制台预设', '选择标准或完整诊断输出。', 'select', 'standard', { options: choices([['standard', '标准'], ['full', '完整']]), scope: '插件设置', effect: '立即', source: 'src/features/settings/debug/CodexDebugPanel.ts' }),
        plugin('settings.debug.zcode.sessionTrace.consoleChannels', '控制台通道', '按通道启用或关闭；空对象表示使用默认通道集合。', 'json', '{}', { scope: '插件设置', effect: '立即', source: 'src/features/settings/debug/CodexDebugPanel.ts' }),
        plugin('settings.debug.zcode.sessionTrace.storageDirectory', '追踪存储目录', '留空时使用插件默认诊断目录。', 'text', '', { scope: '插件设置', effect: '立即', source: 'src/features/settings/debug/CodexDebugPanel.ts' }),
        plugin('settings.debug.zcode.sessionTrace.captureContent', '捕获内容', 'Codex/ZCode 诊断专属的内容捕获开关。', 'toggle', true, { scope: '插件设置', effect: '立即', risk: 'high', source: 'src/features/settings/debug/CodexDebugPanel.ts' }),
        action('zcode.openTraceReport', '追踪报告', '打开、导出或删除已保存的诊断报告。', '查看报告', { source: 'src/features/settings/debug/CodexDebugPanel.ts' }),
      ]),
    ]),
  ],
};
writeFileSync(new URL('./pi-zcode.json', import.meta.url), JSON.stringify([pi, zcode], null, 2));
console.log('Wrote Pi/ZCode inventory:', pi.tabs.length, zcode.tabs.length);
