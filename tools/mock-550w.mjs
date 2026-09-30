#!/usr/bin/env node
/**
 * Static keyframes for the 550W rebuild — pose, not animation.
 *
 * Step 1 of the rebuild delivers five stills so the direction can be judged
 * before any timeline exists. Four of them are posed by hand here; the first one
 * is not: it mounts the REAL 550C stylesheet and the REAL 550C boot markup (read
 * out of src/variants/550c/assets.js) with only the two allowed substitutions —
 * the tail glyph and the subtitle — so "same opening as 550C" is something the
 * picture itself proves rather than something the text claims.
 *
 * Frames 2–5 also mount 550C's own `#hud-top` / `.win-popup` / `#final` markup and
 * styles, because Act 2/3 are supposed to reuse that vocabulary: the shell, the
 * window chrome and the closing banner come from the port, the lunar subject and
 * the countdown are new.
 *
 * Usage: npm run mock:550w     (writes .render/550w-step1-*.png)
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { once } from 'node:events'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect, evaluate, findPage, launchChrome, scratch, screenshot, serve, sleep } from './lib/harness.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const outDir = resolve(root, '.render')

const assets = readFileSync(resolve(root, 'src/variants/550c/assets.js'), 'utf8')
const literal = (name) => JSON.parse(new RegExp(`const ${name} = ("(?:[^"\\\\]|\\\\.)*");`).exec(assets)[1])
const CSS_550C = literal('CSS_550C')
const BOOT_MARKUP_550C = literal('BOOT_MARKUP')
const APP_MARKUP_550C = literal('APP_MARKUP')

/**
 * The tail glyph: one "W" where the port's "C" was, drawn as two strokes in the
 * same slot (x 557…776, y 29…218) so the reveal cadence, the path count and the
 * composition stay byte-for-byte comparable with 550C.
 */
const STROKE = 'fill:none;stroke:#fff;stroke-width:26;stroke-linejoin:round;stroke-linecap:round'
const W_TAIL = [
  '<g id="wTail">',
  `<path class="white" style="${STROKE}" d="M575 42L622 205L669 42"/>`,
  `<path class="white" style="${STROKE}" d="M669 42L716 205L763 42"/>`,
  '</g>',
].join('')

const BOOT_MARKUP_550W = BOOT_MARKUP_550C
  .replace(/<g id="cee">[\s\S]*?<\/g>/, W_TAIL)
  .replace('550C SYSTEM BOOT', '550W SYSTEM BOOT')

