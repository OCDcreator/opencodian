#!/usr/bin/env node
/** T11: version-bound protocol evidence only. No model, login or production imports. */
import { execFile, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const candidateIds = ['gatewayOAuth', 'mcpAppUi', 'disabledPluginIds'];
export const officialSource = Object.freeze({
  repository: 'openai/codex', tag: 'rust-v0.160.0',
  tagObjectSha: '79b1b666f2e8551f8abbbca34957227f67f3f553',
  commitSha: 'a956835d020762cb2b570053af06f643a11c0ecc',
  role: 'Design reference; never substitutes for installed/runtime evidence.',
});

export function parseCodexVersion(text) {
  return typeof text === 'string'
    ? /(?:codex-cli\s+|codex[^\s/]*\/)(\d+\.\d+\.\d+(?:-[\w.-]+)?)/.exec(text)?.[1] ?? null
    : null;
}

/** initialize.userAgent uses clientInfo.name, rather than the executable's name. */
export function parseHandshakeVersion(text, clientName) {
  if (typeof text !== 'string' || typeof clientName !== 'string' || !clientName) return null;
  const escapedName = clientName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escapedName}/(\\d+\\.\\d+\\.\\d+(?:-[\\w.-]+)?)(?:\\s|$)`).exec(text)?.[1] ?? null;
}

// Follow local refs and nullable alternatives. Never search descriptions or serialized strings.
function resolve(root, schema, seen = new Set()) {
  if (!schema || typeof schema !== 'object') return null;
  if (schema.$ref) {
    if (!schema.$ref.startsWith('#/') || seen.has(schema.$ref)) return null;
    const nextSeen = new Set(seen).add(schema.$ref);
    const target = schema.$ref.slice(2).split('/').reduce((value, key) =>
      value?.[key.replaceAll('~1', '/').replaceAll('~0', '~')], root);
    return resolve(root, target, nextSeen);
  }
  if (schema.anyOf) {
    const choices = schema.anyOf.filter((value) => value.type !== 'null');
    return choices.length === 1 ? resolve(root, choices[0], seen) : null;
  }
  return schema;
}
function property(root, schema, name) {
  return resolve(root, resolve(root, schema)?.properties?.[name]);
}
function isType(schema, type) {
  return schema?.type === type || (Array.isArray(schema?.type) && schema.type.includes(type));
}
function isStringList(schema) {
  return isType(schema, 'array') && schema?.items?.type === 'string';
}
function variants(root, schema) {
  return resolve(root, schema)?.oneOf ?? [];
}
function branch(root, schema, discriminator, value) {
  return variants(root, schema).find((item) => {
    const field = property(root, item, discriminator);
    return field?.const === value || (field?.enum?.length === 1 && field.enum[0] === value);
  });
}
function requestParams(root, method) {
  const item = branch(root, root, 'method', method);
  return item && property(root, item, 'params');
}

function hasGatewayContract(request, capabilities, methods, response) {
  return isType(property(request, capabilities, 'explicitGatewayOauth'), 'boolean')
    && methods.every((item) => item && isType(property(request, item, 'params'), 'null'))
    && ['providerId', 'providerName', 'required'].every((name) => response?.required?.includes(name))
    && isType(property(response, response, 'providerId'), 'string')
    && isType(property(response, response, 'providerName'), 'string')
    && isType(property(response, response, 'required'), 'boolean');
}
function hasMcpAppUiContract(completed) {
  const item = property(completed, completed, 'item');
  const mcp = branch(completed, item, 'type', 'mcpToolCall');
  const ui = property(completed, mcp, 'mcpAppUi');
  const displayMode = property(completed, ui, 'preferredModelDisplayMode');
  return isType(property(completed, ui, 'resourceUri'), 'string')
    && ui?.required?.includes('resourceUri') && ui?.required?.includes('preferredModelDisplayMode')
    && displayMode?.enum?.includes('inline') && displayMode.enum.includes('fullscreen');
}

/** Bundle fields are parsed JSON from specific generated files, not arbitrary matches. */
export function inspectCandidateSchema(bundle) {
  const unknown = Object.fromEntries(candidateIds.map((id) => [id, {
    status: 'unknown', reason: 'Missing or malformed structural schema bundle.',
  }]));
  if (!bundle || !Array.isArray(bundle.request?.oneOf)
    || !requestParams(bundle.request, 'initialize')) return unknown;
  const request = bundle.request;
  const initialize = requestParams(request, 'initialize');
  const capabilities = property(request, initialize, 'capabilities');
  const gatewayMethods = ['read', 'login', 'cancel'].map((action) =>
    branch(request, request, 'method', `account/gatewayOAuth/${action}`));
  const gatewayResponse = bundle.gatewayRead;
  const gatewayAdvertised = hasGatewayContract(request, capabilities, gatewayMethods, gatewayResponse);
  const completed = bundle.itemCompleted;
  const mcpAdvertised = hasMcpAppUiContract(completed);
  const turn = requestParams(request, 'turn/start');
  const update = requestParams(request, 'thread/settings/update');
  const start = bundle.threadStart;
  const selectionAdvertised = isStringList(property(request, turn, 'disabledPluginIds'))
    && isStringList(property(start, start, 'disabledPluginIds'));
  return {
    gatewayOAuth: {
      status: gatewayAdvertised ? 'advertised'
        : gatewayMethods.some((item) => !item) || (gatewayResponse?.type === 'object' && gatewayResponse.properties)
          ? 'unsupported' : 'unknown',
      interfaces: ['initialize.capabilities.explicitGatewayOauth',
        'account/gatewayOAuth/read', 'account/gatewayOAuth/login', 'account/gatewayOAuth/cancel'],
      reason: 'Schema advertisement does not prove explicit login or credential readiness.',
    },
    mcpAppUi: {
      status: mcpAdvertised ? 'advertised' : completed?.type === 'object' && completed.properties?.item ? 'unsupported' : 'unknown',
      interfaces: ['item/completed.params.item[type=mcpToolCall].mcpAppUi'],
      reason: 'Tool-event metadata is not an observed widget or a renderer capability.',
    },
    disabledPluginIds: {
      status: selectionAdvertised ? 'advertised' : start?.type === 'object' && start.properties ? 'unsupported' : 'unknown',
      threadSettingsUpdateAdvertised: isStringList(property(request, update, 'disabledPluginIds')),
      interfaces: ['turn/start.disabledPluginIds', 'thread/start response.disabledPluginIds',
        'thread/settings/update.disabledPluginIds (experimental)'],
      reason: 'Saved selection only. Pinned upstream explicitly does not filter plugin capabilities.',
    },
  };
}

export function isGatewayReadResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (typeof value.providerId !== 'string' || typeof value.providerName !== 'string'
    || typeof value.required !== 'boolean') return false;
  if (value.error != null && typeof value.error !== 'string') return false;
  return value.required
    ? ['notReady', 'started', 'succeeded', 'failed'].includes(value.status)
    : value.status === null;
}

/** Observation must come from the same connection/version; initialize alone proves nothing. */
export function classifyCandidate(id, { installedVersion, schemaVersion, schema, observation, connectionId }) {
  if (!candidateIds.includes(id)) throw new Error(`Unknown candidate: ${id}`);
  const base = {
    status: 'unknown', runtimeAvailable: false, defaultEnabled: false,
    modelAcceptance: 'unverified', configurationComplete: false,
  };
  if (!installedVersion || !schemaVersion || installedVersion !== schemaVersion) {
    return { ...base, reason: 'Installed/schema version unknown or mismatched; do not reuse evidence.' };
  }
  if (observation) {
    if (observation.runtimeVersion !== installedVersion || observation.connectionId !== connectionId
      || !connectionId || observation.initialized !== true) {
      return { ...base, reason: 'Stale, mismatched or uninitialized connection evidence.' };
    }
    if (id !== 'gatewayOAuth' || observation.method !== 'account/gatewayOAuth/read') {
      return { ...base, reason: 'Observation is not a validated probe for this candidate.' };
    }
    if (observation.error?.code === -32601) {
      return { ...base, status: 'unsupported', reason: 'Native RPC returned method-not-found (-32601).' };
    }
    if (observation.error || observation.timedOut) {
      return { ...base, reason: 'Native read failed; auth/config/timeout errors are not missing-method proof.' };
    }
    if (observation.explicitGatewayOauth === true && isGatewayReadResult(observation.result)) {
      return { ...base, status: 'observed', runtimeAvailable: true,
        observationScope: 'Read RPC and explicit-mode protocol support only; no login/inference exercised.',
        gatewayRequired: observation.result.required, credentialStatus: observation.result.status,
        reason: 'Same-connection native read returned the exact readiness shape.' };
    }
    return { ...base, reason: 'No candidate-specific validated runtime result.' };
  }
  const status = ['unknown', 'unsupported', 'advertised'].includes(schema?.status) ? schema.status : 'unknown';
  return { ...base, status, reason: schema?.reason ?? 'No evidence.' };
}

/** Offline wire contract; IDs must be exact plugin/list PluginSummary.id values. */
export function encodeDisabledPluginSelection(selection, catalogIds) {
  if (selection === undefined) return {};
  if (selection === null) return { disabledPluginIds: null };
  if (!Array.isArray(selection) || !selection.every((id) => typeof id === 'string' && id.length > 0)) {
    throw new Error('Disabled plugin selection must be an array of exact catalog IDs, null or omitted.');
  }
  if (selection.length && (!Array.isArray(catalogIds) || selection.some((id) => !catalogIds.includes(id)))) {
    throw new Error('Unknown plugin ID or unavailable catalog; do not synthesize IDs from display names.');
  }
  if (new Set(selection).size !== selection.length) throw new Error('Duplicate plugin IDs.');
  return { disabledPluginIds: [...selection] };
}
export function applyDisabledPluginSelection(current, request) {
  const next = request.disabledPluginIds;
  return next == null ? [...current] : [...next];
}

async function loadBundle(directory) {
  // Older versions may omit individual candidate response files. Preserve other evidence.
  const read = async (name) => {
    try { return JSON.parse(await fs.readFile(path.join(directory, name), 'utf8')); }
    catch { return null; }
  };
  const [request, gatewayRead, itemCompleted, threadStart] = await Promise.all([
    read('ClientRequest.json'), read('v2/GatewayOAuthReadResponse.json'),
    read('v2/ItemCompletedNotification.json'), read('v2/ThreadStartResponse.json'),
  ]);
  return { request, gatewayRead, itemCompleted, threadStart };
}
function execute(executable, args, cwd, env) {
  return new Promise((done) => execFile(executable, args,
    { cwd, env, windowsHide: true, timeout: 60000, maxBuffer: 16 * 1024 * 1024 },
    (error, stdout, stderr) => done({ args, exitCode: error?.code ?? 0, stdout, stderr })));
}
function isolatedEnvironment(directory) {
  const env = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'COMSPEC',
    'PATHEXT', 'TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE']) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  env.CODEX_HOME = directory;
  return env;
}

/** Only initialize/initialized/gateway read are sent. Owned process always closes. */
async function probeGateway(executable, cwd, env, installedVersion) {
  const connectionId = randomUUID();
  const args = ['app-server', '--listen', 'stdio://',
    '-c', 'analytics.enabled=false', '-c', 'feedback.enabled=false',
    '-c', 'model_provider="t11_offline"',
    '-c', 'model_providers.t11_offline.name="T11 offline probe"',
    '-c', 'model_providers.t11_offline.base_url="http://127.0.0.1:1"',
    '-c', 'model_providers.t11_offline.wire_api="responses"',
    '-c', 'model_providers.t11_offline.requires_openai_auth=false'];
  const child = spawn(executable, args, { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const transcript = [];
  let stderr = '', buffer = '', sequence = 0, initialized = false, runtimeVersion = null;
  const pending = new Map();
  const closed = new Promise((done) => child.once('close', (code, signal) => done({ code, signal })));
  const rejectPending = (error) => { for (const job of pending.values()) job.reject(error); pending.clear(); };
  child.on('error', rejectPending);
  child.stdin.on('error', rejectPending);
  child.once('close', () => rejectPending(new Error('Owned app-server closed.')));
  child.stderr.on('data', (value) => { stderr = (stderr + value.toString()).slice(-65536); });
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    if (buffer.length > 1048576) { rejectPending(new Error('Protocol output limit exceeded.')); child.kill(); return; }
    let boundary;
    while ((boundary = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 1);
      if (!line.trim()) continue;
      try {
        const message = JSON.parse(line);
        transcript.push({ direction: 'received', message });
        const job = pending.get(message.id);
        if (job) { pending.delete(message.id); job.resolve(message); }
      } catch { rejectPending(new Error('Malformed JSON-RPC output.')); }
    }
  });
  const send = (message) => { transcript.push({ direction: 'sent', message }); child.stdin.write(`${JSON.stringify(message)}\n`); };
  const request = (method, params) => new Promise((resolvePromise, rejectPromise) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); rejectPromise(new Error('Read-only handshake timeout.')); }, 15000);
    pending.set(id, { resolve: (message) => { clearTimeout(timer); resolvePromise(message); },
      reject: (error) => { clearTimeout(timer); rejectPromise(error); } });
    send({ id, method, ...(params === undefined ? {} : { params }) });
  });
  let observation;
  try {
    const init = await request('initialize', {
      clientInfo: { name: 'opencodian_t11_audit', title: 'OpenCodian T11 read-only audit', version: '1.0.0' },
      capabilities: { experimentalApi: true, explicitGatewayOauth: true },
    });
    if (init.error) throw new Error(`initialize rejected: ${init.error.code}`);
    runtimeVersion = parseHandshakeVersion(init.result?.userAgent, 'opencodian_t11_audit');
    initialized = Boolean(init.result);
    send({ method: 'initialized' });
    const read = await request('account/gatewayOAuth/read');
    observation = { connectionId, runtimeVersion, initialized, explicitGatewayOauth: true,
      method: 'account/gatewayOAuth/read', ...(read.error ? { error: read.error } : { result: read.result }) };
  } catch (error) {
    observation = { connectionId, runtimeVersion, initialized, explicitGatewayOauth: true,
      method: 'account/gatewayOAuth/read', error: { message: error.message } };
  } finally {
    child.stdin.end();
    const graceTimer = setTimeout(() => child.kill(), 5000);
    await closed;
    clearTimeout(graceTimer);
  }
  const exit = await closed;
  return { installedVersion, connectionId, observation, transcript, stderr,
    process: { pid: child.pid ?? null, args, exit, closed: true },
    modelCalls: 0, loginCalls: 0, userConfigurationWrites: 0 };
}

export async function run(argv = process.argv.slice(2)) {
  const handshake = argv.includes('--read-only-handshake');
  const args = argv.filter((value) => value !== '--read-only-handshake');
  if (args.length !== 4 || args[0] !== '--executable' || args[2] !== '--output') {
    throw new Error('Usage: node scripts/audit/codex-native-candidates.mjs --executable <native-binary> --output <fresh-directory> [--read-only-handshake]');
  }
  const executable = await fs.realpath(args[1]);
  if (/\.(cmd|ps1|js)$/i.test(executable)) throw new Error('Pass the resolved native binary, not a shell/npm launcher.');
  const output = path.resolve(args[3]);
  await fs.mkdir(output); // Fail if evidence already exists; never overwrite another agent/run.
  const home = path.join(output, 'isolated-home');
  const cwd = path.join(output, 'isolated-workspace');
  await fs.mkdir(home); await fs.mkdir(cwd);
  const env = isolatedEnvironment(home);
  const commands = [];
  const versionCommand = await execute(executable, ['--version'], cwd, env);
  commands.push(versionCommand);
  const installedVersion = versionCommand.exitCode === 0 ? parseCodexVersion(versionCommand.stdout) : null;
  for (const argsToRun of [['app-server', '--help'], ['app-server', 'generate-json-schema', '--help']]) {
    commands.push(await execute(executable, argsToRun, cwd, env));
  }
  const schemas = {};
  for (const mode of ['stable', 'experimental']) {
    const dir = path.join(output, `schema-${mode}`);
    const command = await execute(executable, ['app-server', 'generate-json-schema', '--out', dir,
      ...(mode === 'experimental' ? ['--experimental'] : [])], cwd, env);
    commands.push(command);
    try { schemas[mode] = command.exitCode === 0 ? inspectCandidateSchema(await loadBundle(dir)) : inspectCandidateSchema(null); }
    catch { schemas[mode] = inspectCandidateSchema(null); }
  }
  const native = handshake && installedVersion && schemas.stable.gatewayOAuth.status === 'advertised'
    ? await probeGateway(executable, cwd, env, installedVersion) : null;
  const summary = {
    capturedAt: new Date().toISOString(), platform: process.platform, arch: process.arch,
    executable, binarySha256: createHash('sha256').update(await fs.readFile(executable)).digest('hex'),
    installedVersion, officialSource, officialVersionMatches: installedVersion === '0.160.0',
    schemaVersion: installedVersion, schemaOrigin: 'Generated by the same resolved native executable in this run.',
    schemas, candidates: Object.fromEntries(candidateIds.map((id) => [id, classifyCandidate(id, {
      installedVersion, schemaVersion: installedVersion, schema: schemas.experimental[id],
      ...(id === 'gatewayOAuth' && native ? { observation: native.observation, connectionId: native.connectionId } : {}),
    })])),
    disabledPluginEnforcement: { status: 'unsupported', scope: 'Pinned official source 0.160.0 only',
      reason: 'Stored selection does not yet filter plugin capabilities; no effective-disable claim.' },
    modelAcceptance: 'unverified', modelCalls: 0, loginCalls: 0, userConfigurationWrites: 0,
    isolatedHome: home, nativeProcess: native?.process ?? null,
  };
  await fs.writeFile(path.join(output, 'commands.json'), `${JSON.stringify(commands, null, 2)}\n`, { flag: 'wx' });
  if (native) await fs.writeFile(path.join(output, 'native-read-only.json'), `${JSON.stringify(native, null, 2)}\n`, { flag: 'wx' });
  await fs.writeFile(path.join(output, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ installedVersion, candidates: summary.candidates, output }, null, 2)}\n`);
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
