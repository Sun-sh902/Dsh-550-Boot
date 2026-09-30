/**
 * 550W — placeholder entry (Phase 1: the pipeline, not the machine).
 *
 * The settings row can select this machine and the host half already paints its
 * own first-frame colour, but the timeline is still 550C's: this entry borrows
 * markup, stylesheet, show and content layer so the registry has three real
 * machines to resolve, switch between and fall back from.
 *
 * Phase 2 replaces exactly this file (plus its own assets/show/enhance beside it)
 * with the machine's own timeline — nothing outside `src/variants/550w/` has to
 * change for that, which is the whole point of the registry.
 */
const VARIANT_550W = {
  id: '550w',
  label: '550W',
  boot: BOOT_MARKUP,
  app: APP_MARKUP,
  css: CSS_550C,
  show: createShow,
  enhance: enhanceShow,
  watchdogMs: { simple: 12000, full: 30000 },
}
