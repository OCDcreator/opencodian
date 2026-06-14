#!/usr/bin/env node
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Codex SDK Smoke Harness — Checkpoint 1
 *
 * Verifies the real API surface of @openai/codex-sdk without requiring
 * an API key. Captures:
 *   - All exported symbols and their types
 *   - Constructor / method / property signatures
 *   - Thread lifecycle API shape
 *   - CLI binary availability and size
 *   - Error pattern when calling without API key
 *
 * Usage:
 *   node scripts/codex-sdk-smoke.mjs
 *
 * Exit codes:
 *   0  — all structural checks passed (API shape verified)
 *   1  — structural check failed (SDK broken or API changed)
 */

import { existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passCount = 0;
let failCount = 0;
let infoLines = [];

function pass(msg) {
  passCount++;
  console.log(`  ✓ ${msg}`);
}

function fail(msg) {
  failCount++;
  console.log(`  ✗ ${msg}`);
}

function info(msg) {
  infoLines.push(msg);
  console.log(`  ℹ ${msg}`);
}

function section(title) {
  console.log(`\n## ${title}`);
}

// ---------------------------------------------------------------------------
// 1. Package metadata
// ---------------------------------------------------------------------------

section('Package Metadata');

const sdkPkgPath = join(rootDir, 'node_modules', '@openai', 'codex-sdk', 'package.json');
if (existsSync(sdkPkgPath)) {
  const pkg = JSON.parse(require('fs').readFileSync(sdkPkgPath, 'utf8'));
  pass(`@openai/codex-sdk installed: v${pkg.version}`);
  info(`type: ${pkg.type}`);
  info(`exports: ${JSON.stringify(pkg.exports)}`);
  info(`engines: ${JSON.stringify(pkg.engines)}`);
  info(`dependency @openai/codex: ${pkg.dependencies?.['@openai/codex'] ?? 'none'}`);
} else {
  fail('@openai/codex-sdk package.json not found');
}

// ---------------------------------------------------------------------------
// 2. ESM import
// ---------------------------------------------------------------------------

section('ESM Import');

let Codex, Thread;
let allExports;

try {
  const sdk = await import('@openai/codex-sdk');
  allExports = Object.keys(sdk);
  pass(`SDK imported successfully, ${allExports.length} exports`);
  info(`exports: ${allExports.join(', ')}`);

  if (sdk.Codex) {
    Codex = sdk.Codex;
    pass('Codex class exported');
  } else {
    fail('Codex class NOT exported');
  }

  // Thread is a type-only export — check if it exists in the module
  // Types are erased at runtime, but we can check the constructor return
} catch (err) {
  fail(`SDK import failed: ${err.message}`);
}

// ---------------------------------------------------------------------------
// 3. Codex class API shape
// ---------------------------------------------------------------------------

section('Codex Class API Shape');

if (Codex) {
  // Constructor
  try {
    const codex = new Codex();
    pass('new Codex() instantiated without arguments');
  } catch (err) {
    fail(`new Codex() failed: ${err.message}`);
  }

  // Constructor with options
  try {
    const codex = new Codex({
      codexPathOverride: '/nonexistent/codex',
      apiKey: 'sk-test-fake',
      baseUrl: 'https://example.com',
      config: { test: 'value' },
      env: { TEST_VAR: 'test' },
    });
    pass('new Codex(options) accepted all CodexOptions fields');
  } catch (err) {
    fail(`new Codex(options) failed: ${err.message}`);
  }

  // Method existence
  const proto = Codex.prototype;
  const expectedMethods = ['startThread', 'resumeThread'];
  for (const method of expectedMethods) {
    if (typeof proto[method] === 'function') {
      pass(`Codex.${method}() exists (typeof: function)`);
    } else {
      fail(`Codex.${method}() NOT found`);
    }
  }

  // Check method signatures (parameter count from toString)
  for (const method of expectedMethods) {
    const fn = proto[method];
    const str = fn.toString();
    info(`Codex.${method} signature: ${str.slice(0, 120)}`);
  }
} else {
  fail('Codex class not available — skipping API shape checks');
}

// ---------------------------------------------------------------------------
// 4. Thread lifecycle API shape
// ---------------------------------------------------------------------------

section('Thread Lifecycle API Shape');

if (Codex) {
  try {
    const codex = new Codex({ apiKey: 'sk-test-fake' });
    const thread = codex.startThread();
    pass('codex.startThread() returns an object');

    // Thread.id
    const threadId = thread.id;
    pass(`thread.id exists: ${JSON.stringify(threadId)} (type: ${typeof threadId})`);

    // Thread.run
    if (typeof thread.run === 'function') {
      pass('thread.run() exists (typeof: function)');
      info(`thread.run signature: ${thread.run.toString().slice(0, 120)}`);
    } else {
      fail('thread.run() NOT found');
    }

    // Thread.runStreamed
    if (typeof thread.runStreamed === 'function') {
      pass('thread.runStreamed() exists (typeof: function)');
      info(`thread.runStreamed signature: ${thread.runStreamed.toString().slice(0, 120)}`);
    } else {
      fail('thread.runStreamed() NOT found');
    }

    // Thread own property names
    const ownProps = Object.getOwnPropertyNames(Object.getPrototypeOf(thread));
    info(`Thread prototype methods: ${ownProps.join(', ')}`);
  } catch (err) {
    fail(`startThread() failed: ${err.message}`);
  }

  // resumeThread
  try {
    const codex = new Codex({ apiKey: 'sk-test-fake' });
    const thread = codex.resumeThread('fake-thread-id-123');
    pass('codex.resumeThread("fake-thread-id-123") returns an object');
    info(`resumed thread.id: ${JSON.stringify(thread.id)}`);
  } catch (err) {
    fail(`resumeThread() failed: ${err.message}`);
  }

  // ThreadOptions — check via type-level (constructor doesn't validate)
  info('ThreadOptions fields (from .d.ts): model, sandboxMode, workingDirectory, skipGitRepoCheck, modelReasoningEffort, networkAccessEnabled, webSearchMode, webSearchEnabled, approvalPolicy, additionalDirectories');

  // StartThread with all ThreadOptions
  try {
    const codex = new Codex({ apiKey: 'sk-test-fake' });
    const thread = codex.startThread({
      model: 'test-model',
      sandboxMode: 'read-only',
      workingDirectory: '/tmp',
      skipGitRepoCheck: true,
      modelReasoningEffort: 'medium',
      networkAccessEnabled: false,
      webSearchMode: 'disabled',
      webSearchEnabled: false,
      approvalPolicy: 'on-request',
      additionalDirectories: ['/extra'],
    });
    pass('startThread(all ThreadOptions) accepted without error');
  } catch (err) {
    fail(`startThread(all options) failed: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// 5. Type-level verification (from .d.ts analysis)
// ---------------------------------------------------------------------------

section('Type-Level Verification (from .d.ts)');

const dtsPath = join(rootDir, 'node_modules', '@openai', 'codex-sdk', 'dist', 'index.d.ts');
if (existsSync(dtsPath)) {
  const dts = require('fs').readFileSync(dtsPath, 'utf8');

  // ApprovalMode values
  const approvalMatch = dts.match(/type ApprovalMode = ([^;]+)/);
  if (approvalMatch) {
    pass(`ApprovalMode: ${approvalMatch[1]}`);
    info('OLD DOC had: full-auto | auto-edit | suggest — COMPLETELY DIFFERENT from actual SDK');
  } else {
    fail('ApprovalMode not found in .d.ts');
  }

  // SandboxMode values
  const sandboxMatch = dts.match(/type SandboxMode = ([^;]+)/);
  if (sandboxMatch) {
    pass(`SandboxMode: ${sandboxMatch[1]}`);
  } else {
    fail('SandboxMode not found in .d.ts');
  }

  // ModelReasoningEffort values
  const effortMatch = dts.match(/type ModelReasoningEffort = ([^;]+)/);
  if (effortMatch) {
    pass(`ModelReasoningEffort: ${effortMatch[1]}`);
  } else {
    fail('ModelReasoningEffort not found in .d.ts');
  }

  // WebSearchMode values
  const webSearchMatch = dts.match(/type WebSearchMode = ([^;]+)/);
  if (webSearchMatch) {
    pass(`WebSearchMode: ${webSearchMatch[1]}`);
  } else {
    fail('WebSearchMode not found in .d.ts');
  }

  // ThreadItem union
  const threadItemMatch = dts.match(/type ThreadItem = ([^;]+)/);
  if (threadItemMatch) {
    pass(`ThreadItem types: ${threadItemMatch[1]}`);
  }

  // ThreadEvent union
  const threadEventMatch = dts.match(/type ThreadEvent = ([^;]+)/);
  if (threadEventMatch) {
    pass(`ThreadEvent types: ${threadEventMatch[1]}`);
  }

  // Check key types exist
  const keyTypes = [
    'Codex', 'Thread', 'ThreadOptions', 'CodexOptions',
    'Turn', 'RunResult', 'StreamedTurn', 'RunStreamedResult',
    'TurnOptions', 'Usage', 'Input', 'UserInput',
    'ApprovalMode', 'SandboxMode', 'ModelReasoningEffort',
    'AgentMessageItem', 'ReasoningItem', 'CommandExecutionItem',
    'FileChangeItem', 'McpToolCallItem', 'TodoListItem',
    'ErrorItem', 'WebSearchItem',
  ];
  for (const t of keyTypes) {
    if (dts.includes(`type ${t}`) || dts.includes(`declare class ${t}`)) {
      pass(`Type/class '${t}' found in .d.ts`);
    } else {
      // Some types are just exported aliases, check in export statement
      if (dts.includes(t)) {
        pass(`Type '${t}' referenced in .d.ts (exported or aliased)`);
      } else {
        fail(`Type '${t}' NOT found in .d.ts`);
      }
    }
  }
} else {
  fail('index.d.ts not found');
}

// ---------------------------------------------------------------------------
// 6. CLI binary availability
// ---------------------------------------------------------------------------

section('CLI Binary Availability');

const platformPkg = `@openai/codex-darwin-arm64`;
const platformPkgPath = join(rootDir, 'node_modules', platformPkg);
const binaryBasePath = join(rootDir, 'node_modules', platformPkg, 'vendor', 'aarch64-apple-darwin');

if (existsSync(platformPkgPath)) {
  pass(`${platformPkg} installed`);

  const binaryPath = join(binaryBasePath, 'bin', 'codex');
  if (existsSync(binaryPath)) {
    const stat = statSync(binaryPath);
    pass(`Codex binary exists: ${binaryPath}`);
    info(`Binary size: ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
    info(`Executable: ${!(stat.mode & 0o111) ? 'NO' : 'yes'}`);
  } else {
    fail(`Codex binary NOT found at ${binaryPath}`);
  }
} else {
  fail(`${platformPkg} NOT installed`);
}

// Also check the bin entry from @openai/codex
const codexMainPkgPath = join(rootDir, 'node_modules', '@openai', 'codex', 'package.json');
if (existsSync(codexMainPkgPath)) {
  const codexPkg = JSON.parse(require('fs').readFileSync(codexMainPkgPath, 'utf8'));
  info(`@openai/codex bin: ${JSON.stringify(codexPkg.bin)}`);

  const binPath = join(rootDir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
  if (existsSync(binPath)) {
    pass(`@openai/codex bin/codex.js wrapper exists`);
  } else {
    fail(`@openai/codex bin/codex.js NOT found`);
  }
}

// ---------------------------------------------------------------------------
// 7. Live API call attempt (expected to fail without key)
// ---------------------------------------------------------------------------

section('Live API Call Attempt (expected to fail)');

if (Codex) {
  try {
    const codex = new Codex({ apiKey: 'sk-test-fake-key-for-smoke' });
    const thread = codex.startThread({ model: 'codex-mini' });
    info('Attempting thread.run() with fake API key...');

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), 15000)
    );

    try {
      const result = await Promise.race([thread.run('Say hello'), timeoutPromise]);
      pass('thread.run() returned a result (UNEXPECTED with fake key!)');
      info(`Result shape: ${JSON.stringify(Object.keys(result))}`);
      info(`finalResponse: ${result.finalResponse?.slice(0, 100)}`);
      info(`usage: ${JSON.stringify(result.usage)}`);
      info(`items count: ${result.items?.length}`);
      for (const item of result.items?.slice(0, 5) ?? []) {
        info(`  item: type=${item.type}, id=${item.id}`);
      }
    } catch (callErr) {
      // Expected to fail — capture the error pattern
      info(`thread.run() error (expected): ${callErr.message}`);
      info(`Error constructor: ${callErr.constructor?.name}`);

      // Check if the error is about API key or CLI binary
      if (callErr.message.includes('API key') || callErr.message.includes('api_key') || callErr.message.includes('401') || callErr.message.includes('auth')) {
        pass('Error is auth-related — SDK→CLI→API path is structurally working');
      } else if (callErr.message.includes('TIMEOUT')) {
        info('Call timed out — CLI binary likely spawned but waiting for auth');
      } else {
        info('Error pattern captured (see above) — may indicate CLI spawn or transport issue');
      }
    }
  } catch (err) {
    fail(`Setup for live call failed: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// 8. Stream API shape verification
// ---------------------------------------------------------------------------

section('Stream API Shape Verification');

if (Codex) {
  try {
    const codex = new Codex({ apiKey: 'sk-test-fake-key-for-smoke' });
    const thread = codex.startThread({ model: 'codex-mini' });

    info('Attempting thread.runStreamed() with fake API key...');
    try {
      const streamedResult = await Promise.race([
        thread.runStreamed('Say hello'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 10000)),
      ]);

      pass('thread.runStreamed() returned without immediate error');
      info(`StreamedTurn keys: ${JSON.stringify(Object.keys(streamedResult))}`);

      if (streamedResult.events) {
        pass('streamedResult.events exists');
        info(`events type: ${typeof streamedResult.events}`);
        info(`events[Symbol.asyncIterator]: ${!!streamedResult.events[Symbol.asyncIterator]}`);

        // Try to consume one event
        try {
          const firstEvent = await Promise.race([
            streamedResult.events.next(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 10000)),
          ]);
          info(`First event: ${JSON.stringify(firstEvent)?.slice(0, 200)}`);
        } catch (eventErr) {
          info(`First event error (expected without valid key): ${eventErr.message}`);
        }
      } else {
        fail('streamedResult.events NOT found');
      }
    } catch (streamErr) {
      info(`thread.runStreamed() error: ${streamErr.message}`);
    }
  } catch (err) {
    fail(`Stream API setup failed: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

section('Summary');

console.log(`\n  Passed: ${passCount}`);
console.log(`  Failed: ${failCount}`);
console.log(`  Info:   ${infoLines.length}`);

if (failCount === 0) {
  console.log('\n  ✅ All structural checks PASSED. SDK API shape verified.');
  console.log('  Note: Live API calls were NOT verified (no valid API key).');
} else {
  console.log('\n  ❌ Some structural checks FAILED. See above for details.');
}

process.exit(failCount > 0 ? 1 : 0);
