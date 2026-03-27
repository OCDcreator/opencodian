# Build ID and Release Scripts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add BUILD_ID injection for build tracking and release scripts for version management.

**Architecture:** Separate "release version" (semver in package.json/manifest.json) from "build identifier" (branch + timestamp, injected at compile time). Create shared build-utils.mjs for BUILD_ID generation, wrap npm version for release workflow.

**Tech Stack:** TypeScript, Node.js ES modules, esbuild, npm lifecycle hooks

**Spec:** [2026-03-27-version-feature-design.md](../specs/2026-03-27-version-feature-design.md)

---

## File Structure

| File | Type | Responsibility |
|------|------|----------------|
| `src/shared/logger.ts` | Modify | Add `info` method to Logger interface |
| `scripts/build-utils.mjs` | Create | Shared BUILD_ID generation utilities |
| `scripts/build.mjs` | Modify | Inject BUILD_ID in production builds |
| `esbuild.config.mjs` | Modify | Inject BUILD_ID in dev mode |
| `scripts/release.mjs` | Create | Wrap `npm version` for release workflow |
| `src/main.ts` | Modify | Output BUILD_ID at plugin load |
| `package.json` | Modify | Add release:* scripts |
| `AGENTS.md` | Modify | Document release and BUILD_ID |

---

## Task 1: Add `info` method to Logger

**Files:**
- Modify: `src/shared/logger.ts`
- Test: Manual verification in Obsidian console

- [ ] **Step 1: Add `info` to Logger interface and implementation**

Modify `src/shared/logger.ts`:

```typescript
// Line 16-20: Update Logger interface
export interface Logger {
  info: (...args: unknown[]) => void;  // ADD THIS LINE
  debug: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

// Line 106-122: Update createLogger function
export function createLogger(scope: string): Logger {
  return {
    info: (...args: unknown[]) => {
      emit('log', scope, args);  // info always outputs, uses console.log
    },
    debug: (...args: unknown[]) => {
      if (!isDebugEnabled()) {
        return;
      }

      emit('log', scope, args);
    },
    warn: (...args: unknown[]) => {
      emit('warn', scope, args);
    },
    error: (...args: unknown[]) => {
      emit('error', scope, args);
    },
  };
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `cd c:/Users/lt/Desktop/Write/custom-project/opencodian && npm run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/shared/logger.ts
git commit -m "feat(logger): add info method for always-visible logging"
```

---

## Task 2: Create build-utils.mjs

**Files:**
- Create: `scripts/build-utils.mjs`

- [ ] **Step 1: Create the utility module**

Create `scripts/build-utils.mjs`:

```javascript
import { execSync } from 'child_process';

/**
 * Get current git branch name
 * @returns {string} Branch name or 'unknown' if git command fails
 */
export function getGitBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Sanitize branch name for use in BUILD_ID
 * - Replace '/' with '-' (branch names often contain slashes)
 * - Remove other non-alphanumeric characters except '-' and '_'
 * @param {string} branch - Raw branch name
 * @returns {string} Sanitized branch name
 */
export function sanitizeBranchName(branch) {
  return branch.replace(/\//g, '-').replace(/[^a-zA-Z0-9\-_.]/g, '');
}

/**
 * Generate local timestamp string (YYYYMMDDHHmm)
 * Uses local timezone for easier debugging
 * @returns {string} 12-character timestamp
 */
export function getLocalTimeStamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
}

/**
 * Generate BUILD_ID from git branch and timestamp
 * Format: {sanitizedBranch}.{YYYYMMDDHHmm}
 * Example: fix-revert-model-toggle.202603271430
 * @returns {string} BUILD_ID
 */
