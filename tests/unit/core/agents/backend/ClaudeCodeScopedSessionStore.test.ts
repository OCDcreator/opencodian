import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, sep } from 'node:path';

import type { SessionStore } from '@anthropic-ai/claude-agent-sdk';

import { ClaudeCodeAdapter, type ClaudeCodeSdkFacade } from '../../../../../src/core/agents/backend/claude/ClaudeCodeAdapter';
import { projectClaudePersistedGoal, readClaudePersistedGoal, scopeClaudeSessionCatalog } from '../../../../../src/core/agents/backend/claude/ClaudeCodeScopedSessionStore';
import { getDefaultClaudeCodeBackendSettings } from '../../../../../src/core/types';

const ID = '12345678-1234-1234-1234-123456789abc';
const PROJECT = 'owned-project';

describe('Claude scoped native session catalog', () => {
  let root: string;
  let sdk: ClaudeCodeSdkFacade;
  let store: SessionStore;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'claude-scoped-store-'));
    mkdirSync(join(root, 'projects', PROJECT), { recursive: true });
    sdk = {
      query: jest.fn(),
      getSessionInfo: jest.fn(async (id, options) => {
        store = options?.sessionStore as SessionStore;
        const entries = await store.load({ projectKey: PROJECT, sessionId: id });
        return entries?.length ? { sessionId: id, summary: 'native owned session' } : undefined;
      }),
    };
    writeFileSync(join(root, 'projects', PROJECT, `${ID}.jsonl`), `${JSON.stringify({
      type: 'user', sessionId: ID, uuid: ID, message: { role: 'user', content: 'native nonce' },
    })}\n`);
    await scopeClaudeSessionCatalog(sdk, root).getSessionInfo!(ID);
  });

  afterEach(() => {
    const inside = relative(realpathSync(tmpdir()), realpathSync(root));
    if (!inside || isAbsolute(inside) || inside.split(sep)[0] === '..') throw new Error('Test cleanup outside owned temp root.');
    rmSync(root, { recursive: true, force: true });
  });

  it('loads authoritative entries and paginates through the SDK without touching host env', async () => {
    const before = process.env.CLAUDE_CONFIG_DIR;
    expect(await store.load({ projectKey: PROJECT, sessionId: ID })).toEqual([
      expect.objectContaining({ type: 'user', sessionId: ID, message: { role: 'user', content: 'native nonce' } }),
    ]);
    expect(await store.listSessions!(PROJECT)).toEqual([{ sessionId: ID, mtime: expect.any(Number) }]);
    expect(process.env.CLAUDE_CONFIG_DIR).toBe(before);
    expect(scopeClaudeSessionCatalog(sdk, root).query).toBe(sdk.query);
  });

  it('reads native Goal facts through the SDK path and scoped store without parsing assistant text', async () => {
    const entries = [
      {type:'attachment',sessionId:ID,uuid:'goal1',timestamp:'2026-10-30T14:00:00Z',attachment:{type:'goal_status',sentinel:true,met:false,condition:'Exact native condition'}},
      {type:'assistant',sessionId:ID,message:{content:'Goal complete'}},
      {type:'attachment',sessionId:ID,timestamp:'2026-10-30T14:00:01Z',attachment:{type:'goal_status',met:true,condition:'Exact native condition',iterations:2,reason:'Verified',tokens:100,durationMs:1500}},
    ];
    writeFileSync(join(root,'projects',PROJECT,`${ID}.jsonl`),entries.map(entry=>JSON.stringify(entry)).join('\n')+'\n');
    expect(await readClaudePersistedGoal(sdk,{configDir:root,sessionId:ID,dir:'/owned'})).toMatchObject({goal:{
      condition:'Exact native condition',status:'complete',iterations:2,last_reason:'Verified',tokensUsed:100,timeUsedSeconds:1.5,
    }});
    expect(projectClaudePersistedGoal(entries.slice(0,2)).goal?.status).toBe('active');
    expect(projectClaudePersistedGoal([...entries,{type:'system',commandRun:{command:'goal',args:'clear'}}]).goal).toBeNull();
  });

  it('keeps absent scoped transcripts absent without falling back to the global catalog', async () => {
    const absent = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    await expect(scopeClaudeSessionCatalog(sdk, root).getSessionInfo!(absent)).resolves.toBeUndefined();
    expect(await store.load({ projectKey: PROJECT, sessionId: absent })).toBeNull();
  });

  it('preserves explicitly provided stores and forwards native pagination options', async () => {
    const explicit = { load: jest.fn().mockResolvedValue(null), append: jest.fn() };
    await scopeClaudeSessionCatalog(sdk, root).getSessionInfo!(ID, { dir: '/owned', sessionStore: explicit });
    expect(sdk.getSessionInfo).toHaveBeenLastCalledWith(ID, { dir: '/owned', sessionStore: explicit });
    expect(explicit.load).toHaveBeenCalledTimes(1);
    sdk.listSessions = jest.fn().mockResolvedValue([]);
    await scopeClaudeSessionCatalog(sdk, root).listSessions!({ dir: '/owned', limit: 7, offset: 5 });
    expect(sdk.listSessions).toHaveBeenCalledWith(expect.objectContaining({ dir: '/owned', limit: 7, offset: 5 }));
  });

  it('preserves subagent transcript keys and sidecar metadata', async () => {
    const directory = join(root, 'projects', PROJECT, ID, 'subagents');
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'agent-owned.jsonl'), `${JSON.stringify({ type: 'assistant', sessionId: ID })}\n`);
    writeFileSync(join(directory, 'agent-owned.meta.json'), JSON.stringify({ toolUseId: 'owned-call', parentAgentId: 'owned-parent' }));
    expect(await store.listSubkeys!({ projectKey: PROJECT, sessionId: ID })).toEqual(['subagents/agent-owned']);
    expect(await store.load({ projectKey: PROJECT, sessionId: ID, subpath: 'subagents/agent-owned' })).toEqual([
      { type: 'assistant', sessionId: ID },
      { type: 'agent_metadata', toolUseId: 'owned-call', parentAgentId: 'owned-parent' },
    ]);
  });

  it('rejects traversal, symlinks, malformed transcripts and cross-session appends', async () => {
    await expect(store.load({ projectKey: '../outside', sessionId: ID })).rejects.toThrow('Invalid scoped');
    const linked = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    symlinkSync(join(root, 'projects', PROJECT), join(root, 'projects', 'linked-project'), 'junction');
    await expect(store.load({ projectKey: 'linked-project', sessionId: ID })).rejects.toThrow('symlinks');
    await expect(store.append({ projectKey: PROJECT, sessionId: ID }, [{ type: 'user', sessionId: linked }])).rejects.toThrow('identity mismatch');
    writeFileSync(join(root, 'projects', PROJECT, `${ID}.jsonl`), 'OC_FAKE_SECRET_INVALID_JSON');
    await expect(store.load({ projectKey: PROJECT, sessionId: ID })).rejects.toThrow('contains invalid JSON');
  });

  it('writes SDK-generated entries to the scoped native file and imports exact entries in bounded batches', async () => {
    const original = readFileSync(join(root, 'projects', PROJECT, `${ID}.jsonl`), 'utf8');
    await store.append({ projectKey: PROJECT, sessionId: ID }, [{ type: 'custom-title', sessionId: ID, customTitle: 'Owned' }]);
    expect(readFileSync(join(root, 'projects', PROJECT, `${ID}.jsonl`), 'utf8').startsWith(original)).toBe(true);
    sdk.importSessionToStore = jest.fn();
    const target = { load: jest.fn(), append: jest.fn().mockResolvedValue(undefined) };
    await scopeClaudeSessionCatalog(sdk, root).importSessionToStore!(ID, target, { includeSubagents: false, batchSize: 1 });
    expect(target.append).toHaveBeenCalledTimes(2);
    expect(target.append).toHaveBeenNthCalledWith(2, { projectKey: PROJECT, sessionId: ID }, [{ type: 'custom-title', sessionId: ID, customTitle: 'Owned' }]);
    expect(sdk.importSessionToStore).not.toHaveBeenCalled();
  });

  it('uses current domain env for adapter catalog calls and gives settings env its established priority', async () => {
    let domain = { CLAUDE_CONFIG_DIR: root };
    const settings = getDefaultClaudeCodeBackendSettings();
    const adapter = new ClaudeCodeAdapter({ vaultPath: '/owned', settings, sdk, getDomainEnvironment: () => domain });
    await expect(adapter.getSession(ID)).resolves.toMatchObject({ sessionId: ID });
    domain = { CLAUDE_CONFIG_DIR: join(root, 'missing-root') };
    await expect(adapter.getSession(ID)).resolves.toBeNull();
    settings.env.CLAUDE_CONFIG_DIR = root;
    await expect(adapter.getSession(ID)).resolves.toMatchObject({ sessionId: ID });
  });

  it('uses the native project directory alias without changing host environment', async () => {
    const alias = 'owned-alias';
    mkdirSync(join(root, 'projects', alias));
    writeFileSync(join(root, 'projects', alias, `${ID}.jsonl`), JSON.stringify({ type: 'user', sessionId: ID, marker: 'alias' }) + '\n');
    const prior = process.env.CLAUDE_CODE_PROJECT_DIR_NAME;
    const settings = getDefaultClaudeCodeBackendSettings();
    const domain = { CLAUDE_CONFIG_DIR: root, CLAUDE_CODE_PROJECT_DIR_NAME: alias };
    const adapter = new ClaudeCodeAdapter({ vaultPath: '/owned', settings, sdk, getDomainEnvironment: () => domain });
    await adapter.getSession(ID);
    expect(await store.load({ projectKey: PROJECT, sessionId: ID })).toEqual([{ type: 'user', sessionId: ID, marker: 'alias' }]);
    await store.append({ projectKey: PROJECT, sessionId: ID }, [{ type: 'custom-title', sessionId: ID }]);
    expect(readFileSync(join(root, 'projects', PROJECT, `${ID}.jsonl`), 'utf8')).not.toContain('custom-title');
    settings.env.CLAUDE_CODE_PROJECT_DIR_NAME = PROJECT;
    await adapter.getSession(ID);
    expect(await store.load({ projectKey: PROJECT, sessionId: ID })).toEqual([expect.objectContaining({ type: 'user', message: expect.any(Object) })]);
    for (const invalid of ['../escape', 'CON', 'x'.repeat(65)]) {
      await scopeClaudeSessionCatalog(sdk, root, invalid).getSessionInfo!(ID);
      expect(await store.load({ projectKey: PROJECT, sessionId: ID })).toEqual([expect.objectContaining({ type: 'user', message: expect.any(Object) })]);
    }
    expect(process.env.CLAUDE_CODE_PROJECT_DIR_NAME).toBe(prior);
  });

  it('refuses an explicit empty or relative config root without exposing the host catalog', async () => {
    const settings = getDefaultClaudeCodeBackendSettings();
    const adapter = new ClaudeCodeAdapter({ vaultPath: '/owned', settings, sdk });
    for (const invalid of ['', ' /not-an-absolute-root', 'relative-root']) {
      settings.env.CLAUDE_CONFIG_DIR = invalid;
      await expect(adapter.getSession(ID)).rejects.toThrow('must be absolute');
    }
    expect(sdk.getSessionInfo).toHaveBeenCalledTimes(1); // beforeEach only
  });
});
