const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('acceptance baseline preserves case identity, dependency failures and unverified native evidence', () => {
  const output = execFileSync(process.execPath, [
    '--test', path.join(process.cwd(), 'scripts/audit/backend-integration-baseline.test.mjs'),
  ], { cwd: process.cwd(), encoding: 'utf8', timeout: 30000 });
  expect(output).toContain('# fail 0');
  expect(output).toContain('SDK install success cannot become native');
});
