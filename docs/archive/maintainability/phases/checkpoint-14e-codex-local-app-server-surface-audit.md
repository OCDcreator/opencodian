# Checkpoint 14E: Codex Local App-Server Surface Audit

> **Date**: 2026-06-10
> **Auditor**: main orchestrator session
> **Worktree**: `codex-sdk-capability`
> **Branch**: `feature/codex-sdk-capability`
> **Scope**: Confirm the locally installed Codex CLI actually exposes the app-server route discussed in 14D

---

## 1. Executive Summary

This checkpoint does **not** implement app-server integration.

It verifies something narrower but useful:

- the richer app-server route is not only documented upstream
- it is also present in the currently installed local Codex CLI toolchain

Current honest conclusion:

- **Codex app-server integration in this plugin** remains `未接入`
- but the local CLI confirms that an experimental app-server route, remote-control route, and remote client connection flag are already available for future feasibility work

---

## 2. Files Changed

### Status docs

| File | Action | Description |
|------|--------|-------------|
| `docs/status/codex-sdk-current-state-2026-06-09.md` | Updated | Added local CLI evidence that the installed Codex toolchain exposes `app-server`, `remote-control`, and `--remote` |
| `docs/status/checkpoint-14e-codex-local-app-server-surface-audit.md` | Created | This document |

### Product code

None.

### Tests

None.

---

## 3. Local CLI Evidence

### 3.1 Installed binary

```text
/Applications/Codex.app/Contents/Resources/codex
```

### 3.2 Top-level CLI surface

`codex --help` confirms these relevant commands/options exist in the installed CLI:

- `app-server` — `[experimental] Run the app server or related tooling`
- `remote-control` — `[experimental] Manage the app-server daemon with remote control enabled`
- `--remote <ADDR>` — connect the TUI to a remote app server endpoint
- `--remote-auth-token-env <ENV_VAR>` — bearer token env for remote app server websocket
- `-a, --ask-for-approval <APPROVAL_POLICY>` — local CLI approval surface

### 3.3 App-server subcommands

`codex app-server --help` confirms the installed CLI exposes:

- `daemon`
- `proxy`
- `generate-ts`
- `generate-json-schema`

It also exposes transport/auth-related options such as:

- `--listen <URL>` with `stdio://`, `unix://`, `ws://IP:PORT`, `off`
- `--ws-auth`
- `--ws-token-file`
- `--ws-shared-secret-file`

---

## 4. Truth Clarification

This checkpoint strengthens 14D in one specific way:

- richer app-server routing is not just an interpretation of docs
- the installed local Codex CLI already ships visible command surfaces for it

This still does **not** prove:

- that OpenCodian can adopt it cheaply
- that it is stable enough for productization
- that it already solves persisted history or approval UX in this plugin

So the honest bucket stays:

- **Codex app-server integration in OpenCodian**: `未接入`

---

## 5. Verification

This was a docs-only checkpoint.

### Product code changed

- **No**

### Commands used

```bash
which codex
codex --help
codex app-server --help
```

### Build / deploy

- not required because no product code changed

---

## 6. Honest Truth Buckets

### Current plugin

- current TypeScript SDK route remains the only integrated Codex product path
- app-server route remains `未接入`

### Local toolchain

- local Codex CLI surface confirms app-server/remote-control/remote connection capabilities exist for future investigation

---

## 7. Next Smallest Suggestion

- If continuing, the next smallest honest slice is a read-only protocol/shape audit:
  - inspect whether `codex app-server generate-json-schema` or `generate-ts` exposes enough protocol detail to map OpenCodian's current history/session/approval gaps to concrete remote surfaces

- Do **not** start implementation or UI work until that protocol-level audit confirms the likely integration value
