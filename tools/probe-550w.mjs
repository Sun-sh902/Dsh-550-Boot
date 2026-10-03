#!/usr/bin/env node
/**
 * Every claim the 15.45 s cut makes, measured on the shipped bundle in a real
 * browser. Eight probes:
 *
 *   1. beat timing     every `data-phase` entry against docs/PLAN-550w.md §1
 *                      (±150 ms), plus the run's own length
 *   2. countdown       the `performance.now()` stamps at T-00:02.400 and
 *                      T-00:00.000 against the real 2.400 s (±100 ms)
 *   2b. window dwell     each `.popup[data-p]`'s own on-screen life, sampled from
 *                      the DOM: the run's length is supposed to be DERIVED from
 *                      these, and no window may be killed by the next beat
 *   3. white flash     distinct full-frame flash episodes — the skill budgets one
 *   4. banner width    `.w-final` against 550C's own `#final`, mounted in the
 *                      same viewport in the same page (target ≥ 0.8×)
 *   5. MOTION          a ~30–60 Hz screencast of the whole run, downsampled and
 *                      differenced frame to frame: the number of ≥500 ms windows
 *                      with no significant change (target 0) and the mean
 *                      frame-to-frame difference per beat (the smallest beat must
 *                      still be > 0 — no beat is a still)
 *   5b. HARD-CUT       the worst SINGLE frame of the whole run, except the three
 *                      time-exempt full-frame events (the ignition flash, the
 *                      a0→a1 hand-off, the overlay exit): >15 % is what "一闪一闪"
 *                      measures, so every 换拍 has to stay at or under it
 *   6. white frames    frames whose pixels are >50 % near-white (target: none
 *                      outside the ignition flash)
 *   7. checksum        the printed CRC32 recomputed from the string it prints
 *
 * Usage:
 *   node tools/probe-550w.mjs [--viewport 1920x1080] [--scheme cyan] [--reduced]
 *                             [--out .render/probe-550w]
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { once } from 'node:events'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect, evaluate, findPage, launchChrome, scratch, serve, sleep } from './lib/harness.mjs'

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
const client = resolve(root, typeof opt.client === 'string' ? opt.client : 'lib/client.js')
const viewport = String(opt.viewport ?? '1920x1080')
const [vw, vh] = viewport.split('x').map(Number)
const scheme = typeof opt.scheme === 'string' ? opt.scheme : 'amber'
const reduced = opt.reduced === true
const outDir = typeof opt.out === 'string' ? resolve(root, opt.out) : null
const port = Number(opt.port ?? 9470)
const MODE_KEY = 'dsh-550c-boot:mode'
const VARIANT_KEY = 'dsh-550c-boot:variant'
const SCHEME_KEY = 'dsh-550c-boot:scheme'

/**
 * docs/PLAN-550w.md §1: [phase, start, end]. The last end is the run length.
 *
 * R4: the beat list is derived from the windows. a3 carries BOTH of its windows
 * under one machine id (`a3-link`), exactly as the brief asks, so it is one row
 * spanning 6050–9050 here even though show.js runs two beats inside it.
 */
const TABLE = [
  ['a1-moonrise', 3050, 4550],
  ['a2-cutaway', 4550, 6050],
  ['a3-link', 6050, 9050],
  ['a4-armed', 9050, 10550],
  ['b1-countdown', 10550, 12950],
  ['b2-ignition', 12950, 13850],
  ['b3-owned', 13850, 15450],
]
const RUN_MS = 15450
const COUNTDOWN_MS = 2400
/** The a1 row's own entry is the boot→app hand-off; see the budget below. */
const HANDOFF_MS = 3050

const clientSource = readFileSync(client, 'utf8')
const assets550C = readFileSync(resolve(root, 'src/variants/550c/assets.js'), 'utf8')
const css550C = JSON.parse(/const CSS_550C = ("(?:[^"\\]|\\.)*");/.exec(assets550C)[1])
const app550C = JSON.parse(/const APP_MARKUP = ("(?:[^"\\]|\\.)*");/.exec(assets550C)[1])

const PAGE = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>550W probe</title>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}
/* The reference owns fixed descendants: an offscreen parent alone does not
   stop #final painting in the viewport after the real overlay exits. Hidden
   keeps its geometry/computed styles measurable without contaminating frames. */
