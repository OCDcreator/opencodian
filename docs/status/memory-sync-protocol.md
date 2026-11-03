# Memory Tree Git Sync Protocol

Shared contract between **OpenCodian** (`src/app/memory/MemoryGitSyncService.ts`),
**opencode-zmem** and **deepseek-zmem** (`src/sync.ts`). These plugins may target the same physical memory tree —
including one that ZCode workspace memory writes to — so every field below is a hard
compatibility point. Keep lock, branch, ignore and commit-shape drift guards aligned.
The cycle below describes OpenCodian's implementation; its unborn-adoption and
post-autostash checks are additional safety gates, not claims that every sibling
version implements the same checks.

## Tree and repo

- The git repo lives at the **tree root**: the directory that contains `projects/`.
  Every workspace bucket (`projects/<slug>-<hash16>/memory/`) travels together.
- Branch: `main` (created with `git init -b main`).
- Remote name: `origin`; the URL comes from plugin settings
  (`memorySyncRemoteUrl` / `syncRemoteUrl`). A missing origin is added; an existing
  origin is compared and **never silently rewritten**.
- Comparison is on the **expanded endpoint**: `git ls-remote --get-url` applies
  `insteadOf` aliases to both the stored origin and the configured URL, so the two
  plugins cannot disagree about where git will actually connect. User, case, trailing
  slash and `.git` suffix are ignored; a missing SSH port is a wildcard (the scp form),
  but two **different explicit ports** are different services and refuse. The raw
  stored URL is preserved when equivalent, including transport aliases.
- Every `remote.origin.url` and `remote.origin.pushurl` value is checked too: a
  matching fetch URL must not hide a different push destination.
- A mismatch refuses the cycle before worktree metadata, staging, commit, fetch or
  push, without changing origin, index or HEAD. Both raw and expanded URLs are shown
  with credentials redacted. The result detail is:
  `origin points at X (resolves to X') but config says Y (resolves to Y'); refusing to re-point. To migrate on purpose: git -C <root> remote set-url origin <Y>`.
  That command is guidance for an intentional migration; the service does not run it.
- Commit identity is injected per command (`git -c user.name=... -c user.email=...`),
  never from global config: `<plugin>-memory@<hostname>` +
  `memory-sync@<plugin>.local`. The `<plugin>` segment differs per plugin on purpose;
  everything else is identical.

## Cross-plugin lock

- File: `.memory-sync.lock` at the tree root (gitignored).
- Acquire: exclusive create (`open(wx)`) with `pid@timestamp` content.
- Stale takeover: a lock older than **5 minutes** is unlinked and re-acquired.
- A held lock makes the cycle a **no-op success** (`{ ok: true, detail: "locked" }`).
- Release: unconditional `unlink` in a `finally`.
- Lock acquisition errors other than `EEXIST` (root vanished, permissions) are caught
  and reported as `ok: false` — sync must never throw into the host process.

## Cycle order (exact)

1. **Root guard** — refuse (ok:false) before any `git init` / `add -A` when the root is:
   the user home directory, a filesystem root, a missing path, not a directory, or a
   non-empty directory with neither `.git` nor `projects/`.
2. Acquire the lock (no-op when held).
3. `git init -b main` if no `.git`; validate/add origin as described above.
4. **Unborn adoption** — before any local bootstrap commit, fetch `origin main`.
   An empty remote is tolerated; other fetch failures are reported. If `origin/main`
   exists, refuse collisions with untracked files (including ignored local drafts),
   then `git checkout --no-overwrite-ignore -b main origin/main`. Do not create
   unrelated root commits, force checkout, or reset history to make adoption work.
5. Bootstrap `.gitignore` and `.gitattributes`: append missing required lines to
   pre-existing files, never replace their contents.
6. **Unmerged gate** — `git ls-files -u` non-empty → abort the cycle (`ok: false`).
   This MUST run before `add -A`, because staging would clear the unmerged evidence
   and commit conflict markers.
