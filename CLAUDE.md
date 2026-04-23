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
