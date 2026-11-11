# Codex approval_policy / trust_mode — CLI 0.167.0 acceptance evidence (for the settings form model)

> Probed 2026-11-07 by the core API agent against the installed `codex-cli 0.167.0`
> (fnm global, auth via existing user key; no config file modified — `-c` CLI overrides only).
> Raw probes reproducible: `codex exec --skip-git-repo-check -c approval_policy=<value> "Reply with exactly OK"`.

## Verified CLI behavior

| Value passed to codex 0.167.0 | Result |
|---|---|
| `approval_policy=untrusted` | **Hard config-load error**: `Error: approval_policy = "untrusted" is no longer supported; remove this setting`. No turn starts. |
| `approval_policy=on-failure` | Accepted; run completes (real turn replied OK). |
| `approval_policy=on-request` | Accepted; run completes (real turn replied OK). |
| `approval_policy=never` | Accepted; run completes (this machine's config default). |

Note: `codex exec` TUI header prints `approval: never` on all of these because exec-mode
forces its own non-interactive approval adjustment at runtime; that display value is NOT
the config-validation verdict. The `-c` override IS read for validation — the `untrusted`
run errors out through the same mechanism the accepted values pass.

`trust_mode` / sandbox `untrusted`: the retired `untrusted` string is rejected the same way
for the approval-policy axis; there is no `untrusted` trust mode in 0.167.0 (config load
fails fast rather than silently ignoring). Treat any persisted `untrusted` value as
retired upstream state.

## Required form-model semantics (agreed with coordinator + UI agent)

1. **Offer only supported values** for new edits: `on-request` / `never` / `inherit`
   (inherit = do not write an override at all). `on-failure` remains valid upstream —
   keep it selectable only if product wants it; it is NOT rejected by 0.167.0.
2. **Preserve unknown/retired values on read.** If the user's existing project config
   contains a retired value (e.g. `untrusted`), the form must show it truthfully as
   retired/unsupported and must NOT silently round-trip-rewrite it when the user edits
   unrelated fields. No writes without an intentional user decision.
3. **Explicit repair guidance.** When the user chooses to repair a retired value, map to
   `on-request` (safe default) with visible confirmation, and show the upstream error text
   (`approval_policy = "untrusted" is no longer supported; remove this setting`) as the
   reason the repair is needed — the CLI hard-fails config load while the value persists.
4. Plugin-side normalizers already migrate persisted `'untrusted'` → `'on-request'` on
   load (research table `backend-fields-codex.md` §C); that behavior is consistent with
   the verified CLI rejection and stays.

## Provenance

- CLI version: `codex-cli 0.167.0` (matches `@openai/codex-sdk` 0.167.0 vendored binary).
- Probe transcript excerpts: `.tmp/backend-refresh-api/` (raw `codex exec` outputs captured
  in-session; error text quoted above is verbatim).
- Model catalog cross-check: `.tmp/backend-refresh-api/codex-appserver-catalog.json`
  (app-server `model/list`, `account/read`, `skills/list` on 0.167.0).
