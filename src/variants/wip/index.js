/**
 * 正在开发 — the placeholder a machine without a timeline plays.
 *
 * 550W and 550A stay in the machine picker on purpose: the axis, the stored key
 * (`dsh-550c-boot:variant`) and their first-frame colours are already theirs, and
 * dropping an id would turn a profile that stored `550w` into a junk value. What
 * they do not have is a片头 of their own — the first 550W was withdrawn (cold
 * horizon, a grid, no machine and no story: docs/PLAN-550w.md) — and pointing
 * them at 550C's timeline again is exactly the mistake that withdrawal was about.
 *
 * So this is honest and cheap: two beats, one sentence, ~2.2 s, and it borrows
 * nothing from 550C — no logo, no terminal, no ported DOM.
 *
 * The registry contract is unchanged: `createWipShow(stage, {mode, cancelled})`
 * returns `{start, cancel}`, every wait is a cancellable `sleep()`, and
 * `enhanceWip()` returns the disposer the registry promises. One skip (Esc, or a
 * click anywhere) unwinds both beats, the overlay's watchdog still guards it, and
 * `npm run audit:leak` sees the same zero survivors as 550C.
 */

/** The placeholder markup, stamped with the machine it speaks for. */
function wipBootMarkup(machine) {
  return (
    '<div id="wip" data-machine="' +
    machine +
    '">' +
    '<div class="wip-grid"></div>' +
    '<div class="wip-panel">' +
    '<div class="wip-machine">' +
    machine +
    '</div>' +
    '<div class="wip-title">正在开发</div>' +
    '<div class="wip-sub">此机型的开机动画尚未实装<br>将在后续版本展开</div>' +
    '<div class="wip-bar"><i></i></div>' +
    '<div class="wip-foot">WORK IN PROGRESS</div>' +
    '</div>' +
    '</div>'
  )
}

/**
 * The placeholder's sheet.
 *
 * `amber` is "override nothing" here too: it is the machine-agnostic grey this
 * ships with, and the other three schemes move the same three tokens, so the 配色
 * row still does something visible on a machine that has no palette of its own
 * yet. `--caption-fill` / `--caption-symbol` are the Windows title-bar pair
 * (see src/client.js's adaptCaption); they are declared here rather than in an
 * enhancement layer so the strip adapts even though this machine has none.
 */
const WIP_CSS = `
  :host{
    --wip-ink:#e8edf2; --wip-accent:#9fb4c6; --wip-line:rgba(159,180,198,.2);
    --caption-fill:#0a0c0f; --caption-symbol:#9fb4c6;
  }
  :host([data-scheme="green"]){--wip-accent:#57d68a;--wip-ink:#e6f4ea;--wip-line:rgba(87,214,138,.22);--caption-symbol:#57d68a}
  :host([data-scheme="cyan"]){--wip-accent:#3fc8dc;--wip-ink:#e3f4f8;--wip-line:rgba(63,200,220,.22);--caption-symbol:#3fc8dc}
  :host([data-scheme="white"]){--wip-accent:#c9c9c9;--wip-ink:#f2f2f2;--wip-line:rgba(201,201,201,.2);--caption-symbol:#c9c9c9}
  /* Height only — see HOST_CSS in src/client.js for why the stage must not be
     fixed. #wip itself resolves against the fixed host. */
  #wip{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
    overflow:hidden;background:var(--bg,#050403)}
  .wip-grid{position:absolute;inset:-2px;
    background-image:linear-gradient(var(--wip-line) 1px,transparent 1px),
      linear-gradient(90deg,var(--wip-line) 1px,transparent 1px);
    background-size:72px 72px;opacity:.55;
    -webkit-mask-image:radial-gradient(circle at 50% 50%,#000 0,rgba(0,0,0,.35) 46%,transparent 74%);
    mask-image:radial-gradient(circle at 50% 50%,#000 0,rgba(0,0,0,.35) 46%,transparent 74%)}
  /* The port's closing banner, without any of its pixels: the same edge-lit slab
     language, in this machine's neutral grey. */
  .wip-panel{position:relative;min-width:min(420px,72vw);padding:46px 68px 40px;text-align:center;
    background:rgba(6,9,12,.72);border-top:1px solid var(--wip-line);border-bottom:1px solid var(--wip-line);
    color:var(--wip-ink);opacity:0;transform:translateY(6px);
    transition:opacity .42s ease-out,transform .42s ease-out}
  .wip-panel::before,.wip-panel::after{content:"";position:absolute;top:-2px;bottom:-2px;width:2px;
    background:var(--wip-accent);opacity:0}
  .wip-panel::before{left:0}
  .wip-panel::after{right:0}
  .wip-panel.show{opacity:1;transform:none}
  .wip-panel.show::before,.wip-panel.show::after{opacity:.55;transition:opacity .5s ease-out .12s}
  .wip-machine{font-size:12px;letter-spacing:.52em;padding-left:.52em;color:var(--wip-accent);text-transform:uppercase}
  .wip-title{margin-top:14px;font-size:clamp(30px,4.4vw,54px);font-weight:500;letter-spacing:.22em;
    padding-left:.22em;line-height:1.15;text-shadow:0 0 22px rgba(159,180,198,.35)}
  .wip-sub{margin-top:12px;font-size:12px;line-height:2;letter-spacing:.14em;color:rgba(232,237,242,.55)}
  .wip-bar{margin:26px auto 0;height:2px;width:min(320px,58vw);background:rgba(159,180,198,.16);overflow:hidden}
  .wip-bar i{display:block;height:100%;width:0;background:var(--wip-accent);
    transition:width 1.4s linear}
  .wip-bar i.done{width:100%}
  .wip-foot{margin-top:16px;font-size:10px;letter-spacing:.42em;padding-left:.42em;
    color:rgba(232,237,242,.3);font-family:"SF Mono",Menlo,Consolas,monospace}
`

/**
 * The placeholder's timeline: paint, reveal, fill the bar over the real 1.4 s it
 * takes, hold, done. No `setInterval`, no rAF loop — the only motion is the two
 * CSS transitions this flips, which is also why the bar cannot drift out of step
 * with the clock: `done` is added exactly one transition-length before the end.
 */
function createWipShow(stage, options) {
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

  /** Skip: unwind every awaited step. There is nothing else to stop. */
  function cancel() {
    if (cancelled) return
    cancelled = true
    for (const entry of pending) {
      clearTimeout(entry.timer)
      if (entry.reject !== null) entry.reject(CANCELLED)
    }
    pending.clear()
  }

  /** Run the show; resolves when it has played out, rejects when skipped. */
  async function start() {
    const panel = stage.querySelector('.wip-panel')
    const bar = stage.querySelector('.wip-bar i')
    // One frame first, so the panel's transition starts from its painted state
    // instead of being skipped by the same style recalculation that mounted it.
    await sleep(60)
    if (panel !== null) panel.classList.add('show')
    await sleep(1400)
    if (bar !== null) bar.classList.add('done')
    await sleep(700)
  }

  return { start: start, cancel: cancel }
}

/**
 * No content layer: the placeholder is written in one go and carries its own
 * typography, so there is nothing to upgrade after the port. The disposer exists
 * because the registry's shape requires one — `enhance(stage, opts) -> disposer`.
 */
function enhanceWip(stage, options) {
  return function stop() {}
}
