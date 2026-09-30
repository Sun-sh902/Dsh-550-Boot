#!/usr/bin/env node
/**
 * Render the splash headlessly: load the real lib/client.js in Chrome, screenshot
 * it at fixed wall-clock offsets, write the PNGs.
 *
 * This is the fast loop for everything that lives in the browser half — the
 * animation timeline, the ported CSS, the mode switch, the colour schemes. It
 * needs no DSH, no server and no restart. What it CANNOT cover is the host half:
 * `lib/index.js` is assembled into the index injections at DSH startup and the
 * client bundle's URL carries a process nonce, so those checks need a real
 * restart (see docs/VERIFY-MACOS.md).
 *
 * Zero dependencies: Node ≥ 22 (global fetch/WebSocket) and a Chrome/Edge found
 * through scripts/browsers.mjs (Windows + macOS).
 *
 * Usage:
 *   npm run render:splash
 *   node tools/render-splash.mjs --shots 1500,7000,12000 --mode full
 *   node tools/render-splash.mjs --escape 3000 --shots 3600     # the skip path
 *   node tools/render-splash.mjs --client /tmp/other/lib/client.js --out /tmp/shots
 */
import { spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BROWSER_CANDIDATES, findBrowser } from '../scripts/browsers.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

/** One token per step: consuming a value with `argv[++i]` must not also skip a step. */
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
const outDir = resolve(typeof opt.out === 'string' ? opt.out : join(root, '.render'))
const shots = String(opt.shots ?? '3000,7000,11000,15000').split(',').map(Number)
const mode = typeof opt.mode === 'string' ? opt.mode : null
const escapeAt = typeof opt.escape === 'string' ? Number(opt.escape) : null
const port = Number(opt.port ?? 9223)
const MODE_KEY = 'dsh-550c-boot:mode'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const PAGE = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>550C render</title>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}</style>
</head>
<body>
<script>
  // The two stubs the client loader contract needs: the bundle is a
  // window.__ModuleLoader__.load({id, factory}) call whose factory requires
  // exactly one external, 'react' (settings rows only — not rendered here).
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

const browser = findBrowser()
if (browser === undefined) {
  console.error(`render-splash: no Edge/Chrome found; tried\n  ${BROWSER_CANDIDATES.join('\n  ')}`)
  process.exit(2)
}

const harness = mkdtempSync(join(tmpdir(), 'dsh550c-render-'))
writeFileSync(join(harness, 'index.html'), PAGE)
copyFileSync(client, join(harness, 'client.js'))
mkdirSync(outDir, { recursive: true })
console.log(`client: ${client}`)
console.log(`browser: ${browser}`)
console.log(`mode:   ${mode ?? '(the bundle default)'}`)
console.log(`shots:  ${shots.join(', ')} ms -> ${outDir}\n`)

const server = createServer((request, response) => {
  const name = request.url.startsWith('/client.js') ? 'client.js' : 'index.html'
  try {
    const body = readFileSync(join(harness, name))
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
const origin = `http://127.0.0.1:${server.address().port}`

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
    `--remote-debugging-port=${port}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
)

async function findPage(tries = 80) {
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

let session
try {
  const page = await findPage()
  session = await connect(page.webSocketDebuggerUrl)
  await session.send('Page.enable')
  await session.send('Runtime.enable')
  await session.send('Page.addScriptToEvaluateOnNewDocument', {
    source:
      mode === null
        ? '/* no mode seeded: the bundle default applies */'
        : `try { localStorage.setItem(${JSON.stringify(MODE_KEY)}, ${JSON.stringify(mode)}); } catch (error) {}`,
  })

  await session.send('Page.navigate', { url: `${origin}/index.html` })
  const t0 = Date.now()
  let escaped = false
  for (const at of shots) {
    if (escapeAt !== null && !escaped && at >= escapeAt) {
      const wait = escapeAt - (Date.now() - t0)
      if (wait > 0) await sleep(wait)
      await session.send('Runtime.evaluate', {
        expression: `document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`,
      })
      console.log(`escape dispatched at ${Date.now() - t0} ms`)
      escaped = true
    }
    const wait = at - (Date.now() - t0)
    if (wait > 0) await sleep(wait)
    const { data } = await session.send('Page.captureScreenshot', { format: 'png' })
    const file = join(outDir, `${String(at).padStart(5, '0')}ms.png`)
    writeFileSync(file, Buffer.from(data, 'base64'))
    console.log(`captured ${at} ms -> ${file}`)
  }

  const probe = await session.send('Runtime.evaluate', {
    expression: `JSON.stringify({
      loaded: window.__loaded !== null && window.__loaded !== undefined,
      storedMode: localStorage.getItem(${JSON.stringify(MODE_KEY)}),
      overlays: document.querySelectorAll('.dsh550c-host').length,
    })`,
    returnByValue: true,
  })
  console.log(`probe: ${probe.result.value}`)
} finally {
  session?.close()
  chrome.kill()
  await Promise.race([once(chrome, 'exit'), sleep(2000)]).catch(() => {})
  await new Promise((done) => server.close(done))
  try {
    rmSync(harness, { recursive: true, force: true })
  } catch {
    console.log(`(harness left behind at ${harness})`)
  }
}
