/**
 * The machine dimension.
 *
 * The splash has three independent axes:
 *
 *   machine   which片头 plays — `550c` (the original port), `550w`, `550a`.
 *             Owned by this file: a machine contributes its own markup,
 *             stylesheet, timeline and content layer.
 *   mode      关闭 / 简易 / 完整 — how much of that machine plays. A machine
 *             that mounts no `app` surface plays its boot stage in both.
 *   scheme    琥珀 / 绿 / 青 / 白 — a palette override, applied as
 *             `data-scheme` on the host and resolved by the machine's own
 *             stylesheet. Each machine maps the four schemes onto ITS tokens,
 *             and a token a machine does not use simply never changes: the
 *             override cannot invent a colour the machine has no surface for.
 *
 * The axes do not interact: the scheme rows are the same four buttons whatever
 * the machine, and the machine's default palette is what shows when the scheme
 * is 琥珀 (the "overrides nothing" default).
 *
 * Storage is a NEW key on purpose. `dsh-550c-boot:mode` and
 * `dsh-550c-boot:scheme` are shipped keys that installed profiles already carry;
 * an unknown or malformed value here falls back to 550C so an older profile —
 * or a hand-edited one — keeps playing exactly what it played before.
 */
const VARIANT_KEY = 'dsh-550c-boot:variant'
const VARIANT_VALUES = ['550c', '550w', '550a']
const DEFAULT_VARIANT = '550c'

/**
 * The first-frame cover colour per machine.
 *
 * The host half (lib/index.js) paints the page before the shell exists and knows
 * nothing but this table, so the two must agree exactly — scripts/build.mjs
 * asserts it. The splash itself reads the same value from the variant entry
 * (see mountOverlay), which is what keeps the hand-off one colour instead of a
 * 550C-sized flash on another machine.
 */
const VARIANT_BG = { '550c': '#050403', '550w': '#04070a', '550a': '#0a0703' }

/** Every machine that can be played, by id (see src/variants/<id>/index.js). */
const VARIANTS = { '550c': VARIANT_550C, '550w': VARIANT_550W, '550a': VARIANT_550A }

/** The variant for `id`, or the default when `id` is missing or unknown. */
function resolveVariant(id) {
  if (typeof id === 'string' && Object.prototype.hasOwnProperty.call(VARIANTS, id)) return VARIANTS[id]
  return VARIANTS[DEFAULT_VARIANT]
}

/** The variant stored for this browser; never throws (private mode, junk values). */
function readVariant() {
  try {
    const raw = window.localStorage.getItem(VARIANT_KEY)
    if (VARIANT_VALUES.indexOf(raw) >= 0 && Object.prototype.hasOwnProperty.call(VARIANTS, raw)) return raw
  } catch (error) {
    /* private mode: nothing is readable, so the default machine plays */
  }
  return DEFAULT_VARIANT
}

function writeVariant(id) {
  try {
    window.localStorage.setItem(VARIANT_KEY, id)
  } catch (error) {
    /* private mode: the choice simply does not persist */
  }
}

/** The machines in picker order. */
function variantList() {
  return VARIANT_VALUES.map((id) => VARIANTS[id]).filter((entry) => entry !== undefined)
}
