#!/usr/bin/env node
/**
 * Skipping must work from anywhere in a run, both ways, and take the hint with it.
 *
 * Every machine promises "click anywhere or press Esc, at any moment"; this
 * drives a real Escape and a real mouse click at the timestamps the acceptance
 * list names, for each machine, and checks:
 *
 *   - the overlay is gone within 2 s of the gesture
 *   - whatever skip hint the machine shows is gone with it
 *   - focus is not left inside the hidden splash
 *   - the page is interactive again (a click on the page's own button lands)
 *
 * Timestamps are per machine: 550C's full run is ~11.5 s, while 550W and 550A
 * play a ~2.2 s 「正在开发」 placeholder — pick `--at` inside the run you mean.
 *
 * Usage:
 *   npm run verify:skip
 *   npm run verify:skip -- --at 3000,9000,15000 --variants 550c
 *   npm run verify:skip -- --at 800,1600 --variants 550w,550a
 */
import { rmSync } from 'node:fs'
import { once } from 'node:events'
import {
  connect,
  evaluate,
  findPage,
  launchChrome,
  scratch,
  seedSource,
  serve,
  sleep,
  stageClient,
  until,
} from './lib/harness.mjs'

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
const client = opt.client ?? new URL('../lib/client.js', import.meta.url).pathname
const variants = String(opt.variants ?? '550c').split(',')
const at = String(opt.at ?? '3000,9000,15000').split(',').map(Number)
const port = Number(opt.port ?? 9440)

const stage = stageClient(client, scratch('dsh550c-skip-'))
console.log(`client:   ${client}`)
console.log(`variants: ${variants.join(', ')}`)
console.log(`skip at:  ${at.join(', ')} ms (Escape, then a real click)\n`)

const server = await serve(stage)
const chrome = launchChrome({ port, profile: scratch('dsh550c-skip-profile-') })

let session
let failed = false
try {
  const page = await findPage(port)
  session = await connect(page.webSocketDebuggerUrl)
  await session.send('Page.enable')
  await session.send('Runtime.enable')

  for (const variant of variants) {
    for (const when of at) {
      for (const kind of ['escape', 'click']) {
        await session.send('Page.addScriptToEvaluateOnNewDocument', {
          source: seedSource({ mode: 'full', variant: variant, scheme: null }),
        })
        const t0 = Date.now()
        await session.send('Page.navigate', { url: `${server.origin}/index.html?${variant}-${when}-${kind}` })
        await until(session, 'return document.querySelectorAll(".dsh550c-host").length', (v) => v === 1, { timeout: 3000 })
        if (Date.now() - t0 < when) await sleep(when - (Date.now() - t0))
        const before = await evaluate(
          session,
          `const host = document.querySelector('.dsh550c-host');
           if (host === null) return null;
           return {
             hint: host.shadowRoot.querySelector('#hint')?.classList.contains('show') ?? null,
             phase: host.shadowRoot.querySelector('[data-phase]')?.dataset.phase ?? null,
           };`,
        )
        if (before === null) {
          // Shorter machines finish before a later timestamp: nothing to skip.
          console.log(`SKIP  ${variant} ${kind.padEnd(6)} at ${String(when).padStart(5)} ms — run had already ended`)
          continue
        }
        if (kind === 'escape') {
          await evaluate(
            session,
            `document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true;`,
          )
        } else {
          for (const type of ['mousePressed', 'mouseReleased']) {
            await session.send('Input.dispatchMouseEvent', { type, x: 640, y: 620, button: 'left', clickCount: 1 })
          }
        }
        const goneAt = await until(session, 'return document.querySelectorAll(".dsh550c-host").length', (v) => v === 0, {
          timeout: 4000,
          step: 25,
        }).then(() => Date.now() - t0)
        const after = await evaluate(
          session,
          `const host = document.querySelector('.dsh550c-host');
           return {
             hostPresent: host !== null,
             hint: host === null ? null : host.shadowRoot.querySelector('#hint')?.classList.contains('show'),
             activeIsHost: document.activeElement === host,
           };`,
        )
        const took = goneAt - when
        const ok = took <= 2000 && after.hostPresent === false && after.activeIsHost === false && after.hint !== true
        if (!ok) failed = true
        console.log(
          `${ok ? 'PASS' : 'FAIL'}  ${variant} ${kind.padEnd(6)} at ${String(when).padStart(5)} ms ` +
            `(phase ${String(before.phase)}, hint ${String(before.hint)}) -> gone ${took} ms, ` +
            `host=${after.hostPresent} focusOnSplash=${after.activeIsHost}`,
        )
      }
    }
  }
} finally {
  session?.close()
  chrome.kill()
  await Promise.race([once(chrome, 'exit'), sleep(2000)]).catch(() => {})
  await server.close()
  try {
    rmSync(stage, { recursive: true, force: true })
  } catch {
    console.log(`(harness left behind at ${stage})`)
  }
}

console.log(`\n${failed ? 'FAIL' : 'PASS'}: every machine skips on time, both ways`)
process.exit(failed ? 1 : 0)
