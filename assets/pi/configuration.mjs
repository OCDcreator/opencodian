import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// One schema owns the complete official 0.73.1 Settings surface and its host scope.
const field = (path, group, kind, zh, en, extra = {}) => ({ path, group, kind, label: { zh, en }, ...extra });
const choice = (path, group, zh, en, options, extra = {}) => field(path, group, 'choice', zh, en, { options, ...extra });
const number = (path, group, zh, en, extra = {}) => field(path, group, 'number', zh, en, { min: 0, ...extra });
const flag = (path, group, zh, en, extra = {}) => field(path, group, 'boolean', zh, en, extra);
const terminal = { scope: 'terminal' };
export const SETTINGS_FIELDS = [
  field('defaultProvider', 'model', 'string', '默认提供商', 'Default provider'),
  field('defaultModel', 'model', 'string', '默认模型 ID', 'Default model ID'),
  choice('defaultThinkingLevel', 'model', '默认思考等级', 'Default thinking level', ['off', 'minimal', 'low', 'medium', 'high', 'xhigh']),
  field('enabledModels', 'model', 'list', '模型循环范围', 'Model cycling patterns'),
  ...['minimal', 'low', 'medium', 'high'].map(level => number(`thinkingBudgets.${level}`, 'model', `${level} 思考预算`, `${level} thinking budget`)),
  flag('hideThinkingBlock', 'advanced', '隐藏思考块', 'Hide thinking blocks', terminal),
  choice('transport', 'execution', '模型请求传输', 'Model request transport', ['sse', 'websocket', 'auto']),
  choice('steeringMode', 'execution', '纠偏消息投递', 'Steering delivery', ['all', 'one-at-a-time']),
  choice('followUpMode', 'execution', '后续消息投递', 'Follow-up delivery', ['all', 'one-at-a-time']),
  flag('compaction.enabled', 'execution', '自动压缩', 'Automatic compaction'),
  number('compaction.reserveTokens', 'execution', '压缩：预留回复 token', 'Compaction: response reserve'),
  number('compaction.keepRecentTokens', 'execution', '压缩：保留近期 token', 'Compaction: recent tokens to keep'),
  number('branchSummary.reserveTokens', 'execution', '分支摘要预留 token', 'Branch summary reserve'),
  flag('branchSummary.skipPrompt', 'advanced', '跳过分支摘要询问', 'Skip branch summary prompt', terminal),
  flag('retry.enabled', 'execution', '自动重试', 'Automatic retry'),
  number('retry.maxRetries', 'execution', 'Agent 最大重试次数', 'Agent retry attempts'),
  number('retry.baseDelayMs', 'execution', 'Agent 基础重试间隔（毫秒）', 'Agent base retry delay (ms)'),
  number('retry.provider.timeoutMs', 'execution', '提供商请求超时（毫秒）', 'Provider request timeout (ms)'),
  number('retry.provider.maxRetries', 'execution', '提供商 SDK 重试次数', 'Provider SDK retry attempts'),
  number('retry.provider.maxRetryDelayMs', 'execution', '服务端建议等待上限（毫秒；0 不限制）', 'Server retry delay cap (ms; 0 disables)'),
  field('shellPath', 'execution', 'string', 'Shell 可执行路径', 'Shell executable'),
  field('shellCommandPrefix', 'execution', 'string', 'Shell 命令前缀', 'Shell command prefix'),
  field('npmCommand', 'resources', 'list', '包管理命令参数（每行一个 argv）', 'Package command arguments (one argv per line)'),
  flag('images.autoResize', 'execution', '自动缩放图片（附件与工具）', 'Resize images (attachments and tools)'),
  flag('images.blockImages', 'execution', '禁止向模型发送图片', 'Block images sent to models'),
  field('packages', 'resources', 'json', '扩展包及资源过滤规则', 'Packages and resource filters'),
  field('extensions', 'resources', 'list', '扩展路径', 'Extension paths'),
  field('skills', 'resources', 'list', '技能路径', 'Skill paths'),
  field('prompts', 'resources', 'list', '提示模板路径', 'Prompt template paths'),
  field('themes', 'resources', 'list', '主题资源路径', 'Theme paths', { scope: 'export' }),
  flag('enableSkillCommands', 'resources', '注册技能斜杠命令', 'Register skill slash commands'),
  field('sessionDir', 'advanced', 'string', 'Pi CLI 会话目录', 'Pi CLI session directory', { scope: 'session-directory' }),
  field('theme', 'advanced', 'string', '终端与 HTML 导出主题', 'Terminal and HTML export theme', { scope: 'export' }),
  flag('quietStartup', 'advanced', '隐藏终端启动信息', 'Quiet terminal startup', terminal),
  flag('collapseChangelog', 'advanced', '折叠更新日志', 'Collapse changelog', terminal),
  flag('enableInstallTelemetry', 'advanced', 'CLI 安装统计', 'CLI install telemetry', terminal),
  flag('terminal.showImages', 'advanced', '终端显示图片', 'Terminal images', terminal),
  number('terminal.imageWidthCells', 'advanced', '终端图片宽度（字符格）', 'Terminal image width (cells)', terminal),
  flag('terminal.clearOnShrink', 'advanced', '终端内容缩小时清空行', 'Clear terminal on shrink', terminal),
  flag('terminal.showTerminalProgress', 'advanced', '终端进度指示', 'Terminal progress indicator', terminal),
  choice('doubleEscapeAction', 'advanced', '双击 Escape 操作', 'Double Escape action', ['fork', 'tree', 'none'], terminal),
  choice('treeFilterMode', 'advanced', '终端树默认过滤', 'Terminal tree filter', ['default', 'no-tools', 'user-only', 'labeled-only', 'all'], terminal),
  number('editorPaddingX', 'advanced', '终端编辑器水平留白', 'Terminal editor padding', { ...terminal, max: 3 }),
  number('autocompleteMaxVisible', 'advanced', '终端补全可见条目', 'Terminal autocomplete rows', { ...terminal, min: 3, max: 20 }),
  flag('showHardwareCursor', 'advanced', '显示终端硬件光标', 'Hardware terminal cursor', terminal),
  field('markdown.codeBlockIndent', 'advanced', 'string', '终端代码块缩进', 'Terminal code block indent', terminal),
  flag('warnings.anthropicExtraUsage', 'advanced', '终端 Anthropic 额外用量提示', 'Terminal Anthropic extra usage warning', terminal),
  field('lastChangelogVersion', 'advanced', 'string', '已读更新版本', 'Last viewed changelog version', { ...terminal, readOnly: true }),
];

