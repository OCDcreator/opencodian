# BackendConfigRecoveryStore

Source: `src/core/agents/backend/configuration/BackendConfigRecoveryStore.ts`
Owner: `core.backend`
Updated: 2026-11-08

Machine-local recovery of secret-bearing plugin configuration values (`dsh.mcpServers` and OpenCode 2 `configContent`). It is separate from the allowlisted non-secret working-default snapshot stored in vault settings and from native-file configuration archives.

`backendRecoveryIdentity` requires an absolute vault base path and hashes it with the target kind. Without a stable identity the sections leave recovery unavailable. The store accepts only a 64-character lowercase hex identity and safe filename keys; path separators and traversal are rejected before filesystem access. Distinct vaults and targets cannot share snapshot slots.

The default root is `~/.opencodian/backend-config-recovery/<identity>/`. Every path component is checked before resolving so a symlinked root or parent cannot redirect secrets into a vault. Existing dedicated root/namespace directories are hardened to mode 0700 on archive; non-private roots are rejected on read. Snapshots are created at 0600 with a random temporary name and exclusive creation, then committed by rename. Five numbered slots rotate only after the new private bytes have been written. An empty overlay is a valid saved state and is retained. Symlinked or publicly readable snapshot files are neither listed nor restored. Failed private temporaries remain for inspection; the store runs no cleanup deletion.

`list` exposes index, modification time, SHA-256 revision and byte count only. `read` returns bytes only for a deliberate restore. Section owners compare both the listed archived revision and the current saved configuration revision, then re-enter their existing validated save/apply paths. The store itself does not write plugin settings, call adapters or claim runtime application. A successful settings save followed by archive failure must remain a successful save with unavailable history; the settings UI owns that distinction.

`tests/unit/core/agents/backend/configuration/BackendConfigRecoveryStore.test.ts` uses real filesystem fixtures retained inside the worktree. It covers bounded rotation, exact bytes, metadata-only listing, reopen persistence, empty overlays, per-vault/target isolation, stale slot identities, 0700/0600 modes, existing open directories, symlinked roots/parents/namespaces/slots, traversal and pre-existing temporary files/symlinks. It uses no teardown deletion. Section tests additionally cover current-state CAS and validated mutation behavior.
