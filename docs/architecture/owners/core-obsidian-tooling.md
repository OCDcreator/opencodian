# Owner: core.obsidian-tooling

> The manifest (`architecture-owners.config.json`) is the canonical truth source; this page narrates the model and records hard-to-automate rationale.

- **Layer:** `core` (may import layers: shared, core)
- **Risk:** medium
- **Include:** `src/core/obsidianTooling/**`

## Responsibilities
- R-B4 Obsidian native tooling core (route A: official desktop CLI), decided in `flowtext-parity.md` §10 Q2 (CLI first, MCP as a later supplement)
- CLI subcommand catalog and fail-closed high-impact classification — the single source the gate script embeds
- generation of the `obsidian-gate` wrapper script: the MECHANISM behind high-impact user confirmation (request/decision handshake), not prompt wording (§11.3)
- request/decision file schema for the confirmation flow (strict validation, single-line decision documents)
- backend-neutral tooling injection block, per-epoch planning and the options-bag helpers shared by all four adapter seams
- desktop CLI availability probe (structured, injectable, never throws)

## Canonical state (truth home)
- command catalog and classification sets
- gate script template
- request/decision schema

## Entrypoints
- `src/core/obsidianTooling/index.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `core.types`
- **Forbidden dependencies:** `feature`, `app` (app contact — vault adapter, Modals, fs watchers — is bound by `app.obsidian-tooling`)
- **Adjacent owners:** `app.obsidian-tooling`, `core.types`

## Focused tests
- `tests/unit/core/obsidianTooling/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- Unknown CLI subcommands classify as high-impact (fail closed): a future CLI command can never silently bypass the confirmation gate.
- The gate script is deterministic and embeds the classification sets from the catalog; unknown subcommands route through the gate at run time, stale wrappers are regenerated on every `applySettings()`.
- No decision means no execution: deny → exit 3, timeout/expired → exit 4, unreadable decision → exit 5, always without running the CLI.
- Honest enforcement boundary (requirement §6.7): the wrapper gates the SANCTIONED path. A same-user process — including a misbehaving model — can still call the raw `obsidian` binary or forge decision files in the vault-owned requests directory. This residual risk is disclosed in the injection block, the settings UI, and here; it is NOT closable in user space without a platform trust anchor. Closing it is the motivation for the deferred route B (self-hosted MCP), not a reason to fake a guarantee.
- This milestone ships a POSIX sh wrapper (macOS/Linux); Windows is surfaced as unsupported, never silently degraded.
- Injection is once per context epoch and produces nothing when the mode is off.

## Change log
- 2026-09-18 (FlowText R-B4): owner registered with the initial implementation (catalog, gate script generator, request/decision schema, injection seam, probe, status contract).
