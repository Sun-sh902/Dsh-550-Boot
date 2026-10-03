/**
 * 550W — the Lunar Override.
 *
 * The first 550W was withdrawn in full (cold horizon, a grid, abstract gauges:
 * no machine, no moon, no narrative — see docs/PLAN-550w.md). The rebuild starts
 * from the frame the film actually shows: 550C's own opening apparatus with the
 * MASTER's wordmark traced into it (assets/550w-wordmark.svg), which is what
 * makes the two machines read as one family.
 *
 * `status` is gone on purpose. It was the machine-picker's "no timeline yet"
 * flag: the settings row answered a click on this entry by replaying the
 * 「正在开发」 placeholder, and drew a 开发中 chip beside it. 550W has a timeline
 * of its own now, so the row treats it like any other machine — selecting it does
 * not autoplay, and the chip is gone. 550A keeps its `status: 'wip'`.
 *
 * `app: APP_550W` is the full-mode surface: the master situation display (a
 * constant background — it never toggles), the three persistent information
 * layers and the six windows, all keyed off `[data-phase]` (sixty hooks in
 * assets.js). 简易 mounts `boot` alone — one beat, 3.05 s — and 完整 plays the
 * opening plus eight beats to 15.45 s, one 550C-sized window at a time; see
 * show.js for the table and the two clocks.
 *
 * `watchdogMs` must outlive the machine's own timeline: 简易 is 3.05 s and 完整
 * is 15.45 s, so 30 s is the ceiling with room for a slow machine.
 */
const VARIANT_550W = {
  id: '550w',
  label: '550W',
  boot: BOOT_MARKUP_550W,
  app: APP_550W,
  css: CSS_550W,
  show: createShow550W,
  enhance: enhanceShow550W,
  watchdogMs: { simple: 12000, full: 30000 },
}