const hash = raw => createHash('sha256').update(raw ?? '').digest('hex');
const read = file => { try { return readFileSync(file, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return undefined; throw error; } };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const parse = raw => { const value = JSON.parse(raw || '{}'); if (!object(value)) throw new Error('Configuration must be a JSON object.'); return value; };
function safeKeys(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Unsafe configuration key.');
    safeKeys(child);
  }
}
function validateSettings(value) {
  if (!object(value)) throw new Error('Settings must be an object.');
  safeKeys(value);
  for (const spec of SETTINGS_FIELDS) {
    const current = spec.path.split('.').reduce((parent, key) => parent?.[key], value);
    if (current === undefined) continue;
    if (spec.kind === 'boolean' && typeof current !== 'boolean') throw new Error(`${spec.path}: expected boolean.`);
    if (spec.kind === 'number' && (!Number.isInteger(current) || current < spec.min || (spec.max !== undefined && current > spec.max))) throw new Error(`${spec.path}: invalid number.`);
    if (['string', 'choice'].includes(spec.kind) && typeof current !== 'string') throw new Error(`${spec.path}: expected text.`);
    if (spec.options && !spec.options.includes(current)) throw new Error(`${spec.path}: unsupported value.`);
    if (spec.kind === 'list' && (!Array.isArray(current) || current.some(item => typeof item !== 'string'))) throw new Error(`${spec.path}: expected text array.`);
  }
  for (const key of ['compaction', 'branchSummary', 'retry', 'terminal', 'images', 'thinkingBudgets', 'markdown', 'warnings']) {
    if (value[key] !== undefined && !object(value[key])) throw new Error(`${key}: expected object.`);
  }
  if (value.retry?.provider !== undefined && !object(value.retry.provider)) throw new Error('retry.provider: expected object.');
  if (value.packages !== undefined && (!Array.isArray(value.packages) || value.packages.some(item => typeof item !== 'string' && (!object(item) || typeof item.source !== 'string')))) throw new Error('packages: expected sources or package objects.');
}
function applyChanges(value, changes) {
  for (const [key, replacement] of Object.entries(changes)) {
    const spec = SETTINGS_FIELDS.find(field => field.path === key);
    if (!spec || spec.readOnly) throw new Error(`Setting is not editable: ${key}`);
    const parts = key.split('.'); let parent = value;
    for (const part of parts.slice(0, -1)) { parent[part] ??= {}; parent = parent[part]; }
    if (replacement === null) delete parent[parts.at(-1)]; else parent[parts.at(-1)] = replacement;
  }
  return value;
}

