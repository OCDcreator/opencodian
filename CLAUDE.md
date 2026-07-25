AGENTS.md

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- On this Windows machine, do not assume a `graphify` shim exists on `PATH`; local shell calls should use `py -m graphify ...`
- This repo's committed graph is `src`-scoped, not whole-repo scoped; refresh it with `npm run graphify:update:src`, not `graphify update .`
- The repo-local graphify wrapper updates `src`, syncs committed artifacts back to root `graphify-out/`, and removes transient `src/graphify-out/` so git does not fill with generated noise
- If the local package and installed agent skill drift, check `py -m graphify --help` and refresh the Claude install with `py -m graphify install --platform claude`

<!-- codegraph:start -->
# CodeGraph — Code Intelligence

This project uses the local CodeGraph 1.5 index. Use the `codegraph_explore` MCP tool, or `./node_modules/.bin/codegraph explore`, for architecture and execution-flow questions.

## Required workflow

- Before modifying a function, class, or method, run CodeGraph `callers` and `impact`, setting an explicit finite depth on impact. Report distinct direct callers whose kind is `function` or `method` (exclude `file` nodes from the caller count), the selected depth, and the returned blast-radius size; do not invent a risk level that CodeGraph did not emit.
- If the symbol resolves to multiple definitions, or the limited-depth blast radius crosses the intended module or task scope, stop after reporting the per-definition callers and blast radius unless the user explicitly allows a reviewed continuation.
- For same-named symbols, use the MCP tools' `file` argument. CodeGraph 1.5.0 CLI `impact` and `callers` have no `--file`; first resolve with `query`, then use a qualified symbol such as `OpencodeConfigModal::restoreHistoryEntry`, and verify the returned root file before relying on the result.
- After changes, inspect the affected scope with `git diff --name-only --diff-filter=ACMR | ./node_modules/.bin/codegraph affected --stdin --path . --json`.
- Use CodeGraph `status` and `sync` to check or refresh the index. Agents must not run `init` without explicit instruction.
- If CodeGraph transport or index is unavailable, report that limitation truthfully and do not fabricate results.

<!-- codegraph:end -->
