const path = require('node:path');

const modulePath = path.join(
  process.cwd(),
  'scripts',
  'run-jest-options.js',
);

describe('Jest child-process Node options', () => {
  it('preserves existing options without injecting unsupported localStorage flags', () => {
    const { resolveJestNodeOptions } = require(modulePath);

    expect(resolveJestNodeOptions({
      existingNodeOptions: '--max-old-space-size=4096',
      allowedNodeEnvironmentFlags: new Set(),
      storageFile: '/tmp/jest-localstorage.json',
    })).toBe('--max-old-space-size=4096');
  });

  it('adds an isolated localStorage file when the runtime supports the flag', () => {
    const { resolveJestNodeOptions } = require(modulePath);

    expect(resolveJestNodeOptions({
      existingNodeOptions: '',
      allowedNodeEnvironmentFlags: new Set(['--localstorage-file']),
      storageFile: '/tmp/jest-localstorage.json',
    })).toBe('--localstorage-file=/tmp/jest-localstorage.json');
  });
});
