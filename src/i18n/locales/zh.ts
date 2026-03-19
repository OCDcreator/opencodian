/**
 * Chinese (Simplified) translations
 */

export const zhTranslations = {
  // General
  'plugin.name': 'OpenCodian',
  'plugin.description': '在 Obsidian 中使用 OpenCode AI 助手',

  // Settings sections
  'settings.title': 'OpenCodian 设置',
  'settings.server.title': '服务器',
  'settings.model.title': '模型',
  'settings.security.title': '安全',
  'settings.ui.title': '界面',
  'settings.user.title': '用户',
  'settings.language.title': '语言',

  // Server settings
  'settings.server.autoStart.name': '自动启动服务器',
  'settings.server.autoStart.desc': 'Obsidian 加载时自动启动 OpenCode 服务器',
  'settings.server.host.name': '服务器主机',
  'settings.server.host.desc': 'OpenCode 服务器的主机地址（默认: 127.0.0.1）',
  'settings.server.port.name': '服务器端口',
  'settings.server.port.desc': 'OpenCode 服务器的端口（默认: 4096）',
  'settings.server.status.name': '服务器状态',
  'settings.server.status.desc': 'OpenCode 服务器的当前状态',
  'settings.server.status.start': '启动',
  'settings.server.status.starting': '启动中...',
  'settings.server.status.stop': '停止',
  'settings.server.status.refresh': '刷新',
  'settings.server.external.title': '外部服务器',
  'settings.server.external.desc': '检测到一个不是由插件启动的外部 OpenCode 服务器。插件只能停止它自己启动的服务器。',
  'settings.server.external.stopManually': '请手动在终端停止服务器：pkill -f "opencode serve"',
  'settings.server.status.running': '运行中',
  'settings.server.status.stopped': '已停止',
  'settings.server.status.error': '错误',
  'settings.server.started': 'OpenCode 服务器已启动',
  'settings.server.stopped': 'OpenCode 服务器已停止',
  'settings.server.startFailed': '启动失败',

  // Model settings
  'settings.model.provider.name': '默认提供商',
  'settings.model.provider.desc': '要使用的默认模型提供商',
  'settings.model.provider.anthropic': 'Anthropic',
  'settings.model.provider.openai': 'OpenAI',
  'settings.model.provider.local': '本地模型',
  'settings.model.model.name': '默认模型',
  'settings.model.model.desc': '要使用的默认模型 ID（例如: claude-3-5-sonnet-20241022）',
  'settings.model.refresh.name': '刷新模型',
  'settings.model.refresh.desc': '从 OpenCode 服务器获取可用模型',
  'settings.model.refresh.button': '刷新',
  'settings.model.refresh.success': '找到 {count} 个提供商',
  'settings.model.refresh.failed': '获取模型失败',
  'settings.model.noModels': '无可用模型',

  // Security settings
  'settings.security.permissionMode.name': '权限模式',
  'settings.security.permissionMode.desc': '如何处理工具执行权限',
  'settings.security.permissionMode.yolo': 'YOLO - 自动批准全部',
  'settings.security.permissionMode.normal': '正常 - 提示批准',
  'settings.security.permissionMode.plan': '计划 - 计划模式',
  'settings.security.blocklist.name': '启用命令黑名单',
  'settings.security.blocklist.desc': '阻止危险的 bash 命令',
  'settings.security.externalAccess.name': '允许外部访问',
  'settings.security.externalAccess.desc': '允许 AI 访问保险库外的文件',
  'settings.security.exportPaths.name': '允许的导出路径',
  'settings.security.exportPaths.desc': 'AI 可以写入文件的路径（每行一个）',

  // UI settings
  'settings.ui.maxTabs.name': '最大标签数',
  'settings.ui.maxTabs.desc': '对话标签的最大数量（3-10）',
  'settings.ui.tabPosition.name': '标签栏位置',
  'settings.ui.tabPosition.desc': '标签栏显示的位置',
  'settings.ui.tabPosition.input': '输入框附近',
  'settings.ui.tabPosition.header': '在标题栏',
  'settings.ui.autoScroll.name': '自动滚动',
  'settings.ui.autoScroll.desc': '自动滚动到新消息',
  'settings.ui.openInMainTab.name': '在主标签页打开',
  'settings.ui.openInMainTab.desc': '在主编辑区而不是侧边栏打开聊天',

  // User settings
  'settings.user.name.name': '你的名字',
  'settings.user.name.desc': 'AI 应该如何称呼你',
  'settings.user.systemPrompt.name': '系统提示词',
  'settings.user.systemPrompt.desc': '给 AI 的自定义指令',
  'settings.user.excludedTags.name': '排除的标签',
  'settings.user.excludedTags.desc': '要从上下文中排除的标签（每行一个）',

  // Language settings
  'settings.language.select.name': '界面语言',
  'settings.language.select.desc': '选择插件界面的显示语言',
  'settings.language.en': 'English',
  'settings.language.zh': '简体中文',

  // Chat UI
  'chat.input.placeholder': '输入消息...',
  'chat.input.send': '发送',
  'chat.input.attach': '附加文件',
  'chat.tab.new': '新对话',
  'chat.tab.close': '关闭标签',
  'chat.empty.title': '开始新对话',
  'chat.empty.description': '输入消息开始与 AI 对话',
  'chat.loading': '加载中...',
  'chat.error.noSession': '没有活动会话',
  'chat.error.sendFailed': '发送消息失败',
  'chat.message.user': '你',
  'chat.message.assistant': 'AI',
  'chat.message.thinking': '思考中...',
  'chat.message.toolUse': '使用工具',
  'chat.message.toolResult': '工具结果',
  'chat.action.copy': '复制',
  'chat.action.retry': '重试',
  'chat.action.delete': '删除',

  // Tool approval
  'toolApproval.title': '工具执行请求',
  'toolApproval.description': 'AI 想要执行以下命令：',
  'toolApproval.allow': '允许',
  'toolApproval.allowAlways': '始终允许',
  'toolApproval.deny': '拒绝',
  'toolApproval.cancel': '取消',

  // Notifications
  'notice.error': '错误',
  'notice.warning': '警告',
  'notice.success': '成功',
  'notice.info': '提示',
} as const;

export type ZhTranslationKeys = keyof typeof zhTranslations;
