#!/usr/bin/env node
/**
 * Generates the 550C variant's `assets.js` and `show.js` from
 * assets/550C-source.html.
 *
 * The animation is PORTED MECHANICALLY, never retyped: the original page's
 * stylesheet, markup and script are copied verbatim and then adapted for a
 * shadow root. Every rewrite is listed below with its reason. Anything not
 * rewritten stays byte-identical to the original file, so the port cannot
 * drift from the animation the author actually tuned.
 *
 * Outputs plain top-level `const`/`function` declarations (no import/export):
 * scripts/build.mjs concatenates the generated files, the variant registry and
 * the hand-written src/client.js into the single module the client loader
 * expects. The two outputs are named for the MACHINE they port, not for their
 * role, so a 550W/550A extractor can sit beside them without a rename.
 *
 * Usage: node scripts/extract.mjs [path/to/550C-source.html]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const sourcePath = process.argv[2] ?? resolve(root, 'assets/550C-source.html')
const html = readFileSync(sourcePath, 'utf8')

/** Slice one `<div …>` element out of the page by counting nested div tags. */
function sliceElement(source, startMarker) {
  const start = source.indexOf(startMarker)
  if (start === -1) throw new Error(`extract: marker not found: ${startMarker}`)
  const open = source.indexOf('>', start) + 1
  const tag = /<div\b|<\/div>/g
  tag.lastIndex = open
  let depth = 1
  let match
  while ((match = tag.exec(source)) !== null) {
    depth += match[0] === '</div>' ? -1 : 1
    if (depth === 0) return source.slice(start, match.index + '</div>'.length)
  }
  throw new Error(`extract: unbalanced element: ${startMarker}`)
}

function must(condition, message) {
  if (!condition) throw new Error(`extract: ${message}`)
}

// ── stylesheet ──────────────────────────────────────────────────────────────
const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/)
must(styleMatch !== null, 'no <style> block found')
let css = styleMatch[1]

