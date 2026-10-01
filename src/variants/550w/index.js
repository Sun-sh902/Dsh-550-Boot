/**
 * 550W — 未实装：the picker keeps the machine, the splash says so.
 *
 * The first 550W was withdrawn in full (cold horizon, a grid, abstract gauges:
 * no machine, no moon, no narrative, and a wordmark where 550C ends on
 * `SYSTEM IS REWRITTEN` — see docs/PLAN-550w.md for the review and the spec that
 * replaced it). Nothing of that implementation is left in the tree, and the
 * second attempt was paused before its timeline existed. What ships today is the
 * 「正在开发」 placeholder in src/variants/wip/index.js: the entry keeps its id,
 * its label and its first-frame colour, and `status: 'wip'` is what the settings
 * row reads to answer the click by playing that placeholder.
 *
 * `app: null` for the same reason as before — the placeholder is one composition,
 * so both modes mount the same markup, and the 档位 row still decides whether an
 * overlay is mounted at all.
 */
const VARIANT_550W = {
  id: '550w',
  label: '550W',
  status: 'wip',
  boot: wipBootMarkup('550W'),
  app: null,
  css: WIP_CSS,
  show: createWipShow,
  enhance: enhanceWip,
  watchdogMs: { simple: 12000, full: 30000 },
}
