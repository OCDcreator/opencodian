AGENTS.md

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- On this Windows machine, do not assume a `graphify` shim exists on `PATH`; local shell calls should use `py -m graphify ...`
- This repo's committed graph is `src`-scoped, not whole-repo scoped; refresh it with `py -m graphify update src` (AST-only, no API cost), not `graphify update .`
- If the local package and installed agent skill drift, check `py -m graphify --help` and refresh the Claude install with `py -m graphify install --platform claude`
