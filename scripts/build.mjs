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
 * Order matters: each machine's assets (stylesheet + markup) → its show (the
 * animation) → its content layer → its registry entry → the registry itself →
 * client (the React surfaces and the plugin export). All of them are plain
 * top-level declarations, so concatenation is a valid module body, and a machine
 * only ever adds files to its own directory. The 「正在开发」 placeholder a
 * machine without a timeline plays (src/variants/wip/) comes before the entries
 * that reference it, because an entry reads its `WIP_CSS` at module scope.
 *
 * Usage: node scripts/build.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Script } from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const packageName = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).name
const patch = readFileSync(resolve(root, 'cordis.patch.yml'), 'utf8')
if (!patch.includes(`      name: ${packageName}\n`)) {
  throw new Error('build: cordis.patch.yml package name must match package.json')
}
const PLUGIN_ID = packageName
const PARTS = [
  'src/variants/550c/assets.js',
  'src/variants/550c/show.js',
  'src/variants/550c/enhance.js',
  'src/variants/550c/index.js',
  'src/variants/wip/index.js',
  // 550C's opening apparatus + 550W's traced wordmark, parameterised. It has to
  // sit ahead of src/variants/550w/index.js: that entry reads BOOT_MARKUP_550W at
  // module scope, and a missing shared module is silent at runtime (the machine
  // boots with `boot: undefined`) — the identifier check below is what makes it
  // loud instead.
  'src/variants/shared/boot.js',
  'src/variants/550w/assets.js',
  'src/variants/550w/show.js',
  'src/variants/550w/enhance.js',
  'src/variants/550w/index.js',
  'src/variants/550a/index.js',
  'src/variants/registry.js',
  'src/client.js',
]

const read = (file) => readFileSync(resolve(root, file), 'utf8')

// ── cross-half contracts ────────────────────────────────────────────────────
//
// lib/index.js is the hand-written host half, evaluated at DSH startup; it carries
// literals by hand that must equal the browser half's (both sides say "keep in
// sync"): the mode key, the handshake global, the machine key, and the machine →
// cover-colour table — plus the assumption that 'off' is a mode the browser half
// understands. Drift is SILENT at runtime: the cover never bows out, the splash
// never retires it, or another machine boots with a 550C-coloured first frame. So
// assert the pairs here, inside the build CI already runs. This adds no step:
// `npm run build` is the whole pipeline.
function literal(source, pattern, what) {
  const match = pattern.exec(source)
  if (match === null) throw new Error(`build: ${what} not found (did the shape change?)`)
  return match[1]
}