export function generateBuildId() {
  const branch = sanitizeBranchName(getGitBranch());
  const timestamp = getLocalTimeStamp();
  return `${branch}.${timestamp}`;
}
```

- [ ] **Step 2: Verify module can be imported**

Run: `cd c:/Users/lt/Desktop/Write/custom-project/opencodian && node -e "import('./scripts/build-utils.mjs').then(m => console.log(m.generateBuildId()))"`
Expected: Output like `main.202603271430` or `fix-revert-model-toggle.202603271630`

- [ ] **Step 3: Commit**

```bash
git add scripts/build-utils.mjs
git commit -m "feat(build): add build-utils module for BUILD_ID generation"
```

---

## Task 3: Update production build script

**Files:**
- Modify: `scripts/build.mjs`

- [ ] **Step 1: Import build-utils and add BUILD_ID injection**

Modify `scripts/build.mjs`. Add import at top and BUILD_ID generation before esbuild.context:

```javascript
// Add to imports at top (line 1-4 area):
import { generateBuildId } from './build-utils.mjs';

// Add before esbuild.context (around line 21, after distDir creation):
const buildId = generateBuildId();
console.log(`[build] BUILD_ID: ${buildId}`);

// Modify esbuild.context to add define (around line 27):
try {
  const esbuildModule = await import("esbuild");
  const esbuild = esbuildModule.default ?? esbuildModule;

  context = await esbuild.context({
    banner: {
      js: banner,
    },
    define: {
      BUILD_ID: JSON.stringify(buildId),
    },
    entryPoints: ['src/main.ts'],
    // ... rest of config unchanged
```

Full modified sections:

```javascript
import fs from "fs";
import path from "path";
import process from "process";
import builtins from "builtin-modules";
import { generateBuildId } from './build-utils.mjs';  // ADD THIS

const banner =
`/*
THIS IS A GENERATED/BUNDLED FILE BY ESBUILD
if you want to view the source, please visit the github repository of this plugin
*/
`;

const prod = (process.argv[2] === 'production');

// Ensure dist directory exists
const distDir = path.join(process.cwd(), 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const buildId = generateBuildId();  // ADD THIS
console.log(`[build] BUILD_ID: ${buildId}`);  // ADD THIS

let context;

try {
  const esbuildModule = await import("esbuild");
  const esbuild = esbuildModule.default ?? esbuildModule;

  context = await esbuild.context({
    banner: {
      js: banner,
    },
    define: {
      BUILD_ID: JSON.stringify(buildId),  // ADD THIS
    },
    entryPoints: ['src/main.ts'],
    bundle: true,
    external: [
      'obsidian',
      'electron',
      '@codemirror/*',
      'lezer',
      '@lezer/*',
      ...builtins],
    format: 'cjs',
    target: 'es2018',
    logLevel: "info",
    sourcemap: prod ? false : 'inline',
    treeShaking: true,
    outfile: prod ? 'dist/main.js' : 'main.js',
  });
} catch (error) {
  // ... error handling unchanged
}
```

- [ ] **Step 2: Test production build**

Run: `cd c:/Users/lt/Desktop/Write/custom-project/opencodian && npm run build`
Expected: See `[build] BUILD_ID: <branch>.<timestamp>` in output

- [ ] **Step 3: Commit**

```bash
git add scripts/build.mjs
git commit -m "feat(build): inject BUILD_ID in production builds"
```

---

## Task 4: Update dev build script

**Files:**
- Modify: `esbuild.config.mjs`

- [ ] **Step 1: Import build-utils and add BUILD_ID injection**

Modify `esbuild.config.mjs`:

```javascript
import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";
import { generateBuildId } from './scripts/build-utils.mjs';  // ADD THIS

const banner =
`/*
THIS IS A GENERATED/BUNDLED FILE BY ESBUILD
if you want to view the source, please visit the github repository of this plugin
*/
`;

const prod = (process.argv[2] === 'production');

const buildId = generateBuildId();  // ADD THIS
console.log(`[dev] BUILD_ID: ${buildId}`);  // ADD THIS

const context = await esbuild.context({
	banner: {
		js: banner,
	},
	define: {
		BUILD_ID: JSON.stringify(buildId),  // ADD THIS
	},
	entryPoints: ['src/main.ts'],
	bundle: true,
	external: [
		'obsidian',
		'electron',
		'@codemirror/*',
		'lezer',
		'@lezer/*',
		...builtins],
	format: 'cjs',
	target: 'es2018',
	logLevel: "info",
	sourcemap: prod ? false : 'inline',
	treeShaking: true,
	outfile: 'main.js',
});

if (prod) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}
```

- [ ] **Step 2: Test dev build**

Run: `cd c:/Users/lt/Desktop/Write/custom-project/opencodian && npm run dev`
Expected: See `[dev] BUILD_ID: <branch>.<timestamp>` in output
(Then Ctrl+C to stop the watch process)

- [ ] **Step 3: Commit**

```bash
git add esbuild.config.mjs
git commit -m "feat(dev): inject BUILD_ID in development mode"
```

---

## Task 5: Create release script

**Files:**
- Create: `scripts/release.mjs`

- [ ] **Step 1: Create the release wrapper script**

Create `scripts/release.mjs`:

```javascript
#!/usr/bin/env node
import { execSync } from 'child_process';

const bumpType = process.argv[2] || 'patch';

// Validate bump type
if (!['patch', 'minor', 'major'].includes(bumpType)) {
  console.error(`Invalid bump type: ${bumpType}. Use patch, minor, or major.`);
  process.exit(1);
}

console.log(`Bumping version (${bumpType})...`);

// Use npm version command to update package.json and package-lock.json
// --no-git-tag-version: don't create git tag
// The existing "version" lifecycle hook will sync manifest.json
execSync(`npm version ${bumpType} --no-git-tag-version`, { stdio: 'inherit' });

console.log('Release complete. Files updated: package.json, package-lock.json, manifest.json');
```

- [ ] **Step 2: Add release scripts to package.json**

Modify `package.json` scripts section (around line 6-18):

```json
{
  "scripts": {
    "build:css": "node scripts/build-css.mjs",
    "dev": "npm run build:css && node esbuild.config.mjs",
    "build": "node scripts/build.mjs production",
    "release:patch": "node scripts/release.mjs patch",
    "release:minor": "node scripts/release.mjs minor",
    "release:major": "node scripts/release.mjs major",
    "doctor:esbuild": "node scripts/doctor-esbuild.mjs",
    ...
  }
}
```

- [ ] **Step 3: Test release script (dry run)**

Run: `cd c:/Users/lt/Desktop/Write/custom-project/opencodian && node scripts/release.mjs patch`
Expected: Version bumped, package.json/package-lock.json/manifest.json updated

- [ ] **Step 4: Commit**

```bash
git add scripts/release.mjs package.json
git commit -m "feat(release): add release scripts for version bumping"
```

---

## Task 6: Add BUILD_ID output in main.ts

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Add BUILD_ID declaration and output**

At the top of `src/main.ts` (after imports, around line 33):

```typescript
const logger = createLogger('OpenCodian');

// BUILD_ID is injected at build time via esbuild define
declare const BUILD_ID: string;
```

In `onload()` method (at the very beginning, around line 48):

```typescript
async onload() {
  // Output BUILD_ID for debugging (always visible)
  logger.info(`OpenCodian BUILD_ID: ${BUILD_ID}`);

  // Initialize storage
  this.storage = new StorageService(this);
  // ... rest of code
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `cd c:/Users/lt/Desktop/Write/custom-project/opencodian && npm run typecheck`
Expected: No errors

- [ ] **Step 3: Test build and verify BUILD_ID in output**

Run: `cd c:/Users/lt/Desktop/Write/custom-project/opencodian && npm run build`
Expected: Build succeeds with BUILD_ID output

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat(main): output BUILD_ID at plugin load"
```

---

## Task 7: Update AGENTS.md documentation

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Add Release and Build ID section**

After the "Build and Development Commands" section (around line 180), add:

```markdown
## Release and Build ID

### Version Release Rules

Use these commands to bump the semantic version when releasing:

| Command | Version Change | Use Case |
|---------|---------------|----------|
| `npm run release:patch` | 0.1.0 → 0.1.1 | Bugfix, text changes, config tweaks |
| `npm run release:minor` | 0.1.0 → 0.2.0 | New features, refactoring, API extensions |
| `npm run release:major` | 0.1.0 → 1.0.0 | Architecture changes, breaking changes |

These commands update `package.json`, `package-lock.json`, and `manifest.json` automatically.

### BUILD_ID

Each `npm run build` generates a `BUILD_ID` with format `{branch}.{timestamp}`:

- **Branch**: Current git branch, `/` replaced with `-`
- **Timestamp**: Local time, format `YYYYMMDDHHmm`
- **Example**: `fix-revert-model-toggle.202603271430`

The BUILD_ID is output to the Obsidian developer console when the plugin loads, useful for debugging which build is running.

### Typical Release Workflow

```bash
# 1. Bump version
npm run release:patch

# 2. Build
npm run build

# 3. Deploy to test vault
cp dist/main.js dist/manifest.json dist/styles.css ../../testvault/.obsidian/plugins/opencodian/
```
```

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: add release and BUILD_ID documentation"
```

---

## Task 8: Integration test and final verification

**Files:**
- None (verification only)

- [ ] **Step 1: Run full build**

Run: `cd c:/Users/lt/Desktop/Write/custom-project/opencodian && npm run build`
Expected: See `[build] BUILD_ID: <branch>.<timestamp>` in output

- [ ] **Step 2: Verify package.json unchanged by build**

Run: `cd c:/Users/lt/Desktop/Write/custom-project/opencodian && git diff package.json`
Expected: No changes (build should not modify version)

- [ ] **Step 3: Test release script**

Run: `cd c:/Users/lt/Desktop/Write/custom-project/opencodian && npm run release:patch`
Expected: Version bumped in package.json, package-lock.json, manifest.json

- [ ] **Step 4: Verify manifest.json synced**

Run: `cd c:/Users/lt/Desktop/Write/custom-project/opencodian && cat manifest.json | grep version`
Expected: Same version as package.json

- [ ] **Step 5: Run tests**

Run: `cd c:/Users/lt/Desktop/Write/custom-project/opencodian && npm run test`
Expected: All tests pass

- [ ] **Step 6: Run typecheck**

Run: `cd c:/Users/lt/Desktop/Write/custom-project/opencodian && npm run typecheck`
Expected: No errors

- [ ] **Step 7: Run lint**

Run: `cd c:/Users/lt/Desktop/Write/custom-project/opencodian && npm run lint`
Expected: No errors

- [ ] **Step 8: Deploy and test in Obsidian**

Run: `cd c:/Users/lt/Desktop/Write/custom-project/opencodian && cp dist/main.js dist/manifest.json dist/styles.css "C:/Users/lt/Desktop/Write/testvault/.obsidian/plugins/opencodian/"`

Then open Obsidian, open Developer Console (Ctrl+Shift+I), and verify:
- Console shows `[OpenCodian] OpenCodian BUILD_ID: <branch>.<timestamp>`

- [ ] **Step 9: Final commit (if any fixes needed)**

```bash
git status
# If clean, no commit needed
```

---

## Summary

| Task | Files | Commits |
|------|-------|---------|
| 1. Logger info | `src/shared/logger.ts` | 1 |
| 2. build-utils | `scripts/build-utils.mjs` | 1 |
| 3. Production build | `scripts/build.mjs` | 1 |
| 4. Dev build | `esbuild.config.mjs` | 1 |
| 5. Release script | `scripts/release.mjs`, `package.json` | 1 |
| 6. BUILD_ID output | `src/main.ts` | 1 |
| 7. Documentation | `AGENTS.md` | 1 |
| 8. Integration test | - | 0-1 |

**Total: 7-8 commits**