// Shadow-DOM adaptation. The original page styles the document itself; inside a
// shadow root those selectors match nothing, so each becomes the host element.
// `:root` is the load-bearing one: the palette custom properties (--amber, --bg,
// --text, …) live there and every rule below reads them.
const cssRewrites = [
  [/html\s*,\s*body\s*\{/g, ':host{'],
  [/:root\s*\{/g, ':host{'],
  [/body::before\s*\{/g, ':host::before{'],
  [/body::after\s*\{/g, ':host::after{'],
  [/(^|\n)(\s*)body\s*\{/g, '$1$2:host{'],
]
for (const [pattern, replacement] of cssRewrites) {
  must(pattern.test(css), `stylesheet did not contain ${pattern}`)
  css = css.replace(pattern, replacement)
}
must(!/(^|\n)\s*(html|body)\b/.test(css), 'stylesheet still targets html/body')

// ── markup ──────────────────────────────────────────────────────────────────
const bootMarkup = sliceElement(html, '<div id="boot">')
const appMarkup = sliceElement(html, '<div id="app">')
const dimMarkup = sliceElement(html, '<div id="dim">')
const finalMarkup = sliceElement(html, '<div id="final">')
// `#hint` ("— REFRESH TO REPLAY —") is deliberately dropped: in the plugin the
// overlay fades out instead of inviting a page refresh.

// ── script ──────────────────────────────────────────────────────────────────
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/)
must(scriptMatch !== null, 'no <script> block found')
let js = scriptMatch[1].trim()

// 1. Unwrap the page's IIFE; createShow() supplies the enclosing scope instead.
must(js.startsWith('(() => {'), 'script does not start with the expected IIFE')
must(js.endsWith('})();'), 'script does not end with the expected IIFE')
js = js.slice('(() => {'.length, -'})();'.length).trim()

// 2. Drop the page-level boot trigger and the auto-start glue: the overlay owns
//    when the show starts, and the page-level Space handler would double-fire.
js = js.replace(
  /\n*window\.addEventListener\("keydown", e => \{\n\s*if \(e\.code === "Space" \|\| e\.key === " "\)\{ e\.preventDefault\(\); bootUp\(\); \}\n\}\);\n*/,
  '\n',
)
js = js.replace(/\n*\/\* 自动开机[\s\S]*?document\.addEventListener\("touchstart", bootUp, \{ passive: true \}\);\n*/, '\n')
// Element-level listeners (the popup close button) stay: only the page-level
// ones belong to the overlay.
must(
  !/window\.addEventListener|document\.addEventListener/.test(js),
  'a page-level listener survived the rewrite',
)

// 3. Rebind every lookup to the shadow-root stage.
js = js.replace(
  'const $ = s => document.querySelector(s);',
  'const $ = s => stage.querySelector(s);',
)
must(js.includes('stage.querySelector'), '$ helper was not rebound')
js = js.replace(/document\.getElementById\('(\w+)'\)/g, "stage.querySelector('#$1')")
js = js.replace(
  'document.body.appendChild(el); activeWindows.push(el);',
  'stage.appendChild(el); activeWindows.push(el);',
)
// Popup windows are appended to the stage, not to document.body: they must stay
// inside the shadow root or the scoped stylesheet would not reach them.

// 4. sleep() and setTimeout() become cancellable, so one skip unwinds the whole
//    async run instead of leaving orphaned timers behind the fade.
js = js.replace(
  'const sleep = ms => new Promise(r => setTimeout(r, ms));',
  '/* sleep() comes from the wrapper: cancellable. */',
)
must(!/const sleep = ms =>/.test(js), 'sleep() was not replaced')
js = js.replace(/(?<![\w.])setTimeout\(/g, 'later(')

// 5. Track the two untracked intervals so cancel() can stop them.
js = js.replace('function startClock(){ setInterval(', 'function startClock(){ clockTimer = setInterval(')
js = js.replace('function startFps(){ setInterval(', 'function startFps(){ fpsTimer = setInterval(')
must(js.includes('clockTimer = setInterval('), 'startClock was not tracked')
must(js.includes('fpsTimer = setInterval('), 'startFps was not tracked')

// 5b. The popup clock ticker has to die with its popup. closeSelf() clears it,
//     but that is the popup's OWN exit: a skip tears the whole shadow root down
//     instead (cancel() only stops the intervals the wrapper knows about), so
//     every window still open at Esc kept ticking — and kept its DOM alive —
//     for the rest of the page's life (measured: 3 live intervals 29 s after a
//     skip). Detachment is the one signal the ported code can act on without
//     knowing anything about the overlay, so the ticker retires itself as soon
//     as the clock is out of the document — the same idiom the original already
//     uses for its two other tickers (the waveform bars and the override bar).
js = js.replace(
  'const clockTimer = setInterval(() => { if (clockEl) clockEl.textContent = nowStr(); }, 1000);',
  'const clockTimer = setInterval(() => { if (clockEl === null || !clockEl.isConnected) { clearInterval(clockTimer); return; } clockEl.textContent = nowStr(); }, 1000);',
)
must(js.includes('!clockEl.isConnected'), 'the popup clock self-stop was not applied')

// 6. Remove bootUp(): the wrapper's start() owns that sequence and additionally
//    handles simple mode (where no #app exists) and the end-of-show beat.
js = js.replace(/async function bootUp\(\)\{[\s\S]*?\n\}\n/, '')
must(!/bootUp/.test(js), 'bootUp() was not removed')

// 7. Drop the replay hint: the markup no longer contains #hint, so this line
//    would throw on null.
js = js.replace(/\n\s*\$\(["']#hint["']\)\.classList\.add\(["']show["']\);/, '')
must(!/#hint/.test(js), '#hint reference survived the rewrite')

// 8. `#final` and the phase machine stay exactly as written.

const wrapperHead = `/**
 * GENERATED by scripts/extract.mjs — do not edit by hand.
 *
 * The original page's script, wrapped for the plugin. The wrapper supplies the
 * scope the page used to get from its IIFE plus the three things a plugin needs
 * that a page does not:
 *
 *   - every lookup is rebound to \`stage\` (the shadow-root container),
 *   - \`sleep\`/\`later\` are cancellable, so one skip unwinds the whole run,
 *   - \`start()\` splits the page's bootUp() into simple mode (logo only) and
 *     full mode (logo → HUD → the override phases), and never touches #app in
 *     simple mode, where that markup is not mounted at all.
 */
function createShow(stage, options) {
  const mode = options.mode === 'full' ? 'full' : 'simple';
  const CANCELLED = options.cancelled;
  let cancelled = false;
  const pending = new Set();
  let clockTimer = null, fpsTimer = null;

  /** Cancellable sleep: rejects with CANCELLED once the show is skipped. */
  function sleep(ms) {
    return new Promise((resolve, reject) => {
      if (cancelled) { reject(CANCELLED); return; }
      const entry = { reject: reject, timer: 0 };
      entry.timer = setTimeout(() => {
        pending.delete(entry);
        if (cancelled) reject(CANCELLED); else resolve();
      }, ms);
      pending.add(entry);
    });
  }

  /** Cancellable setTimeout for the fire-and-forget beats (path draw-in …). */
  function later(fn, ms) {
    const entry = { reject: null, timer: 0 };
    entry.timer = setTimeout(() => {
      pending.delete(entry);
      if (!cancelled) fn();
    }, ms);
    pending.add(entry);
    return entry.timer;
  }

  /** Skip: unwind every awaited step, then stop the intervals the show started. */
  function cancel() {
    if (cancelled) return;
    cancelled = true;
    for (const entry of pending) {
      clearTimeout(entry.timer);
      if (entry.reject !== null) entry.reject(CANCELLED);
    }
    pending.clear();
    try { stopCode(); } catch (error) { /* not started yet */ }
    try { stopLink(); } catch (error) { /* not started yet */ }
    if (clockTimer !== null) clearInterval(clockTimer);
    if (fpsTimer !== null) clearInterval(fpsTimer);
  }

  /** Run the show; resolves when it has played out, rejects when skipped. */
  async function start() {
    if (booting || launched) return;
    booting = true;
    const totalMs = playBoot();
    await sleep(totalMs + 300);
    if (mode === 'simple') {
      // Simple mode: the logo draw-in IS the show. One beat on the finished
      // mark, then the overlay fades.
      await sleep(600);
      return;
    }
    const boot = $("#boot");
    if (boot !== null) {
      boot.classList.add("fade");
      await sleep(600);
      if (boot.parentNode) boot.parentNode.removeChild(boot);
    }
    const app = $("#app");
    if (app !== null) app.classList.add("visible");
    launched = true;
    await run();
  }
`

const wrapperTail = `
  return { start: start, cancel: cancel };
}
`

const banner = (name, note) =>
  `/* ${name} — ${note} */\n/* Generated by scripts/extract.mjs from assets/550C-source.html. */\n`

const assetsOut =
  banner('assets', 'stylesheet + markup extracted from the original page') +
  `const CSS_550C = ${JSON.stringify(css)};\n\n` +
  `const BOOT_MARKUP = ${JSON.stringify(bootMarkup)};\n\n` +
  `const APP_MARKUP = ${JSON.stringify(appMarkup + dimMarkup + finalMarkup)};\n`

const showOut =
  banner('show', 'the original animation script, adapted for a shadow root') +
  wrapperHead +
  js +
  wrapperTail

// ── shared boot module: the 550C opening, parameterised for other machines ────
//
// 550W's Act 1 IS 550C's opening — same markup, same timeline — with exactly two
// substitutions (the tail glyph and the subtitle). Rather than let the two copies
// drift, the extractor emits the shared, parameterised copy from the SAME source
// and asserts the relationship, so "same opening" is a build-time fact:
//
//   1. filling the two holes back in reproduces BOOT_MARKUP byte for byte;
//   2. the shared timeline still carries 550C's own timing expressions.
//
// 550C keeps its own generated files exactly as they are, so nothing here can
// change what 550C plays.
const TAIL_HOLE = '<!--550W-TAIL-GLYPH-->'
const MID_HOLE = '<!--550W-MID-CLASS-->'
const sharedBootTemplate = readFileSync(resolve(root, 'assets/boot-template.html'), 'utf8')
const bootTail = /<g id="cee">[\s\S]*?<\/g>/.exec(bootMarkup)
must(bootTail !== null, 'no <g id="cee"> tail glyph in the ported boot markup')
must(sharedBootTemplate.includes(TAIL_HOLE), `assets/boot-template.html is missing ${TAIL_HOLE}`)
must(sharedBootTemplate.includes(MID_HOLE), `assets/boot-template.html is missing ${MID_HOLE}`)
// The load-bearing assertion: the hand-maintained template, with 550C's own tail
// glyph and its own mid-glyph class filled back in, must reproduce the ported
// markup exactly. Edit either side and this fails — that is the whole point.
must(
  sharedBootTemplate.replace(TAIL_HOLE, bootTail[0]).replaceAll(MID_HOLE, 'red') === bootMarkup,
  'assets/boot-template.html no longer matches the ported #boot markup (fill the two holes ' +
    'with 550C\'s tail glyph and mid-glyph class and it must be byte-identical)',
)

const playMatch = /function playBoot\(\)\{([\s\S]*?)\n\}\n/.exec(js)
must(playMatch !== null, 'playBoot() was not found in the ported script')
const playBody = playMatch[1]
const TIMING = ['250 + i * 300', '2400', '+ 400', '+ 600']
for (const expression of TIMING) {
  must(playBody.includes(expression), `playBoot() lost the timing expression "${expression}"`)
}

const sharedOut =
  banner('shared/boot', 'the 550C opening, parameterised (generated from the same source)') +
  `const BOOT_MARKUP_TEMPLATE = ${JSON.stringify(sharedBootTemplate)};\n\n` +
  `/** The opening markup for a machine: its tail glyph, and which glyph is the red one. */\n` +
  `function bootMarkupFor(tail, midClass) {\n` +
  `  return BOOT_MARKUP_TEMPLATE.replace(${JSON.stringify(TAIL_HOLE)}, tail).replaceAll(${JSON.stringify(MID_HOLE)}, midClass);\n` +
  `}\n\n` +
  `/**\n` +
  ` * 550C's playBoot(), wrapping and all — the body is copied verbatim, and the\n` +
  ` * two dependencies the ported closure used to get for free are passed in (the\n` +
  ` * stage to query, and the cancellable later() of the caller's timeline).\n` +
  ` */\n` +
  `function playBootShared(deps) {\n` +
  `  const stage = deps.stage;\n` +
  `  const later = deps.later;\n` +
  playBody +
  `\n}\n`

for (const [file, text] of [
  ['src/variants/550c/assets.js', assetsOut],
  ['src/variants/550c/show.js', showOut],
  ['src/variants/shared/boot.js', sharedOut],
]) {
  mkdirSync(resolve(root, dirname(file)), { recursive: true })
  writeFileSync(resolve(root, file), text)
  process.stdout.write(`extract: wrote ${file} (${text.length} chars)\n`)
}

// Report the shape so a rewrite that silently stops matching is visible.
process.stdout.write(
  `extract: css=${css.length} boot=${bootMarkup.length} app=${appMarkup.length} js=${js.length}\n`,
)
