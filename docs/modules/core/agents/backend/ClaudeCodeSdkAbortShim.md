# ClaudeCodeSdkAbortShim

> **源码**: `src/core/agents/backend/ClaudeCodeSdkAbortShim.ts`
> **状态**: [STABLE]

## Purpose

Renderer-safe AbortController for the bundled Claude Agent SDK. On Electron 39
(Obsidian 1.13+) the SDK's unconditional internal AbortController construction
(e.g. the `forwardedAbort = Ad()` transport class field) crashes in the
renderer: Node's `events.setMaxListeners` rejects the DOM AbortSignal with
`ERR_INVALID_ARG_TYPE`, so every `sdk.query()` dies before a turn starts —
chat and auxiliary sessions alike.

## Behavior

- `createRendererSafeAbortController()` returns a controller whose signal is a
  Node `EventEmitter` (passes the strict `instanceof` checks) carrying the
  AbortSignal surface the SDK touches (`aborted`, `reason`, `addEventListener`,
  `removeEventListener`, `throwIfAborted`). Passing it as
  `options.abortController` also skips the SDK's default-controller path.
- `withSdkAbortControllerShim(fn)` swaps `globalThis.AbortController` for the
  safe constructor for `fn`'s synchronous window and always restores the
  original. `ClaudeCodeSdkLoader` wraps every facade `query` call with this, so
  all SDK consumers (chat runtime, diagnostics, auxiliary sessions) are covered
  from one choke point.

Node hosts (audit runner, unit tests) never need the shim: plain
`new AbortController()` is Node's own there and passes every check.
