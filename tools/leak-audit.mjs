#!/usr/bin/env node
/**
 * Leak audit: a popup's clock must not outlive its popup.
 *
 * The ported show opens several windows during the override phase, each with a
 * 1 s interval ticking the clock in its status bar. Skipping (Esc / click) tears
 * the whole shadow root down instead of closing the windows one by one, so those
 * intervals — and the popup DOM their closures pin — used to survive for the rest
 * of the page's life (measured: 3 of them, 29 s after an Esc skip).
 *
 * The ported line now retires its own ticker when the clock leaves the document,
 * the same idiom the original already uses for its two other tickers. This drives
 * the real lib/client.js in real headless Chrome over the DevTools protocol and
 * checks that from the outside, with `setInterval`/`clearInterval` and
 * `EventTarget.prototype.addEventListener` wrapped BEFORE the bundle runs.
 *
 * Local tool, deliberately NOT part of `npm run check`: it needs a browser, and
 * CI only runs `extract`/`build`/`node --check`. See docs/VERIFICATION.md.
 *
 * Usage:
 *   node tools/leak-audit.mjs [--client lib/client.js] [--mode full]
 *                             [--skip 8000] [--settle 3500] [--port <cdp port>]
 *
 * Exit code 0 when no interval survives, 1 otherwise (or when the splash never
 * got as far as being skipped, which would make the audit meaningless).
 */
import { spawn } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BROWSER_CANDIDATES, findBrowser } from '../scripts/browsers.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

function args(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (!key?.startsWith('--')) continue
    const next = argv[i + 1]
    out[key.slice(2)] = next === undefined || next.startsWith('--') ? true : argv[++i]
  }
  return out
}

const opt = args(process.argv.slice(2))
const client = resolve(typeof opt.client === 'string' ? opt.client : join(root, 'lib/client.js'))
const mode = typeof opt.mode === 'string' ? opt.mode : 'full'
const skipAt = Number(typeof opt.skip === 'string' ? opt.skip : 8000)
const settle = Number(typeof opt.settle === 'string' ? opt.settle : 3500)
const MODE_KEY = 'dsh-550c-boot:mode'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** The page: the two stubs the client loader contract needs, nothing else. */
const PAGE = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>550C leak audit</title>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}</style>
</head>
<body>
<script>
  // The plugin bundle is a window.__ModuleLoader__.load({id, factory}) call whose
  // factory requires exactly one external, 'react' (settings rows only; not
  // rendered here). Nothing else about DSH is needed to play the splash.
  window.__reactStub = { createElement: () => ({}), useState: () => [], useEffect: () => {}, useCallback: (fn) => fn };
  window.__loaded = null;
  window.__ModuleLoader__ = {
    load: (mod) => {
      window.__loaded = mod.factory((name) => {
        if (name === 'react') return window.__reactStub;
        throw new Error('unexpected require: ' + name);
      });
    },
  };
