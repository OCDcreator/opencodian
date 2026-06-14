import { spawn } from 'child_process';
import WebSocket from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const codexPath = path.join(__dirname, '../node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex');
console.log('Spawning app-server:', codexPath);

const proc = spawn(codexPath, ['app-server', '--listen', 'ws://127.0.0.1:0'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

let buffer = '';
let wsUrl = null;
let ws = null;
let nextId = 1;
const pending = new Map();

function handleData(chunk) {
  buffer += chunk.toString();
  const match = buffer.match(/ws:\/\/127\.0\.0\.1:\d+/);
  if (match && !wsUrl) {
    wsUrl = match[0];
    console.log('Got ws url:', wsUrl);
    connect(wsUrl);
  }
}

proc.stdout.on('data', handleData);
proc.stderr.on('data', handleData);

proc.stderr.on('data', (chunk) => {
  // also log unexpected stderr
  if (!chunk.toString().includes('ws://')) {
    console.error('stderr:', chunk.toString());
  }
});

proc.on('error', (err) => {
  console.error('Spawn error:', err);
  process.exit(1);
});

proc.on('exit', (code) => {
  console.log('exited', code);
});

function connect(url) {
  ws = new WebSocket(url);
  ws.onopen = () => {
    console.log('WS open');
    request('initialize', { clientInfo: { name: 'test', version: '1.0.0' } })
      .then(() => {
        ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'initialized' }));
        return request('thread/list', { limit: 50 });
      })
      .then((result) => {
        console.log('thread/list result:', JSON.stringify(result, null, 2));
        cleanup();
      })
      .catch((err) => {
        console.error('Error:', err);
        cleanup();
      });
  };
  ws.onmessage = (event) => {
    const data = event.data;
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (msg.id !== undefined) {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
    }
  };
  ws.onerror = (err) => console.error('WS error:', err);
  ws.onclose = () => console.log('WS closed');
}

function request(method, params) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
  });
}

function cleanup() {
  try { ws.close(); } catch {}
  proc.kill();
  setTimeout(() => process.exit(0), 500);
}