#ref550c{position:fixed;left:-99999px;top:0;width:${vw}px;height:${vh}px;visibility:hidden}</style>
</head><body>
<div id="ref550c"></div>
<script>
  window.__reactStub = { createElement: () => ({}), useState: () => [], useEffect: () => {}, useCallback: (fn) => fn };
  window.__loaded = null;
  window.__ModuleLoader__ = {
    load: (mod) => {
      window.__loaded = mod.factory((name) => {
        if (name === 'react') return window.__reactStub;
        throw new Error('unexpected require: ' + name);
      });
    },
  };
  try {
    localStorage.setItem(${JSON.stringify(MODE_KEY)}, 'full');
    localStorage.setItem(${JSON.stringify(VARIANT_KEY)}, '550w');
    ${scheme === 'amber' ? `localStorage.removeItem(${JSON.stringify(SCHEME_KEY)});` : `localStorage.setItem(${JSON.stringify(SCHEME_KEY)}, ${JSON.stringify(scheme)});`}
  } catch (error) {}

  const ref = document.getElementById('ref550c');
  const refShadow = ref.attachShadow({ mode: 'open' });
  refShadow.innerHTML = '<style>' + ${JSON.stringify(css550C)} + '</style>' + ${JSON.stringify(app550C)};
  refShadow.querySelector('#app').classList.add('visible');
  refShadow.querySelector('#final').classList.add('show');

  window.__samples = [];
  window.__gone = null;
  // 两个时钟的对齐点，在新文档自己的时间轴上取：帧的 metadata.timestamp 是 epoch
  // 时间，DOM 采样是 performance.now()，两者要落在同一条轴才能比。以前这个 offset
  // 是在 navigate 之前取的（那时还是旧文档），于是帧的时间轴整体偏了约 600 ms ——
  // 白闪的豁免带落在了错误的时刻，白闪尾巴被算成了"下一拍"的换拍跳变。
  window.__clock = { perf: performance.now(), date: Date.now() };
  (function loop() {
    const host = document.querySelector('.dsh550c-host');
    if (host !== null) {
      const shadow = host.shadowRoot;
      if (shadow !== null) {
        const scene = shadow.querySelector('#scene');
        window.__samples.push({
          t: performance.now(),
          phase: scene === null ? null : scene.dataset.phase,
          flash: shadow.querySelector('.flash') === null ? null : Number(getComputedStyle(shadow.querySelector('.flash')).opacity),
          count: shadow.querySelector('#b-count') === null ? null : shadow.querySelector('#b-count').textContent,
          meterGeometry: (() => {
            if (scene?.dataset.phase !== 'b1-countdown') return null;
            const count = shadow.querySelector('#b-count');
            const popup = shadow.querySelector('.popup[data-p="meter"] .win-popup.show');
            if (count === null || popup === null) return null;
            const edges = (node) => {
              const r = node.getBoundingClientRect();
              return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
            };
            return { count: edges(count), popup: edges(popup) };
          })(),
          plume: (() => {
            const earth = shadow.querySelector('.planet-plume');
            const card = shadow.querySelector('.earth-plume');
            if (earth === null || card === null) return null;
            const earthStyle = getComputedStyle(earth);
            return { earth: Number(earthStyle.opacity), card: Number(getComputedStyle(card).opacity),
              transition: earthStyle.transitionDuration,
              count: shadow.querySelector('#earth-engine-count')?.textContent ?? null };
          })(),
          banner: shadow.querySelector('.w-final') === null ? null : Math.round(shadow.querySelector('.w-final').getBoundingClientRect().width),
          bannerStyle: (() => {
            const el = shadow.querySelector('.w-final');
            if (el === null) return null;
            const cs = getComputedStyle(el);
            return { fontSize: cs.fontSize, padding: cs.padding, letterSpacing: cs.letterSpacing, fontWeight: cs.fontWeight };
          })(),
          out: host.classList.contains('dsh550c-out'),
          wins: Array.from(shadow.querySelectorAll('.popup'))
            .map((p) => {
              const node = p.querySelector('.win-popup');
              return p.dataset.p + (node !== null && node.classList.contains('show') ? '=1' : '=0');
            })
            .join(' '),
          // 窗口自己占屏幕的比例：硬切预算的量纲就是这个数 —— 一个窗口淡入时，
          // −500 ms 基准看到的就是整块窗口的面积。
          win: (() => {
            let best = null;
            for (const p of shadow.querySelectorAll('.popup')) {
              const node = p.querySelector('.win-popup');
              if (node === null || !node.classList.contains('show')) continue;
              const rect = node.getBoundingClientRect();
              const frac = (rect.width * rect.height) / (innerWidth * innerHeight);
              if (best === null || frac > best.frac) {
                best = { frac: frac, name: p.dataset.p, w: Math.round(rect.width), h: Math.round(rect.height) };
              }
            }
            return best;
          })(),
          crc: shadow.querySelector('#wp-crc') === null ? null : shadow.querySelector('#wp-crc').textContent,
          crcSource: shadow.querySelector('#wp-crc') === null ? null : (shadow.querySelector('#wp-crc').dataset.source ?? null),
        });
      }
    } else if (window.__samples.length > 0 && window.__gone === null) {
      window.__gone = performance.now();
    }
    requestAnimationFrame(loop);
  })();
