#!/usr/bin/env node
/**
 * What does a full run cost the main thread?
 *
 * One ruler for every machine, so "551W is heavier than 550C" is a measurement
 * and not an impression. Three independent views of the same run, all covering
 * the whole span from navigation to the overlay leaving:
 *
 *   - PerformanceObserver('longtask'): every main-thread task over 50 ms
 *   - requestAnimationFrame gaps: how many frames the page missed
 *   - a CDP CPU profile, aggregated by self time, so the answer to "what is it
 *     actually doing" is a function list
 *   - the main thread's BUSY share (100 - idle) straight out of that profile:
 *     the headline budget, because frame-interval numbers are not reproducible
 *     here — two runs of the same build on this machine differ by up to 2x
 *   - plus, when the machine has one, the countdown's textContent writes: the
 *     refresh rate is a budget, so it is counted rather than assumed
 *
 * Caveat: headless Chrome has no real vsync, so treat the frame numbers as
 * relative (headless is the most generous case there is). Long tasks and the
 * CPU profile are the parts worth comparing between machines.
 *
 * Usage:
 *   npm run measure:perf -- --variant 550c
 *   npm run measure:perf -- --variant 550w --mode full
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
const mode = typeof opt.mode === 'string' ? opt.mode : 'full'
const variant = typeof opt.variant === 'string' ? opt.variant : null
const port = Number(opt.port ?? 9410)

const stage = stageClient(client, scratch('dsh550c-perf-'))
console.log(`client:  ${client}`)
console.log(`mode:    ${mode}`)
console.log(`variant: ${variant ?? '(bundle default)'}\n`)

/** Recorded in the page before the bundle runs, so the whole run is covered. */
const RECORDER = `${seedSource({ mode: mode, variant: variant, scheme: null })}
window.__frames = [];
window.__longtasks = [];
window.__countWrites = 0;
const frame = (now) => { window.__frames.push(now); requestAnimationFrame(frame); };
requestAnimationFrame(frame);
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    window.__longtasks.push({
      start: Math.round(entry.startTime),
      duration: Math.round(entry.duration),
      attribution: (entry.attribution ?? []).map((a) => a.name).join(' '),
    });
  }
}).observe({ entryTypes: ['longtask'] });
// The countdown is a 20 Hz budget, so count its writes rather than trusting it.
const watchCount = () => {
  const host = document.querySelector('.dsh550c-host');
  const node = host === null ? null : host.shadowRoot?.querySelector('#w-count');
  if (node === null) { setTimeout(watchCount, 100); return; }
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'characterData') window.__countWrites += 1;
      // Setting textContent replaces the text node: that arrives as childList.
      else if (record.type === 'childList') window.__countWrites += record.addedNodes.length;
    }
  }).observe(node, { characterData: true, childList: true, subtree: true });
};
watchCount();`

const server = await serve(stage)
const chrome = launchChrome({ port, profile: scratch('dsh550c-perf-profile-') })

let session
try {
  const page = await findPage(port)
  session = await connect(page.webSocketDebuggerUrl)
  await session.send('Page.enable')
  await session.send('Runtime.enable')
  await session.send('Profiler.enable')
  await session.send('Profiler.setSamplingInterval', { interval: 500 })
  await session.send('Page.addScriptToEvaluateOnNewDocument', { source: RECORDER })

  await session.send('Profiler.start')
  const t0 = Date.now()
  await session.send('Page.navigate', { url: `${server.origin}/index.html` })
  await until(session, 'return window.__loaded !== null && window.__loaded !== undefined', (v) => v === true, {
    timeout: 5000,
  })
  const mounted = Date.now() - t0
  if (mode === 'off') await sleep(16000)
  else await until(session, 'return document.querySelectorAll(".dsh550c-host").length', (v) => v === 0, {
    timeout: 40000,
    step: 25,
  })
  const ended = Date.now() - t0
  const { profile } = await session.send('Profiler.stop')

  const stats = await evaluate(
    session,
    `const frames = window.__frames;
     const gaps = frames.slice(1).map((t, i) => t - frames[i]).sort((a, b) => a - b);
     const pick = (q) => gaps.length === 0 ? null : Math.round(gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * q))] * 10) / 10;
     return {
       frames: frames.length,
       gapMean: gaps.length === 0 ? null : Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 10) / 10,
       gapMedian: pick(0.5),
       gapP95: pick(0.95),
       gapMax: gaps.length === 0 ? null : Math.round(gaps[gaps.length - 1] * 10) / 10,
       over20: gaps.filter((g) => g > 20).length,
       longtasks: window.__longtasks,
       countWrites: window.__countWrites,
     };`,
  )

  const byId = new Map(profile.nodes.map((node) => [node.id, node]))
  const selfTime = new Map()
  profile.samples.forEach((id, index) => {
    selfTime.set(id, (selfTime.get(id) ?? 0) + (profile.timeDeltas[index] ?? 0))
  })
  const rows = [...selfTime.entries()]
    .map(([id, micros]) => {
      const frame = byId.get(id)?.callFrame ?? {}
      const url = String(frame.url ?? '').replace(/^.*\//, '')
      return {
        micros,
        name: `${frame.functionName === '' ? '(anonymous)' : frame.functionName}  ${url}:${(frame.lineNumber ?? -1) + 1}`,
      }
    })
    .sort((a, b) => b.micros - a.micros)
  const profiled = rows.reduce((total, row) => total + row.micros, 0)
  const idle = rows.find((row) => row.name.startsWith('(idle)'))?.micros ?? 0
  const busy = profiled === 0 ? 0 : 100 - (idle / profiled) * 100

  console.log(`overlay mounted at ${mounted} ms, gone at ${ended} ms (run length ${ended - mounted} ms)`)
  // The headline number: frame-interval numbers are not reproducible here (two
  // runs of the same build differ by up to 2x), so busy share is the budget.
  console.log(
    `main thread busy: ${busy.toFixed(1)} %  (${Math.round((profiled - idle) / 1000)} ms of ` +
      `${Math.round(profiled / 1000)} ms sampled)`,
  )
  console.log(`\nlong tasks (>50 ms): ${stats.longtasks.length}`)
  for (const task of stats.longtasks.slice(0, 8)) {
    console.log(`  ${String(task.start).padStart(6)} ms  ${String(task.duration).padStart(4)} ms  ${task.attribution}`)
  }
  console.log(
    `\nframes (reference only, see the note in the header): ${stats.frames}  mean ${stats.gapMean} ms  ` +
      `median ${stats.gapMedian} ms  p95 ${stats.gapP95} ms  max ${stats.gapMax} ms  >20 ms: ${stats.over20}`,
  )
  console.log(`countdown textContent writes: ${stats.countWrites}`)
  console.log(`\nCPU profile self time (total sampled ${Math.round(profiled / 1000)} ms) — top frames:`)
  for (const row of rows.slice(0, 12)) {
    const share = profiled === 0 ? 0 : (row.micros / profiled) * 100
    console.log(`  ${String(Math.round(row.micros / 1000)).padStart(4)} ms  ${share.toFixed(1).padStart(4)}%  ${row.name}`)
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
