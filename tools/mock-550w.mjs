#!/usr/bin/env node
/**
 * Step-1/Step-2 evidence: freeze 550W at each beat and screenshot it.
 *
 * This mounts the REAL `src/variants/550w/assets.js` (stylesheet + app markup)
 * and, for the opening, the REAL boot markup — the shared template
 * `assets/boot-template.html` with its two holes filled the way
 * scripts/extract.mjs will fill them. Nothing here invents markup: if it is not
 * in the variant's own sources, it is not in the picture.
 *
 * It deliberately does NOT run a timeline. Step 1 is "look at eleven stills
 * before anything is wired to a clock" (docs/PLAN-550w.md, 交付节奏): a beat's
 * still is its END state, set by `data-phase` on #scene and nothing else.
 *
 * It also asserts, at load time, the same invariant extract.mjs will assert at
 * build time: filling the template's two holes with 550C's own values reproduces
 * 550C's BOOT_MARKUP byte for byte.
 *
 * Usage:
 *   node tools/mock-550w.mjs                        # 12 stills at 1920×1080
 *   node tools/mock-550w.mjs --viewport 1280x900    # the real window size
 *   node tools/mock-550w.mjs --only a2-cluster,b2-countdown
 *   node tools/mock-550w.mjs --tag step1
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  connect,
  evaluate,
  findPage,
  launchChrome,
  scratch,
  screenshot,
  serve,
  sleep,
} from './lib/harness.mjs'
import {
  assertTemplateMatches550C,
  fillBootTemplate,
  logoContentOf,
  wordmarkBodyOf,
} from '../scripts/boot-shared.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

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
const viewport = String(opt.viewport ?? '1920x1080')
const [vw, vh] = viewport.split('x').map(Number)
const outDir = resolve(root, typeof opt.out === 'string' ? opt.out : join('.render', '550w-' + viewport))
const tag = typeof opt.tag === 'string' ? opt.tag : ''
const only = typeof opt.only === 'string' ? new Set(opt.only.split(',')) : null
/** Palette row: `amber` is "override nothing", exactly like the shipped client. */
const scheme = typeof opt.scheme === 'string' ? opt.scheme : 'amber'
const port = Number(opt.port ?? 9331)

// ── sources ─────────────────────────────────────────────────────────────────
/** Evaluate the variant's plain top-level declarations and hand back its strings. */
function loadVariant(file) {
  const source = readFileSync(resolve(root, file), 'utf8')
  const factory = new Function(source + '\n;return { CSS_550W, APP_550W };')
  return factory()
}

function extractConstant(file, name) {
  const source = readFileSync(resolve(root, file), 'utf8')
  const match = new RegExp('const ' + name + ' = ("(?:[^"\\\\]|\\\\.)*");').exec(source)
  if (match === null) throw new Error(`mock: ${name} not found in ${file}`)
  return JSON.parse(match[1])
}

const { CSS_550W, APP_550W } = loadVariant('src/variants/550w/assets.js')
const bootMarkup550C = extractConstant('src/variants/550c/assets.js', 'BOOT_MARKUP')
const template = readFileSync(resolve(root, 'assets/boot-template.html'), 'utf8')
const wordmarkArt = readFileSync(resolve(root, 'assets/550w-wordmark.svg'), 'utf8')

// The load-bearing guard, run here as well as in the extractor: the template
// with 550C's own logo contents in its hole must reproduce 550C's ported markup
// byte for byte, or no still is worth taking.
assertTemplateMatches550C(template, bootMarkup550C)

/** The shipped mark: the master, traced whole (palette ② is the master's own). */
const wordmarkBody = wordmarkBodyOf(wordmarkArt)
const bootMarkup550W = fillBootTemplate(template, wordmarkBody)

/**
 * 方案 (2): keep 550C's own wordmark and take only the W from the master. NOT
 * shipped — it exists to price the alternative. The literal version of this
 * ("swap the third glyph too") is not a construction that exists: the master's
 * strokes run across glyph boundaries, so its third glyph and the second 5's top
 * bar are one connected region (see tools/trace-550w-mark.mjs), and there is no
 * cut that separates them.
 */
