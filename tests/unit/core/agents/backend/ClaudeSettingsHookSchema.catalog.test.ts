/**
 * Tracer bullet — ClaudeSettingsHookSchema: the single source of truth for the
 * 30-event / 5-handler settings-file hooks catalog. Pure metadata/types; no
 * parsing, no writing, no UI. Contract pinned to CLI 2.1.204 + official docs
 * (2026-07-25).
 */
import {
  CLAUDE_HOOK_COMMON_FIELDS,
  CLAUDE_HOOK_EVENT_CATALOG,
  CLAUDE_HOOK_EVENTS,
  CLAUDE_HOOK_HANDLER_TYPES,
  CLAUDE_HOOK_SCHEMA_EVIDENCE,
  CLAUDE_HOOK_TYPE_FIELDS,
} from '../../../../../src/core/agents/backend/ClaudeSettingsHookSchema';

describe('ClaudeSettingsHookSchema catalog', () => {
  it('exposes the precise 30-event / 5-handler catalog from CLI 2.1.204', () => {
    // 30 events, exact set
    expect(CLAUDE_HOOK_EVENTS).toHaveLength(30);
    // full 30-literal exact-set comparison (order-independent)
    const EXPECTED_EVENTS = [
      'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest', 'PermissionDenied',
      'UserPromptSubmit', 'PostToolBatch', 'Stop', 'StopFailure',
      'SessionStart', 'SessionEnd', 'Setup',
      'Notification', 'SubagentStart', 'SubagentStop',
      'PreCompact', 'PostCompact', 'ConfigChange',
      'FileChanged', 'InstructionsLoaded', 'UserPromptExpansion',
      'Elicitation', 'ElicitationResult',
      'TeammateIdle', 'TaskCreated', 'TaskCompleted',
      'WorktreeCreate', 'WorktreeRemove', 'MessageDisplay', 'CwdChanged',
    ];
    expect([...CLAUDE_HOOK_EVENTS].sort()).toEqual([...EXPECTED_EVENTS].sort());
    expect(Object.keys(CLAUDE_HOOK_EVENT_CATALOG).sort()).toEqual([...EXPECTED_EVENTS].sort());

    // matcher: 20 support matcher, 10 do not
    const noMatcher = ['UserPromptSubmit', 'PostToolBatch', 'Stop', 'TeammateIdle', 'TaskCreated', 'TaskCompleted', 'WorktreeCreate', 'WorktreeRemove', 'MessageDisplay', 'CwdChanged'];
    const supporting = CLAUDE_HOOK_EVENTS.filter((e) => CLAUDE_HOOK_EVENT_CATALOG[e].supportsMatcher);
    expect(supporting).toHaveLength(20);
    for (const e of noMatcher) {
      expect(CLAUDE_HOOK_EVENT_CATALOG[e].supportsMatcher).toBe(false);
      expect(CLAUDE_HOOK_EVENT_CATALOG[e].kind).toBe('none');
    }

    // matcher kinds all present
    const kinds = new Set(CLAUDE_HOOK_EVENTS.map((e) => CLAUDE_HOOK_EVENT_CATALOG[e].kind));
    for (const k of ['tool', 'free', 'enum', 'file-list', 'error-type', 'none'] as const) {
      expect(kinds.has(k)).toBe(true);
    }

    // confirmed enum suggestions present; StopFailure NOT guessed (incomplete)
    expect(CLAUDE_HOOK_EVENT_CATALOG['SessionStart'].suggestions).toEqual(['startup', 'resume', 'clear', 'compact']);
    expect(CLAUDE_HOOK_EVENT_CATALOG['ConfigChange'].suggestions).toEqual(['user_settings', 'project_settings', 'local_settings', 'policy_settings', 'skills']);
    expect(CLAUDE_HOOK_EVENT_CATALOG['StopFailure'].suggestions ?? []).toHaveLength(0);
    expect(CLAUDE_HOOK_EVENT_CATALOG['FileChanged'].kind).toBe('file-list');

    // 5 handler types, exact
    expect(CLAUDE_HOOK_HANDLER_TYPES).toHaveLength(5);
    for (const t of ['command', 'http', 'mcp_tool', 'prompt', 'agent']) {
      expect(CLAUDE_HOOK_HANDLER_TYPES).toContain(t);
    }

    // common fields: type discriminator + if/timeout/statusMessage; NO once
    const commonNames = CLAUDE_HOOK_COMMON_FIELDS.map((f) => f.name);
    expect(commonNames).toEqual(expect.arrayContaining(['type', 'if', 'timeout', 'statusMessage']));
    expect(commonNames).not.toContain('once');
    const typeField = CLAUDE_HOOK_COMMON_FIELDS.find((f) => f.name === 'type')!;
    expect(typeField.requirement).toBe('required');

    // type-specific fields, exact公开 sets
    const index = (fields: readonly { name: string; type: string; requirement: string; enumValues?: readonly string[] }[]) =>
      Object.fromEntries(fields.map((f) => [f.name, f])) as Record<string, { name: string; type: string; requirement: string; enumValues?: readonly string[] }>;

    const cmd = index(CLAUDE_HOOK_TYPE_FIELDS.command);
    expect(cmd.command).toMatchObject({ type: 'string', requirement: 'required' });
    expect(cmd.args.type).toBe('string-array');
    expect(cmd.async.type).toBe('boolean');
    expect(cmd.asyncRewake.type).toBe('boolean');
    expect(cmd.shell.type).toBe('string');
    expect(cmd.shell.enumValues).toEqual(['bash', 'powershell']);

    const http = index(CLAUDE_HOOK_TYPE_FIELDS.http);
    expect(http.url).toMatchObject({ type: 'string', requirement: 'required' });
    expect(http.headers.type).toBe('string-record');
    expect(http.allowedEnvVars.type).toBe('string-array');

    const mcp = index(CLAUDE_HOOK_TYPE_FIELDS.mcp_tool);
    expect(mcp.server).toMatchObject({ type: 'string', requirement: 'required' });
    expect(mcp.tool.requirement).toBe('required');
    expect(mcp.input.type).toBe('json-object');

    const prompt = index(CLAUDE_HOOK_TYPE_FIELDS.prompt);
    expect(prompt.prompt).toMatchObject({ type: 'string', requirement: 'required' });
    expect(prompt.model).toMatchObject({ type: 'string', requirement: 'optional' });
    expect(prompt.continueOnBlock).toEqual({ name: 'continueOnBlock', type: 'boolean', requirement: 'optional' });

    const agent = index(CLAUDE_HOOK_TYPE_FIELDS.agent);
    expect(agent.prompt).toMatchObject({ type: 'string', requirement: 'required' });
    expect(agent.model).toMatchObject({ type: 'string', requirement: 'optional' });
    expect(agent.continueOnBlock).toBeUndefined();

    // once / internal fields never appear in any structured field set
    const allFieldNames = [
      ...CLAUDE_HOOK_COMMON_FIELDS,
      ...Object.values(CLAUDE_HOOK_TYPE_FIELDS).flatMap((fields) => [...fields]),
    ].map((f) => f.name);
    expect(allFieldNames).not.toContain('once');
    expect(allFieldNames).not.toContain('rewakeMessage');
    expect(allFieldNames).not.toContain('rewakeSummary');

    // evidence + execution semantics
    expect(CLAUDE_HOOK_SCHEMA_EVIDENCE.cliVersion).toBe('2.1.204');
    expect(CLAUDE_HOOK_SCHEMA_EVIDENCE.sdkVersion).toBe('0.3.145');
    expect(CLAUDE_HOOK_SCHEMA_EVIDENCE.sdkBundledClaudeCodeVersion).toBe('2.1.145');
    expect(CLAUDE_HOOK_SCHEMA_EVIDENCE.officialDocsAccessed).toBe('2026-07-25');
    expect(CLAUDE_HOOK_SCHEMA_EVIDENCE.execution).toEqual({
      parallel: 'eligible-handlers-within-one-match',
      deduplication: 'identical-handlers-within-one-match',
      independentAsyncTriggersDeduplicated: false,
      order: 'document-only',
    });
  });
});
