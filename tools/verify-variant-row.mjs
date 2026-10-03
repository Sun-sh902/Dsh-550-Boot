#!/usr/bin/env node
/**
 * The machine picker's behaviour, driven through the REAL settings row.
 *
 * Selecting a machine must not autoplay it, and the 「开发中」 chip must track
 * which machines actually lack a timeline (`status: 'wip'`). That is the
 * difference between "550W is implemented" and "550W still plays the
 * placeholder" — and it is invisible to every check that looks at the splash
 * alone, because the wrong answer here is a splash that plays fine.
 *
 * The client bundle is a React module, and the loader hands it a `react`
 * external. This page supplies a minimal one — createElement / useState /
 * useEffect / useCallback — which is all the three settings rows use, renders
 * the machine row into a real DOM node, clicks its buttons and reads:
 *
 *   the stored key, whether an overlay appeared, whether the chip is present
 *
 * Usage:
 *   node tools/verify-variant-row.mjs [--client lib/client.js] [--out .render]
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { once } from 'node:events'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect, evaluate, findPage, launchChrome, scratch, screenshot, serve, sleep } from './lib/harness.mjs'

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
const client = resolve(root, typeof opt.client === 'string' ? opt.client : 'lib/client.js')
const outDir = resolve(root, typeof opt.out === 'string' ? opt.out : '.render')
const port = Number(opt.port ?? 9455)

/**
 * Minimal React. Enough for a function component that calls useState /
 * useEffect / useCallback and returns createElement() trees — which is exactly
 * what the three settings rows are.
 */
const MINI_REACT = `
function createElement(type, props) {
  const children = [];
  for (let i = 2; i < arguments.length; i++) children.push(arguments[i]);
  return { type: type, props: props || {}, children: children.flat(Infinity) };
}
let hookState = [];
let hookAt = 0;
let effects = [];
let rerender = null;
function useState(initial) {
  const at = hookAt++;
  if (hookState.length <= at) hookState[at] = typeof initial === 'function' ? initial() : initial;
  return [
    hookState[at],
    (next) => {
      hookState[at] = typeof next === 'function' ? next(hookState[at]) : next;
      if (rerender !== null) rerender();
    },
  ];
}
function useEffect(fn) { effects.push(fn); }
function useCallback(fn) { return fn; }
window.__reactStub = { createElement, useState, useEffect, useCallback };
window.__loaded = null;
window.__ModuleLoader__ = {
  load: (mod) => {
    window.__loaded = mod.factory((name) => {
      if (name === 'react') return window.__reactStub;
      throw new Error('unexpected require: ' + name);
    });
  },
};

function mount(node) {
  if (node === null || node === undefined || node === false) return null;
  if (typeof node === 'string' || typeof node === 'number') return document.createTextNode(String(node));
  const el = document.createElement(node.type);
  for (const [key, value] of Object.entries(node.props)) {
    if (key === 'key' || key === 'ref') continue;
    if (key === 'className') el.setAttribute('class', value);
    else if (key === 'style') Object.assign(el.style, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== null && value !== false) el.setAttribute(key, String(value));
  }
  for (const child of node.children) {
    const built = mount(child);
    if (built !== null) el.appendChild(built);
  }
  return el;
}

/** Render a function component into #root, re-rendering when its state changes. */
window.__renderRow = (Component) => {
  const root = document.getElementById('root');
  const draw = () => {
    hookAt = 0;
    const tree = Component();
    root.innerHTML = '';
    const node = mount(tree);
    if (node !== null) root.appendChild(node);
    const pending = effects.slice();
    effects = [];
    for (const fn of pending) fn();
  };
  rerender = draw;
  draw();
  return root.querySelectorAll('.dsh550c-seg button').length;
};
`