</script>
<script src="./client.js"></script>
</body>
</html>
`

/**
 * Runs before every page script: counts what the bundle opens and never closes,
 * keeping the call site so a survivor can be attributed.
 */
const INSTRUMENT = `(() => {
  const frames = (error) =>
    String(error.stack)
      .split('\\n')
      .slice(1)
      .map((line) => line.trim())
      .filter((line) => line.includes('://') || line.includes('window.'))
      .slice(0, 4)
      .join(' | ');

  const intervals = new Map();
  const open = window.setInterval.bind(window);
  const shut = window.clearInterval.bind(window);
  window.setInterval = (fn, ms, ...rest) => {
    const id = open(fn, ms, ...rest);
    intervals.set(id, { delay: ms, origin: frames(new Error('setInterval')) });
    return id;
  };
  window.clearInterval = (id) => { intervals.delete(id); return shut(id); };

  // Keyed by the target object itself, not by a description of it: a host that
  // gains a class between addEventListener and removeEventListener would
  // otherwise look like a leak here.
  const listeners = new Map();
  const add = EventTarget.prototype.addEventListener;
  const drop = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, options) {
    let types = listeners.get(this);
    if (types === undefined) { types = new Map(); listeners.set(this, types); }
    if (!types.has(type)) types.set(type, frames(new Error('addEventListener')));
    return add.call(this, type, fn, options);
  };
  EventTarget.prototype.removeEventListener = function (type, fn, options) {
    const types = listeners.get(this);
    if (types !== undefined) {
      types.delete(type);
      if (types.size === 0) listeners.delete(this);
    }
    return drop.call(this, type, fn, options);
  };

  const describe = (target) => {
    if (target === window) return 'window';
    if (target === document) return 'document';
    const name = target.constructor ? target.constructor.name : 'EventTarget';
    const id = target.id ? '#' + target.id : '';
    const cls = typeof target.className === 'string' && target.className ? '.' + target.className.split(' ')[0] : '';
    return name + id + cls;
  };

  window.__leakAudit = () => ({
    intervals: intervals.size,
    intervalOrigins: [...intervals.values()].map((entry) => entry.delay + 'ms  ' + entry.origin),
    listeners: [...listeners.values()].reduce((total, types) => total + types.size, 0),
    listenerOrigins: [...listeners.entries()].flatMap(([target, types]) =>
      [...types.entries()].map(([type, origin]) => type + ' on ' + describe(target) + '  ' + origin),
    ),
  });

  try { localStorage.setItem(${JSON.stringify(MODE_KEY)}, ${JSON.stringify(mode)}); } catch (error) {}
})();`

/** Serve the throwaway page from an http origin so localStorage is per-run. */
async function serve(dir) {
  const server = createServer((request, response) => {
    const name = request.url === '/' || request.url.startsWith('/?') ? '/index.html' : request.url.split('?')[0]
    try {
      const body = readFileSync(join(dir, name))
      response.writeHead(200, {
        'content-type': name.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      })
      response.end(body)
    } catch {
      response.writeHead(404)
      response.end('not found')
    }
  })
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) }
}

async function findPage(port, tries = 80) {
  for (let i = 0; i < tries; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json())
      const page = list.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl)
      if (page !== undefined) return page
    } catch {
      /* not up yet */
    }
    await sleep(250)
  }
  throw new Error('no CDP page target (did the browser start?)')
}

function connect(wsUrl) {
  return new Promise((resolvePromise, rejectPromise) => {
    const socket = new WebSocket(wsUrl)
    const pending = new Map()
    let nextId = 0
    socket.addEventListener('open', () =>
      resolvePromise({
        send: (method, params = {}) =>
          new Promise((res, rej) => {
            const id = ++nextId
            pending.set(id, { res, rej })
            socket.send(JSON.stringify({ id, method, params }))
          }),
        close: () => socket.close(),
      }),
    )
    socket.addEventListener('error', rejectPromise)
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      const slot = pending.get(message.id)
      if (slot === undefined) return
      pending.delete(message.id)
      message.error ? slot.rej(new Error(message.error.message)) : slot.res(message.result)
    })
  })
}

async function evaluate(session, expression) {
  const result = await session.send('Runtime.evaluate', {
    expression: `JSON.stringify((() => { ${expression} })())`,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result.exceptionDetails !== undefined) {
    throw new Error(`page threw: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`)
  }
  return JSON.parse(result.result.value)
}

async function until(session, expression, ok, { timeout = 20000, step = 25 } = {}) {
  const deadline = Date.now() + timeout
  let last
  while (Date.now() < deadline) {
    last = await evaluate(session, expression)
    if (ok(last)) return last
    await sleep(step)
  }
  throw new Error(`timed out waiting for ${expression} (last: ${JSON.stringify(last)})`)
}

async function freePort() {
  const probe = createServer()
  await new Promise((done) => probe.listen(0, '127.0.0.1', done))
  const { port } = probe.address()
  await new Promise((done) => probe.close(done))
  return port
}

const browser = findBrowser()
if (browser === undefined) {
  console.error(`leak-audit: no Edge/Chrome found; tried\n  ${BROWSER_CANDIDATES.join('\n  ')}`)
  process.exit(2)
}

const harness = mkdtempSync(join(tmpdir(), 'dsh550c-leak-audit-'))
writeFileSync(join(harness, 'index.html'), PAGE)
copyFileSync(client, join(harness, 'client.js'))
console.log(`client:  ${client}`)
console.log(`mode:    ${mode}`)
console.log(`skip:    ${skipAt} ms, then ${settle} ms of quiet`)
console.log(`harness: ${harness}\n`)

const server = await serve(harness)
const cdpPort = Number(opt.port ?? (await freePort()))
const chrome = spawn(
  browser,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--mute-audio',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    `--user-data-dir=${join(harness, 'chrome-profile')}`,
    '--window-size=1280,900',
    `--remote-debugging-port=${cdpPort}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
)

