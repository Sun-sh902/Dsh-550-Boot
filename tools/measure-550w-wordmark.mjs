#!/usr/bin/env node
/**
 * Measure the shipped 550W wordmark against the master still.
 *
 * The a0 wordmark is only credible if it is the master's ink, so this reads both
 * the master (`.render/ref-550w-mark.webp`) and a rendered boot frame, splits
 * each into red/white ink with the SAME thresholds, and reports the numbers the
 * rebuild was specified against:
 *
 *   cap height                     white ink bbox height
 *   red↔white minimum gap          multi-source BFS from white -> nearest over red
 *   red↔white contact pairs        orthogonally adjacent red/white pixels (target 0)
 *   red bbox vs master             each edge/尺寸 as a fraction of the white bbox,
 *                                  compared with the master's (target ≤ 2 %)
 *   primary ink colours            per-channel MEDIAN over each mask (so the
 *                                  anti-aliased skirt and the glow do not drag
 *                                  it), plus the delta against the master
 *   red halo colour                median RGB 2…8 px outside the red mask: the
 *                                  glow's colour, which must follow the ink when
 *                                  the palette row changes
 *
 * The plate is rendered with the glow off by default: `.white`/`.red` get a
 * drop-shadow once `#logo.finished` is on, and a glow is exactly the thing that
 * would smear a 9 %-of-cap gap shut. The glow plate is measured too, so the cost
 * of the glow is a number rather than an opinion.
 *
 * Usage:
 *   node tools/measure-550w-wordmark.mjs --ours .render/probe-d/01-a0-boot-plate.png \
 *                                        --glow .render/probe-d/01-a0-boot-plateglow.png
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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
const master = resolve(root, typeof opt.master === 'string' ? opt.master : '.render/ref-550w-mark.webp')
const ours = resolve(root, typeof opt.ours === 'string' ? opt.ours : '.render/probe-d/01-a0-boot-plate.png')
const glow = typeof opt.glow === 'string' ? resolve(root, opt.glow) : null

function decode(file) {
  const probe = execFileSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file],
    { encoding: 'utf8' },
  ).trim()
  const [width, height] = probe.split(',').map(Number)
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {
    maxBuffer: 256 * 1024 * 1024,
  })
  if (raw.length !== width * height * 3) throw new Error(`decode: ${file} is not raw RGB24 (${raw.length} bytes)`)
  return { width, height, raw }
}

const isRed = (r, g, b) => r > 90 && r > g * 1.7 && r > b * 1.7
const isWhite = (r, g, b) => Math.min(r, g, b) > 150

/** Masks + bboxes + the red↔white gap and contact count, all in device pixels. */
function measure(file) {
  const { width, height, raw } = decode(file)
  const red = new Uint8Array(width * height)
  const white = new Uint8Array(width * height)
  for (let i = 0, p = 0; i < width * height; i++, p += 3) {
    const r = raw[p]
    const g = raw[p + 1]
    const b = raw[p + 2]
    if (isWhite(r, g, b)) white[i] = 1
    else if (isRed(r, g, b)) red[i] = 1
  }
  const box = (mask) => {
    let minX = width
    let maxX = -1
    let minY = height
    let maxY = -1
    let area = 0
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] === 0) continue
      area += 1
      const x = i % width
      const y = (i - x) / width
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    return { minX, maxX, minY, maxY, w: maxX - minX + 1, h: maxY - minY + 1, area }
  }

  // Orthogonal red/white contacts — the thing the master has zero of.
  let contacts = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      if (red[i] === 1) {
        if (x > 0 && white[i - 1] === 1) contacts += 1
        if (x < width - 1 && white[i + 1] === 1) contacts += 1
        if (y > 0 && white[i - width] === 1) contacts += 1
        if (y < height - 1 && white[i + width] === 1) contacts += 1
      }
    }
  }

  // Multi-source BFS out of the white ink: distance to the nearest white pixel.
  const INF = 0xffff
  const dist = new Uint16Array(width * height).fill(INF)
  const queue = []
  for (let i = 0; i < white.length; i++) {
    if (white[i] === 1) {
      dist[i] = 0
      queue.push(i)
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head]
    const x = index % width
    const y = (index - x) / width
    const d = dist[index] + 1
    if (x > 0 && dist[index - 1] > d) {
      dist[index - 1] = d
      queue.push(index - 1)
    }
    if (x < width - 1 && dist[index + 1] > d) {
      dist[index + 1] = d
      queue.push(index + 1)
    }
    if (y > 0 && dist[index - width] > d) {
      dist[index - width] = d
      queue.push(index - width)
    }
    if (y < height - 1 && dist[index + width] > d) {
      dist[index + width] = d
      queue.push(index + width)
    }
  }
  let minGap = INF
  for (let i = 0; i < red.length; i++) {
    if (red[i] === 1 && dist[i] < minGap) minGap = dist[i]
  }

  /**
   * Dominant inks, colour-agnostically: bucket every non-ground pixel to 5 bits
   * per channel, keep the biggest buckets and report each bucket's MEAN colour.
   * The flat fills (the wordmark's white slot and its accent slot) are the two
   * biggest buckets whatever the palette row is, so the same measurement works
   * on the master, on amber and on the three phosphor rows.
   */
  const dominant = (count) => {
    const buckets = new Map()
    for (let i = 0, p = 0; i < width * height; i++, p += 3) {
      const r = raw[p]
      const g = raw[p + 1]
      const b = raw[p + 2]
      if (r + g + b < 30) continue
      const key = ((r >> 5) << 10) | ((g >> 5) << 5) | (b >> 5)
      let slot = buckets.get(key)
      if (slot === undefined) {
        slot = { n: 0, r: 0, g: 0, b: 0 }
        buckets.set(key, slot)
      }
      slot.n += 1
      slot.r += r
      slot.g += g
      slot.b += b
    }
    return [...buckets.values()]
      .sort((a, b) => b.n - a.n)
      .slice(0, count)
      .map((slot) => ({
        n: slot.n,
        rgb: [Math.round(slot.r / slot.n), Math.round(slot.g / slot.n), Math.round(slot.b / slot.n)],
      }))
  }
  const dominantInks = dominant(3)

  // The accent slot, for the halo sample only: pixels that are not primary ink
  // and not ground.
  const accent = new Uint8Array(width * height)
  for (let i = 0, p = 0; i < accent.length; i++, p += 3) {
    if (white[i] === 1) continue
    if (Math.max(raw[p], raw[p + 1], raw[p + 2]) < 28) continue
    accent[i] = 1
  }

  // Distance out of the accent ink too, for the halo sample below.
  const redDist = new Uint16Array(width * height).fill(INF)
  queue.length = 0
  for (let i = 0; i < accent.length; i++) {
    if (accent[i] === 1) {
      redDist[i] = 0
      queue.push(i)
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head]
    const x = index % width
    const y = (index - x) / width
    const d = redDist[index] + 1
    if (x > 0 && redDist[index - 1] > d) {
      redDist[index - 1] = d
      queue.push(index - 1)
    }
    if (x < width - 1 && redDist[index + 1] > d) {
      redDist[index + 1] = d
      queue.push(index + 1)
    }
    if (y > 0 && redDist[index - width] > d) {
      redDist[index - width] = d
      queue.push(index - width)
    }
    if (y < height - 1 && redDist[index + width] > d) {
      redDist[index + width] = d
      queue.push(index + width)
    }
  }

  const whiteBox = box(white)
  const redBox = box(red)

  // Primary ink: per-channel median over each mask. A mode would work on a flat
  // render but the master still is a compressed still, so median it is.
  const median = (mask) => {
    const channels = [[], [], []]
    for (let i = 0, p = 0; i < mask.length; i++, p += 3) {
      if (mask[i] === 0) continue
      channels[0].push(raw[p])
      channels[1].push(raw[p + 1])
      channels[2].push(raw[p + 2])
    }
    return channels.map((values) => {
      if (values.length === 0) return null
      values.sort((a, b) => a - b)
      return values[Math.floor(values.length / 2)]
    })
  }

  const medianOf = (indices) => {
    const channels = [[], [], []]
    for (const i of indices) {
      const p = i * 3
      channels[0].push(raw[p])
      channels[1].push(raw[p + 1])
      channels[2].push(raw[p + 2])
    }
    return channels.map((values) => {
      if (values.length === 0) return null
      values.sort((a, b) => a - b)
      return values[Math.floor(values.length / 2)]
    })
  }
  // Glow sample: just outside the accent ink, on neither ink, and bright enough
  // to have been lit by the glow rather than being bare ground.
  const haloIndices = []
  for (let i = 0; i < accent.length; i++) {
    if (redDist[i] < 1 || redDist[i] > 6) continue
    if (accent[i] === 1 || white[i] === 1) continue
    const p = i * 3
    if (Math.max(raw[p], raw[p + 1], raw[p + 2]) < 6) continue
    haloIndices.push(i)
  }
  // The glow's hue is a faint tint over a lot of ground, so report the MEAN of the
  // lit ring (a median would collapse onto the cluster of near-identical dark
  // pixels and hide the hue). Lit = above the ground floor.
  const haloLit = haloIndices.filter((i) => {
    const p = i * 3
    return raw[p] + raw[p + 1] + raw[p + 2] >= 12
  })
  const meanOf = (indices) => {
    if (indices.length === 0) return null
    const sum = [0, 0, 0]
    for (const i of indices) {
      const p = i * 3
      sum[0] += raw[p]
      sum[1] += raw[p + 1]
      sum[2] += raw[p + 2]
    }
    return sum.map((value) => Math.round(value / indices.length))
  }

  return {
    file: file.replace(root + '/', ''),
    size: `${width}×${height}`,
    white: whiteBox,
    red: redBox,
    cap: whiteBox.h,
    minGap: minGap === INF ? null : minGap,
    minGapPct: minGap === INF ? null : (minGap / whiteBox.h) * 100,
    contacts,
    // The red bbox as a fraction of the white bbox — the scale-free shape of the
    // relationship, which is what "normalized" means for the ≤2 % check.
    redRel: {
      left: (redBox.minX - whiteBox.minX) / whiteBox.w,
      top: (redBox.minY - whiteBox.minY) / whiteBox.h,
      width: redBox.w / whiteBox.w,
      height: redBox.h / whiteBox.h,
    },
    whiteAspect: whiteBox.w / whiteBox.h,
    ink: { white: median(white), red: median(red) },
    inkAccent: median(accent),
    dominantInks,
    haloRed: meanOf(haloLit),
    haloPixels: haloLit.length,
  }
}

