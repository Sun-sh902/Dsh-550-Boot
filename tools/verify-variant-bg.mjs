#!/usr/bin/env node
/**
 * The first-frame cover must be the machine's colour.
 *
 * lib/index.js paints the cover before any plugin code exists, so it cannot ask
 * the registry: it reads the same localStorage key the splash does and picks from
 * its own table. This drives the REAL injected rows and checks, per machine, that
 * the ::before background matches, that an unknown value falls back to 550C, that
 * a style-only page still paints the CSS fallback, and that end() leaves neither
 * the class nor the variable behind.
 *
 * Usage: npm run verify:variant-bg
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { once } from 'node:events'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { connect, evaluate, findPage, launchChrome, scratch, serve, sleep } from './lib/harness.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const plugin = resolve(here, '..')
const VARIANT_KEY = 'dsh-550c-boot:variant'

function args(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (!key?.startsWith('--')) continue
    const next = argv[i + 1]
    out[key.slice(2)] = next === undefined || next.startsWith('--') ? true : argv[++i]
  }
  return out
}

const opt = args(process.argv.slice(2))
const port = Number(opt.port ?? 9430)

const mod = await import(pathToFileURL(join(plugin, 'lib/index.js')).href)
const table = []
mod.apply({
  on: (name, handler) => {
    if (name === 'webserver/index-inject') handler(table)
  },
})
const style = table.find((row) => row.kind === 'style').text
const script = table.find((row) => row.kind === 'script').text
const rows = table
  .map((row) => (row.kind === 'style' ? `<style>${row.text}</style>` : `<script>${row.text}</script>`))
  .join('\n')
const expected = JSON.parse(/var bg=(\{[^}]*\})/.exec(script)[1])
const fallback = /--dsh550c-first-bg,(#[0-9a-f]{6})/.exec(style)[1]
console.log(`plugin:  ${plugin}`)
console.log(`table:   ${JSON.stringify(expected)}`)
console.log(`css fallback: ${fallback}\n`)

/** The seed has to run BEFORE the injected rows: the cover script reads the key
 *  during head parsing, which is the whole point of it. */
const page = (markup, seed) => `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>cover probe</title>
<style>html,body{margin:0;height:100%;background:#111}</style>
<script>try { ${seed} } catch (error) {}</script>
${markup}
</head><body><div id="root"></div>
</body></html>
`

const stage = scratch('dsh550c-cover-')
mkdirSync(stage, { recursive: true })

const CASES = [
  { file: 'c.html', seed: `localStorage.setItem('${VARIANT_KEY}','550c')`, expect: expected['550c'] },
  { file: 'w.html', seed: `localStorage.setItem('${VARIANT_KEY}','550w')`, expect: expected['550w'] },
  { file: 'a.html', seed: `localStorage.setItem('${VARIANT_KEY}','550a')`, expect: expected['550a'] },
  { file: 'junk.html', seed: `localStorage.setItem('${VARIANT_KEY}','550z')`, expect: expected['550c'] },
  { file: 'none.html', seed: `localStorage.removeItem('${VARIANT_KEY}')`, expect: expected['550c'] },
]
for (const testCase of CASES) writeFileSync(resolve(stage, testCase.file), page(rows, testCase.seed))
writeFileSync(resolve(stage, 'style-only.html'), page(`<style>${style}</style>`, ''))

const hexToRgb = (hex) => {
  const value = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(value.slice(at, at + 2), 16))
  return `rgb(${r}, ${g}, ${b})`
}

const server = await serve(stage)
const chrome = launchChrome({ port, profile: scratch('dsh550c-cover-profile-') })

const PROBE = `const root = document.documentElement;
 return {
   covered: root.classList.contains('dsh550c-first'),
   paint: getComputedStyle(root, '::before').backgroundColor,
   varValue: root.style.getPropertyValue('--dsh550c-first-bg') || null,
 };`

let session
let failed = false
try {
  const target = await findPage(port)
  session = await connect(target.webSocketDebuggerUrl)
  await session.send('Page.enable')
  await session.send('Runtime.enable')

  for (const testCase of CASES) {
    await session.send('Page.navigate', { url: `${server.origin}/${testCase.file}` })
    await evaluate(session, 'return true;')
    await sleep(300)
    const probe = await evaluate(session, PROBE)
    const want = hexToRgb(testCase.expect)
    const ok = probe.covered === true && probe.paint === want && probe.varValue === testCase.expect
    if (!ok) failed = true
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${testCase.file.padEnd(12)} cover ${probe.paint} (want ${want}) ` +
        `var ${JSON.stringify(probe.varValue)} covered=${probe.covered}`,
    )
    await evaluate(session, 'window.__dsh550cFirstFrame.end(); return true;')
    const after = await evaluate(session, PROBE)
    const clean = after.covered === false && after.varValue === null && after.paint === 'rgba(0, 0, 0, 0)'
    if (!clean) failed = true
    console.log(
      `      after end(): covered=${after.covered} var=${JSON.stringify(after.varValue)} ` +
        `paint=${after.paint} ${clean ? '✓' : '✗'}`,
    )
  }

  await session.send('Page.navigate', { url: `${server.origin}/style-only.html` })
  await evaluate(session, 'return true;')
  await sleep(300)
  // No script row ran, so put the class on by hand to see what the stylesheet
  // paints on its own.
  await evaluate(session, `document.documentElement.classList.add('dsh550c-first'); return true;`)
  await sleep(50)
  const probe = await evaluate(session, PROBE)
  const ok = probe.paint === hexToRgb(fallback)
  if (!ok) failed = true
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  style-only   fallback ${probe.paint} (want ${hexToRgb(fallback)}) — class without the variable`,
  )
} finally {
  session?.close()
  chrome.kill()
  await Promise.race([once(chrome, 'exit'), sleep(2000)]).catch(() => {})
  await server.close()
  try {
    rmSync(stage, { recursive: true, force: true })
  } catch {
    console.log(`(harness left behind at ${stage})`)
  }
}

console.log(`\n${failed ? 'FAIL' : 'PASS'}: the cover matches the machine, falls back to 550C, and leaves no trace`)
process.exit(failed ? 1 : 0)
