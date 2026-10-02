import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

it('roundtrips unchanged stored Pi enums while rejecting new or changed unsupported enums (PC1)', () => {
  const output = execFileSync(process.execPath, ['--test', join(__dirname, 'PiConfigurationEnumRoundtrip.test.mjs')], { cwd: process.cwd(), encoding: 'utf8', windowsHide: true });
  expect(output).toContain('# fail 0');
  expect(output).toContain('# pass 9');
}, 30000);
