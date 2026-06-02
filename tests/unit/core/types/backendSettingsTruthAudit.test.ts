/**
 * ClaudeCodeBackendSettings field truth-audit contract test
 *
 * Verifies that source JSDoc and module docs reflect accepted truth
 * for each settings field. Uses plain prose — no invented maturity tags.
 *
 * Accepted truth:
 * - allowedTools: readback (auto-allow shortcut, not a restrictor, zero enforcement)
 * - disallowedTools: pass (deterministic init-catalog filtering)
 * - maxTurns: pass (runtime behavior verified, error_max_turns signal observed)
 * - maxBudgetUsd: pass (runtime behavior verified, error_max_budget_usd signal observed)
 * - env: pass (runtime behavior verified, env propagation into subprocesses proven)
 * - fallbackModel: readback only (already corrected; not re-tested here)
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..', '..', '..', '..');

function getFieldJsdoc(source: string, fieldPattern: RegExp): string {
  const lines = source.split('\n');
  const fieldLine = lines.findIndex((line) => fieldPattern.test(line));
  if (fieldLine === -1) return '';
  // Walk backwards from the line before the field to find the start of the JSDoc
  let start = fieldLine - 1;
  // Skip the field's own comment line(s) backwards until we find the opening /**
  while (start > 0) {
    const trimmed = lines[start].trim();
    if (trimmed.startsWith('/**')) {
      break;
    }
    start--;
  }
  return lines.slice(start, fieldLine).join('\n');
}

describe('ClaudeCodeBackendSettings field truth-audit', () => {
  let source: string;
  let doc: string;

  beforeAll(() => {
    source = fs.readFileSync(path.join(ROOT, 'src', 'core', 'types', 'settings.ts'), 'utf-8');
    doc = fs.readFileSync(path.join(ROOT, 'docs', 'modules', 'core', 'types', 'settings.md'), 'utf-8');
  });

  // --- allowedTools: readback, not @untested ---

  it('allowedTools JSDoc reflects readback boundary (not @untested)', () => {
    const jsdoc = getFieldJsdoc(source, /^\s+allowedTools: string\[\]/);
    expect(jsdoc).not.toContain('@untested');
    expect(jsdoc).toContain('Readback');
  });

  // --- disallowedTools: pass (runtime verified) ---

  it('disallowedTools JSDoc reflects pass boundary (not @untested)', () => {
    const jsdoc = getFieldJsdoc(source, /^\s+disallowedTools: string\[\]/);
    expect(jsdoc).not.toContain('@untested');
    expect(jsdoc.toLowerCase()).toContain('runtime');
  });

  // --- maxTurns: pass ---

  it('maxTurns JSDoc reflects pass boundary (not @untested)', () => {
    const jsdoc = getFieldJsdoc(source, /^\s+maxTurns: number \| null/);
    expect(jsdoc).not.toContain('@untested');
    expect(jsdoc.toLowerCase()).toContain('runtime');
  });

  // --- maxBudgetUsd: pass ---

  it('maxBudgetUsd JSDoc reflects pass boundary (not @untested)', () => {
    const jsdoc = getFieldJsdoc(source, /^\s+maxBudgetUsd: number \| null/);
    expect(jsdoc).not.toContain('@untested');
    expect(jsdoc.toLowerCase()).toContain('runtime');
  });

  // --- env: pass ---

  it('env JSDoc reflects pass boundary (not @untested)', () => {
    const jsdoc = getFieldJsdoc(source, /^\s+env: Record<string, string>/);
    expect(jsdoc).not.toContain('@untested');
    expect(jsdoc.toLowerCase()).toContain('runtime');
  });

  // --- sandbox: readback (SDK option wiring proven, OS-level isolation not independently verified) ---

  it('sandbox JSDoc reflects readback boundary and warns it is not filesystem/network rules', () => {
    const jsdoc = getFieldJsdoc(source, /^\s+sandbox:\s/);
    expect(jsdoc).not.toContain('@untested');
    expect(jsdoc).toContain('Readback');
    expect(jsdoc.toLowerCase()).toContain('not filesystem');
  });

  // --- taskBudget: readback (SDK @alpha option wiring proven, API-side behavior not independently verified) ---

  it('taskBudget JSDoc reflects readback boundary and alpha status (not @untested)', () => {
    const jsdoc = getFieldJsdoc(source, /^\s+taskBudget: number \| null/);
    expect(jsdoc).not.toContain('@untested');
    expect(jsdoc).toContain('Readback');
    expect(jsdoc.toLowerCase()).toContain('alpha');
  });

  // --- planModeInstructions: readback (SDK option wiring proven; plan-mode behavior not independently verified) ---

  it('planModeInstructions JSDoc reflects readback boundary and plan-mode scope (not @untested)', () => {
    const jsdoc = getFieldJsdoc(source, /^\s+planModeInstructions: string/);
    expect(jsdoc).not.toContain('@untested');
    expect(jsdoc).toContain('Readback');
    expect(jsdoc.toLowerCase()).toContain('plan');
  });

  // --- toolAliases: readback (SDK option wiring proven; alias resolution not independently verified) ---

  it('toolAliases JSDoc reflects readback boundary (not @untested)', () => {
    const jsdoc = getFieldJsdoc(source, /^\s+toolAliases: Record<string, string>/);
    expect(jsdoc).not.toContain('@untested');
    expect(jsdoc).toContain('Readback');
    expect(jsdoc.toLowerCase()).toContain('alias');
  });

  // --- debug: readback (SDK option wiring proven; CLI debug log emission not independently verified) ---

  it('debug JSDoc reflects readback boundary (not @untested)', () => {
    const jsdoc = getFieldJsdoc(source, /^\s+debug: boolean/);
    expect(jsdoc).not.toContain('@untested');
    expect(jsdoc).toContain('Readback');
    expect(jsdoc.toLowerCase()).toContain('cli');
  });

  // --- settings.md: no stale @untested grouping for these fields ---

  it('settings.md does not group tool/env fields as @untested', () => {
    // The old wording was: "工具策略和环境变量字段也标记为 `@untested`"
    // This must be removed since those fields now have honest prose annotations
    expect(doc).not.toMatch(/工具策略和环境变量字段也标记为\s*`@untested`/);
    expect(doc).not.toMatch(/工具策略、限制项和环境变量字段也标记为\s*`@untested`/);
  });
});
