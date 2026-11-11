import { execFileSync } from 'node:child_process';
import path from 'node:path';

it('runs native bridge behavior and installed-public-schema probes through the default gate', () => {
  const output = execFileSync(process.execPath, [
    '--test', '--test-reporter=tap',
    path.join(__dirname, 'DshNativeControls.test.mjs'),
    path.join(__dirname, 'DshNativeControls.installed.test.mjs'),
  ], { cwd: process.cwd(), encoding: 'utf8', windowsHide: true, env: { ...process.env, NODE_OPTIONS: '' } });
  expect(output).toContain('# fail 0');
  expect(output).toMatch(/# pass [1-9]\d*/);
}, 30_000);
