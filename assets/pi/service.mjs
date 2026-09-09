// Versioned process boundary: the SDK remains in the user's official Pi installation.
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { BUSY_ALLOWED, executeCommand } from './commands.mjs';
import { createConfigurationService, startConfigurationTransport } from './configuration.mjs';
import { createExtensionUi } from './extension-ui.mjs';

export async function startPiService(sdkPath, options, streams = process) {
  const write = (message) => streams.stdout.write(`${JSON.stringify(message)}\n`);
  // Extension console output belongs to stderr, never to JSONL framing.
  console.log = (...args) => streams.stderr.write(`${args.map(String).join(' ')}\n`);
  const sdk = await import(pathToFileURL(sdkPath).href);
  const { FileSettingsStorage } = await import(pathToFileURL(join(dirname(sdkPath), 'core/settings-manager.js')).href);
  const configuration = createConfigurationService({ ...sdk, FileSettingsStorage }, resolve(options.workingDirectory), options.agentDirectory || sdk.getAgentDir());
  if (options.configurationOnly) return startConfigurationTransport(configuration, sdk.VERSION, streams);
  // The CLI's two non-root helpers are isolated here and exercised by upgrade acceptance.
  const { resolveModelScope } = await import(pathToFileURL(join(dirname(sdkPath), 'core/model-resolver.js')).href);
  const { resizeImage } = await import(pathToFileURL(join(dirname(sdkPath), 'utils/image-resize.js')).href);
  if (typeof resolveModelScope !== 'function' || typeof resizeImage !== 'function') throw new Error('Pi SDK helper compatibility changed. Review the service upgrade.');
  for (const name of ['createAgentSessionRuntime', 'createAgentSessionServices', 'createAgentSessionFromServices', 'SettingsManager', 'SessionManager']) {
    if (!sdk[name]) throw new Error(`Pi SDK ${sdk.VERSION ?? 'unknown'} does not provide ${name}. Upgrade compatibility needs review.`);
  }
  const cwd = resolve(options.workingDirectory);
  const agentDir = options.agentDirectory || sdk.getAgentDir();
  const CredentialStorage = sdk.AuthStorage ?? (await import(pathToFileURL(join(dirname(sdkPath), 'core/auth-storage.js')).href)).AuthStorage;
  const credentials = CredentialStorage.create(join(agentDir, 'auth.json'));
  const modelRuntime = sdk.ModelRuntime ? await sdk.ModelRuntime.create({ credentials, modelsPath: join(agentDir, 'models.json') }) : undefined;
  const auth = modelRuntime ?? credentials;
  const read = (file) => { try { return readFileSync(file, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return undefined; throw error; } };
  const memoryScopes = { global: read(join(agentDir, 'settings.json')), project: read(join(cwd, '.pi', 'settings.json')) };
  const settings = sdk.SettingsManager.fromStorage({ withLock(scope, action) { const result = action(memoryScopes[scope]); if (result !== undefined) memoryScopes[scope] = result; } });
  const settingsErrors = settings.drainErrors();
  if (settingsErrors.length) throw new Error(`Invalid Pi ${settingsErrors[0].scope} settings.`);
  const refreshResources = async () => {
    for (const [scope, file] of Object.entries({ global: join(agentDir, 'settings.json'), project: join(cwd, '.pi', 'settings.json') })) {
      const current = JSON.parse(memoryScopes[scope] || '{}');
      const disk = JSON.parse(read(file) || '{}');
      for (const key of ['packages', 'extensions', 'skills', 'prompts', 'themes']) {
        if (key in disk) current[key] = disk[key]; else delete current[key];
      }
      memoryScopes[scope] = JSON.stringify(current);
    }
    await settings.reload();
  };
  const host = { sdk, cwd, auth, credentials, modelRuntime, settings, refreshResources, sessionDirectory: options.sessionDirectory, send: write, runtime: null, ui: null, packages: null };
  host.configuration = configuration;
  host.prepareImages = async images => {
    if (!images?.length || !settings.getImageAutoResize()) return images;
    return Promise.all(images.map(async image => { const resized = await resizeImage(image); return resized ? { type: 'image', data: resized.data, mimeType: resized.mimeType } : image; }));
  };
  host.ui = createExtensionUi(write, sdk.getMarkdownTheme?.());
  // Only explicit package management commands use persistent SDK settings.
  host.packages = new sdk.DefaultPackageManager({ cwd, agentDir, settingsManager: sdk.SettingsManager.create(cwd, agentDir) });
  host.packages.setProgressCallback((event) => write({ type: 'package_progress', ...event }));
  const factory = async ({ sessionManager, sessionStartEvent }) => {
    const services = await sdk.createAgentSessionServices({ cwd, agentDir, ...(modelRuntime ? { modelRuntime } : { authStorage: auth }), settingsManager: settings });
    const registry = services.modelRegistry ?? new sdk.ModelRegistry(services.modelRuntime);
    const saved = sessionManager.buildSessionContext();
    const provider = options.provider || saved.model?.provider || settings.getDefaultProvider();
    const modelId = options.model || saved.model?.modelId || settings.getDefaultModel();
    let model;
    if (provider && modelId) {
      model = registry.find(provider, modelId);
      if (!model) throw new Error(`Pi model unavailable: ${provider}/${modelId}. Select a model explicitly.`);
    }
    const created = await sdk.createAgentSessionFromServices({ services, sessionManager, sessionStartEvent, model,
      scopedModels: await resolveModelScope(settings.getEnabledModels() ?? [], registry),
      ...(options.thinkingLevel ? { thinkingLevel: options.thinkingLevel } : {}) });
    // An unauthenticated installation must still expose login and model discovery.
    // Explicit/saved model mismatches were rejected above; prompt validates auth.
    return { ...created, services, diagnostics: services.diagnostics };
  };
  // Newer runtimes preserve the initial persistence mode across newSession().
  // The file-backed manager defers writing until there is session content.
  const manager = options.sessionPath ? sdk.SessionManager.open(options.sessionPath, options.sessionDirectory)
    : modelRuntime ? sdk.SessionManager.create(cwd, options.sessionDirectory) : sdk.SessionManager.inMemory(cwd);
  host.runtime = await sdk.createAgentSessionRuntime(factory, { cwd, agentDir, sessionManager: manager });
  let unsubscribe;
  let unsubscribeAgent;
  let rawEnds = 0;
  let processedEnds = 0;
  let requestToken;
  const bind = async () => {
    unsubscribe?.();
    unsubscribeAgent?.();
    rawEnds = 0; processedEnds = 0;
    host.ui.cancelAll();
    const session = host.runtime.session;
    await session.bindExtensions({ uiContext: host.ui.context, commandContextActions: {
      waitForIdle: () => session.agent.waitForIdle(), newSession: (o) => host.runtime.newSession(o),
      fork: (id, o) => host.runtime.fork(id, o), navigateTree: (id, o) => session.navigateTree(id, o),
      switchSession: (file, o) => host.runtime.switchSession(file, { ...o, cwdOverride: cwd }), reload: () => session.reload(),
    }, onError: (error) => write({ type: 'extension_error', ...error }), shutdownHandler: () => shutdown() });
    unsubscribeAgent = session.agent.subscribe((event) => { if (event.type === 'agent_end') rawEnds++; });
    unsubscribe = session.subscribe((event) => { if (event.type === 'agent_end') processedEnds++; write({ ...event, requestToken }); });
  };
  host.runtime.setRebindSession(bind);
  let ready = Promise.resolve();
  let closing = false;
  let busy = false;
  async function settlePrompt() {
    // SDK event processing can yield in extension hooks. Observe public state after the
    // awaited prompt and each event-loop checkpoint; no silence-based completion guess.
    await new Promise(setImmediate);
    while (processedEnds < rawEnds || host.runtime.session.isStreaming || host.runtime.session.isRetrying || host.runtime.session.isCompacting) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await host.runtime.session.agent.waitForIdle();
  }
  async function handle(c) {
    if (c.type === 'extension_ui_response') { host.ui.respond(c); return; }
    if (c.type === 'shutdown') { await shutdown(); return; }
    if (typeof c.id !== 'string' || typeof c.type !== 'string') { write({ type: 'protocol_error', error: 'id and type required' }); return; }
    if (busy && c.type === 'prompt') {
      try { await executeCommand(host, c); write({ type: 'response', id: c.id, command: c.type, success: true, data: {} }); }
      catch (error) { write({ type: 'response', id: c.id, command: c.type, success: false, error: String(error?.message ?? error) }); }
      return;
    }
    const mutation = !BUSY_ALLOWED.has(c.type);
    if (busy && mutation) { write({ type: 'response', id: c.id, command: c.type, success: false, error: 'Pi session is busy.' }); return; }
    if (mutation) busy = true;
    if (c.type === 'prompt') requestToken = c.id;
    try {
      await ready;
      const data = await executeCommand(host, c);
      if (c.type === 'prompt') await settlePrompt();
      write({ type: 'response', id: c.id, command: c.type, success: true, data });
    } catch (error) {
      write({ type: 'response', id: c.id, command: c.type, success: false, error: String(error?.message ?? error) });
    } finally {
      if (c.type === 'prompt') requestToken = undefined;
      if (mutation) busy = false;
    }
  }
  async function shutdown() {
    if (closing) return;
    closing = true;
    host.ui.cancelAll();
    await host.runtime.session.abort();
    host.runtime.session.abortBash();
    await host.runtime.dispose();
    unsubscribe?.();
    unsubscribeAgent?.();
    process.exit(0);
  }
  let buffer = '';
  streams.stdin.setEncoding('utf8');
  streams.stdin.on('data', (chunk) => {
    buffer += chunk;
    if (buffer.length > 32 * 1024 * 1024) { void shutdown(); return; }
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end).replace(/\r$/, ''); buffer = buffer.slice(end + 1);
      if (!line) continue;
      try { void handle(JSON.parse(line)); } catch { write({ type: 'protocol_error', error: 'Invalid JSONL' }); }
    }
  });
  streams.stdin.on('end', () => { void shutdown(); });
  process.on('SIGTERM', () => { void shutdown(); });
  process.on('SIGINT', () => { void shutdown(); });
  ready = bind();
  await ready;
  return host;
}

if (import.meta.url.startsWith('file:') && process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  startPiService(process.argv[2], JSON.parse(process.argv[3])).catch((error) => {
    process.stdout.write(`${JSON.stringify({ type: 'transport_error', error: `Pi service startup: ${error.message}` })}\n`);
    process.exitCode = 1;
  });
}
