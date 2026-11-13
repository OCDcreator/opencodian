/**
 * Jest loader bridge for `@opencode/schema/goal`. This is NOT a mock: it
 * re-exports the real installed package so adapter tests run against the
 * official `Goal.Definition` exactly as the plugin does in production.
 *
 * Why the bridge exists: `@opencode/schema` ships ESM-only dist files with
 * `import`-only export conditions, which jest's CJS module runtime cannot
 * resolve or evaluate. Node's native `require(esm)` can, so the official
 * module is loaded through the real Node loader and handed to jest as CJS.
 * `process.getBuiltinModule` is required because jest replaces the sandboxed
 * `node:module` createRequire with its own module registry implementation.
 * The bridge resolves the guaranteed root-level install by absolute path so
 * hoisted suites that mock `fs` cannot interfere with module initialization.
 */
import path from 'node:path';

interface NativeModuleLoader {
  createRequire(filename: string): NodeJS.Require;
}

function resolveOfficialGoalModule(): { Goal: typeof import('@opencode/schema/goal').Goal } {
  const nativeModule = process.getBuiltinModule('node:module') as unknown as NativeModuleLoader;
  // Load the real ESM file through an absolute path. The package intentionally
  // exposes no CJS `exports` entry, and several contract suites mock `fs` before
  // their hoisted imports, so avoid filesystem probing in this bridge.
  const goalPath = path.resolve(__dirname, '../../node_modules/@opencode/schema/dist/goal.js');
  return nativeModule.createRequire(__filename)(goalPath);
}

const official = resolveOfficialGoalModule();

export const Goal = official.Goal;
