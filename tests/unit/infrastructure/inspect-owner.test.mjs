const { execFileSync } = require('node:child_process');
const path = require('node:path');

const scriptPath = path.join(process.cwd(), 'scripts', 'inspect-owner.mjs');

function runInspect(query, ...extraArgs) {
  try {
    const output = execFileSync(
      process.execPath,
      [scriptPath, query, ...extraArgs],
      {
        encoding: 'utf8',
        cwd: process.cwd(),
      },
    );
    return { output, exitCode: 0 };
  } catch (error) {
    return { output: error.stdout ?? '', exitCode: error.status ?? 1 };
  }
}

function runInspectJson(query) {
  const { output, exitCode } = runInspect(query, '--json');
  return { json: JSON.parse(output), exitCode };
}

describe('inspect:owner — representative path resolution', () => {
  test('resolves a chat path to feature.chat-shell or its delegate', () => {
    const { json, exitCode } = runInspectJson('src/features/chat/OpenCodianView.ts');
    expect(exitCode).toBe(0);
    expect(json.resolved).toBe(true);
    expect(json.owner.id).toBe('feature.chat-shell');
  });

  test('resolves an OpenCode path to core.opencode', () => {
    const { json, exitCode } = runInspectJson('src/core/opencode/OpenCodeService.ts');
    expect(exitCode).toBe(0);
    expect(json.owner.id).toBe('core.opencode');
    expect(json.owner.layer).toBe('core');
  });

  test('resolves a Codex backend path to core.backend', () => {
    const { json, exitCode } = runInspectJson('src/core/agents/backend/CodexAdapter.ts');
    expect(exitCode).toBe(0);
    expect(json.owner.id).toBe('core.backend');
  });

  test('resolves a Claude backend path to core.backend', () => {
    const { json, exitCode } = runInspectJson('src/core/agents/backend/ClaudeCodeAdapter.ts');
    expect(exitCode).toBe(0);
    expect(json.owner.id).toBe('core.backend');
  });

  test('resolves a storage path to core.storage', () => {
    const { json, exitCode } = runInspectJson('src/core/storage/StorageService.ts');
    expect(exitCode).toBe(0);
    expect(json.owner.id).toBe('core.storage');
  });

  test('resolves a settings path to feature.settings-shell or delegate', () => {
    const { json, exitCode } = runInspectJson('src/features/settings/SettingsDebugSection.ts');
    expect(exitCode).toBe(0);
    expect(json.owner.id).toBe('feature.settings-debug');
  });

  test('resolves main.ts to app.composition', () => {
    const { json, exitCode } = runInspectJson('src/main.ts');
    expect(exitCode).toBe(0);
    expect(json.owner.id).toBe('app.composition');
  });
});

describe('inspect:owner — owner facts composition', () => {
  test('derives mapped module doc from module-docs.config.json', () => {
    const { json } = runInspectJson('src/core/opencode/OpenCodeService.ts');
    expect(json.owner.mappedModuleDoc).toBe('docs/modules/core/opencode/OpenCodeService.md');
  });

  test('exposes required gates and risk', () => {
    const { json } = runInspectJson('core.opencode');
    expect(json.owner.requiredGates).toContain('typecheck');
    expect(json.owner.requiredGates).toContain('module-docs');
    expect(json.owner.risk).toBe('high');
  });

  test('exposes allowed/forbidden/adjacent dependency surface', () => {
    const { json } = runInspectJson('core.opencode');
    expect(json.owner.forbiddenDependencies).toEqual(['feature', 'app']);
    expect(json.owner.allowedOwnerDependencies).toContain('shared.diagnostics');
    expect(json.owner.adjacentOwners).toContain('app.composition');
  });

  test('exposes layer mayImportLayers', () => {
    const { json } = runInspectJson('feature.chat-shell');
    expect(json.owner.layer).toBe('feature');
    expect(json.owner.mayImportLayers).toEqual(['shared', 'core', 'feature']);
  });
});

describe('inspect:owner — error handling', () => {
  test('returns non-zero exit when no owner resolves', () => {
    const { exitCode, output } = runInspect('does-not-exist-at-all');
    expect(exitCode).toBe(1);
    expect(output).toContain('No owner resolved');
  });

  test('human format is actionable without reading phase history', () => {
    const { output } = runInspect('core.storage');
    expect(output).toContain('Owner: core.storage');
    expect(output).toContain('Responsibilities:');
    expect(output).toContain('Focused tests:');
    expect(output).toContain('Navigation:');
  });
});
