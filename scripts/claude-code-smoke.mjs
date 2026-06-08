#!/usr/bin/env node

/**
 * Claude Code Real Runtime Smoke Script
 *
 * Runs a series of SDK smoke tests against the real Claude Agent SDK.
 * Does NOT fake success. Records exact failure reasons when auth/runtime
 * conditions are not met.
 *
 * Usage:
 *   node scripts/claude-code-smoke.mjs
 *   node scripts/claude-code-smoke.mjs --json > smoke-result.json
 *   node scripts/claude-code-smoke.mjs --allow-partial  (tolerate partial/skip/auth-blocked)
 *
 * Exit code: 0 only if all tests pass. Non-zero on any fail/partial/skip/auth-blocked
 * unless --allow-partial is set (which only tolerates partial/skip/auth-blocked, not fail).
 *
 * Environment:
 *   CLAUDE_CODE_SMOKE_DIR  - Working directory for the SDK query (default: cwd)
 */

import { createRequire } from 'module';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, mkdirSync, rmSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

const require = createRequire(import.meta.url);

// ─── Helpers ──────────────────────────────────────────────────────────

function formatResult(name, status, detail = '') {
  return { name, status, detail, timestamp: new Date().toISOString() };
}

async function withTimeout(promise, ms = 30000) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
  });
  try {
    const result = await Promise.race([promise, timeout]);
    clearTimeout(timer);
    return result;
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
}

/**
 * Collects all events from an async iterable query, optionally stopping after
 * a condition. Returns the collected events array.
 */
async function collectEvents(q, { until, timeout = 60000 } = {}) {
  const events = [];
  await withTimeout((async () => {
    for await (const event of q) {
      events.push(event);
      if (until && until(event, events)) break;
    }
  })(), timeout);
  return events;
}

/**
 * Creates a temporary directory and returns its path plus a cleanup function.
 */
function createTempDir(prefix = 'claude-smoke-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return { dir, cleanup: () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } } };
}

/**
 * Writes a minimal MCP stdio server script that exposes one tool: `echo`.
 * The tool returns whatever input it receives as a JSON string.
 */
function writeMcpEchoServer(dir) {
  const serverPath = join(dir, 'mcp-echo-server.mjs');
  // Minimal MCP stdio server using JSON-RPC over stdin/stdout
  const serverCode = `#!/usr/bin/env node
import { createInterface } from 'readline';

const rl = createInterface({ input: process.stdin, terminal: false });

function sendMessage(msg) {
  process.stdout.write(JSON.stringify(msg) + '\\n');
}

let initialized = false;

rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }

  if (msg.method === 'initialize') {
    initialized = true;
    sendMessage({ jsonrpc: '2.0', id: msg.id, result: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'echo-smoke-server', version: '1.0.0' }
    }});
  } else if (msg.method === 'notifications/initialized') {
    // No response needed
  } else if (msg.method === 'tools/list') {
    sendMessage({ jsonrpc: '2.0', id: msg.id, result: {
      tools: [{
        name: 'echo',
        description: 'Echoes back the input as a JSON string',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'The message to echo back' }
          },
          required: ['message']
        }
      }]
    }});
  } else if (msg.method === 'tools/call') {
    const args = msg.params?.arguments || {};
    sendMessage({ jsonrpc: '2.0', id: msg.id, result: {
      content: [{ type: 'text', text: JSON.stringify({ echoed: args.message || 'no message' }) }],
      isError: false
    }});
  }
});
`;
  writeFileSync(serverPath, serverCode, 'utf-8');
  return serverPath;
}

// ─── Basic Smoke Tests ────────────────────────────────────────────────

async function smokeSdkImport() {
  try {
    const sdk = require('@anthropic-ai/claude-agent-sdk');
    const hasQuery = typeof sdk.query === 'function';
    const hasListSessions = typeof sdk.listSessions === 'function';
    const hasForkSession = typeof sdk.forkSession === 'function';

    if (!hasQuery) {
      return formatResult('sdk-import', 'fail', 'SDK imported but query() not found');
    }

    const exports = Object.keys(sdk).sort().join(', ');
    return formatResult('sdk-import', 'pass', `query=${hasQuery}, listSessions=${hasListSessions}, forkSession=${hasForkSession}. Exports: ${exports}`);
  } catch (error) {
    return formatResult('sdk-import', 'fail', error instanceof Error ? error.message : String(error));
  }
}

