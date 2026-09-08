// Real-process compatibility check. No model fallback; all tools operate in a temporary workspace.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const directory = await fs.mkdtemp(path.join(tmpdir(), 'opencodian-pi-live-'));
const reportPath = path.join(root, '.obsidian-debug', 'pi-smoke.json');
const executablePath = process.env.PI_SMOKE_EXECUTABLE ?? '';
const report = { protocol: 'official-pi-jsonl-rpc', version: '', checks: [], passed: false };
const userSettingsPath = path.join(process.env.PI_CODING_AGENT_DIR || path.join(homedir(), '.pi', 'agent'), 'settings.json');
const userSettingsBefore = await fs.readFile(userSettingsPath, 'utf8').catch(() => null);
let adapter;
try {
  const version = spawnSync(executablePath || 'pi', ['--version'], { encoding: 'utf8' });
  report.version = `${version.stdout ?? ''}${version.stderr ?? ''}`.trim();
  await build({ entryPoints: [path.join(root, 'src/core/agents/backend/pi/PiAdapter.ts')], outfile: path.join(directory, 'adapter.cjs'), bundle: true, platform: 'node', format: 'cjs' });
  const { PiAdapter } = require(path.join(directory, 'adapter.cjs'));
  const options = { workingDirectory: directory, servicePath: path.join(root, 'assets/pi/service.mjs'), getSettings: () => ({ executablePath, provider: '', model: '', thinkingLevel: 'off' }) };
  adapter = new PiAdapter(options);
  await adapter.start();
  const models = await adapter.getAvailableModels();
  if (!models.length) throw new Error('No authenticated Pi model is available.');
  report.model = adapter.getDefaultModel();
  report.checks.push({ name: 'handshake-and-model-catalog', passed: true, modelCount: models.length });
  const token = `PI_${randomUUID().replaceAll('-', '')}`;
  await fs.writeFile(path.join(directory, 'marker.txt'), token);
  const id = await adapter.createSession('Pi compatibility smoke');
  const run = async (sessionId, content) => {
    const chunks = [];
    for await (const chunk of adapter.sendMessage({ sessionId, content })) chunks.push(chunk);
    const errors = chunks.filter((chunk) => chunk.type === 'error');
    if (errors.length) throw new Error(String(errors[0].content));
    return chunks;
  };
  options.getSettings = () => ({ executablePath, provider: report.model.provider, model: report.model.model, thinkingLevel: 'off' });
  const first = await run(id, 'Use the read tool to read marker.txt in the current directory. Reply with exactly its contents. Do not edit files or use other tools.');
  const text = (chunks) => chunks.filter((chunk) => chunk.type === 'text').map((chunk) => chunk.content).join('');
  if (!text(first).includes(token) || !first.some((chunk) => chunk.type === 'tool_use')) throw new Error('Tool read or streamed marker assertion failed.');
  report.checks.push({ name: 'tool-stream-and-usage', passed: true, chunkTypes: [...new Set(first.map((chunk) => chunk.type))] });
  adapter.dispose();
  adapter = new PiAdapter(options);
  await fs.rm(path.join(directory, 'marker.txt'));
  const second = await run(id, 'Without using any tools, repeat the exact marker you read in the previous turn.');
  if (!text(second).includes(token)) throw new Error('Persistent context assertion failed.');
  report.checks.push({ name: 'new-adapter-session-resume', passed: true });
  const fork = await adapter.forkSession(id);
  const third = await run(fork.id, 'Without using any tools, repeat the exact marker from our conversation.');
  if (!text(third).includes(token)) throw new Error('Fork context assertion failed.');
  report.checks.push({ name: 'fork-context', passed: true });
  await adapter.deleteSession(fork.id);
  if (!(await adapter.getSession(id))) throw new Error('Deleting fork changed original session.');
  report.checks.push({ name: 'delete-isolation', passed: true });
  const userSettingsAfter = await fs.readFile(userSettingsPath, 'utf8').catch(() => null);
  if (userSettingsAfter !== userSettingsBefore) throw new Error('Pi global settings changed during smoke.');
  report.checks.push({ name: 'global-settings-unchanged', passed: true });
  report.passed = true;
} catch (error) {
  // Keep arbitrary remote/provider errors out of the persistent evidence artifact.
  report.error = error instanceof Error ? error.message.replace(/(?:sk-|key-)[A-Za-z0-9_-]+/g, '[redacted]') : 'Smoke test failed';
  process.exitCode = 1;
} finally {
  adapter?.dispose();
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  await fs.rm(directory, { recursive: true, force: true });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
