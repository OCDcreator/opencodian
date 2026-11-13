#!/usr/bin/env node
// Old-Codex-CLI emulator for the websocket-auth fallback live probe.
//
// Reproduces the two real-process behaviors the transport must tell apart:
//   - an old CLI whose argument parser rejects the auth flags: clap-style
//     stderr rejection naming the flag, then a non-zero exit;
//   - an old CLI that fails for an unrelated reason (config/permission):
//     non-zero exit with stderr that does NOT prove parser rejection.
// When spawned WITHOUT the auth flags it behaves like a real app-server:
// prints a loopback listening URL on stderr and stays alive until killed.
// Every invocation appends one JSON line to $FAKE_INVOCATIONS so tests can
// prove the exact spawn sequence with real child processes.
import { appendFileSync } from 'node:fs';

const args = process.argv.slice(2);
const hasAuthFlag = args.includes('--ws-auth') || args.includes('--ws-token-sha256');

try {
  if (process.env.FAKE_INVOCATIONS) {
    appendFileSync(process.env.FAKE_INVOCATIONS, `${JSON.stringify({ argv: args, hasAuthFlag, kind: process.env.FAKE_EXIT_KIND ?? 'parser' })}\n`);
  }
} catch {
  // Recording is best-effort; behavior below is the contract.
}

if (hasAuthFlag) {
  if (process.env.FAKE_EXIT_KIND === 'config') {
    // Unrelated failure with auth flags present: must NOT authorize fallback.
    process.stderr.write('Error: failed to load config.toml: permission denied\n');
    process.exit(78);
  }
  // clap 4 unknown-argument output (clap 3 uses "Found argument ... which wasn't expected").
  process.stderr.write(
    "error: unexpected argument '--ws-auth' found\n\n"
    + '  note: to pass \'--ws-auth\' as a value, use \'-- --ws-auth\'\n\n'
    + 'Usage: codex app-server [OPTIONS] --ws-auth <MODE> --ws-token-sha256 <HEX> --listen <LISTEN_ADDRESS>\n\n'
    + 'Options:\n'
    + '      --listen <LISTEN_ADDRESS>\n'
    + '      --ws-auth <MODE>  Authentication mode for incoming WebSocket connections\n'
    + '      --ws-token-sha256 <HEX>\n'
    + '  -h, --help\n',
  );
  process.exit(2);
}

// No auth flags: behave like a working (old) app-server. Print the URL on
// stderr, then idle until killed; a safety timer prevents leaked processes if
// a test fails before cleanup.
process.stderr.write('App server listening on ws://127.0.0.1:45671\n');
const safety = setTimeout(() => process.exit(0), 20000);
safety.unref();
setInterval(() => { /* keep alive until the transport kills us */ }, 1000);
