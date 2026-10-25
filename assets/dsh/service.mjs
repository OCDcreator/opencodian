import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { createAuxiliaryRuntime } from './auxiliary.mjs';
export { launchNativeRuntime } from './launcher.mjs';

// This plugin is mounted in the user's installed Harness, using a per-launch
// overlay. All native imports belong to that installation, never this bundle.
export const name = 'opencodian-native';
export const inject = ['agents', 'llm', 'sessions', 'sessionQuery', 'tools', 'attachments'];
export async function apply(ctx, config) {
  const requireNative = createRequire(config.nativeAnchor);
  const load = async (name) => import(pathToFileURL(requireNative.resolve(name)).href);
  const { JsonRpcLineTransport } = await load('@deepseek-ai/dsh-sdk-protocol');
  const { installModelSelection } = await load('@deepseek-ai/dsh-agent');
  const { createUserMessage, createSystemMessage, createAssistantMessage } = await load('@deepseek-ai/dsh-llm');
  const { buildForkSeed } = await load('@deepseek-ai/dsh-session');
  const { UserQuestionError } = await load('@deepseek-ai/dsh-user-questions');
  const { admitEncodedImages } = await load('@deepseek-ai/dsh-attachment');
  const McpClient = await load('@deepseek-ai/dsh-mcp-client');
  const transport = new JsonRpcLineTransport(process.stdin, process.stdout);
  const sessions = new Map();
  const auxiliary = new Map();
  let closing = false;
  let defaultRoute;
  const update = (id, value) => transport.notify('session/update', { sessionId: id, update: value });

  async function catalog() {
    return Promise.all(ctx.llm.listProviders().map(async (provider) => ({
      ...provider, models: await ctx.llm.listModels(provider.id),
    })));
  }
  async function resolveRoute(route) {
    const all = await catalog();
    const entry = all.find((provider) => provider.id === route.provider)?.models.find((model) => model.id === route.model);
    if (!entry) throw new Error('Selected model is absent from the native Harness catalog');
    const resolved = await ctx.llm.resolveCallConfig(route);
    return { route: resolved, model: await ctx.llm.resolveModelInfo(route.provider, route.model) };
  }
  async function configuration(record) {
    const providers = await catalog();
    const selected = record.selection.current;
    const model = await ctx.llm.resolveModelInfo(selected.provider, selected.model);
    const configOptions = [{ id: 'model', name: 'Model', type: 'select',
      currentValue: JSON.stringify([selected.provider, selected.model]),
      options: providers.map((provider) => ({ group: provider.id, name: provider.name ?? provider.id,
        options: provider.models.map((item) => ({ value: JSON.stringify([provider.id, item.id]), name: item.name ?? item.id })) })) }];
    if (model.reasoning?.efforts.length) configOptions.push({ id: 'reasoning_effort', name: 'Reasoning effort', type: 'select',
      currentValue: selected.reasoningEffort ?? model.reasoning.defaultEffort ?? model.reasoning.efforts[0].id,
      options: model.reasoning.efforts.map((effort) => ({ value: effort.id, name: effort.name ?? effort.id })) });
    return { configOptions, images: model.inputModalities?.includes('image') === true, model };
  }
  function requireSession(id) {
    const record = sessions.get(id);
    if (!record || record.closing) throw new Error('Unknown or closing Harness session');
    return record;
  }
  function idle(record) {
    if (record.busy || record.handle.agent.status !== 'idle') throw new Error('Harness operation requires an idle session');
  }
  async function mountServers(agentCtx, servers, cwd) {
    const mounted = new Map();
    try {
      for (const server of servers) {
        const clientConfig = server.type === 'http'
          ? { transport: 'streamable-http', serverName: server.name, url: server.url,
            headers: Object.fromEntries(server.headers.map((entry) => [entry.name, entry.value])), failOnStartupError: true }
          : { transport: 'stdio', serverName: server.name, command: server.command, args: server.args,
            env: Object.fromEntries(server.env.map((entry) => [entry.name, entry.value])), cwd, failOnStartupError: true };
        const fiber = agentCtx.plugin(McpClient, McpClient.Config(clientConfig));
        mounted.set(server.name, { fiber, declaration: server });
        await fiber;
      }
      return mounted;
    } catch (error) {
      await Promise.allSettled([...mounted.values()].map(({ fiber }) => fiber.dispose()));
      throw error;
    }
  }
  async function open(params, resume = false) {
    if (closing) throw new Error('Harness bridge is shutting down');
    const id = resume ? params.sessionId : randomUUID();
    if (sessions.has(id)) throw new Error('Harness session is already owned');
    const record = { selection: { current: { ...defaultRoute }, assembled: undefined }, handle: undefined,
      busy: false, closing: false, tail: Promise.resolve(), failure: undefined, mcp: new Map(), cwd: params.cwd };
    const setup = async (agentCtx, agent) => {
      if (resume || params.seed) {
        const stored = agent.session.requestHeader();
        if (stored) {
          const route = { provider: stored.config.provider, model: stored.config.model,
            ...(stored.adapterDefaults?.reasoningEffort === true ? {} : { reasoningEffort: stored.config.reasoningEffort }) };
          try { record.selection.current = (await resolveRoute(route)).route; } catch { /* Deleted routes use the current catalog default. */ }
        }
      }
      installModelSelection(agentCtx, record.selection);
      record.agentCtx = agentCtx;
      record.mcp = await mountServers(agentCtx, params.mcpServers ?? [], params.cwd);
    };
    record.handle = resume
      ? await ctx.agents.resume({ resumeSessionId: id, agentOptions: defaultRoute, setup })
      : await ctx.agents.create({ sessionId: id, meta: { cwd: params.cwd,
        ...(params.parentSession ? { parentSession: params.parentSession, isSeeded: true } : {}) },
        ...(params.seed ? { seed: params.seed, inheritedEventCount: params.inheritedEventCount } : {}), agentOptions: defaultRoute, setup });
    if (closing) { await record.handle.dispose(); throw new Error('Harness session creation cancelled by shutdown'); }
    sessions.set(id, record);
    return { sessionId: id, ...await configuration(record) };
  }
  async function contentBlocks(blocks, route) {
    const info = await ctx.llm.resolveModelInfo(route.provider, route.model);
    if (blocks.some((block) => block.type === 'image') && !info.inputModalities?.includes('image'))
      throw new Error('The selected Harness model does not support images');
    const output = [];
    for (const block of blocks) {
      if (block.type === 'text') output.push({ type: 'text', text: block.text });
      else if (block.type === 'image') {
        const [attachment] = await admitEncodedImages(ctx.attachments, [{ data: block.data, mediaType: block.mimeType }]);
        output.push({ type: 'image', attachment });
      } else if (block.type === 'resource_link') {
        output.push({ type: 'text', text: `[Attached resource: ${block.name}] ${block.uri}` });
      } else throw new Error('Unsupported Harness prompt block');
    }
    return output;
  }
  async function wireBlock(block) {
    if (block.type !== 'image') return block;
    const stored = await ctx.attachments.readImage(block.attachment);
    return { type: 'image', mimeType: stored.ref.mediaType, data: Buffer.from(stored.data).toString('base64') };
  }
  function enqueue(record, callback) {
    record.tail = record.tail.then(callback).catch((error) => { record.failure ??= error; });
  }
  // Relay committed messages in native order. Transient attempt chunks can be
  // abandoned/retried; appending them to chat would preserve failed text as an answer.
  ctx.on('session/event', (session, event) => {
    const record = sessions.get(session.id);
    if (record?.handle.agent.session !== session) return;
    enqueue(record, async () => {
      const data = event.data;
      if (event.type === 'assistant/message') {
        for (const block of data.message.content) {
          if (block.type === 'tool-call') continue;
          await update(session.id, { sessionUpdate: block.type === 'reasoning' ? 'agent_thought_chunk' : 'agent_message_chunk',
            messageId: data.message.id, content: await wireBlock(block) });
        }
        const size = session.requestContext()?.contextWindow;
        const meter = ctx.get('tokenMeter');
        if (size && meter) await update(session.id, { sessionUpdate: 'usage_update', used: meter.measure(session).totalTokens, size });
      } else if (event.type === 'tool/call') {
        let input; try { input = JSON.parse(data.arguments); } catch { input = { raw: data.arguments }; }
        await update(session.id, { sessionUpdate: 'tool_call', toolCallId: data.callId, title: data.name, rawInput: input });
      } else if (event.type === 'tool/result') {
        await update(session.id, { sessionUpdate: 'tool_call_update', toolCallId: data.message.toolCallId,
          status: data.message.isError ? 'failed' : 'completed',
          content: await Promise.all(data.message.content.map(async (block) => ({ type: 'content', content: await wireBlock(block) }))) });
      } else if (event.type === 'turn/end') record.endReason = data.reason;
    });
  });
  ctx.on('agent/error', ({ agent, error }) => {
    const record = sessions.get(agent.session.id);
    if (record?.handle.agent === agent) record.failure = error;
  });
  ctx.on('approval/request', (request, next) => {
    const record = sessions.get(request.agent?.session.id);
    if (record?.handle.agent !== request.agent) return next();
    return record.tail.then(() => transport.request('session/request_permission', { sessionId: request.agent.session.id,
      toolCall: { toolCallId: request.callId, title: request.description ?? request.callId ?? 'Tool' },
      options: [{ optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' }, { optionId: 'reject-once', name: 'Reject', kind: 'reject_once' }],
    })).then(({ outcome }) => outcome.outcome === 'cancelled' ? 'cancelled' : outcome.optionId === 'allow-once' ? 'allowed-once' : 'rejected');
  });
  ctx.on('user-questions/request', (request, next) => {
    const record = sessions.get(request.agent?.session.id);
    if (record?.handle.agent !== request.agent) return next();
    const requestId = request.callId ?? randomUUID();
    return record.tail.then(() => transport.request('session/request_question', { sessionId: request.agent.session.id,
      requestId, questions: request.questions }, request.signal)).then((answer) => {
      if (answer.cancelled) throw new UserQuestionError('User dismissed the question', 'ABORTED');
      return answer;
    }).finally(() => update(request.agent.session.id, { sessionUpdate: 'native_question_closed', requestId }));
  });
  async function prompt(params) {
    const record = requireSession(params.sessionId);
    idle(record);
    record.busy = true; record.failure = undefined; record.endReason = undefined;
    const controller = new AbortController(); record.admission = controller;
    try {
      const plain = params.rawText ?? params.prompt.filter((block) => block.type === 'text').map((block) => block.text).join('\n');
      if (/^\s*\//.test(plain)) {
        const commandName = /^\/([a-z][a-z0-9_-]*)/.exec(plain.trim())?.[1];
        const known = commandName && ctx.get('commands')?.find(record.handle.agent, commandName);
        if (known && params.prompt.some((block) => !['text', 'image'].includes(block.type)))
          throw new Error('Native Harness commands require uploaded file receipts for resource attachments');
        const attachments = params.prompt.filter((block) => block.type === 'image')
          .map((image) => ({ type: 'image', mediaType: image.mimeType, data: image.data }));
        const executed = await ctx.get('commands')?.execute(record.handle.agent, plain.trim(), attachments, controller.signal);
        if (executed) {
          await record.tail;
          if (executed.result.kind === 'error') throw new Error(executed.result.text ?? 'Native command failed');
          if (executed.result.text) await update(params.sessionId, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: executed.result.text } });
          return { stopReason: 'end_turn' };
        }
      }
      const content = await contentBlocks(params.prompt, record.selection.current);
      controller.signal.throwIfAborted();
      record.handle.agent.followup(createUserMessage({ content, source: { kind: 'user' } }));
      for (;;) {
        await record.handle.agent.whenIdle();
        const seq = record.handle.agent.session.seq;
        const children = await ctx.get('subagents')?.waitForChildren(record.handle.agent);
        if (!children && record.handle.agent.status === 'idle' && record.handle.agent.session.seq === seq) break;
      }
      await record.tail;
      if (record.failure) throw record.failure;
      if (record.endReason?.kind === 'error' || record.endReason?.kind === 'blocked')
        throw new Error(record.endReason.failure?.message ?? 'Harness turn failed');
      return { stopReason: record.endReason?.kind === 'max-tokens' ? 'max_tokens' : 'end_turn' };
    } finally { record.busy = false; record.admission = undefined; }
  }
  async function history(id) {
    const surface = await ctx.sessionQuery.readSurface(id);
    const messages = [];
    for (const event of surface.events) {
      const message = event.type === 'user/message' ? event.data : event.data?.message;
      if (!message || !['user', 'assistant', 'tool'].includes(message.role)) continue;
      const content = [];
      for (const block of message.content) {
        content.push(await wireBlock(block));
      }
      messages.push({ id: message.id, role: message.role, sourceKind: message.source?.kind, toolCallId: message.toolCallId,
        isError: message.isError === true, content, timestamp: event.time ?? surface.session.createdAt });
    }
    return { messages, capturedThroughSeq: surface.capturedThroughSeq, nativeSession: surface.session };
  }
  async function runAux(params) {
    const record = auxiliary.get(params.queryId);
    if (!record || record.controller) throw new Error('Auxiliary query is unavailable or busy');
    const controller = new AbortController(); record.controller = controller;
    const completion = Promise.withResolvers(); record.completion = completion.promise;
    let text = ''; let finish;
    try {
      if (params.resetContext !== false) record.runtime.clear();
      const images = params.images ?? [];
      if (images.length && (!record.supportsImages || !record.runtime.store)) throw new Error('Selected native auxiliary model does not support images');
      const refs = images.length ? await admitEncodedImages(record.runtime.store, images) : [];
      controller.signal.throwIfAborted();
      const messages = [...(params.resetContext === false ? record.messages : record.messages.slice(0, 1)),
        createUserMessage({ content: [{ type: 'text', text: params.prompt }, ...refs.map((attachment) => ({ type: 'image', attachment }))], source: { kind: 'user' } })];
      // No Agent is created, and no tool dispatcher is referenced on this path.
      // Empty schemas and tool choice are frozen before entering native LLM middleware.
      const request = Object.freeze({ ...record.route, messages: Object.freeze(messages), tools: record.tools,
        toolChoice: 'none', signal: controller.signal });
      for await (const chunk of record.runtime.stream(request)) {
        if (chunk.type === 'tool-call-delta' || chunk.type === 'block-start' && chunk.blockType === 'tool-call')
          throw new Error('Auxiliary model attempted a tool call');
        if (chunk.type === 'text-delta') { text += chunk.text; update(params.queryId, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: chunk.text } }); }
        if (chunk.type === 'finish') finish = chunk.reason;
      }
      if (finish?.kind !== 'stop') throw new Error(finish?.failure?.message ?? `Auxiliary query ended: ${finish?.kind ?? 'unknown'}`);
      controller.signal.throwIfAborted();
      record.messages = [...messages, createAssistantMessage({ content: [{ type: 'text', text }],
        source: { provider: record.route.provider, model: record.route.model } })];
      return { text, toolCalls: [], nativeProof: { effectiveTools: request.tools.map((tool) => tool.name),
        toolChoice: request.toolChoice, persistence: false, toolDispatcher: false } };
    } finally { record.controller = undefined; completion.resolve(); }
  }
  const methods = {
    async initialize() {
      await ctx.get('loader')?.await();
      const providers = await catalog();
      const provider = providers.find((entry) => entry.id === 'deepseek-official' && entry.models.length) ?? providers.find((entry) => entry.models.length);
      if (!provider) throw new Error('Harness has no available model provider');
      const model = provider.models.find((entry) => entry.inputModalities?.includes('image')) ?? provider.models[0];
      const preferred = ctx.get('agentDefaultModel')?.currentSelection();
      try { defaultRoute = (await resolveRoute(preferred ?? { provider: provider.id, model: model.id })).route; }
      catch { defaultRoute = (await resolveRoute({ provider: provider.id, model: model.id })).route; }
      return { protocolVersion: 1, nativeProtocol: 'opencodian.dsh-native/1', agentInfo: { name, version: '1' }, authMethods: [],
        agentCapabilities: { promptCapabilities: { image: providers.some((entry) => entry.models.some((item) => item.inputModalities?.includes('image'))) },
          mcpCapabilities: { http: true }, nativeHistory: true, auxiliaryQueries: true }, providers };
    },
    'session/new': (params) => open(params),
    'session/resume': (params) => open(params, true),
    async 'session/list'(params) {
      const rows = (await ctx.sessionQuery.listSessions()).filter((entry) => !params.cwd || entry.header.cwd === params.cwd);
      const titles = await ctx.sessionQuery.readTitleSnapshots(rows.map((entry) => entry.header.id));
      return { sessions: rows.map((entry, i) => ({ sessionId: entry.header.id, cwd: entry.header.cwd,
        title: titles[i]?.status === 'fulfilled' ? titles[i].value.title?.title ?? '' : '', updatedAt: new Date(entry.header.createdAt).toISOString() })) };
    },
    async 'session/close'(params) {
      const record = sessions.get(params.sessionId);
      if (!record) return {};
      record.closing = true; record.admission?.abort(); record.handle.agent.cancel({ kind: 'user' });
      await record.handle.dispose(); await record.tail; sessions.delete(params.sessionId); return {};
    },
    async 'session/set_config_option'(params) {
      const record = requireSession(params.sessionId); idle(record);
      record.busy = true;
      try {
        let route;
        if (params.configId === 'model') {
          const [provider, model] = JSON.parse(params.value); route = { provider, model };
        } else if (params.configId === 'reasoning_effort') route = { ...record.selection.current, reasoningEffort: params.value };
        else throw new Error('Unknown Harness configuration option');
        record.selection.current = (await resolveRoute(route)).route;
        return await configuration(record);
      } finally { record.busy = false; }
    },
    'session/prompt': prompt,
    'session/history': (params) => history(params.sessionId),
    async 'session/fork'(params) {
      const source = await ctx.sessionQuery.readSession(params.sessionId);
      const boundary = params.messageId ? source.events.find((event) => (event.type === 'user/message' ? event.data : event.data?.message)?.id === params.messageId)?.seq
        : source.events.findLast((event) => event.type === 'turn/end')?.seq;
      if (boundary === undefined) throw new Error('No native event boundary is available for this fork');
      return open({ cwd: source.session.cwd ?? params.cwd, parentSession: params.sessionId,
        seed: buildForkSeed(source.events, boundary), inheritedEventCount: boundary + 1, mcpServers: params.mcpServers ?? [] });
    },
    async 'session/steer'(params) {
      const record = requireSession(params.sessionId);
      if (!record.busy || record.handle.agent.status !== 'running') return { accepted: false };
      record.handle.agent.steer(createUserMessage({ content: [{ type: 'text', text: params.text }], source: { kind: 'user' } }));
      return { accepted: true };
    },
    async 'session/tools'(params) { return { tools: ctx.tools.schemas(requireSession(params.sessionId).handle.agent) }; },
    async 'session/title'(params) {
      const record = requireSession(params.sessionId); idle(record);
      const service = ctx.get('sessionTitle');
      if (!service) throw new Error('Native session title service unavailable');
      service.rename(record.handle.agent.session, params.title); return {};
    },
    async 'session/mcp'(params) {
      const record = requireSession(params.sessionId); idle(record);
      if (params.replace) {
        record.busy = true;
        const previous = [...record.mcp.values()].map(({ declaration }) => declaration);
        const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
        const changed = previous.filter((old) => !params.replace.some((current) => same(old, current)));
        const added = params.replace.filter((current) => !previous.some((old) => same(old, current)));
        try {
          for (const old of changed) { await record.mcp.get(old.name).fiber.dispose(); record.mcp.delete(old.name); }
          const mounted = await mountServers(record.agentCtx, added, record.cwd);
          for (const [key, value] of mounted) record.mcp.set(key, value);
        } catch (error) {
          try {
            const restored = await mountServers(record.agentCtx, changed.filter((old) => !record.mcp.has(old.name)), record.cwd);
            for (const [key, value] of restored) record.mcp.set(key, value);
          } catch (rollback) { throw new AggregateError([error, rollback], 'MCP update and rollback both failed'); }
          throw error;
        } finally { record.busy = false; }
      }
      if (params.remove) { const entry = record.mcp.get(params.remove); await entry?.fiber.dispose(); record.mcp.delete(params.remove); }
      if (params.servers) {
        for (const server of params.servers) if (record.mcp.has(server.name)) throw new Error('MCP server is already mounted');
        const added = await mountServers(record.agentCtx, params.servers, record.cwd);
        for (const [key, value] of added) record.mcp.set(key, value);
      }
      return { servers: [...record.mcp.values()].map(({ declaration }) => ({ name: declaration.name, connected: true })),
        tools: ctx.tools.schemas(record.handle.agent).map((tool) => tool.name) };
    },
    async 'session/commands'(params) { return { commands: ctx.get('commands')?.list(requireSession(params.sessionId).handle.agent) ?? [] }; },
    async 'session/command'(params) {
      const record = requireSession(params.sessionId); idle(record);
      const result = await ctx.commands.execute(record.handle.agent, params.line, [], new AbortController().signal);
      if (!result) throw new Error('Unknown native Harness command'); return { result };
    },
    async 'aux/new'(params) {
      const selected = { ...(params.model ? { provider: params.model.provider, model: params.model.model } : defaultRoute),
        ...(params.effort ? { reasoningEffort: params.effort } : {}) };
      if (params.preferLowLatency && !params.effort) {
        const info = await ctx.llm.resolveModelInfo(selected.provider, selected.model);
        if (info.reasoning?.efforts.length) selected.reasoningEffort = info.reasoning.efforts[0].id;
      }
      const { route, model } = await resolveRoute(selected);
      const queryId = randomUUID();
      const runtime = await createAuxiliaryRuntime(ctx, load, route);
      if (typeof params.systemPrompt !== 'string') throw new Error('Auxiliary system prompt must be text');
      const system = createSystemMessage(params.systemPrompt);
      const rendered = system.content.filter((block) => block.type === 'text').map((block) => block.text).join('');
      if (system.role !== 'system' || rendered !== params.systemPrompt) throw new Error('Native Harness system prompt contract mismatch');
      const record = { route, runtime, supportsImages: runtime.supportsImages && model.inputModalities?.includes('image') === true,
        tools: Object.freeze([]), messages: [system] };
      auxiliary.set(queryId, record);
      return { queryId, effectiveTools: record.tools.map((tool) => tool.name), persistence: false, toolDispatcher: false,
        systemPromptSha256: createHash('sha256').update(rendered).digest('hex'), supportsImages: record.supportsImages, model, selection: route };
    },
    'aux/query': runAux,
    async 'aux/cancel'(params) { auxiliary.get(params.queryId)?.controller?.abort(); return {}; },
    async 'aux/state'() { return { activeQueries: auxiliary.size, runningQueries: [...auxiliary.values()].filter((record) => record.controller).length,
      nativeSessionIds: ctx.sessions.list().map((session) => session.id) }; },
    async 'aux/close'(params) {
      const record = auxiliary.get(params.queryId); record?.controller?.abort();
      await record?.completion; record?.runtime.clear(); auxiliary.delete(params.queryId); return {};
    },
  };
  transport.onRequest(async (method, params) => {
    if (closing) throw new Error('Harness bridge is shutting down');
    if (!methods[method]) throw new Error(`Unknown native Harness method: ${method}`);
    return methods[method](params);
  });
  transport.onNotification((method, params) => {
    if (method === 'session/cancel') { const record = sessions.get(params.sessionId); record?.admission?.abort(); record?.handle.agent.cancel({ kind: 'user' }); }
    if (method === 'aux/cancel') auxiliary.get(params.queryId)?.controller?.abort();
  });
  ctx.effect(() => {
    transport.start();
    return async () => {
      closing = true;
      for (const record of auxiliary.values()) record.controller?.abort();
      await Promise.allSettled([...auxiliary.values()].map((record) => record.completion));
      for (const record of auxiliary.values()) record.runtime.clear(); auxiliary.clear();
      await Promise.allSettled([...sessions.values()].map((record) => record.handle.dispose()));
      sessions.clear(); transport.close();
    };
  });
}
