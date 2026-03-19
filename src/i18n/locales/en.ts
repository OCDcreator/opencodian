/**
 * English translations
 */

export const enTranslations = {
  // General
  'plugin.name': 'OpenCodian',
  'plugin.description': 'Use OpenCode AI assistant in Obsidian',

  // Settings sections
  'settings.title': 'OpenCodian Settings',
  'settings.server.title': 'Server',
  'settings.model.title': 'Model',
  'settings.security.title': 'Security',
  'settings.ui.title': 'User Interface',
  'settings.user.title': 'User',
  'settings.language.title': 'Language',

  // Server settings
  'settings.server.autoStart.name': 'Auto-start server',
  'settings.server.autoStart.desc': 'Automatically start the OpenCode server when Obsidian loads',
  'settings.server.host.name': 'Server host',
  'settings.server.host.desc': 'Host address for the OpenCode server (default: 127.0.0.1)',
  'settings.server.port.name': 'Server port',
  'settings.server.port.desc': 'Port for the OpenCode server (default: 4096)',
  'settings.server.status.name': 'Server status',
  'settings.server.status.desc': 'Current status of the OpenCode server',
  'settings.server.status.start': 'Start',
  'settings.server.status.starting': 'Starting...',
  'settings.server.status.stop': 'Stop',
  'settings.server.status.refresh': 'Refresh',
  'settings.server.external.title': 'External Server',
  'settings.server.external.desc': 'An external OpenCode server not started by the plugin is detected. The plugin can only stop servers it started.',
  'settings.server.external.stopManually': 'Please stop the server manually in terminal: pkill -f "opencode serve"',
  'settings.server.status.running': 'Running',
  'settings.server.status.stopped': 'Stopped',
  'settings.server.status.error': 'Error',
  'settings.server.started': 'OpenCode server started',
  'settings.server.stopped': 'OpenCode server stopped',
  'settings.server.startFailed': 'Failed to start',

  // Model settings
  'settings.model.provider.name': 'Default provider',
  'settings.model.provider.desc': 'Default model provider to use',
  'settings.model.provider.anthropic': 'Anthropic',
  'settings.model.provider.openai': 'OpenAI',
  'settings.model.provider.local': 'Local',
  'settings.model.model.name': 'Default model',
  'settings.model.model.desc': 'Default model ID to use (e.g., claude-3-5-sonnet-20241022)',
  'settings.model.refresh.name': 'Refresh models',
  'settings.model.refresh.desc': 'Fetch available models from OpenCode server',
  'settings.model.refresh.button': 'Refresh',
  'settings.model.refresh.success': 'Found {count} providers',
  'settings.model.refresh.failed': 'Failed to fetch models',
  'settings.model.noModels': 'No models available',

  // Security settings
  'settings.security.permissionMode.name': 'Permission mode',
  'settings.security.permissionMode.desc': 'How to handle tool execution permissions',
  'settings.security.permissionMode.yolo': 'YOLO - Auto-approve all',
  'settings.security.permissionMode.normal': 'Normal - Prompt for approval',
  'settings.security.permissionMode.plan': 'Plan - Plan mode',
  'settings.security.blocklist.name': 'Enable command blocklist',
  'settings.security.blocklist.desc': 'Block dangerous bash commands',
  'settings.security.externalAccess.name': 'Allow external access',
  'settings.security.externalAccess.desc': 'Allow AI to access files outside the vault',
  'settings.security.exportPaths.name': 'Allowed export paths',
  'settings.security.exportPaths.desc': 'Paths where AI can write files (one per line)',

  // UI settings
  'settings.ui.maxTabs.name': 'Maximum tabs',
  'settings.ui.maxTabs.desc': 'Maximum number of conversation tabs (3-10)',
  'settings.ui.tabPosition.name': 'Tab bar position',
  'settings.ui.tabPosition.desc': 'Where to display the tab bar',
  'settings.ui.tabPosition.input': 'Near input',
  'settings.ui.tabPosition.header': 'In header',
  'settings.ui.autoScroll.name': 'Auto-scroll',
  'settings.ui.autoScroll.desc': 'Automatically scroll to new messages',
  'settings.ui.openInMainTab.name': 'Open in main tab',
  'settings.ui.openInMainTab.desc': 'Open chat in main editor area instead of sidebar',

  // User settings
  'settings.user.name.name': 'Your name',
  'settings.user.name.desc': 'How the AI should address you',
  'settings.user.systemPrompt.name': 'System prompt',
  'settings.user.systemPrompt.desc': 'Custom instructions for the AI',
  'settings.user.excludedTags.name': 'Excluded tags',
  'settings.user.excludedTags.desc': 'Tags to exclude from context (one per line)',

  // Language settings
  'settings.language.select.name': 'Interface language',
  'settings.language.select.desc': 'Select the display language for the plugin interface',
  'settings.language.en': 'English',
  'settings.language.zh': '简体中文',

  // Chat UI
  'chat.input.placeholder': 'Type a message...',
  'chat.input.send': 'Send',
  'chat.input.attach': 'Attach file',
  'chat.tab.new': 'New chat',
  'chat.tab.close': 'Close tab',
  'chat.empty.title': 'Start a new conversation',
  'chat.empty.description': 'Type a message to start chatting with AI',
  'chat.loading': 'Loading...',
  'chat.error.noSession': 'No active session',
  'chat.error.sendFailed': 'Failed to send message',
  'chat.message.user': 'You',
  'chat.message.assistant': 'AI',
  'chat.message.thinking': 'Thinking...',
  'chat.message.toolUse': 'Using tool',
  'chat.message.toolResult': 'Tool result',
  'chat.action.copy': 'Copy',
  'chat.action.retry': 'Retry',
  'chat.action.delete': 'Delete',

  // Tool approval
  'toolApproval.title': 'Tool Execution Request',
  'toolApproval.description': 'The AI wants to execute the following command:',
  'toolApproval.allow': 'Allow',
  'toolApproval.allowAlways': 'Allow Always',
  'toolApproval.deny': 'Deny',
  'toolApproval.cancel': 'Cancel',

  // Notifications
  'notice.error': 'Error',
  'notice.warning': 'Warning',
  'notice.success': 'Success',
  'notice.info': 'Info',
} as const;

export type EnTranslationKeys = keyof typeof enTranslations;