/** 550C's stylesheet targets a shadow root; a mock page is a plain document. */
const asDocumentCss = (css) => css.replace(/:host\(/g, 'html(').replace(/:host/g, 'html')

/** The cold/cyan accent the spec allows on top of 550C's palette. */
const COLD = `
  html{--amber:#9fd8e8;--amber-b:#dff2fb;--amber-d:#3d6f80;--amber-fade:rgba(111,214,232,.35);
       --text:#cfe3ee;--text-dim:#7d93a6;--text-faint:#3f5563;--bg:#04070a;--bg-panel:#060c12;--bg-win:#070f16;
       --red:#e05030;--red-b:#ff7a5a;--green:#8fe0b0;--cyan:#6fd6e8;}
  html,body{margin:0;height:100%;background:#04070a;overflow:hidden}
`

const SHELL = `
  /* The three panels 550W does not use are hidden; #w-main is the log panel. */
  #w-tele,#w-code,#w-node{display:none}
  #workspace{grid-template-columns:1fr;grid-template-areas:"main"}
  #w-main{grid-area:main}
`

const page = (title, body, extra) => `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>${title}</title>
<style>${asDocumentCss(CSS_550C)}${COLD}${extra}</style>
</head><body>${body}</body></html>
`

/* ── frame 1: the 550C opening, frozen mid-write ───────────────────────────── */
const FRAME1_EXTRA = `
  /* Freeze the reveal where 550C's own timeline would be at ~1.3 s: four paths
     written, the tail glyph still at the 0.08 ghost. Values are the ones
     playBoot() writes, so this is the real mid-write state, not a lookalike. */
  #logo path{clip-path:inset(0 100% 0 0);opacity:.08}
  #logo path:nth-child(-n+4){clip-path:inset(0 0 0 0);opacity:1}
  #bootText{opacity:1}
  html::before{z-index:2200}
`
const frame1 = page('550W boot, mid-write', BOOT_MARKUP_550W, FRAME1_EXTRA)

/* ── the lunar scene shared by frames 2–5 ──────────────────────────────────── */
const LUNAR_CSS = `
  .stage{position:fixed;inset:0;z-index:20}
  .moon{position:absolute;left:50%;top:47%;width:min(46vh,42vw);height:min(46vh,42vw);
    transform:translate(-50%,-50%);filter:drop-shadow(0 0 34px rgba(111,214,232,.2))}
  .moon svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
  .moon .limb{fill:none;stroke:var(--cyan);stroke-width:1.6;opacity:.95}
  .moon .grid{fill:none;stroke:var(--text-dim);stroke-width:.6;opacity:.5}
  .moon .far{fill:none;stroke:var(--text-faint);stroke-width:.5;opacity:.35}
  /* lit limb on the left, terminator sweeping into full dark on the right */
  .terminator{position:absolute;left:50%;top:47%;width:min(46vh,42vw);height:min(46vh,42vw);
    transform:translate(-50%,-50%);border-radius:50%;pointer-events:none;
    background:linear-gradient(100deg,rgba(223,242,251,.14) 0,rgba(111,214,232,.06) 28%,
      rgba(3,6,10,.5) 52%,rgba(1,2,4,.9) 78%,rgba(0,0,0,.96) 100%);
    box-shadow:inset 0 0 60px rgba(2,4,8,.9)}
  .site{position:absolute;transform:translate(-50%,-50%)}
  .site .dot{width:9px;height:9px;border-radius:50%;background:var(--cyan);
    box-shadow:0 0 12px rgba(111,214,232,.9)}
  .site .ring{position:absolute;left:50%;top:50%;width:38px;height:38px;margin:-19px 0 0 -19px;
    border:1px solid var(--cyan);border-radius:50%;opacity:.55}
  .site .label{position:absolute;left:16px;top:-16px;white-space:nowrap;font-size:9.5px;
    letter-spacing:.16em;color:var(--ink,#f4f8fc);text-transform:uppercase}
  .site .meta{position:absolute;left:16px;top:-4px;white-space:nowrap;font-size:9px;
    letter-spacing:.1em;color:var(--cyan)}
  .cluster{position:absolute;left:50%;top:47%;width:min(58vh,54vw);height:min(58vh,54vw);
    transform:translate(-50%,-50%) rotate(-18deg);border:1px solid rgba(111,214,232,.35);
    border-radius:50%;border-right-color:transparent;border-top-color:rgba(111,214,232,.7)}
  .lunar-hud{position:absolute;left:2.4vw;right:2.4vw;bottom:calc(24px + 1.2vh);z-index:30}
  .readout{position:absolute;z-index:30;font-size:9.5px;letter-spacing:.14em;color:var(--text-dim);
    text-transform:uppercase;line-height:1.7}
  .readout b{color:var(--cyan);font-weight:400}
`

const SITES = [
  { x: '38%', y: '34%', id: 'LUNAR ENGINE 01', meta: 'LAT 24.4N · LON 12.8W' },
  { x: '62%', y: '41%', id: 'LUNAR ENGINE 02', meta: 'LAT 08.1S · LON 43.6E' },
  { x: '47%', y: '62%', id: 'LUNAR ENGINE 03', meta: 'LAT 41.7S · LON 05.2E' },
]

const moonMarkup = (armed) => `
<div class="stage">
  <div class="cluster"></div>
  <div class="moon">
    <svg viewBox="0 0 420 420">
      <defs>
        <radialGradient id="moonLit" cx="32%" cy="30%" r="80%">
          <stop offset="0" stop-color="#1c2c39"/>
          <stop offset="62%" stop-color="#0c1620"/>
          <stop offset="100%" stop-color="#050a10"/>
        </radialGradient>
      </defs>
      <!-- a body, not a wireframe: the filled disc goes under the drafting lines -->
      <circle cx="210" cy="210" r="200" fill="url(#moonLit)"/>
      <circle class="limb" cx="210" cy="210" r="200"/>
      <ellipse class="grid" cx="210" cy="210" rx="200" ry="72"/>
      <ellipse class="grid" cx="210" cy="210" rx="200" ry="140"/>
      <ellipse class="grid" cx="210" cy="210" rx="72" ry="200"/>
      <ellipse class="grid" cx="210" cy="210" rx="140" ry="200"/>
      <ellipse class="far" cx="210" cy="210" rx="200" ry="186"/>
      <circle class="far" cx="210" cy="210" r="152"/>
      <circle class="far" cx="210" cy="210" r="96"/>
    </svg>
  </div>
  <div class="terminator"></div>
  ${SITES.map(
    (site) => `<div class="site" style="left:${site.x};top:${site.y}">
      <div class="ring"></div><div class="dot" ${armed ? 'style="background:var(--green);box-shadow:0 0 12px rgba(143,224,176,.9)"' : ''}></div>
      <div class="label">${site.id}</div>
      <div class="meta">${armed ? '已接入 · ENGINE ARMED' : site.meta}</div>
    </div>`,
  ).join('')}
</div>
`

const hudTop = (label, right) =>
  `<div id="hud-top" style="position:fixed;left:6px;right:6px;top:6px;z-index:30">
     <span class="brand">◢ 550W // ${label}</span><span class="sep">│</span>
     <span class="item">MODE <b>LUNAR LINK</b></span><span class="item">JURISDICTION <b>CN-BJ-07</b></span>
     <span class="spacer"></span><span class="item">TIME <b id="h-time">22:00:03</b></span>
     <span class="sep">│</span><span class="item live">● ${right}</span>
   </div>`

const hudBot = (stage, node, pct) =>
  `<div id="hud-bot" style="position:fixed;left:6px;right:6px;bottom:6px;z-index:30">
     <span class="item">STAGE <b id="b-stage">${stage}</b></span>
     <span class="item">ENGINE <b id="b-node">${node}</b></span><span class="spacer"></span>
     <span class="item">CONTROL</span>
     <div class="prog"><div class="fill" id="b-fill" style="width:${pct}%"></div></div>
     <span class="pct" id="b-pct">${pct}%</span><span class="spacer"></span>
     <span class="item">NET <b id="b-net">LUNAR</b></span><span class="item">CH <b>07</b></span>
   </div>`

const logWindow = (name, lines, kind = '', place = 'left:50%;top:50%;transform:translate(-50%,-50%) scale(.86) translateY(6%)') => `
<div class="win-popup ${kind} show" style="position:fixed;${place};z-index:40;min-width:min(760px,58vw)">
  <div class="wp-title"><span class="wp-ico">▣</span><span class="wp-name">${name}</span>
    <span class="wp-controls"><span class="wp-btn">─</span><span class="wp-btn">□</span><span class="wp-btn">✕</span></span></div>
  <div class="wp-body">
    <div class="wp-log">${lines.map((line) => `<div class="ll ${line[0]}">${line[1]}</div>`).join('')}</div>
  </div>
  <div class="wp-status"><span>${kind === 'danger' ? 'OVERRIDE' : 'LINK'}</span><span class="spacer"></span><span class="wp-clock">22:00:03</span></div>
</div>`

/* ── frame 2: the moon and the cluster ─────────────────────────────────────── */
const frame2 = page(
  '550W lunar cluster',
  APP_MARKUP_550C + moonMarkup(false) + hudTop('LUNAR ENGINE CLUSTER', 'SCANNING') + hudBot('CLUSTER SCAN', '01 / 03', 32) +
    `<div class="readout" style="left:3vw;top:22vh">
       SITES DETECTED <b>3 / 3</b><br>BEACON <b>ACTIVE</b><br>RANGE <b>384 400 KM</b><br>LIGHT LAG <b>1.28 S</b>
     </div>
     <div class="readout" style="right:3vw;top:22vh;text-align:right">
       CLUSTER <b>LUNAR-3</b><br>BASE RING <b>NOMINAL</b><br>MASS <b>2.1E9 T</b><br>STATUS <b>AWAITING LINK</b>
     </div>`,
  LUNAR_CSS + SHELL,
)

/* ── frame 3: the engine cutaway with the energy flow ──────────────────────── */
const CUTAWAY_CSS = `
  .cut{position:absolute;left:50%;top:52%;width:min(62vh,52vw);height:min(62vh,52vw);
    transform:translate(-50%,-50%);z-index:22}
  .cut svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
  .cut .shell{fill:none;stroke:var(--cyan);stroke-width:1.6;opacity:.9}
  .cut .inner{fill:none;stroke:var(--text-dim);stroke-width:.8;opacity:.6}
  .cut .coil{fill:none;stroke:var(--amber);stroke-width:3;opacity:.85}
  .cut .flow{fill:none;stroke:var(--cyan);stroke-width:2.4;opacity:.9}
  .cut .beam{fill:url(#beamGrad);opacity:.75}
  .cut .nozzle{fill:rgba(6,12,18,.9);stroke:var(--cyan);stroke-width:1.4}
  .cutrow{position:absolute;font-size:9.5px;letter-spacing:.14em;color:var(--text-dim);
    text-transform:uppercase;line-height:1.85;z-index:30}
  .cutrow b{color:var(--cyan);font-weight:400}
  .flowband{position:absolute;height:2px;background:linear-gradient(90deg,transparent,var(--cyan),transparent);
    opacity:.85;z-index:23}
`
const frame3 = page(
  '550W engine cutaway',
  APP_MARKUP_550C + moonMarkup(false) +
    `<div class="cut">
       <svg viewBox="0 0 400 400">
         <defs><linearGradient id="beamGrad" x1="0" y1="0" x2="0" y2="1">
           <stop offset="0" stop-color="#dff2fb" stop-opacity=".25"/>
           <stop offset=".55" stop-color="#6fd6e8" stop-opacity=".95"/>
           <stop offset="1" stop-color="#6fd6e8" stop-opacity="0"/>
         </linearGradient></defs>
         <!-- steering ring -->
         <circle class="shell" cx="200" cy="150" r="96"/>
         <circle class="inner" cx="200" cy="150" r="74"/>
         <!-- magnetic confinement coils -->
         <ellipse class="coil" cx="200" cy="150" rx="60" ry="17"/>
         <ellipse class="coil" cx="200" cy="186" rx="54" ry="15"/>
         <ellipse class="coil" cx="200" cy="218" rx="46" ry="13"/>
         <!-- nozzle -->
         <path class="nozzle" d="M150 236L250 236L282 322L118 322Z"/>
         <path class="inner" d="M164 244L236 244L258 314L142 314Z"/>
         <!-- plasma beam through the nozzle -->
         <path class="beam" d="M170 244L230 244L252 400L148 400Z"/>
         <!-- energy flow bands climbing the column -->
         <path class="flow" d="M200 54V150"/>
         <path class="flow" d="M164 78C186 96 214 96 236 78" opacity=".7"/>
         <path class="flow" d="M156 112C184 132 216 132 244 112" opacity=".55"/>
         <path class="shell" d="M120 250H280" opacity=".5"/>
       </svg>
     </div>
     <div class="flowband" style="left:18vw;right:18vw;top:38vh"></div>
     <div class="flowband" style="left:22vw;right:22vw;top:44vh;opacity:.55"></div>
     <div class="flowband" style="left:26vw;right:26vw;top:50vh;opacity:.35"></div>` +
    hudTop('ENGINE CUTAWAY · LE-01', 'TELEMETRY') + hudBot('CUTAWAY', '01 / 03', 58) +
    // Parked low and left so the cutaway keeps the middle of the frame.
    logWindow('LUNAR ENGINE 01 · TELEMETRY', [
      ['ok', 'link established · 3 hops · rtt 1.28 s'],
      ['inf', 'nozzle Ø 42.6 m · steering ring travel ±9.4°'],
      ['inf', 'coil set A–C · field 3.2 T · charge 61 %'],
      ['hl', 'plasma path: chamber → throat → bell · stable'],
    ], '', 'left:4vw;bottom:13vh;top:auto;transform:scale(.78);transform-origin:left bottom') +
    `<div class="cutrow" style="left:3vw;top:22vh">
       THRUST <b>1.42 MN</b><br>ISP <b>12 480 S</b><br>PLASMA <b>46 200 K</b><br>FIELD <b>3.2 T</b>
     </div>
     <div class="cutrow" style="right:3vw;top:22vh;text-align:right">
       NOZZLE <b>Ø 42.6 M</b><br>RING <b>±9.4°</b><br>MASS FLOW <b>212 KG/S</b><br>COIL TEMP <b>18 K</b>
     </div>`,
  LUNAR_CSS + CUTAWAY_CSS + SHELL,
)

/* ── frame 4: the ignition countdown, frame dimmed ─────────────────────────── */
const COUNTDOWN_CSS = `
  #dim.show{opacity:.92}
  .count{position:fixed;left:50%;top:47%;transform:translate(-50%,-50%);z-index:45;
    font-size:clamp(54px,10vw,128px);letter-spacing:.06em;color:#f4f8fc;
    font-variant-numeric:tabular-nums;text-shadow:0 0 34px rgba(111,214,232,.6);
    white-space:nowrap;text-align:center;width:max-content}
  .count small{display:block;margin-top:6px;font-size:12px;letter-spacing:.42em;color:var(--cyan);text-align:center}
  .girt{position:fixed;left:50%;top:47%;transform:translate(-50%,-50%);z-index:44;
    width:min(60vh,56vw);height:min(60vh,56vw);border-radius:50%;
    border:2px solid rgba(111,214,232,.75);border-left-color:transparent;border-bottom-color:rgba(111,214,232,.3)}
  .girt2{position:fixed;left:50%;top:47%;transform:translate(-50%,-50%) rotate(140deg);z-index:44;
    width:min(70vh,66vw);height:min(70vh,66vw);border-radius:50%;
    border:1px solid rgba(159,216,232,.5);border-right-color:transparent}
  .alarm{position:fixed;left:0;right:0;top:0;height:3px;z-index:46;
    background:repeating-linear-gradient(90deg,var(--amber) 0 12px,transparent 12px 24px)}
`
const frame4 = page(
  '550W ignition countdown',
  // `#dim` / `#final` come from the port with an empty class list; posing them
  // means adding the state class their own stylesheet keys on.
  APP_MARKUP_550C.replace('<div id="dim">', '<div id="dim" class="show">') + moonMarkup(true) +
    `<div class="girt2"></div><div class="girt"></div>
     <div class="count">T-00:02.480<small>IGNITION SEQUENCE · ALL THREE ENGINES</small></div>` +
    hudTop('IGNITION SEQUENCE', 'ARMED') + hudBot('IGNITION T-2.480', '03 / 03', 92) +
    logWindow('CONTROL BUS · IGNITION', [
      ['cmd', '> ignite --cluster lunar-3 --all --synchronized'],
      ['ok', 'engine 01 armed · coil charge 100 %'],
      ['ok', 'engine 02 armed · coil charge 100 %'],
      ['warn', 'engine 03 armed · base ring strain 82 %'],
      ['hl', 'sequence holds on control bus · authority OWNED'],
    ], 'danger') +
    `<div class="cutrow" style="left:3vw;top:20vh">
       THRUST <b>1.38 MN ▲</b><br>ISP <b>12 460 S ▲</b><br>PLASMA <b>44 900 K ▲</b><br>FIELD <b>3.1 T ▲</b>
     </div>
     <div class="cutrow" style="right:3vw;top:20vh;text-align:right">
       SYNC <b>0.004 S</b><br>BUS <b>AUTHORITY</b><br>WINDOW <b>02.480 S</b><br>ABORT <b>DISABLED</b>
     </div>
     <div class="alarm"></div>`,
  LUNAR_CSS + COUNTDOWN_CSS + SHELL + '#dim{position:fixed;inset:0;z-index:42;background:#02040a;opacity:0;transition:opacity .4s}',
)

/* ── frame 5: 接入成功, frozen ─────────────────────────────────────────────── */
const FINAL_CSS = `
  #dim.show{opacity:.55}
  #final{font-size:clamp(26px,3.6vw,48px);letter-spacing:.3em;padding:44px 88px;white-space:nowrap}
  .final-sub{position:fixed;left:0;right:0;top:calc(50% + 92px);z-index:45;text-align:center;
    font-size:11px;letter-spacing:.4em;color:var(--cyan);text-transform:uppercase}
  .final-rows{position:fixed;left:0;right:0;bottom:12vh;z-index:45;display:flex;justify-content:center;gap:42px;
    font-size:10px;letter-spacing:.18em;color:var(--text-dim);text-transform:uppercase}
  .final-rows b{color:var(--green);font-weight:400}
`
const frame5 = page(
  '550W 接入成功',
  APP_MARKUP_550C
    .replace('SYSTEM IS REWRITTEN', '接入成功')
    .replace('<div id="dim">', '<div id="dim" class="show">')
    .replace('<div id="final">', '<div id="final" class="show">') + moonMarkup(true) +
    hudTop('CONTROL BUS OWNED', 'ONLINE') + hudBot('CONTROL BUS OWNED', '03 / 03', 100) +
    `<div class="final-sub">550W // 月球发动机集群 · 控制权已移交</div>
     <div class="final-rows">
       <span>ENGINES <b>3 / 3</b></span><span>THRUST <b>4.26 MN</b></span>
       <span>ISP <b>12 480 S</b></span><span>AUTHORITY <b>550W</b></span>
     </div>`,
  LUNAR_CSS + FINAL_CSS + SHELL,
)

const FRAMES = [
  { file: '550w-step1-1-boot-midwrite.png', title: '1 boot mid-write (550C stage)', html: frame1 },
  { file: '550w-step1-2-moon-cluster.png', title: '2 moon + three engine sites', html: frame2 },
  { file: '550w-step1-3-cutaway-energy.png', title: '3 engine cutaway + energy flow', html: frame3 },
  { file: '550w-step1-4-countdown-dim.png', title: '4 ignition countdown, dimmed', html: frame4 },
  { file: '550w-step1-5-owned.png', title: '5 接入成功 freeze', html: frame5 },
]

const stage = scratch('dsh550c-mock-')
mkdirSync(outDir, { recursive: true })
for (const frame of FRAMES) writeFileSync(join(stage, frame.file.replace('.png', '.html')), frame.html)

const server = await serve(stage)
const chrome = launchChrome({ port: Number(process.argv[2] ?? 9550), profile: scratch('dsh550c-mock-profile-') })

let session
try {
  const pageTarget = await findPage(Number(process.argv[2] ?? 9550))
  session = await connect(pageTarget.webSocketDebuggerUrl)
  await session.send('Page.enable')
  await session.send('Runtime.enable')
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  })
  for (const frame of FRAMES) {
    await session.send('Page.navigate', { url: `${server.origin}/${frame.file.replace('.png', '.html')}` })
    await evaluate(session, 'return true;')
    await sleep(400)
    const file = join(outDir, frame.file)
    await screenshot(session, file)
    console.log(`wrote ${file}  — ${frame.title}`)
  }
} finally {
  session?.close()
  chrome.kill()
  await Promise.race([once(chrome, 'exit'), sleep(2000)]).catch(() => {})
  await server.close()
  try {
    rmSync(stage, { recursive: true, force: true })
  } catch {
    console.log(`(mock harness left behind at ${stage})`)
  }
}
