const { execFileSync } = require('node:child_process');
const path = require('node:path');

const modulePath = path.join(process.cwd(), 'scripts', 'owner-guard-lib.mjs');

function callExport(exportName, ...args) {
  const code = `
    import { pathToFileURL } from 'node:url';
    const modulePath = ${JSON.stringify(modulePath)};
    const mod = await import(pathToFileURL(modulePath).href);
    const result = mod[${JSON.stringify(exportName)}](...${JSON.stringify(args)});
    process.stdout.write(JSON.stringify(result));
  `;

  const output = execFileSync(process.execPath, ['--input-type=module', '--eval', code], {
    encoding: 'utf8',
    cwd: process.cwd(),
  });

  return JSON.parse(output);
}

describe('getGuardTargets', () => {
  test('includes every guarded thick-owner file', () => {
    expect(callExport('getGuardTargets')).toEqual([
      'src/features/chat/OpenCodianView.ts',
      'src/core/opencode/OpenCodeService.ts',
      'src/main.ts',
      'src/core/opencode/ServerManager.ts',
    ]);
  });
});

describe('isAutoExemptPath', () => {
  test('allows docs, style, assets, and locale paths', () => {
    expect(callExport('isAutoExemptPath', 'docs/status/development-maintainability-rules.md')).toBe(true);
    expect(callExport('isAutoExemptPath', 'src/style/chat/layout.css')).toBe(true);
    expect(callExport('isAutoExemptPath', 'assets/provider-icons/example.svg')).toBe(true);
    expect(callExport('isAutoExemptPath', 'src/i18n/zh-cn.ts')).toBe(true);
  });

  test('rejects scripts that change the owner-guard rules themselves', () => {
    expect(callExport('isAutoExemptPath', 'scripts/check-owner-guard.mjs')).toBe(false);
    expect(callExport('isAutoExemptPath', 'scripts/install-hooks.mjs')).toBe(false);
  });
});

describe('evaluateOwnerGuard', () => {
  test('blocks a guarded file touched by a Class B feature change', () => {
    expect(
      callExport('evaluateOwnerGuard', {
        mode: 'normal',
        changedPaths: ['src/features/chat/OpenCodianView.ts'],
        fileAssessments: {
          'src/features/chat/OpenCodianView.ts': {
            presentationOnly: false,
            netNewOwnership: false,
            addedLineCount: 8,
            removedLineCount: 0,
          },
        },
      }),
    ).toEqual(
      expect.objectContaining({
        ok: false,
        ruleId: 'RULE_1_HOTSPOT_CLASS_B',
      }),
    );
  });

  test('allows guarded-file presentation-only edits', () => {
    expect(
      callExport('evaluateOwnerGuard', {
        mode: 'normal',
        changedPaths: ['src/features/chat/OpenCodianView.ts', 'src/style/chat/layout.css'],
        fileAssessments: {
          'src/features/chat/OpenCodianView.ts': {
            presentationOnly: true,
            netNewOwnership: false,
            addedLineCount: 1,
            removedLineCount: 1,
          },
        },
      }),
    ).toEqual(
      expect.objectContaining({
        ok: true,
        className: 'ClassA',
      }),
    );
  });

  test('blocks net-new runtime ownership in a guarded file', () => {
    expect(
      callExport('evaluateOwnerGuard', {
        mode: 'normal',
        changedPaths: ['src/core/opencode/OpenCodeService.ts'],
        fileAssessments: {
          'src/core/opencode/OpenCodeService.ts': {
            presentationOnly: false,
            netNewOwnership: true,
            addedLineCount: 24,
            removedLineCount: 2,
          },
        },
      }),
    ).toEqual(
      expect.objectContaining({
        ok: false,
        ruleId: 'RULE_3_NET_NEW_OWNERSHIP',
      }),
    );
  });

  test('allows maintainability-refactor mode when the guarded file net-reduces ownership', () => {
    expect(
      callExport('evaluateOwnerGuard', {
        mode: 'maintainability-refactor',
        changedPaths: ['src/core/opencode/ServerManager.ts', 'src/core/opencode/ServerRuntimeHealth.ts'],
        fileAssessments: {
          'src/core/opencode/ServerManager.ts': {
            presentationOnly: false,
            netNewOwnership: false,
            addedLineCount: 6,
            removedLineCount: 42,
          },
        },
      }),
    ).toEqual(
      expect.objectContaining({
        ok: true,
        className: 'ClassA',
      }),
    );
  });

  test('allows explicitly approved Class B guarded-file touches', () => {
    expect(
      callExport('evaluateOwnerGuard', {
        mode: 'normal',
        approval: 'user approved opencodian:new-conversation command fix',
        changedPaths: ['src/main.ts'],
        fileAssessments: {
          'src/main.ts': {
            presentationOnly: false,
            netNewOwnership: false,
            addedLineCount: 4,
            removedLineCount: 1,
          },
        },
      }),
    ).toEqual(
      expect.objectContaining({
        ok: true,
        className: 'ClassB',
        ruleId: 'RULE_1_HOTSPOT_CLASS_B_APPROVED',
        approval: 'user approved opencodian:new-conversation command fix',
      }),
    );
  });

  test('keeps net-new runtime ownership non-bypassable by approval', () => {
    expect(
      callExport('evaluateOwnerGuard', {
        mode: 'normal',
        approval: 'user approved the change',
        changedPaths: ['src/core/opencode/OpenCodeService.ts'],
        fileAssessments: {
          'src/core/opencode/OpenCodeService.ts': {
            presentationOnly: false,
            netNewOwnership: true,
            addedLineCount: 24,
            removedLineCount: 2,
          },
        },
      }),
    ).toEqual(
      expect.objectContaining({
        ok: false,
        ruleId: 'RULE_3_NET_NEW_OWNERSHIP',
      }),
    );
  });
});
