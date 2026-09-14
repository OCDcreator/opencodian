# Memory Tree Git Sync Protocol

Shared contract between **OpenCodian** (`src/app/memory/MemoryGitSyncService.ts`) and
**opencode-zmem** (`src/sync.ts`). Both plugins may target the same physical memory tree —
including one that ZCode workspace memory writes to — so every field below is a hard
compatibility point. If you change one side, change the other, and keep the drift-guard
tests (`protocol shape` in both repos' sync tests) green.

## Tree and repo

- The git repo lives at the **tree root**: the directory that contains `projects/`.
  Every workspace bucket (`projects/<slug>-<hash16>/memory/`) travels together.
- Branch: `main` (created with `git init -b main`).
- Remote name: `origin`; the URL comes from plugin settings
  (`memorySyncRemoteUrl` / `syncRemoteUrl`) and is re-applied every cycle.
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
3. Bootstrap: `git init -b main` if no `.git`; ensure `.gitignore` and `.gitattributes`
   contain the required lines (append missing lines to pre-existing files, never
   rewrite); (re)set `origin`.
4. **Unmerged gate** — `git ls-files -u` non-empty → abort the cycle (`ok: false`).
   This MUST run before `add -A`, because staging would clear the unmerged evidence
   and commit conflict markers.
5. `git add -A`.
6. **Secrets gate** — for every staged `*.md` (added/copied/modified/renamed), run the
   credential heuristic (`scanForSecrets`); unstage hits (`restore --staged` when HEAD
   exists, `rm --cached` on an unborn branch) and report them as `blockedSecrets`.
   Fail-closed: if the unstage command fails, the cycle aborts instead of committing.
7. `git status --porcelain` non-empty → `git commit -m "memory(<host>): <N> change(s)"`.
8. HEAD exists → `git pull --rebase --autostash origin main`:
   - `couldn't find remote ref` (empty remote) → tolerated;
   - any other failure → `git rebase --abort` (keep local state), report `ok: false`.
   - Unborn HEAD → `git fetch origin` (failure is reported, never silent) then
     `git checkout -B main origin/main` to adopt remote history; a missing
     `origin/main` (empty remote) is tolerated.
9. HEAD or a fresh commit exists → `git push -u origin main`.
10. Release the lock.

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

- Both sides append-only → most real divergence is reconciled by rebase; concurrent
  `MEMORY.md` appends merge by union.
- A genuine content conflict aborts the rebase, keeps local commits, and retries next
  cycle — it wedges until the remote change is manually merged or the local commit is
  rebased by hand. This is deliberate: memory files never get auto-`--theirs`.
- An autostash-pop conflict leaves unmerged entries; the next cycle refuses at the
  unmerged gate until a human resolves (`git status` in the tree root).

## What must never travel

Per-machine diagnostics (`.last-injection.json`, `metrics.jsonl`) and the lock file
stay out of the repo via `.gitignore`. Metrics additionally stay **outside** the shared
tree entirely (OpenCodian keeps them in the vault). Memory files that trip the
credential heuristic are withheld at the secrets gate on every cycle.
