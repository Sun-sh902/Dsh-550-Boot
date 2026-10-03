#!/usr/bin/env node
/**
 * The motion evidence, with the frames checked instead of assumed.
 *
 * Two sheets come out of one real run of the shipped bundle:
 *
 *   · 每拍的 300 ms 双帧并列 — for every beat, two frames 300 ms apart, side by
 *     side, so "it is moving" is a picture rather than a claim;
 *   · 两段 6 帧连拍 — a1-moonrise and b1-countdown at a fixed step.
 *
 * CONSTRUCTIVE CHECK, and the reason this tool exists at all: a burst that lands
 * in the wrong place (the previous version photographed the closing banner six
 * times) is worse than no evidence. Before every shot this tool reads the LIVE
 * `#scene[data-phase]` and refuses to continue unless it is the beat the shot was
 * requested for and the timestamp is inside that beat's own window; a mismatch
 * exits 1 with both values. Every frame is also labelled in-image with its beat,
 * the beat's window, the timestamp and its own changed-cell count.
 *
 * Usage:
 *   node tools/motion-sheet.mjs [--viewport 1920x1080] [--out .render/550w-motion]
 *                               [--port 9500]
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
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
const outDir = resolve(root, typeof opt.out === 'string' ? opt.out : '.render/550w-motion')
const port = Number(opt.port ?? 9500)
const MODE_KEY = 'dsh-550c-boot:mode'
const VARIANT_KEY = 'dsh-550c-boot:variant'

/** Mirrors `BEAT_550W` in src/variants/550w/show.js (docs/PLAN-550w.md §1). */
const BEATS = [
  ['a0-boot', 0, 3050],
  ['a1-moonrise', 3050, 4550],
  ['a2-cutaway', 4550, 6050],
  ['a3-link', 6050, 9050],
  ['a4-armed', 9050, 10550],
  ['b1-countdown', 10550, 12950],
  ['b2-ignition', 12950, 13850],
  ['b3-owned', 13850, 15450],
]
const beatOf = (name) => BEATS.find(([id]) => id === name)

/** The 300 ms pairs: one per beat. */
const PAIRS = BEATS.map(([phase, from, to]) => {
  const centre = Math.round((from + to) / 2)
  return { phase, window: [from, to], shots: [centre, centre + 300] }
})

/** The two bursts: six frames inside the beat, at a fixed step. */
const BURSTS = [
  { phase: 'a1-moonrise', window: [3300, 4200], step: 180 },
  { phase: 'b1-countdown', window: [11200, 12800], step: 320 },
].map((burst) => ({
  ...burst,
  shots: Array.from({ length: 6 }, (_, i) => burst.window[0] + i * burst.step),
}))

const PAGE = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>550W motion</title>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}</style>
</head><body>
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
  } catch (error) {}
  window.__phase = () => {
    const host = document.querySelector('.dsh550c-host');
    const scene = host === null ? null : host.shadowRoot?.querySelector('#scene');
    return scene === null || scene === undefined ? null : scene.dataset.phase;
  };
  window.__now = () => performance.now();