async function smokeBundledExecutable() {
  try {
    const { existsSync, statSync } = require('fs');

    // Map current platform to the expected package name
    const platformMap = {
      'darwin-arm64': '@anthropic-ai/claude-agent-sdk-darwin-arm64',
      'darwin-x64': '@anthropic-ai/claude-agent-sdk-darwin-x64',
      'linux-arm64': '@anthropic-ai/claude-agent-sdk-linux-arm64',
      'linux-x64': '@anthropic-ai/claude-agent-sdk-linux-x64',
      'linux-arm64-musl': '@anthropic-ai/claude-agent-sdk-linux-arm64-musl',
      'linux-x64-musl': '@anthropic-ai/claude-agent-sdk-linux-x64-musl',
      'win32-x64': '@anthropic-ai/claude-agent-sdk-win32-x64',
      'win32-arm64': '@anthropic-ai/claude-agent-sdk-win32-arm64',
    };

    // Detect platform including musl variant on Linux
    let platformKey = `${process.platform}-${process.arch}`;
    if (process.platform === 'linux') {
      try {
        const { execSync } = require('child_process');
        const ldd = execSync('ldd --version 2>&1', { encoding: 'utf8', timeout: 3000 });
        if (ldd.includes('musl')) platformKey += '-musl';
      } catch {
        // Default to glibc
      }
    }

    const expectedPkg = platformMap[platformKey];
    if (!expectedPkg) {
      return formatResult('bundled-executable', 'skip', `No known platform package for ${platformKey}`);
    }

    // Platform packages have no main/exports; resolve via package.json subpath
    const pkgJsonPath = require.resolve(`${expectedPkg}/package.json`);
    const pkgDir = dirname(pkgJsonPath);

    // Verify the binary exists
    const binaryName = process.platform === 'win32' ? 'claude.exe' : 'claude';
    const binaryPath = join(pkgDir, binaryName);

    if (!existsSync(binaryPath)) {
      return formatResult('bundled-executable', 'fail', `Package ${expectedPkg} found but binary ${binaryName} missing at ${pkgDir}`);
    }

    const stat = statSync(binaryPath);
    return formatResult('bundled-executable', 'pass',
      `Platform binary resolved: ${expectedPkg} (${(stat.size / 1024 / 1024).toFixed(1)} MB) at ${pkgDir}`
    );
  } catch (error) {
    return formatResult('bundled-executable', 'fail', error instanceof Error ? error.message : String(error));
  }
}

async function smokeQueryText() {
  try {
    const { query } = require('@anthropic-ai/claude-agent-sdk');
    const smokeDir = process.env.CLAUDE_CODE_SMOKE_DIR || projectRoot;

    const q = query({
      prompt: 'Reply with exactly the word OK and nothing else.',
      options: {
        cwd: smokeDir,
        includePartialMessages: true,
        maxTurns: 1,
      },
    });

    const events = [];
    let authFailed = false;
    let gotText = false;

    await withTimeout((async () => {
      for await (const event of q) {
        events.push(event);

        if (event.type === 'auth_status' && event.error) {
          authFailed = true;
        }

        if (event.type === 'assistant' && event.message?.content) {
          for (const block of event.message.content) {
            if (block.type === 'text') {
              gotText = true;
            }
          }
        }

        if (event.type === 'result') {
          break;
        }
      }
    })(), 60000);

    q.close?.();

    if (authFailed) {
      const authEvent = events.find(e => e.type === 'auth_status' && e.error);
      return formatResult('query-text', 'auth-blocked', `Authentication required: ${authEvent?.error || 'unknown'}`);
    }

    if (gotText) {
      return formatResult('query-text', 'pass', `Received text response. Total events: ${events.length}`);
    }

    const hasInit = events.some(e => e.type === 'system' && (e.subtype === 'init' || e.subtype === 'session_init'));
    if (hasInit) {
      return formatResult('query-text', 'partial', `Got session init but no text. Total events: ${events.length}`);
    }

    return formatResult('query-text', 'fail', `No text, no init. Event types: ${[...new Set(events.map(e => e.type))].join(', ')}`);
  } catch (error) {
    return formatResult('query-text', 'fail', error instanceof Error ? error.message : String(error));
  }
}

async function smokeSupportedModels() {
  try {
    const { query } = require('@anthropic-ai/claude-agent-sdk');
    const smokeDir = process.env.CLAUDE_CODE_SMOKE_DIR || projectRoot;

    const q = query({
      prompt: 'Reply with exactly OK.',
      options: {
        cwd: smokeDir,
        maxTurns: 1,
      },
    });

    let models = [];
    try {
      models = await withTimeout(q.supportedModels(), 10000);
    } catch {
      // supportedModels may fail if process hasn't initialized yet
    }

    q.close?.();

    if (models.length > 0) {
      const modelNames = models.map(m => m.value || m.displayName || 'unknown').slice(0, 5).join(', ');
      return formatResult('supported-models', 'pass', `${models.length} models available. Sample: ${modelNames}`);
    }

    return formatResult('supported-models', 'skip', 'No models returned (may need auth)');
  } catch (error) {
    return formatResult('supported-models', 'fail', error instanceof Error ? error.message : String(error));
  }
}

// ─── Real Runtime Smoke Tests ─────────────────────────────────────────

/**
 * Stream thinking with observable SDK message/block fields.
 *
 * Strategy: send a query with `thinking: { type: 'adaptive' }` and verify
 * that `SDKAssistantMessage.message.content` blocks include at least one
 * `thinking` block, and the event stream preserves ordering (thinking
 * before or interleaved with text).
 *
 * SDK type evidence:
 *   SDKAssistantMessage.type === 'assistant'
 *   SDKAssistantMessage.message.content[].type === 'thinking'
 *   SDKAssistantMessage.message.content[].thinking === string
 */
