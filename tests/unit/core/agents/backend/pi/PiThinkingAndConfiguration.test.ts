import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

it('runs real Pi command/configuration handlers with isolated offline file fixtures', () => {
  const output = execFileSync(process.execPath, ['--test', join(__dirname, 'PiThinkingAndConfiguration.test.mjs')], { cwd: process.cwd(), encoding: 'utf8', windowsHide: true });
  expect(output).toContain('# fail 0');
  expect(output).toContain('# pass 4');
}, 30000);
