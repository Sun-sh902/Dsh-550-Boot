#!/usr/bin/env node
/**
 * prefers-reduced-motion: a profile that never chose a mode gets 简易, and an
 * explicit choice still wins — per machine.
 *
 * The machine and the mode are independent axes, so this runs the whole matrix
 * that matters: default under reduce, 完整 under reduce, 关闭 under reduce.
 *
 * Usage:
 *   npm run verify:reduced-motion
 *   npm run verify:reduced-motion -- --variant 550a
 */
import { rmSync } from 'node:fs'
import { once } from 'node:events'
import {
  connect,
  findPage,
  launchChrome,
  MODE_KEY as KEY,
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
const variant = typeof opt.variant === 'string' ? opt.variant : '550c'
const port = Number(opt.port ?? 9420)

const stage = stageClient(client, scratch('dsh550c-reduced-'))
console.log(`client:  ${client}\nvariant: ${variant}\n`)

const CASES = [
  { name: 'reduce, nothing stored', stored: null, expect: 'simple' },
  { name: 'reduce, stored 完整', stored: 'full', expect: 'full' },
  { name: 'reduce, stored 关闭', stored: 'off', expect: 'none' },
]

const server = await serve(stage)
const chrome = launchChrome({ port, profile: scratch('dsh550c-reduced-profile-') })

let session
let failed = false
try {
  const page = await findPage(port)
  session = await connect(page.webSocketDebuggerUrl)
  await session.send('Page.enable')
  await session.send('Runtime.enable')
  await session.send('Emulation.setEmulatedMedia', {
    media: '',
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  })

  for (const testCase of CASES) {
    await session.send('Page.addScriptToEvaluateOnNewDocument', {
      source:
        seedSource({ mode: testCase.stored, variant: variant, scheme: null }) +
        '\nwindow.__reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;',
    })
    const t0 = Date.now()
    await session.send('Page.navigate', {
      url: `${server.origin}/index.html?case=${encodeURIComponent(testCase.name)}`,
    })
    await until(session, 'return window.__loaded !== null && window.__loaded !== undefined', (v) => v === true, {
      timeout: 5000,
    })
    const state = await until(
      session,
      `return {
         reduce: window.__reduce === true,
         stored: localStorage.getItem(${JSON.stringify(KEY)}),
         hosts: document.querySelectorAll('.dsh550c-host').length,
         mode: document.querySelector('.dsh550c-host')?.dataset.mode ?? null,
         variant: document.querySelector('.dsh550c-host')?.dataset.variant ?? null,
       };`,
      (value) => value.mode !== null || value.hosts === 0,
      { timeout: 2000, step: 20 },
    )
    let goneAt = null
    if (state.hosts > 0) {
      goneAt = await until(session, 'return document.querySelectorAll(".dsh550c-host").length', (v) => v === 0, {
        timeout: 30000,
        step: 25,
      }).then(() => Date.now() - t0)
    }
    const measured = state.mode ?? 'none'
    const ok = measured === testCase.expect
    if (!ok) failed = true
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${testCase.name.padEnd(22)} reduce=${state.reduce} stored=${String(state.stored)} ` +
        `machine=${state.variant} mode=${measured} (expected ${testCase.expect}) ` +
        `visible for ${goneAt === null ? '0 (never mounted)' : `${goneAt} ms`}`,
    )
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

console.log(`\n${failed ? 'FAIL' : 'PASS'}: reduced motion plays the short mode, explicit choices win (${variant})`)
process.exit(failed ? 1 : 0)
