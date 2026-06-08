export type ToolIdentityKind =
  | 'builtin'
  | 'mcp'
  | 'custom'
  | 'task'
  | 'question'
  | 'skill'
  | 'plan'
  | 'unknown';

export interface ToolIdentityOptions {
  source?: 'generic' | 'opencode' | 'claudian' | 'codex' | 'claude-code';
  knownMcpTools?: Iterable<string>;
  registryTools?: Iterable<string>;
  observedExternalTools?: Iterable<string>;
}

export interface ToolIdentity {
  rawName: string;
  normalizedName: string;
  kind: ToolIdentityKind;
  icon: string;
  displayName: string;
  isMcp: boolean;
}

interface BuiltinToolDefinition {
  normalizedName: string;
  displayName: string;
  icon: string;
  kind: Exclude<ToolIdentityKind, 'mcp' | 'custom'>;
}

export const MCP_TOOL_ICON_ID = 'opencodian-tool-mcp';

const BUILTIN_TOOL_DEFINITIONS: Record<string, BuiltinToolDefinition> = {
  read: { normalizedName: 'read', displayName: 'Read', icon: 'file-text', kind: 'builtin' },
  write: { normalizedName: 'write', displayName: 'Write', icon: 'file-plus', kind: 'builtin' },
  edit: { normalizedName: 'edit', displayName: 'Edit', icon: 'file-pen', kind: 'builtin' },
  multiedit: { normalizedName: 'multiedit', displayName: 'MultiEdit', icon: 'file-pen', kind: 'builtin' },
  applypatch: { normalizedName: 'apply_patch', displayName: 'Apply Patch', icon: 'file-pen', kind: 'builtin' },
  patch: { normalizedName: 'patch', displayName: 'Create Patch', icon: 'file-pen', kind: 'builtin' },
  bash: { normalizedName: 'bash', displayName: 'Bash', icon: 'terminal', kind: 'builtin' },
  grep: { normalizedName: 'grep', displayName: 'Grep', icon: 'search', kind: 'builtin' },
  glob: { normalizedName: 'glob', displayName: 'Glob', icon: 'folder-search', kind: 'builtin' },
  list: { normalizedName: 'list', displayName: 'List', icon: 'folder-tree', kind: 'builtin' },
  ls: { normalizedName: 'list', displayName: 'LS', icon: 'folder-tree', kind: 'builtin' },
  lsp: { normalizedName: 'lsp', displayName: 'LSP', icon: 'search', kind: 'builtin' },
  websearch: { normalizedName: 'web_search', displayName: 'WebSearch', icon: 'search', kind: 'builtin' },
  webfetch: { normalizedName: 'web_fetch', displayName: 'WebFetch', icon: 'download', kind: 'builtin' },
  codesearch: { normalizedName: 'codesearch', displayName: 'CodeSearch', icon: 'code', kind: 'builtin' },
  task: { normalizedName: 'task', displayName: 'Subagent Task', icon: 'git-branch', kind: 'task' },
  question: { normalizedName: 'question', displayName: 'Questions', icon: 'message-square', kind: 'question' },
  askuserquestion: { normalizedName: 'question', displayName: 'Questions', icon: 'message-square', kind: 'question' },
  skill: { normalizedName: 'skill', displayName: 'Skill', icon: 'brain', kind: 'skill' },
  enterplanmode: { normalizedName: 'enter_plan_mode', displayName: 'EnterPlanMode', icon: 'list', kind: 'plan' },
  planenter: { normalizedName: 'plan_enter', displayName: 'EnterPlanMode', icon: 'list', kind: 'plan' },
  exitplanmode: { normalizedName: 'exit_plan_mode', displayName: 'ExitPlanMode', icon: 'check', kind: 'plan' },
  planexit: { normalizedName: 'plan_exit', displayName: 'ExitPlanMode', icon: 'check', kind: 'plan' },
  todowrite: { normalizedName: 'todowrite', displayName: 'Todos', icon: 'list-checks', kind: 'builtin' },
  todoread: { normalizedName: 'todoread', displayName: 'Todo Read', icon: 'list-checks', kind: 'builtin' },
  taskcreate: { normalizedName: 'task_create', displayName: 'Task Create', icon: 'list-checks', kind: 'builtin' },
  taskupdate: { normalizedName: 'task_update', displayName: 'Task Update', icon: 'list-checks', kind: 'builtin' },
  tasklist: { normalizedName: 'task_list', displayName: 'Task List', icon: 'list-checks', kind: 'builtin' },
  taskget: { normalizedName: 'task_get', displayName: 'Task Get', icon: 'list-checks', kind: 'builtin' },
  taskoutput: { normalizedName: 'task_output', displayName: 'Task Output', icon: 'wrench', kind: 'builtin' },
  taskstop: { normalizedName: 'task_stop', displayName: 'Task Stop', icon: 'wrench', kind: 'builtin' },
  structuredoutput: { normalizedName: 'structuredoutput', displayName: 'StructuredOutput', icon: 'wrench', kind: 'unknown' },
  invalid: { normalizedName: 'invalid', displayName: 'Invalid', icon: 'wrench', kind: 'unknown' },
};

