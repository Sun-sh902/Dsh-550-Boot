/**
 * dsh-550c-boot — browser half.
 *
 * Two surfaces:
 *
 *   the splash            mounted IMPERATIVELY from apply(), not through a slot
 *                         — see mountOverlay() for why that matters
 *   settings.general.item  three rows next to Appearance: 档位 (关闭 / 简易 /
 *                        完整), 配色 (琥珀 / 绿 / 青 / 白) and 机型 (550C /
 *                        550W / 550A). They are independent axes — see
 *                        src/variants/registry.js for what each one owns.
 *
 * The row is a plain React element (createElement, no JSX: the client loader
 * hands this module `require`, and `react` is one of the externals it resolves —
 * the same shape tsdown emits for the published client plugins). The splash is
 * plain DOM in a shadow root, so the original page's generic class names
 * (.w, .ln, .dt) cannot leak into DSH's own UI.
 *
 * The show plays once per client boot. `#app`'s markup is only mounted in full
 * mode, and the splash never waits for anything: it plays to the end and then
 * fades, whatever state the app behind it is in.
 */

const React = require('react')

const MODE_KEY = 'dsh-550c-boot:mode'
const MODE_VALUES = ['off', 'simple', 'full']
const DEFAULT_MODE = 'full'
const SCHEME_KEY = 'dsh-550c-boot:scheme'
/** Amber is the original author's palette and the default: choosing it clears
 *  the data-scheme attribute entirely, so nothing is overridden. */
const SCHEME_VALUES = ['amber', 'green', 'cyan', 'white']
const DEFAULT_SCHEME = 'amber'
/** Skip token: thrown through the show's awaits when the user skips. */
const CANCELLED = Symbol('dsh-550c-cancelled')
/** How long the whole hand-off takes: the content fade (200 ms) plus the delay
 *  and the backdrop fade (200 + 420 ms). Must match :host(.dsh550c-out). */
const FADE_MS = 620
const ROW_STYLE_ID = 'dsh-550c-boot-row-style'
/** Handshake with the host half's first frame (see endFirstFrame + lib/index.js). */
const FIRST_FRAME_GLOBAL = '__dsh550cFirstFrame'
/** The host-document sheet that makes the Desktop caption strip see-through. */
const CAPTION_STYLE_ID = 'dsh-550c-boot-caption'
/** The host-document sheet that keeps the overlay out of the macOS drag region. */
const DRAG_GUARD_STYLE_ID = 'dsh-550c-boot-drag-guard'
/** Reduced-motion query; the full show is 11.5 s of movement plus a blinking
 *  cursor and the strobing override flow, so it is never an implicit default
 *  for someone who asked the system for less motion. */
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/** The one live splash; the boot trigger and the preview button share it. */
let liveOverlay = null

/** Whether the OS asks for reduced motion. False wherever matchMedia is absent. */
function prefersReducedMotion() {
  try {
    return window.matchMedia(REDUCED_MOTION_QUERY).matches
  } catch (error) {
    return false
  }
}

/**
 * The mode to play.
 *
 * An explicit choice always wins, including 完整 on a machine that asks for
 * reduced motion — the setting is the user's own, and the host half keys off the
 * same stored value. Only a profile that has NEVER chosen gets the fallback, and
 * there it falls back to 'simple': the short logo beat keeps the product's
 * identity while dropping the 11.5 s override flow, the scrolling HUD, the
 * popups and the blinking cursor. 'off' would be the stricter reading, but it
 * would also take the splash — and with it the first frame that covers DSH's own
 * boot card — away from everyone who merely has "reduce motion" on, which is a
 * bigger change than the preference asks for. The two other modes are one click
 * away in Settings if that judgement is wrong for a given user.
 */
function readMode() {
  try {
    const raw = window.localStorage.getItem(MODE_KEY)
    if (MODE_VALUES.indexOf(raw) >= 0) return raw
  } catch (error) {
    /* private mode: nothing is stored, so fall through to the fallback */
  }
  return prefersReducedMotion() ? 'simple' : DEFAULT_MODE
}

