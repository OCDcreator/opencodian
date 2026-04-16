export type McpSummaryCategoryId =
  | 'search'
  | 'fetch'
  | 'read'
  | 'list'
  | 'execute'
  | 'write'
  | 'edit'
  | 'delete'
  | 'navigate'
  | 'auth'
  | 'info';

export interface McpSummaryCategoryDefinition {
  id: McpSummaryCategoryId;
  label: string;
  verbs: readonly string[];
  fields: readonly string[];
}

export const MCP_SUMMARY_CATEGORY_DEFINITIONS: readonly McpSummaryCategoryDefinition[] = [
  {
    id: 'search',
    label: 'Search / query',
    verbs: ['search', 'find', 'query', 'lookup', 'match'],
    fields: ['query', 'q', 'keywords', 'term', 'search', 'searchTerm', 'prompt', 'text'],
  },
  {
    id: 'fetch',
    label: 'Fetch / open / download',
    verbs: ['fetch', 'get', 'open', 'request', 'download', 'crawl', 'scrape', 'visit'],
    fields: ['url', 'uri', 'link', 'href', 'resource', 'resourceUrl', 'endpoint', 'path'],
  },
  {
    id: 'read',
    label: 'Read / view / load',
    verbs: ['read', 'cat', 'show', 'view', 'load'],
    fields: ['path', 'file_path', 'filePath', 'filename', 'file', 'source', 'url', 'uri'],
  },
  {
    id: 'list',
    label: 'List / enumerate',
    verbs: ['list', 'ls', 'glob', 'enumerate', 'browse'],
    fields: ['path', 'dir', 'directory', 'folder', 'cwd', 'root', 'pattern', 'glob'],
  },
  {
    id: 'execute',
    label: 'Execute / command',
    verbs: ['run', 'exec', 'execute', 'command', 'shell', 'bash', 'spawn'],
    fields: ['command', 'cmd', 'script', 'argv', 'arguments', 'args', 'prompt'],
  },
  {
    id: 'write',
    label: 'Write / create / generate',
    verbs: ['write', 'create', 'save', 'export', 'generate', 'emit'],
    fields: ['path', 'file_path', 'filePath', 'target', 'output', 'destination', 'dest', 'name', 'title'],
  },
  {
    id: 'edit',
    label: 'Edit / update / patch',
    verbs: ['edit', 'update', 'patch', 'modify', 'replace', 'rename'],
    fields: ['path', 'file_path', 'filePath', 'target', 'resource', 'instruction', 'prompt', 'name'],
  },
  {
    id: 'delete',
    label: 'Delete / remove',
    verbs: ['delete', 'remove', 'unlink', 'clear', 'purge'],
    fields: ['path', 'file_path', 'filePath', 'target', 'resource', 'id', 'name'],
  },
  {
    id: 'navigate',
    label: 'Navigate / select / locate',
    verbs: ['navigate', 'goto', 'select', 'click', 'focus', 'locate'],
    fields: ['url', 'path', 'selector', 'element', 'target', 'id', 'name'],
  },
  {
    id: 'auth',
    label: 'Auth / connect / session',
    verbs: ['auth', 'login', 'authorize', 'connect', 'callback', 'session'],
    fields: ['url', 'provider', 'server', 'name', 'id', 'clientId'],
  },
  {
    id: 'info',
    label: 'Info / status / metadata',
    verbs: ['info', 'status', 'describe', 'metadata', 'inspect'],
    fields: ['name', 'id', 'resource', 'target', 'path', 'url'],
  },
] as const;

export const MCP_GENERIC_SUMMARY_FIELDS = [
  'query',
  'url',
  'path',
  'file_path',
  'filePath',
  'command',
  'prompt',
  'title',
  'name',
  'id',
  'target',
  'resource',
  'selector',
  'arguments',
  'args',
] as const;

export const MCP_PATH_LIKE_FIELDS = new Set([
  'path',
  'file_path',
  'filePath',
  'filename',
  'file',
  'source',
  'output',
  'destination',
  'dest',
  'folder',
  'directory',
  'root',
  'cwd',
]);

export const MCP_URL_LIKE_FIELDS = new Set([
  'url',
  'uri',
  'link',
  'href',
  'resourceUrl',
  'endpoint',
]);

export const MCP_ARGUMENT_FIELDS = new Set(['arguments', 'args', 'argv']);

function truncateMcpSummaryText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.substring(0, maxLength)}...`;
}

function getPathTail(filePath: string): string {
  if (!filePath) {
    return '';
  }

  const normalized = filePath.replace(/\\/g, '/').replace(/\/+$/, '');
  if (!normalized) {
    return '';
  }

  return normalized.split('/').pop() ?? normalized;
}

function tokenizeMcpToolName(name: string): string[] {
  return name
    .toLowerCase()
    .split(/(?:__|[_:-])+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function resolveMcpSummaryCategory(tokens: string[]): McpSummaryCategoryDefinition | null {
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    const matched = MCP_SUMMARY_CATEGORY_DEFINITIONS.find((category) => category.verbs.includes(token));
    if (matched) {
      return matched;
    }
  }

  for (const category of MCP_SUMMARY_CATEGORY_DEFINITIONS) {
    if (category.verbs.some((verb) => tokens.includes(verb))) {
      return category;
    }
  }

  return null;
}

function formatMcpSummaryField(field: string, value: unknown): string {
  if (MCP_ARGUMENT_FIELDS.has(field)) {
    if (typeof value !== 'string') {
      return '';
    }

    const trimmed = value.trim();
    return trimmed ? truncateMcpSummaryText(trimmed, 60) : '';
  }

  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (MCP_PATH_LIKE_FIELDS.has(field)) {
    return getPathTail(trimmed);
  }

  return truncateMcpSummaryText(trimmed, 60);
}

function getMcpSummaryFromFields(
  input: Record<string, unknown>,
  fields: readonly string[],
): string {
  for (const field of fields) {
    const formatted = formatMcpSummaryField(field, input[field]);
    if (formatted) {
      return formatted;
    }
  }

  return '';
}

function getFirstScalarMcpFallback(input: Record<string, unknown>): string {
  for (const value of Object.values(input)) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        return truncateMcpSummaryText(trimmed, 60);
      }
      continue;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }

    if (typeof value === 'boolean') {
      return String(value);
    }
  }

  return '';
}

export function getMcpToolSummary(name: string, input: Record<string, unknown>): string {
  const tokens = tokenizeMcpToolName(name);
  const category = resolveMcpSummaryCategory(tokens);

  if (category) {
    const categorySummary = getMcpSummaryFromFields(input, category.fields);
    if (categorySummary) {
      return categorySummary;
    }
  }

  const genericSummary = getMcpSummaryFromFields(input, MCP_GENERIC_SUMMARY_FIELDS);
  if (genericSummary) {
    return genericSummary;
  }

  return getFirstScalarMcpFallback(input);
}