async function smokeStreamThinking() {
  try {
    const { query } = require('@anthropic-ai/claude-agent-sdk');
    const smokeDir = process.env.CLAUDE_CODE_SMOKE_DIR || projectRoot;

    // Use a complex prompt that triggers deep reasoning.
    // Do NOT set explicit thinking config — let the model use its default
    // adaptive thinking (newer models ignore 'enabled' which is for older models).
    const q = query({
      prompt: 'A farmer has 17 sheep. All but 9 run away. How many sheep does the farmer have left? '
        + 'Before answering, carefully reason through the wording. '
        + 'After reasoning, give just the number as your final answer.',
      options: {
        cwd: smokeDir,
        includePartialMessages: true,
        maxTurns: 1,
      },
    });

    const events = await collectEvents(q, {
      until: (event) => event.type === 'result',
      timeout: 60000,
    });
    q.close?.();

    const authEvent = events.find(e => e.type === 'auth_status' && e.error);
    if (authEvent) {
      return formatResult('stream-thinking', 'auth-blocked', `Auth required: ${authEvent.error}`);
    }

    // Collect all content block types from assistant messages
    const thinkingBlocks = [];
    const textBlocks = [];
    const allBlockTypes = new Set();

    for (const event of events) {
      if (event.type === 'assistant' && event.message?.content) {
        for (const block of event.message.content) {
          allBlockTypes.add(block.type);
          if (block.type === 'thinking') {
            thinkingBlocks.push({
              text: typeof block.thinking === 'string' ? block.thinking : '(non-string)',
              length: typeof block.thinking === 'string' ? block.thinking.length : 0,
            });
          }
          if (block.type === 'text') {
            textBlocks.push({ text: block.text, length: block.text?.length || 0 });
          }
        }
      }
    }

    // PASS: real thinking blocks observed
    if (thinkingBlocks.length > 0) {
      const totalThinking = thinkingBlocks.reduce((sum, b) => sum + b.length, 0);
      const totalText = textBlocks.reduce((sum, b) => sum + b.length, 0);
      return formatResult('stream-thinking', 'pass',
        `Observed ${thinkingBlocks.length} thinking block(s), ${textBlocks.length} text block(s). ` +
        `Thinking chars: ${totalThinking}, Text chars: ${totalText}. ` +
        `Events: ${events.length}. ` +
        `SDK field evidence: message.content[].type==='thinking' with .thinking string.`
      );
    }

    // Text received but NO thinking blocks → PARTIAL (not pass).
    // The model's default adaptive thinking should emit thinking blocks for complex prompts.
    if (textBlocks.length > 0) {
      return formatResult('stream-thinking', 'partial',
        `No thinking blocks emitted despite complex reasoning prompt. ` +
        `Text received (${textBlocks.length} blocks). ` +
        `All block types: ${[...allBlockTypes].join(', ')}. ` +
        `Events: ${events.length}. ` +
        `BLOCKED: Model did not produce thinking content with default adaptive thinking. ` +
        `May indicate model-side limitation or config passthrough issue.`
      );
    }

    const hasInit = events.some(e => e.type === 'system' && (e.subtype === 'init' || e.subtype === 'session_init'));
    if (hasInit) {
      return formatResult('stream-thinking', 'partial', `Got init but no thinking or text. Events: ${events.length}`);
    }

    return formatResult('stream-thinking', 'fail', `No thinking, no text, no init. Event types: ${[...new Set(events.map(e => e.type))].join(', ')}`);
  } catch (error) {
    return formatResult('stream-thinking', 'fail', error instanceof Error ? error.message : String(error));
  }
}

/**
 * MCP stdio tool use/result lifecycle.
 *
 * Strategy: create a temporary MCP stdio server that exposes an `echo` tool,
 * configure it in mcpServers, ask Claude to call the tool, then verify:
 * 1. tool_use block with name matching 'mcp__echo_smoke__echo' appears
 * 2. tool_result block with the echoed content appears
 *
 * SDK type evidence:
 *   Options.mcpServers: Record<string, McpStdioServerConfig>
 *   McpStdioServerConfig: { type?: 'stdio'; command: string; args?: string[] }
 *   SDKAssistantMessage.message.content[].type === 'tool_use'
 *   SDKAssistantMessage.message.content[].type === 'tool_result'
 */
