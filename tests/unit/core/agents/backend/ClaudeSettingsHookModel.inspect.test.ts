/**
 * Tracer bullet — ClaudeSettingsHookModel.inspect: a read-only document view of
 * settings.hooks that preserves document order, supported flags, and ALL raw
 * unknown/internal fields (once, rewakeMessage, future events/types) without
 * mutating the input or treating unknowns as a parse failure.
 */
import { inspectClaudeSettingsHooks } from '../../../../../src/core/agents/backend/ClaudeSettingsHookModel';

describe('ClaudeSettingsHookModel inspect', () => {
  it('preserves document order, supported flags, and raw unknown/internal fields without mutating input', () => {
    const input = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash',
            unknownGroupField: 'g',
            hooks: [
              { type: 'command', command: 'echo hi', once: true, rewakeMessage: 'x', unknownHandlerField: 'h' },
            ],
          },
        ],
        MessageDisplay: [
          {
            matcher: 'should-be-flagged',
            hooks: [
              { type: 'command', command: 'echo md' },
            ],
          },
        ],
        FutureEvent: [
          {
            hooks: [
              { type: 'future_type', command: 'echo fut' },
            ],
          },
        ],
      },
    };
    const cloneBefore = JSON.parse(JSON.stringify(input));

    const view = inspectClaudeSettingsHooks(input);

    // document order preserved (Object.entries order)
    expect(view.events.map((e) => e.event)).toEqual(['PreToolUse', 'MessageDisplay', 'FutureEvent']);

    // PreToolUse: known event, matcher + raw unknown group field preserved
    const pre = view.events[0];
    expect(pre.supported).toBe(true);
    expect(pre.groups[0].matcher).toBe('Bash');
    expect(pre.groups[0].raw.unknownGroupField).toBe('g');
    const preHandler = pre.groups[0].hooks[0];
    expect(preHandler.type).toBe('command');
    expect(preHandler.supported).toBe(true);
    // raw unknown/internal fields preserved (once + rewakeMessage + unknownHandlerField)
    expect(preHandler.raw.once).toBe(true);
    expect(preHandler.raw.rewakeMessage).toBe('x');
    expect(preHandler.raw.unknownHandlerField).toBe('h');

    // MessageDisplay: known no-matcher event; raw matcher preserved but flagged
    const md = view.events[1];
    expect(md.supported).toBe(true);
    expect(md.groups[0].matcher).toBe('should-be-flagged');
    expect(md.groups[0].raw.matcher).toBe('should-be-flagged');

    // FutureEvent: unknown event + future handler type -> supported false, raw preserved
    const fe = view.events[2];
    expect(fe.supported).toBe(false);
    expect(fe.groups[0].hooks[0].type).toBe('future_type');
    expect(fe.groups[0].hooks[0].supported).toBe(false);

    // diagnostics: no-matcher event flagged; unknown event/type NOT a parse failure
    expect(view.diagnostics.some((d) => d.path.includes('MessageDisplay') && /matcher/i.test(d.message))).toBe(true);
    expect(view.diagnostics.some((d) => d.path.includes('PreToolUse'))).toBe(false);
    expect(view.diagnostics.some((d) => d.path.includes('FutureEvent'))).toBe(false);

    // input not mutated
    expect(input).toEqual(cloneBefore);
  });
});