const M = measure(master)
const O = measure(ours)
const G = glow === null ? null : measure(glow)

const pct = (value) => `${(value * 100).toFixed(2)} %`
/** Absolute difference of two fractions, in percentage points. */
const pp = (a, b) => `${(Math.abs(a - b) * 100).toFixed(2)} pp`
const num = (value) => (value === null ? 'n/a' : String(value))

const rows = [
  [
    'dominant ink #1 RGB',
    M.dominantInks[0].rgb.join(','),
    O.dominantInks[0].rgb.join(','),
    `Δ ${O.dominantInks[0].rgb.map((value, i) => value - M.dominantInks[0].rgb[i]).join(',')}`,
  ],
  [
    'dominant ink #2 RGB',
    M.dominantInks[1].rgb.join(','),
    O.dominantInks[1].rgb.join(','),
    `Δ ${O.dominantInks[1].rgb.map((value, i) => value - M.dominantInks[1].rgb[i]).join(',')}`,
  ],
  [
    'accent halo RGB (glow, mean of lit ring)',
    M.haloRed === null ? 'n/a' : M.haloRed.join(','),
    (G ?? O).haloRed === null ? 'n/a' : (G ?? O).haloRed.join(','),
    G === null ? 'glow frame not passed (--glow)' : `${(G ?? O).haloPixels} px sampled`,
  ],
  ['cap height (white bbox h)', `${M.cap} px`, `${O.cap} px`, pct(Math.abs(O.cap - M.cap) / M.cap)],
  [
    'white bbox w×h',
    `${M.white.w}×${M.white.h}`,
    `${O.white.w}×${O.white.h}`,
    pct(Math.max(Math.abs(O.white.w - M.white.w) / M.white.w, Math.abs(O.white.h - M.white.h) / M.white.h)),
  ],
  [
    'red bbox w×h',
    `${M.red.w}×${M.red.h}`,
    `${O.red.w}×${O.red.h}`,
    pct(Math.max(Math.abs(O.red.w - M.red.w) / M.red.w, Math.abs(O.red.h - M.red.h) / M.red.h)),
  ],
  ['red↔white min gap', `${M.minGap} px = ${M.minGapPct.toFixed(1)} % cap`, `${O.minGap} px = ${O.minGapPct.toFixed(1)} % cap`, 'target ≥ 8 % cap'],
  ['red↔white contact pairs', `${M.contacts}`, `${O.contacts}`, 'target 0'],
  ['red bbox left (of white w)', pct(M.redRel.left), pct(O.redRel.left), `${pp(M.redRel.left, O.redRel.left)} ≤ 2 pp`],
  ['red bbox top (of white h)', pct(M.redRel.top), pct(O.redRel.top), `${pp(M.redRel.top, O.redRel.top)} ≤ 2 pp`],
  ['red bbox width (of white w)', pct(M.redRel.width), pct(O.redRel.width), `${pp(M.redRel.width, O.redRel.width)} ≤ 2 pp`],
  ['red bbox height (of white h)', pct(M.redRel.height), pct(O.redRel.height), `${pp(M.redRel.height, O.redRel.height)} ≤ 2 pp`],
  ['white aspect w/h', M.whiteAspect.toFixed(4), O.whiteAspect.toFixed(4), pct(Math.abs(O.whiteAspect - M.whiteAspect) / M.whiteAspect)],
]