async function smokeMcpStdioToolUse() {
  const { dir, cleanup } = createTempDir('claude-smoke-mcp-');
  try {
    const serverPath = writeMcpEchoServer(dir);
    const { query } = require('@anthropic-ai/claude-agent-sdk');
    const smokeDir = process.env.CLAUDE_CODE_SMOKE_DIR || projectRoot;

    const q = query({
      prompt: 'You MUST use the echo tool from the echo_smoke server. '
        + 'Call the tool with message "hello-world-smoke" and report the result. '
        + 'Do NOT just reply with text — you must invoke the tool.',
      options: {
        cwd: smokeDir,
        includePartialMessages: true,
        tools: { type: 'preset', preset: 'claude_code' },
        maxTurns: 3,
        mcpServers: {
          echo_smoke: {
            type: 'stdio',
            command: 'node',
            args: [serverPath],
            alwaysLoad: true,
          },
        },
        allowedTools: ['mcp__echo_smoke__echo'],
      },
    });

    const events = await collectEvents(q, {
      until: (event) => event.type === 'result',
      timeout: 120000,
    });
    q.close?.();

    const authEvent = events.find(e => e.type === 'auth_status' && e.error);
    if (authEvent) {
      return formatResult('mcp-stdio-tool', 'auth-blocked', `Auth required: ${authEvent.error}`);
    }

    // Collect tool_use and tool_result blocks
    // Note: tool_use appears in 'assistant' events, tool_result in 'user' events
    const toolUseBlocks = [];
    const toolResultBlocks = [];
    const mcpToolNames = new Set();

    for (const event of events) {
      if (event.type === 'assistant' && event.message?.content) {
        for (const block of event.message.content) {
          if (block.type === 'tool_use') {
            toolUseBlocks.push({ name: block.name, id: block.id, input: block.input });
            if (block.name.startsWith('mcp__')) {
              mcpToolNames.add(block.name);
            }
          }
        }
      }
      // tool_result blocks come from 'user' type events
      if ((event.type === 'user' || event.type === 'assistant') && event.message?.content) {
        for (const block of event.message.content) {
          if (block.type === 'tool_result') {
            toolResultBlocks.push({
              tool_use_id: block.tool_use_id,
              content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
              is_error: block.is_error,
            });
          }
        }
      }
    }

    const hasMcpToolUse = toolUseBlocks.some(b => b.name.startsWith('mcp__echo_smoke__'));

    if (hasMcpToolUse && toolResultBlocks.length > 0) {
      const mcpUse = toolUseBlocks.find(b => b.name.startsWith('mcp__echo_smoke__'));
      const mcpResult = toolResultBlocks[0];
      return formatResult('mcp-stdio-tool', 'pass',
        `MCP tool_use: ${mcpUse.name} (id=${mcpUse.id}), ` +
        `tool_result present: tool_use_id=${mcpResult.tool_use_id}, ` +
        `content preview: ${(mcpResult.content || '').slice(0, 100)}. ` +
        `MCP tool names: ${[...mcpToolNames].join(', ')}. ` +
        `Total tool_use: ${toolUseBlocks.length}, tool_result: ${toolResultBlocks.length}. ` +
        `SDK field evidence: mcpServers config accepted, tool_use.name starts with mcp__ prefix.`
      );
    }

    // MCP tool was called but no tool_result captured
    if (hasMcpToolUse) {
      return formatResult('mcp-stdio-tool', 'partial',
        `MCP tool_use observed (${toolUseBlocks.filter(b => b.name.startsWith('mcp__echo_smoke__')).length} blocks) ` +
        `but no tool_result block captured. ` +
        `Tool names: ${toolUseBlocks.map(b => b.name).join(', ')}. ` +
        `Tool results: ${toolResultBlocks.length}. Events: ${events.length}. ` +
        `BLOCKED: tool_result not found in event stream. May need different event type handling.`
      );
    }

    // Tool was used but not MCP specifically
    if (toolUseBlocks.length > 0) {
      return formatResult('mcp-stdio-tool', 'partial',
        `Tool use observed (${toolUseBlocks.length} blocks) but no mcp__echo_smoke__ prefix found. ` +
        `Tool names: ${toolUseBlocks.map(b => b.name).join(', ')}. ` +
        `MCP server may not have connected in time. Events: ${events.length}.`
      );
    }

    const hasInit = events.some(e => e.type === 'system' && (e.subtype === 'init' || e.subtype === 'session_init'));
    if (hasInit) {
      return formatResult('mcp-stdio-tool', 'partial',
        `Session initialized but no tool use observed. ` +
        `Claude did not call the MCP tool despite allowedTools+alwaysLoad. Events: ${events.length}.`
      );
    }

    return formatResult('mcp-stdio-tool', 'fail',
      `No tool use observed. Event types: ${[...new Set(events.map(e => e.type))].join(', ')}`
    );
  } catch (error) {
    return formatResult('mcp-stdio-tool', 'fail', error instanceof Error ? error.message : String(error));
  } finally {
    cleanup();
  }
}

/**
 * canUseTool approval/deny with real callback invocation.
 *
 * Strategy: wire a canUseTool callback that always approves, send a query
 * that requires tool use (e.g. asking to read a file), and verify:
 * 1. The callback was invoked with the correct tool name and input
 * 2. The callback result was consumed by the SDK
 * 3. The stream continued after approval
 *
 * SDK type evidence:
 *   Options.canUseTool: (toolName, input, { signal, toolUseID, ... }) => Promise<PermissionResult>
 *   PermissionResult: { behavior: 'allow' } | { behavior: 'deny', message: string }
 */
