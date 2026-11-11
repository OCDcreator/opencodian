import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const historySuite = join(__dirname, 'PiConfigurationHistory.test.mjs');
const configurationModule = join(__dirname, '../../../../../../assets/pi/configuration.mjs');

it('persists bounded configuration history across reload with CAS restore, secret-safe modes, and confinement (PI history)', () => {
  const output = execFileSync(process.execPath, ['--test', '--test-reporter=tap', historySuite], { cwd: process.cwd(), encoding: 'utf8', windowsHide: true,
  // CI exports NODE_OPTIONS=--test-reporter=tap; the child must not inherit a second reporter.
  env: { ...process.env, NODE_OPTIONS: '' } });
  expect(output).toContain('# fail 0');
  expect(output).toContain('# pass 7');
}, 60000);

it('transport advertises the optional history commands for feature detection (PI history)', () => {
  // Real child process roundtrip: the optional commands must appear in get_state
  // without being part of the required handshake subset.
  const script = `
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConfigurationService, startConfigurationTransport } from ${JSON.stringify(pathToFileURL(configurationModule).href)};
const base = mkdtempSync(join(tmpdir(), 'pi-history-transport-'));
const cwd = join(base, 'project');
const agentDir = join(base, 'agent-fixture');
mkdirSync(join(cwd, '.pi'), { recursive: true });
mkdirSync(agentDir, { recursive: true });
class FileSettingsStorage { withLock(_scope, _operation) {} }
const config = createConfigurationService({ FileSettingsStorage, VERSION: 'offline-history-fixture' }, cwd, agentDir);
const written = [];
const stdin = { setEncoding() {}, on(event, handler) { if (event === 'data') this.dataHandler = handler; }, emit(line) { this.dataHandler(line); } };
const stdout = { write: chunk => written.push(chunk) };
startConfigurationTransport(config, 'offline-history-fixture', { stdin, stdout });
stdin.emit(JSON.stringify({ type: 'get_state', id: 's1' }) + '\\n');
await new Promise(resolve => setImmediate(resolve));
const state = JSON.parse(written.find(chunk => chunk.includes('"get_state"')));
const optional = ['get_configuration_history', 'restore_configuration'];
const required = ['get_configuration', 'save_configuration', 'get_model_configuration', 'save_model_configuration'];
console.log('PI_HISTORY_CHECK:' + JSON.stringify({
  serviceProtocol: state.data.serviceProtocol,
  hasOptional: optional.every(name => state.data.commands.includes(name)),
  requiredPresent: required.every(name => state.data.commands.includes(name)),
}));
`;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: process.cwd(), encoding: 'utf8', windowsHide: true, env: { ...process.env, NODE_OPTIONS: '' } });
  const marker = output.split('\n').find(line => line.startsWith('PI_HISTORY_CHECK:'));
  expect(marker).toBeDefined();
  const result = JSON.parse((marker as string).slice('PI_HISTORY_CHECK:'.length));
  expect(result.serviceProtocol).toBe(1);
  expect(result.hasOptional).toBe(true);
  expect(result.requiredPresent).toBe(true);
}, 60000);
