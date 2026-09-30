/**
 * 550W — 冷白/青的"算力过剩"机器：三层纵深 + 全屏冲击，18.0s 完整档 / 3.0s 简易档。
 *
 * One composition for both modes (`app: null`): everything this machine can draw
 * lives in `boot`, the timeline branches on mode, and the stylesheet hides the
 * layers simple mode has no time for. Full mode is 18.0 s over seven named
 * phases; simple mode is a 3.0 s beat on the same DOM.
 *
 * The palette is its own token set (see assets.js): 琥珀 is "override nothing" and
 * the other three schemes remap that same set, so switching machine never
 * reinterprets a colour the machine has no surface for.
 *
 * watchdogMs stays at the shared 30 s: the timeline ends at 18.0 s and the fade
 * adds 0.6 s, so the safety net keeps a 10 s margin without needing a longer one.
 */
const VARIANT_550W = {
  id: '550w',
  label: '550W',
  boot: BOOT_MARKUP_550W,
  app: null,
  css: CSS_550W,
  show: createShow550W,
  enhance: enhanceShow550W,
  watchdogMs: { simple: 12000, full: 30000 },
}