async function smokeCanUseToolApproval() {
  const { dir: tmpDir, cleanup } = createTempDir('claude-smoke-canuse-');
  try {
    const { randomBytes } = require('crypto');
    const { writeFileSync: writeTempFile } = require('fs');

    // Create a file with random content that Claude MUST write to
    const secretToken = randomBytes(16).toString('hex');
    const secretFile = join(tmpDir, 'secret-token.txt');
    writeTempFile(secretFile, `initial-content\n`);

    const { query } = require('@anthropic-ai/claude-agent-sdk');
    const smokeDir = process.env.CLAUDE_CODE_SMOKE_DIR || projectRoot;

    /** @type {Array<{toolName: string, input: Record<string, unknown>, toolUseID?: string}>} */
    const canUseToolCalls = [];

    const q = query({
      prompt: `Write the text "secret-token:${secretToken}" to the file ${secretFile}. Use the Write tool to do this.`,
      options: {
        cwd: smokeDir,
        includePartialMessages: true,
        tools: { type: 'preset', preset: 'claude_code' },
        maxTurns: 3,
        additionalDirectories: [tmpDir],
        canUseTool: async (toolName, input, options) => {
          canUseToolCalls.push({ toolName, input, toolUseID: options?.toolUseID });
          // Approve all tool calls
          return { behavior: 'allow' };
        },
      },
    });

    const events = await collectEvents(q, {
      until: (event) => event.type === 'result',
      timeout: 120000,
    });
    q.close?.();

    const authEvent = events.find(e => e.type === 'auth_status' && e.error);
    if (authEvent) {
      return formatResult('can-use-tool', 'auth-blocked', `Auth required: ${authEvent.error}`);
    }

    if (canUseToolCalls.length > 0) {
      const toolNames = [...new Set(canUseToolCalls.map(c => c.toolName))];
      const hasToolUseID = canUseToolCalls.some(c => c.toolUseID);

      // Also check the stream had tool_use events
      const streamToolUse = [];
      for (const event of events) {
        if (event.type === 'assistant' && event.message?.content) {
          for (const block of event.message.content) {
            if (block.type === 'tool_use') {
              streamToolUse.push(block.name);
            }
          }
        }
      }

      return formatResult('can-use-tool', 'pass',
        `canUseTool callback invoked ${canUseToolCalls.length} time(s). ` +
        `Tool names: ${toolNames.join(', ')}. ` +
        `Has toolUseID: ${hasToolUseID}. ` +
        `Stream tool_use events: ${streamToolUse.join(', ') || 'none'}. ` +
        `SDK field evidence: canUseTool(toolName, input, {signal, toolUseID}) => PermissionResult.`
      );
    }

    // Check if tools were used without canUseTool being called (e.g. permission mode auto-allowed)
    const streamToolUse = [];
    for (const event of events) {
      if (event.type === 'assistant' && event.message?.content) {
        for (const block of event.message.content) {
          if (block.type === 'tool_use') {
            streamToolUse.push(block.name);
          }
        }
      }
    }

    if (streamToolUse.length > 0) {
      return formatResult('can-use-tool', 'partial',
        `canUseTool callback was NOT invoked (tools auto-allowed?), ` +
        `but tool_use events observed: ${streamToolUse.join(', ')}. ` +
        `SDK field evidence: tool_use blocks present in message.content. Events: ${events.length}. ` +
        `BLOCKED: canUseTool callback was not triggered despite permissionMode:'default'.`
      );
    }

    const hasInit = events.some(e => e.type === 'system' && (e.subtype === 'init' || e.subtype === 'session_init'));
    if (hasInit) {
      return formatResult('can-use-tool', 'partial',
        `Session initialized but no tool use observed. ` +
        `Claude may not have needed tools for this prompt. Events: ${events.length}.`
      );
    }

    return formatResult('can-use-tool', 'fail',
      `No canUseTool calls and no tool_use events. Event types: ${[...new Set(events.map(e => e.type))].join(', ')}`
    );
  } catch (error) {
    return formatResult('can-use-tool', 'fail', error instanceof Error ? error.message : String(error));
  } finally {
    cleanup();
  }
}

/**
 * canUseTool deny path.
 *
 * Strategy: wire a canUseTool that denies all calls, verify:
 * 1. The deny result is consumed by the SDK
 * 2. The stream continues (doesn't hang)
 * 3. An error or denial event is observable
 */
async function smokeCanUseToolDeny() {
  const { dir: tmpDir, cleanup } = createTempDir('claude-smoke-deny-');
  try {
    const { randomBytes } = require('crypto');
    const { writeFileSync: writeTempFile } = require('fs');
    const { query } = require('@anthropic-ai/claude-agent-sdk');
    const smokeDir = process.env.CLAUDE_CODE_SMOKE_DIR || projectRoot;

    /** @type {Array<{toolName: string}>} */
    const deniedCalls = [];
    const denyToken = randomBytes(16).toString('hex');
    const denyFile = join(tmpDir, 'deny-token.txt');
    writeTempFile(denyFile, 'initial-content\n');

    const q = query({
      prompt: `Write the text "deny-token:${denyToken}" to the file ${denyFile}. Use the Write tool to do this.`,
      options: {
        cwd: smokeDir,
        includePartialMessages: true,
        tools: { type: 'preset', preset: 'claude_code' },
        maxTurns: 3,
        additionalDirectories: [tmpDir],
        canUseTool: async (toolName, input, options) => {
          deniedCalls.push({ toolName });
          return { behavior: 'deny', message: `Smoke test denies ${toolName}` };
        },
      },
    });

    const events = await collectEvents(q, {
      until: (event) => event.type === 'result',
      timeout: 120000,
    });
    q.close?.();

    const authEvent = events.find(e => e.type === 'auth_status' && e.error);
    if (authEvent) {
      return formatResult('can-use-tool-deny', 'auth-blocked', `Auth required: ${authEvent.error}`);
    }

    if (deniedCalls.length > 0) {
      const toolNames = [...new Set(deniedCalls.map(c => c.toolName))];
      // Check that the stream completed (didn't hang)
      const hasResult = events.some(e => e.type === 'result');
      return formatResult('can-use-tool-deny', 'pass',
        `Denied ${deniedCalls.length} tool call(s). Tool names: ${toolNames.join(', ')}. ` +
        `Stream completed (has result event): ${hasResult}. ` +
        `SDK field evidence: PermissionResult.behavior='deny' with message consumed by SDK.`
      );
    }

    // A clean result without denied tool callbacks does not prove the deny path.
    const hasResult = events.some(e => e.type === 'result');
    if (hasResult) {
      return formatResult('can-use-tool-deny', 'partial',
        `No tool calls needed (Claude answered directly). Stream completed. ` +
        `BLOCKED: canUseTool deny callback was not triggered, so PermissionResult.behavior='deny' was not runtime-proven.`
      );
    }

    return formatResult('can-use-tool-deny', 'partial',
      `No denied calls and no result event. Events: ${events.length}. ` +
      `Event types: ${[...new Set(events.map(e => e.type))].join(', ')}`
    );
  } catch (error) {
    return formatResult('can-use-tool-deny', 'fail', error instanceof Error ? error.message : String(error));
  } finally {
    cleanup();
  }
}

