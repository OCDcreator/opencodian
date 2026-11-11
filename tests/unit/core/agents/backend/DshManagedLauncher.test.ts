import { execFileSync } from 'node:child_process';
import path from 'node:path';

it('guards durable profiles and composes launch overlays without shared dependency writes', () => {
  const output = execFileSync(process.execPath, ['--test', '--test-reporter=tap', path.join(__dirname, 'DshManagedLauncher.test.mjs')], {
    cwd: process.cwd(), encoding: 'utf8', windowsHide: true, env: { ...process.env, NODE_OPTIONS: '' },
  });
  expect(output).toContain('# fail 0');
  expect(output).toContain('# tests 13');
}, 30_000);
