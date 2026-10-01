#!/usr/bin/env node
/**
 * Static keyframes for the 550W rebuild — pose, not animation.
 *
 * Five stills plus a colour-candidate sheet, so the direction can be judged
 * before any timeline exists. Frame 1 is not posed: it mounts the REAL 550C
 * stylesheet and the REAL 550C boot markup (read out of
 * src/variants/550c/assets.js), swaps in the tail glyph traced from
 * .render/ref-550w-mark.webp, and freezes the reveal where 550C's own
 * playBoot() would be at ~1.3 s. Frames 2–5 mount the port's own #hud-top /
 * #hud-bot / .win-popup vocabulary, because Act 2/3 are supposed to reuse it.
 *
 * The tail glyph is TRACED, not drawn from memory: the outline below was
 * extracted from the reference's pixels (mask -> contour -> Ramer-Douglas-
 * Peucker, 1.6 px) in the reference's own pixel space, and one translate+scale
 * places it in the boot viewBox.
 *
 * Two pictures are checked rather than eyeballed, and the tool exits non-zero if
 * either fails: the 「接入成功」 banner must be at least 0.8x the width 550C's own
 * #final banner takes at the same viewport, and no banner text may intersect an
 * engine-site label.
 *
 * Usage: npm run mock:550w     (writes .render/550w-step1-*.png)
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { once } from 'node:events'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect, evaluate, findPage, launchChrome, scratch, screenshot, serve, sleep } from './lib/harness.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const outDir = resolve(root, '.render')
const refImage = resolve(outDir, 'ref-550w-mark.webp')

const assets = readFileSync(resolve(root, 'src/variants/550c/assets.js'), 'utf8')
const literal = (name) => JSON.parse(new RegExp(`const ${name} = ("(?:[^"\\\\]|\\\\.)*");`).exec(assets)[1])
const CSS_550C = literal('CSS_550C')
const BOOT_MARKUP_550C = literal('BOOT_MARKUP')
const APP_MARKUP_550C = literal('APP_MARKUP')

/**
 * The tail glyph, traced from .render/ref-550w-mark.webp: the red ring-plus-slash
 * (x 860…1381, y 85…591) and the white V beside it (x 1372…1772, y 98…599), both
 * as closed outlines in the reference's own pixel space. One transform places
 * them at the height of 550C's digits (187 units), aligned to their cap height,
 * with the ring overlapping the third glyph instead of hanging beside it.
 */
const W_RING =
  'M1097 85L1051 92L1012 104L981 118L946 140L918 164L893 193L873 224L860 255L888 289L894 293L905 268L924 237L948 207L976 180L1000 163L1024 151L1056 141L1081 138L1247 591L1284 570L1315 542L1342 507L1356 481L1372 437L1380 396L1380 344L1373 310L1357 268L1344 245L1320 212L1292 184L1260 161L1238 150L1204 140L1186 140L1203 198L1224 208L1248 224L1284 257L1308 290L1324 330L1328 356L1328 376L1320 420L1297 472L1277 503L1272 506L1116 89L1114 85L1098 85Z'
const W_V =
  'M1409 98L1405 102L1372 205L1406 268L1411 264L1430 216L1435 213L1438 217L1562 599L1609 599L1611 597L1772 100L1769 98L1712 99L1590 474L1587 481L1584 481L1458 99L1410 98Z'
const W_TRANSFORM = 'translate(55.4 3.1) scale(0.3638)'

/** 550C's #cee was two paths in one group; the tail becomes two groups of one. */
const W_TAIL = (ringFill, vFill) =>
  `<g id="wRing"><path style="fill:${ringFill}" transform="${W_TRANSFORM}" d="${W_RING}"/></g>` +
  `<g id="wLeg"><path style="fill:${vFill}" transform="${W_TRANSFORM}" d="${W_V}"/></g>`