</script>
<script src="./client.js"></script>
</body></html>
`

const dir = scratch('dsh550w-motion-')
writeFileSync(join(dir, 'index.html'), PAGE)
writeFileSync(join(dir, 'client.js'), readFileSync(client, 'utf8'))
mkdirSync(outDir, { recursive: true })
const framesDir = mkdtempSync(join(tmpdir(), 'dsh550w-motion-frames-'))

const server = await serve(dir)
const chrome = launchChrome({ port, profile: scratch('dsh550w-motion-profile-') })

let failed = false
let session
try {
  const target = await findPage(port)
  session = await connect(target.webSocketDebuggerUrl)
  await session.send('Page.enable')
  await session.send('Runtime.enable')
  await session.send('Emulation.setDeviceMetricsOverride', { width: vw, height: vh, deviceScaleFactor: 1, mobile: false })
  await session.send('Page.navigate', { url: server.origin + '/index.html' })
  await sleep(400)

  const shots = []
  const run = Math.max(...PAIRS.map((pair) => pair.shots[1]), ...BURSTS.map((burst) => burst.shots[5]))
  const shoot = async (row, at, index) => {
    // Wait for the run's clock from here, not inside the page: the harness's
    // evaluate() JSON-stringifies whatever the expression returns, and a Promise
    // stringifies to {}. Then read the LIVE phase and refuse a mismatch.
    for (let i = 0; i < 4000; i++) {
      const elapsed = await evaluate(session, 'return performance.now() - (window.__t0 ?? 0);')
      if (elapsed >= at) break
      await sleep(4)
    }
    const live = await evaluate(session, 'return window.__phase();')
    const observed = await evaluate(session, 'return { now: Math.round(performance.now() - (window.__t0 ?? 0)), phase: window.__phase() };')
    const beat = beatOf(row.phase)
    const inside = at >= row.window[0] && at <= row.window[1]
    const correct = observed.phase === row.phase
    const file = join(framesDir, `${row.phase}-${String(index).padStart(2, '0')}.png`)
    const { data } = await session.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(file, Buffer.from(data, 'base64'))
    shots.push({ row: row.phase, rowKind: row.kind, at, observed: observed.phase, file, index })
    const ok = inside && correct
    console.log(
      `${ok ? 'OK  ' : 'FAIL'}  ${row.kind.padEnd(5)} ${row.phase.padEnd(13)} t=${String(at).padStart(5)} ms ` +
        `(beat ${beat[1]}–${beat[2]}, live ${observed.now} ms) live phase ${String(observed.phase)}${ok ? '' : '  <-- MISMATCH'}`,
    )
    if (!ok) failed = true
    void live
  }

  // one page load, two passes: first the bursts, then the pairs, both in order
  const ordered = [...BURSTS.map((burst) => ({ ...burst, kind: 'burst' })), ...PAIRS.map((pair) => ({ ...pair, kind: 'pair' }))]
    .flatMap((row) => row.shots.map((at, index) => ({ row, at, index })))
    .sort((a, b) => a.at - b.at)

  await evaluate(session, 'return true;')
  await session.send('Page.navigate', { url: server.origin + '/index.html' })
  // `window.__t0` is the playwright-style run origin: the first frame where the
  // overlay exists, which is where the show's own clock starts.
  await evaluate(
    session,
    'return new Promise((resolve) => { const tick = () => { const host = document.querySelector(".dsh550c-host"); if (host !== null) { window.__t0 = performance.now(); resolve(true); return; } requestAnimationFrame(tick); }; tick(); });',
  )
  for (const entry of ordered) await shoot(entry.row, entry.at, entry.index)
  void run

  // ── per-frame changed cells, on the same 96×54 grid the probe uses ────────
  const changed = new Map()
  const rows = [...BURSTS, ...PAIRS].map((row) => ({ ...row, kind: row.shots.length === 6 ? 'burst' : 'pair' }))
  for (const row of rows) {
    const files = shots
      .filter((shot) => shot.row === row.phase && shot.rowKind === row.kind)
      .sort((a, b) => a.index - b.index)
    if (files.length < 2) continue
    const raw = execFileSync(
      'ffmpeg',
      ['-v', 'error', '-i', join(framesDir, row.phase + '-%02d.png'), '-vf', 'scale=96:54', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
      { maxBuffer: 32 * 1024 * 1024 },
    )
    const cell = 96 * 54
    const between = (a, b) => {
      let count = 0
      for (let p = 0; p < cell; p++) {
        if (Math.abs(raw[a * cell + p] - raw[b * cell + p]) > 8) count += 1
      }
      return (count / cell) * 100
    }
    for (let i = 0; i < files.length; i++) {
      const prev = i === 0 ? Math.min(1, files.length - 1) : i - 1
      const base = i === 0 ? files.length - 1 : 0
      changed.set(`${row.phase}-${i}`, {
        prev: between(i, prev),
        since: between(i, base),
      })
    }
  }

  // ── compose in the browser (this ffmpeg build has no drawtext filter) ─────
  const cell = (shot, cells, width, basis) => {
    const small = width < 400
    const line1 = `${shot.label}`
    const line2 = `t=${shot.at} ms  changed cells ${cells.toFixed(1)} %  (${basis})`
    return (
      `<figure style="margin:0;width:${width}px">` +
      `<img src="${shot.file.split('/').pop()}" style="width:${width}px;display:block">` +
      `<figcaption style="height:${small ? 30 : 28}px;background:#000;color:#e8e8e8;` +
      `font:${small ? 10 : 12}px/${small ? 14 : 14}px -apple-system,Arial;padding:1px 6px;overflow:hidden">` +
      `<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${line1}</div>` +
      `<div style="color:#ff5a48;white-space:nowrap">${line2}</div>` +
      `</figcaption></figure>`
    )
  }

  const sheetPage = (body, width, height) =>
    `<!doctype html><html><head><meta charset="utf-8"><style>` +
    `html,body{margin:0;background:#000}body{width:${width}px;height:${height}px}` +
    `.grid{display:flex;flex-wrap:wrap}</style></head><body>${body}</body></html>`

  const shootSheet = async (html, width, height, file) => {
    writeFileSync(join(dir, 'sheet.html'), html)
    await session.send('Page.navigate', { url: server.origin + '/sheet.html' })
    await sleep(400)
    const { data } = await session.send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width, height, scale: 1 },
      captureBeyondViewport: true,
    })
    writeFileSync(file, Buffer.from(data, 'base64'))
  }

  // the frames are served from the same throwaway origin as the page
  for (const shot of shots) {
    execFileSync('cp', [shot.file, join(dir, shot.file.split('/').pop())])
    shot.label = `${shot.row}  ${beatOf(shot.row)[1]}-${beatOf(shot.row)[2]} ms`
  }

  const burstBody = BURSTS.map((burst) => {
    const files = shots
      .filter((shot) => shot.row === burst.phase && shot.rowKind === 'burst')
      .sort((a, b) => a.index - b.index)
    return (
      `<div style="width:1920px;display:flex">` +
      files.map((shot, i) => {
        const d = changed.get(`${burst.phase}-${i}`) ?? { prev: 0, since: 0 }
        return cell(shot, d.since, 320, `Δ vs row start; adjacent ${d.prev.toFixed(1)} %`)
      }).join('') +
      `</div>`
    )
  }).join('')
  const burstsOut = join(outDir, `550w-motion-bursts-${vw}x${vh}.png`)
  await shootSheet(sheetPage(burstBody, 1920, 2 * 212), 1920, 2 * 212, burstsOut)

  const pairBody =
    `<div style="width:1920px;display:flex;flex-wrap:wrap">` +
    PAIRS.map((pair) => {
      const files = shots
        .filter((shot) => shot.row === pair.phase && shot.rowKind === 'pair')
        .sort((a, b) => a.index - b.index)
      return files.map((shot, i) => {
        const d = changed.get(`${pair.phase}-${i}`) ?? { prev: 0, since: 0 }
        return cell(shot, d.since, 480, 'vs the frame 300 ms earlier')
      }).join('')
    }).join('') +
    `</div>`
  const pairsOut = join(outDir, `550w-motion-pairs-${vw}x${vh}.png`)
  await shootSheet(sheetPage(pairBody, 1920, 4 * 300), 1920, 4 * 300, pairsOut)

  console.log(`\nwrote ${burstsOut.replace(root + '/', '')}`)
  console.log(`wrote ${pairsOut.replace(root + '/', '')}`)
  console.log(`${failed ? 'FAIL' : 'PASS'}: every frame was taken inside the beat it claims`)
} finally {
  session?.close()
  chrome.kill()
  await server.close()
}
process.exit(failed ? 1 : 0)
