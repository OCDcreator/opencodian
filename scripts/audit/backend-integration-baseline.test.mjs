import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

import { collectDependencies, createAcceptanceLedger, parseCases, profiles, run } from './backend-integration-baseline.mjs';

const plan = fs.readFileSync(new URL('../../docs/requirements/backend-integration-completion-plan-2026-10-02.md', import.meta.url), 'utf8');
const names = ['@opencode-ai/sdk', '@opencode/client', '@openai/codex-sdk', '@anthropic-ai/claude-agent-sdk'];
const lock = { packages: Object.fromEntries(names.map((name) => [`node_modules/${name}`, { version: 'test-version' }])) };

test('canonical case identities are unique and cover every feature reference', () => {
  const cases = parseCases(plan);
  assert.equal(cases.length, 64);
  assert.equal(new Set(cases.map((item) => item.id)).size, 64);
  assert.throws(() => parseCases(`${plan}\n| S01 | duplicate | duplicate |`), /duplicate/);
  assert.throws(() => parseCases(plan.replace(/^\| I12 .*$/m, '')), /Missing planned case I12/);
});

test('missing, invalid and mismatched installed dependencies block native readiness', () => {
  for (const read of [() => null, () => { throw new Error('missing'); }, () => ({ version: 'wrong' })]) {
    const dependencies = collectDependencies(lock, read);
    assert.ok(dependencies.every((item) => item.status === 'failed'));
    const ledger = createAcceptanceLedger(parseCases(plan), dependencies, 'win32');
    assert.ok(ledger.profiles.every((item) => item.nativeReadiness === 'blocked'));
    assert.equal(ledger.coverage.nativePassed, 0);
  }
  assert.ok(createAcceptanceLedger(parseCases(plan), [], 'win32').profiles.every((item) => item.nativeReadiness === 'blocked'));
});

test('SDK install success cannot become native, UI or configuration runtime success', () => {
  const dependencies = collectDependencies(lock, () => ({ version: 'test-version' }));
  const ledger = createAcceptanceLedger(parseCases(plan), dependencies, 'darwin');
  assert.deepEqual(new Set(profiles.map((item) => item.backend)), new Set(['opencode', 'opencode2', 'codex', 'claude-code', 'pi', 'zcode']));
  assert.ok(ledger.profiles.every((item) => item.nativeReadiness === 'unverified' && item.runtimeVersion === null));
  assert.ok(ledger.features.every((item) => item.availability === 'unknown' && item.configuration.runtime === 'pending' && item.evidence.length === 0));
  assert.ok(ledger.cases.every((item) => item.results.every((result) => result.status === 'unverified' && result.platform === 'darwin')));
  assert.equal(ledger.coverage.nativePassed + ledger.coverage.uiPassed + ledger.coverage.releasePassed, 0);
});

test('baseline runner requires an explicit output directory and rejects unknown arguments', () => {
  for (const args of [[], ['--run-models'], ['--output'], ['--output', 'x', '--force']]) {
    assert.throws(() => run(args), /Usage:/);
  }
});
