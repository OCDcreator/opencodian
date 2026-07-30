# Architecture Approvals

> **An approval request file here is NOT a trust root.** It is a diff-bound
> *request* that only becomes effective when protected CI verifies an external
> reviewer / CODEOWNERS identity. A repo-writable JSON alone can never make a
> gate PASS.

## Why JSON alone cannot approve

Anyone with write access to the repo can create or edit a JSON file here. So the
approval trust root must come from **outside** the repo: protected CI verifies a
required reviewer or CODEOWNERS host API and supplies `EXTERNAL_REVIEW_AUTHORITY`
to `check:architecture-approvals`. Locally, the gate always returns
`REVIEW_REQUIRED` — never merge-ready.

This mechanism prevents accidental/unreviewed merges and agent self-approval. It
does not claim to resist a malicious actor with repository administrator rights.

## Request schema

```json
{
  "schemaVersion": 1,
  "id": "2026-07-31-main-composition-touch",
  "rules": ["BUDGET_HOTSPOT_GROWTH"],
  "paths": ["src/main.ts"],
  "baseSha": "<full 40-char sha>",
  "scopeDigest": "sha256:<64 hex>",
  "reason": "composition-only wiring for diagnostics runtime",
  "evidence": ["tests/unit/app/diagnostics/DiagnosticsRuntimeCoordinator.test.ts"],
  "requestedBy": "agent",
  "authorityPolicy": "protected-review",
  "expiresAt": "2026-08-06T00:00:00Z",
  "singleUse": true
}
```

## What can and cannot be approved

**Approvable (budget/review rules only):** hotspot shell growth, public-entry-
point additions, temporary boundary exceptions.

**NEVER approvable (hard invariants):** `DEPENDENCY_DIRECTION`,
`NEW_ARCHITECTURE_CYCLE`, `DUPLICATE_CANONICAL_STATE`, diagnostics redaction /
chat isolation, `TEST_FRESHNESS`, `MODULE_DOC_FRESHNESS`, `GRAPHIFY_FRESHNESS`.

## How the gate binds

`check:architecture-approvals` recomputes the **committed** candidate digest and
only honors a request when all of: digest matches, paths cover every changed
path, rules cover every triggered rule, baseSha matches git's resolved base, not
expired, `singleUse` request is new relative to merge-base, workspace/index
clean, AND an external authority is present. Any binding mismatch → FAIL.

## Obtaining the scope digest

```bash
node scripts/check-change-scope.mjs --base <ref>   # prints committed digest
node scripts/check-change-scope.mjs --base <ref> --json | jq -r .digests.committed
```

Use the committed digest (`digests.committed`) prefixed with `sha256:`.
