/** Public SDK business operations. No eval and no arbitrary method invocation. */
export const RPC_COMMANDS = ['prompt', 'steer', 'follow_up', 'abort', 'new_session', 'get_state', 'set_model', 'cycle_model', 'get_available_models', 'set_thinking_level', 'cycle_thinking_level', 'set_steering_mode', 'set_follow_up_mode', 'compact', 'set_auto_compaction', 'set_auto_retry', 'abort_retry', 'bash', 'abort_bash', 'get_session_stats', 'export_html', 'switch_session', 'fork', 'clone', 'get_fork_messages', 'get_last_assistant_text', 'set_session_name', 'get_messages', 'get_commands'];
export const SDK_COMMANDS = ['get_tree', 'navigate_tree', 'label_entry', 'list_sessions', 'import_session', 'export_jsonl', 'get_tools', 'set_tools', 'get_resources', 'reload', 'clear_queue', 'get_queue', 'abort_compaction', 'abort_branch_summary', 'get_auth', 'set_api_key', 'login', 'logout', 'get_packages', 'install_package', 'remove_package', 'update_package', 'set_scoped_models'];
export const CONFIG_COMMANDS = ['get_configuration', 'save_configuration', 'get_model_configuration', 'save_model_configuration'];
export const BUSY_ALLOWED = new Set(['get_state', 'get_messages', 'get_session_stats', 'get_commands', 'get_tree', 'get_fork_messages', 'get_last_assistant_text', 'get_tools', 'get_resources', 'get_queue', 'get_auth', 'get_packages', 'get_available_models', 'steer', 'follow_up', 'abort', 'abort_retry', 'abort_bash', 'abort_compaction', 'abort_branch_summary', 'clear_queue']);

