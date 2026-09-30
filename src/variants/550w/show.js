/**
 * 550W — the timeline.
 *
 * Same contract as the ported 550C show: `createShow550W(stage, {mode, cancelled})`
 * returns `{start, cancel}`, everything waits on the cancellable `sleep()` /
 * `later()` pair, and one skip unwinds the whole run.
 *
 * Two rules keep it cheap and leak-free:
 *
 *   1. JavaScript only flips `data-phase` (six writes in 18 s) and adds a handful
 *      of classes; every frame of motion is a CSS animation keyed off that
 *      attribute. There is no rAF loop and no measurement in a loop.
 *   2. There is no `setInterval` anywhere. The countdown is a belt of `later()`
 *      ticks at 50 ms (20 Hz) — deliberately not per frame, see the note at the
 *      tick — and every one of them is registered, so `cancel()` clears the whole
 *      belt at once (npm run audit:leak is the guard).
 */

/** Engine sites, laid out on the graticule: 6 rings × 8 longitudes. */
const W_SITES = (() => {
  const out = []
  for (let i = 0; i < 48; i++) {
    const ring = Math.floor(i / 8)
    const lat = (-70 + ring * 28) * (Math.PI / 180)
    const lon = ((i % 8) * 45 + ring * 21) * (Math.PI / 180)
    out.push({
      x: 210 + 180 * Math.cos(lat) * Math.sin(lon),
      y: 210 - 180 * Math.sin(lat),
    })
  }
  return out
})()

/** Candidate trajectories: 12 endpoints, drawn from one origin. */
const W_BRANCH_ENDS = [
  [110, 130], [205, 92], [300, 152], [392, 78],
  [486, 138], [578, 70], [670, 132], [762, 88],
  [854, 148], [946, 76], [1038, 136], [1128, 108],
]
/** Which of the twelve survive the pruning beat (the rest flash and fade). */
const W_BRANCH_KEEP = [2, 5, 7, 9]

const W_TELEMETRY = [
  ['ORBIT', 'LEO 400 KM · 51.6°'],
  ['CORE', 'QUANTUM LATTICE · 12 PB'],
  ['ENGINES', '10 000 / 10 000'],
  ['NETWORK', 'PLANETARY MESH'],
  ['LATENCY', '0.4 MS'],
  ['THROUGHPUT', '9.7 EFLOPS'],
]

/** The allocation gauges, with a deterministic fill each (the `--v` in the fill). */
const W_SECTORS = [
  ['SECTOR A1', 0.82], ['SECTOR A2', 0.64], ['SECTOR B1', 0.91], ['SECTOR B2', 0.55],
  ['SECTOR C1', 0.73], ['SECTOR C2', 0.88], ['SECTOR D1', 0.47], ['SECTOR D2', 0.69],
  ['SECTOR E1', 0.94], ['SECTOR E2', 0.58], ['SECTOR F1', 0.77], ['SECTOR F2', 0.85],
]

