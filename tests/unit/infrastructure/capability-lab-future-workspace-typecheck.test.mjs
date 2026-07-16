const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

describe('Capability Lab future workspace type contract', () => {
  it('compiles a future descriptor renderer against the production workspace helper', () => {
    const tscPath = join(process.cwd(), 'node_modules', 'typescript', 'bin', 'tsc');
    const fixturePath = join(process.cwd(), 'tests', 'fixtures', 'capability-lab-future-workspace.ts');
    const result = spawnSync(process.execPath, [
      tscPath,
      '--noEmit',
      '--strictNullChecks',
      '--noImplicitAny',
      '--skipLibCheck',
      '--module',
      'ESNext',
      '--target',
      'ES2018',
      '--moduleResolution',
      'bundler',
      '--lib',
      'DOM,ES2018',
      '--types',
      'obsidian',
      fixturePath,
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });
});
