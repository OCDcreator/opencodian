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

proc.on('error', (err) => {
  console.error('Spawn error:', err);
  process.exit(1);
});

function connect(url) {
  ws = new WebSocket(url);
  ws.onopen = () => {
    console.log('WS open');
    request('initialize', { clientInfo: { name: 'test', version: '1.0.0' } })
      .then(() => {
        ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'initialized' }));
        return request('thread/list', { limit: 5 });
      })
      .then((result) => {
        const threads = result?.data ?? [];
        console.log(`Found ${threads.length} threads`);
        if (threads.length === 0) {
          console.log('No threads to read');
          cleanup();
          return;
        }
        // Read the first thread with includeTurns=true
        const threadId = threads[0].id;
        console.log(`Reading thread ${threadId} with includeTurns=true`);
        return request('thread/read', { threadId, includeTurns: true });
      })
      .then((result) => {
        if (!result) return;
        const thread = result.thread;
        console.log('\n=== THREAD METADATA ===');
        console.log('id:', thread.id);
        console.log('name:', thread.name);
        console.log('preview:', thread.preview?.slice(0, 100));
        console.log('turns count:', thread.turns?.length ?? 0);
        
        if (thread.turns && thread.turns.length > 0) {
          console.log('\n=== FIRST TURN ===');
          console.log(JSON.stringify(thread.turns[0], null, 2));
          
          if (thread.turns.length > 1) {
            console.log('\n=== SECOND TURN ===');
            console.log(JSON.stringify(thread.turns[1], null, 2));
          }
          
          // Show all item types
          const allItems = thread.turns.flatMap(t => t.items ?? []);
          const typeCounts = {};
          for (const item of allItems) {
            typeCounts[item.type] = (typeCounts[item.type] || 0) + 1;
          }
          console.log('\n=== ITEM TYPE COUNTS ===');
          console.log(JSON.stringify(typeCounts, null, 2));
          
          // Show sample of each type
          const seenTypes = new Set();
          for (const item of allItems) {
            if (!seenTypes.has(item.type)) {
              seenTypes.add(item.type);
              console.log(`\n=== SAMPLE ${item.type} ITEM ===`);
              console.log(JSON.stringify(item, null, 2));
            }
          }
        }
        
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
