/**
 * CodexAppServerSpawnSupport — owned app-server spawn readiness: websocket
 * capability-token material, auth argv/upgrade-header construction, and
 * listening-URL discovery for the spawned Codex CLI process.
 *
 * Isolated from `CodexAppServerTransport` for two reasons. First, this is the
 * one place that touches secret material (Codex 0.169.0 `--ws-auth
 * capability-token`): the raw token exists only in the caller's memory and in
 * the constructed upgrade header; argv carries only its SHA-256 digest, and
 * nothing here logs, persists, or transmits the token. Second, the URL-wait
 * logic is the spawn-readiness boundary where an older CLI's ARGUMENT-PARSER
 * rejection of the auth flags is detected from its own stderr/stdout text, so
 * the transport's one-shot unauthenticated fallback stays reserved for exactly
 * that failure class. Every other failure (non-parser exits, config/permission
 * errors, crashes, spawn ENOENT, start timeout, post-URL failures) remains a
 * hard failure with NO downgrade. Every exported function is total and
 * side-effect free with respect to token state.
 */

import type { ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';

import { createLogger } from '../../../../shared';

/** Same diagnostic scope as the owning transport so log output is identical. */
const logger = createLogger('CodexAppServerClient');

/** Service-output observer sink the transport exposes for stderr/stdout text. */
export type ServiceOutputSink = (input: { stream: 'stdout' | 'stderr'; text: string }) => 'handled' | 'declined' | 'failed';

/**
 * The auth flags whose rejection by the CLI argument parser is the ONLY
 * condition that authorizes the transport's unauthenticated fallback. Any
 * other cause must keep the session down.
 */
const WS_AUTH_FLAGS = ['--ws-auth', '--ws-token-sha256'] as const;

/**
 * Argument-parser rejection phrases, matched LINE-scoped against a line that
 * also names one of the flags. This is the wording clap 3/4 emits
 * ("error: unexpected argument '--ws-auth' found" / "Found argument '--x'
 * which wasn't expected") plus common CLI parser synonyms (unknown option /
 * argument / flag, unrecognized). Usage/help lines may legitimately mention
 * the flags (e.g. "  --ws-auth <MODE>") but never with a rejection phrase on
 * the same line, so they cannot false-positive.
 */
const PARSER_REJECTION_PATTERN = /(unexpected argument|unknown argument|unknown option|unknown flag|unrecognized argument|unrecognized option|unrecognized flag|wasn't expected|was not expected)/i;

/**
 * True when `text` contains a line that both names an auth flag AND carries a
 * parser-rejection phrase — the restricted proof that THIS CLI's argument
 * parser refused the websocket-auth arguments (as opposed to any other
 * non-zero exit: config/permission errors, crashes, port conflicts).
 */
export function hasWsAuthParserRejection(text: string): boolean {
  for (const line of text.split(/\r?\n/)) {
    if (!WS_AUTH_FLAGS.some((flag) => line.includes(flag))) continue;
    if (PARSER_REJECTION_PATTERN.test(line)) return true;
  }
  return false;
}

/**
 * Error shape of a non-zero app-server exit. `wsAuthParserRejection` is set
 * ONLY when the captured stderr/stdout contained the parser-rejection proof
 * (see `hasWsAuthParserRejection`); it is absent for every other failure, so
 * classification cannot fire from exit codes alone.
 */
export interface AppServerFlagExitError extends Error {
  wsAuthParserRejection?: true;
}

/**
 * True ONLY for an exit-class rejection that carries the parser-rejection
 * evidence on it. Spawn errors (ENOENT), start timeouts, plain non-zero exits
 * without that evidence (config/permission failures, crashes), and post-URL
 * failures never carry it, so the unauthenticated retry stays reserved for
 * exactly the "old CLI argument parser refused the auth flags" degradation.
 */
export function isUnsupportedFlagExit(error: unknown): boolean {
  return error instanceof Error
    && (error as AppServerFlagExitError).wsAuthParserRejection === true;
}

/** 256-bit URL-safe capability token; regenerated per app-server spawn. */
export function generateWsCapabilityToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Spawn-argument suffix that turns the app-server listener into
 * authenticate-on-upgrade mode. Only the digest ever appears in argv, so
 * process listings never expose the token itself.
 */
export function capabilityTokenArgvSuffix(token: string): string[] {
  return ['--ws-auth', 'capability-token', '--ws-token-sha256', createHash('sha256').update(token).digest('hex')];
}

/** Upgrade header the client must send; the token travels only here. */
export function capabilityTokenAuthorizationHeader(token: string): string {
  return `Bearer ${token}`;
}

/** Spawn argv for the owned app-server process (digest-only auth suffix). */
export function buildAppServerSpawnArgs(wsAuthToken: string | null): string[] {
  const args = ['app-server', '--listen', 'ws://127.0.0.1:0'];
  if (wsAuthToken) {
    args.push(...capabilityTokenArgvSuffix(wsAuthToken));
  }
  return args;
}

export interface WaitForAppServerWsUrlHooks {
  /**
   * When the transport has a wire observer, stderr/stdout chunks are forwarded
   * here; `observerAvailable: false` reproduces the legacy no-observer path
   * (stderr Error lines logged, no forwarding).
   */
  observerAvailable: boolean;
  onServiceOutput: ServiceOutputSink;
}

/**
 * Wait for the app-server to emit its `ws://127.0.0.1:<port>` listening URL on
 * stdout/stderr (both streams are scanned; the URL may land on either). Rejects
 * on spawn error, non-zero exit, or the 15s start timeout. A non-zero exit
 * rejects with an `AppServerFlagExitError` whose `wsAuthParserRejection` flag
 * is set ONLY when the captured stderr/stdout contains the argument-parser
 * rejection proof (`hasWsAuthParserRejection`); every other exit stays an
 * evidence-less failure. Forwarded service output is best-effort: the sink
 * itself is expected to guard observer exceptions (the transport's
 * `notifyServiceOutput` does).
 */
export function waitForAppServerWsUrl(proc: ChildProcess, hooks: WaitForAppServerWsUrlHooks): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('App-server start timeout')), 15000);
    let buffer = '';

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString();
      // Bound the evidence buffer: parser rejections are printed immediately
      // before exit, so the tail is sufficient and memory stays flat on long
      // noisy runs.
      if (buffer.length > 64 * 1024) {
        buffer = buffer.slice(buffer.length - 64 * 1024);
      }
      const match = buffer.match(/ws:\/\/127\.0\.0\.1:\d+/);
      if (match) {
        clearTimeout(timeout);
        proc.stdout?.off('data', onData);
        proc.stderr?.off('data', onData);
        resolve(match[0]);
      }
    };

    proc.stdout?.on('data', onData);
    proc.stderr?.on('data', onData);
    if (hooks.observerAvailable) {
      proc.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        const outcome = hooks.onServiceOutput({ stream: 'stderr', text });
        if (!text.includes('Error:')) return;
        if (outcome === 'declined') logger.warn('App-server stderr', { text: text.trim() });
        else logger.warn('App-server stderr received (see trace store for redacted text)');
      });
      proc.stdout?.on('data', (chunk: Buffer) => {
        hooks.onServiceOutput({ stream: 'stdout', text: chunk.toString() });
      });
    } else {
      proc.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        if (text.includes('Error:')) logger.warn('App-server stderr', { text: text.trim() });
      });
    }

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    proc.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timeout);
        const error: AppServerFlagExitError = new Error(`App-server exited with code ${code}`);
        if (hasWsAuthParserRejection(buffer)) {
          error.wsAuthParserRejection = true;
        }
        reject(error);
      }
    });
  });
}