const OPENCODE_EXTERNAL_NAME_PATTERN = /^[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)?$/;

function canonicalizeToolName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeKnownToolNames(toolNames?: Iterable<string>): Set<string> {
  const normalized = new Set<string>();
  if (!toolNames) {
    return normalized;
  }

  for (const name of toolNames) {
    if (typeof name !== 'string') {
      continue;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      continue;
    }
    normalized.add(trimmed);
  }

  return normalized;
}

function looksLikeClaudianMcpToolName(name: string): boolean {
  return name.startsWith('mcp__');
}

function looksLikeOpencodeExternalToolName(name: string): boolean {
  if (!name.includes('_') && !name.includes(':') && !name.includes('-')) {
    return false;
  }

  return OPENCODE_EXTERNAL_NAME_PATTERN.test(name);
}

function createIdentity(options: {
  rawName: string;
  normalizedName: string;
  kind: ToolIdentityKind;
  icon: string;
  displayName?: string;
}): ToolIdentity {
  return {
    rawName: options.rawName,
    normalizedName: options.normalizedName,
    kind: options.kind,
    icon: options.icon,
    displayName: options.displayName ?? options.rawName,
    isMcp: options.kind === 'mcp',
  };
}

export function getToolIdentity(name: string, options: ToolIdentityOptions = {}): ToolIdentity {
  const rawName = typeof name === 'string' && name.trim() ? name.trim() : 'tool';
  const builtin = BUILTIN_TOOL_DEFINITIONS[canonicalizeToolName(rawName)];
  if (builtin) {
    return createIdentity({
      rawName,
      normalizedName: builtin.normalizedName,
      kind: builtin.kind,
      icon: builtin.icon,
      displayName: builtin.displayName,
    });
  }

  if (looksLikeClaudianMcpToolName(rawName)) {
    return createIdentity({
      rawName,
      normalizedName: rawName,
      kind: 'mcp',
      icon: MCP_TOOL_ICON_ID,
    });
  }

  const registryTools = normalizeKnownToolNames(options.registryTools);
  const knownMcpTools = normalizeKnownToolNames(options.knownMcpTools);
  const observedExternalTools = normalizeKnownToolNames(options.observedExternalTools);

  if (registryTools.has(rawName)) {
    return createIdentity({
      rawName,
      normalizedName: rawName,
      kind: 'custom',
      icon: 'layers',
    });
  }

  if (knownMcpTools.has(rawName)) {
    return createIdentity({
      rawName,
      normalizedName: rawName,
      kind: 'mcp',
      icon: MCP_TOOL_ICON_ID,
    });
  }

  if (observedExternalTools.has(rawName)) {
    return createIdentity({
      rawName,
      normalizedName: rawName,
      kind: 'mcp',
      icon: MCP_TOOL_ICON_ID,
    });
  }

  if (options.source === 'claude-code') {
    return createIdentity({
      rawName,
      normalizedName: rawName,
      kind: 'unknown',
      icon: 'wrench',
    });
  }

  if (options.source === 'opencode' && looksLikeOpencodeExternalToolName(rawName)) {
    return createIdentity({
      rawName,
      normalizedName: rawName,
      kind: 'custom',
      icon: 'layers',
    });
  }

  return createIdentity({
    rawName,
    normalizedName: rawName,
    kind: 'unknown',
    icon: 'wrench',
  });
}

export function getNormalizedToolName(name: string): string {
  return getToolIdentity(name).normalizedName;
}

export function isBuiltinToolName(name: string): boolean {
  const identity = getToolIdentity(name);
  return identity.kind === 'builtin'
    || identity.kind === 'task'
    || identity.kind === 'question'
    || identity.kind === 'skill'
    || identity.kind === 'plan';
}
