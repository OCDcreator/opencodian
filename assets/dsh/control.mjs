import { lstatSync, realpathSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';

// One boundary for optional, installation-owned services. No native service is
// imported from this bundle: availability comes from the running Cordis context.
const OUTPUT_BYTES = 32 * 1024;
// These configuration sources belong to the vault-native registry, not the
// separately durable machine-local extension document.
const CORE_NAMESPACES = new Set(['agent-default-model', 'llm-deepseek', 'llm-pi-ai', 'permission', 'sandbox-policy', 'approval',
  'compaction-basic', 'skill-filesystem', 'tool-web', 'web', 'tool-fs', 'fs-observation-policy', 'subagent', 'tool-todo', 'tool-jobs',
  'jobs', 'shell-env', 'timeout-policy', 'llm-retry', 'image-offload']);
export const BRIDGE_DEPENDENCY_MODULES = ['@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-session-query', '@deepseek-ai/dsh-session-query-sqlite', '@deepseek-ai/dsh-session-persistence-jsonl',
  '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-attachment', '@deepseek-ai/dsh-attachment-local', '@deepseek-ai/dsh-skill',
  '@deepseek-ai/dsh-working-directory', '@deepseek-ai/dsh-agent-loop', '@deepseek-ai/dsh-hmr', '@deepseek-ai/dsh-config-editor', '@deepseek-ai/dsh-settings'];
const PROTECTED_NAMESPACES = new Set(['loader', 'include', 'settings', 'config-editor', 'plugin-manager', 'credentials', 'credentials-local',
  'agents', 'agent', 'session', 'sessions', 'session-query', 'session-projection', 'session-persistence', 'working-directory', 'sdk', 'acp',
  'llm', 'permission-presets', 'user-approval', 'shell', 'sandbox', 'sandbox-local', 'app-boot', 'host', 'agent-preset']);
const protectedSetting = (ns, moduleName = '') => CORE_NAMESPACES.has(ns) || PROTECTED_NAMESPACES.has(ns) || /opencodian[-_]/.test(ns + moduleName)
  || [...CORE_NAMESPACES, ...PROTECTED_NAMESPACES].some((name) => moduleName === `@deepseek-ai/dsh-${name}`);
const has = (service, method) => typeof service?.[method] === 'function';
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (message) => { throw new ControlError(message); };
class ControlError extends Error {}
const text = (value, label, max = 4096) => typeof value === 'string' && value.length > 0 && value.length <= max
  ? value : fail(`Invalid ${label}`);
const boolean = (value, label) => typeof value === 'boolean' ? value : fail(`Invalid ${label}`);
const integer = (value, fallback, min, max) => value === undefined ? fallback
  : Number.isSafeInteger(value) && value >= min && value <= max ? value : fail('Invalid numeric control bound');
const refName = (value) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(text(value, 'credential reference', 256))
  ? value : fail('Invalid credential reference');
const byteText = (value, cap = OUTPUT_BYTES) => Buffer.from(value).subarray(0, cap).toString('utf8').replace(/\uFFFD$/, '');
const hiddenKey = /^(?:headers?|env|environment|credentials?|password|passwd|secret|clientSecret|apiKey|accessToken|refreshToken|authorization|cookie|privateKey|logPath|documentPath|patchPath|diagnostic)$/i;
const publicErrorCodes = new Set(['NO_BACKEND', 'NO_SESSION', 'FOREIGN_SESSION', 'OWNER_NOT_LIVE', 'SEND_ACTIVE', 'SERVICE_DISPOSING',
  'DUPLICATE_NAME', 'UNAUTHORIZED', 'UNSUPPORTED_CAPABILITY', 'SETTINGS_CONFLICT']);
const subagentPromptFailureCodes = new Set(['subagent/parent-unavailable', 'subagent/not-resumable', 'subagent/unauthorized',
  'subagent/delivery-unavailable', 'subagent/attachment-invalid', 'subagent/invalid-time-zone']);

function redactText(value, secrets) {
  let result = String(value);
  for (const secret of secrets) if (secret) result = result.split(secret).join('[redacted]');
  return result
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g, '[redacted]')
    .replace(/\b(?:Bearer|Basic)\s+[^\s"'<>]+/gi, '[redacted]')
    .replace(/\b(?:sk|pk|ghp|github_pat|xox[baprs])[-_][\w-]{8,}/g, '[redacted]')
    .replace(/\b((?:[\w-]*(?:token|secret|password|passwd|api[_-]?key|authorization|cookie)[\w-]*)\s*[=:]\s*)[^\r\n]+/gi, '$1[redacted]')
    .replace(/https?:\/\/[^\s<>"']+/gi, (url) => {
      try { const parsed = new URL(url); parsed.username = ''; parsed.password = ''; parsed.search = ''; parsed.hash = ''; return parsed.toString(); }
      catch { return '[redacted URL]'; }
    });
}

// Native descriptors already redact schema secrets. This additional wire crop
// removes raw headers/env and secret defaults in schemas contributed by plugins.
function publicValue(value, secrets, depth = 0) {
  if (depth > 24) return '[truncated]';
  if (typeof value === 'string') return byteText(redactText(value, secrets));
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (Array.isArray(value)) return value.slice(0, 2048).map((entry) => publicValue(entry, secrets, depth + 1));
  if (!object(value)) return undefined;
  const result = {};
  const secretSchema = value.role === 'secret' || value.meta?.role === 'secret';
  for (const [key, item] of Object.entries(value).slice(0, 2048)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) continue;
    if (hiddenKey.test(key) || secretSchema && ['default', 'initial', 'value', 'const', 'enum'].includes(key)) continue;
    if (/^(?:apiKeyEnv|credentialRef)$/.test(key)) {
      if (typeof item === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(item)) result[key] = item;
      continue;
    }
    result[key] = publicValue(item, secrets, depth + 1);
  }
  return result;
}

/** Validate proof supplied by the launcher; this never reads profile contents. */
export function managedProfileProof(ctx, config) {
  try {
    const profile = ctx.get('profileContext');
    const root = config.managedProfileRoot;
    if (typeof root !== 'string' || !path.isAbsolute(root) || path.resolve(root) !== root
      || realpathSync(root) !== root || profile?.dir !== root) return false;
    const owned = (target, directory, optional = false) => {
      let stat;
      try { stat = lstatSync(target); } catch (error) { return optional && error.code === 'ENOENT'; }
      return !stat.isSymbolicLink() && (directory ? stat.isDirectory() : stat.isFile())
        && (typeof process.getuid !== 'function' || stat.uid === process.getuid()) && (stat.mode & 0o022) === 0;
    };
    if (!owned(root, true) || !owned(path.join(root, 'node_modules'), true)) return false;
    if (typeof profile.patchPath !== 'string' || path.dirname(profile.patchPath) !== root
      || !owned(profile.patchPath, false, true)) return false;
    for (const name of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc', 'compatibility.json'])
      if (!owned(path.join(root, name), false, true)) return false;
    const markerPath = path.join(root, '.opencodian-dsh-profile.json');
    if (!owned(markerPath, false) || lstatSync(markerPath).size > 4096) return false;
    const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
    return marker.version === 1 && marker.owner === 'opencodian.dsh' && /^[a-f0-9]{64}$/.test(marker.vaultHash)
      && ['sdk', 'acp'].includes(marker.profile);
  } catch { return false; }
}

/** Preserve absolute executable admission and delegate advanced bounds to native Config. */
export async function mcpClientConfig(ctx, server, cwd) {
  const common = { serverName: text(server.name, 'MCP server name', 32), failOnStartupError: server.failOnStartupError ?? true };
  for (const key of ['toolCallTimeoutMs', 'maxInstructionBytes', 'reconnect'])
    if (server[key] !== undefined) common[key] = server[key];
  const pairs = (entries = []) => {
    if (!Array.isArray(entries)) fail('Invalid MCP entries');
    return Object.fromEntries(entries.map((entry) => [text(entry.name, 'MCP entry name'), String(entry.value ?? '')]));
  };
  if (server.type === 'http') {
    const headers = pairs(server.headers);
    // Credential values only enter the native instance configuration in memory.
    // No result or diagnostic returns this object to the host.
    if (server.headerCredentialRefs !== undefined) {
      if (!object(server.headerCredentialRefs)) fail('Invalid MCP credential references');
      const credentials = ctx.get('credentials');
      if (!has(credentials, 'resolve')) fail('Native credential resolution is unavailable');
      for (const [name, ref] of Object.entries(server.headerCredentialRefs)) {
        const credential = await credentials.resolve(refName(ref));
        if (!credential?.value) fail('An MCP credential reference is not configured');
        headers[text(name, 'MCP header name')] = credential.value;
      }
    }
    return { ...common, transport: 'streamable-http', url: server.url, headers };
  }
  if (server.type !== undefined && server.type !== 'stdio' || !path.isAbsolute(text(server.command, 'MCP executable')))
    fail('MCP executable must be an absolute path');
  const directory = server.cwd ?? cwd;
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) fail('MCP working directory must be absolute');
  return { ...common, transport: 'stdio', command: server.command, args: server.args ?? [], env: pairs(server.env), cwd: directory };
}

export function createControlRuntime(ctx, config, { sessions, requireSession, update, notify, redactSecrets,
  plainConfig = (value) => value, protectedModules = BRIDGE_DEPENDENCY_MODULES, serviceIdentity = (value) => value, terminalServiceClass }) {
  let closed = false;
  const secrets = new Set();
  const subscriptions = [];
  const waits = new Map();
  const operations = new Map();
  const childEpochs = new Map();
  const processController = new AbortController();
  let subscribedJobs;
  let unsubscribeJobs;
  let subscribedProjections;
  let unsubscribeProjections;
  let compositionRevision = 0;
  let compositionIdentities;
  const get = (name) => name === 'terminals' ? terminalResolution().service : ctx.get(name);
  function terminalResolution() {
    const direct = ctx.get('terminals');
    if (direct) return { present: true, service: direct };
    const loader = ctx.get('loader');
    if (!has(loader, 'entries')) return { present: false };
    const entries = [...loader.entries()];
    const candidates = entries.filter((entry) => entry.options?.id === 'optional-terminal-registry' && entry.fiber?.state === 2
      && entry.options?.disabled !== true);
    const active = candidates.filter((entry) => {
      const group = entry.parent?.ctx?.fiber?.entry;
      return group?.options?.id === 'optional-persistent-terminals' && group.options.group === true && group.fiber?.state === 2
        && group.options.disabled !== true && group.options.isolate?.terminals === true && group.subgroup === entry.parent
        && entries.includes(group);
    });
    if (!active.length) return { present: false };
    // An ambiguous or unverified isolated provider is not absence evidence.
    // Refuse its methods but retain present=true so reconnect fails closed.
    const authority = active.flatMap((entry) => [entry, entry.fiber, entry.parent?.ctx?.fiber?.entry?.fiber]).map(serviceIdentity);
    if (active.length !== 1 || typeof terminalServiceClass !== 'function' || !managedProfileProof(ctx, config)) return { present: true, authority };
    const entry = active[0];
    const nativeModule = entry.moduleNamespace?.default ?? entry.moduleNamespace;
    if (nativeModule !== terminalServiceClass || entry.fiber.runtime?.callback !== terminalServiceClass) return { present: true, authority };
    const scope = entry.context;
    if (!scope || scope.get('profileContext')?.dir !== config.managedProfileRoot
      || serviceIdentity(scope.get('agents')) !== serviceIdentity(ctx.get('agents'))) return { present: true, authority };
    const service = scope.get('terminals');
    if (!(serviceIdentity(service) instanceof terminalServiceClass)) return { present: true, authority };
    return { present: true, service, authority };
  }
  const need = (name, method) => {
    const service = get(name);
    if (!has(service, method)) fail(`Native ${name}.${method} is unavailable`);
    return service;
  };
  const safe = (value) => publicValue(value, secrets);
  const moduleIdentity = (name) => {
    if (typeof name !== 'string') return '';
    try { return realpathSync(name.startsWith('file:') ? fileURLToPath(name) : name); } catch { return name; }
  };
  const protectedIdentities = new Set([...BRIDGE_DEPENDENCY_MODULES, ...protectedModules].map(moduleIdentity));
  const protectedModule = (name) => protectedIdentities.has(moduleIdentity(name));
  const current = (id, record) => !closed && !record.closing && sessions.get(id) === record;
  const emit = (id, record, value) => {
    if (!current(id, record)) return;
    try { Promise.resolve(update(id, value)).catch(() => {}); } catch { /* transport already closed */ }
  };
  const globalUpdate = (value) => {
    if (!closed) { try { Promise.resolve(notify('config/extensions/update', value)).catch(() => {}); } catch { /* transport already closed */ } }
  };
  function controller(id) {
    const control = new AbortController();
    if (!waits.has(id)) waits.set(id, new Set());
    waits.get(id).add(control);
    return { signal: control.signal, release: () => { waits.get(id)?.delete(control); if (!waits.get(id)?.size) waits.delete(id); } };
  }
  async function withSession(params, callback) {
    const record = requireSession(text(params.sessionId, 'session id'));
    const scope = controller(params.sessionId);
    try {
      const result = await callback(record, scope.signal);
      if (!current(params.sessionId, record)) fail('Harness session closed during control operation');
      return result;
    } finally { scope.release(); }
  }
  function todoView(value) {
    if (value === null) return [];
    if (!Array.isArray(value)) fail('Native todo projection is unavailable');
    return value.map((todo, index) => {
      if (typeof todo?.content !== 'string' || !['pending', 'in_progress', 'completed'].includes(todo.status)) fail('Invalid native todo projection');
      // Native todos are a whole-list snapshot without stable identifiers.
      return { id: `todo-${index}`, content: byteText(todo.content), status: todo.status };
    });
  }
  function subscribeProjections() {
    const projections = get('sessionProjections');
    const identity = serviceIdentity(projections);
    if (identity === subscribedProjections) return;
    unsubscribeProjections?.(); unsubscribeProjections = undefined;
    subscribedProjections = undefined;
    if (!has(projections, 'onChanged')) return;
    subscribedProjections = identity;
    unsubscribeProjections = projections.onChanged((session, key, value) => {
      const record = sessions.get(session.id);
      if (serviceIdentity(get('sessionProjections')) !== identity || key !== 'todos' || !record || record.handle.agent.session !== session) return;
      try { emit(session.id, record, { sessionUpdate: 'todo_update', todos: todoView(value) }); } catch { /* optional observer */ }
    });
  }
  function todos(record) {
    subscribeProjections();
    const projection = need('sessionProjections', 'snapshot').snapshot(record.handle.agent.session, ['todos']);
    return { todos: todoView(projection.values?.todos) };
  }
  function permissionState(service, session) {
    return { catalog: safe(service.catalog()), current: service.current(session), defaultPreset: service.defaultPreset };
  }
  function subscribeJobs() {
    const jobs = get('jobs');
    const identity = serviceIdentity(jobs);
    if (identity === subscribedJobs) return;
    unsubscribeJobs?.(); unsubscribeJobs = undefined;
    subscribedJobs = identity;
    if (!has(jobs?.events, 'subscribe')) return;
    unsubscribeJobs = jobs.events.subscribe({ owners: 'scope' }, (event) => {
      if (serviceIdentity(get('jobs')) !== identity) return;
      const owner = event.type === 'output' ? event.owner : event.job?.owner;
      const record = sessions.get(owner);
      if (!record || !current(owner, record)) return;
      const payload = event.type === 'output'
        ? { type: 'output', id: event.id, owner, total: event.total }
        : { type: event.type, job: safe(event.job), ...(event.cause ? { cause: event.cause, awaited: event.awaited } : {}) };
      emit(owner, record, { sessionUpdate: 'jobs_update', event: payload });
    });
  }
  function extensionSettingsAvailable() {
    const profile = get('profileContext');
    return managedProfileProof(ctx, config) && has(get('settings'), 'describe') && has(get('settings'), 'mutate')
      && has(get('configEditor'), 'entries') && has(get('pluginManager'), 'listPlugins')
      && get('settings').writable === true && get('settings').documentPath === profile.patchPath
      && get('configEditor').documentPath === profile.patchPath;
  }
  async function editableEntries() {
    if (!extensionSettingsAvailable()) return new Map();
    const inventory = await get('pluginManager').listPlugins();
    const profile = get('profileContext');
    const blocked = new Set();
    const visit = (patches) => {
      if (!Array.isArray(patches)) return;
      for (const patch of patches) {
        if (!object(patch)) continue;
        if (typeof patch.id === 'string') blocked.add(patch.id);
        visit(patch.insert);
        if (patch.group) visit(patch.config);
      }
    };
    visit(profile.overlays);
    const entries = get('configEditor').entries();
    const selected = new Map();
    for (const entry of entries) {
      const ns = entry.options?.id;
      const listed = inventory.find((item) => item.entryId === entry.id);
      if (typeof ns !== 'string' || protectedSetting(ns, entry.options?.name) || protectedModule(entry.options?.name) || blocked.has(ns)
        || !listed || listed.readOnlyReason || entry.fiber?.state !== 2 || !has(entry.fiber?.runtime?.Config, 'toJSON')) continue;
      if (selected.has(ns)) { selected.delete(ns); blocked.add(ns); } else selected.set(ns, entry);
    }
    return selected;
  }
  function descriptor(form, writable) {
    return { ns: form.ns, autoGenerate: form.autoGenerate, schema: safe(form.schema), value: safe(form.value),
      base: safe(form.base), user: safe(form.user), revision: form.revision, applies: form.applies, secrets: safe(form.secrets ?? []),
      valueSource: 'effective', baseSource: 'resolved', writable,
      ...(writable ? { persistenceSource: 'managed-profile' } : {}) };
  }
  function validateExtensionOps(schema, ops) {
    if (!Array.isArray(ops) || ops.length === 0 || ops.length > 128 || Buffer.byteLength(JSON.stringify(ops)) > 65536)
      fail('Invalid extension settings operations');
    const sensitive = (node, seen = new Set()) => {
      if (!node || seen.has(node)) return false;
      seen.add(node);
      if (node.meta?.role === 'secret' || ['any', 'function'].includes(node.type)) return true;
      if (Object.entries(node.dict ?? {}).some(([key, child]) => hiddenKey.test(key) || sensitive(child, seen))) return true;
      return sensitive(node.inner, seen) || (node.list ?? []).some((child) => sensitive(child, seen));
    };
    const at = (node, parts, volatile = false, seen = new Set()) => {
      if (!node || seen.has(node) || node.meta?.role === 'secret') fail('Settings path is not a public volatile field');
      const visited = new Set(seen).add(node);
      volatile ||= node.meta?.volatile === true;
      if (!parts.length) {
        if (!volatile || sensitive(node)) fail('Settings path would overwrite a secret or non-public field');
        return;
      }
      if (node.type === 'union' || node.type === 'intersect') {
        if (!node.list?.length) fail('Unsupported extension schema');
        for (const child of node.list) at(child, parts, volatile, visited);
        return;
      }
      if (node.type === 'transform') { at(node.inner, parts, volatile, visited); return; }
      const [key, ...rest] = parts;
      if (hiddenKey.test(key) || ['__proto__', 'prototype', 'constructor', '__jsExpr'].includes(key)) fail('Protected extension settings path');
      if (node.type === 'object' && Object.hasOwn(node.dict ?? {}, key)) at(node.dict[key], rest, volatile, visited);
      else if (node.type === 'dict') at(node.inner, rest, volatile, visited);
      else if (node.type === 'array' && /^(0|[1-9][0-9]*)$/.test(key)) at(node.inner, rest, volatile, visited);
      else fail('Unknown extension settings path');
    };
    const data = (value, depth = 0) => {
      if (depth > 16) fail('Extension settings value is too deep');
      if (value === null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return;
      if (typeof value === 'string') { if (value.includes('!!js')) fail('Executable extension settings values are forbidden'); return; }
      if (Array.isArray(value)) { for (const item of value) data(item, depth + 1); return; }
      if (!object(value)) fail('Extension settings value must be JSON');
      for (const [key, item] of Object.entries(value)) {
        if (['__proto__', 'constructor', 'prototype', '__jsExpr'].includes(key) || hiddenKey.test(key)) fail('Protected extension settings value');
        data(item, depth + 1);
      }
    };
    return ops.map((op) => {
      if (!object(op) || !['set', 'unset'].includes(op.op) || !Array.isArray(op.path) || op.path.length === 0 || op.path.length > 16
        || op.path.some((part) => typeof part !== 'string' || !part || part.length > 256)) fail('Settings paths must be nonempty string arrays');
      at(schema, op.path);
      if (op.op === 'set') { data(op.value); return { op: 'set', path: [...op.path], value: structuredClone(op.value) }; }
      return { op: 'unset', path: [...op.path] };
    });
  }
  function extensionMutationExpectation(before, ops) {
    const value = structuredClone(before.value);
    const user = structuredClone(before.user ?? {});
    const member = (root, parts) => parts.reduce((current, key) => current !== null && typeof current === 'object'
      && Object.hasOwn(current, key) ? current[key] : undefined, root);
    const change = (root, parts, replacement, remove = false) => {
      let target = root;
      let effective = value;
      for (const key of parts.slice(0, -1)) {
        effective = effective !== null && typeof effective === 'object' ? effective[key] : undefined;
        if (target[key] === null || typeof target[key] !== 'object') {
          // Native path mutation seeds an absent array from the resolved
          // container and persists its complete replacement, including the
          // untouched inherited elements. Object overrides remain sparse.
          target[key] = Array.isArray(effective) ? structuredClone(effective) : {};
        }
        target = target[key];
      }
      const key = parts.at(-1);
      if (remove && Array.isArray(target)) target.splice(Number(key), 1);
      else if (remove) Reflect.deleteProperty(target, key);
      else Object.defineProperty(target, key, { value: structuredClone(replacement), enumerable: true, configurable: true, writable: true });
    };
    for (const op of ops) {
      if (op.op === 'set') { change(value, op.path, op.value); change(user, op.path, op.value); continue; }
      const parentPath = op.path.slice(0, -1);
      if (Array.isArray(member(value, parentPath))) {
        // Native array unset removes an element, so the next item occupies its
        // index. Requiring absence at that path would reject valid splices.
        change(value, op.path, undefined, true);
        change(user, parentPath, member(value, parentPath));
        continue;
      }
      const inherited = member(before.base, op.path);
      change(value, op.path, inherited, inherited === undefined);
      change(user, op.path, undefined, true);
    }
    const normalizeUser = (section, base) => {
      if (isDeepStrictEqual(section, base)) return undefined;
      if (!object(section)) return structuredClone(section);
      const result = {};
      for (const [key, entry] of Object.entries(section)) {
        const normalized = normalizeUser(entry, object(base) && Object.hasOwn(base, key) ? base[key] : undefined);
        if (normalized !== undefined) Object.defineProperty(result, key, { value: normalized, enumerable: true, configurable: true, writable: true });
      }
      return Object.keys(result).length ? result : undefined;
    };
    // ConfigEditor persists a complete section while any sibling differs. An
    // unset may therefore leave the inherited value materialized in `user`.
    // Removing equal-to-base entries compares the actual override, while the
    // separate whole effective snapshot still proves its inherited resolution.
    const normalizedUser = normalizeUser(user, before.base);
    return { value, user: normalizedUser, normalizeUser,
      changed: !isDeepStrictEqual(value, before.value) || !isDeepStrictEqual(normalizedUser, normalizeUser(before.user, before.base)) };
  }
  async function extensionSettings(params) {
    if (params.action !== 'mutate') fail('Unsupported extension settings action');
    const ns = text(params.ns, 'extension settings namespace', 256);
    if (!Number.isSafeInteger(params.expectedRevision) || params.expectedRevision < 0) fail('An expected settings revision is required');
    const entries = await editableEntries();
    const entry = entries.get(ns);
    if (!entry) fail('Extension settings namespace is unavailable or protected');
    const settings = need('settings', 'describe');
    const settingsIdentity = serviceIdentity(settings);
    const before = (await settings.describe({ redactSecrets: true })).find((form) => form.ns === ns);
    if (!before) fail('No public volatile form exists for this extension');
    if (before.revision !== params.expectedRevision) fail('Native settings changed [SETTINGS_CONFLICT]; refresh before editing');
    const ops = validateExtensionOps(entry.fiber.runtime.Config, params.ops);
    if (closed || !extensionSettingsAvailable()) fail('Managed extension settings authority changed');
    // Native ConfigEditor rechecks entry identity, revision, profile overlays,
    // validates Config, atomically writes its document, then reconciles Loader.
    // No replace/update or caller-provided schema/document is accepted here.
    const expected = extensionMutationExpectation(before, ops);
    const revisions = new Set();
    const stopObserving = ctx.on('settings/document-updated', (changedNs, revision) => {
      if (changedNs === ns) revisions.add(revision);
    });
    try {
      await settings.mutate(ns, ops, params.expectedRevision);
      const persisted = { source: 'managed-profile', status: 'verified' };
      let after;
      try { after = (await settings.describe({ redactSecrets: true })).find((form) => form.ns === ns); }
      catch { return { form: null, persistence: persisted,
        application: { status: 'unavailable', reason: 'effective-readback-failed' }, readback: { status: 'unavailable' } }; }
      if (!after) return { form: null, persistence: persisted,
        application: { status: 'unavailable', reason: 'extension-form-no-longer-active' }, readback: { status: 'unavailable' } };
      const revisionDelta = after.revision - before.revision;
      const uninterrupted = Number.isSafeInteger(after.revision) && revisionDelta === (expected.changed ? 1 : 0)
        && [...revisions].every((revision) => Number.isSafeInteger(revision) && revision >= before.revision && revision <= before.revision + 1);
      const sameSource = serviceIdentity(get('settings')) === settingsIdentity && isDeepStrictEqual(after.base, before.base)
        && isDeepStrictEqual(after.secrets ?? [], before.secrets ?? []);
      const confirmed = uninterrupted && sameSource && isDeepStrictEqual(after.value, expected.value)
        && isDeepStrictEqual(expected.normalizeUser(after.user, before.base), expected.user);
      return { form: descriptor(after, true), persistence: persisted,
        application: confirmed ? { status: 'verified' } : { status: 'unavailable', reason: !uninterrupted || !sameSource
          ? 'concurrent-settings-change' : 'effective-readback-differs' },
        readback: { status: 'verified' } };
    } finally { stopObserving?.(); }
  }
  function capabilities() {
    subscribeJobs();
    subscribeProjections();
    const methods = (name, entries) => Object.fromEntries(Object.entries(entries).map(([key, method]) => [key, has(get(name), method)]));
    const managed = managedProfileProof(ctx, config);
    const extensions = methods('pluginManager', { list: 'listPlugins', inspect: 'inspect', versions: 'listVersions', enablePlugin: 'setPluginEnabled',
      enableBundle: 'setBundleEnabled', install: 'installBundle', update: 'updateBundle', remove: 'removeBundle', cancel: 'cancelInstall', exempt: 'setVersionExemption' });
    extensions.list &&= has(get('pluginManager'), 'listBundles');
    for (const key of ['enablePlugin', 'enableBundle', 'install', 'update', 'remove', 'cancel', 'exempt']) extensions[key] &&= managed;
    const terminalSelection = terminalResolution();
    const terminals = terminalSelection.service;
    const identities = ['agents', 'goals', 'jobs', 'subagents', 'sessionProjections', 'loader']
      .map((name) => serviceIdentity(ctx.get(name))).concat(serviceIdentity(terminals), terminalSelection.present, terminalSelection.authority ?? []);
    if (compositionIdentities && (identities.length !== compositionIdentities.length
      || identities.some((identity, index) => identity !== compositionIdentities[index]))) compositionRevision++;
    compositionIdentities = identities;
    let backends = [];
    try { if (has(terminals, 'listBackends')) backends = terminals.listBackends(); } catch { /* unavailable */ }
    const terminal = methods('terminals', { availability: 'listBackends', list: 'list', activity: 'hasOwnerActivity', spawn: 'spawn', read: 'read', send: 'startSend', signal: 'signal', kill: 'kill' });
    for (const key of ['spawn', 'read', 'send', 'signal', 'kill']) terminal[key] &&= backends.length > 0;
    const permissionPresets = { get: ['catalog', 'current'].every((key) => has(get('permissionPresets'), key)), set: false };
    permissionPresets.set = permissionPresets.get && has(get('permissionPresets'), 'set');
    const credentials = methods('credentials', { describe: 'describe', set: 'set', unset: 'unset' });
    credentials.set &&= credentials.describe; credentials.unset &&= credentials.describe;
    const plan = methods('planMode', { get: 'get', set: 'set' }); plan.set &&= plan.get;
    const jobs = methods('jobs', { list: 'list', get: 'get', read: 'read', readAt: 'readAt', wait: 'wait', kill: 'kill' });
    for (const key of ['read', 'readAt', 'wait', 'kill']) jobs[key] &&= jobs.get;
    return {
      configurationCapabilities: { describe: has(get('settings'), 'describe'), credentials,
        extensionSettings: { mutate: extensionSettingsAvailable() },
        extensions: { ...extensions, managedProfile: managed, progress: extensions.install || extensions.update || extensions.remove } },
      controlCapabilities: { readback: true, revision: compositionRevision, permissionPresets, plan,
        todos: { list: has(get('sessionProjections'), 'snapshot'), updates: has(get('sessionProjections'), 'snapshot') },
        jobs: { present: Boolean(get('jobs')), ...jobs, updates: has(get('jobs')?.events, 'subscribe') },
        terminal: { present: terminalSelection.present, ...terminal },
        subagents: { present: Boolean(get('subagents')), list: has(get('subagents'), 'listChildren'), get: has(get('subagents'), 'listChildren'),
          cancel: has(get('subagents'), 'listChildren') && has(get('subagents'), 'interrupt'),
          prompt: has(get('subagents'), 'listChildren') && has(get('subagents'), 'prompt') },
        goal: { present: Boolean(get('goals')) },
        mcp: { apply: true, status: true, connectionStatus: false } },
    };
  }
  async function describe(params) {
    const service = need('settings', 'describe');
    if (params.namespaces !== undefined && (!Array.isArray(params.namespaces) || params.namespaces.some((ns) => typeof ns !== 'string')))
      fail('Invalid configuration namespaces');
    const forms = (await service.describe({ redactSecrets: true })).filter((form) => !params.namespaces || params.namespaces.includes(form.ns));
    let editable = new Map();
    try { editable = await editableEntries(); } catch { /* Public form reads remain available if write admission fails. */ }
    const selected = params.namespaces ?? [...CORE_NAMESPACES];
    const editor = get('configEditor');
    let rows = [];
    if (has(editor, 'configuration')) { try { rows = await editor.configuration(); } catch { /* Explicit unavailable observations below. */ } }
    const observations = selected.filter((ns) => CORE_NAMESPACES.has(ns)).map((ns) => {
      const matches = rows.filter((row) => row.entry?.options?.id === ns);
      const entry = matches.length === 1 ? matches[0].entry : undefined;
      const schema = entry?.fiber?.runtime?.Config;
      if (entry?.fiber?.state !== 2 || !has(schema, 'toJSON') || typeof redactSecrets !== 'function')
        return { ns, status: 'unavailable', valueSource: 'effective', reason: 'active-entry-or-native-schema-unavailable' };
      try {
        const redacted = redactSecrets(schema, plainConfig(entry.fiber.effectiveConfig));
        return { ns, status: 'verified', valueSource: 'effective', value: safe(redacted.value), secrets: safe(redacted.secrets) };
      } catch { return { ns, status: 'unavailable', valueSource: 'effective', reason: 'native-effective-readback-failed' }; }
    });
    return { forms: forms.map((form) => descriptor(form, editable.has(form.ns))), observations,
      profile: { managed: managedProfileProof(ctx, config), writable: service.writable === true, hasDocument: typeof service.documentPath === 'string' && service.documentPath.length > 0 },
      ...(typeof config.nativeConfigRevision === 'string' ? { appliedRevision: config.nativeConfigRevision } : {}) };
  }
  async function credentials(params) {
    const action = params.action ?? 'describe';
    if (!['describe', 'set', 'unset'].includes(action)) fail('Unsupported credential action');
    const service = need('credentials', 'describe');
    let refs;
    if (action === 'describe') {
      refs = params.refs ?? (params.ref ? [params.ref] : []);
      if (!Array.isArray(refs) || refs.length > 128) fail('Invalid credential references');
      refs = [...new Set(refs.map(refName))];
    } else {
      const ref = refName(params.ref);
      const info = await service.describe(ref);
      if (info.writable !== true) fail('Native credential reference is read-only');
      if (action === 'set') {
        const value = text(params.value, 'credential value', 65536);
        secrets.add(value);
        await need('credentials', 'set').set(ref, value);
      } else await need('credentials', 'unset').unset(ref);
      refs = [ref];
    }
    return { credentials: await Promise.all(refs.map(async (ref) => {
      const info = await service.describe(ref);
      return { ref, configured: info.configured === true, writable: info.writable === true,
        ...(typeof info.source === 'string' ? { source: safe(info.source) } : {}) };
    })) };
  }
  async function permissions(params) {
    return withSession(params, (record) => {
      const service = need('permissionPresets', 'current');
      const action = params.action ?? 'get';
      if (action === 'set') need('permissionPresets', 'set').set(record.handle.agent.session, text(params.preset, 'permission preset', 128));
      else if (action !== 'get') fail('Unsupported permission preset action');
      return permissionState(service, record.handle.agent.session);
    });
  }
  async function plan(params) {
    return withSession(params, (record) => {
      const service = need('planMode', 'get');
      const action = params.action ?? 'get';
      let disposition;
      if (action === 'set') disposition = need('planMode', 'set').set(record.handle.agent, boolean(params.active, 'plan state'));
      else if (action !== 'get') fail('Unsupported plan action');
      const result = { ...service.get(record.handle.agent), ...(disposition !== undefined ? { disposition } : {}) };
      if (action === 'set') emit(params.sessionId, record, { sessionUpdate: 'plan_update', ...result });
      return result;
    });
  }
  function maskedOutput(chunks) {
    // Mask before splitting pages AND before splitting native chunks. ASCII
    // masks occupy the original UTF-8 span, so every continuation stays in the
    // registry's byte coordinates instead of counting redacted display text.
    const source = chunks.map((chunk) => String(chunk.text ?? '')).join('');
    const bytes = Buffer.from(source);
    const mask = (start, end) => bytes.fill(42, Buffer.byteLength(source.slice(0, start)), Buffer.byteLength(source.slice(0, end)));
    const overlap = (left, right) => {
      if (!left || !right) return 0;
      const prefix = new Uint32Array(right.length);
      for (let i = 1, j = 0; i < right.length; i++) {
        while (j && right[i] !== right[j]) j = prefix[j - 1];
        if (right[i] === right[j]) j++;
        prefix[i] = j;
      }
      let matched = 0;
      const tail = left.slice(-right.length);
      for (let index = 0; index < tail.length; index++) {
        const character = tail[index];
        while (matched && (matched === right.length || character !== right[matched])) matched = prefix[matched - 1];
        if (character === right[matched]) matched++;
      }
      return matched;
    };
    for (const secret of secrets) {
      for (let index = source.indexOf(secret); index >= 0; index = source.indexOf(secret, index + 1)) mask(index, index + secret.length);
      // A stream can stop halfway through a credential, or its retained head
      // can start halfway through one. Such boundary fragments are not public.
      const suffix = overlap(source, secret); if (suffix) mask(source.length - suffix, source.length);
      const prefix = overlap(secret, source.slice(0, secret.length)); if (prefix) mask(0, prefix);
    }
    const patterns = [/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g,
      /\b(?:Bearer|Basic)\s+[^\s"'<>]+/gi, /\b(?:sk|pk|ghp|github_pat|xox[baprs])[-_][\w-]{8,}/g,
      /\b[\w-]*(?:token|secret|password|passwd|api[_-]?key|authorization|cookie)[\w-]*\s*[=:]\s*[^\r\n]+/gi,
      /https?:\/\/[^\s<>"']*[?@][^\s<>"']*/gi];
    for (const pattern of patterns) for (const match of source.matchAll(pattern)) mask(match.index, match.index + match[0].length);
    let offset = 0;
    return chunks.map((chunk) => {
      const length = Buffer.byteLength(String(chunk.text ?? ''));
      const text = bytes.subarray(offset, offset + length).toString('utf8'); offset += length;
      return { ...chunk, text };
    });
  }
  function boundedRead(value, maxBytes) {
    let remaining = maxBytes;
    let truncated = false;
    const chunks = [];
    for (const chunk of maskedOutput(value.chunks ?? [])) {
      const raw = String(chunk.text ?? '');
      const retained = byteText(raw, remaining);
      if (retained) chunks.push({ ...safe(chunk), text: safe(retained) });
      remaining -= Buffer.byteLength(retained);
      if (Buffer.byteLength(raw) > Buffer.byteLength(retained)) truncated = true;
    }
    const result = typeof value.result === 'string' ? byteText(redactText(value.result, secrets), remaining) : undefined;
    if (value.result && result !== value.result) truncated = true;
    return { ...safe(value), chunks, ...(result !== undefined ? { result: safe(result) } : {}),
      lossy: value.lossy === true || truncated, truncated };
  }
  function boundedReadAt(value, from, maxBytes) {
    const chunks = [];
    let next = from;
    let remaining = maxBytes;
    let truncated = false;
    let lossy = value.lossy === true;
    for (const chunk of maskedOutput(value.chunks ?? [])) {
      const bytes = Buffer.from(String(chunk.text ?? ''));
      let start = Math.max(0, from - chunk.at);
      if (start >= bytes.length) continue;
      // Native readAt returns an entire overlapping chunk; resume consumers
      // must not duplicate the prefix we already served on an earlier page.
      while (start < bytes.length && (bytes[start] & 0xc0) === 0x80) { start++; lossy = true; }
      let end = Math.min(bytes.length, start + remaining);
      while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
      if (end === start) { truncated = true; break; }
      const original = bytes.subarray(start, end).toString('utf8');
      const rendered = byteText(redactText(original, secrets), remaining);
      chunks.push({ ...safe(chunk), at: chunk.at + start, text: rendered });
      remaining -= Buffer.byteLength(rendered);
      next = chunk.at + end;
      if (end < bytes.length) { truncated = true; break; }
    }
    if (!truncated) next = value.next;
    return { chunks, next, lossy, truncated };
  }
  async function jobs(params) {
    subscribeJobs();
    return withSession(params, async (record, signal) => {
      const owner = record.handle.agent.session.id;
      const service = need('jobs', params.action);
      if (params.action === 'list') return { jobs: service.list(owner).filter((job) => job.owner === owner).map(safe) };
      if (!['get', 'read', 'readAt', 'wait', 'kill'].includes(params.action)) fail('Unsupported jobs action');
      const id = text(params.jobId, 'job id');
      const owned = () => {
        const job = need('jobs', 'get').get(id, owner);
        if (job.owner !== owner) fail('Job is not owned by this session');
        return job;
      };
      const job = owned();
      if (params.action === 'get') return { job: safe(job) };
      if (params.action === 'kill') return { disposition: service.kill(id, owner, params.reason === undefined ? undefined : text(params.reason, 'job cancellation reason')),
        job: safe(owned()) };
      if (params.action === 'wait') return { job: safe(await service.wait(id, integer(params.timeoutMs, 1000, 1, 30000), owner, signal)) };
      if (params.action === 'readAt') {
        const from = integer(params.from, 0, 0, Number.MAX_SAFE_INTEGER);
        // Inspect the complete retained ring for secrets split across native
        // chunks, then crop to the caller's offset without consuming the ring.
        return boundedReadAt(service.readAt(id, 0, owner), from, integer(params.maxBytes, OUTPUT_BYTES, 4, OUTPUT_BYTES));
      }
      return boundedRead(service.read(id, owner), integer(params.maxBytes, OUTPUT_BYTES, 1, OUTPUT_BYTES));
    });
  }
  function terminalValue(value, field) {
    const result = safe(value);
    if (field && typeof value?.[field] === 'string' && Buffer.byteLength(redactText(value[field], secrets)) > OUTPUT_BYTES)
      result.truncated = true;
    return result;
  }
  async function terminal(params) {
    return withSession(params, async (record, signal) => {
      const service = get('terminals');
      const identity = serviceIdentity(service);
      const native = (method) => { if (!has(service, method)) fail(`Native terminals.${method} is unavailable`); return service; };
      const observed = (value) => {
        if (serviceIdentity(get('terminals')) !== identity) fail('Native terminal service changed during operation');
        return value;
      };
      if (params.action === 'availability') return observed({ available: has(service, 'listBackends') && service.listBackends().length > 0,
        backends: has(service, 'listBackends') ? service.listBackends() : [] });
      const owner = record.handle.agent;
      if (params.action === 'list') return observed({ terminals: safe(native('list').list(owner)),
        ...(has(service, 'hasOwnerActivity') ? { active: service.hasOwnerActivity(owner) } : {}) });
      if (!has(service, 'listBackends') || service.listBackends().length === 0) fail('Native terminal backend is unavailable');
      if (params.action === 'spawn') {
        const request = { type: text(params.type, 'terminal backend', 128), ...(params.name !== undefined ? { name: text(params.name, 'terminal name', 128) } : {}),
          ...(params.cwd !== undefined ? { cwd: text(params.cwd, 'terminal working directory') } : {}) };
        const result = await native('spawn').spawn(owner, request, signal);
        return observed(terminalValue(result, 'motd'));
      }
      const id = text(params.terminalId, 'terminal id');
      if (params.action === 'read') return observed(terminalValue(native('read').read(owner, id,
        { offset: integer(params.offset, 0, 0, Number.MAX_SAFE_INTEGER), count: integer(params.count, 200, 1, 1000) }), 'text'));
      if (params.action === 'send') {
        if (typeof params.text !== 'string' || Buffer.byteLength(params.text) > OUTPUT_BYTES) fail('Invalid terminal input');
        const operation = native('startSend').startSend(owner, id, { text: params.text, submit: boolean(params.submit, 'terminal submit'), signal });
        return observed(terminalValue(await operation.done, 'viewport'));
      }
      if (params.action === 'signal') {
        if (!['SIGINT', 'SIGTERM', 'SIGKILL', 'SIGTSTP', 'SIGHUP'].includes(params.signal)) fail('Invalid terminal signal');
        return observed(safe(await native('signal').signal(owner, id, params.signal)));
      }
      if (params.action === 'kill') return observed({ closed: await native('kill').kill(owner, id,
        params.reason === undefined ? undefined : text(params.reason, 'terminal close reason')) });
      fail('Unsupported terminal action');
    });
  }
  async function subagents(params) {
    return withSession(params, async (record, signal) => {
      const service = need('subagents', 'listChildren');
      const catalog = await service.listChildren(record.handle.agent.session.id, signal);
      signal.throwIfAborted();
      const registry = get('agents');
      const children = catalog.map((entry) => {
        const live = has(registry, 'get') ? registry.get(entry.id) : undefined;
        const epoch = childEpochs.get(entry.id);
        const liveStatus = ['idle', 'running'].includes(live?.status) ? live.status : 'unknown';
        const activity = liveStatus === 'running' || epoch?.active === true ? 'active' : epoch?.active === false ? 'inactive' : 'unknown';
        const status = activity === 'inactive' ? epoch.stopReason === 'completed' ? 'completed' : 'stopped' : liveStatus;
        // Only a paired native terminal lifecycle edge certifies release. An
        // absent/idle Agent or historic turn/end cannot certify an empty inbox.
        return { ...entry, status, activity };
      });
      if (params.action === 'list' || params.action === undefined) return { children: safe(children) };
      const child = children.find((entry) => entry.id === text(params.childSessionId, 'child session id'));
      if (!child) {
        if (params.action === 'prompt') return { failure: { code: 'subagent/unauthorized' } };
        fail('Child session is not owned by this session');
      }
      if (params.action === 'get') return { child: safe(child) };
      if (params.action === 'prompt') {
        if (child.mode !== 'continuable') return { failure: { code: 'subagent/not-resumable' } };
        const requestId = text(params.requestId, 'subagent request id', 128);
        if (!/^[A-Za-z0-9_-]+$/.test(requestId)) fail('Invalid subagent request id');
        if (!['queue', 'steer'].includes(params.delivery)) fail('Invalid subagent delivery');
        if (!Array.isArray(params.content) || params.content.length !== 1 || params.content[0]?.type !== 'text')
          fail('Subagent continuation accepts one text part');
        const content = text(params.content[0].text, 'subagent continuation text', 64 * 1024);
        if (!content.trim()) fail('Subagent continuation text cannot be empty');
        try {
          const receipt = await need('subagents', 'prompt').prompt({ requestId,
            parentSessionId: record.handle.agent.session.id, childSessionId: child.id, mode: 'continuable',
            delivery: params.delivery, content: [{ type: 'text', text: content }] }, signal);
          signal.throwIfAborted();
          return { messageId: text(receipt?.messageId, 'subagent message id') };
        } catch (error) {
          // Only stable public codes cross this boundary. Native errors can
          // carry prompt text or other private details in their message/data.
          if (subagentPromptFailureCodes.has(error?.code)) return { failure: { code: error.code } };
          throw error;
        }
      }
      if (params.action === 'cancel') {
        need('subagents', 'interrupt').interrupt(child.id, { kind: 'ancestor', agent: record.handle.agent });
        return { accepted: true, child: safe(child) };
      }
      fail('Unsupported subagent action');
    });
  }
  async function extensions(params) {
    const service = get('pluginManager');
    const action = params.action;
    if (action === 'list') return { plugins: safe(await need('pluginManager', 'listPlugins').listPlugins()),
      bundles: safe(await need('pluginManager', 'listBundles').listBundles()), managed: managedProfileProof(ctx, config) };
    const registry = params.registry === undefined ? {} : { registry: params.registry === null ? null : text(params.registry, 'registry') };
    if (action === 'inspect') return { inspection: safe(await need('pluginManager', 'inspect').inspect(text(params.spec, 'extension spec'), registry, processController.signal)) };
    if (action === 'versions') return { versions: safe(await need('pluginManager', 'listVersions').listVersions(text(params.name, 'extension name'), registry, processController.signal)) };
    if (!managedProfileProof(ctx, config)) fail('Extension writes require an owned managed profile and dependency directory');
    if (action === 'cancel') {
      const id = text(params.operationId, 'extension operation id', 128);
      const operation = operations.get(id);
      if (!operation || !['install', 'update'].includes(operation.action)) return { operationId: id, status: 'not-running' };
      return { operationId: id, ...safe(await need('pluginManager', 'cancelInstall').cancelInstall(id)) };
    }
    const mapping = { 'enable-plugin': 'setPluginEnabled', 'enable-bundle': 'setBundleEnabled', install: 'installBundle',
      update: 'updateBundle', remove: 'removeBundle', exempt: 'setVersionExemption' };
    if (!Object.hasOwn(mapping, action)) fail('Unsupported extension action');
    need('pluginManager', mapping[action]);
    const protectedName = (value) => typeof value === 'string' && (value.includes('@opencodian/dsh-inherited-profile')
      || value.includes('.opencodian-inherited') || /opencodian[-_]/.test(value));
    if ([params.id, params.name, params.spec, params.packageVersion].some(protectedName)) fail('OpenCodian runtime dependencies are protected');
    if (action === 'enable-plugin') {
      const entries = await need('pluginManager', 'listPlugins').listPlugins();
      const entry = entries.find((item) => item.entryId === params.id);
      if (entry && (entry.readOnlyReason || protectedModule(entry.moduleName) || protectedName(entry.moduleName) || protectedName(entry.patchId))) fail('This native plugin is protected');
    }
    if (action === 'remove' || action === 'update' || action === 'enable-bundle') {
      const bundles = await need('pluginManager', 'listBundles').listBundles();
      const bundle = bundles.find((item) => item.name === params.name);
      if (bundle?.readOnlyReason || action === 'remove' && bundle?.removable === false || action === 'update' && bundle?.updatable === false
        || bundle?.rows?.some((row) => protectedModule(row.moduleName) || protectedName(row.rowId) || protectedName(row.moduleName)))
        fail('This native bundle is protected');
    }
    const id = params.operationId === undefined ? randomUUID() : text(params.operationId, 'extension operation id', 128);
    if (!/^[A-Za-z0-9_-]+$/.test(id) || operations.has(id)) fail('Invalid or active extension operation id');
    const operation = { action, remaining: OUTPUT_BYTES, pending: new Map(), done: undefined };
    operations.set(id, operation);
    globalUpdate({ operationId: id, action, event: 'started' });
    const run = async () => {
      if (closed || !managedProfileProof(ctx, config)) fail('Managed profile authority changed before extension operation');
      if (action === 'enable-plugin') return service.setPluginEnabled(text(params.id, 'plugin entry id'), boolean(params.enabled, 'plugin enabled state'));
      if (action === 'enable-bundle') return service.setBundleEnabled(text(params.name, 'bundle name'), boolean(params.enabled, 'bundle enabled state'));
      if (action === 'remove') return service.removeBundle(text(params.name, 'bundle name'));
      if (action === 'exempt') {
        if (params.acceptRisk !== true) fail('A version exemption requires explicit acceptRisk');
        return service.setVersionExemption(text(params.packageVersion, 'package version'), text(params.runtimeVersion, 'runtime version'),
          boolean(params.enabled, 'version exemption state'), true);
      }
      if (action === 'update') return service.updateBundle(text(params.name, 'bundle name'), text(params.version, 'bundle version'), { ...registry, requestId: id });
      const options = { ...registry, requestId: id };
      if (params.enabled !== undefined) options.enabled = boolean(params.enabled, 'bundle enabled state');
      if (params.saveExact !== undefined) options.saveExact = boolean(params.saveExact, 'save exact version');
      if (params.approvedBuilds !== undefined) {
        if (!Array.isArray(params.approvedBuilds) || params.approvedBuilds.length > 128) fail('Invalid approved builds');
        options.approvedBuilds = params.approvedBuilds.map((entry) => text(entry, 'approved build'));
      }
      return service.installBundle(text(params.spec, 'extension spec'), options);
    };
    operation.done = Promise.resolve().then(run);
    try {
      const result = safe(await operation.done);
      globalUpdate({ operationId: id, action, event: 'settled', result });
      return { operationId: id, result };
    } catch (error) {
      globalUpdate({ operationId: id, action, event: 'settled', error: { code: 'native-operation-failed', message: 'Native extension operation failed; sensitive diagnostics withheld' } });
      throw error;
    } finally { operations.delete(id); }
  }
  function installOutput(chunk) {
    const operation = operations.get(chunk.requestId);
    if (!operation || closed || operation.remaining === 0 && chunk.exitCode === undefined) return;
    const key = `${chunk.jobId}:${chunk.stream}`;
    const buffered = (operation.pending.get(key) ?? '') + String(chunk.text ?? '');
    const boundary = chunk.exitCode !== undefined ? buffered.length : buffered.lastIndexOf('\n') + 1;
    // Never emit fragments: an authorization token may cross native log chunks.
    // An overlong unbroken line is discarded, not emitted partly redacted.
    operation.pending.set(key, buffered.length - boundary > OUTPUT_BYTES ? '[oversized output omitted]\n' : buffered.slice(boundary));
    if (!boundary && chunk.exitCode === undefined) return;
    const output = byteText(redactText(buffered.slice(0, boundary), secrets), operation.remaining);
    operation.remaining -= Buffer.byteLength(output);
    globalUpdate({ operationId: chunk.requestId, action: operation.action, event: 'output', jobId: safe(chunk.jobId),
      stream: chunk.stream === 'stderr' ? 'stderr' : 'stdout', text: output, truncated: operation.remaining === 0,
      ...(chunk.exitCode !== undefined ? { exitCode: chunk.exitCode } : {}) });
  }
  for (const event of ['install-state', 'update-state']) subscriptions.push(ctx.on(`plugin-manager/${event}`, (progress) => {
    const operation = operations.get(progress.requestId);
    if (!operation) return;
    globalUpdate({ ...safe(progress), operationId: progress.requestId, action: operation.action, event });
  }));
  subscriptions.push(ctx.on('plugin-manager/install-log', installOutput));
  subscriptions.push(ctx.on('subagent/start', (info) => {
    if (!closed && typeof info.id === 'string' && typeof info.runId === 'string') childEpochs.set(info.id, { runId: info.runId, active: true });
  }));
  subscriptions.push(ctx.on('subagent/end', (info) => {
    const epoch = childEpochs.get(info.id);
    if (!closed && epoch?.runId === info.runId) childEpochs.set(info.id, { runId: info.runId, active: false, stopReason: info.stopReason });
  }));
  subscriptions.push(ctx.on('permission-presets/catalog-changed', () => {
    for (const [id, record] of sessions) {
      if (!current(id, record)) continue;
      try { emit(id, record, { sessionUpdate: 'permission_presets_update', ...permissionState(get('permissionPresets'), record.handle.agent.session) }); }
      catch { /* optional observer */ }
    }
  }));
  subscriptions.push(ctx.on('session/event', (session, event) => {
    const record = sessions.get(session.id);
    if (!record || record.handle.agent.session !== session || !current(session.id, record)) return;
    try {
      if (!subscribedProjections && event.type === 'todo/write') emit(session.id, record, { sessionUpdate: 'todo_update', todos: todoView(event.data.todos) });
      if (!subscribedProjections && event.type === 'turn/start' && has(get('sessionProjections'), 'snapshot'))
        emit(session.id, record, { sessionUpdate: 'todo_update', ...todos(record) });
      if (event.type === 'plan/mode') emit(session.id, record, { sessionUpdate: 'plan_update', ...need('planMode', 'get').get(record.handle.agent) });
      if (['permission/preset', 'sandbox/mode', 'approval/policy'].includes(event.type)) {
        // The preset and its knobs commit separately. Read the settled batch,
        // without publishing the transient old-knob derivation as current.
        queueMicrotask(() => {
          if (current(session.id, record)) {
            try { emit(session.id, record, { sessionUpdate: 'permission_presets_update', ...permissionState(get('permissionPresets'), session) }); } catch { /* optional observer */ }
          }
        });
      }
    } catch { /* An optional control observer never fails the chat path. */ }
  }));
  const rawMethods = { 'control/capabilities': () => ({ controlCapabilities: capabilities().controlCapabilities }),
    'config/describe': describe, 'config/credentials': credentials, 'config/extensions': extensions, 'config/extension-settings': extensionSettings,
    'session/permission-presets': permissions, 'session/plan': plan, 'session/todos': (params) => withSession(params, todos),
    'session/jobs': jobs, 'session/terminal': terminal, 'session/subagents': subagents };
  const methods = Object.fromEntries(Object.entries(rawMethods).map(([name, method]) => [name, async (params = {}) => {
    if (closed) fail('Harness control bridge is closed');
    if (!object(params)) fail('Invalid Harness control parameters');
    try {
      const result = await method(params);
      if (closed) fail('Harness control bridge closed during operation');
      return result;
    }
    catch (error) {
      // Third-party services sometimes embed request values, headers, or native
      // diagnostics in errors. Never serialize their messages, causes or data.
      const code = publicErrorCodes.has(error?.code) ? ` [${error.code}]` : '';
      throw new Error(error instanceof ControlError ? error.message : `Native ${name} failed${code}; sensitive diagnostics withheld`);
    }
  }]));
  return { methods, capabilities,
    mcpStatus(record) {
      const names = ctx.tools.schemas(record.handle.agent).map((tool) => tool.name);
      return { servers: [...record.mcp.values()].map(({ declaration, fiber }) => ({ name: declaration.name,
        mounted: fiber.state === 2, connected: null, state: fiber.state === 2 ? 'unknown' : 'inactive',
        tools: names.filter((name) => name.startsWith(`mcp__${declaration.name}__`)) })), tools: names };
    },
    closeSession(id) {
      for (const control of waits.get(id) ?? []) control.abort();
      waits.delete(id);
    },
    async dispose() {
      closed = true; processController.abort();
      unsubscribeJobs?.(); unsubscribeProjections?.();
      for (const dispose of subscriptions.splice(0)) { try { dispose?.(); } catch { /* already disposed */ } }
      for (const controls of waits.values()) for (const control of controls) control.abort();
      waits.clear();
      await Promise.allSettled([...operations].filter(([, operation]) => ['install', 'update'].includes(operation.action))
        .map(([id]) => get('pluginManager')?.cancelInstall(id)));
      await Promise.allSettled([...operations.values()].map((operation) => operation.done));
      operations.clear(); childEpochs.clear(); secrets.clear();
    },
  };
}