const tracedPart = (id) => {
  const match = new RegExp(`<g id="${id}"[\\s\\S]*?</g>`).exec(wordmarkBody)
  if (match === null) throw new Error(`mock: no ${id} in the traced wordmark`)
  return match[0]
}
const ceeAt = logoContentOf(bootMarkup550C).indexOf('<g id="cee"')
const hybridBody = logoContentOf(bootMarkup550C).slice(0, ceeAt).trimEnd()
const bootMarkupHybrid = fillBootTemplate(template, `${hybridBody}\n        ${tracedPart('w4')}\n        ${tracedPart('w5')}`)
const bootText = '550W SYSTEM BOOT'

// ── beats ───────────────────────────────────────────────────────────────────
// One row per still: the phase name the timeline will write into data-phase, and
// the *evidence* that still has to show.
const BEATS = [
  { id: '01', name: 'a0-boot', phase: 'a0-boot', boot: true, note: '与 550C 同源的开场：550 逐路径书写、尾字形 W、写完发光' },
  { id: '02', name: 'a1-moonrise', phase: 'a1-moonrise', note: '态势显示 + 窗口 TARGET ACQUISITION（dwell 1500）' },
  { id: '03', name: 'a2-cutaway', phase: 'a2-cutaway', note: '纵向剖面（一条 1px 实线）+ 窗口 LUNAR ENGINE 01 · SECTION' },
  { id: '04', name: 'a3-link', phase: 'a3-link', note: '窗口 RELAY LINK：信标 → 链路 → RTT 1.28 S → 密钥协商通过' },
  { id: '05', name: 'a3-link', phase: 'a3-link', note: '窗口 PRIVILEGE ESCALATION（同拍的第二段）：ROOT ON CONTROL BUS' },
  { id: '06', name: 'a4-armed', phase: 'a4-armed', note: '窗口 ARMED 3 / 3 LUNAR ENGINES，三站点确认' },
  { id: '07', name: 'b1-countdown', phase: 'b1-countdown', note: '诚实时钟倒计时（居中窗口 .wp-meter .big）' },
  { id: '08', name: 'b2-ignition', phase: 'b2-ignition', note: '点火：全片唯一一次白闪' },
  { id: '09', name: 'b3-owned', phase: 'b3-owned', note: '接入成功横幅（550C 的 #final 装置，握持 ≥900 ms）' },
].filter((beat) => only === null || only.has(beat.name))

// ── page ────────────────────────────────────────────────────────────────────
const PAGE = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>550W mock</title>
<style>
  html,body{margin:0;height:100%;background:#000;overflow:hidden}
  #host{position:fixed;inset:0;display:block}
</style>
</head>
<body>
<div id="host"></div>
<script>
  const CSS = ${JSON.stringify(CSS_550W)};
  const APP = ${JSON.stringify(APP_550W)};
  const BOOT = ${JSON.stringify(opt.hybrid === true ? bootMarkupHybrid : bootMarkup550W)};
  const BOOT_TEXT = ${JSON.stringify(bootText)};
  const host = document.getElementById('host');
  if (${JSON.stringify(scheme)} !== 'amber') host.setAttribute('data-scheme', ${JSON.stringify(scheme)});
  const shadow = host.attachShadow({ mode: 'open' });

  window.__mountApp = (phase) => {
    shadow.innerHTML = '<style>' + CSS + '</style>' + APP;
    const app = shadow.querySelector('#app');
    app.classList.add('visible');
    app.dataset.phase = phase;
    const scene = shadow.querySelector('#scene');
    scene.dataset.phase = phase;
    shadow.querySelector('#b-stage').textContent = phase;
    return scene.dataset.phase;
  };

  window.__mountBoot = () => {
    shadow.innerHTML = '<style>' + CSS + '</style>' + BOOT;
    const width = ${JSON.stringify(typeof opt['logo-width'] === 'string' ? opt['logo-width'] : null)};
    const glow = ${JSON.stringify(opt['no-glow'] !== true)};
    if (width !== null) {
      const stage = shadow.querySelector('.boot-stage svg');
      if (stage !== null) stage.style.width = width;
    }
    const logo = shadow.querySelector('#logo');
    const text = shadow.querySelector('#bootText');
    text.textContent = BOOT_TEXT;
    text.classList.add('show');
    if (glow) logo.classList.add('finished');
    return {
      paths: shadow.querySelectorAll('#logo path').length,
      groups: shadow.querySelectorAll('#logo > g').length,
      text: text.textContent,
      boxes: Array.from(shadow.querySelectorAll('#logo path')).map((p) => {
        const b = p.getBBox();
        return {
          g: p.parentNode.id,
          c: p.getAttribute('class'),
          x: Math.round(b.x * 10) / 10,
          y: Math.round(b.y * 10) / 10,
          w: Math.round(b.width * 10) / 10,
          h: Math.round(b.height * 10) / 10,
        };
      }),
      logoBox: (() => {
        const b = logo.getBBox();
        return { x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 };
      })(),
      seconds: 250 + shadow.querySelectorAll('#logo path').length * 300 + 400 + 600,
    };
  };
  window.__box = (selector) => {
    const el = shadow.querySelector(selector);
    if (el === null) return null;
    const rect = el.getBoundingClientRect();
    return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) };
  };
  window.__probe = () => {
    const scene = shadow.querySelector('#scene');
    const visible = [];
    for (const layer of shadow.querySelectorAll('.ly')) {
      const opacity = getComputedStyle(layer).opacity;
      if (Number(opacity) > 0.5) visible.push(layer.className.replace('ly ly-', ''));
    }
    return {
      phase: scene.dataset.phase,
      layers: visible,
      labels: Array.from(shadow.querySelectorAll('.lab')).filter((l) => Number(getComputedStyle(l).opacity) > 0.5).length,
      popups: Array.from(shadow.querySelectorAll('.win-popup')).filter((w) => Number(getComputedStyle(w).opacity) > 0.5).length,
      dots: shadow.querySelectorAll('.wh i').length,
    };
  };
