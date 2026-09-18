# Owner: core.remotecontrol

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.
- 2026-09-18 (R-C6): owner registered for the FlowText R-C6 external interface (远程驱动) — a token-gated loopback HTTP control plane with audited sessions. Registered under the owner model's high-risk-isolation provision: a self-owning listening socket is a complete behavior unit and a security boundary, not a thin helper layer (same precedent class as `feature.inline-edit`).

- **Layer:** `core` (may import layers: shared, core)
- **Risk:** high — this owner is a network listener and the plugin's first self-owned server surface.
- **Include:** `src/core/remotecontrol/**`

## Responsibilities
- R-C6 remote-drive loopback interface: listener lifecycle (off = zero construction, no `http.Server`), Host allowlist, closed method/path whitelist, timing-safe token auth with one fixed 401 copy, closed error-code set, 64 KiB body cap.
- Dedicated remote OpenCode session ownership: `createSession(setCurrent: false)`, chunk-driven to a terminal state through the injected narrow session-driver port, single-flight scheduling with 409, hard-deadline abort returning an explicitly partial timeout result.
- Audited request lifecycle on a dedicated shared-diagnostics TraceStore with dual redaction; instructions recorded as length + sha256 prefix only, tokens as fingerprints only.

## Entrypoints
- `src/core/remotecontrol/index.ts`
- `src/core/remotecontrol/RemoteControlService.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `shared.diagnostics`, `core.types`, `core.opencode` (via the narrow `RemoteControlSessionDriver` port — the source never imports `OpenCodeService`; `main.ts` binds the port to the service's existing public API, so the OpenCode service itself is unchanged).
- **Forbidden dependencies:** `feature`, `app` — the listener must never import views; composition lives in `app.composition` (`main.ts` constructs, injects, `applySettings()`, `dispose()` only).
- **Adjacent owners** (prefer editing these when out of scope): `app.composition`, `core.opencode`, `feature.settings-plugin` (the settings section file).

## Focused tests
- `tests/unit/core/remotecontrol/**` (auth, routing whitelist, audit shape, service e2e/contract) plus `tests/unit/core/types/remoteControlSettings.test.ts` for the settings normalization.

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`, `npm run build`.

## Hard invariants
- **Off means zero construction**: while `remoteControlEnabled` is false, no `http.Server` is created and no `listen` call happens. The contract test proves this with `LocalProcessProbe.canBindLocalEndpoint` on `127.0.0.1` and `::1`.
- **No anonymous path, ever**: a missing and a wrong token must stay byte-for-byte indistinguishable (single fixed 401 body).
- **Closed operation set**: only `GET /v1/health`, `POST /v1/instruction`, `GET /v1/session`. The instruction body is exactly one string field; any other field is structurally rejected — out-of-vault reads are impossible by construction, not by filtering. Never add a file/config/credential endpoint without a new design gate.
- **Fixed fail-closed order**: Host → method/path → token → body → single-flight → execute. Every pre-execute rejection is audited.
- **The audit must stay content-free**: instruction = length + hash prefix; token = fingerprint; dual redaction (hardened TraceRedactor with dynamically collected known secrets + report sanitizer on export). Do not add a "debug content capture" switch in this owner.
- Do not cross `forbiddenDependencies`; do not replicate canonical state in another owner; changes here must update the matching `docs/modules/**` pages.
