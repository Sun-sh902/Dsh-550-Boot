#!/usr/bin/env node
/**
 * Trace the whole 550W wordmark out of the master still.
 *
 * The mark is NOT drawn from memory and it is NOT 550C's letterforms with a new
 * tail bolted on. `.render/ref-550w-mark.webp` is the master; this tool decodes
 * it with ffmpeg (already on the box — no image library, no new dependency),
 * splits the white and red ink, walks every ink region's boundary, simplifies it
 * with Ramer–Douglas–Peucker, and writes the regions into
 * `assets/550w-wordmark.svg` as the finished contents of the boot markup's
 * `<g id="logo">`.
 *
 * WHY THE WHOLE MARK, and this is the finding that forced it: the master's ink
 * never crosses between the white and the red — the smallest red↔white gap is
 * 48 px (9.0 % of the 533 px cap height) and there are ZERO orthogonally
 * adjacent red/white pixel pairs. The red W sits inside the OPEN ARC that the
 * master uses for its third glyph — that arc is not a closed 0 like 550C's
 * `#red0`. 550C's third glyph IS closed, so any placement of a traced tail
 * either crosses white ink or leaves a meaningless gap: the two marks cannot be
 * reconciled by moving anything. (Second structural finding, visible in the
 * region list below: the master draws across glyph boundaries — its second 5's
 * top bar flows straight into the arc, and its first 5's stem flows into the
 * second 5's bowl, so "swap just the third glyph" is not a construction that
 * exists without cutting a stroke in half.)
 *
 * PLACEMENT: the traced ink is mapped into the boot viewBox (800×230) so that it
 * sits where 550C's own wordmark sits, measured from the live ported markup
 * (tools/mock-550w.mjs prints these):
 *
 *   550C: the two 5s span y 34…221 (cap height 187), the mark's left edge is
 *         x 121, its cap top is y 34.
 *   master: white ink bbox is x 85…1771, y 98…631.
 *
 * so scale = 187 / 534 and the translation puts the master's cap top on y 34 and
 * its left edge on x 121. The relative geometry — every gap, every overlap —
 * comes along for free; nothing is nudged afterwards.
 *
 * Usage: node tools/trace-550w-mark.mjs [--ref …] [--out …] [--eps 1.6] [--debug]
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
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
const ref = resolve(root, typeof opt.ref === 'string' ? opt.ref : '.render/ref-550w-mark.webp')
const out = resolve(root, typeof opt.out === 'string' ? opt.out : 'assets/550w-wordmark.svg')
const EPS = Number(opt.eps ?? 1.6)

// 550C's own wordmark metrics, measured from the live ported markup.
const CAP_550C = 187
const LEFT_550C = 121
const TOP_550C = 34

// ── decode ──────────────────────────────────────────────────────────────────
function decode(file) {
  const probe = execFileSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file],
    { encoding: 'utf8' },
  ).trim()
  const [width, height] = probe.split(',').map(Number)
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {
    maxBuffer: 128 * 1024 * 1024,
  })
  if (raw.length !== width * height * 3) throw new Error(`decode: expected ${width * height * 3} bytes, got ${raw.length}`)
  return { width, height, raw }
}

// Red mask: the still measures rgb(231,20,27) at the core. White mask: bright.
const isRed = (r, g, b) => r > 90 && r > g * 1.7 && r > b * 1.7
const isWhite = (r, g, b) => Math.min(r, g, b) > 150

function maskBits(img, test) {
  const { width, height, raw } = img
  const bits = new Uint8Array(width * height)
  for (let i = 0, p = 0; i < bits.length; i++, p += 3) {
    if (test(raw[p], raw[p + 1], raw[p + 2])) bits[i] = 1
  }
  return bits
}

/** 8-connected components, larger than `minArea`, sorted left to right. */
function components(bits, width, height, minArea) {
  const seen = new Uint8Array(width * height)
  const out = []
  const stack = []
  for (let start = 0; start < bits.length; start++) {
    if (bits[start] === 0 || seen[start] === 1) continue
    stack.length = 0
    stack.push(start)
    seen[start] = 1
    const members = []
    let minX = width
    let maxX = -1
    let minY = height
    let maxY = -1
    while (stack.length > 0) {
      const index = stack.pop()
      members.push(index)
      const x = index % width
      const y = (index - x) / width
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const n = ny * width + nx
          if (bits[n] === 1 && seen[n] === 0) {
            seen[n] = 1
            stack.push(n)
          }
        }
      }
    }
    if (members.length >= minArea) out.push({ members, area: members.length, minX, maxX, minY, maxY })
  }
  out.sort((a, b) => a.minX - b.minX)
  return out
}

