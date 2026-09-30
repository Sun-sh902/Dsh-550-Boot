/**
 * Host half of dsh-550c-boot.
 *
 * The animation itself is browser-side (lib/client.js). Its FIRST FRAME cannot
 * be: DSH's boot card ("HARNESS / Loading plugins…") is drawn by the shell
 * before any client plugin is materialised — measured on this machine, card at
 * 67 ms, this plugin's bundle evaluated at 338 ms, card disposed at 517 ms — so
 * a plugin that only paints from its own JS always leaves the card on screen
 * for a few hundred milliseconds, at any z-index.
 *
 * The one surface that exists earlier than the shell is the served document, and
 * DSH exposes it: `webserver/index-inject` collects a table of index rows, which
 * the Web carrier renders into index.html immediately after `<head>` and the
 * Desktop carrier applies page-side before it settles `__DSH_BOOT_READY__` —
 * both ahead of the shell kernel that builds the card. A `style` row plus one
 * synchronous `script` row is therefore on the glass while the document is still
 * parsing, and the card is never visible in the first place.
 *
 * Two contracts with src/client.js:
 *
 *   MODE_KEY   the same localStorage key and the same default; the script below
 *              bows out for 'off' so that setting still boots straight through
 *              to DSH with no black frame.
 *   FIRST_FRAME_GLOBAL
 *              `window.__dsh550cFirstFrame.end()` is how the splash retires the
 *              cover once its shadow root is on screen — same task, one paint,
 *              no seam. The boot watch and the timeout below are the fallbacks:
 *              a client bundle that fails to load must never leave a black
 *              window behind.
 *
 * @module dsh-550c-boot
 */

export const name = 'boot-550c'

/** src/client.js MODE_KEY / DEFAULT_MODE — keep in sync. */
const MODE_KEY = 'dsh-550c-boot:mode'
/** src/client.js FIRST_FRAME_GLOBAL — keep in sync. */
const FIRST_FRAME_GLOBAL = '__dsh550cFirstFrame'
/** Painted under the splash's own --bg, so the handoff is invisible. */
const FIRST_FRAME_BG = '#050403'
/**
 * Absolute ceiling (ms): past this the cover yields to whatever is on the page.
 *
 * Kept at the scale of a slower-than-usual cold start, not of a whole shell
 * boot: this is the WORST case the user can be made to look at, and every extra
 * second of it is a second of an opaque window with no explanation on it when
 * the client half never arrives. Past ~3 s the honest thing to show is the page
 * itself — DSH's own boot card is readable ("Loading plugins…", or its failure
 * state) where a cover is not.
 */
const FIRST_FRAME_MAX_MS = 3000
/** The splash's own :host z-index (src/client.js HOST_CSS) minus one. */
const FIRST_FRAME_Z = 2147482000

/**
 * The cover itself: the port's own background colour, above anything the page
 * paints and below the splash that replaces it. pointer-events stays off — the
 * card it covers is not interactive either.
 */
const FIRST_FRAME_CSS =
  'html.dsh550c-first::before{content:"";position:fixed;inset:0;background:' +
  FIRST_FRAME_BG +
  ';z-index:' +
  String(FIRST_FRAME_Z) +
  ';pointer-events:none}\n' +
  'html.dsh550c-first{background:' +
  FIRST_FRAME_BG +
  ';--dsw-specific-sidebar-fill:#141008;--dsw-alias-label-primary:#e8a020}'

/**
 * The class marker plus the handshake, the boot watch and the timeout.
 *
 * Deliberately tiny and synchronous: it runs while <head> is being parsed, so
 * the cover is applied before the first paint. The two DSH tokens it also sets
 * are the ones the Desktop preload measures into `setTitleBarOverlay` (see
 * src/client.js adaptCaption), which paints the OS caption strip black-and-amber
 * for the same window instead of leaving a grey Windows bar above a terminal.
 *
 * The cover must not outlive the reason for it, so a 250 ms watch ends it as
 * soon as the boot card is gone (the kernel removes the card exactly when the
 * application mounts) — or as soon as the card drops its spinner, which is how
 * the card renders its own failure state, since a broken page must be readable
 * rather than hidden.
 *
 * Both of those read DSH's own boot markup, so the watch also samples the
 * application container once and ends the cover when that loading DOM is no
 * longer there — whoever renders it, whatever it is called. The sample is the
 * first child of `#root` (the element `mountApp` hydrates, and the container the
 * web app refuses to boot without) plus its attribute/class fingerprint, not its
 * HTML: the card keeps a live progress arc in an inline style, so comparing
 * markup would fire on the card's own updates.
 *
 * That sample is a deliberate third resort, never a competitor to the card: it
 * is only taken while no `[data-dsh-boot]` has EVER been seen (so a shell that
 * merely restyles or re-parents its own card cannot retire the cover under it),
 * not before the card has had its chance to appear, and a change has to hold for
 * two watches in a row before it counts as the application taking over. Worst
 * case it costs 250 ms; it exists for hosts that render no card at all.
 *
 * Nothing here is on the critical path: the splash retires the cover itself,
 * synchronously, the moment its shadow root is on screen.
 */
const FIRST_FRAME_SCRIPT =
  '(function(){' +
  'var mode=null;' +
  'try{mode=window.localStorage.getItem(' +
  JSON.stringify(MODE_KEY) +
  ')}catch(error){}' +
  'if(mode==="off")return;' +
  'var root=document.documentElement;' +
  'var watch=null;' +
  'var end=function(){' +
  'if(watch!==null){window.clearInterval(watch);watch=null}' +
  'root.classList.remove("dsh550c-first")' +
  '};' +
  'window.' +
  FIRST_FRAME_GLOBAL +
  '={end:end};' +
  'root.classList.add("dsh550c-first");' +
  'var started=Date.now();' +
  'var loading=null;' +
  'var sampled=false;' +
  'var shifted=false;' +
  'var fingerprint=function(node){' +
  'var names=[],i=0;' +
  'for(i=0;i<node.attributes.length;i++){names.push(node.attributes[i].name)}' +
  'return node.tagName+" "+node.className+" "+String(node.childElementCount)+" "+names.sort().join(",")' +
  '};' +
  'var seen=false;' +
  'watch=window.setInterval(function(){' +
  'var card=document.querySelector("[data-dsh-boot]");' +
  'if(card!==null){' +
  'seen=true;' +
  'if(card.querySelector("[data-dsh-boot-spinner]")===null)end();' +
  'return' +
  '}' +
  'if(seen){end();return}' +
  'if(Date.now()-started<500)return;' +
  'var app=document.getElementById("root");' +
  'var first=app===null?null:app.firstElementChild;' +
  'if(!sampled){' +
  'if(first===null)return;' +
  'sampled=true;' +
  'loading=fingerprint(first);' +
  'return' +
  '}' +
  'if(first!==null&&fingerprint(first)===loading){shifted=false;return}' +
  'if(shifted){end();return}' +
  'shifted=true' +
  '},250);' +
  'window.setTimeout(end,' +
  String(FIRST_FRAME_MAX_MS) +
  ');' +
  '})()'

/**
 * Contribute the first frame to every index response.
 *
 * No service is injected: `webserver/index-inject` is a plain composition event
 * that the carrier emits per response, and a table is only rendered when a page
 * is actually served — so this costs one row and nothing when nobody asks.
 *
 * @param ctx - the plugin context.
 */
export function apply(ctx) {
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'style', text: FIRST_FRAME_CSS })
    table.push({ kind: 'script', placement: 'head', text: FIRST_FRAME_SCRIPT })
  })
}
