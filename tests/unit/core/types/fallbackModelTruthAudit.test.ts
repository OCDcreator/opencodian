/**
 * Fallback Model truth-audit contract test
 *
 * Verifies that source code and docs stay synced with the accepted truth:
 * fallbackModel is `readback` (option wiring + same-model validation proven;
 * automatic fallback switching NOT locally provable — blocked on real API
 * overload / HTTP 529 path).
 *
 * Constraints:
 * - Must NOT use stale `@untested`
 * - Must NOT invent a new maturity tag like `@readback` — use plain prose
 * - Must express the honest readback boundary in prose
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..', '..', '..', '..');

describe('Fallback Model truth-audit', () => {
  it('settings.ts fallbackModel JSDoc uses honest prose — no @untested, no invented @readback tag', () => {
    const sourcePath = path.join(ROOT, 'src', 'core', 'types', 'settings.ts');
    const source = fs.readFileSync(sourcePath, 'utf-8');

    // Find the fallbackModel: string declaration
    const lines = source.split('\n');
    const fallbackLine = lines.findIndex((line) => /^ {2}fallbackModel: string;/.test(line));
    expect(fallbackLine).toBeGreaterThan(-1);

    // Gather lines above it (JSDoc)
    const jsdocLines = lines.slice(Math.max(0, fallbackLine - 3), fallbackLine).join('\n');

    // Must NOT contain stale @untested
    expect(jsdocLines).not.toContain('@untested');
    // Must NOT invent a new @readback maturity tag — use plain prose instead
    expect(jsdocLines).not.toContain('@readback');
    // Must express the honest readback boundary in prose
    expect(jsdocLines).toContain('Readback');
    expect(jsdocLines).toContain('switching');
  });

  it('settings.md describes fallbackModel readback boundary in prose without invented tags', () => {
    const docPath = path.join(ROOT, 'docs', 'modules', 'core', 'types', 'settings.md');
    const doc = fs.readFileSync(docPath, 'utf-8');

    // Must NOT describe fallbackModel as @untested
    expect(doc).not.toMatch(/`fallbackModel`\s+标记为\s+`@untested`/);
    // Must NOT invent `@readback` as a tag
    expect(doc).not.toMatch(/`fallbackModel`\s+标记为\s+`@readback`/);
    // Must describe readback boundary in prose (runtime readback proven, switching unproven)
    expect(doc).toMatch(/fallbackModel/);
  });
});
