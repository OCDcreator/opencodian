const { execFileSync } = require('node:child_process');
const path = require('node:path');

const modulePath = path.join(process.cwd(), 'scripts', 'module-doc-guard-lib.mjs');

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

describe('parseArgs', () => {
  test('parses boolean flags', () => {
    expect(callExport('parseArgs', ['--flag'])).toEqual({ flag: true });
  });

  test('parses inline key value pairs', () => {
    expect(callExport('parseArgs', ['--range=origin/main...HEAD'])).toEqual({
      range: 'origin/main...HEAD',
    });
  });

  test('parses separated key value pairs', () => {
    expect(callExport('parseArgs', ['--range', 'HEAD'])).toEqual({ range: 'HEAD' });
  });

  test('treats sequential flags independently', () => {
    expect(callExport('parseArgs', ['--flag', '--other-flag'])).toEqual({
      flag: true,
      'other-flag': true,
    });
  });
});

describe('toPosix', () => {
  test('converts backslashes to forward slashes', () => {
    expect(callExport('toPosix', 'src\\core\\service.ts')).toBe('src/core/service.ts');
  });

  test('strips a leading dot slash', () => {
    expect(callExport('toPosix', './src/core/service.ts')).toBe('src/core/service.ts');
  });

  test('collapses repeated forward slashes', () => {
    expect(callExport('toPosix', 'src//core///service.ts')).toBe('src/core/service.ts');
  });
});

describe('normalizeRepoPath', () => {
  test('strips leading slashes', () => {
    expect(callExport('normalizeRepoPath', '/docs/modules/chat.md')).toBe('docs/modules/chat.md');
  });

  test('strips trailing slashes', () => {
    expect(callExport('normalizeRepoPath', 'docs/modules/chat/')).toBe('docs/modules/chat');
  });
});

describe('sourceBelongsToGroup', () => {
  const group = {
    sourceRoot: 'src',
    docsRoot: 'docs/modules',
    include: ['**/*.ts', '**/*.tsx', '**/*.json'],
    exclude: ['**/*.spec.ts', 'generated/**'],
    exactMappings: {
      'special/config.json': 'docs/modules/special/config.md',
    },
  };

  test('matches files inside the source root with included extensions', () => {
    expect(callExport('sourceBelongsToGroup', group, 'src/core/service.ts')).toBe(true);
  });

  test('rejects files outside the source root when not exact mapped', () => {
    expect(callExport('sourceBelongsToGroup', group, 'scripts/build.mjs')).toBe(false);
  });

  test('rejects files matched by exclude globs', () => {
    expect(callExport('sourceBelongsToGroup', group, 'src/generated/types.ts')).toBe(false);
    expect(callExport('sourceBelongsToGroup', group, 'src/core/service.spec.ts')).toBe(false);
  });

  test('accepts exact mapped files outside the source root', () => {
    expect(callExport('sourceBelongsToGroup', group, 'special/config.json')).toBe(true);
  });
});

describe('mapSourceToDoc', () => {
  const group = {
    sourceRoot: 'src',
    docsRoot: 'docs/modules',
    include: ['**/*'],
    exclude: [],
    exactMappings: {
      'special/config.json': 'docs/modules/special/config.md',
    },
  };

  test('replaces the source extension with md', () => {
    expect(callExport('mapSourceToDoc', group, 'src/core/service.ts')).toBe('docs/modules/core/service.md');
  });

  test('prefers exact mappings over derived paths', () => {
    expect(callExport('mapSourceToDoc', group, 'special/config.json')).toBe('docs/modules/special/config.md');
  });
});

describe('findGroupForSource', () => {
  const config = {
    groups: [
      {
        name: 'typescript-src',
        sourceRoot: 'src',
        docsRoot: 'docs/modules',
        include: ['**/*.ts'],
        exclude: ['style/**'],
        exactMappings: {},
      },
      {
        name: 'style-css',
        sourceRoot: 'src/style',
        docsRoot: 'docs/modules/style',
        include: ['**/*.css'],
        exclude: [],
        exactMappings: {},
      },
    ],
  };

  test('returns the first matching group', () => {
    expect(callExport('findGroupForSource', config, 'src/core/service.ts')?.name).toBe('typescript-src');
  });

  test('returns the more specific style group for css sources', () => {
    expect(callExport('findGroupForSource', config, 'src/style/chat/layout.css')?.name).toBe('style-css');
  });

  test('returns null when no group matches', () => {
    expect(callExport('findGroupForSource', config, 'scripts/build.mjs')).toBeNull();
  });
});

describe('aggregateDocsFromRequirements', () => {
  const group = {
    sourceRoot: 'src',
    docsRoot: 'docs/modules',
  };

  test('aggregates topology-changing docs for add delete rename and copy statuses', () => {
    const requirements = [
      {
        group,
        sourcePaths: ['src/features/chat/index.ts'],
        statuses: ['A'],
      },
      {
        group,
        sourcePaths: ['src/features/settings/panel.ts'],
        statuses: ['D'],
      },
      {
        group,
        sourcePaths: ['src/core/opencode/OpenCodeService.ts'],
        statuses: ['R100'],
      },
      {
        group,
        sourcePaths: ['src/core/storage/cache.ts'],
        statuses: ['C75'],
      },
    ];

    expect(callExport('aggregateDocsFromRequirements', requirements)).toEqual([
      'docs/modules/README.md',
      'docs/modules/core/opencode/index.md',
      'docs/modules/core/storage/index.md',
      'docs/modules/features/chat/index.md',
      'docs/modules/features/settings/index.md',
    ]);
  });

  test('adds parent index docs for changed source index files without topology changes', () => {
    const requirements = [
      {
        group,
        sourcePaths: ['src/features/chat/index.ts'],
        statuses: ['M'],
      },
    ];

    expect(callExport('aggregateDocsFromRequirements', requirements)).toEqual([
      'docs/modules/features/chat/index.md',
    ]);
  });

  test('ignores unchanged non-index files for aggregate docs', () => {
    const requirements = [
      {
        group,
        sourcePaths: ['src/features/chat/OpenCodianView.ts'],
        statuses: ['M'],
      },
    ];

    expect(callExport('aggregateDocsFromRequirements', requirements)).toEqual([]);
  });
});