/** Background regions fully enclosed by one component: its holes. */
function holesOf(component, width, height) {
  const own = new Uint8Array(width * height)
  for (const index of component.members) own[index] = 1
  const outside = new Uint8Array(width * height)
  const queue = []
  const push = (index) => {
    if (own[index] === 0 && outside[index] === 0) {
      outside[index] = 1
      queue.push(index)
    }
  }
  for (let x = 0; x < width; x++) {
    push(x)
    push((height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    push(y * width)
    push(y * width + width - 1)
  }
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head]
    const x = index % width
    const y = (index - x) / width
    if (x > 0) push(index - 1)
    if (x < width - 1) push(index + 1)
    if (y > 0) push(index - width)
    if (y < height - 1) push(index + width)
  }
  const inner = new Uint8Array(width * height)
  for (let i = 0; i < inner.length; i++) if (own[i] === 0 && outside[i] === 0) inner[i] = 1
  return components(inner, width, height, 40)
}

/**
 * Moore-neighbour boundary walk over one mask. Used both for ink regions and for
 * their holes (a hole is just another region in the complementary mask).
 */
function traceContour(mask, width, height, seed) {
  const at = (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : mask[y * width + x])
  const sx = seed % width
  const sy = (seed - sx) / width
  const dirs = [
    [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
  ]
  const points = []
  let x = sx
  let y = sy
  let dir = 6
  let guard = 0
  const limit = width * height * 8
  do {
    points.push([x, y])
    let found = false
    for (let k = 0; k < 8; k++) {
      const d = (dir + 6 + k) % 8
      const nx = x + dirs[d][0]
      const ny = y + dirs[d][1]
      if (at(nx, ny) === 1) {
        x = nx
        y = ny
        dir = d
        found = true
        break
      }
    }
    if (!found) break
    if (++guard > limit) throw new Error('trace: boundary walk did not close')
  } while (!(x === sx && y === sy) || points.length < 4)
  return points
}

/** Ramer–Douglas–Peucker on a closed polygon. */
function rdp(points, eps) {
  if (points.length < 3) return points.slice()
  const closed = points[0][0] === points[points.length - 1][0] && points[0][1] === points[points.length - 1][1]
  const source = closed ? points.slice(0, -1) : points
  const keep = new Uint8Array(source.length)
  keep[0] = 1
  keep[source.length - 1] = 1
  const stack = [[0, source.length - 1]]
  while (stack.length > 0) {
    const [start, end] = stack.pop()
    const [x1, y1] = source[start]
    const [x2, y2] = source[end]
    const dx = x2 - x1
    const dy = y2 - y1
    const length = Math.hypot(dx, dy) || 1
    let far = -1
    let farDist = eps
    for (let i = start + 1; i < end; i++) {
      const [px, py] = source[i]
      const dist = Math.abs(dy * px - dx * py + x2 * y1 - y2 * x1) / length
      if (dist > farDist) {
        far = i
        farDist = dist
      }
    }
    if (far !== -1) {
      keep[far] = 1
      stack.push([start, far], [far, end])
    }
  }
  const kept = []
  for (let i = 0; i < source.length; i++) if (keep[i] === 1) kept.push(source[i])
  return kept
}

const round1 = (value) => String(Math.round(value * 10) / 10)

/** One closed polygon -> SVG subpath, mapped through the placement. */
function toSubpath(points, map) {
  const head = points[0]
  const rest = points.slice(1)
  const [hx, hy] = map(head[0], head[1])
  return (
    `M${round1(hx)} ${round1(hy)}` +
    rest.map(([x, y]) => {
      const [mx, my] = map(x, y)
      return `L${round1(mx)} ${round1(my)}`
    }).join('') +
    'Z'
  )
}

// ── run ─────────────────────────────────────────────────────────────────────
const img = decode(ref)
const white = maskBits(img, isWhite)
const red = maskBits(img, isRed)
const whiteParts = components(white, img.width, img.height, 300)
const redParts = components(red, img.width, img.height, 300)

const whiteBox = {
  minX: Math.min(...whiteParts.map((part) => part.minX)),
  maxX: Math.max(...whiteParts.map((part) => part.maxX)),
  minY: Math.min(...whiteParts.map((part) => part.minY)),
  maxY: Math.max(...whiteParts.map((part) => part.maxY)),
}
const redBox = {
  minX: Math.min(...redParts.map((part) => part.minX)),
  maxX: Math.max(...redParts.map((part) => part.maxX)),
  minY: Math.min(...redParts.map((part) => part.minY)),
  maxY: Math.max(...redParts.map((part) => part.maxY)),
}

const capMaster = whiteBox.maxY - whiteBox.minY + 1
const SCALE = CAP_550C / capMaster
const TX = LEFT_550C - whiteBox.minX * SCALE
const TY = TOP_550C - whiteBox.minY * SCALE
const map = (x, y) => [TX + x * SCALE, TY + y * SCALE]

process.stdout.write(`ref ${ref.replace(root + '/', '')} — ${img.width}×${img.height}\n`)
process.stdout.write(
  `white ink bbox x ${whiteBox.minX}–${whiteBox.maxX} (w ${whiteBox.maxX - whiteBox.minX + 1}), ` +
    `y ${whiteBox.minY}–${whiteBox.maxY} (h ${capMaster})\n`,
)
process.stdout.write(
  `red ink bbox   x ${redBox.minX}–${redBox.maxX} (w ${redBox.maxX - redBox.minX + 1}), ` +
    `y ${redBox.minY}–${redBox.maxY} (h ${redBox.maxY - redBox.minY + 1})\n`,
)
process.stdout.write(
  `placement: scale ${SCALE.toFixed(5)} (cap ${CAP_550C} / ${capMaster}), translate(${round1(TX)} ${round1(TY)}) ` +
    `-> white ink lands x ${round1(map(whiteBox.minX, 0)[0])}–${round1(map(whiteBox.maxX, 0)[0])}, ` +
    `y ${round1(map(0, whiteBox.minY)[1])}–${round1(map(0, whiteBox.maxY)[1])}\n`,
)

const parts = []
let partIndex = 0
for (const group of [
  { mask: 'white', list: whiteParts },
  { mask: 'red', list: redParts },
]) {
  for (const component of group.list) {
    const contour = traceContour(group.mask === 'white' ? white : red, img.width, img.height, component.members[0])
    const simplified = rdp(contour, EPS)
    const holes = holesOf(component, img.width, img.height).map((hole) => {
      const holeContour = traceContour(
        (() => {
          const m = new Uint8Array(img.width * img.height)
          for (const index of hole.members) m[index] = 1
          return m
        })(),
        img.width,
        img.height,
        hole.members[0],
      )
      return { contour: holeContour.length, points: rdp(holeContour, EPS) }
    })
    partIndex += 1
    parts.push({
      order: partIndex,
      mask: group.mask,
      component,
      contour: contour.length,
      points: simplified,
      holes,
      box: {
        minX: round1(map(component.minX, 0)[0]),
        maxX: round1(map(component.maxX, 0)[0]),
        minY: round1(map(0, component.minY)[1]),
        maxY: round1(map(0, component.maxY)[1]),
      },
    })
  }
}

parts.sort((a, b) => a.component.minX - b.component.minX)
parts.forEach((part, index) => {
  part.order = index + 1
})

for (const part of parts) {
  process.stdout.write(
    `  part ${part.order}  ${part.mask.padEnd(5)} x ${String(part.component.minX).padStart(4)}–${String(part.component.maxX).padEnd(4)} ` +
      `y ${String(part.component.minY).padStart(3)}–${String(part.component.maxY).padEnd(3)} ` +
      `${String(part.component.area).padStart(6)} px  ${part.contour} contour px -> ${part.points.length} points` +
      `  holes ${part.holes.length}  -> viewBox x ${part.box.minX}–${part.box.maxX} y ${part.box.minY}–${part.box.maxY}\n`,
  )
}

const viewBox = { minX: Math.min(...parts.map((p) => p.box.minX)), maxX: Math.max(...parts.map((p) => p.box.maxX)) }
process.stdout.write(
  `wordmark lands x ${viewBox.minX}–${viewBox.maxX} (w ${round1(viewBox.maxX - viewBox.minX)}) in the 800×230 viewBox; ` +
    `${parts.length} paths, ${parts.length} groups\n`,
)

const header =
  `<!-- 550W wordmark — traced from ${ref.replace(root + '/', '')} (${img.width}×${img.height}).\n` +
  `     Regenerate with: node tools/trace-550w-mark.mjs\n` +
  `     Boundary walk -> Ramer-Douglas-Peucker ${EPS}px. Placement scale ${SCALE.toFixed(5)} ` +
  `(550C cap ${CAP_550C} / master cap ${capMaster}),\n` +
  `     translate(${round1(TX)} ${round1(TY)}): the master's cap top lands on 550C's cap top (y ${TOP_550C}) and its\n` +
  `     left edge on 550C's (x ${LEFT_550C}). Relative geometry — every gap — comes from the trace.\n\n` +
  `     ${parts.length} ink regions, in the order playBoot() writes them (sort by getBBox().x):\n` +
  parts
    .map(
      (part) =>
        `       ${part.order}  x ${String(part.component.minX).padStart(4)}-${String(part.component.maxX).padEnd(4)} ` +
        `y ${String(part.component.minY).padStart(3)}-${String(part.component.maxY).padEnd(3)} ` +
        `${String(part.component.area).padStart(6)} px  ${part.mask.padEnd(5)} ${part.points.length} pts` +
        `${part.holes.length > 0 ? `, +${part.holes.length} hole` : ''}`,
    )
    .join('\n') +
  `\n\n     The master's ink never crosses between white and red (48 px = 9.0 % cap minimum gap,\n` +
  `     zero orthogonally adjacent red/white pairs), and its strokes run across glyph\n` +
  `     boundaries — region 2 is the first 5's stem flowing into the second 5's bowl, region 3\n` +
  `     is the second 5's top bar flowing into the open-arc third glyph. So the colouring below\n` +
  `     (white 55 + open arc, red W-left, white W-right) is the master's own, which is ② 左红右白;\n` +
  `     changing palette = changing the class attribute on the affected path, nothing else. -->\n`

const body = parts
  .map((part) => {
    const subpaths = [toSubpath(part.points, map)]
    for (const hole of part.holes) subpaths.push(toSubpath(hole.points, map))
    const fillRule = part.holes.length > 0 ? ' fill-rule="evenodd"' : ''
    return (
      `  <g id="w${part.order}" data-part="${part.order}" data-mask="${part.mask}">\n` +
      `    <path class="${part.mask}"${fillRule} d="${subpaths.join('')}"/>\n` +
      `  </g>`
    )
  })
  .join('\n')

const svg = `${header}${body}\n`
writeFileSync(out, svg)
process.stdout.write(`trace: wrote ${out.replace(root + '/', '')} (${svg.length} chars)\n`)

if (opt.debug === true) {
  process.stdout.write(
    JSON.stringify(
      {
        whiteBox,
        redBox,
        capMaster,
        scale: SCALE,
        translate: [Number(round1(TX)), Number(round1(TY))],
        parts: parts.map((part) => ({
          order: part.order,
          mask: part.mask,
          area: part.component.area,
          bbox: [part.component.minX, part.component.minY, part.component.maxX, part.component.maxY],
          points: part.points.length,
          holes: part.holes.length,
        })),
        bytes: svg.length,
      },
      null,
      2,
    ) + '\n',
  )
  void readFileSync
}