/** 550C's stylesheet targets a shadow root; a mock page is a plain document. */
const asDocumentCss = (css) => css.replace(/:host\(/g, 'html(').replace(/:host/g, 'html')

/**
 * The cold/cyan accent the spec allows on top of 550C's palette. Every value the
 * mock paints comes from these tokens, so the four schemes stay meaningful.
 */
const COLD = `
  html{--amber:#9fd8e8;--amber-b:#dff2fb;--amber-d:#3d6f80;--amber-fade:rgba(111,214,232,.35);
       --text:#cfe3ee;--text-dim:#7d93a6;--text-faint:#3f5563;--bg:#04070a;--bg-panel:#060c12;--bg-win:#070f16;
       --red:#e7141b;--red-b:#ff5a52;--green:#8fe0b0;--cyan:#6fd6e8;--ice:#dfe9f5;--ink:#f4f8fc;}
  html,body{margin:0;height:100%;background:var(--bg);overflow:hidden}
  /* The caption sits above the bottom HUD so it never covers the top strip. */
  .tag{position:fixed;left:22px;bottom:34px;z-index:9999;font:11px/1.6 monospace;letter-spacing:.14em;color:var(--text-dim)}
`

const SHELL = `
  #w-tele,#w-code,#w-node{display:none}
  #workspace{grid-template-columns:1fr;grid-template-areas:"main"}
  #w-main{grid-area:main}
`

const page = (body, extra = '', tag = '') =>
  `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<style>${asDocumentCss(CSS_550C)}${COLD}${extra}</style></head>
<body><div class="tag">${tag}</div>${body}</body></html>`

/* ── frame 1: the 550C opening, frozen mid-write ───────────────────────────── */
const boot550w = (tail, midClass, subtitle) =>
  BOOT_MARKUP_550C
    .replace(/<g id="cee">[\s\S]*?<\/g>/, tail)
    .replace(/class="red"/g, `class="${midClass}"`)
    .replace('550C SYSTEM BOOT', subtitle)

const frame1 = page(
  boot550w(W_TAIL('var(--red)', 'var(--ice)'), 'white', '550W SYSTEM BOOT'),
  `
  /* Freeze the reveal where 550C's playBoot() would be at ~1.3 s: both 5s and the
     0 are written, the tail glyph is still at its 0.08 ghost. Selected BY GROUP,
     because every path is the first child of its own group — :nth-child(-n+4)
     would have matched all six and the picture would show a finished logo. */
  #logo path{clip-path:inset(0 100% 0 0);opacity:.08}
  #five1 path,#five2 path,#red0 path{clip-path:inset(0 0 0 0);opacity:1}
  #bootText{opacity:1}
  #logo{filter:drop-shadow(0 0 10px rgba(111,214,232,.25))}
  html::before{z-index:2200}
  `,
  '① 开场：550C 的 boot stage，写到一半（尾字形尚未写出）',
)

/* ── the lunar context shared by frames 2–5 ────────────────────────────────── */
const LUNAR_CSS = `
  .stage{position:fixed;inset:0;z-index:20}
  /* The moon is context, not the subject: smaller, off to one side, and never
     wrapped in a big ring that would swallow the engine. */
  .moon{position:absolute;left:15vw;top:15vh;width:min(30vh,26vw);height:min(30vh,26vw);
    filter:drop-shadow(0 0 30px rgba(111,214,232,.16))}
  .moon svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
  .moon .body{fill:url(#moonLit)}
  .moon .limb{fill:none;stroke:var(--cyan);stroke-width:1.5;opacity:.9}
  .moon .grid{fill:none;stroke:var(--text-dim);stroke-width:.6;opacity:.45}
  .moon .far{fill:none;stroke:var(--text-faint);stroke-width:.5;opacity:.3}
  .term{position:absolute;left:15vw;top:15vh;width:min(30vh,26vw);height:min(30vh,26vw);
    border-radius:50%;pointer-events:none;
    background:linear-gradient(100deg,rgba(223,242,251,.12) 0,rgba(111,214,232,.05) 30%,
      rgba(3,6,10,.55) 55%,rgba(1,2,4,.92) 82%,rgba(0,0,0,.96) 100%)}
  .site{position:absolute;transform:translate(-50%,-50%)}
  .site .dot{width:9px;height:9px;border-radius:50%;background:var(--cyan);box-shadow:0 0 12px rgba(111,214,232,.9)}
  .site .ring{position:absolute;left:50%;top:50%;width:34px;height:34px;margin:-17px 0 0 -17px;
    border:1px solid var(--cyan);border-radius:50%;opacity:.5}
  .site .label{position:absolute;left:14px;top:-15px;white-space:nowrap;font-size:9.5px;
    letter-spacing:.16em;color:var(--ink);text-transform:uppercase}
  .site .meta{position:absolute;left:14px;top:-3px;white-space:nowrap;font-size:9px;
    letter-spacing:.1em;color:var(--cyan)}
  .readout{position:absolute;z-index:30;font-size:9.5px;letter-spacing:.14em;color:var(--text-dim);
    text-transform:uppercase;line-height:1.8}
  .readout b{color:var(--cyan);font-weight:400}
`

const MOON_SVG = `
  <svg viewBox="0 0 420 420">
    <defs><radialGradient id="moonLit" cx="32%" cy="30%" r="80%">
      <stop offset="0" stop-color="#1c2c39"/><stop offset="62%" stop-color="#0c1620"/>
      <stop offset="100%" stop-color="#050a10"/></radialGradient></defs>
    <circle class="body" cx="210" cy="210" r="200"/>
    <circle class="limb" cx="210" cy="210" r="200"/>
    <ellipse class="grid" cx="210" cy="210" rx="200" ry="72"/>
    <ellipse class="grid" cx="210" cy="210" rx="200" ry="140"/>
    <ellipse class="grid" cx="210" cy="210" rx="72" ry="200"/>
    <ellipse class="grid" cx="210" cy="210" rx="140" ry="200"/>
    <circle class="far" cx="210" cy="210" r="96"/>
  </svg>`

const SITES = [
  { x: '33%', y: '27%', id: 'LUNAR ENGINE 01', meta: 'LAT 24.4N · LON 12.8W' },
  { x: '45%', y: '21%', id: 'LUNAR ENGINE 02', meta: 'LAT 08.1S · LON 43.6E' },
  { x: '25%', y: '39%', id: 'LUNAR ENGINE 03', meta: 'LAT 41.7S · LON 05.2E' },
]

const moonContext = (armed) => `
  <div class="stage">
    <div class="moon">${MOON_SVG}</div>
    <div class="term"></div>
    ${SITES.map(
      (s) => `<div class="site" style="left:${s.x};top:${s.y}">
        <div class="ring"></div>
        <div class="dot"${armed ? ' style="background:var(--green);box-shadow:0 0 12px rgba(143,224,176,.9)"' : ''}></div>
        <div class="label">${s.id}</div>
        <div class="meta">${armed ? '已接入 · ENGINE ARMED' : s.meta}</div>
      </div>`,
    ).join('')}
  </div>`

const hudTop = (label, right) =>
  `<div id="hud-top" style="position:fixed;left:6px;right:6px;top:6px;z-index:30">
     <span class="brand">◢ 550W // ${label}</span><span class="sep">│</span>
     <span class="item">MODE <b>LUNAR LINK</b></span><span class="item">JURISDICTION <b>CN-BJ-07</b></span>
     <span class="spacer"></span><span class="item">TIME <b>22:00:03</b></span>
     <span class="sep">│</span><span class="item live">● ${right}</span></div>`

const hudBot = (stage, engine, pct) =>
  `<div id="hud-bot" style="position:fixed;left:6px;right:6px;bottom:6px;z-index:30">
     <span class="item">STAGE <b>${stage}</b></span><span class="item">ENGINE <b>${engine}</b></span>
     <span class="spacer"></span><span class="item">CONTROL</span>
     <div class="prog"><div class="fill" style="width:${pct}%"></div></div>
     <span class="pct">${pct}%</span><span class="spacer"></span>
     <span class="item">NET <b>LUNAR</b></span><span class="item">CH <b>07</b></span></div>`

const logWindow = (name, lines, kind = '', place = 'left:50%;top:50%;transform:translate(-50%,-50%) scale(.86) translateY(6%)') =>
  `<div class="win-popup ${kind} show" style="position:fixed;${place};z-index:40;min-width:min(760px,58vw)">
     <div class="wp-title"><span class="wp-ico">▣</span><span class="wp-name">${name}</span>
       <span class="wp-controls"><span class="wp-btn">─</span><span class="wp-btn">□</span><span class="wp-btn">✕</span></span></div>
     <div class="wp-body"><div class="wp-log">${lines
       .map((l) => `<div class="ll ${l[0]}">${l[1]}</div>`)
       .join('')}</div></div>
     <div class="wp-status"><span>${kind === 'danger' ? 'OVERRIDE' : 'LINK'}</span>
       <span class="spacer"></span><span class="wp-clock">22:00:03</span></div></div>`

/* ── frame 2: the moon and the three sites ─────────────────────────────────── */
const frame2 = page(
  APP_MARKUP_550C + moonContext(false) + hudTop('LUNAR ENGINE CLUSTER', 'SCANNING') + hudBot('CLUSTER SCAN', '01 / 03', 32) +
    `<div class="readout" style="left:3vw;top:60vh">
       SITES DETECTED <b>3 / 3</b><br>BEACON <b>ACTIVE</b><br>RANGE <b>384 400 KM</b><br>LIGHT LAG <b>1.28 S</b></div>
     <div class="readout" style="right:3vw;top:60vh;text-align:right">
       CLUSTER <b>LUNAR-3</b><br>BASE RING <b>NOMINAL</b><br>MASS <b>2.1E9 T</b><br>STATUS <b>AWAITING LINK</b></div>`,
  LUNAR_CSS + SHELL,
  '② 月球（背景上下文）+ 三台发动机站点',
)

/* ── frame 3: the engine, vertical and full height ─────────────────────────── */
const CUTAWAY_CSS = `
  /* Vertical subject: inlet -> chamber -> coils -> throat -> bell, steering ring
     and base ring at the bottom, and the beam leaving the frame. */
  .cut{position:fixed;right:13vw;top:0;bottom:0;width:min(40vh,30vw);z-index:22}
  .cut svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
  .cut .shell{fill:none;stroke:var(--cyan);stroke-width:1.6;opacity:.95}
  .cut .inner{fill:none;stroke:var(--text-dim);stroke-width:.8;opacity:.6}
  .cut .coil{fill:none;stroke:var(--amber);stroke-width:3.2;opacity:.9}
  .cut .flow{fill:none;stroke:var(--cyan);stroke-width:2.2;opacity:.85}
  .cut .bell{fill:rgba(6,12,18,.85);stroke:var(--cyan);stroke-width:1.6}
  .cut .chamber{fill:rgba(8,16,24,.9);stroke:var(--cyan);stroke-width:1.5}
  .cut .beam{fill:url(#beamGrad);opacity:.85}
  .cutrow{position:fixed;z-index:30;font-size:9.5px;letter-spacing:.14em;color:var(--text-dim);
    text-transform:uppercase;line-height:1.9}
  .cutrow b{color:var(--cyan);font-weight:400}
  .beamglow{position:fixed;left:0;right:0;bottom:0;height:40vh;z-index:21;pointer-events:none;
    background:radial-gradient(ellipse at 68% 100%,rgba(111,214,232,.32) 0,rgba(111,214,232,.07) 38%,transparent 70%)}
`
const ENGINE_SVG = `
  <svg viewBox="0 0 300 900" preserveAspectRatio="xMidYMid meet">
    <defs><linearGradient id="beamGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#dff2fb" stop-opacity=".06"/>
      <stop offset=".45" stop-color="#6fd6e8" stop-opacity=".95"/>
      <stop offset="1" stop-color="#dff2fb" stop-opacity=".6"/></linearGradient></defs>
    <path class="shell" d="M112 36H188L176 92H124Z"/>
    <path class="inner" d="M124 92H176L170 120H130Z"/>
    <path class="flow" d="M150 0V36"/>
    <path class="flow" d="M116 18L138 38" opacity=".7"/>
    <path class="flow" d="M184 18L162 38" opacity=".7"/>
    <rect class="chamber" x="108" y="120" width="84" height="190" rx="10"/>
    <path class="inner" d="M120 142V288M180 142V288"/>
    <path class="flow" d="M150 126V304"/>
    <ellipse class="coil" cx="150" cy="350" rx="62" ry="17"/>
    <ellipse class="coil" cx="150" cy="404" rx="58" ry="16"/>
    <ellipse class="coil" cx="150" cy="456" rx="52" ry="14"/>
    <ellipse class="coil" cx="150" cy="504" rx="46" ry="12"/>
    <path class="shell" d="M106 320V540M194 320V540" opacity=".55"/>
    <path class="flow" d="M150 316V536"/>
    <path class="shell" d="M126 540H174L166 596H134Z"/>
    <ellipse class="coil" cx="150" cy="568" rx="74" ry="20" style="stroke:var(--cyan);stroke-width:2.4;opacity:.9"/>
    <ellipse class="inner" cx="150" cy="568" rx="86" ry="24"/>
    <path class="bell" d="M134 596H166L214 800H86Z"/>
    <path class="inner" d="M142 606H158L196 790H104Z"/>
    <path class="beam" d="M96 800H204L268 900H32Z"/>
    <path class="beam" d="M118 800H182L206 900H94Z" opacity=".9"/>
    <ellipse class="shell" cx="150" cy="806" rx="118" ry="26"/>
    <ellipse class="inner" cx="150" cy="812" rx="96" ry="20"/>
  </svg>`

const frame3 = page(
  APP_MARKUP_550C + moonContext(false) +
    `<div class="beamglow"></div><div class="cut">${ENGINE_SVG}</div>` +
    hudTop('ENGINE CUTAWAY · LE-01', 'TELEMETRY') + hudBot('CUTAWAY', '01 / 03', 58) +
    logWindow('LUNAR ENGINE 01 · TELEMETRY', [
      ['ok', 'link established · 3 hops · rtt 1.28 s'],
      ['inf', 'bell Ø 42.6 m · steering ring travel ±9.4°'],
      ['inf', 'coil set A–D · field 3.2 T · charge 61 %'],
      ['hl', 'plasma path: inlet → chamber → throat → bell · stable'],
    ], '', 'left:4vw;bottom:11vh;top:auto;transform:scale(.74);transform-origin:left bottom') +
    `<div class="cutrow" style="left:3vw;top:19vh">
       THRUST <b>1.42 MN</b><br>ISP <b>12 480 S</b><br>PLASMA <b>46 200 K</b><br>FIELD <b>3.2 T</b><br>MASS FLOW <b>212 KG/S</b></div>
     <div class="cutrow" style="right:3vw;top:19vh;text-align:right">
       BELL <b>Ø 42.6 M</b><br>RING <b>±9.4°</b><br>COIL TEMP <b>18 K</b><br>CHAMBER <b>NOMINAL</b><br>INLET <b>FLOW 100 %</b></div>`,
  LUNAR_CSS + CUTAWAY_CSS + SHELL,
  '③ 发动机剖面（纵向占满高度）+ 能量流 + 贯穿出画的等离子体束',
)

/* ── frame 4: the honest countdown, frame dimmed ───────────────────────────── */
const COUNTDOWN_CSS = `
  #dim.show{opacity:.92}
  .count{position:fixed;left:50%;top:46%;transform:translate(-50%,-50%);z-index:45;width:max-content;
    text-align:center;font-size:clamp(46px,8.4vw,104px);letter-spacing:.05em;color:var(--ink);
    font-variant-numeric:tabular-nums;text-shadow:0 0 34px rgba(111,214,232,.55)}
  .count-sub{display:block;margin-top:12px;font-size:13px;letter-spacing:.42em;color:var(--cyan)}
  .girt,.girt2{position:fixed;left:50%;top:46%;transform:translate(-50%,-50%);border-radius:50%;z-index:44}
  .girt{width:min(56vh,50vw);height:min(56vh,50vw);border:2px solid rgba(111,214,232,.8);
    border-left-color:transparent;border-bottom-color:rgba(111,214,232,.28)}
  .girt2{width:min(64vh,58vw);height:min(64vh,58vw);border:1px solid rgba(159,216,232,.5);
    border-right-color:transparent;transform:translate(-50%,-50%) rotate(150deg)}
  .alarm{position:fixed;left:0;right:0;top:0;height:3px;z-index:46;
    background:repeating-linear-gradient(90deg,var(--amber) 0 12px,transparent 12px 24px)}
`
const frame4 = page(
  APP_MARKUP_550C.replace('<div id="dim">', '<div id="dim" class="show">') + moonContext(true) +
    `<div class="girt2"></div><div class="girt"></div>
     <div class="count">T-00:04.200<span class="count-sub">点火序列 · 三台发动机同步</span></div>` +
    hudTop('IGNITION SEQUENCE', 'ARMED') + hudBot('IGNITION T-4.200', '03 / 03', 92) +
    logWindow('CONTROL BUS · IGNITION', [
      ['cmd', '> ignite --cluster lunar-3 --all --synchronized'],
      ['ok', 'engine 01 armed · coil charge 100 %'],
      ['ok', 'engine 02 armed · coil charge 100 %'],
      ['warn', 'engine 03 armed · base ring strain 82 %'],
      ['hl', 'sequence holds on control bus · authority OWNED'],
    ], 'danger') +
    `<div class="cutrow" style="left:3vw;top:17vh">
       THRUST <b>1.38 MN ▲</b><br>ISP <b>12 460 S ▲</b><br>PLASMA <b>44 900 K ▲</b></div>
     <div class="cutrow" style="right:3vw;top:17vh;text-align:right">
       BUS <b>AUTHORITY</b><br>WINDOW <b>04.200 S</b><br>ABORT <b>DISABLED</b></div>
     <div class="alarm"></div>`,
  LUNAR_CSS + COUNTDOWN_CSS + SHELL +
    '#dim{position:fixed;inset:0;z-index:42;background:#02040a;opacity:0;transition:opacity .4s}',
  '④ 点火倒计时（诚实时钟 T-00:04.200）· 全场压暗',
)

/* ── frame 5: 接入成功, in 550W's own banner ────────────────────────────────── */
const FINAL_CSS = `
  #dim.show{opacity:.5}
  /* 550W's own banner. 550C's #final carries hard-coded amber inside its
     box-shadow / text-shadow, so reusing it would drag that warm halo in here;
     every colour below is a token, which keeps the four schemes meaningful. */
  .w-final{position:fixed;left:50%;top:46%;transform:translate(-50%,-50%);z-index:45;
    padding:44px 0;width:min(1150px,92vw);text-align:center;
    background:linear-gradient(180deg,rgba(6,14,20,.92),rgba(3,8,12,.96));
    border-top:1px solid var(--cyan);border-bottom:1px solid var(--cyan);
    box-shadow:0 0 80px rgba(111,214,232,.35),0 0 180px rgba(111,214,232,.16),inset 0 0 80px rgba(111,214,232,.06);
    color:var(--ink)}
  .w-final .word{font-size:clamp(48px,7.4vw,92px);letter-spacing:.5em;padding-left:.5em;
    text-shadow:0 0 18px rgba(111,214,232,.8),0 0 54px rgba(111,214,232,.4)}
  .w-final .rule{height:1px;margin:22px auto 14px;width:70%;
    background:linear-gradient(90deg,transparent,var(--cyan),transparent)}
  .w-final .sub{font-size:12px;letter-spacing:.42em;color:var(--cyan);text-transform:uppercase}
  .w-final::before,.w-final::after{content:"";position:absolute;top:-1px;bottom:-1px;width:2px;
    background:var(--cyan);box-shadow:0 0 18px 3px rgba(111,214,232,.8)}
  .w-final::before{left:0}
  .w-final::after{right:0}
  .final-rows{position:fixed;left:0;right:0;bottom:11vh;z-index:45;display:flex;justify-content:center;
    gap:44px;font-size:10px;letter-spacing:.18em;color:var(--text-dim);text-transform:uppercase}
  .final-rows b{color:var(--green);font-weight:400}
`
const bannerBlock = `
  <div class="w-final"><div class="word">接入成功</div>
    <div class="rule"></div>
    <div class="sub">550W // 月球发动机集群 · 控制权已移交</div></div>
  <div class="final-rows"><span>ENGINES <b>3 / 3</b></span><span>THRUST <b>4.26 MN</b></span>
    <span>ISP <b>12 480 S</b></span><span>AUTHORITY <b>550W</b></span></div>`

const frame5 = page(
  APP_MARKUP_550C.replace('<div id="dim">', '<div id="dim" class="show">') + moonContext(true) +
    hudTop('CONTROL BUS OWNED', 'ONLINE') + hudBot('CONTROL BUS OWNED', '03 / 03', 100) + bannerBlock,
  // The banner owns the frame at this point, so the site captions step aside —
  // the real timeline has to do the same, and the probe below is the check.
  LUNAR_CSS + FINAL_CSS + SHELL + '.site .label,.site .meta{display:none}',
  '⑤ 接入成功：550W 自己的横幅（全部走 token）',
)

/* ── the candidate sheet: the reference beside three colour splits ──────────── */
const candidate = (ring, leg, midClass) =>
  page(boot550w(W_TAIL(ring, leg), midClass, '550W SYSTEM BOOT'), `
    #logo path{clip-path:inset(0 0 0 0)!important;opacity:1!important}
    #logo.finished .white,#logo.finished .red{animation:none!important}
    html::before{z-index:2200}`)

const FRAMES = [
  { file: '550w-step1-1-boot-midwrite.png', html: frame1, note: '1 boot mid-write (550C stage)' },
  { file: '550w-step1-2-moon-cluster.png', html: frame2, note: '2 moon + three engine sites' },
  { file: '550w-step1-3-cutaway-energy.png', html: frame3, note: '3 engine cutaway + energy flow' },
  { file: '550w-step1-4-countdown-dim.png', html: frame4, note: '4 ignition countdown, dimmed' },
  { file: '550w-step1-5-owned.png', html: frame5, note: '5 接入成功 freeze' },
]

const CANDIDATES = [
  { file: 'c1.html', html: candidate('var(--red)', 'var(--red)', 'white'), tag: '① 全红 W（第三个字形改白）' },
  { file: 'c2.html', html: candidate('var(--red)', 'var(--ice)', 'white'), tag: '② 左红右白（描参考图）' },
  { file: 'c3.html', html: candidate('var(--ice)', 'var(--ice)', 'red'), tag: '③ 红 0 + 白 W' },
]

const stage = scratch('dsh550c-mock-')
mkdirSync(outDir, { recursive: true })
for (const frame of FRAMES) writeFileSync(join(stage, frame.file.replace('.png', '.html')), frame.html)
for (const sheet of CANDIDATES) writeFileSync(join(stage, sheet.file), sheet.html)

const sheetPage = (inner) => `<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>
  html,body{margin:0;background:#04070a}
  .cell{width:1860px;height:470px;position:relative;border-bottom:1px solid #16222b;overflow:hidden}
  iframe{width:1860px;height:470px;border:0;display:block}
</style></head><body>${inner}</body></html>`

const hasReference = existsSync(refImage)
if (hasReference) writeFileSync(join(stage, 'ref.webp'), readFileSync(refImage))
writeFileSync(
  join(stage, 'ref-panel.html'),
  `<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>
    html,body{margin:0;background:#04070a;overflow:hidden}
    #r{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);height:40vh}
    .tag{position:fixed;left:22px;bottom:20px;color:#8fb7c9;font:11px/1.6 monospace;letter-spacing:.14em}
  </style></head><body><div class="tag">REFERENCE · .render/ref-550w-mark.webp</div>
  <img id="r" src="./ref.webp"></body></html>`,
)
writeFileSync(
  join(stage, 'candidates.html'),
  sheetPage(
    (hasReference
      ? '<div class="cell"><iframe src="./ref-panel.html"></iframe></div>'
      : '<div class="cell"></div>') +
      CANDIDATES.map((c) => `<div class="cell"><iframe src="./${c.file}"></iframe></div>`).join(''),
  ),
)

const port = Number(process.argv[2] ?? 9550)
const server = await serve(stage)
const chrome = launchChrome({ port, profile: scratch('dsh550c-mock-profile-') })

let session
let failed = false
try {
  const target = await findPage(port)
  session = await connect(target.webSocketDebuggerUrl)
  await session.send('Page.enable')
  await session.send('Runtime.enable')
  await session.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })

  for (const frame of FRAMES) {
    await session.send('Page.navigate', { url: `${server.origin}/${frame.file.replace('.png', '.html')}` })
    await evaluate(session, 'return true;')
    await sleep(450)
    const file = join(outDir, frame.file)
    await screenshot(session, file)
    console.log(`wrote ${file}  — ${frame.note}`)
  }

  // The two checks that must not be eyeballed.
  await session.send('Page.navigate', { url: `${server.origin}/550w-step1-5-owned.html` })
  await evaluate(session, 'return true;')
  await sleep(400)
  const checks = await evaluate(session, `
    const rect = (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height } }
    const banner = rect(document.querySelector('.w-final'))
    const block = rect(document.querySelector('.w-final').parentElement === document.body
      ? document.querySelector('.w-final') : document.querySelector('.w-final'))
    const overlap = []
    for (const el of document.querySelectorAll('.site .label, .site .meta')) {
      const b = rect(el)
      if (b.x < banner.x + banner.w && banner.x < b.x + b.w && b.y < banner.y + banner.h && banner.y < b.y + b.h) {
        overlap.push(el.textContent.trim())
      }
    }
    const probe = document.createElement('div')
    probe.id = 'final'; probe.className = 'show'; probe.textContent = 'SYSTEM IS REWRITTEN'
    document.body.appendChild(probe)
    const five50 = rect(probe)
    probe.remove()
    return { banner, block, five50, overlap, viewport: window.innerWidth }`)
  const ratio = checks.banner.w / checks.five50.w
  console.log(
    `\nbanner width ${checks.banner.w.toFixed(0)} px · 550C #final at the same viewport ` +
      `${checks.five50.w.toFixed(0)} px → ratio ${ratio.toFixed(3)} (need >= 0.8)`,
  )
  console.log(`banner vs engine-site labels: ${checks.overlap.length} overlapping ${JSON.stringify(checks.overlap)}`)
  if (ratio < 0.8) {
    failed = true
    console.log('FAIL: the banner is narrower than 0.8x 550C own banner')
  }
  if (checks.overlap.length > 0) {
    failed = true
    console.log('FAIL: a site label overlaps the banner')
  }

  await session.send('Emulation.setDeviceMetricsOverride', { width: 1860, height: 1900, deviceScaleFactor: 1, mobile: false })
  await session.send('Page.navigate', { url: `${server.origin}/candidates.html` })
  await evaluate(session, 'return true;')
  await sleep(1200)
  await screenshot(session, join(outDir, '550w-step1-w-candidates.png'))
  console.log(`wrote ${join(outDir, '550w-step1-w-candidates.png')}  — W colour candidates (reference on top)`)
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

process.exit(failed ? 1 : 0)
