/**
 * 550A — placeholder entry (Phase 1: the pipeline, not the machine).
 *
 * See src/variants/550w/index.js — same deal: selectable, its own first-frame
 * colour, 550C's timeline underneath until its own phase lands.
 */
const VARIANT_550A = {
  id: '550a',
  label: '550A',
  boot: BOOT_MARKUP,
  app: APP_MARKUP,
  css: CSS_550C,
  show: createShow,
  enhance: enhanceShow,
  watchdogMs: { simple: 12000, full: 30000 },
}