function writeMode(mode) {
  try {
    window.localStorage.setItem(MODE_KEY, mode)
  } catch (error) {
    /* private mode: the choice simply does not persist */
  }
}

function readScheme() {
  try {
    const raw = window.localStorage.getItem(SCHEME_KEY)
    return SCHEME_VALUES.indexOf(raw) >= 0 ? raw : DEFAULT_SCHEME
  } catch (error) {
    return DEFAULT_SCHEME
  }
}

function writeScheme(scheme) {
  try {
    window.localStorage.setItem(SCHEME_KEY, scheme)
  } catch (error) {
    /* private mode: the choice simply does not persist */
  }
}

/** The overlay's own sheet: host geometry + the extracted animation styles. */
const HOST_CSS = `
:host{position:fixed;inset:0;display:block;box-sizing:border-box;z-index:2147483000;background:var(--bg,#050403)}
/* The hand-off is deliberately two-phase, because a single cross-fade is ugly:
   the port ends on a big, bright logo, and dissolving that straight into the
   conversation page stamps a grey ghost of it over the UI for half a second
   (measured frame by frame). So the CONTENT goes first — the logo and panels
   fade into the splash's own background, which the host now paints itself — and
   only then does that clean backdrop fade away to reveal the app. The backdrop
   is read from the animation's own --bg, so both phases agree on the colour. */
:host(.dsh550c-out){opacity:0;transition:opacity 420ms cubic-bezier(.4,0,.2,1) 200ms}
:host(.dsh550c-out) .dsh550c-stage{opacity:0;transition:opacity 200ms ease-out}
/* Height only — deliberately NOT position:fixed. A fixed stage would create a
   stacking context and trap #boot's z-index 2000 inside it, which lets the
   ported vignette (z-index 899) and scanlines paint OVER the logo. In the
   original page #boot was a direct child of body and nothing wrapped it. */
.dsh550c-stage{height:100%}
`

/** The General-settings row sheet; DSH tokens so it matches either theme. */
const ROW_CSS = `
.dsh550c-row{display:flex;align-items:center;gap:16px;padding:10px 0;flex-wrap:wrap}
.dsh550c-row-text{flex:1;min-width:220px}
.dsh550c-row-title{font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary,#191919)}
.dsh550c-row-desc{margin-top:2px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary,#666)}
.dsh550c-row-ctrl{display:flex;align-items:center;gap:8px}
.dsh550c-seg{display:inline-flex;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));border-radius:8px;overflow:hidden}
.dsh550c-seg button{border:0;background:transparent;color:var(--dsw-alias-label-secondary,#666);font-family:inherit;font-size:12.5px;line-height:1.4;padding:5px 14px;cursor:pointer}
.dsh550c-seg button+button{border-left:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35))}
.dsh550c-seg button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14))}
.dsh550c-seg button.on{background:var(--dsw-alias-brand-primary,#4d6bfe);color:#fff}
.dsh550c-preview{border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));background:transparent;color:var(--dsw-alias-label-primary,#191919);font-family:inherit;font-size:12.5px;line-height:1.4;padding:5px 14px;border-radius:8px;cursor:pointer}
.dsh550c-preview:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14))}
.dsh550c-wip{font-size:11.5px;line-height:1.4;padding:3px 8px;border-radius:999px;
  border:1px dashed var(--dsw-alias-border-l2,rgba(127,127,127,.45));
  color:var(--dsw-alias-label-secondary,#666);white-space:nowrap}
`