const width = [34, 30, 30, 22]
const line = (cells) => cells.map((cell, i) => String(cell).padEnd(width[i])).join(' ')
process.stdout.write(`master: ${M.file} (${M.size})\nours:   ${O.file} (${O.size})\n\n`)
process.stdout.write(line(['metric', 'master', 'ours', 'delta / target']) + '\n')
process.stdout.write(line(['-'.repeat(32), '-'.repeat(28), '-'.repeat(28), '-'.repeat(20)]) + '\n')
for (const row of rows) process.stdout.write(line(row) + '\n')
if (G !== null) {
  process.stdout.write(
    `\nglow ON (same frame, #logo.finished): min gap ${G.minGap} px = ${G.minGapPct.toFixed(1)} % cap, ` +
      `${G.contacts} contact pairs, white ink ${G.ink.white.join(',')} / red ink ${G.ink.red.join(',')} — ` +
      `the glow is what a white/red drop-shadow does to a ${M.minGapPct.toFixed(1)} % gap\n`,
  )
}

// Other frames worth a line each — notably the same mark at the real boot size
// with the glow on, which is where a 14 px gap and an 18 px drop-shadow meet.
for (const extra of String(opt.extra ?? '').split(',').filter((value) => value.length > 0)) {
  const E = measure(resolve(root, extra))
  const gap = E.minGap === null ? 'no red ink' : `${E.minGap} px = ${E.minGapPct.toFixed(1)} % cap`
  const redRel = E.minGap === null ? 'n/a' : pct(E.redRel.width)
  process.stdout.write(
    `extra  ${E.file}  cap ${E.cap} px  min gap ${gap}  ` +
      `contacts ${E.contacts}  red/w ${redRel}  ink ${E.dominantInks[0].rgb.join(',')} / ${E.dominantInks[1].rgb.join(',')}` +
      `  halo ${E.haloRed === null ? 'n/a' : E.haloRed.join(',')}\n`,
  )
}

const json = resolve(root, '.render/550w-wordmark-metrics.json')
writeFileSync(json, JSON.stringify({ master: M, ours: O, glow: G, rows }, null, 2) + '\n')
process.stdout.write(`\nwrote ${json.replace(root + '/', '')}\n`)