let session
let failure = null
try {
  const page = await findPage(cdpPort)
  session = await connect(page.webSocketDebuggerUrl)
  await session.send('Page.enable')
  await session.send('Runtime.enable')
  await session.send('Page.addScriptToEvaluateOnNewDocument', { source: INSTRUMENT })

  const t0 = Date.now()
  const at = () => Date.now() - t0
  await session.send('Page.navigate', { url: `${server.origin}/index.html` })
  await until(session, 'return window.__loaded !== null && window.__loaded !== undefined', (v) => v === true, {
    timeout: 5000,
  })
  console.log(`bundle evaluated at ${at()} ms`)
  await until(session, 'return document.querySelectorAll(".dsh550c-host").length', (v) => v === 1, { timeout: 3000 })

  if (at() < skipAt) await sleep(skipAt - at())
  const before = await evaluate(
    session,
    `return {
       popups: document.querySelectorAll('.win-popup').length,
       intervals: window.__leakAudit().intervals,
     };`,
  )
  console.log(
    `skip at ${at()} ms — popups open: ${before.popups}, live intervals: ${before.intervals}` +
      '  (the wrapper tracks 2 of its own; the rest are the popups\' clocks)',
  )
  await evaluate(
    session,
    `document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true;`,
  )
  await until(session, 'return document.querySelectorAll(".dsh550c-host").length', (v) => v === 0, { timeout: 20000 })
  console.log(`overlay removed at ${at()} ms; waiting ${settle} ms`)
  await sleep(settle)

  const after = await evaluate(
    session,
    `const audit = window.__leakAudit();
     return { intervals: audit.intervals, intervalOrigins: audit.intervalOrigins, listeners: audit.listeners, listenerOrigins: audit.listenerOrigins };`,
  )
  console.log(`\nsurviving setInterval handles: ${after.intervals}`)
  for (const origin of after.intervalOrigins) console.log(`  survivor: ${origin}`)
  console.log(`still-attached listeners: ${after.listeners} (informational; detached popups keep their own)`)
  for (const origin of after.listenerOrigins) console.log(`  listener: ${origin}`)
  if (after.intervals !== 0) failure = `${after.intervals} interval(s) outlived the overlay`
} catch (error) {
  failure = error.message
} finally {
  session?.close()
  chrome.kill()
  await server.close()
  // The browser may still be flushing its profile directory; a leftover temp
  // directory is not worth failing an otherwise clean audit over.
  await Promise.race([once(chrome, 'exit'), sleep(2000)]).catch(() => {})
  try {
    rmSync(harness, { recursive: true, force: true })
  } catch {
    console.log(`(harness left behind at ${harness})`)
  }
}

if (failure !== null) {
  console.error(`\nFAIL: ${failure}`)
  process.exit(1)
}
console.log('\nPASS: no interval outlived the overlay')
