/**
 * Shared plumbing for the browser checks in tools/: a throwaway static server, a
 * headless Chrome found through scripts/browsers.mjs, and a minimal CDP client
 * (Node's global fetch/WebSocket — no dependencies).
 *
 * Everything here loads the REAL lib/client.js in a stub page that implements
 * just the two things the client loader contract needs: `window.__ModuleLoader__`
 * and a `react` external. That is the whole point of the fast loop — no DSH, no
 * server, no restart.
 */
import { spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, normalize, resolve } from 'node:path'
import { BROWSER_CANDIDATES, findBrowser } from '../../scripts/browsers.mjs'

export { BROWSER_CANDIDATES, findBrowser }

export const MODE_KEY = 'dsh-550c-boot:mode'
export const VARIANT_KEY = 'dsh-550c-boot:variant'
export const SCHEME_KEY = 'dsh-550c-boot:scheme'

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** The stub page: module loader + react stub, nothing else. */
export const STUB_PAGE = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>550C tools</title>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}</style>
</head>
<body>
<button id="probe" style="position:fixed;left:12px;top:12px;z-index:1">PROBE</button>
<script>
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
 * Lay out a throwaway harness directory for `client`.
 *
 * An http origin rather than file://: localStorage is then per-run and every
 * check can seed the three keys before the bundle reads them.
 */
export function stageClient(client, dir = mkdtempSync(join(tmpdir(), 'dsh550c-tool-'))) {
  mkdirSync(dir, { recursive: true })
  copyFileSync(client, join(dir, 'client.js'))
  writeFileSync(join(dir, 'index.html'), STUB_PAGE)
  return dir
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
}

export async function serve(dir) {
  const root = resolve(dir)
  const server = createServer(async (request, response) => {
    const path = resolve(join(root, normalize(new URL(request.url, 'http://x').pathname)))
    if (path !== root && !path.startsWith(root + '/')) {
      response.writeHead(403)
      response.end('forbidden')
      return
    }
    try {
      const body = readFileSync(path)
      response.writeHead(200, {
        'content-type': MIME[extname(path)] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      })
      response.end(body)
    } catch {
      response.writeHead(404)
      response.end('not found')
    }
  })
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((done) => server.close(done)),
  }
}

/**
 * Headless Chrome for one port. `profile` is a base directory: each port gets its
 * own profile, because two Chromes sharing one user-data-dir are one Chrome.
 */
export function launchChrome({ port, profile = join(tmpdir(), 'dsh550c-chrome'), throttle = false }) {
  const browser = findBrowser()
  if (browser === undefined) {
    throw new Error(`no Edge/Chrome found; tried\n  ${BROWSER_CANDIDATES.join('\n  ')}`)
  }
  return spawn(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--mute-audio',
      '--no-first-run',
      '--no-default-browser-check',
      // The shows are timing-driven: a throttled renderer would distort every
      // measurement here. `throttle: true` leaves Chromium's default in place,
      // which is what the hidden-document case needs.
      ...(throttle
        ? []
        : [
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
          ]),
      `--user-data-dir=${resolve(profile, String(port))}`,
      '--window-size=1280,900',
      `--remote-debugging-port=${port}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  )
}

export async function findPage(port, tries = 80) {
  for (let i = 0; i < tries; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json())
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page
    } catch {
      /* not up yet */
    }
    await sleep(250)
  }
  throw new Error('no CDP page target (is Chrome installed / did it start?)')
}

/** One socket, id-matched replies, event fan-out. */
export function connect(wsUrl) {
  return new Promise((resolvePromise, rejectPromise) => {
    const socket = new WebSocket(wsUrl)
    const pending = new Map()
    const listeners = new Set()
    let nextId = 0
    socket.addEventListener('open', () => {
      resolvePromise({
        send: (method, params = {}) =>
          new Promise((res, rej) => {
            const id = ++nextId
            pending.set(id, { res, rej })
            socket.send(JSON.stringify({ id, method, params }))
          }),
        on: (listener) => listeners.add(listener),
        close: () => socket.close(),
      })
    })
    socket.addEventListener('error', rejectPromise)
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      const slot = pending.get(message.id)
      if (slot !== undefined) {
        pending.delete(message.id)
        message.error ? slot.rej(new Error(message.error.message)) : slot.res(message.result)
        return
      }
      for (const listener of listeners) listener(message)
    })
  })
}

/** Evaluate in the page and bring the value back as JSON. Throws page errors. */
export async function evaluate(session, expression, { awaitPromise = true } = {}) {
  const result = await session.send('Runtime.evaluate', {
    expression: `JSON.stringify((() => { ${expression} })())`,
    awaitPromise,
    returnByValue: true,
  })
  if (result.exceptionDetails !== undefined) {
    throw new Error(
      `page threw: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`,
    )
  }
  return JSON.parse(result.result.value)
}

export async function until(session, expression, ok, { timeout = 20000, step = 25 } = {}) {
  const deadline = Date.now() + timeout
  let last
  while (Date.now() < deadline) {
    last = await evaluate(session, expression)
    if (ok(last)) return last
    await sleep(step)
  }
  throw new Error(`timed out waiting for ${expression} (last: ${JSON.stringify(last)})`)
}

export async function screenshot(session, file) {
  const { data } = await session.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(file, Buffer.from(data, 'base64'))
  return file
}

/** Seed the three keys (i.e. the machine, the mode and the palette) before load. */
export function seedSource({ mode, variant, scheme }) {
  const lines = []
  const put = (key, value) =>
    lines.push(
      value === null || value === undefined
        ? `localStorage.removeItem(${JSON.stringify(key)});`
        : `localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(value)});`,
    )
  put(MODE_KEY, mode ?? null)
  put(VARIANT_KEY, variant ?? null)
  put(SCHEME_KEY, scheme ?? null)
  return `try { ${lines.join(' ')} } catch (error) {}`
}

/** A throwaway directory that the caller can delete when it is done. */
export function scratch(prefix) {
  return mkdtempSync(join(tmpdir(), prefix))
}