const required = (value, name) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required.`);
  return value;
};
const boolean = (value) => { if (typeof value !== 'boolean') throw new Error('Expected a boolean.'); return value; };
const mode = (value) => { if (!['all', 'one-at-a-time'].includes(value)) throw new Error('Invalid queue mode.'); return value; };
const level = (value) => { if (!['off', 'minimal', 'low', 'medium', 'high', 'xhigh'].includes(value)) throw new Error('Invalid thinking level.'); return value; };

export function sessionState(session) {
  return { model: session.model, thinkingLevel: session.thinkingLevel, isStreaming: session.isStreaming,
    isCompacting: session.isCompacting, isRetrying: session.isRetrying, isBashRunning: session.isBashRunning,
    steeringMode: session.steeringMode, followUpMode: session.followUpMode, sessionFile: session.sessionFile,
    scopedModels: session.scopedModels,
    sessionId: session.sessionId, sessionName: session.sessionName, autoCompactionEnabled: session.autoCompactionEnabled,
    autoRetryEnabled: session.autoRetryEnabled, messageCount: session.messages.length, pendingMessageCount: session.pendingMessageCount };
}

export function commandCatalog(session) {
  return [
    ...session.extensionRunner.getRegisteredCommands().map((c) => ({ name: c.invocationName, description: c.description, source: 'extension', sourceInfo: c.sourceInfo })),
    ...session.promptTemplates.map((p) => ({ name: p.name, description: p.description, source: 'prompt', sourceInfo: p.sourceInfo })),
    ...(session.settingsManager.getEnableSkillCommands() ? session.resourceLoader.getSkills().skills.map((s) => ({ name: `skill:${s.name}`, description: s.description, source: 'skill', sourceInfo: s.sourceInfo })) : []),
  ];
}

function nativeMessages(manager) {
  return manager.getBranch().flatMap((entry) => {
    const identity = { id: entry.id, sourceMessageId: entry.id };
    if (entry.type === 'message') {
      if (entry.message.role === 'bashExecution') return [{ ...identity, role: 'custom', customType: 'bash', display: true,
        timestamp: entry.message.timestamp, content: `$ ${entry.message.command}\n${entry.message.output}\nExit: ${entry.message.exitCode ?? 'cancelled'}` }];
      return [{ ...entry.message, ...identity }];
    }
    if (entry.type === 'custom_message') return [{ ...entry, ...identity, role: 'custom', timestamp: Date.parse(entry.timestamp) }];
    if (['compaction', 'branch_summary'].includes(entry.type)) return [{ ...identity, role: 'custom', customType: entry.type, content: entry.summary, display: true, timestamp: Date.parse(entry.timestamp) }];
    return [];
  });
}

export async function executeCommand(host, c) {
  const s = host.runtime.session;
  const manager = s.sessionManager;
  const registry = s.modelRegistry ?? (host.modelRuntime ? new host.sdk.ModelRegistry(host.modelRuntime) : undefined);
  host.auth.reload?.();
  switch (c.type) {
    case 'get_state': return { ...sessionState(s), serviceProtocol: 1, sdkVersion: host.sdk.VERSION, commands: [...RPC_COMMANDS, ...SDK_COMMANDS, ...CONFIG_COMMANDS] };
    case 'get_configuration': return host.configuration.getSettings();
    case 'save_configuration': return host.configuration.saveSettings(c);
    case 'get_model_configuration': return host.configuration.getModels();
    case 'save_model_configuration': return host.configuration.saveModels(c);
    case 'prompt': await s.prompt(required(c.message, 'Message'), { images: await host.prepareImages(c.images), streamingBehavior: c.streamingBehavior, source: 'rpc' }); await s.agent.waitForIdle(); return {};
    case 'steer': await s.steer(required(c.message, 'Message'), await host.prepareImages(c.images)); return {};
    case 'follow_up': await s.followUp(required(c.message, 'Message'), await host.prepareImages(c.images)); return {};
    case 'abort': host.ui.cancelAll(); s.abortCompaction(); s.abortBranchSummary(); s.abortBash(); host.loginAbort?.abort(); await s.abort(); return {};
    case 'new_session': return host.runtime.newSession({ parentSession: c.parentSession });
    case 'get_available_models': return { models: registry.getAvailable() };
    case 'set_model': {
      const model = registry.find(required(c.provider, 'Provider'), required(c.modelId, 'Model'));
      if (!model) throw new Error('Requested Pi model does not exist; no fallback is allowed.');
      await s.setModel(model); return model;
    }
    case 'cycle_model': return await s.cycleModel() ?? {};
    case 'set_thinking_level': s.setThinkingLevel(level(c.level)); return { level: s.thinkingLevel };
    case 'cycle_thinking_level': return { level: s.cycleThinkingLevel() };
    case 'set_steering_mode': s.setSteeringMode(mode(c.mode)); return {};
    case 'set_follow_up_mode': s.setFollowUpMode(mode(c.mode)); return {};
    case 'compact': return await s.compact(c.customInstructions);
    case 'set_auto_compaction': s.setAutoCompactionEnabled(boolean(c.enabled)); return {};
    case 'set_auto_retry': s.setAutoRetryEnabled(boolean(c.enabled)); return {};
    case 'abort_retry': s.abortRetry(); return {};
    case 'bash': return s.executeBash(required(c.command, 'Shell command'));
    case 'abort_bash': s.abortBash(); return {};
    case 'get_session_stats': return s.getSessionStats();
    case 'export_html': return { path: await s.exportToHtml(c.outputPath || undefined) };
    case 'export_jsonl': return { path: s.exportToJsonl(required(c.outputPath, 'Output path')) };
    case 'switch_session': return host.runtime.switchSession(required(c.sessionPath, 'Session file'), { cwdOverride: host.cwd });
    case 'fork': return host.runtime.fork(required(c.entryId, 'Entry'), { position: 'before' });
    case 'clone': {
      const leaf = manager.getLeafId();
      if (!leaf) throw new Error('Cannot clone an empty session.');
      return host.runtime.fork(leaf, { position: 'at' });
    }
    case 'get_fork_messages': return { messages: s.getUserMessagesForForking() };
    case 'get_last_assistant_text': return { text: s.getLastAssistantText() ?? null };
    case 'set_session_name': s.setSessionName(required(c.name, 'Name')); return {};
    case 'get_messages': return { messages: s.messages, entries: nativeMessages(manager) };
    case 'get_commands': return { commands: commandCatalog(s) };
    case 'get_tree': return { tree: manager.getTree(), leafId: manager.getLeafId(), entries: manager.getEntries() };
    case 'navigate_tree': return s.navigateTree(required(c.entryId, 'Entry'), { summarize: c.summarize === true, customInstructions: c.customInstructions, label: c.label });
    case 'label_entry': {
      const id = required(c.entryId, 'Entry');
      if (!manager.getEntry(id)) throw new Error('Entry not found.');
      manager.appendLabelChange(id, c.label || undefined); return {};
    }
    case 'list_sessions': return { sessions: c.all === true ? await host.sdk.SessionManager.listAll() : await host.sdk.SessionManager.list(host.cwd, host.sessionDirectory) };
    case 'import_session': return host.runtime.importFromJsonl(required(c.sessionPath, 'Session file'), host.cwd);
    case 'get_tools': return { tools: s.getAllTools(), active: s.getActiveToolNames() };
    case 'set_tools': {
      if (!Array.isArray(c.names) || c.names.some((name) => !s.getToolDefinition(name))) throw new Error('Unknown Pi tool.');
      s.setActiveToolsByName(c.names); return { active: s.getActiveToolNames() };
    }
    case 'get_resources': return { skills: s.resourceLoader.getSkills(), prompts: s.resourceLoader.getPrompts(),
      extensions: s.resourceLoader.getExtensions().extensions.map((e) => ({ path: e.path, resolvedPath: e.resolvedPath })),
      errors: s.resourceLoader.getExtensions().errors, context: s.resourceLoader.getAgentsFiles(), systemPrompt: s.systemPrompt };
    case 'reload': await host.refreshResources(); await registry.refresh(); await s.reload(); return { commands: commandCatalog(s) };
    case 'clear_queue': return { cleared: s.clearQueue() };
    case 'get_queue': return { steering: s.getSteeringMessages(), followUp: s.getFollowUpMessages(), pending: s.pendingMessageCount };
    case 'abort_compaction': s.abortCompaction(); return {};
    case 'abort_branch_summary': s.abortBranchSummary(); return {};
    case 'set_scoped_models': {
      if (!Array.isArray(c.models)) throw new Error('Expected model references.');
      const scoped = c.models.map((ref) => { const m = registry.find(ref.provider, ref.model); if (!m) throw new Error('Unknown scoped model.'); return { model: m, thinkingLevel: ref.thinkingLevel ? level(ref.thinkingLevel) : undefined }; });
      s.setScopedModels(scoped); return { models: scoped };
    }
    case 'get_auth': {
      if (host.modelRuntime) {
        await host.modelRuntime.refresh();
        const stored = await host.modelRuntime.listCredentials();
        return { providers: [...new Set([...stored.map(item => item.providerId), ...host.modelRuntime.getProviders().map(p => p.id)])].map(provider => ({ provider, ...host.modelRuntime.getProviderAuthStatus(provider) })),
          oauthProviders: host.modelRuntime.getProviders().filter(p => p.auth?.oauth).map(p => ({ id: p.id, name: p.name })) };
      }
      return { providers: [...new Set([...host.auth.list(), ...registry.getAll().map((m) => m.provider)])].map((provider) => ({ provider, ...host.auth.getAuthStatus(provider) })), oauthProviders: host.auth.getOAuthProviders().map((p) => ({ id: p.id, name: p.name })) };
    }
    case 'set_api_key': {
      const provider = required(c.provider, 'Provider'), key = required(c.apiKey, 'API key');
      if (host.modelRuntime) { await host.credentials.modify(provider, async () => ({ type: 'api_key', key })); await host.modelRuntime.refresh(); }
      else host.auth.set(provider, { type: 'api_key', key });
      return { saved: true };
    }
    case 'login': {
      const controller = new AbortController(); host.loginAbort = controller;
      try { const callbacks = {
      signal: controller.signal,
      onAuth: (info) => host.send({ type: 'extension_ui_request', id: 'oauth-link', method: 'notify', message: info.instructions ?? 'Open the sign-in page.', url: info.url }),
      onPrompt: (prompt) => host.ui.ask('input', { title: prompt.message, placeholder: prompt.placeholder }, { signal: controller.signal }).then((v) => { if (v === undefined || (!v && !prompt.allowEmpty)) throw new Error('Login cancelled.'); return v; }),
      onManualCodeInput: () => host.ui.ask('input', { title: 'Paste the authorization code or redirect URL' }, { signal: controller.signal }).then((v) => { if (!v) throw new Error('Login cancelled.'); return v; }),
      onSelect: async (prompt) => {
        const labels = prompt.options.map((option) => `${option.label} (${option.id})`);
        const selected = await host.ui.ask('select', { title: prompt.message, options: labels }, { signal: controller.signal });
        return prompt.options[labels.indexOf(selected)]?.id;
      },
      onProgress: (message) => host.send({ type: 'extension_ui_request', id: 'oauth-progress', method: 'setStatus', statusKey: 'login', statusText: message }),
    };
        if (host.modelRuntime) await host.modelRuntime.login(required(c.provider, 'Provider'), 'oauth', {
          signal: controller.signal,
          prompt: async prompt => {
            const signal = prompt.signal ? AbortSignal.any([controller.signal, prompt.signal]) : controller.signal;
            if (prompt.type === 'select') {
              const labels = prompt.options.map(option => `${option.label} (${option.id})`);
              const selected = await host.ui.ask('select', { title: prompt.message, options: labels }, { signal });
              const id = prompt.options[labels.indexOf(selected)]?.id;
              if (!id) throw new Error('Login cancelled.'); return id;
            }
            const value = await host.ui.ask('input', { title: prompt.message, placeholder: prompt.placeholder }, { signal });
            if (!value) throw new Error('Login cancelled.'); return value;
          },
          notify: event => {
            if (event.type === 'auth_url') callbacks.onAuth(event);
            else if (event.type === 'device_code') callbacks.onAuth({ url: event.verificationUri, instructions: `Code: ${event.userCode}` });
            else if (event.type === 'progress') callbacks.onProgress(event.message);
            else callbacks.onAuth({ instructions: event.message, url: event.links?.[0]?.url });
          },
        });
        else await host.auth.login(required(c.provider, 'Provider'), callbacks);
        return { authenticated: true }; }
      finally { host.loginAbort = undefined; }
    }
    case 'logout': await host.auth.logout(required(c.provider, 'Provider')); return { loggedOut: true };
    case 'get_packages': return { packages: host.packages.listConfiguredPackages() };
    case 'install_package': await host.packages.installAndPersist(required(c.source, 'Package source'), { local: c.local !== false }); await host.refreshResources(); await s.reload(); return { installed: true };
    case 'remove_package': {
      const removed = await host.packages.removeAndPersist(required(c.source, 'Package source'), { local: c.local !== false });
      await host.refreshResources(); await s.reload(); return { removed };
    }
    case 'update_package': await host.packages.update(required(c.source, 'Package source')); await host.refreshResources(); await s.reload(); return { updated: true };
    default: throw new Error(`Unsupported Pi service command: ${c.type}`);
  }
}