/** Read a flat `{ 'key': 'value', … }` literal the checker can actually follow. */
function pairs(source, pattern, what) {
  const out = {}
  for (const entry of literal(source, pattern, what).split(',')) {
    const match = /^\s*['"]?([\w-]+)['"]?\s*:\s*['"]([^'"]+)['"]\s*$/.exec(entry)
    if (match === null) throw new Error(`build: ${what} has an entry this check cannot read: "${entry.trim()}"`)
    out[match[1]] = match[2]
  }
  return out
}

const hostSource = read('lib/index.js')
const clientSource = read('src/client.js')
const registrySource = read('src/variants/registry.js')
for (const name of ['MODE_KEY', 'FIRST_FRAME_GLOBAL', 'VARIANT_KEY']) {
  const sources = name === 'MODE_KEY' || name === 'FIRST_FRAME_GLOBAL' ? [hostSource, clientSource] : [hostSource, registrySource]
  const pattern = new RegExp(`const ${name} = '([^']+)'`)
  const host = literal(sources[0], pattern, `${name} in lib/index.js`)
  const client = literal(sources[1], pattern, `${name} in the browser half`)
  if (host !== client) {
    throw new Error(
      `build: ${name} drifted between the halves — lib/index.js has ${JSON.stringify(host)}, ` +
        `the browser half has ${JSON.stringify(client)}`,
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
// Every machine needs a cover colour, and no cover colour may outlive its machine:
// the splash paints VARIANT_BG[id] on the same frame the host half retires the
// cover that used the same value, so a missing or extra entry is a visible seam.
const hostBg = pairs(hostSource, /const VARIANT_BG = \{([^}]*)\}/, 'VARIANT_BG in lib/index.js')
const registryBg = pairs(registrySource, /const VARIANT_BG = \{([^}]*)\}/, 'VARIANT_BG in src/variants/registry.js')
for (const [id, colour] of Object.entries(hostBg)) {
  if (registryBg[id] !== colour) {
    throw new Error(
      `build: VARIANT_BG["${id}"] drifted — lib/index.js has ${colour}, the registry has ${String(registryBg[id])}`,
    )
  }
}
const variantIds = [...literal(registrySource, /const VARIANTS = \{([^}]*)\}/, 'VARIANTS').matchAll(/'([^']+)'\s*:/g)].map(
  (match) => match[1],
)
const missing = variantIds.filter((id) => hostBg[id] === undefined)
if (missing.length > 0) {
  throw new Error(`build: machine(s) ${missing.join(', ')} have no VARIANT_BG entry — the first frame would be 550C's`)
}
const orphan = Object.keys(hostBg).filter((id) => !variantIds.includes(id))
if (orphan.length > 0) {
  throw new Error(`build: VARIANT_BG has ${orphan.join(', ')} but no such machine is registered`)
}

// A machine's cover colour and its own stylesheet must agree. mountOverlay()
// inlines VARIANT_BG[id] as `--bg` on the overlay host, so the inline always
// beats the sheet's `:host{--bg:…}`: if the two drift, the machine plays its
// whole run on the wrong ground and nothing about the CSS says so. 550W shipped
// that bug — `#04070a` in the tables against `--bg:#030303` in the sheet, a
// blue-black first frame — which is why this check exists.
//
// The value read is the machine's own default `--bg`, i.e. the one outside any
// `:host([data-scheme=…])` override. A machine whose sheet declares no `--bg`
// (the 「正在开发」 placeholder, which paints `var(--bg, …)` and takes the colour
// purely from the inline) is reported and skipped rather than failed.
/**
 * A machine's stylesheet as text. Two shapes exist in the tree: the ported 550C
 * sheet is a JSON string (extract.mjs emits `JSON.stringify(css)`), the
 * hand-written ones are template literals — so both are read here rather than
 * assuming one.
 */
const cssSourceOf = (name) => {
  for (const file of PARTS) {
    const source = read(file)
    const at = new RegExp(`const ${name} = `).exec(source)
    if (at === null) continue
    const start = at.index + at[0].length
    const quote = source[start]
    if (quote === '`') {
      const end = source.indexOf('`', start + 1)
      if (end === -1) throw new Error(`build: unterminated template literal for ${name} in ${file}`)
      return { file, text: source.slice(start + 1, end) }
    }
    if (quote === '"') {
      let i = start + 1
      while (i < source.length) {
        if (source[i] === '\\') i += 2
        else if (source[i] === '"') break
        else i += 1
      }
      return { file, text: JSON.parse(source.slice(start, i + 1)) }
    }
    throw new Error(`build: ${name} in ${file} is neither a template literal nor a JSON string`)
  }
  throw new Error(`build: no const ${name} = … in any source file`)
}
/** The style constant a machine's own entry names: `id: '550w', … css: CSS_550W`. */
const cssConstantOf = (id) => {
  for (const file of PARTS) {
    const match = new RegExp(`id: '${id}'[\\s\\S]*?css: ([A-Z_0-9]+)`).exec(read(file))
    if (match !== null) return match[1]
  }
  throw new Error(`build: no entry for ${id} names a css constant`)
}
const bgInCss = (text) => {
  const match = /(?:^|[;{\s])--bg:\s*(#[0-9a-fA-F]{3,8})\s*[;}]/.exec(text)
  return match === null ? null : match[1]
}
const bgNotes = []
for (const id of variantIds) {
  const cssName = cssConstantOf(id)
  const { file, text } = cssSourceOf(cssName)
  const declared = bgInCss(text)
  if (declared === null) {
    bgNotes.push(`build: ${id} declares no --bg in ${file} (${cssName}); the cover colour is the inline only — not checked`)
    continue
  }
  if (declared !== hostBg[id]) {
    throw new Error(
      `build: VARIANT_BG["${id}"] is ${hostBg[id]} but ${file} declares --bg:${declared} — ` +
        'the inline wins in mountOverlay(), so the machine would play on the wrong ground',
    )
  }
  bgNotes.push(`build: ${id} cover ${hostBg[id]} === ${cssName} --bg`)
}
process.stdout.write(
  `build: host/client contracts ok (MODE_KEY, FIRST_FRAME_GLOBAL, VARIANT_KEY, VARIANT_BG ×${variantIds.length}, "off")\n`,
)
for (const note of bgNotes) process.stdout.write(`${note}\n`)

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

// Every window a machine can open is keyed by `data-p`, and show.js builds its
// lookup Map from those keys — two windows sharing one tag means the second
// silently replaces the first and one of them becomes unopenable. 550W shipped
// exactly that (`RELAY LINK` and `PRIVILEGE ESCALATION` both tagged `link`, so a3
// had no link step and `priv` was a dead key), which is why this is asserted now.
const popupTags = [...read('src/variants/550w/assets.js').matchAll(/<div class="popup" data-p="([^"]+)"/g)].map(
  (match) => match[1],
)
if (popupTags.length === 0) throw new Error('build: 550W declares no windows at all')
const duplicateTags = popupTags.filter((tag, index) => popupTags.indexOf(tag) !== index)
if (duplicateTags.length > 0) {
  throw new Error(`build: 550W tags ${[...new Set(duplicateTags)].join(', ')} twice — a window would be unopenable`)
}
process.stdout.write(`build: 550W windows ok (${popupTags.join(', ')} — no duplicate data-p)\n`)

// A machine can be fully written and still boot the placeholder: the entry has
// to be wired to everything the machine owns, and the shared module has to be
// concatenated BEFORE the entry that reads it at module scope. Both failures are
// silent at runtime — the splash just plays somebody else's screen — so the
// bundle is asked for the machine's four identifiers by name.
const REQUIRED_BUNDLE_IDENTIFIERS = ['BOOT_MARKUP_550W', 'CSS_550W', 'createShow550W', 'enhanceShow550W']
const missingIdentifiers = REQUIRED_BUNDLE_IDENTIFIERS.filter(
  (name) => !new RegExp(`(?:const|function) ${name}\\b`).test(out),
)
if (missingIdentifiers.length > 0) {
  throw new Error(
    `build: lib/client.js defines no ${missingIdentifiers.join(', ')} — 550W would boot with a missing ` +
      'surface (is src/variants/shared/boot.js still in PARTS, ahead of src/variants/550w/index.js?)',
  )
}

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
