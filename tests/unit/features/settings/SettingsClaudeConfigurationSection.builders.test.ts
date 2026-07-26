import { SettingsClaudeConfigurationSection } from '../../../../src/features/settings/SettingsClaudeConfigurationSection';
import { candidate, fakePlugin, flushMicrotasks, projectRevision, readOk, stubService } from './SettingsClaudeConfigurationSection.testSupport';

describe('SettingsClaudeConfigurationSection common fields and hooks DOM', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders nine associated common fields, round-trips typed values, and preserves siblings', async () => {
    const body = document.createElement('div');
    document.body.appendChild(body);
    new SettingsClaudeConfigurationSection({
      plugin: fakePlugin('/vault') as never,
      sourceService: stubService({
        read: async () =>
          readOk(
            '{"unknownTop":"keep","env":{"A":"B"},"cleanupPeriodDays":2,"respectGitignore":true,"includeGitInstructions":false,"permissions":{"allow":["Read"],"unknown":"sibling"}}',
          ),
      }),
    }).render(body);
    await flushMicrotasks();
    const controls = body.querySelectorAll('[data-claude-config-field]');
    expect(controls).toHaveLength(9);
    for (const control of Array.from(controls)) {
      expect(body.querySelector(`label[for="${(control as HTMLElement).id}"]`)).toBeTruthy();
    }
    const draft = body.querySelector('[data-claude-config-draft]') as HTMLTextAreaElement;
    const allow = body.querySelector('[data-claude-config-field="permissions.allow"]') as HTMLTextAreaElement;
    expect(allow.value).toBe('["Read"]');
    allow.value = '["Read","Write"]';
    allow.dispatchEvent(new Event('change'));
    expect(JSON.parse(draft.value)).toMatchObject({
      unknownTop: 'keep',
      permissions: { unknown: 'sibling', allow: ['Read', 'Write'] },
    });
    const days = body.querySelector('[data-claude-config-field="cleanupPeriodDays"]') as HTMLInputElement;
    const beforeInvalid = draft.value;
    days.value = '0';
    days.dispatchEvent(new Event('change'));
    expect(draft.value).toBe(beforeInvalid);
    draft.value = '{"model":"advanced","env":{"X":"Y"}}';
    draft.dispatchEvent(new Event('input'));
    expect((body.querySelector('[data-claude-config-field="model"]') as HTMLInputElement).value).toBe('advanced');
    expect((body.querySelector('[data-claude-config-field="env"]') as HTMLTextAreaElement).value).toBe('{"X":"Y"}');
  });

  it('uses an exact inventory Local path only after explicit selection', async () => {
    const body = document.createElement('div');
    document.body.appendChild(body);
    const read = jest.fn(async (targetPath: string) => readOk(`{"path":${JSON.stringify(targetPath)}}`));
    new SettingsClaudeConfigurationSection({
      plugin: fakePlugin('/vault') as never,
      sourceService: stubService({
        inventory: async () => [
          candidate({ scope: 'project' }),
          candidate({
            scope: 'local',
            path: '/vault/exact/local-settings.json',
          }),
        ],
        read,
      }),
    }).render(body);
    await flushMicrotasks();
    const scope = body.querySelector('[data-claude-config-scope]') as HTMLSelectElement;
    scope.value = 'local';
    scope.dispatchEvent(new Event('change'));
    await flushMicrotasks();
    expect(body.querySelector('[data-claude-config-target]')?.textContent).toBe('/vault/exact/local-settings.json');
    expect(read.mock.calls.some(([path]) => path === '/vault/exact/local-settings.json')).toBe(true);
  });

  it('keeps a managed source visibly immutable with named native buttons', async () => {
    const body = document.createElement('div');
    document.body.appendChild(body);
    const source = candidate({
      scope: 'managed',
      editable: false,
      format: 'plist',
    });
    new SettingsClaudeConfigurationSection({
      plugin: fakePlugin('/vault') as never,
      sourceService: stubService({
        read: async () => ({
          status: 'success' as const,
          source,
          content: null,
        }),
      }),
    }).render(body);
    await flushMicrotasks();
    expect((body.querySelector('[data-claude-config-save]') as HTMLButtonElement).disabled).toBe(true);
    expect((body.querySelector('[data-claude-config-delete]') as HTMLButtonElement).disabled).toBe(true);
    expect((body.querySelector('[data-claude-config-field="model"]') as HTMLInputElement).disabled).toBe(true);
    for (const button of Array.from(body.querySelectorAll('button'))) {
      expect(button.type).toBe('button');
      expect(button.textContent || button.getAttribute('aria-label')).toBeTruthy();
    }
  });

  it('keeps hooks in the same draft, supports optional clear, and switches type atomically', async () => {
    const body = document.createElement('div');
    document.body.appendChild(body);
    new SettingsClaudeConfigurationSection({
      plugin: fakePlugin('/vault') as never,
      sourceService: stubService({
        read: async () =>
          readOk(
            '{"hooks":{"FutureEvent":[{"raw":"keep"}],"Stop":[{"matcher":"preserved-but-invalid","hooks":[{"type":"command","command":"echo old","once":true,"rewakeMessage":"raw"}]}],"PreToolUse":[{"matcher":"*","hooks":[{"type":"command","command":"echo old","if":"guard","timeout":10,"statusMessage":"Checking"}]}]}}',
          ),
      }),
    }).render(body);
    await flushMicrotasks();
    const evidence = body.querySelector('[data-claude-hooks-evidence]')?.textContent;
    expect(evidence).toContain('eligible handlers run in parallel');
    expect(evidence).toContain('separate async invocations are not deduplicated');
    expect(evidence).toContain('Moving changes document order only');
    expect(body.querySelector('[data-claude-hooks-unknown-event="FutureEvent"]')?.textContent).toContain('keep');
    expect(body.querySelector('[data-claude-hooks-matcher="Stop:0"]')).toBeNull();
    expect(body.querySelector('[data-claude-hooks-handler-field$=":once"]')).toBeNull();
    expect(body.querySelector('[data-claude-hooks-handler-field$=":rewakeMessage"]')).toBeNull();
    for (const field of ['if', 'timeout', 'statusMessage']) {
      const input = body.querySelector(`[data-claude-hooks-handler-field="PreToolUse:0:0:${field}"]`) as HTMLElement;
      expect(input).toBeTruthy();
      expect(body.querySelector(`label[for="${input.id}"]`)).toBeTruthy();
    }
    const optional = body.querySelector('[data-claude-hooks-handler-field="PreToolUse:0:0:if"]') as HTMLInputElement;
    optional.value = '';
    optional.dispatchEvent(new Event('change'));
    let parsed = JSON.parse((body.querySelector('[data-claude-config-draft]') as HTMLTextAreaElement).value);
    expect(parsed.hooks.PreToolUse[0].hooks[0].if).toBeUndefined();
    const type = body.querySelector('[data-claude-hooks-handler-field="PreToolUse:0:0:type"]') as HTMLSelectElement;
    type.value = 'http';
    type.dispatchEvent(new Event('change'));
    parsed = JSON.parse((body.querySelector('[data-claude-config-draft]') as HTMLTextAreaElement).value);
    expect(parsed.hooks.FutureEvent[0].raw).toBe('keep');
    expect(parsed.hooks.Stop[0].hooks[0].once).toBe(true);
    expect(parsed.hooks.PreToolUse[0].hooks[0]).toMatchObject({
      type: 'http',
      url: '',
    });
  });

  it('removes an optional boolean hook field without disturbing the same draft', async () => {
    const body = document.createElement('div');
    document.body.appendChild(body);
    new SettingsClaudeConfigurationSection({
      plugin: fakePlugin('/vault') as never,
      sourceService: stubService({
        read: async () =>
          readOk(
            '{"unrelated":{"kept":true},"hooks":{"PreToolUse":[{"matcher":"*","hooks":[{"type":"prompt","prompt":"Check this","continueOnBlock":true,"unknown":"kept"}]}]}}',
          ),
      }),
    }).render(body);
    await flushMicrotasks();

    const control = body.querySelector('[data-claude-hooks-handler-field="PreToolUse:0:0:continueOnBlock"]') as HTMLSelectElement;
    expect(control.tagName).toBe('SELECT');
    expect(Array.from(control.options, (option) => option.value)).toEqual(['', 'true', 'false']);
    expect(control.value).toBe('true');

    control.value = '';
    control.dispatchEvent(new Event('change'));

    const parsed = JSON.parse((body.querySelector('[data-claude-config-draft]') as HTMLTextAreaElement).value);
    expect(parsed.unrelated).toEqual({ kept: true });
    expect(parsed.hooks.PreToolUse[0]).toMatchObject({ matcher: '*' });
    expect(parsed.hooks.PreToolUse[0].hooks[0]).toEqual({
      type: 'prompt',
      prompt: 'Check this',
      unknown: 'kept',
    });
    expect(parsed.hooks.PreToolUse[0].hooks[0]).not.toHaveProperty('continueOnBlock');
  });

  it('renders a schema-built handler with the current revision evidence intact', async () => {
    const body = document.createElement('div');
    document.body.appendChild(body);
    new SettingsClaudeConfigurationSection({
      plugin: fakePlugin('/vault') as never,
      sourceService: stubService({
        inventory: async () => [candidate({ revision: projectRevision })],
        read: async () => readOk('{"hooks":{}}'),
      }),
    }).render(body);
    await flushMicrotasks();
    const event = body.querySelector('[data-claude-hooks-event-select]') as HTMLSelectElement;
    event.value = 'PreToolUse';
    (body.querySelector('[data-claude-hooks-group-add]') as HTMLButtonElement).click();
    (body.querySelector('[data-claude-hooks-handler-add]') as HTMLButtonElement).click();
    const command = body.querySelector('[data-claude-hooks-handler-field="PreToolUse:0:0:command"]') as HTMLInputElement;
    command.value = 'echo new';
    command.dispatchEvent(new Event('change'));
    expect(JSON.parse((body.querySelector('[data-claude-config-draft]') as HTMLTextAreaElement).value).hooks.PreToolUse[0].hooks[0].command).toBe('echo new');
    expect(body.querySelector('[data-claude-config-revision="project"]')?.textContent).toContain(projectRevision.sha256);
  });
});
