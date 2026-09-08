import type { PiCommandName } from '../../core/agents/backend/pi/PiProtocol';

export interface PiActionField { key: string; label: string; kind?: 'boolean' | 'list' | 'json' | 'secret'; options?: string[] }
export interface PiWorkbenchAction { id: PiCommandName; label: string; fields?: PiActionField[]; mutation?: boolean }
const message = { key: 'message', label: '消息 / Message' };
const entry = { key: 'entryId', label: '历史节点 ID / Entry ID' };
const enabled: PiActionField = { key: 'enabled', label: '启用 / Enabled', kind: 'boolean' };
const output = { key: 'outputPath', label: '输出文件绝对路径 / Output file' };
const provider = { key: 'provider', label: '提供商 / Provider' };
const source = { key: 'source', label: '扩展包来源 / Package source' };
export const PI_WORKBENCH_GROUPS: Record<string, PiWorkbenchAction[]> = {
  '会话与历史 / Sessions': [
    { id: 'get_state', label: '运行状态 / State' }, { id: 'get_messages', label: '读取历史 / Transcript' },
    { id: 'get_last_assistant_text', label: '最近回复 / Last reply' },
    { id: 'new_session', label: '新建会话 / New session', mutation: true },
    { id: 'set_session_name', label: '重命名 / Rename', fields: [{ key: 'name', label: '标题 / Title' }] },
    { id: 'list_sessions', label: '发现原生会话 / Discover sessions', fields: [{ key: 'all', label: '所有工作目录 / All workspaces', kind: 'boolean' }] },
    { id: 'import_session', label: '导入副本 / Import copy', fields: [{ key: 'sessionPath', label: '原生会话文件 / Native JSONL file' }], mutation: true },
    { id: 'switch_session', label: '打开原生会话 / Open native session', fields: [{ key: 'sessionPath', label: '原生会话文件 / Native JSONL file' }], mutation: true },
    { id: 'get_tree', label: '分支树 / Tree' }, { id: 'get_fork_messages', label: '可分叉消息 / Fork points' },
    { id: 'fork', label: '从节点分叉 / Fork before entry', fields: [entry], mutation: true },
    { id: 'clone', label: '克隆当前分支 / Clone branch', mutation: true },
    { id: 'navigate_tree', label: '切换历史节点 / Navigate tree', fields: [entry, { key: 'summarize', label: '生成分支摘要 / Summarize', kind: 'boolean' }, { key: 'customInstructions', label: '摘要要求 / Summary instructions' }], mutation: true },
    { id: 'label_entry', label: '标记历史节点 / Label entry', fields: [entry, { key: 'label', label: '标签（留空清除） / Label' }] },
  ],
  '运行与队列 / Run': [
    { id: 'prompt', label: '发送消息 / Send', fields: [message] },
    { id: 'steer', label: '运行中纠偏 / Steer', fields: [message] }, { id: 'follow_up', label: '排队后续消息 / Follow up', fields: [message] },
    { id: 'get_queue', label: '查看队列 / Queue' }, { id: 'clear_queue', label: '清空队列 / Clear queue' },
    { id: 'set_steering_mode', label: '纠偏投递方式 / Steering mode', fields: [{ key: 'mode', label: '方式 / Mode', options: ['all', 'one-at-a-time'] }] },
    { id: 'set_follow_up_mode', label: '后续消息投递方式 / Follow-up mode', fields: [{ key: 'mode', label: '方式 / Mode', options: ['all', 'one-at-a-time'] }] },
    { id: 'abort', label: '停止生成 / Stop' }, { id: 'bash', label: '执行 Shell / Run shell', fields: [{ key: 'command', label: '命令 / Command' }] },
    { id: 'abort_bash', label: '停止 Shell / Stop shell' },
  ],
  '模型与上下文 / Model': [
    { id: 'get_available_models', label: '模型目录 / Models' },
    { id: 'set_model', label: '选择模型 / Select model', fields: [provider, { key: 'modelId', label: '精确模型 ID / Exact model ID' }] },
    { id: 'cycle_model', label: '下一个限定模型 / Cycle model' },
    { id: 'set_scoped_models', label: '限定模型循环 / Scoped models', fields: [{ key: 'models', label: '模型引用数组 [{provider,model}] / Model references', kind: 'json' }] },
    { id: 'set_thinking_level', label: '思考等级 / Thinking', fields: [{ key: 'level', label: '等级 / Level', options: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] }] },
    { id: 'cycle_thinking_level', label: '下一个思考等级 / Cycle thinking' },
    { id: 'get_session_stats', label: '实际费用和上下文 / Usage and cost' },
    { id: 'compact', label: '压缩上下文 / Compact', fields: [{ key: 'customInstructions', label: '保留内容要求 / Instructions' }] },
    { id: 'abort_compaction', label: '取消压缩 / Cancel compaction' }, { id: 'abort_branch_summary', label: '取消分支摘要 / Cancel summary' },
    { id: 'set_auto_compaction', label: '自动压缩 / Auto-compaction', fields: [enabled] },
    { id: 'set_auto_retry', label: '自动重试 / Auto-retry', fields: [enabled] }, { id: 'abort_retry', label: '停止重试 / Stop retry' },
  ],
  '工具与扩展 / Resources': [
    { id: 'get_tools', label: '工具和参数 / Tools' }, { id: 'set_tools', label: '选择启用工具 / Enable tools', fields: [{ key: 'names', label: '工具名（每行一个） / Tool names', kind: 'list' }] },
    { id: 'get_commands', label: '命令与技能 / Commands' }, { id: 'get_resources', label: '扩展与上下文文件 / Resources' }, { id: 'reload', label: '重新加载扩展 / Reload resources' },
    { id: 'get_packages', label: '已配置扩展包 / Packages' },
    { id: 'install_package', label: '安装扩展包 / Install package', fields: [source, { key: 'local', label: '仅当前工作目录 / Project scope', kind: 'boolean' }], mutation: true },
    { id: 'remove_package', label: '移除扩展包 / Remove package', fields: [source, { key: 'local', label: '当前工作目录 / Project scope', kind: 'boolean' }], mutation: true },
    { id: 'update_package', label: '升级扩展包 / Update package', fields: [source], mutation: true },
  ],
  '账户与导出 / Account': [
    { id: 'get_auth', label: '认证状态 / Auth status' }, { id: 'login', label: '登录 OAuth / Sign in', fields: [provider] },
    { id: 'set_api_key', label: '保存 API key / Save API key', fields: [provider, { key: 'apiKey', label: 'API key', kind: 'secret' }], mutation: true },
    { id: 'logout', label: '退出登录 / Sign out', fields: [provider], mutation: true },
    { id: 'export_html', label: '导出 HTML / Export HTML', fields: [output] }, { id: 'export_jsonl', label: '导出原生会话 / Export JSONL', fields: [output] },
  ],
};
