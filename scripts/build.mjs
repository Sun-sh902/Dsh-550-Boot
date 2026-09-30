#!/usr/bin/env node
/**
 * Builds lib/client.js — the single browser module the client loader expects.
 *
 * No bundler and no build dependencies on purpose. The client half may be
 * written in plain JavaScript: the loader's factory hands the module a
 * `require` that resolves the externals a plugin is allowed to use (`react`,
 * `react/jsx-runtime`), and the plugin's own sources are concatenated below
 * into that factory's body. That is exactly the shape tsdown emits for the
 * published client plugins — see any `lib/client.js` under
 * $DSH_HOME/profiles/*\/node_modules.
 *
 * Order matters: assets (stylesheet + markup) → show (the animation) → client
 * (the React surfaces and the plugin export). All three are plain top-level
 * declarations, so concatenation is a valid module body.
 *
 * Usage: node scripts/build.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Script } from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const PLUGIN_ID = 'dsh-550c-boot'
const PARTS = ['src/assets.js', 'src/show.js', 'src/enhance.js', 'src/client.js']

const read = (file) => readFileSync(resolve(root, file), 'utf8')

// ── cross-half contracts ────────────────────────────────────────────────────
//
// lib/index.js is the hand-written host half, evaluated at DSH startup; it carries
// two literals by hand that must equal src/client.js's (both files say "keep in
// sync"), plus the assumption that 'off' is a mode the browser half understands.
// Drift is SILENT at runtime — the cover simply never bows out, or the splash
// never retires it — so assert the pair here, inside the build CI already runs.
// This adds no step: `npm run build` is the whole pipeline.
function literal(source, pattern, what) {
  const match = pattern.exec(source)
  if (match === null) throw new Error(`build: ${what} not found (did the shape change?)`)
  return match[1]
}

const hostSource = read('lib/index.js')
const clientSource = read('src/client.js')
for (const name of ['MODE_KEY', 'FIRST_FRAME_GLOBAL']) {
  const pattern = new RegExp(`const ${name} = '([^']+)'`)
  const host = literal(hostSource, pattern, `${name} in lib/index.js`)
  const client = literal(clientSource, pattern, `${name} in src/client.js`)
  if (host !== client) {
    throw new Error(
      `build: ${name} drifted between the halves — lib/index.js has ${JSON.stringify(host)}, ` +
        `src/client.js has ${JSON.stringify(client)}`,
    )
  }
}
// The host half's whole mode story is "bow out for 'off'".
if (!/mode\s*===\s*["']off["']/.test(hostSource)) {
  throw new Error('build: lib/index.js no longer bows out on mode === "off" — the check below assumes it does')
}
const modeValues = literal(clientSource, /const MODE_VALUES = \[([^\]]+)\]/, 'MODE_VALUES in src/client.js')
if (!/['"]off['"]/.test(modeValues)) {
  throw new Error(`build: lib/index.js bows out on "off" but src/client.js MODE_VALUES is [${modeValues}]`)
}
process.stdout.write('build: host/client contracts ok (MODE_KEY, FIRST_FRAME_GLOBAL, "off")\n')

const body = PARTS.map((file) => `//#region ${file}\n${read(file).trimEnd()}\n//#endregion`).join('\n\n')

const out = `window.__ModuleLoader__.load({
\tid: ${JSON.stringify(PLUGIN_ID)},
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
${body
  .split('\n')
  .map((line) => (line.length > 0 ? `\t\t${line}` : line))
  .join('\n')}
\t\treturn module.exports;
\t}
});
`

// A client bundle is loaded as a <script> by the browser: the parser ends the
// block at the first `</script`, whatever the JavaScript around it means. The
// same trap the reference plugin documents for backticks in its CSS.
if (/<\/script/i.test(out)) throw new Error('build: output contains </script and would truncate in the browser')
if (/<!--/.test(out)) throw new Error('build: output contains <!-- (HTML comment open) and is unsafe in a script block')

// Parse the bundle before shipping it. The usual way this file goes wrong is a
// stray backtick inside a CSS template literal — the sheet is one template
// string, so a single backtick ends it early and the rest of the stylesheet
// becomes JavaScript. Compiling (not running) the output turns that into a loud
// build failure instead of a client that silently fails to load.
try {
  new Script(out)
} catch (error) {
  throw new Error(
    `build: generated bundle does not parse — ${error.message}\n` +
      '  (most likely a backtick inside a CSS template literal in src/enhance.js or src/assets.js)',
  )
}

writeFileSync(resolve(root, 'lib/client.js'), out)
process.stdout.write(`build: wrote lib/client.js (${out.length} chars)\n`)