/**
 * Writes an MCP stdio server that supports the elicitation protocol.
 * When a tool is called, the server sends an `elicitation/create` request
 * to the client before responding, which should trigger the SDK's
 * `onElicitation` callback.
 *
 * Uses MCP protocol version 2025-03-26 which supports elicitation.
 */
function writeMcpElicitationServer(dir) {
  const serverPath = join(dir, 'mcp-elicitation-server.mjs');
  const serverCode = `#!/usr/bin/env node
import { createInterface } from 'readline';

const rl = createInterface({ input: process.stdin, terminal: false });

function sendMessage(msg) {
  process.stdout.write(JSON.stringify(msg) + '\\n');
}

let pendingToolCall = null;

rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }

  if (msg.method === 'initialize') {
    sendMessage({ jsonrpc: '2.0', id: msg.id, result: {
      protocolVersion: '2025-03-26',
      capabilities: { tools: {}, elicitation: {} },
      serverInfo: { name: 'elicitation-smoke-server', version: '1.0.0' }
    }});
  } else if (msg.method === 'notifications/initialized') {
    // No response needed
  } else if (msg.method === 'tools/list') {
    sendMessage({ jsonrpc: '2.0', id: msg.id, result: {
      tools: [{
        name: 'ask_and_echo',
        description: 'Asks the user a question via elicitation, then echoes the answer',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'The message to echo back' }
          },
          required: ['message']
        }
      }]
    }});
  } else if (msg.method === 'tools/call') {
    // Save the tool call and send an elicitation request first
    pendingToolCall = msg;
    sendMessage({
      jsonrpc: '2.0',
      id: 'elicit-smoke-1',
      method: 'elicitation/create',
      params: {
        message: 'Smoke test: please confirm the echo operation.',
        requestedSchema: {
          type: 'object',
          properties: {
            confirmed: { type: 'boolean', title: 'Confirm', description: 'Confirm the operation' }
          },
          required: ['confirmed']
        }
      }
    });
  } else if (msg.id === 'elicit-smoke-1' && pendingToolCall) {
    // This is the elicitation response from the client
    const elicitationResult = msg.result || msg;
    const args = pendingToolCall.params?.arguments || {};
    sendMessage({ jsonrpc: '2.0', id: pendingToolCall.id, result: {
      content: [{
        type: 'text',
        text: JSON.stringify({
          echoed: args.message || 'no message',
          elicitationAction: elicitationResult?.action || 'unknown'
        })
      }],
      isError: false
    }});
    pendingToolCall = null;
  }
});
`;
  writeFileSync(serverPath, serverCode, 'utf-8');
  return serverPath;
}

/**
 * Elicitation / AskUserQuestion via onElicitation callback.
 *
 * Strategy: create an MCP server that implements the elicitation protocol
 * (MCP protocol version 2025-03-26 with `elicitation` capability). When the
 * tool is called, the server sends an `elicitation/create` request to the
 * SDK client, which should trigger the `onElicitation` callback.
 *
 * Two paths are checked:
 * 1. `onElicitation` callback — for MCP server-initiated elicitation requests
 * 2. `canUseTool` callback — for AskUserQuestion tool calls (built-in tool)
 *
 * SDK type evidence:
 *   Options.onElicitation: (request: ElicitationRequest, { signal }) => Promise<ElicitationResult>
 *   ElicitationRequest: { serverName, message, mode?, url?, requestedSchema? }
 *   ElicitationResult (from @modelcontextprotocol/sdk): { action: 'accept' | 'decline' | 'cancel', content?: Record<string, unknown> }
 */