</script>
<script src="./client.js"></script>
</body></html>
`

const dir = scratch('dsh550w-probe-')
writeFileSync(join(dir, 'index.html'), PAGE)
writeFileSync(join(dir, 'client.js'), clientSource)
const framesDir = mkdtempSync(join(tmpdir(), 'dsh550w-frames-'))

const server = await serve(dir)
const chrome = launchChrome({ port, profile: scratch('dsh550w-probe-profile-') })

let failed = false
let session
const frames = []
try {
  const target = await findPage(port)
  session = await connect(target.webSocketDebuggerUrl)
  await session.send('Page.enable')
  await session.send('Runtime.enable')
  await session.send('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: 1, mobile: false })
  if (reduced) {
    await session.send('Emulation.setEmulatedMedia', {
      media: '',
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    })
  }

  // ── the motion recorder: a screencast of the whole run ────────────────────
  // Lossless PNG at 960×540, 30 Hz, written straight to disk: a 480×270 JPEG
  // washes out the sub-pixel-per-frame movement that a slow continuous animation
  // produces, which is exactly what this probe has to be able to see.
  session.on((message) => {
    if (message.method !== 'Page.screencastFrame') return
    // `metadata.timestamp` is when the frame was CAPTURED (seconds since epoch).
    // Date.now() at delivery is not: PNG-encoding 960×540 in Chrome's screencast
    // queues up under load, and a burst of frames then arrives with arrival times
    // that are milliseconds apart while the frames themselves are half a second
    // apart — which makes the −500 ms lookup reach across a real 1 s gap and
    // report a phantom full-frame change.
    const index = frames.length
    const data = Buffer.from(message.params.data, 'base64')
    const captured = message.params.metadata?.timestamp
    const t = typeof captured === 'number' ? captured * 1000 : Date.now()
    frames.push({ t: t, path: join(framesDir, String(index).padStart(5, '0') + '.png') })
    writeFileSync(frames[frames.length - 1].path, data)
    session.send('Page.screencastFrameAck', { sessionId: message.params.sessionId }).catch(() => {})
  })
  await session.send('Page.startScreencast', { format: 'png', maxWidth: 960, maxHeight: 540, everyNthFrame: 2 })

  const startedAt = Date.now()
  await session.send('Page.navigate', { url: server.origin + '/index.html' })
  for (let i = 0; i < 200; i++) {
    await sleep(250)
    const gone = await evaluate(session, 'return window.__gone !== null;')
    if (gone && Date.now() - startedAt > RUN_MS + 1200) break
  }
  await sleep(500)
  await session.send('Page.stopScreencast').catch(() => {})

  const samples = await evaluate(session, 'return window.__samples;')
  // Read the page's own (wall − performance.now()) offset AFTER the run: it was
  // recorded in the page's first task, so it is exact for the document that ran
  // the animation, and it puts the frames and the DOM samples on one clock.
  const offset = await evaluate(
    session,
    'return window.__clock ? window.__clock.date - window.__clock.perf : 0;',
  )
  const refFinal = await evaluate(
    session,
    "const r = document.getElementById('ref550c').shadowRoot.querySelector('#final').getBoundingClientRect(); return Math.round(r.width);",
  )
  // 550C's own #final, measured as a DEVICE (font-size / padding / tracking), so the
  // 550W banner can be checked for being the same device rather than a lookalike.
  const refFinalStyle = await evaluate(
    session,
    `const cs = getComputedStyle(document.getElementById('ref550c').shadowRoot.querySelector('#final'));
     return { fontSize: cs.fontSize, padding: cs.padding, letterSpacing: cs.letterSpacing, fontWeight: cs.fontWeight };`,
  )
  const t0 = samples.length > 0 ? samples[0].t : 0
  const at = (sample) => sample.t - t0

  console.log(`client:   ${client.replace(root + '/', '')}`)
  console.log(`viewport: ${vw}×${vh}   scheme: ${scheme}   reduced-motion: ${reduced}`)
  console.log(`frames:   ${frames.length} screencast frames, ${samples.length} DOM samples\n`)

  const width = [17, 12, 12, 10, 12, 10]
  const row = (cells) => cells.map((cell, i) => String(cell).padEnd(width[i])).join(' ')

  // ── 1. beat timing ────────────────────────────────────────────────────────
  const entries = new Map()
  for (const sample of samples) {
    if (sample.phase !== null && !entries.has(sample.phase)) entries.set(sample.phase, at(sample))
  }
  console.log(row(['phase', 'measured', 'table', 'delta', 'ok']))
  console.log(row(['-'.repeat(15), '-'.repeat(10), '-'.repeat(10), '-'.repeat(8), '-'.repeat(6)]))
  let worst = 0
  for (const [phase, table] of TABLE) {
    const measured = entries.get(phase)
    if (measured === undefined) {
      failed = true
      console.log(row([phase, 'MISSING', `${table} ms`, '—', 'FAIL']))
      continue
    }
    const delta = Math.round(measured - table)
    worst = Math.max(worst, Math.abs(delta))
    const ok = Math.abs(delta) <= 150
    if (!ok) failed = true
    console.log(row([phase, `${Math.round(measured)} ms`, `${table} ms`, `${delta > 0 ? '+' : ''}${delta} ms`, ok ? 'PASS' : 'FAIL']))
  }
  const outSample = samples.find((sample) => sample.out === true)
  const runMeasured = outSample === undefined ? null : Math.round(at(outSample))
  const runDelta = runMeasured === null ? null : runMeasured - RUN_MS
  const runOk = runDelta !== null && Math.abs(runDelta) <= 300
  if (!runOk) failed = true
  console.log(
    row(['run end', `${runMeasured === null ? 'MISSING' : runMeasured + ' ms'}`, `${RUN_MS} ms`,
      `${runDelta === null ? '—' : (runDelta > 0 ? '+' : '') + runDelta + ' ms'}`, runOk ? 'PASS' : 'FAIL']),
  )
  console.log(`worst deviation ${worst} ms (target ≤ 150 ms); run ${(RUN_MS / 1000).toFixed(2)} s (target 15.45 s, ±0.4)\n`)

  // ── 2. countdown honesty ──────────────────────────────────────────────────
  const windowB1 = samples.filter((sample) => sample.phase === 'b1-countdown')
  const first = windowB1.find((sample) => typeof sample.count === 'string' && sample.count.startsWith('T-'))
  const last =
    first === undefined ? undefined : samples.find((sample) => sample.t > first.t && sample.count === 'T-00:00.000')
  const countdownMs = first !== undefined && last !== undefined ? at(last) - at(first) : null
  const countdownOk = countdownMs !== null && Math.abs(countdownMs - COUNTDOWN_MS) <= 100
  if (!countdownOk) failed = true
  console.log('countdown (honest clock)')
  console.log(
    row(['first', 'ms', 'last', 'ms', 'delta']) + '\n' +
      row([
        first === undefined ? 'none' : first.count,
        first === undefined ? '—' : Math.round(at(first)),
        last === undefined ? 'none' : last.count,
        last === undefined ? '—' : Math.round(at(last)),
        countdownMs === null ? '—' : `${Math.round(countdownMs)} ms`,
      ]) + '\n' +
      `first → last = ${countdownMs === null ? 'n/a' : Math.round(countdownMs) + ' ms'} against ${COUNTDOWN_MS} ms (±100) → ` +
      `${countdownOk ? 'PASS' : 'FAIL'}\n`,
  )

  // Measure the painted count against its popup during the settled b1 hold.
  // A numeric failure prints both rectangles, so the offending viewport is
  // reproducible without interpreting a screenshot or a text-shadow halo.
  const meterSamples = samples.filter((sample) =>
    sample.meterGeometry !== null && at(sample) >= 11050 && at(sample) <= 12850,
  )
  const meterFits = ({ count, popup }) =>
    count.left >= popup.left + 8 && count.right <= popup.right - 8 &&
    count.top >= popup.top + 8 && count.bottom <= popup.bottom - 8
  const meterFailure = meterSamples.find((sample) => !meterFits(sample.meterGeometry))
  const meterSample = meterFailure ?? meterSamples[Math.floor(meterSamples.length / 2)]
  const meterGeometry = meterSample?.meterGeometry ?? null
  const meterOk = meterSamples.length > 0 && meterFailure === undefined
  if (!meterOk) failed = true
  const fmtRect = (r) => r === undefined ? 'MISSING' :
    `[${r.left.toFixed(1)}, ${r.top.toFixed(1)}, ${r.right.toFixed(1)}, ${r.bottom.toFixed(1)}]`
  console.log('b1 countdown bounds [left, top, right, bottom] (≥8 px inside popup on every settled sample)')
  console.log(`  #b-count  ${fmtRect(meterGeometry?.count)}`)
  console.log(`  .win-popup ${fmtRect(meterGeometry?.popup)} → ${meterOk ? 'PASS' : 'FAIL'}\n`)

  const beforeIgnition = samples.filter((sample) => sample.phase === 'b1-countdown' && sample.plume !== null)
  const afterIgnition = samples.filter((sample) =>
    ['b2-ignition', 'b3-owned'].includes(sample.phase) && sample.plume !== null)
  const firstLit = afterIgnition.find((sample) => sample.plume.earth > .01 && sample.plume.card > .01)
  const fullyLit = afterIgnition.find((sample) => sample.plume.earth >= .95 && sample.plume.card >= .95)
  const plumeFadeMs = firstLit !== undefined && fullyLit !== undefined ? fullyLit.t - firstLit.t : null
  const countValues = [...new Set(afterIgnition.map((sample) => sample.plume.count))]
  const plumeOk = beforeIgnition.every((sample) => sample.plume.earth === 0 && sample.plume.card === 0) &&
    firstLit !== undefined && fullyLit !== undefined &&
    (reduced ? firstLit.plume.transition === '0s' : plumeFadeMs >= 300) &&
    afterIgnition.at(-1)?.plume.earth === 1 && afterIgnition.at(-1)?.plume.card === 1 &&
    countValues.includes('0') && countValues.includes('10,000')
  if (!plumeOk) failed = true
  console.log('Earth + engine-card ignition (b2 start, persistent through b3)')
  console.log(`  opacity 0 before b2; fade to ≥.95 in ${plumeFadeMs === null ? 'n/a' : Math.round(plumeFadeMs)} ms ` +
    `(reduced: ${reduced}, transition ${firstLit?.plume.transition ?? 'n/a'}); ` +
    `COUNT ${countValues.join(' → ')} → ${plumeOk ? 'PASS' : 'FAIL'}\n`)

  // ── 2b. the windows' own dwell ────────────────────────────────────────────
  // The length of the run is supposed to be DERIVED from these: every window gets
  // one beat's worth of screen, and none of them is allowed to be killed by the
  // next beat's boundary. `show` is how long the window held the screen; `live`
  // adds the 220 ms fade-out that follows it.
  const WINDOW_NAMES = ['target', 'cut', 'link', 'priv', 'armed', 'meter']
  const dwells = WINDOW_NAMES.map((name) => {
    const marks = samples.filter((sample) => typeof sample.wins === 'string' && sample.wins.includes(name + '=1'))
    if (marks.length === 0) return [name, null, null, null]
    const start = Math.round(at(marks[0]))
    const showEnd = Math.round(at(marks[marks.length - 1]))
    const box = marks.reduce((best, sample) => (sample.win !== null && (best === null || sample.win.frac > best.frac) ? sample.win : best), null)
    return [name, start, showEnd, showEnd - start + 220, box]
  })
  console.log('window dwell (docs/PLAN-550w.md §1: every window owns its beat, closed by its own dwell)')
  console.log(row(['window', 'opens', 'show ends', 'live (ms)', 'box (px)', 'of screen']))
  for (const [name, start, showEnd, live, box] of dwells) {
    console.log(
      row([
        name,
        start === null ? '—' : `${start} ms`,
        showEnd === null ? '—' : `${showEnd} ms`,
        live === null ? '—' : `${live} ms`,
        box === null ? '—' : `${box.w}×${box.h}`,
        box === null ? '—' : `${(box.frac * 100).toFixed(1)} %`,
      ]),
    )
  }
  console.log('')

  // ── 3. white-flash budget ─────────────────────────────────────────────────
  let episodes = 0
  let inFlash = false
  let peak = 0
  let flashStart = null
  let longest = 0
  let flashEnd = null
  for (const sample of samples) {
    const value = sample.flash
    if (value === null) continue
    peak = Math.max(peak, value)
    if (value > 0.02) flashEnd = at(sample)
    if (value > 0.5 && !inFlash) {
      inFlash = true
      episodes += 1
      flashStart = at(sample)
    } else if (value <= 0.5 && inFlash) {
      inFlash = false
      longest = Math.max(longest, at(sample) - flashStart)
    }
  }
  const expectFlashes = reduced ? 0 : 1
  const flashOk = episodes === expectFlashes && (reduced ? peak < 0.5 : longest < 1000)
  if (!flashOk) failed = true
  console.log('white flash (skill §5 budgets one per sequence, < 1 s)')
  console.log(
    `episodes = ${episodes} (expected ${expectFlashes})  peak = ${peak.toFixed(2)}  longest = ${Math.round(longest)} ms → ` +
      `${flashOk ? 'PASS' : 'FAIL'}\n`,
  )
  // The overlay's own decay curve, so "the flash is over" is a measurement and not
  // an assumption: the hard-cut band below is derived from where this reaches 0.
  const flashCurve = samples.filter((sample, i) => sample.flash !== null && sample.flash > 0.01 && i % 3 === 0)
  console.log(
    `flash decay: ${flashCurve.map((sample) => `${Math.round(at(sample))}ms ${sample.flash.toFixed(2)}`).join('  ')}\n`,
  )

  // ── 4. banner width against 550C's own ────────────────────────────────────
  const widths = samples.map((sample) => sample.banner).filter((value) => value !== null && value > 0)
  const banner = widths.length > 0 ? Math.max(...widths) : null
  const ratio = banner === null || refFinal === 0 ? null : banner / refFinal
  const styleSample = samples.find((sample) => sample.bannerStyle != null)
  const style = styleSample === undefined ? null : styleSample.bannerStyle
  // The banner is now 550C's own device with a four-character line (接入成功), so a
  // width RATIO against a twenty-character line would be meaningless. What is
  // checked instead: font-size / padding / letter-spacing / weight equal 550C's
  // #final, measured in the same page and viewport. The width is printed for the
  // record.
  const sameDevice =
    style !== null &&
    style.fontSize === refFinalStyle.fontSize &&
    style.padding === refFinalStyle.padding &&
    style.letterSpacing === refFinalStyle.letterSpacing &&
    style.fontWeight === refFinalStyle.fontWeight
  if (!sameDevice) failed = true
  console.log("closing banner (550C #final's device, this machine's tokens)")
  console.log(
    `550W ${style === null ? 'n/a' : `${style.fontSize} / pad ${style.padding} / ls ${style.letterSpacing} / w ${style.fontWeight}`}` +
      `   550C #final ${refFinalStyle.fontSize} / pad ${refFinalStyle.padding} / ls ${refFinalStyle.letterSpacing} / w ${refFinalStyle.fontWeight}`,
  )
  console.log(
    `width ${banner} px vs 550C's ${refFinal} px = ${ratio === null ? 'n/a' : ratio.toFixed(3)}× (four-character copy, printed for the record) → ` +
      `${sameDevice ? 'PASS' : 'FAIL'}\n`,
  )

  // ── 5. motion: frame-to-frame difference over the whole run ───────────────
  // The screencast frames are written out and decoded in ONE ffmpeg pass to a
  // 32×18 grey bitmap each, then differenced. Timestamps stay in the index.
  let motionReport = null
  if (frames.length > 8) {
    const raw = execFileSync('ffmpeg', [
      '-v', 'error', '-i', join(framesDir, '%05d.png'),
      '-vf', 'scale=96:54', '-f', 'rawvideo', '-pix_fmt', 'gray', '-',
    ], { maxBuffer: 64 * 1024 * 1024 })
    const cell = 96 * 54
    const count = Math.floor(raw.length / cell)
    const change = (a, b) => {
      let sum = 0
      let changed = 0
      for (let p = 0; p < cell; p++) {
        const delta = Math.abs(raw[a * cell + p] - raw[b * cell + p])
        sum += delta
        if (delta > 8) changed += 1
      }
      return { mean: sum / cell, changed: changed / cell }
    }
    /** The newest frame at least `ms` older than frame `i`, by its timestamp. */
    const back = (i, ms) => {
      for (let j = i - 1; j >= 0; j--) if (frames[i].t - frames[j].t >= ms) return j
      return -1
    }
    const diffs = []
    for (let i = 1; i < count; i++) {
      const adjacent = change(i, i - 1)
      const j250 = back(i, 250)
      const j500 = back(i, 500)
      const over250 = j250 === -1 ? { mean: 0, changed: 0 } : change(i, j250)
      const over500 = j500 === -1 ? { mean: 0, changed: 0 } : change(i, j500)
      let lit = 0
      for (let p = 0; p < cell; p++) if (raw[i * cell + p] > 200) lit += 1
      diffs.push({
        i: i,
        j250: j250,
        j500: j500,
        t: frames[i].t - offset - t0,
        d: adjacent.mean,
        changed: Math.max(adjacent.changed, over250.changed, over500.changed),
        adjacent: adjacent.changed,
        over250: over250.changed,
        over500: over500.changed,
        white: lit / cell,
      })
    }
    /**
     * Per-beat motion, two ways. Both are MEANS over the beat's frames — the
     * column used to be called `peakOf`, which was a lie: it summed and divided,
     * it never took a maximum.
     *
     *   mean    each frame's max(adjacent, -250 ms, -500 ms). A beat's first
     *           frame can still show the previous beat's change (b3-owned's first
     *           frame sits on the ignition flash), so this number is the honest
     *           answer to "how much is this stretch of screen moving".
     *   intra   the same, but the -250/-500 ms baselines are clamped to the
     *           beat's own first frame and the first frame's adjacent term is 0,
     *           so the number describes the beat itself and nothing carried over
     *           the cut.
     */
    // The ignition flash is a single full-frame event the skill budgets; it is the
    // frame allowed past the hard-cut ceiling, so it is excluded by TIME (never by
    // phase name) exactly like the white-frame accounting above. The band comes
    // from the DOM-measured episode in §3 (`.flash`'s own computed opacity), not
    // from a pixel guess: the flash is a JS beat. It has to cover the metric's own
    // lookback as well — a frame 500 ms after the flash has finished is still
    // compared against a flash-lit frame, and a white wash moves every cell.
    const flashFrom = flashStart === null ? Infinity : flashStart
    // The END of the band is where the overlay is actually gone (opacity ≤0.02),
    // not where it dropped below the 0.5 episode threshold: the fade-out after that
    // threshold still lights the whole frame enough to move every cell.
    const flashTo = flashEnd === null ? -Infinity : Math.max(flashEnd, flashFrom + Math.max(longest, 420))
    // 520 ms is the metric's own lookback; the extra 40 ms is one capture interval
    // of slack between the DOM sample and the frame the screencast actually holds.
    const inFlashBand = (entry) => entry.t >= flashFrom - 560 && entry.t <= flashTo + 560
    /**
     * Everything up to the end of the a0→a1 hand-off is one band, and it is not a
     * 换拍: a0 is 550C's own opening (frozen by the brief, and already excluded
     * from the still-window metric), and 550C's own boot stage hands the frame to
     * 550C's own app face exactly the same way. It is printed, never hidden —
     * `worstOpening` below is the worst single frame inside it.
     */
    const inOpeningBand = (entry) => entry.t < HANDOFF_MS + 900
    /**
     * And the overlay's own exit: after RUN_MS the client runs 550C's 620 ms
     * two-stage fade to black, which is the machine's teardown, not a beat. It is
     * printed as `exit`, never hidden.
     */
    const inExitBand = (entry) => entry.t > RUN_MS
    /** The frames the per-beat columns and the cut budget are actually about. */
    const inBeatFrames = (phase) => {
      const row = TABLE.find((entry) => entry[0] === phase)
      if (row === undefined) return []
      return diffs.filter(
        (entry) => entry.t >= row[1] && entry.t < row[2] && !inFlashBand(entry) && !inOpeningBand(entry),
      )
    }
    const meanOf = (phase) => {
      const inBeat = inBeatFrames(phase)
      if (inBeat.length === 0) return null
      return inBeat.reduce((sum, entry) => sum + entry.changed, 0) / inBeat.length
    }
    const intraOf = (phase) => {
      const inBeat = inBeatFrames(phase)
      if (inBeat.length === 0) return null
      const startIndex = inBeat[0].i
      let sum = 0
      for (const entry of inBeat) {
        const adjacent = entry.i === startIndex ? 0 : entry.adjacent
        const clamped250 = change(entry.i, Math.max(entry.j250, startIndex)).changed
        const clamped500 = change(entry.i, Math.max(entry.j500, startIndex)).changed
        sum += Math.max(adjacent, clamped250, clamped500)
      }
      return sum / inBeat.length
    }
    /**
     * The hard-cut budget. `changed` above is a MEAN, and a mean hides the one
     * frame that jumps: the whole point of this column is the worst single frame.
     * A beat boundary that swaps the screen in one step shows up here as 30–80 %
     * of the cells moving between two frames half a second apart, which is what
     * "一闪一闪" is. Every 换拍 has to stay at or under the ceiling, so the cut
     * has to be a cross-fade and each beat may only touch a small part of the
     * screen. The columns below are computed over `inBeatFrames` — the beats with
     * the two time-exempt bands removed — so one number is not doing two jobs.
     */
    const CEILING = 0.15
    const percentile = (values, p) => {
      if (values.length === 0) return null
      const sorted = [...values].sort((a, b) => a - b)
      return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
    }
    const p95Of = (phase) => percentile(inBeatFrames(phase).map((entry) => entry.changed), 0.95)
    const maxOf = (phase) => {
      const inBeat = inBeatFrames(phase)
      if (inBeat.length === 0) return null
      return inBeat.reduce((best, entry) => (entry.changed > best.changed ? entry : best))
    }
    const largest = (entries) => entries.reduce(
      (best, entry) => best === null || entry.changed > best.changed ? entry : best, null,
    )
    const worstFrame = largest(diffs)
    const worstOutside = largest(diffs.filter((entry) => !inFlashBand(entry)))
    const worstOpening = largest(diffs.filter((entry) => !inFlashBand(entry) && inOpeningBand(entry)))
    const worstCut = largest(diffs.filter((entry) => !inFlashBand(entry) && !inOpeningBand(entry) && !inExitBand(entry)))
    const worstExit = largest(diffs.filter((entry) => inExitBand(entry)))
    if ([worstFrame, worstOutside, worstOpening, worstCut, worstExit].some((entry) => entry === null)) {
      throw new Error('motion recorder missed one of the time bands')
    }
    // A "still window" is ≥500 ms of consecutive sub-threshold frames, measured
    // on the frame timestamps (the screencast's own rate, not an assumed 60 Hz).
    // "No significant change" = neither the adjacent frame, nor the frame 250 ms
    // back, nor the one 500 ms back moved 0.15 % of the cells.
    const THRESHOLD = 0.0015
    let windows = []
    let runStart = null
    for (const entry of diffs) {
      if (entry.changed < THRESHOLD) {
        if (runStart === null) runStart = entry.t
      } else if (runStart !== null) {
        if (entry.t - runStart >= 500) windows.push([Math.round(runStart), Math.round(entry.t)])
        runStart = null
      }
    }
    if (runStart !== null && diffs.length > 0) {
      const end = diffs[diffs.length - 1].t
      if (end - runStart >= 500) windows.push([Math.round(runStart), Math.round(end)])
    }
    // a0 is out of scope for this metric on purpose: the brief freezes it
    // ("首拍的 3.05 s 一个字都不许动") — it is 550C's own opening, and its first
    // path is a small bowl whose write-on is genuinely quiet in pixel terms. The
    // motion budget starts with a1.
    windows = windows.filter(([, to]) => to > 3050)
    const whiteFrames = diffs.filter((entry) => entry.white > 0.5)
    const flashWindow =
      episodes === 1 ? [flashStart, flashStart + Math.max(longest, 420)] : null
    const whiteOutsideFlash = whiteFrames.filter(
      (entry) => flashWindow === null || entry.t < flashWindow[0] - 120 || entry.t > flashWindow[1] + 120,
    )
    if (process.env.PROBE_DUMP) {
      writeFileSync(
        process.env.PROBE_DUMP,
        'ms\tadjacent\tover250\tover500\tchanged\twhite\n' +
          diffs
            .map(
              (entry) =>
                `${Math.round(entry.t)}\t${entry.adjacent.toFixed(4)}\t${entry.over250.toFixed(4)}\t${entry.over500.toFixed(4)}\t${entry.changed.toFixed(4)}\t${entry.white.toFixed(3)}`,
            )
            .join('\n') +
          '\n',
      )
    }
    motionReport = {
      diffs: diffs.length,
      rate: diffs.length / ((diffs[diffs.length - 1].t - diffs[0].t) / 1000),
      windows,
      threshold: THRESHOLD,
      perBeat: TABLE.map(([phase]) => [phase, meanOf(phase), intraOf(phase), p95Of(phase)]),
      ceiling: CEILING,
      worstFrame: { t: Math.round(worstFrame.t), changed: worstFrame.changed, flash: inFlashBand(worstFrame) },
      worstOutside: { t: Math.round(worstOutside.t), changed: worstOutside.changed },
      worstCut: { t: Math.round(worstCut.t), changed: worstCut.changed },
      worstOpening: { t: Math.round(worstOpening.t), changed: worstOpening.changed },
      worstExit: { t: Math.round(worstExit.t), changed: worstExit.changed,
        frame: worstExit.i, back250: worstExit.j250, back500: worstExit.j500 },
      whiteFrames: whiteFrames.length,
      whiteOutsideFlash: whiteOutsideFlash.length,
      whiteOutsideAt: whiteOutsideFlash.slice(0, 5).map((entry) => Math.round(entry.t)),
    }
  }

  if (motionReport !== null) {
    console.log('motion (960×540 PNG screencast, 96×54 grey frame difference, ~' + motionReport.rate.toFixed(0) + ' Hz)')
    // The still-window budget is a rule for the NORMAL cut. Under reduced motion
    // every continuous loop is off by design (the skill keeps only hard cuts,
    // counters and the discrete deployment), so the number is reported there and
    // not enforced.
    const stillOk = reduced || motionReport.windows.length === 0
    console.log('a0-boot (0–3050 ms) is the frozen shared opening: excluded from the motion metric by the brief')
    console.log(`still windows ≥500 ms = ${motionReport.windows.length} (a window is still when no frame at −1, −250 and −500 ms moved >${(motionReport.threshold * 100).toFixed(2)}% of the 96×54 cells by >8 levels) → ` +
      `${reduced ? 'informational under reduced motion' : stillOk ? 'PASS' : 'FAIL'}` +
      (motionReport.windows.length > 0 ? '  at ' + motionReport.windows.map(([a, b]) => `${a}–${b} ms`).join(', ') : ''))
    if (!stillOk) failed = true
    console.log(
      '  changed cells per beat — mean over frames of max(adjacent, -250, -500)  |  ' +
        'bases clamped to the beat\'s first frame  |  p95 of the same column',
    )
    for (const [phase, mean, intra, p95] of motionReport.perBeat) {
      // A beat with no measurable frames left is one the two exempt bands consumed
      // whole — b2-ignition IS the flash. That is not a failure; a beat that
      // measures zero movement is.
      const ok = mean === null || mean > 0
      if (!ok) failed = true
      console.log(
        `  ${phase.padEnd(15)} ${mean === null ? '  n/a ' : (mean * 100).toFixed(1).padStart(5) + ' %'}` +
          `  |  ${intra === null ? '  n/a' : (intra * 100).toFixed(1).padStart(5) + ' %'}` +
          `  |  ${p95 === null ? '  n/a' : (p95 * 100).toFixed(1).padStart(5) + ' %'}` +
          `${mean === null ? '   (no measurable frame: the flash owns this beat)' : ok ? '' : '   FAIL'}`,
      )
    }
    // The hard-cut budget: every 换拍 has to sit at or under the ceiling. This is
    // the lock on "一闪一闪" — a beat boundary that swaps the screen in one step
    // fails here even though its MEAN was low. Exempt by time: the ignition flash
    // (budgeted by the skill) and the a0→a1 boot→app hand-off (550C's own, and a0
    // is frozen). Both are printed, never hidden.
    const cut = motionReport.worstCut
    const opening = motionReport.worstOpening
    const exit = motionReport.worstExit
    const budgetOk = reduced || cut.changed <= motionReport.ceiling
    const handoffOk = reduced || (opening.changed <= .35 && exit.changed <= .30)
    if (!handoffOk) failed = true
    if (!budgetOk) failed = true
    console.log(
      `hard-cut budget ≤ ${(motionReport.ceiling * 100).toFixed(0)} % per single frame ` +
        `(a0 + the a0→a1 hand-off, the ignition flash and the overlay exit are exempt by time)\n` +
        `  worst 换拍 frame: ${(cut.changed * 100).toFixed(1)} % at ${cut.t} ms\n` +
        `  a0 opening + hand-off ≤35%: ${(opening.changed * 100).toFixed(1)} % at ${opening.t} ms` +
        `; overlay exit ≤30%: ${(exit.changed * 100).toFixed(1)} % at ${exit.t} ms → ${reduced ? 'informational under reduced motion' : handoffOk ? 'PASS' : 'FAIL'}\n` +
        `  worst anywhere: ${(motionReport.worstFrame.changed * 100).toFixed(1)} % at ${motionReport.worstFrame.t} ms` +
        `${motionReport.worstFrame.flash ? ' (the flash)' : ''}\n` +
        `  p95 per beat: ` +
        motionReport.perBeat.map(([phase, , , p95]) => `${phase} ${p95 === null ? 'n/a' : (p95 * 100).toFixed(1) + '%'}`).join(', ') +
        ` → ${reduced ? 'informational under reduced motion' : budgetOk ? 'PASS' : 'FAIL'}`,
    )
    const whiteOk = motionReport.whiteOutsideFlash === 0
    if (!whiteOk) failed = true
    console.log(
      `white frames (>50 % near-white): ${motionReport.whiteFrames} total, ${motionReport.whiteOutsideFlash} outside the ignition flash` +
        `${motionReport.whiteOutsideAt.length > 0 ? ' at ' + motionReport.whiteOutsideAt.join(', ') + ' ms' : ''} → ${whiteOk ? 'PASS' : 'FAIL'}\n`,
    )
  } else {
    console.log('motion: not enough screencast frames\n')
    failed = true
  }

  // ── 6. the checksum is over what the screen prints ────────────────────────
  const crc = (input) => {
    let value = 0xffffffff
    for (let i = 0; i < input.length; i++) {
      value ^= input.charCodeAt(i) & 0xff
      for (let bit = 0; bit < 8; bit++) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1
    }
    return ((value ^ 0xffffffff) >>> 0).toString(16).toUpperCase().padStart(8, '0')
  }
  const crcSample = samples.find((sample) => sample.crc !== null && sample.crcSource !== null)
  const crcOnScreen = crcSample === undefined ? null : crcSample.crc
  const crcSource = crcSample === undefined ? null : crcSample.crcSource
  const recomputed = crcSource === null ? null : '0x' + crc(crcSource)
  const crcOk = recomputed !== null && recomputed === crcOnScreen
  if (!crcOk) failed = true
  console.log(`checksum: screen ${crcOnScreen}, recomputed from "${crcSource}" → ${recomputed} — ${crcOk ? 'PASS' : 'FAIL'}\n`)

  if (outDir !== null) {
    mkdirSync(outDir, { recursive: true })
    writeFileSync(
      join(outDir, `probe-550w-${viewport}${scheme === 'amber' ? '' : '-' + scheme}${reduced ? '-reduced' : ''}.json`),
      JSON.stringify({ viewport, scheme, reduced, table: TABLE, runMs: RUN_MS, worst, countdownMs,
        meterGeometry, meterOk, meterSamples: meterSamples.length, plumeFadeMs, plumeOk, countValues,
        episodes, longest, banner, refFinal, motion: motionReport }, null, 2) + '\n',
    )
  }

  console.log(
    `${failed ? 'FAIL' : 'PASS'}: the 15.45 s cut holds its own table, every window owns its beat, ` +
      'and no single frame of a 换拍 exceeds the hard-cut budget',
  )
} finally {
  session?.close()
  chrome.kill()
  await Promise.race([once(chrome, 'exit'), sleep(2000)]).catch(() => {})
  await server.close()
  for (const file of readdirSync(framesDir)) void file
}
process.exit(failed ? 1 : 0)
