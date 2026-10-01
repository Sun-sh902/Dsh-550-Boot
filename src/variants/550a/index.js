/**
 * 550A — 未实装：same deal as 550W (see that entry).
 *
 * Selectable, its own first-frame colour, and the 「正在开发」 placeholder instead
 * of a timeline it does not have. `status: 'wip'` is what makes the settings row
 * replay the placeholder on click.
 */
const VARIANT_550A = {
  id: '550a',
  label: '550A',
  status: 'wip',
  boot: wipBootMarkup('550A'),
  app: null,
  css: WIP_CSS,
  show: createWipShow,
  enhance: enhanceWip,
  watchdogMs: { simple: 12000, full: 30000 },
}
