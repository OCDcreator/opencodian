import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Query } from '@anthropic-ai/claude-agent-sdk';
import ts from 'typescript';

import type {
  ClaudeCodeMcpPermissionModeOverride,
  ClaudeCodeMcpPermissionModeOverrideResult,
  ClaudeCodeOutputStylesReloadResult,
  ClaudeCodeSessionRuntime,
} from '../../../../../src/core/agents/backend/ClaudeCodeQueue';

type RuntimeQuery = NonNullable<ClaudeCodeSessionRuntime['query']>;
type Equal<T, U> = (<V>() => V extends T ? 1 : 2) extends (<V>() => V extends U ? 1 : 2) ? true : false;

// The explicit noEmit semantic check below validates these type assertions and
// negative compile cases even when Jest uses isolatedModules transpilation.
describe('Claude SDK 0.3.283 control source/type contracts', () => {
  it('keeps the two optional runtime methods exactly equal to the official Query methods', () => {
    const exactContracts: [
      Equal<NonNullable<RuntimeQuery['setMcpPermissionModeOverride']>, Query['setMcpPermissionModeOverride']>,
      Equal<NonNullable<RuntimeQuery['reloadOutputStyles']>, Query['reloadOutputStyles']>,
      Equal<ClaudeCodeMcpPermissionModeOverride, 'default' | 'auto' | null>,
    ] = [true, true, true];

    expect(exactContracts).toEqual([true, true, true]);
  });

  it('rejects permission widening, plan mode, and undefined instead of silently clearing an override', () => {
    // @ts-expect-error The per-MCP override cannot bypass permission checks.
    const bypass: ClaudeCodeMcpPermissionModeOverride = 'bypassPermissions';
    // @ts-expect-error acceptEdits is a session mode, not a tighten-only MCP override.
    const edits: ClaudeCodeMcpPermissionModeOverride = 'acceptEdits';
    // @ts-expect-error plan is not in the official per-MCP override contract.
    const plan: ClaudeCodeMcpPermissionModeOverride = 'plan';
    // @ts-expect-error Only explicit null clears the override.
    const omitted: ClaudeCodeMcpPermissionModeOverride = undefined;

    expect([bypass, edits, plan, omitted]).toEqual(['bypassPermissions', 'acceptEdits', 'plan', undefined]);
  });

  it('allows old query handles to omit both methods while rejecting non-callable members', () => {
    const missingMethods: Pick<RuntimeQuery, 'setMcpPermissionModeOverride' | 'reloadOutputStyles'> = {};
    // @ts-expect-error Capability probing must test a callable method, not a truthy property.
    const nonCallable: RuntimeQuery['reloadOutputStyles'] = true;

    expect(missingMethods).toEqual({});
    expect(nonCallable).toBe(true);
  });

  it('cannot type a void result as an acknowledged control', () => {
    // @ts-expect-error A missing/no-op MCP call cannot become an acknowledgement.
    const mcp: ClaudeCodeMcpPermissionModeOverrideResult = { status: 'acknowledged', nativeSessionId: 'native-a', response: undefined };
    // @ts-expect-error A missing/no-op style reload cannot become an acknowledgement.
    const styles: ClaudeCodeOutputStylesReloadResult = { status: 'acknowledged', nativeSessionId: 'native-a', response: undefined };

    expect(mcp).toHaveProperty('response', undefined);
    expect(styles).toHaveProperty('response', undefined);
  });

  it('preserves an informational MCP warning without declaring effective permission readback', () => {
    const result: ClaudeCodeMcpPermissionModeOverrideResult = {
      status: 'acknowledged', nativeSessionId: 'native-a', response: { warning: 'Server not yet connected' },
    };
    // @ts-expect-error A warning has the official string shape, not a boolean success marker.
    const malformed: ClaudeCodeMcpPermissionModeOverrideResult = { status: 'acknowledged', nativeSessionId: 'native-a', response: { warning: true } };

    expect(result.response).toEqual({ warning: 'Server not yet connected' });
    expect(malformed).toHaveProperty('response.warning', true);
  });

  it('limits styles acknowledgements to refreshed names, without inventing prompt application', () => {
    const result: ClaudeCodeOutputStylesReloadResult = {
      status: 'acknowledged', nativeSessionId: 'native-a', response: { available_output_styles: ['default', 'custom'] },
    };
    // @ts-expect-error The SDK returns a list of strings, not unknown values.
    const malformed: ClaudeCodeOutputStylesReloadResult = { status: 'acknowledged', nativeSessionId: 'native-a', response: { available_output_styles: [42] } };
    // @ts-expect-error Reload acknowledgement does not prove a style was applied to a prompt.
    const applied: ClaudeCodeOutputStylesReloadResult = { status: 'acknowledged', nativeSessionId: 'native-a', response: { available_output_styles: [], promptApplied: true } };

    expect(result.response.available_output_styles).toEqual(['default', 'custom']);
    expect(malformed).toHaveProperty('response.available_output_styles', [42]);
    expect(applied).toHaveProperty('response.promptApplied', true);
  });

  it('keeps unavailable and failed controls distinct from response-bearing acknowledgements', () => {
    const unavailable: ClaudeCodeMcpPermissionModeOverrideResult = {
      status: 'unavailable', nativeSessionId: 'native-a', reason: 'missing-method',
    };
    const failed: ClaudeCodeOutputStylesReloadResult = {
      status: 'failed', nativeSessionId: 'native-a', reason: 'request-failed',
    };
    // @ts-expect-error Unavailable is not an acknowledgement, even if a caller adds a response.
    const fake: ClaudeCodeMcpPermissionModeOverrideResult = { status: 'unavailable', nativeSessionId: 'native-a', reason: 'no-active-session', response: {} };

    expect(unavailable).not.toHaveProperty('response');
    expect(failed).not.toHaveProperty('response');
    expect(fake.status).toBe('unavailable');
  });

  it('semantically checks the SDK-derived contracts and every negative compile assertion', () => {
    const testPath = resolve(process.cwd(), 'tests/unit/core/agents/backend/ClaudeCodeQueue.controlContracts.test.ts');
    const queuePath = resolve(process.cwd(), 'src/core/agents/backend/ClaudeCodeQueue.ts');
    const program = ts.createProgram([testPath], {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strictNullChecks: true,
      noImplicitAny: true,
      skipLibCheck: true,
      noEmit: true,
      esModuleInterop: true,
      types: ['node', 'jest'],
      typeRoots: [resolve(process.cwd(), 'node_modules/@types')],
    });
    const testSource = program.getSourceFile(testPath)!;
    const queueSource = program.getSourceFile(queuePath)!;
    const diagnostics = [
      ...program.getOptionsDiagnostics(),
      ...program.getSyntacticDiagnostics(testSource),
      ...program.getSemanticDiagnostics(testSource),
      ...program.getSemanticDiagnostics(queueSource),
    ];

    expect(diagnostics.map((diagnostic) => {
      const line = diagnostic.file && diagnostic.start !== undefined
        ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1
        : 'options';
      return `line ${line}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`;
    })).toEqual([]);
  });

  it('uses the requested installed SDK baseline', () => {
    const packagePath = resolve(process.cwd(), 'node_modules/@anthropic-ai/claude-agent-sdk/package.json');
    const sdkPackage = JSON.parse(readFileSync(packagePath, 'utf8')) as { version: string };

    expect(sdkPackage.version).toBe('0.3.283');
  });
});