const PAGE = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>variant row</title>
<style>
  html,body{margin:0;background:#fff;font-family:-apple-system,"PingFang SC",sans-serif}
  #root{max-width:720px;margin:0 auto;padding:24px}
</style>
</head><body><div id="root"></div>
<script>try { localStorage.setItem('dsh-550c-boot:mode','off'); } catch (error) {}</script>
<script>${MINI_REACT}</script>
<script src="./client.js"></script>
</body></html>
`

const dir = scratch('dsh550w-row-')
writeFileSync(join(dir, 'index.html'), PAGE)
// The bundle exports neither row (it exports name/inject/apply), so the served
// copy gets one extra line of instrumentation. This is a test-only edit of a
// throwaway copy — lib/client.js itself is untouched, and the hash check in the
// build gate is what proves it.
const { readFileSync } = await import('node:fs')
const bundle = readFileSync(client, 'utf8')
const at = bundle.lastIndexOf('return module.exports;')
if (at === -1) throw new Error('verify-variant-row: the bundle has no `return module.exports;` to instrument')
const instrumented =
  bundle.slice(0, at) + 'exports.__rows = { VariantRow: VariantRow };\n\t\t' + bundle.slice(at)
writeFileSync(join(dir, 'client.js'), instrumented)
mkdirSync(outDir, { recursive: true })

const server = await serve(dir)
const chrome = launchChrome({ port, profile: scratch('dsh550w-row-profile-') })

const PROBE = `const host = document.querySelector('.dsh550c-host');
 const chip = document.querySelector('.dsh550c-wip');
 return {
   stored: localStorage.getItem('dsh-550c-boot:variant'),
   on: Array.from(document.querySelectorAll('.dsh550c-seg button')).filter((b) => b.className === 'on').map((b) => b.textContent),
   chip: chip === null ? null : chip.textContent,
   hosts: document.querySelectorAll('.dsh550c-host').length,
   firstFrame: document.documentElement.classList.contains('dsh550c-first'),
   desc: document.querySelector('.dsh550c-row-desc').textContent,
 };`

let failed = false
let session
try {
  const target = await findPage(port)
  session = await connect(target.webSocketDebuggerUrl)
  await session.send('Page.enable')
  await session.send('Runtime.enable')
  await session.send('Emulation.setDeviceMetricsOverride', { width: 760, height: 260, deviceScaleFactor: 2, mobile: false })
  await session.send('Page.navigate', { url: `${server.origin}/index.html` })
  await sleep(500)

  const buttons = await evaluate(session, 'return window.__renderRow(window.__loaded.__rows.VariantRow);')
  console.log(`client: ${client.replace(root + '/', '')}`)
  console.log(`variant buttons: ${buttons}\n`)

  const pick = async (label) => {
    const index = await evaluate(
      session,
      `const list = Array.from(document.querySelectorAll('.dsh550c-seg button'));
       const found = list.findIndex((b) => b.textContent === ${JSON.stringify(label)});
       if (found >= 0) list[found].click();
       return found;`,
    )
    if (index < 0) throw new Error(`no ${label} button`)
    await sleep(400)
    const probe = await evaluate(session, PROBE)
    const expectHost = label === '550A'
    const ok = probe.stored === label.toLowerCase() && (probe.hosts > 0) === expectHost
    if (!ok) failed = true
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  click ${label.padEnd(5)} stored=${probe.stored} on=[${probe.on.join(',')}] ` +
        `chip=${JSON.stringify(probe.chip)} overlay=${probe.hosts} firstFrame=${probe.firstFrame}`,
    )
    return probe
  }

  // Start from 550C so each click is a real change.
  await pick('550C')
  const file = (name) => join(outDir, `550w-settings-row-${name}.png`)
  await screenshot(session, file('550c'))
  await pick('550W')
  await screenshot(session, file('550w'))
  await pick('550A')
  await screenshot(session, file('550a'))

  const last = await evaluate(session, PROBE)
  console.log(`\nrow copy: ${last.desc}`)
  console.log(
    `\n${failed ? 'FAIL' : 'PASS'}: picking a machine stores it; only a wip machine replays the placeholder`,
  )
} finally {
  session?.close()
  chrome.kill()
  await Promise.race([once(chrome, 'exit'), sleep(2000)]).catch(() => {})
  await server.close()
}
process.exit(failed ? 1 : 0)