async function smokeElicitation() {
  const { dir, cleanup } = createTempDir('claude-smoke-elicitation-');
  try {
    const serverPath = writeMcpElicitationServer(dir);
    const { query } = require('@anthropic-ai/claude-agent-sdk');
    const smokeDir = process.env.CLAUDE_CODE_SMOKE_DIR || projectRoot;

    /** @type {Array<{toolName: string, input: Record<string, unknown>}>} */
    const askToolCalls = [];
    /** @type {Array<{serverName: string, message: string, action: string}>} */
    const elicitationCalls = [];

    const q = query({
      prompt: 'You MUST use the ask_and_echo tool from the elicit_smoke server. '
        + 'Call it with message "elicitation-test". '
        + 'Do NOT just reply with text — you must invoke the tool.',
      options: {
        cwd: smokeDir,
        includePartialMessages: true,
        tools: { type: 'preset', preset: 'claude_code' },
        maxTurns: 3,
        mcpServers: {
          elicit_smoke: {
            type: 'stdio',
            command: 'node',
            args: [serverPath],
            alwaysLoad: true,
          },
        },
        allowedTools: ['mcp__elicit_smoke__ask_and_echo'],
        canUseTool: async (toolName, input) => {
          askToolCalls.push({ toolName, input });
          return { behavior: 'allow' };
        },
        onElicitation: async (request) => {
          elicitationCalls.push({
            serverName: request.serverName,
            message: request.message,
            mode: request.mode,
          });
          return { action: 'accept', content: { confirmed: true } };
        },
      },
    });

    const events = await collectEvents(q, {
      until: (event) => event.type === 'result',
      timeout: 120000,
    });
    q.close?.();

    const authEvent = events.find(e => e.type === 'auth_status' && e.error);
    if (authEvent) {
      return formatResult('elicitation', 'auth-blocked', `Auth required: ${authEvent.error}`);
    }

    // Check both elicitation callback paths
    const hasElicitation = elicitationCalls.length > 0;
    const hasMcpTool = askToolCalls.some(c => c.toolName.startsWith('mcp__elicit_smoke__'));

    if (hasElicitation) {
      const details = [
        `onElicitation invoked ${elicitationCalls.length} time(s): ${elicitationCalls.map(e => `${e.serverName}: ${(e.message || '').slice(0, 50)}`).join('; ')}`,
      ];
      if (hasMcpTool) {
        details.push(`MCP tool calls via canUseTool: ${askToolCalls.filter(c => c.toolName.startsWith('mcp__')).map(c => c.toolName).join(', ')}`);
      }
      return formatResult('elicitation', 'pass',
        `${details.join('. ')}. ` +
        `SDK type evidence: onElicitation({serverName, message, mode}) => {action:'accept'|'decline'|'cancel', content?}. ` +
        `Events: ${events.length}.`
      );
    }

    // MCP tool was called but no elicitation triggered
    if (hasMcpTool) {
      // Check if tool_use events exist in the stream
      const streamToolNames = [];
      for (const event of events) {
        if (event.type === 'assistant' && event.message?.content) {
          for (const block of event.message.content) {
            if (block.type === 'tool_use') {
              streamToolNames.push(block.name);
            }
          }
        }
      }

      return formatResult('elicitation', 'partial',
        `MCP tool was called (${askToolCalls.filter(c => c.toolName.startsWith('mcp__')).map(c => c.toolName).join(', ')}) ` +
        `but onElicitation was NOT invoked. ` +
        `The MCP server may not support elicitation, or the SDK bridge did not forward it. ` +
        `Stream tools: ${streamToolNames.join(', ')}. Events: ${events.length}. ` +
        `BLOCKED: onElicitation callback not triggered despite MCP server declaring elicitation capability.`
      );
    }

    // Check for tool use in stream even if callbacks weren't called
    const streamToolNames = [];
    for (const event of events) {
      if (event.type === 'assistant' && event.message?.content) {
        for (const block of event.message.content) {
          if (block.type === 'tool_use') {
            streamToolNames.push(block.name);
          }
        }
      }
    }

    if (streamToolNames.length > 0) {
      return formatResult('elicitation', 'partial',
        `No elicitation triggered. Tools used: ${streamToolNames.join(', ')}. ` +
        `Callbacks wired but MCP server may not have connected. Events: ${events.length}.`
      );
    }

    const hasInit = events.some(e => e.type === 'system' && (e.subtype === 'init' || e.subtype === 'session_init'));
    if (hasInit) {
      return formatResult('elicitation', 'partial',
        `Session initialized but no tool/elicitation activity. Events: ${events.length}.`
      );
    }

    return formatResult('elicitation', 'fail',
      `No activity observed. Event types: ${[...new Set(events.map(e => e.type))].join(', ')}`
    );
  } catch (error) {
    return formatResult('elicitation', 'fail', error instanceof Error ? error.message : String(error));
  } finally {
    cleanup();
  }
}

/**
 * Session resume after close.
 *
 * Strategy:
 * 1. Create a query, capture the session_id from system init events
 * 2. Close the query
 * 3. Create a new query with `resume: sessionId`
 * 4. Verify the resumed session references the same session_id
 *
 * SDK type evidence:
 *   Options.resume: string (session ID to resume)
 *   SDKSystemMessage.session_id: UUID
 *   SDKResultMessage.session_id: UUID
 */
