import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

it('runs real Pi command/configuration handlers with isolated offline file fixtures', () => {
  const output = execFileSync(process.execPath, ['--test', '--test-reporter=tap', join(__dirname, 'PiThinkingAndConfiguration.test.mjs')], { cwd: process.cwd(), encoding: 'utf8', windowsHide: true,
  // CI exports NODE_OPTIONS=--test-reporter=tap; the child must not inherit a second reporter.
  env: { ...process.env, NODE_OPTIONS: '' } });
  expect(output).toContain('# fail 0');
  expect(output).toContain('# pass 8');
}, 30000);