7. `git add -A`.
8. **Secrets gate** — for **every staged file** (added/copied/modified/renamed, not
   only `.md`), read the **staged blob** (`git show :<path>`; never the mutable
   working-tree file) and run the credential heuristic (`scanForSecrets`). Unstage
   hits (`restore --staged` when HEAD exists, `rm --cached -f` on an unborn branch)
   and report them as `blockedSecrets`. Fail-closed: an unreadable staged blob or a
   failed unstage aborts the cycle instead of committing. Per-machine diagnostics
   (`metrics.jsonl`, `.last-injection.json`, the lock, OS junk) and editor scratch
   files (`*.tmp`, `~$*`, `.tmpdir/`) are unstaged even if an old tree tracks them.
9. Staged diff non-empty → `git commit -m "memory(<host>): <N> change(s)"`.
   Unstaged withheld secrets do not trigger an empty commit.
10. HEAD exists → `git fetch origin main`:
   - `couldn't find remote ref` (empty remote) → tolerated;
   - any other failure → report `ok: false`;
   - when `HEAD..origin/main` has commits, run
     `git merge --autostash --no-edit --no-overwrite-ignore origin/main`;
   - merge failure → attempt `git merge --abort`, report `ok: false`, never push;
   - re-check `git ls-files -u` after a successful merge: autostash restoration can
     leave conflicts despite exit code 0. Refuse push and retain evidence for repair.
11. HEAD exists and all gates passed → `git push -u origin main`.
12. Release the lock. Record the local cycle result when the root is safe and this
    was not a held-lock no-op. The trace redacts URL credentials and is skipped when
    `metrics.jsonl` is already tracked (ignore rules do not protect tracked paths).

## Git metadata files

`.gitignore` (exact fresh content, then kept complete):

```
# per-machine diagnostics never travel
.last-injection.json
metrics.jsonl
.DS_Store
Thumbs.db
.memory-sync.lock
```

`.gitattributes` (append-only index lines merge cleanly across machines):

```
# append-only memory indexes merge by union
MEMORY.md merge=union
```

## Timeouts and scheduling

- Per git command timeout: **20 s**, then kill. A killed git can leave
  `.git/index.lock`; a lock older than **60 s** is removed on the error path so the
  next cycle recovers (a fresh lock is left alone — a live git holds it).
- Scheduling (host-side, not protocol-critical): initial cycle ~5 s after load, write
  → 5 s trailing debounce, 5 min periodic. In-flight cycles never overlap (same host)
  and the lock serializes across plugins/processes.

## Conflict semantics

- Both sides append-only → most real divergence is reconciled by merge; concurrent
  `MEMORY.md` appends merge by union.
- A genuine content conflict aborts the merge, keeps local commits and file contents,
  and retries next cycle. The conflicting changes need an explicit resolution.
  Memory files never get auto-`--theirs`, rebase, reset or force-push.
- An autostash-pop conflict leaves unmerged entries; the next cycle refuses at the
  unmerged gate until a human resolves (`git status` in the tree root). The stash
  remains available; a successful merge command alone is not sufficient to push.

## What must never travel

Per-machine diagnostics (`.last-injection.json`, `metrics.jsonl`) and the lock file
stay out of the repo via `.gitignore`. OpenCodian additionally adds `/metrics.jsonl`
to local `.git/info/exclude` before appending Git-cycle traces, so origin refusals can
be diagnosed without modifying worktree metadata or the index. Trace fields are
`{t, ok, committed, pulled, pushed, blockedSecrets, detail}`. Unsafe-root refusals and
held-lock no-ops do not create traces; diagnostic write failures are fail-soft.

Extraction/recall metrics remain vault-local and are separate from these Git-cycle
records. `getStatus().last` retains the latest result for the memory status command.
The runtime shows a failure Notice with its detail, suppresses identical consecutive
failures, and re-arms after actual success or root/remote configuration changes.
Memory files that trip the credential heuristic are withheld at the secrets gate
on every cycle.