/** Persistent file operations isolated from per-session SettingsManager overlays. */
export function createConfigurationService(sdk, cwd, agentDir) {
  const storage = new sdk.FileSettingsStorage(cwd, agentDir);
  const settingsPath = scope => scope === 'global' ? join(agentDir, 'settings.json') : join(cwd, '.pi', 'settings.json');
  const scopeOf = scope => { if (!['global', 'project'].includes(scope)) throw new Error('Choose global or project scope.'); return scope; };
  const modelFile = join(agentDir, 'models.json');
  return {
    getSettings() {
      const scopes = {};
      for (const scope of ['global', 'project']) storage.withLock(scope, raw => { scopes[scope] = { path: settingsPath(scope), value: parse(raw), revision: hash(raw) }; });
      return { scopes, fields: SETTINGS_FIELDS, sdkVersion: sdk.VERSION };
    },
    saveSettings(command) {
      const scope = scopeOf(command.scope);
      storage.withLock(scope, raw => {
        if (command.revision !== hash(raw)) throw new Error('Configuration changed on disk. Reload before saving.');
        const value = command.value === undefined ? applyChanges(parse(raw), command.changes ?? {}) : command.value;
        validateSettings(value);
        if (raw !== undefined) writeFileSync(`${settingsPath(scope)}.opencodian.bak`, raw, { mode: 0o600 });
        return JSON.stringify(value, null, 2) + '\n';
      });
      return this.getSettings();
    },
    getModels() { const raw = read(modelFile); return { path: modelFile, value: parse(raw), revision: hash(raw) }; },
    async saveModels(command) {
      if (!object(command.value) || !object(command.value.providers)) throw new Error('Expected a providers object.');
      safeKeys(command.value);
      mkdirSync(agentDir, { recursive: true });
      const lock = `${modelFile}.opencodian.lock`;
      try { mkdirSync(lock); } catch (error) { if (error.code === 'EEXIST') throw new Error('Model configuration is being saved. Retry shortly.'); throw error; }
      const temporary = `${modelFile}.${randomUUID()}.tmp`;
      try {
        const raw = read(modelFile);
        if (command.revision !== hash(raw)) throw new Error('Model configuration changed on disk. Reload before saving.');
        writeFileSync(temporary, JSON.stringify(command.value, null, 2) + '\n', { mode: 0o600 });
        const registry = sdk.ModelRuntime
          ? await sdk.ModelRuntime.create({ modelsPath: temporary, refreshOnCreate: false, credentials: { read: async () => undefined, list: async () => [], modify: async () => { throw new Error('Validation cannot change credentials.'); }, delete: async () => { throw new Error('Validation cannot change credentials.'); } } })
          : sdk.ModelRegistry.create(sdk.AuthStorage.inMemory(), temporary);
        const error = registry.getError(); if (error) throw new Error(error);
        if (read(modelFile) !== raw) throw new Error('Model configuration changed during validation. Reload before saving.');
        if (raw !== undefined) writeFileSync(`${modelFile}.opencodian.bak`, raw, { mode: 0o600 });
        renameSync(temporary, modelFile);
      } finally { rmSync(temporary, { force: true }); rmSync(lock, { recursive: true, force: true }); }
      return this.getModels();
    },
  };
}

/** Configuration has its own process path, so bad model defaults or extensions cannot block repair. */
export function startConfigurationTransport(configuration, sdkVersion, streams) {
  const commands = { get_configuration: () => configuration.getSettings(), save_configuration: command => configuration.saveSettings(command), get_model_configuration: () => configuration.getModels(), save_model_configuration: command => configuration.saveModels(command) };
  const send = message => streams.stdout.write(`${JSON.stringify(message)}\n`);
  let pending = Promise.resolve();
  let buffer = '';
  streams.stdin.setEncoding('utf8');
  streams.stdin.on('data', chunk => {
    buffer += chunk;
    if (buffer.length > 32 * 1024 * 1024) { process.exit(1); return; }
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      if (!line.trim()) continue;
      let command;
      try { command = JSON.parse(line); }
      catch { send({ type: 'transport_error', error: 'Invalid configuration JSONL.' }); continue; }
      if (command.type === 'shutdown') { process.exit(0); return; }
      pending = pending.then(async () => { try {
        const data = command.type === 'get_state' ? { serviceProtocol: 1, sdkVersion, commands: Object.keys(commands) } : Object.hasOwn(commands, command.type) ? await commands[command.type](command) : undefined;
        if (data === undefined) throw new Error('Unsupported configuration operation.');
        send({ type: 'response', id: command.id, command: command.type, success: true, data });
      } catch (error) { send({ type: 'response', id: command.id, command: command.type, success: false, error: error.message }); } });
    }
  });
  streams.stdin.on('end', () => process.exit(0));
}
