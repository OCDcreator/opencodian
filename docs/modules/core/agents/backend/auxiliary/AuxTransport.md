# AuxTransport

> **源码**: `src/core/agents/backend/auxiliary/AuxTransport.ts`
> **状态**: [STABLE]

## Purpose

The HTTP seam auxiliary sessions (`OpenCodeAuxScope`, `OpenCodeAuxQuerySession`)
use to talk to their backend process, declared separately from `fetch` so the
host can swap it.

## Behavior

- `AuxTransport` is a minimal `(url, request) → response` function type with
  `GET`/`POST`/`DELETE`, headers, body, and an optional `AbortSignal`.
- `auxFetchTransport` is the default implementation on plain global `fetch`,
  used by Node hosts (the M1 audit runner, unit tests).
- Inside the Obsidian renderer raw `fetch` to localhost is blocked by the app
  CSP, so `OpenCodeAdapter` injects a `requestUrl`-backed transport instead
  (same reason `src/core/opencode/sdkFetch.ts` exists).

The seam is intentionally dumb: no retries, no JSON helpers, no logging —
callers keep their own error semantics.