</script>
</body>
</html>
`

const dir = scratch('dsh550w-mock-')
writeFileSync(join(dir, 'index.html'), PAGE)
mkdirSync(outDir, { recursive: true })

const server = await serve(dir)
const chrome = launchChrome({ port, profile: scratch('dsh550w-mock-profile-') })
const page = await findPage(port)
const session = await connect(page.webSocketDebuggerUrl)
await session.send('Page.enable')
await session.send('Emulation.setDeviceMetricsOverride', {
  width: vw,
  height: vh,
  deviceScaleFactor: 1,
  mobile: false,
})
await session.send('Page.navigate', { url: server.origin + '/index.html' })
await sleep(600)

console.log(`mock: 550W · ${vw}×${vh} -> ${outDir.replace(root + '/', '')}`)
console.log(`boot round-trip: template + 550C's own values === BOOT_MARKUP (${bootMarkup550C.length} chars)`)
console.log(
  `boot wordmark: ${opt.hybrid === true ? 'HYBRID (550C 550 + master W)' : 'master, traced whole'} · ` +
    `${(bootMarkup550W.match(/<path /g) ?? []).length} paths in the 550W markup\n`,
)

for (const beat of BEATS) {
  if (beat.boot) {
    const info = await evaluate(session, 'return window.__mountBoot();')
    await sleep(120)
    const file = join(outDir, `${beat.id}-${beat.name}${tag ? '-' + tag : ''}.png`)
    await screenshot(session, file)
    console.log(`  ${beat.id} ${beat.name.padEnd(14)} paths ${info.paths} groups ${info.groups} "${info.text}"`)
    console.log(`      logo bbox x${info.logoBox.x} y${info.logoBox.y} w${info.logoBox.w} h${info.logoBox.h} · boot ${info.seconds} ms`)
    for (const box of info.boxes) {
      console.log(
        `      ${String(box.g || '?').padEnd(9)} ${String(box.c || '').padEnd(6)} x${String(box.x).padStart(7)} y${String(box.y).padStart(6)} w${String(box.w).padStart(6)} h${String(box.h).padStart(6)}`,
      )
    }
    continue
  }
  const phase = await evaluate(session, `return window.__mountApp(${JSON.stringify(beat.phase)});`)
  await sleep(160)
  const probe = await evaluate(session, 'return window.__probe();')
  const file = join(outDir, `${beat.id}-${beat.name}${tag ? '-' + tag : ''}.png`)
  await screenshot(session, file)
  console.log(
    `  ${beat.id} ${beat.name.padEnd(14)} layers [${probe.layers.join(' ')}] labels ${probe.labels} popups ${probe.popups} dots ${probe.dots}`,
  )
  if (beat.name === 'b4-owned') {
    const box = await evaluate(session, "return window.__box('.w-final');")
    console.log(`      w-final box: ${JSON.stringify(box)}`)
  }
  if (probe.phase !== beat.phase) throw new Error(`mock: phase did not stick (${probe.phase} !== ${beat.phase})`)
}

session.close()
chrome.kill()
await server.close()