function ensureRowStyle() {
  if (document.getElementById(ROW_STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = ROW_STYLE_ID
  style.textContent = ROW_CSS
  document.head.appendChild(style)
}

/**
 * macOS window-drag guard.
 *
 * DSH's official base stylesheet turns every DIRECT body child into a
 * `-webkit-app-region: no-drag` region — its selector spares only the app's own
 * root element. A body-level element that spans the viewport therefore subtracts
 * the whole window from the macOS draggable region: while the splash is up the
 * window cannot be dragged by its title area, and macOS no longer runs the
 * system double-click action (zoom) there. `pointer-events: none` does not exempt
 * an element from that computation; only a declaration of its own does.
 *
 * `data-dsh-boot-splash` is the marker the dsh-web family bundle exempts
 * (packages/dsh-web-all/src/client/index.ts), so carrying it is what keeps this
 * plugin a good citizen there; this sheet is the same declaration for installs
 * that ship no such bundle. `initial` is the initial value (`none`), which takes
 * the element out of the app-region computation instead of turning the whole
 * overlay into a drag handle — click-to-skip keeps working. `!important` is
 * required because the official selector outranks this one.
 */
const DRAG_GUARD_CSS = `
html[data-platform="darwin"] body>.dsh550c-host{-webkit-app-region:initial !important}
`

function ensureDragGuard() {
  if (document.getElementById(DRAG_GUARD_STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = DRAG_GUARD_STYLE_ID
  style.textContent = DRAG_GUARD_CSS
  document.head.appendChild(style)
}

/**
 * Retire the host half's first frame.
 *
 * `lib/index.js` contributes an index-injection row that covers the screen with
 * the splash's own opening colour *before the shell exists* — that is the only
 * way to keep DSH's boot card off the glass, because a client plugin is
 * materialised long after the card is painted (measured: card 67 ms, this
 * bundle 338 ms, card disposed 517 ms). The splash paints the same colour
 * itself, so calling this on the same task as mounting the overlay swaps them
 * inside one frame: no seam, no flash, nothing left behind. The injected script
 * watches the boot card and carries its own timeout, so a client half that never
 * arrives cannot leave a black window behind.
 */
function endFirstFrame() {
  const handle = window[FIRST_FRAME_GLOBAL]
  if (handle === undefined || handle === null) return
  delete window[FIRST_FRAME_GLOBAL]
  try {
    handle.end()
  } catch (error) {
    console.error('[dsh-550c-boot] first frame refused to end', error)
  }
}

/**
 * Make the Desktop window's caption buttons belong to the splash.
 *
 * On Windows the shell hands Electron `titleBarStyle: 'hidden'` plus a
 * `titleBarOverlay` 40 px tall and ~138 px wide, and the buttons are drawn by the
 * browser process ABOVE the page: no z-index in this document can reach them
 * (the ported UI keeps its own ─ □ ✕ inside the fake window titles, which is
 * where the design wants them). Two things stop them reading as foreign chrome:
 *
 *   footprint  the stylesheet reserves the strip inside #hud-top, so the HUD's
 *              TIME / ● REC are not pushed under the buttons (data-caption).
 *   strip      the Desktop preload measures a probe element's computed
 *              `background-color` / `color` and pushes them to
 *              `setTitleBarOverlay({color, symbolColor})` over IPC, re-measuring
 *              whenever <head> mutates. Both values accept alpha, so the strip is
 *              made TRANSPARENT while the splash plays: the buttons float on the
 *              animation instead of sitting on an opaque bar, and the symbols are
 *              painted in the splash's accent so they stay legible on it.
 *
 * The colours are declared ON THE PROBE ELEMENT, not on :root. The probe is a
 * body-level `<span>` whose inline style reads the app's two tokens, and the app
 * defines them on `body`: custom properties resolve from the CLOSEST ancestor, so
 * a `:root` override never reaches it — `!important` on `html` loses to a plain
 * declaration on `body` (measured on the real window: the strip stayed opaque for
 * the whole splash while the sheet looked correct). Declaring both colours on the
 * probe sidesteps inheritance and leaves the app's own tokens — and its text
 * colour — untouched. `transparent` is a real value here: the preload normalises
 * it through a canvas to `rgba(0, 0, 0, 0)`, which the shell's own colour check
 * accepts, so the strip really does become see-through.
 *
 * Removing the sheet afterwards puts the app's own colours back, because that
 * mutation of <head> is itself the re-measure trigger.
 *
 * A browser tab has neither the strip nor `data-platform` (the Electron preload
 * never runs), so this is a no-op outside the Desktop app.
 *
 * @returns a disposer, or null when there is nothing to adapt
 */
function adaptCaption(host) {
  const platform = document.documentElement.dataset.platform
  if (platform === undefined || platform === '') return null

  const darwin = platform === 'darwin'
  host.dataset.caption = darwin ? 'darwin' : 'windows'

  // Mirror the shell's fullscreen flag onto the host, and keep it in sync: the
  // HUD's caption reservation has to collapse in fullscreen, because macOS hides
  // the traffic lights there and Windows hides the overlay buttons. The preload
  // writes html[data-fullscreen] for both platforms (desktop main process ->
  // dsh-desktop:window-fullscreen -> root.dataset.fullscreen), so watching that
  // one attribute is enough — and it also covers the user entering fullscreen
  // while the splash is on screen.
  const mirrorFullscreen = () => {
    if (document.documentElement.dataset.fullscreen === 'true') host.dataset.fullscreen = ''
    else delete host.dataset.fullscreen
  }
  mirrorFullscreen()
  const fullscreenObserver = new MutationObserver(mirrorFullscreen)
  fullscreenObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-fullscreen'],
  })

  const dispose = () => {
    fullscreenObserver.disconnect()
    delete host.dataset.caption
    delete host.dataset.fullscreen
  }

  // macOS has no titleBarOverlay at all (the shell's whole bundle contains zero
  // `titlebar-area` hits): the preload's probe is never created there either,
  // because syncWindowsAppearance() returns early off win32. So the reservation
  // above is the entire darwin story — nothing to repaint, nothing to inject.
  if (darwin) return dispose

  // The accent follows the scheme for free: `--caption-symbol` is a literal on
  // :host (see ENHANCE_CSS), and the host's computed style is the scheme's answer.
  const symbol = getComputedStyle(host).getPropertyValue('--caption-symbol').trim() || '#e8a020'

  const style = document.createElement('style')
  style.id = CAPTION_STYLE_ID
  const probe = 'body>span[style*="dsw-specific-sidebar-fill"]'
  style.textContent =
    probe + '{background-color:transparent !important;color:' + symbol + ' !important}'
  // Appending to <head> is itself the trigger: the preload's MutationObserver
  // re-measures the probe and repaints the strip.
  document.head.appendChild(style)

  return () => {
    style.remove()
    dispose()
  }
}

/**
 * The splash, mounted imperatively into document.body.
 *
 * NOT through the `shell.overlay` slot: the shell — and with it every slot —
 * renders only after the client module system has loaded every plugin, which is
 * also the moment DSH's own boot card (`[data-dsh-boot]`, "HARNESS / Loading
 * plugins…") is disposed. A slot-based splash therefore always comes AFTER that
 * card, leaving a visible gap. apply() runs during the load phase instead, so
 * this is as early as a client plugin can draw.
 *
 * Even that is ~271 ms too late for the card (67 ms card, 338 ms this bundle,
 * 517 ms card disposal), which is why the frame on screen before this module
 * ever runs comes from the host half (lib/index.js) — this mount retires it in
 * the same task (endFirstFrame), so the two read as one animation.
 *
 * Every exit path — played out, skipped, or a throw inside the show — ends in
 * the same fade, so a broken animation can never trap anyone behind a black
 * screen.
 *
 * @param force - play even when the stored mode is 'off' (the preview button)
 * @returns the live overlay record, or null when nothing was mounted
 */
function mountOverlay(force) {
  if (liveOverlay !== null) {
    // The boot trigger keeps the splash that is already playing. The preview
    // button means "play it now", so a running splash is torn down first —
    // synchronously, before the replacement is built, which is what keeps the
    // document at no more than one .dsh550c-host at any instant. A preview
    // during the fade-out replays too; that is the button doing its job.
    if (!force) return liveOverlay
    const replaced = liveOverlay
    liveOverlay = null
    replaced.dispose()
  }

  const stored = readMode()
  if (!force && stored === 'off') return null
  const mode = stored === 'full' ? 'full' : 'simple'
  // Which machine plays. Unknown/stored-junk resolves to 550C (see the registry),
  // so an older profile — or one hand-edited while debugging — keeps playing
  // exactly what it played before this dimension existed.
  const variant = resolveVariant(readVariant())

  if (document.body === null) {
    // The factory can be evaluated while the document is still parsing; the
    // splash needs a body to attach to, so it waits for one.
    document.addEventListener('DOMContentLoaded', () => mountOverlay(force), { once: true })
    return null
  }

  const host = document.createElement('div')
  host.className = 'dsh550c-host'
  // Decoration, not content: the port ends up full of fake terminal text
  // ("550C CORE TERMINAL", log lines, "OVERRIDE CONTROLLER"), and a screen
  // reader user asked for none of it. The host is a plain div, so aria-hidden
  // here takes its whole shadow tree out of the accessibility tree (checked with
  // Accessibility.getFullAXTree) while pointer and keyboard behaviour stay put.
  host.setAttribute('aria-hidden', 'true')
  // Body-level overlays are subtracted from the macOS draggable region unless
  // they declare otherwise: the marker is what the dsh-web family bundle
  // exempts, ensureDragGuard() is the same exemption for installs without it.
  host.dataset.dshBootSplash = ''
  ensureDragGuard()
  // The scheme is applied as data on the host, which is what the stylesheet's
  // :host([data-scheme=…]) blocks key on. Amber sets nothing on purpose.
  const scheme = readScheme()
  if (scheme !== DEFAULT_SCHEME) host.dataset.scheme = scheme
  // Recorded for the stylesheet: only the full mode mounts #hud-top, and the
  // caption strip's fill has to match whichever surface is at the top.
  host.dataset.mode = mode
  // Which machine is on screen. The variant's own stylesheet keys off this for
  // anything machine-specific that the palette tokens do not cover.
  host.dataset.variant = variant.id
  // The splash paints its own backdrop, and the host half painted the cover that
  // it replaces — from the same table, so the hand-off is one colour. Set inline
  // rather than left to the machine's stylesheet: VARIANT_BG is the single source
  // the build asserts against, and a machine whose CSS forgot its --bg would
  // otherwise flash the default.
  host.style.setProperty('--bg', VARIANT_BG[variant.id])
  // Recorded before anything else: did the splash beat DSH's own boot card to
  // the screen? (Read by scripts/verify.mjs.)
  host.dataset.sawBootCard = String(document.querySelector('[data-dsh-boot]') !== null)
  document.body.appendChild(host)

  const record = { host: host, show: null, enhance: null, caption: null, finished: false, disposed: false, fadeTimer: null, watchdog: null, dispose: null }

  const skip = () => {
    if (record.show !== null) record.show.cancel()
  }
  const onKey = (event) => {
    if (event.key === 'Escape') skip()
  }
  /**
   * Leaving the page ends the show early.
   *
   * Every beat of the show is a timer, and a hidden document gets Chromium's
   * default throttling (DSH sets no `backgroundThrottling`, verified in
   * app.asar), so a minimized window stretches 11 s of animation far past the
   * 30 s watchdog — measured: hide at 1.5 s and the show is still at 0 % when
   * the watchdog fires at 31.2 s and logs a failure. Nobody is watching a hidden
   * page, so the honest end is the normal fade, and the watchdog's error path
   * stops being reachable from there.
   *
   * Only a TRANSITION to hidden counts: DSH creates the main window with
   * `show: false` and calls `show()` after the page has loaded, so the document
   * is legitimately hidden while the splash mounts — keying off the initial
   * state would skip the splash in every Desktop launch.
   */
  const onVisibility = () => {
    if (document.hidden) finish()
  }
  document.addEventListener('visibilitychange', onVisibility)
  // Idempotent: it is reached through the fade timer, through the plugin's
  // teardown AND, since the preview button can restart a running splash,
  // directly. The second run must not re-run the disposers it already ran.
  const dispose = () => {
    if (record.disposed) return
    record.disposed = true
    if (record.fadeTimer !== null) window.clearTimeout(record.fadeTimer)
    if (record.watchdog !== null) window.clearTimeout(record.watchdog)
    if (record.show !== null) record.show.cancel()
    if (record.enhance !== null) record.enhance()
    if (record.caption !== null) record.caption()
    host.removeEventListener('click', skip)
    window.removeEventListener('keydown', onKey, true)
    document.removeEventListener('visibilitychange', onVisibility)
    host.remove()
    if (liveOverlay === record) liveOverlay = null
  }
  const finish = () => {
    // A disposed record is already gone; its cancel() rejects the show promise,
    // so this is the normal landing spot for the skip path and must stay quiet.
    if (record.finished || record.disposed) return
    record.finished = true
    if (record.watchdog !== null) {
      window.clearTimeout(record.watchdog)
      record.watchdog = null
    }
    host.classList.add('dsh550c-out')
    record.fadeTimer = window.setTimeout(dispose, FADE_MS + 40)
  }
  record.dispose = dispose

  // Absolute watchdog. The show has its own end, the click/Esc skip and a catch
  // around startup, but this is the one guarantee that matters on a daily-driver
  // install: the splash can never outlive its own animation and lock the user
  // out of Settings — which is where the switch that disables it lives.
  record.watchdog = window.setTimeout(() => {
    // Firing while the document is hidden is not a failure: a background tab
    // that booted hidden has no visibilitychange to catch, and its timers are
    // throttled into uselessness. End quietly there, loudly anywhere else.
    if (document.hidden) console.warn('[dsh-550c-boot] watchdog fired while hidden; dismissing the splash quietly')
    else console.error('[dsh-550c-boot] watchdog fired; dismissing the splash')
    finish()
  }, variant.watchdogMs[mode])

  try {
    const shadow = host.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = HOST_CSS + variant.css
    shadow.appendChild(style)

    const stage = document.createElement('div')
    stage.className = 'dsh550c-stage'
    // aria-hidden on the host (above) only takes the overlay out of the
    // accessibility tree — it does not stop the keyboard. The port's fake windows
    // carry real <button>s and Chrome also makes their scrollable bodies focusable,
    // so Tab used to land inside the splash and, through shadow retargeting,
    // report as document.activeElement === .dsh550c-host: focus parked in an
    // invisible box for the whole show (axe's aria-hidden-focus). inert on the
    // stage is the fix, and it has to be the stage rather than the host: the host
    // must stay hit-testable, because clicking anywhere on the splash is the skip
    // gesture — an inert subtree is not a hit target, so those clicks fall through
    // to the host, which is exactly where the skip listener lives.
    stage.setAttribute('inert', '')
    // Full mode adds the machine's live surface; a machine with no app surface
    // (variant.app === null) plays its boot stage in both modes.
    stage.innerHTML = mode === 'full' && variant.app !== null ? variant.boot + variant.app : variant.boot
    shadow.appendChild(stage)

    // Content upgrades (terminal texture, self-consistent data, panel depth)
    // live outside the ported code, so re-extracting never loses them.
    record.enhance = variant.enhance(stage, { mode: mode })

    // After enhanceShow: `--caption-fill` / `--caption-symbol` are defined by the
    // enhancement sheet, so reading them any earlier silently falls back to the
    // built-in default and the strip keeps the wrong colour for the whole splash.
    record.caption = adaptCaption(host)

    record.show = variant.show(stage, { mode: mode, cancelled: CANCELLED })
    host.addEventListener('click', skip)
    window.addEventListener('keydown', onKey, true)
    record.show.start().then(finish, finish)
    // Last statement of the same task that put the overlay on screen: the host
    // half's first frame and this shadow root swap inside one paint.
    endFirstFrame()
  } catch (error) {
    console.error('[dsh-550c-boot] show failed to start', error)
    finish()
  }

  liveOverlay = record
  return record
}

/** The General-settings row: mode segmented control + a preview button. */
function SettingsRow() {
  const [mode, setMode] = React.useState(readMode)

  React.useEffect(() => {
    ensureRowStyle()
  }, [])

  const choose = React.useCallback((next) => {
    writeMode(next)
    setMode(next)
  }, [])

  const options = [
    { value: 'off', label: '关闭' },
    { value: 'simple', label: '简易' },
    { value: 'full', label: '完整' },
  ]

  return React.createElement(
    'div',
    { className: 'dsh550c-row' },
    React.createElement(
      'div',
      { className: 'dsh550c-row-text' },
      React.createElement('div', { className: 'dsh550c-row-title' }, '550C 开机动画'),
      React.createElement(
        'div',
        { className: 'dsh550c-row-desc' },
        '启动 DSH 时播放 550C 片头。简易模式只播 logo 加载动画；完整模式会播完整的覆写流程，可用点击或 Esc 跳过。',
      ),
    ),
    React.createElement(
      'div',
      { className: 'dsh550c-row-ctrl' },
      React.createElement(
        'div',
        { className: 'dsh550c-seg' },
        options.map((option) =>
          React.createElement(
            'button',
            {
              key: option.value,
              type: 'button',
              className: mode === option.value ? 'on' : '',
              onClick: () => choose(option.value),
            },
            option.label,
          ),
        ),
      ),
      React.createElement(
        'button',
        { type: 'button', className: 'dsh550c-preview', onClick: () => mountOverlay(true) },
        '预览',
      ),
    ),
  )
}

/**
 * The colour-scheme row. Amber is the original author's palette — the default,
 * and the only one that overrides nothing at all.
 */
function SchemeRow() {
  const [scheme, setScheme] = React.useState(readScheme)

  React.useEffect(() => {
    ensureRowStyle()
  }, [])

  const choose = React.useCallback((next) => {
    writeScheme(next)
    setScheme(next)
  }, [])

  const options = [
    { value: 'amber', label: '琥珀' },
    { value: 'green', label: '绿' },
    { value: 'cyan', label: '青' },
    { value: 'white', label: '白' },
  ]

  return React.createElement(
    'div',
    { className: 'dsh550c-row' },
    React.createElement(
      'div',
      { className: 'dsh550c-row-text' },
      React.createElement('div', { className: 'dsh550c-row-title' }, '开机动画配色'),
      React.createElement(
        'div',
        { className: 'dsh550c-row-desc' },
        // Machine-agnostic on purpose: every machine maps 琥珀 onto its own
        // default palette, and the other three schemes are global overrides on
        // that machine's tokens (see docs/VARIANTS.md).
        '琥珀是各机型自己的默认配色；另外三套是全局覆盖。点「预览」可以立刻看效果。',
      ),
    ),
    React.createElement(
      'div',
      { className: 'dsh550c-row-ctrl' },
      React.createElement(
        'div',
        { className: 'dsh550c-seg' },
        options.map((option) =>
          React.createElement(
            'button',
            {
              key: option.value,
              type: 'button',
              className: scheme === option.value ? 'on' : '',
              onClick: () => choose(option.value),
            },
            option.label,
          ),
        ),
      ),
    ),
  )
}

/**
 * The machine row: which 片头 plays.
 *
 * Same shape as the other two rows, and orthogonal to them: it picks the machine
 * (its own markup, stylesheet, timeline and default palette), the 档位 row picks
 * how much of it plays, and the 配色 row overrides the palette on top.
 *
 * A machine whose entry carries `status: 'wip'` has no timeline yet: it keeps its
 * id, its label and its first-frame colour, and picking it replays the
 * 「正在开发」 placeholder on the spot — the option must answer the click instead
 * of looking inert, and the alternative (silently borrowing 550C's timeline) is
 * what the withdrawn 550W did and why it read as "550C with another letter".
 * The 档位 row is still honoured for everything else: 关闭 mounts nothing at
 * boot, and 预览 on the 档位 row replays whatever machine is selected.
 */
function VariantRow() {
  const [variant, setVariant] = React.useState(readVariant)
  const entries = variantList()

  React.useEffect(() => {
    ensureRowStyle()
  }, [])

  const choose = React.useCallback((entry) => {
    writeVariant(entry.id)
    setVariant(entry.id)
    if (entry.status === 'wip') mountOverlay(true)
  }, [])

  const selected = entries.filter((entry) => entry.id === variant)[0] ?? entries[0]

  return React.createElement(
    'div',
    { className: 'dsh550c-row' },
    React.createElement(
      'div',
      { className: 'dsh550c-row-text' },
      React.createElement('div', { className: 'dsh550c-row-title' }, '片头机型'),
      React.createElement(
        'div',
        { className: 'dsh550c-row-desc' },
        '选哪台机器开机。550C 是原作；550W 与 550A 的片头仍在开发中，点一下就会播「正在开发」占位。',
      ),
    ),
    React.createElement(
      'div',
      { className: 'dsh550c-row-ctrl' },
      React.createElement(
        'div',
        { className: 'dsh550c-seg' },
        entries.map((entry) =>
          React.createElement(
            'button',
            {
              key: entry.id,
              type: 'button',
              className: variant === entry.id ? 'on' : '',
              onClick: () => choose(entry),
            },
            entry.label,
          ),
        ),
      ),
      selected !== undefined && selected.status === 'wip'
        ? React.createElement('span', { className: 'dsh550c-wip' }, '开发中')
        : null,
    ),
  )
}

/**
 * Mount all four surfaces.
 *
 * Slot names are inlined as literals on purpose: the injector's pre-flight
 * check reads register() calls statically and cannot follow a constant.
 */
function apply(ctx) {
  // The settings rows are ordinary slot contributions: they belong to a panel
  // and should live and die with it.
  ctx.slots.inject('settings.general.item', () =>
    ctx.slots.register({ name: 'settings.general.item', id: 'boot-550c', order: 26 }, SettingsRow),
  )
  ctx.slots.inject('settings.general.item', () =>
    ctx.slots.register({ name: 'settings.general.item', id: 'boot-550c-scheme', order: 27 }, SchemeRow),
  )
  // 28, not 25: the two shipped rows keep the ids and orders installed profiles
  // already have, and the machine row reads naturally after 档位 and 配色.
  ctx.slots.inject('settings.general.item', () =>
    ctx.slots.register({ name: 'settings.general.item', id: 'boot-550c-variant', order: 28 }, VariantRow),
  )

  // The splash is deliberately NOT a slot contribution — mountOverlay() explains
  // why. Registered as an effect so disabling the plugin takes the splash down.
  ctx.effect(
    () => () => {
      if (bootSplash !== null) bootSplash.dispose()
      if (liveOverlay !== null) liveOverlay.dispose()
    },
    'dsh-550c-boot: splash teardown',
  )
}

/**
 * Mount the boot splash at MODULE EVALUATION time.
 *
 * This is as early as a client plugin can possibly draw: the factory below runs
 * while the module system is still draining, before cordis has resolved the
 * service graph and called apply(). Every millisecond here is a millisecond of
 * DSH's own "Loading plugins…" card that the splash covers instead.
 *
 * The lifecycle is still owned by the plugin: apply() registers the teardown
 * effect, so disabling the plugin removes whatever this started.
 */
const bootSplash = mountOverlay(false)

exports.name = 'boot-550c'
exports.inject = ['slots']
exports.apply = apply