function createShow550W(stage, options) {
  const mode = options.mode === 'full' ? 'full' : 'simple'
  const CANCELLED = options.cancelled
  let cancelled = false
  const pending = new Set()

  /** Cancellable sleep: rejects with CANCELLED once the show is skipped. */
  function sleep(ms) {
    return new Promise((resolve, reject) => {
      if (cancelled) {
        reject(CANCELLED)
        return
      }
      const entry = { reject: reject, timer: 0 }
      entry.timer = setTimeout(() => {
        pending.delete(entry)
        if (cancelled) reject(CANCELLED)
        else resolve()
      }, ms)
      pending.add(entry)
    })
  }

  /** Cancellable setTimeout for the fire-and-forget beats (phase flips, ticks). */
  function later(fn, ms) {
    const entry = { reject: null, timer: 0 }
    entry.timer = setTimeout(() => {
      pending.delete(entry)
      if (!cancelled) fn()
    }, ms)
    pending.add(entry)
    return entry.timer
  }

  const el = (selector) => stage.querySelector(selector)
  const root = el('.w-stage')
  const hint = el('#hint')

  /** One attribute write per beat; every CSS animation keys off it. */
  function phase(name) {
    if (root !== null) root.dataset.phase = name
  }

  /** Skip: unwind every awaited step and drop the hint immediately. */
  function cancel() {
    if (cancelled) return
    cancelled = true
    for (const entry of pending) {
      clearTimeout(entry.timer)
      if (entry.reject !== null) entry.reject(CANCELLED)
    }
    pending.clear()
    if (hint !== null) hint.classList.remove('show')
  }

  /** The parts that are data rather than stylesheet: sites, links, branches, HUD. */
  function build() {
    const sites = el('#w-sites')
    if (sites !== null) {
      sites.innerHTML = W_SITES.map(
        (site, index) =>
          '<i class="w-site" style="left:' +
          ((site.x / 420) * 100).toFixed(2) +
          '%;top:' +
          ((site.y / 420) * 100).toFixed(2) +
          '%;--i:' +
          String(index) +
          '"></i>',
      ).join('')
    }

    const links = el('#w-links')
    if (links !== null) {
      const paths = []
      for (let i = 0; i < W_SITES.length; i++) {
        const from = W_SITES[i]
        const to = W_SITES[(i + 1) % W_SITES.length]
        paths.push([from, to])
      }
      // A few long-haul links so the network reads as a mesh, not a necklace.
      for (let i = 0; i < W_SITES.length; i += 7) paths.push([W_SITES[i], W_SITES[(i + 19) % W_SITES.length]])
      links.innerHTML = paths
        .map(
          ([from, to], index) =>
            '<path class="w-link" pathLength="1" style="--i:' +
            String(index) +
            '" d="M' +
            from.x.toFixed(1) +
            ' ' +
            from.y.toFixed(1) +
            'Q210 210 ' +
            to.x.toFixed(1) +
            ' ' +
            to.y.toFixed(1) +
            '"/>',
        )
        .join('')
    }

    const branches = el('#w-branches')
    if (branches !== null) {
      branches.innerHTML = W_BRANCH_ENDS.map(
        ([x, y], index) =>
          '<path class="w-branch" pathLength="1" data-branch="' +
          String(index) +
          '" style="--i:' +
          String(index) +
          '" d="M600 640C600 470 ' +
          String(x) +
          ' 372 ' +
          String(x) +
          ' ' +
          String(y) +
          '"/>',
      ).join('')
      const canvas = el('.w-canvas')
      if (canvas !== null) {
        canvas.insertAdjacentHTML(
          'beforeend',
          W_BRANCH_ENDS.map(
            ([x, y], index) =>
              '<div class="w-readout" style="left:' +
              ((x / 1200) * 100).toFixed(2) +
              '%;top:' +
              ((y / 700) * 100).toFixed(2) +
              '%;--i:' +
              String(index) +
              '">TRAJ ' +
              String(index + 1).padStart(2, '0') +
              ' · ' +
              (W_BRANCH_KEEP.includes(index) ? 'CONVERGE' : 'PRUNE') +
              '</div>',
          ).join(''),
        )
      }
    }

    const left = el('#w-hud-l')
    if (left !== null) {
      left.innerHTML = W_TELEMETRY.map(
        ([key, value]) => '<div><span class="w-k">' + key + '</span> <span class="w-v">' + value + '</span></div>',
      ).join('')
    }

    const right = el('#w-hud-r')
    if (right !== null) {
      right.innerHTML = W_SECTORS.map(
        ([label, value], index) =>
          '<div class="w-gauge" style="--i:' +
          String(index) +
          ';--v:' +
          value.toFixed(2) +
          '"><span class="w-k">' +
          label +
          '</span><span class="w-bar"><i></i></span><span class="w-num" data-gauge="' +
          String(index) +
          '">' +
          '—' +
          '</span></div>',
      ).join('')
    }
  }

  /** The gauge readouts: written when the beat starts, once more when it settles. */
  function writeGauges(settled) {
    for (let i = 0; i < W_SECTORS.length; i++) {
      const node = stage.querySelector('[data-gauge="' + String(i) + '"]')
      if (node === null) continue
      const value = settled ? W_SECTORS[i][1] : W_SECTORS[i][1] * 0.42
      node.textContent = (value * 100).toFixed(1) + '%'
    }
  }

  /**
   * The countdown.
   *
   * 03.000 → 00.000 is 53 writes over 2.6 s: one every 50 ms (20 Hz), never per
   * frame. A millisecond readout cannot be honest above its own resolution
   * anyway, and at this size 20 Hz already reads as continuous motion — while a
   * per-frame writer would be 156 writes for a number nobody can read that fast.
   * (CSS counters/@property could animate it with zero writes, but zero-padded
   * "03.000" formatting is exactly what they cannot express.)
   */
  const W_COUNT_TICKS = 52
  const W_COUNT_STEP_MS = 50
  function countdown() {
    const node = el('#w-count')
    if (node === null) return
    for (let tick = 0; tick <= W_COUNT_TICKS; tick++) {
      const left = Math.max(0, 3000 - Math.round((tick * 3000) / W_COUNT_TICKS))
      later(() => {
        node.textContent = String(Math.floor(left / 1000)).padStart(2, '0') + '.' + String(left % 1000).padStart(3, '0')
      }, tick * W_COUNT_STEP_MS)
    }
  }

  async function playFull() {
    phase('w0-wake')
    await sleep(1400)

    phase('w1-grid')
    await sleep(3000)

    phase('w2-parallel')
    later(() => {
      for (let i = 0; i < W_BRANCH_ENDS.length; i++) {
        const path = stage.querySelector('[data-branch="' + String(i) + '"]')
        if (path === null) continue
        path.classList.add(W_BRANCH_KEEP.includes(i) ? 'keep' : 'pruned')
      }
    }, 1600)
    await sleep(2600)

    phase('w3-network')
    await sleep(3600)

    phase('w4-alloc')
    // The first machine to use the port's own #hint idiom: shown once, after the
    // network has read, and gone the moment the show is skipped or ends.
    if (hint !== null) hint.classList.add('show')
    writeGauges(false)
    later(() => writeGauges(true), 1600)
    await sleep(2800)

    phase('w5-ignition')
    countdown()
    await sleep(2600)

    phase('w6-pulse')
    if (hint !== null) hint.classList.remove('show')
    await sleep(2000)
  }

  async function playSimple() {
    phase('s0-wake')
    await sleep(800)
    phase('s1-ring')
    await sleep(1400)
    phase('s2-id')
    await sleep(800)
  }

  async function start() {
    build()
    if (mode === 'full') await playFull()
    else await playSimple()
  }

  return { start: start, cancel: cancel }
}