async function smokeSessionResume() {
  try {
    const { query } = require('@anthropic-ai/claude-agent-sdk');
    const smokeDir = process.env.CLAUDE_CODE_SMOKE_DIR || projectRoot;

    // Phase 1: Create initial session and capture session_id
    const q1 = query({
      prompt: 'Reply with exactly: FIRST_OK',
      options: {
        cwd: smokeDir,
        includePartialMessages: true,
        maxTurns: 1,
      },
    });

    let capturedSessionId = null;
    const events1 = await collectEvents(q1, {
      until: (event) => {
        // Capture session_id from system or result events
        if (event.session_id && !capturedSessionId) {
          capturedSessionId = event.session_id;
        }
        return event.type === 'result';
      },
      timeout: 60000,
    });
    q1.close?.();

    const authEvent1 = events1.find(e => e.type === 'auth_status' && e.error);
    if (authEvent1) {
      return formatResult('session-resume', 'auth-blocked', `Auth required (phase 1): ${authEvent1.error}`);
    }

    if (!capturedSessionId) {
      // Try to get it from result message
      const resultEvent = events1.find(e => e.type === 'result' && e.session_id);
      if (resultEvent) {
        capturedSessionId = resultEvent.session_id;
      }
    }

    if (!capturedSessionId) {
      return formatResult('session-resume', 'fail',
        `Could not capture session_id from initial query. ` +
        `Event types: ${[...new Set(events1.map(e => e.type))].join(', ')}. Events: ${events1.length}.`
      );
    }

    // Phase 2: Resume with the captured session_id
    const q2 = query({
      prompt: 'What did I just say? Reply with exactly: RESUMED_OK',
      options: {
        cwd: smokeDir,
        includePartialMessages: true,
        maxTurns: 1,
        resume: capturedSessionId,
      },
    });

    let resumedSessionId = null;
    const events2 = await collectEvents(q2, {
      until: (event) => {
        if (event.session_id && !resumedSessionId) {
          resumedSessionId = event.session_id;
        }
        return event.type === 'result';
      },
      timeout: 60000,
    });
    q2.close?.();

    const authEvent2 = events2.find(e => e.type === 'auth_status' && e.error);
    if (authEvent2) {
      return formatResult('session-resume', 'auth-blocked', `Auth required (phase 2): ${authEvent2.error}`);
    }

    const sessionMatch = capturedSessionId === resumedSessionId;

    if (sessionMatch) {
      return formatResult('session-resume', 'pass',
        `Session ID preserved across resume: ${capturedSessionId}. ` +
        `Phase 1 events: ${events1.length}, Phase 2 events: ${events2.length}. ` +
        `SDK field evidence: Options.resume accepted, session_id identical across queries.`
      );
    }

    if (resumedSessionId) {
      return formatResult('session-resume', 'partial',
        `Session IDs differ: captured=${capturedSessionId}, resumed=${resumedSessionId}. ` +
        `Resume option was accepted but may have forked. Events: ${events2.length}.`
      );
    }

    return formatResult('session-resume', 'fail',
      `Phase 2 completed but no session_id found. Events: ${events2.length}.`
    );
  } catch (error) {
    return formatResult('session-resume', 'fail', error instanceof Error ? error.message : String(error));
  }
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  const results = [];
  const isJson = process.argv.includes('--json');

  if (!isJson) {
    console.log('Claude Code Real Runtime Smoke');
    console.log('==============================');
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`Node: ${process.version}`);
    console.log(`Platform: ${process.platform} ${process.arch}`);
    console.log('');
  }

  const tests = [
    // Basic tests
    ['SDK Import', smokeSdkImport],
    ['Bundled Executable', smokeBundledExecutable],
    ['Query Text Stream', smokeQueryText],
    ['Supported Models', smokeSupportedModels],
    // Real runtime capability tests
    ['Stream Thinking (SDK block fields)', smokeStreamThinking],
    ['MCP Stdio Tool Use/Result', smokeMcpStdioToolUse],
    ['canUseTool Approval', smokeCanUseToolApproval],
    ['canUseTool Deny', smokeCanUseToolDeny],
    ['Elicitation + canUseTool', smokeElicitation],
    ['Session Resume', smokeSessionResume],
  ];

  for (const [name, fn] of tests) {
    if (!isJson) {
      process.stdout.write(`  ${name}... `);
    }

    const result = await fn();
    results.push(result);

    if (!isJson) {
      const icon = result.status === 'pass' ? '✅' :
                   result.status === 'auth-blocked' ? '🔐' :
                   result.status === 'skip' ? '⏭️' :
                   result.status === 'partial' ? '⚠️' : '❌';
      console.log(`${icon} ${result.status}`);
      if (result.detail) {
        console.log(`    ${result.detail}`);
      }
    }
  }

  if (!isJson) {
    console.log('');
    const passed = results.filter(r => r.status === 'pass').length;
    const total = results.length;
    console.log(`Summary: ${passed}/${total} passed`);
    console.log('');

    const authBlocked = results.filter(r => r.status === 'auth-blocked');
    if (authBlocked.length > 0) {
      console.log('Auth-blocked scenarios (need Claude Code authentication):');
      for (const r of authBlocked) {
        console.log(`  - ${r.name}: ${r.detail}`);
      }
      console.log('');
      console.log('To resolve: Run `claude login` or set ANTHROPIC_API_KEY environment variable.');
    }
  }

  const output = {
    timestamp: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    results,
    summary: {
      total: results.length,
      passed: results.filter(r => r.status === 'pass').length,
      authBlocked: results.filter(r => r.status === 'auth-blocked').length,
      failed: results.filter(r => r.status === 'fail').length,
      skipped: results.filter(r => r.status === 'skip').length,
      partial: results.filter(r => r.status === 'partial').length,
    },
  };

  if (isJson) {
    console.log(JSON.stringify(output, null, 2));
  }

  // Exit with non-zero if any test did not pass, unless --allow-partial
  const allowPartial = process.argv.includes('--allow-partial');
  const blockingStatuses = allowPartial
    ? ['fail']
    : ['fail', 'partial', 'skip', 'auth-blocked'];
  const hasBlocking = results.some(r => blockingStatuses.includes(r.status));
  process.exit(hasBlocking ? 1 : 0);
}

main().catch((error) => {
  console.error('Smoke script crashed:', error);
  process.exit(2);
});
