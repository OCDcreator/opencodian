#!/usr/bin/env node
/**
 * patch-unrs-resolver.mjs
 *
 * Applies a pure-JS fallback to `node_modules/unrs-resolver/index.js` when the
 * native .node binding cannot load (e.g. macOS hardened-runtime team-ID mismatch,
 * or missing platform binary).
 *
 * The patch replaces the fatal `throw new Error("Cannot find native binding")`
 * block with a lightweight JsResolverFactory that delegates to Node's built-in
 * `require.resolve` and filesystem extension probing. This is sufficient for
 * Jest 30's module-resolution needs while the native binding is unavailable.
 *
 * Intended as a `postinstall` hook so the fix survives `npm install` / CI.
 * Idempotent: safe to run multiple times.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const targetFile = resolve(__dirname, '..', 'node_modules', 'unrs-resolver', 'index.js')

// ── JS fallback implementation ─────────────────────────────────────────────

const JS_FALLBACK = `
  // Fallback: provide a JS-based ResolverFactory using Node's require.resolve
  // when the native binding cannot load (e.g. macOS hardened runtime mismatch).
  const nodePath = require('node:path')
  const nodeFs = require('node:fs')

  const DEFAULT_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.json', '.node']

  function resolveWithExtensions(basedir, request, extensions) {
    try {
      const resolved = require.resolve(request, { paths: [basedir] })
      return { path: resolved }
    } catch (_) { /* fall through */ }

    if (request.startsWith('./') || request.startsWith('../') || request.startsWith('/')) {
      const fullPath = nodePath.resolve(basedir, request)
      try { if (nodeFs.statSync(fullPath).isFile()) return { path: fullPath } } catch (_) {}
      for (const ext of (extensions || DEFAULT_EXTENSIONS)) {
        const withExt = fullPath + ext
        try { if (nodeFs.statSync(withExt).isFile()) return { path: withExt } } catch (_) {}
      }
      for (const ext of (extensions || DEFAULT_EXTENSIONS)) {
        const indexPath = nodePath.join(fullPath, 'index' + ext)
        try { if (nodeFs.statSync(indexPath).isFile()) return { path: indexPath } } catch (_) {}
      }
    }
    return { path: undefined, error: 'Cannot resolve \\'' + request + '\\' from \\'' + basedir + '\\'' }
  }

  class JsResolverFactory {
    constructor(opts) { this._opts = opts || {} }
    cloneWithOptions(opts) { return new JsResolverFactory({...this._opts, ...opts}) }
    sync(basedir, request) { return resolveWithExtensions(basedir, request, this._opts.extensions) }
    async(basedir, request) { return Promise.resolve(this.sync(basedir, request)) }
    clearCache() {}
  }

  nativeBinding = { ResolverFactory: JsResolverFactory }
`

// ── Patch logic ────────────────────────────────────────────────────────────

let content
try {
  content = readFileSync(targetFile, 'utf8')
} catch {
  console.log('[patch-unrs-resolver] node_modules/unrs-resolver/index.js not found, skipping.')
  process.exit(0)
}

// Already patched?
if (content.includes('JsResolverFactory')) {
  console.log('[patch-unrs-resolver] Already patched, skipping.')
  process.exit(0)
}

// Find the throw block by looking for the unique marker string
const MARKER = 'Cannot find native binding.'
if (!content.includes(MARKER)) {
  console.error('[patch-unrs-resolver] Marker string not found. The upstream package may have changed.')
  process.exit(1)
}

// Locate the `if (!nativeBinding) { ... }` block that contains the marker
const blockStart = content.lastIndexOf('if (!nativeBinding) {', content.indexOf(MARKER))
if (blockStart === -1) {
  console.error('[patch-unrs-resolver] Could not locate the if-block containing the marker.')
  process.exit(1)
}

// Find matching closing brace (simple brace counting)
let depth = 0
let blockEnd = -1
for (let i = blockStart; i < content.length; i++) {
  if (content[i] === '{') depth++
  if (content[i] === '}') {
    depth--
    if (depth === 0) {
      blockEnd = i + 1
      break
    }
  }
}

if (blockEnd === -1) {
  console.error('[patch-unrs-resolver] Could not find matching closing brace.')
  process.exit(1)
}

const before = content.slice(0, blockStart)
const after = content.slice(blockEnd)

content = before + 'if (!nativeBinding) {' + JS_FALLBACK + '}' + after

writeFileSync(targetFile, content, 'utf8')
console.log('[patch-unrs-resolver] Applied JS fallback patch successfully.')
